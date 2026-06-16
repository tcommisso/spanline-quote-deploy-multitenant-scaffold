/**
 * Xero Overnight Batch Sync - Scheduled Endpoint
 * POST /api/scheduled/xero-batch-sync
 * 
 * Called by Railway cron to perform nightly full batch sync:
 * 1. Sync all contacts to Xero (new + updated)
 * 2. Sync project status and financials from Xero
 * 3. Push unmapped active jobs to Xero as projects
 */
import type { Express, Request, Response } from "express";
import { eq, and, sql, isNull, or } from "drizzle-orm";
import { getDb } from "./db";
import {
  constructionJobs,
  xeroProjectMappings,
  xeroContactMappings,
  xeroSyncLogs,
  xeroSyncFailures,
  crmLeads,
} from "../drizzle/schema";
import {
  getValidAccessToken,
  getXeroContacts,
  createXeroContact,
  updateXeroContact,
} from "./xero-client";
import { createContext } from "./_core/context";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";

// Xero Project type (simplified)
interface XeroProject {
  projectId: string;
  contactId: string;
  name: string;
  status: string;
  totalTaskAmount?: { value: number };
  totalExpenseAmount?: { value: number };
  projectAmountInvoiced?: { value: number };
  estimateAmount?: { value: number };
  closedDate?: string | Date | { value?: string | Date };
  closedDateUtc?: string | Date | { value?: string | Date };
  ClosedDate?: string | Date | { value?: string | Date };
  ClosedDateUTC?: string | Date | { value?: string | Date };
  "Closed Date"?: string | Date | { value?: string | Date };
}

function parseXeroDateValue(value: unknown): Date | null {
  if (!value) return null;
  const raw = typeof value === "object" && "value" in (value as Record<string, unknown>)
    ? (value as Record<string, unknown>).value
    : value;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getXeroProjectClosedDate(project: XeroProject): Date | null {
  return parseXeroDateValue(project.closedDate)
    || parseXeroDateValue(project.closedDateUtc)
    || parseXeroDateValue(project.ClosedDate)
    || parseXeroDateValue(project.ClosedDateUTC)
    || parseXeroDateValue(project["Closed Date"]);
}

async function getOrCreateXeroContactForSync(
  db: any,
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number; appTenantId?: number | null },
  clientName: string,
  email: string | null,
  phone: string | null,
  address: string | null,
  accountNumber?: string | null,
): Promise<string> {
  const routing = { connectionId: auth.xeroConnectionId };

  // Check if contact already mapped
  const existing = await db
    .select()
    .from(xeroContactMappings)
    .where(
      and(
        eq(xeroContactMappings.xeroConnectionId, auth.xeroConnectionId),
        eq(xeroContactMappings.xeroContactName, clientName)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    if (accountNumber) {
      await updateXeroContact(existing[0].xeroContactId, { AccountNumber: accountNumber }, routing);
    }
    return existing[0].xeroContactId;
  }

  // Search in Xero
  const contactsResult = await getXeroContacts({ where: `Name=="${clientName}"` }, routing);
  const contacts = contactsResult.Contacts || [];
  if (contacts.length > 0) {
    if (accountNumber && contacts[0].AccountNumber !== accountNumber) {
      await updateXeroContact(contacts[0].ContactID, { AccountNumber: accountNumber }, routing);
    }
    await db.insert(xeroContactMappings).values({
      xeroConnectionId: auth.xeroConnectionId,
      localType: "client",
      localId: 0,
      xeroContactId: contacts[0].ContactID,
      xeroContactName: contacts[0].Name,
      lastSyncedAt: new Date(),
    });
    return contacts[0].ContactID;
  }

  // Create new contact in Xero
  const createResult = await createXeroContact({
    Name: clientName,
    AccountNumber: accountNumber || undefined,
    EmailAddress: email || undefined,
    Phones: phone
      ? [{ PhoneType: "DEFAULT", PhoneNumber: phone }]
      : undefined,
    Addresses: address
      ? [{ AddressType: "STREET", AddressLine1: address }]
      : undefined,
  } as any, routing);
  const newContact = createResult.Contacts?.[0];
  if (!newContact) throw new Error("Failed to create Xero contact");
  await db.insert(xeroContactMappings).values({
    xeroConnectionId: auth.xeroConnectionId,
    localType: "client",
    localId: 0,
    xeroContactId: newContact.ContactID,
    xeroContactName: newContact.Name,
    lastSyncedAt: new Date(),
  });
  return newContact.ContactID;
}

export function registerXeroBatchSyncRoutes(app: Express) {
  app.post("/api/scheduled/xero-batch-sync", async (req: Request, res: Response) => {
    try {
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const ctx = await createContext({ req, res } as any);

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      const appTenantId = ctx.tenant?.id ?? null;
      const auth = await getValidAccessToken({ appTenantId, moduleKey: "scheduled_sync" });
      if (!auth) {
        return res.json({ ok: true, skipped: "no_xero_connection" });
      }
      const tenantJobCondition = appTenantId
        ? or(eq(constructionJobs.tenantId, appTenantId), isNull(constructionJobs.tenantId))
        : undefined;

      const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
      for (const syncType of ["full_batch", "financials"] as const) {
        await db.update(xeroSyncLogs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: "Timed out — marked as stale by scheduled batch sync",
          })
          .where(and(
            eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
            eq(xeroSyncLogs.syncType, syncType),
            eq(xeroSyncLogs.status, "running"),
            sql`${xeroSyncLogs.startedAt} <= ${staleBefore}`
          ));
      }

      // Create sync log
      const [syncLog] = await db.insert(xeroSyncLogs).values({
        xeroConnectionId: auth.xeroConnectionId,
        syncType: "full_batch",
        status: "running",
      });
      const syncLogId = syncLog.insertId;

      let totalProcessed = 0;
      let totalFailed = 0;

      try {
        // 1. Sync contacts for all jobs
        const jobs = tenantJobCondition
          ? await db.select().from(constructionJobs).where(tenantJobCondition)
          : await db.select().from(constructionJobs);
        for (const job of jobs) {
          try {
            let email: string | null = null;
            let phone: string | null = null;
            let accountNumber: string | null = null;
            if (job.leadId) {
              const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, job.leadId));
              if (lead) {
                email = lead.contactEmail;
                phone = lead.contactPhone;
                accountNumber = lead.clientNumber;
              }
            }
            await getOrCreateXeroContactForSync(db, auth, job.clientName, email, phone, job.siteAddress, accountNumber);
            totalProcessed++;
          } catch (err: any) {
            totalFailed++;
            try {
              await db.insert(xeroSyncFailures).values({
                syncLogId,
                phase: "contacts",
                recordId: String(job.id),
                recordLabel: job.clientName || `Job #${job.id}`,
                errorMessage: err?.message?.slice(0, 1000) || "Unknown error",
              });
            } catch {
              // Keep the batch moving even if failure logging fails.
            }
          }
        }

        // 2. Queue chunked financial sync. The worker handles Accounting API
        // transaction imports and uses Projects API only when the token has a
        // Projects scope, so accounting-only Xero connections still produce
        // client financial actuals.
        const [mappingCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(xeroProjectMappings)
          .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));
        const totalMappings = Number(mappingCount?.count || 0);

        let financialSyncLogId: number | null = null;
        let financialSyncStatus: "queued" | "already_running" | "no_mappings" = "no_mappings";
        if (totalMappings > 0) {
          const [activeFinancialSync] = await db
            .select({ id: xeroSyncLogs.id })
            .from(xeroSyncLogs)
            .where(and(
              eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
              eq(xeroSyncLogs.syncType, "financials"),
              eq(xeroSyncLogs.status, "running"),
            ))
            .limit(1);

          if (activeFinancialSync) {
            financialSyncLogId = activeFinancialSync.id;
            financialSyncStatus = "already_running";
          } else {
            const [financialSyncLog] = await db.insert(xeroSyncLogs).values({
              xeroConnectionId: auth.xeroConnectionId,
              syncType: "financials",
              status: "running",
              syncCursor: 0,
              totalItems: totalMappings,
            });
            financialSyncLogId = financialSyncLog.insertId;
            financialSyncStatus = "queued";
          }
        }

        // Update sync log as completed
        await db
          .update(xeroSyncLogs)
          .set({
            status: "completed",
            itemsProcessed: totalProcessed,
            itemsFailed: totalFailed,
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));

        return res.json({
          ok: true,
          contactsProcessed: totalProcessed,
          contactsFailed: totalFailed,
          syncLogId,
          financialSync: {
            status: financialSyncStatus,
            syncLogId: financialSyncLogId,
            totalItems: totalMappings,
          },
        });
      } catch (err: any) {
        await db
          .update(xeroSyncLogs)
          .set({
            status: "failed",
            errorMessage: err.message,
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));

        return res.status(500).json({
          error: err.message,
          stack: err.stack,
          context: { url: req.url, syncLogId },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
