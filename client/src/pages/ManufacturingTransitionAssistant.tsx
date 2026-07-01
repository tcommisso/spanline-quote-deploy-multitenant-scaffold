import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, Building2, Check, CheckCircle2, ChevronsUpDown, FileSpreadsheet, MapPin, RefreshCw, Save, Search, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TransitionRow = {
  id?: number;
  rowNumber: number;
  rawProductKey?: string | null;
  rawProductCode?: string | null;
  rawProductName: string;
  rawDescription?: string | null;
  rawCategory?: string | null;
  rawColour?: string | null;
  rawUnit?: string | null;
  quantity?: number | string | null;
  length?: number | string | null;
  width?: number | string | null;
  stockItemId?: number | null;
  stockItemCode?: string | null;
  stockItemName?: string | null;
  matchStatus?: "learned" | "fuzzy" | "manual" | "unmatched";
  matchConfidence?: number | string | null;
  sourceType?: "manufacture" | "procure";
  rawData?: Record<string, unknown> | null;
  notes?: string | null;
};

type ConstructionClientLookupResult = {
  id: number;
  quoteNumber?: string | null;
  clientName: string;
  storedClientName?: string | null;
  clientNumber?: string | null;
  siteAddress?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status?: string | null;
};

type RowSourceOption = {
  value: string;
  kind: "manufacture" | "procure" | "branch" | "supplier";
  id?: number | null;
  label: string;
  description?: string | null;
  sourceType: "manufacture" | "procure";
};

const MATCH_STYLES: Record<string, string> = {
  learned: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  fuzzy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  manual: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  unmatched: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const STATUS_STYLES: Record<string, string> = {
  imported: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  archived: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

function formatStatus(value?: string | null) {
  return String(value || "unknown").replace(/_/g, " ");
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function stockLabel(item: any) {
  return [item.code, item.name].filter(Boolean).join(" - ");
}

function stockSearchText(item: any) {
  return [
    item.code,
    item.name,
    item.description,
    item.category,
    item.subGroup,
    item.supplier,
    item.colour,
  ].filter(Boolean).join(" ").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sourceValueFor(option: Pick<RowSourceOption, "kind" | "id">) {
  if (option.kind === "branch" || option.kind === "supplier") {
    return `${option.kind}:${option.id ?? ""}`;
  }
  return `${option.kind}:default`;
}

function sourceReferenceFor(option: RowSourceOption) {
  return {
    kind: option.kind,
    id: option.id ?? null,
    label: option.label,
    sourceType: option.sourceType,
  };
}

function transitionSourceFromRawData(rawData: unknown): RowSourceOption | null {
  if (!isRecord(rawData) || !isRecord(rawData.transitionSource)) return null;
  const source = rawData.transitionSource;
  const kind = source.kind;
  if (!["manufacture", "procure", "branch", "supplier"].includes(kind)) return null;
  const sourceType = source.sourceType === "procure" || kind === "procure" || kind === "supplier"
    ? "procure"
    : "manufacture";
  const id = Number(source.id);
  return {
    value: sourceValueFor({ kind, id: Number.isFinite(id) ? id : null }),
    kind,
    id: Number.isFinite(id) ? id : null,
    label: String(source.label || (sourceType === "procure" ? "External procurement" : "Internal manufacturing")),
    description: source.description ? String(source.description) : null,
    sourceType,
  };
}

function rowSourceOption(row: TransitionRow, sourceOptions: RowSourceOption[]) {
  const stored = transitionSourceFromRawData(row.rawData);
  if (stored) {
    return sourceOptions.find((option) => option.value === stored.value) || stored;
  }
  const fallbackValue = row.sourceType === "procure" ? "procure:default" : "manufacture:default";
  return sourceOptions.find((option) => option.value === fallbackValue) || {
    value: fallbackValue,
    kind: row.sourceType === "procure" ? "procure" : "manufacture",
    label: row.sourceType === "procure" ? "External procurement" : "Internal manufacturing",
    sourceType: row.sourceType || "manufacture",
  };
}

function mergeTransitionSource(row: TransitionRow, option: RowSourceOption) {
  const rawData = isRecord(row.rawData) ? { ...row.rawData } : {};
  rawData.transitionSource = sourceReferenceFor(option);
  return rawData;
}

function RowSourceSelect({
  row,
  options,
  value,
  onChange,
  disabled,
}: {
  row: TransitionRow;
  options: RowSourceOption[];
  value: RowSourceOption;
  onChange: (value: RowSourceOption) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value || rowSourceOption(row, options);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between px-3 text-left font-normal"
        >
          <span className="min-w-0 truncate">{selected.label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search branches or suppliers..." />
          <CommandList>
            <CommandEmpty>No source found.</CommandEmpty>
            <CommandGroup heading="Manufacture">
              {options.filter((option) => option.sourceType === "manufacture").map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.value} ${option.label} ${option.description || ""}`}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", selected.value === option.value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate">{option.label}</div>
                    {option.description && <div className="truncate text-xs text-muted-foreground">{option.description}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Suppliers">
              {options.filter((option) => option.sourceType === "procure").map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.value} ${option.label} ${option.description || ""}`}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", selected.value === option.value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate">{option.label}</div>
                    {option.description && <div className="truncate text-xs text-muted-foreground">{option.description}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StockMatchSelect({
  row,
  stockItems,
  onChange,
  disabled,
}: {
  row: TransitionRow;
  stockItems: any[];
  onChange: (stockItemId: number | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = row.stockItemId ? stockItems.find((item) => item.id === row.stockItemId) : null;
  const selectedLabel = selected
    ? stockLabel(selected)
    : row.stockItemId
      ? [row.stockItemCode, row.stockItemName].filter(Boolean).join(" - ")
      : "";
  const options = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = (!search
      ? stockItems
      : stockItems.filter((item) => stockSearchText(item).includes(search))
    ).slice(0, 80);
    if (selected && !filtered.some((item) => item.id === selected.id)) {
      return [selected, ...filtered];
    }
    return filtered;
  }, [query, selected, stockItems]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between px-3 text-left font-normal"
        >
          <span className={cn("min-w-0 truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || "No stock match"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search code, product, category..."
          />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="No stock match"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-4 w-4", !row.stockItemId ? "opacity-100" : "opacity-0")} />
                No stock match
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading={options.length >= 80 ? "Stock items (showing first 80 matches)" : "Stock items"}>
              {options.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">No matching stock items.</div>
              ) : options.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${stockLabel(item)} ${item.category || ""} ${item.supplier || ""}`}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4", row.stockItemId === item.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate">{stockLabel(item)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[item.category, item.supplier, item.colour].filter(Boolean).join(" · ") || "Stock item"}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MatchBadge({ row }: { row: TransitionRow }) {
  const status = row.stockItemId ? row.matchStatus || "manual" : "unmatched";
  const confidence = numberValue(row.matchConfidence);
  return (
    <Badge variant="secondary" className={MATCH_STYLES[status] || MATCH_STYLES.unmatched}>
      {formatStatus(status)}
      {row.stockItemId ? ` ${Math.round(confidence)}%` : ""}
    </Badge>
  );
}

function ImportRowsEditor({
  rows,
  stockItems,
  sourceOptions,
  onStockChange,
  onSourceChange,
  onDeleteRow,
  isSaving,
}: {
  rows: TransitionRow[];
  stockItems: any[];
  sourceOptions: RowSourceOption[];
  onStockChange: (row: TransitionRow, stockItemId: number | null) => void;
  onSourceChange: (row: TransitionRow, source: RowSourceOption) => void;
  onDeleteRow: (row: TransitionRow) => void;
  isSaving?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        All imported rows have been removed.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <div key={row.id || `${row.rowNumber}-${row.rawProductName}`} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Row {row.rowNumber}</div>
                <div className="font-medium leading-tight">{row.rawProductName}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[row.rawProductCode, row.rawColour, row.rawCategory].filter(Boolean).join(" · ") || "No product metadata"}
                </div>
              </div>
              <MatchBadge row={row} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="rounded-md bg-muted/40 p-2">
                <div className="font-semibold text-foreground">{numberValue(row.quantity, 1)}</div>
                Qty
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <div className="font-semibold text-foreground">{row.rawUnit || rowSourceOption(row, sourceOptions).label}</div>
                Unit / source
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <StockMatchSelect row={row} stockItems={stockItems} onChange={(id) => onStockChange(row, id)} disabled={isSaving} />
              <RowSourceSelect
                row={row}
                options={sourceOptions}
                value={rowSourceOption(row, sourceOptions)}
                onChange={(value) => onSourceChange(row, value)}
                disabled={isSaving}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center text-destructive hover:text-destructive"
                onClick={() => onDeleteRow(row)}
                disabled={isSaving}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete row
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              <TableHead>Imported product</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-[320px]">Stock match</TableHead>
              <TableHead className="w-40">Source</TableHead>
              <TableHead className="w-32">Match</TableHead>
              <TableHead className="w-16 text-right">Delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id || `${row.rowNumber}-${row.rawProductName}`}>
                <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                <TableCell className="min-w-[280px] whitespace-normal">
                  <div className="font-medium">{row.rawProductName}</div>
                  <div className="text-xs text-muted-foreground">
                    {[row.rawProductCode, row.rawColour, row.rawCategory].filter(Boolean).join(" · ") || row.rawDescription || "No product metadata"}
                  </div>
                </TableCell>
                <TableCell>{numberValue(row.quantity, 1)}</TableCell>
                <TableCell>
                  <StockMatchSelect row={row} stockItems={stockItems} onChange={(id) => onStockChange(row, id)} disabled={isSaving} />
                </TableCell>
                <TableCell>
                  <RowSourceSelect
                    row={row}
                    options={sourceOptions}
                    value={rowSourceOption(row, sourceOptions)}
                    onChange={(value) => onSourceChange(row, value)}
                    disabled={isSaving}
                  />
                </TableCell>
                <TableCell><MatchBadge row={row} /></TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => onDeleteRow(row)}
                    disabled={isSaving}
                    aria-label={`Delete imported row ${row.rowNumber}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function ManufacturingTransitionAssistant() {
  const [location, setLocation] = useLocation();
  const initialImportId = useMemo(() => {
    const query = typeof window !== "undefined" ? window.location.search : "";
    const id = Number(new URLSearchParams(query).get("importId"));
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [location]);
  const [selectedImportId, setSelectedImportId] = useState<number | null>(initialImportId);
  const [preview, setPreview] = useState<any>(null);
  const [clientName, setClientName] = useState("");
  const [clientLookupOpen, setClientLookupOpen] = useState(false);
  const [siteAddress, setSiteAddress] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [notes, setNotes] = useState("");
  const [stockSearch, setStockSearch] = useState("");

  const utils = trpc.useUtils();
  const previewUpload = trpc.manufacturing.transitionAssistant.previewUpload.useMutation({
    onSuccess: (data) => {
      setPreview(data);
      setSelectedImportId(null);
      toast.success(`Previewed ${data.summary.totalRows} rows from ${data.worksheetName}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const commitImport = trpc.manufacturing.transitionAssistant.commitImport.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.manufacturing.transitionAssistant.listImports.invalidate(),
        utils.manufacturing.orders.list.invalidate(),
      ]);
      setPreview(null);
      setClientName("");
      setSiteAddress("");
      setNotes("");
      setSelectedImportId(data.id);
      setLocation(`/manufacturing/transition-assistant?importId=${data.id}`);
      toast.success(`Saved uploaded order ${data.importNumber}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const updateRowMatch = trpc.manufacturing.transitionAssistant.updateRowMatch.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.manufacturing.transitionAssistant.getImport.invalidate(),
        utils.manufacturing.transitionAssistant.listImports.invalidate(),
        utils.manufacturing.orders.list.invalidate(),
      ]);
      toast.success("Match saved and remembered");
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteRow = trpc.manufacturing.transitionAssistant.deleteRow.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.manufacturing.transitionAssistant.getImport.invalidate(),
        utils.manufacturing.transitionAssistant.listImports.invalidate(),
        utils.manufacturing.orders.list.invalidate(),
      ]);
      toast.success("Imported row deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateStatus = trpc.manufacturing.transitionAssistant.updateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.manufacturing.transitionAssistant.getImport.invalidate(),
        utils.manufacturing.transitionAssistant.listImports.invalidate(),
        utils.manufacturing.orders.list.invalidate(),
      ]);
      toast.success("Uploaded order status updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const { data: stockItemsRaw = [] } = trpc.inventory.stockItems.list.useQuery({ activeOnly: true });
  const { data: branches = [] } = trpc.manufacturing.branches.useQuery();
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery({ activeOnly: true });
  const { data: imports = [] } = trpc.manufacturing.transitionAssistant.listImports.useQuery({});
  const { data: constructionClientResults = [], isFetching: clientLookupFetching } =
    trpc.manufacturing.transitionAssistant.searchConstructionClients.useQuery(
      { query: clientName.trim(), limit: 12 },
      { enabled: Boolean(preview) && clientName.trim().length >= 2 },
    );
  const { data: selectedImport } = trpc.manufacturing.transitionAssistant.getImport.useQuery(
    { id: selectedImportId || 0 },
    { enabled: Boolean(selectedImportId) },
  );

  const previewRows: TransitionRow[] = preview?.rows || [];
  const savedRows: TransitionRow[] = selectedImport?.rows || [];
  const activeRows = previewRows.length ? previewRows : savedRows;
  const stockItems = useMemo(() => {
    const search = stockSearch.trim().toLowerCase();
    const items = stockItemsRaw as any[];
    return !search ? items : items.filter((item) => stockSearchText(item).includes(search));
  }, [stockItemsRaw, stockSearch]);
  const sourceOptions = useMemo<RowSourceOption[]>(() => {
    const branchOptions = (branches as any[]).map((branch) => ({
      value: `branch:${branch.id}`,
      kind: "branch" as const,
      id: branch.id,
      label: branch.name,
      description: "Branch manufacturing",
      sourceType: "manufacture" as const,
    }));
    const supplierOptions = (suppliers as any[]).map((supplier) => ({
      value: `supplier:${supplier.id}`,
      kind: "supplier" as const,
      id: supplier.id,
      label: supplier.name,
      description: [supplier.category, supplier.supplierScope].filter(Boolean).join(" · ") || "Supplier",
      sourceType: "procure" as const,
    }));
    return [
      {
        value: "manufacture:default",
        kind: "manufacture" as const,
        label: "Internal manufacturing",
        description: "No branch specified",
        sourceType: "manufacture" as const,
      },
      ...branchOptions,
      {
        value: "procure:default",
        kind: "procure" as const,
        label: "External procurement",
        description: "No supplier specified",
        sourceType: "procure" as const,
      },
      ...supplierOptions,
    ];
  }, [branches, suppliers]);
  const stockById = useMemo(() => new Map((stockItemsRaw as any[]).map((item) => [item.id, item])), [stockItemsRaw]);
  const matchedCount = activeRows.filter((row) => row.stockItemId).length;
  const matchPercent = activeRows.length ? Math.round((matchedCount / activeRows.length) * 100) : 0;

  async function handleFile(file?: File | null) {
    if (!file) return;
    const base64 = await readFileAsBase64(file);
    previewUpload.mutate({ filename: file.name, base64 });
  }

  function patchPreviewRow(row: TransitionRow, updates: Partial<TransitionRow>) {
    if (!preview) return;
    setPreview({
      ...preview,
      rows: preview.rows.map((candidate: TransitionRow) => (
        candidate.rowNumber === row.rowNumber ? { ...candidate, ...updates } : candidate
      )),
    });
  }

  function handlePreviewStockChange(row: TransitionRow, stockItemId: number | null) {
    const stock = stockItemId ? stockById.get(stockItemId) : null;
    patchPreviewRow(row, {
      stockItemId: stock?.id || null,
      stockItemCode: stock?.code || null,
      stockItemName: stock?.name || null,
      matchStatus: stock ? "manual" : "unmatched",
      matchConfidence: stock ? 100 : 0,
    });
  }

  function handleSavedStockChange(row: TransitionRow, stockItemId: number | null) {
    if (!row.id) return;
    updateRowMatch.mutate({
      rowId: row.id,
      stockItemId,
      sourceType: row.sourceType || "manufacture",
    });
  }

  function handleSourceChange(row: TransitionRow, source: RowSourceOption) {
    const rawData = mergeTransitionSource(row, source);
    if (preview) {
      patchPreviewRow(row, { sourceType: source.sourceType, rawData });
    } else if (row.id) {
      updateRowMatch.mutate({
        rowId: row.id,
        stockItemId: row.stockItemId || null,
        sourceType: source.sourceType,
        sourceReference: sourceReferenceFor(source),
      });
    }
  }

  function handlePreviewRowDelete(row: TransitionRow) {
    if (!preview) return;
    setPreview({
      ...preview,
      rows: preview.rows.filter((candidate: TransitionRow) => candidate.rowNumber !== row.rowNumber),
    });
  }

  function handleSavedRowDelete(row: TransitionRow) {
    if (!row.id) return;
    if (!window.confirm(`Delete imported row ${row.rowNumber}?`)) return;
    deleteRow.mutate({ rowId: row.id });
  }

  function savePreview() {
    if (!preview) return;
    commitImport.mutate({
      filename: preview.filename,
      worksheetName: preview.worksheetName,
      clientName: clientName || null,
      siteAddress: siteAddress || null,
      priority,
      notes: notes || null,
      rows: preview.rows.map((row: TransitionRow) => ({
        ...row,
        quantity: numberValue(row.quantity, 1),
        length: row.length == null ? null : numberValue(row.length, 0),
        width: row.width == null ? null : numberValue(row.width, 0),
        sourceType: row.sourceType || "manufacture",
      })),
    });
  }

  function selectConstructionClient(client: ConstructionClientLookupResult) {
    setClientName(client.clientName || client.storedClientName || "");
    setSiteAddress(client.siteAddress || "");
    setClientLookupOpen(false);
    if (client.siteAddress) {
      toast.success("Site address populated from construction client");
    }
  }

  function viewImport(id: number) {
    setPreview(null);
    setSelectedImportId(id);
    setLocation(`/manufacturing/transition-assistant?importId=${id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileSpreadsheet className="h-6 w-6" />
            Manufacturing Transition Assistant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload legacy XLSM orders, match products to stock, and carry the rematches forward for the next import.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href="/manufacturing/orders">Back to orders</a>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Upload legacy workbook</h2>
                <p className="text-sm text-muted-foreground">Only the first worksheet is read. Macros are ignored.</p>
              </div>
              <Label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto">
                <UploadCloud className="h-4 w-4" />
                Choose XLSM
                <input
                  type="file"
                  accept=".xlsm,.xlsx,.xls"
                  className="sr-only"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
              </Label>
            </div>

            {previewUpload.isPending && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Reading first worksheet and matching stock items...
              </div>
            )}

            {preview && (
              <div className="mt-5 space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{preview.filename}</AlertTitle>
                  <AlertDescription>
                    Worksheet {preview.worksheetName}, header row {preview.headerRow}. {matchedCount} of {activeRows.length} rows matched.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="transition-client">Client / order reference</Label>
                    <div
                      className="relative"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setClientLookupOpen(false);
                        }
                      }}
                    >
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="transition-client"
                        value={clientName}
                        onChange={(event) => {
                          setClientName(event.target.value);
                          setClientLookupOpen(true);
                        }}
                        onFocus={() => setClientLookupOpen(true)}
                        placeholder="Search construction clients or type reference"
                        className="pl-9"
                        autoComplete="off"
                      />
                      {clientLookupOpen && clientName.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg">
                          {clientLookupFetching ? (
                            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Searching construction clients...
                            </div>
                          ) : constructionClientResults.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-muted-foreground">
                              No construction clients found. Keep this as a manual reference if needed.
                            </div>
                          ) : (
                            constructionClientResults.map((client: ConstructionClientLookupResult) => (
                              <button
                                key={client.id}
                                type="button"
                                className="w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  selectConstructionClient(client);
                                }}
                                onClick={() => selectConstructionClient(client)}
                              >
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      <span className="truncate text-sm font-medium">{client.clientName}</span>
                                    </div>
                                    <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">
                                      {[client.quoteNumber || `Job #${client.id}`, client.clientNumber].filter(Boolean).join(" · ")}
                                    </div>
                                    {client.siteAddress && (
                                      <div className="mt-1 flex items-start gap-1 pl-6 text-xs text-muted-foreground">
                                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                        <span className="line-clamp-2">{client.siteAddress}</span>
                                      </div>
                                    )}
                                  </div>
                                  {client.status && (
                                    <Badge variant="outline" className="shrink-0 text-[10px]">
                                      {formatStatus(client.status)}
                                    </Badge>
                                  )}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="transition-site">Site / delivery address</Label>
                    <Input id="transition-site" value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="transition-stock-search">Stock search filter</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="transition-stock-search"
                        value={stockSearch}
                        onChange={(event) => setStockSearch(event.target.value)}
                        placeholder="Filter stock dropdowns"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="transition-notes">Notes</Label>
                    <Textarea id="transition-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">Match progress</span>
                    <span className="text-muted-foreground">{matchPercent}%</span>
                  </div>
                  <Progress value={matchPercent} />
                </div>

                <ImportRowsEditor
                  rows={previewRows}
                  stockItems={stockItems}
                  sourceOptions={sourceOptions}
                  onStockChange={handlePreviewStockChange}
                  onSourceChange={handleSourceChange}
                  onDeleteRow={handlePreviewRowDelete}
                  isSaving={commitImport.isPending}
                />

                <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
                  <Button variant="outline" onClick={() => setPreview(null)} disabled={commitImport.isPending}>Discard preview</Button>
                  <Button onClick={savePreview} disabled={commitImport.isPending || previewRows.length === 0}>
                    {commitImport.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save uploaded order
                  </Button>
                </div>
              </div>
            )}
          </section>

          {selectedImport && !preview && (
            <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{selectedImport.import.importNumber}</h2>
                    <Badge variant="secondary" className={STATUS_STYLES[selectedImport.import.status] || ""}>
                      {formatStatus(selectedImport.import.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedImport.import.sourceFileName} · {selectedImport.import.matchedLineCount}/{selectedImport.import.lineCount} matched
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selectedImport.import.id, status: "accepted" })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selectedImport.import.id, status: "in_review" })}>
                    Review
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: selectedImport.import.id, status: "archived" })}>
                    Archive
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Match progress</span>
                  <span className="text-muted-foreground">{matchPercent}%</span>
                </div>
                <Progress value={matchPercent} />
              </div>

              <div className="mt-4 space-y-1">
                <Label htmlFor="saved-stock-search">Stock search filter</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="saved-stock-search"
                    value={stockSearch}
                    onChange={(event) => setStockSearch(event.target.value)}
                    placeholder="Filter stock dropdowns"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="mt-4">
                <ImportRowsEditor
                  rows={savedRows}
                  stockItems={stockItems}
                  sourceOptions={sourceOptions}
                  onStockChange={handleSavedStockChange}
                  onSourceChange={handleSourceChange}
                  onDeleteRow={handleSavedRowDelete}
                  isSaving={updateRowMatch.isPending || deleteRow.isPending}
                />
              </div>
            </section>
          )}

          {!preview && !selectedImport && (
            <section className="rounded-lg border border-dashed bg-card p-8 text-center text-muted-foreground">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 opacity-50" />
              Upload a workbook or open a previous import to begin matching products.
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">Recent uploads</h2>
            <p className="mt-1 text-sm text-muted-foreground">Saved transition orders also appear in Manufacturing Orders.</p>
            <div className="mt-4 space-y-2">
              {!imports.length ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No uploaded orders yet.</div>
              ) : (
                imports.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => viewImport(item.id)}
                    className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{item.importNumber}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.clientName || item.sourceFileName}</div>
                      </div>
                      <Badge variant="secondary" className={STATUS_STYLES[item.status] || ""}>{formatStatus(item.status)}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {item.matchedLineCount}/{item.lineCount} matched
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
