import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Plus, Trash2, Package, Fence, Sun, Zap, Tags } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { SortableTableRow } from "@/components/SortableTableRow";
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
} from "@dnd-kit/sortable";
import ProductTable from "@/components/ProductTable";
import DeckMasterData from "@/components/DeckMasterData";
import EclipsePricingAdmin from "@/components/EclipsePricingAdmin";
import SpecMappingsAdmin from "@/pages/SpecMappingsAdmin";
import SupplierCategoryManager from "@/components/SupplierCategoryManager";

export default function MasterDataAdmin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: masterData, isLoading } = trpc.masterData.getAll.useQuery();
  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      toast.success("Master data saved");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      toast.success("Entry deleted");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.masterData.reorder.useMutation({
    onSuccess: () => {
      toast.success("Order updated");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [entries, setEntries] = useState<Array<{ id?: number; category: string; key: string; value: string; sortOrder: number }>>([]); 

  useEffect(() => {
    if (masterData) {
      setEntries(masterData.map(d => ({
        id: d.id,
        category: d.category,
        key: d.key,
        value: d.value,
        sortOrder: d.sortOrder ?? 0,
      })));
    }
  }, [masterData]);

  const categories = Array.from(new Set(entries.map(e => e.category))).sort();

  const addEntry = (category: string) => {
    setEntries(prev => [...prev, { category, key: "", value: "", sortOrder: prev.filter(e => e.category === category).length }]);
  };

  const updateEntry = (index: number, field: string, value: any) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const [deleteEntryIndex, setDeleteEntryIndex] = useState<number | null>(null);
  const removeEntry = (index: number) => {
    setDeleteEntryIndex(index);
  };
  const confirmRemoveEntry = () => {
    if (deleteEntryIndex === null) return;
    const entry = entries[deleteEntryIndex];
    if (entry.id) {
      deleteMutation.mutate({ id: entry.id });
    }
    setEntries(prev => prev.filter((_, i) => i !== deleteEntryIndex));
    setDeleteEntryIndex(null);
  };

  const saveCategory = (category: string) => {
    const items = entries.filter(e => e.category === category && e.key.trim());

    // Validation for product_tab: prevent duplicate sort orders
    if (category === "product_tab") {
      const sortOrders = items.map(i => i.sortOrder);
      const duplicates = sortOrders.filter((v, i) => sortOrders.indexOf(v) !== i);
      if (duplicates.length > 0) {
        toast.error(`Duplicate sort order(s) found: ${Array.from(new Set(duplicates)).join(", ")}. Each tab must have a unique sort order.`);
        return;
      }
    }

    items.forEach(item => {
      // Auto-normalise key for product_tab: lowercase, replace spaces with underscores, strip non-alphanumeric
      const normalisedKey = category === "product_tab"
        ? item.key.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
        : item.key;

      upsertMutation.mutate({
        id: item.id,
        category: item.category,
        key: normalisedKey,
        value: item.value,
        sortOrder: item.sortOrder,
      });
    });
  };

  const handleDragEnd = useCallback((category: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const catEntries = entries.filter(e => e.category === category);
    const oldIndex = catEntries.findIndex(e => `row-${entries.indexOf(e)}` === active.id);
    const newIndex = catEntries.findIndex(e => `row-${entries.indexOf(e)}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(catEntries, oldIndex, newIndex);
    // Update local state with new sort orders
    const updatedEntries = entries.map(e => {
      if (e.category !== category) return e;
      const idx = reordered.indexOf(e);
      return idx >= 0 ? { ...e, sortOrder: idx } : e;
    });
    setEntries(updatedEntries);
    // Persist to server if items have IDs
    const itemsToReorder = reordered.filter(e => e.id).map((e, idx) => ({ id: e.id!, sortOrder: idx }));
    if (itemsToReorder.length > 0) {
      reorderMutation.mutate({ items: itemsToReorder });
    }
  }, [entries, reorderMutation]);

  const defaultCategories = ["markup", "region_rate", "council_fee", "travel_band", "complexity", "colour", "threshold", "notification"];
  const hiddenCategories = ["product_tab", "product_uom", "branch_address"];
  const allCategories = Array.from(new Set([...defaultCategories, ...categories])).filter(c => !hiddenCategories.includes(c));

  const tabValues = useMemo(() => [
    "products", "deck_master", "eclipse_pricing", "spec_mappings", "supplier_categories", "product_tab", "product_uom",
    ...allCategories,
  ], [allCategories]);

  const [activeTab, setActiveTab] = useState("products");
  const swipeRef = useSwipeTabs({
    tabs: tabValues,
    activeTab,
    onTabChange: setActiveTab,
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales Data</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage pricing rates, markups, product catalog, and configuration</p>
        </div>
      </div>

      <div ref={swipeRef}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="products" className="text-xs gap-1.5">
            <Package className="h-3 w-3" /> Products
          </TabsTrigger>
          <TabsTrigger value="deck_master" className="text-xs gap-1.5">
            <Fence className="h-3 w-3" /> Deck Data
          </TabsTrigger>
          <TabsTrigger value="eclipse_pricing" className="text-xs gap-1.5">
            <Sun className="h-3 w-3" /> Eclipse Pricing
          </TabsTrigger>
          <TabsTrigger value="spec_mappings" className="text-xs gap-1.5">
            <Zap className="h-3 w-3" /> Spec Mappings
          </TabsTrigger>
          <TabsTrigger value="supplier_categories" className="text-xs gap-1.5">
            <Tags className="h-3 w-3" /> Supplier Categories
          </TabsTrigger>
          <TabsTrigger value="product_tab" className="text-xs gap-1.5">
            Tab Names
          </TabsTrigger>
          <TabsTrigger value="product_uom" className="text-xs gap-1.5">
            UoM
          </TabsTrigger>
          {allCategories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="text-xs capitalize">
              {cat.replace(/_/g, " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Products Table Tab */}
        <TabsContent value="products" className="mt-6">
          <ProductTable />
        </TabsContent>

        {/* Deck Sales Data Tab */}
        <TabsContent value="deck_master" className="mt-6">
          <DeckMasterData />
        </TabsContent>

        {/* Eclipse Pricing Tab */}
        <TabsContent value="eclipse_pricing" className="mt-6">
          <EclipsePricingAdmin />
        </TabsContent>

        {/* Spec Mappings Tab */}
        <TabsContent value="spec_mappings" className="mt-6">
          <SpecMappingsAdmin />
        </TabsContent>

        {/* Supplier Categories Management */}
        <TabsContent value="supplier_categories" className="mt-6">
          <SupplierCategoryManager />
        </TabsContent>

        {/* Tab Names Management */}
        <TabsContent value="product_tab" className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Product Tab Names</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addEntry("product_tab")} className="h-7 text-xs gap-1.5">
                    <Plus className="h-3 w-3" /> Add Tab
                  </Button>
                  <Button size="sm" onClick={() => saveCategory("product_tab")} disabled={upsertMutation.isPending} className="h-7 text-xs gap-1.5">
                    <Save className="h-3 w-3" /> Save
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Manage custom tab names for product categories. Key = internal name, Value = display label.</p>
            </CardHeader>
            <CardContent>
              {entries.filter(e => e.category === "product_tab").length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No custom tabs. The default tabs (Roof, Channel, Beam, etc.) are always available.</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd("product_tab")}>
                  <SortableContext items={entries.filter(e => e.category === "product_tab").map(e => `row-${entries.indexOf(e)}`)} strategy={verticalListSortingStrategy}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="w-8"></th>
                          <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Key (internal)</th>
                          <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Label (display)</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.filter(e => e.category === "product_tab").map((entry) => {
                          const globalIndex = entries.indexOf(entry);
                          return (
                            <SortableTableRow key={globalIndex} id={`row-${globalIndex}`} className="border-b border-border/30">
                              <td className="py-1 pr-2">
                                <Input value={entry.key} onChange={(e) => updateEntry(globalIndex, "key", e.target.value)} placeholder="e.g. insulation" className="h-7 text-xs" />
                              </td>
                              <td className="py-1 pr-2">
                                <Input value={entry.value} onChange={(e) => updateEntry(globalIndex, "value", e.target.value)} placeholder="e.g. Insulation" className="h-7 text-xs" />
                              </td>
                              <td className="py-1">
                                <Button variant="ghost" size="sm" onClick={() => removeEntry(globalIndex)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
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
          </Card>
        </TabsContent>

        {/* UoM Management */}
        <TabsContent value="product_uom" className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Units of Measure</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => addEntry("product_uom")} className="h-7 text-xs gap-1.5">
                    <Plus className="h-3 w-3" /> Add UoM
                  </Button>
                  <Button size="sm" onClick={() => saveCategory("product_uom")} disabled={upsertMutation.isPending} className="h-7 text-xs gap-1.5">
                    <Save className="h-3 w-3" /> Save
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Manage custom units of measure. Default units (m, m2, ea, set, lot) are always available.</p>
            </CardHeader>
            <CardContent>
              {entries.filter(e => e.category === "product_uom").length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No custom UoMs. The default units (m, m2, ea, set, lot) are always available.</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd("product_uom")}>
                  <SortableContext items={entries.filter(e => e.category === "product_uom").map(e => `row-${entries.indexOf(e)}`)} strategy={verticalListSortingStrategy}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="w-8"></th>
                          <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Key (unit code)</th>
                          <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Description</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.filter(e => e.category === "product_uom").map((entry) => {
                          const globalIndex = entries.indexOf(entry);
                          return (
                            <SortableTableRow key={globalIndex} id={`row-${globalIndex}`} className="border-b border-border/30">
                              <td className="py-1 pr-2">
                                <Input value={entry.key} onChange={(e) => updateEntry(globalIndex, "key", e.target.value)} placeholder="e.g. lm" className="h-7 text-xs" />
                              </td>
                              <td className="py-1 pr-2">
                                <Input value={entry.value} onChange={(e) => updateEntry(globalIndex, "value", e.target.value)} placeholder="e.g. Linear Metre" className="h-7 text-xs" />
                              </td>
                              <td className="py-1">
                                <Button variant="ghost" size="sm" onClick={() => removeEntry(globalIndex)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
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
          </Card>
        </TabsContent>

        {/* Sales Data Category Tabs */}
        {allCategories.map(cat => {
          const catEntries = entries.filter(e => e.category === cat);
          return (
            <TabsContent key={cat} value={cat} className="mt-6">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium capitalize">{cat.replace(/_/g, " ")}</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => addEntry(cat)} className="h-7 text-xs gap-1.5">
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                      <Button size="sm" onClick={() => saveCategory(cat)} disabled={upsertMutation.isPending} className="h-7 text-xs gap-1.5">
                        <Save className="h-3 w-3" /> Save
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {catEntries.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No entries. Click Add to create one.</p>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(cat)}>
                      <SortableContext items={catEntries.map(e => `row-${entries.indexOf(e)}`)} strategy={verticalListSortingStrategy}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="w-8"></th>
                              <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Key</th>
                              <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Value</th>
                              <th className="w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {catEntries.map((entry) => {
                              const globalIndex = entries.indexOf(entry);
                              return (
                                <SortableTableRow key={globalIndex} id={`row-${globalIndex}`} className="border-b border-border/30">
                                  <td className="py-1 pr-2">
                                    <Input value={entry.key} onChange={(e) => updateEntry(globalIndex, "key", e.target.value)} className="h-7 text-xs" />
                                  </td>
                                  <td className="py-1 pr-2">
                                    <Input value={entry.value} onChange={(e) => updateEntry(globalIndex, "value", e.target.value)} className="h-7 text-xs" />
                                  </td>
                                  <td className="py-1">
                                    <Button variant="ghost" size="sm" onClick={() => removeEntry(globalIndex)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
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
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
      </div>
      <ConfirmDeleteDialog
        open={deleteEntryIndex !== null}
        onOpenChange={(o) => { if (!o) setDeleteEntryIndex(null); }}
        onConfirm={confirmRemoveEntry}
        title="Delete Entry?"
        description="This will permanently remove this master data entry."
      />
    </div>
  );
}
