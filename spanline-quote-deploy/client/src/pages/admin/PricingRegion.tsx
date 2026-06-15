import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Save, Plus, Trash2, Clock, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface RegionEntry {
  id?: number;
  category: string;
  key: string;
  value: string;
  sortOrder: number;
  howApplicable: boolean;
}

export default function PricingRegion() {
  const utils = trpc.useUtils();
  const { data: masterData } = trpc.masterData.getAll.useQuery();
  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      toast.success("Regions saved");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      toast.success("Region deleted");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [entries, setEntries] = useState<RegionEntry[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; entry: RegionEntry } | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const lastUpdated = masterData
    ? masterData
        .filter(d => d.category === "region")
        .reduce((latest, d) => {
          const t = new Date(d.updatedAt).getTime();
          return t > latest ? t : latest;
        }, 0)
    : 0;

  useEffect(() => {
    if (masterData) {
      setEntries(masterData.filter(d => d.category === "region").map(d => ({
        id: d.id,
        category: d.category,
        key: d.key,
        value: d.value,
        sortOrder: d.sortOrder ?? 0,
        howApplicable: !!(d.metadata as any)?.howApplicable,
      })));
      setSelectedIndices(new Set());
    }
  }, [masterData]);

  const addEntry = () => {
    setEntries(prev => [...prev, { category: "region", key: "", value: "", sortOrder: prev.length, howApplicable: false }]);
  };

  const updateEntry = (index: number, field: string, value: any) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const handleRemoveClick = (index: number) => {
    const entry = entries[index];
    if (!entry.id) {
      setEntries(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setDeleteTarget({ index, entry });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { index, entry } = deleteTarget;
    if (entry.id) {
      deleteMutation.mutate({ id: entry.id });
    }
    setEntries(prev => prev.filter((_, i) => i !== index));
    setDeleteTarget(null);
  };

  const toggleSelect = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === entries.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(entries.map((_, i) => i)));
    }
  };

  const confirmBulkDelete = () => {
    const toDelete = Array.from(selectedIndices).sort((a, b) => b - a);
    for (const idx of toDelete) {
      const entry = entries[idx];
      if (entry.id) {
        deleteMutation.mutate({ id: entry.id });
      }
    }
    setEntries(prev => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
    setBulkDeleteOpen(false);
  };

  const save = () => {
    const items = entries.filter(e => e.key.trim());
    items.forEach(item => {
      upsertMutation.mutate({
        id: item.id,
        category: "region",
        key: item.key,
        value: item.value,
        sortOrder: item.sortOrder,
        metadata: { howApplicable: item.howApplicable },
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Regions</h1>
          <p className="text-sm text-muted-foreground">Define geographic regions with pricing multipliers and Home Owner Warranty (HOW) applicability</p>
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
            <CardTitle className="text-sm font-medium">Regions</CardTitle>
            <div className="flex gap-2">
              {selectedIndices.size > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} className="h-7 text-xs gap-1.5">
                  <Trash2 className="h-3 w-3" /> Delete {selectedIndices.size}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={addEntry} className="h-7 text-xs gap-1.5">
                <Plus className="h-3 w-3" /> Add
              </Button>
              <Button size="sm" onClick={save} disabled={upsertMutation.isPending} className="h-7 text-xs gap-1.5">
                <Save className="h-3 w-3" /> Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No entries. Click Add to create one.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-center py-2 w-8">
                    <input type="checkbox" checked={selectedIndices.size === entries.length && entries.length > 0} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-gray-300" />
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground w-1/4">Region Name</th>
                  <th className="text-left py-2 font-medium text-muted-foreground w-1/4">Description</th>
                  <th className="text-center py-2 font-medium text-muted-foreground w-20">
                    <span className="flex items-center justify-center gap-1"><Shield className="h-3 w-3" /> HOW</span>
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground w-16">Order</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id || `new-${index}`} className={`border-b border-border/30 ${selectedIndices.has(index) ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}`}>
                    <td className="py-1 text-center">
                      <input type="checkbox" checked={selectedIndices.has(index)} onChange={() => toggleSelect(index)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={entry.key} onChange={(e) => updateEntry(index, "key", e.target.value)} placeholder="e.g. ACT" className="h-7 text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={entry.value} onChange={(e) => updateEntry(index, "value", e.target.value)} placeholder="e.g. Australian Capital Territory" className="h-7 text-xs" />
                    </td>
                    <td className="py-1 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={entry.howApplicable}
                          onCheckedChange={(checked) => updateEntry(index, "howApplicable", checked)}
                          className="scale-75"
                        />
                      </div>
                    </td>
                    <td className="py-1 pr-2">
                      <Input type="number" value={entry.sortOrder} onChange={(e) => updateEntry(index, "sortOrder", parseInt(e.target.value) || 0)} className="h-7 text-xs text-right" />
                    </td>
                    <td className="py-1">
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveClick(index)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Info card about HOW */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-medium">Home Owner Warranty (HOW)</p>
              <p>When HOW is enabled for a region, the system will automatically suggest the appropriate warranty amount based on the quote total (ex GST) using tiered thresholds configured in the Home Warranty pricing settings.</p>
              <p className="text-[10px] text-amber-600">Default tiers: $20k→$600, $25k→$650, $35k→$700, $50k→$750, $100k→$1000</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Single Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Region</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.entry.key}</strong>? This action cannot be undone.
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

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIndices.size} Regions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIndices.size} selected {selectedIndices.size === 1 ? "region" : "regions"}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
