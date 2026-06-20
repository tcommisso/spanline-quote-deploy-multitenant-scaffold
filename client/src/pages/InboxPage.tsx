/**
 * Inbox Page — Shared Inbox / Central Email Hub
 * List view with filters, SLA highlights, assignment, tags, bulk actions, and thread navigation
 */
import { useState, useMemo, useCallback } from "react";
import { HelpLink } from "@/components/HelpLink";
import { trpc } from "@/lib/trpc";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import {
  Inbox, Mail, Star, StarOff, Search, Filter, RefreshCw,
  User, Tag, Clock, AlertTriangle, AlertCircle, ChevronRight,
  Paperclip, MailPlus, X, CheckCheck,
  Trash2, UserPlus, TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  INBOX_TICKET_CHANNEL_LABELS,
  INBOX_TICKET_PRIORITY_LABELS,
  INBOX_TICKET_STATUS_LABELS,
  type InboxTicketChannel,
  type InboxTicketPriority,
  type InboxTicketStatus,
} from "@shared/inbox-ticket";

type StatusFilter = "all" | InboxTicketStatus;
type DirectionFilter = "all" | "inbound" | "outbound";
type PriorityFilter = "all" | InboxTicketPriority;
type ChannelFilter = "all" | InboxTicketChannel;
type SlaFilter = "all" | "breached" | "warning" | "due" | "none";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  open: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
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

function summarizeSyncErrors(errors: string[] | undefined | null): string | undefined {
  if (!errors?.length) return undefined;
  const visible = errors.slice(0, 4);
  const extra = errors.length - visible.length;
  return [
    ...visible,
    extra > 0 ? `...and ${extra} more` : null,
  ].filter(Boolean).join("\n");
}

function parseFirstRecipient(toAddresses: unknown): string {
  if (!toAddresses) return "";
  if (Array.isArray(toAddresses)) return String(toAddresses[0] || "");
  if (typeof toAddresses !== "string") return "";
  try {
    const parsed = JSON.parse(toAddresses);
    if (Array.isArray(parsed)) return String(parsed[0] || "");
  } catch {
    // Legacy rows may contain a plain address string.
  }
  return toAddresses.split(/[;,]/)[0]?.trim() || toAddresses;
}

function displayStatusForMessage(msg: any): { key: string; label: string } | null {
  const key = msg.ticketStatus || msg.status || "open";
  return {
    key,
    label: msg.ticketStatusLabel || INBOX_TICKET_STATUS_LABELS[key as InboxTicketStatus] || key,
  };
}

function participantLabelForMessage(msg: any): string {
  if (msg.direction === "inbound") return msg.fromName || msg.fromAddress;
  const sender = msg.createdByName || msg.fromName || msg.fromAddress || "Sent";
  const recipient = parseFirstRecipient(msg.toAddresses);
  return recipient ? `${sender} -> ${recipient}` : sender;
}

export default function InboxPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [addressFilter, setAddressFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 30;

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryInput = useMemo(() => ({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    direction: directionFilter !== "all" ? (directionFilter as "inbound" | "outbound") : undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    channel: channelFilter !== "all" ? channelFilter : undefined,
    slaState: slaFilter !== "all" ? slaFilter : undefined,
    assignedToId: assignedFilter === "mine" ? user?.id : undefined,
    assignedState: assignedFilter === "unassigned" ? "unassigned" as const : undefined,
    isRead: undefined as boolean | undefined,
    receivedByAddress: addressFilter !== "all" ? addressFilter : undefined,
    tagIds: tagFilter ? [tagFilter] : undefined,
    limit: pageSize,
    offset: page * pageSize,
  }), [search, statusFilter, directionFilter, priorityFilter, channelFilter, slaFilter, assignedFilter, addressFilter, tagFilter, page, user?.id]);

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.inbox.list.useQuery(queryInput, {
    refetchInterval: 30000,
  });
  const { data: unreadCount } = trpc.inbox.unreadCount.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const { data: tags } = trpc.inbox.tags.list.useQuery();
  const { data: addresses } = trpc.inbox.addresses.list.useQuery();
  const { data: staffUsers } = trpc.inbox.staffUsers.useQuery();
  const { data: slaRule } = trpc.inbox.sla.getActive.useQuery();
  const syncNowMut = trpc.inbox.syncNow.useMutation();

  const toggleStarMut = trpc.inbox.toggleStar.useMutation({
    onSuccess: () => { refetch(); },
  });
  const markAllReadMut = trpc.inbox.markAllRead.useMutation({
    onSuccess: () => { refetch(); toast.success("All tickets marked as read"); },
  });

  // Bulk mutations
  const bulkDeleteMut = trpc.inbox.bulkDeleteThreads.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} ticket${res.count > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      refetch();
      utils.inbox.unreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkAssignMut = trpc.inbox.bulkAssignThreads.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} ticket${res.count > 1 ? "s" : ""} assigned`);
      setSelectedIds(new Set());
      setShowAssignPicker(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkTagMut = trpc.inbox.bulkTagThreads.useMutation({
    onSuccess: (res) => {
      toast.success(`Tag applied to ${res.count} ticket${res.count > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setShowTagPicker(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkMarkReadMut = trpc.inbox.markThreadsRead.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} ticket${res.count > 1 ? "s" : ""} marked as read`);
      setSelectedIds(new Set());
      refetch();
      utils.inbox.unreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkUpdateTicketMut = trpc.inbox.bulkUpdateTickets.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} ticket${res.count > 1 ? "s" : ""} updated`);
      setSelectedIds(new Set());
      refetch();
      utils.inbox.unreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const messages = data?.messages || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const isAdmin = isAdminRole(user?.role || "");
  const allPageIds = useMemo(() => messages.map((m: any) => m.id), [messages]);
  const selectedThreadIds = useMemo(() => {
    const selected = messages
      .filter((m: any) => selectedIds.has(m.id) && m.threadId)
      .map((m: any) => m.threadId as string);
    return Array.from(new Set(selected));
  }, [messages, selectedIds]);
  const allSelected = allPageIds.length > 0 && allPageIds.every((id: number) => selectedIds.has(id));
  const someSelected = selectedThreadIds.length > 0;
  const hasActiveFilters = Boolean(search)
    || statusFilter !== "all"
    || directionFilter !== "all"
    || priorityFilter !== "all"
    || channelFilter !== "all"
    || slaFilter !== "all"
    || assignedFilter !== "all"
    || addressFilter !== "all"
    || tagFilter !== null;

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allPageIds.forEach((id: number) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allPageIds.forEach((id: number) => next.add(id));
        return next;
      });
    }
  }

  // SLA status calculation
  function getSlaStatus(msg: any): "ok" | "warning" | "escalation" | null {
    const status = msg.ticketStatus || msg.status;
    if (status === "waiting_customer" || status === "resolved" || status === "closed" || status === "spam") return null;
    if (msg.ticketSlaBreachedAt) return "escalation";
    if (msg.ticketSlaWarningAt && new Date(msg.ticketSlaWarningAt).getTime() <= Date.now()) return "warning";
    if (msg.ticketSlaDueAt) return "ok";
    if (!slaRule || msg.direction !== "inbound") return null;
    if (msg.status === "replied" || msg.status === "closed" || msg.status === "spam") return null;
    const ageMs = Date.now() - new Date(msg.createdAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours >= slaRule.escalationHours) return "escalation";
    if (ageHours >= slaRule.warningHours) return "warning";
    return "ok";
  }

  function formatTimeAgo(date: string | Date) {
    const d = new Date(date);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await syncNowMut.mutateAsync();
      if (result.errors?.length) {
        toast.warning(`Inbox sync completed with ${result.errors.length} issue${result.errors.length === 1 ? "" : "s"}`, {
          description: summarizeSyncErrors(result.errors),
          duration: 10000,
        });
      } else if (!result.results?.length) {
        toast.warning("No active Microsoft 365 inbox mailboxes are configured for this tenant");
      } else if (result.newMessages > 0) {
        toast.success(`Inbox synced: ${result.newMessages} new message${result.newMessages === 1 ? "" : "s"}`);
      } else {
        toast.success("Inbox is up to date");
      }
    } catch (err: any) {
      toast.error(err?.message || "Inbox sync failed");
    } finally {
      await refetch();
      utils.inbox.unreadCount.invalidate();
      setIsRefreshing(false);
    }
  }, [refetch, syncNowMut, utils.inbox.unreadCount]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Inbox className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">Inbox</h1><HelpLink section="inbox" tooltip="Help: Inbox" /></div>
            <p className="text-sm text-muted-foreground">
              {total} ticket{total !== 1 ? "s" : ""}
              {typeof unreadCount === "number" && unreadCount > 0 && (
                <span className="ml-2 text-primary font-medium">{unreadCount} unread</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {typeof unreadCount === "number" && unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMut.mutate()}
              disabled={markAllReadMut.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" /> Mark All Read
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing || syncNowMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing || syncNowMut.isPending ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setLocation("/inbox/compose")}>
            <MailPlus className="h-4 w-4 mr-1" /> Compose
          </Button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {someSelected && (
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary mr-2">
            {selectedThreadIds.length} ticket{selectedThreadIds.length !== 1 ? "s" : ""} selected
          </span>
          <Separator orientation="vertical" className="h-5" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkMarkReadMut.mutate({ threadIds: selectedThreadIds })}
            disabled={bulkMarkReadMut.isPending || selectedThreadIds.length === 0}
          >
            <CheckCheck className="h-4 w-4 mr-1" /> Mark Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAssignPicker(true)}
            disabled={bulkAssignMut.isPending || selectedThreadIds.length === 0}
          >
            <UserPlus className="h-4 w-4 mr-1" /> Assign
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTagPicker(true)}
            disabled={bulkTagMut.isPending || selectedThreadIds.length === 0}
          >
            <TagIcon className="h-4 w-4 mr-1" /> Tag
          </Button>
          <Select
            disabled={bulkUpdateTicketMut.isPending || selectedThreadIds.length === 0}
            onValueChange={(value) => bulkUpdateTicketMut.mutate({
              threadIds: selectedThreadIds,
              status: value as InboxTicketStatus,
            })}
          >
            <SelectTrigger className="h-8 w-[145px] text-xs bg-background">
              <SelectValue placeholder="Set Status" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INBOX_TICKET_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={bulkUpdateTicketMut.isPending || selectedThreadIds.length === 0}
            onValueChange={(value) => bulkUpdateTicketMut.mutate({
              threadIds: selectedThreadIds,
              priority: value as InboxTicketPriority,
            })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-background">
              <SelectValue placeholder="Set Priority" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INBOX_TICKET_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={bulkUpdateTicketMut.isPending || selectedThreadIds.length === 0}
            onValueChange={(value) => bulkUpdateTicketMut.mutate({
              threadIds: selectedThreadIds,
              channel: value as InboxTicketChannel,
            })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-background">
              <SelectValue placeholder="Set Channel" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INBOX_TICKET_CHANNEL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={bulkDeleteMut.isPending || selectedThreadIds.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <div className="sm:ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-1" /> Filters
          </Button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
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

            <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v as DirectionFilter); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Direction</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v as PriorityFilter); setPage(0); }}>
              <SelectTrigger className="w-[135px] h-8 text-xs">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                {Object.entries(INBOX_TICKET_PRIORITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v as ChannelFilter); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {Object.entries(INBOX_TICKET_CHANNEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={slaFilter} onValueChange={(v) => { setSlaFilter(v as SlaFilter); setPage(0); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="SLA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SLA</SelectItem>
                <SelectItem value="breached">Breached</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="due">Has due time</SelectItem>
                <SelectItem value="none">No SLA</SelectItem>
              </SelectContent>
            </Select>

            <Select value={assignedFilter} onValueChange={(v) => { setAssignedFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assigned</SelectItem>
                <SelectItem value="mine">Assigned to Me</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>

            {addresses && addresses.length > 0 && (
              <Select value={addressFilter} onValueChange={(v) => { setAddressFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Address" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Addresses</SelectItem>
                  {addresses.map((addr: any) => (
                    <SelectItem key={addr.id} value={addr.address}>
                      {addr.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {tags && tags.length > 0 && (
              <Select value={tagFilter?.toString() || "all"} onValueChange={(v) => { setTagFilter(v === "all" ? null : parseInt(v)); setPage(0); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {tags.map((tag: any) => (
                    <SelectItem key={tag.id} value={tag.id.toString()}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
              setStatusFilter("all");
              setDirectionFilter("all");
              setPriorityFilter("all");
              setChannelFilter("all");
              setSlaFilter("all");
              setAssignedFilter("all");
              setAddressFilter("all");
              setTagFilter(null);
              setSearch("");
              setPage(0);
            }}>
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Ticket List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Mail className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">No tickets found</p>
          <p className="text-sm">
            {hasActiveFilters ? "Try adjusting your filters" : "Your inbox queue is empty"}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Select All Header */}
          <div className="flex items-center gap-3 px-3 py-2 border-b">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all tickets on this page"
            />
            <span className="text-xs text-muted-foreground">
              {allSelected ? "Deselect all tickets" : "Select all tickets"}
            </span>
          </div>

          {messages.map((msg: any) => {
            const slaStatus = getSlaStatus(msg);
            const displayStatus = displayStatusForMessage(msg);
            const participantLabel = participantLabelForMessage(msg);
            const slaBg =
              slaStatus === "escalation" ? "border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20" :
              slaStatus === "warning" ? "border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20" :
              "";
            const isUnread = !msg.isRead;
            const isSelected = selectedIds.has(msg.id);

            return (
              <div
                key={msg.id}
                className={`group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent/50 ${slaBg} ${isUnread ? "bg-primary/[0.03]" : ""} ${isSelected ? "bg-primary/[0.08] ring-1 ring-primary/20" : ""}`}
                onClick={() => setLocation(`/inbox/thread/${encodeURIComponent(msg.threadId)}`)}
              >
                {/* Checkbox */}
                <div className="mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(msg.id)}
                    aria-label={`Select ticket from ${msg.fromName || msg.fromAddress}`}
                  />
                </div>

                {/* Star */}
                <button
                  className="mt-1 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStarMut.mutate({ id: msg.id });
                  }}
                >
                  {msg.isStarred ? (
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  ) : (
                    <StarOff className="h-4 w-4 text-muted-foreground/30 hover:text-amber-500" />
                  )}
                </button>

                {/* Read/Unread indicator */}
                <div className="mt-1 shrink-0">
                  {isUnread ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  ) : (
                    <div className="w-2.5 h-2.5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-sm truncate ${isUnread ? "font-semibold" : "font-medium"}`}>
                      {participantLabel}
                    </span>
                    {msg.direction === "outbound" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">Sent</Badge>
                    )}
                    {msg.receivedByAddress && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 max-w-[120px] truncate">
                        {(() => {
                          const addr = addresses?.find((a: any) => a.address === msg.receivedByAddress);
                          return addr?.displayName || msg.receivedByAddress.split("@")[0];
                        })()}
                      </Badge>
                    )}
                    {displayStatus && (
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${STATUS_COLORS[displayStatus.key] || ""}`}>
                        {displayStatus.label}
                      </Badge>
                    )}
                    {msg.ticketPriority && msg.ticketPriority !== "normal" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {INBOX_TICKET_PRIORITY_LABELS[msg.ticketPriority as InboxTicketPriority] || msg.ticketPriority}
                      </Badge>
                    )}
                    {msg.ticketChannel && msg.ticketChannel !== "email" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {INBOX_TICKET_CHANNEL_LABELS[msg.ticketChannel as InboxTicketChannel] || msg.ticketChannel}
                      </Badge>
                    )}
                    {slaStatus === "warning" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger>
                          <TooltipContent>SLA Warning — needs reply</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {slaStatus === "escalation" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger><AlertCircle className="h-3.5 w-3.5 text-red-500" /></TooltipTrigger>
                          <TooltipContent>SLA Escalation — overdue!</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  <p className={`text-sm truncate ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                    {msg.subject || "(no subject)"}
                  </p>

                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {msg.matchedClientEmail && (
                      <span className="flex items-center gap-1 text-primary/70">
                        <User className="h-3 w-3" />
                        {msg.matchedClientEmail}
                      </span>
                    )}
                    {msg.assignedToName && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {msg.assignedToName}
                      </span>
                    )}
                    {msg.ticketQueue && (
                      <span className="capitalize">
                        Queue: {String(msg.ticketQueue).replace(/_/g, " ")}
                      </span>
                    )}
                    {msg.ticketWaitingOn && (
                      <span>
                        {WAITING_ON_LABELS[msg.ticketWaitingOn] || msg.ticketWaitingOn}
                      </span>
                    )}
                    {(msg.ticketLastResponderName || msg.ticketLastResponderEmail) && (
                      <span>
                        Last: {msg.ticketLastResponderName || msg.ticketLastResponderEmail}
                      </span>
                    )}
                    {msg.ticketSlaMetric && (
                      <span>
                        SLA: {String(msg.ticketSlaMetric).replace(/_/g, " ")}
                      </span>
                    )}
                    {msg.threadMessageCount > 1 && (
                      <span>
                        {msg.threadMessageCount} messages
                      </span>
                    )}
                    {msg.threadUnreadCount > 0 && (
                      <span className="text-primary font-medium">
                        {msg.threadUnreadCount} unread
                      </span>
                    )}
                    {Array.isArray(msg.tags) && msg.tags.slice(0, 3).map((tag: any) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="h-4 px-1.5 py-0 text-[10px] font-normal"
                        style={{ borderColor: tag.color || undefined, color: tag.color || undefined }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {Array.isArray(msg.tags) && msg.tags.length > 3 && (
                      <span>+{msg.tags.length - 3} tags</span>
                    )}
                    {msg.attachments && JSON.parse(typeof msg.attachments === "string" ? msg.attachments : JSON.stringify(msg.attachments)).length > 0 && (
                      <Paperclip className="h-3 w-3" />
                    )}
                  </div>
                </div>

                {/* Time */}
                <div className="text-xs text-muted-foreground shrink-0 text-right mt-1">
                  <span>{formatTimeAgo(msg.createdAt)}</span>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground/30 mt-1 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          bulkDeleteMut.mutate({ threadIds: selectedThreadIds });
          setShowDeleteConfirm(false);
        }}
        isPending={bulkDeleteMut.isPending}
        title="Delete Tickets"
        description={`Are you sure you want to permanently delete ${selectedThreadIds.length} ticket${selectedThreadIds.length > 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel="Delete"
      />

      {/* Assign Picker Popover */}
      {showAssignPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAssignPicker(false)}>
          <div className="bg-background rounded-lg shadow-lg p-4 w-[320px] max-h-[400px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Assign {selectedThreadIds.length} ticket{selectedThreadIds.length > 1 ? "s" : ""} to:</h3>
            <div className="space-y-1">
              <button
                className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm"
                onClick={() => bulkAssignMut.mutate({ threadIds: selectedThreadIds, assignedToId: null, assignedToName: null })}
              >
                <span className="text-muted-foreground">Unassign</span>
              </button>
              {staffUsers?.map((staff: any) => (
                <button
                  key={staff.id}
                  className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm flex items-center gap-2"
                  onClick={() => bulkAssignMut.mutate({ threadIds: selectedThreadIds, assignedToId: staff.id, assignedToName: staff.name })}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  {staff.name}
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAssignPicker(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Picker Popover */}
      {showTagPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTagPicker(false)}>
          <div className="bg-background rounded-lg shadow-lg p-4 w-[320px] max-h-[400px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">Apply tag to {selectedThreadIds.length} ticket{selectedThreadIds.length > 1 ? "s" : ""}:</h3>
            <div className="space-y-1">
              {tags && tags.length > 0 ? tags.map((tag: any) => (
                <button
                  key={tag.id}
                  className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm flex items-center gap-2"
                  onClick={() => bulkTagMut.mutate({ threadIds: selectedThreadIds, tagId: tag.id })}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              )) : (
                <p className="text-sm text-muted-foreground px-3 py-2">No tags configured. Create tags in Inbox Settings.</p>
              )}
            </div>
            <div className="mt-3 pt-3 border-t">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowTagPicker(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
