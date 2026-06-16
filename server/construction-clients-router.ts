import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs, constructionProgress, constructionAssignments,
  constructionInstallers, constructionJobFinancials, constructionKanbanTasks,
  quotes, crmLeads, crmBuildingAuthority,
} from "../drizzle/schema";
import { eq, desc, and, like, sql, or, inArray } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";
import { getXeroAccountingSummaryForJob } from "./xero-accounting-sync";

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

function installerTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select()
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

/**
 * Australian Financial Year helper.
 * FY runs 1 Jul → 30 Jun. "FY 2025-26" means 1 Jul 2025 – 30 Jun 2026.
 * We store the FY as the starting calendar year (e.g. 2025 for FY 2025-26).
 */
function fyDateRange(fyStartYear: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(fyStartYear, 6, 1)),      // 1 Jul
    to: new Date(Date.UTC(fyStartYear + 1, 6, 1)),    // 1 Jul next year (exclusive)
  };
}

function constructionJobDateExpr() {
  return sql<Date>`COALESCE(${constructionJobs.actualEnd}, ${constructionJobs.actualStart}, ${constructionJobs.scheduledEnd}, ${constructionJobs.scheduledStart}, ${constructionJobs.createdAt})`;
}

function appendProjectDateRange(conditions: any[], from: Date, to: Date) {
  const jobDate = constructionJobDateExpr();
  conditions.push(sql`${jobDate} >= ${from}`);
  conditions.push(sql`${jobDate} < ${to}`);
}

/** Get the current Australian FY start year. Before July → previous year. */
function currentFyStartYear(): number {
  const now = new Date();
  return now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear();
}

export const constructionClientsRouter = router({
  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const tenantConditions = jobTenantConditions(ctx);

    const [branchRows, leadSuburbRows, quoteSuburbRows, installers, managerRows] = await Promise.all([
      db.select({ branch: constructionJobFinancials.branch })
        .from(constructionJobs)
        .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(
          ...tenantConditions,
          sql`${constructionJobFinancials.branch} IS NOT NULL`,
          sql`${constructionJobFinancials.branch} != ''`,
        ))
        .groupBy(constructionJobFinancials.branch)
        .orderBy(constructionJobFinancials.branch),
      db.select({ suburb: crmLeads.suburb })
        .from(constructionJobs)
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .where(and(
          ...tenantConditions,
          sql`${crmLeads.suburb} IS NOT NULL`,
          sql`${crmLeads.suburb} != ''`,
        ))
        .groupBy(crmLeads.suburb)
        .orderBy(crmLeads.suburb),
      db.select({ suburb: quotes.suburb })
        .from(constructionJobs)
        .leftJoin(quotes, eq(constructionJobs.quoteId, quotes.id))
        .where(and(
          ...tenantConditions,
          sql`${quotes.suburb} IS NOT NULL`,
          sql`${quotes.suburb} != ''`,
        ))
        .groupBy(quotes.suburb)
        .orderBy(quotes.suburb),
      db.select({
        id: constructionInstallers.id,
        name: constructionInstallers.name,
        tradeType: constructionInstallers.tradeType,
      })
        .from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.active, true))))
        .orderBy(constructionInstallers.name),
      db.select({
        constructionManagerId: constructionJobFinancials.constructionManagerId,
        constructionManagerName: constructionJobFinancials.constructionManagerName,
        supervisorId: constructionJobs.supervisorId,
        supervisorName: constructionJobs.supervisorName,
      })
        .from(constructionJobs)
        .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .where(and(...tenantConditions))
        .groupBy(
          constructionJobFinancials.constructionManagerId,
          constructionJobFinancials.constructionManagerName,
          constructionJobs.supervisorId,
          constructionJobs.supervisorName,
        ),
    ]);

    const branches = Array.from(new Set(
      branchRows.map((row: any) => String(row.branch || "").trim()).filter(Boolean),
    )).sort((a, b) => a.localeCompare(b));

    const suburbs = Array.from(new Set(
      [...leadSuburbRows, ...quoteSuburbRows]
        .map((row: any) => String(row.suburb || "").trim())
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b));

    const managerMap = new Map<string, { id: number | null; name: string }>();
    for (const row of managerRows as any[]) {
      if (row.constructionManagerName) {
        const key = row.constructionManagerId != null ? `id:${row.constructionManagerId}` : `name:${row.constructionManagerName}`;
        managerMap.set(key, { id: row.constructionManagerId ?? null, name: row.constructionManagerName });
      }
      if (row.supervisorName) {
        const key = row.supervisorId != null ? `id:${row.supervisorId}` : `name:${row.supervisorName}`;
        if (!managerMap.has(key)) {
          managerMap.set(key, { id: row.supervisorId ?? null, name: row.supervisorName });
        }
      }
    }

    const constructionManagers = Array.from(managerMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      branches,
      suburbs,
      installers,
      constructionManagers,
    };
  }),

  // List all construction clients (jobs) with stage indicators
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["scheduled", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
      search: z.string().optional(),
      branch: z.string().optional(),
      suburb: z.string().optional(),
      scheduled: z.enum(["unscheduled", "scheduled", "overdue", "today", "next_7_days", "future"]).optional(),
      installerId: z.number().optional(),
      constructionManagerId: z.number().optional(),
      fyStartYear: z.number().optional(), // e.g. 2025 for FY 2025-26
      month: z.number().min(1).max(12).optional(), // 1-12, calendar month within the FY
      limit: z.number().optional(),
      offset: z.number().optional(),
      excludeCompleted: z.boolean().optional(), // default true when no status filter set
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      if (input?.status) {
        conditions.push(eq(constructionJobs.status, input.status));
      } else if (input?.excludeCompleted !== false) {
        // By default, exclude completed jobs when no specific status filter is set
        conditions.push(sql`${constructionJobs.status} != 'completed'`);
      }
      if (input?.search) {
        conditions.push(
          or(
            like(constructionJobs.clientName, `%${input.search}%`),
            like(constructionJobs.siteAddress, `%${input.search}%`),
            like(constructionJobs.quoteNumber, `%${input.search}%`),
            like(crmLeads.clientNumber, `%${input.search}%`),
          )
        );
      }
      if (input?.branch) {
        conditions.push(eq(constructionJobFinancials.branch, input.branch));
      }
      if (input?.suburb) {
        conditions.push(or(
          like(constructionJobs.siteAddress, `%${input.suburb}%`),
          eq(sql`LOWER(${quotes.suburb})`, input.suburb.toLowerCase()),
          eq(sql`LOWER(${crmLeads.suburb})`, input.suburb.toLowerCase()),
        ));
      }
      if (input?.constructionManagerId != null) {
        conditions.push(eq(constructionJobFinancials.constructionManagerId, input.constructionManagerId));
      }
      if (input?.installerId != null) {
        conditions.push(sql`EXISTS (
          SELECT 1 FROM ${constructionAssignments}
          WHERE ${constructionAssignments.jobId} = ${constructionJobs.id}
            AND ${constructionAssignments.installerId} = ${input.installerId}
        )`);
      }
      if (input?.scheduled) {
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const nextWeekEnd = new Date(todayStart);
        nextWeekEnd.setDate(nextWeekEnd.getDate() + 8);

        if (input.scheduled === "unscheduled") {
          conditions.push(sql`${constructionJobs.scheduledStart} IS NULL`);
        } else if (input.scheduled === "scheduled") {
          conditions.push(sql`${constructionJobs.scheduledStart} IS NOT NULL`);
        } else if (input.scheduled === "overdue") {
          conditions.push(sql`${constructionJobs.scheduledStart} IS NOT NULL AND ${constructionJobs.scheduledStart} < ${todayStart} AND ${constructionJobs.status} != 'completed'`);
        } else if (input.scheduled === "today") {
          conditions.push(sql`${constructionJobs.scheduledStart} >= ${todayStart} AND ${constructionJobs.scheduledStart} < ${tomorrowStart}`);
        } else if (input.scheduled === "next_7_days") {
          conditions.push(sql`${constructionJobs.scheduledStart} >= ${todayStart} AND ${constructionJobs.scheduledStart} < ${nextWeekEnd}`);
        } else if (input.scheduled === "future") {
          conditions.push(sql`${constructionJobs.scheduledStart} >= ${nextWeekEnd}`);
        }
      }

      // FY date filter on real project timing, not import/create timestamp.
      if (input?.fyStartYear != null) {
        const range = fyDateRange(input.fyStartYear);
        appendProjectDateRange(conditions, range.from, range.to);
      }

      // Month filter within the FY (or standalone)
      if (input?.month != null) {
        // If FY is set, use the correct year for the month
        // FY 2025-26: Jul 2025 (month 7) – Jun 2026 (month 6)
        if (input?.fyStartYear != null) {
          const year = input.month >= 7 ? input.fyStartYear : input.fyStartYear + 1;
          const monthStart = new Date(Date.UTC(year, input.month - 1, 1));
          const monthEnd = new Date(Date.UTC(year, input.month, 1));
          appendProjectDateRange(conditions, monthStart, monthEnd);
        } else {
          // No FY set — filter by month in current calendar year
          const now = new Date();
          const year = now.getFullYear();
          const monthStart = new Date(Date.UTC(year, input.month - 1, 1));
          const monthEnd = new Date(Date.UTC(year, input.month, 1));
          appendProjectDateRange(conditions, monthStart, monthEnd);
        }
      }

      const where = and(...jobTenantConditions(ctx, ...conditions));
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;

      const [jobs, countResult] = await Promise.all([
        db.select({
          job: constructionJobs,
          clientNumber: crmLeads.clientNumber,
          leadSuburb: crmLeads.suburb,
          quoteSuburb: quotes.suburb,
          branch: constructionJobFinancials.branch,
          constructionManagerId: constructionJobFinancials.constructionManagerId,
          constructionManagerName: constructionJobFinancials.constructionManagerName,
        }).from(constructionJobs)
          .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
          .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
          .leftJoin(quotes, eq(constructionJobs.quoteId, quotes.id))
          .where(where)
          .orderBy(desc(constructionJobs.updatedAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(DISTINCT ${constructionJobs.id})` })
          .from(constructionJobs)
          .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
          .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
          .leftJoin(quotes, eq(constructionJobs.quoteId, quotes.id))
          .where(where),
      ]);

      const jobRows = jobs.map((row: any) => ({ ...row.job, clientNumber: row.clientNumber, leadSuburb: row.leadSuburb, quoteSuburb: row.quoteSuburb, branch: row.branch, constructionManagerId: row.constructionManagerId, constructionManagerName: row.constructionManagerName }));

      // Get progress for each job to show stage indicators
      const jobIds = jobRows.map(j => j.id);
      const allProgress = jobIds.length > 0
        ? await db.select().from(constructionProgress)
            .where(inArray(constructionProgress.jobId, jobIds))
        : [];

      // Get assignments with installer names
      const allAssignments = jobIds.length > 0
        ? await db.select({
            jobId: constructionAssignments.jobId,
            id: constructionAssignments.id,
            installerId: constructionAssignments.installerId,
            installerName: constructionInstallers.name,
            role: constructionAssignments.role,
          })
            .from(constructionAssignments)
            .leftJoin(constructionInstallers, and(...installerTenantConditions(ctx, eq(constructionAssignments.installerId, constructionInstallers.id))))
            .where(inArray(constructionAssignments.jobId, jobIds))
        : [];

      // Get financials for each job
      const allFinancials = jobIds.length > 0
        ? await db.select({
            jobId: constructionJobFinancials.jobId,
            contractValue: constructionJobFinancials.contractValue,
            totalCost: constructionJobFinancials.totalCost,
            margin: constructionJobFinancials.margin,
            marginPercent: constructionJobFinancials.marginPercent,
            invoicedAmount: constructionJobFinancials.invoicedAmount,
            paidAmount: constructionJobFinancials.paidAmount,
            xeroContractValue: constructionJobFinancials.xeroContractValue,
            xeroInvoicedAmount: constructionJobFinancials.xeroInvoicedAmount,
            xeroPaidAmount: constructionJobFinancials.xeroPaidAmount,
            xeroTotalCost: constructionJobFinancials.xeroTotalCost,
          }).from(constructionJobFinancials)
            .where(inArray(constructionJobFinancials.jobId, jobIds))
        : [];

      const progressByJob: Record<number, typeof allProgress> = {};
      for (const p of allProgress) {
        if (!progressByJob[p.jobId]) progressByJob[p.jobId] = [];
        progressByJob[p.jobId].push(p);
      }

      const assignmentCountByJob: Record<number, number> = {};
      const assignmentsByJob: Record<number, Array<{ installerId: number; installerName: string; role: string | null }>> = {};
      for (const a of allAssignments) {
        assignmentCountByJob[a.jobId] = (assignmentCountByJob[a.jobId] || 0) + 1;
        if (!assignmentsByJob[a.jobId]) assignmentsByJob[a.jobId] = [];
        assignmentsByJob[a.jobId].push({
          installerId: a.installerId,
          installerName: a.installerName || 'Unknown',
          role: a.role,
        });
      }

      const financialsByJob: Record<number, typeof allFinancials[0]> = {};
      for (const f of allFinancials) {
        financialsByJob[f.jobId] = f;
      }

      // Get Approval status for each job via leadId
      const leadIds = jobRows.map(j => j.leadId).filter((id): id is number => id != null);
      const allBaStatuses = leadIds.length > 0
        ? await db.select({
            leadId: crmBuildingAuthority.leadId,
            status: crmBuildingAuthority.status,
            applicationDate: crmBuildingAuthority.applicationDate,
          }).from(crmBuildingAuthority).where(inArray(crmBuildingAuthority.leadId, leadIds))
        : [];
      const baStatusByLeadId: Record<number, { status: string | null; applicationDate: string | null }> = {};
      for (const ba of allBaStatuses) {
        baStatusByLeadId[ba.leadId] = { status: ba.status, applicationDate: ba.applicationDate };
      }

      const clients = jobRows.map(job => {
        const progress = progressByJob[job.id] || [];
        const completedStages = progress.filter(p => p.status === "completed").length;
        const totalStages = progress.length;
        const currentStage = progress.find(p => p.status === "in_progress")?.stage
          || progress.find(p => p.status === "pending")?.stage
          || (completedStages === totalStages && totalStages > 0 ? "Complete" : "Not Started");

        const fin = financialsByJob[job.id];
        // Prefer Xero values if available, fall back to manual
        const contractValue = parseFloat(fin?.xeroContractValue || fin?.contractValue || "0");
        const invoicedAmount = parseFloat(fin?.xeroInvoicedAmount || fin?.invoicedAmount || "0");
        const paidAmount = parseFloat(fin?.xeroPaidAmount || fin?.paidAmount || "0");
        const actualCosts = parseFloat(fin?.xeroTotalCost || "0");
        // Margin = (invoiced - actual costs) / invoiced
        const marginPercent = invoicedAmount > 0 ? ((invoicedAmount - actualCosts) / invoicedAmount) * 100 : 0;

        // Payment status: paid, partial, invoiced, unpaid
        let paymentStatus: "paid" | "partial" | "invoiced" | "unpaid" = "unpaid";
        if (contractValue > 0) {
          if (paidAmount >= contractValue) paymentStatus = "paid";
          else if (paidAmount > 0) paymentStatus = "partial";
          else if (invoicedAmount > 0) paymentStatus = "invoiced";
        }

        return {
          ...job,
          completedStages,
          totalStages,
          currentStage,
          progressPercent: contractValue > 0 ? Math.round((paidAmount / contractValue) * 100) : 0,
          assignedInstallers: assignmentCountByJob[job.id] || 0,
          installerNames: (assignmentsByJob[job.id] || []).map(a => a.installerName),
          trades: assignmentsByJob[job.id] || [],
          contractValue,
          invoicedAmount,
          paidAmount,
          marginPercent,
          paymentStatus,
          baStatus: job.leadId ? (baStatusByLeadId[job.leadId]?.status || null) : null,
          baApplicationDate: job.leadId ? (baStatusByLeadId[job.leadId]?.applicationDate || null) : null,
        };
      });

       return { clients, total: Number(countResult[0]?.count || 0) };
    }),

  // Status counts — optionally scoped to a financial year
  statusCounts: protectedProcedure
    .input(z.object({
      fyStartYear: z.number().optional(),
      month: z.number().min(1).max(12).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      if (input?.fyStartYear != null) {
        const range = fyDateRange(input.fyStartYear);
        appendProjectDateRange(conditions, range.from, range.to);
      }
      // Month filter within the FY
      if (input?.month != null) {
        if (input?.fyStartYear != null) {
          const year = input.month >= 7 ? input.fyStartYear : input.fyStartYear + 1;
          const monthStart = new Date(Date.UTC(year, input.month - 1, 1));
          const monthEnd = new Date(Date.UTC(year, input.month, 1));
          appendProjectDateRange(conditions, monthStart, monthEnd);
        } else {
          const now = new Date();
          const year = now.getFullYear();
          const monthStart = new Date(Date.UTC(year, input.month - 1, 1));
          const monthEnd = new Date(Date.UTC(year, input.month, 1));
          appendProjectDateRange(conditions, monthStart, monthEnd);
        }
      }
      const where = and(...jobTenantConditions(ctx, ...conditions));

      const rows = await db.select({
        status: constructionJobs.status,
        count: sql<number>`count(*)`
      }).from(constructionJobs).where(where).groupBy(constructionJobs.status);

      const counts: Record<string, number> = { scheduled: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0 };
      let total = 0;
      for (const row of rows) {
        counts[row.status] = Number(row.count);
        total += Number(row.count);
      }
      return { ...counts, total };
    }),

  // Available FY options based on actual data
  availableFYs: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    // Find the earliest and latest project dates.
    const [result] = await db.select({
      earliest: sql<Date>`MIN(${constructionJobDateExpr()})`,
      latest: sql<Date>`MAX(${constructionJobDateExpr()})`,
    }).from(constructionJobs)
      .where(and(...jobTenantConditions(ctx)));

    const earliest = result?.earliest ? new Date(result.earliest) : new Date();
    const latest = result?.latest ? new Date(result.latest) : new Date();

    // Calculate the FY start year for earliest and latest
    const earliestFy = earliest.getMonth() < 6 ? earliest.getFullYear() - 1 : earliest.getFullYear();
    const latestFy = latest.getMonth() < 6 ? latest.getFullYear() - 1 : latest.getFullYear();
    const currentFy = currentFyStartYear();

    // Generate FY options from earliest to max(latest, current)
    const maxFy = Math.max(latestFy, currentFy);
    const years: Array<{ value: number; label: string }> = [];
    for (let fy = maxFy; fy >= earliestFy; fy--) {
      const shortEnd = String(fy + 1).slice(-2);
      years.push({ value: fy, label: `FY ${fy}-${shortEnd}` });
    }

    return { years, currentFy };
  }),

  // Get detailed client info for the detail page
  detail: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const job = await requireJobAccess(db, ctx, input.jobId);

      // Get related data
      const [progress, assignments, financials, kanbanTasks, xeroAccountingSummary] = await Promise.all([
        db.select().from(constructionProgress)
          .where(eq(constructionProgress.jobId, input.jobId))
          .orderBy(constructionProgress.createdAt),
        db.select().from(constructionAssignments)
          .where(eq(constructionAssignments.jobId, input.jobId)),
        db.select().from(constructionJobFinancials)
          .where(eq(constructionJobFinancials.jobId, input.jobId)),
        db.select().from(constructionKanbanTasks)
          .where(eq(constructionKanbanTasks.jobId, input.jobId)),
        getXeroAccountingSummaryForJob(db, input.jobId),
      ]);

      // Get installer names for assignments
      const installerIds = Array.from(new Set(assignments.map(a => a.installerId).filter((id): id is number => id != null)));
      const installers = installerIds.length > 0
        ? await db.select().from(constructionInstallers)
            .where(and(...installerTenantConditions(ctx, inArray(constructionInstallers.id, installerIds))))
        : [];
      const installerMap = Object.fromEntries(installers.map(i => [i.id, i]));

      // Get linked quote data
      let quoteData = null;
      if (job.quoteId) {
        const quoteConditions = [eq(quotes.id, job.quoteId)];
        appendTenantScope(quoteConditions, quotes.tenantId, tenantIdFromContext(ctx));
        const [q] = await db.select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          clientName: quotes.clientName,
          clientPhone: quotes.clientPhone,
          clientEmail: quotes.clientEmail,
          siteAddress: quotes.siteAddress,
          suburb: quotes.suburb,
          status: quotes.status,
        }).from(quotes).where(and(...quoteConditions));
        quoteData = q || null;
      }

      // Get linked lead data
      let leadData = null;
      if (job.leadId) {
        const leadConditions = [eq(crmLeads.id, job.leadId)];
        appendTenantScope(leadConditions, crmLeads.tenantId, tenantIdFromContext(ctx));
        const [l] = await db.select({
          id: crmLeads.id,
          firstName: crmLeads.contactFirstName,
          lastName: crmLeads.contactLastName,
          phone: crmLeads.contactPhone,
          email: crmLeads.contactEmail,
          status: crmLeads.status,
          productType: crmLeads.productType,
        }).from(crmLeads).where(and(...leadConditions));
        leadData = l || null;
      }

      const enrichedAssignments = assignments.map(a => ({
        ...a,
        installer: installerMap[a.installerId] || null,
      }));

      const completedStages = progress.filter(p => p.status === "completed").length;
      const totalStages = progress.length;
      let progressSource: "manual" | "xero" | "none" = "none";

      // Progress % is amount-based: total paid / contract value (both inc GST)
      const fin = financials[0];
      const contractValue = parseFloat(fin?.xeroContractValue || fin?.contractValue || "0");
      const paidAmount = parseFloat(fin?.xeroPaidAmount || fin?.paidAmount || "0");
      const progressPercent = contractValue > 0 ? Math.round((paidAmount / contractValue) * 100) : 0;
      if (contractValue > 0) progressSource = "xero";

      return {
        job,
        progress,
        assignments: enrichedAssignments,
        financials: financials[0] || null,
        xeroAccountingSummary,
        kanbanTasks,
        quoteData,
        leadData,
        completedStages,
        totalStages,
        progressPercent,
        progressSource,
      };
    }),

  // Update financials for a job
  updateFinancials: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      contractValue: z.string().optional(),
      materialsCost: z.string().optional(),
      labourCost: z.string().optional(),
      otherCost: z.string().optional(),
      invoicedAmount: z.string().optional(),
      paidAmount: z.string().optional(),
      branch: z.string().optional(),
      constructionManagerId: z.number().nullable().optional(),
      constructionManagerName: z.string().nullable().optional(),
      roofStyle: z.string().optional(),
      postcode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const { jobId, ...data } = input;
      await requireJobAccess(db, ctx, jobId);
      // Calculate totals
      const materials = parseFloat(data.materialsCost || "0");
      const labour = parseFloat(data.labourCost || "0");
      const other = parseFloat(data.otherCost || "0");
      const totalCost = materials + labour + other;
      const contractValue = parseFloat(data.contractValue || "0");
      const margin = contractValue - totalCost;
      const marginPercent = contractValue > 0 ? (margin / contractValue) * 100 : 0;

      const values = {
        ...data,
        totalCost: String(totalCost),
        margin: String(margin),
        marginPercent: String(marginPercent.toFixed(2)),
      };

      // Upsert
      const existing = await db.select({ id: constructionJobFinancials.id })
        .from(constructionJobFinancials)
        .where(eq(constructionJobFinancials.jobId, jobId));

      if (existing.length > 0) {
        await db.update(constructionJobFinancials).set(values).where(eq(constructionJobFinancials.jobId, jobId));
      } else {
        await db.insert(constructionJobFinancials).values({ jobId, ...values });
      }

      return { success: true };
    }),
});
