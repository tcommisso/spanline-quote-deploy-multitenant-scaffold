import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Users, Search, Phone, Mail,
  HardHat, CheckCircle2, Clock, AlertTriangle, Ban, Calendar, ChevronDown, Loader2,
  ArrowUpDown, ArrowUp, ArrowDown, Download, CheckSquare, Bookmark, Save, Trash2, X,
} from "lucide-react";
import { PullToRefresh } from "@/components/PullToRefresh";
import CollapsibleFilters from "@/components/CollapsibleFilters";
import { useAuth } from "@/_core/hooks/useAuth";

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  scheduled: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Clock, label: "Scheduled" },
  in_progress: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: HardHat, label: "In Progress" },
  on_hold: { color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", icon: AlertTriangle, label: "On Hold" },
  completed: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle2, label: "Completed" },
  cancelled: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: Ban, label: "Cancelled" },
};

const STATUS_FILTER_LABELS: Record<string, string> = {
  not_completed: "Not completed",
  all: "Active (excl. Completed)",
  all_incl_completed: "All statuses",
};

const PAYMENT_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  paid: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", label: "Paid" },
  partial: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", label: "Partial" },
  invoiced: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", label: "Invoiced" },
  unpaid: { color: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400", label: "Unpaid" },
};

import { formatCurrencyShort, formatCurrencyFull } from "@/lib/formatCurrency";
const formatCurrency = formatCurrencyShort;

const PAGE_SIZE = 50;

type ConstructionClientFilterSnapshot = {
  search: string;
  statusFilter: string;
  paymentFilter: string;
  baFilter: string;
  scheduledFilter: string;
  installerFilter: string;
  branchFilter: string;
  suburbFilter: string;
  fyFilter: number | null | "unset";
  monthFilter: number | null;
  sortField: string;
  sortDir: "asc" | "desc";
};

type ConstructionClientFilterPreset = {
  id: string;
  name: string;
  filters: ConstructionClientFilterSnapshot;
};

const DEFAULT_FILTERS: ConstructionClientFilterSnapshot = {
  search: "",
  statusFilter: "not_completed",
  paymentFilter: "all",
  baFilter: "all",
  scheduledFilter: "all",
  installerFilter: "all",
  branchFilter: "all",
  suburbFilter: "all",
  fyFilter: "unset",
  monthFilter: null,
  sortField: "clientName",
  sortDir: "asc",
};

export default function ConstructionClients() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("not_completed");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [baFilter, setBaFilter] = useState<string>("all");
  const [scheduledFilter, setScheduledFilter] = useState<string>("all");
  const [installerFilter, setInstallerFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [suburbFilter, setSuburbFilter] = useState<string>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBaStatus, setBulkBaStatus] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [allClients, setAllClients] = useState<any[]>([]);
  const presetStorageKey = `construction-client-filter-presets:${user?.id ?? user?.openId ?? "local"}`;
  const [filterPresets, setFilterPresets] = useState<ConstructionClientFilterPreset[]>([]);
  const [presetSelectValue, setPresetSelectValue] = useState("placeholder");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Load available FYs and default to current
  const fysQuery = trpc.constructionClients.availableFYs.useQuery();
  const currentFy = fysQuery.data?.currentFy;
  // "unset" = user hasn't chosen yet (default to currentFy), null = user chose "All Years"
  const [fyFilter, setFyFilter] = useState<number | null | "unset">("unset");

  // Month filter
  const [monthFilter, setMonthFilter] = useState<number | null>(null);

  // Use currentFy as default only when user hasn't made a selection yet
  const activeFy = fyFilter === "unset" ? (currentFy ?? null) : fyFilter;
  const filterOptionsQuery = trpc.constructionClients.filterOptions.useQuery(undefined, {
    enabled: fyFilter === "unset" ? currentFy != null : true,
  });

  const clientsQuery = trpc.constructionClients.list.useQuery({
    search: search || undefined,
    status: (statusFilter !== "all" && statusFilter !== "all_incl_completed") ? statusFilter as any : undefined,
    scheduled: scheduledFilter !== "all" ? scheduledFilter as any : undefined,
    installerId: installerFilter !== "all" ? Number(installerFilter) : undefined,
    branchId: branchFilter !== "all" ? (branchFilter === "unassigned" ? "unassigned" as const : Number(branchFilter)) : undefined,
    suburb: suburbFilter !== "all" ? suburbFilter : undefined,
    paymentStatus: paymentFilter !== "all" ? paymentFilter as any : undefined,
    baStatus: baFilter !== "all" ? baFilter as any : undefined,
    fyStartYear: activeFy ?? undefined,
    month: monthFilter ?? undefined,
    limit: PAGE_SIZE,
    offset,
    excludeCompleted: statusFilter === "all_incl_completed" ? false : undefined,
  }, { enabled: fyFilter === "unset" ? currentFy != null : true });

  // Approvals overdue threshold (configurable)
  const baThresholdQuery = trpc.globalSettings.getBaOverdueThreshold.useQuery();
  const overdueDays = baThresholdQuery.data ?? 30;

  // Accumulate results for "Load More" pattern
  useEffect(() => {
    if (clientsQuery.data?.clients) {
      if (offset === 0) {
        setAllClients(clientsQuery.data.clients);
      } else {
        setAllClients(prev => [...prev, ...clientsQuery.data!.clients]);
      }
    }
  }, [clientsQuery.data, offset]);

  // Reset pagination when filters change
  useEffect(() => {
    setOffset(0);
    setAllClients([]);
  }, [search, statusFilter, activeFy, monthFilter, paymentFilter, baFilter, scheduledFilter, installerFilter, branchFilter, suburbFilter]);

  const total = clientsQuery.data?.total || 0;
  const hasMore = allClients.length < total;

  const statusCountsQuery = trpc.constructionClients.statusCounts.useQuery(
    { fyStartYear: activeFy ?? undefined, month: monthFilter ?? undefined },
    { enabled: fyFilter === "unset" ? currentFy != null : true }
  );

  // Generate month options ordered by FY (Jul-Jun)
  const monthOptions = useMemo(() => {
    const FY_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return FY_MONTHS.map(m => ({
      value: m,
      label: MONTH_NAMES[m],
      fullLabel: activeFy != null
        ? `${MONTH_NAMES[m]} ${m >= 7 ? activeFy : (activeFy ?? 0) + 1}`
        : MONTH_NAMES[m],
    }));
  }, [activeFy]);

  // Summary stats from server (counts ALL jobs in the FY, not just paginated page)
  const totalCount = statusCountsQuery.data?.total || total;

  const fyOptions = fysQuery.data?.years || [];

  const displayClients = useMemo(() => allClients, [allClients]);

  // ─── Bulk Approvals Update ────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const bulkBaMut = trpc.crm.buildingAuthority.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated Approval status for ${data.updated} client(s)`);
      setSelectedIds(new Set());
      setSelectMode(false);
      setBulkBaStatus("");
      utils.constructionClients.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayClients.map((c: any) => c.id)));
    }
  };

  // Get leadIds for selected clients
  const selectedLeadIds = useMemo(() => {
    return displayClients
      .filter((c: any) => selectedIds.has(c.id) && c.leadId)
      .map((c: any) => c.leadId as number);
  }, [displayClients, selectedIds]);

  // ─── Column Sorting ────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<string>("clientName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "clientName" ? "asc" : "desc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const sortedClients = useMemo(() => {
    const list = [...displayClients];
    list.sort((a: any, b: any) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      // Handle priority ordering: high > medium > normal/low
      if (sortField === "priority") {
        const order: Record<string, number> = { high: 3, medium: 2, normal: 1, low: 0 };
        aVal = order[aVal] ?? 1;
        bVal = order[bVal] ?? 1;
      }
      // Handle date fields
      if (sortField === "scheduledStart") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      if (aVal == null) aVal = typeof bVal === "string" ? "" : 0;
      if (bVal == null) bVal = typeof aVal === "string" ? "" : 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [displayClients, sortField, sortDir]);

  const handleExportCsv = useCallback(() => {
    const rows = sortedClients;
    if (rows.length === 0) return;
    const headers = ["Client Name", "Account Number", "Branch", "Construction Manager", "Status", "Priority", "Scheduled Start", "Site Address", "Contract Value", "Invoiced", "Paid", "Progress %", "Installers", "Phone", "Email"];
    const csvRows = rows.map((c: any) => [
      c.clientName || "",
      c.clientNumber || "",
      c.branch || "",
      c.constructionManagerName || c.supervisorName || "",
      STATUS_CONFIG[c.status]?.label || c.status || "",
      c.priority || "normal",
      c.scheduledStart ? new Date(c.scheduledStart).toLocaleDateString("en-AU") : "",
      (c.siteAddress || "").replace(/,/g, " "),
      c.contractValue || 0,
      c.invoicedAmount || 0,
      c.paidAmount || 0,
      c.progressPercent || 0,
      (c.installerNames || []).join("; "),
      c.clientPhone || "",
      c.clientEmail || "",
    ]);
    const csv = [headers.join(","), ...csvRows.map(r => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `construction-clients${activeFy ? `-FY${activeFy}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedClients, activeFy]);

  const handleRefresh = useCallback(async () => {
    setOffset(0);
    setAllClients([]);
    await Promise.all([
      utils.constructionClients.list.invalidate(),
      utils.constructionClients.statusCounts.invalidate(),
      utils.constructionClients.filterOptions.invalidate(),
    ]);
  }, [utils]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(presetStorageKey);
      setFilterPresets(stored ? JSON.parse(stored) : []);
    } catch {
      setFilterPresets([]);
    }
  }, [presetStorageKey]);

  const getCurrentFilterSnapshot = (): ConstructionClientFilterSnapshot => ({
    search,
    statusFilter,
    paymentFilter,
    baFilter,
    scheduledFilter,
    installerFilter,
    branchFilter,
    suburbFilter,
    fyFilter,
    monthFilter,
    sortField,
    sortDir,
  });

  const persistFilterPresets = (nextPresets: ConstructionClientFilterPreset[]) => {
    setFilterPresets(nextPresets);
    localStorage.setItem(presetStorageKey, JSON.stringify(nextPresets));
  };

  const applyFilterSnapshot = (filters: ConstructionClientFilterSnapshot) => {
    setSearch(filters.search || "");
    setStatusFilter(filters.statusFilter || DEFAULT_FILTERS.statusFilter);
    setPaymentFilter(filters.paymentFilter || DEFAULT_FILTERS.paymentFilter);
    setBaFilter(filters.baFilter || DEFAULT_FILTERS.baFilter);
    setScheduledFilter(filters.scheduledFilter || DEFAULT_FILTERS.scheduledFilter);
    setInstallerFilter(filters.installerFilter || DEFAULT_FILTERS.installerFilter);
    setBranchFilter(filters.branchFilter || DEFAULT_FILTERS.branchFilter);
    setSuburbFilter(filters.suburbFilter || DEFAULT_FILTERS.suburbFilter);
    setFyFilter(filters.fyFilter === undefined ? DEFAULT_FILTERS.fyFilter : filters.fyFilter);
    setMonthFilter(filters.monthFilter ?? DEFAULT_FILTERS.monthFilter);
    setSortField(filters.sortField || DEFAULT_FILTERS.sortField);
    setSortDir(filters.sortDir || DEFAULT_FILTERS.sortDir);
    setSelectedIds(new Set());
    setSelectMode(false);
    setOffset(0);
    setAllClients([]);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Enter a preset name");
      return;
    }

    const existing = filterPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const nextPreset: ConstructionClientFilterPreset = {
      id: existing?.id || String(Date.now()),
      name,
      filters: getCurrentFilterSnapshot(),
    };
    const nextPresets = existing
      ? filterPresets.map((preset) => preset.id === existing.id ? nextPreset : preset)
      : [...filterPresets, nextPreset];

    persistFilterPresets(nextPresets);
    setPresetName("");
    setShowSavePreset(false);
    toast.success(existing ? "Filter preset updated" : "Filter preset saved");
  };

  const handleDeletePreset = (presetId: string) => {
    persistFilterPresets(filterPresets.filter((preset) => preset.id !== presetId));
  };

  const handleClearFilters = () => {
    applyFilterSnapshot(DEFAULT_FILTERS);
  };

  const branchOptions = filterOptionsQuery.data?.branches || [];
  const selectedBranchLabel = branchFilter === "unassigned"
    ? "Unassigned"
    : branchOptions.find((branch: any) => String(branch.id) === branchFilter)?.name;
  const hasActiveFilters = search
    || statusFilter !== DEFAULT_FILTERS.statusFilter
    || paymentFilter !== DEFAULT_FILTERS.paymentFilter
    || baFilter !== DEFAULT_FILTERS.baFilter
    || scheduledFilter !== DEFAULT_FILTERS.scheduledFilter
    || installerFilter !== DEFAULT_FILTERS.installerFilter
    || branchFilter !== DEFAULT_FILTERS.branchFilter
    || suburbFilter !== DEFAULT_FILTERS.suburbFilter
    || fyFilter !== DEFAULT_FILTERS.fyFilter
    || monthFilter !== DEFAULT_FILTERS.monthFilter
    || sortField !== DEFAULT_FILTERS.sortField
    || sortDir !== DEFAULT_FILTERS.sortDir;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Construction Clients</h1>
            <p className="text-sm text-muted-foreground">
              {totalCount} project{totalCount !== 1 ? "s" : ""}{activeFy ? ` in FY ${activeFy}-${String(activeFy + 1).slice(-2)}` : ""}{monthFilter != null ? ` · ${monthOptions.find(m => m.value === monthFilter)?.fullLabel || ""}` : ""}
            </p>
          </div>
        </div>
        {/* FY & Month Selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select
            value={activeFy != null ? String(activeFy) : "all"}
            onValueChange={(v) => { setFyFilter(v === "all" ? null : Number(v)); setMonthFilter(null); }}
          >
            <SelectTrigger className="w-[130px] sm:w-[150px]">
              <SelectValue placeholder="Financial Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {fyOptions.map((fy) => (
                <SelectItem key={fy.value} value={String(fy.value)}>{fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={monthFilter != null ? String(monthFilter) : "all"}
            onValueChange={(v) => setMonthFilter(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-[110px] sm:w-[130px]">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={String(m.value)}>{m.fullLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={sortedClients.length === 0} title="Export to CSV">
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client name, address, or account number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={presetSelectValue}
            onValueChange={(presetId) => {
              const preset = filterPresets.find((item) => item.id === presetId);
              if (preset) applyFilterSnapshot(preset.filters);
              setPresetSelectValue("placeholder");
            }}
          >
            <SelectTrigger className="w-[180px]">
              <Bookmark className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Saved presets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="placeholder" disabled>Saved presets</SelectItem>
              {filterPresets.length === 0 ? (
                <SelectItem value="none" disabled>No saved presets</SelectItem>
              ) : filterPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setPresetName(""); setShowSavePreset(true); }}>
            <Save className="h-4 w-4 mr-1" />
            Save Preset
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <CollapsibleFilters label="Filters">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_completed">Not completed</SelectItem>
              <SelectItem value="all">Active (excl. Completed)</SelectItem>
              <SelectItem value="all_incl_completed">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Payments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              {Object.entries(PAYMENT_STATUS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={baFilter} onValueChange={setBaFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Approval Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Approval Status</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="lodged">Lodged</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="exempt">Exempt</SelectItem>
              <SelectItem value="none">Not Set</SelectItem>
              <SelectItem value="overdue">Overdue (&gt;{overdueDays} days)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scheduledFilter} onValueChange={setScheduledFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Scheduled" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scheduling</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="unscheduled">Unscheduled</SelectItem>
              <SelectItem value="overdue">Schedule Overdue</SelectItem>
              <SelectItem value="today">Due Today</SelectItem>
              <SelectItem value="next_7_days">Next 7 Days</SelectItem>
              <SelectItem value="future">Future</SelectItem>
            </SelectContent>
          </Select>
          <Select value={installerFilter} onValueChange={setInstallerFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Installers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Installers</SelectItem>
              {(filterOptionsQuery.data?.installers || []).map((installer: any) => (
                <SelectItem key={installer.id} value={String(installer.id)}>
                  {installer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {branchOptions.map((branch: any) => (
                <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={suburbFilter} onValueChange={setSuburbFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Suburb" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suburbs</SelectItem>
              {(filterOptionsQuery.data?.suburbs || []).map((suburb: string) => (
                <SelectItem key={suburb} value={suburb}>{suburb}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CollapsibleFilters>
      </div>

      {/* Showing count + Bulk actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {displayClients.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing {displayClients.length} of {total} project{total !== 1 ? "s" : ""}
            {statusFilter !== "all_incl_completed" && ` (${STATUS_FILTER_LABELS[statusFilter] || STATUS_CONFIG[statusFilter]?.label || statusFilter})`}
            {paymentFilter !== "all" && ` · ${PAYMENT_STATUS_CONFIG[paymentFilter]?.label}`}
            {baFilter !== "all" && ` · Approval ${baFilter.replace(/_/g, " ")}`}
            {scheduledFilter !== "all" && ` · ${scheduledFilter.replace(/_/g, " ")}`}
            {branchFilter !== "all" && selectedBranchLabel && ` · ${selectedBranchLabel}`}
            {suburbFilter !== "all" && ` · ${suburbFilter}`}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant={selectMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </div>
      </div>

      {/* Bulk Approval action bar */}
      {selectMode && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
          <Button variant="outline" size="sm" onClick={toggleSelectAll}>
            {selectedIds.size === displayClients.length ? "Clear All" : "Select All"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Select value={bulkBaStatus} onValueChange={setBulkBaStatus}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Set Approval Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="lodged">Lodged</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="exempt">Exempt</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={selectedIds.size === 0 || !bulkBaStatus || bulkBaMut.isPending}
              onClick={() => {
                if (selectedLeadIds.length === 0) {
                  toast.error("Selected clients have no linked leads");
                  return;
                }
                bulkBaMut.mutate({ leadIds: selectedLeadIds, status: bulkBaStatus });
              }}
            >
              {bulkBaMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Client Table */}
      {clientsQuery.isLoading && offset === 0 ? (
        <Card>
          <CardContent className="p-4">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : displayClients.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No clients found</p>
            <p className="text-sm mt-1">
              {search || paymentFilter !== "all" || baFilter !== "all" || scheduledFilter !== "all" || installerFilter !== "all" || branchFilter !== "all" || suburbFilter !== "all"
                ? "Try adjusting your search or filter criteria"
                : `No construction jobs in ${activeFy ? `FY ${activeFy}-${String(activeFy + 1).slice(-2)}` : "this period"}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {selectMode && <th className="py-3 px-2 w-8"></th>}
                    <th className="text-left py-3 px-4 font-medium cursor-pointer select-none" onClick={() => toggleSort("clientName")}>
                      <span className="flex items-center gap-1">Client <SortIcon field="clientName" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort("clientNumber")}>
                      <span className="flex items-center gap-1">Account # <SortIcon field="clientNumber" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("status")}>
                      <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort("scheduledStart")}>
                      <span className="flex items-center gap-1">Scheduled <SortIcon field="scheduledStart" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium hidden xl:table-cell cursor-pointer select-none" onClick={() => toggleSort("constructionManagerName")}>
                      <span className="flex items-center gap-1">Construction Manager <SortIcon field="constructionManagerName" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium hidden lg:table-cell">Site Address</th>
                    <th className="text-right py-3 px-3 font-medium cursor-pointer select-none" onClick={() => toggleSort("contractValue")}>
                      <span className="flex items-center gap-1 justify-end">Value <SortIcon field="contractValue" /></span>
                    </th>
                    <th className="text-left py-3 px-3 font-medium hidden lg:table-cell">Installers</th>
                    <th className="text-center py-3 px-3 font-medium hidden md:table-cell">BA</th>
                    <th className="text-center py-3 px-3 font-medium hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort("progressPercent")}>
                      <span className="flex items-center gap-1 justify-center">Progress <SortIcon field="progressPercent" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClients.map((client: any) => {
                    const statusCfg = STATUS_CONFIG[client.status] || STATUS_CONFIG.scheduled;
                    const StatusIcon = statusCfg.icon;
                    return (
                      <tr
                        key={client.id}
                        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => selectMode ? toggleSelect(client.id) : navigate(`/construction/clients/${client.id}`)}
                      >
                        {selectMode && (
                          <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(client.id)}
                              onCheckedChange={() => toggleSelect(client.id)}
                            />
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[200px]">{client.clientName}</span>
                            {client.priority === "high" && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">!</Badge>
                            )}
                            {client.priority === "medium" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-300 text-amber-600">!!</Badge>
                            )}
                            {client.branch && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{client.branch}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {client.clientPhone && (
                              <a
                                href={`tel:${client.clientPhone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 transition-colors"
                                title={client.clientPhone}
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                            )}
                            {client.clientEmail && (
                              <a
                                href={`mailto:${client.clientEmail}`}
                                onClick={(e) => e.stopPropagation()}
                                className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 transition-colors"
                                title={client.clientEmail}
                              >
                                <Mail className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground font-mono">{client.clientNumber || '—'}</span>
                        </td>
                        <td className="py-3 px-3">
                          <Badge className={statusCfg.color} variant="secondary">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          {client.scheduledStart ? (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(client.scheduledStart).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Not set</span>
                          )}
                        </td>
                        <td className="py-3 px-3 hidden xl:table-cell">
                          <span className="text-xs text-muted-foreground truncate max-w-[150px] block">
                            {client.constructionManagerName || client.supervisorName || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-3 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                            {client.siteAddress || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {client.contractValue > 0 ? (
                            <div>
                              <span className="font-semibold">{formatCurrency(client.contractValue)}</span>
                              <div className="mt-0.5">
                                <Badge className={PAYMENT_STATUS_CONFIG[client.paymentStatus]?.color || ""} variant="secondary">
                                  <span className="text-[10px]">{PAYMENT_STATUS_CONFIG[client.paymentStatus]?.label || '—'}</span>
                                </Badge>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {client.installerNames?.length > 0 ? (
                              client.installerNames.slice(0, 3).map((name: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{name}</Badge>
                              ))
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
                            )}
                            {client.installerNames?.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{client.installerNames.length - 3}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell text-center">
                          <BaStatusIndicator status={client.baStatus} applicationDate={client.baApplicationDate} overdueDays={overdueDays} />
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={client.progressPercent} className="h-1.5 w-16" />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {client.progressPercent > 0
                                ? `${client.progressPercent}%`
                                : client.totalStages > 0
                                ? `${client.completedStages}/${client.totalStages}`
                                : "—"
                              }
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center py-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setOffset(prev => prev + PAGE_SIZE)}
                  disabled={clientsQuery.isFetching}
                >
                  {clientsQuery.isFetching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4 mr-2" />
                  )}
                  Load More ({total - allClients.length} remaining)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Dialog open={showSavePreset} onOpenChange={setShowSavePreset}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5" />
              Save Filter Preset
            </DialogTitle>
            <DialogDescription>
              Save the current Construction Clients filters, period, and sorting for one-click access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Preset name</Label>
              <Input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Riverina approvals due"
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSavePreset();
                }}
              />
            </div>
            {filterPresets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Existing presets</Label>
                <div className="max-h-40 overflow-y-auto rounded-md border">
                  {filterPresets.map((preset) => (
                    <div key={preset.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate text-sm">{preset.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePreset(preset.id)}
                        className="h-8 w-8 p-0"
                        title="Delete preset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSavePreset(false)}>Cancel</Button>
            <Button onClick={handleSavePreset}>
              <Save className="h-4 w-4 mr-1" />
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PullToRefresh>
  );
}


// ─── Approvals Status Indicator (colour-coded badge for the list table) ─────────────
function BaStatusIndicator({ status, applicationDate, overdueDays = 30 }: { status?: string | null; applicationDate?: string | null; overdueDays?: number }) {
  if (!status) return <span className="text-[10px] text-muted-foreground">—</span>;
  const s = status.toLowerCase();
  let label = "";
  let dotColor = "";
  let bgColor = "";

  if (s === "approved" || s === "approved with conditions") {
    label = "Approved"; dotColor = "bg-green-500"; bgColor = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  } else if (s === "pending") {
    label = "Pending"; dotColor = "bg-amber-500"; bgColor = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  } else if (s === "rejected" || s === "refused") {
    label = "Rejected"; dotColor = "bg-red-500"; bgColor = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  } else if (s === "exempt" || s === "not required") {
    label = "Exempt"; dotColor = "bg-gray-400"; bgColor = "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400";
  } else if (s === "lodged" || s === "submitted") {
    label = "Lodged"; dotColor = "bg-blue-500"; bgColor = "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  } else {
    return <span className="text-[10px] text-muted-foreground">{status}</span>;
  }

  // Check if overdue (pending/lodged > configurable threshold)
  const isOverdue = (s === "pending" || s === "lodged" || s === "submitted") && applicationDate
    && (Date.now() - new Date(applicationDate).getTime()) > overdueDays * 24 * 60 * 60 * 1000;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${bgColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${dotColor}`} />
      {label}
      {isOverdue && <span title={`Overdue: >${overdueDays} days since application`}><AlertTriangle className="h-3 w-3 ml-1 text-red-500" /></span>}
    </span>
  );
}
