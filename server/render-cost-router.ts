import { z } from "zod";
import { router, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { renderCostLogs, users, patioPlanner } from "../drizzle/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { getDefaultRenderPricing, getRenderCostAud, type RenderPricingSettings } from "./global-settings-router";
import { getTenantAppSetting } from "./tenant-settings-store";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

// ─── Fetch Pricing from DB ──────────────────────────────────────────────────
async function fetchRenderPricing(tenantId?: number | null): Promise<RenderPricingSettings> {
  const stored = await getTenantAppSetting<Partial<RenderPricingSettings>>(tenantId, "renderPricing");
  return { ...getDefaultRenderPricing(), ...stored };
}

function renderCostConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, renderCostLogs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

// ─── Cost Logging Helper ────────────────────────────────────────────────────
export async function logRenderCost(params: {
  userId: number;
  projectId?: number;
  renderMode: "full" | "quick" | "batch";
  stylePreset?: string;
  renderCount?: number;
  tenantId?: number | null;
}) {
  const db = await getDb();
  if (!db) return;

  const pricing = await fetchRenderPricing(params.tenantId);
  const perRenderCost = getRenderCostAud(params.renderMode, pricing);
  const totalCost = perRenderCost * (params.renderCount || 1);

  await db.insert(renderCostLogs).values({
    tenantId: params.tenantId ?? null,
    userId: params.userId,
    projectId: params.projectId ?? null,
    renderMode: params.renderMode,
    stylePreset: params.stylePreset ?? null,
    creditCost: totalCost.toFixed(4), // stores AUD cost
    renderCount: params.renderCount || 1,
  });
}

// ─── Analytics Router ───────────────────────────────────────────────────────
export const renderCostRouter = router({
  /**
   * Get cost summary KPIs (total credits, render count, budget usage).
   */
  summary: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(), // ISO date
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        const defaultPricing = getDefaultRenderPricing();
        return {
          totalCostAud: 0,
          totalRenders: 0,
          avgCostPerRender: 0,
          totalFullRenders: 0,
          totalQuickRenders: 0,
          totalBatchRenders: 0,
          monthlyCostAud: 0,
          monthlyBudgetAud: defaultPricing.monthlyBudgetAud,
          budgetUsedPercent: 0,
          uniqueAdvisers: 0,
          uniqueProjects: 0,
          pricing: defaultPricing,
        };
      }

      const conditions = renderCostConditions(ctx);
      if (input?.startDate) conditions.push(gte(renderCostLogs.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(renderCostLogs.createdAt, new Date(input.endDate + "T23:59:59.999Z")));

      const where = and(...conditions);

      const [result] = await db
        .select({
          totalCredits: sql<string>`COALESCE(SUM(${renderCostLogs.creditCost}), 0)`,
          totalRenders: sql<number>`COALESCE(SUM(${renderCostLogs.renderCount}), 0)`,
          totalFullRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'full' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          totalQuickRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'quick' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          totalBatchRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'batch' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          uniqueAdvisers: sql<number>`COUNT(DISTINCT ${renderCostLogs.userId})`,
          uniqueProjects: sql<number>`COUNT(DISTINCT ${renderCostLogs.projectId})`,
        })
        .from(renderCostLogs)
        .where(where);

      // Get current month credits
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [monthResult] = await db
        .select({
          monthlyCredits: sql<string>`COALESCE(SUM(${renderCostLogs.creditCost}), 0)`,
        })
        .from(renderCostLogs)
        .where(and(...renderCostConditions(ctx, gte(renderCostLogs.createdAt, monthStart))));

      const totalCostAud = parseFloat(result.totalCredits) || 0;
      const totalRenders = Number(result.totalRenders) || 0;
      const monthlyCostAud = parseFloat(monthResult.monthlyCredits) || 0;

      // Fetch pricing settings for budget
      const pricing = await fetchRenderPricing(ctx.tenant?.id);

      return {
        totalCostAud,
        totalRenders,
        avgCostPerRender: totalRenders > 0 ? totalCostAud / totalRenders : 0,
        totalFullRenders: Number(result.totalFullRenders) || 0,
        totalQuickRenders: Number(result.totalQuickRenders) || 0,
        totalBatchRenders: Number(result.totalBatchRenders) || 0,
        monthlyCostAud,
        monthlyBudgetAud: pricing.monthlyBudgetAud,
        budgetUsedPercent: pricing.monthlyBudgetAud > 0 ? (monthlyCostAud / pricing.monthlyBudgetAud) * 100 : 0,
        uniqueAdvisers: Number(result.uniqueAdvisers) || 0,
        uniqueProjects: Number(result.uniqueProjects) || 0,
        pricing,
      };
    }),

  /**
   * Get cost breakdown by adviser.
   */
  byAdviser: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = renderCostConditions(ctx);
      if (input?.startDate) conditions.push(gte(renderCostLogs.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(renderCostLogs.createdAt, new Date(input.endDate + "T23:59:59.999Z")));

      const where = and(...conditions);

      const rows = await db
        .select({
          userId: renderCostLogs.userId,
          userName: users.name,
          totalCredits: sql<string>`COALESCE(SUM(${renderCostLogs.creditCost}), 0)`,
          totalRenders: sql<number>`COALESCE(SUM(${renderCostLogs.renderCount}), 0)`,
          fullRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'full' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          quickRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'quick' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          batchRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'batch' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          lastRenderAt: sql<Date>`MAX(${renderCostLogs.createdAt})`,
        })
        .from(renderCostLogs)
        .leftJoin(users, eq(renderCostLogs.userId, users.id))
        .where(where)
        .groupBy(renderCostLogs.userId, users.name)
        .orderBy(sql`SUM(${renderCostLogs.creditCost}) DESC`);

      return rows.map((r) => ({
        userId: r.userId,
        userName: r.userName || "Unknown",
        totalCostAud: parseFloat(r.totalCredits) || 0,
        totalRenders: Number(r.totalRenders) || 0,
        fullRenders: Number(r.fullRenders) || 0,
        quickRenders: Number(r.quickRenders) || 0,
        batchRenders: Number(r.batchRenders) || 0,
        avgCostPerRender: Number(r.totalRenders) > 0 ? (parseFloat(r.totalCredits) || 0) / Number(r.totalRenders) : 0,
        lastRenderAt: r.lastRenderAt,
      }));
    }),

  /**
   * Get cost breakdown by project.
   */
  byProject: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = renderCostConditions(ctx);
      if (input?.startDate) conditions.push(gte(renderCostLogs.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(renderCostLogs.createdAt, new Date(input.endDate + "T23:59:59.999Z")));

      const where = and(...conditions);

      const rows = await db
        .select({
          projectId: renderCostLogs.projectId,
          projectName: patioPlanner.name,
          totalCredits: sql<string>`COALESCE(SUM(${renderCostLogs.creditCost}), 0)`,
          totalRenders: sql<number>`COALESCE(SUM(${renderCostLogs.renderCount}), 0)`,
          lastRenderAt: sql<Date>`MAX(${renderCostLogs.createdAt})`,
        })
        .from(renderCostLogs)
        .leftJoin(patioPlanner, eq(renderCostLogs.projectId, patioPlanner.id))
        .where(where)
        .groupBy(renderCostLogs.projectId, patioPlanner.name)
        .orderBy(sql`SUM(${renderCostLogs.creditCost}) DESC`);

      return rows.map((r) => ({
        projectId: r.projectId,
        projectName: r.projectName || `Project #${r.projectId}`,
        totalCostAud: parseFloat(r.totalCredits) || 0,
        totalRenders: Number(r.totalRenders) || 0,
        lastRenderAt: r.lastRenderAt,
      }));
    }),

  /**
   * Get monthly trend data (last 12 months).
   */
  monthlyTrend: adminProcedure
    .input(
      z.object({
        months: z.number().min(3).max(24).default(12),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const monthsBack = input?.months || 12;
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsBack);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      const rows = await db
        .select({
          month: sql<string>`DATE_FORMAT(${renderCostLogs.createdAt}, '%Y-%m')`,
          totalCredits: sql<string>`COALESCE(SUM(${renderCostLogs.creditCost}), 0)`,
          totalRenders: sql<number>`COALESCE(SUM(${renderCostLogs.renderCount}), 0)`,
          fullRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'full' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          quickRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'quick' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
          batchRenders: sql<number>`COALESCE(SUM(CASE WHEN ${renderCostLogs.renderMode} = 'batch' THEN ${renderCostLogs.renderCount} ELSE 0 END), 0)`,
        })
        .from(renderCostLogs)
        .where(and(...renderCostConditions(ctx, gte(renderCostLogs.createdAt, startDate))))
        .groupBy(sql`DATE_FORMAT(${renderCostLogs.createdAt}, '%Y-%m')`)
        .orderBy(sql`DATE_FORMAT(${renderCostLogs.createdAt}, '%Y-%m')`);

      return rows.map((r) => ({
        month: r.month,
        totalCostAud: parseFloat(r.totalCredits) || 0,
        totalRenders: Number(r.totalRenders) || 0,
        fullRenders: Number(r.fullRenders) || 0,
        quickRenders: Number(r.quickRenders) || 0,
        batchRenders: Number(r.batchRenders) || 0,
      }));
    }),

  /**
   * Get recent render logs (paginated).
   */
  recentLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { logs: [], total: 0 };

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(renderCostLogs)
        .where(and(...renderCostConditions(ctx)));

      const logs = await db
        .select({
          id: renderCostLogs.id,
          userId: renderCostLogs.userId,
          userName: users.name,
          projectId: renderCostLogs.projectId,
          projectName: patioPlanner.name,
          renderMode: renderCostLogs.renderMode,
          stylePreset: renderCostLogs.stylePreset,
          creditCost: renderCostLogs.creditCost,
          renderCount: renderCostLogs.renderCount,
          createdAt: renderCostLogs.createdAt,
        })
        .from(renderCostLogs)
        .leftJoin(users, eq(renderCostLogs.userId, users.id))
        .leftJoin(patioPlanner, eq(renderCostLogs.projectId, patioPlanner.id))
        .where(and(...renderCostConditions(ctx)))
        .orderBy(desc(renderCostLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        logs: logs.map((l) => ({
          ...l,
          userName: l.userName || "Unknown",
          projectName: l.projectName || `Project #${l.projectId}`,
          costAud: parseFloat(l.creditCost as any) || 0,
        })),
        total: Number(countResult.count) || 0,
      };
    }),
});
