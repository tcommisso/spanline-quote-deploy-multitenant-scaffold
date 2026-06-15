import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownUp, Plus, Package, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MOVEMENT_LABELS: Record<string, { label: string; color: string; icon: "in" | "out" }> = {
  purchase: { label: "Purchase", color: "bg-green-100 text-green-800", icon: "in" },
  allocation: { label: "Allocation from Stores", color: "bg-blue-100 text-blue-800", icon: "out" },
  manufacture_use: { label: "Manufacturing Use", color: "bg-purple-100 text-purple-800", icon: "out" },
  adjustment_waste: { label: "Waste Adjustment", color: "bg-red-100 text-red-800", icon: "out" },
  transfer_in: { label: "Transfer In", color: "bg-emerald-100 text-emerald-800", icon: "in" },
  transfer_out: { label: "Transfer Out", color: "bg-orange-100 text-orange-800", icon: "out" },
};

export default function InventoryMovements() {
  const [stockItemFilter, setStockItemFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [movementType, setMovementType] = useState<"purchase" | "allocation" | "manufacture_use" | "adjustment_waste">("purchase");

  const { data: movements, isLoading } = trpc.inventory.movements.list.useQuery({
    stockItemId: stockItemFilter !== "all" ? Number(stockItemFilter) : undefined,
    branchId: branchFilter !== "all" ? Number(branchFilter) : undefined,
    movementType: typeFilter !== "all" ? typeFilter as any : undefined,
  });
  const { data: stockItems } = trpc.inventory.stockItems.list.useQuery({});
  const { data: branches } = trpc.manufacturing.branches.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowDownUp className="h-6 w-6" /> Stock Movements
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Record and track all inventory movements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setMovementType("purchase"); setShowDialog(true); }}>
            <ArrowDown className="h-4 w-4 mr-1 text-green-600" /> Purchase
          </Button>
          <Button variant="outline" onClick={() => { setMovementType("allocation"); setShowDialog(true); }}>
            <ArrowUp className="h-4 w-4 mr-1 text-blue-600" /> Allocate
          </Button>
          <Button variant="outline" onClick={() => { setMovementType("manufacture_use"); setShowDialog(true); }}>
            <Package className="h-4 w-4 mr-1 text-purple-600" /> Mfg Use
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { setMovementType("adjustment_waste"); setShowDialog(true); }}>
            <Trash2 className="h-4 w-4 mr-1" /> Waste
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={stockItemFilter} onValueChange={setStockItemFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Stock Item" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            {stockItems?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.code} - {s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="allocation">Allocation</SelectItem>
            <SelectItem value="manufacture_use">Manufacturing Use</SelectItem>
            <SelectItem value="adjustment_waste">Waste Adjustment</SelectItem>
            <SelectItem value="transfer_in">Transfer In</SelectItem>
            <SelectItem value="transfer_out">Transfer Out</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !movements?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowDownUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No movements recorded yet</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Date</th>
                <th className="text-left p-2 font-medium">Type</th>
                <th className="text-left p-2 font-medium">Item</th>
                <th className="text-left p-2 font-medium">Branch</th>
                <th className="text-right p-2 font-medium">Qty</th>
                <th className="text-left p-2 font-medium">Unit</th>
                <th className="text-left p-2 font-medium">Notes</th>
                <th className="text-left p-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => {
                const meta = MOVEMENT_LABELS[m.movementType] || { label: m.movementType, color: "", icon: "in" };
                const item = stockItems?.find(s => s.id === m.stockItemId);
                const branch = branches?.find(b => b.id === m.branchId);
                return (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="p-2">
                      <Badge className={meta.color + " text-xs"}>
                        {meta.icon === "in" ? <ArrowDown className="h-3 w-3 mr-0.5" /> : <ArrowUp className="h-3 w-3 mr-0.5" />}
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="p-2 font-medium">{item?.name || `#${m.stockItemId}`}</td>
                    <td className="p-2 text-muted-foreground">{branch?.name || "-"}</td>
                    <td className="p-2 text-right font-semibold">{m.quantity}</td>
                    <td className="p-2 text-muted-foreground">{m.unitType === "lm" ? "LM" : "EA"}</td>
                    <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{m.notes || "-"}</td>
                    <td className="p-2 text-xs">{m.createdBy || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RecordMovementDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        type={movementType}
        stockItems={stockItems || []}
        branches={branches || []}
      />
    </div>
  );
}

function RecordMovementDialog({ open, onOpenChange, type, stockItems, branches }: {
  open: boolean; onOpenChange: (v: boolean) => void; type: string; stockItems: any[]; branches: any[];
}) {
  const [stockItemId, setStockItemId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitType, setUnitType] = useState<"unit" | "lm">(type === "manufacture_use" ? "lm" : "unit");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const purchase = trpc.inventory.movements.recordPurchase.useMutation({
    onSuccess: () => { utils.inventory.invalidate(); onOpenChange(false); toast.success("Purchase recorded"); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const allocation = trpc.inventory.movements.recordAllocation.useMutation({
    onSuccess: () => { utils.inventory.invalidate(); onOpenChange(false); toast.success("Allocation recorded"); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const mfgUse = trpc.inventory.movements.recordManufactureUse.useMutation({
    onSuccess: () => { utils.inventory.invalidate(); onOpenChange(false); toast.success("Manufacturing use recorded"); reset(); },
    onError: (e) => toast.error(e.message),
  });
  const waste = trpc.inventory.movements.recordWasteAdjustment.useMutation({
    onSuccess: () => { utils.inventory.invalidate(); onOpenChange(false); toast.success("Waste adjustment recorded"); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const reset = () => { setStockItemId(""); setBranchId(""); setQuantity(""); setNotes(""); };

  const handleSubmit = () => {
    if (!stockItemId || !branchId || !quantity) return;
    const payload = { stockItemId: Number(stockItemId), branchId: Number(branchId), quantity, unitType, notes: notes || undefined };
    switch (type) {
      case "purchase": purchase.mutate(payload); break;
      case "allocation": allocation.mutate(payload); break;
      case "manufacture_use": mfgUse.mutate(payload); break;
      case "adjustment_waste": waste.mutate(payload); break;
    }
  };

  const labels: Record<string, string> = {
    purchase: "Record Purchase",
    allocation: "Record Allocation from Stores",
    manufacture_use: "Record Manufacturing Use (Coils)",
    adjustment_waste: "Record Waste Adjustment",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{labels[type] || "Record Movement"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Stock Item *</Label>
            <Select value={stockItemId} onValueChange={setStockItemId}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {stockItems.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.code} - {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch *</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Quantity *</Label>
              <Input type="number" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Unit Type</Label>
              <Select value={unitType} onValueChange={v => setUnitType(v as "unit" | "lm")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">Unit (EA)</SelectItem>
                  <SelectItem value="lm">Linear Metre (LM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={type === "adjustment_waste" ? "Reason for waste..." : "Optional notes"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!stockItemId || !branchId || !quantity}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
