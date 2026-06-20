import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, ClipboardCheck, FileText, AlertTriangle, CheckCircle2,
  Package, Wrench, Plus, Trash2, Edit2, UserCheck, ShieldAlert,
  ChevronDown, ChevronUp, Calendar, Phone, Mail, X, Download, Printer,
} from "lucide-react";
import { generateProposalPDF, type ProposalQuoteData } from "@/lib/pdfProposal";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyInternalUseWatermark } from "@/lib/pdfWatermark";
import CrossSectionDiagram from "@/components/CrossSectionDiagram";
import FrontElevationDiagram from "@/components/FrontElevationDiagram";
import PlanViewDiagram from "@/components/PlanViewDiagram";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Pending Review", color: "bg-yellow-100 text-yellow-800" },
  in_review: { label: "In Review", color: "bg-blue-100 text-blue-800" },
  reviewed: { label: "Reviewed", color: "bg-green-100 text-green-800" },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-800" },
  variance_found: { label: "Variance Found", color: "bg-red-100 text-red-800" },
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: "bg-yellow-100 text-yellow-800 border-yellow-300",
  moderate: "bg-orange-100 text-orange-800 border-orange-300",
  major: "bg-red-100 text-red-800 border-red-300",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  received: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const WO_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  issued: "bg-blue-100 text-blue-800",
  accepted: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

// ─── Variance Item Form ─────────────────────────────────────────────────────
function VarianceItemForm({ workbookId, item, onClose, onSuccess }: {
  workbookId: number;
  item?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    tabName: item?.tabName || "",
    itemDescription: item?.itemDescription || "",
    originalQty: item?.originalQty || "",
    measuredQty: item?.measuredQty || "",
    varianceQty: item?.varianceQty || "",
    uom: item?.uom || "ea",
    severity: item?.severity || "minor",
    notes: item?.notes || "",
  });

  const create = trpc.construction.checkMeasure.variance.create.useMutation({
    onSuccess: () => { toast.success("Variance item added"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.construction.checkMeasure.variance.update.useMutation({
    onSuccess: () => { toast.success("Variance item updated"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.tabName || !form.itemDescription) {
      toast.error("Tab name and description are required");
      return;
    }
    if (item) {
      update.mutate({ id: item.id, ...form });
    } else {
      create.mutate({ workbookId, ...form });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Variance Item" : "Add Variance Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tab / Section</Label>
              <Input value={form.tabName} onChange={e => setForm(f => ({ ...f, tabName: e.target.value }))} placeholder="e.g. Roofing, Gutters" />
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Item Description</Label>
            <Input value={form.itemDescription} onChange={e => setForm(f => ({ ...f, itemDescription: e.target.value }))} placeholder="e.g. Roof pitch differs from spec" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Original Qty</Label>
              <Input value={form.originalQty} onChange={e => setForm(f => ({ ...f, originalQty: e.target.value }))} placeholder="10" />
            </div>
            <div>
              <Label>Measured Qty</Label>
              <Input value={form.measuredQty} onChange={e => setForm(f => ({ ...f, measuredQty: e.target.value }))} placeholder="12" />
            </div>
            <div>
              <Label>Variance</Label>
              <Input value={form.varianceQty} onChange={e => setForm(f => ({ ...f, varianceQty: e.target.value }))} placeholder="+2" />
            </div>
            <div>
              <Label>UOM</Label>
              <Input value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} placeholder="ea" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Additional context..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
            {item ? "Update" : "Add"} Variance Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component Order Form ───────────────────────────────────────────────────
function ComponentOrderForm({ workbookId, order, onClose, onSuccess }: {
  workbookId: number;
  order?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    supplier: order?.supplier || "",
    totalCost: order?.totalCost || "",
    notes: order?.notes || "",
    status: order?.status || "draft",
  });
  const [lineItems, setLineItems] = useState<Array<{ description: string; qty: string; unit: string; unitCost: string }>>(
    order?.lineItems && Array.isArray(order.lineItems) ? order.lineItems : [{ description: "", qty: "", unit: "ea", unitCost: "" }]
  );

  const create = trpc.construction.checkMeasure.componentOrders.create.useMutation({
    onSuccess: () => { toast.success("Component order created"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.construction.checkMeasure.componentOrders.update.useMutation({
    onSuccess: () => { toast.success("Component order updated"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const addLine = () => setLineItems(l => [...l, { description: "", qty: "", unit: "ea", unitCost: "" }]);
  const removeLine = (i: number) => setLineItems(l => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: string) => {
    setLineItems(l => l.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    const filtered = lineItems.filter(l => l.description.trim());
    if (order) {
      update.mutate({ id: order.id, ...form, lineItems: filtered });
    } else {
      create.mutate({ workbookId, ...form, lineItems: filtered });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? `Edit Order ${order.orderNumber}` : "New Component Order"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" />
            </div>
            <div>
              <Label>Total Cost</Label>
              <Input value={form.totalCost} onChange={e => setForm(f => ({ ...f, totalCost: e.target.value }))} placeholder="$0.00" />
            </div>
            {order && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add Line</Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_100px_32px] gap-2 items-center">
                  <Input value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Description" />
                  <Input value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} placeholder="Qty" />
                  <Input value={line.unit} onChange={e => updateLine(i, "unit", e.target.value)} placeholder="Unit" />
                  <Input value={line.unitCost} onChange={e => updateLine(i, "unitCost", e.target.value)} placeholder="$/unit" />
                  <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="h-8 w-8">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
            {order ? "Update" : "Create"} Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Work Order Form ────────────────────────────────────────────────────────
function WorkOrderForm({ workbookId, jobId, wo, onClose, onSuccess }: {
  workbookId: number;
  jobId: number;
  wo?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    tradeType: wo?.tradeType || "",
    description: wo?.description || "",
    scope: wo?.scope || "",
    assignedTo: wo?.assignedTo || "",
    assignedPhone: wo?.assignedPhone || "",
    assignedEmail: wo?.assignedEmail || "",
    priority: wo?.priority || "normal",
    scheduledDate: wo?.scheduledDate ? new Date(wo.scheduledDate).toISOString().split("T")[0] : "",
    estimatedCost: wo?.estimatedCost || "",
    notes: wo?.notes || "",
    status: wo?.status || "draft",
  });
  const [lineItems, setLineItems] = useState<Array<{ task: string; details: string }>>(
    wo?.lineItems && Array.isArray(wo.lineItems) ? wo.lineItems : [{ task: "", details: "" }]
  );

  const create = trpc.construction.checkMeasure.workOrders.create.useMutation({
    onSuccess: () => { toast.success("Work order created"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.construction.checkMeasure.workOrders.update.useMutation({
    onSuccess: () => { toast.success("Work order updated"); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.tradeType) { toast.error("Trade type is required"); return; }
    const filtered = lineItems.filter(l => l.task.trim());
    if (wo) {
      update.mutate({ id: wo.id, ...form, scheduledDate: form.scheduledDate || null, lineItems: filtered });
    } else {
      create.mutate({ workbookId, jobId, ...form, scheduledDate: form.scheduledDate || undefined, lineItems: filtered });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{wo ? `Edit ${wo.orderNumber}` : "New Work Order"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trade Type</Label>
              <Input value={form.tradeType} onChange={e => setForm(f => ({ ...f, tradeType: e.target.value }))} placeholder="e.g. Electrical, Plumbing, Roofing" />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Work order description" />
          </div>
          <div>
            <Label>Scope of Work</Label>
            <Textarea value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} rows={3} placeholder="Detailed scope..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Assigned To (Subcontractor)</Label>
              <Input value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Company / Person" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.assignedPhone} onChange={e => setForm(f => ({ ...f, assignedPhone: e.target.value }))} placeholder="0400 000 000" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.assignedEmail} onChange={e => setForm(f => ({ ...f, assignedEmail: e.target.value }))} placeholder="email@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Scheduled Date</Label>
              <div className="flex gap-1 items-center">
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} className="flex-1" />
                {form.scheduledDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, scheduledDate: "" }))} title="Clear date">&times;</Button>}
              </div>
            </div>
            <div>
              <Label>Estimated Cost</Label>
              <Input value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: e.target.value }))} placeholder="$0.00" />
            </div>
            {wo && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Task Breakdown</Label>
              <Button variant="outline" size="sm" onClick={() => setLineItems(l => [...l, { task: "", details: "" }])}>
                <Plus className="h-3 w-3 mr-1" /> Add Task
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                  <Input value={line.task} onChange={e => setLineItems(l => l.map((it, idx) => idx === i ? { ...it, task: e.target.value } : it))} placeholder="Task" />
                  <Input value={line.details} onChange={e => setLineItems(l => l.map((it, idx) => idx === i ? { ...it, details: e.target.value } : it))} placeholder="Details" />
                  <Button variant="ghost" size="icon" onClick={() => setLineItems(l => l.filter((_, idx) => idx !== i))} className="h-8 w-8">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
            {wo ? "Update" : "Create"} Work Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function CheckMeasureWorkbook() {
  const [, params] = useRoute("/construction/jobs/:jobId/check-measure");
  const [, navigate] = useLocation();
  const jobId = Number(params?.jobId);

  const utils = trpc.useUtils();
  const { data: workbook, isLoading, refetch } = trpc.construction.checkMeasure.getByJob.useQuery(
    { jobId },
    { enabled: !!jobId }
  );
  const { data: job } = trpc.construction.jobs.get.useQuery({ id: jobId }, { enabled: !!jobId });
  const { data: staffUsers } = trpc.construction.checkMeasure.staffUsers.useQuery();

  const updateStatus = trpc.construction.checkMeasure.updateStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Status updated"); },
  });
  const assignUser = trpc.construction.checkMeasure.assignUser.useMutation({
    onSuccess: () => { refetch(); toast.success("Construction user assigned"); },
  });
  const saveVariance = trpc.construction.checkMeasure.saveVarianceNotes.useMutation({
    onSuccess: () => { refetch(); toast.success("Variance notes saved"); },
  });

  const [varianceNotes, setVarianceNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"spec" | "deckspec" | "eclipsespec" | "costing" | "components" | "variance" | "orders" | "workorders">("spec");
  const [showVarianceForm, setShowVarianceForm] = useState(false);
  const [editingVariance, setEditingVariance] = useState<any>(null);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [showWOForm, setShowWOForm] = useState(false);
  const [editingWO, setEditingWO] = useState<any>(null);

  // Variance items
  const { data: varianceItems, refetch: refetchVariance } = trpc.construction.checkMeasure.variance.list.useQuery(
    { workbookId: workbook?.id ?? 0 },
    { enabled: !!workbook?.id }
  );
  const resolveVariance = trpc.construction.checkMeasure.variance.resolve.useMutation({
    onSuccess: () => { refetchVariance(); toast.success("Variance resolved"); },
  });
  const deleteVariance = trpc.construction.checkMeasure.variance.delete.useMutation({
    onSuccess: () => { refetchVariance(); toast.success("Variance deleted"); },
  });

  // Component orders
  const { data: componentOrders, refetch: refetchOrders } = trpc.construction.checkMeasure.componentOrders.list.useQuery(
    { workbookId: workbook?.id ?? 0 },
    { enabled: !!workbook?.id }
  );
  const deleteOrder = trpc.construction.checkMeasure.componentOrders.delete.useMutation({
    onSuccess: () => { refetchOrders(); toast.success("Order deleted"); },
  });

  // Work orders
  const { data: workOrders, refetch: refetchWOs } = trpc.construction.checkMeasure.workOrders.list.useQuery(
    { workbookId: workbook?.id ?? 0 },
    { enabled: !!workbook?.id }
  );
  const deleteWO = trpc.construction.checkMeasure.workOrders.delete.useMutation({
    onSuccess: () => { refetchWOs(); toast.success("Work order deleted"); },
  });

  // Quote line items (costing snapshot)
  const { data: quoteLineItems } = trpc.construction.checkMeasure.getQuoteLineItems.useQuery(
    { workbookId: workbook?.id ?? 0 },
    { enabled: !!workbook?.id }
  );

  // Group variance items by tab
  const varianceByTab = useMemo(() => {
    if (!varianceItems) return {};
    const grouped: Record<string, typeof varianceItems> = {};
    for (const item of varianceItems) {
      if (!grouped[item.tabName]) grouped[item.tabName] = [];
      grouped[item.tabName].push(item);
    }
    return grouped;
  }, [varianceItems]);

  // Group quote line items by tab
  const costingByTab = useMemo(() => {
    if (!quoteLineItems) return {};
    const grouped: Record<string, typeof quoteLineItems> = {};
    for (const item of quoteLineItems) {
      const tab = item.tabName || "General";
      if (!grouped[tab]) grouped[tab] = [];
      grouped[tab].push(item);
    }
    return grouped;
  }, [quoteLineItems]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!workbook) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Button variant="ghost" onClick={() => navigate(`/construction`)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Construction
          </Button>
          <Card className="mt-4">
            <CardContent className="p-8 text-center text-muted-foreground">
              <ClipboardCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No check measure workbook found for this job.</p>
              <p className="text-sm mt-2">A workbook is automatically created when a CRM lead status changes to "Contract".</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const specData = (workbook.specData as Record<string, any>) || {};
  const components = (workbook.components as Array<{ tabName: string; included: boolean; lineItems: any }>) || [];
  const deckSpecData = (workbook.deckSpecData as Record<string, any>) || null;
  const eclipseSpecData = (workbook.eclipseSpecData as Record<string, any>) || null;
  const statusInfo = STATUS_LABELS[workbook.status] || STATUS_LABELS.pending_review;

  // ─── PDF Export: Spec Sheet (Internal Use Only) ─────────────────────────────
  const handleExportSpecPDF = async () => {
    toast.info("Generating spec sheet PDF...");

    // Derive connection code from spec data (same logic as QuoteEditor)
    const connCode = (() => {
      const method = specData.specAttachmentMethod || "";
      if (method === "None" || !method) return undefined;
      if (specData.specFreeStanding === "Yes") return "FSS";
      if (parseInt(specData.specPopupBrackets || "0") > 0) return "POP";
      if (parseInt(specData.specGableBrackets || "0") > 0) return "GBL";
      if (parseInt(specData.specExtendaBrackets || "0") > 0) return "FLY";
      if (specData.specWallFixingBeam || specData.specWallFixingBracket) return "WFX";
      if (parseInt(specData.specFasciaBrackets || "0") > 0) return "BCH";
      return "BCH";
    })();

    // Fetch connection image URL from Image Library
    let connectionImageUrl: string | undefined;
    if (connCode) {
      try {
        const images = await utils.planConverter.getProductImagesByCode.fetch({ code: connCode });
        connectionImageUrl = images?.[0]?.imageUrl || undefined;
      } catch { /* ignore */ }
    }

    const proposalData: ProposalQuoteData = {
      quoteNumber: workbook.originalQuoteNumber || `CM-${workbook.id}`,
      clientName: specData.clientName || job?.clientName || "",
      clientPhone: specData.clientPhone,
      clientEmail: specData.clientEmail,
      siteAddress: specData.siteAddress,
      suburb: specData.suburb,
      region: specData.region,
      descriptionOfWork: specData.descriptionOfWork,
      specRoofType: specData.specRoofType,
      specWidth: specData.specWidth,
      specLength: specData.specLength,
      specFloorHeight: specData.specFloorHeight,
      specRoofTopColour: specData.specRoofTopColour,
      specRoofBottomColour: specData.specRoofBottomColour,
      specPostsColour: specData.specPostsColour,
      specBeamColour: specData.specBeamColour,
      grandTotalExGst: 0,
      grandTotalIncGst: 0,
      gst: 0,
      componentSummary: [],
      adjustments: [],
      connectionType: specData.specAttachmentMethod || undefined,
      connectionImageUrl,
      materialsList: (() => {
        const items: { category: string; product: string; colour?: string }[] = [];
        if (specData.specRoofType) items.push({ category: "Roof", product: specData.specRoofType, colour: specData.specRoofTopColour || undefined });
        if (specData.specBeamSize) items.push({ category: "Beams", product: specData.specBeamSize, colour: specData.specBeamColour || undefined });
        if (specData.specPostsType) items.push({ category: "Posts", product: specData.specPostsType, colour: specData.specPostsColour || undefined });
        if (specData.specGutterType) items.push({ category: "Gutter", product: specData.specGutterType, colour: specData.specGutterColour || undefined });
        if (specData.specDownpipeType) items.push({ category: "Downpipe", product: specData.specDownpipeType, colour: specData.specDownpipeColour || undefined });
        if (specData.specAttachmentMethod && specData.specAttachmentMethod !== "None") {
          items.push({ category: "Attachment", product: specData.specAttachmentMethod });
        }
        return items;
      })(),
    };
    try {
      await generateProposalPDF(proposalData, "download", { internalUseOnly: true });
      toast.success("Spec sheet PDF downloaded (Internal Use Only)");
    } catch (e) {
      toast.error("Failed to generate spec sheet PDF");
    }
  };

  // ─── PDF Export: Cost Report (Internal Use Only) ────────────────────────────
  const handleExportCostPDF = () => {
    if (!quoteLineItems || quoteLineItems.length === 0) {
      toast.error("No costing data available");
      return;
    }
    toast.info("Generating cost report PDF...");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const margin = 14;
    let y = 20;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Construction Check Measure — Cost Report", margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Job: ${job?.clientName || ""} | Quote: ${workbook.originalQuoteNumber || "N/A"}`, margin, y);
    y += 5;
    doc.text(`Generated: ${new Date().toLocaleDateString("en-AU")}`, margin, y);
    y += 10;

    // Cost table by tab
    let grandTotal = 0;
    Object.entries(costingByTab).forEach(([tabName, items]) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(tabName, margin, y);
      y += 2;

      const rows = (items as any[]).map((item: any) => {
        const total = Number(item.totalCost) || 0;
        grandTotal += total;
        return [
          item.description || item.name || "-",
          item.quantity != null ? String(item.quantity) : "-",
          item.unit || item.uom || "-",
          item.unitCost != null ? `$${Number(item.unitCost).toFixed(2)}` : "-",
          `$${total.toFixed(2)}`,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["Description", "Qty", "Unit", "Unit Cost", "Total"]],
        body: rows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: {
          1: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right", fontStyle: "bold" },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    });

    // Grand total
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Grand Total: $${grandTotal.toFixed(2)}`, pageWidth - margin, y, { align: "right" });

    // Apply watermark
    applyInternalUseWatermark(doc);
    doc.save(`CostReport-${workbook.originalQuoteNumber || `CM-${workbook.id}`}-INTERNAL.pdf`);
    toast.success("Cost report PDF downloaded (Internal Use Only)");
  };

  const tabs = [
    { id: "spec" as const, label: "Spec Sheet", icon: FileText },
    ...(deckSpecData ? [{ id: "deckspec" as const, label: "Deck Spec", icon: FileText }] : []),
    ...(eclipseSpecData ? [{ id: "eclipsespec" as const, label: "Eclipse Spec", icon: FileText }] : []),
    { id: "costing" as const, label: "Costing", icon: FileText },
    { id: "components" as const, label: "Components", icon: Package },
    { id: "variance" as const, label: "Variance Report", icon: AlertTriangle, count: varianceItems?.filter(v => !v.resolvedAt).length },
    { id: "orders" as const, label: "Component Orders", icon: Package, count: componentOrders?.length },
    { id: "workorders" as const, label: "Work Orders", icon: Wrench, count: workOrders?.length },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/construction`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{workbook.title}</h1>
                <Badge className="bg-teal-700 text-white text-xs px-2 py-0.5 uppercase tracking-wider font-semibold">
                  Construction Check Measure
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Original Quote: {workbook.originalQuoteNumber || "N/A"} &bull; Job: {job?.clientName || ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            <Select
              value={workbook.status}
              onValueChange={(val) => updateStatus.mutate({ id: workbook.id, status: val as any })}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="variance_found">Variance Found</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportSpecPDF} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Spec PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCostPDF} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Cost Report
            </Button>
          </div>
        </div>

        {/* Internal Use Only Banner */}
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
          <span className="font-semibold text-red-800 text-sm uppercase tracking-wide">
            Internal Use Only &mdash; Construction Check Measure Document
          </span>
        </div>

        {/* People Row */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-6">
            <div className="text-sm">
              <span className="text-muted-foreground">Design Adviser:</span>{" "}
              <span className="font-medium">{job?.designAdviserName || "Unassigned"}</span>
            </div>
            <div className="text-sm flex items-center gap-2">
              <span className="text-muted-foreground">Construction User:</span>
              <Select
                value={workbook.checkedBy?.toString() || "unassigned"}
                onValueChange={(val) => assignUser.mutate({ id: workbook.id, userId: val === "unassigned" ? null : Number(val) })}
              >
                <SelectTrigger className="w-[200px] h-8">
                  <SelectValue placeholder="Assign user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffUsers?.map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {workbook.checkedAt && (
              <div className="text-sm text-muted-foreground">
                Last checked: {new Date(workbook.checkedAt).toLocaleDateString()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tab Navigation — responsive: horizontal scroll on mobile */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{tab.count}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* ─── Spec Sheet Tab ─────────────────────────────────────────────── */}
        {activeTab === "spec" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Spec Sheet (Duplicated from Quote)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(specData)
                  .filter(([key]) => key.startsWith("spec"))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => {
                    if (value === null || value === undefined || value === "") return null;
                    const label = key.replace("spec", "").replace(/([A-Z])/g, " $1").trim();
                    return (
                      <div key={key} className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-medium mt-1 break-words">
                          {typeof value === "object" ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    );
                  })}
              </div>
              {specData.descriptionOfWork && (
                <div className="mt-4 border rounded-md p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Description of Work</p>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{specData.descriptionOfWork}</p>
                </div>
              )}

              {/* Cross-Section Diagram (read-only from spec data) */}
              <div className="mt-6">
                <CrossSectionDiagram
                  roofPitch={specData.specFall || ""}
                  houseRoofType={specData.specHouseRoofType || ""}
                  cutBackEave={specData.specCutBackEave || ""}
                  removeGutterFlash={specData.specRemoveGutterFlash || ""}
                  houseWallType={specData.specHouseWallType || ""}
                  fallOnGround={specData.specFallOnGround || ""}
                  groundLevel={specData.specGroundLevel || ""}
                  roofOverhang={specData.specRoofOverhang || ""}
                  onRoofPitchChange={() => {}}
                  onHouseRoofTypeChange={() => {}}
                  onCutBackEaveChange={() => {}}
                  onRemoveGutterFlashChange={() => {}}
                  onHouseWallTypeChange={() => {}}
                  onFallOnGroundChange={() => {}}
                  onGroundLevelChange={() => {}}
                  onRoofOverhangChange={() => {}}
                  readOnly
                  connectionType={(() => {
                    const method = specData.specAttachmentMethod || "";
                    if (!method || method === "None") return undefined;
                    if (specData.specFreeStanding === "Yes") return "FSS";
                    if (parseInt(specData.specPopupBrackets || "0") > 0) return "POP";
                    if (parseInt(specData.specGableBrackets || "0") > 0) return "GBL";
                    if (parseInt(specData.specExtendaBrackets || "0") > 0) return "FLY";
                    if (specData.specWallFixingBeam || specData.specWallFixingBracket) return "WFX";
                    if (parseInt(specData.specFasciaBrackets || "0") > 0) return "BCH";
                    return "BCH";
                  })()}
                />
              </div>

              {/* Front Elevation Diagram (read-only from spec data) */}
              <div className="mt-6">
                <FrontElevationDiagram
                  structureWidth={specData.specWidth || ""}
                  beamHeight={specData.specFloorHeight || ""}
                  postCount={specData.specPostsNumber || ""}
                  postSpacing={specData.specPostSpacing || ""}
                  gutterType={specData.specGutterType || ""}
                  roofOverhang={specData.specRoofOverhang || ""}
                  postSize={specData.specPostsType || ""}
                  beamSize={specData.specBeamSize || ""}
                  roofShape={specData.specRoofShape || ""}
                  roofFall={specData.specFall || ""}
                  onStructureWidthChange={() => {}}
                  onBeamHeightChange={() => {}}
                  onPostCountChange={() => {}}
                  onPostSpacingChange={() => {}}
                  onGutterTypeChange={() => {}}
                  onRoofOverhangChange={() => {}}
                  onPostSizeChange={() => {}}
                  onBeamSizeChange={() => {}}
                  readOnly
                />
              </div>

              {/* Plan View Diagram (read-only from spec data) */}
              <div className="mt-6">
                <PlanViewDiagram
                  width={specData.specWidth || ""}
                  length={specData.specLength || ""}
                  postPositions={(specData.specPostPositions || "").split(",").filter(Boolean)}
                  houseWalls={specData.specHouseWalls ? specData.specHouseWalls.split(",").filter(Boolean) : []}
                  beamSize={specData.specBeamSize || ""}
                  roofType={specData.specRoofType || ""}
                  postSpacing={specData.specPostSpacing || ""}
                  readOnly
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Deck Spec Tab ───────────────────────────────────────────────── */}
        {activeTab === "deckspec" && deckSpecData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Deck Quote Spec (Duplicated from Deck Quote)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Client & Site */}
              <div>
                <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Client & Site</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deckSpecData.clientName && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Client Name</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.clientName}</p>
                    </div>
                  )}
                  {deckSpecData.siteAddress && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Site Address</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.siteAddress}</p>
                    </div>
                  )}
                  {deckSpecData.suburb && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Suburb</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.suburb}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dimensions & Design */}
              <div>
                <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Dimensions & Design</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {deckSpecData.deckWidth && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Width (mm)</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.deckWidth}</p>
                    </div>
                  )}
                  {deckSpecData.deckLength && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Length (mm)</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.deckLength}</p>
                    </div>
                  )}
                  {deckSpecData.deckHeight && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Height (mm)</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.deckHeight}</p>
                    </div>
                  )}
                  {deckSpecData.areaM2 && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Area (m²)</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.areaM2}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Product & Frame */}
              <div>
                <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Product & Frame</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deckSpecData.deckingProduct && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Decking Product</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.deckingProduct}</p>
                    </div>
                  )}
                  {deckSpecData.deckingColour && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Decking Colour</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.deckingColour}</p>
                    </div>
                  )}
                  {deckSpecData.subframeType && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Subframe Type</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.subframeType}</p>
                    </div>
                  )}
                  {deckSpecData.joistSpacing && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Joist Spacing</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.joistSpacing}</p>
                    </div>
                  )}
                  {deckSpecData.fascia && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Fascia</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.fascia}</p>
                    </div>
                  )}
                  {deckSpecData.handrail && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Handrail</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.handrail}</p>
                    </div>
                  )}
                  {deckSpecData.steps && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Steps</p>
                      <p className="text-sm font-medium mt-1">{deckSpecData.steps}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pricing Summary */}
              {(deckSpecData.totalExGst || deckSpecData.totalIncGst) && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Pricing</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {deckSpecData.totalExGst && (
                      <div className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Ex GST</p>
                        <p className="text-sm font-medium mt-1">${Number(deckSpecData.totalExGst).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {deckSpecData.totalIncGst && (
                      <div className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Inc GST</p>
                        <p className="text-sm font-medium mt-1">${Number(deckSpecData.totalIncGst).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {deckSpecData.ratePerM2 && (
                      <div className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Rate / m²</p>
                        <p className="text-sm font-medium mt-1">${Number(deckSpecData.ratePerM2).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Eclipse Spec Tab ────────────────────────────────────────────── */}
        {activeTab === "eclipsespec" && eclipseSpecData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Eclipse Quote Spec (Duplicated from Eclipse Quote)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Client & Project */}
              <div>
                <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Client & Project</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {eclipseSpecData.clientName && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Client Name</p>
                      <p className="text-sm font-medium mt-1">{eclipseSpecData.clientName}</p>
                    </div>
                  )}
                  {eclipseSpecData.projectName && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Project Name</p>
                      <p className="text-sm font-medium mt-1">{eclipseSpecData.projectName}</p>
                    </div>
                  )}
                  {eclipseSpecData.siteAddress && (
                    <div className="border rounded-md p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Site Address</p>
                      <p className="text-sm font-medium mt-1">{eclipseSpecData.siteAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Units */}
              {eclipseSpecData.units && Array.isArray(eclipseSpecData.units) && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
                    Units ({eclipseSpecData.units.length})
                  </h4>
                  <div className="space-y-4">
                    {eclipseSpecData.units.map((unit: any, idx: number) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <h5 className="font-medium text-sm mb-3">Unit {idx + 1}{unit.name ? ` — ${unit.name}` : ""}</h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {unit.bladeWidth && (
                            <div>
                              <p className="text-xs text-muted-foreground">Blade Width</p>
                              <p className="text-sm font-medium">{unit.bladeWidth}mm</p>
                            </div>
                          )}
                          {unit.length && (
                            <div>
                              <p className="text-xs text-muted-foreground">Length</p>
                              <p className="text-sm font-medium">{unit.length}mm</p>
                            </div>
                          )}
                          {unit.height && (
                            <div>
                              <p className="text-xs text-muted-foreground">Height</p>
                              <p className="text-sm font-medium">{unit.height}mm</p>
                            </div>
                          )}
                          {unit.posts && (
                            <div>
                              <p className="text-xs text-muted-foreground">Posts</p>
                              <p className="text-sm font-medium">{unit.posts}</p>
                            </div>
                          )}
                          {unit.mountType && (
                            <div>
                              <p className="text-xs text-muted-foreground">Mount Type</p>
                              <p className="text-sm font-medium">{unit.mountType}</p>
                            </div>
                          )}
                          {unit.bladeColour && (
                            <div>
                              <p className="text-xs text-muted-foreground">Blade Colour</p>
                              <p className="text-sm font-medium">{unit.bladeColour}</p>
                            </div>
                          )}
                          {unit.structureColour && (
                            <div>
                              <p className="text-xs text-muted-foreground">Structure Colour</p>
                              <p className="text-sm font-medium">{unit.structureColour}</p>
                            </div>
                          )}
                          {unit.lights != null && (
                            <div>
                              <p className="text-xs text-muted-foreground">Lights</p>
                              <p className="text-sm font-medium">{unit.lights}</p>
                            </div>
                          )}
                          {unit.downpipes != null && (
                            <div>
                              <p className="text-xs text-muted-foreground">Downpipes</p>
                              <p className="text-sm font-medium">{unit.downpipes}</p>
                            </div>
                          )}
                          {unit.houseWalls && unit.houseWalls.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">House Walls</p>
                              <p className="text-sm font-medium">{unit.houseWalls.join(", ")}</p>
                            </div>
                          )}
                          {unit.fallDirection && (
                            <div>
                              <p className="text-xs text-muted-foreground">Fall Direction</p>
                              <p className="text-sm font-medium">{unit.fallDirection}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing Summary */}
              {(eclipseSpecData.totalExGst || eclipseSpecData.totalIncGst) && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Pricing</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {eclipseSpecData.totalExGst && (
                      <div className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Ex GST</p>
                        <p className="text-sm font-medium mt-1">${Number(eclipseSpecData.totalExGst).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {eclipseSpecData.totalIncGst && (
                      <div className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Inc GST</p>
                        <p className="text-sm font-medium mt-1">${Number(eclipseSpecData.totalIncGst).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {eclipseSpecData.totalM2 && (
                      <div className="border rounded-md p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total m²</p>
                        <p className="text-sm font-medium mt-1">{Number(eclipseSpecData.totalM2).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Costs */}
              {eclipseSpecData.additionalCosts && Array.isArray(eclipseSpecData.additionalCosts) && eclipseSpecData.additionalCosts.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Additional Costs</h4>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="py-2 px-3 text-left font-medium">Description</th>
                          <th className="py-2 px-3 text-right font-medium w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eclipseSpecData.additionalCosts.map((cost: any, idx: number) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="py-2 px-3">{cost.description || cost.label || "-"}</td>
                            <td className="py-2 px-3 text-right font-medium">
                              ${Number(cost.amount || cost.value || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Costing Tab ────────────────────────────────────────────────── */}
        {activeTab === "costing" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Costing Snapshot (from Original Quote)
                <Badge className="bg-red-100 text-red-800 text-xs ml-2">INTERNAL USE ONLY</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!quoteLineItems || quoteLineItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No costing data available for this workbook.</p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(costingByTab).map(([tabName, items]) => (
                    <div key={tabName}>
                      <h4 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">{tabName}</h4>
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="py-2 px-3 text-left font-medium">Description</th>
                              <th className="py-2 px-3 text-right font-medium w-20">Qty</th>
                              <th className="py-2 px-3 text-left font-medium w-20">Unit</th>
                              <th className="py-2 px-3 text-right font-medium w-28">Unit Cost</th>
                              <th className="py-2 px-3 text-right font-medium w-28">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item: any) => (
                              <tr key={item.id} className="border-b last:border-0">
                                <td className="py-2 px-3">{item.description || item.name || "-"}</td>
                                <td className="py-2 px-3 text-right">{item.quantity ?? "-"}</td>
                                <td className="py-2 px-3">{item.unit || item.uom || "-"}</td>
                                <td className="py-2 px-3 text-right font-mono">{item.unitCost != null ? `$${Number(item.unitCost).toFixed(2)}` : "-"}</td>
                                <td className="py-2 px-3 text-right font-mono font-medium">{item.totalCost != null ? `$${Number(item.totalCost).toFixed(2)}` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Components Tab ─────────────────────────────────────────────── */}
        {activeTab === "components" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Components & Quantities
              </CardTitle>
            </CardHeader>
            <CardContent>
              {components.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No components recorded.</p>
              ) : (
                <div className="space-y-4">
                  {components.map((comp, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">{comp.tabName}</h4>
                        <Badge variant={comp.included ? "default" : "secondary"}>
                          {comp.included ? "Included" : "Excluded"}
                        </Badge>
                      </div>
                      {comp.lineItems && Array.isArray(comp.lineItems) && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="py-1 pr-4 text-muted-foreground font-medium">Item</th>
                                <th className="py-1 pr-4 text-muted-foreground font-medium">Qty</th>
                                <th className="py-1 pr-4 text-muted-foreground font-medium">Unit</th>
                                <th className="py-1 text-muted-foreground font-medium">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(comp.lineItems as any[]).map((item: any, i: number) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-1.5 pr-4">{item.description || item.name || item.item || "-"}</td>
                                  <td className="py-1.5 pr-4">{item.qty || item.quantity || "-"}</td>
                                  <td className="py-1.5 pr-4">{item.unit || item.uom || "-"}</td>
                                  <td className="py-1.5 text-muted-foreground">{item.notes || ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Variance Report Tab ────────────────────────────────────────── */}
        {activeTab === "variance" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Variance Report
                  </CardTitle>
                  <Button onClick={() => { setEditingVariance(null); setShowVarianceForm(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Add Variance Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Document differences between the original quote spec and actual site conditions.
                </p>
                {!varianceItems || varianceItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="mx-auto h-10 w-10 mb-2 opacity-40" />
                    <p>No variance items recorded yet.</p>
                    <p className="text-xs mt-1">Click "Add Variance Item" to start documenting differences.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(varianceByTab).map(([tabName, items]) => (
                      <div key={tabName}>
                        <h4 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">{tabName}</h4>
                        <div className="space-y-2">
                          {items.map((item: any) => (
                            <div key={item.id} className={`border rounded-lg p-3 ${item.resolvedAt ? "opacity-60 bg-muted/30" : SEVERITY_COLORS[item.severity]?.replace("text-", "bg-").split(" ")[0] + "/10"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">{item.itemDescription}</span>
                                    <Badge className={`text-xs ${SEVERITY_COLORS[item.severity] || ""}`}>{item.severity}</Badge>
                                    {item.resolvedAt && <Badge variant="outline" className="text-xs text-green-700">Resolved</Badge>}
                                  </div>
                                  <div className="flex gap-4 text-xs text-muted-foreground">
                                    {item.originalQty && <span>Original: {item.originalQty} {item.uom}</span>}
                                    {item.measuredQty && <span>Measured: {item.measuredQty} {item.uom}</span>}
                                    {item.varianceQty && <span className="font-semibold text-foreground">Variance: {item.varianceQty} {item.uom}</span>}
                                  </div>
                                  {item.notes && <p className="text-xs mt-1 text-muted-foreground">{item.notes}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!item.resolvedAt && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => resolveVariance.mutate({ id: item.id })} title="Mark resolved">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingVariance(item); setShowVarianceForm(true); }}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this variance item?")) deleteVariance.mutate({ id: item.id }); }}>
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legacy variance notes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">General Variance Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Additional variance notes..."
                  value={varianceNotes || workbook.varianceNotes || ""}
                  onChange={(e) => setVarianceNotes(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveVariance.mutate({ id: workbook.id, varianceNotes: varianceNotes || workbook.varianceNotes || "" })}
                    disabled={saveVariance.isPending}
                  >
                    Save Notes
                  </Button>
                  {workbook.status !== "approved" && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: workbook.id, status: "approved" })}>
                      Mark as Approved (No Variance)
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Component Orders Tab ───────────────────────────────────────── */}
        {activeTab === "orders" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Component Orders
                </CardTitle>
                <Button variant="brand" onClick={() => { setEditingOrder(null); setShowOrderForm(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> New Order
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!componentOrders || componentOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="mx-auto h-10 w-10 mb-2 opacity-40" />
                  <p>No component orders yet.</p>
                  <p className="text-xs mt-1">Create an order to track material procurement for this job.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {componentOrders.map((order: any) => (
                    <div key={order.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
                            <Badge className={ORDER_STATUS_COLORS[order.status] || ""}>{order.status}</Badge>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            {order.supplier && <span>Supplier: {order.supplier}</span>}
                            {order.totalCost && <span>Total: ${order.totalCost}</span>}
                            <span>By: {order.orderedByName}</span>
                            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          </div>
                          {order.lineItems && Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
                            <div className="mt-2 text-xs">
                              <span className="text-muted-foreground">{order.lineItems.length} line item(s)</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingOrder(order); setShowOrderForm(true); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this order?")) deleteOrder.mutate({ id: order.id }); }}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Work Orders Tab ────────────────────────────────────────────── */}
        {activeTab === "workorders" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Trades Work Orders
                </CardTitle>
                <Button variant="brand" onClick={() => { setEditingWO(null); setShowWOForm(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> New Work Order
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!workOrders || workOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Wrench className="mx-auto h-10 w-10 mb-2 opacity-40" />
                  <p>No work orders yet.</p>
                  <p className="text-xs mt-1">Create work orders for subcontractors and trades.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workOrders.map((wo: any) => (
                    <div key={wo.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{wo.orderNumber}</span>
                            <Badge className={WO_STATUS_COLORS[wo.status] || ""}>{wo.status.replace("_", " ")}</Badge>
                            <Badge className={PRIORITY_COLORS[wo.priority] || ""}>{wo.priority}</Badge>
                            <Badge variant="outline">{wo.tradeType}</Badge>
                          </div>
                          {wo.description && <p className="text-sm text-muted-foreground mt-1">{wo.description}</p>}
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
                            {wo.assignedTo && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{wo.assignedTo}</span>}
                            {wo.assignedPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{wo.assignedPhone}</span>}
                            {wo.assignedEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{wo.assignedEmail}</span>}
                            {wo.scheduledDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(wo.scheduledDate).toLocaleDateString()}</span>}
                            {wo.estimatedCost && <span>Est: ${wo.estimatedCost}</span>}
                            {wo.actualCost && <span>Actual: ${wo.actualCost}</span>}
                          </div>
                          {wo.lineItems && Array.isArray(wo.lineItems) && wo.lineItems.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground">{wo.lineItems.length} task(s)</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingWO(wo); setShowWOForm(true); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this work order?")) deleteWO.mutate({ id: wo.id }); }}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      {showVarianceForm && workbook && (
        <VarianceItemForm
          workbookId={workbook.id}
          item={editingVariance}
          onClose={() => { setShowVarianceForm(false); setEditingVariance(null); }}
          onSuccess={refetchVariance}
        />
      )}
      {showOrderForm && workbook && (
        <ComponentOrderForm
          workbookId={workbook.id}
          order={editingOrder}
          onClose={() => { setShowOrderForm(false); setEditingOrder(null); }}
          onSuccess={refetchOrders}
        />
      )}
      {showWOForm && workbook && (
        <WorkOrderForm
          workbookId={workbook.id}
          jobId={jobId}
          wo={editingWO}
          onClose={() => { setShowWOForm(false); setEditingWO(null); }}
          onSuccess={refetchWOs}
        />
      )}
    </DashboardLayout>
  );
}
