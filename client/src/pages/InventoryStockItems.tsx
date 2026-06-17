import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Warehouse, Plus, Search, Pencil, AlertTriangle, Link2, Package } from "lucide-react";
import { toast } from "sonner";

function unitTypeFromUom(uom?: string) {
  return /\b(lm|linear|metre|meter|m)\b/i.test(uom || "") ? "lm" : "unit";
}

function stockDescriptionFromProduct(product: any) {
  return [
    product.description,
    product.colour ? `Colour: ${product.colour}` : "",
    product.subGroup ? `Sub-group: ${product.subGroup}` : "",
  ].filter(Boolean).join("\n");
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function InventoryStockItems() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkingItem, setLinkingItem] = useState<any>(null);

  const { data: items, isLoading } = trpc.inventory.stockItems.list.useQuery({
    search: search || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    condition: conditionFilter !== "all" ? conditionFilter as any : undefined,
    branchId: branchFilter !== "all" ? Number(branchFilter) : undefined,
  });
  const { data: categories } = trpc.inventory.stockItems.categories.useQuery();
  const { data: branches } = trpc.manufacturing.branches.useQuery();
  const { data: onHandReport } = trpc.inventory.reports.onHandByCategory.useQuery({
    branchId: branchFilter !== "all" ? Number(branchFilter) : undefined,
  });

  // Build on-hand map from report
  const onHandMap = new Map<number, { onHand: number; belowReorder: boolean }>();
  onHandReport?.forEach((r: any) => onHandMap.set(r.id, { onHand: r.onHand, belowReorder: r.belowReorder }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Warehouse className="h-6 w-6" /> Inventory
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Stock items linked to Manufacturing Data (source of truth)</p>
        </div>
        <Button variant="brand" onClick={() => { setEditingItem(null); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Stock Item
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={conditionFilter} onValueChange={setConditionFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Condition" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="damaged">Damaged</SelectItem>
            <SelectItem value="off_cut">Off Cut</SelectItem>
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
      ) : !items?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No stock items found</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Code</th>
                <th className="text-left p-2 font-medium">Name</th>
                <th className="text-left p-2 font-medium">Category</th>
                <th className="text-left p-2 font-medium">Unit</th>
                <th className="text-right p-2 font-medium">On Hand</th>
                <th className="text-right p-2 font-medium">Reorder Qty</th>
                <th className="text-left p-2 font-medium">Condition</th>
                <th className="text-left p-2 font-medium">Branch</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const stock = onHandMap.get(item.id);
                const belowReorder = stock?.belowReorder || false;
                return (
                  <tr key={item.id} className={`border-t ${belowReorder ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                    <td className="p-2 font-mono text-xs">{item.code}</td>
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2">{item.category}</td>
                    <td className="p-2">{item.unitType === "lm" ? "LM" : item.unit}</td>
                    <td className="p-2 text-right font-semibold">
                      {stock?.onHand ?? 0}
                      {belowReorder && <AlertTriangle className="h-3.5 w-3.5 inline ml-1 text-amber-500" />}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">{item.reorderQty ?? "-"}</td>
                    <td className="p-2">
                      <Badge variant={item.conditionIndicator === "new" ? "default" : item.conditionIndicator === "damaged" ? "destructive" : "secondary"}>
                        {item.conditionIndicator === "off_cut" ? "Off Cut" : item.conditionIndicator}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">
                      {branches?.find(b => b.id === item.branchId)?.name || "-"}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItem(item); setShowDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Refresh from Manufacturing Data" onClick={() => { setLinkingItem(item); setShowLinkDialog(true); }}>
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <StockItemDialog
        open={showDialog}
        onOpenChange={(nextOpen) => {
          setShowDialog(nextOpen);
          if (!nextOpen) setEditingItem(null);
        }}
        item={editingItem}
        branches={branches || []}
      />
      <ManufacturingProductLinkDialog open={showLinkDialog} onOpenChange={setShowLinkDialog} stockItem={linkingItem} />
    </div>
  );
}

function StockItemDialog({ open, onOpenChange, item, branches }: { open: boolean; onOpenChange: (v: boolean) => void; item: any; branches: any[] }) {
  const [code, setCode] = useState(item?.code || "");
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "general");
  const [unit, setUnit] = useState(item?.unit || "EA");
  const [unitType, setUnitType] = useState(item?.unitType || "unit");
  const [reorderQty, setReorderQty] = useState(item?.reorderQty || "");
  const [minStockLevel, setMinStockLevel] = useState(item?.minStockLevel || "");
  const [branchId, setBranchId] = useState(item?.branchId ? String(item.branchId) : "");
  const [conditionIndicator, setConditionIndicator] = useState(item?.conditionIndicator || "new");
  const [description, setDescription] = useState(item?.description || "");
  const [supplier, setSupplier] = useState(item?.supplier || "");
  const [costPrice, setCostPrice] = useState(item?.costPrice || "");
  const [productSearch, setProductSearch] = useState("");
  const utils = trpc.useUtils();

  const trimmedProductSearch = productSearch.trim();
  const { data: manufacturingProducts, isLoading: productsLoading } = trpc.manufacturingData.search.useQuery(
    { query: trimmedProductSearch, limit: 8 },
    { enabled: open && trimmedProductSearch.length >= 2 }
  );

  const resetForm = (sourceItem?: any) => {
    setCode(sourceItem?.code || "");
    setName(sourceItem?.name || "");
    setCategory(sourceItem?.category || "general");
    setUnit(sourceItem?.unit || "EA");
    setUnitType(sourceItem?.unitType || "unit");
    setReorderQty(sourceItem?.reorderQty || "");
    setMinStockLevel(sourceItem?.minStockLevel || "");
    setBranchId(sourceItem?.branchId ? String(sourceItem.branchId) : "");
    setConditionIndicator(sourceItem?.conditionIndicator || "new");
    setDescription(sourceItem?.description || "");
    setSupplier(sourceItem?.supplier || "");
    setCostPrice(sourceItem?.costPrice || "");
    setProductSearch("");
  };

  useEffect(() => {
    if (open) resetForm(item);
  }, [open, item?.id]);

  const create = trpc.inventory.stockItems.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.inventory.stockItems.list.invalidate(),
        utils.inventory.stockItems.categories.invalidate(),
        utils.inventory.reports.onHandByCategory.invalidate(),
      ]);
      resetForm();
      onOpenChange(false);
      toast.success("Stock item created");
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.inventory.stockItems.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.inventory.stockItems.list.invalidate(),
        utils.inventory.stockItems.categories.invalidate(),
        utils.inventory.reports.onHandByCategory.invalidate(),
      ]);
      resetForm();
      onOpenChange(false);
      toast.success("Stock item updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleOpen = (v: boolean) => {
    if (v) resetForm(item);
    if (!v) resetForm();
    onOpenChange(v);
  };

  const handleSubmit = () => {
    if (!code.trim() || !name.trim()) return;
    const payload = {
      code: code.trim(),
      name: name.trim(),
      category: category.trim() || "general",
      unit: unit.trim() || "EA",
      unitType: unitType as "unit" | "lm",
      reorderQty: textOrNull(reorderQty),
      minStockLevel: textOrNull(minStockLevel),
      branchId: branchId ? Number(branchId) : null,
      conditionIndicator: conditionIndicator as "new" | "damaged" | "off_cut",
      description: textOrNull(description),
      supplier: textOrNull(supplier),
      costPrice: textOrNull(costPrice),
    };
    if (item) {
      update.mutate({ id: item.id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  const applyManufacturingProduct = (product: any) => {
    setCode(product.sku || "");
    setName(product.description || "");
    setCategory(product.category || product.subGroup || "general");
    setUnit(product.uom || "EA");
    setUnitType(unitTypeFromUom(product.uom));
    setCostPrice(product.unitCost ? String(product.unitCost) : "");
    setSupplier(product.supplier || "");
    setDescription(stockDescriptionFromProduct(product));
    setProductSearch("");
    toast.success("Stock item details filled from Manufacturing Data");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Edit Stock Item" : "Add Stock Item"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Source from Manufacturing Data</Label>
                <p className="text-xs text-muted-foreground">Search by code, description, category, sub-group, or colour. You can still enter a custom item manually.</p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search manufacturing products..."
                className="pl-8"
              />
            </div>
            {trimmedProductSearch.length >= 2 && (
              <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                {productsLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                ) : !manufacturingProducts?.length ? (
                  <div className="p-3 text-sm text-muted-foreground">No manufacturing products found. Enter the stock item manually.</div>
                ) : (
                  manufacturingProducts.map((product: any) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => applyManufacturingProduct(product)}
                      className="w-full border-b p-3 text-left text-sm hover:bg-muted/40 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{product.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {product.sku || "No code"}{product.colour ? ` · ${product.colour}` : ""}{product.uom ? ` · ${product.uom}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs">{product.category || "Uncategorised"}</Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Code *</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. BEAM-001" /></div>
            <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Item name" /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Category</Label><Input value={category} onChange={e => setCategory(e.target.value)} placeholder="general" /></div>
            <div><Label>Unit</Label><Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="EA" /></div>
            <div>
              <Label>Unit Type</Label>
              <Select value={unitType} onValueChange={setUnitType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unit">Unit (EA/PCS)</SelectItem>
                  <SelectItem value="lm">Linear Metre (LM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Reorder Qty</Label><Input type="number" value={reorderQty} onChange={e => setReorderQty(e.target.value)} /></div>
            <div><Label>Min Stock Level</Label><Input type="number" value={minStockLevel} onChange={e => setMinStockLevel(e.target.value)} /></div>
            <div><Label>Cost Price ($)</Label><Input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={conditionIndicator} onValueChange={setConditionIndicator}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="off_cut">Off Cut</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Supplier</Label><Input value={supplier} onChange={e => setSupplier(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending || !code.trim() || !name.trim()}>
            {create.isPending || update.isPending ? "Saving..." : item ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manufacturing Product Link Dialog ─────────────────────────────────────
function ManufacturingProductLinkDialog({ open, onOpenChange, stockItem }: { open: boolean; onOpenChange: (v: boolean) => void; stockItem: any }) {
  const [productSearch, setProductSearch] = useState("");
  const utils = trpc.useUtils();
  const trimmedProductSearch = productSearch.trim();

  const { data: manufacturingProducts, isLoading: productsLoading } = trpc.manufacturingData.search.useQuery(
    { query: trimmedProductSearch, limit: 12 },
    { enabled: open && trimmedProductSearch.length >= 2 }
  );

  const updateMutation = trpc.inventory.stockItems.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.inventory.stockItems.list.invalidate(),
        utils.inventory.stockItems.categories.invalidate(),
        utils.inventory.reports.onHandByCategory.invalidate(),
      ]);
      toast.success("Stock item refreshed from Manufacturing Data");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (open && stockItem) {
      setProductSearch([stockItem.code, stockItem.name].filter(Boolean).join(" "));
    }
    if (!open) setProductSearch("");
  }, [open, stockItem?.id]);

  const refreshFromProduct = (product: any) => {
    if (!stockItem?.id) return;
    const unitCost = Number(product.unitCost);
    updateMutation.mutate({
      id: stockItem.id,
      code: product.sku || stockItem.code,
      name: product.description || stockItem.name,
      category: product.category || product.subGroup || stockItem.category || "general",
      unit: product.uom || stockItem.unit || "EA",
      unitType: unitTypeFromUom(product.uom),
      supplier: product.supplier || null,
      costPrice: Number.isFinite(unitCost) ? unitCost.toFixed(2) : null,
      description: stockDescriptionFromProduct(product) || null,
    });
  };

  if (!stockItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Refresh from Manufacturing Data
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Stock Item: <span className="font-medium">{stockItem.code}</span> — {stockItem.name}
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Search Manufacturing Data</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search by code, description, category, sub-group, or colour..."
              className="pl-8"
            />
          </div>
        </div>

        {trimmedProductSearch.length >= 2 && (
          <div className="border rounded-lg max-h-[250px] overflow-y-auto">
            {productsLoading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Searching...</div>
            ) : !manufacturingProducts?.length ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                <p>No manufacturing products found for "{trimmedProductSearch}".</p>
                <p className="mt-1">Close this dialog and use Edit if this should remain a custom stock item.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Code</th>
                    <th className="text-left p-2 font-medium">Description</th>
                    <th className="text-left p-2 font-medium">Category</th>
                    <th className="text-left p-2 font-medium">Sub-Group</th>
                    <th className="text-left p-2 font-medium">Colour</th>
                    <th className="text-left p-2 font-medium">Unit</th>
                    <th className="text-right p-2 font-medium">Price</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {manufacturingProducts.map((product: any) => (
                    <tr key={product.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{product.sku || "-"}</td>
                      <td className="p-2">{product.description}</td>
                      <td className="p-2 text-xs">{product.category || "-"}</td>
                      <td className="p-2 text-xs">{product.subGroup || "-"}</td>
                      <td className="p-2 text-xs">{product.colour || "-"}</td>
                      <td className="p-2 text-xs">{product.uom || "EA"}</td>
                      <td className="p-2 text-right">${Number(product.unitCost || 0).toFixed(2)}</td>
                      <td className="p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          disabled={updateMutation.isPending}
                          onClick={() => refreshFromProduct(product)}
                        >
                          <Link2 className="h-3 w-3 mr-1" /> Use
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {trimmedProductSearch.length < 2 && (
          <div className="text-center py-3 text-muted-foreground text-sm">
            <p>Type at least 2 characters to search Manufacturing Data.</p>
            <p className="mt-1">Selecting a product updates this stock item with the manufacturing code, category, sub-group, colour, unit, and cost.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
