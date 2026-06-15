import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, AlertTriangle, ListTodo } from "lucide-react";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function statusBadge(status: string) {
  switch (status) {
    case "completed": return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    case "in_progress": return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    case "blocked": return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Blocked</Badge>;
    default: return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  }
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return <Badge variant="destructive">Urgent</Badge>;
    case "high": return <Badge className="bg-orange-500">High</Badge>;
    case "medium": return <Badge variant="secondary">Medium</Badge>;
    default: return <Badge variant="outline">Low</Badge>;
  }
}

export default function ApprovalsAllTasks() {
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");

  const { data: tasks, isLoading } = trpc.approvals.allTasks.useQuery({
    status: status !== "all" ? status : undefined,
    priority: priority !== "all" ? priority : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="h-6 w-6" /> All Tasks
          </h1>
          <p className="text-muted-foreground text-sm">Tasks across all approval projects</p>
        </div>
        <Badge variant="secondary">{tasks?.length ?? 0} tasks</Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tasks table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tasks found matching the selected filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Task</th>
                    <th className="text-left p-3 font-medium">Project</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Priority</th>
                    <th className="text-left p-3 font-medium">Assigned To</th>
                    <th className="text-left p-3 font-medium">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Link href={`/approvals/projects/${task.projectId}`} className="font-medium hover:underline text-primary">
                          {task.title}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        <Link href={`/approvals/projects/${task.projectId}`} className="hover:underline">
                          {task.projectNumber || `#${task.projectId}`}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs capitalize">{task.taskType?.replace("_", " ") || "custom"}</Badge>
                      </td>
                      <td className="p-3">{statusBadge(task.status || "pending")}</td>
                      <td className="p-3">{priorityBadge(task.priority || "medium")}</td>
                      <td className="p-3 text-muted-foreground">{task.assignedToName || "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
