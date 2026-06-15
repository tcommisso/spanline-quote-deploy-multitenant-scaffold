import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Trash2, GripVertical, Palette } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PRESET_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E", "#6B7280",
  "#78716C", "#0EA5E9", "#10B981",
];

interface Category {
  id: number;
  name: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
}

function SortableCategoryRow({
  category,
  onUpdate,
  onDelete,
}: {
  category: Category;
  onUpdate: (id: number, field: string, value: any) => void;
  onDelete: (id: number) => void;
}) {
  const [showColors, setShowColors] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `cat-${category.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border/30 group">
      <td className="py-1.5 w-8">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="py-1.5 pr-2">
        <Input
          value={category.name}
          onChange={(e) => onUpdate(category.id, "name", e.target.value)}
          className="h-7 text-xs"
          placeholder="Category name"
        />
      </td>
      <td className="py-1.5 pr-2 w-48">
        <div className="relative">
          <button
            onClick={() => setShowColors(!showColors)}
            className="flex items-center gap-2 h-7 px-2 rounded border border-input text-xs hover:bg-accent w-full"
          >
            <div
              className="w-4 h-4 rounded-sm border border-border/50"
              style={{ backgroundColor: category.color || "#6B7280" }}
            />
            <span className="text-muted-foreground">{category.color || "#6B7280"}</span>
            <Palette className="h-3 w-3 ml-auto text-muted-foreground" />
          </button>
          {showColors && (
            <div className="absolute top-8 left-0 z-50 bg-popover border rounded-md shadow-md p-2 grid grid-cols-6 gap-1 w-48">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onUpdate(category.id, "color", c); setShowColors(false); }}
                  className="w-6 h-6 rounded-sm border border-border/50 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="py-1.5 w-20 text-center">
        <Badge
          variant={category.isActive ? "default" : "secondary"}
          className="text-[10px] cursor-pointer"
          onClick={() => onUpdate(category.id, "isActive", !category.isActive)}
        >
          {category.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="py-1.5 w-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(category.id)}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

export default function SupplierCategoryManager() {
  const utils = trpc.useUtils();
  const categoriesQuery = trpc.supplierCategories.listAll.useQuery();
  const createMutation = trpc.supplierCategories.create.useMutation({
    onSuccess: () => {
      toast.success("Category created");
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
      setNewName("");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.supplierCategories.update.useMutation({
    onSuccess: () => {
      toast.success("Category updated");
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const reorderMutation = trpc.supplierCategories.reorder.useMutation({
    onSuccess: () => {
      toast.success("Order updated");
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.supplierCategories.delete.useMutation({
    onSuccess: () => {
      toast.success("Category deactivated");
      utils.supplierCategories.listAll.invalidate();
      utils.supplierCategories.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  // Sync from server when data arrives
  const categories = categoriesQuery.data || [];
  if (!hasLocalChanges && categories.length > 0 && JSON.stringify(categories) !== JSON.stringify(localCategories)) {
    setLocalCategories(categories as Category[]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    createMutation.mutate({ name: newName.trim(), color: newColor });
  };

  const handleUpdate = (id: number, field: string, value: any) => {
    setLocalCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    setHasLocalChanges(true);
  };

  const handleSave = () => {
    localCategories.forEach(cat => {
      const original = categories.find((c: any) => c.id === cat.id);
      if (!original) return;
      const changes: any = {};
      if (cat.name !== (original as any).name) changes.name = cat.name;
      if (cat.color !== (original as any).color) changes.color = cat.color;
      if (cat.isActive !== (original as any).isActive) changes.isActive = cat.isActive;
      if (Object.keys(changes).length > 0) {
        updateMutation.mutate({ id: cat.id, ...changes });
      }
    });
    setHasLocalChanges(false);
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localCategories.findIndex(c => `cat-${c.id}` === active.id);
    const newIndex = localCategories.findIndex(c => `cat-${c.id}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(localCategories, oldIndex, newIndex);
    setLocalCategories(reordered);
    reorderMutation.mutate({ ids: reordered.map(c => c.id) });
  }, [localCategories, reorderMutation]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Supplier Categories</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Manage trade categories for organising suppliers. Drag to reorder.
            </p>
          </div>
          {hasLocalChanges && (
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="h-7 text-xs gap-1.5">
              <Save className="h-3 w-3" /> Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add new category */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name..."
            className="h-8 text-xs flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <div className="flex items-center gap-1">
            {PRESET_COLORS.slice(0, 6).map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-sm border transition-transform ${newColor === c ? "scale-125 ring-2 ring-primary" : "border-border/50 hover:scale-110"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending} className="h-8 text-xs gap-1.5">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {/* Categories table */}
        {localCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No categories yet. Add one above.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localCategories.map(c => `cat-${c.id}`)} strategy={verticalListSortingStrategy}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="w-8"></th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-2 font-medium text-muted-foreground w-48">Colour</th>
                    <th className="text-center py-2 font-medium text-muted-foreground w-20">Status</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {localCategories.map((cat) => (
                    <SortableCategoryRow
                      key={cat.id}
                      category={cat}
                      onUpdate={handleUpdate}
                      onDelete={(id) => setDeleteId(id)}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={deleteId !== null}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        onConfirm={() => { if (deleteId) { deleteMutation.mutate({ id: deleteId }); setDeleteId(null); } }}
        title="Deactivate Category?"
        description="This will hide the category from selection. Existing supplier assignments will be preserved."
      />
    </Card>
  );
}
