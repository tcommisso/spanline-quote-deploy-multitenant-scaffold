/**
 * Unified People Management Page
 * Consolidates Trades + User Settings + System Users into one admin page.
 * Tabs: All People | Staff | Trades | System Users | Permissions | Audit Log
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users, UserCheck, Wrench, Shield, Clock, Plus, Pencil, Trash2,
  Archive, ArchiveRestore, Search, MessageSquare, Bell, Loader2,
  BarChart3, UserCog, Link2, Unlink, Upload,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { PERMISSION_LABELS, ROLE_LABELS, type PermissionKey, type UserRole } from "@shared/const";
import { formatDistanceToNow } from "date-fns";

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true });
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TRADE_TYPE_OPTIONS = [
  { value: "installer", label: "Installer" },
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "roofer", label: "Roofer" },
  { value: "carpenter", label: "Carpenter" },
  { value: "concreter", label: "Concreter" },
  { value: "painter", label: "Painter" },
  { value: "tiler", label: "Tiler" },
  { value: "fencer", label: "Fencer" },
  { value: "labourer", label: "Labourer" },
  { value: "other", label: "Other" },
] as const;

function getTradeTypeLabel(value: string) {
  return TRADE_TYPE_OPTIONS.find(o => o.value === value)?.label || value;
}

const roleColorMap: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700 border-red-200",
  admin: "bg-orange-100 text-orange-700 border-orange-200",
  design_adviser: "bg-blue-100 text-blue-700 border-blue-200",
  office_user: "bg-green-100 text-green-700 border-green-200",
  construction_user: "bg-purple-100 text-purple-700 border-purple-200",
  user: "bg-gray-100 text-gray-600 border-gray-200",
};

const personTypeBadge: Record<string, { label: string; className: string }> = {
  staff: { label: "Staff", className: "bg-blue-50 text-blue-700 border-blue-200" },
  trade: { label: "Trade", className: "bg-amber-50 text-amber-700 border-amber-200" },
  system: { label: "System", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminPeople() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const utils = trpc.useUtils();

  const PEOPLE_TABS = ["all", "staff", "trades", "system", "permissions", "audit", "invitations"];
  const [activeTab, setActiveTab] = useState("all");
  const swipeRef = useSwipeTabs({
    tabs: PEOPLE_TABS,
    activeTab,
    onTabChange: (tab) => { setActiveTab(tab); setSelectedTradeIds([]); },
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Unified people search
  const typeFilter = activeTab === "all" ? "all" : activeTab === "staff" ? "staff" : activeTab === "trades" ? "trade" : activeTab === "system" ? "system" : undefined;
  const { data: people, isLoading: peopleLoading } = trpc.people.search.useQuery({
    query: searchQuery || undefined,
    type: typeFilter as any,
    limit: 200,
  });
  const { data: counts } = trpc.people.counts.useQuery();

  // Existing mutations for staff (design_advisors)
  const createAdvisorMut = trpc.designAdvisors.create.useMutation({
    onSuccess: () => { toast.success("Staff member added"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.designAdvisors.list.invalidate(); closeAddDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const updateAdvisorMut = trpc.designAdvisors.update.useMutation({
    onSuccess: () => { toast.success("Staff member updated"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.designAdvisors.list.invalidate(); closeEditDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteAdvisorMut = trpc.designAdvisors.delete.useMutation({
    onSuccess: () => { toast.success("Staff member deleted"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.designAdvisors.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  // Existing mutations for trades (construction_installers)
  const createInstallerMut = trpc.construction.installers.create.useMutation({
    onSuccess: () => { toast.success("Trade added"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.construction.installers.list.invalidate(); closeAddDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const updateInstallerMut = trpc.construction.installers.update.useMutation({
    onSuccess: () => { toast.success("Trade updated"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.construction.installers.list.invalidate(); closeEditDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteInstallerMut = trpc.construction.installers.delete.useMutation({
    onSuccess: () => { toast.success("Trade removed"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.construction.installers.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  // System user mutations
  const { data: roles } = trpc.userManagement.getRoles.useQuery();
  const updateRoleMut = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.people.search.invalidate(); utils.userManagement.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const updatePermsMut = trpc.userManagement.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissions updated");
      utils.people.search.invalidate();
      utils.userManagement.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Impersonation
  const impersonateMut = trpc.userManagement.startImpersonation.useMutation({
    onSuccess: (data) => {
      toast.success(`Now impersonating ${data.targetUser.name}`);
      // Reload the page to pick up the impersonation cookie
      setTimeout(() => window.location.reload(), 500);
    },
    onError: (err) => toast.error(err.message),
  });

  // Link Account (staff → system user)
  const { data: systemUsers } = trpc.userManagement.list.useQuery();
  const linkToUserMut = trpc.designAdvisors.linkToUser.useMutation({
    onSuccess: () => { toast.success("Account linked"); utils.people.search.invalidate(); utils.designAdvisors.list.invalidate(); setLinkTarget(null); },
    onError: (err) => toast.error(err.message),
  });
  const linkTradeToUserMut = trpc.people.linkTradeToUser.useMutation({
    onSuccess: () => { toast.success("Trade account link updated"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.userManagement.list.invalidate(); setTradeLinkTarget(null); },
    onError: (err) => toast.error(err.message),
  });
  const [linkTarget, setLinkTarget] = useState<{ id: number; name: string; currentUserId: number | null } | null>(null);
  const [tradeLinkTarget, setTradeLinkTarget] = useState<{ id: number; name: string; currentUserId: number | null } | null>(null);
  const [linkSearch, setLinkSearch] = useState("");

  // System user edit/delete/merge
  const [editUserDialog, setEditUserDialog] = useState<{ id: number; name: string; email: string | null; role: string } | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: "", email: "", role: "user" });
  const [deleteUserTarget, setDeleteUserTarget] = useState<{ id: number; name: string } | null>(null);
  const [mergeDialog, setMergeDialog] = useState(false);
  const [mergePrimary, setMergePrimary] = useState<number | null>(null);
  const [mergeSecondary, setMergeSecondary] = useState<number | null>(null);

  const updateUserMut = trpc.people.updateUser.useMutation({
    onSuccess: () => { toast.success("User updated"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.userManagement.list.invalidate(); setEditUserDialog(null); },
    onError: (err) => toast.error(err.message),
  });
  const deleteUserMut = trpc.people.deleteUser.useMutation({
    onSuccess: () => { toast.success("User deleted"); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.userManagement.list.invalidate(); setDeleteUserTarget(null); },
    onError: (err) => toast.error(err.message),
  });
  const mergeAccountsMut = trpc.people.mergeAccounts.useMutation({
    onSuccess: (data) => { toast.success(`Merged ${data.secondaryName} into ${data.primaryName} (${data.reassigned} refs)`); utils.people.search.invalidate(); utils.people.counts.invalidate(); utils.userManagement.list.invalidate(); setMergeDialog(false); setMergePrimary(null); setMergeSecondary(null); },
    onError: (err) => toast.error(err.message),
  });

  function openEditUser(person: any) {
    setEditUserForm({ name: person.name || "", email: person.email || "", role: person.role || "user" });
    setEditUserDialog({ id: person.id, name: person.name, email: person.email, role: person.role });
  }

  // Bulk SMS/Email for trades
  const [selectedTradeIds, setSelectedTradeIds] = useState<number[]>([]);
  const [showBulkSms, setShowBulkSms] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const bulkSms = trpc.construction.bulkNotify.sendSms.useMutation({
    onSuccess: (data: any) => { toast.success(`SMS sent to ${data.sent} trade(s)`); setSelectedTradeIds([]); setShowBulkSms(false); },
  });
  const bulkEmail = trpc.construction.bulkNotify.sendEmail.useMutation({
    onSuccess: (data: any) => { toast.success(`Email sent to ${data.sent} trade(s)`); setSelectedTradeIds([]); setShowBulkEmail(false); },
  });

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addType, setAddType] = useState<"staff" | "trade">("staff");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPerson, setEditPerson] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; personType: string } | null>(null);

  // Role editing for system users
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");

  // Staff form state
  const [staffForm, setStaffForm] = useState({ name: "", email: "", phone: "", role: "design_adviser", branchId: "" });
  const { data: branchesList } = trpc.branches.list.useQuery();

  // Trade form state
  const [tradeForm, setTradeForm] = useState({ name: "", phone: "", email: "", tradeType: "installer" });

  // Show archived
  const [showArchived, setShowArchived] = useState(false);

  function closeAddDialog() {
    setAddDialogOpen(false);
    setStaffForm({ name: "", email: "", phone: "", role: "design_adviser", branchId: "" });
    setTradeForm({ name: "", phone: "", email: "", tradeType: "installer" });
  }

  function closeEditDialog() {
    setEditDialogOpen(false);
    setEditPerson(null);
  }

  function openEdit(person: any) {
    setEditPerson(person);
    if (person.personType === "staff") {
      setStaffForm({
        name: person.name,
        email: person.email || "",
        phone: person.phone || "",
        role: person.role || "design_adviser",
        branchId: person.branchId ? String(person.branchId) : "",
      });
    } else if (person.personType === "trade") {
      setTradeForm({
        name: person.name,
        phone: person.phone || "",
        email: person.email || "",
        tradeType: person.tradeType || "installer",
      });
    }
    setEditDialogOpen(true);
  }

  function handleSaveStaff() {
    if (!staffForm.name.trim()) { toast.error("Name is required"); return; }
    const payload = { ...staffForm, branchId: staffForm.branchId ? Number(staffForm.branchId) : null };
    if (editPerson) {
      updateAdvisorMut.mutate({ id: editPerson.id, ...payload });
    } else {
      createAdvisorMut.mutate(payload);
    }
  }

  function handleSaveTrade() {
    if (!tradeForm.name.trim()) { toast.error("Name is required"); return; }
    if (editPerson) {
      updateInstallerMut.mutate({
        id: editPerson.id,
        name: tradeForm.name,
        phone: tradeForm.phone || undefined,
        email: tradeForm.email || undefined,
        tradeType: tradeForm.tradeType as any,
      });
    } else {
      createInstallerMut.mutate({
        name: tradeForm.name,
        phone: tradeForm.phone || undefined,
        email: tradeForm.email || undefined,
        tradeType: tradeForm.tradeType as any,
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.personType === "staff") {
      deleteAdvisorMut.mutate({ id: deleteTarget.id });
    } else if (deleteTarget.personType === "trade") {
      deleteInstallerMut.mutate({ id: deleteTarget.id });
    }
    setDeleteTarget(null);
  }

  // Filter displayed people
  const displayedPeople = useMemo(() => {
    if (!people) return [];
    if (showArchived) return people;
    return people.filter(p => p.active && !p.archived);
  }, [people, showArchived]);

  const tradesList = useMemo(() => {
    return displayedPeople.filter(p => p.personType === "trade");
  }, [displayedPeople]);

  const totalCount = (counts?.staff || 0) + (counts?.trades || 0) + (counts?.system || 0);

  function updateSystemPermission(person: any, field: "canViewAllQuotes" | "canViewAllLeads", checked: boolean) {
    if (field === "canViewAllQuotes") {
      updatePermsMut.mutate({ userId: person.id, canViewAllQuotes: checked });
    } else {
      updatePermsMut.mutate({ userId: person.id, canViewAllLeads: checked });
    }
  }

  function renderSystemPermissionControls(person: any, layout: "mobile" | "desktop") {
    if (!isSuperAdmin || person.personType !== "system") return null;
    const disabled = person.id === currentUser?.id || updatePermsMut.isPending;
    const controls = [
      { field: "canViewAllQuotes" as const, label: "All quotes", checked: !!person.canViewAllQuotes },
      { field: "canViewAllLeads" as const, label: "All leads", checked: !!person.canViewAllLeads },
    ];

    if (layout === "mobile") {
      return (
        <div className="rounded-md border bg-muted/20 p-2 mb-2">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">Supervisor permissions</p>
          <div className="grid gap-2">
            {controls.map((control) => (
              <div key={control.field} className="flex items-center justify-between gap-3 rounded-md bg-background px-2 py-1.5">
                <span className="text-xs font-medium">{control.label}</span>
                <Switch
                  className="h-5 w-9 shrink-0"
                  checked={control.checked}
                  onCheckedChange={(checked) => updateSystemPermission(person, control.field, checked)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-1">
        {controls.map((control) => (
          <div key={control.field} className="flex items-center gap-1.5">
            <Switch
              className="h-4 w-7"
              checked={control.checked}
              onCheckedChange={(checked) => updateSystemPermission(person, control.field, checked)}
              disabled={disabled}
            />
            <span className="text-[10px] text-muted-foreground">{control.label.replace("All ", "")}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" /> People
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all staff, trades, and system users in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk actions for trades */}
          {selectedTradeIds.length > 0 && (
            <>
              <Badge variant="secondary" className="text-xs">{selectedTradeIds.length} selected</Badge>
              <Button variant="outline" size="sm" onClick={() => setShowBulkSms(true)}>
                <MessageSquare className="h-4 w-4 mr-1" /> SMS
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBulkEmail(true)}>
                <Bell className="h-4 w-4 mr-1" /> Email
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTradeIds([])}>Clear</Button>
            </>
          )}
          <Button size="sm" onClick={() => { setActiveTab("invitations"); setSelectedTradeIds([]); }}>
            <Plus className="h-4 w-4 mr-1" /> Invite Access
          </Button>
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => setMergeDialog(true)}>
              <Users className="h-4 w-4 mr-1" /> Merge Accounts
            </Button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <div ref={swipeRef}>
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedTradeIds([]); }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="w-full overflow-x-auto pb-1 sm:w-auto">
            <TabsList className="inline-flex h-auto min-w-max flex-nowrap">
              <TabsTrigger value="all">
                All ({totalCount})
              </TabsTrigger>
              <TabsTrigger value="staff">
                <UserCheck className="h-3.5 w-3.5 mr-1" /> Staff ({counts?.staff || 0})
              </TabsTrigger>
              <TabsTrigger value="trades">
                <Wrench className="h-3.5 w-3.5 mr-1" /> Trades ({counts?.trades || 0})
              </TabsTrigger>
              <TabsTrigger value="system">
                <Shield className="h-3.5 w-3.5 mr-1" /> System Users ({counts?.system || 0})
              </TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="audit">
                <Clock className="h-3.5 w-3.5 mr-1" /> Audit Log
              </TabsTrigger>
              <TabsTrigger value="invitations">
                <Link2 className="h-3.5 w-3.5 mr-1" /> Invitations
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="show-archived" className="text-xs text-muted-foreground">Show archived/inactive</Label>
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          </div>
        </div>

        {/* All People / Staff / Trades tabs share the same people list */}
        {["all", "staff", "trades", "system"].map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4">
            {/* Trade Performance Metrics Summary (only on trades tab) */}
            {tabValue === "trades" && <TradePerformanceMetrics />}

            {peopleLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>
                ))}
              </div>
            ) : displayedPeople.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No people found{searchQuery ? ` matching "${searchQuery}"` : ""}.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Select all trades button when on trades tab */}
                {tabValue === "trades" && tradesList.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedTradeIds.length === tradesList.length) {
                          setSelectedTradeIds([]);
                        } else {
                          setSelectedTradeIds(tradesList.map(t => t.id));
                        }
                      }}
                    >
                      {selectedTradeIds.length === tradesList.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                )}

                {/* Mobile Card Layout (below md) */}
                <div className="md:hidden space-y-2">
                  {displayedPeople.map((person) => {
                    const isTrade = person.personType === "trade";
                    const isStaff = person.personType === "staff";
                    const isSystem = person.personType === "system";
                    const badge = personTypeBadge[person.personType];
                    const isSelected = isTrade && selectedTradeIds.includes(person.id);

                    return (
                      <div key={`mobile-${person.personType}-${person.id}`} className={`border rounded-lg p-3 ${isSelected ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
                        {/* Header row: avatar, name, badges */}
                        <div className="flex items-center gap-2 mb-2">
                          {(tabValue === "trades" || tabValue === "all") && isTrade && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setSelectedTradeIds(prev =>
                                  checked ? [...prev, person.id] : prev.filter(id => id !== person.id)
                                );
                              }}
                            />
                          )}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                            isTrade ? "bg-amber-100 text-amber-700" : isSystem ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {person.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate">{person.name}</span>
                              {isSystem && person.id === currentUser?.id && (
                                <Badge variant="outline" className="text-[10px] h-4">You</Badge>
                              )}
                            </div>
                          </div>
                          {/* Status badge */}
                          {person.archived ? (
                            <Badge variant="secondary" className="text-[10px] shrink-0">Archived</Badge>
                          ) : !person.active ? (
                            <Badge variant="secondary" className="text-[10px] shrink-0">Inactive</Badge>
                          ) : (
                            <Badge variant="default" className="text-[10px] bg-green-100 text-green-700 border-green-200 hover:bg-green-100 shrink-0">Active</Badge>
                          )}
                        </div>

                        {/* Details row */}
                        <div className="flex flex-wrap gap-1.5 mb-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                            {badge.label}
                          </Badge>
                          {isTrade && (
                            <Badge variant="outline" className="text-[10px]">{getTradeTypeLabel(person.tradeType || "installer")}</Badge>
                          )}
                          {isTrade && person.userId && (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">System</Badge>
                          )}
                          {(isStaff || isSystem) && person.role && (
                            <Badge variant="outline" className={`text-[10px] ${roleColorMap[person.role] || roleColorMap.user}`}>
                              {ROLE_LABELS[person.role as UserRole] || person.role}
                            </Badge>
                          )}
                        </div>

                        {/* Contact info */}
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground mb-2">
                          {person.email && <span className="truncate">{person.email}</span>}
                          {person.phone && <span>{person.phone}</span>}
                        </div>

                        {renderSystemPermissionControls(person, "mobile")}

                        {/* Role editing (inline) */}
                        {isSystem && editingRole === person.id && (
                          <div className="flex gap-1 items-center mb-2 flex-wrap">
                            <Select value={pendingRole} onValueChange={setPendingRole}>
                              <SelectTrigger className="w-[140px] h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(roles || []).map((r: any) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-6 text-xs px-2" onClick={() => { updateRoleMut.mutate({ userId: person.id, role: pendingRole as any }); setEditingRole(null); }}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingRole(null)}>Cancel</Button>
                          </div>
                        )}

                        {/* Actions row */}
                        <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
                          {isSystem && isSuperAdmin && editingRole !== person.id && person.id !== currentUser?.id && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingRole(person.id); setPendingRole(person.role || "user"); }}>
                              Change Role
                            </Button>
                          )}
                          {isSystem && isSuperAdmin && person.id !== currentUser?.id && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => {
                              impersonateMut.mutate({ userId: person.id });
                            }} disabled={impersonateMut.isPending}>
                              <UserCog className="h-3.5 w-3.5 mr-1" />
                              Impersonate
                            </Button>
                          )}
                          {(isStaff || isTrade) && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(person)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                              </Button>
                              {isStaff && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                                  updateAdvisorMut.mutate({ id: person.id, archived: !person.archived });
                                }}>
                                  {person.archived ? <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
                                  {person.archived ? "Restore" : "Archive"}
                                </Button>
                              )}
                              {isTrade && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                                  updateInstallerMut.mutate({ id: person.id, active: !person.active });
                                }}>
                                  {person.active ? <Archive className="h-3.5 w-3.5 mr-1" /> : <ArchiveRestore className="h-3.5 w-3.5 mr-1" />}
                                  {person.active ? "Deactivate" : "Activate"}
                                </Button>
                              )}
                              {isTrade && isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 text-xs ${person.userId ? "text-green-600" : ""}`}
                                  onClick={() => setTradeLinkTarget({ id: person.id, name: person.name, currentUserId: person.userId })}
                                >
                                  {person.userId ? <Link2 className="h-3.5 w-3.5 mr-1" /> : <Unlink className="h-3.5 w-3.5 mr-1" />}
                                  {person.userId ? "Linked" : "Link User"}
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setDeleteTarget({ id: person.id, name: person.name, personType: person.personType })}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table Layout (md and above) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        {(tabValue === "trades" || tabValue === "all") && <th className="pb-2 w-8"></th>}
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Role / Trade</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Phone</th>
                        <th className="pb-2 font-medium">Status</th>
                        {(tabValue === "system" || tabValue === "all") && <th className="pb-2 font-medium">Last Active</th>}
                        {tabValue === "system" && isSuperAdmin && <th className="pb-2 font-medium text-center">Permissions</th>}
                        <th className="pb-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {displayedPeople.map((person) => {
                        const isTrade = person.personType === "trade";
                        const isStaff = person.personType === "staff";
                        const isSystem = person.personType === "system";
                        const badge = personTypeBadge[person.personType];
                        const isSelected = isTrade && selectedTradeIds.includes(person.id);

                        return (
                          <tr key={`${person.personType}-${person.id}`} className={`hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`}>
                            {(tabValue === "trades" || tabValue === "all") && (
                              <td className="py-2.5">
                                {isTrade && (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      setSelectedTradeIds(prev =>
                                        checked ? [...prev, person.id] : prev.filter(id => id !== person.id)
                                      );
                                    }}
                                  />
                                )}
                              </td>
                            )}
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                                  isTrade ? "bg-amber-100 text-amber-700" : isSystem ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {person.name?.charAt(0)?.toUpperCase() || "?"}
                                </div>
                                <span className="font-medium">{person.name}</span>
                                {isSystem && person.id === currentUser?.id && (
                                  <Badge variant="outline" className="text-[10px] h-4">You</Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5">
                              <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                                {badge.label}
                              </Badge>
                            </td>
                            <td className="py-2.5">
                              {isSystem && editingRole === person.id ? (
                                <div className="flex gap-1 items-center">
                                  <Select value={pendingRole} onValueChange={setPendingRole}>
                                    <SelectTrigger className="w-[160px] h-7 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(roles || []).map((r: any) => (
                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button size="sm" className="h-6 text-xs px-2" onClick={() => { updateRoleMut.mutate({ userId: person.id, role: pendingRole as any }); setEditingRole(null); }}>Save</Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingRole(null)}>Cancel</Button>
                                </div>
                              ) : (
                                <>
                                  {isTrade && (
                                    <Badge variant="outline" className="text-[10px]">{getTradeTypeLabel(person.tradeType || "installer")}</Badge>
                                  )}
                                  {isTrade && person.userId && (
                                    <Badge variant="outline" className="ml-1 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">System</Badge>
                                  )}
                                  {(isStaff || isSystem) && person.role && (
                                    <Badge variant="outline" className={`text-[10px] ${roleColorMap[person.role] || roleColorMap.user}`}>
                                      {ROLE_LABELS[person.role as UserRole] || person.role}
                                    </Badge>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="py-2.5 text-muted-foreground text-xs">{person.email || "—"}</td>
                            <td className="py-2.5 text-muted-foreground text-xs">{person.phone || "—"}</td>
                            <td className="py-2.5">
                              {person.archived ? (
                                <Badge variant="secondary" className="text-[10px]">Archived</Badge>
                              ) : !person.active ? (
                                <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                              ) : (
                                <Badge variant="default" className="text-[10px] bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Active</Badge>
                              )}
                            </td>
                            {(tabValue === "system" || tabValue === "all") && (
                              <td className="py-2.5 text-xs text-muted-foreground">
                                {isSystem && person.lastSignedIn ? formatRelativeTime(person.lastSignedIn) : "—"}
                              </td>
                            )}
                            {tabValue === "system" && isSuperAdmin && (
                              <td className="py-2.5">
                                {renderSystemPermissionControls(person, "desktop")}
                              </td>
                            )}
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isSystem && isSuperAdmin && editingRole !== person.id && person.id !== currentUser?.id && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingRole(person.id); setPendingRole(person.role || "user"); }} title="Change Role">
                                    Change Role
                                  </Button>
                                )}
                                {isSystem && isSuperAdmin && person.id !== currentUser?.id && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => {
                                    impersonateMut.mutate({ userId: person.id });
                                  }} disabled={impersonateMut.isPending} title="Impersonate this user">
                                    <UserCog className="h-3.5 w-3.5 mr-1" />
                                    Impersonate
                                  </Button>
                                )}
                                {isSystem && isSuperAdmin && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditUser(person)} title="Edit User">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {isSystem && isSuperAdmin && person.id !== currentUser?.id && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteUserTarget({ id: person.id, name: person.name })} title="Delete User">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {(isStaff || isTrade) && (
                                  <>
                                    {isStaff && isSuperAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-7 w-7 ${person.userId ? "text-green-600" : "text-muted-foreground"}`}
                                        onClick={() => setLinkTarget({ id: person.id, name: person.name, currentUserId: person.userId })}
                                        title={person.userId ? `Linked to user #${person.userId}` : "Link to system user account"}
                                      >
                                        {person.userId ? <Link2 className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                                      </Button>
                                    )}
                                    {isTrade && isSuperAdmin && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-7 w-7 ${person.userId ? "text-green-600" : "text-muted-foreground"}`}
                                        onClick={() => setTradeLinkTarget({ id: person.id, name: person.name, currentUserId: person.userId })}
                                        title={person.userId ? `Linked to user #${person.userId}` : "Link trade to system user account"}
                                      >
                                        {person.userId ? <Link2 className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(person)} title="Edit">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {isStaff && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                        updateAdvisorMut.mutate({ id: person.id, archived: !person.archived });
                                      }} title={person.archived ? "Restore" : "Archive"}>
                                        {person.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                      </Button>
                                    )}
                                    {isTrade && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                        updateInstallerMut.mutate({ id: person.id, active: !person.active });
                                      }} title={person.active ? "Deactivate" : "Activate"}>
                                        {person.active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget({ id: person.id, name: person.name, personType: person.personType })} title="Delete">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        ))}

        {/* Permissions Tab */}
        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrix />
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4">
          <PermissionAuditLog />
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations" className="mt-4">
          <InvitationsManager />
        </TabsContent>
      </Tabs>
      </div>

      {/* ─── Add Person Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {addType === "staff" ? "Staff Member" : "Trade"}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setAddType("staff")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                addType === "staff" ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-muted/50 text-muted-foreground border-border"
              }`}
            >
              <UserCheck className="h-3 w-3 inline mr-1" /> Staff Member
            </button>
            <button
              onClick={() => setAddType("trade")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                addType === "trade" ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-muted/50 text-muted-foreground border-border"
              }`}
            >
              <Wrench className="h-3 w-3 inline mr-1" /> Trade
            </button>
          </div>

          {addType === "staff" ? (
            <StaffForm form={staffForm} setForm={setStaffForm} branchesList={branchesList} />
          ) : (
            <TradeForm form={tradeForm} setForm={setTradeForm} />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeAddDialog}>Cancel</Button>
            <Button
              onClick={addType === "staff" ? handleSaveStaff : handleSaveTrade}
              disabled={createAdvisorMut.isPending || createInstallerMut.isPending}
            >
              {addType === "staff"
                ? (createAdvisorMut.isPending ? "Adding..." : "Add Staff")
                : (createInstallerMut.isPending ? "Adding..." : "Add Trade")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Person Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editPerson?.personType === "staff" ? "Staff Member" : "Trade"}</DialogTitle>
          </DialogHeader>
          {editPerson?.personType === "staff" ? (
            <StaffForm form={staffForm} setForm={setStaffForm} branchesList={branchesList} />
          ) : (
            <TradeForm form={tradeForm} setForm={setTradeForm} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>Cancel</Button>
            <Button
              onClick={editPerson?.personType === "staff" ? handleSaveStaff : handleSaveTrade}
              disabled={updateAdvisorMut.isPending || updateInstallerMut.isPending}
            >
              {updateAdvisorMut.isPending || updateInstallerMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.personType === "staff" ? "Staff Member" : "Trade"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk SMS Dialog ─── */}
      <BulkSmsDialog
        open={showBulkSms}
        onOpenChange={setShowBulkSms}
        selectedCount={selectedTradeIds.length}
        onSend={(message) => bulkSms.mutate({ installerIds: selectedTradeIds, message })}
        loading={bulkSms.isPending}
      />

      {/* ─── Bulk Email Dialog ─── */}
      <BulkEmailDialog
        open={showBulkEmail}
        onOpenChange={setShowBulkEmail}
        selectedCount={selectedTradeIds.length}
        onSend={(subject, message) => bulkEmail.mutate({ installerIds: selectedTradeIds, subject, message })}
        loading={bulkEmail.isPending}
      />

      {/* ─── Link Account Dialog ─── */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => { if (!open) { setLinkTarget(null); setLinkSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Account: {linkTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Link this staff member to a system user account so they can access the DA Portal.
          </p>
          {linkTarget?.currentUserId && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
              <Link2 className="h-4 w-4 text-green-600" />
              <span>Currently linked to: <strong>{systemUsers?.find(u => u.id === linkTarget.currentUserId)?.name || `User #${linkTarget.currentUserId}`}</strong></span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 text-xs text-destructive"
                onClick={() => linkToUserMut.mutate({ designAdvisorId: linkTarget.id, userId: null })}
                disabled={linkToUserMut.isPending}
              >
                <Unlink className="h-3 w-3 mr-1" /> Unlink
              </Button>
            </div>
          )}
          <div className="space-y-2">
            <Label>Search system users</Label>
            <Input
              placeholder="Type name or email..."
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto border rounded divide-y">
              {(systemUsers || []).filter(u => {
                if (!linkSearch.trim()) return true;
                const q = linkSearch.toLowerCase();
                return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              }).map(u => (
                <button
                  key={u.id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between ${
                    linkTarget?.currentUserId === u.id ? "bg-green-50" : ""
                  }`}
                  onClick={() => linkToUserMut.mutate({ designAdvisorId: linkTarget!.id, userId: u.id })}
                  disabled={linkToUserMut.isPending}
                >
                  <div>
                    <span className="font-medium">{u.name || "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                  </div>
                  {linkTarget?.currentUserId === u.id && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                </button>
              ))}
              {systemUsers && systemUsers.filter(u => {
                if (!linkSearch.trim()) return true;
                const q = linkSearch.toLowerCase();
                return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              }).length === 0 && (
                <p className="p-3 text-sm text-muted-foreground text-center">No matching users found</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkTarget(null); setLinkSearch(""); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Link Trade Account Dialog ─── */}
      <Dialog open={!!tradeLinkTarget} onOpenChange={(open) => { if (!open) { setTradeLinkTarget(null); setLinkSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Trade: {tradeLinkTarget?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Link this trade to a system user email. The trade keeps using the Trade Portal link flow, and the linked system account is no longer shown as a duplicate row.
          </p>
          {tradeLinkTarget?.currentUserId && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
              <Link2 className="h-4 w-4 text-green-600" />
              <span>Currently linked to: <strong>{systemUsers?.find(u => u.id === tradeLinkTarget.currentUserId)?.name || `User #${tradeLinkTarget.currentUserId}`}</strong></span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 text-xs text-destructive"
                onClick={() => linkTradeToUserMut.mutate({ installerId: tradeLinkTarget.id, userId: null })}
                disabled={linkTradeToUserMut.isPending}
              >
                <Unlink className="h-3 w-3 mr-1" /> Unlink
              </Button>
            </div>
          )}
          <div className="space-y-2">
            <Label>Search system users</Label>
            <Input
              placeholder="Type name or email..."
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto border rounded divide-y">
              {(systemUsers || []).filter(u => {
                if (!linkSearch.trim()) return true;
                const q = linkSearch.toLowerCase();
                return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              }).map(u => (
                <button
                  key={u.id}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between ${
                    tradeLinkTarget?.currentUserId === u.id ? "bg-green-50" : ""
                  }`}
                  onClick={() => linkTradeToUserMut.mutate({ installerId: tradeLinkTarget!.id, userId: u.id })}
                  disabled={linkTradeToUserMut.isPending}
                >
                  <div>
                    <span className="font-medium">{u.name || "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                  </div>
                  {tradeLinkTarget?.currentUserId === u.id && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
                </button>
              ))}
              {systemUsers && systemUsers.filter(u => {
                if (!linkSearch.trim()) return true;
                const q = linkSearch.toLowerCase();
                return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              }).length === 0 && (
                <p className="p-3 text-sm text-muted-foreground text-center">No matching users found</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTradeLinkTarget(null); setLinkSearch(""); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit System User Dialog ─── */}
      <Dialog open={!!editUserDialog} onOpenChange={(open) => { if (!open) setEditUserDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User: {editUserDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Name *</Label>
              <Input
                value={editUserForm.name}
                onChange={(e) => setEditUserForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Email</Label>
              <Input
                type="email"
                value={editUserForm.email}
                onChange={(e) => setEditUserForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Role</Label>
              <Select value={editUserForm.role} onValueChange={(v) => setEditUserForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editUserForm.name.trim()) { toast.error("Name is required"); return; }
                updateUserMut.mutate({
                  id: editUserDialog!.id,
                  name: editUserForm.name.trim(),
                  email: editUserForm.email.trim() || null,
                });
              }}
              disabled={updateUserMut.isPending}
            >
              {updateUserMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete System User Confirmation ─── */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={() => setDeleteUserTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteUserTarget?.name}</strong>? This will only succeed if the user has no data references. If they have data, use Merge Accounts instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteUserTarget) deleteUserMut.mutate({ id: deleteUserTarget.id }); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Merge Accounts Dialog ─── */}
      <Dialog open={mergeDialog} onOpenChange={(open) => { if (!open) { setMergeDialog(false); setMergePrimary(null); setMergeSecondary(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge Accounts</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select two system user accounts. All data from the secondary account will be reassigned to the primary, then the secondary account will be deleted.
          </p>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Primary Account (keep)</Label>
              <Select value={mergePrimary ? String(mergePrimary) : ""} onValueChange={(v) => setMergePrimary(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select primary account..." /></SelectTrigger>
                <SelectContent>
                  {(systemUsers || []).filter(u => u.id !== mergeSecondary).map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name || "Unnamed"} — {u.email || "no email"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Secondary Account (delete after merge)</Label>
              <Select value={mergeSecondary ? String(mergeSecondary) : ""} onValueChange={(v) => setMergeSecondary(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select secondary account..." /></SelectTrigger>
                <SelectContent>
                  {(systemUsers || []).filter(u => u.id !== mergePrimary).map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name || "Unnamed"} — {u.email || "no email"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mergePrimary && mergeSecondary && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                <strong>Warning:</strong> All data from <em>{systemUsers?.find(u => u.id === mergeSecondary)?.name}</em> will be transferred to <em>{systemUsers?.find(u => u.id === mergePrimary)?.name}</em>, and the secondary account will be permanently deleted. This cannot be undone.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMergeDialog(false); setMergePrimary(null); setMergeSecondary(null); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!mergePrimary || !mergeSecondary) { toast.error("Select both accounts"); return; }
                mergeAccountsMut.mutate({ primaryId: mergePrimary, secondaryId: mergeSecondary });
              }}
              disabled={!mergePrimary || !mergeSecondary || mergeAccountsMut.isPending}
            >
              {mergeAccountsMut.isPending ? "Merging..." : "Merge Accounts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Trade Performance Metrics ──────────────────────────────────────────────

function TradePerformanceMetrics() {
  const { data: metrics, isLoading } = trpc.people.tradeMetrics.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (!metrics || metrics.length === 0) return null;

  // Aggregate summary
  const totalJobs = metrics.reduce((sum, m) => sum + m.totalJobs, 0);
  const totalCompleted = metrics.reduce((sum, m) => sum + m.completed, 0);
  const totalInProgress = metrics.reduce((sum, m) => sum + m.inProgress, 0);
  const avgCompletionRate = metrics.length > 0
    ? Math.round(metrics.reduce((sum, m) => sum + m.completionRate, 0) / metrics.length)
    : 0;

  // Top performers (by completion rate, min 1 job)
  const topPerformers = [...metrics]
    .filter(m => m.totalJobs > 0)
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5);

  return (
    <div className="space-y-4 mb-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Total Assignments</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-700">{totalCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">In Progress</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-700">{totalInProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Avg Completion Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-purple-700">{avgCompletionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Performers</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {topPerformers.map((tp) => (
                <div key={tp.installerId} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5">
                  <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold">
                    {tp.name.charAt(0)}
                  </div>
                  <div>
                    <span className="text-xs font-medium">{tp.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {tp.completed}/{tp.totalJobs} jobs ({tp.completionRate}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StaffForm({ form, setForm, branchesList }: {
  form: { name: string; email: string; phone: string; role: string; branchId: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  branchesList: any;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Name *</Label>
        <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
      </div>
      <div>
        <Label className="text-xs font-medium">Email</Label>
        <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
      </div>
      <div>
        <Label className="text-xs font-medium">Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="04xx xxx xxx" />
      </div>
      <div>
        <Label className="text-xs font-medium">Role</Label>
        <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="design_adviser">Design Adviser</SelectItem>
            <SelectItem value="office_user">Office User</SelectItem>
            <SelectItem value="construction_user">Construction User</SelectItem>
            <SelectItem value="driver">Driver</SelectItem>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs font-medium">Branch</Label>
        <Select value={form.branchId || "none"} onValueChange={(v) => setForm(f => ({ ...f, branchId: v === "none" ? "" : v }))}>
          <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No branch assigned</SelectItem>
            {(branchesList || []).map((b: any) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TradeForm({ form, setForm }: {
  form: { name: string; phone: string; email: string; tradeType: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Name *</Label>
        <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mike Johnson" />
      </div>
      <div>
        <Label className="text-xs font-medium">Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 0412 345 678" />
      </div>
      <div>
        <Label className="text-xs font-medium">Email</Label>
        <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. mike@example.com" />
      </div>
      <div>
        <Label className="text-xs font-medium">Trade Type *</Label>
        <Select value={form.tradeType} onValueChange={(v) => setForm(f => ({ ...f, tradeType: v }))}>
          <SelectTrigger><SelectValue placeholder="Select trade type" /></SelectTrigger>
          <SelectContent>
            {TRADE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function PermissionsMatrix() {
  const utils = trpc.useUtils();
  const { data: matrix, isLoading } = trpc.userManagement.permissionMatrix.useQuery();
  const updatePermission = trpc.userManagement.updatePermissionOverride.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.userManagement.permissionMatrix.invalidate(),
        utils.userManagement.myPermissions.invalidate(),
      ]);
      toast.success("Permission updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const roles = matrix?.roles ?? [];
  const permissions = matrix?.permissions ?? [];
  const effective = (matrix?.effective ?? {}) as Partial<Record<UserRole, Partial<Record<PermissionKey, boolean>>>>;
  const defaults = (matrix?.defaults ?? {}) as Partial<Record<UserRole, Partial<Record<PermissionKey, boolean>>>>;

  const overrideLookup = useMemo(() => {
    const lookup = new Set<string>();
    for (const role of roles) {
      for (const permission of permissions) {
        const roleKey = role.role as UserRole;
        const permissionKey = permission.key as PermissionKey;
        if (Boolean(effective[roleKey]?.[permissionKey]) !== Boolean(defaults[roleKey]?.[permissionKey])) {
          lookup.add(`${role.role}:${permission.key}`);
        }
      }
    }
    return lookup;
  }, [defaults, effective, permissions, roles]);

  const togglePermission = (role: string, permissionKey: string, allowed: boolean) => {
    updatePermission.mutate({
      role: role as UserRole,
      permissionKey: permissionKey as PermissionKey,
      allowed,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Permission Matrix</CardTitle>
          <p className="text-xs text-muted-foreground">Loading tenant permissions...</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Permission Matrix</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tenant-level role permissions. Changed switches are saved as overrides; matching the default removes the override.
            </p>
          </div>
          <Badge variant="outline" className="w-fit text-[10px]">
            {matrix?.tenantId ? `Tenant #${matrix.tenantId}` : "Current tenant"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className="border-b">
                <th className="w-[240px] pb-2 text-left font-medium">Permission</th>
                {roles.map(role => (
                  <th key={role.role} className="pb-2 text-center font-medium">
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {permissions.map(permission => (
                <tr key={permission.key}>
                  <td className="py-2 pr-4">
                    <div className="font-medium">{permission.label}</div>
                    <div className="text-[10px] text-muted-foreground">{permission.key}</div>
                  </td>
                  {roles.map(role => {
                    const checked = Boolean(effective[role.role as UserRole]?.[permission.key as PermissionKey]);
                    const isOverride = overrideLookup.has(`${role.role}:${permission.key}`);
                    return (
                      <td key={`${role.role}-${permission.key}`} className="py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={checked}
                            disabled={role.locked || updatePermission.isPending}
                            onCheckedChange={(next) => togglePermission(role.role, permission.key, next)}
                            aria-label={`${role.label}: ${permission.label}`}
                          />
                          {role.locked ? (
                            <span className="text-[10px] text-muted-foreground">Locked</span>
                          ) : isOverride ? (
                            <span className="text-[10px] font-medium text-primary">Override</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Default</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {roles.map(role => (
            <div key={role.role} className="rounded-lg border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{role.label}</p>
                  <p className="text-[11px] text-muted-foreground">{role.role}</p>
                </div>
                {role.locked && <Badge variant="secondary" className="text-[10px]">Locked</Badge>}
              </div>
              <div className="grid gap-2">
                {permissions.map(permission => {
                  const checked = Boolean(effective[role.role as UserRole]?.[permission.key as PermissionKey]);
                  const isOverride = overrideLookup.has(`${role.role}:${permission.key}`);
                  return (
                    <div key={`${role.role}-${permission.key}`} className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{permission.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {isOverride ? "Override" : "Default"}
                        </p>
                      </div>
                      <Switch
                        className="shrink-0"
                        checked={checked}
                        disabled={role.locked || updatePermission.isPending}
                        onCheckedChange={(next) => togglePermission(role.role, permission.key, next)}
                        aria-label={`${role.label}: ${permission.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          Super Admin is locked on for recovery access. Other role changes affect app tiles, sidebar visibility, and guarded admin routes for this tenant.
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionAuditLog() {
  const { data: auditLogs, isLoading } = trpc.userManagement.getAuditLog.useQuery({ limit: 100, offset: 0 });

  const ACTION_LABELS: Record<string, string> = {
    permission_change: "Permission Change",
    role_change: "Role Change",
    role_permission_change: "Role Permission Change",
  };

  const FIELD_LABELS: Record<string, string> = {
    ...PERMISSION_LABELS,
    canViewAllQuotes: "Can View All Quotes",
    canViewAllLeads: "Can View All Leads",
    role: "User Role",
  };

  function formatValue(field: string, value: string | null | undefined): string {
    if (!value) return "—";
    if (field === "role") {
      const labels: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", design_adviser: "Design Adviser", office_user: "Office User", construction_user: "Construction User", driver: "Driver", warehouse: "Warehouse", user: "User" };
      return labels[value] || value;
    }
    if (value === "true") return "Yes";
    if (value === "false") return "No";
    return value;
  }

  if (isLoading) {
    return <Card><CardContent className="py-8"><p className="text-sm text-muted-foreground text-center">Loading audit log...</p></CardContent></Card>;
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Permission & Role Audit Log</CardTitle>
          <p className="text-xs text-muted-foreground">All permission and role changes are recorded here for accountability.</p>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No audit entries yet.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Permission & Role Audit Log</CardTitle>
        <p className="text-xs text-muted-foreground">All permission and role changes are recorded here for accountability.</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {auditLogs.map((entry: any) => (
            <div key={entry.id} className="flex items-start gap-3 border rounded-md p-3 hover:bg-muted/30 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                entry.action === "role_change" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
              }`}>
                <Shield className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${
                    entry.action === "role_change" ? "border-orange-200 text-orange-700 bg-orange-50" : "border-blue-200 text-blue-700 bg-blue-50"
                  }`}>
                    {ACTION_LABELS[entry.action] || entry.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.adminUserName} changed <strong>{entry.targetUserName}</strong>
                  </span>
                </div>
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">{FIELD_LABELS[entry.field] || entry.field}:</span>{" "}
                  <span className="line-through text-red-500/70">{formatValue(entry.field, entry.oldValue)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium text-green-700">{formatValue(entry.field, entry.newValue)}</span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}
                <br />
                {entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BulkSmsDialog({ open, onOpenChange, selectedCount, onSend, loading }: {
  open: boolean; onOpenChange: (open: boolean) => void; selectedCount: number; onSend: (message: string) => void; loading: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send Bulk SMS</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Sending SMS to <strong>{selectedCount}</strong> selected trade(s). Trades without a phone number will be skipped.</p>
          <div>
            <Label>Message *</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Reminder: you are scheduled for a job this week." rows={4} />
            <p className="text-xs text-muted-foreground mt-1">{message.length} characters</p>
          </div>
          <Button className="w-full" disabled={!message.trim() || loading} onClick={() => onSend(message)}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><MessageSquare className="h-4 w-4 mr-2" /> Send SMS to {selectedCount} Trade(s)</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkEmailDialog({ open, onOpenChange, selectedCount, onSend, loading }: {
  open: boolean; onOpenChange: (open: boolean) => void; selectedCount: number; onSend: (subject: string, message: string) => void; loading: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send Bulk Email</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Sending email to <strong>{selectedCount}</strong> selected trade(s).</p>
          <div>
            <Label>Subject *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Upcoming Job Schedule" />
          </div>
          <div>
            <Label>Message *</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Email body..." rows={4} />
          </div>
          <Button className="w-full" disabled={!subject.trim() || !message.trim() || loading} onClick={() => onSend(subject, message)}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><Bell className="h-4 w-4 mr-2" /> Send Email to {selectedCount} Trade(s)</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ─── Invitations Manager ──────────────────────────────────────────────────────
function InvitationsManager() {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "user" as string, tradeType: "installer", constructionJobId: "" });
  const [bulkInvites, setBulkInvites] = useState<{email:string;name:string;role:string;tradeType?:string;constructionJobId?:number}[]>([]);
  const [bulkError, setBulkError] = useState<string>("");
  const utils = trpc.useUtils();

  const invitationsQuery = trpc.invitations.list.useQuery(
    statusFilter === "all" ? undefined : { status: statusFilter as any }
  );
  const clientPortalAccessQuery = trpc.adminPortal.listPortalAccess.useQuery();
  const tradePortalAccessQuery = trpc.adminTradePortal.listAccess.useQuery();
  const jobsQuery = trpc.adminPortal.listJobs.useQuery(undefined, { enabled: showInviteDialog && inviteForm.role === "client" });
  const createMutation = trpc.invitations.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(data?.type === "client" || data?.type === "trade" ? "Portal login link sent" : "Invitation sent successfully");
      invitationsQuery.refetch();
      utils.adminPortal.listPortalAccess.invalidate();
      utils.adminTradePortal.listAccess.invalidate();
      utils.adminTradePortal.tradesWithoutAccess.invalidate();
      utils.people.search.invalidate();
      utils.people.counts.invalidate();
      setShowInviteDialog(false);
      setInviteForm({ email: "", name: "", role: "user", tradeType: "installer", constructionJobId: "" });
    },
    onError: (err) => toast.error(err.message),
  });
  const revokeMutation = trpc.invitations.revoke.useMutation({
    onSuccess: () => { toast.success("Invitation revoked"); invitationsQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const resendMutation = trpc.invitations.resend.useMutation({
    onSuccess: () => toast.success("Invitation resent"),
    onError: (err) => toast.error(err.message),
  });
  const resendClientPortalMutation = trpc.adminPortal.sendPortalMagicLink.useMutation({
    onSuccess: () => toast.success("Client portal login link sent"),
    onError: (err) => toast.error(err.message),
  });
  const resendTradePortalMutation = trpc.adminTradePortal.regenerateToken.useMutation({
    onSuccess: () => toast.success("Trade portal login link sent"),
    onError: (err) => toast.error(err.message),
  });
  const bulkCreateMutation = trpc.invitations.bulkCreate.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.successCount} of ${data.totalCount} invitations sent`);
      invitationsQuery.refetch();
      utils.adminPortal.listPortalAccess.invalidate();
      utils.adminTradePortal.listAccess.invalidate();
      utils.people.search.invalidate();
      utils.people.counts.invalidate();
      setShowBulkDialog(false);
      setBulkInvites([]);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      // Skip header if it looks like one
      const startIdx = lines[0]?.toLowerCase().includes("email") ? 1 : 0;
      const validRoles = ["user", "admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse", "trade", "client"];
      const parsed: {email:string;name:string;role:string;tradeType?:string;constructionJobId?:number}[] = [];
      const errors: string[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 2) { errors.push(`Row ${i+1}: needs at least email and name`); continue; }
        const [email, name, role, extra] = cols;
        if (!email || !email.includes("@")) { errors.push(`Row ${i+1}: invalid email "${email}"`); continue; }
        if (!name) { errors.push(`Row ${i+1}: name is required`); continue; }
        const finalRole = role && validRoles.includes(role) ? role : "user";
        if (finalRole === "client" && (!extra || Number.isNaN(Number(extra)))) {
          errors.push(`Row ${i+1}: client portal invites need construction job id in column 4`);
          continue;
        }
        parsed.push({
          email,
          name,
          role: finalRole,
          tradeType: finalRole === "trade" ? extra || "installer" : undefined,
          constructionJobId: finalRole === "client" ? Number(extra) : undefined,
        });
      }
      if (errors.length > 0) setBulkError(errors.slice(0, 5).join("; "));
      setBulkInvites(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const roleOptions = [
    { value: "user", label: "Unassigned" },
    { value: "admin", label: "Admin" },
    { value: "design_adviser", label: "Design Adviser" },
    { value: "office_user", label: "Office User" },
    { value: "construction_user", label: "Construction User" },
    { value: "driver", label: "Driver" },
    { value: "warehouse", label: "Warehouse" },
    { value: "trade", label: "Trade Portal" },
    { value: "client", label: "Client Portal" },
  ];

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case "accepted": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Accepted</Badge>;
      case "expired": return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Expired</Badge>;
      case "revoked": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Revoked</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }

  const isPortalInvite = inviteForm.role === "trade" || inviteForm.role === "client";
  const canSendInvite = Boolean(inviteForm.email.trim() && inviteForm.name.trim() && (inviteForm.role !== "client" || inviteForm.constructionJobId));
  const portalAccessRows = [
    ...(tradePortalAccessQuery.data || []).map((access: any) => ({
      id: `trade-${access.id}`,
      rawId: access.id,
      type: "trade" as const,
      name: access.installerName || `Trade #${access.installerId}`,
      email: access.email,
      detail: getTradeTypeLabel(access.installerTradeType || "installer"),
      isActive: access.isActive,
      lastAccessedAt: access.lastAccessedAt,
      createdAt: access.createdAt,
    })),
    ...(clientPortalAccessQuery.data || []).map((access: any) => ({
      id: `client-${access.id}`,
      rawId: access.id,
      type: "client" as const,
      name: access.clientName || "Client",
      email: access.clientEmail,
      detail: `Job #${access.constructionJobId}`,
      isActive: access.isActive,
      lastAccessedAt: access.lastAccessedAt,
      createdAt: access.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowBulkDialog(true)}>
            <Upload className="h-4 w-4 mr-1" /> Bulk CSV
          </Button>
          <Button onClick={() => setShowInviteDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Invite Access
          </Button>
        </div>
      </div>

      {invitationsQuery.isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !invitationsQuery.data?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No invitations found</p>
            <p className="text-sm">Click "Invite Access" to invite staff, trades, or clients</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Role</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Sent</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Expires</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invitationsQuery.data.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/30">
                  <td className="p-3">{inv.name || "—"}</td>
                  <td className="p-3">{inv.email}</td>
                  <td className="p-3 hidden sm:table-cell">
                    <Badge variant="secondary" className="text-xs">
                      {roleOptions.find(r => r.value === inv.role)?.label || inv.role}
                    </Badge>
                  </td>
                  <td className="p-3">{getStatusBadge(inv.status)}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    {inv.status === "pending" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resendMutation.mutate({ id: inv.id })}
                          disabled={resendMutation.isPending}
                        >
                          Resend
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => revokeMutation.mutate({ id: inv.id })}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Portal Access Links</CardTitle>
          <p className="text-sm text-muted-foreground">
            Trades and clients use secure portal login links. They can also request a fresh link from their portal login page.
          </p>
        </CardHeader>
        <CardContent>
          {clientPortalAccessQuery.isLoading || tradePortalAccessQuery.isLoading ? (
            <div className="space-y-2">
              {[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : portalAccessRows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No trade or client portal access has been granted yet.
            </div>
          ) : (
            <div className="space-y-2">
              {portalAccessRows.map((access) => (
                <div key={access.id} className="rounded-lg border p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={access.type === "trade" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-teal-50 text-teal-700 border-teal-200"}>
                          {access.type === "trade" ? "Trade Portal" : "Client Portal"}
                        </Badge>
                        <span className="font-medium">{access.name}</span>
                        {access.isActive ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Disabled</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{access.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {access.detail}
                        {access.lastAccessedAt ? ` - Last login ${formatRelativeTime(access.lastAccessedAt)}` : " - Not logged in yet"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={resendClientPortalMutation.isPending || resendTradePortalMutation.isPending || !access.isActive}
                      onClick={() => {
                        if (access.type === "trade") {
                          resendTradePortalMutation.mutate({ id: access.rawId, origin: window.location.origin });
                        } else {
                          resendClientPortalMutation.mutate({ id: access.rawId, origin: window.location.origin });
                        }
                      }}
                    >
                      Resend Login Link
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk CSV Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Invite via CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with columns: <strong>email, name, role, extra</strong> (role is optional, defaults to "user").
              For trade portal invites, extra can be the trade type. For client portal invites, extra must be the construction job id.
            </p>
            <Input type="file" accept=".csv" onChange={handleCsvUpload} />
            {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}
            {bulkInvites.length > 0 && (
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Role</th>
                      <th className="text-left p-2">Extra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bulkInvites.map((inv, i) => (
                      <tr key={i}>
                        <td className="p-2">{inv.email}</td>
                        <td className="p-2">{inv.name}</td>
                        <td className="p-2">{inv.role}</td>
                        <td className="p-2">{inv.constructionJobId || inv.tradeType || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {bulkInvites.length} invitation{bulkInvites.length !== 1 ? "s" : ""} ready to send
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkDialog(false); setBulkInvites([]); setBulkError(""); }}>Cancel</Button>
            <Button
              onClick={() => bulkCreateMutation.mutate({ invites: bulkInvites as any, origin: window.location.origin })}
              disabled={bulkInvites.length === 0 || bulkCreateMutation.isPending}
            >
              {bulkCreateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : `Send ${bulkInvites.length} Invitations`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={inviteForm.name}
                onChange={(e) => setInviteForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <Label>Access Type</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm(f => ({ ...f, role: v, constructionJobId: v === "client" ? f.constructionJobId : "" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Staff receive an app invitation. Trades and clients receive secure portal login links and can request a fresh link from the relevant portal login page.
              </p>
            </div>
            {inviteForm.role === "trade" && (
              <div>
                <Label>Trade Type</Label>
                <Select value={inviteForm.tradeType} onValueChange={(v) => setInviteForm(f => ({ ...f, tradeType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  This creates or updates the trade record and sends a Trade Portal login link. No Entra guest setup is required.
                </p>
              </div>
            )}
            {inviteForm.role === "client" && (
              <div>
                <Label>Construction Job *</Label>
                <Select value={inviteForm.constructionJobId} onValueChange={(v) => setInviteForm(f => ({ ...f, constructionJobId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select the client's job" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobsQuery.data?.map((job: any) => (
                      <SelectItem key={job.id} value={String(job.id)}>
                        {job.quoteNumber || `Job #${job.id}`} - {job.clientName || "Client"} ({job.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Client portal access is limited to the selected job, including documents, updates, invoices, and messages for that job.
                </p>
              </div>
            )}
            {isPortalInvite && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Portal users are not system users. They cannot access the admin app, and their portal session remains scoped to their trade record or selected client job.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                email: inviteForm.email,
                name: inviteForm.name,
                role: inviteForm.role as any,
                tradeType: inviteForm.role === "trade" ? inviteForm.tradeType as any : undefined,
                constructionJobId: inviteForm.role === "client" ? Number(inviteForm.constructionJobId) : undefined,
                origin: window.location.origin,
              })}
              disabled={!canSendInvite || createMutation.isPending}
            >
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : isPortalInvite ? "Send Portal Link" : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
