import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, MessageSquare, Copy } from "lucide-react";
import { toast } from "sonner";

const MERGE_FIELDS = [
  { key: "{{firstName}}", label: "First Name" },
  { key: "{{lastName}}", label: "Last Name" },
  { key: "{{fullName}}", label: "Full Name" },
  { key: "{{quoteNumber}}", label: "Quote Number" },
  { key: "{{siteAddress}}", label: "Site Address" },
  { key: "{{appointmentDate}}", label: "Appointment Date" },
  { key: "{{appointmentTime}}", label: "Appointment Time" },
  { key: "{{designAdvisor}}", label: "Design Adviser" },
  { key: "{{company}}", label: "Company Name" },
  { key: "{{branchName}}", label: "Branch Name" },
  { key: "{{branchAddress}}", label: "Branch Address" },
  { key: "{{branchPhone}}", label: "Branch Phone" },
  { key: "{{branchEmail}}", label: "Branch Email" },
];

const DEFAULT_CATEGORIES = [
  "Follow-up",
  "Appointment",
  "Confirmation",
  "Reminder",
  "Construction",
  "General",
  "Trade - Job Reminder",
  "Trade - Safety Notice",
  "Trade - Availability",
  "Trade - General",
  "Client - General",
  "Client - Appointment",
  "Client - Construction",
];

type Template = {
  id: number;
  name: string;
  category: string;
  body: string;
  isActive: boolean;
  sortOrder: number;
};

export default function SmsTemplates() {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.vocphone.templates.list.useQuery();
  const upsertMut = trpc.vocphone.templates.upsert.useMutation({
    onSuccess: () => {
      utils.vocphone.templates.list.invalidate();
      setDialogOpen(false);
      toast.success("Template saved");
    },
  });
  const deleteMut = trpc.vocphone.templates.delete.useMutation({
    onSuccess: () => {
      utils.vocphone.templates.list.invalidate();
      toast.success("Template deleted");
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const cat = t.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t as Template);
    return acc;
  }, {});

  function openNew() {
    setEditing({ name: "", category: "General", body: "", isActive: true, sortOrder: 0 });
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    setEditing({ ...t });
    setDialogOpen(true);
  }

  function insertMergeField(field: string) {
    if (!editing) return;
    setEditing({ ...editing, body: (editing.body || "") + field });
  }

  function handleSave() {
    if (!editing?.name || !editing?.body || !editing?.category) {
      toast.error("Please fill all required fields");
      return;
    }
    upsertMut.mutate({
      id: editing.id,
      name: editing.name,
      category: editing.category,
      body: editing.body,
      isActive: editing.isActive ?? true,
      sortOrder: editing.sortOrder ?? 0,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">SMS Templates</h2>
          <p className="text-muted-foreground">Manage SMS templates with merge fields for consistent messaging.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General / Sales</SelectItem>
              <SelectItem value="trade">Trade Templates</SelectItem>
              <SelectItem value="client">Client Templates</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading templates...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">No templates yet. Create your first SMS template.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped)
          .filter(([category]) => {
            if (filterCategory === "all") return true;
            if (filterCategory === "trade") return category.startsWith("Trade");
            if (filterCategory === "client") return category.startsWith("Client");
            return !category.startsWith("Trade") && !category.startsWith("Client");
          })
          .map(([category, items]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge variant="outline">{category}</Badge>
                <span className="text-sm text-muted-foreground font-normal">
                  {items.length} template{items.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {!t.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-2">
                      {t.body}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(t.body);
                        toast.success("Copied to clipboard");
                      }}
                      title="Copy body"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete template "${t.name}"?`)) {
                          deleteMut.mutate({ id: t.id });
                        }
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Template" : "New SMS Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={editing?.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Appointment Confirmation"
              />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={editing?.category || "General"}
                onValueChange={(v) => setEditing({ ...editing, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message Body *</Label>
              <Textarea
                value={editing?.body || ""}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                placeholder="Hi {{firstName}}, your appointment is confirmed for {{appointmentDate}}..."
                rows={5}
              />
              <div className="flex flex-wrap gap-1">
                {MERGE_FIELDS.map((f) => (
                  <Button
                    key={f.key}
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => insertMergeField(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Character count: {(editing?.body || "").length} / 160 (1 SMS segment)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editing?.isActive ?? true}
                onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
              />
              <Label>Active</Label>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={editing?.sortOrder ?? 0}
                onChange={(e) => setEditing({ ...editing, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMut.isPending}>
              {upsertMut.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
