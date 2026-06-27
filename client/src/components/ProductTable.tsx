import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Plus, Trash2, Save, Check, X, Pencil, ChevronLeft, ChevronRight, Package, Upload, Clock, ImageIcon } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { TAB_LABELS, type ComponentTabName } from "@shared/types";
import { useAuth } from "@/_core/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProductImport from "@/components/ProductImport";
import CatalogueImportDialog from "@/components/CatalogueImportDialog";
import { isAdminRole } from "@shared/const";

/** Tiny inline thumbnail that matches product by code or name to product_images table */
function ProductImageThumb({ code, name }: { code: string | null; name: string }) {
  const searchKey = code || name.split(" ")[0] || "";
  const { data: images } = trpc.planConverter.getProductImagesByCode.useQuery(
    { code: searchKey },
    { enabled: searchKey.length > 1, staleTime: 60_000 * 5 }
  );
  const img = images?.[0];
  if (!img) return <div className="w-6 h-6 rounded bg-muted/50 flex items-center justify-center"><ImageIcon className="w-3 h-3 text-muted-foreground/40" /></div>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <img src={img.imageUrl} alt={img.name} className="w-6 h-6 rounded object-cover border border-border/50" />
        </TooltipTrigger>
        <TooltipContent side="right" className="p-0">
          <img src={img.imageUrl} alt={img.name} className="w-40 h-40 object-contain rounded" />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Markup categories will be derived dynamically from master data

const PAGE_SIZE = 25;

interface EditingProduct {
  id: number;
  productCode: string | null;
  tabName: string;
  name: string;
  subTab: string | null;
  uom: string;
  baseCost: string;
  materials: string;
  installLabour: string;
  consumables: string;
  markupCategory: string | null;
  fixedSell: string | null;
  powderCoatSurcharge: string;
  colourGroup: string | null;
  colourGroupBottom: string | null;
  coverageWidth: number | null;
  sortOrder: number;
  active: boolean;
}

/** Auto-compute baseCost from the three sub-components */
function sumCostBreakdown(materials: string, installLabour: string, consumables: string): string {
  const m = parseFloat(materials) || 0;
  const l = parseFloat(installLabour) || 0;
  const c = parseFloat(consumables) || 0;
  return (m + l + c).toFixed(2);
}



export default function ProductTable() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const { data: allProducts, isLoading } = trpc.products.getAll.useQuery();
  const { data: masterDataItems } = trpc.masterData.getAll.useQuery();
  const { data: tabsAndUoms } = trpc.products.getTabsAndUoms.useQuery();
  const { data: colourGroupsList } = trpc.colourGroups.getAll.useQuery();

  const [search, setSearch] = useState("");
  const [tabFilter, setTabFilter] = useState<string>("all");
  const [subTabFilter, setSubTabFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<EditingProduct | null>(null);
  const [adding, setAdding] = useState<Partial<EditingProduct> & { tabName?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showCatalogueImport, setShowCatalogueImport] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const productRows = useMemo(() => Array.isArray(allProducts) ? allProducts : [], [allProducts]);
  const masterDataRows = useMemo(() => Array.isArray(masterDataItems) ? masterDataItems : [], [masterDataItems]);
  const tabRows = useMemo(() => Array.isArray(tabsAndUoms?.tabs) ? tabsAndUoms.tabs : [], [tabsAndUoms]);
  const subTabRows = useMemo(() => Array.isArray(tabsAndUoms?.subTabs) ? tabsAndUoms.subTabs : [], [tabsAndUoms]);
  const uomRows = useMemo(() => Array.isArray(tabsAndUoms?.uoms) ? tabsAndUoms.uoms : [], [tabsAndUoms]);
  const colourGroupRows = useMemo(() => Array.isArray(colourGroupsList) ? colourGroupsList : [], [colourGroupsList]);

  const upsertMutation = trpc.products.upsert.useMutation({
    onSuccess: () => {
      toast.success("Product saved");
      setEditing(null);
      setAdding(null);
      utils.products.getAll.invalidate();
      utils.products.getByTab.invalidate();
      utils.products.getRatesForTab.invalidate();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success("Product deleted");
      setDeleteTarget(null);
      utils.products.getAll.invalidate();
      utils.products.getByTab.invalidate();
      utils.products.getRatesForTab.invalidate();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const bulkDeleteMutation = trpc.products.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.deleted} products deleted`);
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      utils.products.getAll.invalidate();
      utils.products.getByTab.invalidate();
      utils.products.getRatesForTab.invalidate();
    },
    onError: (err) => toast.error(`Bulk delete failed: ${err.message}`),
  });

  // Build markup lookup and categories list from master data
  const markupLookup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of masterDataRows) {
      if (item.category === "markup") {
        map[item.key] = parseFloat(item.value) || 1;
      }
    }
    return map;
  }, [masterDataRows]);

  // Dynamic markup categories from master data
  const markupCategories = useMemo(() => {
    return Object.keys(markupLookup).sort();
  }, [markupLookup]);

  // Calculate sell rate preview
  const calcSellRate = useCallback((baseCost: string, markupCategory: string | null, fixedSell: string | null, pcSurcharge: string) => {
    if (fixedSell && parseFloat(fixedSell) > 0) return parseFloat(fixedSell);
    const cost = parseFloat(baseCost) || 0;
    const markup = markupCategory ? (markupLookup[markupCategory] || 1) : 1;
    const pc = parseFloat(pcSurcharge) || 0;
    return Math.floor((cost + pc) * markup);
  }, [markupLookup]);

  // Sub-tabs for the currently selected tab filter
  const subTabsForTab = useMemo(() => {
    if (tabFilter === "all") return [];
    return subTabRows.filter(st => st.description === tabFilter).map(st => {
      // Extract the subtab name from the key format "parent::subtab"
      const parts = st.key.split("::");
      return parts.length > 1 ? parts[1] : st.key;
    });
  }, [tabFilter, subTabRows]);

  // Filter and search
  const filtered = useMemo(() => {
    let result = [...productRows];
    if (tabFilter !== "all") {
      result = result.filter(p => p.tabName === tabFilter);
    }
    if (subTabFilter !== "all") {
      result = result.filter(p => p.subTab === subTabFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.tabName.toLowerCase().includes(q) ||
        (p.subTab || "").toLowerCase().includes(q) ||
        (p.markupCategory || "").toLowerCase().includes(q) ||
        (p.productCode || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [productRows, tabFilter, subTabFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Unique tabs: dynamic from master data + any tabs found in existing product data
  const tabsInData = useMemo(() => {
    const fromData = Array.from(new Set(productRows.map(p => p.tabName)));
    const fromMasterData = tabRows.map(t => t.key);
    const all = Array.from(new Set([...fromMasterData, ...fromData]));
    return all.sort();
  }, [productRows, tabRows]);

  // Dynamic UoMs list from master data + any UoMs found in existing product data
  const uomOptions = useMemo(() => {
    const fromData = Array.from(new Set(productRows.map(p => p.uom)));
    const fromMasterData = uomRows.map(u => u.key);
    return Array.from(new Set([...fromMasterData, ...fromData])).sort();
  }, [productRows, uomRows]);

  // Toggle selection
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(p => p.id)));
    }
  };

  const startEditing = (product: NonNullable<typeof allProducts>[number]) => {
    setEditing({
      id: product.id,
      productCode: product.productCode || null,
      tabName: product.tabName,
      name: product.name,
      subTab: product.subTab || null,
      uom: product.uom,
      baseCost: product.baseCost,
      materials: product.materials || "0",
      installLabour: product.installLabour || "0",
      consumables: product.consumables || "0",
      markupCategory: product.markupCategory,
      fixedSell: product.fixedSell,
      powderCoatSurcharge: product.powderCoatSurcharge || "0",
      colourGroup: (product as any).colourGroup || null,
      colourGroupBottom: (product as any).colourGroupBottom || null,
      coverageWidth: (product as any).coverageWidth ?? null,
      sortOrder: product.sortOrder ?? 0,
      active: product.active !== false,
    });
  };

  /** When a cost breakdown field changes, auto-update baseCost */
  const updateEditBreakdown = (field: "materials" | "installLabour" | "consumables", value: string) => {
    setEditing(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      updated.baseCost = sumCostBreakdown(updated.materials, updated.installLabour, updated.consumables);
      return updated;
    });
  };

  const updateAddBreakdown = (field: "materials" | "installLabour" | "consumables", value: string) => {
    setAdding(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      updated.baseCost = sumCostBreakdown(updated.materials || "0", updated.installLabour || "0", updated.consumables || "0");
      return updated;
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const product = productRows.find(p => p.id === editing.id);
    if (!product) return;
    upsertMutation.mutate({
      id: editing.id,
      productCode: editing.productCode || null,
      tabName: editing.tabName,
      subTab: editing.subTab,
      name: editing.name,
      uom: editing.uom,
      baseCost: editing.baseCost,
      materials: editing.materials,
      installLabour: editing.installLabour,
      consumables: editing.consumables,
      markupCategory: editing.markupCategory,
      fixedSell: editing.fixedSell,
      powderCoatSurcharge: editing.powderCoatSurcharge,
      colourGroup: editing.colourGroup || null,
      colourGroupBottom: editing.colourGroupBottom || null,
      coverageWidth: editing.coverageWidth,
      sortOrder: editing.sortOrder,
      active: editing.active,
    });
  };

  const saveNew = () => {
    if (!adding || !adding.tabName || !adding.name) {
      toast.error("Tab and name are required");
      return;
    }
    upsertMutation.mutate({
      productCode: adding.productCode || null,
      tabName: adding.tabName,
      subTab: adding.subTab || null,
      name: adding.name,
      uom: adding.uom || "m",
      baseCost: adding.baseCost || "0",
      materials: adding.materials || "0",
      installLabour: adding.installLabour || "0",
      consumables: adding.consumables || "0",
      markupCategory: adding.markupCategory || null,
      fixedSell: adding.fixedSell || null,
      powderCoatSurcharge: adding.powderCoatSurcharge || "0",
      colourGroup: (adding as any).colourGroup || null,
      colourGroupBottom: (adding as any).colourGroupBottom || null,
      coverageWidth: (adding as any).coverageWidth ?? null,
      sortOrder: adding.sortOrder ?? 0,
      active: adding.active ?? true,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={tabFilter} onValueChange={(v) => { setTabFilter(v); setSubTabFilter("all"); setPage(0); }}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All tabs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tabs</SelectItem>
              {tabsInData.map(tab => (
                <SelectItem key={tab} value={tab}>
                  {TAB_LABELS[tab as ComponentTabName] || tab}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subTabsForTab.length > 0 && (
            <Select value={subTabFilter} onValueChange={(v) => { setSubTabFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All sub-tabs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sub-tabs</SelectItem>
                {subTabsForTab.map(st => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="secondary" className="text-xs font-normal">
            {filtered.length} product{filtered.length !== 1 ? "s" : ""}
          </Badge>
          {isAdmin && selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkDeleteConfirm(true)}
              className="h-8 text-xs gap-1.5"
            >
              <Trash2 className="h-3 w-3" /> Delete {selected.size}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setAdding({ tabName: tabFilter !== "all" ? tabFilter : (tabsInData[0] || ""), name: "", uom: "m", baseCost: "0", materials: "0", installLabour: "0", consumables: "0", markupCategory: "product_standard", powderCoatSurcharge: "0", sortOrder: 0, active: true })}
            className="h-8 text-xs gap-1.5"
          >
            <Plus className="h-3 w-3" /> Add Product
          </Button>
          <Dialog open={showImport} onOpenChange={setShowImport}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Upload className="h-3 w-3" /> CSV Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Import Products from CSV</DialogTitle>
              </DialogHeader>
              <ProductImport />
            </DialogContent>
          </Dialog>
          <Dialog open={showCatalogueImport} onOpenChange={setShowCatalogueImport}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Package className="h-3 w-3" /> Import from Catalogue
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Import from Component Order Data</DialogTitle>
              </DialogHeader>
              <CatalogueImportDialog onImportComplete={() => {
                setShowCatalogueImport(false);
                utils.products.getAll.invalidate();
                utils.products.getByTab.invalidate();
              }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  {isAdmin && <th className="text-center py-2.5 px-2 w-8"><input type="checkbox" checked={selected.size === paginated.length && paginated.length > 0} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded border-gray-300" /></th>}
                  <th className="text-center py-2.5 px-1 font-medium text-muted-foreground w-10"></th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground w-20">Code</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground w-24">Tab</th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground w-28">Sub-Tab</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground min-w-[160px]">Product Name</th>
                  <th className="text-center py-2.5 px-2 font-medium text-muted-foreground w-14">UoM</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-20">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50">Materials</TooltipTrigger>
                        <TooltipContent><p>Material cost sub-component</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-20">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50">Install</TooltipTrigger>
                        <TooltipContent><p>Install Labour cost sub-component</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-20">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50">Consum.</TooltipTrigger>
                        <TooltipContent><p>Consumables cost sub-component</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground w-24">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50">Cost Amt</TooltipTrigger>
                        <TooltipContent><p>Base Cost = Materials + Install + Consumables</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground w-28">Markup</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-16">PC Surch.</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-16">Fixed Sell</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-20">
                    <span className="text-emerald-600">Sell Rate</span>
                  </th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground w-28">Colour Grp</th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground w-28">Bottom Grp</th>
                  <th className="text-right py-2.5 px-2 font-medium text-muted-foreground w-16">Cov. (mm)</th>
                  <th className="text-center py-2.5 px-1 font-medium text-muted-foreground w-12">Ord</th>
                  <th className="text-center py-2.5 px-1 font-medium text-muted-foreground w-14">Active</th>
                  <th className="text-left py-2.5 px-2 font-medium text-muted-foreground w-24">Updated</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {/* Add new row */}
                {adding && (
                  <tr className="border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                    {isAdmin && <td></td>}
                    <td className="py-1.5 px-2">
                      <Input value={adding.productCode || ""} onChange={(e) => setAdding(prev => prev ? { ...prev, productCode: e.target.value } : prev)} placeholder="Code" className="h-7 text-xs w-16" />
                    </td>
                    <td className="py-1.5 px-3">
                      <Select value={adding.tabName || tabsInData[0] || ""} onValueChange={(v) => setAdding(prev => prev ? { ...prev, tabName: v, subTab: null } : prev)}>
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tabsInData.map(tab => (
                            <SelectItem key={tab} value={tab}>{TAB_LABELS[tab as ComponentTabName] || tab}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={adding.subTab || "_none"} onValueChange={(v) => setAdding(prev => prev ? { ...prev, subTab: v === "_none" ? null : v } : prev)}>
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {subTabRows.filter(st => st.description === adding.tabName).map(st => {
                            const name = st.key.includes("::") ? st.key.split("::")[1] : st.key;
                            return <SelectItem key={st.key} value={name}>{name}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-3">
                      <Input value={adding.name || ""} onChange={(e) => setAdding(prev => prev ? { ...prev, name: e.target.value } : prev)} placeholder="Product name" className="h-7 text-xs" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={adding.uom || "m"} onValueChange={(v) => setAdding(prev => prev ? { ...prev, uom: v } : prev)}>
                        <SelectTrigger className="h-7 text-xs w-16">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {uomOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" step="0.01" value={adding.materials || "0"} onChange={(e) => updateAddBreakdown("materials", e.target.value)} className="h-7 text-xs text-right w-16 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" step="0.01" value={adding.installLabour || "0"} onChange={(e) => updateAddBreakdown("installLabour", e.target.value)} className="h-7 text-xs text-right w-16 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" step="0.01" value={adding.consumables || "0"} onChange={(e) => updateAddBreakdown("consumables", e.target.value)} className="h-7 text-xs text-right w-16 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <span className="font-mono font-medium text-blue-600">${parseFloat(adding.baseCost || "0").toFixed(2)}</span>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={adding.markupCategory || "product_standard"} onValueChange={(v) => setAdding(prev => prev ? { ...prev, markupCategory: v } : prev)}>
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {markupCategories.map(mc => (
                            <SelectItem key={mc} value={mc}>{mc.replace("product_", "")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" step="0.01" value={adding.powderCoatSurcharge || "0"} onChange={(e) => setAdding(prev => prev ? { ...prev, powderCoatSurcharge: e.target.value } : prev)} className="h-7 text-xs text-right w-14" />
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" step="0.01" value={adding.fixedSell || ""} onChange={(e) => setAdding(prev => prev ? { ...prev, fixedSell: e.target.value || null } : prev)} placeholder="—" className="h-7 text-xs text-right w-14" />
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className="font-mono text-emerald-600 font-medium">
                        ${calcSellRate(adding.baseCost || "0", adding.markupCategory || null, adding.fixedSell || null, adding.powderCoatSurcharge || "0")}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={(adding as any).colourGroup || "_none"} onValueChange={(v) => setAdding(prev => prev ? { ...prev, colourGroup: v === "_none" ? null : v } : prev)}>
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {colourGroupRows.map(g => (
                            <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Select value={(adding as any).colourGroupBottom || "_none"} onValueChange={(v) => setAdding(prev => prev ? { ...prev, colourGroupBottom: v === "_none" ? null : v } : prev)}>
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {colourGroupRows.map(g => (
                            <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 px-2">
                      <Input type="number" value={(adding as any).coverageWidth ?? ""} onChange={(e) => setAdding(prev => prev ? { ...prev, coverageWidth: e.target.value ? parseInt(e.target.value) : null } : prev)} placeholder="mm" className="h-7 text-xs text-right w-14" />
                    </td>
                    <td className="py-1.5 px-1">
                      <Input type="number" value={adding.sortOrder ?? 0} onChange={(e) => setAdding(prev => prev ? { ...prev, sortOrder: parseInt(e.target.value) || 0 } : prev)} className="h-7 text-xs text-center w-10" />
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <input type="checkbox" checked={adding.active !== false} onChange={(e) => setAdding(prev => prev ? { ...prev, active: e.target.checked } : prev)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={saveNew} disabled={upsertMutation.isPending} className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setAdding(null)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}

                 {paginated.map((product: NonNullable<typeof allProducts>[number]) => {
                  const isEditing = editing?.id === product.id;
                  const mat = product.materials || "0";
                  const lab = product.installLabour || "0";
                  const con = product.consumables || "0";
                  // Cost Amount is always computed as sum of breakdown fields
                  const computedCostAmt = isEditing ? editing.baseCost : sumCostBreakdown(mat, lab, con);
                  const sellRate = calcSellRate(
                    computedCostAmt,
                    isEditing ? editing.markupCategory : product.markupCategory,
                    isEditing ? editing.fixedSell : product.fixedSell,
                    isEditing ? editing.powderCoatSurcharge : (product.powderCoatSurcharge || "0")
                  );

                  return (
                    <tr key={product.id} className={`border-b border-border/30 transition-colors ${isEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : "hover:bg-muted/20"} ${selected.has(product.id) ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}`}>
                      {isAdmin && <td className="py-1.5 px-2 text-center"><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} className="h-3.5 w-3.5 rounded border-gray-300" /></td>}
                      <td className="py-1.5 px-1 text-center">
                        <ProductImageThumb code={product.productCode} name={product.name} />
                      </td>
                      <td className="py-1.5 px-2">
                        {isEditing ? (
                          <Input value={editing.productCode || ""} onChange={(e) => setEditing(prev => prev ? { ...prev, productCode: e.target.value || null } : prev)} placeholder="Code" className="h-7 text-xs w-16" />
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground">{product.productCode || "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        {isEditing ? (
                          <Select
                            value={editing.tabName}
                            onValueChange={(v) => setEditing(prev => prev ? { ...prev, tabName: v, subTab: null } : prev)}
                          >
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {tabsInData.map(tab => (
                                <SelectItem key={tab} value={tab}>{TAB_LABELS[tab as ComponentTabName] || tab}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {TAB_LABELS[product.tabName as ComponentTabName] || product.tabName}
                          </Badge>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        {isEditing ? (
                          <Select value={editing.subTab || "_none"} onValueChange={(v) => setEditing(prev => prev ? { ...prev, subTab: v === "_none" ? null : v } : prev)}>
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">—</SelectItem>
                              {subTabRows.filter(st => st.description === editing.tabName).map(st => {
                                const name = st.key.includes("::") ? st.key.split("::")[1] : st.key;
                                return <SelectItem key={st.key} value={name}>{name}</SelectItem>;
                              })}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">{product.subTab || "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3">
                        {isEditing ? (
                          <Input value={editing.name} onChange={(e) => setEditing(prev => prev ? { ...prev, name: e.target.value } : prev)} className="h-7 text-xs" />
                        ) : (
                          <span className="font-medium">{product.name}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {isEditing ? (
                          <Select value={editing.uom} onValueChange={(v) => setEditing(prev => prev ? { ...prev, uom: v } : prev)}>
                            <SelectTrigger className="h-7 text-xs w-16">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {uomOptions.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground">{product.uom}</span>
                        )}
                      </td>

                      {/* Materials */}
                      <td className="py-1.5 px-2 text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" value={editing.materials} onChange={(e) => updateEditBreakdown("materials", e.target.value)} className="h-7 text-xs text-right w-16 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" />
                        ) : (
                          <span className="font-mono text-muted-foreground">{parseFloat(mat) > 0 ? `$${parseFloat(mat).toFixed(2)}` : "—"}</span>
                        )}
                      </td>

                      {/* Install Labour */}
                      <td className="py-1.5 px-2 text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" value={editing.installLabour} onChange={(e) => updateEditBreakdown("installLabour", e.target.value)} className="h-7 text-xs text-right w-16 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" />
                        ) : (
                          <span className="font-mono text-muted-foreground">{parseFloat(lab) > 0 ? `$${parseFloat(lab).toFixed(2)}` : "—"}</span>
                        )}
                      </td>

                      {/* Consumables */}
                      <td className="py-1.5 px-2 text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" value={editing.consumables} onChange={(e) => updateEditBreakdown("consumables", e.target.value)} className="h-7 text-xs text-right w-16 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" />
                        ) : (
                          <span className="font-mono text-muted-foreground">{parseFloat(con) > 0 ? `$${parseFloat(con).toFixed(2)}` : "—"}</span>
                        )}
                      </td>

                      {/* Cost Amount (computed sum of Materials + Install + Consumables) */}
                      <td className="py-1.5 px-3 text-right">
                        <span className={`font-mono font-medium ${isEditing ? "text-blue-600" : ""}`}>
                          ${parseFloat(computedCostAmt).toFixed(2)}
                        </span>
                      </td>

                      <td className="py-1.5 px-2">
                        {isEditing ? (
                          <Select value={editing.markupCategory || "product_standard"} onValueChange={(v) => setEditing(prev => prev ? { ...prev, markupCategory: v } : prev)}>
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {markupCategories.map(mc => (
                                <SelectItem key={mc} value={mc}>{mc.replace("product_", "")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">{(product.markupCategory || "—").replace("product_", "")}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" value={editing.powderCoatSurcharge} onChange={(e) => setEditing(prev => prev ? { ...prev, powderCoatSurcharge: e.target.value } : prev)} className="h-7 text-xs text-right w-14" />
                        ) : (
                          <span className="font-mono text-muted-foreground">{parseFloat(product.powderCoatSurcharge || "0") > 0 ? `$${parseFloat(product.powderCoatSurcharge || "0").toFixed(2)}` : "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {isEditing ? (
                          <Input type="number" step="0.01" value={editing.fixedSell || ""} onChange={(e) => setEditing(prev => prev ? { ...prev, fixedSell: e.target.value || null } : prev)} placeholder="—" className="h-7 text-xs text-right w-14" />
                        ) : (
                          <span className="font-mono text-muted-foreground">{product.fixedSell && parseFloat(product.fixedSell) > 0 ? `$${parseFloat(product.fixedSell).toFixed(2)}` : "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <span className="font-mono text-emerald-600 font-medium">${sellRate}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        {isEditing ? (
                          <Select value={editing.colourGroup || "_none"} onValueChange={(v) => setEditing(prev => prev ? { ...prev, colourGroup: v === "_none" ? null : v } : prev)}>
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">—</SelectItem>
                              {colourGroupRows.map(g => (
                                <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">{(product as any).colourGroup || "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        {isEditing ? (
                          <Select value={editing.colourGroupBottom || "_none"} onValueChange={(v) => setEditing(prev => prev ? { ...prev, colourGroupBottom: v === "_none" ? null : v } : prev)}>
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">—</SelectItem>
                              {colourGroupRows.map(g => (
                                <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">{(product as any).colourGroupBottom || "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {isEditing ? (
                          <Input type="number" value={editing.coverageWidth ?? ""} onChange={(e) => setEditing(prev => prev ? { ...prev, coverageWidth: e.target.value ? parseInt(e.target.value) : null } : prev)} placeholder="mm" className="h-7 text-xs text-right w-14" />
                        ) : (
                          <span className="text-muted-foreground text-[10px]">{(product as any).coverageWidth || "—"}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        {isEditing ? (
                          <Input type="number" value={editing.sortOrder} onChange={(e) => setEditing(prev => prev ? { ...prev, sortOrder: parseInt(e.target.value) || 0 } : prev)} className="h-7 text-xs text-center w-10" />
                        ) : (
                          <span className="text-muted-foreground">{product.sortOrder}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        {isEditing ? (
                          <input type="checkbox" checked={editing.active} onChange={(e) => setEditing(prev => prev ? { ...prev, active: e.target.checked } : prev)} className="h-3.5 w-3.5 rounded border-gray-300" />
                        ) : (
                          product.active !== false ? (
                            <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500">Inactive</Badge>
                          )
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={saveEdit} disabled={upsertMutation.isPending} className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700">
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => startEditing(product)} className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: product.id, name: product.name })} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 18 : 17} className="py-12 text-center">
                      <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No products found</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your search or filter</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="h-7 w-7 p-0">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 7 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(pageNum)}
                      className="h-7 w-7 p-0 text-xs"
                    >
                      {pageNum + 1}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="h-7 w-7 p-0">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Products</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selected.size} selected product{selected.size !== 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selected) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
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
