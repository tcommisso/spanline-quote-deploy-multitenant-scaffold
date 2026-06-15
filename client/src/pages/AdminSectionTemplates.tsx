import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Pencil, Trash2, LayoutTemplate, Eye, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { SPEC_SECTIONS } from "@shared/specSections";
import { cn } from "@/lib/utils";

// Default section order (matches SpecSheet)
const DEFAULT_ORDER = SPEC_SECTIONS.map(s => s.id);

// ─── Sortable Section Item for Order Tab ─────────────────────────────────────
function SortableOrderItem({
  sectionId,
  isHidden,
}: {
  sectionId: string;
  isHidden: boolean;
}) {
  const section = SPEC_SECTIONS.find(s => s.id === sectionId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  if (!section) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b last:border-b-0 bg-background",
        isHidden && "opacity-40"
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isHidden ? (
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        ) : (
          <Eye className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        )}
        <span className={cn("text-sm truncate", isHidden && "line-through text-muted-foreground/50")}>
          {section.label}
        </span>
      </div>

    </div>
  );
}

export default function AdminSectionTemplates() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.sectionTemplates.list.useQuery();
  const createMutation = trpc.sectionTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      utils.sectionTemplates.list.invalidate();
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.sectionTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      utils.sectionTemplates.list.invalidate();
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.sectionTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.sectionTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{
    id?: number;
    name: string;
    description: string;
    hiddenSections: Set<string>;
    sectionOrder: string[];
    useCustomOrder: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const openCreate = () => {
    setEditingTemplate({
      name: "",
      description: "",
      hiddenSections: new Set(),
      sectionOrder: [...DEFAULT_ORDER],
      useCustomOrder: false,
    });
    setDialogOpen(true);
  };

  const openEdit = (template: any) => {
    const savedOrder = (template.sectionOrder as string[] | null);
    setEditingTemplate({
      id: template.id,
      name: template.name,
      description: template.description || "",
      hiddenSections: new Set(template.hiddenSections as string[]),
      sectionOrder: savedOrder && savedOrder.length > 0 ? savedOrder : [...DEFAULT_ORDER],
      useCustomOrder: !!(savedOrder && savedOrder.length > 0),
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingTemplate) return;
    if (!editingTemplate.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    const hiddenArr = Array.from(editingTemplate.hiddenSections);
    const orderArr = editingTemplate.useCustomOrder ? editingTemplate.sectionOrder : undefined;

    if (editingTemplate.id) {
      updateMutation.mutate({
        id: editingTemplate.id,
        name: editingTemplate.name,
        description: editingTemplate.description,
        hiddenSections: hiddenArr,
        sectionOrder: orderArr,
      });
    } else {
      createMutation.mutate({
        name: editingTemplate.name,
        description: editingTemplate.description,
        hiddenSections: hiddenArr,
        sectionOrder: orderArr,
      });
    }
  };

  const toggleSection = (sectionId: string) => {
    if (!editingTemplate) return;
    const next = new Set(editingTemplate.hiddenSections);
    if (next.has(sectionId)) {
      next.delete(sectionId);
    } else {
      next.add(sectionId);
    }
    setEditingTemplate({ ...editingTemplate, hiddenSections: next });
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!editingTemplate) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = editingTemplate.sectionOrder.indexOf(active.id as string);
    const newIndex = editingTemplate.sectionOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    setEditingTemplate({
      ...editingTemplate,
      sectionOrder: arrayMove(editingTemplate.sectionOrder, oldIndex, newIndex),
    });
  }, [editingTemplate]);

  const resetOrder = () => {
    if (!editingTemplate) return;
    setEditingTemplate({ ...editingTemplate, sectionOrder: [...DEFAULT_ORDER] });
  };

  const visibleCount = editingTemplate
    ? SPEC_SECTIONS.length - editingTemplate.hiddenSections.size
    : SPEC_SECTIONS.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Section Templates</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pre-configured section visibility and order for different job types. Design Advisers can apply these to quotes.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading templates...</div>
      ) : !templates || templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutTemplate className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No section templates yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create templates like "Simple Patio", "Full Extension", or "Deck Only" to quickly configure which spec sections are relevant.
            </p>
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const hidden = (t.hiddenSections as string[]) || [];
            const hasOrder = !!(t.sectionOrder as string[] | null)?.length;
            const visible = SPEC_SECTIONS.length - hidden.length;
            return (
              <Card key={t.id} className="relative group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
                      {t.description && (
                        <CardDescription className="text-xs mt-0.5">{t.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {visible} visible
                    </Badge>
                    {hidden.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {hidden.length} hidden
                      </Badge>
                    )}
                    {hasOrder && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600">
                        Custom order
                      </Badge>
                    )}
                  </div>
                  {hidden.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {hidden.slice(0, 5).map((id) => {
                        const sec = SPEC_SECTIONS.find((s) => s.id === id);
                        return (
                          <span key={id} className="text-[10px] text-muted-foreground/60 line-through">
                            {sec?.label || id}
                          </span>
                        );
                      })}
                      {hidden.length > 5 && (
                        <span className="text-[10px] text-muted-foreground">+{hidden.length - 5} more</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate?.id ? "Edit Template" : "New Section Template"}</DialogTitle>
            <DialogDescription>
              Configure which sections to show/hide and optionally set a custom section order.
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    placeholder="e.g. Simple Patio"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={editingTemplate.description}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                    placeholder="When to use this template"
                  />
                </div>
              </div>

              <Tabs defaultValue="visibility" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="visibility">
                    Visibility ({visibleCount} visible)
                  </TabsTrigger>
                  <TabsTrigger value="order">
                    Section Order {editingTemplate.useCustomOrder && <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">Custom</Badge>}
                  </TabsTrigger>
                </TabsList>

                {/* Visibility Tab */}
                <TabsContent value="visibility" className="mt-3">
                  <div className="border rounded-md divide-y max-h-[40vh] overflow-y-auto">
                    {SPEC_SECTIONS.map((section) => {
                      const isHidden = editingTemplate.hiddenSections.has(section.id);
                      return (
                        <div
                          key={section.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {isHidden ? (
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                            <span className={`text-sm ${isHidden ? "text-muted-foreground/50 line-through" : ""}`}>
                              {section.label}
                            </span>
                          </div>
                          <Switch
                            checked={!isHidden}
                            onCheckedChange={() => toggleSection(section.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                {/* Order Tab */}
                <TabsContent value="order" className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={editingTemplate.useCustomOrder}
                        onCheckedChange={(checked) =>
                          setEditingTemplate({ ...editingTemplate, useCustomOrder: checked })
                        }
                      />
                      <Label className="text-sm">Use custom section order</Label>
                    </div>
                    {editingTemplate.useCustomOrder && (
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={resetOrder}>
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </Button>
                    )}
                  </div>

                  {!editingTemplate.useCustomOrder ? (
                    <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                      Using default section order. Enable custom order to drag sections into a different sequence.
                    </div>
                  ) : (
                    <div className="border rounded-md max-h-[40vh] overflow-y-auto">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={editingTemplate.sectionOrder}
                          strategy={verticalListSortingStrategy}
                        >
                          {editingTemplate.sectionOrder.map((id) => (
                            <SortableOrderItem
                              key={id}
                              sectionId={id}
                              isHidden={editingTemplate.hiddenSections.has(id)}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {editingTemplate.useCustomOrder && (
                    <p className="text-[11px] text-muted-foreground">
                      Drag sections to reorder. Hidden sections (greyed out) will be excluded when applied but their position is preserved.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this section template. Quotes that previously used it will keep their current section preferences.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMutation.mutate({ id: deleteId });
                setDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
