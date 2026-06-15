import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Wrench, Plus, Loader2, Trash2, DollarSign, Calendar, CheckCircle2, Clock, AlertTriangle, Play, Ban, FileDown } from "lucide-react";
import { toast } from "sonner";

interface WorkOrdersSectionProps {
  jobId: number;
  assignments: Array<{
    id: number;
    installerId: number;
    installer: {
      id: number;
      name: string;
      tradeType: string;
    } | null;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300", icon: Clock },
  issued: { label: "Issued", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Play },
  accepted: { label: "Accepted", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300", icon: CheckCircle2 },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Wrench },
  completed: { label: "Completed", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: Ban },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  normal: { label: "Normal", color: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" },
  high: { label: "High", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export default function WorkOrdersSection({ jobId, assignments }: WorkOrdersSectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [tradeType, setTradeType] = useState("");
  const [scope, setScope] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  const workOrdersQuery = trpc.construction.jobWorkOrders.list.useQuery({ jobId });
  const utils = trpc.useUtils();

  const createMutation = trpc.construction.jobWorkOrders.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Work order ${data.orderNumber} created`);
      utils.construction.jobWorkOrders.list.invalidate({ jobId });
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.construction.jobWorkOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Work order updated");
      utils.construction.jobWorkOrders.list.invalidate({ jobId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.construction.jobWorkOrders.delete.useMutation({
    onSuccess: () => {
      toast.success("Work order deleted");
      utils.construction.jobWorkOrders.list.invalidate({ jobId });
    },
    onError: (e) => toast.error(e.message),
  });
  const downloadPdfMutation = trpc.construction.jobWorkOrders.downloadPdf.useMutation({
    onSuccess: (data) => {
      const byteChars = atob(data.pdfBase64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Work order PDF downloaded");
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setShowCreate(false);
    setTradeType("");
    setScope("");
    setAssignedTo("");
    setScheduledDate("");
    setEstimatedCost("");
    setPriority("normal");
    setNotes("");
  }

  function handleCreate() {
    createMutation.mutate({
      jobId,
      tradeType: tradeType || undefined,
      scope: scope || undefined,
      assignedTo: assignedTo || undefined,
      scheduledDate: scheduledDate || undefined,
      estimatedCost: estimatedCost || undefined,
      priority: priority as any,
      notes: notes || undefined,
    });
  }

  const workOrders = workOrdersQuery.data || [];
  const totalEstimated = workOrders.reduce((sum, wo) => sum + parseFloat(wo.estimatedCost || "0"), 0);
  const totalActual = workOrders.reduce((sum, wo) => sum + parseFloat(wo.actualCost || "0"), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold">{workOrders.length}</div>
          <div className="text-xs text-muted-foreground">Work Orders</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold">{workOrders.filter(wo => wo.status === "in_progress").length}</div>
          <div className="text-xs text-muted-foreground">In Progress</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-blue-600">${totalEstimated.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div>
          <div className="text-xs text-muted-foreground">Estimated</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">${totalActual.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div>
          <div className="text-xs text-muted-foreground">Actual</div>
        </Card>
      </div>

      {/* Create Button */}
      <Button onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4 mr-1.5" /> New Work Order
      </Button>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); else setShowCreate(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" /> New Work Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trade Type</Label>
                <Select value={tradeType} onValueChange={setTradeType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trade type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Roofing">Roofing</SelectItem>
                    <SelectItem value="Electrical">Electrical</SelectItem>
                    <SelectItem value="Plumbing">Plumbing</SelectItem>
                    <SelectItem value="Carpentry">Carpentry</SelectItem>
                    <SelectItem value="Painting">Painting</SelectItem>
                    <SelectItem value="Plastering">Plastering</SelectItem>
                    <SelectItem value="Demolition">Demolition</SelectItem>
                    <SelectItem value="Concrete">Concrete</SelectItem>
                    <SelectItem value="Landscaping">Landscaping</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trade (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  {assignments.filter(a => a.installer).map(a => (
                    <SelectItem key={a.installerId} value={a.installer!.name}>
                      {a.installer!.name} — {a.installer!.tradeType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scope of Works</Label>
              <Textarea value={scope} onChange={e => setScope(e.target.value)} placeholder="Describe the scope of works..." rows={4} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Estimated Cost ($)</Label>
                <Input type="number" value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} placeholder="0.00" step="0.01" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Work Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Orders List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Work Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {workOrdersQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!workOrdersQuery.isLoading && workOrders.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No work orders yet.</p>
          )}
          <div className="space-y-3">
            {workOrders.map(wo => {
              const sc = STATUS_CONFIG[wo.status] || STATUS_CONFIG.draft;
              const pc = PRIORITY_CONFIG[wo.priority] || PRIORITY_CONFIG.normal;
              const Icon = sc.icon;
              const milestones = (wo as any).milestones || [];
              return (
                <div key={wo.id} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-mono text-sm font-medium">{wo.orderNumber}</span>
                    <Badge className={sc.color}>
                      <Icon className="h-3 w-3 mr-0.5" /> {sc.label}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{wo.tradeType}</Badge>
                    {wo.priority !== "normal" && (
                      <Badge className={pc.color + " text-xs"}>{pc.label}</Badge>
                    )}
                  </div>
                  {wo.assignedTo && (
                    <p className="text-sm mb-1"><span className="text-muted-foreground">Assigned:</span> {wo.assignedTo}</p>
                  )}
                  {wo.scope && (
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{wo.scope}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                    {wo.scheduledDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(wo.scheduledDate).toLocaleDateString("en-AU")}
                      </span>
                    )}
                    {wo.estimatedCost && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Est: ${parseFloat(wo.estimatedCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {wo.actualCost && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Actual: ${parseFloat(wo.actualCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {wo.createdByName && <span>Created by {wo.createdByName}</span>}
                  </div>
                  {/* Milestones */}
                  {milestones.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-medium mb-1">Milestones ({milestones.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {milestones.map((m: any) => (
                          <Badge key={m.id} variant="outline" className="text-xs">
                            {m.description || `#${m.id}`}: {m.status}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {wo.notes && <p className="text-xs text-muted-foreground mb-2">{wo.notes}</p>}
                  {/* Status progression buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => downloadPdfMutation.mutate({ workOrderId: wo.id })}
                      disabled={downloadPdfMutation.isPending}>
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </Button>
                    {wo.status === "draft" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => updateMutation.mutate({ id: wo.id, status: "issued" })}>
                          Issue
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive ml-auto"
                          onClick={() => { if (confirm("Delete this work order?")) deleteMutation.mutate({ id: wo.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {wo.status === "issued" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => updateMutation.mutate({ id: wo.id, status: "in_progress" })}>
                        Start Work
                      </Button>
                    )}
                    {wo.status === "accepted" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => updateMutation.mutate({ id: wo.id, status: "in_progress" })}>
                        Start Work
                      </Button>
                    )}
                    {wo.status === "in_progress" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => updateMutation.mutate({ id: wo.id, status: "completed" })}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
