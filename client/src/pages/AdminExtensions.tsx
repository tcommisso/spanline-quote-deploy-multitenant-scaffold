import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

interface ExtensionForm {
  id?: number;
  extension: string;
  firstName: string;
  lastName: string;
  email: string;
}

const emptyForm: ExtensionForm = { extension: "", firstName: "", lastName: "", email: "" };

export default function AdminExtensions() {
  const utils = trpc.useUtils();
  const { data: extensions, isLoading } = trpc.vocphone.getLocalExtensions.useQuery();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ExtensionForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const upsert = trpc.vocphone.upsertExtension.useMutation({
    onSuccess: () => {
      toast.success(form.id ? "Extension updated" : "Extension added");
      utils.vocphone.getLocalExtensions.invalidate();
      utils.vocphone.getExtensions.invalidate();
      setEditOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const deleteMut = trpc.vocphone.deleteExtension.useMutation({
    onSuccess: () => {
      toast.success("Extension deleted");
      utils.vocphone.getLocalExtensions.invalidate();
      utils.vocphone.getExtensions.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const openAdd = () => {
    setForm(emptyForm);
    setEditOpen(true);
  };

  const openEdit = (ext: any) => {
    setForm({
      id: ext.id,
      extension: String(ext.extension),
      firstName: ext.firstName,
      lastName: ext.lastName,
      email: ext.email || "",
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!form.extension || !form.firstName || !form.lastName) {
      toast.error("Extension number, first name, and last name are required");
      return;
    }
    upsert.mutate({
      id: form.id,
      extension: Number(form.extension),
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || undefined,
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              VOCPhone Extensions
            </CardTitle>
            <CardDescription>
              Manage extension-to-user mappings. When calls are synced, the user name is locked at that point in time.
              Changing a name here only affects future calls.
            </CardDescription>
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Extension
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : extensions && extensions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Extension</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Last Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extensions.map((ext: any) => (
                  <TableRow key={ext.id}>
                    <TableCell className="font-mono font-medium">{ext.extension}</TableCell>
                    <TableCell>{ext.firstName}</TableCell>
                    <TableCell>{ext.lastName}</TableCell>
                    <TableCell className="text-muted-foreground">{ext.email || "\u2014"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ext)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget({ id: ext.id, name: `${ext.firstName} ${ext.lastName} (Ext ${ext.extension})` })}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No extensions configured. Click "Add Extension" to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Extension" : "Add Extension"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ext-number">Extension Number</Label>
              <Input
                id="ext-number"
                type="number"
                placeholder="e.g. 801"
                value={form.extension}
                onChange={(e) => setForm({ ...form, extension: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ext-first">First Name</Label>
                <Input
                  id="ext-first"
                  placeholder="John"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="ext-last">Last Name</Label>
                <Input
                  id="ext-last"
                  placeholder="Smith"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ext-email">Email (optional)</Label>
              <Input
                id="ext-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {form.id ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Extension"
        description={`Are you sure you want to delete ${deleteTarget?.name}? This won't affect historical call records.`}
        onConfirm={() => deleteTarget && deleteMut.mutate({ id: deleteTarget.id })}
        isPending={deleteMut.isPending}
      />
    </div>
  );
}
