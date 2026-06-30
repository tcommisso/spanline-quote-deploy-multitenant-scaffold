import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  constructionAssignments,
  constructionScheduleEvents,
  constructionJobs,
  constructionInstallers,
  constructionHolidayCalendarDays,
  notificationLog,
  tradeAvailabilities,
  users,
} from "../drizzle/schema";
import { eq, and, gte, lte, inArray, isNull, or, asc } from "drizzle-orm";
import { notifyScheduleEventCreated, notifyScheduleEventUpdated } from "./construction-notifications";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";
import { isAdminRole } from "@shared/const";
import { sendPushToUser } from "./push";
import { getTradeReadinessMap, tradeReadinessKey, type TradeReadiness } from "./construction-trade-readiness";
import {
  AU_HOLIDAY_JURISDICTIONS,
  type AuHolidayJurisdiction,
  dateKeyRange,
  dateKeyToStorageDate,
  generateAustralianHolidays,
  isValidDateKey,
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

function holidayIdentityKey(value: { dateKey: string; jurisdiction: string; name: string }) {
  return `${value.dateKey}|${value.jurisdiction}|${value.name.trim().toLowerCase()}`;
}

async function nullableExistingUserId(db: any, userId: unknown): Promise<number | null> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user?.id ?? null;
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
  if (!isValidDateKey(startKey) || !isValidDateKey(endKey)) return [];
  const keys: string[] = [];
  const cursor = dateKeyToStorageDate(startKey);
  const end = dateKeyToStorageDate(endKey);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return [];

  const rangeDays = Math.floor((end.getTime() - cursor.getTime()) / 86400000) + 1;
  if (rangeDays > 370) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Schedule date range is too large" });
  }

  for (let guard = 0; guard < rangeDays; guard += 1) {
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

async function ensureJobChatMembership(db: any, ctx: any, job: any, installerId?: number | null) {
  const tenantId = tenantIdFromContext(ctx);
  const [existingChannel] = await db.select({ id: chatChannels.id })
    .from(chatChannels)
    .where(and(eq(chatChannels.type, "job"), eq(chatChannels.jobId, job.id)))
    .limit(1);

  let channelId = existingChannel?.id;
  if (!channelId) {
    const [result] = await db.insert(chatChannels).values({
      tenantId,
      name: `${job.quoteNumber || `JOB-${job.id}`} - ${job.clientName || "Unknown Client"}`,
      type: "job",
      jobId: job.id,
    });
    channelId = Number(result.insertId);
  }

  const schedulerId = ctx.user?.id;
  if (schedulerId) {
    const [existingSchedulerMember] = await db.select({ id: chatChannelMembers.id })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.memberType, "user"),
        eq(chatChannelMembers.memberId, schedulerId),
      ))
      .limit(1);
    if (!existingSchedulerMember) {
      await db.insert(chatChannelMembers).values({
        tenantId,
        channelId,
        userId: schedulerId,
        memberType: "user",
        memberId: schedulerId,
        role: "member",
      });
    }
  }

  if (installerId) {
    const [existingTradeMember] = await db.select({ id: chatChannelMembers.id })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.channelId, channelId),
        eq(chatChannelMembers.memberType, "trade"),
        eq(chatChannelMembers.memberId, installerId),
      ))
      .limit(1);
    if (!existingTradeMember) {
      await db.insert(chatChannelMembers).values({
        tenantId,
        channelId,
        userId: null,
        memberType: "trade",
        memberId: installerId,
        role: "member",
      });
    }
  }

  return channelId;
}

async function ensureScheduledTradeAssignment(db: any, ctx: any, job: any, installer: any) {
  const [existingAssignment] = await db.select({ id: constructionAssignments.id })
    .from(constructionAssignments)
    .where(and(
      eq(constructionAssignments.jobId, job.id),
      eq(constructionAssignments.installerId, installer.id),
    ))
    .limit(1);

  if (!existingAssignment) {
    await db.insert(constructionAssignments).values({
      jobId: job.id,
      installerId: installer.id,
      role: installer.tradeType || "installer",
    });
  }

  try {
    await ensureJobChatMembership(db, ctx, job, installer.id);
  } catch (err) {
    console.error("[ConstructionSchedule] Failed to sync job chat membership for scheduled trade:", err);
  }
  return { assignmentCreated: !existingAssignment };
}

function schedulerWarningContent(params: {
  eventId: number;
  eventTitle: string;
  job: any;
  installer: any;
  readiness: TradeReadiness;
}) {
  const warningLines = params.readiness.warnings.map((item) => `- ${item.label}: ${item.message}`).join("\n");
  return [
    `Schedule booking warning for event #${params.eventId}: ${params.eventTitle}`,
    "",
    `Client: ${params.job.clientName || "Unknown client"}`,
    `Site: ${params.job.siteAddress || "N/A"}`,
    `Trade: ${params.installer.name || `Trade #${params.installer.id}`}`,
    "",
    warningLines,
  ].join("\n");
}

async function notifySchedulerOfTradeReadiness(db: any, ctx: any, params: {
  eventId: number;
  eventTitle: string;
  job: any;
  installer: any;
  readiness: TradeReadiness | undefined;
}) {
  if (!params.readiness?.warnings.length || !ctx.user?.id) return;

  try {
    const tenantId = tenantIdFromContext(ctx);
    const channelId = await ensureJobChatMembership(db, ctx, params.job, params.installer.id);
    const content = schedulerWarningContent({
      eventId: params.eventId,
      eventTitle: params.eventTitle,
      job: params.job,
      installer: params.installer,
      readiness: params.readiness,
    });

    await db.insert(chatMessages).values({
      tenantId,
      channelId,
      senderId: ctx.user.id,
      senderName: "Schedule readiness",
      content,
      attachments: null,
      mentions: [ctx.user.id],
    });

    await db.update(chatChannels)
      .set({ updatedAt: new Date() })
      .where(eq(chatChannels.id, channelId));

    await db.insert(notificationLog).values({
      tenantId,
      type: "in_app",
      settingKey: "construction_schedule_readiness",
      recipientType: "user",
      recipientId: String(ctx.user.id),
      channel: "in_app",
      title: "Schedule booking needs review",
      status: "sent",
      metadata: JSON.stringify({
        eventId: params.eventId,
        jobId: params.job.id,
        installerId: params.installer.id,
        warningKeys: params.readiness.warnings.map((item) => item.key),
      }),
    });

    sendPushToUser(ctx.user.id, {
      title: "Schedule booking needs review",
      body: `${params.installer.name || "Trade"}: ${params.readiness.warningTags.join(", ")}`,
      url: "/construction/schedule",
      tag: `schedule-readiness-${params.eventId}`,
    }).catch(() => {});
  } catch (err) {
    console.error("[ConstructionSchedule] Failed to send scheduler readiness warning:", err);
  }
}

async function applyScheduledTradeSideEffects(db: any, ctx: any, params: {
  eventId: number;
  eventTitle: string;
  job: any;
  installer: any;
  notifyScheduler: boolean;
}) {
  await ensureScheduledTradeAssignment(db, ctx, params.job, params.installer);
  if (params.notifyScheduler) {
    try {
      const readinessMap = await getTradeReadinessMap(
        db,
        ctx,
        [{ jobId: params.job.id, installerId: params.installer.id }],
        new Map([[params.installer.id, params.installer]]),
      );
      const readiness = readinessMap.get(tradeReadinessKey(params.job.id, params.installer.id));
      await notifySchedulerOfTradeReadiness(db, ctx, {
        eventId: params.eventId,
        eventTitle: params.eventTitle,
        job: params.job,
        installer: params.installer,
        readiness,
      });
    } catch (err) {
      console.error("[ConstructionSchedule] Failed to evaluate scheduled trade readiness:", err);
    }
  }
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
      const jurisdictions = (input.jurisdictions?.length
        ? input.jurisdictions
        : ["NATIONAL", "ACT", "NSW"]) as AuHolidayJurisdiction[];
      const holidaysByKey = new Map<string, ReturnType<typeof generateAustralianHolidays>[number]>();
      for (const holiday of generateAustralianHolidays(input.year, jurisdictions).filter((holiday) => isValidDateKey(holiday.dateKey))) {
        holidaysByKey.set(holidayIdentityKey(holiday), holiday);
      }
      const holidays = Array.from(holidaysByKey.values());
      if (holidays.length === 0) return { inserted: 0, updated: 0, total: 0 };

      try {
        const existingRows = await db.select({
          dateKey: constructionHolidayCalendarDays.dateKey,
          jurisdiction: constructionHolidayCalendarDays.jurisdiction,
          name: constructionHolidayCalendarDays.name,
        })
          .from(constructionHolidayCalendarDays)
          .where(and(
            ...holidayTenantConditions(
              ctx,
              eq(constructionHolidayCalendarDays.year, input.year),
              inArray(constructionHolidayCalendarDays.jurisdiction, jurisdictions),
            ),
          ));
        const existingKeys = new Set(existingRows.map(holidayIdentityKey));
        const createdBy = await nullableExistingUserId(db, ctx.user?.id);
        const rows = holidays.map((holiday) => ({
          tenantId,
          dateKey: holiday.dateKey,
          name: holiday.name,
          jurisdiction: holiday.jurisdiction,
          year: holiday.year,
          source: holiday.source,
          active: true,
          createdBy,
        }));

        await db.insert(constructionHolidayCalendarDays)
          .values(rows)
          .onDuplicateKeyUpdate({
            set: {
              year: input.year,
              source: "built_in",
              active: true,
              updatedAt: new Date(),
            },
          });

        const inserted = rows.filter((row) => !existingKeys.has(holidayIdentityKey(row))).length;
        return { inserted, updated: rows.length - inserted, total: rows.length };
      } catch (err) {
        console.error("[ConstructionSchedule] Failed to import Australian holidays:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not import Australian holidays. Refresh the page and try again.",
        });
      }
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
        ? await db.select({
            id: constructionInstallers.id,
            name: constructionInstallers.name,
            phone: constructionInstallers.phone,
            email: constructionInstallers.email,
            tradeType: constructionInstallers.tradeType,
          })
            .from(constructionInstallers)
            .where(and(...installerTenantConditions(ctx, inArray(constructionInstallers.id, installerIds))))
        : [];

      const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));
      const installerMap = Object.fromEntries(installers.map(i => [i.id, i]));
      const readinessMap = await getTradeReadinessMap(
        db,
        ctx,
        events.map((event) => ({ jobId: event.jobId, installerId: event.assignedInstallerId })),
        new Map(installers.map((installer) => [installer.id, installer])),
      );

      return events.map(e => ({
        ...e,
        jobClientName: jobMap[e.jobId]?.clientName || "Unknown",
        jobSiteAddress: jobMap[e.jobId]?.siteAddress || "",
        installerName: e.assignedInstallerId ? (installerMap[e.assignedInstallerId]?.name || "Unassigned") : null,
        tradeReadiness: e.assignedInstallerId ? (readinessMap.get(tradeReadinessKey(e.jobId, e.assignedInstallerId)) || null) : null,
        readinessWarnings: e.assignedInstallerId ? (readinessMap.get(tradeReadinessKey(e.jobId, e.assignedInstallerId))?.warnings || []) : [],
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
      const job = await requireJobAccess(db, ctx, input.jobId);
      const installer = input.assignedInstallerId ? await requireInstallerAccess(db, ctx, input.assignedInstallerId) : null;
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
      if (installer) {
        await applyScheduledTradeSideEffects(db, ctx, {
          eventId: insertedId,
          eventTitle: input.title,
          job,
          installer,
          notifyScheduler: true,
        });
      }

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
      const nextJobId = updates.jobId !== undefined ? updates.jobId : existingEvent.jobId;
      const nextInstallerId = updates.assignedInstallerId !== undefined ? updates.assignedInstallerId : existingEvent.assignedInstallerId;
      if (nextInstallerId) {
        const [nextJob, nextInstaller] = await Promise.all([
          requireJobAccess(db, ctx, nextJobId),
          requireInstallerAccess(db, ctx, nextInstallerId),
        ]);
        await applyScheduledTradeSideEffects(db, ctx, {
          eventId: id,
          eventTitle: updates.title || existingEvent.title,
          job: nextJob,
          installer: nextInstaller,
          notifyScheduler: updates.jobId !== undefined || updates.assignedInstallerId !== undefined,
        });
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
