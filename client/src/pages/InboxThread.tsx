/**
 * Inbox Thread View — shows all messages in a thread with reply composer
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  appendTemplateBody,
  formatEmailTemplateLabel,
  formatTemplateKey,
  messageBodyToHtml,
  messageBodyToText,
  renderTemplateVariables,
} from "@/lib/email-template-utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Mail, MailOpen, Star, StarOff, User, Tag, Clock,
  Send, Paperclip, ChevronDown, ChevronUp, AlertTriangle, AlertCircle,
  UserPlus, X, Check, MoreHorizontal, Eye, EyeOff, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  deriveInboxTicketState,
  INBOX_TICKET_CHANNEL_LABELS,
  INBOX_TICKET_PRIORITY_LABELS,
  INBOX_TICKET_STATUS_LABELS,
  type InboxTicketChannel,
  type InboxTicketPriority,
  type InboxTicketStatus,
} from "@shared/inbox-ticket";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  open: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  replied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  waiting_customer: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  waiting_internal: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  customer_replied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  sent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  spam: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const WAITING_ON_LABELS: Record<string, string> = {
  customer: "Waiting on customer",
  internal: "Waiting internally",
  staff: "Waiting on staff",
  none: "No response needed",
};

export default function InboxThread({ threadId: rawThreadId, messageId }: { threadId?: string; messageId?: number }) {
  const initialThreadId = rawThreadId ? decodeURIComponent(rawThreadId) : "";
  const messageLookupId = Number.isFinite(messageId) ? messageId : undefined;
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");
  const [includeSignature, setIncludeSignature] = useState(true);
  const [includeRateUs, setIncludeRateUs] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [emailTemplateCategory, setEmailTemplateCategory] = useState("all");
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const threadQueryInput = messageLookupId ? { messageId: messageLookupId } : { threadId: initialThreadId };
  const { data: thread, isLoading, error: threadError, refetch } = trpc.inbox.getThread.useQuery(threadQueryInput, {
    enabled: Boolean(messageLookupId || initialThreadId),
  });
  const threadId = thread?.[0]?.threadId || initialThreadId;
  const { data: tags } = trpc.inbox.tags.list.useQuery();
  const { data: staffUsers } = trpc.inbox.staffUsers.useQuery();
  const { data: defaultSig } = trpc.inbox.signatures.getDefault.useQuery();
  const { data: addresses } = trpc.inbox.addresses.list.useQuery();
  const { data: internalNotes = [], refetch: refetchInternalNotes } = trpc.inbox.notes.list.useQuery(
    { threadId },
    { enabled: Boolean(threadId) },
  );
  const { data: replyTemplates = [] } = trpc.inbox.templates.list.useQuery();
  const { data: emailTemplates = [] } = trpc.crm.emailTemplates.list.useQuery();
  const emailTemplateCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const template of emailTemplates as any[]) {
      const category = String(template.category || "General").trim() || "General";
      categories.add(category);
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [emailTemplates]);
  const filteredEmailTemplates = useMemo(() => {
    const templates = emailTemplates as any[];
    if (emailTemplateCategory === "all") return templates;
    return templates.filter((template) => (String(template.category || "General").trim() || "General") === emailTemplateCategory);
  }, [emailTemplates, emailTemplateCategory]);
  const { data: presence = [] } = trpc.inbox.presence.list.useQuery(
    { threadId },
    { enabled: Boolean(threadId), refetchInterval: 30000 }
  );
  const { mutate: sendPresenceHeartbeat } = trpc.inbox.presence.heartbeat.useMutation();

  const replyMut = trpc.inbox.reply.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyOpen(false);
      setReplyHtml("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignMut = trpc.inbox.assignThread.useMutation({
    onSuccess: () => {
      toast.success("Assigned");
      setAssignDialogOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStatusMut = trpc.inbox.updateThreadStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updateTicketMut = trpc.inbox.updateTicket.useMutation({
    onSuccess: () => { toast.success("Ticket updated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const createNoteMut = trpc.inbox.notes.create.useMutation({
    onSuccess: () => {
      toast.success("Internal note added");
      setInternalNote("");
      refetchInternalNotes();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleStarMut = trpc.inbox.toggleStar.useMutation({
    onSuccess: () => refetch(),
  });

  const markReadMut = trpc.inbox.markRead.useMutation({
    onSuccess: () => refetch(),
  });

  const addTagMut = trpc.inbox.tags.addToMessage.useMutation({
    onSuccess: () => { toast.success("Tag added"); refetch(); },
  });

  const removeTagMut = trpc.inbox.tags.removeFromMessage.useMutation({
    onSuccess: () => { toast.success("Tag removed"); refetch(); },
  });

  // Auto-mark as read
  useEffect(() => {
    if (thread && thread.length > 0) {
      const unread = thread.filter((m: any) => !m.isRead && m.direction === "inbound");
      unread.forEach((m: any) => {
        markReadMut.mutate({ ids: [m.id] });
      });
    }
  }, [thread]);

  useEffect(() => {
    if (!threadId) return;
    const mode = replyOpen ? "replying" : "viewing";
    sendPresenceHeartbeat({ threadId, mode });
    const interval = window.setInterval(() => {
      sendPresenceHeartbeat({ threadId, mode });
    }, 30000);
    return () => window.clearInterval(interval);
  }, [threadId, replyOpen, sendPresenceHeartbeat]);

  // Get the first (original) message for context
  const firstMsg = thread?.[0];
  const lastInbound = thread?.filter((m: any) => m.direction === "inbound").slice(-1)[0];
  const latestMsg = thread?.[thread.length - 1];
  const ticket = (firstMsg as any)?.ticket || null;
  const ticketTags = (firstMsg as any)?.tags || [];
  const threadState = useMemo(() => {
    const messages = thread || [];
    if (ticket?.status) {
      const key = ticket.status as InboxTicketStatus;
      const latest = messages[messages.length - 1] as any;
      const hasOutbound = messages.some((m: any) => m.direction === "outbound");
      return {
        key,
        label: INBOX_TICKET_STATUS_LABELS[key] || key,
        replyFrom: latest?.direction === "inbound" && hasOutbound ? (latest.fromName || latest.fromAddress || null) : null,
      };
    }
    const state = deriveInboxTicketState(messages);
    const latest = messages[messages.length - 1] as any;
    if (!latest) return { ...state, replyFrom: null as string | null };
    const hasOutbound = messages.some((m: any) => m.direction === "outbound");
    return {
      ...state,
      replyFrom: latest.direction === "inbound" && hasOutbound ? (latest.fromName || latest.fromAddress || null) : null,
    };
  }, [thread, ticket?.status]);

  useEffect(() => {
    setResolutionNotes(ticket?.resolutionNotes || "");
  }, [ticket?.id, ticket?.resolutionNotes]);

  function applyTemplateVariables(value: string) {
    const replacements: Record<string, string> = {
      clientName: ticket?.requesterName || firstMsg?.fromName || firstMsg?.fromAddress || "",
      ticketSubject: firstMsg?.subject || "",
      jobNumber: ticket?.matchedJobId ? String(ticket.matchedJobId) : "",
      branch: ticket?.queue ? String(ticket.queue).replace(/_/g, " ") : "",
      constructionManager: ticket?.assignedToName || firstMsg?.assignedToName || "",
    };
    return renderTemplateVariables(value, replacements);
  }

  function applyReplyTemplate(templateId: string) {
    const template = replyTemplates.find((item: any) => String(item.id) === templateId);
    if (!template) return;
    const rawBody = template.bodyText || String(template.bodyHtml || "").replace(/<[^>]+>/g, "");
    const rendered = applyTemplateVariables(rawBody).trim();
    setReplyHtml((current) => appendTemplateBody(current, rendered));
    setReplyOpen(true);
    toast.success(`Inserted "${template.name}"`);
  }

  function applyEmailTemplate(templateId: string) {
    const template = (emailTemplates as any[]).find((item) => String(item.id) === templateId);
    if (!template) return;
    const rendered = applyTemplateVariables(template.body || "");
    setReplyHtml((current) => appendTemplateBody(current, rendered));
    setReplyOpen(true);
    toast.success(`Inserted "${formatEmailTemplateLabel(template)}"`);
  }

  function formatDate(date: string | Date) {
    const d = new Date(date);
    return d.toLocaleString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function handleReply() {
    if (!lastInbound && !latestMsg) return;
    const targetMsg = lastInbound || latestMsg;
    if (!targetMsg) return;
    replyMut.mutate({
      inReplyToMessageId: targetMsg.id,
      htmlBody: messageBodyToHtml(replyHtml),
      textBody: messageBodyToText(replyHtml),
      includeSignature,
      includeRateUs,
    });
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[200px] w-full mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (threadError) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            Could not load this ticket conversation
          </div>
          <p className="mt-2 text-sm">{threadError.message}</p>
          <p className="mt-2 text-xs opacity-80">
            Reference: {messageLookupId ? `message ${messageLookupId}` : initialThreadId || "unknown thread"}
          </p>
        </div>
      </div>
    );
  }

  if (!thread || thread.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Mail className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Thread not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">
            {firstMsg?.subject || "(no subject)"}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`text-xs ${STATUS_COLORS[threadState.key] || ""}`}>
              {threadState.label}
            </Badge>
            {threadState.replyFrom && (
              <span className="text-xs text-muted-foreground">
                Reply from {threadState.replyFrom}
              </span>
            )}
            {firstMsg?.receivedByAddress && (
              <Badge variant="secondary" className="text-xs">
                {(() => {
                  const addr = addresses?.find((a: any) => a.address === firstMsg.receivedByAddress);
                  return addr?.displayName || firstMsg.receivedByAddress;
                })()}
              </Badge>
            )}
            {firstMsg?.assignedToName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> {firstMsg.assignedToName}
              </span>
            )}
            {ticket?.priority && ticket.priority !== "normal" && (
              <Badge variant="outline" className="text-xs">
                {INBOX_TICKET_PRIORITY_LABELS[ticket.priority as InboxTicketPriority] || ticket.priority}
              </Badge>
            )}
            {ticket?.channel && ticket.channel !== "email" && (
              <Badge variant="outline" className="text-xs">
                {INBOX_TICKET_CHANNEL_LABELS[ticket.channel as InboxTicketChannel] || ticket.channel}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {thread.length} message{thread.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => firstMsg && toggleStarMut.mutate({ id: firstMsg.id })}>
            {firstMsg?.isStarred ? (
              <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
            ) : (
              <StarOff className="h-5 w-5 text-muted-foreground/40 hover:text-amber-500" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAssignDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Assign
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTagDialogOpen(true)}>
                <Tag className="h-4 w-4 mr-2" /> Manage Tags
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => updateStatusMut.mutate({ threadId, status: "open" })}>
                Reopen Ticket
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatusMut.mutate({ threadId, status: "waiting_internal" })}>
                Waiting Internally
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatusMut.mutate({ threadId, status: "resolved" })}>
                Resolve Ticket
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatusMut.mutate({ threadId, status: "closed" })}>
                Close Ticket
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatusMut.mutate({ threadId, status: "spam" })} className="text-red-600">
                Mark as Spam
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {presence.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {presence.map((entry: any) => entry.userName || "A team member").join(", ")}{" "}
          {presence.some((entry: any) => entry.mode === "replying") ? "is replying to" : "also has open"} this ticket.
        </div>
      )}

      <Separator className="mb-4" />

      {/* Ticket Metadata */}
      {ticket && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select
                  value={(ticket.priority || "normal") as InboxTicketPriority}
                  onValueChange={(value) => updateTicketMut.mutate({ threadId, priority: value as InboxTicketPriority })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Channel</Label>
                <Select
                  value={(ticket.channel || "email") as InboxTicketChannel}
                  onValueChange={(value) => updateTicketMut.mutate({ threadId, channel: value as InboxTicketChannel })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="portal">Portal</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={(ticket.status || threadState.key) as InboxTicketStatus}
                  onValueChange={(value) => updateTicketMut.mutate({ threadId, status: value as InboxTicketStatus })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="waiting_customer">Waiting on customer</SelectItem>
                    <SelectItem value="waiting_internal">Waiting internally</SelectItem>
                    <SelectItem value="customer_replied">Customer replied</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="spam">Spam</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Owner</Label>
                <div className="h-9 rounded-md border px-3 flex items-center text-sm">
                  {ticket.assignedToName || "Unassigned"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">SLA due</p>
                <p className={ticket.slaBreachedAt ? "text-red-600 font-medium" : ""}>
                  {ticket.slaDueAt ? `${formatDate(ticket.slaDueAt)}${ticket.slaMetric ? ` (${String(ticket.slaMetric).replace(/_/g, " ")})` : ""}` : "No SLA active"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Requester</p>
                <p>{ticket.requesterName || ticket.requesterEmail || "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resolved</p>
                <p>{ticket.resolvedAt ? `${formatDate(ticket.resolvedAt)}${ticket.resolvedByName ? ` by ${ticket.resolvedByName}` : ""}` : "Not resolved"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Queue</p>
                <p className="capitalize">{ticket.queue ? String(ticket.queue).replace(/_/g, " ") : "Unqueued"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Waiting on</p>
                <p>{WAITING_ON_LABELS[ticket.waitingOn as string] || ticket.waitingOn || "Staff"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last responder</p>
                <p>{ticket.lastResponderName || ticket.lastResponderEmail || "None"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">First response due</p>
                <p>{ticket.slaFirstResponseDueAt ? formatDate(ticket.slaFirstResponseDueAt) : "Complete or not required"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next response due</p>
                <p>{ticket.slaNextResponseDueAt ? formatDate(ticket.slaNextResponseDueAt) : "No customer response waiting"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resolution due</p>
                <p>{ticket.slaResolutionDueAt ? formatDate(ticket.slaResolutionDueAt) : "No resolution timer"}</p>
              </div>
            </div>

            {ticketTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ticketTags.map((tag: any) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Resolution notes</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
                placeholder="Capture outcome, next step, or resolution summary..."
                className="min-h-[72px]"
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateTicketMut.isPending}
                  onClick={() => updateTicketMut.mutate({ threadId, resolutionNotes })}
                >
                  Save Notes
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Internal notes</Label>
                <Textarea
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                  placeholder="Private note for staff..."
                  className="min-h-[72px]"
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!internalNote.trim() || createNoteMut.isPending}
                    onClick={() => createNoteMut.mutate({ threadId, body: internalNote.trim() })}
                  >
                    Add Note
                  </Button>
                </div>
              </div>

              {internalNotes.length > 0 && (
                <div className="space-y-2">
                  {internalNotes.map((note: any) => (
                    <div key={note.id} className="rounded-md border bg-muted/35 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{note.createdByName || "Staff"}</span>
                        <span>{formatDate(note.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{note.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      <div className="space-y-4">
        {thread.map((msg: any, idx: number) => (
          <Card key={msg.id} className={`${msg.direction === "outbound" ? "border-l-4 border-l-primary/40" : ""}`}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${msg.direction === "inbound" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"}`}>
                    {msg.direction === "inbound" ? (msg.fromName?.[0] || "?") : (msg.createdByName?.[0] || "S")}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {msg.direction === "inbound" ? (msg.fromName || msg.fromAddress) : (msg.createdByName || "Altaspan Team")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {msg.direction === "inbound" ? msg.fromAddress : `To: ${(() => { try { return JSON.parse(msg.toAddresses)?.[0]; } catch { return msg.toAddresses; } })()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {msg.direction === "outbound" && (
                    <Badge variant="outline" className="text-[10px]">Sent</Badge>
                  )}
                  {msg.autoReplySent && (
                    <Badge variant="secondary" className="text-[10px]">Auto-reply</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {msg.htmlBody ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm [&_img]:max-w-full [&_img]:h-auto"
                  dangerouslySetInnerHTML={{ __html: msg.htmlBody }}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.textBody || "(empty)"}</p>
              )}

              {/* Attachments */}
              {msg.attachments && (() => {
                try {
                  const atts = JSON.parse(typeof msg.attachments === "string" ? msg.attachments : JSON.stringify(msg.attachments));
                  if (atts.length === 0) return null;
                  return (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Paperclip className="h-3 w-3" /> {atts.length} attachment{atts.length !== 1 ? "s" : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {atts.map((att: any, i: number) => (
                          <a
                            key={i}
                            href={att.url || att.storageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs hover:bg-muted/80 transition-colors"
                          >
                            <Paperclip className="h-3 w-3" />
                            {att.filename || att.name || `Attachment ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reply Composer */}
      <div className="mt-6">
        {!replyOpen ? (
          <Button onClick={() => setReplyOpen(true)} className="w-full">
            <Send className="h-4 w-4 mr-2" /> Reply
          </Button>
        ) : (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Reply</p>
                <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Textarea
                ref={replyRef}
                placeholder="Type your reply..."
                value={replyHtml}
                onChange={(e) => setReplyHtml(e.target.value)}
                className="min-h-[120px] mb-3"
              />

              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-3">
                  {replyTemplates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="w-28 text-xs text-muted-foreground">Reply Templates</Label>
                      <Select onValueChange={applyReplyTemplate}>
                        <SelectTrigger className="h-8 w-[260px] max-w-full">
                          <SelectValue placeholder="Insert reply template" />
                        </SelectTrigger>
                        <SelectContent>
                          {replyTemplates.map((template: any) => (
                            <SelectItem key={template.id} value={String(template.id)}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {emailTemplates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="w-28 text-xs text-muted-foreground">Templates</Label>
                      <Select value={emailTemplateCategory} onValueChange={setEmailTemplateCategory}>
                        <SelectTrigger className="h-8 w-[180px] max-w-full">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {emailTemplateCategories.map((category) => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select onValueChange={applyEmailTemplate}>
                        <SelectTrigger className="h-8 w-[260px] max-w-full">
                          <SelectValue placeholder="Insert email template" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredEmailTemplates.map((template: any) => (
                            <SelectItem key={template.id} value={String(template.id)}>
                              {formatEmailTemplateLabel(template)}
                              {template.letterType ? ` (${formatTemplateKey(template.letterType)})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="include-sig"
                        checked={includeSignature}
                        onCheckedChange={setIncludeSignature}
                      />
                      <Label htmlFor="include-sig" className="text-xs">Signature</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="include-rateus"
                        checked={includeRateUs}
                        onCheckedChange={setIncludeRateUs}
                      />
                      <Label htmlFor="include-rateus" className="text-xs">Rate Us</Label>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleReply}
                  disabled={!replyHtml.trim() || replyMut.isPending}
                >
                  {replyMut.isPending ? "Sending..." : "Send Reply"}
                  <Send className="h-4 w-4 ml-2" />
                </Button>
              </div>

              {includeSignature && (
                <div className="mt-3 pt-3 border-t">
                  {defaultSig ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">Signature: {defaultSig.name}{(defaultSig as any).isCompanyDefault && <span className="ml-1 text-amber-600">(company default)</span>}</p>
                        <a href="/profile" className="text-xs text-primary hover:underline">Manage</a>
                      </div>
                      <div className="text-xs text-muted-foreground max-h-[60px] overflow-hidden" dangerouslySetInnerHTML={{ __html: defaultSig.htmlContent }} />
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No default signature. <a href="/profile" className="text-primary hover:underline">Create one</a></p>
                  )}
                </div>
              )}

              {/* Full Reply Preview Dialog */}
              <div className="mt-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      <Eye className="h-4 w-4 mr-2" /> Preview Reply
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[700px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Reply Preview</DialogTitle>
                    </DialogHeader>
                    <div className="border rounded-lg p-6 bg-white text-black">
                      <div className="border-b pb-3 mb-4">
                        <p className="text-sm"><span className="font-medium text-muted-foreground">Subject:</span> Re: {firstMsg?.subject || "(no subject)"}</p>
                      </div>
                      {replyHtml ? (
                        <div
                          className="prose prose-sm max-w-none text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: messageBodyToHtml(replyHtml) }}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          <span className="text-muted-foreground italic">No message body</span>
                        </div>
                      )}
                      {includeSignature && defaultSig && (
                        <div className="mt-6 pt-4 border-t">
                          <div dangerouslySetInnerHTML={{ __html: defaultSig.htmlContent }} />
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {staffUsers?.map((su: any) => (
              <button
                key={su.id}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left"
                onClick={() => assignMut.mutate({ threadId, assignedToId: su.id, assignedToName: su.name })}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {su.name?.[0] || "?"}
                </div>
                <div>
                  <p className="text-sm font-medium">{su.name}</p>
                  <p className="text-xs text-muted-foreground">{su.email}</p>
                </div>
                {(ticket?.assignedToId || firstMsg?.assignedToId) === su.id && (
                  <Check className="h-4 w-4 text-primary ml-auto" />
                )}
              </button>
            ))}
            <Separator />
            <button
              className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left text-muted-foreground"
              onClick={() => assignMut.mutate({ threadId, assignedToId: null, assignedToName: null })}
            >
              <X className="h-4 w-4" />
              <span className="text-sm">Unassign</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {tags?.map((tag: any) => {
              const isSelected = ticketTags.some((currentTag: any) => currentTag.id === tag.id);
              return (
                <button
                  key={tag.id}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left"
                  onClick={() => {
                    if (!firstMsg) return;
                    if (isSelected) {
                      removeTagMut.mutate({ messageId: firstMsg.id, tagId: tag.id });
                    } else {
                      addTagMut.mutate({ messageId: firstMsg.id, tagId: tag.id });
                    }
                  }}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="text-sm">{tag.name}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary ml-auto" />}
                  {tag.description && (
                    <span className="text-xs text-muted-foreground ml-auto">{tag.description}</span>
                  )}
                </button>
              );
            })}
            {(!tags || tags.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tags defined. Create tags in Admin &gt; Inbox Settings.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
