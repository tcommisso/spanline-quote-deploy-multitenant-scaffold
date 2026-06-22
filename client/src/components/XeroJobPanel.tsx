import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Link2, RefreshCw, FileText, ShoppingCart, DollarSign,
  CheckCircle2, Clock, AlertTriangle, ExternalLink, Plus,
  FolderSync, Upload, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  AUTHORISED: "bg-green-100 text-green-700",
  PAID: "bg-emerald-100 text-emerald-700",
  VOIDED: "bg-red-100 text-red-700",
  DELETED: "bg-red-100 text-red-700",
  BILLED: "bg-green-100 text-green-700",
};

interface XeroJobPanelProps {
  jobId: number;
  clientName: string;
}

export default function XeroJobPanel({ jobId, clientName }: XeroJobPanelProps) {
  const connectionStatus = trpc.xero.connectionStatus.useQuery();
  const contactMapping = trpc.xero.getContactMapping.useQuery(
    { localType: "client", localId: jobId },
    { enabled: connectionStatus.data?.connected === true }
  );
  const jobDocuments = trpc.xero.getJobDocuments.useQuery(
    { jobId },
    { enabled: connectionStatus.data?.connected === true }
  );
  // Also fetch the Xero project mapping to get mappingId for fetching real Xero invoices
  const xeroMapping = trpc.xeroProjects.getJobMapping.useQuery(
    { jobId },
    { enabled: connectionStatus.data?.connected === true }
  );
  // Fetch real Xero invoices from the Accounting API via the project mapping
  const xeroInvoices = trpc.xeroProjects.getProjectTransactions.useQuery(
    { mappingId: xeroMapping.data?.id || 0, type: "invoices" },
    { enabled: !!xeroMapping.data?.id }
  );
  // Fetch automatically synced Xero accounting lines for this job
  const accountingSummary = trpc.xeroAccounting.getJobSummary.useQuery(
    { jobId },
    { enabled: connectionStatus.data?.connected === true }
  );

  const syncContact = trpc.xero.syncContact.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced to Xero as "${data.xeroContactName}"`);
      contactMapping.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const refreshStatus = trpc.xero.refreshDocumentStatus.useMutation({
    onSuccess: () => {
      jobDocuments.refetch();
      toast.success("Status refreshed");
    },
    onError: (err) => toast.error(err.message),
  });

  const syncJobAccounting = trpc.xeroAccounting.syncJob.useMutation({
    onSuccess: (result) => {
      if (result.warning) {
        toast.warning(result.warning);
      } else if (result.fetched?.total === 0) {
        toast.warning("Xero returned no accounting documents for this entity.");
      } else {
        toast.success(`Synced ${result.imported} Xero transaction line(s)`);
      }
      accountingSummary.refetch();
      xeroInvoices.refetch();
      xeroMapping.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!connectionStatus.data?.connected) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 text-center">
          <Link2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Connect Xero in Settings to enable invoicing and purchase orders.
          </p>
        </CardContent>
      </Card>
    );
  }

  const localInvoices = (jobDocuments.data || []).filter((d: any) => d.invoiceType === "progress_claim");
  const purchaseOrders = (jobDocuments.data || []).filter((d: any) => d.invoiceType === "purchase_order");
  // Combine local invoices with Xero invoices (dedup by invoice number)
  const xeroInvList = xeroInvoices.data?.transactions || [];
  const localInvNumbers = new Set(localInvoices.map((i: any) => i.xeroInvoiceNumber).filter(Boolean));
  const xeroOnlyInvoices = xeroInvList.filter((xi) => !localInvNumbers.has(xi.description));
  // Costs from automatic Xero Accounting API sync
  const accountingRows = accountingSummary.data?.rows || [];
  const xeroCostRows = accountingRows.filter((row: any) => row.isCost);
  const totalActualCostsExGst = xeroCostRows.reduce(
    (sum: number, row: any) => sum + parseFloat(String(row.lineAmount || "0")),
    0
  );
  const totalActualCostsIncGst = accountingSummary.data?.totalCost || 0;
  const costsBySupplier = Array.from(new Set<string>(xeroCostRows.map((row: any) => row.contactName || "Unknown")));

  return (
    <div className="space-y-4">
      {/* Xero Contact Sync */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Xero Contact
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contactMapping.data ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{contactMapping.data.xeroContactName}</p>
                <p className="text-xs text-muted-foreground">
                  Last synced: {contactMapping.data.lastSyncedAt ? new Date(contactMapping.data.lastSyncedAt).toLocaleDateString("en-AU") : "Never"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncContact.mutate({ localType: "client", localId: jobId })}
                disabled={syncContact.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncContact.isPending ? "animate-spin" : ""}`} />
                Re-sync
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Not yet synced to Xero</p>
              <Button
                size="sm"
                onClick={() => syncContact.mutate({ localType: "client", localId: jobId })}
                disabled={syncContact.isPending}
              >
                {syncContact.isPending ? "Syncing..." : "Sync to Xero"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Actual Costs from Xero Accounting API */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Actual Costs
              <Badge variant="outline" className="text-[10px] ml-1">Synced from Xero</Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncJobAccounting.mutate({ jobId, maxPages: 50 })}
              disabled={syncJobAccounting.isPending || !xeroMapping.data?.id}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncJobAccounting.isPending ? "animate-spin" : ""}`} />
              Sync
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accountingSummary.isLoading ? (
            <div className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Loading costs...</p>
            </div>
          ) : xeroCostRows.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No synced Xero costs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Costs grouped by supplier */}
              {costsBySupplier.map((supplierName) => (
                <div key={supplierName}>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{supplierName}</p>
                  <div className="space-y-1">
                    {xeroCostRows
                      .filter((c: any) => (c.contactName || "Unknown") === supplierName)
                      .map((cost: any) => (
                        <div key={cost.sourceKey || cost.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{cost.description || cost.transactionNumber || "Expense"}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {cost.transactionDate ? new Date(cost.transactionDate).toLocaleDateString("en-AU") : ""}
                              </span>
                              {cost.reference && (
                                <span className="text-xs text-muted-foreground">Ref: {cost.reference}</span>
                              )}
                            </div>
                          </div>
                          <span className="font-medium ml-2">
                            ${parseFloat(String(cost.lineAmount || "0")).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="text-right text-xs text-muted-foreground mt-1">
                    Subtotal: ${xeroCostRows
                      .filter((c: any) => (c.contactName || "Unknown") === supplierName)
                      .reduce((sum: number, c: any) => sum + parseFloat(String(c.lineAmount || "0")), 0)
                      .toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
              {/* Total costs */}
              <div className="border-t pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Total Actual Costs (ex. GST)</span>
                <span className="font-semibold text-red-600">
                  ${totalActualCostsExGst.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total inc. GST</span>
                <span className="text-muted-foreground">
                  ${totalActualCostsIncGst.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Xero Project Link */}
      <XeroProjectCard jobId={jobId} />

      {/* Purchase Orders */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Purchase Orders
            </CardTitle>
            <CreatePurchaseOrderDialog jobId={jobId} onSuccess={() => jobDocuments.refetch()} />
          </div>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No purchase orders created yet</p>
          ) : (
            <div className="space-y-2">
              {purchaseOrders.map((po: any) => (
                <div key={po.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{po.xeroInvoiceNumber || "Draft PO"}</p>
                    <p className="text-xs text-muted-foreground">{po.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">${parseFloat(po.amount || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
                    <Badge className={STATUS_COLORS[po.status] || "bg-slate-100"} variant="secondary">
                      {po.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => refreshStatus.mutate({ mappingId: po.id })}
                      disabled={refreshStatus.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${refreshStatus.isPending ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Xero Project Card ──────────────────────────────────────────────────────
function XeroProjectCard({ jobId }: { jobId: number }) {
  const [transactionView, setTransactionView] = useState<{ mappingId: number; type: "invoices" | "bills" | "expenses"; label: string } | null>(null);
  const mapping = trpc.xeroProjects.getJobMapping.useQuery({ jobId });
  const pushToXero = trpc.xeroProjects.pushJobToXero.useMutation({
    onSuccess: (data) => {
      toast.success(`Linked to Xero Project: ${data.xeroProjectName}`);
      mapping.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const syncFinancials = trpc.xeroProjects.syncFinancials.useMutation({
    onSuccess: () => {
      toast.success("Financial data synced from Xero");
      mapping.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
    {transactionView && (
      <TransactionDetailDialog
        mappingId={transactionView.mappingId}
        type={transactionView.type}
        label={transactionView.label}
        onClose={() => setTransactionView(null)}
      />
    )}
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderSync className="h-4 w-4" /> Xero Project
        </CardTitle>
      </CardHeader>
      <CardContent>
        {mapping.data ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{mapping.data.xeroProjectName}</p>
                <p className="text-xs text-muted-foreground">
                  Status: {mapping.data.xeroProjectStatus === "CLOSED" ? "Closed" : "Active"}
                  {mapping.data.lastSyncedAt && ` · Synced: ${new Date(mapping.data.lastSyncedAt).toLocaleDateString("en-AU")}`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncFinancials.mutate()}
                disabled={syncFinancials.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncFinancials.isPending ? "animate-spin" : ""}`} />
                Sync
              </Button>
            </div>
            {mapping.data.totalInvoiced && (
              <div className="grid grid-cols-1 gap-2 text-xs bg-muted/50 rounded-lg p-2">
                <button
                  className="text-left hover:bg-muted rounded p-1 transition-colors cursor-pointer"
                  onClick={() => setTransactionView({ mappingId: mapping.data!.id, type: "invoices", label: "Invoices" })}
                >
                  <p className="text-muted-foreground">Invoiced</p>
                  <p className="font-medium text-blue-600 underline decoration-dotted">${parseFloat(mapping.data.totalInvoiced || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Not linked to a Xero Project</p>
            <Button
              size="sm"
              onClick={() => pushToXero.mutate({ jobId })}
              disabled={pushToXero.isPending}
            >
              {pushToXero.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Pushing...</>
              ) : (
                <><Upload className="h-3.5 w-3.5 mr-1" /> Push to Xero</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}

// ─── Create Invoice Dialog ──────────────────────────────────────────────────
function CreateInvoiceDialog({ jobId, onSuccess }: { jobId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    dueDate: "",
    reference: "",
  });

  const createInvoice = trpc.xero.createProgressInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber || ""} created in Xero`);
      setOpen(false);
      setForm({ description: "", amount: "", dueDate: "", reference: "" });
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1" /> New Invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Progress Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Description *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Progress Claim #1 - Slab & Frame Complete"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount ($) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Reference</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Optional reference number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createInvoice.mutate({
              jobId,
              description: form.description,
              amount: parseFloat(form.amount || "0"),
              dueDate: form.dueDate || undefined,
              reference: form.reference || undefined,
            })}
            disabled={!form.description || !form.amount || createInvoice.isPending}
          >
            {createInvoice.isPending ? "Creating..." : "Create in Xero"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Purchase Order Dialog ───────────────────────────────────────────
function CreatePurchaseOrderDialog({ jobId, onSuccess }: { jobId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplierName: "",
    deliveryDate: "",
    reference: "",
    deliveryAddress: "",
    deliveryInstructions: "",
    lineItems: [{ description: "", quantity: "1", unitAmount: "" }],
  });

  const createPO = trpc.xero.createPurchaseOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`PO ${data.purchaseOrderNumber || ""} created in Xero`);
      setOpen(false);
      setForm({
        supplierName: "",
        deliveryDate: "",
        reference: "",
        deliveryAddress: "",
        deliveryInstructions: "",
        lineItems: [{ description: "", quantity: "1", unitAmount: "" }],
      });
      onSuccess();
    },
    onError: (err) => toast.error(err.message),
  });

  const addLineItem = () => {
    setForm({ ...form, lineItems: [...form.lineItems, { description: "", quantity: "1", unitAmount: "" }] });
  };

  const updateLineItem = (idx: number, field: string, value: string) => {
    const items = [...form.lineItems];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, lineItems: items });
  };

  const removeLineItem = (idx: number) => {
    if (form.lineItems.length <= 1) return;
    setForm({ ...form, lineItems: form.lineItems.filter((_, i) => i !== idx) });
  };

  const totalAmount = form.lineItems.reduce(
    (sum, item) => sum + (parseFloat(item.quantity || "0") * parseFloat(item.unitAmount || "0")), 0
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1" /> New PO
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-[760px] max-w-[calc(100vw-2rem)] sm:max-w-[90vw] max-h-[90vh] min-h-[min(520px,80vh)] resize overflow-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div>
            <Label className="text-xs">Supplier Name *</Label>
            <Input
              value={form.supplierName}
              onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
              placeholder="e.g. Stratco, BlueScope"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Delivery Date</Label>
              <Input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Delivery Address</Label>
            <Input
              value={form.deliveryAddress}
              onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
              placeholder="Site address (auto-filled from job)"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium">Line Items</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addLineItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {form.lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_70px_100px_36px] gap-2 items-end">
                  <div>
                    {idx === 0 && <Label className="text-[10px] text-muted-foreground">Description</Label>}
                    <Input
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                      placeholder="Item description"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-[10px] text-muted-foreground">Qty</Label>}
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-[10px] text-muted-foreground">Unit $</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitAmount}
                      onChange={(e) => updateLineItem(idx, "unitAmount", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLineItem(idx)}
                    disabled={form.lineItems.length <= 1}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <div className="text-right mt-2">
              <span className="text-sm font-medium">Total: ${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createPO.mutate({
              jobId,
              supplierName: form.supplierName,
              lineItems: form.lineItems.map(item => ({
                description: item.description,
                quantity: parseFloat(item.quantity || "1"),
                unitAmount: parseFloat(item.unitAmount || "0"),
              })),
              deliveryDate: form.deliveryDate || undefined,
              reference: form.reference || undefined,
              deliveryAddress: form.deliveryAddress || undefined,
              deliveryInstructions: form.deliveryInstructions || undefined,
            })}
            disabled={!form.supplierName || form.lineItems.every(i => !i.description) || createPO.isPending}
          >
            {createPO.isPending ? "Creating..." : "Create in Xero"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction Detail Dialog ──────────────────────────────────────────────
function TransactionDetailDialog({
  mappingId,
  type,
  label,
  onClose,
}: {
  mappingId: number;
  type: "invoices" | "bills" | "expenses";
  label: string;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.xeroProjects.getProjectTransactions.useQuery(
    { mappingId, type },
    { enabled: true }
  );

  const transactions = data?.transactions || [];
  const total = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {label} Detail
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions found</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{txn.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {txn.date && (
                        <span>{new Date(txn.date).toLocaleDateString("en-AU")}</span>
                      )}
                      {txn.reference && <span>Ref: {txn.reference}</span>}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-medium">${txn.amount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                    <Badge className={`text-xs ${STATUS_COLORS[txn.status] || "bg-slate-100 text-slate-700"}`} variant="secondary">
                      {txn.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {transactions.length > 0 && (
          <div className="border-t pt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold">Total: ${total.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
