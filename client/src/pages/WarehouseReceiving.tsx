import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, ClipboardCheck, Search, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { SupplierFeedbackDialog } from "./SupplierFeedback";

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

const statusColors: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-700",
};

export default function WarehouseReceiving() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);

  // Fetch all manufacturing POs
  const { data: purchaseOrders, isLoading } = trpc.manufacturing.purchaseOrders.list.useQuery({ orderId: undefined as any });

  // Filter POs for warehouse receiving
  const filteredPOs = useMemo(() => {
    if (!purchaseOrders) return [];
    let filtered = purchaseOrders;

    // Status filter
    if (statusFilter === "active") {
      filtered = filtered.filter((po: any) => ["issued", "confirmed"].includes(po.status));
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((po: any) => po.status === statusFilter);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((po: any) =>
        (po.poNumber || `PO-${po.id}`).toLowerCase().includes(q) ||
        (po.supplier || "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [purchaseOrders, statusFilter, search]);

  const selectedPO = purchaseOrders?.find((po: any) => po.id === selectedPOId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" /> Warehouse Receiving
          </h1>
          <p className="text-muted-foreground">Process incoming goods against purchase orders</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO number or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active (Open)</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary">{filteredPOs.length} PO{filteredPOs.length !== 1 ? "s" : ""}</Badge>
      </div>

      {/* PO List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading purchase orders...</div>
      ) : filteredPOs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {statusFilter === "active" ? "No open purchase orders awaiting receipt." : "No purchase orders match your filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPOs.map((po: any) => {
            const lineItems = (po.lineItems as POLineItem[] | null) || [];
            const totalItems = lineItems.reduce((sum, l) => sum + l.quantity, 0);
            return (
              <Card
                key={po.id}
                className={`cursor-pointer transition-colors hover:border-primary ${selectedPOId === po.id ? "border-primary ring-1 ring-primary" : ""}`}
                onClick={() => setSelectedPOId(po.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-semibold">{po.poNumber || `PO-${po.id}`}</p>
                        <p className="text-sm text-muted-foreground">{po.supplier || "Unknown Supplier"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">{lineItems.length} line{lineItems.length !== 1 ? "s" : ""} · {totalItems} units</p>
                        {po.requiredByDate && (
                          <p className="text-xs text-muted-foreground">
                            Due: {new Date(po.requiredByDate).toLocaleDateString("en-AU")}
                          </p>
                        )}
                      </div>
                      <Badge className={statusColors[po.status] || "bg-gray-100 text-gray-700"}>
                        {po.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Selected PO Detail + Receive Action */}
      {selectedPO && (
        <POReceivingDetail
          po={selectedPO}
          onReceive={() => setShowReceiveDialog(true)}
        />
      )}

      {/* Receive Dialog */}
      {selectedPOId && (
        <ReceiveGoodsDialog
          open={showReceiveDialog}
          onOpenChange={setShowReceiveDialog}
          purchaseOrderId={selectedPOId}
          po={selectedPO}
        />
      )}
    </div>
  );
}

// ─── PO Detail Panel ──────────────────────────────────────────────────────────
function POReceivingDetail({ po, onReceive }: { po: any; onReceive: () => void }) {
  const lineItems = (po.lineItems as POLineItem[] | null) || [];
  const { data: receiptSummary } = trpc.procurement.receipts.summary.useQuery({ purchaseOrderId: po.id });

  // Build received map
  const receivedMap = useMemo(() => {
    const map = new Map<number, number>();
    if (receiptSummary) {
      for (const s of receiptSummary) {
        map.set(s.lineIndex, s.totalReceived);
      }
    }
    return map;
  }, [receiptSummary]);

  const canReceive = ["issued", "confirmed"].includes(po.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {po.poNumber || `PO-${po.id}`} — {po.supplier}
          </CardTitle>
          {canReceive && (
            <Button onClick={onReceive} className="gap-1">
              <ClipboardCheck className="h-4 w-4" /> Record Receipt
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium">Code</th>
                <th className="pb-2 font-medium text-right">Ordered</th>
                <th className="pb-2 font-medium text-right">Received</th>
                <th className="pb-2 font-medium text-right">Outstanding</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => {
                const received = receivedMap.get(idx) || 0;
                const outstanding = item.quantity - received;
                const isComplete = outstanding <= 0;
                return (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 font-medium">{item.productName}</td>
                    <td className="py-2 text-muted-foreground">{item.productCode || "—"}</td>
                    <td className="py-2 text-right">{item.quantity} {item.unit || ""}</td>
                    <td className="py-2 text-right font-medium">{received}</td>
                    <td className="py-2 text-right">{outstanding > 0 ? outstanding : "—"}</td>
                    <td className="py-2">
                      {isComplete ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                        </span>
                      ) : received > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                          <Clock className="h-3.5 w-3.5" /> Partial
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                          <AlertTriangle className="h-3.5 w-3.5" /> Pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Receive Goods Dialog ─────────────────────────────────────────────────────
function ReceiveGoodsDialog({ open, onOpenChange, purchaseOrderId, po }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  purchaseOrderId: number;
  po: any;
}) {
  const lineItems = (po?.lineItems as POLineItem[] | null) || [];
  const [lines, setLines] = useState(() =>
    lineItems.map((_, idx) => ({
      lineIndex: idx,
      receivedQty: 0,
      conditionStatus: "good" as "good" | "damaged" | "partial_damage",
      notes: "",
    }))
  );
  const [feedbackPrompt, setFeedbackPrompt] = useState<{ supplierId: number; supplierName: string; poId: number } | null>(null);

  const utils = trpc.useUtils();
  const { data: suppliersData } = trpc.suppliers.list.useQuery({ activeOnly: true, supplierScope: "manufacturing" });

  const createReceipt = trpc.procurement.receipts.create.useMutation({
    onSuccess: (data) => {
      toast.success("Goods received recorded successfully");
      utils.procurement.receipts.invalidate();
      utils.manufacturing.purchaseOrders.invalidate();
      if (data.fullyReceived && data.supplierId) {
        setFeedbackPrompt({ supplierId: data.supplierId, supplierName: data.supplierName || "Supplier", poId: data.poId });
      } else {
        onOpenChange(false);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setLines(lineItems.map((_, idx) => ({
        lineIndex: idx,
        receivedQty: 0,
        conditionStatus: "good" as "good" | "damaged" | "partial_damage",
        notes: "",
      })));
      setFeedbackPrompt(null);
    }
    onOpenChange(v);
  };

  const handleSubmit = () => {
    const validLines = lines.filter(l => l.receivedQty > 0);
    if (validLines.length === 0) {
      toast.error("Please enter at least one received quantity");
      return;
    }
    createReceipt.mutate({ purchaseOrderId, lines: validLines });
  };

  // Supplier feedback prompt after full receipt
  if (feedbackPrompt) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rate Supplier Performance</DialogTitle>
          </DialogHeader>
          <SupplierFeedbackDialog
            open={true}
            onOpenChange={(v) => { if (!v) { setFeedbackPrompt(null); onOpenChange(false); } }}
            suppliers={suppliersData || []}
            prefillSupplierId={feedbackPrompt.supplierId}
            prefillPoId={feedbackPrompt.poId}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Goods Received — {po?.poNumber || `PO-${purchaseOrderId}`}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">Supplier: {po?.supplier || "Unknown"}</p>

        <div className="space-y-3">
          {lineItems.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium text-sm">{item.productName}</span>
                  {item.productCode && <span className="text-xs text-muted-foreground ml-2">({item.productCode})</span>}
                </div>
                <span className="text-sm text-muted-foreground">Ordered: {item.quantity} {item.unit || ""}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Qty Received</label>
                  <Input
                    type="number"
                    min={0}
                    value={lines[idx]?.receivedQty || 0}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[idx] = { ...updated[idx], receivedQty: Number(e.target.value) };
                      setLines(updated);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Condition</label>
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
                  <label className="text-xs text-muted-foreground block mb-1">Notes</label>
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

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={createReceipt.isPending || lines.every(l => l.receivedQty === 0)}
          >
            {createReceipt.isPending ? "Saving..." : "Confirm Receipt"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
