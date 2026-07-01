import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Download, Factory, PackagePlus, Pencil, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { logClientDownload } from "@/lib/userActivity";

type ManufacturingProduct = {
  id: number;
  sku: string;
  description: string;
  category: string;
  subGroup: string;
  uom: string;
  unitCost: number;
  colour: string;
  isActive: boolean;
};

type ColourOption = {
  value: string;
  detail: string;
  hex?: string | null;
  fromMaster: boolean;
};

const BLANK_PRODUCT = {
  sku: "",
  description: "",
  category: "",
  subGroup: "",
  uom: "ea",
  unitCost: 0,
  colour: "",
  isActive: true,
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseBool(value: string | undefined) {
  if (!value?.trim()) return undefined;
  return !["0", "false", "no", "inactive", "archived"].includes(value.trim().toLowerCase());
}

function colourStyle(colour: string, hex?: string | null) {
  if (hex) return { backgroundColor: hex };
  const normalized = colour.trim().toLowerCase();
  const named: Record<string, string> = {
    black: "#111827",
    ebony: "#111827",
    "ebony/black matt": "#111827",
    white: "#ffffff",
    surfmist: "#f5f2e8",
    primrose: "#f3e3a5",
    merino: "#d9c7a1",
    paperbark: "#cdbb93",
    monument: "#4b5563",
    mill: "#b6b8ba",
    galvanised: "#9ca3af",
    galvanized: "#9ca3af",
  };
  if (named[normalized]) return { backgroundColor: named[normalized] };
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) hash = (hash * 31 + normalized.charCodeAt(i)) % 360;
  return { backgroundColor: `hsl(${hash} 65% 55%)` };
}

function metadataHex(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const hex = record.hexCode || record.hex || record.colourHex || record.colorHex;
  return typeof hex === "string" && hex.trim() ? hex.trim() : null;
}

function buildColourOptions(masterColours: Array<{ key?: string | null; value?: string | null; metadata?: unknown }>, currentColour?: string | null) {
  const seen = new Set<string>();
  const options: ColourOption[] = [];

  for (const colour of masterColours) {
    const name = String(colour.value || colour.key || "").trim();
    if (!name) continue;
    const normalized = name.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const detail = String(colour.key || "").trim();
    options.push({
      value: name,
      detail: detail && detail.toLowerCase() !== normalized ? detail : "",
      hex: metadataHex(colour.metadata),
      fromMaster: true,
    });
  }

  const current = String(currentColour || "").trim();
  if (current && !seen.has(current.toLowerCase())) {
    options.unshift({
      value: current,
      detail: "Imported value not in master colours",
      fromMaster: false,
    });
  }

  return options.sort((a, b) => {
    if (a.fromMaster !== b.fromMaster) return a.fromMaster ? 1 : -1;
    return a.value.localeCompare(b.value);
  });
}

function ColourSwatch({ colour, hex }: { colour: string; hex?: string | null }) {
  if (!colour) return <span>-</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-4 w-4 rounded-full border border-border shadow-sm" style={colourStyle(colour, hex)} />
      <span>{colour}</span>
    </span>
  );
}

export default function ManufacturingDataAdmin() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [subGroup, setSubGroup] = useState("all");
  const [activeState, setActiveState] = useState<"active" | "archived" | "all">("active");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<ManufacturingProduct | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();

  const listQuery = trpc.manufacturingData.list.useQuery({ search, category, subGroup, activeState, limit: 2000 });
  const facetsQuery = trpc.manufacturingData.facets.useQuery();
  const coloursQuery = trpc.masterData.getByCategory.useQuery({ category: "colour" });
  const products = (listQuery.data || []) as ManufacturingProduct[];
  const categories = (facetsQuery.data?.categories || []) as string[];
  const subGroups = (facetsQuery.data?.subGroups || []) as string[];
  const masterColourOptions = useMemo(() => buildColourOptions(coloursQuery.data || []), [coloursQuery.data]);
  const masterColourHexByName = useMemo(() => new Map(masterColourOptions
    .filter((colour) => colour.hex)
    .map((colour) => [colour.value.toLowerCase(), colour.hex || null])),
    [masterColourOptions]);
  const selectedIdSet = new Set(selectedIds);
  const allVisibleSelected = products.length > 0 && products.every((product) => selectedIdSet.has(product.id));

  const refreshProducts = () => {
    setSelectedIds([]);
    utils.manufacturingData.list.invalidate();
    utils.manufacturingData.facets.invalidate();
  };

  const createMutation = trpc.manufacturingData.create.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      refreshProducts();
      toast.success("Manufacturing product added");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.manufacturingData.update.useMutation({
    onSuccess: () => {
      setEditItem(null);
      refreshProducts();
      toast.success("Manufacturing product updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const archiveProduct = (product: ManufacturingProduct, isActive: boolean) => {
    updateMutation.mutate({
      ...product,
      id: product.id,
      sku: product.sku || null,
      category: product.category || null,
      subGroup: product.subGroup || null,
      uom: product.uom || null,
      colour: product.colour || null,
      isActive,
    });
  };
  const importMutation = trpc.manufacturingData.importCsvRows.useMutation({
    onSuccess: (result) => {
      refreshProducts();
      toast.success(`Import complete: ${result.created} created, ${result.updated} updated`);
      if (result.skipped) toast.info(`${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped`);
      if (result.errors?.length) toast.warning(`${result.errors.length} row${result.errors.length === 1 ? "" : "s"} failed`);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.manufacturingData.delete.useMutation({
    onSuccess: () => {
      refreshProducts();
      toast.success("Manufacturing product deleted");
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkArchiveMutation = trpc.manufacturingData.bulkArchive.useMutation({
    onSuccess: (result) => {
      refreshProducts();
      toast.success(`${result.updated} product${result.updated === 1 ? "" : "s"} updated`);
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkDeleteMutation = trpc.manufacturingData.bulkDelete.useMutation({
    onSuccess: (result) => {
      refreshProducts();
      toast.success(`${result.deleted} product${result.deleted === 1 ? "" : "s"} deleted`);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelection = (id: number) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !products.some((product) => product.id === id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...products.map((product) => product.id)])));
  };

  const exportCsv = () => {
    const header = ["sku", "description", "category", "style", "uom", "unitCost", "masterColour", "isActive"];
    const body = products.map((p) => [p.sku, p.description, p.category, p.subGroup, p.uom, p.unitCost, p.colour, p.isActive]);
    const csv = [header, ...body].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `manufacturing-data-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    logClientDownload({
      filename,
      source: "manufacturing_data_export",
      entityType: "manufacturing_product",
      mimeType: "text/csv",
      metadata: { rowCount: products.length },
    });
  };

  const importCsv = async (file: File | null) => {
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const [header, ...data] = rows;
      const headers = header.map(headerKey);
      const idx = (...names: string[]) => headers.findIndex((h) => names.map(headerKey).includes(h));
      const descriptionIdx = idx("description", "productName", "product", "name");
      if (descriptionIdx < 0) {
        toast.error("CSV needs a description, product, or name column");
        return;
      }
      const skuIdx = idx("sku", "productCode", "code", "spaCode");
      const categoryIdx = idx("category", "productCategory", "type");
      const subGroupIdx = idx("subGroup", "sub_group", "group", "style", "productStyle");
      const uomIdx = idx("uom", "unit");
      const costIdx = idx("unitCost", "unitPrice", "price", "cost");
      const colourIdx = idx("colour", "color", "masterColour", "masterColor", "master colour", "master color", "finish");
      const activeIdx = idx("isActive", "active", "status");
      const parsed = data.map((cols) => ({
        sku: skuIdx >= 0 ? cols[skuIdx]?.trim() || null : null,
        description: cols[descriptionIdx]?.trim() || "",
        category: categoryIdx >= 0 ? cols[categoryIdx]?.trim() || null : null,
        subGroup: subGroupIdx >= 0 ? cols[subGroupIdx]?.trim() || null : null,
        uom: uomIdx >= 0 ? cols[uomIdx]?.trim() || null : null,
        unitCost: costIdx >= 0 ? Number(cols[costIdx] || 0) : 0,
        colour: colourIdx >= 0 ? cols[colourIdx]?.trim() || null : null,
        isActive: activeIdx >= 0 ? parseBool(cols[activeIdx]) : undefined,
      })).filter((row) => row.description);
      if (!parsed.length) {
        toast.error("No manufacturing products found in CSV");
        return;
      }
      importMutation.mutate({ rows: parsed });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" />
            Manufacturing Data
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Product catalogue for manufacturing purchase orders. {products.length} products shown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => importCsv(event.target.files?.[0] || null)} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
            <Upload className="h-4 w-4 mr-2" /> {importMutation.isPending ? "Importing..." : "Import CSV"}
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!products.length}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="brand"><PackagePlus className="h-4 w-4 mr-2" /> Add Product</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add Manufacturing Product</DialogTitle></DialogHeader>
              <ProductForm
                colourOptions={masterColourOptions}
                loading={createMutation.isPending}
                onSubmit={(data) => createMutation.mutate(data)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search code, description, category, colour..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subGroup} onValueChange={setSubGroup}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Style / Sub-Group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Styles / Sub-Groups</SelectItem>
              {subGroups.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeState} onValueChange={(value) => setActiveState(value as "active" | "archived" | "all")}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All Products</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium">{selectedIds.length} selected</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={bulkArchiveMutation.isPending}
                onClick={() => bulkArchiveMutation.mutate({ ids: selectedIds, isActive: false })}
              >
                <Archive className="h-4 w-4 mr-2" /> Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkArchiveMutation.isPending}
                onClick={() => bulkArchiveMutation.mutate({ ids: selectedIds, isActive: true })}
              >
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => {
                  if (confirm(`Permanently delete ${selectedIds.length} manufacturing product${selectedIds.length === 1 ? "" : "s"}?`)) {
                    bulkDeleteMutation.mutate({ ids: selectedIds });
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible products"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-left px-3 py-2 font-medium">Details</th>
                <th className="text-left px-3 py-2 font-medium">Master Colour</th>
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-right px-3 py-2 font-medium">Unit Cost</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {listQuery.isLoading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : !products.length ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No manufacturing products found. Import a CSV or add the first product.</td></tr>
              ) : products.map((product) => (
                <tr key={product.id} className={!product.isActive ? "opacity-60" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={selectedIdSet.has(product.id)}
                      onChange={() => toggleSelection(product.id)}
                      aria-label={`Select ${product.description}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{product.sku || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{product.description}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {[product.subGroup, product.uom].filter(Boolean).join(" · ") || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs"><ColourSwatch colour={product.colour} hex={masterColourHexByName.get(product.colour.toLowerCase())} /></td>
                  <td className="px-3 py-2">{product.category ? <Badge variant="secondary">{product.category}</Badge> : "-"}</td>
                  <td className="px-3 py-2 text-right">${Number(product.unitCost || 0).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">
                    <Badge variant={product.isActive ? "default" : "secondary"}>{product.isActive ? "Active" : "Archived"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditItem(product)}><Pencil className="h-4 w-4" /></Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={product.isActive ? "text-muted-foreground" : "text-primary"}
                      onClick={() => {
                        if (product.isActive) {
                          if (confirm(`Archive "${product.description}"? It will be hidden from purchase order product search.`)) archiveProduct(product, false);
                        } else {
                          archiveProduct(product, true);
                        }
                      }}
                      title={product.isActive ? "Archive product" : "Restore product"}
                    >
                      {product.isActive ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm(`Permanently delete "${product.description}"?`)) {
                          deleteMutation.mutate({ id: product.id });
                        }
                      }}
                      title="Delete product"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Manufacturing Product</DialogTitle></DialogHeader>
          {editItem && (
            <ProductForm
              initial={editItem}
              colourOptions={masterColourOptions}
              loading={updateMutation.isPending}
              onSubmit={(data) => updateMutation.mutate({ id: editItem.id, ...data })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductForm({
  initial,
  colourOptions,
  loading,
  onSubmit,
}: {
  initial?: Partial<ManufacturingProduct>;
  colourOptions: ColourOption[];
  loading: boolean;
  onSubmit: (data: typeof BLANK_PRODUCT) => void;
}) {
  const [form, setForm] = useState({ ...BLANK_PRODUCT, ...initial });
  const availableColours = useMemo(() => buildColourOptions(
    colourOptions.map((colour) => ({ key: colour.detail, value: colour.value, metadata: colour.hex ? { hex: colour.hex } : undefined })),
    form.colour,
  ), [colourOptions, form.colour]);
  const selectedColour = availableColours.find((colour) => colour.value === form.colour);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Code</Label>
          <Input value={form.sku || ""} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="e.g. AL-BEAM-001" />
        </div>
        <div>
          <Label>Unit Cost</Label>
          <Input type="number" step="0.01" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: Number(event.target.value || 0) })} />
        </div>
      </div>
      <div>
        <Label>Description *</Label>
        <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Input value={form.category || ""} onChange={(event) => setForm({ ...form, category: event.target.value })} />
        </div>
        <div>
          <Label>Style / Sub-Group</Label>
          <Input value={form.subGroup || ""} onChange={(event) => setForm({ ...form, subGroup: event.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>UOM</Label>
          <Input value={form.uom || ""} onChange={(event) => setForm({ ...form, uom: event.target.value })} placeholder="ea" />
        </div>
        <div>
          <Label>Master Colour</Label>
          <Select
            value={form.colour || "__none__"}
            onValueChange={(value) => setForm({ ...form, colour: value === "__none__" ? "" : value })}
            disabled={!availableColours.length}
          >
            <SelectTrigger>
              <SelectValue placeholder={availableColours.length ? "Select colour" : "No master colours configured"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No colour</SelectItem>
              {availableColours.map((colour) => (
                <SelectItem key={`${colour.fromMaster ? "master" : "legacy"}-${colour.value}`} value={colour.value}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full border border-border shadow-sm"
                      style={colour.hex ? { backgroundColor: colour.hex } : colourStyle(colour.value)}
                    />
                    <span>{colour.value}</span>
                    {colour.detail && <span className="text-xs text-muted-foreground">({colour.detail})</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Colours are managed in Admin &gt; Data &amp; Pricing &gt; Sales Data &gt; General &gt; Colours.
          </p>
          {selectedColour && !selectedColour.fromMaster && (
            <p className="mt-1 text-xs text-amber-700">
              This imported colour is not in the master colour list yet.
            </p>
          )}
        </div>
      </div>
      {initial && (
        <div className="flex items-center gap-2">
          <Switch checked={form.isActive} onCheckedChange={(value) => setForm({ ...form, isActive: value })} />
          <Label>Active</Label>
        </div>
      )}
      <Button className="w-full" disabled={loading || !form.description.trim()} onClick={() => onSubmit(form)}>
        {loading ? "Saving..." : initial ? "Update Product" : "Add Product"}
      </Button>
    </div>
  );
}
