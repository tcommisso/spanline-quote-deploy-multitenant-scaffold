import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Plus, Pencil, Archive, ArchiveRestore, Upload, Package, Tags, Layers, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

type CatalogueProduct = {
  id: number;
  spaCode: string;
  description: string;
  colour: string;
  uom: string;
  packQtySizes: string;
  price: number;
  category: string;
  subGroup?: string;
  tags?: string;
  isActive?: boolean;
  colourInputAllowed?: boolean;
  colourGroup?: string;
};

const PAGE_SIZE = 50;

const exportColumns: Array<{ header: string; getValue: (product: CatalogueProduct) => string | number | boolean | undefined }> = [
  { header: "SPA Code", getValue: (product) => product.spaCode },
  { header: "Description", getValue: (product) => product.description },
  { header: "Colour", getValue: (product) => product.colour },
  { header: "UOM", getValue: (product) => product.uom },
  { header: "Pack Qty/Sizes", getValue: (product) => product.packQtySizes },
  { header: "Price", getValue: (product) => product.price },
  { header: "Category", getValue: (product) => product.category },
  { header: "Sub-Group", getValue: (product) => product.subGroup },
  { header: "Tags", getValue: (product) => product.tags },
  { header: "Colour Group", getValue: (product) => product.colourGroup },
  { header: "Colour Input Allowed", getValue: (product) => product.colourInputAllowed },
  { header: "Active", getValue: (product) => product.isActive !== false },
];

function csvCell(value: string | number | boolean | undefined) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, products: CatalogueProduct[]) {
  const csv = [
    exportColumns.map((column) => csvCell(column.header)).join(","),
    ...products.map((product) => exportColumns.map((column) => csvCell(column.getValue(product))).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ComponentCatalogueAdmin() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [subGroupFilter, setSubGroupFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [editItem, setEditItem] = useState<CatalogueProduct | null>(null);
  const [addItem, setAddItem] = useState(false);
  const [showPriceImport, setShowPriceImport] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [showBulkSubGroup, setShowBulkSubGroup] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const { data: categories } = trpc.products.catalogueCategories.useQuery();
  const { data: subGroups } = trpc.smartshop.subGroups.useQuery();
  const { data: allTags } = trpc.smartshop.allTags.useQuery();
  const { data: results, isLoading } = trpc.smartshop.fetchProducts.useQuery(
    {
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      subGroup: subGroupFilter !== "all" ? subGroupFilter : undefined,
      tag: tagFilter !== "all" ? tagFilter : undefined,
      search: search.trim() || undefined,
      includeInactive: showInactive,
      limit: 500,
    },
    { placeholderData: (prev) => prev }
  );

  const updateMutation = trpc.smartshop.updateCatalogueProduct.useMutation({
    onSuccess: () => {
      toast.success("Product updated");
      setEditItem(null);
      utils.smartshop.fetchProducts.invalidate();
      utils.products.searchCatalogue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.smartshop.createCatalogueProduct.useMutation({
    onSuccess: () => {
      toast.success("Product added to catalogue");
      setAddItem(false);
      utils.smartshop.fetchProducts.invalidate();
      utils.products.searchCatalogue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleActiveMutation = trpc.smartshop.toggleCatalogueProductActive.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.active ? "Product reactivated" : "Product deactivated");
      utils.smartshop.fetchProducts.invalidate();
      utils.products.searchCatalogue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkTagMutation = trpc.smartshop.bulkUpdateTags.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated tags on ${data.updated} products`);
      setSelectedIds(new Set());
      setShowBulkTag(false);
      utils.smartshop.fetchProducts.invalidate();
      utils.smartshop.allTags.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkSubGroupMutation = trpc.smartshop.bulkUpdateSubGroup.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated sub-group on ${data.updated} products`);
      setSelectedIds(new Set());
      setShowBulkSubGroup(false);
      utils.smartshop.fetchProducts.invalidate();
      utils.smartshop.subGroups.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkDeleteMutation = trpc.smartshop.bulkDeleteCatalogueProducts.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} products`);
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      utils.smartshop.fetchProducts.invalidate();
      utils.products.searchCatalogue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const exportMutation = trpc.smartshop.exportCatalogueProducts.useMutation({
    onSuccess: (data) => {
      downloadCsv("component-order-data.csv", data.products);
      toast.success(`Exported ${data.products.length} products`);
    },
    onError: (err) => toast.error(err.message),
  });

  const allProducts = results?.products ?? [];
  const filteredProducts = useMemo(() => {
    let items = allProducts;
    if (!showInactive) {
      items = items.filter((p: any) => p.isActive !== false);
    }
    return items;
  }, [allProducts, showInactive]);

  const paginatedProducts = filteredProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);

  const allOnPageSelected = paginatedProducts.length > 0 && paginatedProducts.every((p: any) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const newSet = new Set(selectedIds);
      paginatedProducts.forEach((p: any) => newSet.delete(p.id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      paginatedProducts.forEach((p: any) => newSet.add(p.id));
      setSelectedIds(newSet);
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const exportFilters = {
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    subGroup: subGroupFilter !== "all" ? subGroupFilter : undefined,
    tag: tagFilter !== "all" ? tagFilter : undefined,
    search: search.trim() || undefined,
    includeInactive: showInactive,
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Component Order Data</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the product catalogue used for Component Orders. {filteredProducts.length} products.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate(exportFilters)}
          >
            {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPriceImport(true)}>
            <Upload className="h-3.5 w-3.5" /> Price Update CSV
          </Button>
          <Button variant="brand" size="sm" className="gap-1.5" onClick={() => setAddItem(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SPA code, description, colour..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(categories ?? []).map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subGroupFilter} onValueChange={(v) => { setSubGroupFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Sub-Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sub-Groups</SelectItem>
                {(subGroups ?? []).map((sg) => (
                  <SelectItem key={sg} value={sg}>{sg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {(allTags ?? []).map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
              <Label htmlFor="show-inactive" className="text-xs text-muted-foreground">Inactive</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowBulkTag(true)}>
            <Tags className="h-3.5 w-3.5" /> Set Tags
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowBulkSubGroup(true)}>
            <Layers className="h-3.5 w-3.5" /> Set Sub-Group
          </Button>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setShowBulkDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear Selection
          </Button>
        </div>
      )}

      {/* Products table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : paginatedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-8 w-8 mb-2" />
                <span className="text-sm">No products found</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="py-2.5 px-3 w-8">
                      <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
                    </th>
                    <th className="text-left py-2.5 px-3 font-medium">SPA Code</th>
                    <th className="text-left py-2.5 px-3 font-medium">Description</th>
                    <th className="text-left py-2.5 px-3 font-medium">Colour</th>
                    <th className="text-right py-2.5 px-3 font-medium">Price</th>
                    <th className="text-left py-2.5 px-3 font-medium">Category</th>
                    <th className="text-left py-2.5 px-3 font-medium">Sub-Group</th>
                    <th className="text-left py-2.5 px-3 font-medium">Tags</th>
                    <th className="text-left py-2.5 px-3 font-medium">Colour Group</th>
                    <th className="text-center py-2.5 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product: any) => (
                    <tr key={product.id} className={`border-b hover:bg-muted/30 ${product.isActive === false ? "opacity-50" : ""}`}>
                      <td className="py-2 px-3">
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleSelect(product.id)}
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">{product.spaCode}</td>
                      <td className="py-2 px-3 max-w-[220px] truncate">{product.description}</td>
                      <td className="py-2 px-3 text-xs">{product.colour || "-"}</td>
                      <td className="py-2 px-3 text-right font-mono">${Number(product.price).toFixed(2)}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                      </td>
                      <td className="py-2 px-3">
                        {product.subGroup ? (
                          <Badge variant="secondary" className="text-[10px]">{product.subGroup}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {product.tags ? (
                          <div className="flex flex-wrap gap-0.5">
                            {product.tags.split(",").map((t: string) => t.trim()).filter(Boolean).map((tag: string) => (
                              <Badge key={tag} variant="outline" className="text-[9px] bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {product.colourGroup ? (
                          <Badge variant="secondary" className="text-[10px] bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">{product.colourGroup}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standard</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem(product)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleActiveMutation.mutate({ id: product.id, active: product.isActive === false })}
                          >
                            {product.isActive !== false ? (
                              <Archive className="h-3.5 w-3.5 text-orange-500" />
                            ) : (
                              <ArchiveRestore className="h-3.5 w-3.5 text-green-500" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages} ({filteredProducts.length} products)
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditProductDialog
        product={editItem}
        subGroups={subGroups ?? []}
        onClose={() => setEditItem(null)}
        onSave={(data) => updateMutation.mutate(data)}
        isPending={updateMutation.isPending}
      />

      {/* Add Dialog */}
      <AddProductDialog
        open={addItem}
        categories={categories ?? []}
        subGroups={subGroups ?? []}
        onClose={() => setAddItem(false)}
        onSave={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* Price Import Dialog */}
      <PriceImportDialog
        open={showPriceImport}
        onClose={() => setShowPriceImport(false)}
        onComplete={() => {
          setShowPriceImport(false);
          utils.smartshop.fetchProducts.invalidate();
        }}
      />

      {/* Bulk Tag Dialog */}
      <BulkTagDialog
        open={showBulkTag}
        selectedCount={selectedIds.size}
        existingTags={allTags ?? []}
        onClose={() => setShowBulkTag(false)}
        onApply={(tags) => bulkTagMutation.mutate({ productIds: Array.from(selectedIds), tags })}
        isPending={bulkTagMutation.isPending}
      />

      {/* Bulk Sub-Group Dialog */}
      <BulkSubGroupDialog
        open={showBulkSubGroup}
        selectedCount={selectedIds.size}
        existingSubGroups={subGroups ?? []}
        onClose={() => setShowBulkSubGroup(false)}
        onApply={(subGroup) => bulkSubGroupMutation.mutate({ productIds: Array.from(selectedIds), subGroup })}
        isPending={bulkSubGroupMutation.isPending}
      />

      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected products?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selectedIds.size} product{selectedIds.size === 1 ? "" : "s"} from Component Order Data. Existing orders and history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate({ productIds: Array.from(selectedIds) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Products
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Edit Product Dialog ─────────────────────────────────────────────────────
function EditProductDialog({
  product,
  subGroups,
  onClose,
  onSave,
  isPending,
}: {
  product: CatalogueProduct | null;
  subGroups: string[];
  onClose: () => void;
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    spaCode: "",
    description: "",
    colour: "",
    uom: "",
    packQtySizes: "",
    price: "",
    subGroup: "",
    tags: "",
    colourInputAllowed: false,
    colourGroup: "",
  });

  // Fetch colour groups for the dropdown
  const { data: colourGroupsList } = trpc.colourGroups.getAll.useQuery();

  // Update form when product prop changes
  if (product && form.spaCode !== product.spaCode) {
    setForm({
      spaCode: product.spaCode,
      description: product.description,
      colour: product.colour || "",
      uom: product.uom || "ea",
      packQtySizes: product.packQtySizes || "",
      price: product.price.toString(),
      subGroup: product.subGroup || "",
      tags: product.tags || "",
      colourInputAllowed: product.colourInputAllowed ?? false,
      colourGroup: product.colourGroup || "",
    });
  }

  return (
    <Dialog open={!!product} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Catalogue Product</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">SPA Code</Label>
              <Input value={form.spaCode} onChange={(e) => setForm(f => ({ ...f, spaCode: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Price (ex GST)</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Colour</Label>
              <Input value={form.colour} onChange={(e) => setForm(f => ({ ...f, colour: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UoM</Label>
              <Input value={form.uom} onChange={(e) => setForm(f => ({ ...f, uom: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pack Qty/Sizes</Label>
              <Input value={form.packQtySizes} onChange={(e) => setForm(f => ({ ...f, packQtySizes: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sub-Group</Label>
              <Select value={form.subGroup || "none"} onValueChange={(v) => setForm(f => ({ ...f, subGroup: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-group..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subGroups.map((sg) => (
                    <SelectItem key={sg} value={sg}>{sg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. ROOF, GABLES, DECKS"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="colourInputAllowed"
              checked={form.colourInputAllowed}
              onChange={(e) => setForm(f => ({ ...f, colourInputAllowed: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="colourInputAllowed" className="text-xs">Colour Input Allowed (show Required Colour field on orders)</Label>
          </div>
          <div className="space-y-1 pt-1">
            <Label className="text-xs">Colour Group</Label>
            <Select
              value={form.colourGroup || "__none__"}
              onValueChange={(val) => setForm(f => ({ ...f, colourGroup: val === "__none__" ? "" : val }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Standard Colorbond (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Standard Colorbond (default)</SelectItem>
                {colourGroupsList?.map(g => (
                  <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={isPending}
            onClick={() => onSave({
              id: product!.id,
              spaCode: form.spaCode,
              description: form.description,
              colour: form.colour,
              uom: form.uom,
              packQtySizes: form.packQtySizes,
              price: parseFloat(form.price) || 0,
              subGroup: form.subGroup,
              tags: form.tags,
              colourInputAllowed: form.colourInputAllowed,
              colourGroup: form.colourGroup,
            })}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Product Dialog ──────────────────────────────────────────────────────
function AddProductDialog({
  open,
  categories,
  subGroups,
  onClose,
  onSave,
  isPending,
}: {
  open: boolean;
  categories: string[];
  subGroups: string[];
  onClose: () => void;
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    spaCode: "",
    description: "",
    colour: "",
    uom: "ea",
    packQtySizes: "",
    price: "",
    category: "",
    subGroup: "",
    tags: "",
  });

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Catalogue Product</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">SPA Code *</Label>
              <Input value={form.spaCode} onChange={(e) => setForm(f => ({ ...f, spaCode: e.target.value }))} placeholder="e.g. ALU-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description *</Label>
            <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Colour</Label>
              <Input value={form.colour} onChange={(e) => setForm(f => ({ ...f, colour: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UoM</Label>
              <Input value={form.uom} onChange={(e) => setForm(f => ({ ...f, uom: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pack/Sizes</Label>
              <Input value={form.packQtySizes} onChange={(e) => setForm(f => ({ ...f, packQtySizes: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Price *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sub-Group</Label>
              <Select value={form.subGroup || "none"} onValueChange={(v) => setForm(f => ({ ...f, subGroup: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sub-group..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subGroups.map((sg) => (
                    <SelectItem key={sg} value={sg}>{sg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. ROOF, GABLES"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={isPending || !form.spaCode || !form.description || !form.category || !form.price}
            onClick={() => onSave({
              spaCode: form.spaCode,
              description: form.description,
              colour: form.colour,
              uom: form.uom,
              packQtySizes: form.packQtySizes,
              price: parseFloat(form.price) || 0,
              category: form.category,
              subGroup: form.subGroup,
              tags: form.tags,
            })}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Add Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Tag Dialog ─────────────────────────────────────────────────────────
function BulkTagDialog({
  open,
  selectedCount,
  existingTags,
  onClose,
  onApply,
  isPending,
}: {
  open: boolean;
  selectedCount: number;
  existingTags: string[];
  onClose: () => void;
  onApply: (tags: string) => void;
  isPending: boolean;
}) {
  const [tags, setTags] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const toggleTag = (tag: string) => {
    const newSet = new Set(selectedTags);
    if (newSet.has(tag)) newSet.delete(tag);
    else newSet.add(tag);
    setSelectedTags(newSet);
    setTags(Array.from(newSet).join(", "));
  };

  const handleApply = () => {
    const finalTags = tags.split(",").map(t => t.trim()).filter(Boolean).join(", ");
    onApply(finalTags);
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Tags for {selectedCount} Products</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Tags determine which build type (Roof, Gables, Decks, etc.) a product appears under when ordering.
            Select existing tags or type new ones.
          </p>

          {existingTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {existingTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.has(tag) ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={tags}
              onChange={(e) => {
                setTags(e.target.value);
                const parsed = new Set(e.target.value.split(",").map(t => t.trim()).filter(Boolean));
                setSelectedTags(parsed);
              }}
              placeholder="e.g. ROOF, GABLES, DECKS"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            This will <strong>replace</strong> existing tags on all selected products.
            Leave empty to clear tags.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply to {selectedCount} Products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Sub-Group Dialog ───────────────────────────────────────────────────
function BulkSubGroupDialog({
  open,
  selectedCount,
  existingSubGroups,
  onClose,
  onApply,
  isPending,
}: {
  open: boolean;
  selectedCount: number;
  existingSubGroups: string[];
  onClose: () => void;
  onApply: (subGroup: string) => void;
  isPending: boolean;
}) {
  const [subGroup, setSubGroup] = useState("");
  const [customSubGroup, setCustomSubGroup] = useState("");

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Sub-Group for {selectedCount} Products</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Sub-groups categorise products by function (Beams, Posts, Fasteners, etc.) within the order form.
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Select Sub-Group</Label>
            <Select value={subGroup || "none"} onValueChange={(v) => { setSubGroup(v === "none" ? "" : v); setCustomSubGroup(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Choose sub-group..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (clear sub-group)</SelectItem>
                {existingSubGroups.map((sg) => (
                  <SelectItem key={sg} value={sg}>{sg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Or enter a new sub-group</Label>
            <Input
              value={customSubGroup}
              onChange={(e) => { setCustomSubGroup(e.target.value); setSubGroup(""); }}
              placeholder="e.g. FLASHINGS"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onApply(customSubGroup.trim() || subGroup)}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply to {selectedCount} Products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Price Import Dialog ─────────────────────────────────────────────────────
function PriceImportDialog({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [result, setResult] = useState<{ updated: number; notFound: number; unchanged: number } | null>(null);

  const previewMutation = trpc.smartshop.previewPriceUpdate.useMutation({
    onSuccess: (data) => setPreview(data.changes),
    onError: (err) => toast.error(err.message),
  });

  const applyMutation = trpc.smartshop.applyPriceUpdate.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success(`Updated ${data.updated} prices`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    const text = await f.text();
    previewMutation.mutate({ csvContent: text });
  };

  const handleApply = () => {
    if (!preview) return;
    const updates = preview.filter((p: any) => p.status === "changed").map((p: any) => ({
      spaCode: p.spaCode,
      newPrice: p.newPrice,
      newDescription: p.newDescription || undefined,
      newUom: p.newUom || undefined,
    }));
    applyMutation.mutate({ updates });
  };

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); resetState(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Price Update from CSV</DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with columns: <code className="bg-muted px-1 rounded">SPA Code</code>, <code className="bg-muted px-1 rounded">Price</code> (and optionally <code className="bg-muted px-1 rounded">Description</code>, <code className="bg-muted px-1 rounded">UoM</code>).
            </p>

            <div className="flex items-center gap-3">
              <Input type="file" accept=".csv" onChange={handleFileSelect} className="max-w-xs" />
              {previewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            {preview && preview.length > 0 && (
              <>
                <div className="flex gap-3 text-xs">
                  <Badge variant="default">{preview.filter((p: any) => p.status === "changed").length} to update</Badge>
                  <Badge variant="secondary">{preview.filter((p: any) => p.status === "unchanged").length} unchanged</Badge>
                  <Badge variant="destructive">{preview.filter((p: any) => p.status === "not_found").length} not found</Badge>
                </div>

                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">SPA Code</th>
                        <th className="text-left py-2 px-2 font-medium">Description</th>
                        <th className="text-right py-2 px-2 font-medium">Old Price</th>
                        <th className="text-right py-2 px-2 font-medium">New Price</th>
                        <th className="text-center py-2 px-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 100).map((item: any, i: number) => (
                        <tr key={i} className={`border-b ${item.status === "changed" ? "bg-yellow-50 dark:bg-yellow-950/20" : item.status === "not_found" ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                          <td className="py-1.5 px-2 font-mono">{item.spaCode}</td>
                          <td className="py-1.5 px-2 max-w-[200px] truncate">{item.description || "-"}</td>
                          <td className="py-1.5 px-2 text-right">{item.oldPrice != null ? `$${Number(item.oldPrice).toFixed(2)}` : "-"}</td>
                          <td className="py-1.5 px-2 text-right font-medium">${Number(item.newPrice).toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-center">
                            <Badge variant={item.status === "changed" ? "default" : item.status === "not_found" ? "destructive" : "secondary"} className="text-[10px]">
                              {item.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {preview && preview.filter((p: any) => p.status === "changed").length === 0 && (
              <p className="text-sm text-muted-foreground">No price changes detected.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Package className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-medium">Price Update Complete</h3>
              <div className="flex gap-3 text-sm">
                <Badge variant="default">{result.updated} updated</Badge>
                <Badge variant="secondary">{result.unchanged} unchanged</Badge>
                <Badge variant="destructive">{result.notFound} not found</Badge>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => { onClose(); resetState(); }}>Cancel</Button>
              <Button
                disabled={!preview || preview.filter((p: any) => p.status === "changed").length === 0 || applyMutation.isPending}
                onClick={handleApply}
              >
                {applyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Apply {preview?.filter((p: any) => p.status === "changed").length || 0} Updates
              </Button>
            </>
          ) : (
            <Button onClick={() => { onComplete(); resetState(); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
