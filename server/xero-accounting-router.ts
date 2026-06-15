import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs,
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

export const xeroAccountingRouter = router({
  getSyncHealth: tenantProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id });
      if (!auth) {
        return {
          connected: false,
          totals: { rows: 0, unmatched: 0, costs: 0, revenue: 0 },
          recentWebhookEvents: [] as any[],
          recentSyncLogs: [] as any[],
          lastCostImport: null as any,
          lastBudgetImport: null as any,
        };
      }

      const tenantCondition = eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id);
      const [totals] = await db.select({
        rows: sql<number>`COUNT(*)`,
        unmatched: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.mappingId} IS NULL THEN 1 ELSE 0 END)`,
        costs: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.isCost} = 1 THEN 1 ELSE 0 END)`,
        revenue: sql<number>`SUM(CASE WHEN ${xeroAccountingTransactions.isRevenue} = 1 THEN 1 ELSE 0 END)`,
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
      includeUnmatched: z.boolean().default(false),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }

      const mappings = await getTenantMappedProjects(db, ctx, auth.xeroConnectionId);
      if (!mappings.length) {
        return { success: true, imported: 0, unmatched: 0, affectedMappings: 0, rolledUp: [] as any[] };
      }

      const result = await syncXeroAccountingTransactionsForMappings(db, auth, mappings, {
        appTenantId: ctx.tenant.id,
        maxPages: input?.maxPages || 50,
        includeUnmatched: input?.includeUnmatched || false,
      });

      return { success: true, ...result };
    }),

  syncJob: tenantProcedure
    .input(z.object({
      jobId: z.number(),
      maxPages: z.number().min(1).max(100).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id });
      if (!auth) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      }

      const mapping = await requireMappedJob(db, ctx, auth.xeroConnectionId, input.jobId);
      const result = await syncXeroAccountingTransactionsForMappings(db, auth, [mapping], {
        appTenantId: ctx.tenant.id,
        maxPages: input.maxPages,
        includeUnmatched: false,
      });

      return { success: true, ...result };
    }),

  rollupJob: tenantProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id });
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
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant.id });
      if (!auth) return [];
      return db.select().from(xeroAccountingTransactions)
        .where(and(
          eq(xeroAccountingTransactions.xeroConnectionId, auth.xeroConnectionId),
          isNull(xeroAccountingTransactions.mappingId),
          eq(xeroAccountingTransactions.appTenantId, ctx.tenant.id),
        ))
        .orderBy(desc(xeroAccountingTransactions.syncedAt))
        .limit(input?.limit || 50);
    }),
});
