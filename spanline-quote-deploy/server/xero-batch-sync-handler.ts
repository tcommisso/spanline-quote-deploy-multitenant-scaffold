/**
 * Xero Overnight Batch Sync - Scheduled Endpoint
 * POST /api/scheduled/xero-batch-sync
 * 
 * Called by Heartbeat cron to perform nightly full batch sync:
 * 1. Sync all contacts to Xero (new + updated)
 * 2. Sync project status and financials from Xero
 * 3. Push unmapped active jobs to Xero as projects
 */
import type { Express, Request, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  constructionJobs,
  xeroConnections,
  xeroProjectMappings,
  xeroContactMappings,
  xeroSyncLogs,
  crmLeads,
  constructionJobFinancials,
} from "../drizzle/schema";
import {
  xeroApiRequest,
  getValidAccessToken,
  getXeroContacts,
  createXeroContact,
} from "./xero-client";
import { createContext } from "./_core/context";

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
}

async function getOrCreateXeroContactForSync(
  db: any,
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number },
  clientName: string,
  email: string | null,
  phone: string | null,
  address: string | null
): Promise<string> {
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
  if (existing.length > 0) return existing[0].xeroContactId;

  // Search in Xero
  const contactsResult = await getXeroContacts({ where: `Name=="${clientName}"` });
  const contacts = contactsResult.Contacts || [];
  if (contacts.length > 0) {
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
    EmailAddress: email || undefined,
    Phones: phone
      ? [{ PhoneType: "DEFAULT", PhoneNumber: phone }]
      : undefined,
    Addresses: address
      ? [{ AddressType: "STREET", AddressLine1: address }]
      : undefined,
  } as any);
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
      // Authenticate the request via session context
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      const auth = await getValidAccessToken();
      if (!auth) {
        return res.json({ ok: true, skipped: "no_xero_connection" });
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
        const jobs = await db.select().from(constructionJobs);
        for (const job of jobs) {
          try {
            let email: string | null = null;
            let phone: string | null = null;
            if (job.leadId) {
              const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, job.leadId));
              if (lead) {
                email = lead.contactEmail;
                phone = lead.contactPhone;
              }
            }
            await getOrCreateXeroContactForSync(db, auth, job.clientName, email, phone, job.siteAddress);
            totalProcessed++;
          } catch {
            totalFailed++;
          }
        }

        // 2. Sync financial data for all mapped projects
        const mappings = await db
          .select()
          .from(xeroProjectMappings)
          .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));

        for (const mapping of mappings) {
          try {
            const project = await xeroApiRequest<XeroProject>(
              `/projects/projects/${mapping.xeroProjectId}`
            );
            // Xero Projects API returns ex-GST values — multiply by 1.1 to store inc-GST
            const GST_MULTIPLIER = 1.1;
            const totalInvoicedExGst = project.projectAmountInvoiced?.value || 0;
            const totalCostsExGst =
              (project.totalTaskAmount?.value || 0) + (project.totalExpenseAmount?.value || 0);

            const totalInvoiced = totalInvoicedExGst * GST_MULTIPLIER;
            const totalCosts = totalCostsExGst * GST_MULTIPLIER;

            // Budget Cost = sum of NON_CHARGEABLE tasks' rate.value (estimated expenses) × 1.1
            let estimate = 0;
            try {
              const tasksResult = await xeroApiRequest<{ pagination: any; items: Array<{ chargeType: string; rate?: { value: number } }> }>(
                `/projects/projects/${mapping.xeroProjectId}/tasks?pageSize=100&chargeType=NON_CHARGEABLE`
              );
              const nonChargeableTasks = tasksResult.items || [];
              const budgetCostExGst = nonChargeableTasks.reduce((sum: number, t: any) => sum + (t.rate?.value || 0), 0);
              estimate = budgetCostExGst * GST_MULTIPLIER;
            } catch {
              // Fallback to project estimateAmount if tasks fetch fails
              estimate = (project.estimateAmount?.value || 0) * GST_MULTIPLIER;
            }

            await db
              .update(xeroProjectMappings)
              .set({
                xeroProjectStatus: project.status,
                totalInvoiced: totalInvoiced.toFixed(2),
                totalCosts: totalCosts.toFixed(2),
                totalProfit: (totalInvoiced - totalCosts).toFixed(2),
                estimatedCost: estimate.toFixed(2),
                lastSyncedAt: new Date(),
              })
              .where(eq(xeroProjectMappings.id, mapping.id));

            // Update Xero actuals (never overwrite manual budget fields)
            await db
              .update(constructionJobFinancials)
              .set({
                xeroInvoicedAmount: totalInvoiced.toFixed(2),
                xeroLabourCost: totalCosts.toFixed(2),
                xeroTotalCost: totalCosts.toFixed(2),
              })
              .where(eq(constructionJobFinancials.jobId, mapping.jobId));

            // Close completed projects locally and set actualEnd date
            if (project.status === "CLOSED") {
              await db
                .update(constructionJobs)
                .set({
                  status: "completed",
                  actualEnd: new Date(),
                })
                .where(
                  and(
                    eq(constructionJobs.id, mapping.jobId),
                    sql`${constructionJobs.status} != 'completed'`
                  )
                );
            }
            totalProcessed++;
          } catch {
            totalFailed++;
          }
        }

        // 3. Push unmapped active jobs to Xero
        const unmappedJobs = await db
          .select({ id: constructionJobs.id })
          .from(constructionJobs)
          .where(
            and(
              sql`${constructionJobs.id} NOT IN (SELECT jobId FROM xero_project_mappings WHERE xeroConnectionId = ${auth.xeroConnectionId})`,
              sql`${constructionJobs.status} IN ('scheduled', 'in_progress')`
            )
          );

        for (const { id: jobId } of unmappedJobs) {
          try {
            const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, jobId));
            if (!job) continue;

            let email: string | null = null;
            let phone: string | null = null;
            if (job.leadId) {
              const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, job.leadId));
              if (lead) {
                email = lead.contactEmail;
                phone = lead.contactPhone;
              }
            }

            const xeroContactId = await getOrCreateXeroContactForSync(
              db, auth, job.clientName, email, phone, job.siteAddress
            );

            const [financials] = await db
              .select()
              .from(constructionJobFinancials)
              .where(eq(constructionJobFinancials.jobId, jobId));

            const estimateValue = financials?.contractValue ? parseFloat(financials.contractValue) : 0;
            const projectData: any = {
              contactId: xeroContactId,
              name: `${job.clientName} - ${job.siteAddress || `Job #${job.id}`}`,
              currencyCode: "AUD",
              estimateAmount: estimateValue,
            };
            if (job.scheduledEnd) {
              projectData.deadlineUtc = new Date(job.scheduledEnd).toISOString();
            }

            const result = await xeroApiRequest<XeroProject>("/projects/projects", {
              method: "POST",
              body: projectData,
            });

            await db.insert(xeroProjectMappings).values({
              xeroConnectionId: auth.xeroConnectionId,
              jobId,
              xeroProjectId: result.projectId,
              xeroProjectName: result.name,
              xeroProjectStatus: result.status,
              xeroContactId: xeroContactId,
              estimatedCost: estimateValue.toFixed(2),
              totalInvoiced: "0",
              totalCosts: "0",
              totalProfit: "0",
              lastSyncedAt: new Date(),
            });
            totalProcessed++;
          } catch {
            totalFailed++;
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
          processed: totalProcessed,
          failed: totalFailed,
          syncLogId,
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
