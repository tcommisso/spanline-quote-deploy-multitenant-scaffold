import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, AlertTriangle, RefreshCw, Navigation, User } from "lucide-react";

// Sydney default center
const SYDNEY_CENTER = { lat: -33.8688, lng: 151.2093 };
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

export default function LiveTracking() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: statusData } = trpc.geotracking.trackingStatus.useQuery(undefined, {
    refetchInterval: 60000,
  });

  const { data: positionsData, refetch: refetchPositions } = trpc.geotracking.latestPositions.useQuery(undefined, {
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const { data: historyData } = trpc.geotracking.locationHistory.useQuery(
    { userId: selectedUserId!, date: historyDate },
    { enabled: !!selectedUserId }
  );

  // Update markers when positions change
  useEffect(() => {
    if (!mapRef.current || !positionsData?.positions) return;

    // Clear existing markers
    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    positionsData.positions.forEach((p) => {
      if (!p.location) return;
      const position = { lat: p.location.latitude, lng: p.location.longitude };
      bounds.extend(position);
      hasPoints = true;

      // Create marker with custom content
      const markerContent = document.createElement("div");
      markerContent.className = "flex flex-col items-center";
      markerContent.innerHTML = `
        <div class="bg-blue-600 text-white text-xs px-2 py-1 rounded-full shadow-lg whitespace-nowrap font-medium">
          ${p.user.name || "Unknown"}
        </div>
        <div class="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow mt-1"></div>
      `;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position,
        content: markerContent,
        title: p.user.name || "Unknown",
      });

      marker.addListener("click", () => {
        setSelectedUserId(p.user.id);
      });

      markersRef.current.push(marker);
    });

    if (hasPoints && !selectedUserId) {
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [positionsData, selectedUserId]);

  // Draw route history polyline
  useEffect(() => {
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (!mapRef.current || !historyData?.points || historyData.points.length === 0) return;

    const path = historyData.points.map(p => ({
      lat: p.latitude,
      lng: p.longitude,
    }));

    polylineRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.8,
      strokeWeight: 3,
      map: mapRef.current,
    });

    // Fit bounds to route
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    mapRef.current.fitBounds(bounds, 50);
  }, [historyData]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const isActive = statusData?.isActive ?? false;
  const selectedUser = positionsData?.positions?.find(p => p.user.id === selectedUserId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Tracking</h1>
          <p className="text-muted-foreground text-sm">
            Trades & Construction user locations (7am–5pm AEST)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {statusData && (
            <Badge variant={isActive ? "default" : "secondary"} className="gap-1">
              <Clock className="h-3 w-3" />
              {isActive ? `Active (${statusData.currentAestTime} AEST)` : `Inactive (${statusData.currentAestTime} AEST)`}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetchPositions()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Inactive warning */}
      {!isActive && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">
            Tracking is inactive outside 7:00am–5:00pm AEST. Showing last known positions.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sidebar: user list */}
        <div className="lg:col-span-1 space-y-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Tracked Users ({positionsData?.positions?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[400px] overflow-y-auto">
              {positionsData?.positions?.map((p) => (
                <button
                  key={p.user.id}
                  onClick={() => setSelectedUserId(p.user.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedUserId === p.user.id
                      ? "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{p.user.name || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {p.location ? (
                      <>
                        {p.location.latitude.toFixed(4)}, {p.location.longitude.toFixed(4)}
                      </>
                    ) : "No location"}
                  </div>
                  {p.location?.speed != null && p.location.speed > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Navigation className="h-3 w-3" />
                      {(p.location.speed * 3.6).toFixed(0)} km/h
                    </div>
                  )}
                  {p.location?.recordedAt && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Last: {new Date(p.location.recordedAt).toLocaleTimeString()}
                    </div>
                  )}
                </button>
              ))}
              {(!positionsData?.positions || positionsData.positions.length === 0) && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No tracked users with location data
                </p>
              )}
            </CardContent>
          </Card>

          {/* History controls */}
          {selectedUserId && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Route History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {selectedUser?.user.name || "Selected user"}
                </div>
                <Input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  className="text-sm"
                />
                {historyData && (
                  <p className="text-xs text-muted-foreground">
                    {historyData.points.length} location points
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedUserId(null);
                    if (polylineRef.current) {
                      polylineRef.current.setMap(null);
                      polylineRef.current = null;
                    }
                  }}
                >
                  Clear Selection
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <MapView
              className="h-[600px] w-full"
              initialCenter={SYDNEY_CENTER}
              initialZoom={10}
              onMapReady={handleMapReady}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
