import { useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, Plus, ExternalLink, Pencil, CloudUpload, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const PO_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  issued: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  partially_received: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  received: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  paid: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STANDALONE_ORDER_VALUE = "standalone";

type LineItem = {
  productName: string;
  productCode?: string;
  quantity: string;
  unit?: string;
  unitPrice: string;
  colour?: string;
  description?: string;
};

type ManufacturingCatalogueProduct = {
  id: number;
  sku?: string;
  description: string;
  uom?: string;
  unitCost?: number;
  colour?: string;
  category?: string;
  supplier?: string;
};

type SupplierOption = {
  id: number;
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export default function ManufacturingPurchaseOrders() {
  const [status, setStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingPO, setEditingPO] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: pos, isLoading } = trpc.manufacturing.purchaseOrders.list.useQuery({ status });
  const updateStatus = trpc.manufacturing.purchaseOrders.updateStatus.useMutation({
    onSuccess: () => { utils.manufacturing.purchaseOrders.list.invalidate(); toast.success("PO status updated"); },
  });
  const syncToXero = trpc.manufacturing.xeroSync.syncPO.useMutation({
    onSuccess: () => { utils.manufacturing.purchaseOrders.list.invalidate(); toast.success("PO synced to Xero"); },
    onError: (err: any) => toast.error(err.message || "Xero sync failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Manufacturing Purchase Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">External procurement for manufacturing materials</p>
        </div>
        <Button variant="brand" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New PO
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* PO Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">PO #</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-left px-4 py-3 font-medium">Order</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Required By</th>
                <th className="text-left px-4 py-3 font-medium">Xero</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : !pos?.length ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No purchase orders found</td></tr>
              ) : (
                pos.map((po: any) => (
                  <tr key={po.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{po.poNumber}</td>
                    <td className="px-4 py-3">
                      <div>{po.supplier}</div>
                      {po.supplierEmail && <div className="text-xs text-muted-foreground">{po.supplierEmail}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {po.orderId ? (
                        <Link href={`/manufacturing/orders/${po.orderId}`}>
                          <span className="text-primary hover:underline cursor-pointer">{po.orderNumber} - {po.clientName}</span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Standalone manufacturing PO</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={po.status}
                        onValueChange={(val) => updateStatus.mutate({ id: po.id, status: val as any })}
                      >
                        <SelectTrigger className="h-7 w-[120px]">
                          <Badge variant="secondary" className={`text-xs ${PO_STATUS_COLORS[po.status] || ""}`}>
                            {po.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="issued">Issued</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="partially_received">Partially received</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right">{po.totalAmount ? `$${Number(po.totalAmount).toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 text-xs">{po.requiredByDate ? new Date(po.requiredByDate).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {po.xeroPoId ? (
                        <Badge variant="outline" className="text-xs text-green-600">Synced</Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => syncToXero.mutate({ poId: po.id })}
                          disabled={syncToXero.isPending}
                        >
                          <CloudUpload className="h-3 w-3 mr-1" /> Xero
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingPO(po)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {po.orderId && (
                          <Link href={`/manufacturing/orders/${po.orderId}`}>
                            <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO Dialog */}
      <CreatePODialog open={showCreate} onOpenChange={setShowCreate} />

      {/* Edit PO Line Items Dialog */}
      {editingPO && (
        <EditPODialog po={editingPO} onClose={() => setEditingPO(null)} />
      )}
    </div>
  );
}

function CreatePODialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [supplier, setSupplier] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierAbn, setSupplierAbn] = useState("");
  const [orderId, setOrderId] = useState(STANDALONE_ORDER_VALUE);
  const [requiredByDate, setRequiredByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { productName: "", quantity: "1", unitPrice: "", unit: "ea" },
  ]);
  const utils = trpc.useUtils();

  const { data: orders } = trpc.manufacturing.orders.list.useQuery({ status: "all" });
  const createPO = trpc.manufacturing.purchaseOrders.create.useMutation({
    onSuccess: (data: any) => {
      utils.manufacturing.purchaseOrders.list.invalidate();
      onOpenChange(false);
      toast.success(`PO ${data.poNumber} created`);
      setSupplier(""); setSupplierEmail(""); setSupplierPhone(""); setSupplierAddress(""); setSupplierAbn("");
      setOrderId(STANDALONE_ORDER_VALUE); setRequiredByDate(""); setNotes("");
      setLineItems([{ productName: "", quantity: "1", unitPrice: "", unit: "ea" }]);
    },
    onError: (err) => toast.error(err.message || "Failed to create PO"),
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { productName: "", quantity: "1", unitPrice: "", unit: "ea" }]);
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: string) => {
    const items = [...lineItems];
    items[idx] = { ...items[idx], [field]: value };
    setLineItems(items);
  };

  const applyCatalogueItem = (idx: number, product: ManufacturingCatalogueProduct) => {
    const items = [...lineItems];
    items[idx] = {
      ...items[idx],
      productName: product.description,
      productCode: product.sku || undefined,
      unit: product.uom || items[idx].unit || "ea",
      unitPrice: String(product.unitCost ?? 0),
      colour: product.colour || items[idx].colour,
      description: product.category || items[idx].description,
    };
    setLineItems(items);
  };

  const removeLineItem = (idx: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")), 0
  );
  const validLineItems = lineItems.filter(li => li.productName.trim());

  const applySupplier = (nextSupplier: SupplierOption) => {
    setSupplier(nextSupplier.name);
    setSupplierEmail(nextSupplier.email || "");
    setSupplierPhone(nextSupplier.phone || "");
    setSupplierAddress(nextSupplier.address || "");
    setSupplierAbn(nextSupplier.abn || "");
  };

  const handleSubmit = () => {
    if (!supplier.trim() || validLineItems.length === 0) return;
    const linkedOrderId = orderId === STANDALONE_ORDER_VALUE ? undefined : Number(orderId);
    createPO.mutate({
      orderId: linkedOrderId,
      supplier: supplier.trim(),
      supplierEmail: supplierEmail || undefined,
      supplierPhone: supplierPhone || undefined,
      supplierAddress: supplierAddress || undefined,
      supplierAbn: supplierAbn || undefined,
      lineItems: validLineItems.map(li => ({
        productName: li.productName.trim(),
        productCode: li.productCode,
        quantity: Number(li.quantity) || 1,
        unit: li.unit,
        unitPrice: Number(li.unitPrice) || 0,
        totalPrice: (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0),
        colour: li.colour,
        description: li.description,
      })),
      totalAmount: totalAmount || undefined,
      requiredByDate: requiredByDate || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Manufacturing Order</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger><SelectValue placeholder="Standalone PO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={STANDALONE_ORDER_VALUE}>Standalone PO number</SelectItem>
                  {(orders || []).map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.orderNumber} - {o.clientName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">A PO number is generated automatically.</p>
            </div>
            <div>
              <Label>Required By</Label>
              <Input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier Name *</Label>
              <SupplierInput
                value={supplier}
                onValueChange={setSupplier}
                onSelect={applySupplier}
                placeholder="Select manufacturing supplier or type custom"
              />
            </div>
            <div>
              <Label>Supplier Email</Label>
              <Input type="email" value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} placeholder="supplier@example.com" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">Line Items</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addLineItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_60px_80px_60px_30px] gap-2 items-end">
                  <div>
                    {idx === 0 && <Label className="text-[10px] text-muted-foreground">Product / Custom Item</Label>}
                    <ManufacturingProductInput
                      value={item.productName}
                      onValueChange={(value) => updateLineItem(idx, "productName", value)}
                      onSelect={(product) => applyCatalogueItem(idx, product)}
                      placeholder="Search manufacturing products or type custom"
                      className="h-8 text-xs"
                    />
                    {item.productCode && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.productCode}</p>}
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
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(idx, "unitPrice", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-[10px] text-muted-foreground">Unit</Label>}
                    <Input
                      value={item.unit || ""}
                      onChange={(e) => updateLineItem(idx, "unit", e.target.value)}
                      placeholder="ea"
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLineItem(idx)}
                    disabled={lineItems.length <= 1}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="text-right mt-2">
              <span className="text-sm font-medium">Total: ${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createPO.isPending || !supplier.trim() || validLineItems.length === 0}>
            {createPO.isPending ? "Creating..." : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPODialog({ po, onClose }: { po: any; onClose: () => void }) {
  const existingItems = (po.lineItems || []) as any[];
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existingItems.length > 0
      ? existingItems.map((li: any) => ({
          productName: li.productName || "",
          productCode: li.productCode || "",
          quantity: String(li.quantity || 1),
          unitPrice: String(li.unitPrice || 0),
          unit: li.unit || "ea",
          colour: li.colour || "",
          description: li.description || "",
        }))
      : [{ productName: "", quantity: "1", unitPrice: "", unit: "ea" }]
  );
  const utils = trpc.useUtils();

  const updateLineItems = trpc.manufacturing.purchaseOrders.updateLineItems.useMutation({
    onSuccess: () => {
      utils.manufacturing.purchaseOrders.list.invalidate();
      toast.success("Line items updated");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { productName: "", quantity: "1", unitPrice: "", unit: "ea" }]);
  };

  const updateItem = (idx: number, field: keyof LineItem, value: string) => {
    const items = [...lineItems];
    items[idx] = { ...items[idx], [field]: value };
    setLineItems(items);
  };

  const applyCatalogueItem = (idx: number, product: ManufacturingCatalogueProduct) => {
    const items = [...lineItems];
    items[idx] = {
      ...items[idx],
      productName: product.description,
      productCode: product.sku || undefined,
      unit: product.uom || items[idx].unit || "ea",
      unitPrice: String(product.unitCost ?? 0),
      colour: product.colour || items[idx].colour,
      description: product.category || items[idx].description,
    };
    setLineItems(items);
  };

  const removeItem = (idx: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + (parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0")), 0
  );

  const handleSave = () => {
    updateLineItems.mutate({
      id: po.id,
      lineItems: lineItems.filter(li => li.productName).map(li => ({
        productName: li.productName,
        productCode: li.productCode || undefined,
        quantity: Number(li.quantity) || 1,
        unit: li.unit || undefined,
        unitPrice: Number(li.unitPrice) || undefined,
        totalPrice: (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0),
        colour: li.colour || undefined,
        description: li.description || undefined,
      })),
      totalAmount,
    });
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Line Items — {po.poNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Line Items</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addLineItem}>
              <Plus className="h-3 w-3 mr-1" /> Add Item
            </Button>
          </div>
          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_60px_80px_60px_30px] gap-2 items-end">
                <div>
                  {idx === 0 && <Label className="text-[10px] text-muted-foreground">Product</Label>}
                  <ManufacturingProductInput
                    value={item.productName}
                    onValueChange={(value) => updateItem(idx, "productName", value)}
                    onSelect={(product) => applyCatalogueItem(idx, product)}
                    placeholder="Product name"
                    className="h-8 text-xs"
                  />
                  {item.productCode && <p className="mt-0.5 text-[10px] text-muted-foreground">{item.productCode}</p>}
                </div>
                <div>
                  {idx === 0 && <Label className="text-[10px] text-muted-foreground">Colour</Label>}
                  <Input
                    value={item.colour || ""}
                    onChange={(e) => updateItem(idx, "colour", e.target.value)}
                    placeholder="Colour"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  {idx === 0 && <Label className="text-[10px] text-muted-foreground">Qty</Label>}
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  {idx === 0 && <Label className="text-[10px] text-muted-foreground">Unit $</Label>}
                  <Input
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  {idx === 0 && <Label className="text-[10px] text-muted-foreground">Unit</Label>}
                  <Input
                    value={item.unit || ""}
                    onChange={(e) => updateItem(idx, "unit", e.target.value)}
                    placeholder="ea"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(idx)}
                  disabled={lineItems.length <= 1}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="text-right">
            <span className="text-sm font-medium">Total: ${totalAmount.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateLineItems.isPending}>
            {updateLineItems.isPending ? "Saving..." : "Save Line Items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierInput({
  value,
  onValueChange,
  onSelect,
  placeholder,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (supplier: SupplierOption) => void;
  placeholder?: string;
}) {
  const listId = useId().replace(/:/g, "-");
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery({
    search: value.trim() || undefined,
    supplierScope: "manufacturing",
    activeOnly: true,
  });

  const handleChange = (nextValue: string) => {
    onValueChange(nextValue);
    const match = suppliers.find((supplier: SupplierOption) =>
      supplier.name.toLowerCase() === nextValue.trim().toLowerCase()
    );
    if (match) onSelect(match);
  };

  return (
    <>
      <Input
        list={listId}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {suppliers.map((supplier: SupplierOption) => (
          <option key={supplier.id} value={supplier.name}>
            {[supplier.email, supplier.phone].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
    </>
  );
}

function ManufacturingProductInput({
  value,
  onValueChange,
  onSelect,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (product: ManufacturingCatalogueProduct) => void;
  placeholder?: string;
  className?: string;
}) {
  const listId = useId().replace(/:/g, "-");
  const { data: products = [] } = trpc.manufacturingData.search.useQuery(
    { query: value, limit: 8 },
    { enabled: value.trim().length >= 2 }
  );

  const handleChange = (nextValue: string) => {
    onValueChange(nextValue);
    const match = products.find((product: ManufacturingCatalogueProduct) =>
      product.description.toLowerCase() === nextValue.toLowerCase() ||
      (product.sku || "").toLowerCase() === nextValue.toLowerCase()
    );
    if (match) onSelect(match);
  };

  return (
    <>
      <Input
        list={listId}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={listId}>
        {products.map((product: ManufacturingCatalogueProduct) => (
          <option key={product.id} value={product.description}>
            {[product.sku, product.uom, product.unitCost != null ? `$${Number(product.unitCost).toFixed(2)}` : null].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
    </>
  );
}
