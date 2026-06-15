import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRightLeft, Plus, Check, Truck, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  in_transit: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function InventoryTransfers() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);

  const { data: transfers, isLoading } = trpc.inventory.transfers.list.useQuery({
    status: statusFilter !== "all" ? statusFilter as any : undefined,
  });
  const { data: stockItems } = trpc.inventory.stockItems.list.useQuery({});
  const { data: branches } = trpc.manufacturing.branches.useQuery();
  const utils = trpc.useUtils();

  const approve = trpc.inventory.transfers.approve.useMutation({
    onSuccess: () => { utils.inventory.transfers.list.invalidate(); toast.success("Transfer approved"); },
  });
  const markInTransit = trpc.inventory.transfers.markInTransit.useMutation({
    onSuccess: () => { utils.inventory.transfers.list.invalidate(); toast.success("Marked in transit"); },
  });
  const complete = trpc.inventory.transfers.complete.useMutation({
    onSuccess: () => { utils.inventory.transfers.list.invalidate(); utils.inventory.reports.invalidate(); toast.success("Transfer completed"); },
  });
  const cancel = trpc.inventory.transfers.cancel.useMutation({
    onSuccess: () => { utils.inventory.transfers.list.invalidate(); toast.success("Transfer cancelled"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6" /> Inter-Branch Transfers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Transfer stock between branches</p>
        </div>
        <Button variant="brand" onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Transfer
        </Button>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="in_transit">In Transit</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !transfers?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No transfers found</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Transfer #</th>
                <th className="text-left p-2 font-medium">Item</th>
                <th className="text-left p-2 font-medium">From</th>
                <th className="text-left p-2 font-medium">To</th>
                <th className="text-right p-2 font-medium">Qty</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Requested</th>
                <th className="p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => {
                const item = stockItems?.find(s => s.id === t.stockItemId);
                const fromBranch = branches?.find(b => b.id === t.fromBranchId);
                const toBranch = branches?.find(b => b.id === t.toBranchId);
                return (
                  <tr key={t.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{t.transferNumber}</td>
                    <td className="p-2 font-medium">{item?.name || `#${t.stockItemId}`}</td>
                    <td className="p-2">{fromBranch?.name || "-"}</td>
                    <td className="p-2">{toBranch?.name || "-"}</td>
                    <td className="p-2 text-right font-semibold">{t.quantity} {t.unitType === "lm" ? "LM" : "EA"}</td>
                    <td className="p-2">
                      <Badge className={STATUS_COLORS[t.status] + " text-xs"}>{t.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {t.requestedBy || "-"}<br />{new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {t.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => approve.mutate({ id: t.id })}>
                              <Check className="h-3 w-3 mr-0.5" /> Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => cancel.mutate({ id: t.id })}>
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {t.status === "approved" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markInTransit.mutate({ id: t.id })}>
                            <Truck className="h-3 w-3 mr-0.5" /> Ship
                          </Button>
                        )}
                        {t.status === "in_transit" && (
                          <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => complete.mutate({ id: t.id })}>
                            <Check className="h-3 w-3 mr-0.5" /> Received
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateTransferDialog open={showDialog} onOpenChange={setShowDialog} stockItems={stockItems || []} branches={branches || []} />
    </div>
  );
}

function CreateTransferDialog({ open, onOpenChange, stockItems, branches }: {
  open: boolean; onOpenChange: (v: boolean) => void; stockItems: any[]; branches: any[];
}) {
  const [stockItemId, setStockItemId] = useState("");
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitType, setUnitType] = useState<"unit" | "lm">("unit");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const create = trpc.inventory.transfers.create.useMutation({
    onSuccess: () => { utils.inventory.transfers.list.invalidate(); onOpenChange(false); toast.success("Transfer request created"); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const reset = () => { setStockItemId(""); setFromBranchId(""); setToBranchId(""); setQuantity(""); setNotes(""); };

  const handleSubmit = () => {
    if (!stockItemId || !fromBranchId || !toBranchId || !quantity) return;
    if (fromBranchId === toBranchId) { toast.error("From and To branches must be different"); return; }
    create.mutate({ stockItemId: Number(stockItemId), fromBranchId: Number(fromBranchId), toBranchId: Number(toBranchId), quantity, unitType, notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Inter-Branch Transfer</DialogTitle></DialogHeader>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>From Branch *</Label>
              <Select value={fromBranchId} onValueChange={setFromBranchId}>
                <SelectTrigger><SelectValue placeholder="From" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Branch *</Label>
              <Select value={toBranchId} onValueChange={setToBranchId}>
                <SelectTrigger><SelectValue placeholder="To" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Quantity *</Label><Input type="number" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
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
          <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !stockItemId || !fromBranchId || !toBranchId || !quantity}>
            Create Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
