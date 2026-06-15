import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

const DEFAULT_MATERIALS = [
  { name: "Eclipse Blade 150mm", qty: 0, unitCost: 45.00, discount: 40 },
  { name: "Eclipse Blade 200mm", qty: 0, unitCost: 55.00, discount: 40 },
  { name: "Eclipse Blade 250mm", qty: 0, unitCost: 65.00, discount: 40 },
  { name: "Eclipse Motor", qty: 0, unitCost: 350.00, discount: 40 },
  { name: "Eclipse Motor Bracket", qty: 0, unitCost: 45.00, discount: 40 },
  { name: "Eclipse End Cap LH", qty: 0, unitCost: 12.00, discount: 40 },
  { name: "Eclipse End Cap RH", qty: 0, unitCost: 12.00, discount: 40 },
  { name: "Eclipse Gutter Bracket", qty: 0, unitCost: 8.50, discount: 40 },
  { name: "Eclipse Gutter", qty: 0, unitCost: 35.00, discount: 40 },
  { name: "Eclipse Downpipe", qty: 0, unitCost: 28.00, discount: 40 },
  { name: "Eclipse Flashing", qty: 0, unitCost: 22.00, discount: 40 },
  { name: "Eclipse Side Channel LH", qty: 0, unitCost: 38.00, discount: 40 },
  { name: "Eclipse Side Channel RH", qty: 0, unitCost: 38.00, discount: 40 },
  { name: "Eclipse Back Channel", qty: 0, unitCost: 42.00, discount: 40 },
  { name: "Eclipse Front Rail", qty: 0, unitCost: 48.00, discount: 40 },
  { name: "Eclipse Mounting Bracket", qty: 0, unitCost: 15.00, discount: 40 },
  { name: "Eclipse Linkage Arm", qty: 0, unitCost: 18.00, discount: 40 },
  { name: "Eclipse Pivot Bracket", qty: 0, unitCost: 12.00, discount: 40 },
  { name: "Eclipse Blade Clip", qty: 0, unitCost: 3.50, discount: 40 },
  { name: "Eclipse Blade Seal", qty: 0, unitCost: 8.00, discount: 40 },
  { name: "Eclipse Corner Post", qty: 0, unitCost: 85.00, discount: 40 },
  { name: "Eclipse Mid Post", qty: 0, unitCost: 75.00, discount: 40 },
  { name: "Eclipse Post Foot", qty: 0, unitCost: 22.00, discount: 40 },
  { name: "Eclipse Beam", qty: 0, unitCost: 95.00, discount: 40 },
  { name: "Eclipse Beam Bracket", qty: 0, unitCost: 18.00, discount: 40 },
  { name: "Eclipse Fascia", qty: 0, unitCost: 32.00, discount: 40 },
  { name: "Eclipse Remote Control", qty: 0, unitCost: 120.00, discount: 40 },
  { name: "Eclipse Rain Sensor", qty: 0, unitCost: 180.00, discount: 40 },
  { name: "Eclipse Wind Sensor", qty: 0, unitCost: 195.00, discount: 40 },
  { name: "Eclipse Transformer", qty: 0, unitCost: 85.00, discount: 40 },
  { name: "Eclipse Wiring Kit", qty: 0, unitCost: 45.00, discount: 40 },
  { name: "Eclipse Touch-up Paint", qty: 0, unitCost: 25.00, discount: 40 },
  { name: "Eclipse Fixings Pack", qty: 0, unitCost: 35.00, discount: 40 },
];

export default function EclipseCalc({ quoteId }: { quoteId: number }) {
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.eclipse.getByQuote.useQuery({ quoteId });
  const upsertMutation = trpc.eclipse.upsert.useMutation({
    onSuccess: () => {
      utils.eclipse.getByQuote.invalidate({ quoteId });
      toast.success("Eclipse entry saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.eclipse.delete.useMutation({
    onSuccess: () => {
      utils.eclipse.getByQuote.invalidate({ quoteId });
      toast.success("Eclipse entry deleted");
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [labourDays, setLabourDays] = useState("2");
  const [labourRate, setLabourRate] = useState("450");
  const [tradeDiscount, setTradeDiscount] = useState("40");
  const [systemWidth, setSystemWidth] = useState("");
  const [systemProjection, setSystemProjection] = useState("");
  const [bladeCount, setBladeCount] = useState(0);

  useEffect(() => {
    if (editing) {
      setMaterials(editing.materialLines || DEFAULT_MATERIALS);
      setLabourDays(editing.labourDays || "2");
      setLabourRate(editing.labourRate || "450");
      setTradeDiscount(editing.tradeDiscount || "40");
      setSystemWidth(editing.systemWidth || "");
      setSystemProjection(editing.systemProjection || "");
      setBladeCount(editing.bladeCount || 0);
    }
  }, [editing]);

  const updateMaterial = (index: number, field: string, value: any) => {
    setMaterials(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const discountRate = parseFloat(tradeDiscount) / 100;
  const materialsCost = materials.reduce((s, m) => s + m.qty * m.unitCost * (1 - (m.discount / 100)), 0);
  const labourCost = parseFloat(labourDays) * parseFloat(labourRate);
  const totalCost = materialsCost + labourCost;
  const sellMultiplier = 2.226;
  const totalSell = totalCost * sellMultiplier;
  const margin = totalSell > 0 ? ((totalSell - totalCost) / totalSell * 100) : 0;

  const handleSave = () => {
    upsertMutation.mutate({
      id: editing?.id,
      quoteId,
      included: true,
      systemWidth,
      systemProjection,
      bladeCount,
      materialLines: materials,
      labourDays,
      labourRate,
      tradeDiscount,
      totalCost: totalCost.toFixed(2),
      totalSell: totalSell.toFixed(2),
    });
    setEditing(null);
  };

  const handleNew = () => {
    setEditing(null);
    setMaterials(DEFAULT_MATERIALS);
    setLabourDays("2");
    setLabourRate("450");
    setTradeDiscount("40");
    setSystemWidth("");
    setSystemProjection("");
    setBladeCount(0);
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      {/* Existing entries */}
      {(entries || []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Eclipse Entries</CardTitle>
              <Button size="sm" variant="outline" onClick={handleNew} className="h-7 text-xs gap-1.5">
                <Plus className="h-3 w-3" /> New Entry
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">System</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Cost</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Sell</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Margin</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {entries!.map(e => {
                  const c = parseFloat(e.totalCost || "0");
                  const s = parseFloat(e.totalSell || "0");
                  const m = s > 0 ? ((s - c) / s * 100) : 0;
                  return (
                    <tr key={e.id} className="border-b border-border/30">
                      <td className="py-2">{e.systemWidth}mm x {e.systemProjection}mm ({e.bladeCount} blades)</td>
                      <td className="py-2 text-right font-mono">${c.toFixed(2)}</td>
                      <td className="py-2 text-right font-mono">${s.toFixed(2)}</td>
                      <td className="py-2 text-right font-mono text-emerald-600">{m.toFixed(1)}%</td>
                      <td className="py-2 flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(e)} className="h-6 text-xs">Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(e.id)} className="h-6 w-6 p-0 text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Calculator */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {editing ? "Edit Eclipse Entry" : "New Eclipse Entry"}
            </CardTitle>
            <Button size="sm" onClick={handleSave} disabled={upsertMutation.isPending} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              {upsertMutation.isPending ? "Saving..." : "Save Entry"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* System Dimensions */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">System Width (mm)</Label>
              <Input type="number" value={systemWidth} onChange={(e) => setSystemWidth(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Projection (mm)</Label>
              <Input type="number" value={systemProjection} onChange={(e) => setSystemProjection(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Blade Count</Label>
              <Input type="number" value={bladeCount || ""} onChange={(e) => setBladeCount(parseInt(e.target.value) || 0)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Trade Discount %</Label>
              <Input type="number" value={tradeDiscount} onChange={(e) => setTradeDiscount(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Material Lines */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Material</th>
                  <th className="text-right py-2 font-medium text-muted-foreground w-20">Qty</th>
                  <th className="text-right py-2 font-medium text-muted-foreground w-24">Unit Cost</th>
                  <th className="text-right py-2 font-medium text-muted-foreground w-16">Disc %</th>
                  <th className="text-right py-2 font-medium text-muted-foreground w-24">Net Cost</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1 text-muted-foreground">{m.name}</td>
                    <td className="py-1">
                      <Input type="number" value={m.qty || ""} onChange={(e) => updateMaterial(i, "qty", parseFloat(e.target.value) || 0)} className="h-7 text-xs border-0 bg-transparent text-right focus-visible:ring-1" />
                    </td>
                    <td className="py-1 text-right font-mono">${m.unitCost.toFixed(2)}</td>
                    <td className="py-1 text-right font-mono">{m.discount}%</td>
                    <td className="py-1 text-right font-mono">${(m.qty * m.unitCost * (1 - m.discount / 100)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Labour & Totals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Labour Days</Label>
              <Input type="number" value={labourDays} onChange={(e) => setLabourDays(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Labour Rate ($/day)</Label>
              <Input type="number" value={labourRate} onChange={(e) => setLabourRate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">Materials Cost</p>
              <p className="font-mono font-semibold text-sm">${materialsCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Labour Cost</p>
              <p className="font-mono font-semibold text-sm">${labourCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Sell</p>
              <p className="font-mono font-semibold text-sm text-primary">${totalSell.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Margin</p>
              <p className="font-mono font-semibold text-sm text-emerald-600">{margin.toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }}
        title="Delete Eclipse Entry?"
        description="This will permanently remove this Eclipse entry from the quote."
      />
    </div>
  );
}
