import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Plus, CheckCircle2, Clock, AlertTriangle, XCircle, MapPin, Star } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Pending" },
  scheduled: { variant: "secondary", label: "Scheduled" },
  in_transit: { variant: "default", label: "In Transit" },
  delivered: { variant: "default", label: "Delivered" },
  failed: { variant: "destructive", label: "Failed" },
  cancelled: { variant: "outline", label: "Cancelled" },
};

export default function ManufacturingDispatch() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ supplierId: number; supplierName: string } | null>(null);
  const utils = trpc.useUtils();

  const { data: dispatches, isLoading } = trpc.manufacturingDispatch.dispatches.list.useQuery(
    { status: statusFilter !== "all" ? statusFilter : undefined }
  );
  const { data: drivers } = trpc.manufacturingDispatch.drivers.list.useQuery({});
  const { data: readyOrders } = trpc.manufacturing.orders.list.useQuery({ status: "completed" });

  const updateStatus = trpc.manufacturingDispatch.dispatches.updateStatus.useMutation({
    onSuccess: () => { utils.manufacturingDispatch.dispatches.list.invalidate(); toast.success("Status updated"); },
  });
  const assignDriver = trpc.manufacturingDispatch.dispatches.assignDriver.useMutation({
    onSuccess: () => { utils.manufacturingDispatch.dispatches.list.invalidate(); toast.success("Driver assigned"); },
  });
  const confirmDelivery = trpc.manufacturingDispatch.dispatches.confirmDeliveryWithFeedback.useMutation({
    onSuccess: (data) => {
      utils.manufacturingDispatch.dispatches.list.invalidate();
      toast.success("Delivery confirmed");
      if (data.supplierId && data.supplierName) {
        setFeedbackPrompt({ supplierId: data.supplierId, supplierName: data.supplierName });
      }
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" /> Dispatch & Delivery
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Schedule deliveries and track dispatch status</p>
        </div>
        <Button variant="brand" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Dispatch
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dispatch List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading dispatches...</div>
      ) : !dispatches?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No dispatches found</p>
          <p className="text-sm">Create a new dispatch for completed manufacturing orders</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dispatches.map(d => (
            <div key={d.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{d.dispatchNumber}</span>
                    <Badge variant={STATUS_BADGE[d.status]?.variant || "outline"}>
                      {STATUS_BADGE[d.status]?.label || d.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Order: {d.orderNumber} — {d.clientName}
                  </p>
                  {d.deliveryAddress && (
                    <p className="text-sm flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {d.deliveryAddress}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {d.scheduledDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(d.scheduledDate).toLocaleDateString("en-AU")}
                        {d.scheduledTimeSlot && ` (${d.scheduledTimeSlot})`}
                      </span>
                    )}
                    {d.driverName && <span>Driver: {d.driverName}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {d.status === "pending" && drivers && drivers.length > 0 && (
                    <Select onValueChange={(val) => {
                      const driver = drivers.find(dr => dr.id === Number(val));
                      if (driver) assignDriver.mutate({ id: d.id, driverId: driver.id, driverName: driver.name });
                    }}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="Assign driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map(dr => (
                          <SelectItem key={dr.id} value={String(dr.id)}>{dr.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {d.status === "scheduled" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: d.id, status: "in_transit" })}>
                      <Truck className="h-3 w-3 mr-1" /> Dispatch
                    </Button>
                  )}
                  {d.status === "in_transit" && (
                    <Button size="sm" onClick={() => confirmDelivery.mutate({ id: d.id })}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm Delivery
                    </Button>
                  )}
                  {d.status === "in_transit" && (
                    <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ id: d.id, status: "failed", failureReason: "Delivery failed" })}>
                      <XCircle className="h-3 w-3 mr-1" /> Failed
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dispatch Dialog */}
      <CreateDispatchDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        orders={readyOrders || []}
        drivers={drivers || []}
      />

      {/* Supplier Feedback Prompt */}
      {feedbackPrompt && (
        <DeliveryFeedbackPrompt
          supplierId={feedbackPrompt.supplierId}
          supplierName={feedbackPrompt.supplierName}
          onClose={() => setFeedbackPrompt(null)}
        />
      )}
    </div>
  );
}

function CreateDispatchDialog({
  open, onOpenChange, orders, drivers
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orders: any[];
  drivers: any[];
}) {
  const [orderId, setOrderId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const createDispatch = trpc.manufacturingDispatch.dispatches.create.useMutation({
    onSuccess: () => {
      utils.manufacturingDispatch.dispatches.list.invalidate();
      onOpenChange(false);
      toast.success("Dispatch created");
      setOrderId(""); setDriverId(""); setScheduledDate(""); setTimeSlot("");
      setAddress(""); setContact(""); setPhone(""); setNotes("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create dispatch"),
  });

  const handleSubmit = () => {
    if (!orderId || !scheduledDate) return;
    const driver = drivers.find(d => d.id === Number(driverId));
    createDispatch.mutate({
      orderId: Number(orderId),
      driverId: driverId ? Number(driverId) : undefined,
      driverName: driver?.name,
      scheduledDate,
      scheduledTimeSlot: timeSlot || undefined,
      deliveryAddress: address || undefined,
      deliveryContact: contact || undefined,
      deliveryPhone: phone || undefined,
      deliveryNotes: notes || undefined,
    });
  };

  // Auto-fill address from selected order
  const selectedOrder = orders.find(o => o.id === Number(orderId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Dispatch</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Order</Label>
            <Select value={orderId} onValueChange={(val) => {
              setOrderId(val);
              const order = orders.find(o => o.id === Number(val));
              if (order?.siteAddress) setAddress(order.siteAddress);
            }}>
              <SelectTrigger><SelectValue placeholder="Select completed order" /></SelectTrigger>
              <SelectContent>
                {orders.map(o => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.orderNumber} - {o.clientName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Delivery Date</Label>
              <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
            </div>
            <div>
              <Label>Time Slot</Label>
              <Select value={timeSlot} onValueChange={setTimeSlot}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning (7-12)</SelectItem>
                  <SelectItem value="afternoon">Afternoon (12-5)</SelectItem>
                  <SelectItem value="all_day">All Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue placeholder="Assign later" /></SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name} {d.vehicle ? `(${d.vehicle})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Delivery Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Site address" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Contact Name</Label>
              <Input value={contact} onChange={e => setContact(e.target.value)} />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Delivery instructions..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createDispatch.isPending || !orderId || !scheduledDate}>
            {createDispatch.isPending ? "Creating..." : "Create Dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryFeedbackPrompt({ supplierId, supplierName, onClose }: { supplierId: number; supplierName: string; onClose: () => void }) {
  const [timeliness, setTimeliness] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [pricing, setPricing] = useState(0);
  const [notes, setNotes] = useState("");

  const submitFeedback = trpc.supplierFeedback.create.useMutation({
    onSuccess: () => {
      toast.success("Supplier feedback submitted — thank you!");
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Failed to submit feedback"),
  });

  const overallRating = timeliness && quality && communication && pricing
    ? Math.round(((timeliness + quality + communication + pricing) / 4) * 10) / 10
    : 0;

  function handleSubmit() {
    if (!timeliness || !quality || !communication || !pricing) {
      toast.error("Please rate all categories");
      return;
    }
    submitFeedback.mutate({
      supplierId,
      timeliness,
      quality,
      communication,
      pricing,
      notes: notes || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" /> Rate Supplier
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          How was your experience with <strong>{supplierName}</strong> on this delivery?
        </p>
        <div className="space-y-3 mt-2">
          <RatingRow label="Timeliness" value={timeliness} onChange={setTimeliness} />
          <RatingRow label="Quality" value={quality} onChange={setQuality} />
          <RatingRow label="Communication" value={communication} onChange={setCommunication} />
          <RatingRow label="Pricing" value={pricing} onChange={setPricing} />
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional comments..." />
          </div>
          {overallRating > 0 && (
            <p className="text-sm text-center font-medium">Overall: {overallRating.toFixed(1)} / 5</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Skip</Button>
          <Button onClick={handleSubmit} disabled={submitFeedback.isPending}>
            {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-0.5 hover:scale-110 transition-transform"
          >
            <Star className={`h-5 w-5 ${star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
