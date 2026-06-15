import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, FileText, CheckCircle, AlertTriangle, XCircle, ClipboardCheck, Upload, Send } from "lucide-react";

interface POLineItem {
  productName: string;
  productCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  colour?: string;
  description?: string;
}

export default function ProcurementWorkflow() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null);

  // Get all manufacturing POs
  const { data: purchaseOrders } = trpc.manufacturing.purchaseOrders.list.useQuery({ orderId: undefined as any });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Procurement Workflow</h1>
          <p className="text-muted-foreground">PO receipt tracking, invoice matching, and approval</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">PO Overview</TabsTrigger>
          <TabsTrigger value="receipts">Goods Received</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="approval">Approval Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <POOverview
            purchaseOrders={purchaseOrders || []}
            onSelectPO={setSelectedPOId}
            selectedPOId={selectedPOId}
          />
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4">
          <GoodsReceived
            purchaseOrders={purchaseOrders || []}
            selectedPOId={selectedPOId}
            onSelectPO={setSelectedPOId}
          />
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <InvoiceManagement selectedPOId={selectedPOId} onSelectPO={setSelectedPOId} />
        </TabsContent>

        <TabsContent value="approval" className="space-y-4">
          <ApprovalQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── PO Overview ─────────────────────────────────────────────────────────────
function POOverview({ purchaseOrders, onSelectPO, selectedPOId }: {
  purchaseOrders: any[];
  onSelectPO: (id: number) => void;
  selectedPOId: number | null;
}) {
  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    issued: "bg-blue-100 text-blue-700",
    confirmed: "bg-indigo-100 text-indigo-700",
    received: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Purchase Orders</h2>
      <div className="grid gap-3">
        {purchaseOrders?.map((po: any) => {
          const lineItems = (po.lineItems as POLineItem[] | null) || [];
          return (
            <Card
              key={po.id}
              className={`cursor-pointer transition-colors hover:border-primary ${selectedPOId === po.id ? "border-primary ring-1 ring-primary" : ""}`}
              onClick={() => onSelectPO(po.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{po.poNumber || `PO-${po.id}`}</p>
                      <p className="text-sm text-muted-foreground">{po.supplier}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">${Number(po.totalAmount || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-muted-foreground">{lineItems.length} line items</p>
                    </div>
                    <Badge className={statusColor[po.status] || "bg-gray-100"}>{po.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!purchaseOrders || purchaseOrders.length === 0) && (
          <p className="text-muted-foreground text-center py-8">No purchase orders found</p>
        )}
      </div>

      {selectedPOId && <POMatchSummary purchaseOrderId={selectedPOId} />}
    </div>
  );
}

// ─── PO Match Summary ────────────────────────────────────────────────────────
function POMatchSummary({ purchaseOrderId }: { purchaseOrderId: number }) {
  const { data } = trpc.procurement.match.summary.useQuery({ purchaseOrderId });

  if (!data) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Match Summary — {data.po.poNumber || `PO-${data.po.id}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{data.summary.poLineCount}</p>
            <p className="text-xs text-muted-foreground">PO Lines</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{data.summary.fullyReceivedCount}</p>
            <p className="text-xs text-muted-foreground">Fully Received</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">${data.summary.poTotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">PO Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">${data.summary.invoicedTotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Invoiced Total</p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Product</th>
              <th className="text-right py-2">Ordered</th>
              <th className="text-right py-2">Received</th>
              <th className="text-right py-2">Unit Price</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.poLineItems.map((line: any, idx: number) => {
              const pct = line.quantity > 0 ? (line.received / line.quantity) * 100 : 0;
              return (
                <tr key={idx} className="border-b">
                  <td className="py-2">{line.productName}</td>
                  <td className="text-right">{line.quantity} {line.unit || ""}</td>
                  <td className="text-right">{line.received}</td>
                  <td className="text-right">${line.unitPrice.toFixed(2)}</td>
                  <td className="text-right">
                    {pct >= 100 ? (
                      <Badge className="bg-green-100 text-green-700">Complete</Badge>
                    ) : pct > 0 ? (
                      <Badge className="bg-yellow-100 text-yellow-700">{pct.toFixed(0)}%</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-700">Pending</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Goods Received ──────────────────────────────────────────────────────────
function GoodsReceived({ purchaseOrders, selectedPOId, onSelectPO }: {
  purchaseOrders: any[];
  selectedPOId: number | null;
  onSelectPO: (id: number) => void;
}) {
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const activePOs = purchaseOrders.filter(po => ["issued", "confirmed"].includes(po.status));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Goods Received Notes</h2>
        {selectedPOId && (
          <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
            <DialogTrigger asChild>
              <Button><ClipboardCheck className="h-4 w-4 mr-2" /> Record Receipt</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Record Goods Received</DialogTitle>
              </DialogHeader>
              <ReceiveGoodsForm
                purchaseOrderId={selectedPOId}
                purchaseOrders={purchaseOrders}
                onComplete={() => setShowReceiveDialog(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!selectedPOId && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Select a PO to record goods received:</p>
          {activePOs.map(po => (
            <Card key={po.id} className="cursor-pointer hover:border-primary" onClick={() => onSelectPO(po.id)}>
              <CardContent className="p-3 flex items-center justify-between">
                <span className="font-medium">{po.poNumber || `PO-${po.id}`} — {po.supplier}</span>
                <Badge>{po.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedPOId && <ReceiptHistory purchaseOrderId={selectedPOId} />}
    </div>
  );
}

function ReceiveGoodsForm({ purchaseOrderId, purchaseOrders, onComplete }: {
  purchaseOrderId: number;
  purchaseOrders: any[];
  onComplete: () => void;
}) {
  const po = purchaseOrders.find((p: any) => p.id === purchaseOrderId);
  const lineItems = (po?.lineItems as POLineItem[] | null) || [];
  const [lines, setLines] = useState(lineItems.map((_, idx) => ({
    lineIndex: idx,
    receivedQty: 0,
    conditionStatus: "good" as "good" | "damaged" | "partial_damage",
    notes: "",
  })));

  const utils = trpc.useUtils();
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ supplierId: number; supplierName: string; poId: number } | null>(null);
  const createReceipt = trpc.procurement.receipts.create.useMutation({
    onSuccess: (data) => {
      toast.success("Goods received recorded successfully");
      utils.procurement.receipts.invalidate();
      utils.procurement.match.invalidate();
      if (data.fullyReceived && data.supplierId) {
        setFeedbackPrompt({ supplierId: data.supplierId, supplierName: data.supplierName || "Supplier", poId: data.poId });
      } else {
        onComplete();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  if (feedbackPrompt) {
    return (
      <SupplierFeedbackPrompt
        supplierId={feedbackPrompt.supplierId}
        supplierName={feedbackPrompt.supplierName}
        poId={feedbackPrompt.poId}
        onComplete={() => { setFeedbackPrompt(null); onComplete(); }}
        onSkip={() => { setFeedbackPrompt(null); onComplete(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">PO: {po?.poNumber || `PO-${purchaseOrderId}`} — {po?.supplier}</p>
      <div className="max-h-96 overflow-y-auto space-y-3">
        {lineItems.map((item, idx) => (
          <div key={idx} className="border rounded p-3 space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-sm">{item.productName}</span>
              <span className="text-sm text-muted-foreground">Ordered: {item.quantity} {item.unit || ""}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Qty Received</label>
                <Input
                  type="number"
                  min={0}
                  max={item.quantity}
                  value={lines[idx]?.receivedQty || 0}
                  onChange={(e) => {
                    const updated = [...lines];
                    updated[idx] = { ...updated[idx], receivedQty: Number(e.target.value) };
                    setLines(updated);
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Condition</label>
                <Select
                  value={lines[idx]?.conditionStatus || "good"}
                  onValueChange={(v) => {
                    const updated = [...lines];
                    updated[idx] = { ...updated[idx], conditionStatus: v as any };
                    setLines(updated);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="partial_damage">Partial Damage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <Input
                  placeholder="Optional"
                  value={lines[idx]?.notes || ""}
                  onChange={(e) => {
                    const updated = [...lines];
                    updated[idx] = { ...updated[idx], notes: e.target.value };
                    setLines(updated);
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Button
        className="w-full"
        onClick={() => createReceipt.mutate({ purchaseOrderId, lines: lines.filter(l => l.receivedQty > 0) })}
        disabled={createReceipt.isPending || lines.every(l => l.receivedQty === 0)}
      >
        {createReceipt.isPending ? "Saving..." : "Confirm Receipt"}
      </Button>
    </div>
  );
}

function ReceiptHistory({ purchaseOrderId }: { purchaseOrderId: number }) {
  const { data: receipts } = trpc.procurement.receipts.listByPO.useQuery({ purchaseOrderId });
  const { data: summary } = trpc.procurement.receipts.summary.useQuery({ purchaseOrderId });

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Receipt History</h3>
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {summary.map((s: any) => (
            <Card key={s.lineIndex} className="p-2">
              <p className="text-xs text-muted-foreground">Line #{s.lineIndex + 1}</p>
              <p className="font-medium">{s.totalReceived} received</p>
              <Badge className={s.condition === "good" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                {s.condition}
              </Badge>
            </Card>
          ))}
        </div>
      )}
      {(!receipts || receipts.length === 0) && (
        <p className="text-sm text-muted-foreground">No receipts recorded yet</p>
      )}
    </div>
  );
}

// ─── Invoice Management ──────────────────────────────────────────────────────
function InvoiceManagement({ selectedPOId, onSelectPO }: { selectedPOId: number | null; onSelectPO: (id: number) => void }) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: invoices } = trpc.procurement.invoices.list.useQuery(
    statusFilter === "all" ? undefined : { status: statusFilter as any }
  );

  const utils = trpc.useUtils();
  const performMatch = trpc.procurement.match.perform.useMutation({
    onSuccess: (result) => {
      if (result.hasVariance) {
        toast.warning(`Match complete with variance: $${result.totalVariance.toFixed(2)}`);
      } else {
        toast.success("Invoice matched successfully — no variances");
      }
      utils.procurement.invoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Supplier Invoices</h2>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_match">Pending Match</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="variance_flagged">Variance Flagged</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <UploadInvoiceButton onComplete={() => utils.procurement.invoices.invalidate()} selectedPOId={selectedPOId} />
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="brand"><FileText className="h-4 w-4 mr-2" /> New Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Record Supplier Invoice</DialogTitle>
              </DialogHeader>
              <CreateInvoiceForm selectedPOId={selectedPOId} onComplete={() => setShowCreateDialog(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-2">
        {invoices?.map((inv: any) => {
          const statusIcon: Record<string, any> = {
            matched: <CheckCircle className="h-4 w-4 text-green-600" />,
            variance_flagged: <AlertTriangle className="h-4 w-4 text-amber-600" />,
            approved: <CheckCircle className="h-4 w-4 text-blue-600" />,
            rejected: <XCircle className="h-4 w-4 text-red-600" />,
          };
          const statusColors: Record<string, string> = {
            draft: "bg-gray-100 text-gray-700",
            pending_match: "bg-yellow-100 text-yellow-700",
            matched: "bg-green-100 text-green-700",
            variance_flagged: "bg-amber-100 text-amber-700",
            approved: "bg-blue-100 text-blue-700",
            rejected: "bg-red-100 text-red-700",
            paid: "bg-emerald-100 text-emerald-700",
          };

          return (
            <Card key={inv.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon[inv.status] || <FileText className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium">{inv.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">{inv.supplierName} • {new Date(inv.invoiceDate).toLocaleDateString("en-AU")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-medium">${Number(inv.total || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</p>
                    {inv.varianceAmount && Number(inv.varianceAmount) !== 0 && (
                      <p className="text-xs text-amber-600">Variance: ${Number(inv.varianceAmount).toFixed(2)}</p>
                    )}
                  </div>
                  <Badge className={statusColors[inv.status] || "bg-gray-100"}>{inv.status.replace("_", " ")}</Badge>
                  {inv.purchaseOrderId && ["draft", "pending_match"].includes(inv.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => performMatch.mutate({ invoiceId: inv.id })}
                      disabled={performMatch.isPending}
                    >
                      Match
                    </Button>
                  )}
                  {inv.status === "approved" && !inv.xeroInvoiceId && (
                    <PushToXeroButton invoiceId={inv.id} />
                  )}
                  {inv.xeroInvoiceId && (
                    <Badge className="bg-teal-100 text-teal-700 text-xs">In Xero</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!invoices || invoices.length === 0) && (
          <p className="text-muted-foreground text-center py-8">No invoices found</p>
        )}
      </div>
    </div>
  );
}

function CreateInvoiceForm({ selectedPOId, onComplete }: { selectedPOId: number | null; onComplete: () => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ lineIndex?: number; description: string; quantity: number; unitPrice: number }[]>([
    { description: "", quantity: 0, unitPrice: 0 },
  ]);

  const utils = trpc.useUtils();
  const createInvoice = trpc.procurement.invoices.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created");
      utils.procurement.invoices.invalidate();
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Invoice Number *</label>
          <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
        </div>
        <div>
          <label className="text-sm font-medium">Supplier Name *</label>
          <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Supplier Email</label>
          <Input value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} type="email" />
        </div>
        <div>
          <label className="text-sm font-medium">Invoice Date *</label>
          <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Due Date</label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Line Items</label>
        <div className="space-y-2 mt-2">
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 items-end">
              <div className="col-span-2">
                <Input
                  placeholder="Description"
                  value={line.description}
                  onChange={e => {
                    const updated = [...lines];
                    updated[idx] = { ...updated[idx], description: e.target.value };
                    setLines(updated);
                  }}
                />
              </div>
              <Input
                type="number"
                placeholder="Qty"
                min={0}
                value={line.quantity || ""}
                onChange={e => {
                  const updated = [...lines];
                  updated[idx] = { ...updated[idx], quantity: Number(e.target.value) };
                  setLines(updated);
                }}
              />
              <Input
                type="number"
                placeholder="Unit Price"
                min={0}
                step="0.01"
                value={line.unitPrice || ""}
                onChange={e => {
                  const updated = [...lines];
                  updated[idx] = { ...updated[idx], unitPrice: Number(e.target.value) };
                  setLines(updated);
                }}
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines([...lines, { description: "", quantity: 0, unitPrice: 0 }])}>
            + Add Line
          </Button>
        </div>
      </div>

      <div className="text-right space-y-1 border-t pt-3">
        <p className="text-sm">Subtotal: ${subtotal.toFixed(2)}</p>
        <p className="text-sm">GST (10%): ${gst.toFixed(2)}</p>
        <p className="font-bold">Total: ${total.toFixed(2)}</p>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>

      <Button
        className="w-full"
        disabled={!invoiceNumber || !supplierName || !invoiceDate || lines.every(l => !l.description) || createInvoice.isPending}
        onClick={() => createInvoice.mutate({
          invoiceNumber,
          supplierName,
          supplierEmail: supplierEmail || undefined,
          purchaseOrderId: selectedPOId || undefined,
          invoiceDate,
          dueDate: dueDate || undefined,
          notes: notes || undefined,
          lines: lines.filter(l => l.description),
        })}
      >
        {createInvoice.isPending ? "Creating..." : "Create Invoice"}
      </Button>
    </div>
  );
}

// ─── Approval Queue ──────────────────────────────────────────────────────────
function ApprovalQueue() {
  const { data: pending } = trpc.procurement.approval.pending.useQuery();
  const utils = trpc.useUtils();
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const approve = trpc.procurement.approval.approve.useMutation({
    onSuccess: () => {
      toast.success("Invoice approved");
      utils.procurement.approval.invalidate();
      utils.procurement.invoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reject = trpc.procurement.approval.reject.useMutation({
    onSuccess: () => {
      toast.success("Invoice rejected");
      utils.procurement.approval.invalidate();
      utils.procurement.invoices.invalidate();
      setRejectingId(null);
      setRejectReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        Variance Approval Queue
      </h2>
      <p className="text-sm text-muted-foreground">Invoices with variances exceeding the threshold require approval before payment.</p>

      {pending?.map((inv: any) => (
        <Card key={inv.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{inv.invoiceNumber} — {inv.supplierName}</p>
                <p className="text-sm text-muted-foreground">
                  Total: ${Number(inv.total || 0).toFixed(2)} • Variance: <span className="text-amber-600 font-medium">${Number(inv.varianceAmount || 0).toFixed(2)}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => approve.mutate({ invoiceId: inv.id })}
                  disabled={approve.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setRejectingId(inv.id)}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>

            {rejectingId === inv.id && (
              <div className="flex gap-2">
                <Input
                  placeholder="Rejection reason (required)"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!rejectReason || reject.isPending}
                  onClick={() => reject.mutate({ invoiceId: inv.id, reason: rejectReason })}
                >
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {(!pending || pending.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>No invoices pending approval</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Push to Xero Button ────────────────────────────────────────────────────
function PushToXeroButton({ invoiceId }: { invoiceId: number }) {
  const utils = trpc.useUtils();
  const pushToXero = trpc.procurement.pushToXero.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice pushed to Xero (Bill ID: ${data.xeroInvoiceId?.substring(0, 8)}...)`);
      utils.procurement.invoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-teal-700 border-teal-300 hover:bg-teal-50"
      onClick={() => pushToXero.mutate({ invoiceId })}
      disabled={pushToXero.isPending}
    >
      <Send className="h-3.5 w-3.5 mr-1" />
      {pushToXero.isPending ? "Pushing..." : "Push to Xero"}
    </Button>
  );
}

// ─── Upload & Parse Invoice (LLM) ──────────────────────────────────────────
function UploadInvoiceButton({ onComplete, selectedPOId }: { onComplete: () => void; selectedPOId: number | null }) {
  const [showDialog, setShowDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const utils = trpc.useUtils();

  const parseInvoice = trpc.procurement.parseInvoice.useMutation({
    onSuccess: (data) => {
      setParsedData(data);
      toast.success("Invoice parsed successfully");
    },
    onError: (err) => toast.error(`Parse failed: ${err.message}`),
  });

  const createInvoice = trpc.procurement.invoices.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created from parsed data");
      utils.procurement.invoices.invalidate();
      setShowDialog(false);
      setParsedData(null);
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Upload to S3 first
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      // Parse with LLM
      parseInvoice.mutate({ fileUrl: url, fileName: file.name });
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFromParsed = () => {
    if (!parsedData) return;
    createInvoice.mutate({
      invoiceNumber: parsedData.invoiceNumber || `INV-${Date.now().toString(36)}`,
      supplierName: parsedData.supplierName || "Unknown Supplier",
      supplierEmail: parsedData.supplierEmail || undefined,
      purchaseOrderId: parsedData.matchedPurchaseOrderId || selectedPOId || undefined,
      invoiceDate: parsedData.invoiceDate || new Date().toISOString().split("T")[0],
      dueDate: parsedData.dueDate || undefined,
      notes: parsedData.supplierAbn ? `ABN: ${parsedData.supplierAbn}` : undefined,
      lines: (parsedData.lineItems || []).map((li: any) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
      })),
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setShowDialog(true)}>
        <Upload className="h-4 w-4 mr-2" /> Upload Invoice
      </Button>

      <Dialog open={showDialog} onOpenChange={(v) => { setShowDialog(v); if (!v) setParsedData(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload & Parse Supplier Invoice</DialogTitle>
          </DialogHeader>

          {!parsedData ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a supplier invoice PDF or image. AI will extract the invoice details automatically.
              </p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">Drop a PDF or image here, or click to browse</p>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                  disabled={uploading || parseInvoice.isPending}
                  className="max-w-xs mx-auto"
                />
              </div>
              {(uploading || parseInvoice.isPending) && (
                <div className="text-center text-sm text-muted-foreground">
                  {uploading ? "Uploading..." : "Parsing invoice with AI..."}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">✓ Invoice Parsed Successfully</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Supplier:</span> {parsedData.supplierName || "—"}</div>
                  <div><span className="text-muted-foreground">Invoice #:</span> {parsedData.invoiceNumber || "—"}</div>
                  <div><span className="text-muted-foreground">Date:</span> {parsedData.invoiceDate || "—"}</div>
                  <div><span className="text-muted-foreground">Due:</span> {parsedData.dueDate || "—"}</div>
                  <div><span className="text-muted-foreground">Subtotal:</span> ${parsedData.subtotal?.toFixed(2) || "—"}</div>
                  <div><span className="text-muted-foreground">GST:</span> ${parsedData.gst?.toFixed(2) || "—"}</div>
                  <div><span className="text-muted-foreground">Total:</span> <strong>${parsedData.total?.toFixed(2) || "—"}</strong></div>
                  <div><span className="text-muted-foreground">ABN:</span> {parsedData.supplierAbn || "—"}</div>
                </div>
                {parsedData.matchedPurchaseOrderId && (
                  <p className="text-xs text-green-600 mt-2">✓ Auto-matched to PO #{parsedData.matchedPurchaseOrderId}</p>
                )}
                {parsedData.matchedSupplierId && (
                  <p className="text-xs text-green-600">✓ Supplier matched in directory</p>
                )}
              </div>

              {/* Line items */}
              {parsedData.lineItems?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Line Items ({parsedData.lineItems.length})</p>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Description</th>
                          <th className="text-right p-2">Qty</th>
                          <th className="text-right p-2">Unit Price</th>
                          <th className="text-right p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.lineItems.map((li: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{li.description}</td>
                            <td className="p-2 text-right">{li.quantity}</td>
                            <td className="p-2 text-right">${li.unitPrice?.toFixed(2)}</td>
                            <td className="p-2 text-right">${li.lineTotal?.toFixed(2) || (li.quantity * li.unitPrice).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setParsedData(null)}>Re-upload</Button>
                <Button onClick={handleCreateFromParsed} disabled={createInvoice.isPending}>
                  {createInvoice.isPending ? "Creating..." : "Create Invoice from Parsed Data"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


// ─── Supplier Feedback Prompt (shown after full PO receipt) ─────────────────
function SupplierFeedbackPrompt({ supplierId, supplierName, poId, onComplete, onSkip }: {
  supplierId: number;
  supplierName: string;
  poId: number;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [timeliness, setTimeliness] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [pricing, setPricing] = useState(0);
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const createFeedback = trpc.supplierFeedback.create.useMutation({
    onSuccess: () => {
      toast.success("Supplier feedback submitted — thank you!");
      utils.supplierFeedback.invalidate();
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!timeliness || !quality || !communication || !pricing) {
      toast.error("Please rate all categories");
      return;
    }
    createFeedback.mutate({ supplierId, timeliness, quality, communication, pricing, notes: notes || undefined, poId });
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Rate this supplier</h3>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          PO fully received from <strong>{supplierName}</strong>. How was your experience?
        </p>
      </div>

      <div className="space-y-3">
        <RatingRow label="Delivery Timeliness" value={timeliness} onChange={setTimeliness} />
        <RatingRow label="Product Quality" value={quality} onChange={setQuality} />
        <RatingRow label="Communication" value={communication} onChange={setCommunication} />
        <RatingRow label="Pricing Accuracy" value={pricing} onChange={setPricing} />
      </div>

      <div>
        <label className="text-sm text-muted-foreground">Notes (optional)</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any comments..." />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={createFeedback.isPending} className="flex-1">
          {createFeedback.isPending ? "Submitting..." : "Submit Feedback"}
        </Button>
        <Button variant="ghost" onClick={onSkip}>Skip</Button>
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="cursor-pointer hover:scale-110 transition-transform"
            onClick={() => onChange(star)}
          >
            <svg className={`h-5 w-5 ${star <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
