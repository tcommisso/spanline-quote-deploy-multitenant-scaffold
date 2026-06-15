import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, Search, Package, DollarSign, Clock, CheckCircle2, Plus, ArrowUpRight, Loader2, FileText, Printer, Download } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatCurrencyShort, formatCurrencyFull } from "@/lib/formatCurrency";
import { useIsMobile } from "@/hooks/useMobile";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  issued: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  claimed: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-green-50 text-green-700 border-green-200",
  retention_held: "bg-purple-50 text-purple-700 border-purple-200",
  retention_released: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-500",
  normal: "text-blue-600",
  high: "text-amber-600",
  urgent: "text-red-600",
};

export default function ConstructionPurchaseOrders() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("work-orders");
  const [showNewPO, setShowNewPO] = useState(false);
  const [selectedMilestones, setSelectedMilestones] = useState<Set<number>>(new Set());
  const [milestoneStatusFilter, setMilestoneStatusFilter] = useState("all");

  const { data, isLoading } = trpc.construction.purchaseOrders.listAll.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    tradeType: tradeFilter !== "all" ? tradeFilter : undefined,
    search: search || undefined,
  });

  const utils = trpc.useUtils();
  const stats = data?.stats;

  // Bulk milestone update
  const toggleMilestone = useCallback((id: number) => {
    setSelectedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkUpdateMutation = trpc.construction.purchaseOrders.bulkUpdateMilestones.useMutation({
    onSuccess: (result: any) => {
      toast.success(`${result.updated} milestone(s) updated successfully`);
      setSelectedMilestones(new Set());
      utils.construction.purchaseOrders.listAll.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update milestones");
    },
  });

  const handleBulkUpdate = (newStatus: string) => {
    if (selectedMilestones.size === 0) return;
    bulkUpdateMutation.mutate({ ids: Array.from(selectedMilestones), status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Receipt className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Purchase Orders</h1>
            <p className="text-sm text-muted-foreground">
              Manage work orders and payment milestones across all jobs
            </p>
          </div>
        </div>
        <Button onClick={() => setShowNewPO(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New PO
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Work Orders
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalWorkOrders ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              Estimated Total
            </div>
            <p className="text-2xl font-bold mt-1">{stats ? formatCurrencyShort(stats.totalEstimated) : "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Pending Milestones
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.pendingMilestones ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">{stats ? formatCurrencyShort(stats.totalMilestoneValue - stats.paidMilestoneValue) : ""} outstanding</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Paid Milestones
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.paidMilestones ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">{stats ? formatCurrencyShort(stats.paidMilestoneValue) : ""} paid</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order #, trade, assignee, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tradeFilter} onValueChange={setTradeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Trade Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {(data?.tradeTypes || []).map((t: string) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs: Work Orders / Milestones */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="work-orders">
            Work Orders {data?.workOrders?.length ? `(${data.workOrders.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="milestones">
            Payment Milestones {data?.milestones?.length ? `(${data.milestones.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="subcontracts">
            Subcontracts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="work-orders" className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !data?.workOrders?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No work orders found</p>
                <p className="text-xs text-muted-foreground mt-1">Create a new PO using the button above</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.workOrders.map((wo: any) => (
                <Card key={wo.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold">{wo.orderNumber}</span>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[wo.status] || ""}`}>
                            {wo.status.replace("_", " ")}
                          </Badge>
                          {wo.priority !== "normal" && (
                            <span className={`text-[10px] font-semibold uppercase ${PRIORITY_COLORS[wo.priority] || ""}`}>
                              {wo.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                          {wo.tradeType} — {wo.description || "No description"}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {wo.assignedTo && <span>Assigned: <strong>{wo.assignedTo}</strong></span>}
                          <Link href={`/construction/clients/${wo.jobId}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                            {wo.clientName} <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {wo.estimatedCost && (
                          <p className="text-sm font-semibold">{formatCurrencyFull(Number(wo.estimatedCost))}</p>
                        )}
                        {wo.scheduledDate && (
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(wo.scheduledDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="milestones" className="mt-4">
          {/* Milestone status filter */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <Select value={milestoneStatusFilter} onValueChange={setMilestoneStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Milestone Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Milestones</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="claimed">Claimed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="retention_held">Retention Held</SelectItem>
                <SelectItem value="retention_released">Retention Released</SelectItem>
              </SelectContent>
            </Select>
            {milestoneStatusFilter !== "all" && (
              <span className="text-xs text-muted-foreground">
                {(data?.milestones || []).filter((m: any) => m.status === milestoneStatusFilter).length} milestone(s)
              </span>
            )}
          </div>
          {/* Bulk action bar */}
          {selectedMilestones.size > 0 && (
            <div className="flex items-center gap-3 p-3 mb-3 rounded-lg bg-muted border">
              <span className="text-sm font-medium">{selectedMilestones.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => handleBulkUpdate("claimed")} disabled={bulkUpdateMutation.isPending}>
                Mark Claimed
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkUpdate("approved")} disabled={bulkUpdateMutation.isPending}>
                Mark Approved
              </Button>
              <Button size="sm" onClick={() => handleBulkUpdate("paid")} disabled={bulkUpdateMutation.isPending}>
                Mark Paid
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedMilestones(new Set())}>
                Clear
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !data?.milestones?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No payment milestones found</p>
                <p className="text-xs text-muted-foreground mt-1">Milestones are created from work orders</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.milestones.filter((m: any) => milestoneStatusFilter === "all" || m.status === milestoneStatusFilter).map((m: any) => (
                <Card key={m.id} className={`hover:shadow-sm transition-shadow ${selectedMilestones.has(m.id) ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedMilestones.has(m.id)}
                        onCheckedChange={() => toggleMilestone(m.id)}
                        className="mt-1"
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{m.stage}</span>
                            <Badge variant="outline" className={`text-[10px] ${MILESTONE_STATUS_COLORS[m.status] || ""}`}>
                              {m.status.replace("_", " ")}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{m.percentage}%</span>
                          </div>
                          {m.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <Link href={`/construction/clients/${m.jobId}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                              {m.clientName} <ArrowUpRight className="h-3 w-3" />
                            </Link>
                            {m.paidAt && <span className="text-green-600">Paid {new Date(m.paidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>}
                            {m.claimedAt && !m.paidAt && <span className="text-amber-600">Claimed {new Date(m.claimedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">{formatCurrencyFull(Number(m.amount))}</p>
                          {Number(m.retentionAmount) > 0 && (
                            <p className="text-[10px] text-muted-foreground">Retention: {formatCurrencyFull(Number(m.retentionAmount))}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="subcontracts" className="mt-4">
          <SubcontractsTab />
        </TabsContent>
      </Tabs>

      {/* New PO Dialog */}
      <NewPODialog open={showNewPO} onOpenChange={setShowNewPO} tradeTypes={data?.tradeTypes || []} />
    </div>
  );
}

// ─── New PO Dialog ──────────────────────────────────────────────────────────────

function NewPODialog({ open, onOpenChange, tradeTypes }: { open: boolean; onOpenChange: (v: boolean) => void; tradeTypes: string[] }) {
  const utils = trpc.useUtils();
  const [jobSearch, setJobSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [tradeType, setTradeType] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [assignedPhone, setAssignedPhone] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  // Search for jobs
  const jobsQuery = trpc.constructionClients.list.useQuery(
    { search: jobSearch || undefined, limit: 20, offset: 0 },
    { enabled: open && jobSearch.length >= 2 }
  );

  // Get workbook for selected job
  const workbookQuery = trpc.construction.checkMeasure.getByJob.useQuery(
    { jobId: selectedJobId! },
    { enabled: selectedJobId != null }
  );

  const createMutation = trpc.construction.checkMeasure.workOrders.create.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.orderNumber} created successfully`);
      utils.construction.purchaseOrders.listAll.invalidate();
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create work order");
    },
  });

  const resetForm = () => {
    setJobSearch("");
    setSelectedJobId(null);
    setTradeType("");
    setDescription("");
    setAssignedTo("");
    setAssignedEmail("");
    setAssignedPhone("");
    setPriority("normal");
    setEstimatedCost("");
    setScheduledDate("");
  };

  const selectedJob = useMemo(() => {
    if (!selectedJobId || !jobsQuery.data?.clients) return null;
    return jobsQuery.data.clients.find((c: any) => c.id === selectedJobId);
  }, [selectedJobId, jobsQuery.data]);

  const handleSubmit = () => {
    if (!selectedJobId || !tradeType) {
      toast.error("Please select a job and trade type");
      return;
    }
    const workbookId = workbookQuery.data?.id;
    if (!workbookId) {
      toast.error("This job doesn't have a check measure workbook yet. Please create one from the job detail page first.");
      return;
    }
    createMutation.mutate({
      workbookId,
      jobId: selectedJobId,
      tradeType,
      description: description || undefined,
      assignedTo: assignedTo || undefined,
      assignedEmail: assignedEmail || undefined,
      assignedPhone: assignedPhone || undefined,
      priority,
      estimatedCost: estimatedCost || undefined,
      scheduledDate: scheduledDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Purchase Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Job Selector */}
          <div className="space-y-2">
            <Label>Job / Client *</Label>
            {selectedJobId && selectedJob ? (
              <div className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                <span className="text-sm font-medium">{(selectedJob as any).clientName}</span>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedJobId(null); setJobSearch(""); }}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Search for a job by client name..."
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                />
                {jobSearch.length >= 2 && jobsQuery.data?.clients && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {jobsQuery.data.clients.length === 0 ? (
                      <p className="p-2 text-xs text-muted-foreground">No jobs found</p>
                    ) : (
                      jobsQuery.data.clients.map((job: any) => (
                        <button
                          key={job.id}
                          onClick={() => { setSelectedJobId(job.id); setJobSearch(job.clientName); }}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                        >
                          <span className="font-medium">{job.clientName}</span>
                          {job.address && <span className="text-xs text-muted-foreground ml-2">{job.address}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Trade Type */}
          <div className="space-y-2">
            <Label>Trade Type *</Label>
            <Select value={tradeType} onValueChange={setTradeType}>
              <SelectTrigger>
                <SelectValue placeholder="Select trade type" />
              </SelectTrigger>
              <SelectContent>
                {tradeTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
                <SelectItem value="__custom">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
            {tradeType === "__custom" && (
              <Input
                placeholder="Enter custom trade type..."
                onChange={(e) => setTradeType(e.target.value)}
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description / Scope</Label>
            <Textarea
              placeholder="Describe the scope of work..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Assigned To */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Input
                placeholder="Trade name / company"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                placeholder="Contact phone"
                value={assignedPhone}
                onChange={(e) => setAssignedPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              placeholder="Trade email"
              value={assignedEmail}
              onChange={(e) => setAssignedEmail(e.target.value)}
            />
          </div>

          {/* Priority + Cost + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
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
            <div className="space-y-2">
              <Label>Estimated Cost</Label>
              <Input
                placeholder="$0.00"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || !selectedJobId || !tradeType}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Subcontracts Tab ──────────────────────────────────────────────────────────

const SC_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  signed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

function SubcontractsTab() {
  const [, navigate] = useLocation();
  const { data: subcontracts, isLoading } = trpc.subcontract.listAll.useQuery();
  const createMutation = trpc.subcontract.create.useMutation();
  const utils = trpc.useUtils();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createJobSearch, setCreateJobSearch] = useState("");
  const [createJobId, setCreateJobId] = useState<number | null>(null);

  const jobsQuery = trpc.constructionClients.list.useQuery(
    { search: createJobSearch || undefined, limit: 20, offset: 0 },
    { enabled: showCreateDialog && createJobSearch.length >= 2 }
  );

  const handleCreate = async () => {
    if (!createJobId) return;
    try {
      const result = await createMutation.mutateAsync({ jobId: createJobId });
      utils.subcontract.listAll.invalidate();
      setShowCreateDialog(false);
      setCreateJobSearch("");
      setCreateJobId(null);
      navigate(`/subcontracts/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create subcontract");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {subcontracts?.length || 0} subcontract(s) across all jobs
        </p>
        <Button variant="brand" size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Subcontract
        </Button>
      </div>

      {!subcontracts?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No subcontracts found</p>
            <p className="text-xs text-muted-foreground mt-1">Create a new subcontract using the button above</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subcontracts.map((sc: any) => (
            <Card key={sc.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate(`/subcontracts/${sc.id}`)}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{sc.subcontractorName || "Unnamed Subcontractor"}</span>
                      <Badge variant="outline" className={`text-[10px] ${SC_STATUS_COLORS[sc.status] || ""}`}>
                        {sc.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {sc.jobNumber && <span>Job #{sc.jobNumber}</span>}
                      {sc.clientName && <span>• {sc.clientName}</span>}
                      {sc.siteAddress && <span className="truncate max-w-[200px]">• {sc.siteAddress}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Preview"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const previewWin = window.open("", "_blank");
                        if (!previewWin) { toast.error("Please allow popups"); return; }
                        previewWin.document.write("<html><body><p>Loading A4 preview...</p></body></html>");
                        try {
                          const result = await utils.subcontract.previewHtml.fetch({ id: sc.id });
                          previewWin.document.open();
                          previewWin.document.write(result.html);
                          previewWin.document.close();
                        } catch {
                          previewWin.document.open();
                          previewWin.document.write("<html><body><p>Failed to load preview.</p></body></html>");
                          previewWin.document.close();
                        }
                      }}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Download PDF"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const result = await utils.subcontract.previewHtml.fetch({ id: sc.id });
                          const printWin = window.open("", "_blank");
                          if (printWin) {
                            printWin.document.open();
                            printWin.document.write(result.html);
                            printWin.document.close();
                            setTimeout(() => printWin.print(), 600);
                          }
                        } catch {
                          toast.error("Failed to generate PDF");
                        }
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{sc.subcontractSum ? formatCurrencyFull(Number(sc.subcontractSum)) : "\u2014"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {sc.createdAt ? new Date(sc.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Subcontract Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Subcontract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Search Job</Label>
              <Input
                placeholder="Type client name or job number..."
                value={createJobSearch}
                onChange={(e) => { setCreateJobSearch(e.target.value); setCreateJobId(null); }}
              />
              {jobsQuery.data?.clients?.length ? (
                <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                  {jobsQuery.data.clients.map((j: any) => (
                    <button
                      key={j.id}
                      onClick={() => { setCreateJobId(j.id); setCreateJobSearch(j.clientName || j.quoteNumber || `Job #${j.id}`); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${createJobId === j.id ? "bg-primary/10" : ""}`}
                    >
                      <p className="font-medium">{j.clientName || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{j.quoteNumber} — {j.siteAddress}</p>
                    </button>
                  ))}
                </div>
              ) : createJobSearch.length >= 2 && !jobsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">No jobs found</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setCreateJobSearch(""); setCreateJobId(null); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !createJobId}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Subcontract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
