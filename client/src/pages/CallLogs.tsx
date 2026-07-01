import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { logClientDownload } from "@/lib/userActivity";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  RefreshCw,
  Play,
  Pause,
  Clock,
  PhoneCall,
  Timer,
  TrendingUp,
  LinkIcon,
  StickyNote,
  Check,
  Pencil,
  PhoneMissed,
  CheckCircle2,
  PhoneForwarded,
  MessageSquare,
  MoreHorizontal,
  AlarmClock,
  AlarmClockOff,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatLeadName(firstName: string | null, lastName: string | null): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "";
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function settingToString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "template" in value) {
    return String((value as { template?: unknown }).template || "").trim();
  }
  return "";
}

function buildVocphoneAppUrl(template: string, call: {
  id: number;
  vocphoneCallId: string | null;
  recordingUrl: string | null;
  fromNumber: string | null;
  toNumber: string | null;
}) {
  if (!template) return "";
  const recordingUrl = `${window.location.origin}/api/vocphone/recordings/${call.id}`;
  const values: Record<string, string> = {
    callId: String(call.id),
    vocphoneCallId: call.vocphoneCallId || "",
    recordingUrl,
    rawRecordingUrl: call.recordingUrl || "",
    fromNumber: call.fromNumber || "",
    toNumber: call.toNumber || "",
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(values[key] ?? ""));
}

function openVocphoneApp(url: string) {
  if (!url) {
    toast.error("VOC app link is not configured");
    return;
  }
  window.location.href = url;
  window.setTimeout(() => {
    if (!document.hidden) {
      toast.message("If VOC did not open, check the configured VOC app link format.");
    }
  }, 1200);
}

// ─── Enhanced Audio Player with progress bar and seek ───────────────────────
function InlineAudioPlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setProgress(0);
    });
    audio.addEventListener("timeupdate", () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    });
    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          toast.error("Unable to play recording");
        });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = pct * audio.duration;
    setProgress(pct * 100);
  };

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <button
        type="button"
        onClick={togglePlay}
        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 text-primary" />
        ) : (
          <Play className="h-3 w-3 text-primary ml-0.5" />
        )}
      </button>
      <div
        ref={progressRef}
        onClick={handleSeek}
        className="flex-1 h-1.5 bg-muted rounded-full cursor-pointer relative overflow-hidden"
        title={duration ? `${Math.round(duration)}s` : ""}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary/60 rounded-full transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Link to Lead Dialog ────────────────────────────────────────────────────
function LinkToLeadDialog({
  open,
  onOpenChange,
  callId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: number;
  onLinked: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: searchResults } = trpc.crm.leads.searchAll.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );

  const linkMutation = trpc.vocphone.linkCallToLead.useMutation({
    onSuccess: () => {
      toast.success("Call linked to lead");
      onLinked();
      onOpenChange(false);
      setSearchQuery("");
    },
    onError: (err) => {
      toast.error(`Failed to link: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Call to Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads by name, phone, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {searchQuery.length >= 2 && (
            <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
              {searchResults && searchResults.length > 0 ? (
                searchResults.map((lead: any) => (
                  <button
                    key={lead.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    onClick={() => linkMutation.mutate({ callId, leadId: lead.id })}
                    disabled={linkMutation.isPending}
                  >
                    <div className="font-medium text-sm">
                      {[lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {lead.contactPhone && <span>{lead.contactPhone}</span>}
                      {lead.contactEmail && <span>{lead.contactEmail}</span>}
                      {lead.company && <span>{lead.company}</span>}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No leads found
                </div>
              )}
            </div>
          )}
          {searchQuery.length < 2 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Type at least 2 characters to search
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CallLogs() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [extensionFilter, setExtensionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Missed calls & reviewed filters
  const [missedOnly, setMissedOnly] = useState(false);
  const [reviewedFilter, setReviewedFilter] = useState<"all" | "reviewed" | "unreviewed">("all");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelectAll = () => {
    if (!data?.calls) return;
    if (selectedIds.size === data.calls.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.calls.map((c) => c.id)));
    }
  };
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Expand summary dialog state
  const [expandedSummary, setExpandedSummary] = useState<{ text: string; callId: number } | null>(null);

  // Link to lead dialog state
  const [linkCallId, setLinkCallId] = useState<number | null>(null);

  // Callback SMS dialog state
  const [callbackSmsTarget, setCallbackSmsTarget] = useState<{ callId: number; phone: string; leadId: number | null; leadFirstName: string | null; leadLastName: string | null } | null>(null);
  const [smsBody, setSmsBody] = useState("");

  // Debounce search input
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
    setDebounceTimer(timer);
  };

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    direction: direction as "all" | "inbound" | "outbound",
    extension: extensionFilter !== "all" ? Number(extensionFilter) : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    missedOnly: missedOnly || undefined,
    reviewedFilter,
    page,
    pageSize,
  }), [debouncedSearch, direction, extensionFilter, dateFrom, dateTo, missedOnly, reviewedFilter, page, pageSize]);

  const { data, isLoading } = trpc.vocphone.getAllCalls.useQuery(queryInput);
  const { data: recordingAppTemplateSetting } = trpc.globalSettings.get.useQuery({
    key: "vocphoneRecordingAppUrlTemplate",
  });
  const recordingAppTemplate = settingToString(recordingAppTemplateSetting);

  // Get extensions for filter dropdown
  const { data: extensions } = trpc.vocphone.getExtensions.useQuery();

  // Get last sync timestamp
  const { data: syncData } = trpc.vocphone.getLastSyncTimestamp.useQuery();

  // Get KPI stats
  const { data: stats } = trpc.vocphone.getCallStats.useQuery();

  // Get call volume trend
  const [volumeDays, setVolumeDays] = useState<14 | 30 | 60>(14);
  const { data: volumeData, isLoading: volumeLoading } = trpc.vocphone.getCallVolume.useQuery({ days: volumeDays });

  // Get missed call count for badge
  const { data: missedCount } = trpc.vocphone.getMissedCallCount.useQuery();

  const utils = trpc.useUtils();

  // Bulk mark reviewed mutation
  const bulkReview = trpc.vocphone.bulkMarkReviewed.useMutation({
    onSuccess: (result) => {
      toast.success(`Marked ${result.count} calls as reviewed`);
      setSelectedIds(new Set());
      utils.vocphone.getAllCalls.invalidate();
      utils.vocphone.getMissedCallCount.invalidate();
      utils.vocphone.getCallStats.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed: ${err.message}`);
    },
  });

  // Notes editing state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  const updateNotes = trpc.vocphone.updateCallNotes.useMutation({
    onSuccess: () => {
      toast.success("Note saved");
      utils.vocphone.getAllCalls.invalidate();
      setEditingNoteId(null);
      setNoteText("");
    },
    onError: (err) => {
      toast.error(`Failed to save note: ${err.message}`);
    },
  });

  const startEditNote = useCallback((callId: number, existingNote: string | null) => {
    setEditingNoteId(callId);
    setNoteText(existingNote || "");
  }, []);

  const saveNote = useCallback((callId: number) => {
    updateNotes.mutate({ callId, notes: noteText });
  }, [noteText, updateNotes]);

  // Sync calls mutation
  const syncCalls = trpc.vocphone.syncCalls.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.synced} new calls`);
      utils.vocphone.getAllCalls.invalidate();
      utils.vocphone.getLastSyncTimestamp.invalidate();
      utils.vocphone.getCallStats.invalidate();
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  // Snooze mutations
  const snoozeCall = trpc.vocphone.snoozeCall.useMutation({
    onSuccess: () => {
      toast.success("Call snoozed — will reappear later");
      utils.vocphone.getAllCalls.invalidate();
      utils.vocphone.getMissedCallCount.invalidate();
    },
    onError: (err) => toast.error(`Snooze failed: ${err.message}`),
  });
  const unsnoozeCall = trpc.vocphone.unsnoozeCall.useMutation({
    onSuccess: () => {
      toast.success("Snooze removed");
      utils.vocphone.getAllCalls.invalidate();
      utils.vocphone.getMissedCallCount.invalidate();
    },
    onError: (err) => toast.error(`Unsnooze failed: ${err.message}`),
  });

  // SMS callback - get sender numbers, templates, and send mutation
  const { data: smsNumbers } = trpc.vocphone.getSmsNumbers.useQuery();
  const { data: smsTemplates } = trpc.vocphone.templates.list.useQuery();
  const activeTemplates = useMemo(
    () => (smsTemplates || []).filter((t: any) => t.isActive),
    [smsTemplates]
  );
  const sendSms = trpc.vocphone.sendSms.useMutation({
    onSuccess: () => {
      toast.success("SMS sent successfully");
      setCallbackSmsTarget(null);
      setSmsBody("");
    },
    onError: (err) => {
      toast.error(`SMS failed: ${err.message}`);
    },
  });

  const handleSendCallbackSms = () => {
    if (!callbackSmsTarget || !smsBody.trim()) return;
    const senderList = (smsNumbers as any)?.list;
    const sender = senderList?.[0]?.number || "";
    if (!sender) {
      toast.error("No SMS sender number configured");
      return;
    }
    sendSms.mutate({
      recipient: callbackSmsTarget.phone,
      sender,
      body: smsBody.trim(),
      leadId: callbackSmsTarget.leadId || undefined,
    });
  };

  const handleExportCsv = async () => {
    try {
      const result = await utils.vocphone.exportCallsCsv.fetch({
        search: debouncedSearch || undefined,
        direction: direction as "all" | "inbound" | "outbound",
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (result.count === 0) {
        toast.info("No calls to export");
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `call-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      logClientDownload({
        filename,
        source: "call_logs_export",
        entityType: "call_log",
        mimeType: "text/csv",
        metadata: { rowCount: result.count, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
      });
      toast.success(`Exported ${result.count} calls`);
    } catch {
      toast.error("Export failed");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setDirection("all");
    setExtensionFilter("all");
    setDateFrom("");
    setDateTo("");
    setMissedOnly(false);
    setReviewedFilter("all");
    setPage(1);
  };

  const hasFilters = debouncedSearch || direction !== "all" || extensionFilter !== "all" || dateFrom || dateTo || missedOnly || reviewedFilter !== "all";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and search all inbound and outbound calls
            {data ? ` \u00b7 ${data.total.toLocaleString()} total` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-2">
              {syncData?.lastSyncedAt && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Synced {formatRelativeTime(new Date(syncData.lastSyncedAt))}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncCalls.mutate({})}
                disabled={syncCalls.isPending}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncCalls.isPending ? "animate-spin" : ""}`} />
                Sync Calls
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <PhoneCall className="h-3.5 w-3.5" />
              Calls Today
            </div>
            <div className="text-2xl font-bold">{stats.callsToday}</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              This Week
            </div>
            <div className="text-2xl font-bold">{stats.callsThisWeek}</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Timer className="h-3.5 w-3.5" />
              Avg Duration
            </div>
            <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <PhoneCall className="h-3.5 w-3.5" />
              Busiest Ext (30d)
            </div>
            <div className="text-2xl font-bold">
              {stats.busiestExtension ? (
                <span>{stats.busiestExtension.userName || `Ext ${stats.busiestExtension.extension}`} <span className="text-sm font-normal text-muted-foreground">({stats.busiestExtension.calls} calls)</span></span>
              ) : (
                <span className="text-muted-foreground text-sm">{"\u2014"}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call Volume Trend Chart */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Call Volume</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              {([14, 30, 60] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setVolumeDays(d)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    volumeDays === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "oklch(0.72 0.17 155)" }} />Inbound</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "oklch(0.65 0.15 250)" }} />Outbound</span>
            </div>
          </div>
        </div>
        {volumeLoading ? (
          <div className="h-[180px] flex items-center justify-center">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !volumeData || volumeData.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
            No call data available for this period
          </div>
        ) : (
          <ChartContainer
            config={{
              inbound: { label: "Inbound", color: "oklch(0.72 0.17 155)" },
              outbound: { label: "Outbound", color: "oklch(0.65 0.15 250)" },
            }}
            className="h-[180px] w-full"
          >
            <AreaChart data={volumeData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="gradInbound" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.72 0.17 155)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.72 0.17 155)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradOutbound" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.15 250)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.65 0.15 250)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v + "T00:00:00");
                  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
                }}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="inbound" stroke="var(--color-inbound)" fill="url(#gradInbound)" strokeWidth={2} />
              <Area type="monotone" dataKey="outbound" stroke="var(--color-outbound)" fill="url(#gradOutbound)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search phone number or lead name..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={direction} onValueChange={(v) => { setDirection(v as any); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Calls</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>

        <Select value={extensionFilter} onValueChange={(v) => { setExtensionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Extension" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Extensions</SelectItem>
            {extensions && Array.isArray(extensions) && extensions.map((ext: any) => (
              <SelectItem key={ext.extension || ext.id} value={String(ext.extension || ext.id)}>
                {ext.userName || ext.name ? `${ext.userName || ext.name} (${ext.extension || ext.id})` : `Ext ${ext.extension || ext.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={reviewedFilter} onValueChange={(v) => { setReviewedFilter(v as any); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="unreviewed">Unreviewed</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={missedOnly ? "default" : "outline"}
          size="sm"
          onClick={() => { setMissedOnly(!missedOnly); setPage(1); }}
          className="gap-1.5"
        >
          <PhoneMissed className="h-3.5 w-3.5" />
          Missed
          {missedCount && missedCount.count > 0 && (
            <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px] leading-none">
              {missedCount.count}
            </Badge>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="w-[140px]"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="w-[140px]"
            placeholder="To"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 border rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkReview.mutate({ callIds: Array.from(selectedIds) })}
            disabled={bulkReview.isPending}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark as Reviewed
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px] px-3">
                <Checkbox
                  checked={data?.calls && data.calls.length > 0 && selectedIds.size === data.calls.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Ext</TableHead>
              <TableHead>Date / Time</TableHead>
              <TableHead className="min-w-[180px]">Summary</TableHead>
              <TableHead className="min-w-[150px]">Notes</TableHead>
              <TableHead className="w-[120px]">Recording</TableHead>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={12}>
                    <div className="h-10 bg-muted/50 rounded animate-pulse" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                  No calls found{hasFilters ? " matching your filters" : ""}
                </TableCell>
              </TableRow>
            ) : (
              data?.calls.map((call) => {
                const recordingAppUrl = call.recordingUrl
                  ? buildVocphoneAppUrl(recordingAppTemplate, call)
                  : "";

                return (
                <TableRow key={call.id} className={call.direction === "inbound" && call.duration === 0 && !call.reviewed ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                  <TableCell className="px-3">
                    <Checkbox
                      checked={selectedIds.has(call.id)}
                      onCheckedChange={() => toggleSelect(call.id)}
                    />
                  </TableCell>
                  <TableCell>
                    {call.direction === "inbound" && call.duration === 0 ? (
                      <PhoneMissed className="h-4 w-4 text-red-500" />
                    ) : call.direction === "inbound" ? (
                      <PhoneIncoming className="h-4 w-4 text-green-600" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                    )}
                  </TableCell>
                  <TableCell>
                    {call.leadId ? (
                      <Link href={`/crm/leads/${call.leadId}`} className="text-primary hover:underline font-medium">
                        {formatLeadName(call.leadFirstName, call.leadLastName) || "Lead #" + call.leadId}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLinkCallId(call.id)}
                        className="text-muted-foreground text-sm hover:text-primary flex items-center gap-1 transition-colors"
                        title="Link to a lead"
                      >
                        <LinkIcon className="h-3 w-3" />
                        Unlinked
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {call.direction === "inbound" ? call.fromNumber : call.toNumber}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {formatDuration(call.duration)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" title={call.extension ? `Ext ${call.extension}` : undefined}>
                    {call.extensionUserName || (call.extension ? `Ext ${call.extension}` : "\u2014")}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(call.createdAt).toLocaleDateString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    <span className="text-muted-foreground">
                      {new Date(call.createdAt).toLocaleTimeString("en-AU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[250px]">
                    {call.callSummary ? (
                      <button
                        type="button"
                        className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer truncate block w-full"
                        title="Click to expand"
                        onClick={() => setExpandedSummary({ text: call.callSummary!, callId: call.id })}
                      >
                        {call.callSummary}
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {editingNoteId === call.id ? (
                      <div className="flex flex-col gap-1">
                        <Textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add a note..."
                          className="text-xs min-h-[60px] resize-none"
                          autoFocus
                          maxLength={2000}
                        />
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => saveNote(call.id)}
                            disabled={updateNotes.isPending}
                          >
                            <Check className="h-3 w-3 mr-0.5" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => { setEditingNoteId(null); setNoteText(""); }}
                          >
                            <X className="h-3 w-3 mr-0.5" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full group flex items-start gap-1"
                        onClick={() => startEditNote(call.id, call.userNotes)}
                        title={call.userNotes || "Click to add a note"}
                      >
                        {call.userNotes ? (
                          <span className="truncate block">{call.userNotes}</span>
                        ) : (
                          <span className="flex items-center gap-1 opacity-50 group-hover:opacity-100">
                            <StickyNote className="h-3 w-3" />
                            Add note
                          </span>
                        )}
                        <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 mt-0.5" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    {call.recordingUrl ? (
                      <div className="flex items-center gap-1.5">
                        <InlineAudioPlayer url={`/api/vocphone/recordings/${call.id}`} />
                        {recordingAppUrl && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => openVocphoneApp(recordingAppUrl)}
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted hover:bg-primary/10 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Open in VOC app</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">{"\u2014"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {call.reviewed && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    {call.direction === "inbound" && call.duration === 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <PhoneForwarded className="h-3.5 w-3.5 text-orange-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              window.open(`tel:${call.fromNumber}`, "_self");
                            }}
                          >
                            <PhoneCall className="h-4 w-4 mr-2" />
                            Call {call.fromNumber}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCallbackSmsTarget({
                                callId: call.id,
                                phone: call.fromNumber || "",
                                leadId: call.leadId,
                                leadFirstName: call.leadFirstName || null,
                                leadLastName: call.leadLastName || null,
                              });
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            SMS {call.fromNumber}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => snoozeCall.mutate({ callId: call.id, durationMinutes: 120 })}
                          >
                            <AlarmClock className="h-4 w-4 mr-2" />
                            Snooze 2 hours
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => snoozeCall.mutate({ callId: call.id, durationMinutes: 240 })}
                          >
                            <AlarmClock className="h-4 w-4 mr-2" />
                            Snooze 4 hours
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => snoozeCall.mutate({ callId: call.id, durationMinutes: 480 })}
                          >
                            <AlarmClock className="h-4 w-4 mr-2" />
                            Snooze 8 hours
                          </DropdownMenuItem>
                          {call.snoozedUntil && new Date(call.snoozedUntil) > new Date() && (
                            <DropdownMenuItem
                              onClick={() => unsnoozeCall.mutate({ callId: call.id })}
                            >
                              <AlarmClockOff className="h-4 w-4 mr-2" />
                              Remove snooze
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} {"\u00b7"} Showing {data.calls.length} of {data.total.toLocaleString()} calls
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Expanded Summary Dialog */}
      <Dialog open={!!expandedSummary} onOpenChange={(open) => { if (!open) setExpandedSummary(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Call Summary</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
            {expandedSummary?.text}
          </div>
        </DialogContent>
      </Dialog>

      {/* Link to Lead Dialog */}
      <LinkToLeadDialog
        open={!!linkCallId}
        onOpenChange={(open) => { if (!open) setLinkCallId(null); }}
        callId={linkCallId ?? 0}
        onLinked={() => {
          utils.vocphone.getAllCalls.invalidate();
          utils.vocphone.getCallStats.invalidate();
        }}
      />

      {/* Callback SMS Dialog */}
      <Dialog open={!!callbackSmsTarget} onOpenChange={(open) => { if (!open) { setCallbackSmsTarget(null); setSmsBody(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Send SMS Callback
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">To:</span>{" "}
              <span className="font-mono font-medium">{callbackSmsTarget?.phone}</span>
            </div>
            {activeTemplates.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Quick Template</label>
                <div className="flex flex-wrap gap-1.5">
                  {activeTemplates.map((tmpl: any) => (
                    <Button
                      key={tmpl.id}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        let text = tmpl.body;
                        const firstName = callbackSmsTarget?.leadFirstName || "";
                        const lastName = callbackSmsTarget?.leadLastName || "";
                        const fullName = [firstName, lastName].filter(Boolean).join(" ");
                        text = text.replace(/\{\{firstName\}\}/g, firstName);
                        text = text.replace(/\{\{lastName\}\}/g, lastName);
                        text = text.replace(/\{\{fullName\}\}/g, fullName);
                        text = text.replace(/\{\{phone\}\}/g, callbackSmsTarget?.phone || "");
                        setSmsBody(text);
                      }}
                    >
                      {tmpl.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <Textarea
              placeholder="Type your message or select a template above..."
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              rows={4}
              maxLength={480}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{smsBody.length}/480</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCallbackSmsTarget(null); setSmsBody(""); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendCallbackSms}
                  disabled={!smsBody.trim() || sendSms.isPending}
                >
                  {sendSms.isPending ? "Sending..." : "Send SMS"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
