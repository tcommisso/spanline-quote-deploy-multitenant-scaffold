import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { Plus, Copy, Trash2, Edit, X, ChevronDown, ChevronRight, Wand2 } from "lucide-react";
import { toast } from "sonner";
import WorkflowVisualEditor from "@/components/approvals/WorkflowVisualEditor";

interface WorkflowState {
  code: string;
  label: string;
  order: number;
  type: "lodgement" | "construction" | "closeout";
}

interface WorkflowGate {
  gateNumber: number;
  name: string;
  description: string;
  blockingConditions: string[];
}

interface WorkflowTransition {
  from: string;
  to: string;
  conditions: string[];
  autoTasks: { title: string; taskType: string; description: string }[];
}

interface DocumentChecklistItem {
  docType: string;
  label: string;
  required: boolean;
  stage: string;
}

export default function ApprovalsWorkflowTemplates() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [newForm, setNewForm] = useState({
    jurisdiction: "NSW" as "NSW" | "ACT",
    pathwayCode: "",
    name: "",
    description: "",
  });

  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.approvals.workflowTemplates.list.useQuery();

  const seedMutation = trpc.approvals.workflowTemplates.seed.useMutation({
    onSuccess: (data) => {
      toast.success(`Seeded ${data.seeded} templates (${data.total} total available)`);
      utils.approvals.workflowTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createMutation = trpc.approvals.workflowTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      setShowCreateDialog(false);
      setNewForm({ jurisdiction: "NSW", pathwayCode: "", name: "", description: "" });
      utils.approvals.workflowTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.approvals.workflowTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      setEditingId(null);
      setEditForm(null);
      utils.approvals.workflowTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.approvals.workflowTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template archived");
      utils.approvals.workflowTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const duplicateMutation = trpc.approvals.workflowTemplates.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Template duplicated");
      utils.approvals.workflowTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const startEdit = (template: any) => {
    setEditingId(template.id);
    setEditForm({
      name: template.name,
      description: template.description || "",
      pathwayCode: template.pathwayCode,
      jurisdiction: template.jurisdiction,
      states: template.states || [],
      gates: template.gates || [],
      transitions: template.transitions || [],
      documentChecklist: template.documentChecklist || [],
    });
  };

  const saveEdit = () => {
    if (!editingId || !editForm) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        name: editForm.name,
        description: editForm.description,
        pathwayCode: editForm.pathwayCode,
        jurisdiction: editForm.jurisdiction,
        states: editForm.states,
        gates: editForm.gates,
        transitions: editForm.transitions,
        documentChecklist: editForm.documentChecklist,
      },
    });
  };

  const handleCreate = () => {
    if (!newForm.name || !newForm.pathwayCode) {
      toast.error("Name and pathway code are required");
      return;
    }
    createMutation.mutate({
      ...newForm,
      states: [],
      transitions: [],
      gates: [],
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage approval workflow templates for NSW and ACT pathways. Drag states to reorder, add gates and transitions visually.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <Wand2 className="h-4 w-4 mr-2" />
            Seed Defaults
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Template List */}
      {!templates || templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No workflow templates yet. Click "Seed Defaults" to load standard NSW/ACT templates, or create a custom one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl: any) => (
            <Card key={tpl.id} className="overflow-hidden">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}>
                    {expandedId === tpl.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">{tpl.name}</CardTitle>
                        <Badge variant="outline" className="text-xs">{tpl.jurisdiction}</Badge>
                        <Badge variant="secondary" className="text-xs font-mono">{tpl.pathwayCode}</Badge>
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{tpl.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => duplicateMutation.mutate({ id: tpl.id })} disabled={duplicateMutation.isPending}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(tpl)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                      if (confirm("Archive this template? It will no longer appear in the list.")) {
                        deleteMutation.mutate({ id: tpl.id });
                      }
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Read-only expanded view */}
              {expandedId === tpl.id && editingId !== tpl.id && (
                <CardContent className="border-t pt-4 space-y-4">
                  {/* States */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">States ({(tpl.states as WorkflowState[] || []).length})</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(tpl.states as WorkflowState[] || []).sort((a: WorkflowState, b: WorkflowState) => a.order - b.order).map((s: WorkflowState) => (
                        <Badge key={s.code} variant="outline" className={`text-xs ${s.type === "lodgement" ? "bg-blue-50 dark:bg-blue-950" : s.type === "construction" ? "bg-green-50 dark:bg-green-950" : "bg-amber-50 dark:bg-amber-950"}`}>
                          {s.order}. {s.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Gates */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Gates ({(tpl.gates as WorkflowGate[] || []).length})</h4>
                    <div className="space-y-1.5">
                      {(tpl.gates as WorkflowGate[] || []).map((g: WorkflowGate) => (
                        <div key={g.gateNumber} className="text-xs border rounded px-3 py-2">
                          <span className="font-semibold">Gate {g.gateNumber}:</span> {g.name}
                          {g.blockingConditions?.length > 0 && (
                            <span className="text-muted-foreground ml-2">({g.blockingConditions.length} conditions)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Document Checklist */}
                  {(tpl.documentChecklist as DocumentChecklistItem[] || []).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Document Checklist ({(tpl.documentChecklist as DocumentChecklistItem[]).length})</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {(tpl.documentChecklist as DocumentChecklistItem[]).slice(0, 10).map((d: DocumentChecklistItem, i: number) => (
                          <div key={i} className="text-xs flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${d.required ? "bg-red-500" : "bg-gray-300"}`} />
                            {d.label}
                            <Badge variant="outline" className="text-[10px] ml-auto">{d.stage}</Badge>
                          </div>
                        ))}
                        {(tpl.documentChecklist as DocumentChecklistItem[]).length > 10 && (
                          <p className="text-xs text-muted-foreground">... and {(tpl.documentChecklist as DocumentChecklistItem[]).length - 10} more</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Transitions count */}
                  <div className="text-xs text-muted-foreground">
                    {(tpl.transitions as WorkflowTransition[] || []).length} transitions configured
                    {" • "}Version {tpl.version}
                    {" • "}Updated {new Date(tpl.updatedAt).toLocaleDateString()}
                  </div>
                </CardContent>
              )}

              {/* Visual Edit Mode */}
              {editingId === tpl.id && editForm && (
                <CardContent className="border-t pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Name</Label>
                      <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Jurisdiction</Label>
                        <Select value={editForm.jurisdiction} onValueChange={(v) => setEditForm({ ...editForm, jurisdiction: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NSW">NSW</SelectItem>
                            <SelectItem value="ACT">ACT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Pathway Code</Label>
                        <Input value={editForm.pathwayCode} onChange={(e) => setEditForm({ ...editForm, pathwayCode: e.target.value })} />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
                    </div>
                  </div>

                  {/* Visual Workflow Editor replaces raw JSON textareas */}
                  <WorkflowVisualEditor
                    states={editForm.states}
                    gates={editForm.gates}
                    transitions={editForm.transitions}
                    documentChecklist={editForm.documentChecklist}
                    onChange={(data) => setEditForm({ ...editForm, ...data })}
                    onSave={saveEdit}
                    onCancel={() => { setEditingId(null); setEditForm(null); }}
                    isSaving={updateMutation.isPending}
                  />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Workflow Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                placeholder="e.g. NSW Section 68 Approval"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Jurisdiction</Label>
                <Select value={newForm.jurisdiction} onValueChange={(v: "NSW" | "ACT") => setNewForm({ ...newForm, jurisdiction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NSW">NSW</SelectItem>
                    <SelectItem value="ACT">ACT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pathway Code</Label>
                <Input
                  placeholder="e.g. NSW_S68"
                  value={newForm.pathwayCode}
                  onChange={(e) => setNewForm({ ...newForm, pathwayCode: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of when this pathway applies..."
                value={newForm.description}
                onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>Create Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
