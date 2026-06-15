import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

export default function SkyluxCalc({ quoteId }: { quoteId: number }) {
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.skylux.getByQuote.useQuery({ quoteId });
  const upsertMutation = trpc.skylux.upsert.useMutation({
    onSuccess: () => {
      utils.skylux.getByQuote.invalidate({ quoteId });
      toast.success("Skylux entry saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.skylux.delete.useMutation({
    onSuccess: () => {
      utils.skylux.getByQuote.invalidate({ quoteId });
      toast.success("Skylux entry deleted");
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [newLength, setNewLength] = useState("");
  const [newWidth, setNewWidth] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

  const lookupMutation = trpc.skylux.lookup.useQuery(
    { length: parseInt(newLength) || 0, width: parseInt(newWidth) || 0 },
    { enabled: !!(parseInt(newLength) && parseInt(newWidth)) }
  );

  const handleAdd = () => {
    const baseCost = lookupMutation.data?.baseCost || "0";
    const multiplier = parseFloat(lookupMutation.data?.sellMultiplier || "2.226");
    const sell = (parseFloat(baseCost) * multiplier).toFixed(2);
    upsertMutation.mutate({
      quoteId,
      length: newLength,
      width: newWidth,
      baseCost,
      sellPrice: sell,
      included: true,
    });
    setNewLength("");
    setNewWidth("");
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const totalSell = (entries || []).filter(e => e.included).reduce((s, e) => s + parseFloat(e.sellPrice || "0"), 0);
  const totalCost = (entries || []).filter(e => e.included).reduce((s, e) => s + parseFloat(e.baseCost || "0"), 0);

  return (
    <div className="space-y-6">
      {/* Lookup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Skylux Price Lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Length (mm)</Label>
              <Input type="number" value={newLength} onChange={(e) => setNewLength(e.target.value)} className="h-9 text-sm w-32" placeholder="e.g. 3000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Width (mm)</Label>
              <Input type="number" value={newWidth} onChange={(e) => setNewWidth(e.target.value)} className="h-9 text-sm w-32" placeholder="e.g. 2400" />
            </div>
            <div className="flex items-center gap-2">
              {lookupMutation.data && (
                <div className="text-xs space-y-0.5 px-3 py-1.5 bg-muted rounded-lg">
                  <p>Base Cost: <span className="font-mono font-medium">${lookupMutation.data.baseCost}</span></p>
                  <p>Sell: <span className="font-mono font-medium">${(parseFloat(lookupMutation.data.baseCost) * parseFloat(lookupMutation.data.sellMultiplier || "2.226")).toFixed(2)}</span></p>
                </div>
              )}
              {!lookupMutation.data && parseInt(newLength) > 0 && parseInt(newWidth) > 0 && (
                <p className="text-xs text-muted-foreground">No price found for this size</p>
              )}
              <Button size="sm" onClick={handleAdd} disabled={!lookupMutation.data} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add to Quote
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Skylux Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {(!entries || entries.length === 0) ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No Skylux entries. Use the lookup above to add one.</p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Included</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Length</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Width</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Base Cost</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Sell Price</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Margin</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const cost = parseFloat(e.baseCost || "0");
                    const sell = parseFloat(e.sellPrice || "0");
                    const margin = sell > 0 ? ((sell - cost) / sell * 100) : 0;
                    return (
                      <tr key={e.id} className="border-b border-border/30">
                        <td className="py-2">
                          <Switch
                            checked={!!e.included}
                            onCheckedChange={(v) => upsertMutation.mutate({ id: e.id, quoteId, included: v, length: e.length || undefined, width: e.width || undefined, baseCost: e.baseCost || undefined, sellPrice: e.sellPrice || undefined, notes: e.notes || undefined })}
                          />
                        </td>
                        <td className="py-2 text-right font-mono">{e.length}mm</td>
                        <td className="py-2 text-right font-mono">{e.width}mm</td>
                        <td className="py-2 text-right font-mono">${cost.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono">${sell.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono text-emerald-600">{margin.toFixed(1)}%</td>
                        <td className="py-2">
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(e.id)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t flex justify-between text-xs">
                <span className="text-muted-foreground">Total Sell: <span className="font-mono font-medium text-foreground">${totalSell.toFixed(2)}</span></span>
                <span className="text-muted-foreground">Total Cost: <span className="font-mono font-medium text-foreground">${totalCost.toFixed(2)}</span></span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }}
        title="Delete Skylux Entry?"
        description="This will permanently remove this Skylux entry from the quote."
      />
    </div>
  );
}
