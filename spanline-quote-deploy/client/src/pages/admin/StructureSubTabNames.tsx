import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Save, Plus, Trash2, Clock, ChevronDown, ChevronRight, Smile,
  Layers, Box, Wrench, Hammer, Ruler,
  Square, Circle, Triangle, Hexagon, Pentagon,
  Home, Building, Building2, Factory, Warehouse,
  Fence, DoorOpen, DoorClosed, Frame, LayoutGrid,
  Columns3, PanelTop, PanelBottom, PanelLeft, PanelRight,
  Lightbulb, Zap, Droplets, Wind, Sun,
  Thermometer, Paintbrush, Palette, Scissors, Plug,
  Cable, Pipette, Blinds, Shield, Lock,
  Eye, Glasses, SlidersHorizontal, Settings, Cog,
  Package, Archive, Truck, HardHat, Shovel,
  Drill, Scan, Grid3x3, Grip, Maximize,
  Minimize, Move, RotateCw, RefreshCw, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableTableRow } from "@/components/SortableTableRow";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Curated icon map for sub-tabs (construction/building relevant)
const ICON_MAP: Record<string, LucideIcon> = {
  Layers, Box, Wrench, Hammer, Ruler,
  Square, Circle, Triangle, Hexagon, Pentagon,
  Home, Building, Building2, Factory, Warehouse,
  Fence, DoorOpen, DoorClosed, Frame, LayoutGrid,
  Columns3, PanelTop, PanelBottom, PanelLeft, PanelRight,
  Lightbulb, Zap, Droplets, Wind, Sun,
  Thermometer, Paintbrush, Palette, Scissors, Plug,
  Cable, Pipette, Blinds, Shield, Lock,
  Eye, Glasses, SlidersHorizontal, Settings, Cog,
  Package, Archive, Truck, HardHat, Shovel,
  Drill, Scan, Grid3x3, Grip, Maximize,
  Minimize, Move, RotateCw, RefreshCw, Sparkles,
};
const ICON_OPTIONS = Object.keys(ICON_MAP) as (keyof typeof ICON_MAP)[];

function IconPickerButton({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredIcons = useMemo(() => {
    if (!search) return ICON_OPTIONS;
    return ICON_OPTIONS.filter(name => name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const CurrentIcon = value ? ICON_MAP[value] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0" title={value || "Assign icon"}>
          {CurrentIcon ? <CurrentIcon className="h-3.5 w-3.5" /> : <Smile className="h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          placeholder="Search icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
        />
        <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
          {/* Clear option */}
          <button
            type="button"
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground border border-dashed border-border"
            onClick={() => { onChange(""); setOpen(false); }}
            title="Remove icon"
          >
            ×
          </button>
          {filteredIcons.map(name => {
            const Icon = ICON_MAP[name];
            if (!Icon) return null;
            return (
              <button
                key={name}
                type="button"
                className={`h-7 w-7 flex items-center justify-center rounded hover:bg-muted ${value === name ? "bg-primary/10 ring-1 ring-primary" : ""}`}
                onClick={() => { onChange(name); setOpen(false); }}
                title={name}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SubTabEntry {
  id?: number;
  category: string;
  key: string; // format: parentKey::subtabKey
  value: string; // display name
  description: string; // parent tab key
  sortOrder: number;
  icon: string; // lucide icon name stored in metadata.icon
}

export default function StructureSubTabNames() {
  const utils = trpc.useUtils();
  const { data: masterData, isLoading } = trpc.masterData.getAll.useQuery();

  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      toast.success("Sub-tab deleted");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.masterData.reorder.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const [entries, setEntries] = useState<SubTabEntry[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Get parent tabs for the dropdown
  const parentTabs = useMemo(() => {
    if (!masterData) return [];
    return masterData
      .filter(d => d.category === "product_tab")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(d => ({ key: d.key, label: d.value }));
  }, [masterData]);

  // Compute last updated
  const lastUpdated = useMemo(() => {
    if (!masterData) return 0;
    return masterData
      .filter(d => d.category === "product_subtab")
      .reduce((latest, d) => {
        const t = new Date(d.updatedAt).getTime();
        return t > latest ? t : latest;
      }, 0);
  }, [masterData]);

  useEffect(() => {
    if (masterData) {
      const subtabs = masterData
        .filter(d => d.category === "product_subtab")
        .map(d => ({
          id: d.id,
          category: d.category,
          key: d.key,
          value: d.value,
          description: d.description ?? "",
          sortOrder: d.sortOrder ?? 0,
          icon: (d.metadata as any)?.icon || "",
        }));
      setEntries(subtabs);
      // Expand all groups by default on first load
      if (expandedGroups.size === 0) {
        const groups = new Set(subtabs.map(e => e.description));
        setExpandedGroups(groups);
      }
    }
  }, [masterData]);

  // Group entries by parent tab
  const grouped = useMemo(() => {
    const map = new Map<string, SubTabEntry[]>();
    for (const entry of entries) {
      const parent = entry.description || "unassigned";
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(entry);
    }
    // Sort entries within each group by sortOrder
    Array.from(map.values()).forEach(items => {
      items.sort((a: SubTabEntry, b: SubTabEntry) => a.sortOrder - b.sortOrder);
    });
    return map;
  }, [entries]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const getParentLabel = (key: string) => {
    const tab = parentTabs.find(t => t.key === key);
    return tab ? tab.label : key;
  };

  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const addEntry = (parentKey: string) => {
    const newEntry: SubTabEntry = {
      category: "product_subtab",
      key: parentKey + "::",
      value: "",
      description: parentKey,
      sortOrder: (grouped.get(parentKey)?.length ?? 0) + 1,
      icon: "",
    };
    setEntries(prev => [...prev, newEntry]);
    setExpandedGroups(prev => new Set(Array.from(prev).concat(parentKey)));
    toast.info(`New sub-tab added to ${getParentLabel(parentKey)}`);
    setTimeout(() => {
      const el = groupRefs.current.get(parentKey);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const updateEntry = (entryIndex: number, field: string, newValue: any) => {
    setEntries(prev => prev.map((e, i) => {
      if (i !== entryIndex) return e;
      if (field === "value") {
        const parent = e.description;
        const subtabKey = (newValue as string).toLowerCase().replace(/[\/&+]/g, '_').replace(/\s+/g, '_');
        return { ...e, value: newValue, key: parent + "::" + subtabKey };
      }
      return { ...e, [field]: newValue };
    }));
  };

  const handleDragEnd = useCallback((parentKey: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const groupItems = grouped.get(parentKey) || [];
    const oldIndex = groupItems.findIndex(e => `subtab-${e.id ?? e.key}-${parentKey}` === active.id);
    const newIndex = groupItems.findIndex(e => `subtab-${e.id ?? e.key}-${parentKey}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(groupItems, oldIndex, newIndex).map((e, i) => ({ ...e, sortOrder: i + 1 }));

    // Update entries state
    setEntries(prev => {
      const updated = [...prev];
      for (const item of reordered) {
        const idx = updated.findIndex(e => e.id === item.id && e.key === item.key && e.description === parentKey);
        if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: item.sortOrder };
      }
      return updated;
    });

    // Persist to server
    const itemsToReorder = reordered.filter(e => e.id).map(e => ({ id: e.id!, sortOrder: e.sortOrder }));
    if (itemsToReorder.length > 0) {
      reorderMutation.mutate({ items: itemsToReorder });
    }
  }, [grouped, reorderMutation]);

  const [deleteTarget, setDeleteTarget] = useState<{ entry: SubTabEntry; index: number } | null>(null);

  const handleRemoveClick = (entry: SubTabEntry, index: number) => {
    if (!entry.id) {
      setEntries(prev => prev.filter((e, i) => !(e.id === entry.id && e.key === entry.key) || i !== index));
      return;
    }
    setDeleteTarget({ entry, index });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { entry, index } = deleteTarget;
    if (entry.id) {
      deleteMutation.mutate({ id: entry.id });
    }
    setEntries(prev => prev.filter((e, i) => !(e.id === entry.id && e.key === entry.key) || i !== index));
    setDeleteTarget(null);
  };

  const saveGroup = (parentKey: string) => {
    const items = entries.filter(e => e.description === parentKey && e.value.trim());
    let count = 0;
    items.forEach((item, idx) => {
      const subtabKey = item.value.toLowerCase().replace(/[\/&+]/g, '_').replace(/\s+/g, '_');
      const dataKey = parentKey + "::" + subtabKey;
      upsertMutation.mutate({
        id: item.id,
        category: "product_subtab",
        key: dataKey,
        value: item.value,
        description: parentKey,
        sortOrder: idx + 1,
        metadata: item.icon ? { icon: item.icon } : undefined,
      });
      count++;
    });
    toast.success(`Saved ${count} sub-tab${count !== 1 ? 's' : ''} for ${getParentLabel(parentKey)}`);
  };

  const saveAll = () => {
    const items = entries.filter(e => e.value.trim());
    items.forEach(item => {
      const subtabKey = item.value.toLowerCase().replace(/[\/&+]/g, '_').replace(/\s+/g, '_');
      const dataKey = item.description + "::" + subtabKey;
      upsertMutation.mutate({
        id: item.id,
        category: "product_subtab",
        key: dataKey,
        value: item.value,
        description: item.description,
        sortOrder: item.sortOrder,
        metadata: item.icon ? { icon: item.icon } : undefined,
      });
    });
    toast.success(`Saved ${items.length} sub-tab${items.length !== 1 ? 's' : ''}`);
  };

  const [addToParent, setAddToParent] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sub-Tab Names</h1>
          <p className="text-sm text-muted-foreground">Manage sub-categories within each product tab. Drag to reorder, assign icons for visual identification.</p>
        </div>
        {lastUpdated > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Clock className="h-3 w-3" />
            <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Add new sub-tab control */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Select value={addToParent} onValueChange={setAddToParent}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select parent tab..." />
              </SelectTrigger>
              <SelectContent>
                {parentTabs.map(t => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { if (addToParent) addEntry(addToParent); }}
              disabled={!addToParent}
              className="h-8 text-xs gap-1.5"
            >
              <Plus className="h-3 w-3" /> Add Sub-Tab
              {addToParent && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-medium min-w-[18px] h-[18px] px-1">
                  {(grouped.get(addToParent) || []).length}
                </span>
              )}
            </Button>
            <div className="ml-auto">
              <Button size="sm" onClick={saveAll} disabled={upsertMutation.isPending} className="h-8 text-xs gap-1.5">
                <Save className="h-3 w-3" /> Save All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grouped sub-tabs */}
      {parentTabs.map(tab => {
        const items = grouped.get(tab.key) || [];
        if (items.length === 0 && !expandedGroups.has(tab.key)) return null;
        const isExpanded = expandedGroups.has(tab.key);

        return (
          <Card key={tab.key} ref={(el) => { if (el) groupRefs.current.set(tab.key, el); }}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleGroup(tab.key)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <CardTitle className="text-sm font-medium">{tab.label}</CardTitle>
                  <span className="text-xs text-muted-foreground">({items.length} sub-tab{items.length !== 1 ? 's' : ''})</span>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => addEntry(tab.key)} className="h-6 text-xs gap-1 px-2">
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                  <Button size="sm" onClick={() => saveGroup(tab.key)} disabled={upsertMutation.isPending} className="h-6 text-xs gap-1 px-2">
                    <Save className="h-3 w-3" /> Save
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent className="pt-0">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">No sub-tabs for this category.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(tab.key)}>
                    <SortableContext items={items.map(e => `subtab-${e.id ?? e.key}-${tab.key}`)} strategy={verticalListSortingStrategy}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="w-8"></th>
                            <th className="w-8 text-center py-2 font-medium text-muted-foreground">Icon</th>
                            <th className="text-left py-2 font-medium text-muted-foreground">Sub-Tab Name</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((entry) => {
                            const globalIndex = entries.findIndex(e => e.id === entry.id && e.key === entry.key && e.description === entry.description);
                            return (
                              <SortableTableRow key={`subtab-${entry.id ?? entry.key}-${tab.key}`} id={`subtab-${entry.id ?? entry.key}-${tab.key}`} className="border-b border-border/30">
                                <td className="py-1 px-1">
                                  <IconPickerButton
                                    value={entry.icon}
                                    onChange={(icon) => updateEntry(globalIndex, "icon", icon)}
                                  />
                                </td>
                                <td className="py-1 pr-2">
                                  <Input
                                    value={entry.value}
                                    onChange={(e) => updateEntry(globalIndex, "value", e.target.value)}
                                    placeholder="e.g. Aluminium"
                                    className="h-7 text-xs"
                                  />
                                </td>
                                <td className="py-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveClick(entry, globalIndex)}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </td>
                              </SortableTableRow>
                            );
                          })}
                        </tbody>
                      </table>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sub-Tab</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.entry.value}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
