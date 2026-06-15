import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Truck, MapPin, Phone, Clock, CheckCircle2, Navigation, AlertCircle, Route } from "lucide-react";
import { toast } from "sonner";

export default function DriverMobileView() {
  // Extract token from URL
  const pathParts = window.location.pathname.split("/");
  const token = pathParts[pathParts.length - 1] || "";

  const { data, isLoading, error, refetch } = trpc.manufacturingDispatch.driverMobile.schedule.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const markInTransit = trpc.manufacturingDispatch.driverMobile.markInTransit.useMutation({
    onSuccess: () => { toast.success("Marked as in transit"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const confirmDelivery = trpc.manufacturingDispatch.driverMobile.confirmDelivery.useMutation({
    onSuccess: () => { toast.success("Delivery confirmed!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-muted-foreground mt-2">No access token found in the URL.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <Truck className="h-12 w-12 mx-auto text-muted-foreground animate-pulse mb-4" />
          <p className="text-muted-foreground">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
          <h1 className="text-xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  const { driver, dispatches } = data!;
  const [optimising, setOptimising] = useState(false);
  const [optimisedOrder, setOptimisedOrder] = useState<number[] | null>(null);

  const optimiseRoute = trpc.stocktake.optimiseRoute.useMutation({
    onSuccess: (result) => {
      if (result.error) {
        toast.error(`Route optimisation failed: ${result.error}`);
      } else {
        const order = result.optimisedOrder.map((o: any) => o.id);
        setOptimisedOrder(order);
        toast.success(`Route optimised! ${result.totalDistanceText} total`);
      }
      setOptimising(false);
    },
    onError: (e) => { toast.error(e.message); setOptimising(false); },
  });

  const handleOptimise = () => {
    const addressedDispatches = dispatches.filter((d: any) => d.deliveryAddress);
    if (addressedDispatches.length < 2) {
      toast.error("Need at least 2 deliveries with addresses to optimise");
      return;
    }
    setOptimising(true);
    optimiseRoute.mutate({
      addresses: addressedDispatches.map((d: any) => ({ id: d.id, address: d.deliveryAddress })),
    });
  };

  // Sort dispatches by optimised order if available
  const sortedDispatches = optimisedOrder
    ? [...dispatches].sort((a: any, b: any) => {
        const aIdx = optimisedOrder.indexOf(a.id);
        const bIdx = optimisedOrder.indexOf(b.id);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
    : dispatches;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="h-6 w-6" />
            <div>
              <h1 className="font-bold text-lg">{driver.name}</h1>
              <p className="text-blue-100 text-sm">{driver.vehicle} {driver.licencePlate ? `• ${driver.licencePlate}` : ""}</p>
            </div>
          </div>
          {dispatches.length >= 2 && (
            <Button
              size="sm"
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={handleOptimise}
              disabled={optimising}
            >
              <Route className="h-4 w-4 mr-1" />
              {optimising ? "..." : "Optimise"}
            </Button>
          )}
        </div>
        {optimisedOrder && (
          <div className="mt-2 text-xs bg-white/10 rounded px-2 py-1">
            Route optimised by distance. Tap "Optimise" again to refresh.
          </div>
        )}
      </div>

      {/* Delivery List */}
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {dispatches.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-400 mb-4" />
            <h2 className="text-xl font-bold">All Clear!</h2>
            <p className="text-muted-foreground mt-2">No pending deliveries. Check back later.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground font-medium">{dispatches.length} pending deliver{dispatches.length === 1 ? "y" : "ies"}</p>
            {sortedDispatches.map((d: any, idx: number) => (
              <div key={d.id} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
                {/* Dispatch header */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{d.dispatchNumber || `#${d.id}`}</span>
                  <Badge variant={d.status === "in_transit" ? "default" : "secondary"} className="text-xs">
                    {d.status === "in_transit" ? "In Transit" : "Scheduled"}
                  </Badge>
                </div>

                {/* Time */}
                {d.scheduledDate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(d.scheduledDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                    {d.scheduledTimeSlot && <span className="font-medium">• {d.scheduledTimeSlot}</span>}
                  </div>
                )}

                {/* Address */}
                {d.deliveryAddress && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
                    <span>{d.deliveryAddress}</span>
                  </div>
                )}

                {/* Contact */}
                {d.deliveryContact && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-blue-500" />
                    <span>{d.deliveryContact}</span>
                    {d.deliveryPhone && (
                      <a href={`tel:${d.deliveryPhone}`} className="text-blue-600 font-medium ml-1">
                        {d.deliveryPhone}
                      </a>
                    )}
                  </div>
                )}

                {/* Notes */}
                {d.deliveryNotes && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{d.deliveryNotes}</p>
                )}

                {/* Actions */}
                <div className="pt-2 space-y-2">
                  {d.status === "scheduled" && (
                    <div className="flex gap-2">
                      {d.deliveryAddress && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.deliveryAddress)}`, "_blank")}
                        >
                          <Navigation className="h-4 w-4 mr-1" /> Navigate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          if (navigator.vibrate) navigator.vibrate(10);
                          markInTransit.mutate({ token, dispatchId: d.id });
                        }}
                        disabled={markInTransit.isPending}
                      >
                        <Truck className="h-4 w-4 mr-1" /> Start Delivery
                      </Button>
                    </div>
                  )}

                  {d.status === "in_transit" && confirmingId !== d.id && (
                    <Button
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(10);
                        setConfirmingId(d.id);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm Delivery
                    </Button>
                  )}

                  {confirmingId === d.id && (
                    <div className="space-y-2 border-t pt-2">
                      <Textarea
                        placeholder="Delivery notes (optional)"
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => { setConfirmingId(null); setDeliveryNotes(""); }}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            if (navigator.vibrate) navigator.vibrate(10);
                            confirmDelivery.mutate({ token, dispatchId: d.id, notes: deliveryNotes || undefined });
                            setConfirmingId(null);
                            setDeliveryNotes("");
                          }}
                          disabled={confirmDelivery.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
