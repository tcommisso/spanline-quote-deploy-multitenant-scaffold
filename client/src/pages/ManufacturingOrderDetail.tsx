import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, CheckCircle2, Clock, AlertTriangle, Bell, CheckSquare } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  partially_complete: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  on_hold: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  on_hold: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function formatAustralianDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date).replace(/\//g, "-");
}

export default function ManufacturingOrderDetail() {
  const [, params] = useRoute("/manufacturing/orders/:id");
  const orderId = Number(params?.id);
  const utils = trpc.useUtils();

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<"status" | "branch" | null>(null);
  const [bulkStatus, setBulkStatus] = useState("in_progress");
  const [bulkBranchId, setBulkBranchId] = useState("");
  const [bulkScheduledDate, setBulkScheduledDate] = useState("");

  const { data: order, isLoading } = trpc.manufacturing.orders.detail.useQuery({ id: orderId });
  const { data: branches } = trpc.manufacturing.branches.useQuery();
  const updateStatus = trpc.manufacturing.orders.updateStatus.useMutation({
    onSuccess: () => { utils.manufacturing.orders.detail.invalidate({ id: orderId }); toast.success("Status updated"); },
  });
  const updateTaskStatus = trpc.manufacturing.tasks.updateStatus.useMutation({
    onSuccess: () => { utils.manufacturing.orders.detail.invalidate({ id: orderId }); },
  });
  const bulkUpdateStatus = trpc.manufacturing.tasks.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      utils.manufacturing.orders.detail.invalidate({ id: orderId });
      toast.success(`${selectedTaskIds.size} tasks updated`);
      setSelectedTaskIds(new Set());
      setBulkAction(null);
    },
  });
  const assignBranch = trpc.manufacturing.tasks.assignBranch.useMutation({
    onSuccess: () => {
      utils.manufacturing.orders.detail.invalidate({ id: orderId });
      toast.success(`${selectedTaskIds.size} tasks assigned to branch`);
      setSelectedTaskIds(new Set());
      setBulkAction(null);
    },
  });
  const notifyCompletion = trpc.manufacturing.notifyCompletion.useMutation({
    onSuccess: () => { toast.success("Completion notification sent"); },
  });

  const allTaskIds = useMemo(() => (order?.tasks || []).map((t: any) => t.id), [order]);

  const toggleAll = () => {
    if (selectedTaskIds.size === allTaskIds.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(allTaskIds));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedTaskIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedTaskIds(next);
  };

  const handleBulkSubmit = () => {
    if (selectedTaskIds.size === 0) return;
    const ids = Array.from(selectedTaskIds);
    if (bulkAction === "status") {
      bulkUpdateStatus.mutate({ taskIds: ids, status: bulkStatus as any });
    } else if (bulkAction === "branch") {
      const branch = branches?.find((b: any) => String(b.id) === bulkBranchId);
      if (!branch) { toast.error("Select a branch"); return; }
      assignBranch.mutate({
        taskIds: ids,
        branchId: branch.id,
        branchName: branch.name,
        scheduledDate: bulkScheduledDate || undefined,
      });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-foreground" /></div>;
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found</div>;

  // Group tasks by category
  const tasksByCategory = (order.tasks || []).reduce((acc: Record<string, any[]>, task: any) => {
    const cat = task.category || "Uncategorised";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(task);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/manufacturing/orders">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{order.orderNumber || `Order #${order.id}`}</h1>
            <p className="text-sm text-muted-foreground">{order.clientName}</p>
            {order.siteAddress && <p className="text-xs text-muted-foreground">{order.siteAddress}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={order.status}
            onValueChange={(val) => updateStatus.mutate({ id: orderId, status: val as any })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="in_production">In Production</SelectItem>
              <SelectItem value="partially_complete">Partially Complete</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {order.status === "completed" && (
            <Button variant="outline" size="sm" onClick={() => notifyCompletion.mutate({ orderId })}>
              <Bell className="h-4 w-4 mr-1" /> Notify
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Status</p>
          <Badge variant="secondary" className={`mt-1 ${STATUS_COLORS[order.status] || ""}`}>
            {order.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Priority</p>
          <p className="font-medium capitalize mt-1">{order.priority}</p>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Target Date</p>
          <p className="font-medium mt-1">{order.targetDate ? formatAustralianDate(order.targetDate) : "Not set"}</p>
        </div>
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Tasks</p>
          <p className="font-medium mt-1">{order.tasks?.length || 0} items</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks ({order.tasks?.length || 0})</TabsTrigger>
          <TabsTrigger value="schedule">Schedule ({order.schedule?.length || 0})</TabsTrigger>
          <TabsTrigger value="pos">Purchase Orders ({order.purchaseOrders?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          {/* Bulk Action Bar */}
          {selectedTaskIds.size > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4 text-primary" />
                {selectedTaskIds.size} task{selectedTaskIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <Select value={bulkAction || ""} onValueChange={(v) => setBulkAction(v as any)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="Bulk action..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Update Status</SelectItem>
                    <SelectItem value="branch">Assign Branch</SelectItem>
                  </SelectContent>
                </Select>

                {bulkAction === "status" && (
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {bulkAction === "branch" && (
                  <>
                    <Select value={bulkBranchId} onValueChange={setBulkBranchId}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue placeholder="Branch..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(branches || []).map((b: any) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={bulkScheduledDate}
                      onChange={(e) => setBulkScheduledDate(e.target.value)}
                      className="h-8 w-[140px] text-xs"
                      placeholder="Schedule date"
                    />
                  </>
                )}

                <Button
                  size="sm"
                  onClick={handleBulkSubmit}
                  disabled={!bulkAction || bulkUpdateStatus.isPending || assignBranch.isPending}
                >
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedTaskIds(new Set()); setBulkAction(null); }}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {Object.keys(tasksByCategory).length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No tasks for this order</p>
          ) : (
            Object.entries(tasksByCategory).map(([category, tasks]) => (
              <div key={category} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 font-medium text-sm flex items-center justify-between">
                  <span>{category}</span>
                  <span className="text-xs text-muted-foreground">{(tasks as any[]).length} items</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 w-8">
                        <Checkbox
                          checked={allTaskIds.length > 0 && selectedTaskIds.size === allTaskIds.length}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Product</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Colour</th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Source</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Branch</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(tasks as any[]).map((task: any) => (
                      <tr key={task.id} className={`hover:bg-muted/20 ${selectedTaskIds.has(task.id) ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-2">
                          <Checkbox
                            checked={selectedTaskIds.has(task.id)}
                            onCheckedChange={() => toggleOne(task.id)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{task.productName}</div>
                          {task.productCode && <div className="text-xs text-muted-foreground">{task.productCode}</div>}
                        </td>
                        <td className="px-4 py-2 text-xs">{task.colour || "—"}</td>
                        <td className="px-4 py-2 text-center">{task.quantity} {task.unit}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="text-xs">
                            {task.sourceType === "procure" ? "Procure" : "Manufacture"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs">{task.branchName || "—"}</td>
                        <td className="px-4 py-2">
                          <Badge variant="secondary" className={`text-xs ${TASK_STATUS_COLORS[task.status] || ""}`}>
                            {task.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Select
                            value={task.status}
                            onValueChange={(val) => updateTaskStatus.mutate({ id: task.id, status: val as any })}
                          >
                            <SelectTrigger className="h-7 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="on_hold">On Hold</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          {!order.schedule?.length ? (
            <p className="text-center py-8 text-muted-foreground">No schedule entries yet</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Title</th>
                    <th className="text-left px-4 py-2 font-medium">Branch</th>
                    <th className="text-left px-4 py-2 font-medium">Assigned To</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {order.schedule.map((s: any) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 text-xs">{formatAustralianDate(s.scheduledDate)}</td>
                      <td className="px-4 py-2">{s.title}</td>
                      <td className="px-4 py-2 text-xs">{s.branchName}</td>
                      <td className="px-4 py-2 text-xs">{s.assignedTo || "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className={`text-xs ${TASK_STATUS_COLORS[s.status] || ""}`}>
                          {s.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pos" className="mt-4">
          {!order.purchaseOrders?.length ? (
            <p className="text-center py-8 text-muted-foreground">No purchase orders yet</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">PO #</th>
                    <th className="text-left px-4 py-2 font-medium">Supplier</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Amount</th>
                    <th className="text-left px-4 py-2 font-medium">Required By</th>
                    <th className="text-left px-4 py-2 font-medium">Xero</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {order.purchaseOrders.map((po: any) => (
                    <tr key={po.id}>
                      <td className="px-4 py-2 font-mono text-xs">{po.poNumber}</td>
                      <td className="px-4 py-2">{po.supplier}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className="text-xs">{po.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right">{po.totalAmount ? `$${Number(po.totalAmount).toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-2 text-xs">{formatAustralianDate(po.requiredByDate)}</td>
                      <td className="px-4 py-2 text-xs">
                        {po.xeroPoId ? (
                          <Badge variant="outline" className="text-xs text-green-600">Synced</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
