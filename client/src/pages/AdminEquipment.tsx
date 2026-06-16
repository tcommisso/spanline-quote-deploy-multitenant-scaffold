import { useState } from "react";
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
  Plus, Pencil, Trash2, Package, Search, Wrench,
} from "lucide-react";
import { toast } from "sonner";

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

export default function AdminEquipment() {
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");

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

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Equipment</h1>
        </div>
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
                <p>No equipment found. Add your first piece of equipment to get started.</p>
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
