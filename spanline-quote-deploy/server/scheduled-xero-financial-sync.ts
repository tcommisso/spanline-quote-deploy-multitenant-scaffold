/**
 * Scheduled Xero Financial Sync (Chunked)
 * Processes 50 project mappings per invocation via Heartbeat cron (every 5 minutes).
 * 
 * Flow:
 * 1. Find the active "financials" sync log in "running" state
 * 2. Get the next batch of 50 mappings starting from syncCursor offset
 * 3. Process each mapping (fetch project data, invoices, costs from Xero)
 * 4. Update syncCursor and itemsProcessed
 * 5. If all done, mark as "completed"
 * 6. If no active sync log found, respond with { ok: true, skipped: "no-active-sync" }
 * 
 * Triggered by: Heartbeat cron at /api/scheduled/xero-financial-sync (every 5 minutes)
 * Also triggered by: manual "Sync Financials" button which creates the sync log entry
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import {
  xeroSyncLogs,
  xeroProjectMappings,
  constructionJobFinancials,
  constructionJobs,
} from "../drizzle/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { xeroApiRequest, getValidAccessToken } from "./xero-client";
import {
  getLegacyImportedCostTotal,
  rollupXeroAccountingTransactionsForMapping,
  syncXeroAccountingTransactionsForMappings,
} from "./xero-accounting-sync";

const CHUNK_SIZE = 50; // Process 50 mappings per invocation

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
  status: "INPROGRESS" | "CLOSED";
}

export function registerScheduledXeroFinancialSync(app: Express) {
  app.post("/api/scheduled/xero-financial-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller (or admin for manual testing)
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Check Xero connection
      const auth = await getValidAccessToken();
      if (!auth) {
        console.log("[XeroFinancialSync] No active Xero connection — skipping");
        return res.json({ ok: true, skipped: "no-xero-connection" });
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
        console.log("[XeroFinancialSync] No active sync — skipping this heartbeat");
        return res.json({ ok: true, skipped: "no-active-sync" });
      }

      const syncLogId = activeSyncLog.id;
      const currentCursor = activeSyncLog.syncCursor || 0;
      const totalItems = activeSyncLog.totalItems || 0;

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

      try {
        const accountingSync = await syncXeroAccountingTransactionsForMappings(db, auth, mappings, {
          maxPages: 50,
          includeUnmatched: false,
        });
        console.log(
          `[XeroFinancialSync] Accounting transaction sync: ${accountingSync.imported} lines, ${accountingSync.affectedMappings} mapped projects`
        );
        if (accountingSync.fetchErrors.length) {
          console.warn("[XeroFinancialSync] Accounting fetch warnings:", accountingSync.fetchErrors.join("; "));
        }
      } catch (err: any) {
        console.warn(`[XeroFinancialSync] Accounting transaction sync skipped: ${err.message}`);
      }

      for (const mapping of mappings) {
        try {
          await syncSingleMapping(db, auth, mapping, GST_MULTIPLIER);
          chunkProcessed++;
        } catch (err: any) {
          chunkFailed++;
          console.error(`[XeroFinancialSync] Failed mapping ${mapping.id} (project ${mapping.xeroProjectId}):`, err.message);
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
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number },
  mapping: any,
  GST_MULTIPLIER: number
): Promise<void> {
  // 1. Fetch project data
  const project = await xeroApiRequest<XeroProject>(
    `/projects/projects/${mapping.xeroProjectId}`
  );

  const totalInvoicedExGst = project.projectAmountInvoiced?.value || 0;
  const expenseEntriesExGst = project.totalExpenseAmount?.value || 0;

  let totalInvoiced = totalInvoicedExGst * GST_MULTIPLIER;
  const expenseEntries = expenseEntriesExGst * GST_MULTIPLIER;

  // 2. Budget Cost = sum of NON_CHARGEABLE tasks' rate.value × 1.1
  let estimatedCost = 0;
  try {
    const tasksResult = await xeroApiRequest<{
      pagination: any;
      items: Array<{ chargeType: string; rate?: { value: number } }>;
    }>(
      `/projects/projects/${mapping.xeroProjectId}/tasks?pageSize=100&chargeType=NON_CHARGEABLE`
    );
    const nonChargeableTasks = tasksResult.items || [];
    const budgetCostExGst = nonChargeableTasks.reduce((sum, t) => sum + (t.rate?.value || 0), 0);
    estimatedCost = budgetCostExGst * GST_MULTIPLIER;
  } catch {
    estimatedCost = (project.estimateAmount?.value || 0) * GST_MULTIPLIER;
  }

  // 3. Check Accounting API for invoiced amounts (may be higher than Projects API)
  if (mapping.xeroContactId) {
    try {
      const invoicesResult = await xeroApiRequest<{
        Invoices: Array<{ Total: number; Status: string; Type: string }>;
      }>(
        `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID`
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
      xeroProjectStatus: project.status,
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
      }>(`/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=PAID`);
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
  await db
    .update(constructionJobFinancials)
    .set({
      xeroInvoicedAmount: xeroInvoicedAmount.toFixed(2),
      xeroLabourCost: accountingRollup.labour.toFixed(2),
      xeroMaterialsCost: accountingRollup.materials.toFixed(2),
      xeroOtherCost: accountingRollup.other.toFixed(2),
      xeroTotalCost: xeroTotalCost.toFixed(2),
      xeroPaidAmount: xeroPaidAmount.toFixed(2),
      xeroContractValue: estimatedCost > 0 ? estimatedCost.toFixed(2) : undefined,
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
        `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID&order=Date`
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
  if (project.status === "CLOSED") {
    jobDateUpdates.actualEnd = mapping.lastSyncedAt || new Date();
    jobDateUpdates.status = "completed";
  }

  if (Object.keys(jobDateUpdates).length > 0) {
    await db
      .update(constructionJobs)
      .set(jobDateUpdates)
      .where(eq(constructionJobs.id, mapping.jobId));
  } else if (project.status === "CLOSED") {
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
