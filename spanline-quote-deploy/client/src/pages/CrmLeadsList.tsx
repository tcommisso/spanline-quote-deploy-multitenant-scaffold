import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { Search, Plus, Filter, X, Upload, FileSpreadsheet, CheckCircle2, Building2, UserPlus, Trash2, Archive, ArchiveRestore, GitMerge, Copy, ShieldCheck, MapPin } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BulkAssignAdvisorDialog } from "@/components/BulkAssignAdvisorDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { toast } from "sonner";
import { useLeadStatusOptions, useProductTypeOptions, useLeadSourceOptions } from "@/hooks/useCrmDropdowns";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  assigned: "bg-purple-100 text-purple-800",
  appointment_set: "bg-indigo-100 text-indigo-800",
  quoted: "bg-amber-100 text-amber-800",
  contract: "bg-green-100 text-green-800",
  building_authority: "bg-teal-100 text-teal-800",
  construction: "bg-orange-100 text-orange-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  appointment_set: "Appointment Set",
  quoted: "Quoted",
  contract: "Contract",
  building_authority: "Approvals",
  construction: "Construction",
  completed: "Completed",
  cancelled: "Cancelled",
};

const FALLBACK_PRODUCT_TYPES = [
  "Outdoor Living", "Patio", "Carport", "Deck", "Eclipse Roof",
  "Glassroom", "Screenroom", "Lattice", "Spacemaker", "Awning"
];

const FALLBACK_LEAD_SOURCES = [
  "Website", "Phone", "Referral", "Display Home", "Home Show",
  "Social Media", "Print Ad", "Door Knock", "Repeat Client", "Other"
];

export default function CrmLeadsList() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");

  // Dynamic CRM dropdown options
  const { statusOptions } = useLeadStatusOptions();
  const { productTypes } = useProductTypeOptions();
  const { leadSources } = useLeadSourceOptions();
  const PRODUCT_TYPES = productTypes.length > 0 ? productTypes : FALLBACK_PRODUCT_TYPES;
  const LEAD_SOURCES = leadSources.length > 0 ? leadSources : FALLBACK_LEAD_SOURCES;
  // Build dynamic STATUS_LABELS from fetched options
  const dynamicStatusLabels = statusOptions.reduce<Record<string, string>>((acc, o) => { acc[o.value] = o.label; return acc; }, {});
  const EFFECTIVE_STATUS_LABELS = Object.keys(dynamicStatusLabels).length > 0 ? dynamicStatusLabels : STATUS_LABELS;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [branchFilter, setBranchFilter] = useState<number | "unassigned" | undefined>(undefined);
  const [baStatusFilter, setBaStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [selectAllMatchingMode, setSelectAllMatchingMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAllLeads, setShowAllLeads] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir(col === "createdAt" ? "desc" : "asc");
    }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <span className="ml-1 text-muted-foreground/40">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const { data: branchesList } = trpc.branches.list.useQuery();

  const { data, isLoading, isFetching } = trpc.crm.leads.list.useQuery({
    search: search || undefined,
    status: statusFilter || undefined,
    productType: productFilter || undefined,
    leadSource: sourceFilter || undefined,
    branchId: branchFilter,
    baStatus: baStatusFilter || undefined,
    showArchived: showArchived || undefined,
    showAll: showAllLeads || undefined,
    limit: pageSize,
    offset: page * pageSize,
    sortBy,
    sortDir,
  }, {
    placeholderData: (prev) => prev, // keep previous data while fetching next page
  });

  const hasFilters = statusFilter || productFilter || sourceFilter || branchFilter || baStatusFilter;
  const unassignedCount = data?.unassignedCount ?? 0;

  // Fetch Approval statuses for listed leads
  const leadIds = data?.leads?.map((l: any) => l.id) || [];
  const { data: baStatuses } = trpc.crm.buildingAuthority.batchStatuses.useQuery(
    { leadIds },
    { enabled: leadIds.length > 0 }
  );
  const baStatusMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (baStatuses) {
      for (const row of baStatuses) {
        map[row.leadId] = row.status || "Pending";
      }
    }
    return map;
  }, [baStatuses]);

  // Fetch all matching IDs when "select all matching" is triggered
  const { data: allMatchingIds, refetch: fetchAllMatchingIds } = trpc.crm.leads.listIds.useQuery(
    {
      search: search || undefined,
      status: statusFilter || undefined,
      productType: productFilter || undefined,
      leadSource: sourceFilter || undefined,
      branchId: branchFilter,
      baStatus: baStatusFilter || undefined,
    },
    { enabled: false } // only fetch on demand
  );

  // Bulk assign state
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkAssignBranch, setShowBulkAssignBranch] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);

  // Bulk delete mutation
  const utils = trpc.useUtils();
  const bulkDeleteMut = trpc.crm.leads.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast.success(`Deleted ${result.deleted} lead${result.deleted === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setSelectAllMatchingMode(false);
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Bulk delete failed");
    },
  });

  // Bulk archive mutation
  const bulkArchiveMut = trpc.crm.leads.bulkArchive.useMutation({
    onSuccess: (result) => {
      toast.success(`Archived ${result.archived} lead${result.archived === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setSelectAllMatchingMode(false);
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Bulk archive failed");
    },
  });

  const bulkExemptMut = trpc.crm.leads.bulkMarkExempt.useMutation({
    onSuccess: (result) => {
      toast.success(`Marked ${result.updated} lead${result.updated === 1 ? "" : "s"} as Approval Exempt`);
      setSelectedIds(new Set());
      setSelectAllMatchingMode(false);
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Bulk exempt failed");
    },
  });

  // Bulk assign branch mutation
  const bulkAssignBranchMut = trpc.crm.leads.bulkAssignBranch.useMutation({
    onSuccess: (result) => {
      toast.success(`Assigned ${result.updated} lead${result.updated === 1 ? "" : "s"} to branch`);
      setSelectedIds(new Set());
      setSelectAllMatchingMode(false);
      setShowBulkAssignBranch(false);
      setSelectedBranchId(null);
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Bulk assign branch failed");
    },
  });

  // Merge state + mutation
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [primaryLeadId, setPrimaryLeadId] = useState<number | null>(null);
  const mergeMut = trpc.crm.leads.merge.useMutation({
    onSuccess: (result) => {
      toast.success(`Merged ${result.archived} duplicate lead${result.archived === 1 ? "" : "s"} into primary (${result.transferred} records transferred)`);
      setSelectedIds(new Set());
      setSelectAllMatchingMode(false);
      setShowMergeDialog(false);
      setPrimaryLeadId(null);
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Merge failed");
    },
  });

  // Single unarchive mutation
  const unarchiveMut = trpc.crm.leads.unarchive.useMutation({
    onSuccess: () => {
      toast.success("Lead restored from archive");
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Unarchive failed");
    },
  });

  // Duplicate IDs for badge display
    const { data: duplicateIds } = trpc.crm.leads.getDuplicateIds.useQuery(undefined, {
    staleTime: 5 * 60_000, // cache for 5 minutes — expensive self-join on 7k+ rows
    refetchOnWindowFocus: false,
  });
  const duplicateIdSet = useMemo(() => new Set(duplicateIds || []), [duplicateIds]);
  // Stale leads (follow-up overdue)
  const { data: staleLeads } = trpc.crm.leads.getStaleIds.useQuery(undefined, {
    staleTime: 5 * 60_000, // cache for 5 minutes — correlated subquery on activities
    refetchOnWindowFocus: false,
  });
  const staleLeadMap = useMemo(() => {
    const m = new Map<number, number>();
    (staleLeads || []).forEach(s => m.set(s.id, s.daysSinceActivity));
    return m;
  }, [staleLeads]);

  // CSV Import state
  const [showImport, setShowImport] = useState(false);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [importResult, setImportResult] = useState<{ imported: number; skipped?: number; skippedReasons?: string[] } | null>(null);

  const bulkImportMut = trpc.crm.leads.bulkImport.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      setImportStep("done");
      const msg = result.skipped ? `Imported ${result.imported} leads, skipped ${result.skipped} duplicates` : `Successfully imported ${result.imported} leads`;
      toast.success(msg);
      utils.crm.leads.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Import failed");
    },
  });

  const FIELD_OPTIONS = [
    { value: "", label: "— Skip —" },
    { value: "contactFirstName", label: "First Name" },
    { value: "contactLastName", label: "Last Name" },
    { value: "contactPhone", label: "Phone" },
    { value: "contactEmail", label: "Email" },
    { value: "contactAddress", label: "Address" },
    { value: "productType", label: "Product Type" },
    { value: "leadSource", label: "Lead Source" },
    { value: "designAdvisor", label: "Design Advisor" },
    { value: "franchiseNumber", label: "Franchise Number" },
    { value: "franchiseType", label: "Franchise Type" },
    { value: "notes", label: "Notes" },
  ];

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = values[i] || ""; });
        return row;
      });
      setCsvHeaders(headers);
      setCsvData(rows);
      // Auto-map columns by name matching
      const autoMap: Record<string, string> = {};
      headers.forEach(h => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, "");
        if (lower.includes("first") && lower.includes("name")) autoMap[h] = "contactFirstName";
        else if (lower.includes("last") && lower.includes("name")) autoMap[h] = "contactLastName";
        else if (lower === "name" || lower === "fullname") autoMap[h] = "contactFirstName";
        else if (lower.includes("phone") || lower.includes("mobile")) autoMap[h] = "contactPhone";
        else if (lower.includes("email")) autoMap[h] = "contactEmail";
        else if (lower.includes("address") || lower.includes("street")) autoMap[h] = "contactAddress";
        else if (lower.includes("product")) autoMap[h] = "productType";
        else if (lower.includes("source")) autoMap[h] = "leadSource";
        else if (lower.includes("advisor") || lower.includes("adviser")) autoMap[h] = "designAdvisor";
        else if (lower.includes("franchise") && lower.includes("num")) autoMap[h] = "franchiseNumber";
        else if (lower.includes("note")) autoMap[h] = "notes";
      });
      setColumnMap(autoMap);
      setImportStep("map");
    };
    reader.readAsText(file);
  };

  const getMappedLeads = () => {
    return csvData.map(row => {
      const lead: Record<string, string> = {};
      Object.entries(columnMap).forEach(([csvCol, field]) => {
        if (field && row[csvCol]) lead[field] = row[csvCol];
      });
      return lead;
    }).filter(lead => Object.keys(lead).length > 0);
  };

  const handleImport = () => {
    const leads = getMappedLeads();
    if (leads.length === 0) {
      toast.error("No valid leads to import");
      return;
    }
    bulkImportMut.mutate({ leads });
  };

  const resetImport = () => {
    setShowImport(false);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMap({});
    setImportStep("upload");
    setImportResult(null);
  };

  // Selection helpers
  const currentPageIds = useMemo(() => (data?.leads || []).map(l => l.id), [data?.leads]);
  const allOnPageSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
  const someOnPageSelected = currentPageIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      // Deselect all on this page
      setSelectedIds(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Select all on this page
      setSelectedIds(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllMatching = async () => {
    const result = await fetchAllMatchingIds();
    if (result.data) {
      setSelectedIds(new Set(result.data));
      setSelectAllMatchingMode(true);
    }
  };

  const handleBulkArchive = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const batch = ids.slice(0, 500);
    bulkArchiveMut.mutate({ ids: batch });
    setShowArchiveConfirm(false);
    setSelectAllMatchingMode(false);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const batch = ids.slice(0, 500);
    bulkDeleteMut.mutate({ ids: batch });
    setShowDeleteConfirm(false);
    setSelectAllMatchingMode(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">
            {data?.total || 0} total leads
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBulkAssign(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Bulk </span>Assign
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Import </span>CSV
          </Button>
          <Button size="sm" variant="brand" onClick={() => navigate("/crm/leads/new")}>
            <Plus className="h-4 w-4 mr-1" /> New Lead
          </Button>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selected
            {selectAllMatchingMode && " (all matching)"}
          </span>
          {/* Show "Select all X matching" when all on page are selected but there are more */}
          {allOnPageSelected && !selectAllMatchingMode && data && data.total > pageSize && isAdmin && (
            <Button
              variant="link"
              size="sm"
              className="text-blue-600 dark:text-blue-400 p-0 h-auto"
              onClick={handleSelectAllMatching}
            >
              Select all {data.total} matching leads
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedIds(new Set()); setSelectAllMatchingMode(false); }}
            className="text-muted-foreground"
          >
            Clear selection
          </Button>
          {isAdmin && selectedIds.size >= 2 && !selectAllMatchingMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setPrimaryLeadId(null); setShowMergeDialog(true); }}
            >
              <GitMerge className="h-4 w-4 mr-1" />
              Merge {selectedIds.size}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkAssignBranch(true)}
            >
              <MapPin className="h-4 w-4 mr-1" />
              Assign Branch
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const batch = Array.from(selectedIds);
                bulkExemptMut.mutate({ ids: batch });
              }}
              disabled={bulkExemptMut.isPending}
            >
              <ShieldCheck className="h-4 w-4 mr-1" />
              {bulkExemptMut.isPending ? "Exempting..." : `Approval Exempt ${selectedIds.size}`}
            </Button>
          )}
          {isAdmin && !showArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchiveConfirm(true)}
              disabled={bulkArchiveMut.isPending}
            >
              <Archive className="h-4 w-4 mr-1" />
              {bulkArchiveMut.isPending ? "Archiving..." : `Archive ${selectedIds.size}`}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={bulkDeleteMut.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {bulkDeleteMut.isPending ? "Deleting..." : `Delete ${selectedIds.size}`}
            </Button>
          )}
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4 mr-1" /> Filters
          {hasFilters && <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-xs flex items-center justify-center">!</span>}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(""); setProductFilter(""); setSourceFilter(""); setBranchFilter(undefined); setPage(0); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
        <Button
          variant={showAllLeads ? "secondary" : "ghost"}
          size="sm"
          onClick={() => { setShowAllLeads(!showAllLeads); setPage(0); }}
          title="By default only active leads from the past 3 months are shown"
        >
          <Filter className="h-4 w-4 mr-1" />
          {showAllLeads ? "Showing all" : "Show all leads"}
        </Button>
        <Button
          variant={showDuplicatesOnly ? "secondary" : "ghost"}
          size="sm"
          onClick={() => { setShowDuplicatesOnly(!showDuplicatesOnly); setPage(0); }}
        >
          <Copy className="h-4 w-4 mr-1" />
          {showDuplicatesOnly ? "Showing duplicates" : "Duplicates only"}
        </Button>
        {isAdmin && (
          <Button
            variant={showArchived ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setShowArchived(!showArchived); setPage(0); setSelectedIds(new Set()); setSelectAllMatchingMode(false); }}
            className="ml-auto"
          >
            <Archive className="h-4 w-4 mr-1" />
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
        )}
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.entries(EFFECTIVE_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Product Type</label>
                <Select value={productFilter} onValueChange={(v) => { setProductFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="All products" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {PRODUCT_TYPES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Lead Source</label>
                <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {branchesList && branchesList.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Branch</label>
                  <Select value={branchFilter ? String(branchFilter) : "all"} onValueChange={(v) => { setBranchFilter(v === "all" ? undefined : v === "unassigned" ? "unassigned" as const : parseInt(v)); setPage(0); }}>
                    <SelectTrigger>
                      <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="All branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All branches</SelectItem>
                      <SelectItem value="unassigned">
                        Unassigned {unassignedCount > 0 && `(${unassignedCount})`}
                      </SelectItem>
                      {branchesList.map(b => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Approval Status</label>
                <Select value={baStatusFilter} onValueChange={(v) => { setBaStatusFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="All Approval statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Approval statuses</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Lodged">Lodged</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Approved with Conditions">Approved w/ Conditions</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Exempt">Exempt</SelectItem>
                    <SelectItem value="none">No Approval Record</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leads Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading leads...</div>
          ) : !data?.leads || data.leads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No leads found. {search || hasFilters ? "Try adjusting your filters." : "Create your first lead to get started."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {isAdmin && (
                      <th className="py-3 px-3 w-10">
                        <Checkbox
                          checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all on page"
                        />
                      </th>
                    )}
                    <th className="text-left py-3 px-3 font-medium whitespace-nowrap cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("leadNumber")}>Lead #<SortIcon col="leadNumber" /></th>
                    <th className="text-left py-3 px-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("contactFirstName")}>Contact<SortIcon col="contactFirstName" /></th>
                    <th className="text-left py-3 px-3 font-medium hidden md:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("contactPhone")}>Phone<SortIcon col="contactPhone" /></th>
                    <th className="text-left py-3 px-3 font-medium hidden lg:table-cell">Product</th>
                    <th className="text-left py-3 px-3 font-medium hidden lg:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("leadSource")}>Source<SortIcon col="leadSource" /></th>
                    <th className="text-left py-3 px-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("status")}>Status<SortIcon col="status" /></th>
                    <th className="text-left py-3 px-3 font-medium hidden xl:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("designAdvisor")}>Advisor<SortIcon col="designAdvisor" /></th>
                    <th className="text-left py-3 px-3 font-medium hidden xl:table-cell">Branch</th>
                    <th className="text-left py-3 px-3 font-medium hidden lg:table-cell">BA</th>
                    <th className="text-left py-3 px-3 font-medium hidden lg:table-cell">Lead Date</th>
                    <th className="text-left py-3 px-3 font-medium hidden md:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("createdAt")}>Age<SortIcon col="createdAt" /></th>
                    <th className="text-left py-3 px-3 font-medium hidden xl:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("createdAt")}>Created<SortIcon col="createdAt" /></th>
                    {showArchived && isAdmin && <th className="py-3 px-3 w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {(showDuplicatesOnly ? data.leads.filter(l => duplicateIdSet.has(l.id)) : data.leads).map((lead) => (
                    <tr
                      key={lead.id}
                      className={`border-b hover:bg-muted/50 cursor-pointer transition-colors ${selectedIds.has(lead.id) ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                      onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    >
                      {isAdmin && (
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(lead.id)}
                            onCheckedChange={() => toggleSelect(lead.id)}
                            aria-label={`Select lead ${lead.leadNumber}`}
                          />
                        </td>
                      )}
                      <td className="py-3 px-3 font-mono text-xs font-medium">{lead.leadNumber}</td>
                      <td className="py-3 px-3">
                        <div className="font-medium">{lead.contactFirstName} {lead.contactLastName}</div>
                        {lead.contactEmail && (
                          <div className="text-xs text-muted-foreground">{lead.contactEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground hidden md:table-cell">{lead.contactPhone || "—"}</td>
                      <td className="py-3 px-3 hidden lg:table-cell">{lead.productType || "—"}</td>
                      <td className="py-3 px-3 hidden lg:table-cell">{lead.leadSource || "—"}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-xs ${STATUS_COLORS[lead.status] || ""}`}>
                            {EFFECTIVE_STATUS_LABELS[lead.status] || lead.status}
                          </Badge>
                          {duplicateIdSet.has(lead.id) && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600 dark:text-amber-400 px-1 py-0">
                              Dup
                            </Badge>
                          )}
                          {staleLeadMap.has(lead.id) && (
                            <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-600 dark:text-orange-400 px-1 py-0" title={`No activity for ${staleLeadMap.get(lead.id)} days`}>
                              ⏰ {staleLeadMap.get(lead.id)}d
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell">{lead.designAdvisor || "—"}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground hidden xl:table-cell">
                        {lead.branchId && branchesList ? branchesList.find(b => b.id === lead.branchId)?.name || "—" : "—"}
                      </td>
                      <td className="py-3 px-3 hidden lg:table-cell">
                        {(() => {
                          const baStatus = baStatusMap[lead.id];
                          if (!baStatus) return <span className="text-xs text-muted-foreground">—</span>;
                          const colors: Record<string, string> = {
                            Approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                            "Approved with Conditions": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                            Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            Lodged: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                            Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            Exempt: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
                          };
                          const label = baStatus === "Approved with Conditions" ? "Approved*" : baStatus;
                          return <Badge className={`text-[10px] px-1.5 py-0 ${colors[baStatus] || ""}`}>{label}</Badge>;
                        })()}
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {lead.leadDate ? new Date(lead.leadDate).toLocaleDateString("en-AU") : "—"}
                      </td>
                      <td className="py-3 px-3 text-xs font-medium hidden md:table-cell">
                        {(() => {
                          const days = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000);
                          const color = days <= 7 ? "text-green-600 dark:text-green-400" : days <= 21 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                          return <span className={color}>{days}d</span>;
                        })()}
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground hidden xl:table-cell">
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                      </td>
                      {showArchived && isAdmin && (
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => unarchiveMut.mutate({ id: lead.id })}
                            disabled={unarchiveMut.isPending}
                            title="Restore from archive"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.total)} of {data.total}
            {isFetching && !isLoading && <span className="ml-2 text-xs text-muted-foreground/60 animate-pulse">Loading…</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= data.total || isFetching} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Archive Confirmation */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived leads will be hidden from the default list but can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkArchive}>
              Archive {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected lead{selectedIds.size === 1 ? "" : "s"} and all associated records
              (notes, activities, appointments, documents, contracts). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { if (!open) resetImport(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Leads from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk-import leads. The first row must be column headers.
            </DialogDescription>
          </DialogHeader>

          {importStep === "upload" && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && file.name.endsWith(".csv")) handleCsvFile(file);
                  else toast.error("Please upload a .csv file");
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".csv";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleCsvFile(file);
                  };
                  input.click();
                }}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Drop CSV file here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supported columns: First Name, Last Name, Phone, Email, Address, Product Type, Lead Source, Design Advisor, Franchise Number, Notes
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-medium mb-1">Example CSV format:</p>
                <code className="text-xs text-muted-foreground">
                  First Name,Last Name,Email,Phone,Product Type,Lead Source<br/>
                  John,Smith,john@example.com,0412345678,Patio,Website
                </code>
              </div>
            </div>
          )}

          {importStep === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found <strong>{csvData.length}</strong> rows with <strong>{csvHeaders.length}</strong> columns. Map each CSV column to a lead field:
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {csvHeaders.map(header => (
                  <div key={header} className="flex items-center gap-3">
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[140px] truncate">{header}</span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={columnMap[header] || ""}
                      onChange={(e) => setColumnMap(prev => ({ ...prev, [header]: e.target.value }))}
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep("upload")}>Back</Button>
                <Button onClick={() => setImportStep("preview")} disabled={Object.values(columnMap).filter(Boolean).length === 0}>
                  Preview ({getMappedLeads().length} leads)
                </Button>
              </DialogFooter>
            </div>
          )}

          {importStep === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ready to import <strong>{getMappedLeads().length}</strong> leads. Preview of first 5 rows:
              </p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {Object.entries(columnMap).filter(([, v]) => v).map(([, field]) => (
                        <th key={field} className="text-left py-2 px-2 font-medium">
                          {FIELD_OPTIONS.find(o => o.value === field)?.label || field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getMappedLeads().slice(0, 5).map((lead, idx) => (
                      <tr key={idx} className="border-b">
                        {Object.entries(columnMap).filter(([, v]) => v).map(([, field]) => (
                          <td key={field} className="py-2 px-2 truncate max-w-[150px]">{lead[field] || "\u2014"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {getMappedLeads().length > 5 && (
                <p className="text-xs text-muted-foreground">...and {getMappedLeads().length - 5} more rows</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep("map")}>Back</Button>
                <Button onClick={handleImport} disabled={bulkImportMut.isPending}>
                  {bulkImportMut.isPending ? "Importing..." : `Import ${getMappedLeads().length} Leads`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {importStep === "done" && (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-medium">Import Complete</p>
              <p className="text-muted-foreground">
                Successfully imported <strong>{importResult?.imported || 0}</strong> new leads.
              </p>
              {(importResult?.skipped ?? 0) > 0 && (
                <div className="text-left bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mt-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                    Skipped {importResult!.skipped} duplicate(s)
                  </p>
                  <div className="max-h-[120px] overflow-y-auto">
                    {importResult!.skippedReasons?.map((reason, idx) => (
                      <p key={idx} className="text-xs text-amber-600 dark:text-amber-500">{reason}</p>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={resetImport}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Advisor Dialog */}
      <BulkAssignAdvisorDialog open={showBulkAssign} onOpenChange={setShowBulkAssign} />

      {/* Merge Leads Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={(open) => { if (!open) { setShowMergeDialog(false); setPrimaryLeadId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge {selectedIds.size} Leads
            </DialogTitle>
            <DialogDescription>
              Select the <strong>primary lead</strong> to keep. All records from the other lead{selectedIds.size > 2 ? "s" : ""} will be transferred to the primary, and the duplicates will be archived.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <RadioGroup
              value={primaryLeadId?.toString() || ""}
              onValueChange={(val) => setPrimaryLeadId(Number(val))}
            >
              {data?.leads
                .filter((l) => selectedIds.has(l.id))
                .map((lead) => (
                  <div
                    key={lead.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      primaryLeadId === lead.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setPrimaryLeadId(lead.id)}
                  >
                    <RadioGroupItem value={lead.id.toString()} id={`merge-${lead.id}`} />
                    <Label htmlFor={`merge-${lead.id}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{lead.contactFirstName} {lead.contactLastName}</span>
                          <span className="text-xs text-muted-foreground ml-2">#{lead.leadNumber}</span>
                        </div>
                        {primaryLeadId === lead.id && (
                          <Badge className="bg-primary text-primary-foreground text-xs">Primary</Badge>
                        )}
                        {primaryLeadId !== null && primaryLeadId !== lead.id && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Duplicate</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {lead.contactEmail || "No email"} &middot; {lead.contactPhone || "No phone"}
                        {lead.status && (
                          <> &middot; <span className="capitalize">{EFFECTIVE_STATUS_LABELS[lead.status] || lead.status}</span></>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
            </RadioGroup>

            {/* Show leads not on current page */}
            {Array.from(selectedIds).some((id) => !data?.leads.find((l) => l.id === id)) && (
              <p className="text-xs text-muted-foreground italic">
                Some selected leads are on other pages. Navigate to those pages first to see all candidates, or proceed with the visible ones.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowMergeDialog(false); setPrimaryLeadId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!primaryLeadId) return;
                const duplicateIds = Array.from(selectedIds).filter((id) => id !== primaryLeadId);
                mergeMut.mutate({ primaryId: primaryLeadId, duplicateIds });
              }}
              disabled={!primaryLeadId || mergeMut.isPending}
            >
              {mergeMut.isPending ? "Merging..." : "Confirm Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Branch Dialog */}
      <Dialog open={showBulkAssignBranch} onOpenChange={(open) => { if (!open) { setShowBulkAssignBranch(false); setSelectedBranchId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Assign Branch to {selectedIds.size} Lead{selectedIds.size === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Select a branch to assign to the selected leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select
              value={selectedBranchId?.toString() || ""}
              onValueChange={(val) => setSelectedBranchId(Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a branch" />
              </SelectTrigger>
              <SelectContent>
                {branchesList?.map(b => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkAssignBranch(false); setSelectedBranchId(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedBranchId) return;
                const batch = Array.from(selectedIds);
                bulkAssignBranchMut.mutate({ ids: batch, branchId: selectedBranchId });
              }}
              disabled={!selectedBranchId || bulkAssignBranchMut.isPending}
            >
              {bulkAssignBranchMut.isPending ? "Assigning..." : "Assign Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
