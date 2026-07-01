import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/useMobile";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  FileText, CheckCircle, XCircle, Clock, DollarSign,
  Eye, Brain, Send, AlertTriangle, RotateCw, ChevronRight,
  Search, Filter, ArrowUpDown, Zap, Receipt, Package, Camera, Download,
  CheckCheck, Undo2, Pencil,
} from "lucide-react";
import { PlanAnnotation } from "@/components/PlanAnnotation";
import { logClientDownload } from "@/lib/userActivity";

// ─── Status Badge ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; label: string; icon?: React.ReactNode }> = {
  submitted: { color: "bg-blue-100 text-blue-800 border-blue-200", label: "Submitted", icon: <Clock className="h-3 w-3" /> },
  under_review: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Under Review", icon: <Search className="h-3 w-3" /> },
  pending_approval: { color: "bg-orange-100 text-orange-800 border-orange-200", label: "Pending Approval", icon: <AlertTriangle className="h-3 w-3" /> },
  approved: { color: "bg-green-100 text-green-800 border-green-200", label: "Approved", icon: <CheckCircle className="h-3 w-3" /> },
  paid: { color: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Paid", icon: <DollarSign className="h-3 w-3" /> },
  rejected: { color: "bg-red-100 text-red-800 border-red-200", label: "Rejected", icon: <XCircle className="h-3 w-3" /> },
  extracting: { color: "bg-purple-100 text-purple-800 border-purple-200", label: "Extracting..." },
  extracted: { color: "bg-indigo-100 text-indigo-800 border-indigo-200", label: "Extracted" },
  confirmed: { color: "bg-teal-100 text-teal-800 border-teal-200", label: "Confirmed" },
  failed: { color: "bg-red-100 text-red-800 border-red-200", label: "Failed" },
  draft: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
  pending: { color: "bg-orange-100 text-orange-800 border-orange-200", label: "Pending" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { color: "bg-gray-100 text-gray-800 border-gray-200", label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatCurrency(val: string | number | null | undefined): string {
  const n = typeof val === "string" ? parseFloat(val) : (val || 0);
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function amountNumber(val: string | number | null | undefined): number {
  const parsed = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function approvedLineAmount(line: any): number {
  return line.approvedAmount != null ? amountNumber(line.approvedAmount) : amountNumber(line.amount);
}

function approvedLineGst(line: any): number {
  return line.approvedGstAmount != null ? amountNumber(line.approvedGstAmount) : amountNumber(line.gstAmount);
}

function lineHasAdjustment(line: any): boolean {
  return Math.abs(approvedLineAmount(line) - amountNumber(line.amount)) > 0.005
    || Math.abs(approvedLineGst(line) - amountNumber(line.gstAmount)) > 0.005;
}

function daysSince(date: string | number | Date | null | undefined): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Stats Cards ────────────────────────────────────────────────────────────

function InvoiceStats() {
  const { data: stats, isLoading } = trpc.tradeInvoice.invoiceStats.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }
  if (!stats) return null;

  const cards = [
    { label: "Submitted", value: stats.submitted, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending Approval", value: stats.pendingApproval, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Approved", value: stats.approved, color: "text-green-600", bg: "bg-green-50" },
    { label: "Paid", value: stats.paid, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Rejected", value: stats.rejected, color: "text-red-600", bg: "bg-red-50" },
    { label: "Pending Value", value: formatCurrency(stats.pendingValue), color: "text-slate-900", bg: "bg-slate-50", isAmount: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={`${c.bg} border-0 shadow-sm`}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color} mt-0.5`}>
              {c.isAmount ? c.value : c.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Invoice Row ────────────────────────────────────────────────────────────

function InvoiceRow({ inv, onClick }: { inv: any; onClick: () => void }) {
  const age = daysSince(inv.submittedAt);
  const isUrgent = inv.status === "pending_approval" && age > 3;
  const isNew = inv.status === "submitted" && age < 1;
  const approvedTotal = inv.approvedTotalWithGst != null
    ? amountNumber(inv.approvedTotalWithGst)
    : null;
  const claimedTotal = amountNumber(inv.totalWithGst) || (amountNumber(inv.amount) + amountNumber(inv.gstAmount));

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
        isUrgent ? "border-l-4 border-l-orange-500" : isNew ? "border-l-4 border-l-blue-500" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-lg shrink-0 ${
              inv.status === "pending_approval" ? "bg-orange-100" :
              inv.status === "submitted" ? "bg-blue-100" :
              inv.status === "approved" ? "bg-green-100" :
              inv.status === "paid" ? "bg-emerald-100" :
              "bg-gray-100"
            }`}>
              <FileText className={`h-4 w-4 ${
                inv.status === "pending_approval" ? "text-orange-600" :
                inv.status === "submitted" ? "text-blue-600" :
                inv.status === "approved" ? "text-green-600" :
                inv.status === "paid" ? "text-emerald-600" :
                "text-gray-600"
              }`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {inv.invoiceNumber || `INV-${inv.id}`}
                </span>
                <StatusBadge status={inv.status} />
                {!inv.jobId && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                    Non-client charge
                  </span>
                )}
                {isUrgent && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white">
                    <Zap className="h-2.5 w-2.5" /> {age}d
                  </span>
                )}
                {isNew && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white">
                    NEW
                  </span>
                )}
                {inv.photoCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                    <Camera className="h-2.5 w-2.5" /> {inv.photoCount}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                <span className="font-medium text-foreground">{inv.tradeName || "Unknown Trade"}</span>
                {inv.description && <> &middot; {inv.description}</>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {inv.submittedAt
                  ? `Submitted ${new Date(inv.submittedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
                  : `Created ${new Date(inv.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
                }
                {inv.ocrStatus && <> &middot; OCR: {inv.ocrStatus}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="font-bold text-base">{formatCurrency(approvedTotal ?? claimedTotal)}</p>
              {approvedTotal != null && Math.abs(approvedTotal - claimedTotal) > 0.005 && (
                <p className="text-[10px] text-orange-700">
                  claimed {formatCurrency(claimedTotal)}
                </p>
              )}
              {inv.gstAmount && (
                <p className="text-xs text-muted-foreground">
                  +{formatCurrency(inv.gstAmount)} GST
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApproveLineDialog({
  line,
  pending,
  onCancel,
  onApprove,
}: {
  line: any;
  pending: boolean;
  onCancel: () => void;
  onApprove: (payload: { approvedAmount: string; approvedGstAmount: string; adjustmentReason?: string }) => void;
}) {
  const [approvedAmount, setApprovedAmount] = useState(String(line.approvedAmount ?? line.amount ?? ""));
  const [approvedGstAmount, setApprovedGstAmount] = useState(String(line.approvedGstAmount ?? line.gstAmount ?? "0"));
  const [reason, setReason] = useState(line.approvalAdjustmentReason || "");
  const adjusted = Math.abs(amountNumber(approvedAmount) - amountNumber(line.amount)) > 0.005
    || Math.abs(amountNumber(approvedGstAmount) - amountNumber(line.gstAmount)) > 0.005;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-background p-6 rounded-xl max-w-lg w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Approve Line</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Confirm the approved amount. Add a reason if it differs from the claimed amount.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Label className="text-xs">Claimed amount ex GST</Label>
            <Input value={formatCurrency(line.amount)} disabled className="bg-muted" />
          </div>
          <div>
            <Label className="text-xs">Claimed GST</Label>
            <Input value={formatCurrency(line.gstAmount)} disabled className="bg-muted" />
          </div>
          <div>
            <Label className="text-xs">Approved amount ex GST</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={approvedAmount}
              onChange={(event) => setApprovedAmount(event.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Approved GST</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={approvedGstAmount}
              onChange={(event) => setApprovedGstAmount(event.target.value)}
            />
          </div>
        </div>
        <div className="mb-4">
          <Label className="text-xs">Reason for adjustment{adjusted ? " *" : ""}</Label>
          <Textarea
            placeholder="Explain why the approved amount differs from the claimed amount..."
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={3}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={() => onApprove({
              approvedAmount,
              approvedGstAmount,
              adjustmentReason: reason.trim() || undefined,
            })}
            disabled={pending || !approvedAmount || amountNumber(approvedAmount) < 0 || amountNumber(approvedGstAmount) < 0 || (adjusted && !reason.trim())}
          >
            {pending ? <RotateCw className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
            Approve Line
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditInvoiceLineDialog({
  line,
  jobs,
  milestones,
  pending,
  onCancel,
  onSave,
}: {
  line: any;
  jobs: any[];
  milestones: any[];
  pending: boolean;
  onCancel: () => void;
  onSave: (payload: {
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    gstAmount: string;
    jobId: number | null;
    workOrderId?: number | null;
    milestoneId: number | null;
  }) => void;
}) {
  const [description, setDescription] = useState(line.description || "");
  const [quantity, setQuantity] = useState(String(line.quantity ?? "1"));
  const [unitPrice, setUnitPrice] = useState(String(line.unitPrice ?? ""));
  const [amount, setAmount] = useState(String(line.amount ?? ""));
  const [gstAmount, setGstAmount] = useState(String(line.gstAmount ?? "0"));
  const [jobId, setJobId] = useState(line.jobId ? String(line.jobId) : "none");
  const [milestoneId, setMilestoneId] = useState(line.milestoneId ? String(line.milestoneId) : "none");

  const selectedJobId = jobId !== "none" ? Number(jobId) : null;
  const availableMilestones = selectedJobId
    ? milestones.filter((milestone: any) => milestone.jobId === selectedJobId)
    : [];
  const originalJobId = line.jobId ?? null;
  const nextJobId = selectedJobId;
  const jobChanged = originalJobId !== nextJobId;

  const saveDisabled =
    pending ||
    !description.trim() ||
    amountNumber(quantity) <= 0 ||
    amountNumber(amount) < 0 ||
    amountNumber(gstAmount) < 0 ||
    (unitPrice !== "" && amountNumber(unitPrice) < 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-background p-6 rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
        <h3 className="font-semibold mb-1">Edit Invoice Line</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Update claimed line details before approval.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min="0" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Unit $</Label>
              <Input type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount ex GST</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">GST</Label>
              <Input type="number" min="0" step="0.01" value={gstAmount} onChange={event => setGstAmount(event.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Job</Label>
              <Select value={jobId} onValueChange={(value) => {
                setJobId(value);
                setMilestoneId("none");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map((job: any) => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {job.quoteNumber || `Job #${job.id}`} {job.siteAddress ? `- ${job.siteAddress}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">PO Milestone</Label>
              <Select
                value={milestoneId}
                disabled={!selectedJobId || availableMilestones.length === 0}
                onValueChange={setMilestoneId}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No milestone</SelectItem>
                  {availableMilestones.map((milestone: any) => (
                    <SelectItem key={milestone.id} value={String(milestone.id)}>
                      {milestone.stage || `Milestone #${milestone.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={() => onSave({
              description: description.trim(),
              quantity,
              unitPrice,
              amount,
              gstAmount,
              jobId: nextJobId,
              workOrderId: jobChanged ? null : undefined,
              milestoneId: milestoneId === "none" ? null : Number(milestoneId),
            })}
            disabled={saveDisabled}
          >
            {pending ? <RotateCw className="h-4 w-4 mr-1 animate-spin" /> : <Pencil className="h-4 w-4 mr-1" />}
            Save Line
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Detail Dialog ──────────────────────────────────────────────────

function InvoiceDetailDialog({ invoiceId, open, onClose }: { invoiceId: number; open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.tradeInvoice.getInvoiceDetail.useQuery({ invoiceId }, { enabled: open });

  const extractMutation = trpc.tradeInvoice.extractInvoiceData.useMutation({
    onSuccess: (res) => {
      toast.success(`Extraction complete — ${res.linesCreated} lines extracted (${res.extracted.confidence}% confidence)`);
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(`Extraction failed: ${err.message}`),
  });

  const confirmMutation = trpc.tradeInvoice.confirmExtraction.useMutation({
    onSuccess: () => {
      toast.success("Extraction confirmed — pending supervisor approval");
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
      utils.tradeInvoice.invoiceStats.invalidate();
      utils.tradeInvoice.listInvoices.invalidate();
    },
  });

  const approveMutation = trpc.tradeInvoice.approveInvoiceLine.useMutation({
    onSuccess: (res) => {
      toast.success(res.allApproved ? "All lines approved — invoice approved!" : "Line approval recorded");
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
      utils.tradeInvoice.invoiceStats.invalidate();
      utils.tradeInvoice.listInvoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateLineMutation = trpc.tradeInvoice.updateInvoiceLine.useMutation({
    onSuccess: () => {
      toast.success("Invoice line updated");
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
      utils.tradeInvoice.invoiceStats.invalidate();
      utils.tradeInvoice.listInvoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkApproveMutation = trpc.tradeInvoice.bulkApproveInvoice.useMutation({
    onSuccess: (res) => {
      toast.success(`Invoice approved: ${res.linesApproved} lines approved`);
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
      utils.tradeInvoice.invoiceStats.invalidate();
      utils.tradeInvoice.listInvoices.invalidate();
    },
  });

  const autoMatchMutation = trpc.tradeInvoice.autoMatchInvoiceLines.useMutation({
    onSuccess: (res) => {
      if (res.matchedLines > 0) {
        toast.success(`Matched ${res.matchedLines} of ${res.totalLines} lines to jobs/POs`);
      } else {
        toast.info("No automatic matches found — assign manually");
      }
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const submitForReviewMutation = trpc.tradeInvoice.submitForReview.useMutation({
    onSuccess: () => {
      toast.success("Invoice submitted for supervisor approval");
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
      utils.tradeInvoice.invoiceStats.invalidate();
      utils.tradeInvoice.listInvoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createBillMutation = trpc.tradeInvoice.createXeroBill.useMutation({
    onSuccess: (res) => {
      toast.success(res.linkedExisting
        ? `Existing Xero bill ${res.xeroBillNumber} linked`
        : `Xero bill ${res.xeroBillNumber} created`);
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
      utils.tradeInvoice.listInvoices.invalidate();
    },
    onError: (err) => toast.error(`Xero error: ${err.message}`),
  });

  const markReviewedMutation = trpc.tradeInvoice.markPhotoReviewed.useMutation({
    onSuccess: () => {
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
    },
  });
  const markAllReviewedMutation = trpc.tradeInvoice.markAllPhotosReviewed.useMutation({
    onSuccess: () => {
      toast.success("All photos marked as reviewed");
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
    },
  });
  const unmarkReviewedMutation = trpc.tradeInvoice.unmarkPhotoReviewed.useMutation({
    onSuccess: () => {
      utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
    },
  });

  const [rejectComment, setRejectComment] = useState("");
  const [rejectLineId, setRejectLineId] = useState<number | null>(null);
  const [approvingLine, setApprovingLine] = useState<any | null>(null);
  const [editingLine, setEditingLine] = useState<any | null>(null);
  const [annotatePhoto, setAnnotatePhoto] = useState<{ url: string; id: number; caption?: string } | null>(null);

  if (!open) return null;

  const pendingLines = data?.lines.filter(l => l.approvalStatus === "pending").length || 0;
  const approvedLines = data?.lines.filter(l => l.approvalStatus === "approved").length || 0;
  const totalLines = data?.lines.length || 0;
  const claimedExGst = data?.lines.reduce((sum, line) => sum + amountNumber(line.amount), 0) || amountNumber(data?.invoice?.amount);
  const claimedGst = data?.lines.reduce((sum, line) => sum + amountNumber(line.gstAmount), 0) || amountNumber(data?.invoice?.gstAmount);
  const approvedExGst = data?.invoice?.approvedAmount != null
    ? amountNumber(data.invoice.approvedAmount)
    : (data?.lines.reduce((sum, line) => sum + approvedLineAmount(line), 0) || claimedExGst);
  const approvedGst = data?.invoice?.approvedGstAmount != null
    ? amountNumber(data.invoice.approvedGstAmount)
    : (data?.lines.reduce((sum, line) => sum + approvedLineGst(line), 0) || claimedGst);
  const invoiceAdjusted = Math.abs(approvedExGst - claimedExGst) > 0.005 || Math.abs(approvedGst - claimedGst) > 0.005;

  return (<>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[96vw] max-w-[96vw] xl:max-w-7xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoice {data?.invoice?.invoiceNumber || `#${invoiceId}`}
            {data?.invoice && <StatusBadge status={data.invoice.status} />}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* ── Invoice Header ── */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-muted/50 rounded-xl">
              <div>
                <p className="text-xs text-muted-foreground">Trade</p>
                <p className="font-semibold">{data.trade?.name || "Unknown"}</p>
                {data.trade?.email && <p className="text-xs text-muted-foreground">{data.trade.email}</p>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invoice Date</p>
                <p className="font-medium">
                  {data.invoice.invoiceDate
                    ? new Date(data.invoice.invoiceDate).toLocaleDateString("en-AU")
                    : "—"
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claimed ex GST</p>
                <p className="font-semibold">{formatCurrency(data.invoice.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claimed GST</p>
                <p className="font-medium">{formatCurrency(data.invoice.gstAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claimed inc GST</p>
                <p className="font-bold text-lg">{formatCurrency(data.invoice.totalWithGst)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved inc GST</p>
                <p className={`font-bold text-lg ${invoiceAdjusted ? "text-orange-700" : "text-green-700"}`}>
                  {formatCurrency(approvedExGst + approvedGst)}
                </p>
                {invoiceAdjusted && data.invoice.approvalAdjustmentReason && (
                  <p className="text-[10px] text-orange-700 truncate">{data.invoice.approvalAdjustmentReason}</p>
                )}
              </div>
            </div>

            {/* ── Document Link ── */}
            {data.invoice.fileUrl && (
              <a href={data.invoice.fileUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline p-2 rounded-lg hover:bg-blue-50 transition-colors">
                <Eye className="h-4 w-4" /> View uploaded invoice document
              </a>
            )}

            {/* ── AI Extraction Section ── */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-600" /> AI Extraction
                  {data.invoice.ocrStatus && <StatusBadge status={data.invoice.ocrStatus} />}
                  {data.invoice.ocrConfidence != null && (
                    <Badge variant="outline" className="text-xs ml-1">
                      {data.invoice.ocrConfidence}% confidence
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex flex-wrap gap-2">
                  {(!data.invoice.ocrStatus || data.invoice.ocrStatus === "failed") && (
                    <Button size="sm" onClick={() => extractMutation.mutate({ invoiceId })}
                      disabled={extractMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                      <Brain className="h-4 w-4 mr-1" />
                      {extractMutation.isPending ? "Extracting..." : "Run AI Extraction"}
                    </Button>
                  )}
                  {data.invoice.ocrStatus === "extracted" && (
                    <>
                      <Button size="sm" onClick={() => confirmMutation.mutate({ invoiceId })}
                        disabled={confirmMutation.isPending}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Confirm Extraction
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => extractMutation.mutate({ invoiceId })}
                        disabled={extractMutation.isPending}>
                        <RotateCw className="h-4 w-4 mr-1" /> Re-extract
                      </Button>
                    </>
                  )}
                  {data.invoice.ocrStatus === "extracting" && (
                    <div className="flex items-center gap-2 text-sm text-purple-600">
                      <RotateCw className="h-4 w-4 animate-spin" /> Extraction in progress...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Action Bar ── */}
            {(data.invoice.status === "submitted" || data.invoice.status === "draft") && data.lines.length > 0 && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-medium text-blue-900 text-sm">Ready for review</p>
                    <p className="text-xs text-blue-700">{totalLines} lines extracted. Auto-match to jobs, then submit for supervisor approval.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => autoMatchMutation.mutate({ invoiceId })}
                    disabled={autoMatchMutation.isPending}>
                    <Zap className="h-4 w-4 mr-1" />
                    {autoMatchMutation.isPending ? "Matching..." : "Auto-Match"}
                  </Button>
                  <Button size="sm" onClick={() => submitForReviewMutation.mutate({ invoiceId })}
                    disabled={submitForReviewMutation.isPending}>
                    <Send className="h-4 w-4 mr-1" />
                    {submitForReviewMutation.isPending ? "Submitting..." : "Submit for Approval"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Invoice Lines ── */}
            {data.lines.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Invoice Lines ({totalLines})
                      {totalLines > 0 && (
                        <span className="text-xs text-muted-foreground font-normal">
                          {approvedLines}/{totalLines} approved
                        </span>
                      )}
                    </div>
                    {data.invoice.status === "pending_approval" && pendingLines > 0 && (
                      <Button size="sm" onClick={() => bulkApproveMutation.mutate({ invoiceId })}
                        disabled={bulkApproveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve All at Claimed ({pendingLines})
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  {/* Progress bar */}
                  {totalLines > 0 && (
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mb-3 overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${(approvedLines / totalLines) * 100}%` }}
                      />
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="p-2 w-8">#</th>
                          <th className="p-2">Description</th>
                          <th className="p-2">Job / PO</th>
                          <th className="p-2 text-right">Qty</th>
                          <th className="p-2 text-right">Unit $</th>
                          <th className="p-2 text-right">Claimed</th>
                          <th className="p-2 text-right">Approved</th>
                          <th className="p-2 text-right">GST</th>
                          <th className="p-2">Status</th>
                          <th className="p-2 w-36">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lines.map((line) => {
                          const adjusted = lineHasAdjustment(line);
                          const canEditLine = ["draft", "submitted", "under_review", "pending_approval"].includes(data.invoice.status)
                            && line.approvalStatus === "pending";
                          return (
                            <tr key={line.id} className={`border-b hover:bg-muted/30 ${
                              line.approvalStatus === "rejected" ? "bg-red-50/50" :
                              line.approvalStatus === "approved" ? "bg-green-50/30" : ""
                            }`}>
                              <td className="p-2 text-muted-foreground">{line.lineNumber}</td>
                              <td className="p-2 max-w-[220px]">
                                <p className="truncate font-medium">{line.description || "—"}</p>
                                {line.approvalAdjustmentReason && (
                                  <p className="text-[10px] text-orange-700 truncate">{line.approvalAdjustmentReason}</p>
                                )}
                              </td>
                              <td className="p-2 text-xs text-muted-foreground">
                                {line.jobId ? `Job #${line.jobId}` : "Non-client charge"}
                                {line.workOrderId && ` / WO #${line.workOrderId}`}
                              </td>
                              <td className="p-2 text-right">{line.quantity || "—"}</td>
                              <td className="p-2 text-right">{line.unitPrice ? formatCurrency(line.unitPrice) : "—"}</td>
                              <td className="p-2 text-right font-medium">{formatCurrency(line.amount)}</td>
                              <td className={`p-2 text-right font-medium ${adjusted ? "text-orange-700" : "text-green-700"}`}>
                                {line.approvedAmount != null ? formatCurrency(line.approvedAmount) : "—"}
                              </td>
                              <td className="p-2 text-right">
                                {formatCurrency(line.gstAmount)}
                                {line.approvedGstAmount != null && Math.abs(amountNumber(line.approvedGstAmount) - amountNumber(line.gstAmount)) > 0.005 && (
                                  <span className="block text-[10px] text-orange-700">approved {formatCurrency(line.approvedGstAmount)}</span>
                                )}
                              </td>
                              <td className="p-2"><StatusBadge status={line.approvalStatus || "pending"} /></td>
                              <td className="p-2">
                                {(canEditLine || (line.approvalStatus === "pending" && data.invoice.status === "pending_approval")) && (
                                  <div className="flex flex-wrap gap-1">
                                    {canEditLine && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                        onClick={() => setEditingLine(line)}
                                        disabled={updateLineMutation.isPending}>
                                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                                      </Button>
                                    )}
                                    {line.approvalStatus === "pending" && data.invoice.status === "pending_approval" && (
                                      <>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:bg-green-100"
                                      onClick={() => setApprovingLine(line)}
                                      disabled={approveMutation.isPending}>
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-100"
                                      onClick={() => setRejectLineId(line.id)}>
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-semibold">
                          <td colSpan={5} className="p-2 text-right">Total</td>
                          <td className="p-2 text-right">{formatCurrency(claimedExGst)}</td>
                          <td className={`p-2 text-right ${invoiceAdjusted ? "text-orange-700" : "text-green-700"}`}>{formatCurrency(approvedExGst)}</td>
                          <td className="p-2 text-right">
                            {formatCurrency(claimedGst)}
                            {invoiceAdjusted && <span className="block text-[10px] text-orange-700">approved {formatCurrency(approvedGst)}</span>}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Xero Bill Creation ── */}
            {data.invoice.status === "approved" && !data.invoice.xeroBillId && (
              <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-blue-900">Ready to create Xero bill</p>
                    <p className="text-sm text-blue-700">Push this approved invoice to Xero as a bill for payment processing.</p>
                  </div>
                  <Button onClick={() => createBillMutation.mutate({ invoiceId })}
                    disabled={createBillMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                    <Send className="h-4 w-4 mr-1" />
                    {createBillMutation.isPending ? "Creating..." : "Create Xero Bill"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {data.invoice.xeroBillId && (
              <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
                <CardContent className="py-4 flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-900">Xero Bill Created</p>
                    <p className="text-sm text-green-700">
                      Bill #{data.invoice.xeroBillNumber || data.invoice.xeroBillId} has been created in Xero.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Proof-of-Work Photos ── */}
            {data.photos && data.photos.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Camera className="h-4 w-4 text-emerald-600" /> Proof of Work Photos ({data.photos.length})
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={async () => {
                        toast.info("Preparing download...");
                        try {
                          const JSZip = (await import("jszip")).default;
                          const zip = new JSZip();
                          const folder = zip.folder("proof-of-work-photos")!;
                          await Promise.all(
                            data.photos.map(async (photo: any, idx: number) => {
                              try {
                                const resp = await fetch(photo.photoUrl);
                                const blob = await resp.blob();
                                const ext = photo.photoUrl.split(".").pop()?.split("?")[0] || "jpg";
                                const stagePart = photo.stage ? `_${photo.stage}` : "";
                                folder.file(`photo_${idx + 1}${stagePart}.${ext}`, blob);
                              } catch { /* skip failed downloads */ }
                            })
                          );
                          const content = await zip.generateAsync({ type: "blob" });
                          const url = URL.createObjectURL(content);
                          const a = document.createElement("a");
                          const filename = `invoice-${data.invoice.invoiceNumber || invoiceId}-photos.zip`;
                          a.href = url;
                          a.download = filename;
                          a.click();
                          URL.revokeObjectURL(url);
                          logClientDownload({
                            filename,
                            source: "invoice_review_photo_zip",
                            entityType: "trade_invoice",
                            entityId: invoiceId,
                            mimeType: "application/zip",
                            metadata: { photoCount: data.photos.length },
                          });
                          toast.success("Photos downloaded");
                        } catch (err) {
                          toast.error("Failed to download photos");
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5" /> Download All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">
                      {data.photos.filter((p: any) => p.reviewedAt).length} of {data.photos.length} reviewed
                    </span>
                    {data.photos.some((p: any) => !p.reviewedAt) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] gap-1 px-2"
                        onClick={() => {
                          markAllReviewedMutation.mutate({ invoiceId });
                        }}
                        disabled={markAllReviewedMutation.isPending}
                      >
                        <CheckCheck className="h-3 w-3" /> Mark All Reviewed
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {data.photos.map((photo: any) => (
                      <div key={photo.id} className="relative group rounded-lg overflow-hidden border aspect-square hover:shadow-md transition-shadow">
                        <a href={photo.photoUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                          <img src={photo.photoUrl} alt={photo.caption || "Proof photo"}
                            className="w-full h-full object-cover" />
                        </a>
                        {photo.stage && (
                          <span className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            photo.stage === "before" ? "bg-amber-500 text-white" :
                            photo.stage === "after" ? "bg-green-500 text-white" :
                            "bg-gray-500 text-white"
                          }`}>{photo.stage}</span>
                        )}
                        {/* Reviewed indicator */}
                        {photo.reviewedAt ? (
                          <button
                            onClick={() => unmarkReviewedMutation.mutate({ photoId: photo.id })}
                            className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5 hover:bg-green-600"
                            title={`Reviewed by ${photo.reviewedBy || 'Admin'} on ${new Date(photo.reviewedAt).toLocaleDateString()}`}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => markReviewedMutation.mutate({ photoId: photo.id })}
                            className="absolute top-1 right-1 bg-black/40 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-primary"
                            title="Mark as reviewed"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Annotate button */}
                        <button
                          onClick={() => setAnnotatePhoto({ url: photo.photoUrl, id: photo.id, caption: photo.caption })}
                          className="absolute bottom-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-blue-600"
                          title="Annotate photo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {photo.caption && (
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-white text-[10px] truncate">{photo.caption}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Approval History ── */}
            {data.approvals.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4" /> Approval History ({data.approvals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-0 pb-3">
                  <div className="space-y-1.5">
                    {data.approvals.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/30">
                        {a.action === "approved" && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
                        {a.action === "rejected" && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                        {a.action === "returned" && <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />}
                        <span className="font-medium">{a.supervisorName || "Admin"}</span>
                        <StatusBadge status={a.action} />
                        {a.lineId && <span className="text-xs text-muted-foreground">Line #{a.lineId}</span>}
                        {a.comments && (
                          <span className="text-xs italic text-muted-foreground max-w-[200px] truncate">
                            &ldquo;{a.comments}&rdquo;
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                          {new Date(a.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}

        {/* ── Reject Line Dialog ── */}
        {rejectLineId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setRejectLineId(null)}>
            <div className="bg-background p-6 rounded-xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold mb-1">Reject Line</h3>
              <p className="text-sm text-muted-foreground mb-3">Provide a reason for rejecting this line item.</p>
              <Textarea placeholder="Reason for rejection..." value={rejectComment}
                onChange={e => setRejectComment(e.target.value)} className="mb-4" rows={3} />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setRejectLineId(null); setRejectComment(""); }}>Cancel</Button>
                <Button variant="destructive" onClick={() => {
                  approveMutation.mutate({ lineId: rejectLineId, action: "rejected", comments: rejectComment });
                  setRejectLineId(null);
                  setRejectComment("");
                }} disabled={!rejectComment.trim()}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject Line
                </Button>
              </div>
            </div>
          </div>
        )}
        {approvingLine && (
          <ApproveLineDialog
            line={approvingLine}
            pending={approveMutation.isPending}
            onCancel={() => setApprovingLine(null)}
            onApprove={(payload) => {
              approveMutation.mutate({
                lineId: approvingLine.id,
                action: "approved",
                approvedAmount: payload.approvedAmount,
                approvedGstAmount: payload.approvedGstAmount,
                adjustmentReason: payload.adjustmentReason,
              }, {
                onSettled: () => setApprovingLine(null),
              });
            }}
          />
        )}
        {editingLine && data && (
          <EditInvoiceLineDialog
            line={editingLine}
            jobs={data.jobs || []}
            milestones={data.milestones || []}
            pending={updateLineMutation.isPending}
            onCancel={() => setEditingLine(null)}
            onSave={(payload) => {
              updateLineMutation.mutate({
                lineId: editingLine.id,
                description: payload.description,
                quantity: payload.quantity,
                unitPrice: payload.unitPrice || undefined,
                amount: payload.amount,
                gstAmount: payload.gstAmount,
                jobId: payload.jobId,
                workOrderId: payload.workOrderId,
                milestoneId: payload.milestoneId,
              }, {
                onSettled: () => setEditingLine(null),
              });
            }}
          />
        )}
      </DialogContent>
    </Dialog>

    {/* Photo Annotation Dialog */}
    {annotatePhoto && (
      <PlanAnnotation
        open={!!annotatePhoto}
        onClose={() => setAnnotatePhoto(null)}
        imageUrl={annotatePhoto.url}
        planTitle={annotatePhoto.caption || `Invoice Photo #${annotatePhoto.id}`}
        onSave={async (base64) => {
          try {
            // Upload annotated image via the trade portal photo upload endpoint
            const response = await fetch("/api/trpc/tradePortal.uploadInvoicePhoto", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                invoiceId,
                photoData: `data:image/png;base64,${base64}`,
                fileName: `annotated-${annotatePhoto.id}.png`,
                caption: `Annotated: ${annotatePhoto.caption || 'photo'}`,
                stage: "after",
              }),
            });
            if (response.ok) {
              toast.success("Annotated photo saved");
              utils.tradeInvoice.getInvoiceDetail.invalidate({ invoiceId });
            }
          } catch {
            // Annotation was downloaded locally via the PlanAnnotation component
            toast.success("Annotated photo downloaded locally");
          }
        }}
      />
    )}
  </>);
}

// ─── Tab Content ────────────────────────────────────────────────────────────

type TabStatus = "all" | "submitted" | "pending_approval" | "approved" | "paid" | "rejected";

function InvoiceList({ status }: { status: TabStatus }) {
  const { data, isLoading } = trpc.tradeInvoice.listInvoices.useQuery({ status, limit: 100 });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2 mt-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (!data?.invoices.length) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            No invoices{status !== "all" ? ` with status "${STATUS_CONFIG[status]?.label || status}"` : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2 mt-4">
        <p className="text-xs text-muted-foreground">{data.total} invoice{data.total !== 1 ? "s" : ""}</p>
        {data.invoices.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} onClick={() => setSelectedId(inv.id)} />
        ))}
      </div>
      {selectedId && (
        <InvoiceDetailDialog
          invoiceId={selectedId}
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const INVOICE_TABS = ["pending_approval", "submitted", "approved", "paid", "rejected", "all"] as const;

const TAB_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  pending_approval: { label: "Pending", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  submitted: { label: "Submitted", icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: "Approved", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  paid: { label: "Paid", icon: <DollarSign className="h-3.5 w-3.5" /> },
  rejected: { label: "Rejected", icon: <XCircle className="h-3.5 w-3.5" /> },
  all: { label: "All", icon: <Filter className="h-3.5 w-3.5" /> },
};

export default function AdminInvoiceReview() {
  const isMobile = useIsMobile();
  const { data: stats } = trpc.tradeInvoice.invoiceStats.useQuery();
  const [activeTab, setActiveTab] = useState("pending_approval");
  const swipeRef = useSwipeTabs({
    tabs: INVOICE_TABS as unknown as string[],
    activeTab,
    onTabChange: setActiveTab,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Invoice Review</h2>
        <p className="text-muted-foreground">Review, approve, and process trade invoices</p>
      </div>

      {/* Stats */}
      <InvoiceStats />

      {/* Tabs — dropdown on mobile, tab strip on desktop */}
      <div ref={swipeRef}>
      {isMobile ? (
        <>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue>
                <span className="flex items-center gap-2">
                  {TAB_LABELS[activeTab]?.icon}
                  {TAB_LABELS[activeTab]?.label}
                  {activeTab === "pending_approval" && stats && stats.pendingApproval > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{stats.pendingApproval}</Badge>
                  )}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {INVOICE_TABS.map((tab) => (
                <SelectItem key={tab} value={tab}>
                  <span className="flex items-center gap-2">
                    {TAB_LABELS[tab]?.icon}
                    {TAB_LABELS[tab]?.label}
                    {tab === "pending_approval" && stats && stats.pendingApproval > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{stats.pendingApproval}</Badge>
                    )}
                    {tab === "submitted" && stats && stats.submitted > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">{stats.submitted}</Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-4">
            <InvoiceList status={activeTab as TabStatus} />
          </div>
        </>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="pending_approval" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Pending
              {stats && stats.pendingApproval > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                  {stats.pendingApproval}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="submitted" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Submitted
              {stats && stats.submitted > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                  {stats.submitted}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />
              Approved
            </TabsTrigger>
            <TabsTrigger value="paid" className="gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Paid
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Rejected
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending_approval"><InvoiceList status="pending_approval" /></TabsContent>
          <TabsContent value="submitted"><InvoiceList status="submitted" /></TabsContent>
          <TabsContent value="approved"><InvoiceList status="approved" /></TabsContent>
          <TabsContent value="paid"><InvoiceList status="paid" /></TabsContent>
          <TabsContent value="rejected"><InvoiceList status="rejected" /></TabsContent>
          <TabsContent value="all"><InvoiceList status="all" /></TabsContent>
        </Tabs>
      )}
      </div>
    </div>
  );
}
