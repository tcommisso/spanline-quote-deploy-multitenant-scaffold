import { useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { normalizeUserRole, type UserRole } from "@shared/const";

const TRACKED_LOCATION_ROLES = new Set<UserRole>([
  "construction_user",
  "driver",
  "warehouse",
]);

const MIN_SEND_INTERVAL_MS = 60_000;
const MIN_DISTANCE_METRES = 25;
const TRACKING_STATUS_REFETCH_MS = 60_000;
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 20_000,
};

type LastSentLocation = {
  latitude: number;
  longitude: number;
  recordedAtMs: number;
};

type UserLocationTrackerProps = {
  userRole: string | null | undefined;
};

function finiteOrUndefined(value: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function distanceInMetres(a: LastSentLocation, b: LastSentLocation): number {
  const earthRadiusMetres = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(b.latitude - a.latitude);
  const lngDelta = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusMetres * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function shouldSendLocation(
  nextLocation: LastSentLocation,
  lastLocation: LastSentLocation | null,
) {
  if (!lastLocation) return true;

  const elapsedMs = nextLocation.recordedAtMs - lastLocation.recordedAtMs;
  if (elapsedMs >= MIN_SEND_INTERVAL_MS) return true;

  return distanceInMetres(lastLocation, nextLocation) >= MIN_DISTANCE_METRES;
}

export function UserLocationTracker({ userRole }: UserLocationTrackerProps) {
  const role = useMemo(() => normalizeUserRole(userRole) as UserRole, [userRole]);
  const isEligible = TRACKED_LOCATION_ROLES.has(role);
  const lastSentRef = useRef<LastSentLocation | null>(null);
  const { mutate: sendLocation } = trpc.geotracking.updateLocation.useMutation();

  const { data: trackingStatus } = trpc.geotracking.trackingStatus.useQuery(undefined, {
    enabled: isEligible,
    refetchInterval: TRACKING_STATUS_REFETCH_MS,
    retry: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!isEligible || !trackingStatus?.isActive) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) return;

        const nextLocation: LastSentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          recordedAtMs: Date.now(),
        };

        if (
          !Number.isFinite(nextLocation.latitude) ||
          !Number.isFinite(nextLocation.longitude) ||
          !shouldSendLocation(nextLocation, lastSentRef.current)
        ) {
          return;
        }

        lastSentRef.current = nextLocation;
        sendLocation({
          latitude: nextLocation.latitude,
          longitude: nextLocation.longitude,
          heading: finiteOrUndefined(position.coords.heading),
          speed: finiteOrUndefined(position.coords.speed),
          accuracy: finiteOrUndefined(position.coords.accuracy),
        });
      },
      (error) => {
        if (import.meta.env.DEV) {
          console.warn("[LiveTracking] Browser location unavailable", error);
        }
      },
      GEOLOCATION_OPTIONS,
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isEligible, sendLocation, trackingStatus?.isActive]);

  return null;
}
