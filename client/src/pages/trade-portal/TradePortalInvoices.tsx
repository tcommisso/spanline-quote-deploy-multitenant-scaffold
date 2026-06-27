import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FileUp, Plus, Loader2, Eye, FileText, DollarSign, CheckCircle,
  Clock, AlertCircle, Brain, ChevronRight, Upload, XCircle,
  Camera, Image, X, Trash2,
} from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-primary/10 text-primary",
  pending_approval: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  paid: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  submitted: <Clock className="w-3 h-3" />,
  under_review: <Eye className="w-3 h-3" />,
  pending_approval: <AlertCircle className="w-3 h-3" />,
  approved: <CheckCircle className="w-3 h-3" />,
  paid: <DollarSign className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
};

type SubmitStep = "upload" | "ai_review" | "confirm";

type ClaimItem = {
  id: string;
  jobId: string;
  workOrderId: string;
  milestoneId: string;
  subcontractKey: string;
  description: string;
  amount: string;
  gstAmount: string;
};

function createClaimItem(): ClaimItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    jobId: "",
    workOrderId: "",
    milestoneId: "",
    subcontractKey: "",
    description: "",
    amount: "",
    gstAmount: "",
  };
}

function amountNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyString(value: number): string {
  return value.toFixed(2);
}

export default function TradePortalInvoices() {
  const { data: invoices, isLoading, refetch } = trpc.tradePortal.getInvoices.useQuery();
  const { data: jobs } = trpc.tradePortal.getActiveJobs.useQuery();
  const { data: workOrders } = trpc.tradePortal.getWorkOrders.useQuery();
  const { data: claimOptions } = trpc.tradePortal.getInvoiceClaimOptions.useQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<SubmitStep>("upload");

  // Form state
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [description, setDescription] = useState("");
  const [claimItems, setClaimItems] = useState<ClaimItem[]>([createClaimItem()]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [aiData, setAiData] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submitMutation = trpc.tradePortal.submitInvoiceWithMilestone.useMutation({
    onSuccess: () => {
      toast.success("Invoice submitted successfully! It will be reviewed shortly.");
      refetch();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  // AI extraction mutation (uses the admin endpoint but we'll call it after submission)
  const extractMutation = trpc.tradeInvoice.extractInvoiceData.useMutation({
    onSuccess: (res) => {
      setAiData(res.extracted);
      // Pre-fill form with AI data
      if (res.extracted.invoiceNumber) setInvoiceNumber(res.extracted.invoiceNumber);
      if (res.extracted.subtotal) setAmount(String(res.extracted.subtotal));
      if (res.extracted.gst) setGstAmount(String(res.extracted.gst));
      setExtracting(false);
      setStep("ai_review");
      toast.success("AI extraction complete! Please review the details.");
    },
    onError: () => {
      setExtracting(false);
      // Continue without AI data
      setStep("confirm");
      toast.info("AI extraction unavailable. Please fill in details manually.");
    },
  });

  function resetForm() {
    setDialogOpen(false);
    setStep("upload");
    setInvoiceNumber("");
    setAmount("");
    setGstAmount("");
    setDescription("");
    setClaimItems([createClaimItem()]);
    setFile(null);
    setAiData(null);
    setExtracting(false);
  }

  async function handleFileUpload() {
    if (!file) {
      toast.error("Please attach an invoice file");
      return;
    }

    // Move to confirm step (AI extraction happens server-side after submission)
    setStep("confirm");
  }

  async function handleSubmit() {
    const validItems = claimItems.filter((item) => item.jobId && amountNumber(item.amount) > 0);
    if (!invoiceNumber || validItems.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (validItems.length !== claimItems.length) {
      toast.error("Each claim item needs a job and claimed amount");
      return;
    }

    if (!file) {
      toast.error("Please attach an invoice file");
      return;
    }

    const subtotal = validItems.reduce((sum, item) => sum + amountNumber(item.amount), 0);
    const gstTotal = validItems.reduce((sum, item) => sum + amountNumber(item.gstAmount), 0);

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        submitMutation.mutate({
          invoiceNumber,
          amount: moneyString(subtotal),
          gstAmount: moneyString(gstTotal),
          description: description || undefined,
          items: validItems.map((item) => {
            const [subcontractId, subcontractMilestoneIndex] = item.subcontractKey ? item.subcontractKey.split(":") : [];
            return {
              description: item.description || undefined,
              amount: moneyString(amountNumber(item.amount)),
              gstAmount: moneyString(amountNumber(item.gstAmount)),
              jobId: parseInt(item.jobId),
              workOrderId: item.workOrderId ? parseInt(item.workOrderId) : undefined,
              milestoneId: item.milestoneId ? parseInt(item.milestoneId) : undefined,
              subcontractId: subcontractId ? parseInt(subcontractId) : undefined,
              subcontractMilestoneIndex: subcontractMilestoneIndex !== undefined ? parseInt(subcontractMilestoneIndex) : undefined,
            };
          }),
          fileBase64: base64,
          fileName: file.name,
          fileMimeType: file.type || "application/octet-stream",
        });
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Failed to process file");
    } finally {
      setUploading(false);
    }
  }

  const claimSubtotal = claimItems.reduce((sum, item) => sum + amountNumber(item.amount), 0);
  const claimGstTotal = claimItems.reduce((sum, item) => sum + amountNumber(item.gstAmount), 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  // Group invoices by status
  const pending = invoices?.filter((i) => ["submitted", "under_review", "pending_approval"].includes(i.status)) || [];
  const completed = invoices?.filter((i) => ["approved", "paid"].includes(i.status)) || [];
  const rejected = invoices?.filter((i) => i.status === "rejected") || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Invoices & Claims</h1>
          <p className="text-sm text-muted-foreground">Submit invoices and track progress claims</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground self-start sm:self-auto">
          <Plus className="w-4 h-4 mr-1" /> Submit Invoice
        </Button>
      </div>

      {/* Summary Cards */}
      {invoices && invoices.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{pending.length}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{completed.length}</div>
              <div className="text-xs text-muted-foreground">Approved/Paid</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{rejected.length}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-slate-800">
                ${invoices.reduce((s, i) => s + parseFloat(i.amount || "0"), 0).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-muted-foreground">Total Submitted</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Work Orders & Milestones Section */}
      {workOrders && workOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Your Work Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {workOrders.slice(0, 5).map((wo: any) => (
                <div key={wo.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{wo.orderNumber || `WO-${wo.id}`}</p>
                    <p className="text-xs text-muted-foreground">{wo.tradeType} — {wo.description?.slice(0, 60)}</p>
                  </div>
                  <Badge className={`text-[10px] ${wo.status === "completed" ? "bg-green-100 text-green-800" : wo.status === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}>
                    {wo.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subcontract Milestones Summary */}
      <SubcontractMilestonesSummary jobs={jobs} />

      {/* Invoice List */}
      {invoices && invoices.length > 0 ? (
        <div className="space-y-3">
          {pending.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">In Progress</h3>
              {pending.map((inv) => <InvoiceCard key={inv.id} invoice={inv} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-4">Completed</h3>
              {completed.map((inv) => <InvoiceCard key={inv.id} invoice={inv} />)}
            </div>
          )}
          {rejected.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-4">Rejected</h3>
              {rejected.map((inv) => <InvoiceCard key={inv.id} invoice={inv} />)}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No invoices submitted yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
              Submit your first invoice
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Submit Invoice Dialog - Multi-step */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
        <DialogContent className="w-[94vw] max-w-[94vw] lg:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-primary" />
              Submit Invoice
              {step !== "upload" && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {step === "ai_review" ? "AI Review" : "Confirm & Submit"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span className={step === "upload" ? "text-primary font-medium" : "text-green-600"}>
              1. Upload
            </span>
            <ChevronRight className="w-3 h-3" />
            <span className={step === "ai_review" ? "text-primary font-medium" : step === "confirm" ? "text-green-600" : ""}>
              2. Review
            </span>
            <ChevronRight className="w-3 h-3" />
            <span className={step === "confirm" ? "text-primary font-medium" : ""}>
              3. Submit
            </span>
          </div>

          {step === "upload" && (
            <div className="space-y-4">
              <div>
                <Label>Attach Invoice (PDF/Image) *</Label>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <Input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="invoice-file"
                  />
                  <label htmlFor="invoice-file" className="cursor-pointer">
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium">{file.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {(file.size / 1024 / 1024).toFixed(1)} MB
                        </Badge>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload or drag & drop</p>
                        <p className="text-[11px] text-muted-foreground mt-1">PDF, JPG, or PNG up to 10MB</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleFileUpload} disabled={!file} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <ChevronRight className="w-4 h-4 mr-1" /> Continue
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "ai_review" && aiData && (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                <Brain className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-green-800">AI Extraction Complete</p>
                  <p className="text-green-700 text-xs mt-0.5">
                    Confidence: {aiData.confidence}% — Please review and correct any errors
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Invoice Number</Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                <div>
                  <Label>Amount (ex GST)</Label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div>
                  <Label>GST</Label>
                  <Input type="number" step="0.01" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} />
                </div>
                <div>
                  <Label>Total (inc GST)</Label>
                  <Input
                    value={(parseFloat(amount || "0") + parseFloat(gstAmount || "0")).toFixed(2)}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              {aiData.lines && aiData.lines.length > 0 && (
                <div>
                  <Label className="mb-2 block">Extracted Line Items ({aiData.lines.length})</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-right">Qty</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiData.lines.map((line: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{line.description}</td>
                            <td className="p-2 text-right">{line.quantity}</td>
                            <td className="p-2 text-right">${line.amount?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <Label>Description / Notes</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any additional notes..." rows={2} />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
                <Button onClick={() => setStep("confirm")} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Confirm & Submit
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              {!aiData && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-medium text-blue-800">Manual Entry</p>
                  <p className="text-blue-700 text-xs mt-0.5">
                    Fill in the invoice details below. AI extraction will be performed after submission.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Invoice Number *</Label>
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g., INV-001" />
                </div>
                <div>
                  <Label>Claim total (inc GST)</Label>
                  <Input
                    value={`$${(claimSubtotal + claimGstTotal).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <ClaimItemsEditor
                items={claimItems}
                options={claimOptions}
                onChange={setClaimItems}
              />

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Claimed ex GST</p>
                  <p className="font-semibold">${claimSubtotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">GST</p>
                  <p className="font-semibold">${claimGstTotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold">${(claimSubtotal + claimGstTotal).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of work completed" rows={2} />
              </div>

              {file && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="truncate">{file.name}</span>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setStep(aiData ? "ai_review" : "upload")}>Back</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={uploading || submitMutation.isPending || !invoiceNumber || claimSubtotal <= 0}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {uploading || submitMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-1" /> Submit Invoice</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClaimItemsEditor({
  items,
  options,
  onChange,
}: {
  items: ClaimItem[];
  options: any;
  onChange: (items: ClaimItem[]) => void;
}) {
  const jobs = options?.jobs || [];
  const workOrders = options?.workOrders || [];
  const poMilestones = options?.poMilestones || [];
  const subcontractMilestones = options?.subcontractMilestones || [];

  const updateItem = (id: string, updates: Partial<ClaimItem>) => {
    onChange(items.map((item) => item.id === id ? { ...item, ...updates } : item));
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    onChange(items.filter((item) => item.id !== id));
  };

  const addItem = () => onChange([...items, createClaimItem()]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Invoice Claim Items *</Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="w-4 h-4 mr-1" /> Add Item
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const jobId = item.jobId ? parseInt(item.jobId) : null;
          const workOrderOptions = jobId ? workOrders.filter((wo: any) => wo.jobId === jobId) : [];
          const milestoneOptions = item.workOrderId
            ? poMilestones.filter((milestone: any) => milestone.workOrderId === parseInt(item.workOrderId) && milestone.status === "pending")
            : [];
          const subcontractOptions = jobId
            ? subcontractMilestones.filter((milestone: any) => milestone.jobId === jobId && !milestone.claimed)
            : [];

          return (
            <div key={item.id} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Item {index + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  disabled={items.length === 1}
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Remove
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Job *</Label>
                  <Select
                    value={item.jobId}
                    onValueChange={(value) => updateItem(item.id, {
                      jobId: value,
                      workOrderId: "",
                      milestoneId: "",
                      subcontractKey: "",
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select a job" /></SelectTrigger>
                    <SelectContent>
                      {jobs.map((job: any) => (
                        <SelectItem key={job.jobId} value={job.jobId.toString()}>
                          {job.quoteNumber} — {job.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Work Order</Label>
                  <Select
                    value={item.workOrderId || "none"}
                    disabled={!item.jobId || workOrderOptions.length === 0}
                    onValueChange={(value) => updateItem(item.id, {
                      workOrderId: value === "none" ? "" : value,
                      milestoneId: "",
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="No work order" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No work order</SelectItem>
                      {workOrderOptions.map((wo: any) => (
                        <SelectItem key={wo.id} value={wo.id.toString()}>
                          {wo.orderNumber || `WO-${wo.id}`} — {wo.tradeType || "work order"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">PO Milestone</Label>
                  <Select
                    value={item.milestoneId || "none"}
                    disabled={!item.workOrderId || milestoneOptions.length === 0}
                    onValueChange={(value) => {
                      if (value === "none") {
                        updateItem(item.id, { milestoneId: "" });
                        return;
                      }
                      const milestone = poMilestones.find((candidate: any) => candidate.id === parseInt(value));
                      updateItem(item.id, {
                        milestoneId: value,
                        amount: item.amount || moneyString(amountNumber(milestone?.amount)),
                        gstAmount: item.gstAmount || moneyString(amountNumber(milestone?.amount) * 0.1),
                        description: item.description || milestone?.stage || "",
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="No PO milestone" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No PO milestone</SelectItem>
                      {milestoneOptions.map((milestone: any) => (
                        <SelectItem key={milestone.id} value={milestone.id.toString()}>
                          {milestone.stage} — ${amountNumber(milestone.amount).toLocaleString("en-AU")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Subcontract Milestone</Label>
                  <Select
                    value={item.subcontractKey || "none"}
                    disabled={!item.jobId || subcontractOptions.length === 0}
                    onValueChange={(value) => {
                      if (value === "none") {
                        updateItem(item.id, { subcontractKey: "" });
                        return;
                      }
                      const milestone = subcontractMilestones.find((candidate: any) =>
                        `${candidate.subcontractId}:${candidate.subcontractMilestoneIndex}` === value
                      );
                      const milestoneAmount = amountNumber(milestone?.amountDollars);
                      updateItem(item.id, {
                        subcontractKey: value,
                        amount: item.amount || (milestoneAmount > 0 ? moneyString(milestoneAmount) : item.amount),
                        gstAmount: item.gstAmount || (milestoneAmount > 0 ? moneyString(milestoneAmount * 0.1) : item.gstAmount),
                        description: item.description || milestone?.label || "",
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="No subcontract milestone" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No subcontract milestone</SelectItem>
                      {subcontractOptions.map((milestone: any) => (
                        <SelectItem
                          key={`${milestone.subcontractId}:${milestone.subcontractMilestoneIndex}`}
                          value={`${milestone.subcontractId}:${milestone.subcontractMilestoneIndex}`}
                        >
                          {milestone.subcontractorName} — {milestone.label} ({milestone.amountDollars ? `$${amountNumber(milestone.amountDollars).toLocaleString("en-AU")}` : "TBD"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px] gap-3">
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={item.description}
                    onChange={(event) => updateItem(item.id, { description: event.target.value })}
                    placeholder="Work completed or claim note"
                  />
                </div>
                <div>
                  <Label className="text-xs">Amount ex GST *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(event) => updateItem(item.id, { amount: event.target.value })}
                      className="pl-9"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">GST</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.gstAmount}
                      onChange={(event) => updateItem(item.id, { gstAmount: event.target.value })}
                      className="pl-9"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: any }) {
  const [showPhotos, setShowPhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<"before" | "during" | "after">("after");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: photos, refetch: refetchPhotos } = trpc.tradePortal.getInvoicePhotos.useQuery(
    { invoiceId: invoice.id },
    { enabled: showPhotos }
  );

  const uploadPhotoMutation = trpc.tradePortal.uploadInvoicePhoto.useMutation({
    onSuccess: () => {
      toast.success("Photo uploaded");
      refetchPhotos();
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePhotoMutation = trpc.tradePortal.deleteInvoicePhoto.useMutation({
    onSuccess: () => {
      toast.success("Photo removed");
      refetchPhotos();
    },
    onError: (err) => toast.error(err.message),
  });

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let completed = 0;
    const total = files.length;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadPhotoMutation.mutate({
          invoiceId: invoice.id,
          fileBase64: base64,
          fileName: file.name,
          fileMimeType: file.type || "image/jpeg",
          stage: selectedStage,
        }, {
          onSettled: () => {
            completed++;
            if (completed >= total) {
              setUploading(false);
              if (photoInputRef.current) photoInputRef.current.value = "";
            }
          },
        });
      };
      reader.onerror = () => {
        completed++;
        if (completed >= total) setUploading(false);
      };
      reader.readAsDataURL(file);
    });
  }

  return (
    <Card className="mb-2">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
              <Badge className={`text-[10px] flex items-center gap-1 ${statusColors[invoice.status] || "bg-gray-100 text-gray-800"}`}>
                {statusIcons[invoice.status]}
                {invoice.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Job #{invoice.jobId || "—"}
              {invoice.workOrderId && ` • WO-${invoice.workOrderId}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Submitted {invoice.submittedAt ? new Date(invoice.submittedAt).toLocaleDateString("en-AU") : "—"}
            </p>
            {invoice.description && (
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{invoice.description}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-base sm:text-lg">
              ${parseFloat(invoice.amount || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </p>
            {invoice.gstAmount && parseFloat(invoice.gstAmount) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                +${parseFloat(invoice.gstAmount).toFixed(2)} GST
              </p>
            )}
            {invoice.fileUrl && (
              <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" asChild>
                <a href={invoice.fileUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-3 h-3 mr-1" /> View
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Photo Proof of Work Section */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowPhotos(!showPhotos)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Proof of Work Photos</span>
              {photos && photos.length > 0 && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{photos.length}</Badge>
              )}
            </button>
            {showPhotos && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value as any)}
                  className="h-7 text-xs rounded-md border border-input bg-background px-2 py-0.5"
                >
                  <option value="before">Before</option>
                  <option value="during">During</option>
                  <option value="after">After</option>
                </select>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <><Camera className="w-3 h-3 mr-1" /> Add Photos</>
                  )}
                </Button>
              </div>
            )}
          </div>

          {showPhotos && (
            <div className="mt-2">
              {photos && photos.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.map((photo: any) => (
                    <div key={photo.id} className="relative group">
                      <img
                        src={photo.fileUrl}
                        alt={photo.fileName || "Proof of work"}
                        className="w-full h-20 sm:h-24 object-cover rounded-md cursor-pointer border border-border/50"
                        onClick={() => setPreviewUrl(photo.fileUrl)}
                      />
                      {photo.stage && (
                        <span className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          photo.stage === "before" ? "bg-amber-500 text-white" :
                          photo.stage === "during" ? "bg-blue-500 text-white" :
                          "bg-green-500 text-white"
                        }`}>{photo.stage}</span>
                      )}
                      <button
                        onClick={() => deletePhotoMutation.mutate({ id: photo.id })}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 bg-muted/30 rounded-lg">
                  <Image className="w-6 h-6 mx-auto text-muted-foreground/50 mb-1" />
                  <p className="text-xs text-muted-foreground">No photos attached yet</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 text-xs"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Camera className="w-3 h-3 mr-1" /> Upload proof of work
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* Full-screen photo preview */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Card>
  );
}

// ─── Subcontract Milestones Summary ─────────────────────────────────────────
function SubcontractMilestonesSummary({ jobs }: { jobs: any[] | undefined }) {
  // Fetch subcontract milestones for the first active job
  const jobIds = jobs?.map((j: any) => j.id) || [];
  const { data: milestoneData } = trpc.tradePortal.getJobSubcontractMilestones.useQuery(
    { jobId: jobIds[0] || 0 },
    { enabled: jobIds.length > 0 }
  );

  if (!milestoneData || milestoneData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" /> Subcontract Milestones
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Your payment milestones — submit an invoice to claim each one
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {milestoneData.map((sc: any) => (
            <div key={sc.id} className="border rounded-lg p-3">
              <p className="font-medium text-sm mb-2">
                {sc.subcontractorName || "Subcontract"} — ${parseFloat(sc.subcontractSum || "0").toLocaleString("en-AU")}
              </p>
              <div className="space-y-1">
                {sc.milestones.map((m: any) => {
                  if (!m.label) return null;
                  const amount = m.usePercent
                    ? ((m.percentOfTotal || 0) / 100) * parseFloat(sc.subcontractSum || "0")
                    : m.amountDollars || 0;
                  const claimed = m.claimed;
                  return (
                    <div
                      key={m.index}
                      className={`flex items-center justify-between p-2 rounded text-sm ${
                        claimed ? "bg-green-50 text-green-800" : "bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {claimed ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        {m.label}
                      </span>
                      <span className="font-medium">
                        ${amount.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        {claimed && (
                          <Badge className="ml-2 text-[9px] bg-green-100 text-green-800">Claimed</Badge>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
