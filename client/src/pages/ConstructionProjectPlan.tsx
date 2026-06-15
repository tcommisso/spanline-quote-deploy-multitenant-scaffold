import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors,
  DragOverlay, DragStartEvent, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  KanbanSquare, Plus, GripVertical, Calendar, User, Trash2, Pencil,
  ListPlus, AlertTriangle, Clock, ChevronDown, ChevronLeft, ChevronRight, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";

const COLUMNS = [
  { id: "backlog", label: "Backlog", color: "border-t-slate-400", bgColor: "bg-slate-100 dark:bg-slate-800/40" },
  { id: "todo", label: "To Do", color: "border-t-blue-400", bgColor: "bg-blue-50 dark:bg-blue-900/20" },
  { id: "in_progress", label: "In Progress", color: "border-t-amber-400", bgColor: "bg-amber-50 dark:bg-amber-900/20" },
  { id: "review", label: "Review", color: "border-t-purple-400", bgColor: "bg-purple-50 dark:bg-purple-900/20" },
  { id: "done", label: "Done", color: "border-t-green-400", bgColor: "bg-green-50 dark:bg-green-900/20" },
] as const;

const PRIORITY_CONFIG: Record<string, { color: string; icon: any }> = {
  low: { color: "text-slate-500", icon: ChevronDown },
  normal: { color: "text-blue-500", icon: Clock },
  high: { color: "text-orange-500", icon: AlertTriangle },
  urgent: { color: "text-red-500", icon: AlertTriangle },
};

type ColumnId = typeof COLUMNS[number]["id"];

export default function ConstructionProjectPlan() {
  const isMobile = useIsMobile();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [createColumn, setCreateColumn] = useState<ColumnId>("todo");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [mobileColumn, setMobileColumn] = useState<ColumnId>("todo");

  const jobsQuery = trpc.construction.jobs.list.useQuery();
  const installersQuery = trpc.construction.installers.list.useQuery();
  const tasksQuery = trpc.constructionKanban.tasks.list.useQuery(
    { jobId: selectedJobId! },
    { enabled: !!selectedJobId }
  );

  const createTask = trpc.constructionKanban.tasks.create.useMutation({
    onSuccess: () => {
      tasksQuery.refetch();
      setShowCreateTask(false);
      toast.success("Task created");
    },
  });

  const updateTask = trpc.constructionKanban.tasks.update.useMutation({
    onSuccess: () => {
      tasksQuery.refetch();
      setEditingTask(null);
    },
  });

  const moveTask = trpc.constructionKanban.tasks.move.useMutation({
    onSuccess: () => tasksQuery.refetch(),
  });

  const deleteTask = trpc.constructionKanban.tasks.delete.useMutation({
    onSuccess: () => {
      tasksQuery.refetch();
      toast.success("Task deleted");
    },
  });

  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  const templatesQuery = trpc.projectPlanTemplates.listActive.useQuery(undefined, {
    enabled: showSeedDialog,
  });

  const seedFromTemplate = trpc.projectPlanTemplates.seedFromTemplate.useMutation({
    onSuccess: (data) => {
      tasksQuery.refetch();
      setShowSeedDialog(false);
      setSelectedTemplateId(null);
      toast.success(`Seeded "${data.templateName}": ${data.stagesCreated} stages, ${data.tasksCreated} tasks created`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to seed from template");
    },
  });

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const col of COLUMNS) map[col.id] = [];
    for (const task of (tasksQuery.data || [])) {
      if (map[task.column]) map[task.column].push(task);
    }
    return map;
  }, [tasksQuery.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeTask = useMemo(() => {
    if (!activeId) return null;
    return tasksQuery.data?.find(t => t.id === activeId) || null;
  }, [activeId, tasksQuery.data]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const taskId = Number(active.id);
    let targetColumn: string;
    const overIdStr = String(over.id);
    if (COLUMNS.some(c => c.id === overIdStr)) {
      targetColumn = overIdStr;
    } else {
      const overTask = tasksQuery.data?.find(t => t.id === Number(over.id));
      targetColumn = overTask?.column || "backlog";
    }

    const task = tasksQuery.data?.find(t => t.id === taskId);
    if (!task) return;

    const tasksInColumn = tasksByColumn[targetColumn] || [];
    const overIndex = tasksInColumn.findIndex(t => t.id === Number(over.id));
    const newPosition = overIndex >= 0 ? overIndex : tasksInColumn.length;

    if (task.column !== targetColumn || task.position !== newPosition) {
      moveTask.mutate({
        id: taskId,
        column: targetColumn as ColumnId,
        position: newPosition,
      });
    }
  }, [tasksQuery.data, tasksByColumn, moveTask]);

  // Swipe support for mobile column navigation
  const swipeRef = useSwipeTabs({
    tabs: COLUMNS.map(c => c.id),
    activeTab: mobileColumn,
    onTabChange: (tab) => setMobileColumn(tab as ColumnId),
    enabled: isMobile,
  });

  const handleMobileMove = (taskId: number, targetColumn: ColumnId) => {
    const tasksInTarget = tasksByColumn[targetColumn] || [];
    moveTask.mutate({
      id: taskId,
      column: targetColumn,
      position: tasksInTarget.length,
    });
    toast.success(`Moved to ${COLUMNS.find(c => c.id === targetColumn)?.label}`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <KanbanSquare className="h-6 w-6 md:h-7 md:w-7 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold">Project Plan</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedJobId ? String(selectedJobId) : ""}
            onValueChange={(v) => setSelectedJobId(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Select a job..." />
            </SelectTrigger>
            <SelectContent>
              {(jobsQuery.data || []).map((j: any) => (
                <SelectItem key={j.id} value={String(j.id)}>
                  {j.clientName} {j.quoteNumber ? `(#${j.quoteNumber})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedJobId ? (
        <Card>
          <CardContent className="p-8 md:p-12 text-center text-muted-foreground">
            <KanbanSquare className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-4 opacity-30" />
            <p className="text-base md:text-lg">Select a construction job to view its project plan</p>
            <p className="text-sm mt-1">Choose a job from the dropdown above to manage tasks on the Kanban board.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Action Bar */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => { setCreateColumn(isMobile ? mobileColumn : "todo"); setShowCreateTask(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Task
            </Button>
            {(tasksQuery.data || []).length === 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSeedDialog(true)}
              >
                <ListPlus className="h-4 w-4 mr-1" />
                Seed from Template
              </Button>
            )}

            {/* Seed from Template Dialog */}
            <Dialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Select a Template</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Choose a project plan template to seed stages and tasks for this job.
                  </p>
                  {templatesQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading templates...</p>
                  ) : !templatesQuery.data?.length ? (
                    <p className="text-sm text-muted-foreground">No active templates found. Create one in Admin → Project Plan Templates.</p>
                  ) : (
                    <div className="space-y-2">
                      {templatesQuery.data.map((tpl: any) => (
                        <button
                          key={tpl.id}
                          onClick={() => setSelectedTemplateId(tpl.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedTemplateId === tpl.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className="font-medium text-sm">{tpl.name}</div>
                          {tpl.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{tpl.description}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {tpl.stageCount || 0} stages · {tpl.taskCount || 0} tasks
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => setShowSeedDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!selectedTemplateId || seedFromTemplate.isPending}
                      onClick={() => {
                        if (selectedJobId && selectedTemplateId) {
                          seedFromTemplate.mutate({ jobId: selectedJobId, templateId: selectedTemplateId });
                        }
                      }}
                    >
                      {seedFromTemplate.isPending ? "Seeding..." : "Apply Template"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* ─── Mobile Kanban: Single Column View ─── */}
          {isMobile ? (
            <div ref={swipeRef} className="space-y-3">
              {/* Column Selector Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                {COLUMNS.map((col) => {
                  const count = tasksByColumn[col.id]?.length || 0;
                  const isActive = mobileColumn === col.id;
                  return (
                    <button
                      key={col.id}
                      onClick={() => setMobileColumn(col.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        isActive
                          ? `${col.color.replace("border-t-", "bg-").replace("-400", "-100")} dark:bg-opacity-30 text-foreground ring-2 ring-offset-1 ${col.color.replace("border-t-", "ring-")}`
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${col.color.replace("border-t-", "bg-")}`} />
                      {col.label}
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 min-w-[16px] justify-center">
                        {count}
                      </Badge>
                    </button>
                  );
                })}
              </div>

              {/* Navigation Arrows + Column Title */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={COLUMNS.findIndex(c => c.id === mobileColumn) === 0}
                  onClick={() => {
                    const idx = COLUMNS.findIndex(c => c.id === mobileColumn);
                    if (idx > 0) setMobileColumn(COLUMNS[idx - 1].id);
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${COLUMNS.find(c => c.id === mobileColumn)?.color.replace("border-t-", "bg-")}`} />
                  <h3 className="font-semibold text-base">
                    {COLUMNS.find(c => c.id === mobileColumn)?.label}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {tasksByColumn[mobileColumn]?.length || 0}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={COLUMNS.findIndex(c => c.id === mobileColumn) === COLUMNS.length - 1}
                  onClick={() => {
                    const idx = COLUMNS.findIndex(c => c.id === mobileColumn);
                    if (idx < COLUMNS.length - 1) setMobileColumn(COLUMNS[idx + 1].id);
                  }}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {/* Tasks in Active Column */}
              <div className={`rounded-lg border-t-4 ${COLUMNS.find(c => c.id === mobileColumn)?.color} p-3 space-y-3 min-h-[200px] ${COLUMNS.find(c => c.id === mobileColumn)?.bgColor}`}>
                {(tasksByColumn[mobileColumn] || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No tasks in this column</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => { setCreateColumn(mobileColumn); setShowCreateTask(true); }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
                    </Button>
                  </div>
                ) : (
                  (tasksByColumn[mobileColumn] || []).map((task: any) => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      currentColumn={mobileColumn}
                      onEdit={() => setEditingTask(task)}
                      onDelete={() => { if (confirm("Delete this task?")) deleteTask.mutate({ id: task.id }); }}
                      onMove={(targetCol) => handleMobileMove(task.id, targetCol)}
                    />
                  ))
                )}
              </div>

              {/* Swipe hint */}
              <p className="text-center text-[10px] text-muted-foreground">
                Swipe left/right to switch columns
              </p>
            </div>
          ) : (
            /* ─── Desktop Kanban: 5-Column Grid ─── */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-5 gap-4 min-h-[500px]">
                {COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    tasks={tasksByColumn[col.id] || []}
                    onAddTask={() => { setCreateColumn(col.id); setShowCreateTask(true); }}
                    onEditTask={setEditingTask}
                    onDeleteTask={(id) => { if (confirm("Delete this task?")) deleteTask.mutate({ id }); }}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreateTask} onOpenChange={setShowCreateTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <TaskForm
            installers={installersQuery.data || []}
            defaultColumn={createColumn}
            onSubmit={(data) => createTask.mutate({ ...data, jobId: selectedJobId! })}
            loading={createTask.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm
              installers={installersQuery.data || []}
              defaultColumn={editingTask.column}
              initialData={editingTask}
              onSubmit={(data) => updateTask.mutate({ id: editingTask.id, ...data })}
              loading={updateTask.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Mobile Task Card ─────────────────────────────────────────────────────────
function MobileTaskCard({
  task, currentColumn, onEdit, onDelete, onMove,
}: {
  task: any;
  currentColumn: ColumnId;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (targetColumn: ColumnId) => void;
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
  const PriorityIcon = priorityConfig.icon;

  const otherColumns = COLUMNS.filter(c => c.id !== currentColumn);

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">{task.title}</p>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              <span className={`flex items-center gap-1 text-[11px] font-medium ${priorityConfig.color}`}>
                <PriorityIcon className="h-3.5 w-3.5" />
                {task.priority}
              </span>
              {task.assignedToName && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  {task.assignedToName}
                </span>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(task.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-muted">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Move to another column */}
        <div className="mt-3 pt-2.5 border-t border-border/50">
          {!showMoveMenu ? (
            <button
              onClick={() => setShowMoveMenu(true)}
              className="flex items-center gap-1.5 text-[11px] text-primary font-medium hover:underline"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Move to...
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {otherColumns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => { onMove(col.id); setShowMoveMenu(false); }}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-colors hover:bg-muted ${col.color.replace("border-t-", "border-")}`}
                >
                  {col.label}
                </button>
              ))}
              <button
                onClick={() => setShowMoveMenu(false)}
                className="px-2 py-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Desktop Kanban Column ───────────────────────────────────────────────────
function KanbanColumn({
  column, tasks, onAddTask, onEditTask, onDeleteTask,
}: {
  column: typeof COLUMNS[number];
  tasks: any[];
  onAddTask: () => void;
  onEditTask: (task: any) => void;
  onDeleteTask: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border-t-4 ${column.color} bg-muted/30 ${isOver ? "ring-2 ring-primary/30" : ""}`}
    >
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{column.label}</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tasks.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddTask}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 p-2 pt-0 space-y-2 min-h-[100px] overflow-y-auto max-h-[600px]">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onEdit={() => onEditTask(task)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

// ─── Sortable Task Card ──────────────────────────────────────────────────────
function SortableTaskCard({ task, onEdit, onDelete }: { task: any; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} dragProps={{ ...attributes, ...listeners }} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

// ─── Task Card (Desktop) ────────────────────────────────────────────────────
function TaskCard({
  task, isDragging, dragProps, onEdit, onDelete,
}: {
  task: any;
  isDragging?: boolean;
  dragProps?: any;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
  const PriorityIcon = priorityConfig.icon;

  return (
    <Card className={`${isDragging ? "shadow-lg ring-2 ring-primary" : "hover:shadow-md"} transition-shadow`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-1.5">
          <button {...dragProps} className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">{task.title}</p>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`flex items-center gap-0.5 text-[10px] ${priorityConfig.color}`}>
                <PriorityIcon className="h-3 w-3" />
                {task.priority}
              </span>
              {task.assignedToName && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  {task.assignedToName}
                </span>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          </div>
          {onEdit && (
            <div className="flex gap-0.5">
              <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-0.5">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-0.5">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Task Form ───────────────────────────────────────────────────────────────
function TaskForm({
  installers, defaultColumn, initialData, onSubmit, loading,
}: {
  installers: any[];
  defaultColumn: string;
  initialData?: any;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    title: initialData?.title || "",
    description: initialData?.description || "",
    column: initialData?.column || defaultColumn,
    assignedTo: initialData?.assignedTo ? String(initialData.assignedTo) : "",
    dueDate: initialData?.dueDate ? new Date(initialData.dueDate).toISOString().slice(0, 10) : "",
    priority: initialData?.priority || "normal",
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Pour concrete footings" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Column</Label>
          <Select value={form.column} onValueChange={(v) => setForm({ ...form, column: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Assigned To</Label>
          <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {installers.map((i: any) => (
                <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Due Date</Label>
          <div className="flex gap-1 items-center">
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="flex-1" />
            {form.dueDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm({ ...form, dueDate: "" })} title="Clear date">&times;</Button>}
          </div>
        </div>
      </div>
      <Button
        className="w-full"
        onClick={() => onSubmit({
          title: form.title,
          description: form.description || undefined,
          column: form.column as any,
          assignedTo: form.assignedTo && form.assignedTo !== "none" ? Number(form.assignedTo) : undefined,
          dueDate: form.dueDate || undefined,
          priority: form.priority as any,
        })}
        disabled={loading || !form.title}
      >
        {loading ? "Saving..." : (initialData ? "Update Task" : "Create Task")}
      </Button>
    </div>
  );
}
