/**
 * Unified User Management Page
 * - Lists all users (from OAuth login) + Design Advisors (manually added)
 * - Add/edit/archive users
 * - Assign permission groups (roles)
 * - Design Adviser flag replaces the separate Design Advisors page
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Users, Shield, Clock, Plus, Pencil, Archive, ArchiveRestore, UserCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { ROLE_LABELS, type UserRole } from "@shared/const";

// ─── Permission Audit Log Sub-Component ──────────────────────────────────────
function PermissionAuditLog() {
  const { data: auditLogs, isLoading } = trpc.userManagement.getAuditLog.useQuery({ limit: 100, offset: 0 });

  const ACTION_LABELS: Record<string, string> = {
    permission_change: "Permission Change",
    role_change: "Role Change",
  };

  const FIELD_LABELS: Record<string, string> = {
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
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">Loading audit log...</p>
        </CardContent>
      </Card>
    );
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
            <p className="text-xs mt-1">Changes to user roles and permissions will appear here.</p>
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

export default function UserSettings() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const utils = trpc.useUtils();

  // System users (from OAuth)
  const { data: users, isLoading: usersLoading } = trpc.userManagement.list.useQuery();
  const { data: roles } = trpc.userManagement.getRoles.useQuery();

  // Design Advisors (manually managed)
  const { data: advisors, isLoading: advisorsLoading } = trpc.designAdvisors.list.useQuery({ includeArchived: true });

  const updateRoleMut = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.userManagement.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const updatePermsMut = trpc.userManagement.updatePermissions.useMutation({
    onSuccess: () => { toast.success("Permissions updated"); utils.userManagement.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const createAdvisorMut = trpc.designAdvisors.create.useMutation({
    onSuccess: () => { toast.success("User added"); utils.designAdvisors.list.invalidate(); closeDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const updateAdvisorMut = trpc.designAdvisors.update.useMutation({
    onSuccess: () => { toast.success("User updated"); utils.designAdvisors.list.invalidate(); closeDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteAdvisorMut = trpc.designAdvisors.delete.useMutation({
    onSuccess: () => { toast.success("User deleted"); utils.designAdvisors.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "design_adviser", branchId: "" });
  const { data: branchesList } = trpc.branches.list.useQuery();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  function startRoleEdit(userId: number, currentRole: string) {
    setEditingRole(userId);
    setPendingRole(currentRole);
  }

  function saveRole(userId: number) {
    updateRoleMut.mutate({ userId, role: pendingRole as any });
    setEditingRole(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditId(null);
    setForm({ name: "", email: "", phone: "", role: "design_adviser", branchId: "" });
  }

  function openNewUser() {
    setEditId(null);
    setForm({ name: "", email: "", phone: "", role: "design_adviser", branchId: "" });
    setDialogOpen(true);
  }

  function openEditUser(advisor: any) {
    setEditId(advisor.id);
    setForm({ name: advisor.name, email: advisor.email || "", phone: advisor.phone || "", role: advisor.role || "design_adviser", branchId: advisor.branchId ? String(advisor.branchId) : "" });
    setDialogOpen(true);
  }

  function handleSaveUser() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload = { ...form, branchId: form.branchId ? Number(form.branchId) : null };
    if (editId) {
      updateAdvisorMut.mutate({ id: editId, ...payload });
    } else {
      createAdvisorMut.mutate(payload);
    }
  }

  function toggleArchive(advisor: any) {
    updateAdvisorMut.mutate({ id: advisor.id, archived: !advisor.archived });
  }

  const roleColorMap: Record<string, string> = {
    super_admin: "bg-red-100 text-red-700 border-red-200",
    admin: "bg-orange-100 text-orange-700 border-orange-200",
    design_adviser: "bg-blue-100 text-blue-700 border-blue-200",
    office_user: "bg-green-100 text-green-700 border-green-200",
    construction_user: "bg-purple-100 text-purple-700 border-purple-200",
    user: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const allActive = advisors?.filter((a) => !a.archived) || [];
  const activeAdvisors = roleFilter === "all" ? allActive : allActive.filter((a) => a.role === roleFilter);
  const archivedAdvisors = advisors?.filter((a) => a.archived) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5" /> User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage system users, team members, and permission groups.
          </p>
        </div>
        <Button size="sm" onClick={openNewUser}>
          <Plus className="h-4 w-4 mr-1" /> Add User
        </Button>
      </div>

      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">
            <Shield className="h-3.5 w-3.5 mr-1" /> System Users ({users?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="team">
            <UserCheck className="h-3.5 w-3.5 mr-1" /> Team Members ({activeAdvisors.length})
          </TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="audit-log">
            <Clock className="h-3.5 w-3.5 mr-1" /> Audit Log
          </TabsTrigger>
        </TabsList>

        {/* System Users Tab - users who have logged in via OAuth */}
        <TabsContent value="system" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Logged-in Users</CardTitle>
              <p className="text-xs text-muted-foreground">Users who have signed in via the system. Assign roles to control access.</p>
            </CardHeader>
            <CardContent>
              {usersLoading && <p className="text-sm text-muted-foreground">Loading users...</p>}
              {!usersLoading && users && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Last Active</th>
                        {isSuperAdmin && <th className="pb-2 font-medium text-center">Supervisor</th>}
                        {isSuperAdmin && <th className="pb-2 font-medium text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users.map((u: any) => (
                        <tr key={u.id} className="hover:bg-muted/30">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                                {u.name?.charAt(0)?.toUpperCase() || "?"}
                              </div>
                              <span className="font-medium">{u.name || "Unnamed"}</span>
                              {u.id === currentUser?.id && (
                                <Badge variant="outline" className="text-[10px] h-4">You</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{u.email || "—"}</td>
                          <td className="py-2.5">
                            {editingRole === u.id ? (
                              <div className="flex gap-1 items-center">
                                <Select value={pendingRole} onValueChange={setPendingRole}>
                                  <SelectTrigger className="w-[180px] h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(roles || []).map((r: any) => (
                                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button size="sm" className="h-7 text-xs" onClick={() => saveRole(u.id)} disabled={updateRoleMut.isPending}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingRole(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <Badge variant="outline" className={`text-xs ${roleColorMap[u.role] || roleColorMap.user}`}>
                                {ROLE_LABELS[u.role as UserRole] || u.role}
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 text-muted-foreground text-xs">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "Never"}
                            </div>
                          </td>
                          {isSuperAdmin && (
                            <td className="py-2.5">
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5">
                                  <Switch
                                    className="h-4 w-7"
                                    checked={!!u.canViewAllQuotes}
                                    onCheckedChange={(checked) => updatePermsMut.mutate({ userId: u.id, canViewAllQuotes: checked })}
                                    disabled={u.id === currentUser?.id}
                                  />
                                  <span className="text-[10px] text-muted-foreground">Quotes</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Switch
                                    className="h-4 w-7"
                                    checked={!!u.canViewAllLeads}
                                    onCheckedChange={(checked) => updatePermsMut.mutate({ userId: u.id, canViewAllLeads: checked })}
                                    disabled={u.id === currentUser?.id}
                                  />
                                  <span className="text-[10px] text-muted-foreground">Leads</span>
                                </div>
                              </div>
                            </td>
                          )}
                          {isSuperAdmin && (
                            <td className="py-2.5 text-right">
                              {editingRole !== u.id && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startRoleEdit(u.id, u.role)} disabled={u.id === currentUser?.id}>
                                  Change Role
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Members Tab - manually managed (replaces Design Advisors) */}
        <TabsContent value="team" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Team Members / Design Advisers</CardTitle>
                  <p className="text-xs text-muted-foreground">Manually added team members. These appear in Design Adviser dropdowns across the system.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="show-archived" className="text-xs text-muted-foreground">Show archived</Label>
                  <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Role filter pills */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[{ value: "all", label: "All" }, { value: "design_adviser", label: "Design Adviser" }, { value: "office_user", label: "Office User" }, { value: "construction_user", label: "Construction" }, { value: "driver", label: "Driver" }, { value: "warehouse", label: "Warehouse" }, { value: "admin", label: "Admin" }, { value: "super_admin", label: "Super Admin" }].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRoleFilter(opt.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      roleFilter === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                    {opt.value !== "all" && (
                      <span className="ml-1 opacity-70">({allActive.filter(a => a.role === opt.value).length})</span>
                    )}
                  </button>
                ))}
              </div>

              {advisorsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {activeAdvisors.length === 0 && !advisorsLoading && (
                <p className="text-sm text-muted-foreground italic">
                  {roleFilter === "all" ? 'No team members yet. Click "Add User" above to create one.' : `No team members with this role.`}
                </p>
              )}
              <div className="space-y-2">
                {activeAdvisors.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-medium text-sm">{a.name}</p>
                        <Badge variant="outline" className={`text-[10px] ${roleColorMap[a.role] || roleColorMap.design_adviser}`}>
                          {ROLE_LABELS[a.role as UserRole] || a.role}
                        </Badge>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground ml-9">
                        {a.email && <span>{a.email}</span>}
                        {a.phone && <span>{a.phone}</span>}
                        {a.branchId && branchesList && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {branchesList.find((b: any) => b.id === a.branchId)?.name || "Branch"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditUser(a)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleArchive(a)} title="Archive">
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {showArchived && archivedAdvisors.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Archived</p>
                  <div className="space-y-2">
                    {archivedAdvisors.map((a) => (
                      <div key={a.id} className="flex items-center justify-between border rounded-md p-3 opacity-60">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                              {a.name.charAt(0).toUpperCase()}
                            </div>
                            <p className="font-medium text-sm">{a.name}</p>
                            <Badge variant="secondary" className="text-[10px]">Archived</Badge>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground ml-9">
                            {a.email && <span>{a.email}</span>}
                            {a.phone && <span>{a.phone}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleArchive(a)} title="Restore">
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value="permissions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Permission Matrix</CardTitle>
              <p className="text-xs text-muted-foreground">Reference guide showing what each role can access.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left font-medium">Permission</th>
                      <th className="pb-2 text-center font-medium">Super Admin</th>
                      <th className="pb-2 text-center font-medium">Admin</th>
                      <th className="pb-2 text-center font-medium">Design Adviser</th>
                      <th className="pb-2 text-center font-medium">Office User</th>
                      <th className="pb-2 text-center font-medium">Construction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[
                      { label: "View/Create/Edit Quotes", roles: ["super_admin", "admin", "design_adviser", "office_user", "construction_user"] },
                      { label: "Job Financials", roles: ["super_admin", "admin", "office_user", "construction_user"] },
                      { label: "CRM / Leads", roles: ["super_admin", "admin", "design_adviser", "office_user"] },
                      { label: "Proposals", roles: ["super_admin", "admin", "design_adviser", "office_user"] },
                      { label: "SMS / Communications", roles: ["super_admin", "admin", "design_adviser", "office_user"] },
                      { label: "Email Templates", roles: ["super_admin", "admin", "office_user"] },
                      { label: "Analytics", roles: ["super_admin", "admin", "office_user"] },
                      { label: "Sales Data / Settings", roles: ["super_admin", "admin"] },
                      { label: "User Management", roles: ["super_admin"] },
                    ].map((perm) => (
                      <tr key={perm.label}>
                        <td className="py-1.5 font-medium">{perm.label}</td>
                        {["super_admin", "admin", "design_adviser", "office_user", "construction_user"].map((role) => (
                          <td key={role} className="py-1.5 text-center">
                            {perm.roles.includes(role) ? (
                              <span className="text-green-600 font-bold">✓</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit-log" className="mt-4">
          <PermissionAuditLog />
        </TabsContent>
      </Tabs>

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
          </DialogHeader>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No branch assigned</SelectItem>
                  {(branchesList || []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSaveUser} disabled={createAdvisorMut.isPending || updateAdvisorMut.isPending}>
              {editId ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) { deleteAdvisorMut.mutate({ id: deleteTarget.id }); setDeleteTarget(null); } }}
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
