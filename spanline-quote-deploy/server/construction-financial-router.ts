import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { constructionJobs, constructionJobFinancials, constructionProgress } from "../drizzle/schema";
import { eq, and, sql, desc, like, gte, lte, inArray } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

const fyFilterSchema = z.object({
  branch: z.string().optional(),
  constructionManagerId: z.number().optional(),
  designAdviserId: z.number().optional(),
  roofStyle: z.string().optional(),
  postcode: z.string().optional(),
  fyStart: z.string().optional(), // ISO date string e.g. "2025-07-01"
  fyEnd: z.string().optional(),   // ISO date string e.g. "2026-06-30"
  excludeCompleted: z.boolean().optional(), // default true — exclude completed jobs unless explicitly included
}).optional();

export const constructionFinancialRouter = router({
  // Summary statistics with optional filters + FY date range
  summary: protectedProcedure
    .input(fyFilterSchema)
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      // Build conditions for filtering financials
      const conditions: any[] = [];
      if (input?.branch) conditions.push(eq(constructionJobFinancials.branch, input.branch));
      if (input?.constructionManagerId) conditions.push(eq(constructionJobFinancials.constructionManagerId, input.constructionManagerId));
      if (input?.roofStyle) conditions.push(eq(constructionJobFinancials.roofStyle, input.roofStyle));
      if (input?.postcode) conditions.push(like(constructionJobFinancials.postcode, `${input.postcode}%`));

      // FY date filter on jobs createdAt (join to filter financials by job creation date)
      // We'll filter the jobs first then match financials
      const jobConditions: any[] = [];
      if (input?.excludeCompleted !== false) {
        jobConditions.push(sql`${constructionJobs.status} != 'completed'`);
      }
      if (input?.fyStart) jobConditions.push(gte(constructionJobs.createdAt, new Date(input.fyStart)));
      if (input?.fyEnd) jobConditions.push(lte(constructionJobs.createdAt, new Date(input.fyEnd + "T23:59:59.999Z")));
      if (input?.designAdviserId) jobConditions.push(eq(constructionJobs.designAdviserId, input.designAdviserId));
      const scopedJobConditions = jobTenantConditions(ctx, ...jobConditions);
      const financialWhere = and(...conditions, ...scopedJobConditions);

      // Get financial aggregates — margin = (invoiced - actual costs) / invoiced
      const [financialAgg] = await db.select({
        count: sql<number>`count(*)`,
        totalRevenue: sql<string>`COALESCE(SUM(COALESCE(${constructionJobFinancials.xeroContractValue}, ${constructionJobFinancials.contractValue}, 0)), 0)`,
        totalActualCosts: sql<string>`COALESCE(SUM(${constructionJobFinancials.xeroTotalCost}), 0)`,
        totalInvoiced: sql<string>`COALESCE(SUM(COALESCE(${constructionJobFinancials.xeroInvoicedAmount}, ${constructionJobFinancials.invoicedAmount}, 0)), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(COALESCE(${constructionJobFinancials.xeroPaidAmount}, ${constructionJobFinancials.paidAmount}, 0)), 0)`,
      }).from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(financialWhere);

      // Get total projects and completion rate from jobs table (within FY)
      const [jobAgg] = await db.select({
        total: sql<number>`count(*)`,
        completed: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
      }).from(constructionJobs).where(and(...scopedJobConditions));

      const totalProjects = Number(jobAgg?.total || 0);
      const completedProjects = Number(jobAgg?.completed || 0);

      const totalInvoiced = parseFloat(String(financialAgg?.totalInvoiced || "0"));
      const totalActualCosts = parseFloat(String(financialAgg?.totalActualCosts || "0"));
      const totalMargin = totalInvoiced - totalActualCosts;
      const avgMarginPercent = totalInvoiced > 0 ? (totalMargin / totalInvoiced) * 100 : 0;

      return {
        totalProjects,
        totalRevenue: parseFloat(String(financialAgg?.totalRevenue || "0")),
        totalCost: totalActualCosts,
        totalMargin,
        avgMarginPercent: parseFloat(avgMarginPercent.toFixed(1)),
        completionRate: totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0,
        totalInvoiced,
        totalPaid: parseFloat(String(financialAgg?.totalPaid || "0")),
      };
    }),

  // Detailed project list with financials + FY filter
  projectList: protectedProcedure
    .input(z.object({
      branch: z.string().optional(),
      constructionManagerId: z.number().optional(),
      designAdviserId: z.number().optional(),
      roofStyle: z.string().optional(),
      postcode: z.string().optional(),
      fyStart: z.string().optional(),
      fyEnd: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      excludeCompleted: z.boolean().optional(), // default true
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      // Build job-level conditions (FY filter)
      const jobConditions: any[] = [];
      if (input?.excludeCompleted !== false) {
        jobConditions.push(sql`${constructionJobs.status} != 'completed'`);
      }
      if (input?.fyStart) jobConditions.push(gte(constructionJobs.createdAt, new Date(input.fyStart)));
      if (input?.fyEnd) jobConditions.push(lte(constructionJobs.createdAt, new Date(input.fyEnd + "T23:59:59.999Z")));
      if (input?.designAdviserId) jobConditions.push(eq(constructionJobs.designAdviserId, input.designAdviserId));
      const scopedJobConditions = jobTenantConditions(ctx, ...jobConditions);

      // Join jobs with financials
      const jobs = await db.select().from(constructionJobs)
        .where(and(...scopedJobConditions))
        .orderBy(desc(constructionJobs.updatedAt))
        .limit(input?.limit || 100)
        .offset(input?.offset || 0);

      if (jobs.length === 0) return [];

      const jobIds = jobs.map(j => j.id);
      const financials = await db.select().from(constructionJobFinancials)
        .where(inArray(constructionJobFinancials.jobId, jobIds));

      const financialMap = Object.fromEntries(financials.map(f => [f.jobId, f]));

      // Get progress summary
      const progress = await db.select().from(constructionProgress)
        .where(inArray(constructionProgress.jobId, jobIds));

      const progressByJob: Record<number, { completed: number; total: number }> = {};
      for (const p of progress) {
        if (!progressByJob[p.jobId]) progressByJob[p.jobId] = { completed: 0, total: 0 };
        progressByJob[p.jobId].total++;
        if (p.status === "completed") progressByJob[p.jobId].completed++;
      }

      let result = jobs.map(job => {
        const fin = financialMap[job.id];
        const prog = progressByJob[job.id] || { completed: 0, total: 0 };
        return {
          id: job.id,
          clientName: job.clientName,
          siteAddress: job.siteAddress,
          quoteNumber: job.quoteNumber,
          status: job.status,
          priority: job.priority,
          designAdviserName: job.designAdviserName,
          scheduledStart: job.scheduledStart,
          scheduledEnd: job.scheduledEnd,
          contractValue: parseFloat(String(fin?.xeroContractValue || fin?.contractValue || "0")),
          totalCost: parseFloat(String(fin?.xeroTotalCost || "0")),
          margin: (() => {
            const inv = parseFloat(String(fin?.xeroInvoicedAmount || fin?.invoicedAmount || "0"));
            const cost = parseFloat(String(fin?.xeroTotalCost || "0"));
            return inv - cost;
          })(),
          marginPercent: (() => {
            const inv = parseFloat(String(fin?.xeroInvoicedAmount || fin?.invoicedAmount || "0"));
            const cost = parseFloat(String(fin?.xeroTotalCost || "0"));
            return inv > 0 ? ((inv - cost) / inv) * 100 : 0;
          })(),
          invoicedAmount: parseFloat(String(fin?.xeroInvoicedAmount || fin?.invoicedAmount || "0")),
          paidAmount: parseFloat(String(fin?.xeroPaidAmount || fin?.paidAmount || "0")),
          branch: fin?.branch || "",
          roofStyle: fin?.roofStyle || "",
          postcode: fin?.postcode || "",
          constructionManagerName: fin?.constructionManagerName || "",
          progressPercent: (() => {
            const cv = parseFloat(String(fin?.xeroContractValue || fin?.contractValue || "0"));
            const pa = parseFloat(String(fin?.xeroPaidAmount || fin?.paidAmount || "0"));
            return cv > 0 ? Math.round((pa / cv) * 100) : 0;
          })(),
          xeroContractValue: parseFloat(String(fin?.xeroContractValue || "0")),
          xeroTotalCost: parseFloat(String(fin?.xeroTotalCost || "0")),
          xeroInvoicedAmount: parseFloat(String(fin?.xeroInvoicedAmount || "0")),
          xeroPaidAmount: parseFloat(String(fin?.xeroPaidAmount || "0")),

          actualStart: job.actualStart,
          actualEnd: job.actualEnd,
        };
      });

      // Apply filters on the enriched data
      if (input?.branch) result = result.filter(r => r.branch === input.branch);
      if (input?.roofStyle) result = result.filter(r => r.roofStyle === input.roofStyle);
      if (input?.postcode) result = result.filter(r => r.postcode.startsWith(input.postcode!));
      return result;
    }),

  // Monthly job volume trend with optional FY date range
  jobVolumeTrend: protectedProcedure
    .input(z.object({
      fyStart: z.string().optional(),
      fyEnd: z.string().optional(),
      excludeCompleted: z.boolean().optional(), // default true
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      if (input?.fyStart && input?.fyEnd) {
        conditions.push(gte(constructionJobs.createdAt, new Date(input.fyStart)));
        conditions.push(lte(constructionJobs.createdAt, new Date(input.fyEnd + "T23:59:59.999Z")));
      } else {
        conditions.push(sql`${constructionJobs.createdAt} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`);
      }
      if (input?.excludeCompleted !== false) {
        conditions.push(sql`${constructionJobs.status} != 'completed'`);
      }

      const monthExpr = sql<string>`DATE_FORMAT(${constructionJobs.createdAt}, '%Y-%m')`;
      const rows = await db.select({
        month: monthExpr,
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
        inProgress: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'in_progress' THEN 1 ELSE 0 END)`,
      }).from(constructionJobs)
        .where(and(...jobTenantConditions(ctx, ...conditions)))
        .groupBy(monthExpr)
        .orderBy(monthExpr);

      return rows.map((r: any) => ({
        month: String(r.month || ""),
        total: Number(r.total || 0),
        completed: Number(r.completed || 0),
        inProgress: Number(r.inProgress || 0),
      }));
    }),

  // Monthly revenue/cost/margin trend with optional FY date range
  financialTrend: protectedProcedure
    .input(z.object({
      fyStart: z.string().optional(),
      fyEnd: z.string().optional(),
      excludeCompleted: z.boolean().optional(), // default true
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      if (input?.fyStart && input?.fyEnd) {
        conditions.push(gte(constructionJobs.createdAt, new Date(input.fyStart)));
        conditions.push(lte(constructionJobs.createdAt, new Date(input.fyEnd + "T23:59:59.999Z")));
      } else {
        conditions.push(sql`${constructionJobs.createdAt} >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)`);
      }
      if (input?.excludeCompleted !== false) {
        conditions.push(sql`${constructionJobs.status} != 'completed'`);
      }

      const monthExpr = sql<string>`DATE_FORMAT(${constructionJobs.createdAt}, '%Y-%m')`;
      const rows = await db.select({
        month: monthExpr,
        revenue: sql<string>`COALESCE(SUM(COALESCE(${constructionJobFinancials.xeroContractValue}, ${constructionJobFinancials.contractValue}, 0)), 0)`,
        cost: sql<string>`COALESCE(SUM(${constructionJobFinancials.xeroTotalCost}), 0)`,
        invoiced: sql<string>`COALESCE(SUM(COALESCE(${constructionJobFinancials.xeroInvoicedAmount}, ${constructionJobFinancials.invoicedAmount}, 0)), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx, ...conditions)))
        .groupBy(monthExpr)
        .orderBy(monthExpr);

      return rows.map((r: any) => {
        const invoiced = parseFloat(String(r.invoiced || "0"));
        const cost = parseFloat(String(r.cost || "0"));
        const margin = invoiced - cost;
        const avgMarginPercent = invoiced > 0 ? (margin / invoiced) * 100 : 0;
        return {
          month: String(r.month || ""),
          revenue: parseFloat(String(r.revenue || "0")),
          cost,
          margin,
          avgMarginPercent: parseFloat(avgMarginPercent.toFixed(1)),
          count: Number(r.count || 0),
        };
      });
    }),

  // Job status distribution with optional FY date range
  statusDistribution: protectedProcedure
    .input(z.object({
      fyStart: z.string().optional(),
      fyEnd: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      if (input?.fyStart) conditions.push(gte(constructionJobs.createdAt, new Date(input.fyStart)));
      if (input?.fyEnd) conditions.push(lte(constructionJobs.createdAt, new Date(input.fyEnd + "T23:59:59.999Z")));

      const rows = await db.select({
        status: constructionJobs.status,
        count: sql<number>`COUNT(*)`,
      }).from(constructionJobs)
        .where(and(...jobTenantConditions(ctx, ...conditions)))
        .groupBy(constructionJobs.status);

      return rows.map(r => ({
        status: String(r.status),
        count: Number(r.count || 0),
      }));
    }),

  // Health summary with optional FY date range
  healthSummary: protectedProcedure
    .input(z.object({
      fyStart: z.string().optional(),
      fyEnd: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [
        sql`${constructionJobs.status} IN ('scheduled', 'in_progress')`,
      ];
      if (input?.fyStart) conditions.push(gte(constructionJobs.createdAt, new Date(input.fyStart)));
      if (input?.fyEnd) conditions.push(lte(constructionJobs.createdAt, new Date(input.fyEnd + "T23:59:59.999Z")));

      const rows = await db.select({
        xeroInvoicedAmount: constructionJobFinancials.xeroInvoicedAmount,
        xeroTotalCost: constructionJobFinancials.xeroTotalCost,
        invoicedAmount: constructionJobFinancials.invoicedAmount,
      }).from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx, ...conditions)));

      let green = 0, amber = 0, red = 0, unset = 0;
      for (const row of rows) {
        const inv = parseFloat(String(row.xeroInvoicedAmount || row.invoicedAmount || "0"));
        const cost = parseFloat(String(row.xeroTotalCost || "0"));
        if (inv === 0 && cost === 0) { unset++; continue; }
        const mp = inv > 0 ? ((inv - cost) / inv) * 100 : 0;
        if (mp >= 45) green++;
        else if (mp >= 35) amber++;
        else red++;
      }

      return { green, amber, red, unset };
    }),

  // Get filter options (unique branches, roof styles, postcodes, managers)
  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const tenantConditions = jobTenantConditions(ctx);

    const [branches, roofStyles, postcodes, managers] = await Promise.all([
      db.selectDistinct({ branch: constructionJobFinancials.branch })
        .from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(sql`${constructionJobFinancials.branch} IS NOT NULL AND ${constructionJobFinancials.branch} != ''`, ...tenantConditions)),
      db.selectDistinct({ roofStyle: constructionJobFinancials.roofStyle })
        .from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(sql`${constructionJobFinancials.roofStyle} IS NOT NULL AND ${constructionJobFinancials.roofStyle} != ''`, ...tenantConditions)),
      db.selectDistinct({ postcode: constructionJobFinancials.postcode })
        .from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(sql`${constructionJobFinancials.postcode} IS NOT NULL AND ${constructionJobFinancials.postcode} != ''`, ...tenantConditions)),
      db.selectDistinct({ id: constructionJobFinancials.constructionManagerId, name: constructionJobFinancials.constructionManagerName })
        .from(constructionJobFinancials)
        .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(sql`${constructionJobFinancials.constructionManagerId} IS NOT NULL`, ...tenantConditions)),
    ]);

    return {
      branches: branches.map(b => b.branch!),
      roofStyles: roofStyles.map(r => r.roofStyle!),
      postcodes: postcodes.map(p => p.postcode!),
      managers: managers.filter(m => m.id && m.name).map(m => ({ id: m.id!, name: m.name! })),
    };
  }),
});
