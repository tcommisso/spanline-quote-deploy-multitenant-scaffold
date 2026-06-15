import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bug, Lightbulb, ChevronDown, ChevronUp, Filter, Paperclip, ExternalLink, MessageSquare, Send, UserCheck } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "bg-blue-100 text-blue-800" },
  { value: "in_progress", label: "In Progress", color: "bg-yellow-100 text-yellow-800" },
  { value: "resolved", label: "Resolved", color: "bg-green-100 text-green-800" },
  { value: "closed", label: "Closed", color: "bg-gray-100 text-gray-800" },
  { value: "wont_fix", label: "Won't Fix", color: "bg-red-100 text-red-800" },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: "Feature Request",
  improvement: "Improvement",
  ui_ux: "UI/UX",
  performance: "Performance",
  other: "Other",
};

// ─── Notes Thread Component ──────────────────────────────────────────────────
function NotesThread({ submissionId }: { submissionId: number }) {
  const [newNote, setNewNote] = useState("");
  const { data: notes, isLoading, refetch } = trpc.support.listNotes.useQuery({ submissionId });

  const addNote = trpc.support.addNote.useMutation({
    onSuccess: () => {
      toast.success("Note added");
      setNewNote("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmitNote = () => {
    if (!newNote.trim()) return;
    addNote.mutate({ submissionId, content: newNote.trim() });
  };

  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="font-medium text-sm flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Admin Notes ({notes?.length ?? 0})
      </p>

      {/* Add Note Input */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Add an internal note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={2}
          className="text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmitNote();
            }
          }}
        />
        <Button
          size="sm"
          onClick={handleSubmitNote}
          disabled={!newNote.trim() || addNote.isPending}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Notes List */}
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : notes && notes.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {notes.map((note: any) => (
            <div key={note.id} className="bg-background border rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{note.userName || "Admin"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(note.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No notes yet. Add the first note above.</p>
      )}
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function AdminSupportSubmissions() {
  const [typeFilter, setTypeFilter] = useState<"bug" | "suggestion" | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: staff } = trpc.support.listStaff.useQuery();

  const { data: submissions, isLoading, refetch } = trpc.support.listSubmissions.useQuery(
    {
      type: typeFilter === "all" ? undefined : typeFilter,
      status: statusFilter === "all" ? undefined : statusFilter as any,
      assignedToUserId: assigneeFilter === "all" ? undefined : Number(assigneeFilter),
      limit: 100,
      offset: 0,
    }
  );

  const updateStatus = trpc.support.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated — notification sent to submitter");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignSubmission = trpc.support.assignSubmission.useMutation({
    onSuccess: () => {
      toast.success("Submission assigned");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStatusChange = (id: number, newStatus: string) => {
    updateStatus.mutate({ id, status: newStatus as any });
  };

  const handleAssign = (subId: number, userId: string) => {
    if (userId === "unassigned") {
      assignSubmission.mutate({ id: subId, assignedToUserId: null, assignedToUserName: null });
    } else {
      const staffMember = staff?.find((s: any) => s.id === Number(userId));
      assignSubmission.mutate({
        id: subId,
        assignedToUserId: Number(userId),
        assignedToUserName: staffMember?.name || staffMember?.email || null,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${opt?.color || "bg-gray-100 text-gray-800"}`}>
        {opt?.label || status}
      </span>
    );
  };

  const bugCount = submissions?.filter(s => s.type === "bug").length ?? 0;
  const suggestionCount = submissions?.filter(s => s.type === "suggestion").length ?? 0;
  const newCount = submissions?.filter(s => s.status === "new").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support Submissions</h1>
        <p className="text-muted-foreground mt-1">Manage bug reports and suggestions from your team</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <Bug className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bug Reports</p>
                <p className="text-2xl font-bold">{bugCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Lightbulb className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Suggestions</p>
                <p className="text-2xl font-bold">{suggestionCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Filter className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Needs Attention</p>
                <p className="text-2xl font-bold">{newCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bug">Bugs</SelectItem>
            <SelectItem value="suggestion">Suggestions</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Assigned To" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            {staff?.map((s: any) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name || s.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {submissions?.length ?? 0} submission{(submissions?.length ?? 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Submissions List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !submissions || submissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No submissions found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {submissions.map((sub: any) => {
            const isExpanded = expandedId === sub.id;
            return (
              <Card key={sub.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                >
                  {/* Type Icon */}
                  <div className="shrink-0">
                    {sub.type === "bug" ? (
                      <Bug className="h-5 w-5 text-red-500" />
                    ) : (
                      <Lightbulb className="h-5 w-5 text-amber-500" />
                    )}
                  </div>

                  {/* Title / Screen */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {sub.type === "bug" ? sub.screen : sub.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {sub.userName || sub.userEmail} &middot; {new Date(sub.createdAt).toLocaleDateString()}
                      {sub.assignedToUserName && (
                        <span className="ml-2 text-primary">→ {sub.assignedToUserName}</span>
                      )}
                    </p>
                  </div>

                  {/* Priority Badge */}
                  <Badge variant="outline" className={`shrink-0 text-xs ${PRIORITY_COLORS[sub.priority] || ""}`}>
                    {sub.priority}
                  </Badge>

                  {/* Status Badge */}
                  <div className="shrink-0">{getStatusBadge(sub.status)}</div>

                  {/* Expand Arrow */}
                  <div className="shrink-0">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 bg-muted/20 space-y-4">
                    {/* Status + Assign Row */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Status:</span>
                        <Select
                          value={sub.status}
                          onValueChange={(v) => handleStatusChange(sub.id, v)}
                        >
                          <SelectTrigger className="w-[150px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Assign To:</span>
                        <Select
                          value={sub.assignedToUserId ? String(sub.assignedToUserId) : "unassigned"}
                          onValueChange={(v) => handleAssign(sub.id, v)}
                        >
                          <SelectTrigger className="w-[180px] h-8">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {staff?.map((s: any) => (
                              <SelectItem key={s.id} value={String(s.id)}>{s.name || s.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <span className="text-xs text-muted-foreground italic">
                        Submitter notified on status change
                      </span>
                    </div>

                    {/* Bug-specific fields */}
                    {sub.type === "bug" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-muted-foreground">Screen</p>
                          <p>{sub.screen}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">Action / Button</p>
                          <p>{sub.action}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="font-medium text-muted-foreground">Steps to Reproduce</p>
                          <p className="whitespace-pre-wrap">{sub.stepsToReproduce}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">Expected Behaviour</p>
                          <p className="whitespace-pre-wrap">{sub.expectedBehaviour}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">Actual Behaviour</p>
                          <p className="whitespace-pre-wrap">{sub.actualBehaviour}</p>
                        </div>
                        {sub.description && (
                          <div className="md:col-span-2">
                            <p className="font-medium text-muted-foreground">Additional Details</p>
                            <p className="whitespace-pre-wrap">{sub.description}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Suggestion-specific fields */}
                    {sub.type === "suggestion" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-muted-foreground">Category</p>
                          <p>{CATEGORY_LABELS[sub.category] || sub.category}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">Title</p>
                          <p>{sub.title}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="font-medium text-muted-foreground">Description</p>
                          <p className="whitespace-pre-wrap">{sub.description}</p>
                        </div>
                      </div>
                    )}

                    {/* Attachments */}
                    {sub.attachments && Array.isArray(sub.attachments) && sub.attachments.length > 0 && (
                      <div className="space-y-2">
                        <p className="font-medium text-sm flex items-center gap-1.5">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          Attachments ({sub.attachments.length})
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {(sub.attachments as Array<{url: string; filename: string; mimeType: string; size: number}>).map((att, idx) => (
                            <a
                              key={idx}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative block rounded-lg overflow-hidden border bg-muted/30 hover:ring-2 hover:ring-primary/50 transition-all"
                            >
                              <img
                                src={att.url}
                                alt={att.filename}
                                className="w-full h-28 object-cover"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate px-1.5 py-1">{att.filename}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Admin Notes Thread */}
                    <NotesThread submissionId={sub.id} />

                    {/* Meta */}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t">
                      <span>Submitted by: {sub.userName || "Unknown"} ({sub.userEmail || "No email"})</span>
                      <span>Date: {new Date(sub.createdAt).toLocaleString()}</span>
                      <span>ID: #{sub.id}</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
