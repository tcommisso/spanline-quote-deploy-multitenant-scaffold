import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Save, Plus, Trash2, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function StructureUom() {
  const utils = trpc.useUtils();
  const { data: masterData, isLoading } = trpc.masterData.getAll.useQuery();
  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      toast.success("UoM saved");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      toast.success("UoM deleted");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [entries, setEntries] = useState<Array<{ id?: number; category: string; key: string; value: string; sortOrder: number }>>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; entry: typeof entries[0] } | null>(null);

  const lastUpdated = masterData
    ? masterData.filter(d => d.category === "product_uom").reduce((latest, d) => {
        const t = new Date(d.updatedAt).getTime();
        return t > latest ? t : latest;
      }, 0)
    : 0;

  useEffect(() => {
    if (masterData) {
      setEntries(masterData.filter(d => d.category === "product_uom").map(d => ({
        id: d.id,
        category: d.category,
        key: d.key,
        value: d.value,
        sortOrder: d.sortOrder ?? 0,
      })));
    }
  }, [masterData]);

  const addEntry = () => {
    setEntries(prev => [...prev, { category: "product_uom", key: "", value: "", sortOrder: prev.length }]);
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

  const save = () => {
    const items = entries.filter(e => e.key.trim());
    items.forEach(item => {
      upsertMutation.mutate({
        id: item.id,
        category: "product_uom",
        key: item.key,
        value: item.value,
        sortOrder: item.sortOrder,
      });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Units of Measure</h1>
          <p className="text-sm text-muted-foreground">Manage custom units of measure. Default units (m, m2, ea, set, lot) are always available.</p>
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
            <CardTitle className="text-sm font-medium">Custom UoM</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addEntry} className="h-7 text-xs gap-1.5">
                <Plus className="h-3 w-3" /> Add UoM
              </Button>
              <Button size="sm" onClick={save} disabled={upsertMutation.isPending} className="h-7 text-xs gap-1.5">
                <Save className="h-3 w-3" /> Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No custom UoMs. The default units (m, m2, ea, set, lot) are always available.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Key (unit code)</th>
                  <th className="text-left py-2 font-medium text-muted-foreground w-1/3">Description</th>
                  <th className="text-right py-2 font-medium text-muted-foreground w-20">Order</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={index} className="border-b border-border/30">
                    <td className="py-1 pr-2">
                      <Input value={entry.key} onChange={(e) => updateEntry(index, "key", e.target.value)} placeholder="e.g. lm" className="h-7 text-xs" />
                    </td>
                    <td className="py-1 pr-2">
                      <Input value={entry.value} onChange={(e) => updateEntry(index, "value", e.target.value)} placeholder="e.g. Linear Metre" className="h-7 text-xs" />
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete UoM</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.entry.key || deleteTarget?.entry.value}</strong>? This action cannot be undone.
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
