import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

const PRESET_COLORS = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
  "#EC4899", "#14B8A6", "#D97706", "#6B7280", "#059669",
  "#7C3AED", "#2563EB", "#A16207", "#78716C", "#64748B",
  "#06B6D4",
];

export default function SupplierCategoriesPage() {

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string; color: string } | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");

  const { data: categories, isLoading } = trpc.supplierCategories.listAll.useQuery();
  const utils = trpc.useUtils();
  const categoryRows = useMemo(() => Array.isArray(categories) ? categories : [], [categories]);

  const createMutation = trpc.supplierCategories.create.useMutation({
    onSuccess: () => {
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("Category created");
    },
  });

  const updateMutation = trpc.supplierCategories.update.useMutation({
    onSuccess: () => {
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("Category updated");
    },
  });

  const deleteMutation = trpc.supplierCategories.delete.useMutation({
    onSuccess: () => {
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
      toast.success("Category removed");
    },
  });

  const reorderMutation = trpc.supplierCategories.reorder.useMutation({
    onSuccess: () => {
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
    },
  });

  function resetForm() {
    setName("");
    setColor("#6B7280");
    setEditingCategory(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(cat: { id: number; name: string; color: string | null }) {
    setEditingCategory({ id: cat.id, name: cat.name, color: cat.color || "#6B7280" });
    setName(cat.name);
    setColor(cat.color || "#6B7280");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, name: name.trim(), color });
    } else {
      createMutation.mutate({ name: name.trim(), color });
    }
  }

  function handleDelete(id: number) {
    if (confirm("Remove this category? Existing supplier assignments will be cleared.")) {
      deleteMutation.mutate({ id });
    }
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const activeCategories = categoryRows.filter(c => c.isActive);
    const ids = activeCategories.map(c => c.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    reorderMutation.mutate({ ids });
  }

  function handleMoveDown(index: number) {
    const activeCategories = categoryRows.filter(c => c.isActive);
    if (index >= activeCategories.length - 1) return;
    const ids = activeCategories.map(c => c.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    reorderMutation.mutate({ ids });
  }

  const activeCategories = categoryRows.filter(c => c.isActive);
  const inactiveCategories = categoryRows.filter(c => !c.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Supplier Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage categories that can be assigned to suppliers (multi-tag system)
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Categories ({activeCategories.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {activeCategories.map((cat, idx) => (
                <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMoveUp(idx)}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <GripVertical className="h-3 w-3 rotate-90 scale-x-[-1]" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(idx)}
                      disabled={idx === activeCategories.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <GripVertical className="h-3 w-3 rotate-90" />
                    </button>
                  </div>
                  <div
                    className="h-4 w-4 rounded-full shrink-0 border"
                    style={{ backgroundColor: cat.color || "#6B7280" }}
                  />
                  <Badge
                    variant="outline"
                    className="text-xs font-medium"
                    style={{
                      borderColor: cat.color || "#6B7280",
                      color: cat.color || "#6B7280",
                    }}
                  >
                    {cat.name}
                  </Badge>
                  <span className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(cat.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {activeCategories.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No categories yet. Click "Add Category" to create one.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {inactiveCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">Inactive Categories ({inactiveCategories.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {inactiveCategories.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                  <div
                    className="h-4 w-4 rounded-full shrink-0 border"
                    style={{ backgroundColor: cat.color || "#6B7280" }}
                  />
                  <span className="text-sm">{cat.name}</span>
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateMutation.mutate({ id: cat.id, isActive: true })}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "New Supplier Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Roofing, Electrical..."
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs text-muted-foreground">Custom:</Label>
                <Input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="h-8 w-14 p-0.5 cursor-pointer"
                />
                <span className="text-xs text-muted-foreground font-mono">{color}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Preview</Label>
              <Badge
                variant="outline"
                className="text-sm"
                style={{
                  borderColor: color,
                  color: color,
                }}
              >
                {name || "Category Name"}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {editingCategory ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
