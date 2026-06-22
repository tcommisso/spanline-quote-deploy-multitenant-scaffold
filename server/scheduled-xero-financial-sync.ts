/**
 * Scheduled Xero Financial Sync (Chunked)
 * Processes a small batch of project mappings per invocation via cron (every 5 minutes).
 * 
 * Flow:
 * 1. Find the active "financials" sync log in "running" state
 * 2. Get the next batch of mappings starting from syncCursor offset
 * 3. Process each mapping (fetch project data, invoices, costs from Xero)
 * 4. Update syncCursor and itemsProcessed
 * 5. If all done, mark as "completed"
 * 6. If no active sync log exists, run a throttled automatic accounting catch-up
 * 
 * Triggered by: Railway cron at /api/scheduled/xero-financial-sync (every 5 minutes)
 * Also triggered by: manual "Sync Financials" button which creates the chunked sync log entry
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import {
  xeroSyncLogs,
  xeroSyncFailures,
  xeroProjectMappings,
  constructionJobFinancials,
  constructionJobs,
  xeroConnections,
} from "../drizzle/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { xeroApiRequest, getValidAccessToken } from "./xero-client";
import {
  getLegacyImportedCostTotal,
  rollupXeroAccountingTransactionsForMapping,
  syncXeroAccountingTransactionsForMappings,
} from "./xero-accounting-sync";

const CHUNK_SIZE = 10; // Keep Railway cron requests comfortably below timeout limits.
const STALE_SYNC_MS = 2 * 60 * 60 * 1000;
const INCREMENTAL_OVERLAP_MS = 24 * 60 * 60 * 1000;

function clampMarginPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-999.99, Math.min(999.99, value));
}

function hasProjectsScope(scopes?: string | null) {
  return (scopes || "")
    .split(/[\s,]+/)
    .some((scope) => scope === "projects" || scope === "projects.read");
}

async function recordSyncFailure(
  db: any,
  syncLogId: number,
  phase: string,
  recordId: string | number | null,
  recordLabel: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  try {
    await db.insert(xeroSyncFailures).values({
      syncLogId,
      phase,
      recordId: recordId === null ? null : String(recordId),
      recordLabel,
      errorMessage: message.slice(0, 1000),
    });
  } catch {
    // Failure logging must never stop the sync worker.
  }
}

async function getPreviousCompletedFinancialSyncDate(db: any, connectionId: number, activeSyncLogId: number) {
  const [lastSync] = await db.select({
    completedAt: xeroSyncLogs.completedAt,
    startedAt: xeroSyncLogs.startedAt,
  })
    .from(xeroSyncLogs)
    .where(and(
      eq(xeroSyncLogs.xeroConnectionId, connectionId),
      eq(xeroSyncLogs.syncType, "financials"),
      eq(xeroSyncLogs.status, "completed"),
      sql`${xeroSyncLogs.completedAt} IS NOT NULL`,
      sql`${xeroSyncLogs.id} <> ${activeSyncLogId}`,
    ))
    .orderBy(sql`${xeroSyncLogs.completedAt} DESC`)
    .limit(1);

  const baseDate = lastSync?.completedAt || lastSync?.startedAt;
  if (!baseDate) return null;
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() - INCREMENTAL_OVERLAP_MS);
}

async function getLatestCompletedFinancialSyncDate(db: any, connectionId: number) {
  const [lastSync] = await db.select({
    completedAt: xeroSyncLogs.completedAt,
    startedAt: xeroSyncLogs.startedAt,
  })
    .from(xeroSyncLogs)
    .where(and(
      eq(xeroSyncLogs.xeroConnectionId, connectionId),
      eq(xeroSyncLogs.syncType, "financials"),
      eq(xeroSyncLogs.status, "completed"),
      sql`${xeroSyncLogs.completedAt} IS NOT NULL`,
    ))
    .orderBy(sql`${xeroSyncLogs.completedAt} DESC`)
    .limit(1);

  const baseDate = lastSync?.completedAt || lastSync?.startedAt;
  if (!baseDate) return null;
  const date = new Date(baseDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function autoAccountingSyncIntervalMs() {
  const minutes = Number(process.env.XERO_AUTO_ACCOUNTING_SYNC_INTERVAL_MINUTES || 60);
  return Math.max(5, Number.isFinite(minutes) ? minutes : 60) * 60 * 1000;
}

function autoAccountingSyncMaxPages() {
  const pages = Number(process.env.XERO_AUTO_ACCOUNTING_SYNC_MAX_PAGES || 10);
  return Math.max(1, Math.min(100, Number.isFinite(pages) ? pages : 10));
}

async function getMappedProjectsForConnection(db: any, connection: typeof xeroConnections.$inferSelect) {
  const conditions: any[] = [eq(xeroProjectMappings.xeroConnectionId, connection.id)];
  if (connection.appTenantId) {
    conditions.push(eq(constructionJobs.tenantId, connection.appTenantId));
  }

  const rows = await db
    .select({ mapping: xeroProjectMappings })
    .from(xeroProjectMappings)
    .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
    .where(and(...conditions))
    .orderBy(asc(xeroProjectMappings.id));

  return rows.map((row: { mapping: typeof xeroProjectMappings.$inferSelect }) => row.mapping);
}

async function runAutomaticAccountingCatchup(db: any) {
  if (process.env.XERO_AUTO_ACCOUNTING_SYNC_DISABLED === "true") {
    return { enabled: false, skipped: "disabled" };
  }

  const intervalMs = autoAccountingSyncIntervalMs();
  const maxPages = autoAccountingSyncMaxPages();
  const now = Date.now();
  const connections = await db
    .select()
    .from(xeroConnections)
    .where(eq(xeroConnections.isActive, true))
    .orderBy(asc(xeroConnections.id));

  const summary = {
    enabled: true,
    intervalMinutes: Math.round(intervalMs / 60000),
    maxPages,
    checkedConnections: connections.length,
    syncedConnections: 0,
    skippedRecent: 0,
    skippedNoMappings: 0,
    failedConnections: 0,
    imported: 0,
    unmatched: 0,
    affectedMappings: 0,
    results: [] as Array<Record<string, unknown>>,
  };

  for (const connection of connections) {
    const lastCompleted = await getLatestCompletedFinancialSyncDate(db, connection.id);
    if (lastCompleted && now - lastCompleted.getTime() < intervalMs) {
      summary.skippedRecent++;
      continue;
    }

    const mappings = await getMappedProjectsForConnection(db, connection);
    if (!mappings.length) {
      summary.skippedNoMappings++;
      continue;
    }

    const [syncLog] = await db.insert(xeroSyncLogs).values({
      xeroConnectionId: connection.id,
      syncType: "financials",
      status: "running",
      totalItems: mappings.length,
      syncCursor: 0,
    });
    const syncLogId = syncLog.insertId;

    try {
      const auth = await getValidAccessToken({
        connectionId: connection.id,
        appTenantId: connection.appTenantId,
      });
      if (!auth) throw new Error("Xero connection unavailable or token refresh failed");

      const modifiedSince = lastCompleted
        ? new Date(lastCompleted.getTime() - INCREMENTAL_OVERLAP_MS)
        : null;
      const result = await syncXeroAccountingTransactionsForMappings(db, auth, mappings, {
        appTenantId: connection.appTenantId,
        maxPages,
        includeUnmatched: true,
        modifiedSince,
      });
      const warning = result.fetchErrors.length
        ? result.fetchErrors.join("; ")
        : modifiedSince
          ? `Automatic incremental accounting sync since ${modifiedSince.toISOString()}`
          : "Automatic accounting catch-up sync";

      await db.update(xeroSyncLogs)
        .set({
          status: "completed",
          itemsProcessed: result.imported,
          itemsFailed: result.fetchErrors.length,
          errorMessage: warning,
          syncCursor: mappings.length,
          completedAt: new Date(),
        })
        .where(eq(xeroSyncLogs.id, syncLogId));

      summary.syncedConnections++;
      summary.imported += result.imported;
      summary.unmatched += result.unmatched;
      summary.affectedMappings += result.affectedMappings;
      summary.results.push({
        connectionId: connection.id,
        tenantName: connection.tenantName,
        imported: result.imported,
        unmatched: result.unmatched,
        affectedMappings: result.affectedMappings,
        fetched: result.fetched,
        modifiedSince: result.incrementalSince,
        fetchErrors: result.fetchErrors,
      });
    } catch (err: any) {
      summary.failedConnections++;
      await db.update(xeroSyncLogs)
        .set({
          status: "failed",
          errorMessage: err?.message || "Automatic accounting catch-up failed",
          completedAt: new Date(),
        })
        .where(eq(xeroSyncLogs.id, syncLogId));
      await recordSyncFailure(db, syncLogId, "accounting_auto_catchup", connection.id, connection.tenantName || `Xero connection ${connection.id}`, err);
      summary.results.push({
        connectionId: connection.id,
        tenantName: connection.tenantName,
        error: err?.message || "Automatic accounting catch-up failed",
      });
    }
  }

  return summary;
}

// Xero Projects API type
interface XeroProject {
  projectId: string;
  contactId: string;
  name: string;
  currencyCode: string;
  minutesLogged: number;
  totalTaskAmount: { currency: string; value: number };
  totalExpenseAmount: { currency: string; value: number };
  estimateAmount?: { currency: string; value: number };
  minutesToBeInvoiced: number;
  taskAmountToBeInvoiced: { currency: string; value: number };
  taskAmountInvoiced: { currency: string; value: number };
  expenseAmountToBeInvoiced: { currency: string; value: number };
  expenseAmountInvoiced: { currency: string; value: number };
  projectAmountInvoiced: { currency: string; value: number };
  deposit?: { currency: string; value: number };
  depositApplied?: { currency: string; value: number };
  creditNoteAmount?: { currency: string; value: number };
  deadlineUtc?: string;
  totalInvoiced?: { currency: string; value: number };
  totalToBeInvoiced?: { currency: string; value: number };
  estimate?: { currency: string; value: number };
  closedDate?: string | Date | { value?: string | Date };
  closedDateUtc?: string | Date | { value?: string | Date };
  ClosedDate?: string | Date | { value?: string | Date };
  ClosedDateUTC?: string | Date | { value?: string | Date };
  "Closed Date"?: string | Date | { value?: string | Date };
  status: "INPROGRESS" | "CLOSED";
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const raw = typeof value === "object" && "value" in (value as Record<string, unknown>)
    ? (value as Record<string, unknown>).value
    : value;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getXeroProjectClosedDate(project: XeroProject): Date | null {
  return parseDateValue(project.closedDate)
    || parseDateValue(project.closedDateUtc)
    || parseDateValue(project.ClosedDate)
    || parseDateValue(project.ClosedDateUTC)
    || parseDateValue(project["Closed Date"]);
}

export function registerScheduledXeroFinancialSync(app: Express) {
  app.post("/api/scheduled/xero-financial-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller (or admin for manual testing)
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Find the active "financials" sync log in "running" state
      const [activeSyncLog] = await db
        .select()
        .from(xeroSyncLogs)
        .where(and(
          eq(xeroSyncLogs.syncType, "financials"),
          eq(xeroSyncLogs.status, "running"),
        ))
        .limit(1);

      if (!activeSyncLog) {
        const autoSync = await runAutomaticAccountingCatchup(db);
        console.log("[XeroFinancialSync] No active chunked sync — automatic accounting catch-up result:", autoSync);
        return res.json({ ok: true, skipped: "no-active-chunked-sync", autoSync });
      }

      const startedAt = activeSyncLog.startedAt ? new Date(activeSyncLog.startedAt).getTime() : 0;
      if (startedAt && Date.now() - startedAt > STALE_SYNC_MS) {
        console.warn(`[XeroFinancialSync] Sync log ${activeSyncLog.id} is stale — marking failed before retrying later`);
        await db
          .update(xeroSyncLogs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: "Timed out — marked as stale after more than 2 hours running",
          })
          .where(eq(xeroSyncLogs.id, activeSyncLog.id));
        return res.json({ ok: true, skipped: "stale-sync-marked-failed", syncLogId: activeSyncLog.id });
      }

      const auth = await getValidAccessToken(activeSyncLog.xeroConnectionId);
      if (!auth) {
        console.log(`[XeroFinancialSync] Xero connection ${activeSyncLog.xeroConnectionId} is unavailable — failing sync log ${activeSyncLog.id}`);
        await db
          .update(xeroSyncLogs)
          .set({
            status: "failed",
            errorMessage: "Xero connection unavailable or token refresh failed",
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, activeSyncLog.id));
        return res.json({ ok: true, skipped: "xero-connection-unavailable", syncLogId: activeSyncLog.id });
      }

      const syncLogId = activeSyncLog.id;
      const currentCursor = activeSyncLog.syncCursor || 0;
      const totalItems = activeSyncLog.totalItems || 0;
      const [connectionForScope] = await db
        .select({ scopes: xeroConnections.scopes })
        .from(xeroConnections)
        .where(eq(xeroConnections.id, auth.xeroConnectionId))
        .limit(1);
      const canUseProjectsApi = hasProjectsScope(connectionForScope?.scopes);

      if (currentCursor === 0) {
        try {
          const allMappings = await db
            .select()
            .from(xeroProjectMappings)
            .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId))
            .orderBy(asc(xeroProjectMappings.id));
          const modifiedSince = await getPreviousCompletedFinancialSyncDate(db, auth.xeroConnectionId, syncLogId);
          const accountingSync = await syncXeroAccountingTransactionsForMappings(db, auth, allMappings, {
            appTenantId: auth.appTenantId,
            maxPages: Math.max(1, Math.min(100, Number(process.env.XERO_ACCOUNTING_SYNC_MAX_PAGES || 50))),
            includeUnmatched: true,
            modifiedSince,
          });
          console.log(
            `[XeroFinancialSync] Accounting prepass: fetched ${accountingSync.fetched.total} documents, imported ${accountingSync.imported} lines, ${accountingSync.unmatched} unmatched, ${accountingSync.affectedMappings} mapped projects${modifiedSince ? ` since ${modifiedSince.toISOString()}` : ""}`
          );
          if (accountingSync.fetchErrors.length) {
            console.warn("[XeroFinancialSync] Accounting fetch warnings:", accountingSync.fetchErrors.join("; "));
            await recordSyncFailure(
              db,
              syncLogId,
              "accounting_fetch",
              null,
              "Accounting transaction fetch warnings",
              accountingSync.fetchErrors.join("; "),
            );
          }
        } catch (err: any) {
          console.warn(`[XeroFinancialSync] Accounting prepass skipped: ${err.message}`);
          await recordSyncFailure(db, syncLogId, "accounting_fetch", null, "Accounting transaction prepass", err);
        }
      }

      // Get the next batch of mappings (ordered by ID for deterministic pagination)
      const mappings = await db
        .select()
        .from(xeroProjectMappings)
        .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId))
        .orderBy(asc(xeroProjectMappings.id))
        .limit(CHUNK_SIZE)
        .offset(currentCursor);

      if (mappings.length === 0) {
        // All done!
        await db
          .update(xeroSyncLogs)
          .set({
            status: "completed",
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));

        console.log(`[XeroFinancialSync] Completed! Total processed: ${activeSyncLog.itemsProcessed || 0}, failed: ${activeSyncLog.itemsFailed || 0}`);
        return res.json({
          ok: true,
          completed: true,
          processed: activeSyncLog.itemsProcessed || 0,
          failed: activeSyncLog.itemsFailed || 0,
          duration: Date.now() - startTime,
        });
      }

      let chunkProcessed = 0;
      let chunkFailed = 0;
      const GST_MULTIPLIER = 1.1;

      for (const mapping of mappings) {
        try {
          await syncSingleMapping(db, auth, mapping, GST_MULTIPLIER, canUseProjectsApi);
          chunkProcessed++;
        } catch (err: any) {
          chunkFailed++;
          console.error(`[XeroFinancialSync] Failed mapping ${mapping.id} (project ${mapping.xeroProjectId}):`, err.message);
          await recordSyncFailure(
            db,
            syncLogId,
            "financials",
            mapping.jobId,
            `Mapping #${mapping.id} (${mapping.xeroProjectName || mapping.xeroProjectId || `Job ${mapping.jobId}`})`,
            err,
          );
        }
      }

      // Update progress
      const newCursor = currentCursor + mappings.length;
      const newProcessed = (activeSyncLog.itemsProcessed || 0) + chunkProcessed;
      const newFailed = (activeSyncLog.itemsFailed || 0) + chunkFailed;

      await db
        .update(xeroSyncLogs)
        .set({
          syncCursor: newCursor,
          itemsProcessed: newProcessed,
          itemsFailed: newFailed,
        })
        .where(eq(xeroSyncLogs.id, syncLogId));

      console.log(`[XeroFinancialSync] Chunk done: ${chunkProcessed} processed, ${chunkFailed} failed. Progress: ${newCursor}/${totalItems}`);

      return res.json({
        ok: true,
        chunkProcessed,
        chunkFailed,
        progress: { cursor: newCursor, total: totalItems },
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[XeroFinancialSync] Fatal error:", err);
      return res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url, taskUid: (req as any).user?.taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/scheduled/xero-completion-date-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      const connections = await db
        .select({ id: xeroConnections.id })
        .from(xeroConnections)
        .where(eq(xeroConnections.isActive, true));

      let processed = 0;
      let updated = 0;
      let closedWithoutDate = 0;
      let failed = 0;

      for (const connection of connections) {
        const [connectionForScope] = await db
          .select({ scopes: xeroConnections.scopes })
          .from(xeroConnections)
          .where(eq(xeroConnections.id, connection.id))
          .limit(1);
        if (!hasProjectsScope(connectionForScope?.scopes)) {
          continue;
        }

        const auth = await getValidAccessToken(connection.id);
        if (!auth) {
          failed++;
          continue;
        }

        const mappings = await db
          .select()
          .from(xeroProjectMappings)
          .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId))
          .orderBy(asc(xeroProjectMappings.id));

        for (const mapping of mappings) {
          processed++;
          try {
            const project = await xeroApiRequest<XeroProject>(
              `/projects/projects/${mapping.xeroProjectId}`,
              { connectionId: auth.xeroConnectionId, timeoutMs: 60000 },
            );

            await db.update(xeroProjectMappings)
              .set({
                xeroProjectStatus: project.status,
                lastSyncedAt: new Date(),
              })
              .where(eq(xeroProjectMappings.id, mapping.id));

            if (project.status !== "CLOSED") continue;

            const closedDate = getXeroProjectClosedDate(project);
            if (!closedDate) {
              closedWithoutDate++;
              await db.update(constructionJobs)
                .set({ status: "completed" })
                .where(eq(constructionJobs.id, mapping.jobId));
              continue;
            }

            await db.update(constructionJobs)
              .set({
                actualEnd: closedDate,
                status: "completed",
              })
              .where(eq(constructionJobs.id, mapping.jobId));
            updated++;
          } catch (err: any) {
            failed++;
            console.error(`[XeroCompletionDateSync] Failed mapping ${mapping.id}:`, err.message);
          }
        }
      }

      return res.json({
        ok: true,
        processed,
        updated,
        closedWithoutDate,
        failed,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[XeroCompletionDateSync] Fatal error:", err);
      return res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url, taskUid: (req as any).user?.taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Process a single project mapping:
 * 1. Fetch project data from Xero Projects API
 * 2. Fetch NON_CHARGEABLE tasks for budget cost
 * 3. Fetch ACCREC invoices for invoiced/paid amounts
 * 4. Calculate costs from imported cost reports or GL-synced bills
 * 5. Update constructionJobFinancials and xeroProjectMappings
 * 6. Update job dates/status from project lifecycle
 */
async function syncSingleMapping(
  db: any,
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number; appTenantId?: number | null },
  mapping: any,
  GST_MULTIPLIER: number,
  canUseProjectsApi = true,
): Promise<void> {
  const routing = { connectionId: auth.xeroConnectionId };

  let project: XeroProject | null = null;
  if (canUseProjectsApi) {
    project = await xeroApiRequest<XeroProject>(
      `/projects/projects/${mapping.xeroProjectId}`,
      routing
    );
  }

  const totalInvoicedExGst = project?.projectAmountInvoiced?.value || 0;
  const expenseEntriesExGst = project?.totalExpenseAmount?.value || 0;

  let totalInvoiced = totalInvoicedExGst * GST_MULTIPLIER;
  const expenseEntries = expenseEntriesExGst * GST_MULTIPLIER;

  // 2. Budget Cost = sum of NON_CHARGEABLE tasks' rate.value × 1.1
  let estimatedCost = 0;
  if (project && canUseProjectsApi) {
    try {
    const tasksResult = await xeroApiRequest<{
      pagination: any;
      items: Array<{ chargeType: string; rate?: { value: number } }>;
    }>(
      `/projects/projects/${mapping.xeroProjectId}/tasks?pageSize=100&chargeType=NON_CHARGEABLE`,
      routing
    );
    const nonChargeableTasks = tasksResult.items || [];
    const budgetCostExGst = nonChargeableTasks.reduce((sum, t) => sum + (t.rate?.value || 0), 0);
    estimatedCost = budgetCostExGst * GST_MULTIPLIER;
    } catch {
      estimatedCost = (project.estimateAmount?.value || 0) * GST_MULTIPLIER;
    }
  }

  // 3. Check Accounting API for invoiced amounts (may be higher than Projects API)
  if (mapping.xeroContactId) {
    try {
      const invoicesResult = await xeroApiRequest<{
        Invoices: Array<{ Total: number; Status: string; Type: string }>;
      }>(
        `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID`,
        routing
      );
      const accrecInvoices = (invoicesResult.Invoices || []).filter(
        (inv) => inv.Type === "ACCREC"
      );
      if (accrecInvoices.length) {
        const accountingInvoiced = accrecInvoices.reduce(
          (sum, inv) => sum + (inv.Total || 0),
          0
        );
        if (accountingInvoiced > totalInvoiced) {
          totalInvoiced = accountingInvoiced;
        }
      }
    } catch {
      // Fall back to Projects API invoiced amount
    }
  }

  // Update mapping
  await db
    .update(xeroProjectMappings)
    .set({
      ...(project ? { xeroProjectStatus: project.status } : {}),
      totalInvoiced: totalInvoiced.toFixed(2),
      expenseEntries: expenseEntries.toFixed(2),
      estimatedCost: estimatedCost.toFixed(2),
      lastSyncedAt: new Date(),
    })
    .where(eq(xeroProjectMappings.id, mapping.id));

  // 4. Recalculate actuals from automatic Accounting API transaction lines.
  const accountingRollup = await rollupXeroAccountingTransactionsForMapping(db, mapping);
  let xeroTotalCost = accountingRollup.costs;
  let xeroInvoicedAmount = accountingRollup.revenue || totalInvoiced;
  let xeroPaidAmount = accountingRollup.paid;

  // Legacy fallback: keep existing imported report costs only when no automatic costs matched.
  if (xeroTotalCost === 0) {
    xeroTotalCost = await getLegacyImportedCostTotal(db, mapping.jobId);
  }

  // 5. Get paid amount from invoices
  if (xeroPaidAmount === 0 && mapping.xeroContactId) {
    try {
      const paidResult = await xeroApiRequest<{
        Invoices: Array<{ AmountPaid: number; Type: string }>;
      }>(`/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=PAID`, routing);
      const paidAccrec = (paidResult.Invoices || []).filter(
        (inv) => inv.Type === "ACCREC"
      );
      if (paidAccrec.length) {
        xeroPaidAmount = paidAccrec.reduce(
          (sum, inv) => sum + (inv.AmountPaid || 0),
          0
        );
      }
    } catch {
      /* no paid invoices */
    }
  }

  // 6. Update constructionJobFinancials
  const [existingFinancials] = await db
    .select({ contractValue: constructionJobFinancials.contractValue })
    .from(constructionJobFinancials)
    .where(eq(constructionJobFinancials.jobId, mapping.jobId))
    .limit(1);
  const contractValue = parseFloat(String(existingFinancials?.contractValue || "0"));
  const budgetMargin = contractValue - estimatedCost;
  const budgetMarginPercent = clampMarginPercent(contractValue > 0 ? (budgetMargin / contractValue) * 100 : 0);

  await db
    .update(constructionJobFinancials)
    .set({
      xeroInvoicedAmount: xeroInvoicedAmount.toFixed(2),
      xeroLabourCost: accountingRollup.labour.toFixed(2),
      xeroMaterialsCost: accountingRollup.materials.toFixed(2),
      xeroOtherCost: accountingRollup.other.toFixed(2),
      xeroTotalCost: xeroTotalCost.toFixed(2),
      xeroPaidAmount: xeroPaidAmount.toFixed(2),
      ...(estimatedCost > 0 ? { xeroContractValue: estimatedCost.toFixed(2) } : {}),
      ...(estimatedCost > 0 ? {
        totalCost: estimatedCost.toFixed(2),
        margin: budgetMargin.toFixed(2),
        marginPercent: budgetMarginPercent.toFixed(2),
      } : {}),
    })
    .where(eq(constructionJobFinancials.jobId, mapping.jobId));

  await db.update(xeroProjectMappings)
    .set({
      totalInvoiced: xeroInvoicedAmount.toFixed(2),
      totalCosts: xeroTotalCost.toFixed(2),
      totalProfit: (xeroInvoicedAmount - xeroTotalCost).toFixed(2),
      lastSyncedAt: new Date(),
    })
    .where(eq(xeroProjectMappings.id, mapping.id));

  // 7. Update job dates from Xero project lifecycle
  const jobDateUpdates: any = {};
  if (mapping.xeroContactId) {
    try {
      const earliestInvResult = await xeroApiRequest<{
        Invoices: Array<{ DateString: string; Type: string }>;
      }>(
        `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID&order=Date`,
        routing
      );
      const accrec = (earliestInvResult.Invoices || []).filter(
        (inv) => inv.Type === "ACCREC"
      );
      if (accrec.length > 0 && accrec[0].DateString) {
        jobDateUpdates.actualStart = new Date(accrec[0].DateString);
      }
    } catch {
      /* no invoices found */
    }
  }
  if (project?.status === "CLOSED") {
    const closedDate = getXeroProjectClosedDate(project);
    if (closedDate) {
      jobDateUpdates.actualEnd = closedDate;
    }
    jobDateUpdates.status = "completed";
  }

  if (Object.keys(jobDateUpdates).length > 0) {
    await db
      .update(constructionJobs)
      .set(jobDateUpdates)
      .where(eq(constructionJobs.id, mapping.jobId));
  } else if (project?.status === "CLOSED") {
    await db
      .update(constructionJobs)
      .set({ status: "completed" })
      .where(
        and(
          eq(constructionJobs.id, mapping.jobId),
          sql`${constructionJobs.status} != 'completed'`
        )
      );
  }
}
