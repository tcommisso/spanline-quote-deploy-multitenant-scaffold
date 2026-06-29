import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, createSmsDeliveryLog, getSmsDeliveryLogsByJob } from "./db";
import { constructionJobs, constructionInstallers, constructionAssignments, constructionProgress, quotes, checkMeasureWorkbooks, xeroProjectMappings, cmVarianceItems, cmComponentOrders, cmWorkOrders, users, quoteItems, smsMessages, overdueAlertDismissals, constructionJobFinancials, tradeInvoices, poMilestones, jobCommunications, emailTemplates, smsTemplates, jobSharedFiles, constructionPlans, constructionPlanAuditLog, manufacturingOrders, manufacturingTasks, inventoryMovements, inventoryStockItems, chatChannels, chatChannelMembers, tradeMessages } from "../drizzle/schema";
import { storagePut } from "./storage";
import { eq, desc, and, sql, gte, lt, notInArray, or, isNull, like, inArray } from "drizzle-orm";
import * as vocphone from "./vocphone";
import { notifyJobStageChanged, notifyJobStatusChanged, fireJobCompletionReviewWebhook } from "./construction-notifications";
import { sendNotificationEmail } from "./email";
import { generateWorkOrderPdf } from "./construction-pdf";
import { triggerPushSharedFileUploaded } from "./push-triggers";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { getTradeReadinessMap, tradeReadinessKey } from "./construction-trade-readiness";

const ACTIVE_CONSTRUCTION_JOB_STATUSES = ["scheduled", "in_progress", "on_hold"] as const;

function appendExactQuoteTenantScope(conditions: any[], column: any, tenantId: number | null | undefined) {
  conditions.push(tenantId ? eq(column, tenantId) : sql`1 = 0`);
}

// Auto-archive plans when job is completed
async function autoArchiveJobPlans(db: any, jobId: number) {
  const plans = await db
    .select()
    .from(constructionPlans)
    .where(and(
      eq(constructionPlans.jobId, jobId),
      sql`${constructionPlans.status} != 'draft'`,
      sql`${constructionPlans.status} != 'archived'`,
    ));
  if (plans.length === 0) return;
  const planIds = plans.map((p: any) => p.id);
  await db.update(constructionPlans).set({ status: "archived" }).where(inArray(constructionPlans.id, planIds));
  for (const plan of plans) {
    await db.insert(constructionPlanAuditLog).values({
      planId: plan.id,
      jobId,
      action: "archived",
      fromStatus: plan.status,
      toStatus: "archived",
      performedByType: "system",
      performedByName: "System (job completed)",
      details: `Plan "${plan.title}" auto-archived when job marked as completed`,
    });
  }
}

// ─── Default construction stages ─────────────────────────────────────────────
const DEFAULT_STAGES = [
  "Site Prep",
  "Footings & Concrete",
  "Frame & Posts",
  "Roof Installation",
  "Electrical",
  "Plumbing",
  "Walls & Cladding",
  "Final Inspection",
];

function jobScope(ctx: any, jobId?: number) {
  const conditions: any[] = [];
  if (jobId != null) conditions.push(eq(constructionJobs.id, jobId));
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function createTradePortalNotificationMessage(db: any, installerId: number, content: string, senderName?: string | null) {
  await db.insert(tradeMessages).values({
    installerId,
    jobId: null,
    content,
    direction: "outbound",
    senderName: senderName || "Office",
  });
}

function installerScope(ctx: any, installerId?: number) {
  const conditions: any[] = [];
  if (installerId != null) conditions.push(eq(constructionInstallers.id, installerId));
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function constructionJobDateExpr() {
  return sql<Date>`COALESCE(${constructionJobs.actualEnd}, ${constructionJobs.actualStart}, ${constructionJobs.scheduledEnd}, ${constructionJobs.scheduledStart}, ${constructionJobs.createdAt})`;
}

function appendConstructionFyScope(conditions: any[], fyStartYear?: number) {
  if (fyStartYear == null) return;
  const from = new Date(Date.UTC(fyStartYear, 6, 1));
  const to = new Date(Date.UTC(fyStartYear + 1, 6, 1));
  const jobDate = constructionJobDateExpr();
  conditions.push(sql`${jobDate} >= ${from}`);
  conditions.push(sql`${jobDate} < ${to}`);
}

async function assertJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select().from(constructionJobs).where(and(...jobScope(ctx, jobId))).limit(1);
  if (!job) throw new Error("Job not found");
  return job;
}

async function assertInstallerAccess(db: any, ctx: any, installerId: number) {
  const [installer] = await db.select().from(constructionInstallers).where(and(...installerScope(ctx, installerId))).limit(1);
  if (!installer) throw new Error("Installer not found");
  return installer;
}

async function assertWorkbookAccess(db: any, ctx: any, workbookId: number) {
  const conditions = [eq(checkMeasureWorkbooks.id, workbookId)];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  const [workbook] = await db.select({ workbook: checkMeasureWorkbooks })
    .from(checkMeasureWorkbooks)
    .innerJoin(constructionJobs, eq(checkMeasureWorkbooks.jobId, constructionJobs.id))
    .where(and(...conditions))
    .limit(1);
  if (!workbook) throw new Error("Workbook not found");
  return workbook.workbook;
}

async function assertVarianceAccess(db: any, ctx: any, id: number) {
  const conditions = [eq(cmVarianceItems.id, id)];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  const [row] = await db.select({ item: cmVarianceItems })
    .from(cmVarianceItems)
    .innerJoin(checkMeasureWorkbooks, eq(cmVarianceItems.workbookId, checkMeasureWorkbooks.id))
    .innerJoin(constructionJobs, eq(checkMeasureWorkbooks.jobId, constructionJobs.id))
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new Error("Variance item not found");
  return row.item;
}

async function assertComponentOrderAccess(db: any, ctx: any, id: number) {
  const conditions = [eq(cmComponentOrders.id, id)];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  const [row] = await db.select({ order: cmComponentOrders })
    .from(cmComponentOrders)
    .innerJoin(checkMeasureWorkbooks, eq(cmComponentOrders.workbookId, checkMeasureWorkbooks.id))
    .innerJoin(constructionJobs, eq(checkMeasureWorkbooks.jobId, constructionJobs.id))
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new Error("Component order not found");
  return row.order;
}

async function assertWorkOrderAccess(db: any, ctx: any, id: number) {
  const conditions = [eq(cmWorkOrders.id, id)];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  const [row] = await db.select({ workOrder: cmWorkOrders })
    .from(cmWorkOrders)
    .innerJoin(constructionJobs, eq(cmWorkOrders.jobId, constructionJobs.id))
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new Error("Work order not found");
  return row.workOrder;
}

async function assertSharedFileAccess(db: any, ctx: any, id: number) {
  const conditions = [eq(jobSharedFiles.id, id)];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  const [row] = await db.select({ file: jobSharedFiles })
    .from(jobSharedFiles)
    .innerJoin(constructionJobs, eq(jobSharedFiles.jobId, constructionJobs.id))
    .where(and(...conditions))
    .limit(1);
  if (!row) throw new Error("Shared file not found");
  return row.file;
}

export const constructionRouter = router({
  // ─── Jobs ─────────────────────────────────────────────────────────────────
  jobs: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["scheduled", "in_progress", "on_hold", "completed", "cancelled", "not_completed"]).optional(),
        fyStartYear: z.number().optional(),
        excludeCompleted: z.boolean().optional(), // default true when no status filter set
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [];
        const tenantId = tenantIdFromContext(ctx);
        appendTenantScope(conditions, constructionJobs.tenantId, tenantId);
        if (input?.status === "not_completed") {
          conditions.push(inArray(constructionJobs.status, [...ACTIVE_CONSTRUCTION_JOB_STATUSES]));
        } else if (input?.status) {
          conditions.push(eq(constructionJobs.status, input.status));
        } else if (input?.excludeCompleted !== false) {
          // By default, exclude completed jobs when no specific status filter is set
          conditions.push(sql`${constructionJobs.status} != 'completed'`);
        }
        // FY date filter
        appendConstructionFyScope(conditions, input?.fyStartYear);
        const jobs = await db.select().from(constructionJobs)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(constructionJobs.updatedAt));
        // Fetch xero project names for job number display
        const jobIds = jobs.map(j => j.id);
        let xeroNames: Record<number, string> = {};
        if (jobIds.length > 0) {
          const mappings = await db.select({
            jobId: xeroProjectMappings.jobId,
            xeroProjectName: xeroProjectMappings.xeroProjectName,
          }).from(xeroProjectMappings)
            .where(inArray(xeroProjectMappings.jobId, jobIds));
          for (const m of mappings) {
            if (m.xeroProjectName) xeroNames[m.jobId] = m.xeroProjectName;
          }
        }
        // Fetch assignments for all jobs
        let allAssignments: { jobId: number; installerId: number; installerName: string; role: string | null }[] = [];
        if (jobIds.length > 0) {
          allAssignments = await db.select({
            jobId: constructionAssignments.jobId,
            installerId: constructionInstallers.id,
            installerName: constructionInstallers.name,
            role: constructionAssignments.role,
          }).from(constructionAssignments)
            .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
            .where(inArray(constructionAssignments.jobId, jobIds));
        }
        const assignmentsByJob: Record<number, typeof allAssignments> = {};
        for (const a of allAssignments) {
          if (!assignmentsByJob[a.jobId]) assignmentsByJob[a.jobId] = [];
          assignmentsByJob[a.jobId].push(a);
        }
        return jobs.map(j => ({
          ...j,
          jobNumber: j.quoteNumber || xeroNames[j.id] || null,
          trades: assignmentsByJob[j.id] || [],
        }));
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const jobConditions = [eq(constructionJobs.id, input.id)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
        const [job] = await db.select().from(constructionJobs).where(and(...jobConditions));
        if (!job) throw new Error("Job not found");

        const assignments = await db.select({
          id: constructionAssignments.id,
          role: constructionAssignments.role,
          confirmedAt: constructionAssignments.confirmedAt,
          createdAt: constructionAssignments.createdAt,
          installerId: constructionInstallers.id,
          installerName: constructionInstallers.name,
          installerPhone: constructionInstallers.phone,
          installerEmail: constructionInstallers.email,
          installerSpeciality: constructionInstallers.speciality,
        }).from(constructionAssignments)
          .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
          .where(eq(constructionAssignments.jobId, input.id));
        const readinessMap = await getTradeReadinessMap(
          db,
          ctx,
          assignments.map((assignment) => ({ jobId: input.id, installerId: assignment.installerId })),
          new Map(assignments.map((assignment) => [assignment.installerId, {
            id: assignment.installerId,
            phone: assignment.installerPhone,
            email: assignment.installerEmail,
          }])),
        );
        const enrichedAssignments = assignments.map((assignment) => ({
          ...assignment,
          tradeReadiness: readinessMap.get(tradeReadinessKey(input.id, assignment.installerId)) || null,
          readinessWarnings: readinessMap.get(tradeReadinessKey(input.id, assignment.installerId))?.warnings || [],
        }));

        const progress = await db.select().from(constructionProgress)
          .where(eq(constructionProgress.jobId, input.id))
          .orderBy(constructionProgress.id);

        return { ...job, assignments: enrichedAssignments, progress };
      }),

    create: protectedProcedure
      .input(z.object({
        quoteId: z.number().optional(),
        quoteNumber: z.string().optional(),
        clientName: z.string().min(1),
        siteAddress: z.string().optional(),
        scheduledStart: z.string().optional(),
        scheduledEnd: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const [result] = await db.insert(constructionJobs).values({
          tenantId,
          quoteId: input.quoteId || null,
          quoteNumber: input.quoteNumber || null,
          clientName: input.clientName,
          siteAddress: input.siteAddress || null,
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
          scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
          priority: input.priority || "normal",
          notes: input.notes || null,
          createdBy: ctx.user.id,
        });

        const jobId = result.insertId;

        for (const stage of DEFAULT_STAGES) {
          await db.insert(constructionProgress).values({
            tenantId,
            jobId,
            stage,
            status: "pending",
          });
        }

        return { id: jobId };
      }),

    createFromQuote: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const quoteConditions = [eq(quotes.id, input.quoteId)];
        appendExactQuoteTenantScope(quoteConditions, quotes.tenantId, tenantId);
        const [quote] = await db.select().from(quotes).where(and(...quoteConditions));
        if (!quote) throw new Error("Quote not found");

        const [result] = await db.insert(constructionJobs).values({
          tenantId: quote.tenantId ?? tenantId,
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          clientName: quote.clientName,
          siteAddress: quote.siteAddress || null,
          priority: "normal",
          createdBy: ctx.user.id,
        });

        const jobId = result.insertId;

        for (const stage of DEFAULT_STAGES) {
          await db.insert(constructionProgress).values({
            tenantId: quote.tenantId ?? tenantId,
            jobId,
            stage,
            status: "pending",
          });
        }

        return { id: jobId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["scheduled", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        scheduledStart: z.string().nullable().optional(),
        scheduledEnd: z.string().nullable().optional(),
        actualStart: z.string().nullable().optional(),
        actualEnd: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { id, ...updates } = input;
        const tenantId = tenantIdFromContext(ctx);
        const jobConditions = [eq(constructionJobs.id, id)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
        const setValues: Record<string, any> = {};
        if (updates.status !== undefined) setValues.status = updates.status;
        if (updates.priority !== undefined) setValues.priority = updates.priority;
        if (updates.notes !== undefined) setValues.notes = updates.notes;
        if (updates.scheduledStart !== undefined) setValues.scheduledStart = updates.scheduledStart ? new Date(updates.scheduledStart) : null;
        if (updates.scheduledEnd !== undefined) setValues.scheduledEnd = updates.scheduledEnd ? new Date(updates.scheduledEnd) : null;
        if (updates.actualStart !== undefined) setValues.actualStart = updates.actualStart ? new Date(updates.actualStart) : null;
        if (updates.actualEnd !== undefined) setValues.actualEnd = updates.actualEnd ? new Date(updates.actualEnd) : null;

        if (Object.keys(setValues).length > 0) {
          // Track status change for notification
          const hadStatusChange = updates.status !== undefined;
          let oldStatus: string | undefined;
          if (hadStatusChange) {
            const [existing] = await db.select({ status: constructionJobs.status })
              .from(constructionJobs).where(and(...jobConditions));
            if (!existing) throw new Error("Job not found");
            oldStatus = existing?.status;
          }

          await db.update(constructionJobs).set(setValues).where(and(...jobConditions));

          // Fire-and-forget job status notification
          if (hadStatusChange && oldStatus && oldStatus !== updates.status) {
            notifyJobStatusChanged({
              jobId: id,
              oldStatus,
              newStatus: updates.status!,
            }).catch(() => {});

            // Auto-archive plans when job is completed
            if (updates.status === "completed") {
              autoArchiveJobPlans(db, id).catch(() => {});
              // Fire outbound webhook to Zapier → Climbo for review invitation
              fireJobCompletionReviewWebhook(id).catch(() => {});
            }
          }
        }
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const conditions = [eq(constructionJobs.id, input.id)];
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        await db.delete(constructionJobs).where(and(...conditions));
        return { success: true };
      }),

    stats: protectedProcedure
      .input(z.object({ fyStartYear: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { total: 0, scheduled: 0, inProgress: 0, onHold: 0, completed: 0 };
      const conditions: any[] = [];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      appendConstructionFyScope(conditions, input?.fyStartYear);
      const where = conditions.length ? and(...conditions) : undefined;
      const allJobs = await db.select({ status: constructionJobs.status }).from(constructionJobs).where(where);
      const total = allJobs.length;
      const scheduled = allJobs.filter(j => j.status === "scheduled").length;
      const inProgress = allJobs.filter(j => j.status === "in_progress").length;
      const onHold = allJobs.filter(j => j.status === "on_hold").length;
      const completed = allJobs.filter(j => j.status === "completed").length;
      return { total, scheduled, inProgress, onHold, completed };
    }),

    overdueCount: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { count: 0 };
      const now = new Date();
      // Get dismissed/snoozed job IDs for this user
      const dismissals = await db.select({ jobId: overdueAlertDismissals.jobId, action: overdueAlertDismissals.action, snoozedUntil: overdueAlertDismissals.snoozedUntil })
        .from(overdueAlertDismissals)
        .where(eq(overdueAlertDismissals.userId, ctx.user.id));
      const excludedJobIds = dismissals
        .filter(d => d.action === "dismiss" || (d.action === "snooze" && d.snoozedUntil && d.snoozedUntil > now))
        .map(d => d.jobId);
      const conditions: any[] = [
        eq(constructionJobs.status, "in_progress"),
        lt(constructionJobs.scheduledEnd, now),
      ];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      if (excludedJobIds.length > 0) {
        conditions.push(notInArray(constructionJobs.id, excludedJobIds));
      }
      const overdueJobs = await db.select({ id: constructionJobs.id })
        .from(constructionJobs)
        .where(and(...conditions));
      return { count: overdueJobs.length };
    }),

    overdueList: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const overdueJobs = await db.select({
        id: constructionJobs.id,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        scheduledEnd: constructionJobs.scheduledEnd,
        quoteNumber: constructionJobs.quoteNumber,
      })
        .from(constructionJobs)
        .where(and(
          eq(constructionJobs.status, "in_progress"),
          lt(constructionJobs.scheduledEnd, now),
          ...(tenantIdFromContext(ctx) ? [or(eq(constructionJobs.tenantId, tenantIdFromContext(ctx)!), isNull(constructionJobs.tenantId))!] : [])
        ));
      // Get user's dismissals
      const dismissals = await db.select()
        .from(overdueAlertDismissals)
        .where(eq(overdueAlertDismissals.userId, ctx.user.id));
      const dismissalMap = new Map(dismissals.map(d => [d.jobId, d]));
      return overdueJobs.map(job => {
        const dismissal = dismissalMap.get(job.id);
        const isDismissed = dismissal?.action === "dismiss";
        const isSnoozed = dismissal?.action === "snooze" && dismissal.snoozedUntil && dismissal.snoozedUntil > now;
        return {
          ...job,
          daysOverdue: Math.floor((now.getTime() - (job.scheduledEnd?.getTime() || 0)) / (1000 * 60 * 60 * 24)),
          isDismissed: isDismissed || false,
          isSnoozed: isSnoozed || false,
          snoozedUntil: dismissal?.snoozedUntil || null,
        };
      });
    }),

    dismissOverdue: protectedProcedure
      .input(z.object({ jobId: z.number(), action: z.enum(["dismiss", "snooze"]), snoozeDays: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        // Remove any existing dismissal for this user+job
        await db.delete(overdueAlertDismissals).where(
          and(
            eq(overdueAlertDismissals.jobId, input.jobId),
            eq(overdueAlertDismissals.userId, ctx.user.id)
          )
        );
        // Insert new dismissal
        const snoozedUntil = input.action === "snooze" && input.snoozeDays
          ? new Date(Date.now() + input.snoozeDays * 24 * 60 * 60 * 1000)
          : null;
        await db.insert(overdueAlertDismissals).values({
          jobId: input.jobId,
          userId: ctx.user.id,
          action: input.action,
          snoozedUntil,
        });
        return { success: true };
      }),

    undismissOverdue: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(overdueAlertDismissals).where(
          and(
            eq(overdueAlertDismissals.jobId, input.jobId),
            eq(overdueAlertDismissals.userId, ctx.user.id)
          )
        );
        return { success: true };
      }),
  }),

  // ─── Installers ───────────────────────────────────────────────────────────
  installers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
      return db.select().from(constructionInstallers)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(constructionInstallers.name);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().optional(),
        speciality: z.string().optional(),
        tradeType: z.enum(["installer", "electrician", "plumber", "roofer", "carpenter", "concreter", "painter", "tiler", "fencer", "labourer", "other"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const [result] = await db.insert(constructionInstallers).values({
          tenantId: tenantIdFromContext(ctx),
          name: input.name,
          phone: input.phone || null,
          email: input.email || null,
          speciality: input.speciality || null,
          tradeType: input.tradeType || "installer",
        });
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        speciality: z.string().nullable().optional(),
        tradeType: z.enum(["installer", "electrician", "plumber", "roofer", "carpenter", "concreter", "painter", "tiler", "fencer", "labourer", "other"]).optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { id, ...updates } = input;
        const conditions = [eq(constructionInstallers.id, id)];
        appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
        const setValues: Record<string, any> = {};
        if (updates.name !== undefined) setValues.name = updates.name;
        if (updates.phone !== undefined) setValues.phone = updates.phone;
        if (updates.email !== undefined) setValues.email = updates.email;
        if (updates.speciality !== undefined) setValues.speciality = updates.speciality;
        if (updates.tradeType !== undefined) setValues.tradeType = updates.tradeType;
        if (updates.active !== undefined) setValues.active = updates.active;
        if (Object.keys(setValues).length > 0) {
          await db.update(constructionInstallers).set(setValues).where(and(...conditions));
        }
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const conditions = [eq(constructionInstallers.id, input.id)];
        appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
        await db.delete(constructionInstallers).where(and(...conditions));
        return { success: true };
      }),
  }),

  // ─── Assignments ──────────────────────────────────────────────────────────
  assignments: router({
    assign: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        installerId: z.number(),
        role: z.string().optional(),
        notifySms: z.boolean().optional().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const jobConditions = [eq(constructionJobs.id, input.jobId)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
        const [jobForTenant] = await db.select({ id: constructionJobs.id }).from(constructionJobs).where(and(...jobConditions));
        if (!jobForTenant) throw new Error("Job not found");
        const installerConditions = [eq(constructionInstallers.id, input.installerId)];
        appendTenantScope(installerConditions, constructionInstallers.tenantId, tenantId);
        const [installerForTenant] = await db.select({ id: constructionInstallers.id }).from(constructionInstallers).where(and(...installerConditions));
        if (!installerForTenant) throw new Error("Installer not found");
        const [result] = await db.insert(constructionAssignments).values({
          jobId: input.jobId,
          installerId: input.installerId,
          role: input.role || "installer",
        });

        // Auto-create or join per-job chat channel
        try {
          const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, input.jobId));
          if (job) {
            const channelName = `Job: ${job.clientName || "#" + job.id}`;
            // Check if a job channel already exists
            let [existingChannel] = await db.select().from(chatChannels)
              .where(and(eq(chatChannels.type, "job"), eq(chatChannels.jobId, input.jobId)))
              .limit(1);

            let channelId: number;
            if (existingChannel) {
              channelId = existingChannel.id;
            } else {
              // Create new job channel
              const [newCh] = await db.insert(chatChannels).values({
                name: channelName,
                type: "job",
                jobId: input.jobId,
              }).$returningId();
              channelId = newCh.id;
            }

            // Add installer as member if not already
            const [existingMember] = await db.select().from(chatChannelMembers)
              .where(and(
                eq(chatChannelMembers.channelId, channelId),
                eq(chatChannelMembers.memberType, "trade"),
                eq(chatChannelMembers.memberId, input.installerId)
              ))
              .limit(1);

            if (!existingMember) {
              await db.insert(chatChannelMembers).values({
                channelId,
                memberType: "trade",
                memberId: input.installerId,
                role: "member",
              });
            }
          }
        } catch (chatErr) {
          console.error("[Construction] Failed to auto-create job chat channel:", chatErr);
        }

        // Send SMS notification to the installer
        if (input.notifySms) {
          try {
            const [installer] = await db.select().from(constructionInstallers).where(eq(constructionInstallers.id, input.installerId));
            const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, input.jobId));
            if (installer?.phone && job) {
              const senderNumber = process.env.VOCPHONE_SMS_SENDER || "61480855750";
              // Format phone number (remove spaces, ensure E164 without +)
              let phone = installer.phone.replace(/[\s\-()]/g, "");
              if (phone.startsWith("+")) phone = phone.slice(1);
              if (phone.startsWith("0")) phone = "61" + phone.slice(1);

              const scheduledDate = job.scheduledStart
                ? new Date(job.scheduledStart).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                : "TBC";
              const body = `Hi ${installer.name}, you've been assigned to a new job.\n\nClient: ${job.clientName}\nSite: ${job.siteAddress || "TBC"}\nScheduled: ${scheduledDate}\nRole: ${input.role || "Installer"}\n\n- Altaspan Construction`;

              await vocphone.sendSms({
                recipient: phone,
                sender: senderNumber,
                body,
              });
              // Log successful SMS delivery
              await createSmsDeliveryLog({
                jobId: input.jobId,
                installerId: input.installerId,
                recipient: phone,
                sender: senderNumber,
                body,
                status: "sent",
              });
            }
          } catch (err: any) {
            // Log failed SMS delivery
            console.error("[Construction] Failed to send assignment SMS:", err);
            try {
              const [installer] = await db.select().from(constructionInstallers).where(eq(constructionInstallers.id, input.installerId));
              let phone = installer?.phone?.replace(/[\s\-()]/g, "") || "unknown";
              if (phone.startsWith("+")) phone = phone.slice(1);
              if (phone.startsWith("0")) phone = "61" + phone.slice(1);
              await createSmsDeliveryLog({
                jobId: input.jobId,
                installerId: input.installerId,
                recipient: phone,
                sender: process.env.VOCPHONE_SMS_SENDER || "61480855750",
                body: "(failed to send)",
                status: "failed",
                errorMessage: err?.message || String(err),
              });
            } catch (_) { /* ignore logging failure */ }
          }
        }

        return { id: result.insertId };
      }),

    unassign: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const jobConditions = [eq(constructionAssignments.id, input.id)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
        const [assignment] = await db.select({ id: constructionAssignments.id })
          .from(constructionAssignments)
          .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
          .where(and(...jobConditions));
        if (!assignment) throw new Error("Assignment not found");
        await db.delete(constructionAssignments).where(eq(constructionAssignments.id, input.id));
        return { success: true };
      }),

    confirm: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const jobConditions = [eq(constructionAssignments.id, input.id)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
        const [assignment] = await db.select({ id: constructionAssignments.id })
          .from(constructionAssignments)
          .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
          .where(and(...jobConditions));
        if (!assignment) throw new Error("Assignment not found");
        await db.update(constructionAssignments)
          .set({ confirmedAt: new Date() })
          .where(eq(constructionAssignments.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Progress ─────────────────────────────────────────────────────────────
  progress: router({
    updateStage: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_progress", "completed", "skipped"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const tenantId = tenantIdFromContext(ctx);
        const progressConditions = [eq(constructionProgress.id, input.id)];
        appendTenantScope(progressConditions, constructionJobs.tenantId, tenantId);
        const [stageRow] = await db.select({ jobId: constructionProgress.jobId, stage: constructionProgress.stage })
          .from(constructionProgress)
          .innerJoin(constructionJobs, eq(constructionProgress.jobId, constructionJobs.id))
          .where(and(...progressConditions));
        if (!stageRow) throw new Error("Progress stage not found");
        const setValues: Record<string, any> = {
          status: input.status,
          updatedBy: ctx.user.id,
        };
        if (input.notes !== undefined) setValues.notes = input.notes;
        if (input.status === "completed") setValues.completedAt = new Date();
        else setValues.completedAt = null;

        await db.update(constructionProgress).set(setValues).where(eq(constructionProgress.id, input.id));

        // Fire-and-forget stage change notification
        notifyJobStageChanged({
          jobId: stageRow.jobId,
          stage: stageRow.stage,
          newStatus: input.status,
        }).catch(() => {});

        return { success: true };
      }),

    addStage: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        stage: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const jobConditions = [eq(constructionJobs.id, input.jobId)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const [job] = await db.select({ id: constructionJobs.id }).from(constructionJobs).where(and(...jobConditions));
        if (!job) throw new Error("Job not found");
        const [result] = await db.insert(constructionProgress).values({
          tenantId: tenantIdFromContext(ctx),
          jobId: input.jobId,
          stage: input.stage,
          status: "pending",
        });
        return { id: result.insertId };
      }),

    removeStage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const progressConditions = [eq(constructionProgress.id, input.id)];
        appendTenantScope(progressConditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const [stage] = await db.select({ id: constructionProgress.id })
          .from(constructionProgress)
          .innerJoin(constructionJobs, eq(constructionProgress.jobId, constructionJobs.id))
          .where(and(...progressConditions));
        if (!stage) throw new Error("Progress stage not found");
        await db.delete(constructionProgress).where(eq(constructionProgress.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Check Measure Workbooks ───────────────────────────────────────────────
  checkMeasure: router({
    getByJob: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;
        const jobConditions = [eq(constructionJobs.id, input.jobId)];
        appendTenantScope(jobConditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const [job] = await db.select({ id: constructionJobs.id }).from(constructionJobs).where(and(...jobConditions));
        if (!job) return null;
        const [workbook] = await db.select().from(checkMeasureWorkbooks).where(eq(checkMeasureWorkbooks.jobId, input.jobId));
        return workbook || null;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending_review", "in_review", "reviewed", "approved", "variance_found"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const workbookConditions = [eq(checkMeasureWorkbooks.id, input.id)];
        appendTenantScope(workbookConditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const [workbook] = await db.select({ id: checkMeasureWorkbooks.id })
          .from(checkMeasureWorkbooks)
          .innerJoin(constructionJobs, eq(checkMeasureWorkbooks.jobId, constructionJobs.id))
          .where(and(...workbookConditions));
        if (!workbook) throw new Error("Workbook not found");
        await db.update(checkMeasureWorkbooks).set({
          status: input.status,
          checkedBy: ctx.user.id,
          checkedByName: ctx.user.name || "Unknown",
          checkedAt: new Date(),
        }).where(eq(checkMeasureWorkbooks.id, input.id));
        return { success: true };
      }),

    saveVarianceNotes: protectedProcedure
      .input(z.object({
        id: z.number(),
        varianceNotes: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertWorkbookAccess(db, ctx, input.id);
        await db.update(checkMeasureWorkbooks).set({
          varianceNotes: input.varianceNotes,
          status: "variance_found",
        }).where(eq(checkMeasureWorkbooks.id, input.id));
        return { success: true };
      }),

    updateComponents: protectedProcedure
      .input(z.object({
        id: z.number(),
        components: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertWorkbookAccess(db, ctx, input.id);
        await db.update(checkMeasureWorkbooks).set({
          components: input.components,
        }).where(eq(checkMeasureWorkbooks.id, input.id));
        return { success: true };
      }),

    updateSpecData: protectedProcedure
      .input(z.object({
        id: z.number(),
        specData: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertWorkbookAccess(db, ctx, input.id);
        await db.update(checkMeasureWorkbooks).set({
          specData: input.specData,
        }).where(eq(checkMeasureWorkbooks.id, input.id));
        return { success: true };
      }),

    // ─── Assign construction user ─────────────────────────────────────────
    assignUser: protectedProcedure
      .input(z.object({ id: z.number(), userId: z.number().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertWorkbookAccess(db, ctx, input.id);
        let userName: string | null = null;
        if (input.userId) {
          const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, input.userId));
          userName = u?.name || null;
        }
        await db.update(checkMeasureWorkbooks).set({
          checkedBy: input.userId,
          checkedByName: userName || null,
        }).where(eq(checkMeasureWorkbooks.id, input.id));
        return { success: true };
      }),

    // ─── Get quote line items snapshot for the workbook ───────────────────
    getQuoteLineItems: protectedProcedure
      .input(z.object({ workbookId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const wb = await assertWorkbookAccess(db, ctx, input.workbookId);
        if (!wb?.originalQuoteId) return [];
        return db.select().from(quoteItems)
          .where(eq(quoteItems.quoteId, wb.originalQuoteId))
          .orderBy(quoteItems.tabName, quoteItems.sortOrder);
      }),

    // ─── Staff users for assignment picker ────────────────────────────────
    staffUsers: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: users.id, name: users.name, role: users.role })
        .from(users).orderBy(users.name);
    }),

    // ─── Variance Items CRUD ─────────────────────────────────────────────
    variance: router({
      list: protectedProcedure
        .input(z.object({ workbookId: z.number() }))
        .query(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) return [];
          await assertWorkbookAccess(db, ctx, input.workbookId);
          return db.select().from(cmVarianceItems)
            .where(eq(cmVarianceItems.workbookId, input.workbookId))
            .orderBy(cmVarianceItems.tabName, cmVarianceItems.id);
        }),
      create: protectedProcedure
        .input(z.object({
          workbookId: z.number(),
          tabName: z.string().min(1),
          itemDescription: z.string().min(1),
          originalQty: z.string().optional(),
          measuredQty: z.string().optional(),
          varianceQty: z.string().optional(),
          uom: z.string().optional(),
          severity: z.enum(["minor", "moderate", "major"]).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertWorkbookAccess(db, ctx, input.workbookId);
          const [result] = await db.insert(cmVarianceItems).values({
            workbookId: input.workbookId,
            tabName: input.tabName,
            itemDescription: input.itemDescription,
            originalQty: input.originalQty || null,
            measuredQty: input.measuredQty || null,
            varianceQty: input.varianceQty || null,
            uom: input.uom || "ea",
            severity: input.severity || "minor",
            notes: input.notes || null,
            createdBy: ctx.user.id,
          });
          return { id: result.insertId };
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          tabName: z.string().optional(),
          itemDescription: z.string().optional(),
          originalQty: z.string().nullable().optional(),
          measuredQty: z.string().nullable().optional(),
          varianceQty: z.string().nullable().optional(),
          uom: z.string().optional(),
          severity: z.enum(["minor", "moderate", "major"]).optional(),
          notes: z.string().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const { id, ...updates } = input;
          await assertVarianceAccess(db, ctx, id);
          const setValues: Record<string, any> = {};
          for (const [k, v] of Object.entries(updates)) {
            if (v !== undefined) setValues[k] = v;
          }
          if (Object.keys(setValues).length > 0) {
            await db.update(cmVarianceItems).set(setValues).where(eq(cmVarianceItems.id, id));
          }
          return { success: true };
        }),
      resolve: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertVarianceAccess(db, ctx, input.id);
          await db.update(cmVarianceItems).set({
            resolvedAt: new Date(),
            resolvedBy: ctx.user.id,
          }).where(eq(cmVarianceItems.id, input.id));
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertVarianceAccess(db, ctx, input.id);
          await db.delete(cmVarianceItems).where(eq(cmVarianceItems.id, input.id));
          return { success: true };
        }),
    }),

    // ─── Component Orders CRUD ───────────────────────────────────────────
    componentOrders: router({
      list: protectedProcedure
        .input(z.object({ workbookId: z.number() }))
        .query(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) return [];
          await assertWorkbookAccess(db, ctx, input.workbookId);
          return db.select().from(cmComponentOrders)
            .where(eq(cmComponentOrders.workbookId, input.workbookId))
            .orderBy(desc(cmComponentOrders.createdAt));
        }),
      create: protectedProcedure
        .input(z.object({
          workbookId: z.number(),
          orderNumber: z.string().optional(),
          supplier: z.string().optional(),
          lineItems: z.any().optional(),
          totalCost: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertWorkbookAccess(db, ctx, input.workbookId);
          // Auto-generate order number if not provided
          const orderNum = input.orderNumber || `CO-${Date.now().toString(36).toUpperCase()}`;
          const [result] = await db.insert(cmComponentOrders).values({
            workbookId: input.workbookId,
            orderNumber: orderNum,
            supplier: input.supplier || null,
            lineItems: input.lineItems || [],
            totalCost: input.totalCost || null,
            notes: input.notes || null,
            orderedBy: ctx.user.id,
            orderedByName: ctx.user.name || "Unknown",
          });
          return { id: result.insertId, orderNumber: orderNum };
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(["draft", "submitted", "confirmed", "shipped", "received", "cancelled"]).optional(),
          supplier: z.string().nullable().optional(),
          lineItems: z.any().optional(),
          totalCost: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          orderedAt: z.string().nullable().optional(),
          receivedAt: z.string().nullable().optional(),
          autoReceiveToManufacturing: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const { id, autoReceiveToManufacturing, ...updates } = input;
          await assertComponentOrderAccess(db, ctx, id);
          const setValues: Record<string, any> = {};
          for (const [k, v] of Object.entries(updates)) {
            if (v !== undefined) {
              if ((k === "orderedAt" || k === "receivedAt") && v) {
                setValues[k] = new Date(v);
              } else {
                setValues[k] = v;
              }
            }
          }
          if (Object.keys(setValues).length > 0) {
            await db.update(cmComponentOrders).set(setValues).where(eq(cmComponentOrders.id, id));
          }
          // Auto-receive into manufacturing when status changes to submitted
          let manufacturingOrderId: number | null = null;
          if (input.status === "submitted" && autoReceiveToManufacturing !== false) {
            try {
              // Check if not already received
              const existing = await db.select({ id: manufacturingOrders.id }).from(manufacturingOrders)
                .where(eq(manufacturingOrders.componentOrderId, id));
              if (existing.length === 0) {
                const compOrder = await assertComponentOrderAccess(db, ctx, id);
                if (compOrder) {
                  // Get job info
                  const [job] = await db.select({
                    id: constructionJobs.id,
                    clientName: constructionJobs.clientName,
                    siteAddress: constructionJobs.siteAddress,
                  }).from(constructionJobs)
                    .innerJoin(
                      sql`check_measure_workbooks`,
                      sql`check_measure_workbooks.jobId = ${constructionJobs.id} AND check_measure_workbooks.id = ${compOrder.workbookId}`
                    );
                  if (job) {
                    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingOrders);
                    const orderNum = `MFG-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
                    const [orderResult] = await db.insert(manufacturingOrders).values({
                      componentOrderId: id,
                      jobId: job.id,
                      orderNumber: orderNum,
                      clientName: job.clientName,
                      siteAddress: job.siteAddress || undefined,
                      status: "received",
                      priority: "normal",
                      receivedBy: ctx.user.id,
                      receivedByName: ctx.user.name,
                    });
                    manufacturingOrderId = orderResult.insertId;
                    // Create tasks from line items
                    const lineItems = (compOrder.lineItems as any[]) || [];
                    if (lineItems.length > 0) {
                      const taskValues = lineItems.map((item: any) => ({
                        orderId: manufacturingOrderId!,
                        productCode: item.code || item.productCode || null,
                        productName: item.description || item.productName || item.name || "Unknown",
                        category: item.category || item.type || null,
                        colour: item.colour || item.color || null,
                        colourGroup: item.colourGroup || null,
                        quantity: item.qty || item.quantity || 1,
                        unit: item.unit || "ea",
                        length: item.length ? String(parseFloat(item.length)) : null,
                        width: item.width ? String(parseFloat(item.width)) : null,
                        description: item.notes || item.description || null,
                        sourceType: (item.sourceType === "procure" ? "procure" : "manufacture") as "manufacture" | "procure",
                        supplier: item.supplier || null,
                        status: "pending" as const,
                      }));
                      await db.insert(manufacturingTasks).values(taskValues);
                    }
                    // Auto-deduct inventory for allocated items
                    try {
                      for (const item of lineItems) {
                        const productCode = item.code || item.productCode;
                        const branchId = item.branchId;
                        if (productCode && branchId) {
                          // Find matching stock item by code and branch
                          const [stockItem] = await db.select().from(inventoryStockItems)
                            .where(and(
                              eq(inventoryStockItems.code, productCode),
                              eq(inventoryStockItems.branchId, branchId),
                              eq(inventoryStockItems.isActive, true)
                            ));
                          if (stockItem) {
                            const qty = item.qty || item.quantity || 1;
                            await db.insert(inventoryMovements).values({
                              stockItemId: stockItem.id,
                              branchId: branchId,
                              movementType: "allocation",
                              quantity: String(qty),
                              unitType: stockItem.unitType || "unit",
                              referenceType: "component_order",
                              referenceId: id,
                              unitCostAtTime: stockItem.costPrice || null,
                              notes: `Auto-allocated from component order ${orderNum} - ${item.description || item.name || productCode}`,
                              createdBy: ctx.user.name || "System",
                            });
                          }
                        }
                      }
                    } catch (invErr) {
                      console.error("[Inventory] Auto-deduct failed:", invErr);
                    }
                  }
                }
              }
            } catch (e) {
              console.error("[Manufacturing] Auto-receive failed:", e);
            }
          }
          return { success: true, manufacturingOrderId };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertComponentOrderAccess(db, ctx, input.id);
          await db.delete(cmComponentOrders).where(eq(cmComponentOrders.id, input.id));
          return { success: true };
        }),
    }),

    // ─── Trades Work Orders CRUD ─────────────────────────────────────────
    workOrders: router({
      list: protectedProcedure
        .input(z.object({ workbookId: z.number() }))
        .query(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) return [];
          await assertWorkbookAccess(db, ctx, input.workbookId);
          return db.select().from(cmWorkOrders)
            .where(eq(cmWorkOrders.workbookId, input.workbookId))
            .orderBy(desc(cmWorkOrders.createdAt));
        }),
      listByJob: protectedProcedure
        .input(z.object({ jobId: z.number() }))
        .query(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) return [];
          await assertJobAccess(db, ctx, input.jobId);
          return db.select().from(cmWorkOrders)
            .where(eq(cmWorkOrders.jobId, input.jobId))
            .orderBy(desc(cmWorkOrders.createdAt));
        }),
      create: protectedProcedure
        .input(z.object({
          workbookId: z.number(),
          jobId: z.number(),
          tradeType: z.string().min(1),
          description: z.string().optional(),
          scope: z.string().optional(),
          assignedTo: z.string().optional(),
          assignedPhone: z.string().optional(),
          assignedEmail: z.string().optional(),
          priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
          scheduledDate: z.string().optional(),
          estimatedCost: z.string().optional(),
          lineItems: z.any().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertWorkbookAccess(db, ctx, input.workbookId);
          await assertJobAccess(db, ctx, input.jobId);
          const orderNum = `WO-${Date.now().toString(36).toUpperCase()}`;
          const [result] = await db.insert(cmWorkOrders).values({
            workbookId: input.workbookId,
            jobId: input.jobId,
            orderNumber: orderNum,
            tradeType: input.tradeType,
            description: input.description || null,
            scope: input.scope || null,
            assignedTo: input.assignedTo || null,
            assignedPhone: input.assignedPhone || null,
            assignedEmail: input.assignedEmail || null,
            priority: input.priority || "normal",
            scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
            estimatedCost: input.estimatedCost || null,
            lineItems: input.lineItems || [],
            notes: input.notes || null,
            createdBy: ctx.user.id,
            createdByName: ctx.user.name || "Unknown",
          });
          return { id: result.insertId, orderNumber: orderNum };
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          tradeType: z.string().optional(),
          description: z.string().nullable().optional(),
          scope: z.string().nullable().optional(),
          assignedTo: z.string().nullable().optional(),
          assignedPhone: z.string().nullable().optional(),
          assignedEmail: z.string().nullable().optional(),
          status: z.enum(["draft", "issued", "accepted", "in_progress", "completed", "cancelled"]).optional(),
          priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
          scheduledDate: z.string().nullable().optional(),
          completedDate: z.string().nullable().optional(),
          estimatedCost: z.string().nullable().optional(),
          actualCost: z.string().nullable().optional(),
          lineItems: z.any().optional(),
          notes: z.string().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const { id, ...updates } = input;
          await assertWorkOrderAccess(db, ctx, id);
          const setValues: Record<string, any> = {};
          for (const [k, v] of Object.entries(updates)) {
            if (v !== undefined) {
              if ((k === "scheduledDate" || k === "completedDate") && v) {
                setValues[k] = new Date(v);
              } else {
                setValues[k] = v;
              }
            }
          }
          if (Object.keys(setValues).length > 0) {
            await db.update(cmWorkOrders).set(setValues).where(eq(cmWorkOrders.id, id));
          }
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          await assertWorkOrderAccess(db, ctx, input.id);
          await db.delete(cmWorkOrders).where(eq(cmWorkOrders.id, input.id));
          return { success: true };
        }),
    }),
  }),
  smsLogs: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      await assertJobAccess(db, ctx, input.jobId);
      return getSmsDeliveryLogsByJob(input.jobId);
    }),

  // ─── Bulk Notifications to Trades ─────────────────────────────────────────
  bulkNotify: router({
    sendSms: protectedProcedure
      .input(z.object({
        installerIds: z.array(z.number()).min(1),
        message: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        const installers = await db.select().from(constructionInstallers)
          .where(and(
            inArray(constructionInstallers.id, input.installerIds),
            ...installerScope(ctx),
          ));

        const senderNumber = process.env.VOCPHONE_SMS_SENDER || "61480855750";
        const results: Array<{ id: number; name: string; success: boolean; error?: string }> = [];

        for (const installer of installers) {
          if (!installer.phone) {
            results.push({ id: installer.id, name: installer.name, success: false, error: "No phone number" });
            continue;
          }
          let phone = installer.phone.replace(/[\s\-()]/g, "");
          if (phone.startsWith("0")) phone = "61" + phone.slice(1);
          if (phone.startsWith("+")) phone = phone.slice(1);

          try {
            await vocphone.sendSms({
              recipient: phone,
              sender: senderNumber,
              body: input.message,
            });
            // Log the SMS
            await db.insert(smsMessages).values({
              direction: "outbound",
              fromNumber: senderNumber,
              toNumber: phone,
              body: input.message,
              status: "sent",
              sentBy: ctx.user.id,
            });
            await createTradePortalNotificationMessage(db, installer.id, input.message, ctx.user.name);
            results.push({ id: installer.id, name: installer.name, success: true });
          } catch (err: any) {
            results.push({ id: installer.id, name: installer.name, success: false, error: err.message });
          }
        }

        return { sent: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
      }),

    sendEmail: protectedProcedure
      .input(z.object({
        installerIds: z.array(z.number()).min(1),
        subject: z.string().min(1),
        message: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        const installers = await db.select().from(constructionInstallers)
          .where(and(
            inArray(constructionInstallers.id, input.installerIds),
            ...installerScope(ctx),
          ));

        const results: Array<{ id: number; name: string; success: boolean; error?: string }> = [];

        for (const installer of installers) {
          if (!installer.email) {
            results.push({ id: installer.id, name: installer.name, success: false, error: "No email address" });
            continue;
          }
          try {
            const htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1e293b;">Hi ${installer.name},</h2>
                <div style="color: #334155; line-height: 1.6; white-space: pre-wrap;">${input.message}</div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #64748b; font-size: 12px;">This email was sent from Altaspan.</p>
              </div>
            `;
            const result = await sendNotificationEmail({
              to: installer.email,
              subject: input.subject,
              htmlBody,
            });
            if (result.success) {
              await createTradePortalNotificationMessage(db, installer.id, input.message, ctx.user.name);
            }
            results.push({ id: installer.id, name: installer.name, success: result.success, error: result.error });
          } catch (err: any) {
            results.push({ id: installer.id, name: installer.name, success: false, error: err.message });
          }
        }

        return { sent: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
      }),
  }),

  // ─── Dashboard Analytics ─────────────────────────────────────────────────
  dashboardAnalytics: router({
    // Upcoming milestones (PO milestones pending/claimed, upcoming scheduled starts)
    upcomingMilestones: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { milestones: [], upcomingStarts: [] };
        const lim = input?.limit || 20;
        const tenantConditions = jobScope(ctx);

        // Upcoming PO milestones that are pending or claimed
        const milestones = await db.select({
          id: poMilestones.id,
          jobId: poMilestones.jobId,
          stage: poMilestones.stage,
          description: poMilestones.description,
          amount: poMilestones.amount,
          status: poMilestones.status,
          sortOrder: poMilestones.sortOrder,
          clientName: constructionJobs.clientName,
          jobStatus: constructionJobs.status,
        }).from(poMilestones)
          .innerJoin(constructionJobs, eq(poMilestones.jobId, constructionJobs.id))
          .where(and(
            sql`${poMilestones.status} IN ('pending', 'claimed')`,
            sql`${constructionJobs.status} IN ('in_progress', 'scheduled')`,
            ...tenantConditions,
          ))
          .orderBy(poMilestones.sortOrder)
          .limit(lim);

        // Jobs with upcoming scheduled starts (next 30 days)
        const now = new Date();
        const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const upcomingStarts = await db.select({
          id: constructionJobs.id,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          scheduledStart: constructionJobs.scheduledStart,
          status: constructionJobs.status,
          priority: constructionJobs.priority,
        }).from(constructionJobs)
          .where(and(
            gte(constructionJobs.scheduledStart, now),
            lt(constructionJobs.scheduledStart, thirtyDaysOut),
            sql`${constructionJobs.status} IN ('scheduled', 'in_progress')`,
            ...tenantConditions,
          ))
          .orderBy(constructionJobs.scheduledStart)
          .limit(10);

        return { milestones, upcomingStarts };
      }),

    // Adviser/branch breakdown for construction jobs
    adviserBreakdown: protectedProcedure
      .input(z.object({ fyStartYear: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { byAdviser: [], byBranch: [] };

        const conditions: any[] = [];
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        appendConstructionFyScope(conditions, input?.fyStartYear);
        const where = conditions.length ? and(...conditions) : undefined;

        // By design adviser
        const byAdviser = await db.select({
          adviserName: constructionJobs.designAdviserName,
          total: sql<number>`COUNT(*)`,
          inProgress: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'in_progress' THEN 1 ELSE 0 END)`,
          completed: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
          scheduled: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'scheduled' THEN 1 ELSE 0 END)`,
          onHold: sql<number>`SUM(CASE WHEN ${constructionJobs.status} = 'on_hold' THEN 1 ELSE 0 END)`,
        }).from(constructionJobs)
          .where(where)
          .groupBy(constructionJobs.designAdviserName)
          .orderBy(sql`COUNT(*) DESC`);

        // By branch (from financials table)
        const byBranch = await db.select({
          branch: constructionJobFinancials.branch,
          total: sql<number>`COUNT(*)`,
          totalContractValue: sql<number>`SUM(COALESCE(CAST(${constructionJobFinancials.xeroContractValue} AS DECIMAL(12,2)), CAST(${constructionJobFinancials.contractValue} AS DECIMAL(12,2)), 0))`,
          totalInvoiced: sql<number>`SUM(COALESCE(CAST(${constructionJobFinancials.xeroInvoicedAmount} AS DECIMAL(12,2)), CAST(${constructionJobFinancials.invoicedAmount} AS DECIMAL(12,2)), 0))`,
        }).from(constructionJobFinancials)
          .innerJoin(constructionJobs, eq(constructionJobFinancials.jobId, constructionJobs.id))
          .where(where)
          .groupBy(constructionJobFinancials.branch)
          .orderBy(sql`COUNT(*) DESC`);

        return { byAdviser, byBranch };
      }),

    // Trade performance: each trade's jobs, invoiced, paid, outstanding
    tradePerformance: protectedProcedure
      .input(z.object({ fyStartYear: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        // Get all active installers with their assignment counts and invoice totals
        const trades = await db.select({
          id: constructionInstallers.id,
          name: constructionInstallers.name,
          speciality: constructionInstallers.speciality,
          tradeType: constructionInstallers.tradeType,
          phone: constructionInstallers.phone,
          email: constructionInstallers.email,
        }).from(constructionInstallers)
          .where(and(
            eq(constructionInstallers.active, true),
            ...installerScope(ctx),
          ))
          .orderBy(constructionInstallers.name);

        // Get assignment counts per installer
        const assignmentCounts = await db.select({
          installerId: constructionAssignments.installerId,
          jobCount: sql<number>`COUNT(DISTINCT ${constructionAssignments.jobId})`,
        }).from(constructionAssignments)
          .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
          .where(jobScope(ctx).length ? and(...jobScope(ctx)) : undefined)
          .groupBy(constructionAssignments.installerId);

        const assignMap: Record<number, number> = {};
        for (const a of assignmentCounts) {
          assignMap[a.installerId] = Number(a.jobCount);
        }

        // Get invoice totals per installer
        const invoiceTotals = await db.select({
          installerId: tradeInvoices.installerId,
          totalInvoiced: sql<number>`SUM(CAST(${tradeInvoices.amount} AS DECIMAL(12,2)))`,
          totalPaid: sql<number>`SUM(CASE WHEN ${tradeInvoices.status} = 'paid' THEN CAST(${tradeInvoices.amount} AS DECIMAL(12,2)) ELSE 0 END)`,
          invoiceCount: sql<number>`COUNT(*)`,
          pendingCount: sql<number>`SUM(CASE WHEN ${tradeInvoices.status} IN ('submitted', 'under_review', 'pending_approval', 'approved') THEN 1 ELSE 0 END)`,
        }).from(tradeInvoices)
          .innerJoin(constructionInstallers, eq(tradeInvoices.installerId, constructionInstallers.id))
          .where(installerScope(ctx).length ? and(...installerScope(ctx)) : undefined)
          .groupBy(tradeInvoices.installerId);

        const invoiceMap: Record<number, { totalInvoiced: number; totalPaid: number; invoiceCount: number; pendingCount: number }> = {};
        for (const i of invoiceTotals) {
          invoiceMap[i.installerId] = {
            totalInvoiced: Number(i.totalInvoiced) || 0,
            totalPaid: Number(i.totalPaid) || 0,
            invoiceCount: Number(i.invoiceCount) || 0,
            pendingCount: Number(i.pendingCount) || 0,
          };
        }

        return trades.map(t => ({
          ...t,
          jobsAssigned: assignMap[t.id] || 0,
          totalInvoiced: invoiceMap[t.id]?.totalInvoiced || 0,
          totalPaid: invoiceMap[t.id]?.totalPaid || 0,
          outstanding: (invoiceMap[t.id]?.totalInvoiced || 0) - (invoiceMap[t.id]?.totalPaid || 0),
          invoiceCount: invoiceMap[t.id]?.invoiceCount || 0,
          pendingInvoices: invoiceMap[t.id]?.pendingCount || 0,
        }));
      }),

    // Trade drill-down: get a specific trade's activity (jobs + invoices)
    tradeDetail: protectedProcedure
      .input(z.object({ installerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { installer: null, jobs: [], invoices: [] };

        const installer = await assertInstallerAccess(db, ctx, input.installerId);

        // Jobs assigned to this trade
        const assignments = await db.select({
          jobId: constructionAssignments.jobId,
          role: constructionAssignments.role,
          clientName: constructionJobs.clientName,
          jobStatus: constructionJobs.status,
          siteAddress: constructionJobs.siteAddress,
          quoteNumber: constructionJobs.quoteNumber,
        }).from(constructionAssignments)
          .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
          .where(and(
            eq(constructionAssignments.installerId, input.installerId),
            ...jobScope(ctx),
          ))
          .orderBy(desc(constructionJobs.updatedAt));

        // Invoices from this trade
        const invoices = await db.select({
          id: tradeInvoices.id,
          invoiceNumber: tradeInvoices.invoiceNumber,
          invoiceDate: tradeInvoices.invoiceDate,
          amount: tradeInvoices.amount,
          gstAmount: tradeInvoices.gstAmount,
          totalWithGst: tradeInvoices.totalWithGst,
          status: tradeInvoices.status,
          description: tradeInvoices.description,
          jobId: tradeInvoices.jobId,
          clientName: constructionJobs.clientName,
        }).from(tradeInvoices)
          .leftJoin(constructionJobs, eq(tradeInvoices.jobId, constructionJobs.id))
          .where(eq(tradeInvoices.installerId, input.installerId))
          .orderBy(desc(tradeInvoices.invoiceDate));

        return { installer, jobs: assignments, invoices };
      }),
  }),

  // ─── Purchase Orders (All Work Orders + PO Milestones) ──────────────────
  purchaseOrders: router({
    listAll: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        tradeType: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { workOrders: [], milestones: [] };

        // Fetch all work orders with job info
        const woConditions: any[] = [];
        if (input?.status && input.status !== "all") {
          woConditions.push(eq(cmWorkOrders.status, input.status as any));
        }
        if (input?.tradeType && input.tradeType !== "all") {
          woConditions.push(eq(cmWorkOrders.tradeType, input.tradeType));
        }
        woConditions.push(...jobScope(ctx));

        let workOrders = await db.select({
          id: cmWorkOrders.id,
          orderNumber: cmWorkOrders.orderNumber,
          tradeType: cmWorkOrders.tradeType,
          description: cmWorkOrders.description,
          assignedTo: cmWorkOrders.assignedTo,
          assignedPhone: cmWorkOrders.assignedPhone,
          assignedEmail: cmWorkOrders.assignedEmail,
          status: cmWorkOrders.status,
          priority: cmWorkOrders.priority,
          scheduledDate: cmWorkOrders.scheduledDate,
          completedDate: cmWorkOrders.completedDate,
          estimatedCost: cmWorkOrders.estimatedCost,
          actualCost: cmWorkOrders.actualCost,
          createdAt: cmWorkOrders.createdAt,
          jobId: cmWorkOrders.jobId,
          clientName: constructionJobs.clientName,
          jobStatus: constructionJobs.status,
        }).from(cmWorkOrders)
          .innerJoin(constructionJobs, eq(cmWorkOrders.jobId, constructionJobs.id))
          .where(woConditions.length > 0 ? and(...woConditions) : undefined)
          .orderBy(desc(cmWorkOrders.createdAt));

        // Apply search filter
        if (input?.search) {
          const s = input.search.toLowerCase();
          workOrders = workOrders.filter(wo =>
            wo.orderNumber?.toLowerCase().includes(s) ||
            wo.tradeType?.toLowerCase().includes(s) ||
            wo.assignedTo?.toLowerCase().includes(s) ||
            wo.clientName?.toLowerCase().includes(s) ||
            wo.description?.toLowerCase().includes(s)
          );
        }

        // Fetch all PO milestones with job info
        const milestones = await db.select({
          id: poMilestones.id,
          workOrderId: poMilestones.workOrderId,
          jobId: poMilestones.jobId,
          stage: poMilestones.stage,
          description: poMilestones.description,
          percentage: poMilestones.percentage,
          amount: poMilestones.amount,
          retentionPercent: poMilestones.retentionPercent,
          retentionAmount: poMilestones.retentionAmount,
          status: poMilestones.status,
          sortOrder: poMilestones.sortOrder,
          claimedAt: poMilestones.claimedAt,
          approvedAt: poMilestones.approvedAt,
          paidAt: poMilestones.paidAt,
          createdAt: poMilestones.createdAt,
          clientName: constructionJobs.clientName,
        }).from(poMilestones)
          .innerJoin(constructionJobs, eq(poMilestones.jobId, constructionJobs.id))
          .where(jobScope(ctx).length ? and(...jobScope(ctx)) : undefined)
          .orderBy(desc(poMilestones.createdAt));

        // Get unique trade types for filter
        const tradeTypes = Array.from(new Set(workOrders.map(wo => wo.tradeType)));

        // Summary stats
        const totalEstimated = workOrders.reduce((sum, wo) => sum + Number(wo.estimatedCost || 0), 0);
        const totalActual = workOrders.reduce((sum, wo) => sum + Number(wo.actualCost || 0), 0);
        const totalMilestoneValue = milestones.reduce((sum, m) => sum + Number(m.amount || 0), 0);
        const paidMilestoneValue = milestones.filter(m => m.status === "paid").reduce((sum, m) => sum + Number(m.amount || 0), 0);

        return {
          workOrders,
          milestones,
          tradeTypes,
          stats: {
            totalWorkOrders: workOrders.length,
            totalEstimated,
            totalActual,
            totalMilestoneValue,
            paidMilestoneValue,
            pendingMilestones: milestones.filter(m => m.status === "pending").length,
            claimedMilestones: milestones.filter(m => m.status === "claimed").length,
            paidMilestones: milestones.filter(m => m.status === "paid").length,
          },
        };
      }),

    bulkUpdateMilestones: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        status: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

        const now = Date.now();
        const updates: Record<string, any> = { status: input.status };
        if (input.status === "claimed") updates.claimedAt = now;
        if (input.status === "approved") updates.approvedAt = now;
        if (input.status === "paid") updates.paidAt = now;

        let updated = 0;
        for (const id of input.ids) {
          const conditions = [eq(poMilestones.id, id)];
          conditions.push(...jobScope(ctx));
          const [milestone] = await db.select({ id: poMilestones.id })
            .from(poMilestones)
            .innerJoin(constructionJobs, eq(poMilestones.jobId, constructionJobs.id))
            .where(and(...conditions));
          if (!milestone) continue;
          const result = await db.update(poMilestones)
            .set(updates)
            .where(eq(poMilestones.id, id));
          updated++;
        }
        return { updated };
      }),
  }),

  // ─── Job Communications (Email & SMS tab) ──────────────────────────────
  jobComms: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertJobAccess(db, ctx, input.jobId);
        return db.select().from(jobCommunications)
          .where(eq(jobCommunications.jobId, input.jobId))
          .orderBy(desc(jobCommunications.createdAt));
      }),
    send: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        type: z.enum(["email", "sms"]),
        recipientName: z.string(),
        recipientContact: z.string(),
        subject: z.string().optional(),
        body: z.string().min(1),
        templateId: z.number().optional(),
        templateName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertJobAccess(db, ctx, input.jobId);
        // Actually send the message
        let sendFailed: string | null = null;
        if (input.type === "sms") {
          try {
            const senderNumber = process.env.VOCPHONE_SMS_SENDER || "61480855750";
            let phone = input.recipientContact.replace(/[\s\-()]/g, "");
            if (phone.startsWith("+")) phone = phone.slice(1);
            if (phone.startsWith("0")) phone = "61" + phone.slice(1);
            await vocphone.sendSms({ recipient: phone, sender: senderNumber, body: input.body });
          } catch (err: any) {
            console.error("[JobComms] SMS send failed:", err);
            sendFailed = err.message || "SMS send failed";
          }
        } else {
          try {
            await sendNotificationEmail({
              to: input.recipientContact,
              subject: input.subject || "Message from Altaspan",
              htmlBody: `<p>${input.body.replace(/\n/g, "<br>")}</p>`,
            });
          } catch (err: any) {
            console.error("[JobComms] Email send failed:", err);
            sendFailed = err.message || "Email send failed";
          }
        }
        // Log the communication with delivery status
        const deliveryStatus = sendFailed ? "failed" : (input.type === "email" ? "delivered" : "sent");
        const [result] = await db.insert(jobCommunications).values({
          jobId: input.jobId,
          type: input.type,
          direction: "outbound",
          recipientName: input.recipientName,
          recipientContact: input.recipientContact,
          subject: input.subject || null,
          body: input.body,
          templateId: input.templateId || null,
          templateName: input.templateName || null,
          status: deliveryStatus,
          deliveredAt: !sendFailed ? new Date() : null,
          failedReason: sendFailed || null,
          sentBy: ctx.user.id,
          sentByName: ctx.user.name || "Unknown",
        });
        return { id: result.insertId };
      }),
    bulkSend: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        type: z.enum(["email", "sms"]),
        subject: z.string().optional(),
        body: z.string().min(1),
        recipients: z.array(z.object({
          name: z.string(),
          contact: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertJobAccess(db, ctx, input.jobId);
        let sent = 0;
        for (const r of input.recipients) {
          let bulkFailed: string | null = null;
          try {
            if (input.type === "sms") {
              const senderNumber = process.env.VOCPHONE_SMS_SENDER || "61480855750";
              let phone = r.contact.replace(/[\s\-()]/g, "");
              if (phone.startsWith("+")) phone = phone.slice(1);
              if (phone.startsWith("0")) phone = "61" + phone.slice(1);
              await vocphone.sendSms({ recipient: phone, sender: senderNumber, body: input.body });
            } else {
              await sendNotificationEmail({
                to: r.contact,
                subject: input.subject || "Message from Altaspan",
                htmlBody: `<p>${input.body.replace(/\n/g, "<br>")}</p>`,
              });
            }
            sent++;
          } catch (err: any) {
            console.error(`[JobComms] Failed to send ${input.type} to ${r.name}:`, err);
            bulkFailed = err.message || `${input.type} send failed`;
          }
          // Log each with delivery status
          await db.insert(jobCommunications).values({
            jobId: input.jobId,
            type: input.type,
            direction: "outbound",
            recipientName: r.name,
            recipientContact: r.contact,
            subject: input.subject || null,
            body: input.body,
            status: bulkFailed ? "failed" : (input.type === "email" ? "delivered" : "sent"),
            deliveredAt: !bulkFailed ? new Date() : null,
            failedReason: bulkFailed || null,
            sentBy: ctx.user.id,
            sentByName: ctx.user.name || "Unknown",
          });
        }
        return { sent, total: input.recipients.length };
      }),
    smsTemplates: protectedProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const cat = input?.category;
        const conditions: any[] = [];
        appendTenantScope(conditions, smsTemplates.tenantId, tenantIdFromContext(ctx));
        if (cat) conditions.push(like(smsTemplates.category, `${cat}%`));
        if (cat) {
          return db.select().from(smsTemplates)
            .where(and(...conditions))
            .orderBy(smsTemplates.category, smsTemplates.sortOrder);
        }
        return db.select().from(smsTemplates)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(smsTemplates.category, smsTemplates.sortOrder);
      }),
    emailTemplates: protectedProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const cat = input?.category;
        const conditions: any[] = [];
        appendTenantScope(conditions, emailTemplates.tenantId, tenantIdFromContext(ctx));
        if (cat) conditions.push(eq(emailTemplates.category, cat));
        if (cat) {
          return db.select().from(emailTemplates)
            .where(and(...conditions));
        }
        return db.select().from(emailTemplates).where(conditions.length ? and(...conditions) : undefined);
      }),
  }),

  // ─── Work Orders (by jobId) ────────────────────────────────────────────
  jobWorkOrders: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertJobAccess(db, ctx, input.jobId);
        // Get workbook for this job
        const [wb] = await db.select({ id: checkMeasureWorkbooks.id })
          .from(checkMeasureWorkbooks)
          .where(eq(checkMeasureWorkbooks.jobId, input.jobId));
        if (!wb) return [];
        const wos = await db.select().from(cmWorkOrders)
          .where(eq(cmWorkOrders.workbookId, wb.id))
          .orderBy(desc(cmWorkOrders.createdAt));
        // Get milestones for each work order
        const woIds = wos.map(w => w.id);
        let allMilestones: any[] = [];
        if (woIds.length > 0) {
          allMilestones = await db.select().from(poMilestones)
            .where(inArray(poMilestones.workOrderId, woIds));
        }
        const milestonesByWo: Record<number, any[]> = {};
        for (const m of allMilestones) {
          if (m.workOrderId && woIds.includes(m.workOrderId)) {
            if (!milestonesByWo[m.workOrderId]) milestonesByWo[m.workOrderId] = [];
            milestonesByWo[m.workOrderId].push(m);
          }
        }
        return wos.map(wo => ({ ...wo, milestones: milestonesByWo[wo.id] || [] }));
      }),
    create: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        tradeType: z.string().optional(),
        scope: z.string().optional(),
        assignedTo: z.string().optional(),
        scheduledDate: z.string().optional(),
        estimatedCost: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        lineItems: z.any().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertJobAccess(db, ctx, input.jobId);
        // Get or create workbook for this job
        let [wb] = await db.select({ id: checkMeasureWorkbooks.id })
          .from(checkMeasureWorkbooks)
          .where(eq(checkMeasureWorkbooks.jobId, input.jobId));
        if (!wb) {
          const [result] = await db.insert(checkMeasureWorkbooks).values({
            jobId: input.jobId,
            title: "Construction Workbook",
          });
          wb = { id: result.insertId };
        }
        const woNum = `WO-${Date.now().toString(36).toUpperCase()}`;
        const [result] = await db.insert(cmWorkOrders).values({
          workbookId: wb.id,
          jobId: input.jobId,
          orderNumber: woNum,
          tradeType: input.tradeType || "General",
          scope: input.scope || null,
          assignedTo: input.assignedTo || null,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
          estimatedCost: input.estimatedCost || null,
          priority: input.priority || "normal",
          lineItems: input.lineItems || [],
          notes: input.notes || null,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name || "Unknown",
        });
        return { id: result.insertId, orderNumber: woNum };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "issued", "accepted", "in_progress", "completed", "cancelled"]).optional(),
        tradeType: z.string().nullable().optional(),
        scope: z.string().nullable().optional(),
        assignedTo: z.string().nullable().optional(),
        scheduledDate: z.string().nullable().optional(),
        estimatedCost: z.string().nullable().optional(),
        actualCost: z.string().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { id, ...updates } = input;
        await assertWorkOrderAccess(db, ctx, id);
        const setValues: Record<string, any> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) {
            if (k === "scheduledDate" && v) {
              setValues[k] = new Date(v as string);
            } else {
              setValues[k] = v;
            }
          }
        }
        if (Object.keys(setValues).length > 0) {
          await db.update(cmWorkOrders).set(setValues).where(eq(cmWorkOrders.id, id));
        }
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertWorkOrderAccess(db, ctx, input.id);
        await db.delete(cmWorkOrders).where(eq(cmWorkOrders.id, input.id));
        return { success: true };
      }),
    downloadPdf: protectedProcedure
      .input(z.object({ workOrderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const wo = await assertWorkOrderAccess(db, ctx, input.workOrderId);
        const [job] = await db.select().from(constructionJobs).where(eq(constructionJobs.id, wo.jobId));
        const pdfBuffer = await generateWorkOrderPdf({
          orderNumber: wo.orderNumber || `WO-${wo.id}`,
          tradeType: wo.tradeType,
          description: wo.description || undefined,
          scope: wo.scope || undefined,
          assignedTo: wo.assignedTo || undefined,
          assignedPhone: wo.assignedPhone || undefined,
          assignedEmail: wo.assignedEmail || undefined,
          priority: wo.priority,
          status: wo.status,
          scheduledDate: wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString("en-AU") : undefined,
          estimatedCost: wo.estimatedCost || undefined,
          lineItems: (wo.lineItems as any[]) || undefined,
          notes: wo.notes || undefined,
          builder: {
            companyName: "Commisso Group Pty Limited",
            tradingAs: "Altaspan",
            abn: "74 050 029 635",
            licenceAct: "2019/4380",
            licenceNsw: "338732C",
            phone: "(02) 6280 5300",
            email: "info@altaspan.com",
            accountsEmail: "accounts@commisso.com.au",
            address: "19 Grimwade Street, Mitchell ACT 2911",
          },
          jobNumber: job?.quoteNumber || undefined,
          clientName: job?.clientName || undefined,
          siteAddress: job?.siteAddress || undefined,
          createdByName: wo.createdByName || undefined,
          createdAt: wo.createdAt ? new Date(wo.createdAt).toLocaleDateString("en-AU") : undefined,
        });
        return { pdfBase64: pdfBuffer.toString("base64"), fileName: `${wo.orderNumber || `WO-${wo.id}`}.pdf` };
      }),
  }),

  // ─── Component Orders by jobId (Procurement tab) ───────────────────────
  jobComponentOrders: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertJobAccess(db, ctx, input.jobId);
        const [wb] = await db.select({ id: checkMeasureWorkbooks.id })
          .from(checkMeasureWorkbooks)
          .where(eq(checkMeasureWorkbooks.jobId, input.jobId));
        if (!wb) return [];
        return db.select().from(cmComponentOrders)
          .where(eq(cmComponentOrders.workbookId, wb.id))
          .orderBy(desc(cmComponentOrders.createdAt));
      }),
    create: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        orderNumber: z.string().optional(),
        supplier: z.string().optional(),
        lineItems: z.any().optional(),
        totalCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertJobAccess(db, ctx, input.jobId);
        let [wb] = await db.select({ id: checkMeasureWorkbooks.id })
          .from(checkMeasureWorkbooks)
          .where(eq(checkMeasureWorkbooks.jobId, input.jobId));
        if (!wb) {
          const [result] = await db.insert(checkMeasureWorkbooks).values({
            jobId: input.jobId,
            title: "Construction Workbook",
          });
          wb = { id: result.insertId };
        }
        const orderNum = input.orderNumber || `CO-${Date.now().toString(36).toUpperCase()}`;
        const [result] = await db.insert(cmComponentOrders).values({
          workbookId: wb.id,
          orderNumber: orderNum,
          supplier: input.supplier || null,
          lineItems: input.lineItems || [],
          totalCost: input.totalCost || null,
          notes: input.notes || null,
          orderedBy: ctx.user.id,
          orderedByName: ctx.user.name || "Unknown",
        });
        return { id: result.insertId, orderNumber: orderNum };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "submitted", "confirmed", "shipped", "received", "cancelled"]).optional(),
        supplier: z.string().nullable().optional(),
        lineItems: z.any().optional(),
        totalCost: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { id, ...updates } = input;
        await assertComponentOrderAccess(db, ctx, id);
        const setValues: Record<string, any> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) setValues[k] = v;
        }
        if (Object.keys(setValues).length > 0) {
          await db.update(cmComponentOrders).set(setValues).where(eq(cmComponentOrders.id, id));
        }
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertComponentOrderAccess(db, ctx, input.id);
        await db.delete(cmComponentOrders).where(eq(cmComponentOrders.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Shared Files (admin shares docs with trades) ─────────────────────────
  sharedFiles: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertJobAccess(db, ctx, input.jobId);
        return db.select().from(jobSharedFiles)
          .where(eq(jobSharedFiles.jobId, input.jobId))
          .orderBy(desc(jobSharedFiles.createdAt));
      }),
    upload: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        fileType: z.string().optional(),
        fileSize: z.number().optional(),
        category: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertJobAccess(db, ctx, input.jobId);
        const buffer = Buffer.from(input.fileBase64, "base64");
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `shared-files/job-${input.jobId}/${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.fileType || "application/octet-stream");
        const [result] = await db.insert(jobSharedFiles).values({
          jobId: input.jobId,
          fileName: input.fileName,
          fileUrl: url,
          fileKey,
          fileType: input.fileType || null,
          fileSize: input.fileSize || null,
          category: input.category || null,
          description: input.description || null,
          uploadedBy: ctx.user.id,
        });

        // Push notification to trade portal users assigned to this job
        triggerPushSharedFileUploaded(input.jobId, input.fileName);

        return { id: result.insertId, url };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertSharedFileAccess(db, ctx, input.id);
        await db.delete(jobSharedFiles).where(eq(jobSharedFiles.id, input.id));
        return { success: true };
      }),
    toggleVisibility: protectedProcedure
      .input(z.object({ id: z.number(), visible: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await assertSharedFileAccess(db, ctx, input.id);
        await db.update(jobSharedFiles)
          .set({ visible: input.visible ? 1 : 0 })
          .where(eq(jobSharedFiles.id, input.id));
        return { success: true };
      }),
    // Share a file (typically a photo) to the Client Portal Documents section
    shareToClientPortal: protectedProcedure
      .input(z.object({
        fileId: z.number(),
        title: z.string().min(1),
        category: z.enum(["contract", "plans", "variation", "invoice", "photos", "other"]).default("photos"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        // Get the shared file
        const file = await assertSharedFileAccess(db, ctx, input.fileId);

        // Insert into portal_documents for the client portal
        const { portalDocuments } = await import("../drizzle/schema");
        const [result] = await db.insert(portalDocuments).values({
          constructionJobId: file.jobId,
          title: input.title,
          category: input.category,
          fileUrl: file.fileUrl,
          fileKey: file.fileKey || null,
          mimeType: file.fileType || null,
          uploadedBy: ctx.user.id,
        }).$returningId();

        return { id: result.id };
      }),
    // Bulk share photos to client portal
    bulkShareToClientPortal: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        fileIds: z.array(z.number()).min(1),
        category: z.enum(["contract", "plans", "variation", "invoice", "photos", "other"]).default("photos"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { portalDocuments } = await import("../drizzle/schema");
        await assertJobAccess(db, ctx, input.jobId);

        // Get all selected files
        const fileConditions = [
            eq(jobSharedFiles.jobId, input.jobId),
            inArray(jobSharedFiles.id, input.fileIds),
          ];
        appendTenantScope(fileConditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const rows = await db.select({ file: jobSharedFiles }).from(jobSharedFiles)
          .innerJoin(constructionJobs, eq(jobSharedFiles.jobId, constructionJobs.id))
          .where(and(...fileConditions));
        const files = rows.map(r => r.file);

        if (files.length === 0) throw new Error("No files found");

        // Insert each as a portal document
        const values = files.map(f => ({
          constructionJobId: input.jobId,
          title: f.fileName,
          category: input.category,
          fileUrl: f.fileUrl,
          fileKey: f.fileKey || null,
          mimeType: f.fileType || null,
          uploadedBy: ctx.user.id,
        }));

        await db.insert(portalDocuments).values(values);

        return { shared: files.length };
      }),
  }),
});
