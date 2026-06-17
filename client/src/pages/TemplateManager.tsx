import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Package,
  Search,
  X,
  GripVertical,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TemplateItem {
  catalogueProductId?: number | null;
  spaCode: string;
  description: string;
  category: string;
  colour: string;
  uom: string;
  defaultQuantity: number;
  unitPrice: string;
  notes: string;
  sortOrder: number;
}

// ─── Template List ────────────────────────────────────────────────────────────
export default function TemplateManager() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const templatesQuery = trpc.smartshop.listTemplates.useQuery({ activeOnly: false });
  const deleteMutation = trpc.smartshop.deleteTemplate.useMutation({
    onSuccess: () => {
      templatesQuery.refetch();
      toast.success("Template deleted");
    },
  });
  const duplicateMutation = trpc.smartshop.duplicateTemplate.useMutation({
    onSuccess: () => {
      templatesQuery.refetch();
      toast.success("Template duplicated");
    },
  });
  const toggleMutation = trpc.smartshop.updateTemplate.useMutation({
    onSuccess: () => {
      templatesQuery.refetch();
    },
  });

  const templates = templatesQuery.data ?? [];
  const filtered = useMemo(() => {
    if (!searchQuery) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.tag || "").toLowerCase().includes(q)
    );
  }, [templates, searchQuery]);

  if (editingTemplateId !== null) {
    return (
      <TemplateEditor
        templateId={editingTemplateId}
        onClose={() => {
          setEditingTemplateId(null);
          templatesQuery.refetch();
        }}
      />
    );
  }

  if (showCreateDialog) {
    return (
      <TemplateEditor
        templateId={null}
        onClose={() => {
          setShowCreateDialog(false);
          templatesQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order Templates (Kits)</h1>
          <p className="text-muted-foreground mt-1">
            Create pre-built kits that can be applied to component orders in one click
          </p>
        </div>
        <Button variant="brand" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-sm mt-1">Create your first kit to speed up ordering</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <Card
              key={template.id}
              className={`relative transition-opacity ${!template.isActive ? "opacity-60" : ""}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                    {template.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                  {!template.isActive && (
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      Inactive
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Package className="h-4 w-4" />
                  <span>{template.itemCount} items</span>
                  {template.tag && (
                    <>
                      <span className="text-border">|</span>
                      <Badge variant="outline" className="text-xs">
                        {template.tag}
                      </Badge>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingTemplateId(template.id)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateMutation.mutate({ id: template.id })}
                    disabled={duplicateMutation.isPending}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: template.id,
                        isActive: !template.isActive,
                      })
                    }
                  >
                    {template.isActive ? (
                      <ToggleRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${template.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate({ id: template.id });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Template Editor ──────────────────────────────────────────────────────────
function TemplateEditor({
  templateId,
  onClose,
}: {
  templateId: number | null;
  onClose: () => void;
}) {
  const isNew = templateId === null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState("");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load existing template
  const templateQuery = trpc.smartshop.getTemplate.useQuery(
    { id: templateId! },
    {
      enabled: templateId !== null,
      refetchOnWindowFocus: false,
    }
  );

  // Populate form when template loads
  if (templateQuery.data && !loaded) {
    const t = templateQuery.data;
    setName(t.name);
    setDescription(t.description || "");
    setTag(t.tag || "");
    setItems(
      t.items.map((item: TemplateItem) => ({
        catalogueProductId: item.catalogueProductId,
        spaCode: item.spaCode,
        description: item.description,
        category: item.category,
        colour: item.colour || "",
        uom: item.uom || "",
        defaultQuantity: item.defaultQuantity,
        unitPrice: item.unitPrice || "0",
        notes: item.notes || "",
        sortOrder: item.sortOrder,
      }))
    );
    setLoaded(true);
  }

  const tagsQuery = trpc.smartshop.allTags.useQuery();
  const availableTags = tagsQuery.data ?? [];

  const createMutation = trpc.smartshop.createTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.smartshop.updateTemplate.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const setItemsMutation = trpc.smartshop.setTemplateItems.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one product");
      return;
    }

    const itemsWithOrder = items.map((item, idx) => ({ ...item, sortOrder: idx }));

    if (isNew) {
      createMutation.mutate({ name, description, tag, items: itemsWithOrder });
    } else {
      // Update header + items separately
      updateMutation.mutate(
        { id: templateId!, name, description, tag },
        {
          onSuccess: () => {
            setItemsMutation.mutate({ templateId: templateId!, items: itemsWithOrder });
          },
        }
      );
    }
  };

  const addProducts = (
    products: Array<{
      id: number;
      spaCode: string;
      description: string;
      category: string;
      colour: string;
      uom: string;
      price: string;
    }>
  ) => {
    const newItems: TemplateItem[] = products.map((p, idx) => ({
      catalogueProductId: p.id,
      spaCode: p.spaCode,
      description: p.description,
      category: p.category,
      colour: p.colour || "",
      uom: p.uom || "",
      defaultQuantity: 1,
      unitPrice: p.price || "0",
      notes: "",
      sortOrder: items.length + idx,
    }));
    setItems((prev) => [...prev, ...newItems]);
    setShowProductPicker(false);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof TemplateItem, value: unknown) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const moveItem = (idx: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    setItems((prev) => {
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || setItemsMutation.isPending;

  const totalEstimate = items.reduce(
    (sum, item) => sum + item.defaultQuantity * parseFloat(item.unitPrice || "0"),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isNew ? "New Template" : "Edit Template"}</h1>
          <p className="text-muted-foreground mt-1">
            {isNew ? "Create a new order kit" : `Editing "${name}"`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </div>

      {/* Template Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Standard Roof Kit"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Scope Tag</Label>
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a scope tag..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tag</SelectItem>
                  {availableTags.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="What is this kit used for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Template Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Kit Items ({items.length})
              {items.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  Est. total: ${totalEstimate.toFixed(2)}
                </span>
              )}
            </CardTitle>
            <Button variant="brand" size="sm" onClick={() => setShowProductPicker(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Products
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No items yet. Click "Add Products" to build your kit.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>SPA Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Colour</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="w-24">Unit Price</TableHead>
                    <TableHead className="w-32">Notes</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <button
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            onClick={() => moveItem(idx, "up")}
                            disabled={idx === 0}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            onClick={() => moveItem(idx, "down")}
                            disabled={idx === items.length - 1}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.spaCode}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-xs">{item.category}</TableCell>
                      <TableCell className="text-xs">{item.colour || "-"}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.defaultQuantity}
                          onChange={(e) =>
                            updateItem(idx, "defaultQuantity", parseInt(e.target.value) || 1)
                          }
                          className="h-8 w-16 text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-xs">{item.uom}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                          className="h-8 w-20 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Notes..."
                          value={item.notes}
                          onChange={(e) => updateItem(idx, "notes", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-8 w-8 p-0"
                          onClick={() => removeItem(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Picker Dialog */}
      {showProductPicker && (
        <ProductPickerDialog
          onSelect={addProducts}
          onClose={() => setShowProductPicker(false)}
          existingSPACodes={items.map((i) => i.spaCode)}
        />
      )}
    </div>
  );
}

// ─── Product Picker Dialog ────────────────────────────────────────────────────
function ProductPickerDialog({
  onSelect,
  onClose,
  existingSPACodes,
}: {
  onSelect: (
    products: Array<{
      id: number;
      spaCode: string;
      description: string;
      category: string;
      colour: string;
      uom: string;
      price: string;
    }>
  ) => void;
  onClose: () => void;
  existingSPACodes: string[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const categoriesQuery = trpc.smartshop.allCategories.useQuery();
  const categories = categoriesQuery.data ?? [];

  const productsQuery = trpc.smartshop.fetchProducts.useQuery({
    category: category === "all" ? undefined : category,
    search: search || undefined,
    offset: 0,
    limit: 100,
  });

  const products = productsQuery.data?.products ?? [];

  const toggleProduct = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const selectedProducts = products
      .filter((p) => selected.has(p.id))
      .map((p) => ({
        id: p.id,
        spaCode: p.spaCode,
        description: p.description,
        category: p.category,
        colour: p.colour || "",
        uom: p.uom || "",
        price: String(p.price || "0"),
      }));
    onSelect(selectedProducts);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Products to Kit</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by code or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>SPA Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {productsQuery.isLoading ? "Loading..." : "No products found"}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => {
                  const alreadyInKit = existingSPACodes.includes(p.spaCode);
                  const isSelected = selected.has(p.id);
                  return (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer ${isSelected ? "bg-primary/5" : ""} ${alreadyInKit ? "opacity-50" : ""}`}
                      onClick={() => !alreadyInKit && toggleProduct(p.id)}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={alreadyInKit}
                          onChange={() => toggleProduct(p.id)}
                          className="h-4 w-4 rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.spaCode}</TableCell>
                      <TableCell className="text-sm">{p.description}</TableCell>
                      <TableCell className="text-xs">{p.category}</TableCell>
                      <TableCell className="text-xs">{p.colour || "-"}</TableCell>
                      <TableCell className="text-xs">{p.uom}</TableCell>
                      <TableCell className="text-sm">${parseFloat(String(p.price || "0")).toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="mt-4">
          <div className="flex items-center gap-3 w-full justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.size} product{selected.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={selected.size === 0}>
                Add {selected.size} Product{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
