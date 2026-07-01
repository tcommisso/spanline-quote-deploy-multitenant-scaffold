import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Pencil, Trash2, Package, Search, Wrench, Upload, Download,
} from "lucide-react";
import { toast } from "sonner";
import { logClientDownload } from "@/lib/userActivity";

const EQUIPMENT_CATEGORIES = [
  "Crane",
  "Scaffold",
  "Excavator",
  "Generator",
  "Compressor",
  "Trailer",
  "Lift",
  "Power Tools",
  "Safety Equipment",
  "Vehicle",
  "Other",
];

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

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseActive(value: string | undefined) {
  if (value == null || !value.trim()) return undefined;
  return !["false", "0", "no", "inactive", "archived"].includes(value.trim().toLowerCase());
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function AdminEquipment() {
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const equipmentQuery = trpc.equipment.list.useQuery();
  const tenantSummaryQuery = trpc.equipment.tenantSummary.useQuery();
  const createMutation = trpc.equipment.create.useMutation({
    onSuccess: () => {
      equipmentQuery.refetch();
      setShowCreate(false);
      toast.success("Equipment created");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.equipment.update.useMutation({
    onSuccess: () => {
      equipmentQuery.refetch();
      setEditItem(null);
      toast.success("Equipment updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.equipment.delete.useMutation({
    onSuccess: () => {
      equipmentQuery.refetch();
      toast.success("Equipment deleted");
    },
    onError: (err) => toast.error(err.message),
  });
  const repairTenantMutation = trpc.equipment.repairTenantAssignments.useMutation({
    onSuccess: (result) => {
      equipmentQuery.refetch();
      tenantSummaryQuery.refetch();
      toast.success(`Repaired ${result.reassigned} equipment record${result.reassigned === 1 ? "" : "s"}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const importMutation = trpc.equipment.importCsvRows.useMutation({
    onSuccess: (result) => {
      equipmentQuery.refetch();
      tenantSummaryQuery.refetch();
      const parts = [
        `${result.created} created`,
        `${result.updated} updated`,
      ];
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      toast.success(`Equipment import complete: ${parts.join(", ")}`);
      if (result.errors?.length) {
        toast.warning(`${result.errors.length} row${result.errors.length === 1 ? "" : "s"} could not be imported`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const items = (equipmentQuery.data || []).filter(
    (e) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.category || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.serialNumber || "").toLowerCase().includes(search.toLowerCase())
  );
  const tenantSummary = tenantSummaryQuery.data;
  const canRepairImportedEquipment = !!tenantSummary && (
    tenantSummary.unassigned > 0 ||
    (tenantSummary.tenancyMode === "single" && tenantSummary.otherTenants > 0)
  );
  const allRows = equipmentQuery.data || [];

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) {
        toast.error("CSV must include a header row and at least one equipment row");
        return;
      }
      const headers = parsed[0].map(normaliseHeader);
      const indexOf = (...names: string[]) => {
        const normalised = names.map(normaliseHeader);
        return headers.findIndex((header) => normalised.includes(header));
      };
      const nameIdx = indexOf("name", "equipment", "equipmentname", "asset", "assetname");
      const categoryIdx = indexOf("category", "type");
      const serialIdx = indexOf("serialnumber", "serial", "serialno", "sn");
      const descriptionIdx = indexOf("description", "notes", "details");
      const activeIdx = indexOf("isactive", "active", "status");
      if (nameIdx < 0) {
        toast.error("CSV needs a Name or Equipment Name column");
        return;
      }
      const rows = parsed.slice(1).map((cols) => ({
        name: cols[nameIdx]?.trim() || "",
        category: categoryIdx >= 0 ? cols[categoryIdx]?.trim() || null : null,
        serialNumber: serialIdx >= 0 ? cols[serialIdx]?.trim() || null : null,
        description: descriptionIdx >= 0 ? cols[descriptionIdx]?.trim() || null : null,
        isActive: activeIdx >= 0 ? parseActive(cols[activeIdx]) : undefined,
      })).filter((row) => row.name);
      if (rows.length === 0) {
        toast.error("No equipment rows found in the CSV");
        return;
      }
      importMutation.mutate({ rows });
    } catch (err: any) {
      toast.error(err?.message || "Could not read equipment CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportEquipment = () => {
    const header = ["name", "category", "serialNumber", "description", "isActive"];
    const rows = allRows.map((item) => [
      item.name,
      item.category || "",
      item.serialNumber || "",
      item.description || "",
      item.isActive ? "true" : "false",
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `equipment-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    logClientDownload({
      filename,
      source: "equipment_export",
      entityType: "equipment",
      mimeType: "text/csv",
      metadata: { rowCount: allRows.length },
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Equipment</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => handleImportFile(event.target.files?.[0] || null)}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {importMutation.isPending ? "Importing..." : "Import CSV"}
          </Button>
          <Button variant="outline" onClick={exportEquipment} disabled={allRows.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button variant="brand"><Plus className="h-4 w-4 mr-2" /> Add Equipment</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Equipment</DialogTitle>
              </DialogHeader>
              <EquipmentForm
                onSubmit={(data) => createMutation.mutate(data)}
                loading={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Equipment List */}
      <div className="grid gap-3">
        {items.length === 0 && !equipmentQuery.isLoading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              {canRepairImportedEquipment ? (
                <div className="space-y-3">
                  <p>
                    Imported equipment exists outside this tenant. Repair the tenant assignment to show it here.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => repairTenantMutation.mutate()}
                    disabled={repairTenantMutation.isPending}
                  >
                    {repairTenantMutation.isPending ? "Repairing..." : "Repair imported equipment"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>No equipment records are available for this tenant.</p>
                  {tenantSummary?.total === 0 && (
                    <p className="text-sm">
                      Production currently has no equipment source rows. Import a CSV or add the first item manually.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {items.map((item) => (
          <Card key={item.id} className={!item.isActive ? "opacity-60" : ""}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wrench className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    {item.category && (
                      <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
                    )}
                    {!item.isActive && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {item.serialNumber && <span>S/N: {item.serialNumber}</span>}
                    {item.description && <span className="truncate max-w-[300px]">{item.description}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditItem(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Delete "${item.name}"? This will also remove all its bookings.`)) {
                      deleteMutation.mutate({ id: item.id });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Equipment</DialogTitle>
          </DialogHeader>
          {editItem && (
            <EquipmentForm
              initial={editItem}
              onSubmit={(data) => updateMutation.mutate({ id: editItem.id, ...data })}
              loading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentForm({
  initial,
  onSubmit,
  loading,
}: {
  initial?: any;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    category: initial?.category || "",
    description: initial?.description || "",
    serialNumber: initial?.serialNumber || "",
    isActive: initial?.isActive ?? true,
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. 10T Mobile Crane"
        />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={form.category || "none"} onValueChange={(v) => setForm({ ...form, category: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Category</SelectItem>
            {EQUIPMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Serial Number</Label>
        <Input
          value={form.serialNumber}
          onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
          placeholder="Optional"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="Optional notes about this equipment"
        />
      </div>
      {initial && (
        <div className="flex items-center gap-2">
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v })}
          />
          <Label>Active</Label>
        </div>
      )}
      <Button
        className="w-full"
        onClick={() => onSubmit(form)}
        disabled={loading || !form.name.trim()}
      >
        {loading ? "Saving..." : initial ? "Update Equipment" : "Add Equipment"}
      </Button>
    </div>
  );
}
