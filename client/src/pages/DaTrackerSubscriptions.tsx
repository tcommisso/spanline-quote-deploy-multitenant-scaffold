import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Bell, Trash2, Globe, Mail, Webhook, Loader2 } from "lucide-react";

export default function DaTrackerSubscriptions() {

  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [filterSubclass, setFilterSubclass] = useState("");
  const [filterApplicationType, setFilterApplicationType] = useState("");
  const [notifyMethod, setNotifyMethod] = useState<"in_app" | "webhook" | "email">("in_app");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailAddress, setEmailAddress] = useState("");

  const { data: subscriptions, isLoading } = trpc.daTracker.subscriptions.list.useQuery();
  const { data: filterOptions } = trpc.daTracker.filterOptions.useQuery();
  const { data: notifications } = trpc.daTracker.notifications.useQuery({ limit: 20 });

  const createMutation = trpc.daTracker.subscriptions.create.useMutation({
    onSuccess: () => {
      toast.success("Subscription created");
      utils.daTracker.subscriptions.list.invalidate();
      setShowCreate(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.daTracker.subscriptions.update.useMutation({
    onSuccess: () => {
      toast.success("Subscription updated");
      utils.daTracker.subscriptions.list.invalidate();
    },
  });

  const deleteMutation = trpc.daTracker.subscriptions.delete.useMutation({
    onSuccess: () => {
      toast.success("Subscription deleted");
      utils.daTracker.subscriptions.list.invalidate();
    },
  });

  function resetForm() {
    setName("");
    setFilterDistrict("");
    setFilterDivision("");
    setFilterSubclass("");
    setFilterApplicationType("");
    setNotifyMethod("in_app");
    setWebhookUrl("");
    setEmailAddress("");
  }

  function handleCreate() {
    createMutation.mutate({
      name,
      filterDistrict: filterDistrict || undefined,
      filterDivision: filterDivision || undefined,
      filterSubclass: filterSubclass || undefined,
      filterApplicationType: filterApplicationType || undefined,
      notifyMethod,
      webhookUrl: notifyMethod === "webhook" ? webhookUrl : undefined,
      emailAddress: notifyMethod === "email" ? emailAddress : undefined,
    });
  }

  const methodIcon = (method: string) => {
    switch (method) {
      case "webhook": return <Webhook className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DA Tracker — Subscriptions</h1>
          <p className="text-muted-foreground text-sm">Get notified when new DAs are lodged or existing ones change</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button variant="brand"><Plus className="h-4 w-4 mr-2" /> New Subscription</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Subscription</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Belconnen Residential" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>District</Label>
                  <Select value={filterDistrict} onValueChange={setFilterDistrict}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      {filterOptions?.districts.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Subclass</Label>
                  <Select value={filterSubclass} onValueChange={setFilterSubclass}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      {filterOptions?.subclasses.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Division (suburb)</Label>
                <Input value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)} placeholder="e.g. CASEY" />
              </div>
              <div>
                <Label>Notification Method</Label>
                <Select value={notifyMethod} onValueChange={(v) => setNotifyMethod(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">In-App</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="webhook">Webhook (POST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {notifyMethod === "webhook" && (
                <div>
                  <Label>Webhook URL</Label>
                  <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..." />
                </div>
              )}
              {notifyMethod === "email" && (
                <div>
                  <Label>Email Address</Label>
                  <Input value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="you@example.com" type="email" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Subscriptions list */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !subscriptions || subscriptions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No subscriptions yet. Create one to get notified about DA changes.</p>
            </CardContent>
          </Card>
        ) : (
          subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {methodIcon(sub.notifyMethod)}
                    <div>
                      <h3 className="font-medium">{sub.name}</h3>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {sub.filterDistrict && <Badge variant="outline" className="text-xs">District: {sub.filterDistrict}</Badge>}
                        {sub.filterDivision && <Badge variant="outline" className="text-xs">Division: {sub.filterDivision}</Badge>}
                        {sub.filterSubclass && <Badge variant="outline" className="text-xs">Subclass: {sub.filterSubclass}</Badge>}
                        {sub.filterApplicationType && <Badge variant="outline" className="text-xs">Type: {sub.filterApplicationType}</Badge>}
                        {!sub.filterDistrict && !sub.filterDivision && !sub.filterSubclass && !sub.filterApplicationType && (
                          <Badge variant="secondary" className="text-xs">All DAs</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Active</Label>
                      <Switch
                        checked={sub.active}
                        onCheckedChange={(checked) => updateMutation.mutate({ id: sub.id, active: checked })}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: sub.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Recent notifications */}
      {notifications && notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Notifications</CardTitle>
            <CardDescription>Latest DA change alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {notifications.map((n: any) => (
                <div key={n.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <span className="font-medium text-sm">{(n.payload as any)?.eventType === "new_da" ? "New DA" : "Updated DA"}</span>
                    <span className="text-muted-foreground text-sm ml-2">#{(n.payload as any)?.daNumber}</span>
                    <span className="text-muted-foreground text-xs ml-2">{(n.payload as any)?.district} / {(n.payload as any)?.division}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {n.deliveredAt ? new Date(n.deliveredAt).toLocaleString("en-AU") : "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
