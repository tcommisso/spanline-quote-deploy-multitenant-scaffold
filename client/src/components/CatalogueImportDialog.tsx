import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Package, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CatalogueImportDialogProps {
  onImportComplete: () => void;
}

export default function CatalogueImportDialog({ onImportComplete }: CatalogueImportDialogProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  // Target mapping fields
  const [targetTab, setTargetTab] = useState<string>("");
  const [targetSubTab, setTargetSubTab] = useState<string>("");
  const [markupCategory, setMarkupCategory] = useState<string>("product_standard");
  const [markupPercent, setMarkupPercent] = useState<string>("0");

  const { data: tabsAndUoms } = trpc.products.getTabsAndUoms.useQuery();
  const { data: catalogueCategories } = trpc.products.catalogueCategories.useQuery();
  const { data: catalogueResults, isLoading: isSearching } = trpc.products.searchCatalogue.useQuery(
    {
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      search: search.trim(),
      limit: mode === "bulk" ? 200 : 50,
    },
    { placeholderData: (prev) => prev }
  );

  const importMutation = trpc.products.importFromCatalogue.useMutation({
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported} items${result.skipped > 0 ? `, ${result.skipped} skipped (already exist)` : ""}`);
      setSelectedItems(new Set());
      onImportComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const items = catalogueResults?.items ?? [];
  const total = catalogueResults?.total ?? 0;

  const tabs = tabsAndUoms?.tabs ?? [];
  const subTabs = tabsAndUoms?.subTabs ?? [];
  const markupCategories = useMemo(() => {
    const allMd = tabsAndUoms?.tabs ? [] : [];
    // We'll derive from the tabs data - markup categories are separate
    return ["product_standard", "product_premium", "product_budget"];
  }, []);

  const filteredSubTabs = useMemo(() => {
    if (!targetTab) return [];
    return subTabs.filter((st: any) => {
      try {
        const meta = st.metadata ? JSON.parse(JSON.stringify(st.metadata)) : {};
        return meta.parentTab === targetTab || !meta.parentTab;
      } catch { return true; }
    });
  }, [targetTab, subTabs]);

  const toggleItem = (id: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItems(new Set(items.map(i => i.id)));
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const handleImport = () => {
    if (!targetTab) {
      toast.error("Please select a target tab for the imported products");
      return;
    }
    if (selectedItems.size === 0) {
      toast.error("Please select at least one item to import");
      return;
    }

    const selectedCatalogueItems = items.filter(i => selectedItems.has(i.id));
    importMutation.mutate({
      items: selectedCatalogueItems.map(item => ({
        catalogueId: item.id,
        spaCode: item.spaCode,
        description: item.description,
        colour: item.colour,
        uom: item.uom || "ea",
        price: item.price,
        category: item.category,
      })),
      tabName: targetTab,
      subTab: targetSubTab || null,
      markupCategory: markupCategory || null,
      markupPercent: parseFloat(markupPercent) || 0,
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single">Single Item Import</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Category Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Search the Component Order Data and select individual items to import into Sales Data products.
          </p>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Select a category to import all items at once. Existing products (matched by SPA code) will be skipped.
          </p>
        </TabsContent>
      </Tabs>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SPA code, description, or colour..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(catalogueCategories ?? []).map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results table */}
      <div className="border rounded-md max-h-[300px] overflow-y-auto">
        {isSearching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Searching catalogue...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Package className="h-8 w-8 mb-2" />
            <span className="text-sm">No items found</span>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr className="border-b">
                <th className="text-center py-2 px-2 w-8">
                  <Checkbox
                    checked={selectedItems.size === items.length && items.length > 0}
                    onCheckedChange={(checked) => checked ? selectAll() : deselectAll()}
                  />
                </th>
                <th className="text-left py-2 px-2 font-medium">SPA Code</th>
                <th className="text-left py-2 px-2 font-medium">Description</th>
                <th className="text-left py-2 px-2 font-medium">Colour</th>
                <th className="text-left py-2 px-2 font-medium">UoM</th>
                <th className="text-right py-2 px-2 font-medium">Price</th>
                <th className="text-left py-2 px-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b hover:bg-muted/30 cursor-pointer ${selectedItems.has(item.id) ? "bg-primary/5" : ""}`}
                  onClick={() => toggleItem(item.id)}
                >
                  <td className="text-center py-1.5 px-2">
                    <Checkbox checked={selectedItems.has(item.id)} onCheckedChange={() => toggleItem(item.id)} />
                  </td>
                  <td className="py-1.5 px-2 font-mono">{item.spaCode}</td>
                  <td className="py-1.5 px-2 max-w-[200px] truncate">{item.description}</td>
                  <td className="py-1.5 px-2">{item.colour || "-"}</td>
                  <td className="py-1.5 px-2">{item.uom || "ea"}</td>
                  <td className="py-1.5 px-2 text-right">${item.price.toFixed(2)}</td>
                  <td className="py-1.5 px-2">
                    <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Selection summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total} items in catalogue{categoryFilter !== "all" ? ` (${categoryFilter})` : ""}
        </span>
        <Badge variant={selectedItems.size > 0 ? "default" : "secondary"}>
          {selectedItems.size} selected
        </Badge>
      </div>

      {/* Target mapping */}
      {selectedItems.size > 0 && (
        <div className="border rounded-md p-4 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="h-4 w-4" />
            Import Settings
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Target Tab *</Label>
              <Select value={targetTab} onValueChange={setTargetTab}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select tab..." />
                </SelectTrigger>
                <SelectContent>
                  {tabs.map((tab: any) => (
                    <SelectItem key={tab.key} value={tab.key}>{tab.value || tab.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Sub-Tab (optional)</Label>
              <Select value={targetSubTab} onValueChange={setTargetSubTab}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {filteredSubTabs.map((st: any) => (
                    <SelectItem key={st.key} value={st.key}>{st.value || st.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Markup Category</Label>
              <Select value={markupCategory} onValueChange={setMarkupCategory}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Standard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_standard">Standard</SelectItem>
                  <SelectItem value="product_premium">Premium</SelectItem>
                  <SelectItem value="product_budget">Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Markup % (applied to price as fixedSell)</Label>
              <Input
                type="number"
                min="0"
                max="500"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
                className="h-8 text-xs"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            Items with existing SPA codes in Sales Data will be skipped (no duplicates).
          </div>
        </div>
      )}

      {/* Import button */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={handleImport}
          disabled={selectedItems.size === 0 || !targetTab || importMutation.isPending}
          className="gap-2"
        >
          {importMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Import {selectedItems.size} Item{selectedItems.size !== 1 ? "s" : ""} to Sales Data
        </Button>
      </div>
    </div>
  );
}
