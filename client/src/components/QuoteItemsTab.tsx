import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Zap, Plus, Trash2, AlertTriangle, Check, CheckCheck, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";

const TAB_LABELS: Record<string, string> = {
  roof: "Roof", channel: "Channel", beam: "Beam", post: "Post",
  gable: "Gable", cantilever: "Cantilever", carport: "Carport",
  glassroom: "Glassroom", screenroom: "Screenroom",
  lattice: "Lattice", spacemaker: "Spacemaker",
  trades: "Trades", extras: "Extras", windows: "Windows", awnings: "Awnings",
};

interface QuoteItemsTabProps {
  quoteId: number;
}

export default function QuoteItemsTab({ quoteId }: QuoteItemsTabProps) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const utils = trpc.useUtils();

  // Fetch quote items
  const { data: items, isLoading } = trpc.specItems.items.list.useQuery({ quoteId });

  // Fetch quote data for spec values
  const { data: quote } = trpc.quotes.get.useQuery({ id: quoteId });

  // Fetch roof products to get coverage width for selected roof type
  const { data: roofProductsData } = trpc.products.getNamesByTabPattern.useQuery({ pattern: "roof" });

  // Generate mutation
  const generateMutation = trpc.specItems.generate.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      utils.specItems.items.list.invalidate({ quoteId });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Item mutations
  const createMutation = trpc.specItems.items.create.useMutation({
    onSuccess: () => { toast.success("Item added"); utils.specItems.items.list.invalidate({ quoteId }); setAddOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.specItems.items.update.useMutation({
    onSuccess: () => { utils.specItems.items.list.invalidate({ quoteId }); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = trpc.specItems.items.delete.useMutation({
    onSuccess: () => { toast.success("Item removed"); utils.specItems.items.list.invalidate({ quoteId }); },
    onError: (e: any) => toast.error(e.message),
  });
  const confirmMutation = trpc.specItems.items.confirm.useMutation({
    onSuccess: () => { utils.specItems.items.list.invalidate({ quoteId }); },
    onError: (e: any) => toast.error(e.message),
  });
  const confirmAllMutation = trpc.specItems.items.confirmAll.useMutation({
    onSuccess: () => { toast.success("All items confirmed"); utils.specItems.items.list.invalidate({ quoteId }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Add item dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    tabName: "extras",
    description: "",
    colour: "",
    uom: "ea",
    qty: 1,
    costRate: 0,
    sellRate: 0,
  });

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  // Filter
  const [filterTab, setFilterTab] = useState<string>("all");
  const [deleteItemTarget, setDeleteItemTarget] = useState<number | null>(null);

  const handleGenerate = () => {
    if (!quote) { toast.error("Quote data not loaded"); return; }
    // Extract spec values from quote
    const specValues: Record<string, any> = {};
    Object.entries(quote).forEach(([k, v]) => {
      if (k.startsWith("spec") || k === "descriptionOfWork") {
        specValues[k] = v;
      }
    });
    generateMutation.mutate({ quoteId, specValues });
  };

  const handleAddItem = () => {
    if (!newItem.description) { toast.error("Description required"); return; }
    createMutation.mutate({ quoteId, ...newItem });
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditValues({ qty: parseFloat(item.qty), costRate: parseFloat(item.costRate), sellRate: parseFloat(item.sellRate) });
  };

  const saveEdit = (id: number) => {
    updateMutation.mutate({ id, data: editValues });
    setEditingId(null);
  };

  // Computed totals
  const totals = useMemo(() => {
    if (!items) return { totalCost: 0, totalSell: 0, margin: 0 };
    const totalCost = items.reduce((s, i) => s + parseFloat(i.qty as any) * parseFloat(i.costRate as any), 0);
    const totalSell = items.reduce((s, i) => s + parseFloat(i.qty as any) * parseFloat(i.sellRate as any), 0);
    const margin = totalSell > 0 ? ((totalSell - totalCost) / totalSell * 100) : 0;
    return { totalCost, totalSell, margin };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (filterTab === "all") return items;
    return items.filter(i => i.tabName === filterTab);
  }, [items, filterTab]);

  const flaggedCount = items?.filter(i => i.needsConfirmation).length || 0;

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Quote Items</h3>
          {items && items.length > 0 && (
            <Badge variant="secondary" className="text-xs">{items.length} items</Badge>
          )}
          {flaggedCount > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="h-3 w-3" /> {flaggedCount} need confirmation
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {flaggedCount > 0 && (
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => confirmAllMutation.mutate({ quoteId })} disabled={confirmAllMutation.isPending}>
              <CheckCheck className="h-3.5 w-3.5" /> Confirm All
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Item
          </Button>
          <Button size="sm" className="text-xs gap-1.5" onClick={handleGenerate} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {items && items.length > 0 ? "Re-generate" : "Generate from Spec"}
          </Button>
        </div>
      </div>

      {/* Roof Area & Material Estimates */}
      {quote && (quote as any).specWidth && (quote as any).specLength && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-6 flex-wrap text-xs">
              {(() => {
                const w = parseFloat((quote as any).specWidth || "0");
                const l = parseFloat((quote as any).specLength || "0");
                const fall = parseFloat((quote as any).specFall || "0");
                const shape = (quote as any).specRoofShape || "Flat/Skillion";
                const area = w * l;
                const pitchRad = (fall * Math.PI) / 180;
                // Shape-specific roof area calculation
                let roofArea: number;
                switch (shape) {
                  case "Gable":
                    roofArea = fall > 0 ? 2 * ((w / 2) / Math.cos(pitchRad)) * l : w * l;
                    break;
                  case "Dutch Gable":
                    roofArea = fall > 0 ? 2 * ((w / 2) / Math.cos(pitchRad)) * l * 1.1 : w * l * 1.1;
                    break;
                  case "Split Gable":
                    roofArea = fall > 0 ? 2 * ((w / 2) / Math.cos(pitchRad)) * l : w * l;
                    break;
                  case "Flat-Gable-Flat": {
                    const gableW = w / 3;
                    const flatW = w / 3;
                    const gableArea = fall > 0 ? 2 * ((gableW / 2) / Math.cos(pitchRad)) * l : gableW * l;
                    roofArea = gableArea + 2 * (flatW * l);
                    break;
                  }
                  default: // Flat/Skillion
                    roofArea = fall > 0 ? (w * l) / Math.cos(pitchRad) : w * l;
                }
                const perimeter = 2 * (w + l);
                // Get coverage width from selected roof type product, fallback to 762mm
                const roofType = (quote as any).specRoofType || "";
                const roofProduct = roofProductsData?.find(p => p.name === roofType);
                const coverageWidthMm = roofProduct?.coverageWidth || 762;
                const coverageWidthM = coverageWidthMm / 1000;
                // Material estimates
                const sheetsStd = Math.ceil(roofArea / coverageWidthM);
                const screws = Math.ceil(roofArea * 12); // ~12 screws per m²
                const gutterM = perimeter; // gutter runs along perimeter (approx)
                return (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Structure:</span>
                      <span className="font-semibold">{area.toFixed(1)} m²</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Roof Area:</span>
                      <span className="font-semibold">{roofArea.toFixed(1)} m²</span>
                      <span className="text-muted-foreground">({shape}{fall > 0 ? `, ${fall}°` : ""})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Perimeter:</span>
                      <span className="font-semibold">{perimeter.toFixed(1)} m</span>
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Est. Sheets:</span>
                      <span className="font-medium">~{sheetsStd}</span>
                      <span className="text-muted-foreground">({coverageWidthMm}mm)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Est. Screws:</span>
                      <span className="font-medium">~{screws}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Gutter:</span>
                      <span className="font-medium">~{gutterM.toFixed(1)} m</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs */}
      {items && items.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <Badge variant={filterTab === "all" ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setFilterTab("all")}>All</Badge>
          {Array.from(new Set(items.map(i => i.tabName))).map(tab => (
            <Badge key={tab} variant={filterTab === tab ? "default" : "outline"} className="cursor-pointer text-xs capitalize" onClick={() => setFilterTab(tab)}>
              {TAB_LABELS[tab] || tab}
            </Badge>
          ))}
        </div>
      )}

      {/* Items table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No quote items yet</p>
            <p className="text-xs text-muted-foreground">Click "Generate from Spec" to auto-create items from the spec sheet, or add items manually.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Source</th>
                    <th className="text-left px-3 py-2 font-medium">Tab</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-left px-3 py-2 font-medium">Colour</th>
                    <th className="text-left px-3 py-2 font-medium">Btm Colour</th>
                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                    <th className="text-left px-3 py-2 font-medium">UoM</th>
                    <th className="text-right px-3 py-2 font-medium">Cost</th>
                    <th className="text-right px-3 py-2 font-medium">Sell</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                    <th className="text-center px-3 py-2 font-medium w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item: any) => (
                    <tr key={item.id} className={`border-b hover:bg-muted/30 ${item.needsConfirmation ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${parseFloat(item.qty) === 0 ? "opacity-50 line-through" : ""}`}>
                      <td className="px-3 py-1.5">
                        <Badge variant={item.source === "auto" ? "secondary" : "outline"} className="text-[10px]">
                          {item.source === "auto" ? "Auto" : "Manual"}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 capitalize">{TAB_LABELS[item.tabName] || item.tabName}</td>
                      <td className="px-3 py-1.5 max-w-[200px] truncate">
                        <div className="flex items-center gap-1.5">
                          {item.needsConfirmation && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                          {item.description}
                        </div>
                      </td>
                      <td className="px-3 py-1.5">{item.colour || "—"}</td>
                      <td className="px-3 py-1.5">{item.bottomColour || "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        {editingId === item.id ? (
                          <Input type="number" className="h-6 w-16 text-xs text-right" value={editValues.qty} onChange={e => setEditValues(p => ({ ...p, qty: parseFloat(e.target.value) || 0 }))} />
                        ) : (
                          <span className="cursor-pointer hover:underline" onClick={() => startEdit(item)}>{parseFloat(item.qty).toFixed(1)}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{item.uom || "ea"}</td>
                      <td className="px-3 py-1.5 text-right">
                        {editingId === item.id ? (
                          <Input type="number" className="h-6 w-20 text-xs text-right" value={editValues.costRate} onChange={e => setEditValues(p => ({ ...p, costRate: parseFloat(e.target.value) || 0 }))} />
                        ) : (
                          <span className="cursor-pointer hover:underline" onClick={() => startEdit(item)}>${parseFloat(item.costRate).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {editingId === item.id ? (
                          <Input type="number" className="h-6 w-20 text-xs text-right" value={editValues.sellRate} onChange={e => setEditValues(p => ({ ...p, sellRate: parseFloat(e.target.value) || 0 }))} />
                        ) : (
                          <span className="cursor-pointer hover:underline" onClick={() => startEdit(item)}>${parseFloat(item.sellRate).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        ${(parseFloat(item.qty) * parseFloat(item.sellRate)).toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {editingId === item.id ? (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveEdit(item.id)}>
                              <Check className="h-3 w-3 text-emerald-600" />
                            </Button>
                          ) : item.needsConfirmation ? (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => confirmMutation.mutate({ id: item.id })} title="Confirm item">
                              <Check className="h-3 w-3 text-amber-600" />
                            </Button>
                          ) : null}
                          {(item.source !== "auto" || isAdmin) && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteItemTarget(item.id)} title={item.source === "auto" ? "Admin: Delete auto-generated item" : "Delete item"}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Totals summary */}
      {items && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="text-sm font-semibold">${totals.totalCost.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-xs text-muted-foreground">Total Sell</p>
              <p className="text-sm font-semibold">${totals.totalSell.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className={`text-sm font-semibold ${totals.margin >= 30 ? "text-emerald-600" : totals.margin >= 20 ? "text-amber-600" : "text-red-600"}`}>
                {totals.margin.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tab/Category</Label>
              <Select value={newItem.tabName} onValueChange={v => setNewItem(p => ({ ...p, tabName: v }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TAB_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description *</Label>
              <Input className="h-8" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} placeholder="Item description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Colour</Label>
                <Input className="h-8" value={newItem.colour} onChange={e => setNewItem(p => ({ ...p, colour: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">UoM</Label>
                <Select value={newItem.uom} onValueChange={v => setNewItem(p => ({ ...p, uom: v }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["ea", "m", "m²", "lm", "set", "lot"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Qty</Label>
                <Input type="number" className="h-8" value={newItem.qty} onChange={e => setNewItem(p => ({ ...p, qty: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cost Rate ($)</Label>
                <Input type="number" className="h-8" value={newItem.costRate} onChange={e => setNewItem(p => ({ ...p, costRate: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sell Rate ($)</Label>
                <Input type="number" className="h-8" value={newItem.sellRate} onChange={e => setNewItem(p => ({ ...p, sellRate: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={createMutation.isPending}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={deleteItemTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteItemTarget(null); }}
        onConfirm={() => { if (deleteItemTarget) { deleteMutation.mutate({ id: deleteItemTarget }); setDeleteItemTarget(null); } }}
        title="Delete Quote Item?"
        description="This will permanently remove this item from the quote."
      />
    </div>
  );
}
