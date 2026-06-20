import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Phone, Mail, User, Plus, Trash2, CheckCircle2, Clock, Loader2, Pencil, Users, UserCircle } from "lucide-react";
import { toast } from "sonner";

interface ContactsSectionProps {
  jobId: number;
  assignments: Array<{
    id: number;
    installerId: number;
    role: string | null;
    confirmedAt: any;
    installer: {
      id: number;
      name: string;
      phone: string | null;
      email: string | null;
      tradeType: string;
      abn: string | null;
      emergencyContact: string | null;
      emergencyPhone: string | null;
    } | null;
  }>;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  siteAddress?: string | null;
  onRefetch: () => void;
}

export default function ContactsSection({
  jobId, assignments, clientName, clientPhone, clientEmail, siteAddress, onRefetch,
}: ContactsSectionProps) {
  const [showAssign, setShowAssign] = useState(false);
  const [selectedInstaller, setSelectedInstaller] = useState("");
  const [selectedRole, setSelectedRole] = useState("installer");

  // Portal Staff Contacts state
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [staffForm, setStaffForm] = useState({
    staffId: null as number | null,
    name: "",
    role: "",
    phone: "",
    email: "",
    profileDescription: "",
    photoUrl: "",
  });

  const installersQuery = trpc.construction.installers.list.useQuery(undefined, { enabled: showAssign });
  const assignMutation = trpc.construction.assignments.assign.useMutation({
    onSuccess: () => { toast.success("Trade assigned"); setShowAssign(false); setSelectedInstaller(""); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unassignMutation = trpc.construction.assignments.unassign.useMutation({
    onSuccess: () => { toast.success("Trade removed"); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Portal contacts queries
  const portalContactsQuery = trpc.adminPortal.listContacts.useQuery({ jobId });
  const staffListQuery = trpc.designAdvisors.list.useQuery({ includeArchived: false, includePendingInvites: true });
  const upsertContactMut = trpc.adminPortal.upsertContact.useMutation({
    onSuccess: () => {
      toast.success(editingContact ? "Contact updated" : "Staff contact added");
      portalContactsQuery.refetch();
      closeStaffDialog();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteContactMut = trpc.adminPortal.deleteContact.useMutation({
    onSuccess: () => { toast.success("Contact removed"); portalContactsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const assignedIds = new Set(assignments.map(a => a.installerId));
  const availableInstallers = (installersQuery.data || []).filter(i => !assignedIds.has(i.id));

  function openAddStaffContact() {
    setEditingContact(null);
    setStaffForm({ staffId: null, name: "", role: "", phone: "", email: "", profileDescription: "", photoUrl: "" });
    setStaffDialogOpen(true);
  }

  function openEditStaffContact(contact: any) {
    setEditingContact(contact);
    setStaffForm({
      staffId: contact.staffId || null,
      name: contact.name,
      role: contact.role,
      phone: contact.phone || "",
      email: contact.email || "",
      profileDescription: contact.profileDescription || "",
      photoUrl: contact.photoUrl || "",
    });
    setStaffDialogOpen(true);
  }

  function closeStaffDialog() {
    setStaffDialogOpen(false);
    setEditingContact(null);
    setStaffForm({ staffId: null, name: "", role: "", phone: "", email: "", profileDescription: "", photoUrl: "" });
  }

  function handleSelectStaff(staffIdStr: string) {
    if (staffIdStr === "custom") {
      setStaffForm({ staffId: null, name: "", role: "", phone: "", email: "", profileDescription: "", photoUrl: "" });
      return;
    }
    const staffId = Number(staffIdStr);
    const staff = staffListQuery.data?.find(s => s.id === staffId);
    if (staff) {
      setStaffForm({
        staffId: staff.id,
        name: staff.name,
        role: staff.role === "design_adviser" ? "Design Adviser" :
              staff.role === "super_admin" ? "Director" :
              staff.role === "construction_user" ? "Construction Manager" :
              staff.role === "office_user" ? "Office Manager" :
              staff.role || "",
        phone: staff.phone || "",
        email: staff.email || "",
        profileDescription: staff.profileDescription || "",
        photoUrl: staff.photoUrl || "",
      });
    }
  }

  function handleSaveStaffContact() {
    if (!staffForm.name.trim()) { toast.error("Name is required"); return; }
    if (!staffForm.role.trim()) { toast.error("Role title is required"); return; }
    upsertContactMut.mutate({
      id: editingContact?.id,
      constructionJobId: jobId,
      staffId: staffForm.staffId,
      name: staffForm.name,
      role: staffForm.role,
      phone: staffForm.phone || undefined,
      email: staffForm.email || undefined,
      profileDescription: staffForm.profileDescription || undefined,
      photoUrl: staffForm.photoUrl || undefined,
      sortOrder: editingContact?.sortOrder || (portalContactsQuery.data?.length || 0),
    });
  }

  const portalContacts = portalContactsQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Client Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-blue-500" />
            Client Contact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{clientName}</p>
            </div>
            {clientPhone && (
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <a href={`tel:${clientPhone}`} className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {clientPhone}
                </a>
              </div>
            )}
            {clientEmail && (
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <a href={`mailto:${clientEmail}`} className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {clientEmail}
                </a>
              </div>
            )}
            {siteAddress && (
              <div>
                <p className="text-sm text-muted-foreground">Site Address</p>
                <p className="font-medium">{siteAddress}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Portal Staff Contacts - visible to client in Client Portal */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Portal Staff Contacts ({portalContacts.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                These contacts are visible to the client in their Client Portal.
              </p>
            </div>
            <Button size="sm" onClick={openAddStaffContact}>
              <Plus className="h-4 w-4 mr-1" /> Add Staff
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {portalContacts.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No staff contacts assigned to this job's Client Portal yet.
            </p>
          )}
          {portalContacts.map((contact: any) => (
            <div key={contact.id} className="border rounded-lg p-4 flex flex-col sm:flex-row gap-3">
              {/* Photo */}
              <div className="shrink-0">
                {contact.photoUrl ? (
                  <img src={contact.photoUrl} alt={contact.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <UserCircle className="h-7 w-7 text-emerald-600" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{contact.name}</span>
                  <Badge variant="outline" className="text-xs">{contact.role}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="hover:text-blue-600 flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="hover:text-blue-600 flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" /> {contact.email}
                    </a>
                  )}
                </div>
                {contact.profileDescription && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic border-l-2 border-emerald-200 pl-2">
                    {contact.profileDescription}
                  </p>
                )}
              </div>
              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEditStaffContact(contact)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Remove ${contact.name} from portal contacts?`)) {
                      deleteContactMut.mutate({ id: contact.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Assigned Trades */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Assigned Trades ({assignments.length})</CardTitle>
            <Button size="sm" onClick={() => setShowAssign(!showAssign)}>
              <Plus className="h-4 w-4 mr-1" /> Assign Trade
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Assign form */}
          {showAssign && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Select value={selectedInstaller} onValueChange={setSelectedInstaller}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a trade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableInstallers.map(i => (
                        <SelectItem key={i.id} value={String(i.id)}>
                          {i.name} — {i.tradeType}
                        </SelectItem>
                      ))}
                      {availableInstallers.length === 0 && (
                        <SelectItem value="__none" disabled>No available trades</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="installer">Installer</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="electrician">Electrician</SelectItem>
                    <SelectItem value="plumber">Plumber</SelectItem>
                    <SelectItem value="roofer">Roofer</SelectItem>
                    <SelectItem value="labourer">Labourer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!selectedInstaller || assignMutation.isPending}
                  onClick={() => assignMutation.mutate({ jobId, installerId: Number(selectedInstaller), role: selectedRole })}
                >
                  {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Assign
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Trade cards */}
          {assignments.length === 0 && !showAssign && (
            <p className="text-sm text-muted-foreground py-4 text-center">No trades assigned to this job yet.</p>
          )}
          {assignments.map(a => {
            const inst = a.installer;
            if (!inst) return null;
            return (
              <div key={a.id} className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{inst.name}</span>
                    <Badge variant="outline" className="text-xs">{inst.tradeType}</Badge>
                    {a.role && a.role !== "installer" && (
                      <Badge variant="secondary" className="text-xs capitalize">{a.role}</Badge>
                    )}
                    {a.confirmedAt ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Confirmed
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                        <Clock className="h-3 w-3 mr-0.5" /> Pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                    {inst.phone && (
                      <a href={`tel:${inst.phone}`} className="hover:text-blue-600 flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {inst.phone}
                      </a>
                    )}
                    {inst.email && (
                      <a href={`mailto:${inst.email}`} className="hover:text-blue-600 flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {inst.email}
                      </a>
                    )}
                    {inst.abn && <span>ABN: {inst.abn}</span>}
                  </div>
                  {inst.emergencyContact && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Emergency: {inst.emergencyContact} {inst.emergencyPhone && `(${inst.emergencyPhone})`}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => {
                    if (confirm(`Remove ${inst.name} from this job?`)) {
                      unassignMutation.mutate({ id: a.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Staff Contact Dialog */}
      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Staff Contact" : "Add Staff Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Staff selector - only for new contacts */}
            {!editingContact && (
              <div>
                <Label>Select from Team</Label>
                <Select
                  value={staffForm.staffId ? String(staffForm.staffId) : "custom"}
                  onValueChange={handleSelectStaff}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team member or enter custom..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">— Enter manually —</SelectItem>
                    {(staffListQuery.data || []).map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.role === "design_adviser" ? "Design Adviser" :
                          s.role === "super_admin" ? "Director" :
                          s.role === "construction_user" ? "Construction" :
                          s.role === "office_user" ? "Office" : s.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Selecting a team member pre-fills their details. You can customise below.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={staffForm.name}
                  onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Tony Commisso"
                />
              </div>
              <div>
                <Label>Role Title *</Label>
                <Input
                  value={staffForm.role}
                  onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="e.g. Accounts Manager"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input
                  value={staffForm.phone}
                  onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. 0413 438 138"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={staffForm.email}
                  onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="e.g. tony@company.com"
                />
              </div>
            </div>

            <div>
              <Label>Profile / When to Contact</Label>
              <Textarea
                value={staffForm.profileDescription}
                onChange={e => setStaffForm(f => ({ ...f, profileDescription: e.target.value }))}
                placeholder="e.g. Tony is your contact point for invoicing and payment matters."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This description is shown to the client in the portal to help them know when to contact this person.
              </p>
            </div>

            <div>
              <Label>Photo URL</Label>
              <Input
                value={staffForm.photoUrl}
                onChange={e => setStaffForm(f => ({ ...f, photoUrl: e.target.value }))}
                placeholder="https://... (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeStaffDialog}>Cancel</Button>
            <Button onClick={handleSaveStaffContact} disabled={upsertContactMut.isPending}>
              {upsertContactMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingContact ? "Update" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
