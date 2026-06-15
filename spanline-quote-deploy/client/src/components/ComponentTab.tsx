import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Wand2, Lock, Unlock, Save, Package, Copy, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

interface LineItem {
  component: string;
  colour: string;
  uom: string;
  qty: number;
  cmQty: number;
  sellRate: number;
  costRate: number;
  factoryY: boolean;
  notes: string;
  productId?: number;
  isPowderCoated?: boolean;
  rateOverride?: boolean;
}

const emptyLine = (): LineItem => ({
  component: "", colour: "", uom: "ea", qty: 0, cmQty: 0,
  sellRate: 0, costRate: 0, factoryY: false, notes: "",
  productId: undefined, isPowderCoated: false, rateOverride: false,
});

const tabLabels: Record<string, string> = {
  roof: "Roof", channel: "Channel", beam: "Beam", post: "Post",
  gable: "Gable", cantilever: "Cantilever", carport: "Carport",
  glassroom: "Glassroom", screenroom: "Screenroom",
  lattice: "Lattice & Handrails", spacemaker: "Spacemaker",
  trades: "Trades", extras: "Extras", windows: "Windows", awnings: "Awnings",
};

const fmt = (n: number) => n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ComponentTab({ quoteId, tabName, region = "Canberra" }: { quoteId: number; tabName: string; region?: string }) {
  const utils = trpc.useUtils();
  const { data: component, isLoading } = trpc.components.getByTab.useQuery({ quoteId, tabName });
  const { data: productRates } = trpc.products.getRatesForTab.useQuery({ tabName, region });
  const { data: tabProducts } = trpc.products.getByTab.useQuery({ tabName });
  const { data: allColourGroups } = trpc.colourGroups.getAll.useQuery();
  const { data: allColourMembers } = trpc.colourGroups.getAllMembers.useQuery();

  const upsertMutation = trpc.components.upsert.useMutation({
    onSuccess: () => {
      toast.success(`${tabLabels[tabName] || tabName} saved`);
      utils.components.getByTab.invalidate({ quoteId, tabName });
      utils.components.getByQuote.invalidate({ quoteId });
    },
    onError: (err) => toast.error(err.message),
  });

  const suggestMutation = trpc.assistant.suggestQuantities.useMutation({
    onSuccess: (data) => {
      if (data.suggestions?.length) {
        const newLines = data.suggestions.map((s: any) => ({
          ...emptyLine(),
          component: s.component,
          qty: s.qty,
          uom: s.uom,
          notes: s.notes,
        }));
        setLines(prev => [...prev, ...newLines]);
        toast.success(`${newLines.length} items suggested by AI`);
      } else {
        toast.info("No suggestions available");
      }
    },
    onError: () => toast.error("Failed to get suggestions"),
  });

  const [included, setIncluded] = useState(true);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [statsCollapsed, setStatsCollapsed] = useState(false);

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  // Build a sorted product list for the dropdown
  const productOptions = useMemo(() => {
    if (!tabProducts) return [];
    return tabProducts.map(p => ({ id: p.id, name: p.name, uom: p.uom, colourGroup: p.colourGroup }));
  }, [tabProducts]);

  // Build colour options lookup: colourGroupName -> colourValue[]
  const colourGroupMap = useMemo(() => {
    if (!allColourGroups || !allColourMembers) return new Map<string, string[]>();
    const nameById = new Map<number, string>();
    for (const g of allColourGroups) nameById.set(g.id, g.name);
    const map = new Map<string, string[]>();
    for (const m of allColourMembers) {
      const groupName = nameById.get(m.colourGroupId);
      if (!groupName) continue;
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName)!.push(m.colourValue);
    }
    return map;
  }, [allColourGroups, allColourMembers]);

  // Build standard colours lookup: colourGroupName -> Set of standard colour values (no PC surcharge)
  const standardColoursByGroup = useMemo(() => {
    if (!allColourGroups) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const g of allColourGroups) {
      const stdColours = (g.standardColours as string[] | null) || [];
      if (stdColours.length > 0) {
        map.set(g.name, new Set(stdColours));
      }
    }
    return map;
  }, [allColourGroups]);

  // Get colour options for a specific line based on its product
  const getColourOptionsForLine = useCallback((line: LineItem): string[] => {
    // If colour value contains "mill", use Standard Colorbond
    if (line.colour && line.colour.toLowerCase().includes('mill')) {
      return colourGroupMap.get('Standard Colorbond') || [];
    }
    if (!line.productId) return colourGroupMap.get('Standard Colorbond') || [];
    const product = productOptions.find(p => p.id === line.productId);
    if (!product) return colourGroupMap.get('Standard Colorbond') || [];
    // Check if product has a specific colour group
    if (product.colourGroup && colourGroupMap.has(product.colourGroup)) {
      return colourGroupMap.get(product.colourGroup) || [];
    }
    // Fallback to Standard Colorbond
    return colourGroupMap.get('Standard Colorbond') || [];
  }, [productOptions, colourGroupMap]);

  // Determine if a line should show the colour dropdown
  const shouldShowColourDropdown = useCallback((line: LineItem): boolean => {
    // Show if colour value contains "mill"
    if (line.colour && line.colour.toLowerCase().includes('mill')) return true;
    // Show if component name contains "mill"
    if (line.component.toLowerCase().includes('mill')) return true;
    // Show if linked product name contains "mill"
    if (line.productId) {
      const product = productOptions.find(p => p.id === line.productId);
      if (product?.name.toLowerCase().includes('mill')) return true;
      if (product?.colourGroup) return true;
      // Show with standard fallback for all linked products
      return true;
    }
    return false;
  }, [productOptions]);

  useEffect(() => {
    if (component) {
      setIncluded(component.included ?? true);
      const items = (component.lineItems as LineItem[]) || [];
      setLines(items.length > 0 ? items : [emptyLine()]);
    } else {
      setIncluded(true);
      setLines([emptyLine()]);
    }
  }, [component]);

  // When a product is selected, auto-populate rates
  const selectProduct = useCallback((index: number, productIdStr: string) => {
    const productId = parseInt(productIdStr);
    if (!productRates || !productRates[productId]) return;
    const rate = productRates[productId];
    setLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      return {
        ...line,
        productId,
        component: rate.name,
        uom: rate.uom,
        sellRate: rate.sellRate,
        costRate: rate.costRate,
        rateOverride: false,
      };
    }));
  }, [productRates]);

  // Recalculate rates when powder coat changes
  const togglePowderCoat = useCallback((index: number, isPowderCoated: boolean) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== index || !line.productId || !productRates) return line;
      const rate = productRates[line.productId];
      if (!rate) return { ...line, isPowderCoated };

      // If powder coat is toggled and product has surcharge, adjust sell rate
      if (line.rateOverride) {
        return { ...line, isPowderCoated };
      }

      let newSellRate = rate.sellRate;
      if (isPowderCoated && rate.hasPowderCoat) {
        const product = tabProducts?.find(p => p.id === line.productId);
        const surcharge = product ? parseFloat(product.powderCoatSurcharge || "0") : 0;
        newSellRate += surcharge;
      }
      return { ...line, isPowderCoated, sellRate: newSellRate };
    }));
  }, [productRates, tabProducts]);

  // Determine the colour group name for a given product
  const getProductColourGroup = useCallback((productId: number | undefined): string | null => {
    if (!productId) return null;
    const product = productOptions.find(p => p.id === productId);
    return product?.colourGroup || null;
  }, [productOptions]);

  // Check if a colour is standard (no PC surcharge) for a given colour group
  const isStandardColour = useCallback((colourGroupName: string | null, colourValue: string): boolean => {
    if (!colourGroupName || !colourValue) return true; // No group or no colour = no PC
    const stdSet = standardColoursByGroup.get(colourGroupName);
    if (!stdSet || stdSet.size === 0) return true; // No standard colours defined = no auto-PC (backwards compatible)
    return stdSet.has(colourValue);
  }, [standardColoursByGroup]);

  const updateLine = useCallback((index: number, field: keyof LineItem, value: any) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      const updated = { ...line, [field]: value };
      // Mark as rate override if user edits sell or cost rate on a linked product
      if ((field === "sellRate" || field === "costRate") && line.productId) {
        updated.rateOverride = true;
      }
      // Auto-determine powder coat when colour changes
      if (field === "colour" && updated.productId && productRates) {
        const rate = productRates[updated.productId];
        if (rate?.hasPowderCoat) {
          const colourGroup = getProductColourGroup(updated.productId);
          const isStd = isStandardColour(colourGroup, value as string);
          updated.isPowderCoated = !isStd;
          // Recalculate sell rate if not overridden
          if (!updated.rateOverride) {
            let sellRate = rate.sellRate;
            if (updated.isPowderCoated) {
              const product = tabProducts?.find(p => p.id === updated.productId);
              const surcharge = product ? parseFloat(product.powderCoatSurcharge || "0") : 0;
              sellRate += surcharge;
            }
            updated.sellRate = sellRate;
          }
        }
      }
      return updated;
    }));
  }, [productRates, tabProducts, getProductColourGroup, isStandardColour]);

  const resetRates = useCallback((index: number) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== index || !line.productId || !productRates) return line;
      const rate = productRates[line.productId];
      if (!rate) return line;
      let sellRate = rate.sellRate;
      if (line.isPowderCoated && rate.hasPowderCoat) {
        const product = tabProducts?.find(p => p.id === line.productId);
        const surcharge = product ? parseFloat(product.powderCoatSurcharge || "0") : 0;
        sellRate += surcharge;
      }
      return { ...line, sellRate, costRate: rate.costRate, rateOverride: false };
    }));
  }, [productRates, tabProducts]);

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (index: number) => setLines(prev => prev.filter((_, i) => i !== index));

  // Duplicate a row
  const duplicateLine = (index: number) => {
    setLines(prev => {
      const copy = { ...prev[index] };
      const newLines = [...prev];
      newLines.splice(index + 1, 0, copy);
      return newLines;
    });
    toast.success("Row duplicated");
  };

  // Drag-and-drop handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index);
    dragRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragRef.current !== null && dragOverIndex !== null && dragRef.current !== dragOverIndex) {
      setLines(prev => {
        const newLines = [...prev];
        const [moved] = newLines.splice(dragRef.current!, 1);
        newLines.splice(dragOverIndex, 0, moved);
        return newLines;
      });
      toast.success("Row reordered");
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragRef.current = null;
  };

  const handleSave = () => {
    const filtered = lines.filter(l => l.component.trim() !== "");
    upsertMutation.mutate({ quoteId, tabName, included, lineItems: filtered });
  };

  const totalSell = lines.reduce((s, l) => s + l.qty * l.sellRate, 0);
  const totalCost = lines.reduce((s, l) => s + l.qty * l.costRate, 0);
  const margin = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : 0;
  const itemCount = lines.filter(l => l.component.trim()).length;
  const hasAutopriced = lines.some(l => l.productId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{tabLabels[tabName] || tabName}</h3>
          </div>
          {itemCount > 0 && (
            <Badge variant="secondary" className="text-xs">{itemCount} items</Badge>
          )}
          {hasAutopriced && (
            <Badge variant="outline" className="text-xs gap-1 text-emerald-600 border-emerald-200">
              <Lock className="h-3 w-3" /> Auto-priced
            </Badge>
          )}
          <div className="flex items-center gap-2 ml-2">
            <Switch checked={included} onCheckedChange={setIncluded} className="scale-90" />
            <span className="text-xs text-muted-foreground">{included ? "Included" : "Excluded"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => suggestMutation.mutate({ jobDescription: `Standard ${tabName} components for a patio/outdoor structure`, tabName })} disabled={suggestMutation.isPending}>
            <Wand2 className="h-3.5 w-3.5" />
            {suggestMutation.isPending ? "Thinking..." : "AI Suggest"}
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={addLine}>
            <Plus className="h-3.5 w-3.5" /> Add Row
          </Button>
          <Button size="sm" className="text-xs gap-1.5" onClick={handleSave} disabled={upsertMutation.isPending}>
            <Save className="h-3.5 w-3.5" />
            {upsertMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Collapsible summary stats card */}
      <Card className="border-emerald-200/50 bg-emerald-50/30 dark:bg-emerald-950/10 dark:border-emerald-800/30">
        <CardContent className="py-0 px-0">
          <button
            onClick={() => setStatsCollapsed(!statsCollapsed)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors rounded-lg cursor-pointer"
          >
            <div className={`flex items-center gap-6 flex-wrap text-xs transition-all ${statsCollapsed ? "opacity-70" : ""}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Total Sell:</span>
                <span className="font-semibold font-mono">${fmt(totalSell)}</span>
              </div>
              {!statsCollapsed && (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Total Cost:</span>
                    <span className="font-semibold font-mono">${fmt(totalCost)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Margin:</span>
                    <span className={`font-semibold ${margin < 20 ? "text-destructive" : margin < 35 ? "text-amber-600" : "text-emerald-600"}`}>
                      {margin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Profit:</span>
                    <span className="font-semibold font-mono">${fmt(totalSell - totalCost)}</span>
                  </div>
                </>
              )}
              {statsCollapsed && (
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">Margin:</span>
                  <span className={`font-semibold ${margin < 20 ? "text-destructive" : margin < 35 ? "text-amber-600" : "text-emerald-600"}`}>
                    {margin.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            {statsCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-[28px]"></th>
                  <th className="text-left px-3 py-2.5 font-medium w-[180px]">Product</th>
                  <th className="text-left px-3 py-2.5 font-medium w-[100px]">Colour</th>
                  <th className="text-center px-2 py-2.5 font-medium w-[36px]">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help">PC</span></TooltipTrigger>
                      <TooltipContent>Powder Coated (adds surcharge)</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="text-left px-2 py-2.5 font-medium w-[50px]">UoM</th>
                  <th className="text-right px-3 py-2.5 font-medium w-[60px]">Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium w-[60px]">CM Qty</th>
                  <th className="text-right px-3 py-2.5 font-medium w-[80px]">Sell Rate</th>
                  <th className="text-right px-3 py-2.5 font-medium w-[80px]">Sell Amt</th>
                  <th className="text-right px-3 py-2.5 font-medium w-[80px]">Cost Rate</th>
                  <th className="text-right px-3 py-2.5 font-medium w-[80px]">Cost Amt</th>
                  <th className="text-center px-2 py-2.5 font-medium w-[36px]">Fac</th>
                  <th className="text-left px-3 py-2.5 font-medium w-[100px]">Notes</th>
                  <th className="w-[68px]"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const sellAmt = line.qty * line.sellRate;
                  const costAmt = line.qty * line.costRate;
                  const isLinked = !!line.productId;
                  const isOverridden = line.rateOverride;
                  const isDragging = dragIndex === i;
                  const isDragOver = dragOverIndex === i;

                  return (
                    <tr
                      key={i}
                      className={`border-b transition-colors ${isDragging ? "opacity-40 bg-muted/20" : "hover:bg-muted/30"} ${isDragOver ? "border-t-2 border-t-primary" : ""}`}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDragEnd={handleDragEnd}
                    >
                      {/* Drag handle */}
                      <td className="px-1 py-1.5 text-center cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground" />
                      </td>
                      {/* Product selector or free-text */}
                      <td className="px-3 py-1.5">
                        {productOptions.length > 0 ? (
                          <Select
                            value={line.productId ? String(line.productId) : ""}
                            onValueChange={(val) => {
                              if (val === "__custom__") {
                                setLines(prev => prev.map((l, idx) => idx === i ? { ...l, productId: undefined, rateOverride: true } : l));
                              } else {
                                selectProduct(i, val);
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-0 focus:ring-1 w-full">
                              <SelectValue placeholder="Select product..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__custom__">Custom item...</SelectItem>
                              {productOptions.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={line.component} onChange={(e) => updateLine(i, "component", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-0 focus-visible:ring-1" placeholder="Component name" />
                        )}
                      </td>
                      {/* Colour dropdown or free-text */}
                      <td className="px-3 py-1.5">
                        {shouldShowColourDropdown(line) && getColourOptionsForLine(line).length > 0 ? (
                          <Select
                            value={line.colour || ""}
                            onValueChange={(val) => updateLine(i, "colour", val === "__clear__" ? "" : val)}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-0 focus:ring-1 w-full">
                              <SelectValue placeholder="Select colour..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__clear__">— None —</SelectItem>
                              {getColourOptionsForLine(line).map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={line.colour} onChange={(e) => updateLine(i, "colour", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-0 focus-visible:ring-1" placeholder="Colour" />
                        )}
                      </td>
                      {/* Powder Coat indicator/override */}
                      <td className="px-2 py-1.5 text-center">
                        {isLinked && productRates && line.productId && productRates[line.productId]?.hasPowderCoat ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <input type="checkbox" checked={line.isPowderCoated || false} onChange={(e) => togglePowderCoat(i, e.target.checked)} className={`h-3.5 w-3.5 rounded ${line.isPowderCoated ? 'accent-amber-500' : 'accent-primary'}`} />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[200px]">
                              {line.isPowderCoated
                                ? 'PC surcharge applied (non-standard colour)'
                                : 'No PC surcharge (standard colour)'}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      {/* UoM */}
                      <td className="px-2 py-1.5">
                        <select value={line.uom} onChange={(e) => updateLine(i, "uom", e.target.value)} className="h-7 text-xs bg-transparent border-0 w-full focus:outline-none cursor-pointer">
                          <option value="ea">ea</option>
                          <option value="m">m</option>
                          <option value="m2">m²</option>
                          <option value="set">set</option>
                          <option value="lot">lot</option>
                          <option value="hr">hr</option>
                        </select>
                      </td>
                      {/* Qty */}
                      <td className="px-3 py-1.5">
                        <Input type="number" value={line.qty || ""} onChange={(e) => updateLine(i, "qty", parseFloat(e.target.value) || 0)} className="h-7 text-xs border-0 bg-transparent px-0 text-right focus-visible:ring-1" />
                      </td>
                      {/* CM Qty */}
                      <td className="px-3 py-1.5">
                        <Input type="number" value={line.cmQty || ""} onChange={(e) => updateLine(i, "cmQty", parseFloat(e.target.value) || 0)} className="h-7 text-xs border-0 bg-transparent px-0 text-right focus-visible:ring-1" />
                      </td>
                      {/* Sell Rate */}
                      <td className="px-3 py-1.5 relative">
                        <Input type="number" value={line.sellRate || ""} onChange={(e) => updateLine(i, "sellRate", parseFloat(e.target.value) || 0)} className={`h-7 text-xs border-0 bg-transparent px-0 text-right focus-visible:ring-1 ${isLinked && !isOverridden ? "text-emerald-700 dark:text-emerald-400" : ""}`} />
                        {isLinked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer">
                                {isOverridden ? (
                                  <Unlock className="h-3 w-3 text-amber-500" onClick={() => resetRates(i)} />
                                ) : (
                                  <Lock className="h-3 w-3 text-emerald-600" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{isOverridden ? "Rate manually overridden. Click to reset." : "Auto-calculated from catalog"}</TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      {/* Sell Amount */}
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                        ${fmt(sellAmt)}
                      </td>
                      {/* Cost Rate */}
                      <td className="px-3 py-1.5">
                        <Input type="number" value={line.costRate || ""} onChange={(e) => updateLine(i, "costRate", parseFloat(e.target.value) || 0)} className={`h-7 text-xs border-0 bg-transparent px-0 text-right focus-visible:ring-1 ${isLinked && !isOverridden ? "text-emerald-700 dark:text-emerald-400" : ""}`} />
                      </td>
                      {/* Cost Amount */}
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                        ${fmt(costAmt)}
                      </td>
                      {/* Factory checkbox */}
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={line.factoryY} onChange={(e) => updateLine(i, "factoryY", e.target.checked)} className="h-3.5 w-3.5 rounded" />
                      </td>
                      {/* Notes */}
                      <td className="px-3 py-1.5">
                        <Input value={line.notes} onChange={(e) => updateLine(i, "notes", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-0 focus-visible:ring-1" placeholder="Notes..." />
                      </td>
                      {/* Actions: Duplicate + Delete */}
                      <td className="px-1 py-1.5">
                        <div className="flex items-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => duplicateLine(i)} className="h-6 w-6 p-0 text-muted-foreground hover:text-primary">
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate row</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => removeLine(i)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete row</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
