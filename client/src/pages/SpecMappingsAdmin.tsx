import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Zap, Info, Download, Copy, Play, AlertTriangle, History, ShieldCheck, CircleAlert, CircleCheck, TriangleAlert, ChevronsUpDown, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SPEC_FIELDS, type SpecFieldDefinition, type SpecFieldType } from "@shared/spec-field-catalogue";

// Tab options are now loaded dynamically from the Tab Names master data (product_tab category)

type FieldType = SpecFieldType;
type SpecField = SpecFieldDefinition;

const FIELD_TYPE_LABELS: Record<FieldType, { short: string; color: string }> = {
  num: { short: "#", color: "text-blue-600 bg-blue-50" },
  text: { short: "T", color: "text-amber-700 bg-amber-50" },
  json: { short: "{}", color: "text-purple-600 bg-purple-50" },
  computed: { short: "⚡", color: "text-emerald-600 bg-emerald-50" },
};

const CONDITION_EXAMPLES = [
  { value: "> 0", label: "> 0 (numeric, greater than zero)" },
  { value: "!= ''", label: "!= '' (not empty)" },
  { value: "any", label: "any (always match)" },
  { value: "= skillion", label: "= value (exact match)" },
  { value: "contains gable", label: "contains value (partial match)" },
];

interface MappingForm {
  name: string;
  tabName: string;
  specField: string;
  condition: string;
  productId: number | null;
  productMatch: string | null;
  qtyFormula: string;
  description: string;
  colourField: string;
  bottomColourField: string;
  uom: string;
  sortOrder: number;
  active: boolean;
}

const emptyForm: MappingForm = {
  name: "",
  tabName: "roof",
  specField: "",
  condition: "!= ''",
  productId: null,
  productMatch: null,
  qtyFormula: "",
  description: "",
  colourField: "",
  bottomColourField: "",
  uom: "ea",
  sortOrder: 0,
  active: true,
};

export default function SpecMappingsAdmin() {
  const utils = trpc.useUtils();
  const { data: mappings, isLoading } = trpc.specItems.mappings.list.useQuery();
  const { data: allProducts } = trpc.products.getAll.useQuery();
  const { data: tabsAndUoms } = trpc.products.getTabsAndUoms.useQuery();

  // Dynamically populate tab options from the Tab Names master data
  const TAB_OPTIONS = useMemo(() => {
    if (!tabsAndUoms?.tabs?.length) return [];
    return tabsAndUoms.tabs.map((t: any) => t.value.toLowerCase());
  }, [tabsAndUoms]);
  const createMutation = trpc.specItems.mappings.create.useMutation({
    onSuccess: () => { toast.success("Mapping created"); utils.specItems.mappings.list.invalidate(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.specItems.mappings.update.useMutation({
    onSuccess: () => { toast.success("Mapping updated"); utils.specItems.mappings.list.invalidate(); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = trpc.specItems.mappings.delete.useMutation({
    onSuccess: () => { toast.success("Mapping deleted"); utils.specItems.mappings.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<MappingForm>(emptyForm);
  const [filterTab, setFilterTab] = useState<string>("all");
  const [filterSubTab, setFilterSubTab] = useState<string>("all");
  const [deleteMappingTarget, setDeleteMappingTarget] = useState<number | null>(null);
  const [selectedMappings, setSelectedMappings] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  // Seed templates mutation
  const seedTemplatesMutation = (trpc.specItems as any).seedTemplates.useMutation({
    onSuccess: (data: any) => { toast.success(`Created ${data.created} starter templates, refreshed ${data.updated || 0} (${data.skipped} unchanged)`); utils.specItems.mappings.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Validate All state
  const [validateOpen, setValidateOpen] = useState(false);
  const { data: validateResult, isLoading: validateLoading, refetch: refetchValidation } = (trpc.specItems as any).validateAll.useQuery(
    undefined,
    { enabled: validateOpen }
  );

  // History state
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: historyData, isLoading: historyLoading } = (trpc.specItems as any).history.useQuery(
    { limit: 50 },
    { enabled: historyOpen }
  );

  // Dry-run state
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [dryRunQuoteId, setDryRunQuoteId] = useState<string>("");
  const { data: quotesList } = trpc.quotes.list.useQuery(undefined, { enabled: dryRunOpen });
  const { data: dryRunResult, isLoading: dryRunLoading, error: dryRunError } = (trpc.specItems as any).dryRun.useQuery(
    { quoteId: Number(dryRunQuoteId) },
    { enabled: dryRunOpen && !!dryRunQuoteId && !isNaN(Number(dryRunQuoteId)) }
  );
  const bulkDeleteMutation = trpc.specItems.mappings.bulkDelete.useMutation({
    onSuccess: (data) => { toast.success(`${data.deleted} mappings deleted`); setSelectedMappings(new Set()); setBulkDeleteOpen(false); utils.specItems.mappings.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleSelectMapping = (id: number) => {
    setSelectedMappings(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllMappings = () => {
    if (selectedMappings.size === filtered.length) setSelectedMappings(new Set());
    else setSelectedMappings(new Set(filtered.map((m: any) => m.id)));
  };

  // Sub-tabs for the currently selected tab
  const subTabsForTab = useMemo(() => {
    if (filterTab === "all" || !tabsAndUoms?.subTabs) return [];
    return (tabsAndUoms.subTabs as any[]).filter((st: any) => st.description === filterTab.toLowerCase()).map((st: any) => st.value);
  }, [filterTab, tabsAndUoms]);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (m: any) => {
    setEditId(m.id);
    setForm({
      name: m.name,
      tabName: m.tabName,
      specField: m.specField,
      condition: m.condition,
      productId: m.productId,
      productMatch: m.productMatch || "",
      qtyFormula: m.qtyFormula,
      description: m.description || "",
      colourField: m.colourField || "",
      bottomColourField: (m as any).bottomColourField || "",
      uom: m.uom || "ea",
      sortOrder: m.sortOrder || 0,
      active: m.active !== false,
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.specField || !form.qtyFormula) {
      toast.error("Name, spec field, and quantity formula are required");
      return;
    }
    const payload = {
      ...form,
      productId: form.productId || null,
      productMatch: form.productMatch || null,
      description: form.description || null,
      colourField: form.colourField || null,
      bottomColourField: form.bottomColourField || null,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDownloadCsv = () => {
    if (!mappings || mappings.length === 0) {
      toast.error("No mappings to download");
      return;
    }
    const headers = ["id", "name", "tabName", "specField", "condition", "qtyFormula", "productId", "productMatch", "colourField", "bottomColourField", "uom", "sortOrder", "active", "description"];
    const csvRows = [headers.join(",")];
    for (const m of mappings as any[]) {
      csvRows.push([
        m.id,
        `"${(m.name || "").replace(/"/g, '""')}"`,
        m.tabName,
        m.specField,
        `"${(m.condition || "").replace(/"/g, '""')}"`,
        `"${(m.qtyFormula || "").replace(/"/g, '""')}"`,
        m.productId || "",
        `"${(m.productMatch || "").replace(/"/g, '""')}"`,
        m.colourField || "",
        m.bottomColourField || "",
        m.uom || "ea",
        m.sortOrder || 0,
        m.active !== false,
        `"${(m.description || "").replace(/"/g, '""')}"`,
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spec-mappings.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const filtered = useMemo(() => {
    let result = mappings || [];
    if (filterTab !== "all") result = result.filter(m => m.tabName === filterTab);
    // Note: spec_mappings don't have a subTab field currently, but we can filter by product's subTab
    return result;
  }, [mappings, filterTab, filterSubTab]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Spec-to-Item Mappings</h2>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              <p className="text-xs">Define rules that automatically generate quote line items from spec sheet fields. Each mapping evaluates a condition on a spec field and creates an item with a calculated quantity.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          {selectedMappings.size > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selectedMappings.size}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => seedTemplatesMutation.mutate()} disabled={seedTemplatesMutation.isPending} className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> {seedTemplatesMutation.isPending ? "Seeding..." : "Seed Templates"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setValidateOpen(true); refetchValidation(); }} className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Validate All
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDryRunOpen(true)} className="gap-1.5">
            <Play className="h-3.5 w-3.5" /> Dry Run
          </Button>
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)} className="gap-1.5">
            <History className="h-3.5 w-3.5" /> History
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadCsv} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Download CSV
          </Button>
          <Button variant="brand" size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Mapping
          </Button>
        </div>
      </div>

      {/* Filter by tab */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant={filterTab === "all" ? "default" : "outline"} className="cursor-pointer" onClick={() => { setFilterTab("all"); setFilterSubTab("all"); }}>All</Badge>
        {TAB_OPTIONS.map(tab => (
          <Badge key={tab} variant={filterTab === tab ? "default" : "outline"} className="cursor-pointer capitalize" onClick={() => { setFilterTab(tab); setFilterSubTab("all"); }}>{tab}</Badge>
        ))}
      </div>

      {/* Sub-tab filter (second level) */}
      {subTabsForTab.length > 0 && (
        <div className="flex gap-2 flex-wrap pl-4 border-l-2 border-muted">
          <Badge variant={filterSubTab === "all" ? "secondary" : "outline"} className="cursor-pointer text-xs" onClick={() => setFilterSubTab("all")}>All Sub-tabs</Badge>
          {subTabsForTab.map(st => (
            <Badge key={st} variant={filterSubTab === st ? "secondary" : "outline"} className="cursor-pointer text-xs" onClick={() => setFilterSubTab(st)}>{st}</Badge>
          ))}
        </div>
      )}

      {/* Mappings list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No mappings configured yet. Create your first mapping to auto-generate quote items from spec sheets.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <input type="checkbox" checked={selectedMappings.size === filtered.length && filtered.length > 0} onChange={toggleSelectAllMappings} className="h-3.5 w-3.5 rounded border-gray-300" />
            <span className="text-xs text-muted-foreground">Select all ({filtered.length})</span>
          </div>
          {filtered.map((m: any) => (
            <Card key={m.id} className={`${!m.active ? "opacity-50" : ""} ${selectedMappings.has(m.id) ? "ring-1 ring-blue-400" : ""}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input type="checkbox" checked={selectedMappings.has(m.id)} onChange={() => toggleSelectMapping(m.id)} className="h-3.5 w-3.5 rounded border-gray-300 shrink-0" />
                    <Badge variant="outline" className="capitalize text-xs shrink-0">{m.tabName}</Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        When <code className="bg-muted px-1 rounded">{SPEC_FIELDS.find(f => f.value === m.specField)?.label || m.specField}</code> {m.condition} → qty = <code className="bg-muted px-1 rounded">{m.qtyFormula}</code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Product link verification badge */}
                    {(() => {
                      if (m.productId) {
                        const product = (allProducts as any[])?.find((p: any) => p.id === m.productId);
                        return product
                          ? <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50" title={`Linked: ${product.name} (ID ${product.id})`}>✓ {product.name?.substring(0, 15)}</Badge>
                          : <Badge variant="outline" className="text-xs text-red-700 border-red-300 bg-red-50" title={`Product ID ${m.productId} not found or inactive`}>✗ Missing Product</Badge>;
                      } else if (m.productMatch) {
                        const tabProducts = (allProducts as any[])?.filter((p: any) => p.tabName === m.tabName) || [];
                        const matchFieldLabel = m.productMatch?.replace('spec', '') || '';
                        if (tabProducts.length === 0) {
                          return <Badge variant="outline" className="text-xs text-red-700 border-red-300 bg-red-50" title={`No active products in tab '${m.tabName}'`}>✗ No products in tab</Badge>;
                        }
                        const productNames = tabProducts.map((p: any) => p.name?.toLowerCase());
                        const tooltip = `Dynamic match via ${m.productMatch}. ${tabProducts.length} candidate(s): ${tabProducts.slice(0, 5).map((p: any) => p.name).join(', ')}${tabProducts.length > 5 ? '...' : ''}`;
                        return <Badge variant="outline" className="text-xs text-blue-700 border-blue-300 bg-blue-50" title={tooltip}>⚡ {matchFieldLabel.substring(0, 12)} ({tabProducts.length})</Badge>;
                      }
                      return <Badge variant="outline" className="text-xs text-gray-500 border-gray-200">No product</Badge>;
                    })()}
                    {!m.active && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate" onClick={() => {
                      setEditId(null);
                      setForm({
                        name: m.name + " (copy)",
                        tabName: m.tabName,
                        specField: m.specField,
                        condition: m.condition,
                        productId: m.productId,
                        productMatch: m.productMatch || "",
                        qtyFormula: m.qtyFormula,
                        description: m.description || "",
                        colourField: m.colourField || "",
                        bottomColourField: (m as any).bottomColourField || "",
                        uom: m.uom || "ea",
                        sortOrder: m.sortOrder || 0,
                        active: m.active !== false,
                      });
                      setOpen(true);
                    }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteMappingTarget(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Mapping" : "New Spec Mapping"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Rule Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Posts from spec" className="h-9" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Target Tab *</Label>
                <Select value={form.tabName} onValueChange={v => setForm(p => ({ ...p, tabName: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAB_OPTIONS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">UoM</Label>
                <Select value={form.uom} onValueChange={v => setForm(p => ({ ...p, uom: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["ea", "m", "m²", "lm", "set", "lot"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Spec Field (Trigger) *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                    {form.specField ? (() => {
                      const sf = SPEC_FIELDS.find(f => f.value === form.specField);
                      if (!sf) return form.specField;
                      const ft = FIELD_TYPE_LABELS[sf.type];
                      return <span className="inline-flex items-center gap-1.5 truncate"><span className={`inline-flex items-center justify-center w-5 h-4 rounded text-[10px] font-bold ${ft.color}`}>{ft.short}</span>{sf.label}</span>;
                    })() : <span className="text-muted-foreground">Select spec field...</span>}
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command filter={(value, search) => {
                    const field = SPEC_FIELDS.find(f => f.value === value);
                    if (!field) return 0;
                    const haystack = `${field.value} ${field.label}`.toLowerCase();
                    return haystack.includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Search spec fields..." />
                    <CommandList>
                      <CommandEmpty>No field found.</CommandEmpty>
                      {(() => {
                        const sections: Record<string, SpecField[]> = {};
                        SPEC_FIELDS.forEach(f => { (sections[f.section] ??= []).push(f); });
                        return Object.entries(sections).map(([section, fields]) => (
                          <CommandGroup key={section} heading={section}>
                            {fields.map(f => {
                              const ft = FIELD_TYPE_LABELS[f.type];
                              return (
                                <CommandItem key={f.value} value={f.value} onSelect={(v) => setForm(p => ({ ...p, specField: v }))}>
                                  <Check className={`mr-1 h-3 w-3 ${form.specField === f.value ? "opacity-100" : "opacity-0"}`} />
                                  <span className={`inline-flex items-center justify-center w-5 h-4 rounded text-[10px] font-bold ${ft.color}`}>{ft.short}</span>
                                  <span className="truncate">{f.label}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ));
                      })()}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Condition *</Label>
              <Input value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value }))} placeholder="e.g. > 0, != '', = skillion, any" className="h-9" />
              <p className="text-xs text-muted-foreground">Examples: {CONDITION_EXAMPLES.map(c => c.value).join(", ")}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Quantity Formula *</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-sm text-xs space-y-1 p-3">
                    <p className="font-semibold mb-1">Available Computed Variables:</p>
                    <p><code>roofRunWidth</code> — Dimension perpendicular to fall (m)</p>
                    <p><code>roofSheetLength</code> — Dimension parallel to fall (m)</p>
                    <p><code>roofSheetLM</code> — Total roof LM (auto-calc with product cover)</p>
                    <p><code>productCover</code> — Product coverage width (mm)</p>
                    <p><code>area</code> — specWidth × specLength (m²)</p>
                    <p><code>perimeter</code> — 2 × (specWidth + specLength) (m)</p>
                    <p><code>roofArea</code> — area adjusted for fall (m²)</p>
                    <p><code>wasteFactor</code> — Waste % from master data</p>
                    <p className="font-semibold mt-2 mb-1">Operators:</p>
                    <p>+, -, *, /, Math.ceil(), Math.floor(), Math.round()</p>
                    <p className="font-semibold mt-2 mb-1">Examples:</p>
                    <p><code>roofSheetLM</code></p>
                    <p><code>Math.ceil(roofRunWidth / (productCover / 1000)) * roofSheetLength</code></p>
                    <p><code>roofSheetLM * (1 + wasteFactor / 100)</code></p>
                    <p><code>specWidth * specLength</code></p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input value={form.qtyFormula} onChange={e => setForm(p => ({ ...p, qtyFormula: e.target.value }))} placeholder="e.g. roofSheetLM, specPostsNumber, specWidth * specLength" className="h-9" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Reference spec fields by name. Hover <Info className="h-3 w-3 inline" /> for all variables.</p>
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setPreviewOpen(true)} disabled={!form.qtyFormula}>
                  Preview
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Product (for rate lookup)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                    {form.productId ? (() => {
                      const prod = (allProducts as any[])?.find((p: any) => p.id === form.productId);
                      return prod ? <span className="truncate">{prod.name} ({prod.tabName})</span> : `Product #${form.productId}`;
                    })() : <span className="text-muted-foreground">— No product (manual rates) —</span>}
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command filter={(value, search) => {
                    if (value === "none") return search ? 0 : 1;
                    const prod = (allProducts as any[])?.find((p: any) => String(p.id) === value);
                    if (!prod) return 0;
                    const haystack = `${prod.name} ${prod.tabName} ${prod.productCode || ""}`.toLowerCase();
                    return haystack.includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Search products..." />
                    <CommandList>
                      <CommandEmpty>No product found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="none" onSelect={() => setForm(p => ({ ...p, productId: null }))}>
                          <Check className={`mr-1 h-3 w-3 ${!form.productId ? "opacity-100" : "opacity-0"}`} />
                          — No product (manual rates) —
                        </CommandItem>
                        {(allProducts as any[])?.map((p: any) => (
                          <CommandItem key={p.id} value={String(p.id)} onSelect={(v) => setForm(prev => ({ ...prev, productId: Number(v) }))}>
                            <Check className={`mr-1 h-3 w-3 ${form.productId === p.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="truncate">{p.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{p.tabName}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Product Match Field (alternative to fixed product)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                    {form.productMatch ? (() => {
                      const sf = SPEC_FIELDS.find(f => f.value === form.productMatch);
                      return sf ? <span className="truncate">{sf.label}</span> : <span className="truncate">{form.productMatch}</span>;
                    })() : <span className="text-muted-foreground">— None —</span>}
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command filter={(value, search) => {
                    if (value === "__none__") return search ? 0 : 1;
                    const field = SPEC_FIELDS.find(f => f.value === value);
                    if (!field) return 0;
                    const haystack = `${field.value} ${field.label}`.toLowerCase();
                    return haystack.includes(search.toLowerCase()) ? 1 : 0;
                  }}>
                    <CommandInput placeholder="Search spec fields..." />
                    <CommandList>
                      <CommandEmpty>No field found.</CommandEmpty>
                      <CommandGroup heading="Options">
                        <CommandItem value="__none__" onSelect={() => setForm(p => ({ ...p, productMatch: "" }))}>
                          <Check className={`mr-1 h-3 w-3 ${!form.productMatch ? "opacity-100" : "opacity-0"}`} />
                          — None —
                        </CommandItem>
                      </CommandGroup>
                      {(() => {
                        const textFields = SPEC_FIELDS.filter(f => f.type === "text");
                        const sections: Record<string, SpecField[]> = {};
                        textFields.forEach(f => { (sections[f.section] ??= []).push(f); });
                        return Object.entries(sections).map(([section, fields]) => (
                          <CommandGroup key={section} heading={section}>
                            {fields.map(f => (
                              <CommandItem key={f.value} value={f.value} onSelect={(v) => setForm(p => ({ ...p, productMatch: v }))}>
                                <Check className={`mr-1 h-3 w-3 ${form.productMatch === f.value ? "opacity-100" : "opacity-0"}`} />
                                <span className="truncate">{f.label}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground font-mono">{f.value}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ));
                      })()}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">If set, looks up product by matching the spec field value to product names in the target tab</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Description Override</Label>
                <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Auto from product name" className="h-9" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Colour Field</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal text-xs">
                      {form.colourField ? (() => {
                        const sf = SPEC_FIELDS.find(f => f.value === form.colourField);
                        return sf ? <span className="truncate">{sf.label}</span> : form.colourField;
                      })() : <span className="text-muted-foreground">— None —</span>}
                      <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command filter={(value, search) => {
                      if (value === "__none__") return search ? 0 : 1;
                      const field = SPEC_FIELDS.find(f => f.value === value);
                      if (!field) return 0;
                      return `${field.value} ${field.label}`.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                    }}>
                      <CommandInput placeholder="Search colour fields..." />
                      <CommandList>
                        <CommandEmpty>No field found.</CommandEmpty>
                        <CommandGroup heading="Options">
                          <CommandItem value="__none__" onSelect={() => setForm(p => ({ ...p, colourField: "" }))}>
                            <Check className={`mr-1 h-3 w-3 ${!form.colourField ? "opacity-100" : "opacity-0"}`} />
                            — None —
                          </CommandItem>
                        </CommandGroup>
                        {(() => {
                          const colourFields = SPEC_FIELDS.filter(f => f.value.toLowerCase().includes("colour"));
                          const sections: Record<string, SpecField[]> = {};
                          colourFields.forEach(f => { (sections[f.section] ??= []).push(f); });
                          return Object.entries(sections).map(([section, fields]) => (
                            <CommandGroup key={section} heading={section}>
                              {fields.map(f => (
                                <CommandItem key={f.value} value={f.value} onSelect={(v) => setForm(p => ({ ...p, colourField: v }))}>
                                  <Check className={`mr-1 h-3 w-3 ${form.colourField === f.value ? "opacity-100" : "opacity-0"}`} />
                                  <span className="truncate">{f.label}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ));
                        })()}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Bottom Colour Field</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal text-xs">
                      {form.bottomColourField ? (() => {
                        const sf = SPEC_FIELDS.find(f => f.value === form.bottomColourField);
                        return sf ? <span className="truncate">{sf.label}</span> : form.bottomColourField;
                      })() : <span className="text-muted-foreground">— None —</span>}
                      <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command filter={(value, search) => {
                      if (value === "__none__") return search ? 0 : 1;
                      const field = SPEC_FIELDS.find(f => f.value === value);
                      if (!field) return 0;
                      return `${field.value} ${field.label}`.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                    }}>
                      <CommandInput placeholder="Search bottom colour fields..." />
                      <CommandList>
                        <CommandEmpty>No field found.</CommandEmpty>
                        <CommandGroup heading="Options">
                          <CommandItem value="__none__" onSelect={() => setForm(p => ({ ...p, bottomColourField: "" }))}>
                            <Check className={`mr-1 h-3 w-3 ${!form.bottomColourField ? "opacity-100" : "opacity-0"}`} />
                            — None —
                          </CommandItem>
                        </CommandGroup>
                        {(() => {
                          const colourFields = SPEC_FIELDS.filter(f => f.value.toLowerCase().includes("colour"));
                          const sections: Record<string, SpecField[]> = {};
                          colourFields.forEach(f => { (sections[f.section] ??= []).push(f); });
                          return Object.entries(sections).map(([section, fields]) => (
                            <CommandGroup key={section} heading={section}>
                              {fields.map(f => (
                                <CommandItem key={f.value} value={f.value} onSelect={(v) => setForm(p => ({ ...p, bottomColourField: v }))}>
                                  <Check className={`mr-1 h-3 w-3 ${form.bottomColourField === f.value ? "opacity-100" : "opacity-0"}`} />
                                  <span className="truncate">{f.label}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ));
                        })()}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Sort Order</Label>
                <Input type="number" value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} className="h-9" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? "Update" : "Create"} Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={deleteMappingTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteMappingTarget(null); }}
        onConfirm={() => { if (deleteMappingTarget) { deleteMutation.mutate({ id: deleteMappingTarget }); setDeleteMappingTarget(null); } }}
        title="Delete Spec Mapping?"
        description="This will permanently remove this spec mapping rule."
      />
      <ConfirmDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        onConfirm={() => bulkDeleteMutation.mutate({ ids: Array.from(selectedMappings) })}
        title={`Delete ${selectedMappings.size} Mappings?`}
        description={`Are you sure you want to delete ${selectedMappings.size} selected mapping${selectedMappings.size !== 1 ? "s" : ""}? This action cannot be undone.`}
      />

      {/* Dry-Run Preview Dialog */}
      <Dialog open={dryRunOpen} onOpenChange={(v) => { setDryRunOpen(v); if (!v) setDryRunQuoteId(""); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Play className="h-4 w-4" /> Dry-Run Preview</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Select a quote to test all active spec mappings against its spec data. No items will be created or modified.</p>
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Select Quote</Label>
                <Select value={dryRunQuoteId} onValueChange={setDryRunQuoteId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a quote..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {(quotesList || []).map((q: any) => (
                      <SelectItem key={q.id} value={String(q.id)}>
                        {q.quoteNumber || `#${q.id}`} — {q.clientName || "No client"} ({q.specWidth || "?"}m × {q.specLength || "?"}m)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {dryRunLoading && <Skeleton className="h-32 w-full" />}
            {dryRunError && <p className="text-sm text-destructive">Error: {(dryRunError as any).message}</p>}

            {dryRunResult && (
              <div className="space-y-4">
                {/* Spec Snapshot */}
                <div className="grid grid-cols-5 gap-2 text-xs">
                  {Object.entries((dryRunResult as any).specSnapshot || {}).map(([k, v]: [string, any]) => (
                    <div key={k} className="bg-muted rounded px-2 py-1">
                      <span className="text-muted-foreground">{k.replace(/^spec/, "")}: </span>
                      <span className="font-medium">{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
                    </div>
                  ))}
                </div>

                {/* Generated Items Table */}
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Tab</th>
                        <th className="px-2 py-1.5 text-left font-medium">Description</th>
                        <th className="px-2 py-1.5 text-left font-medium">Colour</th>
                        <th className="px-2 py-1.5 text-left font-medium">Btm Colour</th>
                        <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-left font-medium">UOM</th>
                        <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                        <th className="px-2 py-1.5 text-right font-medium">Sell</th>
                        <th className="px-2 py-1.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((dryRunResult as any).items || []).map((item: any, idx: number) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-1 capitalize">{item.tabName}</td>
                          <td className="px-2 py-1">{item.description}</td>
                          <td className="px-2 py-1">{item.colour || "—"}</td>
                          <td className="px-2 py-1">{item.bottomColour || "—"}</td>
                          <td className="px-2 py-1 text-right font-mono">{item.qty}</td>
                          <td className="px-2 py-1">{item.uom}</td>
                          <td className="px-2 py-1 text-right font-mono">${item.costRate?.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right font-mono">${item.sellRate?.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right font-mono font-medium">${item.total?.toFixed(2)}</td>
                        </tr>
                      ))}
                      {((dryRunResult as any).items || []).length === 0 && (
                        <tr><td colSpan={9} className="px-2 py-4 text-center text-muted-foreground">No items generated — no mappings matched this quote's spec data.</td></tr>
                      )}
                    </tbody>
                    {((dryRunResult as any).items || []).length > 0 && (
                      <tfoot className="bg-muted/30 font-medium">
                        <tr className="border-t">
                          <td colSpan={6} className="px-2 py-1.5 text-right">{(dryRunResult as any).items.length} items</td>
                          <td className="px-2 py-1.5 text-right font-mono">${(dryRunResult as any).totalCost?.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">${(dryRunResult as any).totalSell?.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">${(dryRunResult as any).totalSell?.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Skipped Mappings */}
                {((dryRunResult as any).skipped || []).length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {(dryRunResult as any).skipped.length} mappings skipped (condition not met)
                    </summary>
                    <div className="mt-2 space-y-1 pl-4">
                      {(dryRunResult as any).skipped.map((s: any) => (
                        <div key={s.id} className="text-muted-foreground">
                          <span className="font-medium text-foreground">{s.name}</span> — {s.specField} {s.condition}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDryRunOpen(false); setDryRunQuoteId(""); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validate All Dialog */}
      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Validate All Active Mappings</DialogTitle>
          </DialogHeader>
          {validateLoading && <div className="space-y-3 py-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
          {!validateLoading && validateResult && (() => {
            const vr = validateResult as any;
            const overallStatus = vr.errorCount > 0 ? "error" : vr.warningCount > 0 ? "warning" : "pass";
            return (
              <div className="space-y-4">
                {/* Summary Header */}
                <div className={`flex items-center justify-between p-4 rounded-lg border ${
                  overallStatus === "pass" ? "bg-green-50 border-green-200" :
                  overallStatus === "warning" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-center gap-3">
                    {overallStatus === "pass" && <CircleCheck className="h-6 w-6 text-green-600" />}
                    {overallStatus === "warning" && <TriangleAlert className="h-6 w-6 text-amber-600" />}
                    {overallStatus === "error" && <CircleAlert className="h-6 w-6 text-red-600" />}
                    <div>
                      <p className="font-semibold text-sm">
                        {overallStatus === "pass" ? "All mappings valid" :
                         overallStatus === "warning" ? "Warnings found" : "Errors found"}
                      </p>
                      <p className="text-xs text-muted-foreground">{vr.totalActive} active mappings scanned</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {vr.passCount > 0 && <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">{vr.passCount} pass</span>}
                    {vr.warningCount > 0 && <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">{vr.warningCount} warn</span>}
                    {vr.errorCount > 0 && <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">{vr.errorCount} error</span>}
                  </div>
                </div>

                {/* Findings List */}
                {vr.findings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Findings ({vr.findings.length})</p>
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                      {(vr.findings as any[]).map((f: any, i: number) => (
                        <div key={i} className={`flex items-start gap-2 p-2.5 rounded border text-sm ${
                          f.severity === "error" ? "bg-red-50/50 border-red-200" : "bg-amber-50/50 border-amber-200"
                        }`}>
                          {f.severity === "error"
                            ? <CircleAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            : <TriangleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-xs">{f.mappingName}</span>
                              <Badge variant="outline" className="text-[10px] capitalize">{f.tabName}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{f.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {vr.findings.length === 0 && (
                  <div className="text-center py-8">
                    <CircleCheck className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-green-700">All {vr.totalActive} active mappings passed validation</p>
                    <p className="text-xs text-muted-foreground mt-1">Spec fields, product links, formulas, and conditions are all valid.</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Mapping Change History</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {historyLoading && <Skeleton className="h-20 w-full" />}
            {!historyLoading && (!historyData || (historyData as any[]).length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">No history yet. Changes will appear here after creating, editing, or deleting mappings.</p>
            )}
            {!historyLoading && historyData && (historyData as any[]).map((entry: any) => (
              <div key={entry.id} className="border rounded-md p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.action === 'deleted' ? 'destructive' : entry.action === 'created' ? 'default' : 'secondary'} className="text-xs capitalize">{entry.action}</Badge>
                    <span className="text-sm font-medium">Mapping #{entry.mappingId}</span>
                    {entry.snapshot?.name && <span className="text-xs text-muted-foreground">({entry.snapshot.name})</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground">by {entry.userName || 'System'}</p>
                {entry.changes && (entry.changes as any[]).length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {(entry.changes as any[]).map((c: any, i: number) => (
                      <p key={i} className="text-xs"><span className="font-medium">{c.field}:</span> <span className="text-red-600 line-through">{String(c.oldValue ?? '—')}</span> → <span className="text-green-700">{String(c.newValue ?? '—')}</span></p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Calculation Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview Calculation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Formula: <code className="bg-muted px-1 rounded">{form.qtyFormula}</code></p>
            <p className="text-sm text-muted-foreground">This will evaluate the formula using spec values from the most recent quote. Click "Calculate" to see the result.</p>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/trpc/specItems.previewFormula?input=${encodeURIComponent(JSON.stringify({ formula: form.qtyFormula, productId: form.productId }))}`);
                  const json = await res.json();
                  if (json?.result?.data) {
                    setPreviewResult(String(json.result.data.result));
                  } else {
                    setPreviewResult("No recent quote found or formula error");
                  }
                } catch {
                  setPreviewResult("Error evaluating formula");
                }
              }}
            >
              Calculate
            </Button>
            {previewResult !== null && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Result: <span className="text-primary font-bold">{previewResult}</span></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewOpen(false); setPreviewResult(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
