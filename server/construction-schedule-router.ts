import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { constructionScheduleEvents, constructionJobs, constructionInstallers, constructionHolidayCalendarDays, tradeAvailabilities } from "../drizzle/schema";
import { eq, and, gte, lte, inArray, isNull, or, asc } from "drizzle-orm";
import { notifyScheduleEventCreated, notifyScheduleEventUpdated } from "./construction-notifications";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";
import { isAdminRole } from "@shared/const";
import {
  AU_HOLIDAY_JURISDICTIONS,
  type AuHolidayJurisdiction,
  dateKeyRange,
  dateKeyToStorageDate,
  generateAustralianHolidays,
  isWeekendDateKey,
  toDateKey,
} from "./_core/australianHolidays";

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

function holidayTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionHolidayCalendarDays.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tenantIdentityCondition(column: any, tenantId: number | null | undefined) {
  return tenantId == null ? isNull(column) : eq(column, tenantId);
}

function parseScheduleDateTime(value: string | null | undefined, fieldName: string, required = false) {
  if (value == null || value === "") {
    if (required) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${fieldName} is required` });
    }
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${fieldName} must be a valid date/time` });
  }
  return parsed;
}

function assertScheduleRange(startTime: Date, endTime: Date | null) {
  if (endTime && endTime < startTime) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after the start date" });
  }
}

function enumerateDateKeys(startKey: string, endKey: string) {
  const keys: string[] = [];
  const cursor = dateKeyToStorageDate(startKey);
  for (let guard = 0; guard < 370 && toDateKey(cursor) <= endKey; guard += 1) {
    keys.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
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
  holidayCalendar: protectedProcedure
    .input(z.object({
      year: z.number().min(2020).max(2050).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      activeOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input?.year) conditions.push(eq(constructionHolidayCalendarDays.year, input.year));
      const { startKey, endKey } = dateKeyRange(input?.startDate, input?.endDate);
      if (startKey) conditions.push(gte(constructionHolidayCalendarDays.dateKey, startKey));
      if (endKey) conditions.push(lte(constructionHolidayCalendarDays.dateKey, endKey));
      if (input?.activeOnly !== false) conditions.push(eq(constructionHolidayCalendarDays.active, true));
      return db.select()
        .from(constructionHolidayCalendarDays)
        .where(and(...holidayTenantConditions(ctx, ...conditions)))
        .orderBy(asc(constructionHolidayCalendarDays.dateKey), asc(constructionHolidayCalendarDays.jurisdiction), asc(constructionHolidayCalendarDays.name));
    }),

  seedAustralianHolidays: protectedProcedure
    .input(z.object({
      year: z.number().min(2020).max(2050),
      jurisdictions: z.array(z.enum(AU_HOLIDAY_JURISDICTIONS)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user?.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required to import holiday calendar days" });
      }
      const db = await requireDb();
      const tenantId = tenantIdFromContext(ctx);
      const holidays = generateAustralianHolidays(input.year, (input.jurisdictions || ["NATIONAL", "ACT", "NSW"]) as AuHolidayJurisdiction[]);
      if (holidays.length === 0) return { inserted: 0, updated: 0, total: 0 };

      let inserted = 0;
      let updated = 0;
      for (const holiday of holidays) {
        const identity = and(
          tenantIdentityCondition(constructionHolidayCalendarDays.tenantId, tenantId),
          eq(constructionHolidayCalendarDays.dateKey, holiday.dateKey),
          eq(constructionHolidayCalendarDays.jurisdiction, holiday.jurisdiction),
          eq(constructionHolidayCalendarDays.name, holiday.name),
        );
        const [existing] = await db.select({ id: constructionHolidayCalendarDays.id })
          .from(constructionHolidayCalendarDays)
          .where(identity)
          .limit(1);

        if (existing?.id) {
          await db.update(constructionHolidayCalendarDays)
            .set({
              year: holiday.year,
              source: holiday.source,
              active: true,
            })
            .where(eq(constructionHolidayCalendarDays.id, existing.id));
          updated += 1;
        } else {
          await db.insert(constructionHolidayCalendarDays).values({
            tenantId,
            dateKey: holiday.dateKey,
            name: holiday.name,
            jurisdiction: holiday.jurisdiction,
            year: holiday.year,
            source: holiday.source,
            active: true,
            createdBy: ctx.user.id,
          });
          inserted += 1;
        }
      }
      return { inserted, updated, total: holidays.length };
    }),

  setHolidayActive: protectedProcedure
    .input(z.object({
      id: z.number(),
      active: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user?.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required to update holiday calendar days" });
      }
      const db = await requireDb();
      await db.update(constructionHolidayCalendarDays)
        .set({ active: input.active })
        .where(and(...holidayTenantConditions(ctx, eq(constructionHolidayCalendarDays.id, input.id))));
      return { success: true };
    }),

  availabilityBlocks: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      installerId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const { startKey, endKey } = dateKeyRange(input.startDate, input.endDate);
      if (!startKey || !endKey) return [];
      if (input.installerId) await requireInstallerAccess(db, ctx, input.installerId);

      const holidays = await db.select()
        .from(constructionHolidayCalendarDays)
        .where(and(...holidayTenantConditions(
          ctx,
          eq(constructionHolidayCalendarDays.active, true),
          gte(constructionHolidayCalendarDays.dateKey, startKey),
          lte(constructionHolidayCalendarDays.dateKey, endKey),
        )))
        .orderBy(asc(constructionHolidayCalendarDays.dateKey), asc(constructionHolidayCalendarDays.name));
      const holidaysByDate = new Map<string, typeof holidays>();
      for (const holiday of holidays) {
        const list = holidaysByDate.get(holiday.dateKey) || [];
        list.push(holiday);
        holidaysByDate.set(holiday.dateKey, list);
      }

      const availabilityByDate = new Map<string, typeof tradeAvailabilities.$inferSelect>();
      if (input.installerId) {
        const start = new Date(`${startKey}T00:00:00.000Z`);
        const end = new Date(`${endKey}T23:59:59.999Z`);
        const rows = await db.select()
          .from(tradeAvailabilities)
          .where(and(
            eq(tradeAvailabilities.installerId, input.installerId),
            gte(tradeAvailabilities.date, start),
            lte(tradeAvailabilities.date, end),
          ));
        for (const row of rows) {
          availabilityByDate.set(toDateKey(row.date), row);
        }
      }

      return enumerateDateKeys(startKey, endKey).map((dateKey) => {
        const holidayRows = holidaysByDate.get(dateKey) || [];
        const override = availabilityByDate.get(dateKey);
        const isWeekend = isWeekendDateKey(dateKey);
        const defaultUnavailable = isWeekend || holidayRows.length > 0;
        const unavailable = override?.status === "available" ? false : override?.status === "unavailable" ? true : defaultUnavailable;
        return {
          dateKey,
          isWeekend,
          holidays: holidayRows.map((holiday) => ({
            id: holiday.id,
            name: holiday.name,
            jurisdiction: holiday.jurisdiction,
          })),
          defaultUnavailable,
          unavailable,
          overrideStatus: override?.status || null,
          overrideNotes: override?.notes || null,
        };
      });
    }),

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
      if (input?.startDate && input?.endDate) {
        const rangeStart = new Date(input.startDate);
        const rangeEnd = new Date(input.endDate);
        conditions.push(and(
          lte(constructionScheduleEvents.startTime, rangeEnd),
          or(
            gte(constructionScheduleEvents.endTime, rangeStart),
            and(isNull(constructionScheduleEvents.endTime), gte(constructionScheduleEvents.startTime, rangeStart)),
          )!,
        ));
      } else {
        if (input?.startDate) conditions.push(gte(constructionScheduleEvents.startTime, new Date(input.startDate)));
        if (input?.endDate) conditions.push(lte(constructionScheduleEvents.startTime, new Date(input.endDate)));
      }
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
      const startTime = parseScheduleDateTime(input.startTime, "Start date", true)!;
      const endTime = parseScheduleDateTime(input.endTime, "End date");
      assertScheduleRange(startTime, endTime);
      const [result] = await db.insert(constructionScheduleEvents).values({
        tenantId: tenantIdFromContext(ctx),
        jobId: input.jobId,
        title: input.title,
        description: input.description,
        startTime,
        endTime: endTime || undefined,
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
      jobId: z.number().optional(),
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
      const existingEvent = await requireEventAccess(db, ctx, id);
      if (updates.jobId !== undefined) await requireJobAccess(db, ctx, updates.jobId);
      if (updates.assignedInstallerId) await requireInstallerAccess(db, ctx, updates.assignedInstallerId);
      const vals: any = {};
      if (updates.jobId !== undefined) vals.jobId = updates.jobId;
      if (updates.title !== undefined) vals.title = updates.title;
      if (updates.description !== undefined) vals.description = updates.description;
      let parsedStartTime: Date | undefined;
      let parsedEndTime: Date | null | undefined;
      if (updates.startTime !== undefined) {
        parsedStartTime = parseScheduleDateTime(updates.startTime, "Start date", true)!;
        vals.startTime = parsedStartTime;
      }
      if (updates.endTime !== undefined) {
        parsedEndTime = parseScheduleDateTime(updates.endTime, "End date");
        vals.endTime = parsedEndTime;
      }
      assertScheduleRange(
        parsedStartTime || existingEvent.startTime,
        parsedEndTime !== undefined ? parsedEndTime : existingEvent.endTime,
      );
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
