import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  branches,
  constructionAssignments,
  constructionScheduleEventExclusions,
  constructionScheduleEvents,
  constructionJobs,
  constructionInstallers,
  constructionHolidayCalendarDays,
  crmLeads,
  designAdvisors,
  manufacturingOrders,
  manufacturingSchedule,
  manufacturingTasks,
  notificationLog,
  tenantMemberships,
  tradeAvailabilities,
  users,
} from "../drizzle/schema";
import { eq, and, gte, lte, lt, gt, inArray, notInArray, isNull, or, asc, sql, isNotNull } from "drizzle-orm";
import { notifyScheduleEventCreated, notifyScheduleEventUpdated } from "./construction-notifications";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";
import { isAdminRole } from "@shared/const";
import { getTenantAppSetting, setTenantAppSetting } from "./tenant-settings-store";
import { sendPushToUser } from "./push";
import { getTradeReadinessMap, tradeReadinessKey, type TradeReadiness } from "./construction-trade-readiness";
import { ENV } from "./_core/env";
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
import {
  addDaysToDateOnly,
  APP_TIME_ZONE,
  formatDateInTimeZone,
  getDateTimePartsInTimeZone,
  zonedDateTimeToUnixSeconds,
} from "@shared/timezone";

const HOLIDAY_JURISDICTIONS_SETTING_KEY = "constructionHolidayJurisdictions";
const DEFAULT_HOLIDAY_JURISDICTIONS: AuHolidayJurisdiction[] = ["NATIONAL", "ACT", "NSW"];
const HOLIDAY_JURISDICTION_LABELS: Record<AuHolidayJurisdiction, string> = {
  NATIONAL: "National",
  ACT: "Australian Capital Territory",
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  NT: "Northern Territory",
};

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

function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

function holidayTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionHolidayCalendarDays.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function scheduleEventExclusionTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionScheduleEventExclusions.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, branches.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function holidayIdentityKey(value: { dateKey: string; jurisdiction: string; name: string }) {
  return `${value.dateKey}|${value.jurisdiction}|${value.name.trim().toLowerCase()}`;
}

function normalizeHolidayJurisdictions(value: unknown): AuHolidayJurisdiction[] {
  const allowed = new Set<AuHolidayJurisdiction>(AU_HOLIDAY_JURISDICTIONS);
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_HOLIDAY_JURISDICTIONS;
  const normalized: AuHolidayJurisdiction[] = [];

  for (const item of source) {
    if (!allowed.has(item as AuHolidayJurisdiction)) continue;
    const jurisdiction = item as AuHolidayJurisdiction;
    if (!normalized.includes(jurisdiction)) normalized.push(jurisdiction);
  }

  if (!normalized.includes("NATIONAL")) normalized.unshift("NATIONAL");
  return normalized.length > 0 ? normalized : DEFAULT_HOLIDAY_JURISDICTIONS;
}

async function getTenantHolidayJurisdictions(ctx: any) {
  const stored = await getTenantAppSetting<unknown>(tenantIdFromContext(ctx), HOLIDAY_JURISDICTIONS_SETTING_KEY);
  return normalizeHolidayJurisdictions(stored);
}

function holidayJurisdictionOptions() {
  return AU_HOLIDAY_JURISDICTIONS.map((value) => ({
    value,
    label: HOLIDAY_JURISDICTION_LABELS[value],
  }));
}

function rowsFromExecuteResult(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function hasDbColumn(db: any, tableName: string, columnName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
  return Number(rowsFromExecuteResult(result)?.[0]?.count || 0) > 0;
}

async function hasDbIndex(db: any, tableName: string, indexName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND index_name = ${indexName}
  `);
  return Number(rowsFromExecuteResult(result)?.[0]?.count || 0) > 0;
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

let scheduleEventStaffSchemaReady: Promise<void> | null = null;

async function ensureScheduleEventStaffSchema(db: any) {
  scheduleEventStaffSchemaReady ??= (async () => {
    if (!(await hasDbColumn(db, "construction_schedule_events", "assignedUserId"))) {
      await db.execute(sql.raw("ALTER TABLE `construction_schedule_events` ADD COLUMN `assignedUserId` int NULL AFTER `assignedInstallerId`"));
    }

    if (!(await hasDbIndex(db, "construction_schedule_events", "idx_construction_schedule_events_assigned_user"))) {
      await db.execute(sql.raw("CREATE INDEX `idx_construction_schedule_events_assigned_user` ON `construction_schedule_events` (`tenantId`, `assignedUserId`)"));
    }
  })().catch((err: unknown) => {
    scheduleEventStaffSchemaReady = null;
    throw err;
  });

  return scheduleEventStaffSchemaReady;
}

let scheduleEventExclusionsSchemaReady: Promise<void> | null = null;

async function ensureScheduleEventExclusionsSchema(db: any) {
  scheduleEventExclusionsSchemaReady ??= db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`construction_schedule_event_exclusions\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`tenantId\` int DEFAULT NULL,
      \`eventId\` int NOT NULL,
      \`dateKey\` varchar(10) NOT NULL,
      \`reason\` varchar(255) DEFAULT 'removed_day',
      \`createdBy\` int DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_construction_schedule_event_exclusion_day\` (\`tenantId\`, \`eventId\`, \`dateKey\`),
      KEY \`idx_construction_schedule_event_exclusions_tenant_event\` (\`tenantId\`, \`eventId\`),
      KEY \`idx_construction_schedule_event_exclusions_tenant_date\` (\`tenantId\`, \`dateKey\`),
      CONSTRAINT \`construction_schedule_event_exclusions_tenantId_tenants_id_fk\`
        FOREIGN KEY (\`tenantId\`) REFERENCES \`tenants\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT \`fk_sched_event_exclusion_event\`
        FOREIGN KEY (\`eventId\`) REFERENCES \`construction_schedule_events\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT \`construction_schedule_event_exclusions_createdBy_users_id_fk\`
        FOREIGN KEY (\`createdBy\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
    )
  `))
    .then(() => undefined)
    .catch((err: unknown) => {
      scheduleEventExclusionsSchemaReady = null;
      throw err;
    });

  return scheduleEventExclusionsSchemaReady;
}

let holidayCalendarSchemaReady: Promise<void> | null = null;

async function ensureHolidayCalendarSchema(db: any) {
  holidayCalendarSchemaReady ??= db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`construction_holiday_calendar_days\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`tenantId\` int DEFAULT NULL,
      \`dateKey\` varchar(10) NOT NULL,
      \`name\` varchar(255) NOT NULL,
      \`jurisdiction\` enum('NATIONAL','ACT','NSW','VIC','QLD','SA','WA','TAS','NT') NOT NULL DEFAULT 'NATIONAL',
      \`year\` int NOT NULL,
      \`source\` varchar(64) NOT NULL DEFAULT 'manual',
      \`active\` boolean NOT NULL DEFAULT true,
      \`createdBy\` int DEFAULT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_construction_holiday_tenant_day_jurisdiction_name\` (\`tenantId\`, \`dateKey\`, \`jurisdiction\`, \`name\`),
      KEY \`idx_construction_holiday_tenant_date\` (\`tenantId\`, \`dateKey\`),
      KEY \`idx_construction_holiday_tenant_year\` (\`tenantId\`, \`year\`),
      CONSTRAINT \`construction_holiday_calendar_days_tenantId_tenants_id_fk\`
        FOREIGN KEY (\`tenantId\`) REFERENCES \`tenants\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT \`construction_holiday_calendar_days_createdBy_users_id_fk\`
        FOREIGN KEY (\`createdBy\`) REFERENCES \`users\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
    )
  `))
    .then(() => undefined)
    .catch((err: unknown) => {
      holidayCalendarSchemaReady = null;
      throw err;
    });

  return holidayCalendarSchemaReady;
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

const MANUFACTURING_PLACEHOLDER_EVENT_TYPES = new Set(["installation", "delivery", "maintenance"]);

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

function appDateKey(value: Date | string | number) {
  try {
    return formatDateInTimeZone(value, APP_TIME_ZONE);
  } catch {
    return toDateKey(value);
  }
}

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

function localTimeStringForDate(value: Date | string | number, fallback: string) {
  try {
    const parts = getDateTimePartsInTimeZone(value, APP_TIME_ZONE);
    return `${padTimePart(parts.hour)}:${padTimePart(parts.minute)}:${padTimePart(parts.second)}`;
  } catch {
    return fallback;
  }
}

function dateKeyAtLocalTime(dateKey: string, time: string) {
  return new Date(zonedDateTimeToUnixSeconds(dateKey, time, APP_TIME_ZONE) * 1000);
}

async function getActiveHolidayDateKeys(db: any, ctx: any, startKey: string, endKey: string) {
  const rows = await db.select({ dateKey: constructionHolidayCalendarDays.dateKey })
    .from(constructionHolidayCalendarDays)
    .where(and(...holidayTenantConditions(
      ctx,
      eq(constructionHolidayCalendarDays.active, true),
      gte(constructionHolidayCalendarDays.dateKey, startKey),
      lte(constructionHolidayCalendarDays.dateKey, endKey),
    )));
  return new Set(rows.map((row: { dateKey: string }) => row.dateKey));
}

async function previousWorkingDateKeyBefore(db: any, ctx: any, startTime: Date) {
  const tradeStartKey = appDateKey(startTime);
  let candidateKey = addDaysToDateOnly(tradeStartKey, -1);
  const earliestKey = addDaysToDateOnly(candidateKey, -45);
  const holidayKeys = await getActiveHolidayDateKeys(db, ctx, earliestKey, candidateKey);

  for (let guard = 0; guard < 45; guard += 1) {
    if (!isWeekendDateKey(candidateKey) && !holidayKeys.has(candidateKey)) {
      return candidateKey;
    }
    candidateKey = addDaysToDateOnly(candidateKey, -1);
  }

  return candidateKey;
}

async function findManufacturingPlaceholderForScheduleEvent(db: any, ctx: any, eventId: number) {
  const [row] = await db.select({
    id: manufacturingSchedule.id,
    orderId: manufacturingSchedule.orderId,
    branchId: manufacturingSchedule.branchId,
    branchName: manufacturingSchedule.branchName,
  })
    .from(manufacturingSchedule)
    .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingSchedule.constructionScheduleEventId, eventId))))
    .limit(1);

  return row || null;
}

async function deleteManufacturingPlaceholderForScheduleEvent(db: any, ctx: any, eventId: number) {
  const existing = await findManufacturingPlaceholderForScheduleEvent(db, ctx, eventId);
  if (!existing) return;
  await db.delete(manufacturingSchedule).where(eq(manufacturingSchedule.id, existing.id));
}

async function findFirstManufacturingOrderForJob(db: any, ctx: any, jobId: number) {
  const leadJoinConditions: any[] = [eq(constructionJobs.leadId, crmLeads.id)];
  appendTenantScope(leadJoinConditions, crmLeads.tenantId, tenantIdFromContext(ctx));

  const [row] = await db.select({
    orderId: manufacturingOrders.id,
    orderNumber: manufacturingOrders.orderNumber,
    orderClientName: manufacturingOrders.clientName,
    jobClientName: constructionJobs.clientName,
    jobSiteAddress: constructionJobs.siteAddress,
    leadBranchId: crmLeads.branchId,
  })
    .from(manufacturingOrders)
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .leftJoin(crmLeads, and(...leadJoinConditions))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingOrders.jobId, jobId))))
    .orderBy(asc(manufacturingOrders.id))
    .limit(1);

  return row || null;
}

async function resolveManufacturingPlaceholderBranch(
  db: any,
  ctx: any,
  params: {
    orderId: number;
    leadBranchId?: number | null;
    existing?: { orderId: number; branchId: number; branchName: string } | null;
  },
) {
  const [taskBranch] = await db.select({
    branchId: manufacturingTasks.branchId,
    branchName: manufacturingTasks.branchName,
  })
    .from(manufacturingTasks)
    .where(and(
      eq(manufacturingTasks.orderId, params.orderId),
      isNotNull(manufacturingTasks.branchId),
    ))
    .orderBy(asc(manufacturingTasks.id))
    .limit(1);

  if (taskBranch?.branchId && taskBranch.branchName) {
    return { branchId: taskBranch.branchId, branchName: taskBranch.branchName };
  }

  if (params.leadBranchId) {
    const [branch] = await db.select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(and(...branchTenantConditions(
        ctx,
        eq(branches.id, params.leadBranchId),
        eq(branches.isActive, true),
      )))
      .limit(1);
    if (branch) return { branchId: branch.id, branchName: branch.name };
  }

  if (params.existing && params.existing.orderId === params.orderId) {
    return { branchId: params.existing.branchId, branchName: params.existing.branchName };
  }

  const tenantBranches = await db.select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(and(...branchTenantConditions(ctx, eq(branches.isActive, true))))
    .orderBy(asc(branches.name))
    .limit(2);
  if (tenantBranches.length === 1) {
    return { branchId: tenantBranches[0].id, branchName: tenantBranches[0].name };
  }

  return null;
}

async function syncManufacturingPlaceholderForScheduleEvent(db: any, ctx: any, event: {
  id: number;
  jobId: number;
  title: string;
  startTime: Date;
  eventType?: string | null;
  assignedInstallerId?: number | null;
  status?: string | null;
}) {
  const shouldHavePlaceholder = Boolean(event.assignedInstallerId)
    && event.status !== "cancelled"
    && MANUFACTURING_PLACEHOLDER_EVENT_TYPES.has(event.eventType || "installation");

  const existing = await findManufacturingPlaceholderForScheduleEvent(db, ctx, event.id);
  if (!shouldHavePlaceholder) {
    if (existing) await deleteManufacturingPlaceholderForScheduleEvent(db, ctx, event.id);
    return;
  }

  const manufacturingOrder = await findFirstManufacturingOrderForJob(db, ctx, event.jobId);
  if (!manufacturingOrder) {
    if (existing) await deleteManufacturingPlaceholderForScheduleEvent(db, ctx, event.id);
    return;
  }

  const branch = await resolveManufacturingPlaceholderBranch(db, ctx, {
    orderId: manufacturingOrder.orderId,
    leadBranchId: manufacturingOrder.leadBranchId,
    existing,
  });
  if (!branch) {
    if (existing) await deleteManufacturingPlaceholderForScheduleEvent(db, ctx, event.id);
    return;
  }

  const placeholderKey = await previousWorkingDateKeyBefore(db, ctx, event.startTime);
  const tradeStartKey = appDateKey(event.startTime);
  const clientName = manufacturingOrder.jobClientName || manufacturingOrder.orderClientName || "Client";
  const title = truncateText(`Pre-trade manufacturing placeholder - ${clientName}`, 255);
  const description = [
    `Auto-created from construction schedule event #${event.id}.`,
    `Trade start: ${tradeStartKey}.`,
    `Construction event: ${event.title}.`,
    manufacturingOrder.orderNumber ? `Manufacturing order: ${manufacturingOrder.orderNumber}.` : null,
    manufacturingOrder.jobSiteAddress ? `Site: ${manufacturingOrder.jobSiteAddress}.` : null,
  ].filter(Boolean).join("\n");

  const values = {
    orderId: manufacturingOrder.orderId,
    constructionScheduleEventId: event.id,
    branchId: branch.branchId,
    branchName: branch.branchName,
    scheduledDate: dateKeyToStorageDate(placeholderKey),
    scheduledEndDate: null,
    title,
    description,
    status: "scheduled" as const,
    assignedTo: null,
  };

  if (existing) {
    await db.update(manufacturingSchedule)
      .set(values)
      .where(eq(manufacturingSchedule.id, existing.id));
  } else {
    await db.insert(manufacturingSchedule).values({
      ...values,
      createdBy: ctx.user?.id ?? null,
    });
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

async function selectTenantStaffUsers(db: any, ctx: any, userIds?: number[]) {
  const tenantId = tenantIdFromContext(ctx);
  const userIdFilter = userIds?.length ? inArray(users.id, userIds) : undefined;
  let userRows: any[] = [];

  if (ENV.tenancyMode === "single") {
    const conditions = userIdFilter ? [userIdFilter] : [];
    const query = db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
      .from(users);
    if (conditions.length) {
      userRows = await query.where(and(...conditions)).orderBy(asc(users.name));
    } else {
      userRows = await query.orderBy(asc(users.name));
    }
  } else {
    if (!tenantId) return [];
    const conditions = [eq(tenantMemberships.tenantId, tenantId)];
    if (userIdFilter) conditions.push(userIdFilter);
    userRows = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(and(...conditions))
      .orderBy(asc(users.name));
  }

  if (userRows.length === 0) return [];

  const staffConditions: any[] = [eq(designAdvisors.archived, false)];
  appendTenantScope(staffConditions, designAdvisors.tenantId, tenantId);
  const branchJoinConditions: any[] = [eq(branches.id, designAdvisors.branchId)];
  appendTenantScope(branchJoinConditions, branches.tenantId, tenantId);

  const staffRows = await db.select({
    userId: designAdvisors.userId,
    email: designAdvisors.email,
    staffRole: designAdvisors.role,
    branchId: designAdvisors.branchId,
    branchName: branches.name,
  })
    .from(designAdvisors)
    .leftJoin(branches, and(...branchJoinConditions))
    .where(and(...staffConditions));

  const staffByUserId = new Map<number, any>();
  const staffByEmail = new Map<string, any>();
  for (const staff of staffRows as any[]) {
    if (staff.userId != null && !staffByUserId.has(Number(staff.userId))) {
      staffByUserId.set(Number(staff.userId), staff);
    }
    const email = normalizeEmail(staff.email);
    if (email && !staffByEmail.has(email)) staffByEmail.set(email, staff);
  }

  return userRows.map((user: any) => {
    const staffProfile = staffByUserId.get(Number(user.id)) ?? staffByEmail.get(normalizeEmail(user.email));
    return {
      ...user,
      staffRole: staffProfile?.staffRole || null,
      category: staffProfile?.staffRole || user.role || "user",
      branchId: staffProfile?.branchId ?? null,
      branchName: staffProfile?.branchName || null,
    };
  });
}

async function requireStaffUserAccess(db: any, ctx: any, userId: number) {
  const [user] = await selectTenantStaffUsers(db, ctx, [userId]);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Staff user not found" });
  return user;
}

async function requireEventAccess(db: any, ctx: any, eventId: number) {
  await ensureScheduleEventStaffSchema(db);
  const [row] = await db.select({ event: constructionScheduleEvents })
    .from(constructionScheduleEvents)
    .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(constructionScheduleEvents.id, eventId))))
    .limit(1);
  if (!row?.event) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule event not found" });
  return row.event;
}

async function deleteScheduleEventExclusionsOutsideRange(
  db: any,
  ctx: any,
  eventId: number,
  startKey: string,
  endKey: string,
) {
  await ensureScheduleEventExclusionsSchema(db);
  await db.delete(constructionScheduleEventExclusions)
    .where(and(...scheduleEventExclusionTenantConditions(
      ctx,
      eq(constructionScheduleEventExclusions.eventId, eventId),
      or(
        lt(constructionScheduleEventExclusions.dateKey, startKey),
        gt(constructionScheduleEventExclusions.dateKey, endKey),
      )!,
    )));
}

async function deleteAllScheduleEventExclusions(db: any, ctx: any, eventId: number) {
  await ensureScheduleEventExclusionsSchema(db);
  await db.delete(constructionScheduleEventExclusions)
    .where(and(...scheduleEventExclusionTenantConditions(
      ctx,
      eq(constructionScheduleEventExclusions.eventId, eventId),
    )));
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

async function notifyAssignedStaffOfScheduleEvent(params: {
  userId?: number | null;
  eventId: number;
  eventTitle: string;
  job: any;
  updated?: boolean;
}) {
  if (!params.userId) return;
  try {
    await sendPushToUser(params.userId, {
      title: params.updated ? "Schedule event updated" : "Schedule event assigned",
      body: `${params.eventTitle} - ${params.job?.clientName || "Construction job"}`,
      url: "/construction/schedule",
      tag: `schedule-event-${params.eventId}`,
    });
  } catch (err) {
    console.error("[ConstructionSchedule] Failed to notify assigned staff:", err);
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
  staffResources: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const staff = await selectTenantStaffUsers(db, ctx);
      return staff.map((user: any) => ({
        ...user,
        name: user.name || user.email || `User #${user.id}`,
      }));
    }),

  holidayCalendar: protectedProcedure
    .input(z.object({
      year: z.number().min(2020).max(2050).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      activeOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureHolidayCalendarSchema(db);
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

  holidayJurisdictionSettings: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        jurisdictions: await getTenantHolidayJurisdictions(ctx),
        options: holidayJurisdictionOptions(),
      };
    }),

  setHolidayJurisdictions: protectedProcedure
    .input(z.object({
      jurisdictions: z.array(z.enum(AU_HOLIDAY_JURISDICTIONS)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user?.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required to update holiday calendar settings" });
      }
      const jurisdictions = normalizeHolidayJurisdictions(input.jurisdictions);
      await setTenantAppSetting(tenantIdFromContext(ctx), HOLIDAY_JURISDICTIONS_SETTING_KEY, jurisdictions);
      return {
        jurisdictions,
        options: holidayJurisdictionOptions(),
      };
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
      await ensureHolidayCalendarSchema(db);
      const tenantId = tenantIdFromContext(ctx);
      const jurisdictions = normalizeHolidayJurisdictions(input.jurisdictions?.length
        ? input.jurisdictions
        : await getTenantHolidayJurisdictions(ctx));
      await setTenantAppSetting(tenantId, HOLIDAY_JURISDICTIONS_SETTING_KEY, jurisdictions);
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

        await db.update(constructionHolidayCalendarDays)
          .set({ active: false, updatedAt: new Date() })
          .where(and(...holidayTenantConditions(
            ctx,
            eq(constructionHolidayCalendarDays.year, input.year),
            eq(constructionHolidayCalendarDays.source, "built_in"),
            notInArray(constructionHolidayCalendarDays.jurisdiction, jurisdictions),
          )));

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
      await ensureHolidayCalendarSchema(db);
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
      await ensureHolidayCalendarSchema(db);
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
      assignedUserId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureScheduleEventStaffSchema(db);
      await ensureScheduleEventExclusionsSchema(db);
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
      if (input?.assignedUserId) {
        await requireStaffUserAccess(db, ctx, input.assignedUserId);
        conditions.push(eq(constructionScheduleEvents.assignedUserId, input.assignedUserId));
      }

      const rows = await db.select({ event: constructionScheduleEvents }).from(constructionScheduleEvents)
        .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx, ...conditions)))
        .orderBy(constructionScheduleEvents.startTime);
      const events = rows.map((row: any) => row.event);
      const eventIds = events.map((event: any) => event.id).filter(Boolean);
      const { startKey, endKey } = dateKeyRange(input?.startDate, input?.endDate);
      const exclusionConditions: any[] = eventIds.length
        ? [inArray(constructionScheduleEventExclusions.eventId, eventIds)]
        : [sql`1 = 0`];
      if (startKey) exclusionConditions.push(gte(constructionScheduleEventExclusions.dateKey, startKey));
      if (endKey) exclusionConditions.push(lte(constructionScheduleEventExclusions.dateKey, endKey));
      const exclusionRows = eventIds.length > 0
        ? await db.select({
            eventId: constructionScheduleEventExclusions.eventId,
            dateKey: constructionScheduleEventExclusions.dateKey,
          })
            .from(constructionScheduleEventExclusions)
            .where(and(...scheduleEventExclusionTenantConditions(ctx, ...exclusionConditions)))
        : [];
      const excludedDateKeysByEventId = new Map<number, string[]>();
      for (const exclusion of exclusionRows as any[]) {
        const eventId = Number(exclusion.eventId);
        const list = excludedDateKeysByEventId.get(eventId) || [];
        list.push(exclusion.dateKey);
        excludedDateKeysByEventId.set(eventId, list);
      }

      // Enrich with job and installer names
      const jobIds = Array.from(new Set(events.map(e => e.jobId)));
      const installerIds = Array.from(new Set(events.filter(e => e.assignedInstallerId).map(e => e.assignedInstallerId!)));
      const assignedUserIds = Array.from(new Set(events.filter(e => e.assignedUserId).map(e => e.assignedUserId!)));

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
      const staffUsers = assignedUserIds.length > 0
        ? await selectTenantStaffUsers(db, ctx, assignedUserIds)
        : [];

      const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));
      const installerMap = Object.fromEntries(installers.map(i => [i.id, i]));
      const staffUserMap = Object.fromEntries(staffUsers.map((user: any) => [user.id, user]));
      const readinessMap = await getTradeReadinessMap(
        db,
        ctx,
        events
          .filter((event) => event.assignedInstallerId)
          .map((event) => ({ jobId: event.jobId, installerId: event.assignedInstallerId })),
        new Map(installers.map((installer) => [installer.id, installer])),
      );

      return events.map(e => ({
        ...e,
        excludedDateKeys: excludedDateKeysByEventId.get(e.id) || [],
        jobClientName: jobMap[e.jobId]?.clientName || "Unknown",
        jobSiteAddress: jobMap[e.jobId]?.siteAddress || "",
        installerName: e.assignedInstallerId ? (installerMap[e.assignedInstallerId]?.name || "Unassigned") : null,
        assignedUserName: e.assignedUserId ? (staffUserMap[e.assignedUserId]?.name || staffUserMap[e.assignedUserId]?.email || "Unassigned") : null,
        assignedUserEmail: e.assignedUserId ? (staffUserMap[e.assignedUserId]?.email || null) : null,
        assignedUserRole: e.assignedUserId ? (staffUserMap[e.assignedUserId]?.role || null) : null,
        assigneeType: e.assignedUserId ? "staff" : e.assignedInstallerId ? "trade" : null,
        assigneeName: e.assignedUserId
          ? (staffUserMap[e.assignedUserId]?.name || staffUserMap[e.assignedUserId]?.email || "Unassigned")
          : e.assignedInstallerId ? (installerMap[e.assignedInstallerId]?.name || "Unassigned") : null,
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
      eventType: z.enum(["installation", "inspection", "meeting", "delivery", "maintenance", "other"]).optional(),
      assignedInstallerId: z.number().optional(),
      assignedUserId: z.number().optional(),
      notifyClient: z.boolean().optional(),
      notifyInstaller: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await ensureScheduleEventStaffSchema(db);
      if (input.assignedInstallerId && input.assignedUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose either a staff member or a trade, not both." });
      }
      const job = await requireJobAccess(db, ctx, input.jobId);
      const installer = input.assignedInstallerId ? await requireInstallerAccess(db, ctx, input.assignedInstallerId) : null;
      const assignedUser = input.assignedUserId ? await requireStaffUserAccess(db, ctx, input.assignedUserId) : null;
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
        assignedUserId: input.assignedUserId,
        notifyClient: input.notifyClient || false,
        notifyInstaller: input.notifyInstaller || false,
        createdBy: ctx.user.id,
      });
      // Fire-and-forget notification
      const insertedId = result.insertId;
      notifyScheduleEventCreated(insertedId).catch(() => {});
      await syncManufacturingPlaceholderForScheduleEvent(db, ctx, {
        id: insertedId,
        jobId: input.jobId,
        title: input.title,
        startTime,
        eventType: input.eventType || "installation",
        assignedInstallerId: input.assignedInstallerId || null,
        status: "scheduled",
      });
      if (installer) {
        await applyScheduledTradeSideEffects(db, ctx, {
          eventId: insertedId,
          eventTitle: input.title,
          job,
          installer,
          notifyScheduler: true,
        });
      }
      if (assignedUser && input.notifyInstaller) {
        await notifyAssignedStaffOfScheduleEvent({
          userId: assignedUser.id,
          eventId: insertedId,
          eventTitle: input.title,
          job,
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
      eventType: z.enum(["installation", "inspection", "meeting", "delivery", "maintenance", "other"]).optional(),
      assignedInstallerId: z.number().nullable().optional(),
      assignedUserId: z.number().nullable().optional(),
      notifyClient: z.boolean().optional(),
      notifyInstaller: z.boolean().optional(),
      status: z.enum(["scheduled", "confirmed", "completed", "cancelled"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await ensureScheduleEventStaffSchema(db);
      const { id, ...updates } = input;
      const existingEvent = await requireEventAccess(db, ctx, id);
      if (updates.jobId !== undefined) await requireJobAccess(db, ctx, updates.jobId);
      if (updates.assignedInstallerId) await requireInstallerAccess(db, ctx, updates.assignedInstallerId);
      if (updates.assignedUserId) await requireStaffUserAccess(db, ctx, updates.assignedUserId);
      const requestedInstallerId = updates.assignedInstallerId !== undefined ? updates.assignedInstallerId : existingEvent.assignedInstallerId;
      const requestedUserId = updates.assignedUserId !== undefined ? updates.assignedUserId : existingEvent.assignedUserId;
      if (requestedInstallerId && requestedUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose either a staff member or a trade, not both." });
      }
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
      if (updates.assignedUserId !== undefined) vals.assignedUserId = updates.assignedUserId;
      if (updates.notifyClient !== undefined) vals.notifyClient = updates.notifyClient;
      if (updates.notifyInstaller !== undefined) vals.notifyInstaller = updates.notifyInstaller;
      if (updates.status !== undefined) vals.status = updates.status;
      await db.update(constructionScheduleEvents).set(vals).where(eq(constructionScheduleEvents.id, id));
      const effectiveStartTime = parsedStartTime || existingEvent.startTime;
      const effectiveEndTime = parsedEndTime !== undefined ? parsedEndTime : existingEvent.endTime;
      const existingStartKey = appDateKey(existingEvent.startTime);
      const existingEndKey = appDateKey(existingEvent.endTime || existingEvent.startTime);
      const nextStartKey = appDateKey(effectiveStartTime);
      const nextEndKey = appDateKey(effectiveEndTime || effectiveStartTime);
      if (existingStartKey !== nextStartKey || existingEndKey !== nextEndKey) {
        await deleteAllScheduleEventExclusions(db, ctx, id);
      }

      // Fire-and-forget notification with change summary
      const changes = Object.keys(updates).filter(k => (updates as any)[k] !== undefined && k !== 'id');
      if (changes.length > 0) {
        notifyScheduleEventUpdated(id, changes).catch(() => {});
      }
      const nextJobId = updates.jobId !== undefined ? updates.jobId : existingEvent.jobId;
      await syncManufacturingPlaceholderForScheduleEvent(db, ctx, {
        id,
        jobId: nextJobId,
        title: updates.title || existingEvent.title,
        startTime: effectiveStartTime,
        eventType: updates.eventType || existingEvent.eventType,
        assignedInstallerId: requestedInstallerId || null,
        status: updates.status || existingEvent.status,
      });
      const nextInstallerId = requestedInstallerId;
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
      if (requestedUserId && updates.notifyInstaller) {
        const nextJob = await requireJobAccess(db, ctx, nextJobId);
        await notifyAssignedStaffOfScheduleEvent({
          userId: requestedUserId,
          eventId: id,
          eventTitle: updates.title || existingEvent.title,
          job: nextJob,
          updated: true,
        });
      }

      return { success: true };
    }),

  removeDay: protectedProcedure
    .input(z.object({
      id: z.number(),
      dateKey: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isValidDateKey(input.dateKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid schedule day to remove" });
      }

      const db = await requireDb();
      await ensureScheduleEventStaffSchema(db);
      await ensureScheduleEventExclusionsSchema(db);
      const existingEvent = await requireEventAccess(db, ctx, input.id);
      const startKey = appDateKey(existingEvent.startTime);
      const endKey = appDateKey(existingEvent.endTime || existingEvent.startTime);
      if (!isValidDateKey(startKey) || !isValidDateKey(endKey) || input.dateKey < startKey || input.dateKey > endKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selected day is outside this schedule event" });
      }

      if (startKey === endKey) {
        await deleteManufacturingPlaceholderForScheduleEvent(db, ctx, input.id);
        await db.delete(constructionScheduleEvents).where(eq(constructionScheduleEvents.id, input.id));
        return { success: true, mode: "deleted" as const };
      }

      const startTimeText = existingEvent.allDay
        ? "00:00:00"
        : localTimeStringForDate(existingEvent.startTime, "00:00:00");
      const endTimeText = existingEvent.allDay
        ? "23:59:59"
        : localTimeStringForDate(existingEvent.endTime || existingEvent.startTime, "23:59:59");

      if (input.dateKey === startKey) {
        const nextStartKey = addDaysToDateOnly(input.dateKey, 1);
        const nextStartTime = dateKeyAtLocalTime(nextStartKey, startTimeText);
        await db.update(constructionScheduleEvents)
          .set({ startTime: nextStartTime })
          .where(eq(constructionScheduleEvents.id, input.id));
        await deleteScheduleEventExclusionsOutsideRange(db, ctx, input.id, nextStartKey, endKey);
        await syncManufacturingPlaceholderForScheduleEvent(db, ctx, {
          id: input.id,
          jobId: existingEvent.jobId,
          title: existingEvent.title,
          startTime: nextStartTime,
          eventType: existingEvent.eventType,
          assignedInstallerId: existingEvent.assignedInstallerId || null,
          status: existingEvent.status,
        });
        notifyScheduleEventUpdated(input.id, ["startTime"]).catch(() => {});
        return { success: true, mode: "shrunk_start" as const };
      }

      if (input.dateKey === endKey) {
        const nextEndKey = addDaysToDateOnly(input.dateKey, -1);
        const nextEndTime = dateKeyAtLocalTime(nextEndKey, endTimeText);
        await db.update(constructionScheduleEvents)
          .set({ endTime: nextEndTime })
          .where(eq(constructionScheduleEvents.id, input.id));
        await deleteScheduleEventExclusionsOutsideRange(db, ctx, input.id, startKey, nextEndKey);
        await syncManufacturingPlaceholderForScheduleEvent(db, ctx, {
          id: input.id,
          jobId: existingEvent.jobId,
          title: existingEvent.title,
          startTime: existingEvent.startTime,
          eventType: existingEvent.eventType,
          assignedInstallerId: existingEvent.assignedInstallerId || null,
          status: existingEvent.status,
        });
        notifyScheduleEventUpdated(input.id, ["endTime"]).catch(() => {});
        return { success: true, mode: "shrunk_end" as const };
      }

      const [existingExclusion] = await db.select({ id: constructionScheduleEventExclusions.id })
        .from(constructionScheduleEventExclusions)
        .where(and(...scheduleEventExclusionTenantConditions(
          ctx,
          eq(constructionScheduleEventExclusions.eventId, input.id),
          eq(constructionScheduleEventExclusions.dateKey, input.dateKey),
        )))
        .limit(1);

      if (!existingExclusion) {
        await db.insert(constructionScheduleEventExclusions).values({
          tenantId: tenantIdFromContext(ctx),
          eventId: input.id,
          dateKey: input.dateKey,
          reason: "removed_day",
          createdBy: await nullableExistingUserId(db, ctx.user?.id),
        });
      }

      notifyScheduleEventUpdated(input.id, ["excludedDateKeys"]).catch(() => {});
      return { success: true, mode: "excluded" as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireEventAccess(db, ctx, input.id);
      await deleteManufacturingPlaceholderForScheduleEvent(db, ctx, input.id);
      await db.delete(constructionScheduleEvents).where(eq(constructionScheduleEvents.id, input.id));
      return { success: true };
    }),
});
