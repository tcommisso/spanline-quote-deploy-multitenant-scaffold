import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Truck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

type DeliveryStatus = "scheduled" | "in_transit" | "delivered" | "failed" | "cancelled" | "pending";

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  in_transit: "border-amber-200 bg-amber-50 text-amber-800",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  pending: "border-slate-200 bg-slate-50 text-slate-600",
};

function formatStatus(status?: string | null) {
  return String(status || "scheduled").replace(/_/g, " ");
}

function formatDeliveryDate(value?: string | Date | null) {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date not set";
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function DriverAccessState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 px-4 py-10">
      <div className="mx-auto flex max-w-sm flex-col items-center rounded-xl border bg-white p-6 text-center shadow-sm">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export default function DriverMobileView() {
  const pathParts = window.location.pathname.split("/");
  const token = pathParts[pathParts.length - 1] || "";
  const utils = trpc.useUtils();

  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [lastCheckIns, setLastCheckIns] = useState<Record<number, string>>({});

  const scheduleQuery = trpc.manufacturingDispatch.driverMobile.schedule.useQuery(
    { token },
    { enabled: !!token, retry: false, refetchOnWindowFocus: false },
  );

  const checkIn = trpc.manufacturingDispatch.driverMobile.checkIn.useMutation({
    onSuccess: (result, variables) => {
      setLastCheckIns((current) => ({ ...current, [variables.dispatchId]: result.recordedAt }));
      toast.success(result.status === "in_transit" ? "GPS check-in saved. Delivery is in transit." : "GPS check-in saved.");
      utils.manufacturingDispatch.driverMobile.schedule.invalidate({ token });
    },
    onError: (error) => toast.error(error.message || "Could not save GPS check-in"),
    onSettled: () => setCheckingInId(null),
  });

  const confirmDelivery = trpc.manufacturingDispatch.driverMobile.confirmDelivery.useMutation({
    onSuccess: () => {
      toast.success("Delivery confirmed");
      setConfirmingId(null);
      setDeliveryNotes("");
      utils.manufacturingDispatch.driverMobile.schedule.invalidate({ token });
    },
    onError: (error) => toast.error(error.message || "Could not confirm delivery"),
  });

  const dispatches = scheduleQuery.data?.dispatches || [];
  const driver = scheduleQuery.data?.driver;
  const sortedDispatches = useMemo(
    () => [...dispatches].sort((a: any, b: any) => {
      const aDate = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDate !== bDate) return aDate - bDate;
      return String(a.dispatchNumber || a.id).localeCompare(String(b.dispatchNumber || b.id));
    }),
    [dispatches],
  );

  const inTransitCount = dispatches.filter((dispatch: any) => dispatch.status === "in_transit").length;
  const scheduledCount = dispatches.filter((dispatch: any) => dispatch.status === "scheduled").length;

  function gpsCheckIn(dispatchId: number) {
    if (!navigator.geolocation) {
      toast.error("GPS is not available on this device");
      return;
    }

    setCheckingInId(dispatchId);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        checkIn.mutate({
          token,
          dispatchId,
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
          heading: typeof heading === "number" && Number.isFinite(heading) ? heading : undefined,
          speed: typeof speed === "number" && Number.isFinite(speed) ? speed : undefined,
        });
      },
      (error) => {
        setCheckingInId(null);
        toast.error(error.message || "Could not access GPS location");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function openMaps(address: string) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, "_blank");
  }

  if (!token) {
    return <DriverAccessState title="Invalid Link" message="No driver access token was found in the URL." />;
  }

  if (scheduleQuery.isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
          Loading assigned deliveries...
        </div>
      </div>
    );
  }

  if (scheduleQuery.error) {
    return <DriverAccessState title="Access Denied" message={scheduleQuery.error.message} />;
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b bg-slate-950 text-white shadow-sm">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 shrink-0 text-amber-300" />
              <h1 className="truncate text-base font-semibold">{driver?.name || "Driver"}</h1>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-300">
              {[driver?.vehicle, driver?.licencePlate].filter(Boolean).join(" - ") || "Assigned deliveries"}
            </p>
          </div>
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 shrink-0 bg-white/10 text-white hover:bg-white/20"
            onClick={() => scheduleQuery.refetch()}
            aria-label="Refresh deliveries"
          >
            <RefreshCw className={`h-4 w-4 ${scheduleQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-4 sm:px-5">
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned</p>
            <p className="mt-1 text-2xl font-bold">{dispatches.length}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ready</p>
            <p className="mt-1 text-2xl font-bold">{scheduledCount}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">On road</p>
            <p className="mt-1 text-2xl font-bold">{inTransitCount}</p>
          </div>
        </section>

        {sortedDispatches.length === 0 ? (
          <section className="rounded-xl border bg-white px-6 py-12 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-500" />
            <h2 className="text-xl font-bold">No assigned deliveries</h2>
            <p className="mt-2 text-sm text-muted-foreground">You have no scheduled or in-transit deliveries right now.</p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assigned Deliveries</h2>
              <span className="text-xs text-muted-foreground">Earliest first</span>
            </div>

            {sortedDispatches.map((delivery: any, index: number) => {
              const address = delivery.deliveryAddress || delivery.siteAddress || "";
              const status = String(delivery.status || "scheduled") as DeliveryStatus;
              const canConfirm = status === "in_transit";
              const lastCheckIn = lastCheckIns[delivery.id] || delivery.dispatchedAt;
              const phone = delivery.deliveryPhone?.trim();

              return (
                <article key={delivery.id} className="rounded-xl border bg-white shadow-sm">
                  <div className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{delivery.clientName || "Delivery"}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {delivery.dispatchNumber || `Dispatch #${delivery.id}`}
                              {delivery.orderNumber ? ` - ${delivery.orderNumber}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 capitalize ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
                        {formatStatus(status)}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span>{formatDeliveryDate(delivery.scheduledDate)}</span>
                        {delivery.scheduledTimeSlot && (
                          <>
                            <Clock className="ml-1 h-4 w-4 shrink-0" />
                            <span>{delivery.scheduledTimeSlot}</span>
                          </>
                        )}
                      </div>

                      {address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                          <span className="leading-snug">{address}</span>
                        </div>
                      )}

                      {(delivery.deliveryContact || phone) && (
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="truncate">{[delivery.deliveryContact, phone].filter(Boolean).join(" - ")}</span>
                        </div>
                      )}

                      {lastCheckIn && (
                        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                          <LocateFixed className="h-4 w-4 shrink-0" />
                          GPS check-in saved{formatTime(lastCheckIn) ? ` at ${formatTime(lastCheckIn)}` : ""}
                        </div>
                      )}

                      {delivery.deliveryNotes && (
                        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                          {delivery.deliveryNotes}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {address && (
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => openMaps(address)}
                        >
                          <Navigation className="mr-2 h-4 w-4" />
                          Maps
                        </Button>
                      )}
                      {phone && (
                        <Button
                          variant="outline"
                          className="h-11"
                          asChild
                        >
                          <a href={`tel:${phone}`}>
                            <Phone className="mr-2 h-4 w-4" />
                            Call
                          </a>
                        </Button>
                      )}
                    </div>

                    <Button
                      className="h-12 w-full bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => gpsCheckIn(delivery.id)}
                      disabled={checkingInId === delivery.id || checkIn.isPending}
                    >
                      {checkingInId === delivery.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LocateFixed className="mr-2 h-4 w-4" />
                      )}
                      GPS Check-in
                    </Button>

                    {!canConfirm && (
                      <p className="text-center text-xs text-muted-foreground">
                        GPS check-in starts the delivery and enables confirmation.
                      </p>
                    )}

                    {canConfirm && confirmingId !== delivery.id && (
                      <Button
                        className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => {
                          if (navigator.vibrate) navigator.vibrate(10);
                          setConfirmingId(delivery.id);
                        }}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Confirm Delivered
                      </Button>
                    )}

                    {confirmingId === delivery.id && (
                      <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
                        <Textarea
                          value={deliveryNotes}
                          onChange={(event) => setDeliveryNotes(event.target.value)}
                          rows={3}
                          placeholder="Delivery notes, receiver name, site access notes..."
                          className="bg-white text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="h-11"
                            onClick={() => {
                              setConfirmingId(null);
                              setDeliveryNotes("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => {
                              if (navigator.vibrate) navigator.vibrate(10);
                              confirmDelivery.mutate({
                                token,
                                dispatchId: delivery.id,
                                notes: deliveryNotes.trim() || undefined,
                              });
                            }}
                            disabled={confirmDelivery.isPending}
                          >
                            {confirmDelivery.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Confirm
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
