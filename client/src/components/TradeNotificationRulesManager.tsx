import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { BellRing, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TRIGGER_TYPE_OPTIONS = [
  { value: "before_job", label: "Before Job Start" },
  { value: "after_job", label: "After Job Completion" },
  { value: "on_assignment", label: "On Job Assignment" },
  { value: "availability_reminder", label: "Availability Reminder" },
] as const;

const CHANNEL_OPTIONS = [
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
] as const;

export default function TradeNotificationRulesManager() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.people.notificationRules.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    triggerType: "on_assignment" as string,
    channel: "email" as string,
    hoursOffset: 24,
    messageTemplate: "",
    isActive: true,
  });

  const createMut = trpc.people.notificationRules.create.useMutation({
    onSuccess: () => { toast.success("Notification rule created"); utils.people.notificationRules.list.invalidate(); closeDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.people.notificationRules.update.useMutation({
    onSuccess: () => { toast.success("Notification rule updated"); utils.people.notificationRules.list.invalidate(); closeDialog(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.people.notificationRules.delete.useMutation({
    onSuccess: () => { toast.success("Notification rule deleted"); utils.people.notificationRules.list.invalidate(); setDeleteRuleId(null); },
    onError: (err) => toast.error(err.message),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditingRule(null);
    setForm({ name: "", triggerType: "on_assignment", channel: "email", hoursOffset: 24, messageTemplate: "", isActive: true });
  }

  function openEdit(rule: any) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      triggerType: rule.triggerType,
      channel: rule.channel,
      hoursOffset: rule.hoursOffset,
      messageTemplate: rule.messageTemplate || "",
      isActive: rule.isActive,
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) { toast.error("Rule name is required"); return; }
    if (!form.messageTemplate.trim()) { toast.error("Message template is required"); return; }

    if (editingRule) {
      updateMut.mutate({
        id: editingRule.id,
        name: form.name,
        triggerType: form.triggerType as any,
        channel: form.channel as any,
        hoursOffset: form.hoursOffset,
        messageTemplate: form.messageTemplate,
        isActive: form.isActive,
      });
    } else {
      createMut.mutate({
        name: form.name,
        triggerType: form.triggerType as any,
        channel: form.channel as any,
        hoursOffset: form.hoursOffset,
        messageTemplate: form.messageTemplate,
        isActive: form.isActive,
      });
    }
  }

  if (isLoading) {
    return <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BellRing className="h-4 w-4" /> Trade Notification Rules
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Configure automated SMS/email notifications sent to trades based on schedule events.
              </p>
            </div>
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rules || rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BellRing className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notification rules configured yet.</p>
              <p className="text-xs mt-1">Add a rule to automatically notify trades about schedule changes, job assignments, and more.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule: any) => (
                <div
                  key={rule.id}
                  className={`flex flex-col gap-3 border rounded-lg p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${rule.isActive ? "hover:bg-muted/30" : "opacity-60 bg-muted/20"}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${rule.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{rule.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {TRIGGER_TYPE_OPTIONS.find(t => t.value === rule.triggerType)?.label || rule.triggerType}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {CHANNEL_OPTIONS.find(c => c.value === rule.channel)?.label || rule.channel}
                        </Badge>
                        {rule.hoursOffset > 0 && (
                          <span className="text-[10px] text-muted-foreground">{rule.hoursOffset}h offset</span>
                        )}
                      </div>
                      {rule.messageTemplate && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words sm:truncate sm:max-w-md">
                          {rule.messageTemplate}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteRuleId(rule.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardContent className="p-4">
          <p className="text-xs font-medium mb-2">Available Template Variables</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span><code className="bg-muted px-1 rounded">{"{{trade_name}}"}</code> — Trade's name</span>
            <span><code className="bg-muted px-1 rounded">{"{{job_number}}"}</code> — Job number</span>
            <span><code className="bg-muted px-1 rounded">{"{{client_name}}"}</code> — Client name</span>
            <span><code className="bg-muted px-1 rounded">{"{{client_phone}}"}</code> — Client phone number</span>
            <span><code className="bg-muted px-1 rounded">{"{{office_phone}}"}</code> — Office phone number</span>
            <span><code className="bg-muted px-1 rounded">{"{{cm}}"}</code> — Construction manager</span>
            <span><code className="bg-muted px-1 rounded">{"{{est_days}}"}</code> — Estimated job days</span>
            <span><code className="bg-muted px-1 rounded">{"{{site_address}}"}</code> — Site address</span>
            <span><code className="bg-muted px-1 rounded">{"{{start_date}}"}</code> — Scheduled start</span>
            <span><code className="bg-muted px-1 rounded">{"{{start_time}}"}</code> — Scheduled time</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Notification Rule" : "Create Notification Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Rule Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 24h Job Reminder SMS"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-medium">Trigger *</Label>
                <Select value={form.triggerType} onValueChange={(v) => setForm(f => ({ ...f, triggerType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Channel *</Label>
                <Select value={form.channel} onValueChange={(v) => setForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Hours Offset</Label>
              <Input
                type="number"
                min={0}
                max={168}
                value={form.hoursOffset}
                onChange={(e) => setForm(f => ({ ...f, hoursOffset: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Hours before/after the trigger event to send the notification (0 = immediately).
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium">Message Template *</Label>
              <Textarea
                value={form.messageTemplate}
                onChange={(e) => setForm(f => ({ ...f, messageTemplate: e.target.value }))}
                placeholder="Hi {{trade_name}}, you have a job scheduled at {{site_address}} on {{start_date}} at {{start_time}}."
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use {"{{variable}}"} syntax for dynamic content. See available variables below the rules list.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm(f => ({ ...f, isActive: checked }))}
              />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notification Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notification rule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRuleId && deleteMut.mutate({ id: deleteRuleId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
