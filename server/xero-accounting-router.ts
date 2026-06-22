import { z } from "zod";
import { and, desc, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs,
  crmLeads,
  xeroAccountingTransactions,
  xeroBudgetImportBatches,
  xeroProjectMappings,
  xeroCostImportBatches,
  xeroSyncLogs,
  xeroWebhookEvents,
} from "../drizzle/schema";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { getValidAccessToken } from "./xero-client";
import {
  getXeroAccountingRowsForJob,
  getXeroAccountingSummaryForJob,
  rollupXeroAccountingTransactionsForMapping,
  syncXeroAccountingTransactionsForMappings,
} from "./xero-accounting-sync";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function normaliseText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function compactText(value: unknown) {
  return normaliseText(value).replace(/[^a-z0-9]+/g, "");
}

function extractJobNumber(value: unknown) {
  const match = String(value || "").match(/\b(?:ACT|RIV|NSW)?[-\s]*(\d{4,6})\b/i);
  return match?.[1] || "";
}

function extractProjectIdentifiers(...values: Array<unknown>) {
  const identifiers = new Set<string>();
  const pattern = /\b(?:[A-Z]{2,6}[-\s]*)?(\d{5,6})(?:[-\s][A-Z0-9]{1,10})*\b/gi;
  for (const value of values) {
    const text = collectSearchableStrings(value).join(" ");
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (!/^0+$/.test(match[1])) identifiers.add(match[1]);
    }
  }
  return Array.from(identifiers);
}

function collectSearchableStrings(value: unknown, depth = 0): string[] {
  if (value == null || depth > 4) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => collectSearchableStrings(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectSearchableStrings(item, depth + 1));
  }
  return [];
}

function rawSearchText(raw: unknown) {
  return collectSearchableStrings(raw).join(" ");
}

function textIncludesToken(text: string, compact: string, value: unknown, minLength = 4) {
  const norm = normaliseText(value);
  const cmp = compactText(value);
  if (norm.length >= minLength && text.includes(norm)) return true;
  if (cmp.length >= minLength && compact.includes(cmp)) return true;
  return false;
}

function scoreUnmatchedCandidate(row: any, mapping: any) {
  const haystack = [
    row.transactionNumber,
    row.reference,
    row.description,
    row.contactName,
    row.trackingOptionName,
    row.trackingCategoryName,
    rawSearchText(row.raw),
  ].filter(Boolean).join(" ");
  const text = normaliseText(haystack);
  const compact = compactText(haystack);
  const rowProjectIdentifiers = extractProjectIdentifiers(haystack);
  const accountNumberIdentifiers = extractProjectIdentifiers(mapping.clientNumber);
  const matchingAccountNumber = accountNumberIdentifiers.find((identifier) => rowProjectIdentifiers.includes(identifier));
  const mappingProjectIdentifiers = extractProjectIdentifiers(
    mapping.quoteNumber,
    mapping.constructionJobNumber,
    mapping.xeroProjectName,
  );
  const matchingProjectId = !matchingAccountNumber
    ? mappingProjectIdentifiers.find((identifier) => rowProjectIdentifiers.includes(identifier))
    : null;
  let score = 0;
  const reasons: string[] = [];

  if (matchingAccountNumber) {
    score += 100;
    reasons.push(`account number ${matchingAccountNumber}`);
  } else if (matchingProjectId) {
    score += 70;
    reasons.push(`project/reference id ${matchingProjectId}`);
  }
  if (row.contactId && mapping.xeroContactId && row.contactId === mapping.xeroContactId) {
    score += 55;
    reasons.push("same Xero contact");
  }
  if (textIncludesToken(text, compact, mapping.quoteNumber, 4)) {
    score += 45;
    reasons.push("quote number");
  }
  if (textIncludesToken(text, compact, mapping.clientNumber, 4)) {
    score += 45;
    reasons.push("account number");
  }
  const jobNumbers = [
    mapping.quoteNumber,
    mapping.clientNumber,
    mapping.constructionJobNumber,
    mapping.xeroProjectName,
  ].map(extractJobNumber).filter(Boolean);
  if (jobNumbers.some((jobNumber) => text.includes(jobNumber))) {
    score += 40;
    reasons.push("job number");
  }
  if (textIncludesToken(text, compact, mapping.xeroProjectName, 6)) {
    score += 35;
    reasons.push("project name");
  }
  if (textIncludesToken(text, compact, mapping.clientName, 6)) {
    score += 30;
    reasons.push("client name");
  }
  if (textIncludesToken(text, compact, mapping.siteAddress, 10)) {
    score += 25;
    reasons.push("site address");
  }

  return { score, reasons };
}

async function getTenantMappedProjects(db: any, ctx: any, xeroConnectionId: number, jobId?: number) {
  const conditions: any[] = [eq(xeroProjectMappings.xeroConnectionId, xeroConnectionId)];
  if (jobId) conditions.push(eq(xeroProjectMappings.jobId, jobId));

  return db.select({
    id: xeroProjectMappings.id,
    xeroConnectionId: xeroProjectMappings.xeroConnectionId,
    jobId: xeroProjectMappings.jobId,
    xeroProjectId: xeroProjectMappings.xeroProjectId,
    xeroProjectName: xeroProjectMappings.xeroProjectName,
    xeroProjectStatus: xeroProjectMappings.xeroProjectStatus,
    xeroContactId: xeroProjectMappings.xeroContactId,
    totalInvoiced: xeroProjectMappings.totalInvoiced,
    totalCosts: xeroProjectMappings.totalCosts,
    totalProfit: xeroProjectMappings.totalProfit,
    estimatedCost: xeroProjectMappings.estimatedCost,
    lastSyncedAt: xeroProjectMappings.lastSyncedAt,
  })
    .from(xeroProjectMappings)
    .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
    .where(and(
      ...conditions,
      ...jobTenantConditions(ctx)
    ));
}

async function requireMappedJob(db: any, ctx: any, xeroConnectionId: number, jobId: number) {
  const [mapping] = await getTenantMappedProjects(db, ctx, xeroConnectionId, jobId);
  if (!mapping) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No Xero project mapping found for this job" });
  }
  return mapping;
}

async function getPreviousCompletedFinancialSyncDate(db: any, xeroConnectionId: number) {
  const [lastSync] = await db.select({
    completedAt: xeroSyncLogs.completedAt,
    startedAt: xeroSyncLogs.startedAt,
  })
    .from(xeroSyncLogs)
    .where(and(
      eq(xeroSyncLogs.xeroConnectionId, xeroConnectionId),
      eq(xeroSyncLogs.syncType, "financials"),
      eq(xeroSyncLogs.status, "completed"),
      isNotNull(xeroSyncLogs.completedAt),
    ))
    .orderBy(desc(xeroSyncLogs.completedAt))
    .limit(1);

  const baseDate = lastSync?.completedAt || lastSync?.startedAt;
  if (!baseDate) return null;
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) return null;
  // Xero modified-since is edit-based. Keep an overlap so near-boundary edits are not missed.
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

export const xeroAccountingRouter = router({
  getSyncHealth: tenantProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) {
        return {
          connected: false,
          totals: { rows: 0, unmatched: 0, ignored: 0, costs: 0, revenue: 0 },
          recentWebhookEvents: [] as any[],
          recentSyncLogs: [] as any[],
          lastCostImport: null as any,
          lastBudgetImport: null as any,
        };
      }

      const tenantCondition = eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id);
      const [totals] = await db.select({
        rows: sql<number>`COUNT(*)`,
        unmatched: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.mappingId} IS NULL AND ${xeroAccountingTransactions.ignoredAt} IS NULL THEN 1 ELSE 0 END)`,
        ignored: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.ignoredAt} IS NOT NULL THEN 1 ELSE 0 END)`,
        costs: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.isCost} = 1 AND ${xeroAccountingTransactions.ignoredAt} IS NULL THEN 1 ELSE 0 END)`,
        revenue: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.isRevenue} = 1 AND ${xeroAccountingTransactions.ignoredAt} IS NULL THEN 1 ELSE 0 END)`,
      })
        .from(xeroAccountingTransactions)
        .where(and(
          eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
          tenantCondition,
        ));

      const recentWebhookEvents = await db.select({
        id: xeroWebhookEvents.id,
        eventCategory: xeroWebhookEvents.eventCategory,
        eventType: xeroWebhookEvents.eventType,
        resourceId: xeroWebhookEvents.resourceId,
        status: xeroWebhookEvents.status,
        errorMessage: xeroWebhookEvents.errorMessage,
        receivedAt: xeroWebhookEvents.receivedAt,
        processedAt: xeroWebhookEvents.processedAt,
      })
        .from(xeroWebhookEvents)
        .where(and(
          eq(xeroWebhookEvents.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroWebhookEvents.appTenantId, ctx.tenant.id),
        ))
        .orderBy(desc(xeroWebhookEvents.receivedAt))
        .limit(8);

      const recentSyncLogs = await db.select({
        id: xeroSyncLogs.id,
        syncType: xeroSyncLogs.syncType,
        status: xeroSyncLogs.status,
        itemsProcessed: xeroSyncLogs.itemsProcessed,
        itemsFailed: xeroSyncLogs.itemsFailed,
        errorMessage: xeroSyncLogs.errorMessage,
        startedAt: xeroSyncLogs.startedAt,
        completedAt: xeroSyncLogs.completedAt,
      })
        .from(xeroSyncLogs)
        .where(eq(xeroSyncLogs.xeroConnectionId, auth.xeroConnectionId))
        .orderBy(desc(xeroSyncLogs.startedAt))
        .limit(6);

      const [lastCostImport] = await db.select()
        .from(xeroCostImportBatches)
        .where(eq(xeroCostImportBatches.appTenantId, ctx.tenant.id))
        .orderBy(desc(xeroCostImportBatches.createdAt))
        .limit(1);

      const [lastBudgetImport] = await db.select()
        .from(xeroBudgetImportBatches)
        .where(eq(xeroBudgetImportBatches.appTenantId, ctx.tenant.id))
        .orderBy(desc(xeroBudgetImportBatches.createdAt))
        .limit(1);

      return {
        connected: true,
        totals: {
          rows: Number(totals?.rows || 0),
          unmatched: Number(totals?.unmatched || 0),
          ignored: Number(totals?.ignored || 0),
          costs: Number(totals?.costs || 0),
          revenue: Number(totals?.revenue || 0),
        },
        recentWebhookEvents,
        recentSyncLogs,
        lastCostImport: lastCostImport || null,
        lastBudgetImport: lastBudgetImport || null,
      };
    }),

  syncAll: tenantProcedure
    .input(z.object({
      maxPages: z.number().min(1).max(100).default(50),
      includeUnmatched: z.boolean().default(true),
      incremental: z.boolean().default(true),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }

      const mappings = await getTenantMappedProjects(db, ctx, auth.xeroConnectionId);
      if (!mappings.length) {
        await db.insert(xeroSyncLogs).values({
          xeroConnectionId: auth.xeroConnectionId,
          syncType: "financials",
          status: "completed",
          itemsProcessed: 0,
          itemsFailed: 0,
          errorMessage: "No construction Xero project mappings found for this tenant/entity.",
          completedAt: new Date(),
        });
        return {
          success: true,
          warning: "No construction Xero project mappings found for this tenant/entity.",
          imported: 0,
          unmatched: 0,
          affectedMappings: 0,
          rolledUp: [] as any[],
          fetchErrors: [] as string[],
          fetched: { invoices: 0, bills: 0, bankTransactions: 0, creditNotes: 0, total: 0 },
        };
      }

      const [syncLog] = await db.insert(xeroSyncLogs).values({
        xeroConnectionId: auth.xeroConnectionId,
        syncType: "financials",
        status: "running",
        totalItems: mappings.length,
      });
      const syncLogId = syncLog.insertId;

      try {
        const modifiedSince = input?.incremental === false
          ? null
          : await getPreviousCompletedFinancialSyncDate(db, auth.xeroConnectionId);
        const result = await syncXeroAccountingTransactionsForMappings(db, auth, mappings, {
          appTenantId: ctx.tenant.id,
          maxPages: input?.maxPages || 50,
          includeUnmatched: input?.includeUnmatched ?? true,
          modifiedSince,
        });

        const warning = result.fetched.total > 0 && result.affectedMappings === 0
          ? `Fetched ${result.fetched.total} Xero documents but no transaction lines matched construction jobs. Check Xero references/tracking/client numbers.`
          : result.fetchErrors.length
            ? result.fetchErrors.join("; ")
            : null;

        await db.update(xeroSyncLogs)
          .set({
            status: "completed",
            itemsProcessed: result.imported,
            itemsFailed: result.fetchErrors.length,
            errorMessage: warning || (modifiedSince ? `Incremental sync since ${modifiedSince.toISOString()}` : null),
            syncCursor: mappings.length,
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));

        return { success: true, warning, ...result };
      } catch (err: any) {
        await db.update(xeroSyncLogs)
          .set({
            status: "failed",
            errorMessage: err?.message || "Xero accounting sync failed",
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));
        throw err;
      }
    }),

  syncJob: tenantProcedure
    .input(z.object({
      jobId: z.number(),
      maxPages: z.number().min(1).max(100).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }

      const mapping = await requireMappedJob(db, ctx, auth.xeroConnectionId, input.jobId);
      const [syncLog] = await db.insert(xeroSyncLogs).values({
        xeroConnectionId: auth.xeroConnectionId,
        syncType: "financials",
        status: "running",
        totalItems: 1,
      });
      const syncLogId = syncLog.insertId;

      try {
        const result = await syncXeroAccountingTransactionsForMappings(db, auth, [mapping], {
          appTenantId: ctx.tenant.id,
          maxPages: input.maxPages,
          includeUnmatched: false,
        });

        const warning = result.fetched.total > 0 && result.affectedMappings === 0
          ? `Fetched ${result.fetched.total} Xero documents but none matched this job.`
          : result.fetchErrors.length
            ? result.fetchErrors.join("; ")
            : null;

        await db.update(xeroSyncLogs)
          .set({
            status: "completed",
            itemsProcessed: result.imported,
            itemsFailed: result.fetchErrors.length,
            errorMessage: warning,
            syncCursor: 1,
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));

        return { success: true, warning, ...result };
      } catch (err: any) {
        await db.update(xeroSyncLogs)
          .set({
            status: "failed",
            errorMessage: err?.message || "Xero job accounting sync failed",
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));
        throw err;
      }
    }),

  rollupJob: tenantProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }
      const mapping = await requireMappedJob(db, ctx, auth.xeroConnectionId, input.jobId);
      const result = await rollupXeroAccountingTransactionsForMapping(db, mapping);
      return { success: true, ...result };
    }),

  getJobTransactions: tenantProcedure
    .input(z.object({
      jobId: z.number(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [job] = await db.select({ id: constructionJobs.id })
        .from(constructionJobs)
        .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, input.jobId))))
        .limit(1);
      if (!job) return [];
      return getXeroAccountingRowsForJob(db, input.jobId, input.limit);
    }),

  getJobSummary: tenantProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [job] = await db.select({ id: constructionJobs.id })
        .from(constructionJobs)
        .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, input.jobId))))
        .limit(1);
      if (!job) return null;
      return getXeroAccountingSummaryForJob(db, input.jobId);
    }),

  getUnmatched: tenantProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      sourceType: z.enum(["invoice", "bill", "bank_transaction", "credit_note"]).optional(),
      search: z.string().trim().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) return { rows: [], total: 0, sourceCounts: [] as any[] };

      const baseConditions = [
        eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
        isNull(xeroAccountingTransactions.mappingId),
        eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id),
        isNull(xeroAccountingTransactions.ignoredAt),
      ];
      const search = input?.search?.trim();
      if (search) {
        const pattern = `%${search}%`;
        baseConditions.push(or(
          like(xeroAccountingTransactions.transactionNumber, pattern),
          like(xeroAccountingTransactions.reference, pattern),
          like(xeroAccountingTransactions.description, pattern),
          like(xeroAccountingTransactions.contactName, pattern),
          like(xeroAccountingTransactions.trackingOptionName, pattern),
          sql`CAST(${xeroAccountingTransactions.raw} AS CHAR) LIKE ${pattern}`,
        ) as any);
      }

      const sourceCounts = await db.select({
        sourceType: xeroAccountingTransactions.sourceType,
        count: sql<number>`COUNT(*)`,
      })
        .from(xeroAccountingTransactions)
        .where(and(...baseConditions))
        .groupBy(xeroAccountingTransactions.sourceType);

      const rowConditions = [...baseConditions];
      if (input?.sourceType) {
        rowConditions.push(eq(xeroAccountingTransactions.sourceType, input.sourceType));
      }

      const [totalRow] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(xeroAccountingTransactions)
        .where(and(...rowConditions));

      const rows = await db.select().from(xeroAccountingTransactions)
        .where(and(...rowConditions))
        .orderBy(desc(xeroAccountingTransactions.syncedAt))
        .limit(input?.limit || 50)
        .offset(input?.offset || 0);

      const mappings = await db.select({
        id: xeroProjectMappings.id,
        jobId: xeroProjectMappings.jobId,
        xeroProjectName: xeroProjectMappings.xeroProjectName,
        xeroProjectStatus: xeroProjectMappings.xeroProjectStatus,
        xeroContactId: xeroProjectMappings.xeroContactId,
        quoteNumber: constructionJobs.quoteNumber,
        clientNumber: crmLeads.clientNumber,
        constructionJobNumber: crmLeads.constructionJobNumber,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        jobStatus: constructionJobs.status,
      })
        .from(xeroProjectMappings)
        .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
        .leftJoin(crmLeads, and(
          eq(constructionJobs.leadId, crmLeads.id),
          eq(crmLeads.tenantId, ctx.tenant.id),
        ))
        .where(and(
          eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
          ...jobTenantConditions(ctx),
        ));

      return {
        rows: rows.map((row: any) => {
          const suggestions = mappings
            .map((mapping: any) => {
              const match = scoreUnmatchedCandidate(row, mapping);
              return { ...mapping, score: match.score, reasons: match.reasons };
            })
            .filter((mapping: any) => mapping.score > 0)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 5);

          return { ...row, suggestions };
        }),
        total: Number(totalRow?.count || 0),
        sourceCounts: sourceCounts.map((row: any) => ({
          sourceType: row.sourceType,
          count: Number(row.count || 0),
        })),
      };
    }),

  assignUnmatched: tenantProcedure
    .input(z.object({
      transactionId: z.number(),
      mappingId: z.number(),
      applyToDocument: z.boolean().default(true),
      costCategory: z.enum(["materials", "labour", "other", "revenue"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }

      const [transaction] = await db.select().from(xeroAccountingTransactions)
        .where(and(
          eq(xeroAccountingTransactions.id, input.transactionId),
          eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id),
        ))
        .limit(1);
      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Xero transaction line not found" });
      }

      const [mapping] = await getTenantMappedProjects(db, ctx, auth.xeroConnectionId)
        .then((rows: any[]) => rows.filter((row) => row.id === input.mappingId));
      if (!mapping) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Xero project mapping not found for this tenant" });
      }

      const rowsToUpdate = input.applyToDocument
        ? await db.select({
            id: xeroAccountingTransactions.id,
            mappingId: xeroAccountingTransactions.mappingId,
          })
            .from(xeroAccountingTransactions)
            .where(and(
              eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
              eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id),
              eq(xeroAccountingTransactions.xeroTransactionId, transaction.xeroTransactionId),
              isNull(xeroAccountingTransactions.mappingId),
              isNull(xeroAccountingTransactions.ignoredAt),
            ))
        : [{ id: transaction.id, mappingId: transaction.mappingId }];

      const ids = rowsToUpdate.map((row: any) => row.id);
      if (!ids.length) {
        return { success: true, updatedRows: 0, rollup: await rollupXeroAccountingTransactionsForMapping(db, mapping) };
      }

      const setValues: Record<string, any> = {
        mappingId: mapping.id,
        jobId: mapping.jobId,
        matchMethod: "manual",
        ignoredAt: null,
        ignoredByUserId: null,
        ignoreReason: null,
        updatedAt: new Date(),
      };
      if (input.costCategory) setValues.costCategory = input.costCategory;

      for (const id of ids) {
        await db.update(xeroAccountingTransactions)
          .set(setValues)
          .where(eq(xeroAccountingTransactions.id, id));
      }

      const previousMappingIds = Array.from(
        new Set(
          rowsToUpdate
            .map((row: any) => row.mappingId)
            .filter((id: number | null) => id && id !== mapping.id)
        )
      );
      const rollup = await rollupXeroAccountingTransactionsForMapping(db, mapping);

      if (previousMappingIds.length) {
        const previousMappings = await db.select().from(xeroProjectMappings)
          .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));
        for (const previous of previousMappings.filter((row: any) => previousMappingIds.includes(row.id))) {
          await rollupXeroAccountingTransactionsForMapping(db, previous);
        }
      }

      return {
        success: true,
        updatedRows: ids.length,
        jobId: mapping.jobId,
        mappingId: mapping.id,
        rollup,
      };
    }),

  ignoreUnmatched: tenantProcedure
    .input(z.object({
      transactionId: z.number(),
      applyToDocument: z.boolean().default(true),
      reason: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id, moduleKey: "construction" });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }

      const [transaction] = await db.select().from(xeroAccountingTransactions)
        .where(and(
          eq(xeroAccountingTransactions.id, input.transactionId),
          eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id),
          isNull(xeroAccountingTransactions.mappingId),
          isNull(xeroAccountingTransactions.ignoredAt),
        ))
        .limit(1);
      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Unmatched Xero transaction line not found" });
      }

      const rowsToUpdate = input.applyToDocument
        ? await db.select({ id: xeroAccountingTransactions.id })
          .from(xeroAccountingTransactions)
          .where(and(
            eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
            eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id),
            eq(xeroAccountingTransactions.xeroTransactionId, transaction.xeroTransactionId),
            isNull(xeroAccountingTransactions.mappingId),
            isNull(xeroAccountingTransactions.ignoredAt),
          ))
        : [{ id: transaction.id }];

      const ids = rowsToUpdate.map((row: any) => row.id);
      const setValues = {
        ignoredAt: new Date(),
        ignoredByUserId: (ctx as any).user?.id || null,
        ignoreReason: input.reason?.trim() || "Ignored manually",
        updatedAt: new Date(),
      };

      for (const id of ids) {
        await db.update(xeroAccountingTransactions)
          .set(setValues)
          .where(eq(xeroAccountingTransactions.id, id));
      }

      return { success: true, ignoredRows: ids.length };
    }),
});
