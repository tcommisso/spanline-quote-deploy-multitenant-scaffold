import { z } from "zod";
import { eq, and, desc, isNull, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs,
  xeroConnections,
  xeroProjectMappings,
  xeroContactMappings,
  xeroSyncLogs,
  crmLeads,
  constructionJobFinancials,
  poMilestones,
  tradeInvoices,
  xeroAccountingTransactions,
  xeroSyncFailures,
  users,
  tenantMemberships,
} from "../drizzle/schema";
import { sendNotificationEmail } from "./email";
import {
  xeroApiRequest,
  getValidAccessToken,
  getXeroContacts,
  createXeroContact,
  updateXeroContact,
  type XeroContact,
} from "./xero-client";
import {
  getLegacyImportedCostTotal,
  rollupXeroAccountingTransactionsForMapping,
  syncXeroAccountingTransactionsForMappings,
} from "./xero-accounting-sync";

// ─── Xero Projects API Types ───────────────────────────────────────────────
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

interface XeroProjectsResponse {
  pagination: { page: number; pageSize: number; pageCount: number; itemCount: number };
  items: XeroProject[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchAllXeroProjects(connectionId: number, statuses?: string[]): Promise<XeroProject[]> {
  const allProjects: XeroProject[] = [];
  const statusList = statuses || ["INPROGRESS", "CLOSED"];

  for (const status of statusList) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const result = await xeroApiRequest<XeroProjectsResponse>(
        `/projects/projects?states=${status}&page=${page}&pageSize=50`,
        { connectionId }
      );
      if (result.items && result.items.length > 0) {
        allProjects.push(...result.items);
        hasMore = page < result.pagination.pageCount;
        page++;
      } else {
        hasMore = false;
      }
    }
  }

  return allProjects;
}

async function getOrCreateXeroContact(
  db: any,
  auth: { xeroConnectionId: number },
  clientName: string,
  email?: string | null,
  phone?: string | null,
  address?: string | null,
  accountNumber?: string | null,
): Promise<string> {
  // Check if we already have a mapping
  const existingMapping = await db
    .select()
    .from(xeroContactMappings)
    .where(
      and(
        eq(xeroContactMappings.xeroConnectionId, auth.xeroConnectionId),
        eq(xeroContactMappings.xeroContactName, clientName)
      )
    )
    .limit(1);

  if (existingMapping.length > 0) {
    if (accountNumber) {
      await updateXeroContact(existingMapping[0].xeroContactId, { AccountNumber: accountNumber }, { connectionId: auth.xeroConnectionId });
    }
    return existingMapping[0].xeroContactId;
  }

  // Search Xero for existing contact
  try {
    const searchResult = await getXeroContacts({ where: `Name=="${clientName}"` }, { connectionId: auth.xeroConnectionId });
    if (searchResult.Contacts && searchResult.Contacts.length > 0) {
      if (accountNumber && searchResult.Contacts[0].AccountNumber !== accountNumber) {
        await updateXeroContact(searchResult.Contacts[0].ContactID, { AccountNumber: accountNumber }, { connectionId: auth.xeroConnectionId });
      }
      return searchResult.Contacts[0].ContactID;
    }
  } catch {
    // Search failed, create new
  }

  // Create new contact in Xero
  const contactData: Partial<XeroContact> = {
    Name: clientName,
    IsCustomer: true,
  };
  if (accountNumber) contactData.AccountNumber = accountNumber;
  if (email) contactData.EmailAddress = email;
  if (phone) {
    contactData.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: phone }];
  }
  if (address) {
    contactData.Addresses = [{ AddressType: "STREET", AddressLine1: address }];
  }

  const result = await createXeroContact(contactData, { connectionId: auth.xeroConnectionId });
  const xeroContactId = result.Contacts[0].ContactID;

  return xeroContactId;
}

function mapXeroStatusToJobStatus(xeroStatus: string): "in_progress" | "completed" {
  return xeroStatus === "CLOSED" ? "completed" : "in_progress";
}

function mapJobStatusToXeroStatus(jobStatus: string): "INPROGRESS" | "CLOSED" {
  return jobStatus === "completed" || jobStatus === "cancelled" ? "CLOSED" : "INPROGRESS";
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

async function backfillLeadClientNumber(
  db: any,
  jobId: number,
  clientNumber: string | null | undefined,
  tenantId: number | null | undefined,
) {
  const value = String(clientNumber || "").trim();
  if (!value) return;
  const jobConditions = [eq(constructionJobs.id, jobId)];
  if (tenantId) jobConditions.push(eq(constructionJobs.tenantId, tenantId));
  const [job] = await db.select({
    leadId: constructionJobs.leadId,
  })
    .from(constructionJobs)
    .where(and(...jobConditions))
    .limit(1);
  if (!job?.leadId) return;
  const leadConditions = [eq(crmLeads.id, job.leadId)];
  if (tenantId) leadConditions.push(eq(crmLeads.tenantId, tenantId));
  await db.update(crmLeads)
    .set({ clientNumber: value, updatedAt: new Date() })
    .where(and(...leadConditions));
}

function tenantJobWhere(jobId: number, tenantId: number) {
  return and(eq(constructionJobs.id, jobId), eq(constructionJobs.tenantId, tenantId));
}

function scopedJobWhere(jobId: number, tenantId?: number | null) {
  return tenantId ? tenantJobWhere(jobId, tenantId) : eq(constructionJobs.id, jobId);
}

function tenantLeadWhere(leadId: number, tenantId: number) {
  return and(eq(crmLeads.id, leadId), eq(crmLeads.tenantId, tenantId));
}

function scopedLeadWhere(leadId: number, tenantId?: number | null) {
  return tenantId ? tenantLeadWhere(leadId, tenantId) : eq(crmLeads.id, leadId);
}

function syncLogWhere(syncLogId: number, xeroConnectionId: number) {
  return and(eq(xeroSyncLogs.id, syncLogId), eq(xeroSyncLogs.xeroConnectionId, xeroConnectionId));
}

function clampMarginPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-999.99, Math.min(999.99, value));
}

async function upsertConstructionBudgetTotal(db: any, jobId: number, budgetCostIncGst: number) {
  const budget = Number.isFinite(budgetCostIncGst) ? budgetCostIncGst : 0;
  const [existing] = await db
    .select({ id: constructionJobFinancials.id, contractValue: constructionJobFinancials.contractValue })
    .from(constructionJobFinancials)
    .where(eq(constructionJobFinancials.jobId, jobId))
    .limit(1);

  const contractValue = parseFloat(String(existing?.contractValue || "0"));
  const margin = contractValue - budget;
  const marginPercent = clampMarginPercent(contractValue > 0 ? (margin / contractValue) * 100 : 0);

  const values = {
    totalCost: budget.toFixed(2),
    margin: margin.toFixed(2),
    marginPercent: marginPercent.toFixed(2),
  };

  if (existing) {
    await db.update(constructionJobFinancials)
      .set(values)
      .where(eq(constructionJobFinancials.jobId, jobId));
  } else {
    await db.insert(constructionJobFinancials).values({
      jobId,
      ...values,
    });
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const xeroProjectsRouter = router({
  // ─── Import all Xero Projects ───────────────────────────────────────────────
  importProjects: protectedProcedure
    .input(
      z.object({
        includeOpen: z.boolean().default(true),
        includeClosed: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      // Create sync log
      const [syncLog] = await db.insert(xeroSyncLogs).values({
        xeroConnectionId: auth.xeroConnectionId,
        syncType: "projects_import",
        status: "running",
      });
      const syncLogId = syncLog.insertId;

      try {
        const statuses: string[] = [];
        if (input.includeOpen) statuses.push("INPROGRESS");
        if (input.includeClosed) statuses.push("CLOSED");

        const xeroProjects = await fetchAllXeroProjects(auth.xeroConnectionId, statuses);

        let processed = 0;
        let failed = 0;
        const imported: Array<{ jobId: number; xeroProjectId: string; name: string }> = [];

        for (const project of xeroProjects) {
          try {
            // Check if already mapped
            const existing = await db
              .select()
              .from(xeroProjectMappings)
              .where(
                and(
                  eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
                  eq(xeroProjectMappings.xeroProjectId, project.projectId)
                )
              )
              .limit(1);

            // Resolve the actual client/contact details once so existing and new mappings stay aligned.
            let contactName = project.name;
            let contactEmail: string | null = null;
            let contactPhone: string | null = null;
            let contactAddress: string | null = null;
            let contactAccountNumber: string | null = null;
            try {
              const contactResult = await xeroApiRequest<{ Contacts: XeroContact[] }>(
                `/Contacts/${project.contactId}`,
                routing
              );
              if (contactResult.Contacts?.[0]) {
                const xContact = contactResult.Contacts[0];
                const resolvedName = xContact.Name;
                const firstName = xContact.FirstName || "";
                const lastName = xContact.LastName || "";
                const fullName = `${firstName} ${lastName}`.trim();
                if (resolvedName && /^[A-Z]{2,4}-\d+/.test(resolvedName) && fullName) {
                  contactName = fullName;
                } else if (resolvedName) {
                  contactName = resolvedName;
                } else if (fullName) {
                  contactName = fullName;
                }
                contactAccountNumber = xContact.AccountNumber || null;
                contactEmail = xContact.EmailAddress || null;
                if (xContact.Phones?.length) {
                  contactPhone = xContact.Phones[0].PhoneNumber || null;
                }
                if (xContact.Addresses?.length) {
                  const addr = xContact.Addresses[0];
                  contactAddress = [addr.AddressLine1, addr.City, addr.Region, addr.PostalCode]
                    .filter(Boolean)
                    .join(", ") || null;
                }
              }
            } catch {
              // Use project name as fallback
            }

            if (existing.length > 0) {
              // Update existing mapping with latest financial data
              await db
                .update(xeroProjectMappings)
                .set({
                  xeroProjectName: project.name,
                  xeroProjectStatus: project.status,
                  totalInvoiced: (project.projectAmountInvoiced?.value || 0).toFixed(2),
                  totalCosts: (
                    (project.totalTaskAmount?.value || 0) +
                    (project.totalExpenseAmount?.value || 0)
                  ).toFixed(2),
                  totalProfit: (
                    (project.projectAmountInvoiced?.value || 0) -
                    (project.totalTaskAmount?.value || 0) -
                    (project.totalExpenseAmount?.value || 0)
                  ).toFixed(2),
                  lastSyncedAt: new Date(),
                })
                .where(and(
                  eq(xeroProjectMappings.id, existing[0].id),
                  eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
                ));
              const jobUpdates: any = { status: mapXeroStatusToJobStatus(project.status) };
              if (project.status === "CLOSED") {
                const closedDate = getXeroProjectClosedDate(project);
                if (closedDate) jobUpdates.actualEnd = closedDate;
              }
              await db.update(constructionJobs)
                .set(jobUpdates)
                .where(tenantJobWhere(existing[0].jobId, ctx.tenant.id));
              await backfillLeadClientNumber(db, existing[0].jobId, contactAccountNumber, ctx.tenant.id);
              // Also update estimatedCost from NON_CHARGEABLE tasks
              try {
                const tasksRes = await xeroApiRequest<{ items: Array<{ chargeType: string; rate?: { value: number } }> }>(
                  `/projects/projects/${project.projectId}/tasks?pageSize=100&chargeType=NON_CHARGEABLE`,
                  routing
                );
                const budgetExGst = (tasksRes.items || []).reduce((s: number, t: any) => s + (t.rate?.value || 0), 0);
                const budgetIncGst = budgetExGst * 1.1;
                await db.update(xeroProjectMappings)
                  .set({ estimatedCost: budgetIncGst.toFixed(2) })
                  .where(and(
                    eq(xeroProjectMappings.id, existing[0].id),
                    eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
                  ));
                await upsertConstructionBudgetTotal(db, existing[0].jobId, budgetIncGst);
              } catch { /* fallback - leave existing value */ }
              processed++;
              continue;
            }

            // Also try to get invoiced amount from Xero Accounting API for this contact
            let accountingInvoicedAmount = 0;
            try {
              const invoicesResult = await xeroApiRequest<{ Invoices: Array<{ Total: number; Status: string }> }>(
                `/Invoices?ContactIDs=${project.contactId}&Statuses=AUTHORISED,PAID`,
                routing
              );
              if (invoicesResult.Invoices?.length) {
                accountingInvoicedAmount = invoicesResult.Invoices.reduce(
                  (sum, inv) => sum + (inv.Total || 0), 0
                );
              }
            } catch {
              // Accounting invoices not available, use Projects API value
            }

            // Create construction job with resolved contact details
            const [insertResult] = await db.insert(constructionJobs).values({
              tenantId: ctx.tenant.id,
              clientName: contactName,
              siteAddress: contactAddress,
              status: mapXeroStatusToJobStatus(project.status),
              priority: "normal",
              notes: `Imported from Xero Project: ${project.name}`,
              scheduledStart: project.deadlineUtc ? new Date(project.deadlineUtc) : null,
              actualEnd: project.status === "CLOSED" ? getXeroProjectClosedDate(project) : null,
              createdBy: ctx.user?.id ?? null,
            });
            const jobId = insertResult.insertId;
            await backfillLeadClientNumber(db, jobId, contactAccountNumber, ctx.tenant.id);

            // Create financial record - use accounting invoiced amount if available
            const totalCosts =
              (project.totalTaskAmount?.value || 0) + (project.totalExpenseAmount?.value || 0);
            const invoicedAmount = accountingInvoicedAmount || project.projectAmountInvoiced?.value || 0;
            // Budget Cost = sum of NON_CHARGEABLE tasks' rate.value × 1.1
            let contractValue = 0;
            try {
              const tasksRes = await xeroApiRequest<{ items: Array<{ chargeType: string; rate?: { value: number } }> }>(
                `/projects/projects/${project.projectId}/tasks?pageSize=100&chargeType=NON_CHARGEABLE`,
                routing
              );
              const budgetExGst = (tasksRes.items || []).reduce((s: number, t: any) => s + (t.rate?.value || 0), 0);
              contractValue = budgetExGst * 1.1;
            } catch {
              contractValue = (project.estimateAmount?.value || project.projectAmountInvoiced?.value || 0) * 1.1;
            }

            await db.insert(constructionJobFinancials).values({
              jobId,
              contractValue: contractValue.toFixed(2),
              totalCost: contractValue.toFixed(2),
              margin: "0",
              marginPercent: "0",
              materialsCost: "0",
              labourCost: "0",
              otherCost: "0",
              invoicedAmount: "0",
              paidAmount: "0",
              // Xero actuals
              xeroContractValue: contractValue.toFixed(2),
              xeroLabourCost: "0",
              xeroInvoicedAmount: invoicedAmount.toFixed(2),
              xeroTotalCost: "0", // Actual costs come from imported cost report only
            });

            // Create project mapping
            await db.insert(xeroProjectMappings).values({
              xeroConnectionId: auth.xeroConnectionId,
              jobId,
              xeroProjectId: project.projectId,
              xeroProjectName: project.name,
              xeroProjectStatus: project.status,
              xeroContactId: project.contactId,
              totalInvoiced: invoicedAmount.toFixed(2),
              totalCosts: totalCosts.toFixed(2),
              totalProfit: (invoicedAmount - totalCosts).toFixed(2),
              estimatedCost: contractValue.toFixed(2),
              lastSyncedAt: new Date(),
            });

            imported.push({ jobId, xeroProjectId: project.projectId, name: project.name });
            processed++;
          } catch (err: any) {
            failed++;
            console.error(`Failed to import Xero project ${project.name}:`, err.message);
          }
        }

        // Update sync log
        await db
          .update(xeroSyncLogs)
          .set({
            status: "completed",
            itemsProcessed: processed,
            itemsFailed: failed,
            completedAt: new Date(),
          })
          .where(syncLogWhere(syncLogId, auth.xeroConnectionId));

        return {
          success: true,
          totalFound: xeroProjects.length,
          imported: imported.length,
          updated: processed - imported.length,
          failed,
          projects: imported,
        };
      } catch (err: any) {
        await db
          .update(xeroSyncLogs)
          .set({
            status: "failed",
            errorMessage: err.message,
            completedAt: new Date(),
          })
          .where(syncLogWhere(syncLogId, auth.xeroConnectionId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  // ─── Push a construction job to Xero as a Project ───────────────────────────
  pushJobToXero: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

      // Check if already mapped
      const existingMapping = await db
        .select()
        .from(xeroProjectMappings)
        .where(
          and(
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
            eq(xeroProjectMappings.jobId, input.jobId)
          )
        )
        .limit(1);

      if (existingMapping.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This job is already linked to a Xero Project",
        });
      }

      // Get the job
      const [job] = await db
        .select()
        .from(constructionJobs)
        .where(tenantJobWhere(input.jobId, ctx.tenant.id));
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Construction job not found" });

      // Get financial data
      const [financials] = await db
        .select()
        .from(constructionJobFinancials)
        .where(eq(constructionJobFinancials.jobId, input.jobId));

      // Get or find lead data for email/phone
      let email: string | null = null;
      let phone: string | null = null;
      let accountNumber: string | null = null;
      if (job.leadId) {
        const [lead] = await db
          .select()
          .from(crmLeads)
          .where(tenantLeadWhere(job.leadId, ctx.tenant.id));
        if (lead) {
          email = lead.contactEmail;
          phone = lead.contactPhone;
          accountNumber = lead.clientNumber;
        }
      }

      // Get or create Xero contact
      const xeroContactId = await getOrCreateXeroContact(
        db,
        auth,
        job.clientName,
        email,
        phone,
        job.siteAddress,
        accountNumber
      );

         // Create Xero Project
      const estimateValue = financials?.contractValue
        ? parseFloat(financials.contractValue)
        : 0;
      const projectData: any = {
        contactId: xeroContactId,
        name: `${job.clientName} - ${job.siteAddress || `Job #${job.id}`}`,
        currencyCode: "AUD",
      };
      if (estimateValue > 0) {
        projectData.estimateAmount = { value: estimateValue, currency: "AUD" };
      }
      if (job.scheduledEnd) {
        projectData.deadlineUtc = new Date(job.scheduledEnd).toISOString();
      }
      const result = await xeroApiRequest<XeroProject>("/projects/projects", {
        method: "POST",
        body: projectData,
        connectionId: auth.xeroConnectionId,
      });

      // Store mapping
      await db.insert(xeroProjectMappings).values({
        xeroConnectionId: auth.xeroConnectionId,
        jobId: input.jobId,
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

      return {
        success: true,
        xeroProjectId: result.projectId,
        xeroProjectName: result.name,
      };
    }),

  // ─── Get Xero project mapping for a job ─────────────────────────────────────
  getJobMapping: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return null;

      const [mapping] = await db
        .select()
        .from(xeroProjectMappings)
        .where(
          and(
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
            eq(xeroProjectMappings.jobId, input.jobId)
          )
        )
        .limit(1);

      return mapping || null;
    }),

  // ─── Start chunked financial sync (processed by Heartbeat cron every 5 min) ──
  syncFinancials: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    // Mutex: check if a sync is already running (not stale — less than 2 hours old)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const [activeFinSync] = await db
      .select({ id: xeroSyncLogs.id, startedAt: xeroSyncLogs.startedAt, syncCursor: xeroSyncLogs.syncCursor, totalItems: xeroSyncLogs.totalItems })
      .from(xeroSyncLogs)
      .where(and(
        eq(xeroSyncLogs.syncType, "financials"),
        eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
        eq(xeroSyncLogs.status, "running"),
        sql`${xeroSyncLogs.startedAt} > ${twoHoursAgo}`
      ))
      .limit(1);
    if (activeFinSync) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `A financial sync is already in progress (${activeFinSync.syncCursor || 0}/${activeFinSync.totalItems || '?'} processed). The scheduled worker processes small batches every 5 minutes.`,
      });
    }
    // Mark any stale running syncs as failed (older than 2 hours)
    await db
      .update(xeroSyncLogs)
      .set({ status: "failed", completedAt: new Date(), errorMessage: "Timed out — marked as stale (>2h)" })
      .where(and(
        eq(xeroSyncLogs.syncType, "financials"),
        eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
        eq(xeroSyncLogs.status, "running"),
        sql`${xeroSyncLogs.startedAt} <= ${twoHoursAgo}`
      ));

    // Count total mappings to process
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));
    const totalItems = countRow?.count || 0;

    if (totalItems === 0) {
      return { success: true, message: "No project mappings to sync", totalItems: 0 };
    }

    // Create sync log with cursor tracking
    const [syncLog] = await db.insert(xeroSyncLogs).values({
      xeroConnectionId: auth.xeroConnectionId,
      syncType: "financials",
      status: "running",
      syncCursor: 0,
      totalItems,
    });
    const syncLogId = syncLog.insertId;

    console.log(`[SyncFinancials] Started chunked sync: ${totalItems} mappings, log ID ${syncLogId}`);
    return {
      success: true,
      message: `Financial sync started. Processing ${totalItems} projects in small batches every 5 minutes.`,
      syncLogId,
      totalItems,
    };
  }),

  // ─── Cancel a running financial sync ───────────────────────────────────────
  cancelFinancialSync: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    // Find the active running financial sync
    const [activeSyncLog] = await db
      .select({ id: xeroSyncLogs.id, syncCursor: xeroSyncLogs.syncCursor, totalItems: xeroSyncLogs.totalItems, itemsProcessed: xeroSyncLogs.itemsProcessed })
      .from(xeroSyncLogs)
      .where(and(
        eq(xeroSyncLogs.syncType, "financials"),
        eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
        eq(xeroSyncLogs.status, "running"),
      ))
      .limit(1);

    if (!activeSyncLog) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No running financial sync to cancel." });
    }

    await db
      .update(xeroSyncLogs)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Cancelled by user",
      })
      .where(syncLogWhere(activeSyncLog.id, auth.xeroConnectionId));

    return {
      success: true,
      message: `Financial sync cancelled. Processed ${activeSyncLog.itemsProcessed || 0} of ${activeSyncLog.totalItems || '?'} projects before cancellation.`,
    };
  }),

  // ─── Batch sync contacts ────────────────────────────────────────────────────
  batchSyncContacts: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    const [syncLog] = await db.insert(xeroSyncLogs).values({
      xeroConnectionId: auth.xeroConnectionId,
      syncType: "contacts",
      status: "running",
    });
    const syncLogId = syncLog.insertId;

    try {
      // Get all construction jobs without a contact mapping
      const jobs = await db.select().from(constructionJobs).where(eq(constructionJobs.tenantId, ctx.tenant.id));
      let processed = 0;
      let failed = 0;

      for (const job of jobs) {
        try {
          // Check if already mapped via project mapping
          const existingProjectMapping = await db
            .select()
            .from(xeroProjectMappings)
            .where(
              and(
                eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
                eq(xeroProjectMappings.jobId, job.id)
              )
            )
            .limit(1);

          if (existingProjectMapping.length > 0 && existingProjectMapping[0].xeroContactId) {
            processed++;
            continue; // Already has a contact
          }

          // Get lead data for email/phone
          let email: string | null = null;
          let phone: string | null = null;
          let accountNumber: string | null = null;
          if (job.leadId) {
            const [lead] = await db
              .select()
              .from(crmLeads)
              .where(tenantLeadWhere(job.leadId, ctx.tenant.id));
            if (lead) {
              email = lead.contactEmail;
              phone = lead.contactPhone;
              accountNumber = lead.clientNumber;
            }
          }

          await getOrCreateXeroContact(db, auth, job.clientName, email, phone, job.siteAddress, accountNumber);
          processed++;
        } catch (err: any) {
          failed++;
          console.error(`Failed to sync contact for job ${job.id}:`, err.message);
        }
      }

      await db
        .update(xeroSyncLogs)
        .set({
          status: "completed",
          itemsProcessed: processed,
          itemsFailed: failed,
          completedAt: new Date(),
        })
        .where(syncLogWhere(syncLogId, auth.xeroConnectionId));

      return { success: true, processed, failed };
    } catch (err: any) {
      await db
        .update(xeroSyncLogs)
        .set({
          status: "failed",
          errorMessage: err.message,
          completedAt: new Date(),
        })
        .where(syncLogWhere(syncLogId, auth.xeroConnectionId));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
    }
  }),

  // ─── Full batch sync (contacts + projects + financials) ─────────────────────
  fullBatchSync: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    // Mutex: check if a sync is already running (not stale — less than 30 min old)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const [activeSync] = await db
      .select({ id: xeroSyncLogs.id, startedAt: xeroSyncLogs.startedAt })
      .from(xeroSyncLogs)
      .where(and(
        eq(xeroSyncLogs.status, "running"),
        eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
        sql`${xeroSyncLogs.startedAt} > ${thirtyMinAgo}`
      ))
      .limit(1);
    if (activeSync) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A sync is already in progress. Please wait for it to complete or try again in 30 minutes.",
      });
    }
    // Mark any stale running syncs as failed (older than 30 min)
    await db
      .update(xeroSyncLogs)
      .set({ status: "failed", completedAt: new Date(), errorMessage: "Timed out — marked as stale" })
      .where(and(
        eq(xeroSyncLogs.status, "running"),
        eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId),
        sql`${xeroSyncLogs.startedAt} <= ${thirtyMinAgo}`
      ));

    // Create sync log entry
    const [syncLog] = await db.insert(xeroSyncLogs).values({
      xeroConnectionId: auth.xeroConnectionId,
      syncType: "full_batch",
      status: "running",
    });
    const syncLogId = syncLog.insertId;

    // Fire-and-forget: run the sync in the background
    runFullBatchSyncBackground(db, auth, syncLogId).catch((err) => {
      console.error("Background batch sync failed:", err);
    });

    // Return immediately with the syncLogId so frontend can poll
    return { success: true, syncLogId, status: "running" };
  }),

  // ─── Poll sync status ─────────────────────────────────────────────────────
  getSyncStatus: protectedProcedure
    .input(z.object({ syncLogId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return null;
      const [log] = await db
        .select()
        .from(xeroSyncLogs)
        .where(syncLogWhere(input.syncLogId, auth.xeroConnectionId));
      return log || null;
    }),

  // ─── Get sync logs ──────────────────────────────────────────────────────────
  getSyncLogs: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return [];

      return db
        .select()
        .from(xeroSyncLogs)
        .where(eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId))
        .orderBy(desc(xeroSyncLogs.startedAt))
        .limit(input.limit);
    }),

  // ─── Get sync failure details for a specific sync log ──────────────────────
  getSyncFailures: protectedProcedure
    .input(z.object({ syncLogId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return [];
      const [log] = await db
        .select({ id: xeroSyncLogs.id })
        .from(xeroSyncLogs)
        .where(syncLogWhere(input.syncLogId, auth.xeroConnectionId))
        .limit(1);
      if (!log) return [];
      return db
        .select()
        .from(xeroSyncFailures)
        .where(eq(xeroSyncFailures.syncLogId, input.syncLogId))
        .orderBy(xeroSyncFailures.phase, xeroSyncFailures.id);
    }),

    // ─── Get all project mappings ───────────────────────────────────────────────
  getAllMappings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
    if (!auth) return [];
    return db
      .select()
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId))
      .orderBy(desc(xeroProjectMappings.updatedAt));
  }),

  // ─── Get transaction details for a project ──────────────────────────────────
  getProjectTransactions: protectedProcedure
    .input(z.object({
      mappingId: z.number(),
      type: z.enum(["invoices", "bills", "expenses"]),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { transactions: [] };
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return { transactions: [] };

      const [mapping] = await db
        .select()
        .from(xeroProjectMappings)
        .where(and(
          eq(xeroProjectMappings.id, input.mappingId),
          eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
        ));
      if (!mapping) return { transactions: [] };

      try {
        if (input.type === "expenses") {
          // Xero Projects API does not expose /expenses endpoint
          // Actual costs are now handled by the "bills" type (time entries + ACCPAY bills)
          return { transactions: [] };
        }

        if (!mapping.xeroContactId) return { transactions: [] };

        if (input.type === "invoices") {
          // Get accounts receivable invoices from Accounting API
          // Fetch all invoices for this contact and filter by Type in code to avoid Xero where clause issues
          const result = await xeroApiRequest<{ Invoices: Array<{ InvoiceID: string; InvoiceNumber: string; Reference: string; Type: string; Total: number; AmountPaid: number; AmountDue: number; Status: string; DateString: string; DueDateString: string; Contact: { Name: string } }> }>(
            `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=DRAFT,SUBMITTED,AUTHORISED,PAID`,
            { connectionId: auth.xeroConnectionId }
          );
          // Filter to only ACCREC (accounts receivable) invoices
          result.Invoices = (result.Invoices || []).filter(inv => inv.Type === "ACCREC");
          const transactions = (result.Invoices || []).map((inv) => ({
            id: inv.InvoiceID,
            date: inv.DateString,
            description: inv.InvoiceNumber || "Invoice",
            amount: inv.Total || 0,
            amountPaid: inv.AmountPaid || 0,
            amountDue: inv.AmountDue || 0,
            status: inv.Status,
            reference: inv.Reference || "",
            type: "invoice" as const,
          }));
          // Update stored invoice total
          const invoiceTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
          if (invoiceTotal > 0) {
            const profit = invoiceTotal - parseFloat(mapping.totalCosts || "0");
            await db.update(xeroProjectMappings)
              .set({
                totalInvoiced: invoiceTotal.toFixed(2),
                totalProfit: profit.toFixed(2),
              })
              .where(and(
                eq(xeroProjectMappings.id, input.mappingId),
                eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
              ));
          }
          return { transactions };
        }

        if (input.type === "bills") {
          // Actual Costs: read from automatic Accounting API transaction sync.
          const costs = await db
            .select()
            .from(xeroAccountingTransactions)
            .where(and(
              eq(xeroAccountingTransactions.mappingId, input.mappingId),
              eq(xeroAccountingTransactions.isCost, true)
            ))
            .orderBy(desc(xeroAccountingTransactions.transactionDate), desc(xeroAccountingTransactions.id));

          const transactions = costs.map(cost => ({
            id: cost.sourceKey,
            date: cost.transactionDate || "",
            description: `${cost.contactName || "Supplier"} - ${cost.transactionNumber || ""} ${cost.description ? `(${cost.description.substring(0, 60)})` : ""}`.trim(),
            amount: parseFloat(cost.grossAmount || "0"),
            amountPaid: parseFloat(cost.amountPaid || "0"),
            amountDue: parseFloat(cost.amountDue || "0"),
            status: cost.status || "DRAFT",
            reference: cost.sourceType === "bank_transaction" ? "Spend" : "Bill",
            type: "bill" as const,
          }));

          return { transactions };
        }

        return { transactions: [] };
      } catch (err: any) {
        console.error("Failed to fetch transactions:", err.message);
        return { transactions: [] };
      }
    }),
  // ─── Get Payment Schedule (Tasks) for a Project ─────────────────────────────
  /** Fetches FIXED tasks from a Xero project = client payment milestones */
  getProjectPaymentSchedule: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { milestones: [], project: null, invoices: [] };
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return { milestones: [], project: null, invoices: [] };
      // Find the project mapping for this job
      const [mapping] = await db
        .select()
        .from(xeroProjectMappings)
        .where(and(
          eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroProjectMappings.jobId, input.jobId)
        ));
      if (!mapping) return { milestones: [], project: null, invoices: [] };
      try {
        // Fetch the project details
        const project = await xeroApiRequest<any>(
          `/projects/projects/${mapping.xeroProjectId}`,
          { connectionId: auth.xeroConnectionId }
        );
        // Fetch all tasks for the project
        const tasksResult = await xeroApiRequest<{ pagination: any; items: any[] }>(
          `/projects/projects/${mapping.xeroProjectId}/tasks?pageSize=100`,
          { connectionId: auth.xeroConnectionId }
        );
        // Filter to FIXED tasks (payment milestones) and map to a clean structure
        const milestones = (tasksResult.items || [])
          .filter((t: any) => t.chargeType === "FIXED")
          .map((t: any) => ({
            taskId: t.taskId,
            name: t.name,
            amount: t.rate?.value || 0,
            currency: t.rate?.currency || "AUD",
            status: t.status, // ACTIVE, INVOICED, LOCKED
            amountInvoiced: t.amountInvoiced?.value || 0,
            amountToBeInvoiced: t.amountToBeInvoiced?.value || 0,
            isFullyInvoiced: t.status === "INVOICED" || (t.amountToBeInvoiced?.value || 0) === 0,
          }));
        // Also fetch ACCREC invoices for this contact to check payment status
        let invoices: any[] = [];
        if (mapping.xeroContactId) {
          try {
            const invResult = await xeroApiRequest<{ Invoices: any[] }>(
              `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID`,
              { connectionId: auth.xeroConnectionId }
            );
            invoices = (invResult.Invoices || [])
              .filter((inv: any) => inv.Type === "ACCREC")
              .map((inv: any) => {
                // Invoices containing "Sumloe" are treated as paid regardless of Xero status
                const isSumloe = (inv.InvoiceNumber || "").toLowerCase().includes("sumloe") ||
                  (inv.Reference || "").toLowerCase().includes("sumloe");
                return {
                  invoiceId: inv.InvoiceID,
                  invoiceNumber: inv.InvoiceNumber,
                  reference: inv.Reference || "",
                  total: inv.Total || 0,
                  amountPaid: isSumloe ? (inv.Total || 0) : (inv.AmountPaid || 0),
                  amountDue: isSumloe ? 0 : (inv.AmountDue || 0),
                  status: isSumloe ? "PAID" : inv.Status,
                  date: inv.DateString,
                  dueDate: inv.DueDateString,
                };
              });
          } catch (e) {
            // Non-critical - continue without invoice details
          }
        }
        return {
          project: {
            projectId: project.projectId,
            name: project.name,
            status: project.status,
            estimate: project.estimate?.value || 0,
            totalInvoiced: project.totalInvoiced?.value || 0,
            totalToBeInvoiced: project.totalToBeInvoiced?.value || 0,
            deposit: project.deposit?.value || 0,
            depositApplied: project.depositApplied?.value || 0,
          },
          milestones,
          invoices,
        };
      } catch (err: any) {
        console.error("[Xero] Failed to fetch payment schedule:", err.message);
        return { milestones: [], project: null, invoices: [] };
      }
    }),
  // ─── Get Job Financial Summary (combined client + trade view) ────────────────
  getJobFinancialSummary: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [job] = await db
        .select({ id: constructionJobs.id })
        .from(constructionJobs)
        .where(tenantJobWhere(input.jobId, ctx.tenant.id))
        .limit(1);
      if (!job) return null;

      // Get the job's project mapping for client-side financials
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      let mapping: any = null;
      if (auth) {
        const [m] = await db
          .select()
          .from(xeroProjectMappings)
          .where(and(
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
            eq(xeroProjectMappings.jobId, input.jobId)
          ));
        mapping = m || null;
      }
      // Get trade-side financials from PO milestones
      const jobMilestones = await db
        .select()
        .from(poMilestones)
        .where(eq(poMilestones.jobId, input.jobId));
      // Get trade invoices for this job
      const tInvoices = await db
        .select()
        .from(tradeInvoices)
        .where(eq(tradeInvoices.jobId, input.jobId));
      // Calculate trade-side totals
      const tradePOTotal = jobMilestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || "0"), 0);
      const tradeRetentionHeld = jobMilestones
        .filter((m: any) => m.status === "claimed" || m.status === "approved")
        .reduce((sum: number, m: any) => sum + parseFloat(m.retentionAmount || "0"), 0);
      const tradeInvoicedTotal = tInvoices
        .filter((i: any) => i.status !== "rejected")
        .reduce((sum: number, i: any) => sum + parseFloat(i.amount || "0"), 0);
      const tradePaidTotal = tInvoices
        .filter((i: any) => i.status === "paid")
        .reduce((sum: number, i: any) => sum + parseFloat(i.amount || "0"), 0);
      return {
        clientSide: {
          contractValue: mapping ? parseFloat(mapping.totalInvoiced || "0") + parseFloat(mapping.estimatedCost || "0") : 0,
          invoiced: mapping ? parseFloat(mapping.totalInvoiced || "0") : 0,
          estimate: mapping ? parseFloat(mapping.estimatedCost || "0") : 0,
          xeroProjectLinked: !!mapping,
        },
        tradeSide: {
          poTotal: tradePOTotal,
          invoiced: tradeInvoicedTotal,
          paid: tradePaidTotal,
          retentionHeld: tradeRetentionHeld,
          remaining: tradePOTotal - tradePaidTotal,
          poCount: jobMilestones.length,
          invoiceCount: tInvoices.length,
        },
        margin: mapping
          ? (parseFloat(mapping.estimatedCost || "0") || parseFloat(mapping.totalInvoiced || "0")) - tradePOTotal
          : 0,
      };
    }),

});

// ─── Background Full Batch Sync ──────────────────────────────────────────────
// This runs outside the tRPC request lifecycle so it won't time out.
async function runFullBatchSyncBackground(
  db: any,
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number; appTenantId?: number | null },
  syncLogId: number
): Promise<void> {
  let totalProcessed = 0;
  let totalFailed = 0;
  const routing = { connectionId: auth.xeroConnectionId, appTenantId: auth.appTenantId ?? null, moduleKey: "construction" };

  try {
    // ── Phase 1: Sync contacts for all jobs ──────────────────────────────────
    const jobs = auth.appTenantId
      ? await db.select().from(constructionJobs).where(eq(constructionJobs.tenantId, auth.appTenantId))
      : await db.select().from(constructionJobs);
    for (const job of jobs) {
      try {
        let email: string | null = null;
        let phone: string | null = null;
        let accountNumber: string | null = null;
        if (job.leadId) {
          const [lead] = await db
            .select()
            .from(crmLeads)
            .where(scopedLeadWhere(job.leadId, auth.appTenantId));
          if (lead) {
            email = lead.contactEmail;
            phone = lead.contactPhone;
            accountNumber = lead.clientNumber;
          }
        }
        await getOrCreateXeroContact(db, auth, job.clientName, email, phone, job.siteAddress, accountNumber);
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
        } catch {}
      }
    }

    // ── Phase 2: Sync financial data for all mapped projects ─────────────────
    const mappings = await db
      .select()
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));

    try {
      const accountingSync = await syncXeroAccountingTransactionsForMappings(db, auth, mappings, {
        appTenantId: auth.appTenantId ?? null,
        maxPages: 50,
        includeUnmatched: false,
      });
      if (accountingSync.fetchErrors.length) {
        console.warn("[Xero Full Batch] Accounting fetch warnings:", accountingSync.fetchErrors.join("; "));
      }
    } catch (err: any) {
      console.warn(`[Xero Full Batch] Accounting transaction sync skipped: ${err.message}`);
    }

    for (const mapping of mappings) {
      try {
        const project = await xeroApiRequest<XeroProject>(
          `/projects/projects/${mapping.xeroProjectId}`,
          routing
        );
        // Xero Projects API returns ex-GST values — multiply by 1.1 to store inc-GST
        const GST_MULTIPLIER = 1.1;
        const totalInvoicedExGst = project.projectAmountInvoiced?.value || 0;
        const expenseEntriesExGst = project.totalExpenseAmount?.value || 0;

        let totalInvoiced = totalInvoicedExGst * GST_MULTIPLIER;
        const expenseEntries = expenseEntriesExGst * GST_MULTIPLIER;

        // Budget Cost = sum of NON_CHARGEABLE tasks' rate.value (estimated expenses) × 1.1
        let estimatedCost = 0;
        try {
          const tasksRes = await xeroApiRequest<{ pagination: any; items: Array<{ chargeType: string; rate?: { value: number } }> }>(
            `/projects/projects/${mapping.xeroProjectId}/tasks?pageSize=100&chargeType=NON_CHARGEABLE`,
            routing
          );
          const nonChargeableTasks = tasksRes.items || [];
          const budgetCostExGst = nonChargeableTasks.reduce((sum: number, t: any) => sum + (t.rate?.value || 0), 0);
          estimatedCost = budgetCostExGst * GST_MULTIPLIER;
        } catch {
          estimatedCost = (project.estimateAmount?.value || 0) * GST_MULTIPLIER;
        }

        // Also check Accounting API for invoiced amounts (may be higher)
        if (mapping.xeroContactId) {
          try {
            const invoicesResult = await xeroApiRequest<{
              Invoices: Array<{ Total: number; Status: string; Type: string }>;
            }>(
              `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID`,
              routing
            );
            const accrecInvoices = (invoicesResult.Invoices || []).filter(inv => inv.Type === "ACCREC");
            if (accrecInvoices.length) {
              const accountingInvoiced = accrecInvoices.reduce(
                (sum, i) => sum + (i.Total || 0),
                0
              );
              if (accountingInvoiced > totalInvoiced) totalInvoiced = accountingInvoiced;
            }
          } catch {
            /* fallback to projects API */
          }
        }

        await db
          .update(xeroProjectMappings)
          .set({
            xeroProjectStatus: project.status,
            totalInvoiced: totalInvoiced.toFixed(2),
            expenseEntries: expenseEntries.toFixed(2),
            estimatedCost: estimatedCost.toFixed(2),
            lastSyncedAt: new Date(),
          })
          .where(and(
            eq(xeroProjectMappings.id, mapping.id),
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
          ));
        await upsertConstructionBudgetTotal(db, mapping.jobId, estimatedCost);

        // Recalculate actuals from automatic Accounting API transaction lines.
        const accountingRollup = await rollupXeroAccountingTransactionsForMapping(db, mapping);
        let xeroTotalCost = accountingRollup.costs;
        let xeroInvoicedAmount = accountingRollup.revenue || totalInvoiced;
        let xeroPaidAmount = accountingRollup.paid;

        // Legacy fallback: keep existing imported report costs only when no automatic costs matched.
        if (xeroTotalCost === 0) {
          xeroTotalCost = await getLegacyImportedCostTotal(db, mapping.jobId);
        }

        // Get paid amount from invoices
        if (xeroPaidAmount === 0 && mapping.xeroContactId) {
          try {
            const paidResult = await xeroApiRequest<{ Invoices: Array<{ AmountPaid: number; Type: string }> }>(
              `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=PAID`,
              routing
            );
            const paidAccrec = (paidResult.Invoices || []).filter(inv => inv.Type === "ACCREC");
            if (paidAccrec.length) {
              xeroPaidAmount = paidAccrec.reduce((sum, inv) => sum + (inv.AmountPaid || 0), 0);
            }
          } catch { /* no paid invoices */ }
        }

        await db
          .update(constructionJobFinancials)
          .set({
            xeroInvoicedAmount: xeroInvoicedAmount.toFixed(2),
            xeroLabourCost: accountingRollup.labour.toFixed(2),
            xeroMaterialsCost: accountingRollup.materials.toFixed(2),
            xeroOtherCost: accountingRollup.other.toFixed(2),
            xeroTotalCost: xeroTotalCost.toFixed(2),
            xeroPaidAmount: xeroPaidAmount.toFixed(2),
          })
          .where(eq(constructionJobFinancials.jobId, mapping.jobId));

        await db.update(xeroProjectMappings)
          .set({
            totalInvoiced: xeroInvoicedAmount.toFixed(2),
            totalCosts: xeroTotalCost.toFixed(2),
            totalProfit: (xeroInvoicedAmount - xeroTotalCost).toFixed(2),
            lastSyncedAt: new Date(),
          })
          .where(and(
            eq(xeroProjectMappings.id, mapping.id),
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
          ));

        // Update job dates from Xero project lifecycle
        const jobDateUpdates: any = {};
        // actualStart = earliest invoice date for this contact (when work actually started)
        if (mapping.xeroContactId) {
          try {
            const earliestInvResult = await xeroApiRequest<{ Invoices: Array<{ DateString: string; Type: string }> }>(
              `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID&order=Date`,
              routing
            );
            const accrec = (earliestInvResult.Invoices || []).filter(inv => inv.Type === "ACCREC");
            if (accrec.length > 0 && accrec[0].DateString) {
              jobDateUpdates.actualStart = new Date(accrec[0].DateString);
            }
          } catch { /* no invoices found */ }
        }
        if (project.status === "CLOSED") {
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
            .where(scopedJobWhere(mapping.jobId, auth.appTenantId));
        } else if (project.status === "CLOSED") {
          await db
            .update(constructionJobs)
            .set({ status: "completed" })
            .where(
              and(
                scopedJobWhere(mapping.jobId, auth.appTenantId),
                sql`${constructionJobs.status} != 'completed'`
              )
            );
        }

        totalProcessed++;
      } catch (err: any) {
        totalFailed++;
        try {
          await db.insert(xeroSyncFailures).values({
            syncLogId,
            phase: "financials",
            recordId: String(mapping.jobId),
            recordLabel: `Mapping #${mapping.id} (Job ${mapping.jobId})`,
            errorMessage: err?.message?.slice(0, 1000) || "Unknown error",
          });
        } catch {}
      }
    }

    // ── Phase 3: Push unmapped active jobs to Xero ───────────────────────────
    const unmappedConditions: any[] = [
      sql`${constructionJobs.id} NOT IN (SELECT jobId FROM xero_project_mappings WHERE xeroConnectionId = ${auth.xeroConnectionId})`,
      sql`${constructionJobs.status} IN ('scheduled', 'in_progress')`,
    ];
    if (auth.appTenantId) {
      unmappedConditions.push(eq(constructionJobs.tenantId, auth.appTenantId));
    }
    const unmappedJobs = await db
      .select({ id: constructionJobs.id })
      .from(constructionJobs)
      .where(and(...unmappedConditions));

    for (const { id: jobId } of unmappedJobs) {
      try {
        const [job] = await db
          .select()
          .from(constructionJobs)
          .where(scopedJobWhere(jobId, auth.appTenantId));
        if (!job) continue;

        let email: string | null = null;
        let phone: string | null = null;
        let accountNumber: string | null = null;
        if (job.leadId) {
          const [lead] = await db
            .select()
            .from(crmLeads)
            .where(scopedLeadWhere(job.leadId, auth.appTenantId));
          if (lead) {
            email = lead.contactEmail;
            phone = lead.contactPhone;
            accountNumber = lead.clientNumber;
          }
        }

        const xeroContactId = await getOrCreateXeroContact(
          db,
          auth,
          job.clientName,
          email,
          phone,
          job.siteAddress,
          accountNumber
        );

        const [financials] = await db
          .select()
          .from(constructionJobFinancials)
          .where(eq(constructionJobFinancials.jobId, jobId));

        const estimateValue = financials?.contractValue
          ? parseFloat(financials.contractValue)
          : 0;
        const projectData: any = {
          contactId: xeroContactId,
          name: `${job.clientName} - ${job.siteAddress || `Job #${job.id}`}`,
          currencyCode: "AUD",
        };
        if (estimateValue > 0) {
          projectData.estimateAmount = { value: estimateValue, currency: "AUD" };
        }
        if (job.scheduledEnd) {
          projectData.deadlineUtc = new Date(job.scheduledEnd).toISOString();
        }

        const result = await xeroApiRequest<XeroProject>("/projects/projects", {
          method: "POST",
          body: projectData,
          connectionId: auth.xeroConnectionId,
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
      } catch (err: any) {
        totalFailed++;
        try {
          await db.insert(xeroSyncFailures).values({
            syncLogId,
            phase: "push_projects",
            recordId: String(jobId),
            recordLabel: `Unmapped Job #${jobId}`,
            errorMessage: err?.message?.slice(0, 1000) || "Unknown error",
          });
        } catch {}
      }
    }

    // ── Mark sync as completed ───────────────────────────────────────────────────────
    await db
      .update(xeroSyncLogs)
      .set({
        status: "completed",
        itemsProcessed: totalProcessed,
        itemsFailed: totalFailed,
        completedAt: new Date(),
      })
      .where(syncLogWhere(syncLogId, auth.xeroConnectionId));

    console.log(
      `[Xero Batch Sync] Completed: ${totalProcessed} processed, ${totalFailed} failed`
    );

    // ── Send email report if there were failures ─────────────────────────────
    if (totalFailed > 0) {
      try {
        const failures = await db.select().from(xeroSyncFailures).where(eq(xeroSyncFailures.syncLogId, syncLogId));
        const adminUsers = auth.appTenantId
          ? await db
              .select({ email: users.email })
              .from(users)
              .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
              .where(and(
                eq(tenantMemberships.tenantId, auth.appTenantId),
                inArray(tenantMemberships.role, ["owner", "admin"])
              ))
          : await db.select({ email: users.email }).from(users).where(inArray(users.role, ["admin", "super_admin"]));
        const adminEmails = adminUsers.map((u: any) => u.email).filter(Boolean) as string[];
        if (adminEmails.length > 0) {
          const failuresByPhase: Record<string, typeof failures> = {};
          for (const f of failures) {
            if (!failuresByPhase[f.phase]) failuresByPhase[f.phase] = [];
            failuresByPhase[f.phase].push(f);
          }
          let tableRows = '';
          for (const [phase, items] of Object.entries(failuresByPhase)) {
            for (const item of items.slice(0, 50)) {
              tableRows += `<tr><td style="padding:4px 8px;border:1px solid #ddd">${phase}</td><td style="padding:4px 8px;border:1px solid #ddd">${item.recordLabel || item.recordId || '-'}</td><td style="padding:4px 8px;border:1px solid #ddd">${(item.errorMessage || '').slice(0, 200)}</td></tr>`;
            }
            if (items.length > 50) {
              tableRows += `<tr><td colspan="3" style="padding:4px 8px;border:1px solid #ddd;font-style:italic">...and ${items.length - 50} more in ${phase}</td></tr>`;
            }
          }
          const html = `<h2>Xero Sync Report</h2><p><strong>${totalProcessed}</strong> processed, <strong style="color:red">${totalFailed}</strong> failed</p><p>Started: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</p><table style="border-collapse:collapse;width:100%"><thead><tr><th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5">Phase</th><th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5">Record</th><th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5">Error</th></tr></thead><tbody>${tableRows}</tbody></table>`;
          for (const email of adminEmails) {
            await sendNotificationEmail({ to: email, subject: `Xero Sync: ${totalFailed} records failed`, htmlBody: html });
          }
        }
      } catch (emailErr) {
        console.error('[Xero Batch Sync] Failed to send email report:', emailErr);
      }
    }
  } catch (err: any) {
    // Mark sync as failed
    await db
      .update(xeroSyncLogs)
      .set({
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      })
      .where(syncLogWhere(syncLogId, auth.xeroConnectionId));

    console.error("[Xero Batch Sync] Failed:", err.message);
  }
}
