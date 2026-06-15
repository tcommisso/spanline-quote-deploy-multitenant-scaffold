import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertCircle, Play, Pause, XCircle } from "lucide-react";
import { useParams } from "wouter";

const STATUS_OPTIONS = [
  { value: "in_progress", label: "Start Work", icon: Play, color: "bg-blue-500" },
  { value: "completed", label: "Mark Complete", icon: CheckCircle2, color: "bg-green-500" },
  { value: "on_hold", label: "Put On Hold", icon: Pause, color: "bg-amber-500" },
  { value: "cancelled", label: "Cancel", icon: XCircle, color: "bg-red-500" },
] as const;

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  pending: { variant: "outline", label: "Pending" },
  scheduled: { variant: "secondary", label: "Scheduled" },
  in_progress: { variant: "default", label: "In Progress" },
  completed: { variant: "default", label: "Completed" },
  on_hold: { variant: "secondary", label: "On Hold" },
  cancelled: { variant: "destructive", label: "Cancelled" },
};

export default function ManufacturingScanPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [updated, setUpdated] = useState(false);

  const { data: task, isLoading, error } = trpc.manufacturingDispatch.qr.scan.useQuery(
    { token },
    { enabled: !!token }
  );

  const updateStatus = trpc.manufacturingDispatch.qr.updateStatus.useMutation({
    onSuccess: () => {
      setUpdated(true);
      // Haptic feedback on mobile
      if (navigator.vibrate) navigator.vibrate(100);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-bold">Invalid QR Code</h1>
          <p className="text-muted-foreground">This QR code is not recognised. Please try scanning again.</p>
        </div>
      </div>
    );
  }

  if (updated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
          <h1 className="text-xl font-bold">Status Updated</h1>
          <p className="text-muted-foreground">Task has been updated successfully.</p>
          <Button variant="outline" onClick={() => setUpdated(false)}>Update Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Task Info Card */}
        <div className="border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">{task.productName}</h1>
            <Badge variant={STATUS_BADGE[task.status]?.variant || "outline"}>
              {STATUS_BADGE[task.status]?.label || task.status}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            {task.orderNumber && <p>Order: <span className="font-medium text-foreground">{task.orderNumber}</span></p>}
            {task.clientName && <p>Client: {task.clientName}</p>}
            {task.category && <p>Category: {task.category}</p>}
            {task.colour && <p>Colour: {task.colour}</p>}
            <p>Quantity: {task.quantity} {task.unit}</p>
            {task.branchName && <p>Branch: {task.branchName}</p>}
            {task.description && <p className="pt-1 border-t mt-2">{task.description}</p>}
          </div>
        </div>

        {/* Status Update Buttons */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Update Status</h2>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isCurrentStatus = task.status === opt.value;
              return (
                <Button
                  key={opt.value}
                  variant={isCurrentStatus ? "default" : "outline"}
                  className="h-14 flex-col gap-1"
                  disabled={isCurrentStatus || updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ token, status: opt.value })}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{opt.label}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {updateStatus.isPending && (
          <div className="text-center py-2">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground mt-1">Updating...</p>
          </div>
        )}
      </div>
    </div>
  );
}
