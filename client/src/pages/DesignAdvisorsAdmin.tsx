import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, UserCircle } from "lucide-react";

export default function DesignAdvisorsAdmin() {
  const utils = trpc.useUtils();
  const { data: advisors, isLoading } = trpc.designAdvisors.list.useQuery({ includeArchived: true });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "", profileDescription: "", photoUrl: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const createMut = trpc.designAdvisors.create.useMutation({
    onSuccess: () => { toast.success("Team member added"); utils.designAdvisors.list.invalidate(); closeDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.designAdvisors.update.useMutation({
    onSuccess: () => { toast.success("Team member updated"); utils.designAdvisors.list.invalidate(); closeDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.designAdvisors.delete.useMutation({
    onSuccess: () => { toast.success("Team member deleted"); utils.designAdvisors.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditId(null);
    setForm({ name: "", email: "", phone: "", role: "", profileDescription: "", photoUrl: "" });
  }

  function openNew() {
    setEditId(null);
    setForm({ name: "", email: "", phone: "", role: "", profileDescription: "", photoUrl: "" });
    setDialogOpen(true);
  }

  function openEdit(advisor: any) {
    setEditId(advisor.id);
    setForm({
      name: advisor.name,
      email: advisor.email || "",
      phone: advisor.phone || "",
      role: advisor.role || "",
      profileDescription: advisor.profileDescription || "",
      photoUrl: advisor.photoUrl || "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload: any = { ...form };
    if (!payload.photoUrl) payload.photoUrl = null;
    if (!payload.profileDescription) payload.profileDescription = undefined;
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  function toggleArchive(advisor: any) {
    updateMut.mutate({ id: advisor.id, archived: !advisor.archived });
  }

  const active = advisors?.filter((a) => !a.archived) || [];
  const archived = advisors?.filter((a) => a.archived) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Team Members</h1>
        <Button size="sm" variant="brand" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add Member</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {active.length === 0 && !isLoading && <p className="text-sm text-muted-foreground italic">No team members yet. Add one above.</p>}
          <div className="space-y-2">
            {active.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between border rounded-md p-3">
                <div className="flex items-center gap-3">
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt={a.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <UserCircle className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{a.name}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {a.role && <span className="capitalize">{a.role.replace(/_/g, " ")}</span>}
                      {a.email && <span>{a.email}</span>}
                      {a.phone && <span>{a.phone}</span>}
                    </div>
                    {a.profileDescription && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-1">{a.profileDescription}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleArchive(a)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget({ id: a.id, name: a.name })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {archived.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Archived Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {archived.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between border rounded-md p-3 opacity-60">
                  <div className="flex items-center gap-3">
                    {a.photoUrl ? (
                      <img src={a.photoUrl} alt={a.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <UserCircle className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{a.name} <Badge variant="secondary" className="ml-2 text-xs">Archived</Badge></p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {a.role && <span className="capitalize">{a.role.replace(/_/g, " ")}</span>}
                        {a.email && <span>{a.email}</span>}
                        {a.phone && <span>{a.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleArchive(a)}>
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget({ id: a.id, name: a.name })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) { deleteMut.mutate({ id: deleteTarget.id }); setDeleteTarget(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Name *</label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div>
                <label className="text-xs font-medium">Role Title</label>
                <Input value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Accounts Manager" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Email</label>
                <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div>
                <label className="text-xs font-medium">Phone</label>
                <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="04xx xxx xxx" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Profile / When to Contact</label>
              <Textarea
                value={form.profileDescription}
                onChange={(e) => setForm(f => ({ ...f, profileDescription: e.target.value }))}
                placeholder="e.g. Tony is your contact point for invoicing and payment matters."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This is shown to clients in the portal to help them know when to contact this person.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium">Photo URL</label>
              <Input value={form.photoUrl} onChange={(e) => setForm(f => ({ ...f, photoUrl: e.target.value }))} placeholder="https://... (optional)" />
              <p className="text-xs text-muted-foreground mt-1">
                Paste a URL to a profile photo. This will be displayed in the Client Portal.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
