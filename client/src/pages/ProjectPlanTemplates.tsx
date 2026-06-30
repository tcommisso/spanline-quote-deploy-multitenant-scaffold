import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { HelpLink } from "@/components/HelpLink";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  ClipboardList, Layers, CheckSquare, Star, Pencil, Copy, ArrowUp, ArrowDown
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskDraft {
  title: string;
  description: string;
  sortOrder: number;
  defaultColumn: "backlog" | "todo" | "in_progress" | "review" | "done";
  priority: "low" | "normal" | "high" | "urgent";
}

interface StageDraft {
  name: string;
  description: string;
  sortOrder: number;
  estimatedDays: number | null;
  tasks: TaskDraft[];
  expanded?: boolean;
}

interface TemplateDraft {
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  stages: StageDraft[];
}

const emptyTemplate: TemplateDraft = {
  name: "",
  description: "",
  isDefault: false,
  isActive: true,
  stages: [],
};

const emptyStage: StageDraft = {
  name: "",
  description: "",
  sortOrder: 0,
  estimatedDays: null,
  tasks: [],
  expanded: true,
};

const emptyTask: TaskDraft = {
  title: "",
  description: "",
  sortOrder: 0,
  defaultColumn: "todo",
  priority: "normal",
};

// ─── Sortable Stage Card ──────────────────────────────────────────────────────

function SortableTaskRow({
  id,
  task,
  si,
  ti,
  totalTasks,
  updateTask,
  removeTask,
  moveTask,
}: {
  id: string;
  task: TaskDraft;
  si: number;
  ti: number;
  totalTasks: number;
  updateTask: (stageIdx: number, taskIdx: number, updates: Partial<TaskDraft>) => void;
  removeTask: (stageIdx: number, taskIdx: number) => void;
  moveTask: (stageIdx: number, from: number, to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 mb-1">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="flex flex-col flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-3 w-3 p-0"
          disabled={ti === 0}
          onClick={() => moveTask(si, ti, ti - 1)}
          title="Move task up"
        >
          <ArrowUp className="w-2.5 h-2.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-3 w-3 p-0"
          disabled={ti === totalTasks - 1}
          onClick={() => moveTask(si, ti, ti + 1)}
          title="Move task down"
        >
          <ArrowDown className="w-2.5 h-2.5" />
        </Button>
      </div>
      <Input
        value={task.title}
        onChange={(e) => updateTask(si, ti, { title: e.target.value })}
        placeholder="Task title"
        className="flex-1 h-7 text-sm"
      />
      <Select
        value={task.defaultColumn}
        onValueChange={(v: any) => updateTask(si, ti, { defaultColumn: v })}
      >
        <SelectTrigger className="w-28 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="backlog">Backlog</SelectItem>
          <SelectItem value="todo">To Do</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="review">Review</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={task.priority}
        onValueChange={(v: any) => updateTask(si, ti, { priority: v })}
      >
        <SelectTrigger className="w-24 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-destructive flex-shrink-0"
        onClick={() => removeTask(si, ti)}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

function SortableStageCard({
  id,
  stage,
  si,
  totalStages,
  updateStage,
  removeStage,
  moveStage,
  addTask,
  removeTask,
  updateTask,
  moveTask,
}: {
  id: string;
  stage: StageDraft;
  si: number;
  totalStages: number;
  updateStage: (idx: number, updates: Partial<StageDraft>) => void;
  removeStage: (idx: number) => void;
  moveStage: (from: number, to: number) => void;
  addTask: (stageIdx: number) => void;
  removeTask: (stageIdx: number, taskIdx: number) => void;
  updateTask: (stageIdx: number, taskIdx: number, updates: Partial<TaskDraft>) => void;
  moveTask: (stageIdx: number, from: number, to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="border-l-4 border-l-primary/30">
      <CardContent className="p-3">
        {/* Stage Header */}
        <div className="flex items-center gap-2 mb-2">
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => updateStage(si, { expanded: !stage.expanded })}
          >
            {stage.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div className="flex flex-col gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4 p-0"
              disabled={si === 0}
              onClick={() => moveStage(si, si - 1)}
              title="Move up"
            >
              <ArrowUp className="w-3 h-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4 p-0"
              disabled={si === totalStages - 1}
              onClick={() => moveStage(si, si + 1)}
              title="Move down"
            >
              <ArrowDown className="w-3 h-3" />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground font-mono">#{si + 1}</span>
          <Input
            value={stage.name}
            onChange={(e) => updateStage(si, { name: e.target.value })}
            placeholder="Stage name (e.g. Site Prep)"
            className="flex-1 h-8"
          />
          <Input
            type="number"
            value={stage.estimatedDays ?? ""}
            onChange={(e) =>
              updateStage(si, { estimatedDays: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="Days"
            className="w-20 h-8"
            title="Estimated days"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeStage(si)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Stage Expanded Content */}
        {stage.expanded && (
          <div className="ml-8 space-y-2">
            <Textarea
              value={stage.description}
              onChange={(e) => updateStage(si, { description: e.target.value })}
              placeholder="Stage description/notes..."
              rows={1}
              className="text-sm"
            />

            {/* Tasks */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" /> Tasks ({stage.tasks.length})
                </span>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => addTask(si)}>
                  <Plus className="w-3 h-3 mr-1" /> Task
                </Button>
              </div>

              <TaskDndWrapper si={si} tasks={stage.tasks} updateTask={updateTask} removeTask={removeTask} moveTask={moveTask} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Task DnD Wrapper (separate DndContext for tasks within a stage) ─────────

function TaskDndWrapper({
  si,
  tasks,
  updateTask,
  removeTask,
  moveTask,
}: {
  si: number;
  tasks: TaskDraft[];
  updateTask: (stageIdx: number, taskIdx: number, updates: Partial<TaskDraft>) => void;
  removeTask: (stageIdx: number, taskIdx: number) => void;
  moveTask: (stageIdx: number, from: number, to: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const taskIds = tasks.map((_, ti) => `stage-${si}-task-${ti}`);

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = taskIds.indexOf(active.id as string);
      const newIndex = taskIds.indexOf(over.id as string);
      moveTask(si, oldIndex, newIndex);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {tasks.map((task, ti) => (
          <SortableTaskRow
            key={taskIds[ti]}
            id={taskIds[ti]}
            task={task}
            si={si}
            ti={ti}
            totalTasks={tasks.length}
            updateTask={updateTask}
            removeTask={removeTask}
            moveTask={moveTask}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// ─── Template Editor Dialog ──────────────────────────────────────────────────

function TemplateEditorDialog({
  open,
  onClose,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  editId: number | null;
}) {
  const [draft, setDraft] = useState<TemplateDraft>({ ...emptyTemplate });
  const utils = trpc.useUtils();

  // Load existing template data when editing
  const templateQuery = trpc.projectPlanTemplates.getById.useQuery(
    { id: editId! },
    {
      enabled: !!editId && open,
      refetchOnWindowFocus: false,
      staleTime: 0,
    }
  );

  // Set draft from loaded data using useEffect to avoid render-time setState issues
  useEffect(() => {
    if (editId && open && templateQuery.data) {
      setDraft({
        name: templateQuery.data.name,
        description: templateQuery.data.description || "",
        isDefault: templateQuery.data.isDefault,
        isActive: templateQuery.data.isActive,
        stages: templateQuery.data.stages.map((s: any, i: number) => ({
          name: s.name,
          description: s.description || "",
          sortOrder: s.sortOrder ?? i,
          estimatedDays: s.estimatedDays ?? null,
          expanded: false,
          tasks: s.tasks.map((t: any, j: number) => ({
            title: t.title,
            description: t.description || "",
            sortOrder: t.sortOrder ?? j,
            defaultColumn: t.defaultColumn || "todo",
            priority: t.priority || "normal",
          })),
        })),
      });
    } else if (!editId && open) {
      setDraft({ ...emptyTemplate });
    }
  }, [editId, open, templateQuery.data]);

  // Reset when dialog opens/closes
  const handleClose = () => {
    setDraft({ ...emptyTemplate });
    onClose();
  };

  const createMutation = trpc.projectPlanTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      utils.projectPlanTemplates.list.invalidate();
      handleClose();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.projectPlanTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      utils.projectPlanTemplates.list.invalidate();
      utils.projectPlanTemplates.getById.invalidate();
      handleClose();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!draft.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (draft.stages.some((s) => !s.name.trim())) {
      toast.error("All stages must have a name");
      return;
    }

    const payload = {
      name: draft.name,
      description: draft.description || null,
      isDefault: draft.isDefault,
      isActive: draft.isActive,
      stages: draft.stages.map((s, i) => ({
        name: s.name,
        description: s.description || null,
        sortOrder: i,
        estimatedDays: s.estimatedDays,
        tasks: s.tasks.map((t, j) => ({
          title: t.title,
          description: t.description || null,
          sortOrder: j,
          defaultColumn: t.defaultColumn,
          priority: t.priority,
        })),
      })),
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const addStage = () => {
    setDraft((d) => ({
      ...d,
      stages: [...d.stages, { ...emptyStage, sortOrder: d.stages.length }],
    }));
  };

  const removeStage = (idx: number) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.filter((_, i) => i !== idx),
    }));
  };

  const updateStage = (idx: number, updates: Partial<StageDraft>) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.map((s, i) => (i === idx ? { ...s, ...updates } : s)),
    }));
  };

  const moveStage = (fromIdx: number, toIdx: number) => {
    setDraft((d) => ({
      ...d,
      stages: arrayMove(d.stages, fromIdx, toIdx),
    }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const stageIds = draft.stages.map((_, i) => `stage-${i}`);

  const handleStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = stageIds.indexOf(active.id as string);
      const newIndex = stageIds.indexOf(over.id as string);
      moveStage(oldIndex, newIndex);
    }
  };

  const addTask = (stageIdx: number) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.map((s, i) =>
        i === stageIdx
          ? { ...s, tasks: [...s.tasks, { ...emptyTask, sortOrder: s.tasks.length }] }
          : s
      ),
    }));
  };

  const removeTask = (stageIdx: number, taskIdx: number) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.map((s, i) =>
        i === stageIdx
          ? { ...s, tasks: s.tasks.filter((_, j) => j !== taskIdx) }
          : s
      ),
    }));
  };

  const updateTask = (stageIdx: number, taskIdx: number, updates: Partial<TaskDraft>) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.map((s, i) =>
        i === stageIdx
          ? { ...s, tasks: s.tasks.map((t, j) => (j === taskIdx ? { ...t, ...updates } : t)) }
          : s
      ),
    }));
  };

  const moveTask = (stageIdx: number, fromIdx: number, toIdx: number) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.map((s, i) =>
        i === stageIdx
          ? { ...s, tasks: arrayMove(s.tasks, fromIdx, toIdx) }
          : s
      ),
    }));
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            {editId ? "Edit Template" : "Create Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Template Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Standard Patio Build"
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Brief description of when to use this template..."
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.isDefault}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))}
              />
              <Label>Default template</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.isActive}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
              />
              <Label>Active</Label>
            </div>
          </div>

          {/* Stages */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4" /> Stages ({draft.stages.length})
              </h3>
              <Button size="sm" variant="outline" onClick={addStage}>
                <Plus className="w-4 h-4 mr-1" /> Add Stage
              </Button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
              <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {draft.stages.map((stage, si) => (
                    <SortableStageCard
                      key={stageIds[si]}
                      id={stageIds[si]}
                      stage={stage}
                      si={si}
                      totalStages={draft.stages.length}
                      updateStage={updateStage}
                      removeStage={removeStage}
                      moveStage={moveStage}
                      addTask={addTask}
                      removeTask={removeTask}
                      updateTask={updateTask}
                      moveTask={moveTask}
                    />
                  ))}

                  {draft.stages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No stages yet. Click "Add Stage" to define the project plan.
                    </p>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : editId ? "Update Template" : "Create Template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ProjectPlanTemplates() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const templatesQuery = trpc.projectPlanTemplates.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.projectPlanTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.projectPlanTemplates.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const duplicateMutation = trpc.projectPlanTemplates.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success(`Template duplicated as "${data.name}"`);
      utils.projectPlanTemplates.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDuplicate = (id: number) => {
    duplicateMutation.mutate({ id });
  };

  const handleEdit = (id: number) => {
    setEditId(id);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditId(null);
    setEditorOpen(true);
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete template "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="container max-w-4xl py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6" /> Project Plan Templates
            <HelpLink section="construction-dashboard" tooltip="Help: Project Plans" />
          </h1>
          <p className="text-muted-foreground">
            Define reusable project plans with stages and tasks. Apply templates from Project Plan or client job screens after CRM conversion creates the job.
          </p>
        </div>
        <Button variant="brand" onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-1" /> New Template
        </Button>
      </div>

      {templatesQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !templatesQuery.data?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No templates yet. Create one to define reusable project plans.</p>
            <Button variant="brand" className="mt-4" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1" /> Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templatesQuery.data.map((tpl) => (
            <Card key={tpl.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{tpl.name}</h3>
                    {tpl.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="w-3 h-3 mr-1" /> Default
                      </Badge>
                    )}
                    {!tpl.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {tpl.description && (
                    <p className="text-sm text-muted-foreground mt-1">{tpl.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Created {new Date(tpl.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleDuplicate(tpl.id)} title="Duplicate template">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(tpl.id)} title="Edit template">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(tpl.id, tpl.name)}
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditId(null);
        }}
        editId={editId}
      />
    </div>
  );
}
