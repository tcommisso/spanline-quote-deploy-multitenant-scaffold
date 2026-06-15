import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, CheckCircle2, Clock, User } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  skipped: "bg-gray-50 text-gray-500",
  blocked: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-500",
  medium: "text-blue-500",
  high: "text-amber-500",
  urgent: "text-red-500",
};

export function ApprovalTasksTab({ projectId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", taskType: "custom", priority: "medium", dueAt: "" });

  const { data: tasks, isLoading } = trpc.approvals.tasks.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createTask = trpc.approvals.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setShowNew(false);
      setNewForm({ title: "", taskType: "custom", priority: "medium", dueAt: "" });
      utils.approvals.tasks.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTask = trpc.approvals.tasks.update.useMutation({
    onSuccess: () => {
      utils.approvals.tasks.list.invalidate({ projectId });
    },
  });

  const handleCreate = () => {
    if (!newForm.title) {
      toast.error("Title is required");
      return;
    }
    createTask.mutate({
      projectId,
      title: newForm.title,
      taskType: newForm.taskType as any,
      priority: newForm.priority as any,
      dueAt: newForm.dueAt || undefined,
    });
  };

  const toggleComplete = (task: any) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTask.mutate({
      id: task.id,
      projectId,
      data: { status: newStatus },
    });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tasks</h3>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  placeholder="Task title"
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newForm.taskType} onValueChange={(v) => setNewForm({ ...newForm, taskType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="signature">Signature</SelectItem>
                    <SelectItem value="lodgement">Lodgement</SelectItem>
                    <SelectItem value="payment">Payment</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="notification">Notification</SelectItem>
                    <SelectItem value="gate_check">Gate Check</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={newForm.priority} onValueChange={(v) => setNewForm({ ...newForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={newForm.dueAt}
                  onChange={(e) => setNewForm({ ...newForm, dueAt: e.target.value })}
                />
              </div>
              <Button onClick={handleCreate} disabled={createTask.isPending} className="w-full">
                {createTask.isPending ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No tasks yet. Tasks will be auto-generated from workflow templates or can be created manually.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any) => (
            <Card key={task.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => toggleComplete(task)} className="shrink-0">
                    {task.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className={`font-medium text-sm truncate ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={PRIORITY_COLORS[task.priority] || ""}>{task.priority}</span>
                      {task.assignedToName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {task.assignedToName}
                        </span>
                      )}
                      {task.dueAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(task.dueAt).toLocaleDateString()}
                        </span>
                      )}
                      {task.autoGenerated && <Badge variant="outline" className="text-xs py-0">Auto</Badge>}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={STATUS_COLORS[task.status] || ""}>
                  {task.status.replace(/_/g, " ")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
