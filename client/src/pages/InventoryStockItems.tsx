import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Warehouse, Plus, Search, Pencil, AlertTriangle, Link2, Unlink, BookPlus, Package } from "lucide-react";
import { toast } from "sonner";

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
          <p className="text-muted-foreground text-sm mt-1">Stock items linked to Construction Data (source of truth)</p>
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
                <th className="text-left p-2 font-medium">Catalogue</th>
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
                    <td className="p-2">
                      {(item as any).catalogueItemId ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                          <Link2 className="h-3 w-3 mr-1" /> Linked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Unlinked
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">
                      {branches?.find(b => b.id === item.branchId)?.name || "-"}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItem(item); setShowDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Link to Catalogue" onClick={() => { setLinkingItem(item); setShowLinkDialog(true); }}>
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

      <StockItemDialog open={showDialog} onOpenChange={setShowDialog} item={editingItem} branches={branches || []} categories={categories || []} />
      <CatalogueLinkDialog open={showLinkDialog} onOpenChange={setShowLinkDialog} stockItem={linkingItem} />
    </div>
  );
}

function StockItemDialog({ open, onOpenChange, item, branches, categories }: { open: boolean; onOpenChange: (v: boolean) => void; item: any; branches: any[]; categories: string[] }) {
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
  const utils = trpc.useUtils();

  const create = trpc.inventory.stockItems.create.useMutation({
    onSuccess: () => { utils.inventory.stockItems.list.invalidate(); onOpenChange(false); toast.success("Stock item created"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.inventory.stockItems.update.useMutation({
    onSuccess: () => { utils.inventory.stockItems.list.invalidate(); onOpenChange(false); toast.success("Stock item updated"); },
    onError: (e) => toast.error(e.message),
  });

  const handleOpen = (v: boolean) => {
    if (v && item) {
      setCode(item.code); setName(item.name); setCategory(item.category); setUnit(item.unit);
      setUnitType(item.unitType); setReorderQty(item.reorderQty || ""); setMinStockLevel(item.minStockLevel || "");
      setBranchId(item.branchId ? String(item.branchId) : ""); setConditionIndicator(item.conditionIndicator);
      setDescription(item.description || ""); setSupplier(item.supplier || ""); setCostPrice(item.costPrice || "");
    } else if (v && !item) {
      setCode(""); setName(""); setCategory("general"); setUnit("EA"); setUnitType("unit");
      setReorderQty(""); setMinStockLevel(""); setBranchId(""); setConditionIndicator("new");
      setDescription(""); setSupplier(""); setCostPrice("");
    }
    onOpenChange(v);
  };

  const handleSubmit = () => {
    if (!code.trim() || !name.trim()) return;
    const payload = {
      code, name, category, unit, unitType: unitType as "unit" | "lm",
      reorderQty: reorderQty || undefined,
      minStockLevel: minStockLevel || undefined,
      branchId: branchId ? Number(branchId) : undefined,
      conditionIndicator: conditionIndicator as "new" | "damaged" | "off_cut",
      description: description || undefined,
      supplier: supplier || undefined,
      costPrice: costPrice || undefined,
    };
    if (item) {
      update.mutate({ id: item.id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Edit Stock Item" : "Add Stock Item"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending || !code.trim() || !name.trim()}>
            {item ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catalogue Link Dialog ─────────────────────────────────────────────────
function CatalogueLinkDialog({ open, onOpenChange, stockItem }: { open: boolean; onOpenChange: (v: boolean) => void; stockItem: any }) {
  const [catSearch, setCatSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const utils = trpc.useUtils();

  const stableQuery = useMemo(() => catSearch, [catSearch]);
  const { data: catResults, isLoading: catLoading } = trpc.inventory.catalogue.search.useQuery(
    { query: stableQuery },
    { enabled: stableQuery.length >= 2 }
  );

  const { data: linkedItem } = trpc.inventory.catalogue.getLinked.useQuery(
    { stockItemId: stockItem?.id },
    { enabled: !!stockItem?.id }
  );

  const linkMutation = trpc.inventory.catalogue.linkItem.useMutation({
    onSuccess: () => {
      utils.inventory.stockItems.list.invalidate();
      utils.inventory.catalogue.getLinked.invalidate();
      toast.success("Linked to catalogue item");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const unlinkMutation = trpc.inventory.catalogue.unlinkItem.useMutation({
    onSuccess: () => {
      utils.inventory.stockItems.list.invalidate();
      utils.inventory.catalogue.getLinked.invalidate();
      toast.success("Unlinked from catalogue");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!stockItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Link to Construction Data
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Stock Item: <span className="font-medium">{stockItem.code}</span> — {stockItem.name}
          </p>
        </DialogHeader>

        {/* Currently linked item */}
        {linkedItem && (
          <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
                <Link2 className="h-4 w-4" /> Currently Linked
              </p>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => unlinkMutation.mutate({ stockItemId: stockItem.id })}>
                <Unlink className="h-3 w-3 mr-1" /> Unlink
              </Button>
            </div>
            <p className="text-sm"><span className="font-mono">{linkedItem.spaCode}</span> — {linkedItem.description}</p>
            <p className="text-xs text-muted-foreground">Category: {linkedItem.category} | UOM: {linkedItem.uom} | Price: ${linkedItem.price}</p>
          </div>
        )}

        {/* Search catalogue */}
        <div className="space-y-2">
          <Label>Search Construction Data</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Search by SPA code or description..."
              className="pl-8"
            />
          </div>
        </div>

        {/* Search results */}
        {catSearch.length >= 2 && (
          <div className="border rounded-lg max-h-[250px] overflow-y-auto">
            {catLoading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">Searching...</div>
            ) : !catResults?.length ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                <p>No catalogue items found for "{catSearch}"</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowAddForm(true)}>
                  <BookPlus className="h-3.5 w-3.5 mr-1" /> Add to Catalogue
                </Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">SPA Code</th>
                    <th className="text-left p-2 font-medium">Description</th>
                    <th className="text-left p-2 font-medium">Category</th>
                    <th className="text-left p-2 font-medium">UOM</th>
                    <th className="text-right p-2 font-medium">Price</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {catResults.map((cat) => (
                    <tr key={cat.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{cat.spaCode}</td>
                      <td className="p-2">{cat.description}</td>
                      <td className="p-2 text-xs">{cat.category}</td>
                      <td className="p-2 text-xs">{cat.uom}</td>
                      <td className="p-2 text-right">${cat.price}</td>
                      <td className="p-2">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => linkMutation.mutate({ stockItemId: stockItem.id, catalogueItemId: cat.id })}>
                          <Link2 className="h-3 w-3 mr-1" /> Link
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Add to Catalogue form (workflow when item not found) */}
        {showAddForm && (
          <AddToCatalogueForm
            stockItem={stockItem}
            onSuccess={(newId) => {
              linkMutation.mutate({ stockItemId: stockItem.id, catalogueItemId: newId });
              setShowAddForm(false);
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {!showAddForm && catSearch.length < 2 && (
          <div className="text-center py-3 text-muted-foreground text-sm">
            <p>Type at least 2 characters to search the Construction Data.</p>
            <p className="mt-1">If the item doesn't exist, you can add it to the catalogue.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowAddForm(true)}>
              <BookPlus className="h-3.5 w-3.5 mr-1" /> Add New Catalogue Item
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add to Catalogue Form (inline workflow) ────────────────────────────────
function AddToCatalogueForm({ stockItem, onSuccess, onCancel }: { stockItem: any; onSuccess: (newId: number) => void; onCancel: () => void }) {
  const [spaCode, setSpaCode] = useState(stockItem?.code || "");
  const [description, setDescription] = useState(stockItem?.name || "");
  const [category, setCategory] = useState(stockItem?.category || "");
  const [subGroup, setSubGroup] = useState("");
  const [uom, setUom] = useState(stockItem?.unit || "EA");
  const [price, setPrice] = useState(stockItem?.costPrice || "");
  const [colour, setColour] = useState("");
  const [tags, setTags] = useState("");
  const utils = trpc.useUtils();

  const addMutation = trpc.inventory.catalogue.addToCatalogue.useMutation({
    onSuccess: (data) => {
      utils.inventory.catalogue.search.invalidate();
      toast.success("Item added to Construction Data");
      onSuccess(data.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-1">
          <BookPlus className="h-4 w-4" /> Add New Item to Construction Data
        </h4>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground">This will create a new catalogue entry and link it to the stock item.</p>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">SPA Code *</Label><Input value={spaCode} onChange={e => setSpaCode(e.target.value)} placeholder="e.g. BEAM-ALU-100" className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Category *</Label><Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Beams" className="h-8 text-sm" /></div>
      </div>
      <div><Label className="text-xs">Description *</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Full item description" className="h-8 text-sm" /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Sub-Group</Label><Input value={subGroup} onChange={e => setSubGroup(e.target.value)} placeholder="e.g. Aluminium" className="h-8 text-sm" /></div>
        <div><Label className="text-xs">UOM</Label><Input value={uom} onChange={e => setUom(e.target.value)} placeholder="EA" className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Price ($)</Label><Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="h-8 text-sm" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Colour</Label><Input value={colour} onChange={e => setColour(e.target.value)} placeholder="Optional" className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Tags (comma-separated)</Label><Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. Roof,Wall" className="h-8 text-sm" /></div>
      </div>
      <Button size="sm" onClick={() => {
        if (!spaCode.trim() || !description.trim() || !category.trim()) {
          toast.error("SPA Code, Description, and Category are required");
          return;
        }
        addMutation.mutate({ spaCode, description, category, subGroup: subGroup || undefined, uom: uom || undefined, price: price || undefined, colour: colour || undefined, tags: tags || undefined });
      }} disabled={addMutation.isPending}>
        {addMutation.isPending ? "Adding..." : "Add to Catalogue & Link"}
      </Button>
    </div>
  );
}
