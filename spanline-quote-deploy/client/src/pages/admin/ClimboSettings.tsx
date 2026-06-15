import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Star, Loader2, Globe } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface AccountForm {
  name: string;
  region: string;
  apiKey: string;
  accountId: string;
  webhookUrl: string;
  active: boolean;
}

const emptyForm: AccountForm = { name: "", region: "", apiKey: "", accountId: "", webhookUrl: "", active: true };

export default function ClimboSettings() {
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.reviews.climboAccounts.list.useQuery();
  const { data: stats } = trpc.reviews.stats.useQuery();
  const createMut = trpc.reviews.climboAccounts.create.useMutation({
    onSuccess: () => { utils.reviews.climboAccounts.list.invalidate(); toast.success("Account created"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.reviews.climboAccounts.update.useMutation({
    onSuccess: () => { utils.reviews.climboAccounts.list.invalidate(); toast.success("Account updated"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.reviews.climboAccounts.delete.useMutation({
    onSuccess: () => { utils.reviews.climboAccounts.list.invalidate(); toast.success("Account deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (acc: any) => {
    setEditingId(acc.id);
    setForm({ name: acc.name, region: acc.region || "", apiKey: acc.apiKey || "", accountId: acc.accountId || "", webhookUrl: acc.webhookUrl || "", active: acc.active ?? true });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Climbo / Google Reviews</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage Climbo accounts for Google Review collection and display.</p>
      </div>

      {/* Review Stats Summary */}
      {stats && Number(stats.total) > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                <span className="text-2xl font-bold">{stats.avgRating}</span>
                <span className="text-muted-foreground">avg rating</span>
              </div>
              <div className="text-muted-foreground">{Number(stats.total)} reviews</div>
              <div className="flex gap-1">
                {[5, 4, 3, 2, 1].map(n => {
                  const count = Number(stats[`${["one","two","three","four","five"][n-1]}Star` as keyof typeof stats] || 0);
                  return count > 0 ? (
                    <Badge key={n} variant="secondary" className="text-xs">{n}★ {count}</Badge>
                  ) : null;
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Climbo Accounts</CardTitle>
            <CardDescription>One account per region (e.g. ACT, Riverina)</CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Account</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !accounts?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No Climbo accounts configured yet. Add one to start collecting Google Reviews.</p>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between border rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {acc.name}
                        {acc.region && <Badge variant="outline" className="text-xs">{acc.region}</Badge>}
                        {!acc.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </div>
                      {acc.accountId && <p className="text-xs text-muted-foreground">Account ID: {acc.accountId}</p>}
                      {acc.apiKey && <p className="text-xs text-muted-foreground">API Key: ••••{acc.apiKey.slice(-4)}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(acc)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                      if (confirm(`Delete account "${acc.name}"?`)) deleteMut.mutate({ id: acc.id });
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zapier Integration Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zapier Integration</CardTitle>
          <CardDescription>How to connect Climbo to this system via Zapier</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <p className="font-medium">Inbound: Receive Google Reviews</p>
            <p className="text-muted-foreground">Create a Zap: Climbo "New Google Review" trigger → Webhooks "POST" action to:</p>
            <code className="block bg-muted px-3 py-2 rounded mt-1 text-xs break-all">POST /api/v1/reviews</code>
            <p className="text-muted-foreground mt-1">Fields: reviewer_name, rating (1-5), review_text, review_date, google_review_id, location_name, climbo_account_id</p>
          </div>
          <div>
            <p className="font-medium">Outbound: Request Reviews on Job Completion</p>
            <p className="text-muted-foreground">Create a Zap: Webhooks "Catch Hook" trigger → Climbo "Send Invite" action. The webhook URL goes in the account's Webhook URL field above. When a construction job is marked complete, the system will fire a POST to that URL with client details.</p>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Climbo Account</DialogTitle>
            <DialogDescription>Configure a Climbo account for a region.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Spanline ACT" />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="e.g. ACT, Riverina" />
            </div>
            <div className="space-y-2">
              <Label>Climbo API Key</Label>
              <Input value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} placeholder="From Climbo client settings" type="password" />
            </div>
            <div className="space-y-2">
              <Label>Climbo Account ID</Label>
              <Input value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} placeholder="Climbo client ID" />
            </div>
            <div className="space-y-2">
              <Label>Webhook URL (for review requests)</Label>
              <Input value={form.webhookUrl} onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))} placeholder="Zapier catch hook URL" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
