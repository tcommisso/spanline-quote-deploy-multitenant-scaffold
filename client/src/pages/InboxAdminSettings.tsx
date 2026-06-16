/**
 * Inbox Admin Settings — Admin page for configuring inbox features
 * Tabs: General, Addresses, Tags, Auto-Reply, Rate Us, SLA Rules, Signatures
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import RichTextEditor from "@/components/RichTextEditor";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Settings, Mail, Tag, MessageSquare, Star, Clock, Plus, Trash2, Edit, Save,
  Inbox, Users, AlertTriangle, Palette, GripVertical, MailPlus, RefreshCw, FileText, ClipboardPaste, Send,
} from "lucide-react";
import { loadCompanyDetails, loadCustomLogo } from "@/lib/proposalStore";
import { sanitiseSignatureHtml, detectSignatureSource } from "@/lib/signatureHtmlSanitiser";
import { toast } from "sonner";

type Tab = "general" | "addresses" | "tags" | "autoreply" | "rateus" | "sla" | "signatures";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "addresses", label: "Addresses", icon: MailPlus },
  { id: "tags", label: "Tags & Flags", icon: Tag },
  { id: "autoreply", label: "Auto-Reply", icon: MessageSquare },
  { id: "rateus", label: "Rate Us", icon: Star },
  { id: "sla", label: "SLA Rules", icon: Clock },
  { id: "signatures", label: "Signatures", icon: Edit },
];

export default function InboxAdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Inbox className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox Settings</h1>
          <p className="text-sm text-muted-foreground">Configure email inbox, auto-replies, tags, and SLA rules</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="shrink-0"
          >
            <tab.icon className="h-4 w-4 mr-1.5" />
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "general" && <GeneralSettings />}
      {activeTab === "addresses" && <AddressSettings />}
      {activeTab === "tags" && <TagSettings />}
      {activeTab === "autoreply" && <AutoReplySettings />}
      {activeTab === "rateus" && <RateUsSettings />}
      {activeTab === "sla" && <SlaSettings />}
      {activeTab === "signatures" && <SignatureSettings />}
    </div>
  );
}

// ─── General Settings ─────────────────────────────────────────────────────────

function GeneralSettings() {
  const { data: settings, refetch } = trpc.inbox.settings.getAll.useQuery();
  const updateMut = trpc.inbox.settings.updateBatch.useMutation({
    onSuccess: () => { toast.success("Settings saved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [domain, setDomain] = useState("");
  const [defaultFrom, setDefaultFrom] = useState("");

  useEffect(() => {
    if (settings) {
      setDomain(settings.receiving_domain || "");
      setDefaultFrom(settings.default_from_name || "Altaspan Team");
    }
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Email Settings</CardTitle>
        <CardDescription>Configure your receiving domain and default sender identity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Receiving Domain</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. mail.altaspan.com or your-domain.resend.app"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This is the domain configured in Resend for receiving emails. All inbox addresses will use this domain.
          </p>
        </div>
        <div>
          <Label>Default From Name</Label>
          <Input
            value={defaultFrom}
            onChange={(e) => setDefaultFrom(e.target.value)}
            placeholder="Altaspan Team"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Default display name when sending emails (users can override with their own name).
          </p>
        </div>
        <Button onClick={() => updateMut.mutate([
          { key: "receiving_domain", value: domain },
          { key: "default_from_name", value: defaultFrom },
        ])} disabled={updateMut.isPending}>
          <Save className="h-4 w-4 mr-1" /> Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Address Settings ─────────────────────────────────────────────────────────

function AddressSettings() {
  const { data: addresses, refetch } = trpc.inbox.addresses.list.useQuery({ activeOnly: false });
  const { data: staffUsers } = trpc.inbox.staffUsers.useQuery();
  const { data: tags } = trpc.inbox.tags.list.useQuery();
  const createMut = trpc.inbox.addresses.create.useMutation({
    onSuccess: () => { toast.success("Address created"); refetch(); setDialogOpen(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.inbox.addresses.update.useMutation({
    onSuccess: () => { toast.success("Address updated"); refetch(); setDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.inbox.addresses.delete.useMutation({
    onSuccess: () => { toast.success("Address deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const syncNowMut = trpc.inbox.addresses.syncNow.useMutation({
    onSuccess: (data) => { toast.success(`Synced ${data.newMessages} new messages`); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<string>("msgraph");
  const [module, setModule] = useState<string>("none");
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string>("none");

  function resetForm() {
    setEditId(null);
    setAddress("");
    setDisplayName("");
    setDescription("");
    setProvider("msgraph");
    setModule("none");
    setDefaultAssigneeId("none");
  }

  function openEdit(addr: any) {
    setEditId(addr.id);
    setAddress(addr.address);
    setDisplayName(addr.displayName);
    setDescription(addr.description || "");
    setProvider(addr.provider || "resend");
    setModule(addr.module || "none");
    setDefaultAssigneeId(addr.defaultAssigneeId?.toString() || "none");
    setDialogOpen(true);
  }

  function handleSave() {
    const assignee = staffUsers?.find((u: any) => u.id.toString() === defaultAssigneeId);
    const moduleVal = module === "none" ? null : module;
    if (editId) {
      updateMut.mutate({
        id: editId,
        address,
        displayName,
        description,
        provider: provider as "resend" | "msgraph",
        module: moduleVal as any,
        defaultAssigneeId: assignee?.id || null,
        defaultAssigneeName: assignee?.name || null,
      });
    } else {
      createMut.mutate({
        address,
        displayName,
        description,
        provider: provider as "resend" | "msgraph",
        module: moduleVal as any,
        defaultAssigneeId: assignee?.id || null,
        defaultAssigneeName: assignee?.name || null,
      });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Inbox Addresses</CardTitle>
          <CardDescription>Configure receiving addresses with auto-assignment rules</CardDescription>
        </div>
        <Button variant="brand" size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Address
        </Button>
      </CardHeader>
      <CardContent>
        {(!addresses || addresses.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No addresses configured. Add addresses like sales@, build@, accounts@ to route emails automatically.
          </p>
        ) : (
          <div className="space-y-2">
            {addresses.map((addr: any) => (
              <div key={addr.id} className="p-3 rounded-lg border space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{addr.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{addr.address}</p>
                      {addr.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{addr.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {addr.provider === "msgraph" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Sync now"
                        onClick={() => syncNowMut.mutate({ id: addr.id })} disabled={syncNowMut.isPending}>
                        <RefreshCw className={`h-4 w-4 ${syncNowMut.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(addr)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => {
                      if (confirm("Delete this address?")) deleteMut.mutate({ id: addr.id });
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-11">
                  {addr.provider === "msgraph" && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                      Microsoft 365
                    </Badge>
                  )}
                  {addr.module && (
                    <Badge variant="secondary" className="text-xs">
                      {addr.module}
                    </Badge>
                  )}
                  {addr.defaultAssigneeName && (
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" /> {addr.defaultAssigneeName}
                    </Badge>
                  )}
                  <Badge variant={addr.active ? "default" : "outline"} className="text-xs">
                    {addr.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Address" : "Add Address"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Email Address</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="sales@yourdomain.com"
              />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Sales Team"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Handles all sales enquiries"
              />
            </div>
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend">Resend (Legacy)</SelectItem>
                  <SelectItem value="msgraph">Microsoft 365 (Graph API)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {provider === "msgraph" ? "Uses Microsoft Graph API for send/receive" : "Uses Resend API for sending"}
              </p>
            </div>
            <div>
              <Label>Module</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger>
                  <SelectValue placeholder="No module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No module</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="approvals">Approvals</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Assignee</Label>
              <Select value={defaultAssigneeId} onValueChange={setDefaultAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="No default assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No default assignee</SelectItem>
                  {staffUsers?.map((u: any) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!address || !displayName || createMut.isPending || updateMut.isPending}>
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Tag Settings ─────────────────────────────────────────────────────────────

function TagSettings() {
  const { data: tags, refetch } = trpc.inbox.tags.list.useQuery();
  const createMut = trpc.inbox.tags.create.useMutation({
    onSuccess: () => { toast.success("Tag created"); refetch(); setDialogOpen(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.inbox.tags.update.useMutation({
    onSuccess: () => { toast.success("Tag updated"); refetch(); setDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.inbox.tags.delete.useMutation({
    onSuccess: () => { toast.success("Tag deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [description, setDescription] = useState("");

  const PRESET_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#14b8a6"];

  function resetForm() {
    setEditId(null);
    setName("");
    setColor("#6b7280");
    setDescription("");
  }

  function openEdit(tag: any) {
    setEditId(tag.id);
    setName(tag.name);
    setColor(tag.color);
    setDescription(tag.description || "");
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tags & Flags</CardTitle>
          <CardDescription>Create tags to categorize and flag inbox messages</CardDescription>
        </div>
        <Button variant="brand" size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Tag
        </Button>
      </CardHeader>
      <CardContent>
        {(!tags || tags.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No tags created yet. Tags help categorize and filter inbox messages.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag: any) => (
              <div
                key={tag.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border group hover:bg-accent/50 transition-colors"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="text-sm font-medium">{tag.name}</span>
                {tag.description && (
                  <span className="text-xs text-muted-foreground">— {tag.description}</span>
                )}
                <button className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" onClick={() => openEdit(tag)}>
                  <Edit className="h-3 w-3 text-muted-foreground" />
                </button>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                  if (confirm("Delete this tag?")) deleteMut.mutate({ id: tag.id });
                }}>
                  <Trash2 className="h-3 w-3 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Tag" : "Create Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tag Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Urgent, Follow-up" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2 mt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-7 p-0 border-0"
                />
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (editId) {
                updateMut.mutate({ id: editId, name, color, description });
              } else {
                createMut.mutate({ name, color, description });
              }
            }} disabled={!name || createMut.isPending || updateMut.isPending}>
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Auto-Reply Settings ──────────────────────────────────────────────────────

function AutoReplySettings() {
  const { data: settings, refetch } = trpc.inbox.settings.getAll.useQuery();
  const updateMut = trpc.inbox.settings.updateBatch.useMutation({
    onSuccess: () => { toast.success("Auto-reply settings saved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.auto_reply_enabled === "true");
      setSubject(settings.auto_reply_subject || "We received your email");
      setTemplate(settings.auto_reply_template || "");
    }
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Reply</CardTitle>
        <CardDescription>Automatically acknowledge incoming emails with a customizable response</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="autoreply-enabled" />
          <Label htmlFor="autoreply-enabled">Enable auto-reply for inbound emails</Label>
        </div>
        {enabled && (
          <>
            <div>
              <Label>Subject Line</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="We received your email"
              />
            </div>
            <div>
              <Label>Reply Template (HTML)</Label>
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="<p>Thank you for contacting us. We've received your email and will get back to you shortly.</p>"
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use HTML for formatting. Available placeholders: {"{{senderName}}"}, {"{{subject}}"}
              </p>
            </div>
          </>
        )}
        <Button onClick={() => updateMut.mutate([
          { key: "auto_reply_enabled", value: enabled.toString() },
          { key: "auto_reply_subject", value: subject },
          { key: "auto_reply_template", value: template },
        ])} disabled={updateMut.isPending}>
          <Save className="h-4 w-4 mr-1" /> Save Auto-Reply Settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Rate Us Settings ─────────────────────────────────────────────────────────

function RateUsSettings() {
  const { data: settings, refetch } = trpc.inbox.settings.getAll.useQuery();
  const updateMut = trpc.inbox.settings.updateBatch.useMutation({
    onSuccess: () => { toast.success("Rate Us settings saved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.rate_us_enabled === "true");
      setPrompt(settings.rate_us_prompt || "How would you rate our service?");
    }
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rate Us Feedback</CardTitle>
        <CardDescription>Add star rating feedback to outbound emails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="rateus-enabled" />
          <Label htmlFor="rateus-enabled">Enable Rate Us in outbound emails</Label>
        </div>
        {enabled && (
          <div>
            <Label>Feedback Prompt</Label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="How would you rate our service?"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This text appears above the star rating in emails.
            </p>
            <div className="mt-3 p-4 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-2">{prompt || "How would you rate our service?"}</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <span key={r} className="text-2xl" style={{ color: r <= 2 ? "#ef4444" : r === 3 ? "#f59e0b" : "#22c55e" }}>★</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Preview of how it appears in emails</p>
            </div>
          </div>
        )}
        <Button onClick={() => updateMut.mutate([
          { key: "rate_us_enabled", value: enabled.toString() },
          { key: "rate_us_prompt", value: prompt },
        ])} disabled={updateMut.isPending}>
          <Save className="h-4 w-4 mr-1" /> Save Rate Us Settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── SLA Settings ─────────────────────────────────────────────────────────────

function SlaSettings() {
  const { data: rules, refetch } = trpc.inbox.sla.list.useQuery();
  const upsertMut = trpc.inbox.sla.upsert.useMutation({
    onSuccess: () => { toast.success("SLA rule saved"); refetch(); setDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.inbox.sla.delete.useMutation({
    onSuccess: () => { toast.success("SLA rule deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [name, setName] = useState("");
  const [warningHours, setWarningHours] = useState(24);
  const [escalationHours, setEscalationHours] = useState(36);
  const [reminderTargets, setReminderTargets] = useState("assigned");
  const [managerEmail, setManagerEmail] = useState("");
  const [active, setActive] = useState(true);

  function resetForm() {
    setEditId(undefined);
    setName("");
    setWarningHours(24);
    setEscalationHours(36);
    setReminderTargets("assigned");
    setManagerEmail("");
    setActive(true);
  }

  function openEdit(rule: any) {
    setEditId(rule.id);
    setName(rule.name);
    setWarningHours(rule.warningHours);
    setEscalationHours(rule.escalationHours);
    setReminderTargets(rule.reminderTargets);
    setManagerEmail(rule.managerEmail || "");
    setActive(rule.active);
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>SLA Action Rules</CardTitle>
          <CardDescription>
            Set response time thresholds. Messages exceeding warning time get a yellow highlight; those exceeding escalation time get a red flag and trigger reminder emails.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Rule
        </Button>
      </CardHeader>
      <CardContent>
        {(!rules || rules.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No SLA rules configured. Create a rule to monitor response times.
          </p>
        ) : (
          <div className="space-y-3">
            {rules.map((rule: any) => (
              <div key={rule.id} className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{rule.name}</p>
                    <Badge variant={rule.active ? "default" : "outline"} className="text-xs">
                      {rule.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      Warning: {rule.warningHours}h
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                      Escalation: {rule.escalationHours}h
                    </span>
                    <span>Notify: {rule.reminderTargets}</span>
                    {rule.managerEmail && <span>Manager: {rule.managerEmail}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => {
                    if (confirm("Delete this SLA rule?")) deleteMut.mutate({ id: rule.id });
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit SLA Rule" : "Create SLA Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Rule Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard Response SLA" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Warning Threshold (hours)</Label>
                <Input type="number" value={warningHours} onChange={(e) => setWarningHours(parseInt(e.target.value) || 24)} min={1} />
                <p className="text-xs text-muted-foreground mt-1">Yellow highlight after this many hours</p>
              </div>
              <div>
                <Label>Escalation Threshold (hours)</Label>
                <Input type="number" value={escalationHours} onChange={(e) => setEscalationHours(parseInt(e.target.value) || 36)} min={1} />
                <p className="text-xs text-muted-foreground mt-1">Red flag + reminder email after this</p>
              </div>
            </div>
            <div>
              <Label>Reminder Targets</Label>
              <Select value={reminderTargets} onValueChange={setReminderTargets}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned User Only</SelectItem>
                  <SelectItem value="assigned_and_manager">Assigned User + Manager</SelectItem>
                  <SelectItem value="manager">Manager Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(reminderTargets === "assigned_and_manager" || reminderTargets === "manager") && (
              <div>
                <Label>Manager Email</Label>
                <Input
                  type="email"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                  placeholder="manager@company.com"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={active} onCheckedChange={setActive} id="sla-active" />
              <Label htmlFor="sla-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => upsertMut.mutate({
              id: editId,
              name,
              warningHours,
              escalationHours,
              reminderTargets,
              managerEmail: managerEmail || null,
              active,
            })} disabled={!name || upsertMut.isPending}>
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Signature Settings ───────────────────────────────────────────────────────

function getAdminSignatureTemplates(userName: string | null | undefined) {
  const company = loadCompanyDetails();
  const logo = loadCustomLogo();
  const displayName = userName || "Your Name";
  const companyName = company.companyName || "AltaSpan";
  const phone = company.phone || "1300 000 000";
  const email = company.email || "info@altaspan.com.au";
  const website = company.website || "www.altaspan.com.au";
  const logoImg = logo?.dataUrl
    ? `<img src="${logo.dataUrl}" alt="${companyName}" style="max-width:180px;height:auto;margin-bottom:8px;" /><br/>`
    : "";
  return [
    { id: "standard", label: "Standard", description: "Name, title, phone & email",
      html: `<p><strong>${displayName}</strong><br/>Design Adviser<br/>${companyName}<br/>Ph: ${phone}<br/>Email: ${email}</p>` },
    { id: "with-logo", label: "With Logo", description: "Company logo + contact details",
      html: `<p>${logoImg}<strong>${displayName}</strong><br/>Design Adviser<br/>${companyName}<br/>Ph: ${phone} | ${email}<br/>${website}</p>` },
    { id: "minimal", label: "Minimal", description: "Name and phone only",
      html: `<p><strong>${displayName}</strong> | ${companyName}<br/>Ph: ${phone}</p>` },
    { id: "full-branded", label: "Full Branded", description: "Logo, name, title, all contact info & licences",
      html: `<p>${logoImg}<strong>${displayName}</strong><br/>Design Adviser<br/>${companyName}</p><p>Ph: ${phone}<br/>Email: ${email}<br/>Web: ${website}</p>${company.licenceNSW ? `<p style="font-size:11px;color:#666;">Lic NSW: ${company.licenceNSW}${company.licenceACT ? " | Lic ACT: " + company.licenceACT : ""}</p>` : ""}` },
  ];
}

function SignatureSettings() {
  const { user } = useAuth();
  const { data: signatures, refetch } = trpc.inbox.signatures.list.useQuery();
  const createMut = trpc.inbox.signatures.create.useMutation({
    onSuccess: () => { toast.success("Signature created"); refetch(); setDialogOpen(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.inbox.signatures.update.useMutation({
    onSuccess: () => { toast.success("Signature updated"); refetch(); setDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.inbox.signatures.delete.useMutation({
    onSuccess: () => { toast.success("Signature deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const sendTestMut = trpc.inbox.signatures.sendTestEmail.useMutation({
    onSuccess: (data) => toast.success(`Test email sent to ${data.sentTo}`),
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const templates = getAdminSignatureTemplates(user?.name);

  function resetForm() {
    setEditId(null);
    setName("");
    setHtmlContent("");
    setIsDefault(false);
    setShowTemplates(false);
  }

  function applyTemplate(template: { id: string; label: string; html: string }) {
    setName(template.label + " Signature");
    setHtmlContent(template.html);
    setShowTemplates(false);
    toast.success(`"${template.label}" template applied — customise as needed`);
  }

  function openEdit(sig: any) {
    setEditId(sig.id);
    setName(sig.name);
    setHtmlContent(sig.htmlContent);
    setIsDefault(sig.isDefault);
    setShowTemplates(false);
    setDialogOpen(true);
  }

  // Company-wide default signature
  const { data: companySig, refetch: refetchCompany } = trpc.inbox.settings.getCompanySignature.useQuery();
  const [companySaved, setCompanySaved] = useState(false);
  const setCompanyMut = trpc.inbox.settings.setCompanySignature.useMutation({
    onSuccess: () => {
      setCompanySaved(true);
      toast.success("Company default signature saved");
      refetchCompany();
      // Brief delay so user sees the success state before dialog closes
      setTimeout(() => { setCompanyDialogOpen(false); setCompanySaved(false); }, 800);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save signature");
    },
  });
  const deleteCompanyMut = trpc.inbox.settings.deleteCompanySignature.useMutation({
    onSuccess: () => { toast.success("Company default signature removed"); refetchCompany(); },
    onError: (err: any) => toast.error(err.message),
  });
  const duplicateToAllMut = trpc.inbox.settings.duplicateSignatureToAll.useMutation({
    onSuccess: (data: any) => { toast.success(`Signature duplicated to ${data.created} users (${data.skipped} already had one)`); },
    onError: (err: any) => toast.error(err.message),
  });
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyHtml, setCompanyHtml] = useState("");
  const [showCompanyTemplates, setShowCompanyTemplates] = useState(false);

  function openCompanyEdit() {
    setCompanyName(companySig?.name || "");
    setCompanyHtml(companySig?.htmlContent || "");
    setShowCompanyTemplates(false);
    setCompanyDialogOpen(true);
  }

  return (
    <div className="space-y-6">
    {/* Company-wide Default Signature */}
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Company-Wide Default Signature</CardTitle>
          <CardDescription>This signature is automatically used for any staff member who hasn't created their own personal signature.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {companySig && companySig.htmlContent ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{companySig.name}</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={openCompanyEdit}>
                  <Edit className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => {
                  if (confirm("Remove company default signature? Staff without personal signatures will have no signature.")) deleteCompanyMut.mutate();
                }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            </div>
            <div className="text-sm border rounded p-3" dangerouslySetInnerHTML={{ __html: companySig.htmlContent }} />
            <div className="pt-3 border-t flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                if (confirm("This will create a personal copy of this signature for all staff who don't already have one. Continue?")) {
                  duplicateToAllMut.mutate({ name: companySig.name, htmlContent: companySig.htmlContent });
                }
              }} disabled={duplicateToAllMut.isPending}>
                <Users className="h-4 w-4 mr-1" /> {duplicateToAllMut.isPending ? "Duplicating..." : "Duplicate to users without a signature"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (confirm("This will create a personal copy of this signature for ALL staff (including those who already have one). Continue?")) {
                  duplicateToAllMut.mutate({ name: companySig.name, htmlContent: companySig.htmlContent, forceAll: true });
                }
              }} disabled={duplicateToAllMut.isPending}>
                <Users className="h-4 w-4 mr-1" /> Duplicate to ALL users
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">No company-wide default signature set.</p>
            <Button variant="brand" size="sm" onClick={openCompanyEdit}>
              <Plus className="h-4 w-4 mr-1" /> Set Company Default
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="max-w-[600px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{companySig?.htmlContent ? "Edit" : "Set"} Company Default Signature</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Signature Name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company Standard Signature" />
            </div>
            {/* Template Presets for company sig */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Start from a template</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCompanyTemplates(!showCompanyTemplates)}>
                  <FileText className="h-3 w-3 mr-1" /> {showCompanyTemplates ? "Hide" : "Show"} Templates
                </Button>
              </div>
              {showCompanyTemplates && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setCompanyName(t.label + " Signature"); setCompanyHtml(t.html); setShowCompanyTemplates(false); toast.success(`"${t.label}" template applied`); }}
                      className="text-left p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Signature Content</Label>
                <ImportSignatureBtn onImport={(html) => setCompanyHtml(html)} />
              </div>
              <div className="border rounded-md mt-1">
                <RichTextEditor
                  content={companyHtml}
                  onChange={setCompanyHtml}
                  placeholder="Type the company-wide signature here..."
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="ghost" size="sm" className="text-xs" disabled={!companyHtml || sendTestMut.isPending} onClick={() => sendTestMut.mutate({ signatureHtml: companyHtml })}>
              <Send className="h-3 w-3 mr-1" /> {sendTestMut.isPending ? "Sending..." : "Send test email"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>Cancel</Button>
              <Button
                type="button"
                variant={companySaved ? "default" : "brand"}
                onClick={() => {
                  if (!companyName.trim()) { toast.error("Please enter a signature name"); return; }
                  if (!companyHtml || companyHtml === "<p></p>") { toast.error("Please enter signature content"); return; }
                  setCompanyMut.mutate({ name: companyName.trim(), htmlContent: companyHtml });
                }}
                disabled={setCompanyMut.isPending || companySaved}
              >
                {companySaved ? "✓ Saved" : setCompanyMut.isPending ? "Saving..." : "Save Company Default"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>

    {/* Personal Signatures */}
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Personal Email Signatures</CardTitle>
          <CardDescription>Manage your own signatures. Your personal default overrides the company-wide default.</CardDescription>
        </div>
        <Button variant="brand" size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Signature
        </Button>
      </CardHeader>
      <CardContent>
        {(!signatures || signatures.length === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No signatures created yet. Create a signature to include in your outbound emails.
          </p>
        ) : (
          <div className="space-y-3">
            {signatures.map((sig: any) => (
              <div key={sig.id} className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{sig.name}</p>
                    {sig.isDefault && <Badge className="text-xs">Default</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Send test email" onClick={() => sendTestMut.mutate({ signatureId: sig.id })}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(sig)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => {
                      if (confirm("Delete this signature?")) deleteMut.mutate({ id: sig.id });
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border rounded p-2" dangerouslySetInnerHTML={{ __html: sig.htmlContent }} />
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[600px] max-h-[90dvh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editId ? "Edit Signature" : "Create Signature"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 pr-1 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Signature Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Work Signature" />
            </div>
            {/* Template Presets */}
            {!editId && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Start from a template</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowTemplates(!showTemplates)}>
                    <FileText className="h-3 w-3 mr-1" /> {showTemplates ? "Hide" : "Show"} Templates
                  </Button>
                </div>
                {showTemplates && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="text-left p-3 rounded-lg border hover:border-primary hover:bg-accent/50 transition-colors"
                      >
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <Label>Signature Content</Label>
                <ImportSignatureBtn onImport={(html) => setHtmlContent(html)} />
              </div>
              <div className="border rounded-md mt-1">
                <RichTextEditor
                  content={htmlContent}
                  onChange={setHtmlContent}
                  placeholder="Type your signature here..."
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="sig-default" />
              <Label htmlFor="sig-default">Set as default signature</Label>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between shrink-0 border-t pt-3">
            <Button variant="ghost" size="sm" className="text-xs" disabled={!htmlContent || sendTestMut.isPending} onClick={() => sendTestMut.mutate({ signatureHtml: htmlContent })}>
              <Send className="h-3 w-3 mr-1" /> {sendTestMut.isPending ? "Sending..." : "Send test email"}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => {
                if (editId) {
                  updateMut.mutate({ id: editId, name, htmlContent, isDefault });
                } else {
                  createMut.mutate({ name, htmlContent, isDefault });
                }
              }} disabled={!name || !htmlContent || createMut.isPending || updateMut.isPending}>
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>

    {/* Signature Analytics */}
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Signature Usage Analytics</CardTitle>
        <CardDescription>Overview of which staff are using personal vs company default signatures.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignatureAnalyticsPanel />
      </CardContent>
    </Card>
    </div>
  );
}

function SignatureAnalyticsPanel() {
  const { data: analytics, isLoading } = trpc.inbox.settings.signatureAnalytics.useQuery();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading analytics...</p>;
  if (!analytics) return <p className="text-sm text-muted-foreground">No data available.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 rounded-lg bg-muted">
          <p className="text-2xl font-bold">{analytics.totalStaff}</p>
          <p className="text-xs text-muted-foreground">Total Staff</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
          <p className="text-2xl font-bold text-green-600">{analytics.withPersonal}</p>
          <p className="text-xs text-muted-foreground">Personal Signature</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
          <p className="text-2xl font-bold text-amber-600">{analytics.usingCompanyDefault}</p>
          <p className="text-xs text-muted-foreground">Using Company Default</p>
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Staff Member</th>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              <th className="text-center px-3 py-2 font-medium">Signatures</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {analytics.users.map((u: any) => (
              <tr key={u.userId} className="border-t">
                <td className="px-3 py-2">
                  <p className="font-medium">{u.userName}</p>
                  <p className="text-xs text-muted-foreground">{u.userEmail}</p>
                </td>
                <td className="px-3 py-2 text-xs capitalize">{u.role?.replace("_", " ")}</td>
                <td className="px-3 py-2 text-center">{u.signatureCount}</td>
                <td className="px-3 py-2">
                  {u.hasPersonalSignature ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full">
                      \u2713 Personal ({u.defaultSignatureName})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
                      Company Default
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportSignatureBtn({ onImport }: { onImport: (html: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rawHtml, setRawHtml] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  function handlePreview() {
    if (!rawHtml.trim()) { toast.error("Please paste your signature HTML first"); return; }
    const cleaned = sanitiseSignatureHtml(rawHtml);
    const detected = detectSignatureSource(rawHtml);
    setPreview(cleaned);
    setSource(detected);
  }

  function handleImport() {
    if (preview) {
      onImport(preview);
      toast.success(`Signature imported and cleaned${source ? ` (detected: ${source})` : ""}`);
      setOpen(false);
      setRawHtml("");
      setPreview(null);
      setSource(null);
    }
  }

  async function handleClipboardPaste() {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          const html = await blob.text();
          setRawHtml(html);
          const cleaned = sanitiseSignatureHtml(html);
          const detected = detectSignatureSource(html);
          setPreview(cleaned);
          setSource(detected);
          toast.success("Pasted from clipboard");
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text) { setRawHtml(text); toast.info("Pasted as plain text — paste HTML for best results"); }
    } catch {
      toast.error("Could not read clipboard. Please paste manually below.");
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <ClipboardPaste className="h-3 w-3 mr-1" /> Import from Outlook/Gmail
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Import Signature from Email Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Paste your existing email signature HTML below. The system will automatically clean and normalise it,
              removing proprietary Outlook/Gmail markup for consistent rendering.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClipboardPaste}>
                <ClipboardPaste className="h-4 w-4 mr-1" /> Paste from Clipboard
              </Button>
              {source && (
                <span className="text-xs bg-muted px-2 py-1 rounded-full self-center">Detected: {source}</span>
              )}
            </div>
            <div>
              <Label>Raw HTML (paste here)</Label>
              <Textarea
                value={rawHtml}
                onChange={(e) => setRawHtml(e.target.value)}
                placeholder="Paste your signature HTML here..."
                className="font-mono text-xs h-32 mt-1"
              />
            </div>
            {!preview && (
              <Button variant="outline" onClick={handlePreview} disabled={!rawHtml.trim()}>
                Preview Cleaned Signature
              </Button>
            )}
            {preview && (
              <div>
                <Label>Cleaned Preview</Label>
                <div className="border rounded-md p-4 mt-1 bg-white dark:bg-background">
                  <div dangerouslySetInnerHTML={{ __html: preview }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Proprietary styles and unsafe elements have been removed.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setRawHtml(""); setPreview(null); setSource(null); }}>Cancel</Button>
            <Button onClick={handleImport} disabled={!preview}>Import Signature</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
