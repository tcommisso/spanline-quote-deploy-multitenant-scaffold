import { useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Receipt, Plus, ExternalLink, Pencil, CloudUpload, X, Package, Search } from "lucide-react";
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
  subGroup?: string;
};

type SupplierOption = {
  id: number;
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type BranchOption = {
  id: number;
  name: string;
  address?: string | null;
};

function formatCurrency(value: number | string | undefined) {
  return Number(value || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function catalogueLineItem(product: ManufacturingCatalogueProduct, quantity: number): LineItem {
  return {
    productName: product.description,
    productCode: product.sku || undefined,
    quantity: String(quantity || 1),
    unit: product.uom || "ea",
    unitPrice: String(product.unitCost ?? 0),
    colour: product.colour || undefined,
    description: [product.category, product.subGroup].filter(Boolean).join(" / ") || undefined,
  };
}

function lineIdentity(item: LineItem) {
  return [
    item.productCode || "",
    item.productName.trim().toLowerCase(),
    item.colour || "",
    item.unit || "",
    item.unitPrice || "",
  ].join("|");
}

function addOrMergeLineItem(items: LineItem[], next: LineItem) {
  const nextKey = lineIdentity(next);
  const existingIndex = items.findIndex((item) => lineIdentity(item) === nextKey);
  if (existingIndex < 0) return [...items, next];
  return items.map((item, index) => {
    if (index !== existingIndex) return item;
    const quantity = Number(item.quantity || 0) + Number(next.quantity || 0);
    return { ...item, quantity: String(quantity || 1) };
  });
}

function colourStyle(colour: string | undefined) {
  const normalized = (colour || "").trim().toLowerCase();
  const named: Record<string, string> = {
    black: "#111827",
    ebony: "#111827",
    "ebony/black matt": "#111827",
    white: "#ffffff",
    surfmist: "#f5f2e8",
    primrose: "#f3e3a5",
    merino: "#d9c7a1",
    paperbark: "#cdbb93",
    monument: "#4b5563",
    mill: "#b6b8ba",
    galvanised: "#9ca3af",
    galvanized: "#9ca3af",
  };
  if (!normalized) return { backgroundColor: "transparent" };
  if (named[normalized]) return { backgroundColor: named[normalized] };
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) hash = (hash * 31 + normalized.charCodeAt(i)) % 360;
  return { backgroundColor: `hsl(${hash} 65% 55%)` };
}

function ProductColour({ colour }: { colour?: string }) {
  if (!colour) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-3.5 w-3.5 rounded-full border border-border shadow-sm" style={colourStyle(colour)} />
      <span>{colour}</span>
    </span>
  );
}

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
                <th className="text-left px-4 py-3 font-medium">Deliver To</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Required By</th>
                <th className="text-left px-4 py-3 font-medium">Xero</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : !pos?.length ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No purchase orders found</td></tr>
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
                    <td className="px-4 py-3 text-xs">
                      <div>{po.deliverToBranchName || "—"}</div>
                      {po.deliverToAddress && <div className="max-w-[220px] truncate text-muted-foreground">{po.deliverToAddress}</div>}
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
  const [deliverToBranchId, setDeliverToBranchId] = useState("");
  const [deliverToBranchName, setDeliverToBranchName] = useState("");
  const [deliverToAddress, setDeliverToAddress] = useState("");
  const [orderId, setOrderId] = useState(STANDALONE_ORDER_VALUE);
  const [requiredByDate, setRequiredByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const utils = trpc.useUtils();

  const { data: orders } = trpc.manufacturing.orders.list.useQuery({ status: "all" });
  const { data: branches = [] } = trpc.branches.list.useQuery();
  const createPO = trpc.manufacturing.purchaseOrders.create.useMutation({
    onSuccess: (data: any) => {
      utils.manufacturing.purchaseOrders.list.invalidate();
      onOpenChange(false);
      toast.success(`PO ${data.poNumber} created`);
      setSupplier(""); setSupplierEmail(""); setSupplierPhone(""); setSupplierAddress(""); setSupplierAbn("");
      setDeliverToBranchId(""); setDeliverToBranchName(""); setDeliverToAddress("");
      setOrderId(STANDALONE_ORDER_VALUE); setRequiredByDate(""); setNotes("");
      setLineItems([]);
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

  const addCatalogueItem = (product: ManufacturingCatalogueProduct, quantity: number) => {
    setLineItems((items) => addOrMergeLineItem(items, catalogueLineItem(product, quantity)));
  };

  const removeLineItem = (idx: number) => {
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

  const applyDeliverToBranch = (branchId: string) => {
    const branch = (branches as BranchOption[]).find((item) => String(item.id) === branchId);
    setDeliverToBranchId(branchId);
    setDeliverToBranchName(branch?.name || "");
    setDeliverToAddress(branch?.address || "");
  };

  const handleSubmit = () => {
    if (!supplier.trim() || validLineItems.length === 0) return;
    if (!deliverToBranchId) {
      toast.error("Select a deliver-to branch");
      return;
    }
    const linkedOrderId = orderId === STANDALONE_ORDER_VALUE ? undefined : Number(orderId);
    createPO.mutate({
      orderId: linkedOrderId,
      supplier: supplier.trim(),
      supplierEmail: supplierEmail || undefined,
      supplierPhone: supplierPhone || undefined,
      supplierAddress: supplierAddress || undefined,
      supplierAbn: supplierAbn || undefined,
      deliverToBranchId: Number(deliverToBranchId),
      deliverToBranchName: deliverToBranchName || undefined,
      deliverToAddress: deliverToAddress || undefined,
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
      <DialogContent className="!w-[calc(100vw-2rem)] sm:!w-[1100px] !max-w-[calc(100vw-2rem)] sm:!max-w-[92vw] max-h-[90vh] min-h-[min(620px,84vh)] !resize !overflow-auto !flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Linked Manufacturing Order</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger><SelectValue placeholder="Standalone PO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={STANDALONE_ORDER_VALUE}>No linked order - auto PO number</SelectItem>
                  {(orders || []).map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.orderNumber} - {o.clientName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Optional. A PO number is generated automatically.</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Deliver To *</Label>
              <Select value={deliverToBranchId} onValueChange={applyDeliverToBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(branches as BranchOption[]).map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Delivery location is sourced from Admin &gt; Company Settings &gt; Branch Offices.</p>
            </div>
            <div>
              <Label>Delivery Address</Label>
              <Textarea
                value={deliverToAddress}
                onChange={(e) => setDeliverToAddress(e.target.value)}
                placeholder="Branch delivery address"
                rows={2}
              />
            </div>
          </div>

          <ManufacturingProductCatalogue onAddProduct={addCatalogueItem} />

          <SelectedLineItemsEditor
            lineItems={lineItems}
            onAddCustomLine={addLineItem}
            onUpdateLine={updateLineItem}
            onRemoveLine={removeLineItem}
            totalAmount={totalAmount}
          />

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createPO.isPending || !supplier.trim() || !deliverToBranchId || validLineItems.length === 0}>
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

  const addCatalogueItem = (product: ManufacturingCatalogueProduct, quantity: number) => {
    setLineItems((items) => addOrMergeLineItem(items, catalogueLineItem(product, quantity)));
  };

  const removeItem = (idx: number) => {
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
      <DialogContent className="!w-[calc(100vw-2rem)] sm:!w-[1100px] !max-w-[calc(100vw-2rem)] sm:!max-w-[92vw] max-h-[90vh] min-h-[min(620px,84vh)] !resize !overflow-auto !flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Line Items — {po.poNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <ManufacturingProductCatalogue onAddProduct={addCatalogueItem} />
          <SelectedLineItemsEditor
            lineItems={lineItems}
            onAddCustomLine={addLineItem}
            onUpdateLine={updateItem}
            onRemoveLine={removeItem}
            totalAmount={totalAmount}
          />
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

function ManufacturingProductCatalogue({
  onAddProduct,
}: {
  onAddProduct: (product: ManufacturingCatalogueProduct, quantity: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [subGroup, setSubGroup] = useState("all");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const facetsQuery = trpc.manufacturingData.facets.useQuery();
  const productsQuery = trpc.manufacturingData.list.useQuery({
    search,
    category,
    subGroup,
    activeState: "active",
    limit: 120,
  });
  const categories = (facetsQuery.data?.categories || []) as string[];
  const subGroups = (facetsQuery.data?.subGroups || []) as string[];
  const products = (productsQuery.data || []) as ManufacturingCatalogueProduct[];

  const addProduct = (product: ManufacturingCatalogueProduct) => {
    const quantity = Math.max(1, Number(quantities[product.id] || 1));
    onAddProduct(product, quantity);
    setQuantities((current) => ({ ...current, [product.id]: "1" }));
    toast.success(`${product.description} added to PO`);
  };

  const resetFilters = () => {
    setCategory("all");
    setSubGroup("all");
    setSearch("");
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <div>
            <h3 className="font-semibold">Product Catalogue</h3>
            <p className="text-xs text-muted-foreground">Browse manufacturing products and add them to this PO.</p>
          </div>
        </div>
        <Badge variant="secondary">{products.length} shown</Badge>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sub-Category</Label>
            <Select value={subGroup} onValueChange={setSubGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Sub-category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sub-Categories</SelectItem>
                {subGroups.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full md:w-auto" onClick={resetFilters}>
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search code, description, colour, category..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[330px] overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Colour</th>
                <th className="px-3 py-2 text-left font-medium">UOM</th>
                <th className="px-3 py-2 text-right font-medium">Unit $</th>
                <th className="px-3 py-2 text-center font-medium">Qty</th>
                <th className="w-[72px] px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {productsQuery.isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading products...</td></tr>
              ) : !products.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No products found. Check the category/sub-category filters, try the product code with 0/O swapped, or import manufacturing data.
                  </td>
                </tr>
              ) : products.map((product) => (
                <tr key={product.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono">{product.sku || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{product.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[product.category, product.subGroup].filter(Boolean).join(" · ") || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2"><ProductColour colour={product.colour} /></td>
                  <td className="px-3 py-2">{product.uom || "ea"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(product.unitCost)}</td>
                  <td className="px-3 py-2 text-center">
                    <Input
                      type="number"
                      min="1"
                      value={quantities[product.id] || "1"}
                      onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))}
                      className="mx-auto h-8 w-16 text-center text-xs"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button type="button" size="sm" className="h-8 text-xs" onClick={() => addProduct(product)}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SelectedLineItemsEditor({
  lineItems,
  onAddCustomLine,
  onUpdateLine,
  onRemoveLine,
  totalAmount,
}: {
  lineItems: LineItem[];
  onAddCustomLine: () => void;
  onUpdateLine: (idx: number, field: keyof LineItem, value: string) => void;
  onRemoveLine: (idx: number) => void;
  totalAmount: number;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="font-semibold">PO Line Items</h3>
          <p className="text-xs text-muted-foreground">Review selected products or add a custom one-off item.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddCustomLine}>
          <Plus className="mr-1 h-3 w-3" />
          Custom Item
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="min-w-[240px] px-3 py-2 text-left font-medium">Product / Custom Item</th>
              <th className="min-w-[120px] px-3 py-2 text-left font-medium">Code</th>
              <th className="min-w-[140px] px-3 py-2 text-left font-medium">Colour</th>
              <th className="w-[80px] px-3 py-2 text-left font-medium">UOM</th>
              <th className="w-[90px] px-3 py-2 text-right font-medium">Unit $</th>
              <th className="w-[80px] px-3 py-2 text-center font-medium">Qty</th>
              <th className="w-[100px] px-3 py-2 text-right font-medium">Total</th>
              <th className="w-[48px] px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!lineItems.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Add products from the catalogue above or add a custom item.
                </td>
              </tr>
            ) : lineItems.map((item, idx) => {
              const quantity = Number(item.quantity || 0);
              const unitPrice = Number(item.unitPrice || 0);
              return (
                <tr key={`${lineIdentity(item)}-${idx}`}>
                  <td className="px-3 py-2">
                    <Input
                      value={item.productName}
                      onChange={(event) => onUpdateLine(idx, "productName", event.target.value)}
                      placeholder="Product name"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.productCode || ""}
                      onChange={(event) => onUpdateLine(idx, "productCode", event.target.value)}
                      placeholder="Code"
                      className="h-8 font-mono text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.colour || ""}
                      onChange={(event) => onUpdateLine(idx, "colour", event.target.value)}
                      placeholder="Colour"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={item.unit || ""}
                      onChange={(event) => onUpdateLine(idx, "unit", event.target.value)}
                      placeholder="ea"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) => onUpdateLine(idx, "unitPrice", event.target.value)}
                      className="h-8 text-right text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(event) => onUpdateLine(idx, "quantity", event.target.value)}
                      className="h-8 text-center text-xs"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(quantity * unitPrice)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveLine(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t px-4 py-3">
        <span className="text-sm font-semibold">Total: {formatCurrency(totalAmount)}</span>
      </div>
    </div>
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
