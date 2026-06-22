import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Package, Plus, Loader2, Trash2, DollarSign, Truck, CheckCircle2,
  Clock, AlertTriangle, Search, Building2, ShoppingCart, RefreshCw,
  ExternalLink, Copy, GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface ProcurementSectionProps {
  jobId: number;
  clientName?: string;
  quoteNumber?: string | null;
  siteAddress?: string | null;
}

// ─── Component Order Status Config ──────────────────────────────────────────

const CO_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300", icon: Clock },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Truck },
  confirmed: { label: "Confirmed", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300", icon: CheckCircle2 },
  shipped: { label: "Shipped", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Truck },
  received: { label: "Received", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: AlertTriangle },
};

// ─── Purchase Order Status Config ───────────────────────────────────────────

const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  SUBMITTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  AUTHORISED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  VOIDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  DELETED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  BILLED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

interface LineItem {
  description: string;
  qty: string;
  length: string;
  unitPrice: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ProcurementSection({ jobId, clientName, quoteNumber, siteAddress }: ProcurementSectionProps) {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="purchase-orders" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="purchase-orders" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="component-orders" className="gap-2">
            <Package className="h-4 w-4" />
            Component Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-orders" className="mt-4">
          <PurchaseOrdersTab jobId={jobId} />
        </TabsContent>

        <TabsContent value="component-orders" className="mt-4">
          <ComponentOrdersTab
            jobId={jobId}
            clientName={clientName}
            quoteNumber={quoteNumber}
            siteAddress={siteAddress}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Purchase Orders Tab ────────────────────────────────────────────────────

function PurchaseOrdersTab({ jobId }: { jobId: number }) {
  const connectionStatus = trpc.xero.connectionStatus.useQuery();
  const jobDocuments = trpc.xero.getJobDocuments.useQuery(
    { jobId },
    { enabled: connectionStatus.data?.connected === true }
  );
  const refreshStatus = trpc.xero.refreshDocumentStatus.useMutation({
    onSuccess: () => {
      jobDocuments.refetch();
      toast.success("Status refreshed");
    },
  });

  const purchaseOrders = (jobDocuments.data || []).filter((d: any) => d.invoiceType === "purchase_order");

  if (!connectionStatus.data?.connected) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            Connect Xero in Settings to enable purchase orders.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold">{purchaseOrders.length}</div>
          <div className="text-xs text-muted-foreground">Total POs</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold">
            {purchaseOrders.filter((po: any) => po.status === "AUTHORISED" || po.status === "SUBMITTED").length}
          </div>
          <div className="text-xs text-muted-foreground">Active</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">
            ${purchaseOrders.reduce((sum: number, po: any) => sum + parseFloat(po.amount || "0"), 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground">Total Value</div>
        </Card>
      </div>

      {/* Create PO Button */}
      <CreatePurchaseOrderDialog jobId={jobId} onSuccess={() => jobDocuments.refetch()} />

      {/* PO List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Purchase Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No purchase orders created yet.</p>
          ) : (
            <div className="space-y-2">
              {purchaseOrders.map((po: any) => (
                <div key={po.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{po.xeroInvoiceNumber || "Draft PO"}</p>
                    <p className="text-xs text-muted-foreground">{po.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      ${parseFloat(po.amount || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                    </span>
                    <Badge className={PO_STATUS_COLORS[po.status] || "bg-slate-100"} variant="secondary">
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
        <Button>
          <Plus className="h-4 w-4 mr-1.5" /> New Purchase Order
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
              placeholder="Site address"
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

// ─── Sortable Line Item Row ────────────────────────────────────────────────

function SortableLineItemRow({
  id,
  li,
  idx,
  updateLineItem,
  duplicateLineItem,
  removeLineItem,
  canRemove,
}: {
  id: string;
  li: LineItem;
  idx: number;
  updateLineItem: (idx: number, field: keyof LineItem, value: string) => void;
  duplicateLineItem: (idx: number) => void;
  removeLineItem: (idx: number) => void;
  canRemove: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-12 gap-2 items-start">
      <div className="col-span-1 flex items-center justify-center pt-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="col-span-3">
        <Input
          value={li.description}
          onChange={e => updateLineItem(idx, "description", e.target.value)}
          placeholder="Item description..."
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number"
          value={li.qty}
          onChange={e => updateLineItem(idx, "qty", e.target.value)}
          placeholder="Qty"
          min="1"
        />
      </div>
      <div className="col-span-2">
        <Input
          value={li.length}
          onChange={e => updateLineItem(idx, "length", e.target.value)}
          placeholder="e.g. 3.6m"
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number"
          value={li.unitPrice}
          onChange={e => updateLineItem(idx, "unitPrice", e.target.value)}
          placeholder="Unit $"
          step="0.01"
        />
      </div>
      <div className="col-span-2 flex gap-0.5 justify-center pt-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => duplicateLineItem(idx)} title="Duplicate line">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLineItem(idx)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Component Orders Tab ───────────────────────────────────────────────────

function ComponentOrdersTab({
  jobId,
  clientName,
  quoteNumber,
  siteAddress,
}: {
  jobId: number;
  clientName?: string;
  quoteNumber?: string | null;
  siteAddress?: string | null;
}) {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", qty: "1", length: "", unitPrice: "" }]);
  const [lineItemIds, setLineItemIds] = useState<string[]>([crypto.randomUUID()]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lineItemIds.indexOf(active.id as string);
    const newIndex = lineItemIds.indexOf(over.id as string);
    setLineItems(arrayMove(lineItems, oldIndex, newIndex));
    setLineItemIds(arrayMove(lineItemIds, oldIndex, newIndex));
  }

  // Supplier picker state
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", contactName: "", phone: "", email: "", category: "" });

  const ordersQuery = trpc.construction.jobComponentOrders.list.useQuery({ jobId });
  const suppliersQuery = trpc.suppliers.list.useQuery({ activeOnly: true, supplierScope: "construction" });
  const utils = trpc.useUtils();

  const createMutation = trpc.construction.jobComponentOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Component order created");
      utils.construction.jobComponentOrders.list.invalidate({ jobId });
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.construction.jobComponentOrders.update.useMutation({
    onSuccess: () => {
      toast.success("Order updated");
      utils.construction.jobComponentOrders.list.invalidate({ jobId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.construction.jobComponentOrders.delete.useMutation({
    onSuccess: () => {
      toast.success("Order deleted");
      utils.construction.jobComponentOrders.list.invalidate({ jobId });
    },
    onError: (e) => toast.error(e.message),
  });

  const quickAddMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success("Supplier added to directory");
      utils.suppliers.list.invalidate();
      setSupplier(quickAddForm.name);
      setShowQuickAdd(false);
      setQuickAddForm({ name: "", contactName: "", phone: "", email: "", category: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setShowCreate(false);
    setSupplier("");
    setNotes("");
    setLineItems([{ description: "", qty: "1", length: "", unitPrice: "" }]);
    setLineItemIds([crypto.randomUUID()]);
    setSupplierSearch("");
  }

  function addLineItem() {
    setLineItems([...lineItems, { description: "", qty: "1", length: "", unitPrice: "" }]);
    setLineItemIds([...lineItemIds, crypto.randomUUID()]);
  }

  function removeLineItem(idx: number) {
    setLineItems(lineItems.filter((_, i) => i !== idx));
    setLineItemIds(lineItemIds.filter((_, i) => i !== idx));
  }

  function duplicateLineItem(idx: number) {
    const copy = { ...lineItems[idx], length: "" };
    const updated = [...lineItems];
    updated.splice(idx + 1, 0, copy);
    setLineItems(updated);
    const updatedIds = [...lineItemIds];
    updatedIds.splice(idx + 1, 0, crypto.randomUUID());
    setLineItemIds(updatedIds);
  }

  function updateLineItem(idx: number, field: keyof LineItem, value: string) {
    const updated = [...lineItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setLineItems(updated);
  }

  const total = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.qty) || 0;
    const price = parseFloat(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  function handleCreate() {
    const validItems = lineItems.filter(li => li.description.trim());
    createMutation.mutate({
      jobId,
      supplier: supplier || undefined,
      lineItems: validItems,
      totalCost: total.toFixed(2),
      notes: notes || undefined,
    });
  }

  // Filtered suppliers for the picker
  const filteredSuppliers = useMemo(() => {
    const all = suppliersQuery.data || [];
    if (!supplierSearch.trim()) return all;
    const q = supplierSearch.toLowerCase();
    return all.filter(s => s.name.toLowerCase().includes(q) || (s.contactName || "").toLowerCase().includes(q));
  }, [suppliersQuery.data, supplierSearch]);

  function selectSupplier(s: { name: string; contactName?: string | null; phone?: string | null; email?: string | null }) {
    setSupplier(s.name);
    setSupplierPickerOpen(false);
    setSupplierSearch("");
    const details: string[] = [];
    if (s.contactName) details.push(`Contact: ${s.contactName}`);
    if (s.phone) details.push(`Ph: ${s.phone}`);
    if (s.email) details.push(`Email: ${s.email}`);
    if (details.length > 0 && !notes) {
      setNotes(details.join(" | "));
    }
  }

  function handleQuickAdd() {
    if (!quickAddForm.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    quickAddMutation.mutate({
      name: quickAddForm.name,
      contactName: quickAddForm.contactName || undefined,
      phone: quickAddForm.phone || undefined,
      email: quickAddForm.email || undefined,
      category: quickAddForm.category || undefined,
      supplierScope: "construction",
    });
  }

  const orders = ordersQuery.data || [];
  const totalSpend = orders.reduce((sum, o) => sum + parseFloat(o.totalCost || "0"), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold">{orders.length}</div>
          <div className="text-xs text-muted-foreground">Total Orders</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold">{orders.filter(o => o.status === "draft").length}</div>
          <div className="text-xs text-muted-foreground">Drafts</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold">{orders.filter(o => ["submitted", "confirmed", "shipped"].includes(o.status)).length}</div>
          <div className="text-xs text-muted-foreground">In Progress</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">${totalSpend.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</div>
          <div className="text-xs text-muted-foreground">Total Spend</div>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Component Order
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const params = new URLSearchParams();
            params.set("jobId", String(jobId));
            navigate(`/construction/component-orders?${params.toString()}`);
          }}
        >
          <ExternalLink className="h-4 w-4 mr-1.5" /> Open Full Order Form
        </Button>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); else setShowCreate(true); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> New Component Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Supplier Picker */}
            <div className="space-y-2">
              <Label>Supplier</Label>
              <div className="flex gap-2">
                <Popover open={supplierPickerOpen} onOpenChange={setSupplierPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      role="combobox"
                    >
                      <Building2 className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                      {supplier || <span className="text-muted-foreground">Select supplier...</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="flex items-center gap-2 px-2">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          value={supplierSearch}
                          onChange={e => setSupplierSearch(e.target.value)}
                          placeholder="Search suppliers..."
                          className="border-0 h-8 focus-visible:ring-0 p-0"
                        />
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto p-1">
                      {filteredSuppliers.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4">
                          No suppliers found.
                        </div>
                      ) : (
                        filteredSuppliers.map(s => (
                          <button
                            key={s.id}
                            className="w-full text-left px-3 py-2 rounded-sm hover:bg-accent text-sm flex flex-col"
                            onClick={() => selectSupplier(s)}
                          >
                            <span className="font-medium">{s.name}</span>
                            {(s.contactName || s.phone) && (
                              <span className="text-xs text-muted-foreground">
                                {[s.contactName, s.phone].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs"
                        onClick={() => {
                          setSupplierPickerOpen(false);
                          setShowQuickAdd(true);
                          setQuickAddForm({ ...quickAddForm, name: supplierSearch });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add new supplier
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {supplier && (
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSupplier("")}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {!supplier && (
                <Input
                  value={supplier}
                  onChange={e => setSupplier(e.target.value)}
                  placeholder="Or type supplier name manually..."
                  className="text-sm"
                />
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <Label>Line Items</Label>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-1"></div>
                <div className="col-span-3">Description</div>
                <div className="col-span-2">Quantity</div>
                <div className="col-span-2">Length</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-2"></div>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={lineItemIds} strategy={verticalListSortingStrategy}>
                  {lineItems.map((li, idx) => (
                    <SortableLineItemRow
                      key={lineItemIds[idx]}
                      id={lineItemIds[idx]}
                      li={li}
                      idx={idx}
                      updateLineItem={updateLineItem}
                      duplicateLineItem={duplicateLineItem}
                      removeLineItem={removeLineItem}
                      canRemove={lineItems.length > 1}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <Button variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
              <div className="text-right font-medium text-sm">
                Total: ${total.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Order notes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || lineItems.every(li => !li.description.trim())}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-Add Supplier Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Quick-Add Supplier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={quickAddForm.name} onChange={e => setQuickAddForm({ ...quickAddForm, name: e.target.value })} placeholder="Supplier name" />
            </div>
            <div>
              <Label>Contact Name</Label>
              <Input value={quickAddForm.contactName} onChange={e => setQuickAddForm({ ...quickAddForm, contactName: e.target.value })} placeholder="Contact person" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Phone</Label>
                <Input value={quickAddForm.phone} onChange={e => setQuickAddForm({ ...quickAddForm, phone: e.target.value })} placeholder="Phone" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={quickAddForm.email} onChange={e => setQuickAddForm({ ...quickAddForm, email: e.target.value })} placeholder="Email" />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={quickAddForm.category} onValueChange={v => setQuickAddForm({ ...quickAddForm, category: v })}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {["Roofing", "Electrical", "Plumbing", "Steel", "Concrete", "Timber", "Glass", "Paint", "Hardware", "Insulation", "Other"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
            <Button onClick={handleQuickAdd} disabled={quickAddMutation.isPending || !quickAddForm.name.trim()}>
              {quickAddMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Orders List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Component Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!ordersQuery.isLoading && orders.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No component orders yet.</p>
          )}
          <div className="space-y-3">
            {orders.map(order => {
              const sc = CO_STATUS_CONFIG[order.status] || CO_STATUS_CONFIG.draft;
              const Icon = sc.icon;
              const items = Array.isArray(order.lineItems) ? order.lineItems as LineItem[] : [];
              return (
                <div key={order.id} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                    <Badge className={sc.color}>
                      <Icon className="h-3 w-3 mr-0.5" /> {sc.label}
                    </Badge>
                    {order.supplier && <span className="text-sm text-muted-foreground">— {order.supplier}</span>}
                    <span className="ml-auto font-medium text-sm">
                      ${parseFloat(order.totalCost || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {items.length > 0 && (
                    <div className="text-sm text-muted-foreground mb-2">
                      {items.slice(0, 3).map((li: any, i: number) => (
                        <span key={i}>{li.description}{i < Math.min(items.length, 3) - 1 ? ", " : ""}</span>
                      ))}
                      {items.length > 3 && <span> +{items.length - 3} more</span>}
                    </div>
                  )}
                  {order.notes && <p className="text-xs text-muted-foreground mb-2">{order.notes}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <Select
                      value={order.status}
                      onValueChange={(val) => updateMutation.mutate({ id: order.id, status: val as any })}
                    >
                      <SelectTrigger className="h-7 text-xs w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => {
                        if (confirm("Delete this order?")) deleteMutation.mutate({ id: order.id });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
