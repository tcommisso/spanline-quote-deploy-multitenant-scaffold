import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Link2, Unlink, RefreshCw, CheckCircle2, AlertCircle, ExternalLink,
  Download, Upload, ArrowUpDown, Clock, Loader2, FolderSync, Users,
  DollarSign, Activity, UserPlus, AlertTriangle, Building2, XCircle,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

export default function XeroSettings() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSyncLogId, setActiveSyncLogId] = useState<number | null>(null);
  const [expandedSyncLogId, setExpandedSyncLogId] = useState<number | null>(null);

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
  const getAuthUrl = trpc.xero.getAuthUrl.useMutation();
  const handleCallbackMutation = trpc.xero.handleCallback.useMutation();
  const disconnect = trpc.xero.disconnect.useMutation();
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
      toast.success(`Synced ${result.imported} Xero transaction line(s) across ${result.affectedMappings} project(s)`);
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

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const result = await getAuthUrl.mutateAsync({ origin: window.location.origin });
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
    } catch (error: any) {
      toast.error(error.message || "Failed to disconnect");
    }
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
              <Button onClick={handleConnect} disabled={isConnecting} size="lg">
                <Link2 className="h-4 w-4 mr-2" />
                {isConnecting ? "Connecting..." : "Connect to Xero"}
              </Button>
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

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => refetch()}>
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

      {/* Xero Projects Sync Section */}
      {connectionStatus?.connected && (
        <>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    Pull latest invoiced amounts, costs, and profit from Xero (processes 50 projects every 5 min).
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
                    Pull Xero bills, invoices, and spend-money lines and match them to linked projects.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncAccountingTransactions.mutate({ maxPages: 50, includeUnmatched: false })}
                    disabled={isSyncing}
                    className="w-full"
                  >
                    {syncAccountingTransactions.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Syncing...</>
                    ) : (
                      <><Activity className="h-3.5 w-3.5 mr-1" /> Sync Transactions</>
                    )}
                  </Button>
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

          {/* Xero Client → CRM Lead Import */}
          <XeroClientImportSection />

          {/* Features Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contact Sync</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Push construction clients and leads to Xero as contacts. Available from the Clients page and batch sync above.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Progress Invoicing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Create progress claim invoices from job financials. Available from Client Detail &rarr; Financials tab.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Send purchase orders to suppliers for materials and subcontractors. Available from Client Detail.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
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
