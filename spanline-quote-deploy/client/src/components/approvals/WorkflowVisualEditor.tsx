/**
 * Visual Workflow Editor
 * Drag-and-drop state/transition builder for non-technical staff.
 * Replaces raw JSON editing with an interactive canvas.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, GripVertical, ArrowRight, Shield, X, Save, FileText } from "lucide-react";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────
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

interface WorkflowVisualEditorProps {
  states: WorkflowState[];
  gates: WorkflowGate[];
  transitions: WorkflowTransition[];
  documentChecklist: DocumentChecklistItem[];
  onChange: (data: {
    states: WorkflowState[];
    gates: WorkflowGate[];
    transitions: WorkflowTransition[];
    documentChecklist: DocumentChecklistItem[];
  }) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

// ─── State Node Component ──────────────────────────────────────────────────────
function StateNode({
  state,
  index,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  gateAfter,
}: {
  state: WorkflowState;
  index: number;
  onUpdate: (s: WorkflowState) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent, idx: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
  gateAfter?: WorkflowGate;
}) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(state.label);
  const [editCode, setEditCode] = useState(state.code);
  const [editType, setEditType] = useState(state.type);

  const typeColor = {
    lodgement: "bg-blue-100 border-blue-300 dark:bg-blue-950 dark:border-blue-700",
    construction: "bg-green-100 border-green-300 dark:bg-green-950 dark:border-green-700",
    closeout: "bg-amber-100 border-amber-300 dark:bg-amber-950 dark:border-amber-700",
  };

  const typeBadge = {
    lodgement: "bg-blue-500",
    construction: "bg-green-500",
    closeout: "bg-amber-500",
  };

  return (
    <div className="flex items-center gap-1">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, index)}
        className={`relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 ${typeColor[state.type]} cursor-grab active:cursor-grabbing transition-all hover:shadow-md min-w-[140px]`}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {editing ? (
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <Input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="h-6 text-xs"
              placeholder="Label"
            />
            <Input
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              className="h-6 text-xs font-mono"
              placeholder="code_name"
            />
            <Select value={editType} onValueChange={(v: "lodgement" | "construction" | "closeout") => setEditType(v)}>
              <SelectTrigger className="h-6 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lodgement">Lodgement</SelectItem>
                <SelectItem value="construction">Construction</SelectItem>
                <SelectItem value="closeout">Closeout</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={() => {
                onUpdate({ ...state, label: editLabel, code: editCode, type: editType });
                setEditing(false);
              }}>
                <Save className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={() => setEditing(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col" onDoubleClick={() => setEditing(true)}>
            <span className="text-xs font-semibold leading-tight">{state.label}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{state.code}</span>
          </div>
        )}
        <div className={`absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full ${typeBadge[state.type]}`} title={state.type} />
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 p-0 rounded-full bg-destructive/80 text-white hover:bg-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <X className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
      {/* Arrow to next state */}
      <div className="flex flex-col items-center mx-1">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        {gateAfter && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <Shield className="h-2.5 w-2.5 text-orange-500" />
            <span className="text-[9px] text-orange-600 dark:text-orange-400 font-medium">G{gateAfter.gateNumber}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function WorkflowVisualEditor({
  states: initialStates,
  gates: initialGates,
  transitions: initialTransitions,
  documentChecklist: initialDocs,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: WorkflowVisualEditorProps) {
  const [states, setStates] = useState<WorkflowState[]>(initialStates || []);
  const [gates, setGates] = useState<WorkflowGate[]>(initialGates || []);
  const [transitions, setTransitions] = useState<WorkflowTransition[]>(initialTransitions || []);
  const [docs, setDocs] = useState<DocumentChecklistItem[]>(initialDocs || []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"states" | "gates" | "transitions" | "docs">("states");
  const [showAddState, setShowAddState] = useState(false);
  const [showAddGate, setShowAddGate] = useState(false);
  const [showAddTransition, setShowAddTransition] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);

  // New state form
  const [newState, setNewState] = useState({ code: "", label: "", type: "lodgement" as WorkflowState["type"] });
  const [newGate, setNewGate] = useState({ name: "", description: "", blockingConditions: "" });
  const [newTransition, setNewTransition] = useState({ from: "", to: "", conditions: "", autoTaskTitle: "", autoTaskType: "review" });
  const [newDoc, setNewDoc] = useState({ docType: "", label: "", required: true, stage: "" });

  // Propagate changes up
  useEffect(() => {
    onChange({ states, gates, transitions, documentChecklist: docs });
  }, [states, gates, transitions, docs]);

  // ─── State Management ──────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) return;
    const newStates = [...states];
    const [moved] = newStates.splice(dragIdx, 1);
    newStates.splice(targetIdx, 0, moved);
    // Re-number orders
    setStates(newStates.map((s, i) => ({ ...s, order: i + 1 })));
    setDragIdx(null);
  };

  const addState = () => {
    if (!newState.code || !newState.label) {
      toast.error("Code and label are required");
      return;
    }
    if (states.some((s) => s.code === newState.code)) {
      toast.error("State code must be unique");
      return;
    }
    setStates([...states, { ...newState, order: states.length + 1 }]);
    setNewState({ code: "", label: "", type: "lodgement" });
    setShowAddState(false);
  };

  const updateState = (idx: number, updated: WorkflowState) => {
    const newStates = [...states];
    newStates[idx] = updated;
    setStates(newStates);
  };

  const deleteState = (idx: number) => {
    const code = states[idx].code;
    setStates(states.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
    // Remove transitions referencing this state
    setTransitions(transitions.filter((t) => t.from !== code && t.to !== code));
  };

  // ─── Gate Management ───────────────────────────────────────────────────────
  const addGate = () => {
    if (!newGate.name) { toast.error("Gate name is required"); return; }
    const conditions = newGate.blockingConditions.split("\n").map((c) => c.trim()).filter(Boolean);
    setGates([...gates, {
      gateNumber: gates.length + 1,
      name: newGate.name,
      description: newGate.description,
      blockingConditions: conditions,
    }]);
    setNewGate({ name: "", description: "", blockingConditions: "" });
    setShowAddGate(false);
  };

  const deleteGate = (idx: number) => {
    setGates(gates.filter((_, i) => i !== idx).map((g, i) => ({ ...g, gateNumber: i + 1 })));
  };

  // ─── Transition Management ─────────────────────────────────────────────────
  const addTransition = () => {
    if (!newTransition.from || !newTransition.to) { toast.error("From and To states are required"); return; }
    const conditions = newTransition.conditions.split("\n").map((c) => c.trim()).filter(Boolean);
    const autoTasks = newTransition.autoTaskTitle
      ? [{ title: newTransition.autoTaskTitle, taskType: newTransition.autoTaskType, description: "" }]
      : [];
    setTransitions([...transitions, { from: newTransition.from, to: newTransition.to, conditions, autoTasks }]);
    setNewTransition({ from: "", to: "", conditions: "", autoTaskTitle: "", autoTaskType: "review" });
    setShowAddTransition(false);
  };

  const deleteTransition = (idx: number) => {
    setTransitions(transitions.filter((_, i) => i !== idx));
  };

  // ─── Document Checklist Management ─────────────────────────────────────────
  const addDoc = () => {
    if (!newDoc.docType || !newDoc.label) { toast.error("Doc type and label are required"); return; }
    setDocs([...docs, { ...newDoc }]);
    setNewDoc({ docType: "", label: "", required: true, stage: "" });
    setShowAddDoc(false);
  };

  const deleteDoc = (idx: number) => {
    setDocs(docs.filter((_, i) => i !== idx));
  };

  // Find gate that sits between state[i] and state[i+1]
  const getGateAfterState = (stateIdx: number): WorkflowGate | undefined => {
    // Convention: gate N sits after state at position (gateNumber * 2 - 1) approximately
    // More practically, we match gates to transitions
    return gates.find((g) => g.gateNumber === stateIdx + 1);
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 border-b pb-2">
        {(["states", "gates", "transitions", "docs"] as const).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab)}
            className="text-xs capitalize"
          >
            {tab === "docs" ? "Documents" : tab}
            <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
              {tab === "states" ? states.length : tab === "gates" ? gates.length : tab === "transitions" ? transitions.length : docs.length}
            </Badge>
          </Button>
        ))}
      </div>

      {/* ─── States Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "states" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Drag states to reorder. Double-click to edit. States flow left to right.</p>
            <Button size="sm" variant="outline" onClick={() => setShowAddState(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add State
            </Button>
          </div>

          {/* Visual State Flow */}
          <div className="overflow-x-auto pb-4">
            <div className="flex items-center gap-0 min-w-max p-4 bg-muted/30 rounded-lg border">
              {states.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No states defined. Add your first state to begin.</p>
              ) : (
                states.map((state, idx) => (
                  <StateNode
                    key={state.code + idx}
                    state={state}
                    index={idx}
                    onUpdate={(s) => updateState(idx, s)}
                    onDelete={() => deleteState(idx)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    gateAfter={getGateAfterState(idx)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Lodgement</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Construction</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Closeout</span>
            <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-orange-500" /> Gate</span>
          </div>

          {/* Add State Dialog */}
          <Dialog open={showAddState} onOpenChange={setShowAddState}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add State</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input placeholder="e.g. DA Lodged" value={newState.label} onChange={(e) => setNewState({ ...newState, label: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Code (snake_case)</Label>
                  <Input placeholder="e.g. da_lodged" className="font-mono" value={newState.code} onChange={(e) => setNewState({ ...newState, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                </div>
                <div>
                  <Label className="text-xs">Phase Type</Label>
                  <Select value={newState.type} onValueChange={(v: WorkflowState["type"]) => setNewState({ ...newState, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lodgement">Lodgement</SelectItem>
                      <SelectItem value="construction">Construction</SelectItem>
                      <SelectItem value="closeout">Closeout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddState(false)}>Cancel</Button>
                <Button onClick={addState}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Gates Tab ──────────────────────────────────────────────────────── */}
      {activeTab === "gates" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Gates are checkpoints that must be satisfied before progressing.</p>
            <Button size="sm" variant="outline" onClick={() => setShowAddGate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Gate
            </Button>
          </div>

          {gates.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg border">No gates defined.</p>
          ) : (
            <div className="space-y-2">
              {gates.map((gate, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-semibold">Gate {gate.gateNumber}: {gate.name}</span>
                        </div>
                        {gate.description && <p className="text-xs text-muted-foreground mt-1 ml-6">{gate.description}</p>}
                        {gate.blockingConditions.length > 0 && (
                          <div className="ml-6 mt-2 space-y-0.5">
                            {gate.blockingConditions.map((c, ci) => (
                              <div key={ci} className="text-xs flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                {c}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteGate(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={showAddGate} onOpenChange={setShowAddGate}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Gate</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Gate Name</Label>
                  <Input placeholder="e.g. DA Lodgement Ready" value={newGate.name} onChange={(e) => setNewGate({ ...newGate, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input placeholder="Brief description" value={newGate.description} onChange={(e) => setNewGate({ ...newGate, description: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Blocking Conditions (one per line)</Label>
                  <Textarea
                    placeholder="All DA documents uploaded&#10;DA application fee paid&#10;Pre-lodgement issues resolved"
                    value={newGate.blockingConditions}
                    onChange={(e) => setNewGate({ ...newGate, blockingConditions: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddGate(false)}>Cancel</Button>
                <Button onClick={addGate}>Add Gate</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Transitions Tab ────────────────────────────────────────────────── */}
      {activeTab === "transitions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Transitions define allowed state changes and auto-generated tasks.</p>
            <Button size="sm" variant="outline" onClick={() => setShowAddTransition(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Transition
            </Button>
          </div>

          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg border">No transitions defined.</p>
          ) : (
            <div className="space-y-2">
              {transitions.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded border text-xs">
                  <Badge variant="outline" className="font-mono text-[10px]">{t.from}</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge variant="outline" className="font-mono text-[10px]">{t.to}</Badge>
                  {t.conditions.length > 0 && (
                    <span className="text-muted-foreground ml-2">({t.conditions.length} conditions)</span>
                  )}
                  {t.autoTasks.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{t.autoTasks.length} auto-task{t.autoTasks.length > 1 ? "s" : ""}</Badge>
                  )}
                  <Button variant="ghost" size="sm" className="ml-auto text-destructive h-5 w-5 p-0" onClick={() => deleteTransition(idx)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Dialog open={showAddTransition} onOpenChange={setShowAddTransition}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Transition</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">From State</Label>
                    <Select value={newTransition.from} onValueChange={(v) => setNewTransition({ ...newTransition, from: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {states.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">To State</Label>
                    <Select value={newTransition.to} onValueChange={(v) => setNewTransition({ ...newTransition, to: v })}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {states.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Conditions (one per line, optional)</Label>
                  <Textarea
                    placeholder="Gate conditions satisfied&#10;All documents uploaded"
                    value={newTransition.conditions}
                    onChange={(e) => setNewTransition({ ...newTransition, conditions: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <Label className="text-xs">Auto-generate Task (optional)</Label>
                  <Input
                    placeholder="Task title, e.g. Review DA response"
                    value={newTransition.autoTaskTitle}
                    onChange={(e) => setNewTransition({ ...newTransition, autoTaskTitle: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddTransition(false)}>Cancel</Button>
                <Button onClick={addTransition}>Add Transition</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Documents Tab ──────────────────────────────────────────────────── */}
      {activeTab === "docs" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Document checklist items required at each stage.</p>
            <Button size="sm" variant="outline" onClick={() => setShowAddDoc(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Document
            </Button>
          </div>

          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg border">No document requirements defined.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {docs.map((d, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded border text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className={`w-2 h-2 rounded-full shrink-0 ${d.required ? "bg-red-500" : "bg-gray-300"}`} />
                  <span className="truncate">{d.label}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{d.stage || "any"}</Badge>
                  <Button variant="ghost" size="sm" className="text-destructive h-4 w-4 p-0 shrink-0" onClick={() => deleteDoc(idx)}>
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Dialog open={showAddDoc} onOpenChange={setShowAddDoc}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Add Document Requirement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Document Type (code)</Label>
                  <Input placeholder="e.g. site_plan" className="font-mono" value={newDoc.docType} onChange={(e) => setNewDoc({ ...newDoc, docType: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input placeholder="e.g. Site Plan (1:200)" value={newDoc.label} onChange={(e) => setNewDoc({ ...newDoc, label: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Stage</Label>
                  <Select value={newDoc.stage || "da"} onValueChange={(v) => setNewDoc({ ...newDoc, stage: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="da">DA</SelectItem>
                      <SelectItem value="cc">CC</SelectItem>
                      <SelectItem value="oc">OC</SelectItem>
                      <SelectItem value="cdc">CDC</SelectItem>
                      <SelectItem value="ba">BA</SelectItem>
                      <SelectItem value="any">Any</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newDoc.required}
                    onChange={(e) => setNewDoc({ ...newDoc, required: e.target.checked })}
                    className="rounded"
                  />
                  <Label className="text-xs">Required (mandatory for lodgement)</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDoc(false)}>Cancel</Button>
                <Button onClick={addDoc}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ─── Action Bar ─────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-1.5" />
          {isSaving ? "Saving..." : "Save Template"}
        </Button>
      </div>
    </div>
  );
}
