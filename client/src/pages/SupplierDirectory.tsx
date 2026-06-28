import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Building2, Phone, Mail, MapPin, Pencil, Trash2, Package, RefreshCw, Loader2, Tag, X, UserPlus, Star } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";

const CATEGORY_COLORS = ["#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6", "#06B6D4", "#EC4899", "#64748B"];
type SupplierScope = "construction" | "manufacturing";

type SupplierDirectoryProps = {
  supplierScope?: SupplierScope;
};

export default function SupplierDirectory({ supplierScope = "construction" }: SupplierDirectoryProps) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user ? isAdminRole(user.role) : false;
  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<number | "untagged" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [pendingSupplierAction, setPendingSupplierAction] = useState<null | {
    type: "deactivate" | "addTradeUser";
    supplierId: number;
    supplierName: string;
  }>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", abn: "", contactName: "", phone: "", email: "", address: "", category: "", paymentTerms: "", defaultGlCode: "", notes: "", tradePortalFlashingOrdersEnabled: false,
  });

  const suppliersQuery = trpc.suppliers.list.useQuery({
    search: search || undefined,
    activeOnly: !showInactive,
    supplierScope,
  });
  const categoriesQuery = trpc.supplierCategories.list.useQuery();
  const lastSyncQuery = trpc.xeroSupplierSync.getLastSyncInfo.useQuery({ supplierScope });
  const ratingsQuery = trpc.supplierFeedback.allRatings.useQuery();
  const ratingsMap = useMemo(() => {
    const map = new Map<number, { avgOverall: number; totalReviews: number }>();
    (ratingsQuery.data || []).forEach(r => map.set(r.supplierId, r));
    return map;
  }, [ratingsQuery.data]);

  const suppliers = suppliersQuery.data || [];
  const categories = categoriesQuery.data || [];

  // Fetch category assignments for all visible suppliers
  const supplierIds = useMemo(() => suppliers.map(s => s.id), [suppliers]);
  const assignmentsQuery = trpc.supplierCategories.getForSuppliers.useQuery(
    { supplierIds },
    { enabled: supplierIds.length > 0 }
  );
  const categoryAssignments = assignmentsQuery.data || {};

  const syncMutation = trpc.xeroSupplierSync.syncFromXero.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.total} ${supplierScope} suppliers from Xero: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      suppliersQuery.refetch();
      lastSyncQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "Xero sync failed"),
  });
  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: (result) => {
      // Assign selected categories to the new supplier
      if (selectedCategoryIds.length > 0) {
        setCategoriesMutation.mutate({ supplierId: result.id, categoryIds: selectedCategoryIds });
      }
      toast.success("Supplier created");
      suppliersQuery.refetch();
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      // Update category assignments
      if (editingId) {
        setCategoriesMutation.mutate({ supplierId: editingId, categoryIds: selectedCategoryIds });
      }
      toast.success("Supplier updated");
      suppliersQuery.refetch();
      resetForm();
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      toast.success("Supplier deactivated");
      suppliersQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const setCategoriesMutation = trpc.supplierCategories.setForSupplier.useMutation({
    onSuccess: () => {
      assignmentsQuery.refetch();
    },
  });
  const createSupplierCategoryMutation = trpc.supplierCategories.create.useMutation({
    onSuccess: async (result) => {
      const categoryId = Number(result.id);
      toast.success("Category created");
      setNewCategoryName("");
      setSelectedCategoryIds(prev => prev.includes(categoryId) ? prev : [...prev, categoryId]);
      await utils.supplierCategories.list.invalidate();
      await utils.supplierCategories.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message || "Could not create category"),
  });
  const seedDefaultCategoriesMutation = trpc.supplierCategories.seedDefaults.useMutation({
    onSuccess: async (result) => {
      toast.success(result.created > 0 ? `Added ${result.created} trade categories` : "Trade categories are already set up");
      await utils.supplierCategories.list.invalidate();
      await utils.supplierCategories.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message || "Could not add default categories"),
  });
  const addAsTradeUserMut = trpc.suppliers.addAsTradeUser.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.name} added as a Trade User. Portal access granted.`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Filter suppliers by selected category
  const filteredSuppliers = useMemo(() => {
    if (!filterCategoryId) return suppliers;
    if (filterCategoryId === "untagged") {
      return suppliers.filter(s => {
        const cats = categoryAssignments[s.id] || [];
        return cats.length === 0;
      });
    }
    return suppliers.filter(s => {
      const cats = categoryAssignments[s.id] || [];
      return cats.some(c => c.categoryId === filterCategoryId);
    });
  }, [suppliers, filterCategoryId, categoryAssignments]);

  function resetForm() {
    setForm({ name: "", abn: "", contactName: "", phone: "", email: "", address: "", category: "", paymentTerms: "", defaultGlCode: "", notes: "", tradePortalFlashingOrdersEnabled: false });
    setSelectedCategoryIds([]);
  }

  function startEdit(s: typeof suppliers[0]) {
    setForm({
      name: s.name,
      abn: (s as any).abn || "",
      contactName: s.contactName || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      category: s.category || "",
      paymentTerms: (s as any).paymentTerms || "",
      defaultGlCode: (s as any).defaultGlCode || "",
      notes: s.notes || "",
      tradePortalFlashingOrdersEnabled: Boolean((s as any).tradePortalFlashingOrdersEnabled),
    });
    // Load existing category assignments
    const existing = categoryAssignments[s.id] || [];
    setSelectedCategoryIds(existing.map(c => c.categoryId));
    setEditingId(s.id);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
        createMutation.mutate({ ...form, supplierScope });
    }
  }

  function toggleCategory(catId: number) {
    setSelectedCategoryIds(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  }

  function handleCreateSupplierCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("Category name is required");
      return;
    }
    const existing = categories.find(category => category.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      toggleCategory(existing.id);
      setNewCategoryName("");
      return;
    }
    createSupplierCategoryMutation.mutate({ name, color: newCategoryColor });
  }

  function confirmPendingSupplierAction() {
    if (!pendingSupplierAction) return;
    if (pendingSupplierAction.type === "deactivate") {
      deleteMutation.mutate({ id: pendingSupplierAction.supplierId });
    } else {
      addAsTradeUserMut.mutate({ supplierId: pendingSupplierAction.supplierId });
    }
    setPendingSupplierAction(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {supplierScope === "manufacturing" ? "Manufacturing Supplier Directory" : "Construction Supplier Directory"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {supplierScope === "manufacturing"
              ? "Commisso Manufacturing suppliers for inventory and manufacturing purchase orders"
              : "Spanline Home Additions suppliers for construction procurement"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={() => syncMutation.mutate({ supplierScope })} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-2" /> Sync from Xero</>
            )}
          </Button>
          {lastSyncQuery.data?.lastSyncedAt && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Last sync: {new Date(lastSyncQuery.data.lastSyncedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <Dialog open={isCreateOpen || editingId !== null} onOpenChange={(o) => {
          if (!o) { setIsCreateOpen(false); setEditingId(null); resetForm(); }
          else setIsCreateOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button variant="brand" onClick={() => { resetForm(); setIsCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium">Company Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ABC Steel Supplies" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">ABN</label>
                  <Input value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} placeholder="12 345 678 901" />
                </div>
                <div>
                  <label className="text-sm font-medium">Contact Person</label>
                  <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="John Smith" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Categories</label>
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[38px] bg-background">
                  {selectedCategoryIds.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {categories.length === 0 ? "No categories yet. Add one below or load defaults." : "Click to assign..."}
                    </span>
                  )}
                  {selectedCategoryIds.map(catId => {
                    const cat = categories.find(c => c.id === catId);
                    if (!cat) return null;
                    return (
                      <Badge
                        key={catId}
                        variant="outline"
                        className="text-xs cursor-pointer gap-1 pr-1"
                        style={{ borderColor: cat.color || "#6B7280", color: cat.color || "#6B7280" }}
                        onClick={() => toggleCategory(catId)}
                      >
                        {cat.name}
                        <X className="h-3 w-3" />
                      </Badge>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {categories.filter(c => !selectedCategoryIds.includes(c.id)).map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className="text-[11px] px-2 py-0.5 rounded-full border hover:bg-accent transition-colors"
                      style={{ borderColor: cat.color || "#6B7280", color: cat.color || "#6B7280" }}
                    >
                      + {cat.name}
                    </button>
                  ))}
                </div>
                {categories.length === 0 && (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => seedDefaultCategoriesMutation.mutate()}
                      disabled={seedDefaultCategoriesMutation.isPending}
                    >
                      {seedDefaultCategoriesMutation.isPending ? (
                        <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Adding...</>
                      ) : (
                        "Add default trade categories"
                      )}
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateSupplierCategory();
                      }
                    }}
                    placeholder="Create a category..."
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-1">
                    {CATEGORY_COLORS.slice(0, 6).map(color => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Use ${color}`}
                        onClick={() => setNewCategoryColor(color)}
                        className={`h-5 w-5 rounded-full border transition-transform ${newCategoryColor === color ? "scale-110 ring-2 ring-primary ring-offset-1" : "border-border"}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={handleCreateSupplierCategory}
                    disabled={createSupplierCategoryMutation.isPending}
                  >
                    {createSupplierCategoryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0412 345 678" />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sales@supplier.com" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Industrial Ave, Melbourne VIC" />
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="text-sm font-medium">Trade Portal Flashing Orders</label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Allow this supplier's trade portal login to open and submit only their flashing orders for construction review.
                    </p>
                  </div>
                  <Switch
                    checked={form.tradePortalFlashingOrdersEnabled}
                    onCheckedChange={(checked) => setForm({ ...form, tradePortalFlashingOrdersEnabled: checked })}
                    aria-label="Enable flashing orders in trade portal"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Payment Terms</label>
                  <Input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="e.g. Net 30, COD" />
                </div>
                <div>
                  <label className="text-sm font-medium">Default GL Code</label>
                  <Input value={form.defaultGlCode} onChange={(e) => setForm({ ...form, defaultGlCode: e.target.value })} placeholder="e.g. 5-1100" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery info, special instructions, etc." rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditingId(null); resetForm(); }}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Save Changes" : "Add Supplier"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..." className="pl-9" />
        </div>
        <Select
          value={filterCategoryId === null ? "all" : filterCategoryId === "untagged" ? "untagged" : String(filterCategoryId)}
          onValueChange={(val) => {
            if (val === "all") setFilterCategoryId(null);
            else if (val === "untagged") setFilterCategoryId("untagged");
            else setFilterCategoryId(Number(val));
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={String(cat.id)}>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: cat.color || "#6B7280" }} />
                  {cat.name}
                </span>
              </SelectItem>
            ))}
            <SelectItem value="untagged">Untagged</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Hide Inactive" : "Show Inactive"}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{filteredSuppliers.length}</p>
                <p className="text-xs text-muted-foreground">Total Suppliers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier list */}
      {suppliersQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading suppliers...</div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No suppliers found</p>
          <p className="text-sm">Add your first supplier to get started</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((s) => {
            const supplierCats = categoryAssignments[s.id] || [];
            return (
              <Card key={s.id} className={`${!s.isActive ? "opacity-50" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      {s.contactName && <p className="text-sm text-muted-foreground">{s.contactName}</p>}
                      {ratingsMap.has(s.id) && (
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-medium">{ratingsMap.get(s.id)!.avgOverall.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({ratingsMap.get(s.id)!.totalReviews})</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && s.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-500 hover:text-blue-600"
                          title="Add as Trade User"
                          onClick={() => setPendingSupplierAction({
                            type: "addTradeUser",
                            supplierId: s.id,
                            supplierName: s.name,
                          })}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {s.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => setPendingSupplierAction({
                            type: "deactivate",
                            supplierId: s.id,
                            supplierName: s.name,
                          })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Category tags */}
                  {supplierCats.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {supplierCats.map(cat => (
                        <Badge
                          key={cat.categoryId}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                          style={{ borderColor: cat.color || "#6B7280", color: cat.color || "#6B7280" }}
                        >
                          {cat.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" /> {s.phone}
                    </a>
                  )}
                  {s.email && (
                    <a href={`mailto:${s.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                      <Mail className="h-3.5 w-3.5" /> {s.email}
                    </a>
                  )}
                  {s.address && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> {s.address}
                    </p>
                  )}
                  {(s as any).abn && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Package className="h-3.5 w-3.5 shrink-0" /> ABN: {(s as any).abn}
                    </p>
                  )}
                  {(s as any).paymentTerms && (
                    <p className="text-xs text-muted-foreground">Terms: {(s as any).paymentTerms}</p>
                  )}
                  {(s as any).defaultGlCode && (
                    <p className="text-xs text-muted-foreground">GL: {(s as any).defaultGlCode}</p>
                  )}
                  {s.notes && <p className="text-xs text-muted-foreground mt-2 italic">{s.notes}</p>}
                  {(s as any).tradePortalFlashingOrdersEnabled && (
                    <Badge variant="outline" className="text-xs border-blue-300 bg-blue-50 text-blue-700">
                      Trade Portal Flashing Orders
                    </Badge>
                  )}
                  {!s.isActive && <Badge variant="outline" className="text-xs text-red-500 border-red-300">Inactive</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingSupplierAction} onOpenChange={(open) => !open && setPendingSupplierAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingSupplierAction?.type === "deactivate" ? "Deactivate supplier?" : "Add as Trade User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSupplierAction?.type === "deactivate"
                ? `${pendingSupplierAction.supplierName} will be hidden from active supplier lists. You can show inactive suppliers to view it later.`
                : `${pendingSupplierAction?.supplierName} will be added as a Trade User and granted portal access.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingSupplierAction}>
              {pendingSupplierAction?.type === "deactivate" ? "Deactivate" : "Add Trade User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
