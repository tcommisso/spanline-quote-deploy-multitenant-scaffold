import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Save, Plus, Trash2, Clock, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableTableRow } from "@/components/SortableTableRow";

export default function StructureTabNames() {
  const utils = trpc.useUtils();
  const { data: masterData, isLoading } = trpc.masterData.getAll.useQuery();
  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      toast.success("Tab names saved");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.masterData.reorder.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      toast.success("Tab deleted and products updated");
      utils.masterData.getAll.invalidate();
      utils.products.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [entries, setEntries] = useState<Array<{ id?: number; category: string; key: string; value: string; sortOrder: number; specField: string }>>([]);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; index: number; entry: typeof entries[0] | null; productCount: number }>({ open: false, index: -1, entry: null, productCount: 0 });
  const [reassignTo, setReassignTo] = useState<string>("__blank__");
  const masterDataRows = Array.isArray(masterData) ? masterData : [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const lastUpdated = masterDataRows
    .filter(d => d.category === "product_tab")
    .reduce((latest, d) => {
        const t = new Date(d.updatedAt).getTime();
        return Number.isFinite(t) && t > latest ? t : latest;
      }, 0);

  // Available spec sheet dropdown fields that can be linked to product tabs
  const specFieldOptions = [
    { value: "", label: "— None —" },
    { value: "specRoofType", label: "Roof Type" },
    { value: "specPostsType", label: "Post Type" },
    { value: "specBeamSize", label: "Beam Size" },
    { value: "specBackChannelType", label: "Back Channel Type" },
    { value: "specSideChannelsType", label: "Side Channels Type" },
    { value: "specFlashingsType", label: "Flashings Type" },
    { value: "specBracketInfillType", label: "Bracket Infill Type" },
    { value: "specGutterType", label: "Gutter Type" },
    { value: "specWallType", label: "Wall Type" },
    { value: "specSpanlitesType", label: "Spanlites Type" },
    { value: "specWindowsTint", label: "Windows Tint" },
    { value: "specDoorsTint", label: "Doors Tint" },
    { value: "specElecLightType", label: "Light Type" },
    { value: "specDownpipeType", label: "Downpipe Type" },
    { value: "specCeilingFinish", label: "Ceiling Finish" },
    { value: "specScreenType", label: "Screen Type" },
    { value: "specBalustradeType", label: "Balustrade Type" },
  ];

  useEffect(() => {
    if (Array.isArray(masterData)) {
      setEntries(masterData.filter(d => d.category === "product_tab").map(d => ({
        id: d.id,
        category: d.category,
        key: d.key,
        value: d.value,
        sortOrder: d.sortOrder ?? 0,
        specField: (d.metadata as any)?.specField || "",
      })));
    }
  }, [masterData]);

  const addEntry = () => {
    setEntries(prev => [...prev, { category: "product_tab", key: "", value: "", sortOrder: prev.length, specField: "" }]);
  };

  const updateEntry = (index: number, field: string, value: any) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((_, i) => `tab-${i}` === active.id);
    const newIndex = entries.findIndex((_, i) => `tab-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(entries, oldIndex, newIndex).map((e, i) => ({ ...e, sortOrder: i }));
    setEntries(reordered);
    // Persist to server
    const itemsToReorder = reordered.filter(e => e.id).map((e, idx) => ({ id: e.id!, sortOrder: idx }));
    if (itemsToReorder.length > 0) {
      reorderMutation.mutate({ items: itemsToReorder });
    }
  }, [entries, reorderMutation]);

  const handleRemoveClick = async (index: number) => {
    const entry = entries[index];
    if (!entry.id) {
      // New entry not yet saved — just remove from local state
      setEntries(prev => prev.filter((_, i) => i !== index));
      return;
    }
    // Check if there are products using this tab
    try {
      const count = await utils.masterData.getProductCountByTab.fetch({ tabKey: entry.key });
      if (count > 0) {
        setDeleteDialog({ open: true, index, entry, productCount: count });
        setReassignTo("__blank__");
      } else {
        // No products — delete directly
        deleteMutation.mutate({ id: entry.id });
        setEntries(prev => prev.filter((_, i) => i !== index));
      }
    } catch (e) {
      // If query fails, still allow delete with warning
      deleteMutation.mutate({ id: entry.id });
      setEntries(prev => prev.filter((_, i) => i !== index));
    }
  };

  const confirmDelete = () => {
    const { entry, index } = deleteDialog;
    if (!entry?.id) return;
    const reassign = reassignTo === "__blank__" ? undefined : reassignTo;
    deleteMutation.mutate({ id: entry.id, reassignTo: reassign });
    setEntries(prev => prev.filter((_, i) => i !== index));
    setDeleteDialog({ open: false, index: -1, entry: null, productCount: 0 });
  };

  const save = () => {
    const items = entries.filter(e => e.key.trim());
    items.forEach(item => {
      upsertMutation.mutate({
        id: item.id,
        category: "product_tab",
        key: item.key,
        value: item.value,
        sortOrder: item.sortOrder,
        metadata: item.specField ? { specField: item.specField } : undefined,
      });
    });
  };

  const otherTabs = entries.filter(e => e.key && e.key !== deleteDialog.entry?.key);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tab Names</h1>
          <p className="text-sm text-muted-foreground">Manage custom tab names for product categories. Drag to reorder.</p>
        </div>
        {lastUpdated > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Product Tab Names</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addEntry} className="h-7 text-xs gap-1.5">
                <Plus className="h-3 w-3" /> Add Tab
              </Button>
              <Button size="sm" onClick={save} disabled={upsertMutation.isPending} className="h-7 text-xs gap-1.5">
                <Save className="h-3 w-3" /> Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No custom tabs. Add tabs to categorize products.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map((_, i) => `tab-${i}`)} strategy={verticalListSortingStrategy}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="w-8"></th>
                      <th className="text-left py-2 font-medium text-muted-foreground w-1/5">Key (internal)</th>
                      <th className="text-left py-2 font-medium text-muted-foreground w-1/5">Label (display)</th>
                      <th className="text-left py-2 font-medium text-muted-foreground w-1/4">Spec Sheet Field</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => (
                      <SortableTableRow key={index} id={`tab-${index}`} className="border-b border-border/30">
                        <td className="py-1 pr-2">
                          <Input value={entry.key} onChange={(e) => updateEntry(index, "key", e.target.value)} placeholder="e.g. insulation" className="h-7 text-xs" />
                        </td>
                        <td className="py-1 pr-2">
                          <Input value={entry.value} onChange={(e) => updateEntry(index, "value", e.target.value)} placeholder="e.g. Insulation" className="h-7 text-xs" />
                        </td>
                        <td className="py-1 pr-2">
                          <Select value={entry.specField || "__none__"} onValueChange={(v) => updateEntry(index, "specField", v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="— None —" />
                            </SelectTrigger>
                            <SelectContent>
                              {specFieldOptions.map(opt => (
                                <SelectItem key={opt.value || "__none__"} value={opt.value || "__none__"}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1">
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveClick(index)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </SortableTableRow>
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, index: -1, entry: null, productCount: 0 })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Delete Tab: {deleteDialog.entry?.value || deleteDialog.entry?.key}
            </DialogTitle>
            <DialogDescription>
              This tab has <strong>{deleteDialog.productCount}</strong> product{deleteDialog.productCount !== 1 ? "s" : ""} assigned to it. 
              Choose how to handle these products:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-sm font-medium">Reassign products to:</Label>
            <Select value={reassignTo} onValueChange={setReassignTo}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__blank__">Leave blank (no tab assigned)</SelectItem>
                {otherTabs.map((tab) => (
                  <SelectItem key={tab.key} value={tab.key}>
                    {tab.value || tab.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {reassignTo === "__blank__" 
                ? "Products will have their tab cleared. They will appear under no category until reassigned."
                : `Products will be moved to the "${otherTabs.find(t => t.key === reassignTo)?.value || reassignTo}" tab.`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, index: -1, entry: null, productCount: 0 })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Tab"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
