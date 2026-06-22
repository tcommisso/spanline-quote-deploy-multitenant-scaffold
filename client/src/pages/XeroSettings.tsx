import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, ExternalLink,
  Download, Upload, ArrowUpDown, Clock, Loader2, FolderSync, Users,
  DollarSign, Activity, UserPlus, AlertTriangle, Building2, XCircle,
  Route, Plus, Trash2, Pencil, PlayCircle, Search, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RoutingConditionDraft = {
  field: string;
  operator: string;
  value: string;
};

type RoutingRuleDraft = {
  id?: number;
  name: string;
  moduleKey: string;
  targetXeroConnectionId: string;
  priority: string;
  isActive: boolean;
  conditions: RoutingConditionDraft[];
  notes: string;
};

type XeroScopeProfile = "accounting_standard" | "accounting_read" | "sign_in_only";
type XeroUnmatchedSource = "invoice" | "bill" | "bank_transaction" | "credit_note";

const XERO_UNMATCHED_PAGE_SIZE = 50;
const XERO_UNMATCHED_SOURCE_FILTERS: Array<{ value: "all" | XeroUnmatchedSource; label: string }> = [
  { value: "all", label: "All source types" },
  { value: "bill", label: "Bills" },
  { value: "bank_transaction", label: "Spend money" },
  { value: "invoice", label: "Invoices" },
  { value: "credit_note", label: "Credit notes" },
];

const ROUTING_FIELD_LABELS: Record<string, string> = {
  branch: "Branch",
  postcode: "Postcode",
  state: "State",
  jobStatus: "Job status",
  productType: "Product type",
  quoteTotal: "Quote total",
  supplierName: "Supplier",
  clientName: "Client",
  projectName: "Project",
};

const ROUTING_OPERATOR_LABELS: Record<string, string> = {
  equals: "equals",
  contains: "contains",
  starts_with: "starts with",
  in: "is one of",
  gte: "is at least",
  lte: "is at most",
};

function emptyRoutingRuleDraft(): RoutingRuleDraft {
  return {
    name: "",
    moduleKey: "construction",
    targetXeroConnectionId: "",
    priority: "100",
    isActive: true,
    conditions: [{ field: "branch", operator: "equals", value: "" }],
    notes: "",
  };
}

function formatCurrency(value: unknown) {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

function formatShortDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatXeroSourceType(value: string) {
  switch (value) {
    case "bill":
      return "Bill";
    case "bank_transaction":
      return "Spend money";
    case "invoice":
      return "Invoice";
    case "credit_note":
      return "Credit note";
    default:
      return value.replace("_", " ");
  }
}

function XeroClientImportSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const { data: stats, isLoading, isError, refetch } = trpc.xeroClientImport.getOrphanStats.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });
  const bulkImport = trpc.xeroClientImport.bulkImportOrphans.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetch();
      setShowConfirm(false);
    },
    onError: (err) => {
      toast.error(err.message || "Import failed");
      setShowConfirm(false);
    },
  });
  const backfill = trpc.xeroClientImport.backfillContactDetails.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
    },
    onError: (err) => {
      toast.error(err.message || "Backfill failed");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Client → CRM Lead Import
        </CardTitle>
        <CardDescription>
          Create CRM lead records for construction jobs imported from Xero that don't yet have a linked lead.
          This enables activity tracking, communications, and portal access for those clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for orphan jobs...
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Could not load orphan job data.</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : stats && stats.orphanCount > 0 ? (
          <>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    {stats.orphanCount} construction job{stats.orphanCount !== 1 ? "s" : ""} without a CRM lead
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    These jobs were imported from Xero but don't have matching CRM lead records.
                    Importing them will create leads with status "Won" and link them to each job.
                  </p>
                </div>
              </div>
            </div>

            {/* Preview table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 px-3">Client Name</th>
                      <th className="py-2 px-3">Site Address</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.orphans.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="py-1.5 px-3 font-medium">{o.clientName || "—"}</td>
                        <td className="py-1.5 px-3 text-muted-foreground truncate max-w-[250px]">{o.siteAddress || "—"}</td>
                        <td className="py-1.5 px-3">
                          <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                        </td>
                      </tr>
                    ))}
                    {stats.orphanCount > 50 && (
                      <tr className="border-t">
                        <td colSpan={3} className="py-2 px-3 text-center text-muted-foreground text-xs">
                          ...and {stats.orphanCount - 50} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <Button onClick={() => setShowConfirm(true)} disabled={bulkImport.isPending}>
              {bulkImport.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
              ) : (
                <><UserPlus className="h-4 w-4 mr-2" /> Import {stats.orphanCount} Client{stats.orphanCount !== 1 ? "s" : ""} as Leads</>
              )}
            </Button>

            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Bulk Import</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create {stats.orphanCount} new CRM lead record{stats.orphanCount !== 1 ? "s" : ""} with status "Won" and link them to their respective construction jobs.
                    This action is a one-time operation and cannot be easily undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={bulkImport.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => bulkImport.mutate()}
                    disabled={bulkImport.isPending}
                  >
                    {bulkImport.isPending ? "Importing..." : "Import All"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            All construction jobs have linked CRM leads. No import needed.
          </div>
        )}

        {/* Backfill Contact Details */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Backfill Contact Details</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Update existing Xero-imported leads with missing email, phone, address, branch, and job number from Xero contacts.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => backfill.mutate()}
              disabled={backfill.isPending}
            >
              {backfill.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Backfilling...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Backfill Contacts</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UnmatchedXeroTransactionsPanel() {
  const utils = trpc.useUtils();
  const [selectedMappings, setSelectedMappings] = useState<Record<number, string>>({});
  const [applyToDocument, setApplyToDocument] = useState(true);
  const [sourceType, setSourceType] = useState<"all" | XeroUnmatchedSource>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { data: unmatchedData, isLoading, isFetching, isError, refetch } = trpc.xeroAccounting.getUnmatched.useQuery(
    {
      limit: XERO_UNMATCHED_PAGE_SIZE,
      offset: page * XERO_UNMATCHED_PAGE_SIZE,
      sourceType: sourceType === "all" ? undefined : sourceType,
      search: search.trim() || undefined,
    },
    { refetchInterval: 60_000 }
  );

  useEffect(() => {
    setPage(0);
  }, [sourceType, search]);

  useEffect(() => {
    if (!unmatchedData?.rows?.length) return;
    setSelectedMappings((current) => {
      const next = { ...current };
      for (const row of unmatchedData.rows as any[]) {
        if (!next[row.id] && row.suggestions?.[0]?.id) {
          next[row.id] = String(row.suggestions[0].id);
        }
      }
      return next;
    });
  }, [unmatchedData?.rows]);

  const assignUnmatched = trpc.xeroAccounting.assignUnmatched.useMutation({
    onSuccess: (result) => {
      toast.success(`Assigned ${result.updatedRows} Xero line${result.updatedRows === 1 ? "" : "s"} to job #${result.jobId}.`);
      refetch();
      utils.xeroAccounting.getSyncHealth.invalidate();
      utils.xeroProjects.getAllMappings.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to assign Xero transaction"),
  });
  const ignoreUnmatched = trpc.xeroAccounting.ignoreUnmatched.useMutation({
    onSuccess: (result) => {
      toast.success(`Ignored ${result.ignoredRows} Xero line${result.ignoredRows === 1 ? "" : "s"}.`);
      refetch();
      utils.xeroAccounting.getSyncHealth.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to ignore Xero transaction"),
  });
  const syncUnmatched = trpc.xeroAccounting.syncAll.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.imported} Xero line${result.imported === 1 ? "" : "s"}; ${result.unmatched} unmatched.`);
      if (result.fetchErrors?.length) {
        toast.warning(`Some Xero endpoints returned warnings: ${result.fetchErrors.join("; ")}`);
      }
      refetch();
      utils.xeroAccounting.getSyncHealth.invalidate();
      utils.xeroProjects.getAllMappings.invalidate();
      utils.xeroProjects.getSyncLogs.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to sync Xero transactions"),
  });

  const unmatchedRows = (unmatchedData?.rows || []) as any[];
  const totalUnmatched = Number(unmatchedData?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalUnmatched / XERO_UNMATCHED_PAGE_SIZE));
  const sourceCounts = new Map(
    (unmatchedData?.sourceCounts || []).map((row: any) => [row.sourceType, Number(row.count || 0)])
  );
  const filteredStart = totalUnmatched > 0 ? page * XERO_UNMATCHED_PAGE_SIZE + 1 : 0;
  const filteredEnd = totalUnmatched > 0
    ? Math.min((page + 1) * XERO_UNMATCHED_PAGE_SIZE, totalUnmatched)
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Unmatched Xero Transactions
              {totalUnmatched > 0 && <Badge variant="secondary">{totalUnmatched}</Badge>}
            </CardTitle>
            <CardDescription>
              Xero lines that were imported but could not be confidently matched to a construction client.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Reload List
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncUnmatched.mutate({ maxPages: 50, includeUnmatched: true, incremental: true })}
                disabled={syncUnmatched.isPending}
              >
                {syncUnmatched.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5 mr-1" />
                )}
                Sync Changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => syncUnmatched.mutate({ maxPages: 100, includeUnmatched: true, incremental: false })}
                disabled={syncUnmatched.isPending}
              >
                Full Resync
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_auto] gap-2 lg:items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference, contact, description, tracking..."
              className="pl-8"
            />
          </div>
          <Select value={sourceType} onValueChange={(value) => setSourceType(value as "all" | XeroUnmatchedSource)}>
            <SelectTrigger>
              <SelectValue placeholder="Source type" />
            </SelectTrigger>
            <SelectContent>
              {XERO_UNMATCHED_SOURCE_FILTERS.map((filter) => {
                const count = filter.value === "all"
                  ? Array.from(sourceCounts.values()).reduce((sum, value) => sum + value, 0)
                  : sourceCounts.get(filter.value) || 0;
                return (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm lg:justify-end">
            <Switch id="xero-apply-document" checked={applyToDocument} onCheckedChange={setApplyToDocument} />
            <Label htmlFor="xero-apply-document" className="whitespace-nowrap">Assign whole document</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {XERO_UNMATCHED_SOURCE_FILTERS.filter((filter) => filter.value !== "all").map((filter) => (
            <Badge key={filter.value} variant={sourceType === filter.value ? "default" : "outline"} className="font-normal">
              {filter.label}: {sourceCounts.get(filter.value) || 0}
            </Badge>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading unmatched transactions...
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span>Could not load unmatched transactions.</span>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : unmatchedRows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            No unmatched Xero transaction lines match the current filters.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Showing {filteredStart}-{filteredEnd} of {totalUnmatched} unmatched line{totalUnmatched === 1 ? "" : "s"}.
            </p>
            {unmatchedRows.map((row) => {
              const selected = selectedMappings[row.id] || (row.suggestions?.[0]?.id ? String(row.suggestions[0].id) : "none");
              const selectedSuggestion = row.suggestions?.find((suggestion: any) => String(suggestion.id) === selected);
              const canAssign = selected && selected !== "none";
              const trackingLabel = row.trackingCategoryName || "Tracking";

              return (
                <div key={row.id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{formatXeroSourceType(String(row.sourceType || ""))}</Badge>
                        <span className="font-medium">{row.transactionNumber || row.reference || "No reference"}</span>
                        <span className="text-sm text-muted-foreground">{formatShortDate(row.transactionDate)}</span>
                        <span className={Number(row.grossAmount || 0) < 0 ? "font-semibold text-red-600" : "font-semibold"}>
                          {formatCurrency(row.grossAmount)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {row.contactName || "Unknown contact"}{row.description ? ` · ${row.description}` : ""}
                      </p>
                      {(row.reference || row.trackingOptionName) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {row.reference ? `Ref: ${row.reference}` : ""}{row.reference && row.trackingOptionName ? " · " : ""}{row.trackingOptionName ? `${trackingLabel}: ${row.trackingOptionName}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center lg:min-w-[420px]">
                      <Select
                        value={selected}
                        onValueChange={(value) => setSelectedMappings((current) => ({ ...current, [row.id]: value }))}
                      >
                        <SelectTrigger className="sm:min-w-[280px]">
                          <SelectValue placeholder="Choose matching job" />
                        </SelectTrigger>
                        <SelectContent>
                          {row.suggestions?.length ? row.suggestions.map((suggestion: any) => (
                            <SelectItem key={suggestion.id} value={String(suggestion.id)}>
                              {suggestion.clientNumber || suggestion.quoteNumber || `Job #${suggestion.jobId}`} · {suggestion.clientName}
                            </SelectItem>
                          )) : (
                            <SelectItem value="none">No suggestion</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => assignUnmatched.mutate({
                          transactionId: row.id,
                          mappingId: Number(selected),
                          applyToDocument,
                        })}
                        disabled={!canAssign || assignUnmatched.isPending}
                      >
                        {assignUnmatched.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                        Assign
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => ignoreUnmatched.mutate({
                          transactionId: row.id,
                          applyToDocument,
                          reason: "Not relevant to construction client matching",
                        })}
                        disabled={ignoreUnmatched.isPending}
                      >
                        {ignoreUnmatched.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                        Ignore
                      </Button>
                    </div>
                  </div>
                  {selectedSuggestion && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Suggested match score {selectedSuggestion.score}</span>
                      {selectedSuggestion.reasons?.map((reason: string) => (
                        <Badge key={`${row.id}-${reason}`} variant="secondary" className="text-[11px] font-normal">
                          {reason}
                        </Badge>
                      ))}
                      <Button asChild variant="ghost" size="sm" className="h-6 px-2 ml-auto">
                        <a href={`/construction/clients/${selectedSuggestion.jobId}`}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          View job
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Page {Math.min(page + 1, totalPages)} of {totalPages}
              </span>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setPage(0)}
                  disabled={page === 0 || isFetching}
                  aria-label="Go to first page"
                  title="Go to first page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                  <span className="sr-only">Go to first page</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || isFetching}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={page >= totalPages - 1 || isFetching}
                >
                  Next
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1 || isFetching}
                  aria-label="Go to last page"
                  title="Go to last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                  <span className="sr-only">Go to last page</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function XeroSettings() {
  const utils = trpc.useUtils();
  const [isConnecting, setIsConnecting] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<any | null>(null);
  const [activeSyncLogId, setActiveSyncLogId] = useState<number | null>(null);
  const [expandedSyncLogId, setExpandedSyncLogId] = useState<number | null>(null);
  const [routingRuleDraft, setRoutingRuleDraft] = useState<RoutingRuleDraft>(() => emptyRoutingRuleDraft());
  const [dryRunModuleKey, setDryRunModuleKey] = useState("construction");
  const [dryRunContext, setDryRunContext] = useState({
    branch: "",
    postcode: "",
    state: "NSW",
    quoteTotal: "",
    productType: "",
    supplierName: "",
    clientName: "",
    projectName: "",
  });

  // Import options
  const [includeOpen, setIncludeOpen] = useState(true);
  const [includeClosed, setIncludeClosed] = useState(true);

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      handleOAuthCallback(code);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: connectionStatus, isLoading, refetch } = trpc.xero.connectionStatus.useQuery();
  const { data: entityConfig, isLoading: isLoadingEntityConfig } = trpc.xero.entityConfig.useQuery(undefined, {
    enabled: !!connectionStatus?.connected,
  });
  const { data: routingRulesConfig, isLoading: isLoadingRoutingRules } = trpc.xero.routingRules.useQuery(undefined, {
    enabled: !!connectionStatus?.connected,
  });
  const getAuthUrl = trpc.xero.getAuthUrl.useMutation();
  const handleCallbackMutation = trpc.xero.handleCallback.useMutation();
  const disconnect = trpc.xero.disconnect.useMutation();
  const deleteConnection = trpc.xero.deleteConnection.useMutation({
    onSuccess: (result) => {
      toast.success(result.reassignedTo
        ? `Removed duplicate entity and kept history on ${result.reassignedTo.tenantName || "the active entity"}`
        : "Xero entity deleted");
      setEntityToDelete(null);
      utils.xero.entityConfig.invalidate();
      utils.xero.connectionStatus.invalidate();
      utils.xero.routingRules.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete Xero entity"),
  });
  const setEntityDefault = trpc.xero.setEntityDefault.useMutation({
    onSuccess: () => {
      toast.success("Xero entity default updated");
      utils.xero.entityConfig.invalidate();
      utils.xero.connectionStatus.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update Xero entity default"),
  });
  const setConnectionActive = trpc.xero.setConnectionActive.useMutation({
    onSuccess: () => {
      toast.success("Xero entity status updated");
      utils.xero.entityConfig.invalidate();
      utils.xero.connectionStatus.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update Xero entity status"),
  });
  const saveRoutingRule = trpc.xero.saveRoutingRule.useMutation({
    onSuccess: () => {
      toast.success("Xero routing rule saved");
      utils.xero.routingRules.invalidate();
      setRoutingRuleDraft(emptyRoutingRuleDraft());
    },
    onError: (err) => toast.error(err.message || "Failed to save routing rule"),
  });
  const deleteRoutingRule = trpc.xero.deleteRoutingRule.useMutation({
    onSuccess: () => {
      toast.success("Xero routing rule deleted");
      utils.xero.routingRules.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete routing rule"),
  });
  const dryRunRouting = trpc.xero.dryRunRouting.useMutation({
    onSuccess: (result) => {
      if (result.connection) {
        toast.success(`Routes to ${result.connection.tenantName || "selected Xero entity"}`);
      } else {
        toast.warning("No matching Xero entity found");
      }
    },
    onError: (err) => toast.error(err.message || "Dry run failed"),
  });
  const { data: orgInfo } = trpc.xero.getOrganisation.useQuery(undefined, {
    enabled: !!connectionStatus?.connected,
  });

  // Xero Projects sync queries & mutations
  const { data: syncLogs, refetch: refetchLogs } = trpc.xeroProjects.getSyncLogs.useQuery(
    { limit: 10 },
    {
      enabled: !!connectionStatus?.connected,
      refetchInterval: (query) => {
        const logs = query.state.data;
        const hasRunning = logs?.some((l) => l.status === "running");
        return hasRunning ? 15000 : false; // Auto-refresh every 15s while a sync is running
      },
    }
  );
  const { data: mappings, refetch: refetchMappings } = trpc.xeroProjects.getAllMappings.useQuery(
    undefined,
    { enabled: !!connectionStatus?.connected }
  );
  const { data: syncHealth, refetch: refetchSyncHealth } = trpc.xeroAccounting.getSyncHealth.useQuery(
    undefined,
    {
      enabled: !!connectionStatus?.connected,
      refetchInterval: 30000,
    }
  );

  const importProjects = trpc.xeroProjects.importProjects.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Imported ${result.imported} new projects, updated ${result.updated} existing. ${result.failed > 0 ? `${result.failed} failed.` : ""}`
      );
      refetchLogs();
      refetchMappings();
      refetchSyncHealth();
    },
    onError: (err) => toast.error(err.message || "Import failed"),
  });

  const syncFinancials = trpc.xeroProjects.syncFinancials.useMutation({
    onSuccess: (result) => {
      toast.success(result.message || `Financial sync started. Processing ${result.totalItems} projects in chunks.`);
      refetchLogs();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.warning(err.message || "A sync is already running. Please wait.");
      } else {
        toast.error(err.message || "Financial sync failed");
      }
    },
  });

  const cancelFinancialSync = trpc.xeroProjects.cancelFinancialSync.useMutation({
    onSuccess: (result) => {
      toast.success(result.message || "Financial sync cancelled.");
      refetchLogs();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to cancel sync");
    },
  });

  const batchSyncContacts = trpc.xeroProjects.batchSyncContacts.useMutation({
    onSuccess: (result) => {
      toast.success(`Synced ${result.processed} contacts. ${result.failed > 0 ? `${result.failed} failed.` : ""}`);
      refetchLogs();
    },
    onError: (err) => toast.error(err.message || "Contact sync failed"),
  });

  const fullBatchSync = trpc.xeroProjects.fullBatchSync.useMutation({
    onSuccess: (result) => {
      toast.info("Full batch sync started in background...");
      setActiveSyncLogId(result.syncLogId);
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.warning(err.message || "A sync is already running. Please wait.");
      } else {
        toast.error(err.message || "Full batch sync failed");
      }
    },
  });

  // Poll sync status when a background sync is running
  const { data: syncStatus } = trpc.xeroProjects.getSyncStatus.useQuery(
    { syncLogId: activeSyncLogId! },
    {
      enabled: activeSyncLogId !== null,
      refetchInterval: 3000,
    }
  );

  // React to sync status changes
  useEffect(() => {
    if (!syncStatus || !activeSyncLogId) return;
    if (syncStatus.status === "completed") {
      toast.success(
        `Full sync complete: ${syncStatus.itemsProcessed ?? 0} items processed.${(syncStatus.itemsFailed ?? 0) > 0 ? ` ${syncStatus.itemsFailed} failed.` : ""}`
      );
      setActiveSyncLogId(null);
      refetchLogs();
      refetchMappings();
      refetchSyncHealth();
    } else if (syncStatus.status === "failed") {
      toast.error(`Full sync failed: ${syncStatus.errorMessage || "Unknown error"}`);
      setActiveSyncLogId(null);
      refetchLogs();
    }
  }, [syncStatus?.status]);

  const syncAccountingTransactions = trpc.xeroAccounting.syncAll.useMutation({
    onSuccess: (result) => {
      const fetched = result.fetched?.total ?? 0;
      toast.success(
        `Fetched ${fetched} Xero document(s); imported ${result.imported} line(s), with ${result.unmatched} unmatched.`
      );
      if (result.fetchErrors?.length) {
        toast.warning(`Some Xero endpoints returned warnings: ${result.fetchErrors.join("; ")}`);
      }
      refetchMappings();
      refetchLogs();
      refetchSyncHealth();
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.warning(err.message || "A sync is already running. Please wait.");
      } else {
        toast.error(err.message || "Transaction sync failed");
      }
    },
  });

  const populateBranches = trpc.xeroGL.populateBranches.useMutation({
    onSuccess: (result) => {
      toast.success(`Updated branch for ${result.updated} jobs`);
    },
    onError: (err) => toast.error(err.message || "Branch population failed"),
  });

  const isBatchSyncRunning = fullBatchSync.isPending || activeSyncLogId !== null;
  const isSyncing =
    importProjects.isPending ||
    syncFinancials.isPending ||
    batchSyncContacts.isPending ||
    syncAccountingTransactions.isPending ||
    populateBranches.isPending ||
    isBatchSyncRunning;

  async function handleConnect(scopeProfile?: XeroScopeProfile) {
    setIsConnecting(true);
    try {
      const result = await getAuthUrl.mutateAsync({ origin: window.location.origin, scopeProfile });
      window.location.href = result.authUrl;
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate Xero connection");
      setIsConnecting(false);
    }
  }

  async function handleOAuthCallback(code: string) {
    setIsConnecting(true);
    try {
      const result = await handleCallbackMutation.mutateAsync({
        code,
        origin: window.location.origin,
      });
      toast.success(`Successfully connected ${result.tenants.length} organisation(s)`);
      refetch();
      utils.xero.entityConfig.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to complete Xero connection");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect(connectionId: number) {
    try {
      await disconnect.mutateAsync({ connectionId });
      toast.success("Xero connection has been removed");
      refetch();
      utils.xero.entityConfig.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to disconnect");
    }
  }

  async function handleRefreshStatus() {
    await Promise.all([
      refetch(),
      orgInfo ? utils.xero.getOrganisation.invalidate() : Promise.resolve(),
      refetchLogs(),
      refetchMappings(),
      refetchSyncHealth(),
      utils.xeroAccounting.getUnmatched.invalidate(),
      utils.xero.entityConfig.invalidate(),
      utils.xero.routingRules.invalidate(),
    ]);
    toast.success("Xero status refreshed");
  }

  function handleDeleteEntity() {
    if (!entityToDelete) return;
    deleteConnection.mutate({ connectionId: entityToDelete.id });
  }

  function updateRoutingCondition(index: number, patch: Partial<RoutingConditionDraft>) {
    setRoutingRuleDraft((draft) => ({
      ...draft,
      conditions: draft.conditions.map((condition, i) => i === index ? { ...condition, ...patch } : condition),
    }));
  }

  function removeRoutingCondition(index: number) {
    setRoutingRuleDraft((draft) => ({
      ...draft,
      conditions: draft.conditions.filter((_, i) => i !== index),
    }));
  }

  function editRoutingRule(rule: any) {
    setRoutingRuleDraft({
      id: rule.id,
      name: rule.name || "",
      moduleKey: rule.moduleKey || "construction",
      targetXeroConnectionId: String(rule.targetXeroConnectionId || ""),
      priority: String(rule.priority || 100),
      isActive: !!rule.isActive,
      conditions: Array.isArray(rule.conditions) && rule.conditions.length
        ? rule.conditions.map((condition: any) => ({
          field: condition.field || "branch",
          operator: condition.operator || "equals",
          value: String(condition.value || ""),
        }))
        : [{ field: "branch", operator: "equals", value: "" }],
      notes: rule.notes || "",
    });
  }

  function handleSaveRoutingRule() {
    if (!routingRuleDraft.name.trim()) {
      toast.error("Give the routing rule a name");
      return;
    }
    if (!routingRuleDraft.targetXeroConnectionId) {
      toast.error("Choose the target Xero entity");
      return;
    }

    const conditions = routingRuleDraft.conditions
      .map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        value: condition.value.trim(),
      }))
      .filter((condition) => condition.value.length > 0);

    saveRoutingRule.mutate({
      id: routingRuleDraft.id,
      name: routingRuleDraft.name.trim(),
      moduleKey: routingRuleDraft.moduleKey as any,
      targetXeroConnectionId: Number(routingRuleDraft.targetXeroConnectionId),
      priority: Number(routingRuleDraft.priority) || 100,
      isActive: routingRuleDraft.isActive,
      conditions: conditions as any,
      notes: routingRuleDraft.notes.trim() || null,
    });
  }

  function handleDryRunRouting() {
    const context: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(dryRunContext)) {
      if (value === "") continue;
      context[key] = key === "quoteTotal" ? Number(value) : value;
    }
    dryRunRouting.mutate({
      moduleKey: dryRunModuleKey as any,
      context,
    });
  }

  function formatSyncType(type: string) {
    const map: Record<string, string> = {
      contacts: "Contact Sync",
      projects_import: "Project Import",
      projects_push: "Push to Xero",
      financials: "Financial Sync",
      full_batch: "Full Batch Sync",
    };
    return map[type] || type;
  }

  function formatSyncStatus(status: string) {
    if (status === "completed") return <Badge variant="default" className="bg-green-600">Completed</Badge>;
    if (status === "running") return <Badge variant="secondary" className="animate-pulse">Running</Badge>;
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  }

  function formatOperationalStatus(status: string) {
    if (status === "processed" || status === "completed") return <Badge variant="default" className="bg-green-600">OK</Badge>;
    if (status === "queued" || status === "processing" || status === "running") return <Badge variant="secondary" className="animate-pulse">{status}</Badge>;
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
    if (status === "skipped") return <Badge variant="outline">Skipped</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  }

  function formatDateTime(value: string | Date | null | undefined) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-AU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const defaultByModule = new Map(
    (entityConfig?.defaults || []).map((d) => [d.moduleKey, d.xeroConnectionId] as const)
  );
  const activeEntityOptions = (entityConfig?.connections || []).filter((conn) => conn.isActive);
  const entityCountByTenant = new Map<string, number>();
  for (const conn of entityConfig?.connections || []) {
    if (!conn.tenantId) continue;
    entityCountByTenant.set(conn.tenantId, (entityCountByTenant.get(conn.tenantId) || 0) + 1);
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Xero Integration</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Xero accounting software to sync contacts, projects, invoices, and purchase orders.
        </p>
      </div>

      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#13B5EA"/>
                  <path d="M7.5 9.5l2.5 2.5-2.5 2.5M11.5 9.5l2.5 2.5-2.5 2.5M15.5 9.5l1.5 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Connection Status
              </CardTitle>
              <CardDescription>
                {connectionStatus?.connected
                  ? "Your Xero account is connected and active"
                  : "Connect your Xero account to enable accounting features"}
              </CardDescription>
            </div>
            <Badge variant={connectionStatus?.connected ? "default" : "secondary"} className="text-sm">
              {connectionStatus?.connected ? (
                <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Connected</>
              ) : (
                <><AlertCircle className="h-3.5 w-3.5 mr-1" /> Not Connected</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!connectionStatus?.connected ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium">What connecting to Xero enables:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Sync construction clients as Xero contacts</li>
                  <li>Import and link Xero Projects to construction jobs</li>
                  <li>Sync project costs from Xero bills and spend-money transactions</li>
                  <li>Create progress claim invoices directly from jobs</li>
                  <li>Send purchase orders to suppliers through Xero</li>
                  <li>Track invoice payments and job profitability</li>
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => handleConnect("accounting_standard")} disabled={isConnecting} size="lg">
                  <Link2 className="h-4 w-4 mr-2" />
                  {isConnecting ? "Connecting..." : "Connect to Xero"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleConnect("accounting_read")}
                  disabled={isConnecting}
                >
                  Read-only accounting
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleConnect("sign_in_only")}
                  disabled={isConnecting}
                >
                  Settings-only test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                If Xero reports invalid_scope, try Settings-only test. If that works, the Xero developer app accepts OAuth and we can narrow the accounting scope that needs adjustment.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orgInfo && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm font-medium">Organisation</p>
                  <p className="text-lg font-semibold">{orgInfo.Name}</p>
                  {orgInfo.LegalName && orgInfo.LegalName !== orgInfo.Name && (
                    <p className="text-sm text-muted-foreground">{orgInfo.LegalName}</p>
                  )}
                  {orgInfo.ShortCode && (
                    <p className="text-xs text-muted-foreground mt-1">Short Code: {orgInfo.ShortCode}</p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium">Connected Organisations</p>
                {connectionStatus.connections.map((conn) => (
                  <div key={conn.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{conn.tenantName || "Unknown Organisation"}</p>
                      <p className="text-xs text-muted-foreground">
                        Type: {conn.tenantType || "ORGANISATION"} &middot; Token expires: {new Date(conn.tokenExpiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(conn.id)}
                      disabled={disconnect.isPending}
                    >
                      <Unlink className="h-3.5 w-3.5 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => handleConnect("accounting_standard")} disabled={isConnecting}>
                  <Link2 className="h-4 w-4 mr-2" />
                  {isConnecting ? "Connecting..." : "Add Xero Organisation"}
                </Button>
                <Button variant="outline" onClick={() => handleConnect("accounting_read")} disabled={isConnecting}>
                  Read-only
                </Button>
                <Button variant="ghost" onClick={() => handleConnect("sign_in_only")} disabled={isConnecting}>
                  Settings-only test
                </Button>
                <Button variant="outline" onClick={handleRefreshStatus}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </Button>
                <Button variant="outline" asChild>
                  <a href="https://go.xero.com" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Xero
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {connectionStatus?.connected && (
        <Tabs defaultValue="connections" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="connections">Entities</TabsTrigger>
            <TabsTrigger value="routing">Routing</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="clients">Client Import</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Xero Entities
                  </CardTitle>
                  <CardDescription>
                    Choose which connected Xero organisation each part of the app should use.
                  </CardDescription>
                </div>
                <Button onClick={() => handleConnect("accounting_standard")} disabled={isConnecting} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {isConnecting ? "Connecting..." : "Add Entity"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoadingEntityConfig ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading Xero entities...
                </div>
              ) : !entityConfig?.connections?.length ? (
                <p className="text-sm text-muted-foreground">No connected Xero organisations found.</p>
              ) : (
                <>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Connected entities</p>
                    <div className="grid gap-3">
                      {entityConfig.connections.map((conn) => (
                        <div key={conn.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border rounded-lg p-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{conn.tenantName || "Unknown Organisation"}</p>
                              <Badge variant={conn.isActive ? "default" : "secondary"} className="shrink-0">
                                {conn.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {(entityCountByTenant.get(conn.tenantId || "") || 0) > 1 && (
                                <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-700">
                                  Duplicate
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {conn.tenantType || "ORGANISATION"} &middot; Xero tenant {conn.tenantId?.slice(0, 8) || "—"} &middot; Token expires {new Date(conn.tokenExpiresAt).toLocaleDateString("en-AU")}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`xero-active-${conn.id}`} className="text-sm">Use</Label>
                              <Switch
                                id={`xero-active-${conn.id}`}
                                checked={conn.isActive}
                                disabled={setConnectionActive.isPending}
                                onCheckedChange={(isActive) => setConnectionActive.mutate({ connectionId: conn.id, isActive })}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={conn.isActive || deleteConnection.isPending}
                              onClick={() => setEntityToDelete(conn)}
                              title={conn.isActive ? "Turn this entity off before deleting it" : "Delete this local Xero entity"}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-muted/50 border-b">
                      <p className="text-sm font-medium">Module defaults</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Module defaults fall back to the global default. If multiple active entities exist and no default is set, sync is blocked instead of guessing.
                      </p>
                    </div>
                    <div className="divide-y">
                      {(entityConfig.modules || []).map((module) => (
                        <div key={module.key} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:items-center px-4 py-3">
                          <div>
                            <p className="text-sm font-medium">{module.label}</p>
                          </div>
                          <Select
                            value={String(defaultByModule.get(module.key) ?? "none")}
                            disabled={setEntityDefault.isPending || activeEntityOptions.length === 0}
                            onValueChange={(value) => {
                              setEntityDefault.mutate({
                                moduleKey: module.key,
                                connectionId: value === "none" ? null : Number(value),
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose Xero entity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Use fallback</SelectItem>
                              {activeEntityOptions.map((conn) => (
                                <SelectItem key={conn.id} value={String(conn.id)}>
                                  {conn.tenantName || `Xero entity #${conn.id}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5" />
                Xero Routing Rules
              </CardTitle>
              <CardDescription>
                Route records to a specific Xero entity when project or transaction details match.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{routingRuleDraft.id ? "Edit routing rule" : "New routing rule"}</p>
                    <p className="text-xs text-muted-foreground">
                      Rules are checked by priority; the first active match wins.
                    </p>
                  </div>
                  {routingRuleDraft.id && (
                    <Button variant="outline" size="sm" onClick={() => setRoutingRuleDraft(emptyRoutingRuleDraft())}>
                      New
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Rule name</Label>
                    <Input
                      value={routingRuleDraft.name}
                      onChange={(event) => setRoutingRuleDraft((draft) => ({ ...draft, name: event.target.value }))}
                      placeholder="e.g. Manufacturing POs to Spanline"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Module</Label>
                    <Select
                      value={routingRuleDraft.moduleKey}
                      onValueChange={(moduleKey) => setRoutingRuleDraft((draft) => ({ ...draft, moduleKey }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(entityConfig?.modules || []).map((module) => (
                          <SelectItem key={module.key} value={module.key}>{module.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Xero entity</Label>
                    <Select
                      value={routingRuleDraft.targetXeroConnectionId || "none"}
                      onValueChange={(targetXeroConnectionId) => setRoutingRuleDraft((draft) => ({
                        ...draft,
                        targetXeroConnectionId: targetXeroConnectionId === "none" ? "" : targetXeroConnectionId,
                      }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose target entity" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose entity</SelectItem>
                        {activeEntityOptions.map((conn) => (
                          <SelectItem key={conn.id} value={String(conn.id)}>
                            {conn.tenantName || `Xero entity #${conn.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        min={1}
                        value={routingRuleDraft.priority}
                        onChange={(event) => setRoutingRuleDraft((draft) => ({ ...draft, priority: event.target.value }))}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-2">
                      <Label htmlFor="xero-rule-active" className="text-sm">Active</Label>
                      <Switch
                        id="xero-rule-active"
                        checked={routingRuleDraft.isActive}
                        onCheckedChange={(isActive) => setRoutingRuleDraft((draft) => ({ ...draft, isActive }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Conditions</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRoutingRuleDraft((draft) => ({
                        ...draft,
                        conditions: [...draft.conditions, { field: "branch", operator: "equals", value: "" }],
                      }))}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {routingRuleDraft.conditions.map((condition, index) => (
                      <div key={`${condition.field}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr_auto] gap-2">
                        <Select value={condition.field} onValueChange={(field) => updateRoutingCondition(index, { field })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(routingRulesConfig?.fields || Object.keys(ROUTING_FIELD_LABELS)).map((field) => (
                              <SelectItem key={field} value={field}>{ROUTING_FIELD_LABELS[field] || field}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={condition.operator} onValueChange={(operator) => updateRoutingCondition(index, { operator })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(routingRulesConfig?.operators || Object.keys(ROUTING_OPERATOR_LABELS)).map((operator) => (
                              <SelectItem key={operator} value={operator}>{ROUTING_OPERATOR_LABELS[operator] || operator}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={condition.value}
                          onChange={(event) => updateRoutingCondition(index, { value: event.target.value })}
                          placeholder={condition.operator === "in" ? "ACT, NSW" : "Value"}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRoutingCondition(index)}
                          disabled={routingRuleDraft.conditions.length === 1}
                          aria-label="Remove condition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input
                    value={routingRuleDraft.notes}
                    onChange={(event) => setRoutingRuleDraft((draft) => ({ ...draft, notes: event.target.value }))}
                    placeholder="Optional internal note"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveRoutingRule} disabled={saveRoutingRule.isPending || activeEntityOptions.length === 0}>
                    {saveRoutingRule.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save Rule
                  </Button>
                  <Button variant="outline" onClick={() => setRoutingRuleDraft(emptyRoutingRuleDraft())}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-muted/50 border-b">
                    <p className="text-sm font-medium">Configured rules</p>
                  </div>
                  <div className="divide-y">
                    {isLoadingRoutingRules ? (
                      <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading rules...
                      </div>
                    ) : routingRulesConfig?.rules?.length ? (
                      routingRulesConfig.rules.map((rule) => (
                        <div key={rule.id} className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{rule.name}</p>
                                <Badge variant={rule.isActive ? "default" : "secondary"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Priority {rule.priority} &middot; {entityConfig?.modules?.find((m) => m.key === rule.moduleKey)?.label || rule.moduleKey} &middot; {rule.targetConnection?.tenantName || "Unknown entity"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => editRoutingRule(rule)} aria-label="Edit rule">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteRoutingRule.mutate({ id: rule.id })}
                                disabled={deleteRoutingRule.isPending}
                                aria-label="Delete rule"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(rule.conditions || []).length ? (rule.conditions || []).map((condition: any, index: number) => (
                              <Badge key={`${rule.id}-${index}`} variant="outline" className="font-normal">
                                {ROUTING_FIELD_LABELS[condition.field] || condition.field} {ROUTING_OPERATOR_LABELS[condition.operator] || condition.operator} {condition.value}
                              </Badge>
                            )) : (
                              <Badge variant="outline" className="font-normal">Always matches</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">No routing rules configured yet.</p>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">Dry run</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Test which entity would be selected before enabling write routing.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Module</Label>
                    <Select value={dryRunModuleKey} onValueChange={setDryRunModuleKey}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(entityConfig?.modules || []).map((module) => (
                          <SelectItem key={module.key} value={module.key}>{module.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(dryRunContext).map((field) => (
                      <div key={field} className="space-y-1.5">
                        <Label>{ROUTING_FIELD_LABELS[field] || field}</Label>
                        <Input
                          type={field === "quoteTotal" ? "number" : "text"}
                          value={(dryRunContext as any)[field]}
                          onChange={(event) => setDryRunContext((context) => ({ ...context, [field]: event.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" onClick={handleDryRunRouting} disabled={dryRunRouting.isPending}>
                    {dryRunRouting.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                    Run Dry Run
                  </Button>
                  {dryRunRouting.data && (
                    <div className="rounded-lg border p-3 text-sm space-y-1">
                      <p className="font-medium">
                        {dryRunRouting.data.connection
                          ? dryRunRouting.data.connection.tenantName || `Xero entity #${dryRunRouting.data.connection.id}`
                          : "No Xero entity selected"}
                      </p>
                      <p className="text-muted-foreground">
                        {dryRunRouting.data.source === "rule" && dryRunRouting.data.matchedRule
                          ? `Matched rule: ${dryRunRouting.data.matchedRule.name}`
                          : "Used module/global default"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Sync Operations
              </CardTitle>
              <CardDescription>
                Webhook, transaction, and import health for this tenant's Xero connection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Transaction Lines</p>
                  <p className="text-xl font-semibold">{syncHealth?.totals.rows ?? 0}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Unmatched Lines</p>
                  <p className={`text-xl font-semibold ${(syncHealth?.totals.unmatched || 0) > 0 ? "text-amber-600" : ""}`}>
                    {syncHealth?.totals.unmatched ?? 0}
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Cost Lines</p>
                  <p className="text-xl font-semibold">{syncHealth?.totals.costs ?? 0}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Revenue Lines</p>
                  <p className="text-xl font-semibold">{syncHealth?.totals.revenue ?? 0}</p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Ignored Lines</p>
                  <p className="text-xl font-semibold text-muted-foreground">{syncHealth?.totals.ignored ?? 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Recent Webhook Events</h3>
                    {(syncHealth?.recentWebhookEvents || []).some((event) => event.status === "failed") && (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                  {syncHealth?.recentWebhookEvents?.length ? (
                    <div className="space-y-2">
                      {syncHealth.recentWebhookEvents.slice(0, 5).map((event) => (
                        <div key={event.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{event.eventCategory || "XERO"} {event.eventType || ""}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(event.receivedAt)}</p>
                          </div>
                          {formatOperationalStatus(event.status)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No webhook events recorded yet.</p>
                  )}
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm">Latest Syncs & Imports</h3>
                  <div className="space-y-2 text-sm">
                    {(syncHealth?.recentSyncLogs || []).slice(0, 3).map((log) => (
                      <div key={log.id} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatSyncType(log.syncType)}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(log.startedAt)}</p>
                        </div>
                        {formatOperationalStatus(log.status)}
                      </div>
                    ))}
                    {!syncHealth?.recentSyncLogs?.length && (
                      <p className="text-muted-foreground">No sync log entries yet.</p>
                    )}
                  </div>
                  <div className="border-t pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">Last Cost Import</p>
                      <p>{syncHealth?.lastCostImport ? `${syncHealth.lastCostImport.status} · ${formatDateTime(syncHealth.lastCostImport.createdAt)}` : "—"}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Last Budget Import</p>
                      <p>{syncHealth?.lastBudgetImport ? `${syncHealth.lastBudgetImport.status} · ${formatDateTime(syncHealth.lastBudgetImport.createdAt)}` : "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <UnmatchedXeroTransactionsPanel />
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderSync className="h-5 w-5" />
                Projects Sync
              </CardTitle>
              <CardDescription>
                Import Xero Projects into construction jobs, push new jobs to Xero, and sync financial data.
                {mappings && mappings.length > 0 && (
                  <span className="ml-1 font-medium">{mappings.length} project(s) linked.</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Import Projects */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-blue-600" />
                  <h3 className="font-semibold">Import Xero Projects</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pull all existing Xero Projects into the system as construction jobs. Already-linked projects will have their financial data updated.
                </p>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="includeOpen"
                      checked={includeOpen}
                      onCheckedChange={setIncludeOpen}
                    />
                    <Label htmlFor="includeOpen" className="text-sm">Open Projects</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="includeClosed"
                      checked={includeClosed}
                      onCheckedChange={setIncludeClosed}
                    />
                    <Label htmlFor="includeClosed" className="text-sm">Closed Projects</Label>
                  </div>
                </div>
                <Button
                  onClick={() => importProjects.mutate({ includeOpen, includeClosed })}
                  disabled={isSyncing || (!includeOpen && !includeClosed)}
                >
                  {importProjects.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" /> Import All Projects</>
                  )}
                </Button>
              </div>

              {/* Sync Actions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Sync Contacts */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-sm">Sync Contacts</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Push all construction job clients to Xero as contacts.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => batchSyncContacts.mutate()}
                    disabled={isSyncing}
                    className="w-full"
                  >
                    {batchSyncContacts.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Syncing...</>
                    ) : (
                      <><Users className="h-3.5 w-3.5 mr-1" /> Sync Contacts</>
                    )}
                  </Button>
                </div>

                {/* Sync Financials */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <h3 className="font-semibold text-sm">Sync Financials</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pull latest invoiced amounts, costs, and profit from Xero (processes small batches every 5 min).
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncFinancials.mutate()}
                    disabled={isSyncing}
                    className="w-full"
                  >
                    {syncFinancials.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Syncing...</>
                    ) : (
                      <><DollarSign className="h-3.5 w-3.5 mr-1" /> Sync Financials</>
                    )}
                  </Button>
                  {syncLogs?.some((l) => l.syncType === "financials" && l.status === "running") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelFinancialSync.mutate()}
                      disabled={cancelFinancialSync.isPending}
                      className="w-full"
                    >
                      {cancelFinancialSync.isPending ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Cancelling...</>
                      ) : (
                        <><XCircle className="h-3.5 w-3.5 mr-1" /> Cancel Sync</>
                      )}
                    </Button>
                  )}
                </div>


                {/* Sync Accounting Transactions */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-sky-600" />
                    <h3 className="font-semibold text-sm">Sync Transactions</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pull changed Xero bills, invoices, credit notes, and spend-money lines and match them to linked projects.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncAccountingTransactions.mutate({ maxPages: 50, includeUnmatched: true, incremental: true })}
                      disabled={isSyncing}
                      className="w-full"
                    >
                      {syncAccountingTransactions.isPending ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Syncing...</>
                      ) : (
                        <><Activity className="h-3.5 w-3.5 mr-1" /> Sync Changes</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => syncAccountingTransactions.mutate({ maxPages: 100, includeUnmatched: true, incremental: false })}
                      disabled={isSyncing}
                      className="w-full"
                    >
                      Full Resync
                    </Button>
                  </div>
                </div>


                {/* Populate Branches */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-sm">Populate Branches</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Derive branch from project name prefix (ACT=Canberra, RIV=Wagga). No API calls needed.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => populateBranches.mutate()}
                    disabled={isSyncing}
                    className="w-full"
                  >
                    {populateBranches.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Populating...</>
                    ) : (
                      <><Building2 className="h-3.5 w-3.5 mr-1" /> Populate Branches</>
                    )}
                  </Button>
                </div>

                {/* Full Batch Sync */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-orange-600" />
                    <h3 className="font-semibold text-sm">Full Batch Sync</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contacts + financials + push unmapped active jobs to Xero.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fullBatchSync.mutate()}
                    disabled={isSyncing}
                    className="w-full"
                  >
                    {isBatchSyncRunning ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Syncing in background...</>
                    ) : (
                      <><ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Full Batch Sync</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Linked Projects Summary */}
              {mappings && mappings.length > 0 && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <h3 className="font-semibold text-sm">Linked Projects ({mappings.length})</h3>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => refetchMappings()}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-2">Project</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 text-right">Invoiced</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappings.map((m) => (
                          <tr key={m.id} className="border-b last:border-0">
                            <td className="py-2 pr-2 max-w-[200px] truncate" title={m.xeroProjectName || ""}>
                              {m.xeroProjectName || `Job #${m.jobId}`}
                            </td>
                            <td className="py-2 pr-2">
                              <Badge variant={m.xeroProjectStatus === "CLOSED" ? "secondary" : "default"} className="text-xs">
                                {m.xeroProjectStatus === "CLOSED" ? "Closed" : "Active"}
                              </Badge>
                            </td>
                            <td className="py-2 text-right font-mono">
                              ${parseFloat(m.totalInvoiced || "0").toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
          {/* Sync Logs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Sync History
                  </CardTitle>
                  <CardDescription>Recent synchronisation activity</CardDescription>
                </div>
                <Button size="sm" variant="ghost" onClick={() => refetchLogs()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!syncLogs || syncLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No sync activity yet. Use the buttons above to start syncing with Xero.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3 text-right">Processed</th>
                        <th className="py-2 pr-3 text-right">Failed</th>
                        <th className="py-2 pr-3">Started</th>
                        <th className="py-2">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncLogs.map((log) => {
                        const started = new Date(log.startedAt);
                        const completed = log.completedAt ? new Date(log.completedAt) : null;
                        const durationMs = completed ? completed.getTime() - started.getTime() : null;
                        const durationStr = durationMs !== null
                          ? durationMs < 1000
                            ? `${durationMs}ms`
                            : `${(durationMs / 1000).toFixed(1)}s`
                          : "—";

                        return (
                          <React.Fragment key={log.id}>
                          <tr className="border-b last:border-0">
                            <td className="py-2 pr-3 font-medium">{formatSyncType(log.syncType)}</td>
                            <td className="py-2 pr-3">{formatSyncStatus(log.status)}</td>
                            <td className="py-2 pr-3 text-right">
                              {log.syncType === "financials" && log.status === "running" && (log as any).totalItems ? (
                                <span className="text-blue-600 font-medium">{(log as any).syncCursor ?? 0}/{(log as any).totalItems}</span>
                              ) : (
                                log.itemsProcessed ?? 0
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {(log.itemsFailed ?? 0) > 0 ? (
                                <button
                                  className="text-red-600 font-semibold underline cursor-pointer hover:text-red-800"
                                  onClick={() => setExpandedSyncLogId(expandedSyncLogId === log.id ? null : log.id)}
                                >
                                  {log.itemsFailed}
                                </button>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {started.toLocaleString()}
                            </td>
                            <td className="py-2 text-muted-foreground">{durationStr}</td>
                          </tr>
                          {expandedSyncLogId === log.id && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <SyncFailureDetails syncLogId={log.id} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {syncLogs && syncLogs.some((l) => l.errorMessage) && (
                <div className="mt-4 space-y-2">
                  {syncLogs
                    .filter((l) => l.errorMessage)
                    .slice(0, 3)
                    .map((l) => (
                      <div key={l.id} className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded p-3 text-sm">
                        <p className="font-medium text-red-700 dark:text-red-400">{formatSyncType(l.syncType)} Error</p>
                        <p className="text-red-600 dark:text-red-300 text-xs mt-1">{l.errorMessage}</p>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
          {/* Xero Client → CRM Lead Import */}
          <XeroClientImportSection />
          </TabsContent>
        </Tabs>
      )}

      {/* Setup Instructions */}
      {!connectionStatus?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>To connect, you'll need a Xero account with admin access to your organisation. The connection will request access to:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Contacts</strong> — to sync clients and suppliers</li>
              <li><strong>Invoices &amp; Payments</strong> — to create invoices and track payments</li>
              <li><strong>Projects</strong> — to link construction jobs to Xero projects and sync financials</li>
            </ul>
            <p className="pt-2">
              Your Xero credentials are securely stored and tokens are automatically refreshed. You can disconnect at any time.
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!entityToDelete} onOpenChange={(open) => !open && setEntityToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Xero entity?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the local saved entity for {entityToDelete?.tenantName || "this Xero organisation"}.
              It does not delete anything inside Xero. If another active copy of the same Xero tenant exists,
              existing mappings and sync history will be reassigned to that active entity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConnection.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntity}
              disabled={deleteConnection.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConnection.isPending ? "Deleting..." : "Delete Entity"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SyncFailureDetails({ syncLogId }: { syncLogId: number }) {
  const { data: failures, isLoading } = trpc.xeroProjects.getSyncFailures.useQuery({ syncLogId });

  if (isLoading) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/20 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading failure details...
        </div>
      </div>
    );
  }

  if (!failures || failures.length === 0) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/20 border-t">
        <p className="text-sm text-muted-foreground">No failure details recorded for this sync run.</p>
      </div>
    );
  }

  // Group by phase
  const byPhase: Record<string, typeof failures> = {};
  for (const f of failures) {
    if (!byPhase[f.phase]) byPhase[f.phase] = [];
    byPhase[f.phase].push(f);
  }

  const downloadCsv = () => {
    if (!failures || failures.length === 0) return;
    const headers = ["Phase", "Record ID", "Record Label", "Error Message", "Timestamp"];
    const rows = failures.map((f: any) => [
      f.phase || "",
      f.recordId || "",
      f.recordLabel || "",
      (f.errorMessage || "").replace(/"/g, '""'),
      f.createdAt ? new Date(f.createdAt).toLocaleString() : "",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sync-failures-${syncLogId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 bg-red-50 dark:bg-red-950/20 border-t space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          {failures.length} failed record{failures.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={downloadCsv}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
        >
          <Download className="h-3 w-3" />
          Download CSV
        </button>
      </div>
      {Object.entries(byPhase).map(([phase, items]) => (
        <div key={phase} className="space-y-1">
          <p className="text-xs font-semibold text-red-600 dark:text-red-300 uppercase tracking-wide">
            {phase.replace(/_/g, " ")} ({items.length})
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {items.slice(0, 100).map((item: any) => (
              <div key={item.id} className="flex gap-2 text-xs bg-white dark:bg-gray-900 rounded px-2 py-1 border">
                <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[120px] shrink-0 truncate">
                  {item.recordLabel || item.recordId || "—"}
                </span>
                <span className="text-red-600 dark:text-red-400 truncate">
                  {item.errorMessage || "Unknown error"}
                </span>
              </div>
            ))}
            {items.length > 100 && (
              <p className="text-xs text-muted-foreground italic">...and {items.length - 100} more</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
