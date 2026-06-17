import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { constructionScheduleEvents, constructionJobs, constructionInstallers } from "../drizzle/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { notifyScheduleEventCreated, notifyScheduleEventUpdated } from "./construction-notifications";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

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

async function requireInstallerAccess(db: any, ctx: any, installerId: number) {
  const [installer] = await db.select()
    .from(constructionInstallers)
    .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, installerId))))
    .limit(1);
  if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Installer not found" });
  return installer;
}

async function requireEventAccess(db: any, ctx: any, eventId: number) {
  const [row] = await db.select({ event: constructionScheduleEvents })
    .from(constructionScheduleEvents)
    .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(constructionScheduleEvents.id, eventId))))
    .limit(1);
  if (!row?.event) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule event not found" });
  return row.event;
}

export const constructionScheduleRouter = router({
  list: protectedProcedure
    .input(z.object({
      jobId: z.number().optional(),
      startDate: z.string().optional(), // ISO date string
      endDate: z.string().optional(),
      installerId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input?.jobId) conditions.push(eq(constructionScheduleEvents.jobId, input.jobId));
      if (input?.startDate) conditions.push(gte(constructionScheduleEvents.startTime, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(constructionScheduleEvents.startTime, new Date(input.endDate)));
      if (input?.installerId) {
        await requireInstallerAccess(db, ctx, input.installerId);
        conditions.push(eq(constructionScheduleEvents.assignedInstallerId, input.installerId));
      }

      const rows = await db.select({ event: constructionScheduleEvents }).from(constructionScheduleEvents)
        .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx, ...conditions)))
        .orderBy(constructionScheduleEvents.startTime);
      const events = rows.map((row: any) => row.event);

      // Enrich with job and installer names
      const jobIds = Array.from(new Set(events.map(e => e.jobId)));
      const installerIds = Array.from(new Set(events.filter(e => e.assignedInstallerId).map(e => e.assignedInstallerId!)));

      const jobs = jobIds.length > 0
        ? await db.select({ id: constructionJobs.id, clientName: constructionJobs.clientName, siteAddress: constructionJobs.siteAddress })
            .from(constructionJobs)
            .where(and(...jobTenantConditions(ctx, inArray(constructionJobs.id, jobIds))))
        : [];
      const installers = installerIds.length > 0
        ? await db.select({ id: constructionInstallers.id, name: constructionInstallers.name })
            .from(constructionInstallers)
            .where(and(...installerTenantConditions(ctx, inArray(constructionInstallers.id, installerIds))))
        : [];

      const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));
      const installerMap = Object.fromEntries(installers.map(i => [i.id, i]));

      return events.map(e => ({
        ...e,
        jobClientName: jobMap[e.jobId]?.clientName || "Unknown",
        jobSiteAddress: jobMap[e.jobId]?.siteAddress || "",
        installerName: e.assignedInstallerId ? (installerMap[e.assignedInstallerId]?.name || "Unassigned") : null,
      }));
    }),

  create: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      startTime: z.string(), // ISO string
      endTime: z.string().optional(),
      allDay: z.boolean().optional(),
      eventType: z.enum(["installation", "inspection", "meeting", "delivery", "other"]).optional(),
      assignedInstallerId: z.number().optional(),
      notifyClient: z.boolean().optional(),
      notifyInstaller: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireJobAccess(db, ctx, input.jobId);
      if (input.assignedInstallerId) await requireInstallerAccess(db, ctx, input.assignedInstallerId);
      const [result] = await db.insert(constructionScheduleEvents).values({
        tenantId: tenantIdFromContext(ctx),
        jobId: input.jobId,
        title: input.title,
        description: input.description,
        startTime: new Date(input.startTime),
        endTime: input.endTime ? new Date(input.endTime) : undefined,
        allDay: input.allDay || false,
        eventType: input.eventType || "installation",
        assignedInstallerId: input.assignedInstallerId,
        notifyClient: input.notifyClient || false,
        notifyInstaller: input.notifyInstaller || false,
        createdBy: ctx.user.id,
      });
      // Fire-and-forget notification
      const insertedId = result.insertId;
      notifyScheduleEventCreated(insertedId).catch(() => {});

      return { id: insertedId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      allDay: z.boolean().optional(),
      eventType: z.enum(["installation", "inspection", "meeting", "delivery", "other"]).optional(),
      assignedInstallerId: z.number().nullable().optional(),
      notifyClient: z.boolean().optional(),
      notifyInstaller: z.boolean().optional(),
      status: z.enum(["scheduled", "confirmed", "completed", "cancelled"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { id, ...updates } = input;
      await requireEventAccess(db, ctx, id);
      if (updates.assignedInstallerId) await requireInstallerAccess(db, ctx, updates.assignedInstallerId);
      const vals: any = {};
      if (updates.title !== undefined) vals.title = updates.title;
      if (updates.description !== undefined) vals.description = updates.description;
      if (updates.startTime !== undefined) vals.startTime = new Date(updates.startTime);
      if (updates.endTime !== undefined) vals.endTime = updates.endTime ? new Date(updates.endTime) : null;
      if (updates.allDay !== undefined) vals.allDay = updates.allDay;
      if (updates.eventType !== undefined) vals.eventType = updates.eventType;
      if (updates.assignedInstallerId !== undefined) vals.assignedInstallerId = updates.assignedInstallerId;
      if (updates.notifyClient !== undefined) vals.notifyClient = updates.notifyClient;
      if (updates.notifyInstaller !== undefined) vals.notifyInstaller = updates.notifyInstaller;
      if (updates.status !== undefined) vals.status = updates.status;
      await db.update(constructionScheduleEvents).set(vals).where(eq(constructionScheduleEvents.id, id));

      // Fire-and-forget notification with change summary
      const changes = Object.keys(updates).filter(k => (updates as any)[k] !== undefined && k !== 'id');
      if (changes.length > 0) {
        notifyScheduleEventUpdated(id, changes).catch(() => {});
      }

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireEventAccess(db, ctx, input.id);
      await db.delete(constructionScheduleEvents).where(eq(constructionScheduleEvents.id, input.id));
      return { success: true };
    }),
});
