import crypto from "crypto";
import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs, constructionProgress, constructionAssignments,
  constructionInstallers, constructionJobFinancials, constructionKanbanTasks,
  checkMeasureWorkbooks, constructionScheduleEvents, projectSubcontracts,
  constructionJobInstructions,
  siteInductions, quotes, crmLeads, crmBuildingAuthority, tenantMemberships, users,
  approvalProjects, approvalRfis, approvalInspections, approvalCertificates,
  approvalLodgements, hbcfCertificates, suppliers, portalDefects, portalMaintenanceRequests,
  branches,
} from "../drizzle/schema";
import { eq, desc, asc, and, like, sql, or, inArray, isNull } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";
import { getXeroAccountingSummaryForJob } from "./xero-accounting-sync";
import { ENV } from "./_core/env";
import { getTradeReadinessMap, tradeReadinessKey } from "./construction-trade-readiness";
import { canonicalClientFromLead, crmLeadDisplayName, nullableName } from "./canonical-client";
import { storagePut } from "./storage";
import { getTenantAppSetting } from "./tenant-settings-store";
import { constructionLifecycleStatusSql } from "./construction-status";
import {
  CONSTRUCTION_CHECKLIST_HELP_TEXT_MAX_LENGTH,
  CONSTRUCTION_CHECKLIST_RESPONSE_TYPES,
} from "../shared/construction-checklist-templates";

const constructionClientSortFieldSchema = z.enum([
  "clientName",
  "clientNumber",
  "status",
  "scheduledStart",
  "constructionManagerName",
  "contractValue",
  "progressPercent",
  "priority",
]);
type ConstructionClientSortField = z.infer<typeof constructionClientSortFieldSchema>;
const SCHEDULE_TIME_ZONE = "Australia/Sydney";
const AU_STATE_TOKENS = new Set(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]);
const jobInstructionCategorySchema = z.enum([
  "general",
  "inspection",
  "hold_point",
  "site_access",
  "safety",
  "completion_evidence",
  "contract_reminder",
  "other",
]);
const jobInstructionStatusSchema = z.enum(["open", "acknowledged", "done", "blocked", "not_applicable"]);
const jobInstructionPrioritySchema = z.enum(["normal", "important", "urgent"]);
const jobInstructionResponseTypeSchema = z.enum(CONSTRUCTION_CHECKLIST_RESPONSE_TYPES);
const jobInstructionResponseFileSchema = z.object({
  url: z.string().url(),
  key: z.string().optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(128).nullable().optional(),
  size: z.number().int().min(0).max(25 * 1024 * 1024),
  uploadedAt: z.string(),
  uploadedBy: z.string().nullable().optional(),
});
const jobInstructionSignatureResponseSchema = z.object({
  signatureDataUrl: z.string().max(500_000).regex(/^data:image\/(png|jpeg|webp);base64,/),
  signedName: z.string().trim().max(255).nullable().optional(),
  signedAt: z.string().datetime(),
});
const jobInstructionResponseValueSchema = z.union([
  z.string().max(5000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(240)).max(50),
  z.object({ files: z.array(jobInstructionResponseFileSchema).max(50) }),
  jobInstructionSignatureResponseSchema,
  z.null(),
]);
const postBuildClassificationSchema = z.enum(["unclassified", "warranty", "workmanship", "chargeable"]);
const maintenanceRequestSourceSchema = z.enum(["portal", "phone", "email", "internal"]);
const maintenanceAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileMimeType: z.string().trim().max(128).nullable().optional(),
  fileBase64: z.string().min(1),
});

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

function instructionTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobInstructions.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function appendExactQuoteTenantScope(conditions: any[], column: any, tenantId: number | null | undefined) {
  conditions.push(tenantId ? eq(column, tenantId) : sql`1 = 0`);
}

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select()
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

async function requireInstructionAccess(db: any, ctx: any, instructionId: number) {
  const [instruction] = await db.select()
    .from(constructionJobInstructions)
    .where(and(...instructionTenantConditions(ctx, eq(constructionJobInstructions.id, instructionId))))
    .limit(1);
  if (!instruction) throw new TRPCError({ code: "NOT_FOUND", message: "Instruction not found" });
  await requireJobAccess(db, ctx, instruction.jobId);
  return instruction;
}

async function requireMaintenanceRequestAccess(db: any, ctx: any, requestId: number) {
  const [row] = await db.select({ request: portalMaintenanceRequests })
    .from(portalMaintenanceRequests)
    .innerJoin(constructionJobs, eq(portalMaintenanceRequests.constructionJobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(portalMaintenanceRequests.id, requestId))))
    .limit(1);
  if (!row?.request) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Maintenance request not found" });
  }
  return row.request;
}

async function requirePortalDefectAccess(db: any, ctx: any, defectId: number) {
  const [row] = await db.select({ defect: portalDefects })
    .from(portalDefects)
    .innerJoin(constructionJobs, eq(portalDefects.constructionJobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(portalDefects.id, defectId))))
    .limit(1);
  if (!row?.defect) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Defect not found" });
  }
  return row.defect;
}

function trimNullable(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function safeUploadFilename(filename: string) {
  const cleaned = String(filename || "attachment")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
  return cleaned || "attachment";
}

async function storeMaintenanceAttachments({
  tenantId,
  jobId,
  files,
}: {
  tenantId: number | null | undefined;
  jobId: number;
  files?: Array<z.infer<typeof maintenanceAttachmentSchema>>;
}) {
  const uploads = files || [];
  if (uploads.length === 0) return [];
  const tenantSegment = tenantId ? String(tenantId) : "single";
  const urls: string[] = [];
  for (const file of uploads) {
    const buffer = Buffer.from(file.fileBase64, "base64");
    if (buffer.byteLength > 20 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${file.fileName} must be under 20MB` });
    }
    const suffix = crypto.randomBytes(6).toString("hex");
    const safeName = safeUploadFilename(file.fileName);
    const fileKey = `maintenance-requests/${tenantSegment}/jobs/${jobId}/${Date.now()}-${suffix}-${safeName}`;
    const result = await storagePut(fileKey, buffer, file.fileMimeType || "application/octet-stream");
    urls.push(result.url);
  }
  return urls;
}

function parseInstructionDate(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed.length <= 10 ? `${trimmed}T00:00:00` : trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid due date" });
  }
  return date;
}

function parseJobDetailDate(value?: string | null, label = "date") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed.length <= 10 ? `${trimmed}T00:00:00` : trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return date;
}

function actorName(ctx: any) {
  return ctx.user?.name || ctx.user?.email || null;
}

async function requireVisibleJobInstaller(db: any, ctx: any, jobId: number, installerId?: number | null) {
  if (installerId == null) return;

  const [installer] = await db.select({ id: constructionInstallers.id })
    .from(constructionInstallers)
    .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, installerId))))
    .limit(1);
  if (!installer) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected trade is not available for this tenant" });
  }

  const [assignment] = await db.select({ id: constructionAssignments.id })
    .from(constructionAssignments)
    .where(and(
      eq(constructionAssignments.jobId, jobId),
      eq(constructionAssignments.installerId, installerId),
    ))
    .limit(1);
  if (assignment) return;

  const [scheduledEvent] = await db.select({ id: constructionScheduleEvents.id })
    .from(constructionScheduleEvents)
    .where(and(
      eq(constructionScheduleEvents.jobId, jobId),
      eq(constructionScheduleEvents.assignedInstallerId, installerId),
    ))
    .limit(1);
  if (!scheduledEvent) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected trade is not assigned or scheduled on this job" });
  }
}

function addYears(date: Date, years: number) {
  const copy = new Date(date);
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function isCommencementCertificateType(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["cc", "cdc", "ba", "ccc", "nsw_cc", "nsw_cdc", "act_ba", "act_cou"].includes(normalized) ||
    /construction certificate|commencement certificate|construction commencement|complying development|building approval/.test(normalized);
}

type SummaryStatus = "not_started" | "in_progress" | "completed";

function completionStatus(count: number, completedCount: number): SummaryStatus {
  if (count <= 0) return "not_started";
  if (completedCount >= count) return "completed";
  return "in_progress";
}

function normaliseApprovalStatus(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized || "not_started";
}

function isApprovalComplete(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["approved", "approved_with_conditions", "issued", "completed", "passed", "satisfied"].includes(normalized);
}

function findLatestApprovalRecord<T extends { status?: string | null; lodgementType?: string | null; certificateType?: string | null }>(
  records: T[],
  matcher: (value?: string | null) => boolean,
): T | null {
  return records.find((record) => matcher(record.lodgementType || record.certificateType)) || null;
}

function hasApprovalType(value: string | null | undefined, tokens: string[]) {
  const normalized = String(value || "").toLowerCase();
  return tokens.some((token) => normalized.includes(token.toLowerCase()));
}

async function resolveProjectTeamRole(db: any, ctx: any, userId?: number | null, manualName?: string | null) {
  const name = nullableName(manualName);
  if (userId == null) return { userId: null, name };

  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  }

  const userRows = ENV.tenancyMode === "single"
    ? await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    : await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
        .from(tenantMemberships)
        .innerJoin(users, eq(users.id, tenantMemberships.userId))
        .where(and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(users.id, userId),
        ))
        .limit(1);

  const selectedUser = userRows[0];
  if (!selectedUser) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected user is not available for this tenant" });
  }

  return {
    userId,
    name: name || selectedUser.name || selectedUser.email || `User #${userId}`,
  };
}

/**
 * Australian Financial Year helper.
 * FY runs 1 Jul → 30 Jun. "FY 2025-26" means 1 Jul 2025 – 30 Jun 2026.
 * We store the FY as the starting calendar year (e.g. 2025 for FY 2025-26).
 */
function fyDateRange(fyStartYear: number): { from: Date; to: Date } {
  return {
    from: dateKeyStartInTimeZone(calendarDateKey(fyStartYear, 7, 1)),      // 1 Jul
    to: dateKeyStartInTimeZone(calendarDateKey(fyStartYear + 1, 7, 1)),    // 1 Jul next year (exclusive)
  };
}

function monthDateRange(year: number, month: number): { from: Date; to: Date } {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  return {
    from: dateKeyStartInTimeZone(calendarDateKey(year, month, 1)),
    to: dateKeyStartInTimeZone(calendarDateKey(nextMonthYear, nextMonth, 1)),
  };
}

function fyStartYearForDate(value: Date): number {
  const [year, month] = dateKeyInTimeZone(value).split("-").map(Number);
  return month < 7 ? year - 1 : year;
}

function constructionJobDateExpr() {
  return sql<Date>`COALESCE(
    ${constructionJobs.actualEnd},
    ${constructionJobs.actualStart},
    (
      SELECT MIN(${constructionScheduleEvents.startTime})
      FROM ${constructionScheduleEvents}
      WHERE ${constructionScheduleEvents.jobId} = ${constructionJobs.id}
        AND ${constructionScheduleEvents.status} != 'cancelled'
    ),
    ${constructionJobs.scheduledEnd},
    ${constructionJobs.scheduledStart},
    ${constructionJobs.createdAt}
  )`;
}

function appendProjectDateRange(conditions: any[], from: Date, to: Date) {
  const jobDate = constructionJobDateExpr();
  conditions.push(sql`${jobDate} >= ${from}`);
  conditions.push(sql`${jobDate} < ${to}`);
}

function appendConstructionClientDateRange(
  conditions: any[],
  ctx: any,
  from: Date,
  to: Date,
  scheduledFilter?: "unscheduled" | "scheduled" | "overdue" | "today" | "next_7_days" | "future",
) {
  if (scheduledFilter && scheduledFilter !== "unscheduled") {
    conditions.push(or(
      scheduleEventExists(ctx, scheduleEventOverlap(from, to)),
      legacyJobScheduleOverlap(from, to),
    ));
    return;
  }
  appendProjectDateRange(conditions, from, to);
}

function dateKeyInTimeZone(value: Date, timeZone = SCHEDULE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function calendarDateKey(year: number, month: number, day: number) {
  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function timeZoneOffsetMs(value: Date, timeZone = SCHEDULE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return localAsUtc - value.getTime();
}

function dateKeyStartInTimeZone(dateKey: string, timeZone = SCHEDULE_TIME_ZONE) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let utc = new Date(localMidnightAsUtc);
  for (let i = 0; i < 3; i += 1) {
    utc = new Date(localMidnightAsUtc - timeZoneOffsetMs(utc, timeZone));
  }
  return utc;
}

function dateKeyRangeInTimeZone(startKey: string, days: number, timeZone = SCHEDULE_TIME_ZONE) {
  const endKey = addDaysToDateKey(startKey, days);
  return {
    from: dateKeyStartInTimeZone(startKey, timeZone),
    to: dateKeyStartInTimeZone(endKey, timeZone),
  };
}

function eventTenantPredicate(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) return ENV.tenancyMode === "multi" ? sql`1 = 0` : sql`1 = 1`;
  if (ENV.tenancyMode === "multi") return sql`${constructionScheduleEvents.tenantId} = ${tenantId}`;
  return sql`(${constructionScheduleEvents.tenantId} = ${tenantId} OR ${constructionScheduleEvents.tenantId} IS NULL)`;
}

function scheduleEventExists(ctx: any, extraCondition?: any) {
  const baseCondition = sql`
    ${constructionScheduleEvents.jobId} = ${constructionJobs.id}
    AND ${constructionScheduleEvents.status} != 'cancelled'
    AND ${eventTenantPredicate(ctx)}
  `;
  return extraCondition
    ? sql`EXISTS (SELECT 1 FROM ${constructionScheduleEvents} WHERE ${baseCondition} AND ${extraCondition})`
    : sql`EXISTS (SELECT 1 FROM ${constructionScheduleEvents} WHERE ${baseCondition})`;
}

function scheduleEventOverlap(from: Date, to: Date) {
  const eventEnd = sql`COALESCE(${constructionScheduleEvents.endTime}, ${constructionScheduleEvents.startTime})`;
  return sql`${constructionScheduleEvents.startTime} < ${to} AND ${eventEnd} >= ${from}`;
}

function legacyJobScheduleOverlap(from: Date, to: Date) {
  const jobEnd = sql`COALESCE(${constructionJobs.scheduledEnd}, ${constructionJobs.scheduledStart})`;
  return sql`${constructionJobs.scheduledStart} IS NOT NULL AND ${constructionJobs.scheduledStart} < ${to} AND ${jobEnd} >= ${from}`;
}

function activeScheduleCondition(ctx: any) {
  return or(
    scheduleEventExists(ctx),
    sql`${constructionJobs.scheduledStart} IS NOT NULL`,
  );
}

function normalizeSuburb(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeOptionName(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanSuburbLabel(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function extractSuburbFromAddress(address?: string | null) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const stateIndex = parts.findIndex((part) => {
    const token = part.toUpperCase().split(/\s+/)[0];
    return AU_STATE_TOKENS.has(token);
  });
  if (stateIndex > 0) return cleanSuburbLabel(parts[stateIndex - 1]);

  const postcodeIndex = parts.findIndex((part) => /^\d{4}$/.test(part));
  if (postcodeIndex > 1) return cleanSuburbLabel(parts[postcodeIndex - 2]);

  return null;
}

function buildSuburbOptions(rows: Array<{ suburb?: string | null; siteAddress?: string | null }>) {
  const byNormalized = new Map<string, string>();
  for (const row of rows) {
    const candidates = [
      cleanSuburbLabel(row.suburb),
      extractSuburbFromAddress(row.siteAddress),
    ];
    for (const candidate of candidates) {
      const normalized = normalizeSuburb(candidate);
      if (normalized && !byNormalized.has(normalized)) {
        byNormalized.set(normalized, cleanSuburbLabel(candidate));
      }
    }
  }
  return Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b));
}

function visibleConstructionClientCondition() {
  return or(
    isNull(constructionJobs.leadId),
    isNull(crmLeads.id),
    eq(crmLeads.archived, false),
  );
}

function financialAmountExpr(primary: any, fallback: any) {
  return sql<number>`CAST(COALESCE(${primary}, ${fallback}, 0) AS DECIMAL(12, 2))`;
}

function appendPaymentStatusFilter(conditions: any[], status: "paid" | "partial" | "invoiced" | "unpaid") {
  const contractValue = financialAmountExpr(constructionJobFinancials.xeroContractValue, constructionJobFinancials.contractValue);
  const invoicedAmount = financialAmountExpr(constructionJobFinancials.xeroInvoicedAmount, constructionJobFinancials.invoicedAmount);
  const paidAmount = financialAmountExpr(constructionJobFinancials.xeroPaidAmount, constructionJobFinancials.paidAmount);

  if (status === "paid") {
    conditions.push(sql`${contractValue} > 0 AND ${paidAmount} >= ${contractValue}`);
  } else if (status === "partial") {
    conditions.push(sql`${contractValue} > 0 AND ${paidAmount} > 0 AND ${paidAmount} < ${contractValue}`);
  } else if (status === "invoiced") {
    conditions.push(sql`${contractValue} > 0 AND ${paidAmount} <= 0 AND ${invoicedAmount} > 0`);
  } else {
    conditions.push(sql`${contractValue} <= 0 OR (${paidAmount} <= 0 AND ${invoicedAmount} <= 0)`);
  }
}

function canonicalClientNameSortExpr() {
  return sql<string>`COALESCE(
    NULLIF(TRIM(CONCAT(COALESCE(${crmLeads.contactFirstName}, ''), ' ', COALESCE(${crmLeads.contactLastName}, ''))), ''),
    NULLIF(TRIM(${crmLeads.company}), ''),
    ${constructionJobs.clientName}
  )`;
}

function scheduleStartSortExpr(ctx: any) {
  return sql<Date>`COALESCE(
    (
      SELECT MIN(${constructionScheduleEvents.startTime})
      FROM ${constructionScheduleEvents}
      WHERE ${constructionScheduleEvents.jobId} = ${constructionJobs.id}
        AND ${constructionScheduleEvents.status} != 'cancelled'
        AND ${eventTenantPredicate(ctx)}
    ),
    ${constructionJobs.scheduledStart}
  )`;
}

function constructionClientSortExpr(ctx: any, sortField: ConstructionClientSortField) {
  if (sortField === "clientName") return canonicalClientNameSortExpr();
  if (sortField === "clientNumber") return sql<string>`COALESCE(NULLIF(TRIM(${crmLeads.clientNumber}), ''), '')`;
  if (sortField === "status") return constructionLifecycleStatusSql();
  if (sortField === "scheduledStart") return scheduleStartSortExpr(ctx);
  if (sortField === "constructionManagerName") {
    return sql<string>`COALESCE(
      NULLIF(TRIM(${constructionJobFinancials.constructionManagerName}), ''),
      NULLIF(TRIM(${constructionJobs.supervisorName}), ''),
      ''
    )`;
  }
  if (sortField === "contractValue") {
    return financialAmountExpr(constructionJobFinancials.xeroContractValue, constructionJobFinancials.contractValue);
  }
  if (sortField === "progressPercent") {
    const contractValue = financialAmountExpr(constructionJobFinancials.xeroContractValue, constructionJobFinancials.contractValue);
    const paidAmount = financialAmountExpr(constructionJobFinancials.xeroPaidAmount, constructionJobFinancials.paidAmount);
    return sql<number>`CASE WHEN ${contractValue} > 0 THEN (${paidAmount} / ${contractValue}) ELSE 0 END`;
  }
  return sql<number>`CASE ${constructionJobs.priority}
    WHEN 'urgent' THEN 4
    WHEN 'high' THEN 3
    WHEN 'normal' THEN 1
    WHEN 'low' THEN 0
    ELSE 1
  END`;
}

function buildConstructionClientOrderBy(
  ctx: any,
  sortField: ConstructionClientSortField = "clientName",
  sortDir: "asc" | "desc" = "asc",
) {
  const primaryExpr = constructionClientSortExpr(ctx, sortField);
  const primary = sortDir === "asc" ? asc(primaryExpr) : desc(primaryExpr);
  if (sortField === "clientName") {
    return [primary, desc(constructionJobs.updatedAt), desc(constructionJobs.id)];
  }
  return [
    primary,
    asc(canonicalClientNameSortExpr()),
    desc(constructionJobs.updatedAt),
    desc(constructionJobs.id),
  ];
}

function appendApprovalStatusFilter(
  conditions: any[],
  status: "approved" | "pending" | "lodged" | "rejected" | "exempt" | "none" | "overdue",
  overdueDays: number,
) {
  const statusExpr = sql`LOWER(COALESCE(${crmBuildingAuthority.status}, ''))`;
  const baseRecordMatch = sql`${crmBuildingAuthority.leadId} = ${crmLeads.id}`;

  if (status === "none") {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${crmBuildingAuthority}
      WHERE ${baseRecordMatch}
        AND ${crmBuildingAuthority.status} IS NOT NULL
        AND ${crmBuildingAuthority.status} != ''
    )`);
    return;
  }

  if (status === "overdue") {
    const cutoff = new Date(Date.now() - overdueDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${crmBuildingAuthority}
      WHERE ${baseRecordMatch}
        AND ${statusExpr} IN ('pending', 'lodged', 'submitted')
        AND ${crmBuildingAuthority.applicationDate} IS NOT NULL
        AND ${crmBuildingAuthority.applicationDate} != ''
        AND ${crmBuildingAuthority.applicationDate} < ${cutoff}
    )`);
    return;
  }

  const statusValues: Record<string, string[]> = {
    approved: ["approved", "approved with conditions"],
    pending: ["pending"],
    lodged: ["lodged", "submitted"],
    rejected: ["rejected", "refused"],
    exempt: ["exempt", "not required"],
    none: [],
    overdue: [],
  };
  const values = statusValues[status] || [];
  conditions.push(sql`EXISTS (
    SELECT 1 FROM ${crmBuildingAuthority}
    WHERE ${baseRecordMatch}
      AND ${statusExpr} IN (${sql.join(values.map((value) => sql`${value}`), sql`, `)})
  )`);
}

/** Get the current Australian FY start year. Before July → previous year. */
function currentFyStartYear(): number {
  return fyStartYearForDate(new Date());
}

export const constructionClientsRouter = router({
  assignableUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const tenantId = tenantIdFromContext(ctx);
    if (!tenantId) return [];

    const selectFields = {
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    };

    if (ENV.tenancyMode === "single") {
      return await db.select(selectFields)
        .from(users)
        .orderBy(users.name, users.email);
    }

    return await db.select(selectFields)
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, tenantId))
      .orderBy(users.name, users.email);
  }),

  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const tenantConditions = jobTenantConditions(ctx);
    const branchConditions: any[] = [eq(branches.isActive, true)];
    appendTenantScope(branchConditions, branches.tenantId, tenantIdFromContext(ctx));

    const [branchRows, usedBranchRows, leadSuburbRows, quoteSuburbRows, siteAddressRows, installers, managerRows] = await Promise.all([
      db.select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(and(...branchConditions))
        .orderBy(asc(branches.name)),
      db.select({
        leadBranchId: crmLeads.branchId,
        financialBranch: constructionJobFinancials.branch,
      })
        .from(constructionJobs)
        .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .where(and(
          ...tenantConditions,
          visibleConstructionClientCondition(),
        ))
        .groupBy(crmLeads.branchId, constructionJobFinancials.branch),
      db.select({ suburb: crmLeads.suburb })
        .from(constructionJobs)
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .where(and(
          ...tenantConditions,
          visibleConstructionClientCondition(),
          sql`${crmLeads.suburb} IS NOT NULL`,
          sql`${crmLeads.suburb} != ''`,
        ))
        .groupBy(crmLeads.suburb)
        .orderBy(crmLeads.suburb),
      db.select({ suburb: quotes.suburb })
        .from(constructionJobs)
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .leftJoin(quotes, eq(constructionJobs.quoteId, quotes.id))
        .where(and(
          ...tenantConditions,
          visibleConstructionClientCondition(),
          sql`${quotes.suburb} IS NOT NULL`,
          sql`${quotes.suburb} != ''`,
        ))
        .groupBy(quotes.suburb)
        .orderBy(quotes.suburb),
      db.select({ siteAddress: constructionJobs.siteAddress })
        .from(constructionJobs)
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .where(and(
          ...tenantConditions,
          visibleConstructionClientCondition(),
          sql`${constructionJobs.siteAddress} IS NOT NULL`,
          sql`${constructionJobs.siteAddress} != ''`,
        ))
        .groupBy(constructionJobs.siteAddress)
        .orderBy(constructionJobs.siteAddress),
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

    const usedBranchIds = new Set<number>();
    const usedBranchNames = new Set<string>();
    for (const row of usedBranchRows as any[]) {
      if (row.leadBranchId != null) usedBranchIds.add(Number(row.leadBranchId));
      const normalizedBranch = normalizeOptionName(row.financialBranch);
      if (normalizedBranch) usedBranchNames.add(normalizedBranch);
    }

    const branchOptions = branchRows
      .map((row: any) => ({ id: Number(row.id), name: String(row.name || "").trim() }))
      .filter((row) => row.id > 0 && row.name)
      .filter((row) => usedBranchIds.has(row.id) || usedBranchNames.has(normalizeOptionName(row.name)));

    const suburbs = buildSuburbOptions([...leadSuburbRows, ...quoteSuburbRows, ...siteAddressRows] as any[]);

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
      branches: branchOptions,
      suburbs,
      installers,
      constructionManagers,
    };
  }),

  // List all construction clients (jobs) with stage indicators
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["scheduled", "in_progress", "on_hold", "completed", "cancelled", "not_completed"]).optional(),
      search: z.string().optional(),
      branch: z.string().optional(),
      branchId: z.union([z.number(), z.literal("unassigned")]).optional(),
      suburb: z.string().optional(),
      scheduled: z.enum(["unscheduled", "scheduled", "overdue", "today", "next_7_days", "future"]).optional(),
      installerId: z.number().optional(),
      constructionManagerId: z.number().optional(),
      paymentStatus: z.enum(["paid", "partial", "invoiced", "unpaid"]).optional(),
      baStatus: z.enum(["approved", "pending", "lodged", "rejected", "exempt", "none", "overdue"]).optional(),
      fyStartYear: z.number().optional(), // e.g. 2025 for FY 2025-26
      month: z.number().min(1).max(12).optional(), // 1-12, calendar month within the FY
      sortField: constructionClientSortFieldSchema.optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      excludeCompleted: z.boolean().optional(), // default true when no status filter set
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      const lifecycleStatus = constructionLifecycleStatusSql();
      conditions.push(visibleConstructionClientCondition());
      if (input?.status === "not_completed") {
        conditions.push(sql`${lifecycleStatus} IN ('scheduled', 'in_progress', 'on_hold')`);
      } else if (input?.status) {
        conditions.push(sql`${lifecycleStatus} = ${input.status}`);
      } else if (input?.excludeCompleted !== false) {
        // By default, exclude completed jobs when no specific status filter is set
        conditions.push(sql`${lifecycleStatus} != 'completed'`);
      }
      if (input?.search) {
        conditions.push(
          or(
            like(constructionJobs.clientName, `%${input.search}%`),
            like(constructionJobs.siteAddress, `%${input.search}%`),
            like(constructionJobs.quoteNumber, `%${input.search}%`),
            like(crmLeads.clientNumber, `%${input.search}%`),
            like(crmLeads.contactFirstName, `%${input.search}%`),
            like(crmLeads.contactLastName, `%${input.search}%`),
            like(crmLeads.company, `%${input.search}%`),
            like(crmLeads.contactEmail, `%${input.search}%`),
            like(crmLeads.contactPhone, `%${input.search}%`),
          )
        );
      }
      if (input?.branchId === "unassigned") {
        conditions.push(and(
          isNull(crmLeads.branchId),
          or(
            isNull(constructionJobFinancials.branch),
            eq(constructionJobFinancials.branch, ""),
          ),
        ));
      } else if (typeof input?.branchId === "number") {
        const branchConditions: any[] = [eq(branches.id, input.branchId)];
        appendTenantScope(branchConditions, branches.tenantId, tenantIdFromContext(ctx));
        const [branch] = await db.select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(and(...branchConditions))
          .limit(1);
        if (!branch) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected branch is not available for this tenant" });
        }
        conditions.push(or(
          eq(crmLeads.branchId, input.branchId),
          eq(sql`LOWER(TRIM(${constructionJobFinancials.branch}))`, branch.name.toLowerCase()),
        ));
      } else if (input?.branch) {
        conditions.push(eq(constructionJobFinancials.branch, input.branch));
      }
      if (input?.paymentStatus) {
        appendPaymentStatusFilter(conditions, input.paymentStatus);
      }
      if (input?.baStatus) {
        const overdueDays = (await getTenantAppSetting<number>(tenantIdFromContext(ctx), "baOverdueThresholdDays")) ?? 30;
        appendApprovalStatusFilter(conditions, input.baStatus, overdueDays);
      }
      if (input?.suburb) {
        const suburb = normalizeSuburb(input.suburb);
        conditions.push(or(
          like(sql`LOWER(${constructionJobs.siteAddress})`, `%${suburb}%`),
          eq(sql`LOWER(TRIM(${quotes.suburb}))`, suburb),
          eq(sql`LOWER(TRIM(${crmLeads.suburb}))`, suburb),
        ));
      }
      if (input?.constructionManagerId != null) {
        conditions.push(eq(constructionJobFinancials.constructionManagerId, input.constructionManagerId));
      }
      if (input?.installerId != null) {
        conditions.push(or(
          sql`EXISTS (
            SELECT 1 FROM ${constructionAssignments}
            WHERE ${constructionAssignments.jobId} = ${constructionJobs.id}
              AND ${constructionAssignments.installerId} = ${input.installerId}
          )`,
          scheduleEventExists(ctx, eq(constructionScheduleEvents.assignedInstallerId, input.installerId)),
        ));
      }
      if (input?.scheduled) {
        const todayKey = dateKeyInTimeZone(new Date());
        const todayRange = dateKeyRangeInTimeZone(todayKey, 1);
        const nextWeekRange = dateKeyRangeInTimeZone(todayKey, 8);
        const eventEnd = sql`COALESCE(${constructionScheduleEvents.endTime}, ${constructionScheduleEvents.startTime})`;
        const legacyJobEnd = sql`COALESCE(${constructionJobs.scheduledEnd}, ${constructionJobs.scheduledStart})`;

        if (input.scheduled === "unscheduled") {
          conditions.push(sql`NOT (${scheduleEventExists(ctx)}) AND ${constructionJobs.scheduledStart} IS NULL`);
        } else if (input.scheduled === "scheduled") {
          conditions.push(activeScheduleCondition(ctx));
        } else if (input.scheduled === "overdue") {
          conditions.push(sql`${lifecycleStatus} != 'completed' AND (${or(
            scheduleEventExists(ctx, sql`${eventEnd} < ${todayRange.from}`),
            sql`${constructionJobs.scheduledStart} IS NOT NULL AND ${legacyJobEnd} < ${todayRange.from}`,
          )})`);
        } else if (input.scheduled === "today") {
          conditions.push(or(
            scheduleEventExists(ctx, scheduleEventOverlap(todayRange.from, todayRange.to)),
            legacyJobScheduleOverlap(todayRange.from, todayRange.to),
          ));
        } else if (input.scheduled === "next_7_days") {
          conditions.push(or(
            scheduleEventExists(ctx, scheduleEventOverlap(nextWeekRange.from, nextWeekRange.to)),
            legacyJobScheduleOverlap(nextWeekRange.from, nextWeekRange.to),
          ));
        } else if (input.scheduled === "future") {
          conditions.push(or(
            scheduleEventExists(ctx, sql`${constructionScheduleEvents.startTime} >= ${nextWeekRange.to}`),
            sql`${constructionJobs.scheduledStart} >= ${nextWeekRange.to}`,
          ));
        }
      }

      // FY date filter on real project timing, not import/create timestamp.
      if (input?.fyStartYear != null) {
        const range = fyDateRange(input.fyStartYear);
        appendConstructionClientDateRange(conditions, ctx, range.from, range.to, input.scheduled);
      }

      // Month filter within the FY (or standalone)
      if (input?.month != null) {
        // If FY is set, use the correct year for the month
        // FY 2025-26: Jul 2025 (month 7) – Jun 2026 (month 6)
        if (input?.fyStartYear != null) {
          const year = input.month >= 7 ? input.fyStartYear : input.fyStartYear + 1;
          const range = monthDateRange(year, input.month);
          appendConstructionClientDateRange(conditions, ctx, range.from, range.to, input.scheduled);
        } else {
          // No FY set — filter by month in current calendar year
          const [year] = dateKeyInTimeZone(new Date()).split("-").map(Number);
          const range = monthDateRange(year, input.month);
          appendConstructionClientDateRange(conditions, ctx, range.from, range.to, input.scheduled);
        }
      }

      const where = and(...jobTenantConditions(ctx, ...conditions));
      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const orderBy = buildConstructionClientOrderBy(ctx, input?.sortField, input?.sortDir);

      const [jobs, countResult] = await Promise.all([
        db.select({
          job: constructionJobs,
          effectiveStatus: lifecycleStatus,
          clientNumber: crmLeads.clientNumber,
          leadId: crmLeads.id,
          leadFirstName: crmLeads.contactFirstName,
          leadLastName: crmLeads.contactLastName,
          leadCompany: crmLeads.company,
          leadPhone: crmLeads.contactPhone,
          leadEmail: crmLeads.contactEmail,
          leadAddress: crmLeads.contactAddress,
          leadStatus: crmLeads.status,
          leadSuburb: crmLeads.suburb,
          quoteSuburb: quotes.suburb,
          leadBranchId: crmLeads.branchId,
          leadBranchName: branches.name,
          branch: constructionJobFinancials.branch,
          constructionManagerId: constructionJobFinancials.constructionManagerId,
          constructionManagerName: constructionJobFinancials.constructionManagerName,
          technicalDesignerId: constructionJobFinancials.technicalDesignerId,
          technicalDesignerName: constructionJobFinancials.technicalDesignerName,
        }).from(constructionJobs)
          .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
          .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
          .leftJoin(branches, eq(crmLeads.branchId, branches.id))
          .leftJoin(quotes, eq(constructionJobs.quoteId, quotes.id))
          .where(where)
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(DISTINCT ${constructionJobs.id})` })
          .from(constructionJobs)
          .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
          .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
          .leftJoin(branches, eq(crmLeads.branchId, branches.id))
          .leftJoin(quotes, eq(constructionJobs.quoteId, quotes.id))
          .where(where),
      ]);

      const jobRows = jobs.map((row: any) => {
        const canonicalClient = canonicalClientFromLead({
          id: row.leadId,
          contactFirstName: row.leadFirstName,
          contactLastName: row.leadLastName,
          company: row.leadCompany,
          contactPhone: row.leadPhone,
          contactEmail: row.leadEmail,
          contactAddress: row.leadAddress,
          clientNumber: row.clientNumber,
          status: row.leadStatus,
        });

        return {
          ...row.job,
          storedConstructionStatus: row.job.status,
          status: row.effectiveStatus || row.job.status,
          storedClientName: row.job.clientName,
          clientName: canonicalClient?.name || row.job.clientName,
          canonicalClient,
          clientNumber: row.clientNumber,
          clientPhone: nullableName(row.leadPhone),
          clientEmail: nullableName(row.leadEmail),
          leadSuburb: row.leadSuburb,
          quoteSuburb: row.quoteSuburb,
          branchId: row.leadBranchId,
          storedBranch: row.branch,
          branch: nullableName(row.leadBranchName) || row.branch,
          constructionManagerId: row.constructionManagerId,
          constructionManagerName: row.constructionManagerName,
          technicalDesignerId: row.technicalDesignerId,
          technicalDesignerName: row.technicalDesignerName,
        };
      });

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

      const scheduleEventConditions: any[] = [
        inArray(constructionScheduleEvents.jobId, jobIds),
        sql`${constructionScheduleEvents.status} != 'cancelled'`,
      ];
      appendTenantScope(scheduleEventConditions, constructionScheduleEvents.tenantId, tenantIdFromContext(ctx));
      const allScheduleEvents = jobIds.length > 0
        ? await db.select({
            jobId: constructionScheduleEvents.jobId,
            startTime: constructionScheduleEvents.startTime,
            endTime: constructionScheduleEvents.endTime,
            assignedInstallerId: constructionScheduleEvents.assignedInstallerId,
            assignedInstallerName: constructionInstallers.name,
          })
            .from(constructionScheduleEvents)
            .leftJoin(constructionInstallers, and(...installerTenantConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, constructionInstallers.id))))
            .where(and(...scheduleEventConditions))
            .orderBy(constructionScheduleEvents.startTime)
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
      const seenTradeKeysByJob: Record<number, Set<string>> = {};
      for (const a of allAssignments) {
        if (!assignmentsByJob[a.jobId]) assignmentsByJob[a.jobId] = [];
        if (!seenTradeKeysByJob[a.jobId]) seenTradeKeysByJob[a.jobId] = new Set();
        const tradeKey = a.installerId != null ? `id:${a.installerId}` : `name:${a.installerName || "Unknown"}`;
        seenTradeKeysByJob[a.jobId].add(tradeKey);
        assignmentsByJob[a.jobId].push({
          installerId: a.installerId,
          installerName: a.installerName || 'Unknown',
          role: a.role,
        });
      }

      const scheduleByJob: Record<number, { startTime: Date | null; endTime: Date | null; count: number }> = {};
      for (const event of allScheduleEvents) {
        const existing = scheduleByJob[event.jobId];
        if (!existing) {
          scheduleByJob[event.jobId] = {
            startTime: event.startTime || null,
            endTime: event.endTime || null,
            count: 1,
          };
        } else {
          existing.count += 1;
        }

        if (event.assignedInstallerId != null) {
          if (!assignmentsByJob[event.jobId]) assignmentsByJob[event.jobId] = [];
          if (!seenTradeKeysByJob[event.jobId]) seenTradeKeysByJob[event.jobId] = new Set();
          const tradeKey = `id:${event.assignedInstallerId}`;
          if (!seenTradeKeysByJob[event.jobId].has(tradeKey)) {
            seenTradeKeysByJob[event.jobId].add(tradeKey);
            assignmentsByJob[event.jobId].push({
              installerId: event.assignedInstallerId,
              installerName: event.assignedInstallerName || "Scheduled trade",
              role: "scheduled",
            });
          }
        }
      }
      for (const [jobId, trades] of Object.entries(assignmentsByJob)) {
        assignmentCountByJob[Number(jobId)] = trades.length;
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
        const scheduleSummary = scheduleByJob[job.id];
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
          scheduledStart: scheduleSummary?.startTime || job.scheduledStart,
          scheduledEnd: scheduleSummary?.endTime || job.scheduledEnd,
          scheduleEventCount: scheduleSummary?.count || 0,
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
      const lifecycleStatus = constructionLifecycleStatusSql();
      conditions.push(visibleConstructionClientCondition());
      if (input?.fyStartYear != null) {
        const range = fyDateRange(input.fyStartYear);
        appendProjectDateRange(conditions, range.from, range.to);
      }
      // Month filter within the FY
      if (input?.month != null) {
        if (input?.fyStartYear != null) {
          const year = input.month >= 7 ? input.fyStartYear : input.fyStartYear + 1;
          const range = monthDateRange(year, input.month);
          appendProjectDateRange(conditions, range.from, range.to);
        } else {
          const [year] = dateKeyInTimeZone(new Date()).split("-").map(Number);
          const range = monthDateRange(year, input.month);
          appendProjectDateRange(conditions, range.from, range.to);
        }
      }
      const where = and(...jobTenantConditions(ctx, ...conditions));

      const rows = await db.select({
        status: lifecycleStatus,
        count: sql<number>`count(*)`
      }).from(constructionJobs)
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .where(where)
        .groupBy(lifecycleStatus);

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
    const earliestFy = fyStartYearForDate(earliest);
    const latestFy = fyStartYearForDate(latest);
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
      const tenantId = tenantIdFromContext(ctx);

      // Get related data
      const [progress, assignments, financials, kanbanTasks, xeroAccountingSummary, checkMeasures, scheduleEvents, subcontracts, inductions] = await Promise.all([
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
        db.select({
          id: checkMeasureWorkbooks.id,
          status: checkMeasureWorkbooks.status,
        }).from(checkMeasureWorkbooks)
          .where(eq(checkMeasureWorkbooks.jobId, input.jobId)),
        tenantId
          ? db.select({
              id: constructionScheduleEvents.id,
              status: constructionScheduleEvents.status,
            }).from(constructionScheduleEvents)
              .where(and(eq(constructionScheduleEvents.jobId, input.jobId), eq(constructionScheduleEvents.tenantId, tenantId)))
          : Promise.resolve([]),
        tenantId
          ? db.select({
              id: projectSubcontracts.id,
              status: projectSubcontracts.status,
            }).from(projectSubcontracts)
              .where(and(eq(projectSubcontracts.jobId, input.jobId), eq(projectSubcontracts.tenantId, tenantId)))
          : Promise.resolve([]),
        db.select({
          id: siteInductions.id,
          status: siteInductions.status,
        }).from(siteInductions)
          .where(eq(siteInductions.jobId, input.jobId)),
      ]);

      const approvalMatchConditions: any[] = [eq(approvalProjects.crmJobId, job.id)];
      if (job.leadId) approvalMatchConditions.push(eq(approvalProjects.crmLeadId, job.leadId));
      if (job.clientName && job.siteAddress) {
        approvalMatchConditions.push(and(
          eq(approvalProjects.clientName, job.clientName),
          eq(approvalProjects.propertyAddress, job.siteAddress),
        ));
      }

      const approvalConditions: any[] = [];
      appendTenantScope(approvalConditions, approvalProjects.tenantId, tenantId);
      approvalConditions.push(or(...approvalMatchConditions));

      const matchedApprovalProjects = await db.select({
        id: approvalProjects.id,
        currentState: approvalProjects.currentState,
        overallStatus: approvalProjects.overallStatus,
        hbcfRequired: approvalProjects.hbcfRequired,
        hbcfStatus: approvalProjects.hbcfStatus,
        crmLeadId: approvalProjects.crmLeadId,
      })
        .from(approvalProjects)
        .where(and(...approvalConditions))
        .orderBy(desc(approvalProjects.updatedAt));

      const approvalProjectIds = matchedApprovalProjects.map((project) => project.id);
      const approvalLeadIds = Array.from(new Set([
        ...matchedApprovalProjects.map((project) => project.crmLeadId).filter((id): id is number => !!id),
        ...(job.leadId ? [job.leadId] : []),
      ]));

      const [approvalLodgementRows, approvalCertificateRows, hbcfRows] = approvalProjectIds.length > 0
        ? await Promise.all([
            db.select({
              id: approvalLodgements.id,
              lodgementType: approvalLodgements.lodgementType,
              status: approvalLodgements.status,
              determinationOutcome: approvalLodgements.determinationOutcome,
              updatedAt: approvalLodgements.updatedAt,
            }).from(approvalLodgements)
              .where(inArray(approvalLodgements.projectId, approvalProjectIds))
              .orderBy(desc(approvalLodgements.updatedAt)),
            db.select({
              id: approvalCertificates.id,
              certificateType: approvalCertificates.certificateType,
              certificateNumber: approvalCertificates.certificateNumber,
              issuedAt: approvalCertificates.issuedAt,
              updatedAt: approvalCertificates.updatedAt,
            }).from(approvalCertificates)
              .where(inArray(approvalCertificates.projectId, approvalProjectIds))
              .orderBy(desc(approvalCertificates.updatedAt)),
            tenantId
              ? db.select({
                  id: hbcfCertificates.id,
                  approvalProjectId: hbcfCertificates.approvalProjectId,
                  crmLeadId: hbcfCertificates.crmLeadId,
                  status: hbcfCertificates.status,
                  policyStatusGroup: hbcfCertificates.policyStatusGroup,
                  updatedAt: hbcfCertificates.updatedAt,
                }).from(hbcfCertificates)
                  .where(and(
                    eq(hbcfCertificates.tenantId, tenantId),
                    approvalLeadIds.length > 0
                      ? or(inArray(hbcfCertificates.approvalProjectId, approvalProjectIds), inArray(hbcfCertificates.crmLeadId, approvalLeadIds))
                      : inArray(hbcfCertificates.approvalProjectId, approvalProjectIds),
                  ))
                  .orderBy(desc(hbcfCertificates.updatedAt))
              : Promise.resolve([]),
          ])
        : [[], [], []];

      const checkMeasureCompleted = checkMeasures.filter((row) => ["reviewed", "approved"].includes(String(row.status))).length;
      const scheduleStatus = scheduleEvents.length > 0
        ? completionStatus(scheduleEvents.length, scheduleEvents.filter((row) => ["completed", "cancelled"].includes(String(row.status))).length)
        : (job.actualEnd || job.status === "completed" ? "completed" : job.scheduledStart ? "in_progress" : "not_started");
      const activeSubcontracts = subcontracts.filter((row) => row.status !== "cancelled" && row.status !== "declined");
      const subcontractStatus = activeSubcontracts.length > 0
        ? completionStatus(activeSubcontracts.length, activeSubcontracts.filter((row) => row.status === "signed").length)
        : "not_started";
      const inductionStatus = completionStatus(inductions.length, inductions.filter((row) => row.status === "completed").length);

      const approvalCompleted = matchedApprovalProjects.filter((project) => project.overallStatus === "completed").length;
      const commencementRecord = approvalCertificateRows.find((certificate) => isCommencementCertificateType(certificate.certificateType));
      const approvalWorkflowStatus: SummaryStatus = matchedApprovalProjects.length === 0
        ? "not_started"
        : (approvalCompleted >= matchedApprovalProjects.length || !!commencementRecord ? "completed" : "in_progress");

      const daRecord = findLatestApprovalRecord(approvalLodgementRows, (value) => hasApprovalType(value, ["DA"]));
      const baLodgement = findLatestApprovalRecord(approvalLodgementRows, (value) => hasApprovalType(value, ["BA"]));
      const baCertificate = findLatestApprovalRecord(approvalCertificateRows, (value) => hasApprovalType(value, ["BA"]));
      const ccCertificate = findLatestApprovalRecord(approvalCertificateRows, (value) => hasApprovalType(value, ["CC", "CDC", "CCC"]));
      const ccLodgement = findLatestApprovalRecord(approvalLodgementRows, (value) => hasApprovalType(value, ["CC", "CDC", "CCC"]));
      const hbcfRecord = hbcfRows[0];
      const projectHbcfStatus = matchedApprovalProjects.find((project) => project.hbcfStatus && project.hbcfStatus !== "not_required")?.hbcfStatus
        || (matchedApprovalProjects.some((project) => project.hbcfRequired) ? "required" : "not_required");

      const approvalTypeDetails = [
        {
          key: "da",
          label: "DA",
          status: normaliseApprovalStatus(daRecord?.determinationOutcome || daRecord?.status),
        },
        {
          key: "ba",
          label: "BA",
          status: normaliseApprovalStatus(baCertificate?.issuedAt ? "issued" : baLodgement?.determinationOutcome || baLodgement?.status),
        },
        {
          key: "cc",
          label: "CC",
          status: normaliseApprovalStatus(ccCertificate?.issuedAt ? "issued" : ccLodgement?.determinationOutcome || ccLodgement?.status),
        },
        {
          key: "hbcf",
          label: "HBCF",
          status: normaliseApprovalStatus(hbcfRecord?.policyStatusGroup || hbcfRecord?.status || projectHbcfStatus),
        },
      ];
      const startedApprovalTypes = approvalTypeDetails.filter((item) => !["not_started", "not_required"].includes(item.status));
      const approvalTypeCount = startedApprovalTypes.length;
      const approvalTypeCompleteCount = startedApprovalTypes.filter((item) => isApprovalComplete(item.status)).length;
      const approvalTypeStatus = approvalTypeCount === 0
        ? "not_started"
        : completionStatus(approvalTypeCount, approvalTypeCompleteCount);

      const statusSummary = {
        checkMeasure: {
          status: completionStatus(checkMeasures.length, checkMeasureCompleted),
          count: checkMeasures.length,
        },
        approvals: {
          status: approvalWorkflowStatus,
          count: matchedApprovalProjects.length,
        },
        approvalTypes: {
          status: approvalTypeStatus,
          count: approvalTypeCount,
          details: approvalTypeDetails,
        },
        schedule: {
          status: scheduleStatus,
          count: scheduleEvents.length,
        },
        subcontracts: {
          status: subcontractStatus,
          count: subcontracts.length,
        },
        inductions: {
          status: inductionStatus,
          count: inductions.length,
        },
      };

      // Get installer names for assignments
      const installerIds = Array.from(new Set(assignments.map(a => a.installerId).filter((id): id is number => id != null)));
      const installers = installerIds.length > 0
        ? await db.select().from(constructionInstallers)
            .where(and(...installerTenantConditions(ctx, inArray(constructionInstallers.id, installerIds))))
        : [];
      const installerMap = Object.fromEntries(installers.map(i => [i.id, i]));
      const readinessMap = await getTradeReadinessMap(
        db,
        ctx,
        assignments.map((assignment) => ({ jobId: input.jobId, installerId: assignment.installerId })),
        new Map(installers.map((installer) => [installer.id, installer])),
      );

      // Get linked quote data
      let quoteData = null;
      if (job.quoteId) {
        const quoteConditions = [eq(quotes.id, job.quoteId)];
        appendExactQuoteTenantScope(quoteConditions, quotes.tenantId, tenantIdFromContext(ctx));
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
          company: crmLeads.company,
          phone: crmLeads.contactPhone,
          email: crmLeads.contactEmail,
          address: crmLeads.contactAddress,
          clientNumber: crmLeads.clientNumber,
          status: crmLeads.status,
          productType: crmLeads.productType,
        }).from(crmLeads).where(and(...leadConditions));
        leadData = l ? { ...l, displayName: crmLeadDisplayName(l) || null } : null;
      }

      const canonicalClient = canonicalClientFromLead(leadData);
      const displayJob = canonicalClient
        ? {
            ...job,
            storedClientName: job.clientName,
            clientName: canonicalClient.name,
            clientPhone: canonicalClient.phone,
            clientEmail: canonicalClient.email,
            clientNumber: canonicalClient.clientNumber,
            canonicalClient,
          }
        : job;

      const enrichedAssignments = assignments.map(a => ({
        ...a,
        installer: installerMap[a.installerId] || null,
        tradeReadiness: readinessMap.get(tradeReadinessKey(input.jobId, a.installerId)) || null,
        readinessWarnings: readinessMap.get(tradeReadinessKey(input.jobId, a.installerId))?.warnings || [],
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
        job: displayJob,
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
        statusSummary,
      };
    }),

  approvalActivity: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const job = await requireJobAccess(db, ctx, input.jobId);
      const tenantId = tenantIdFromContext(ctx);
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      }

      const matchConditions: any[] = [eq(approvalProjects.crmJobId, job.id)];
      if (job.leadId) matchConditions.push(eq(approvalProjects.crmLeadId, job.leadId));
      if (job.clientName && job.siteAddress) {
        matchConditions.push(and(
          eq(approvalProjects.clientName, job.clientName),
          eq(approvalProjects.propertyAddress, job.siteAddress),
        ));
      }

      const conditions: any[] = [];
      appendTenantScope(conditions, approvalProjects.tenantId, tenantId);
      conditions.push(or(...matchConditions));

      const projects = await db.select().from(approvalProjects)
        .where(and(...conditions))
        .orderBy(desc(approvalProjects.updatedAt))
        .limit(5);

      if (projects.length === 0) {
        return { projects };
      }

      const projectIds = projects.map((project) => project.id);
      const leadIds = Array.from(new Set(projects.map((project) => project.crmLeadId).filter((id): id is number => !!id)));
      const certifierContactIds = Array.from(new Set(projects.map((project) => project.certifierContactId).filter((id): id is number => !!id)));

      const [rfis, inspections, certificates, lodgements, hbcfRows, certifierContacts] = await Promise.all([
        db.select({
          id: approvalRfis.id,
          projectId: approvalRfis.projectId,
          rfiNumber: approvalRfis.rfiNumber,
          subject: approvalRfis.subject,
          requestedBy: approvalRfis.requestedBy,
          assignedToName: approvalRfis.assignedToName,
          assignedToContactName: approvalRfis.assignedToContactName,
          dueAt: approvalRfis.dueAt,
          receivedAt: approvalRfis.receivedAt,
          respondedAt: approvalRfis.respondedAt,
          status: approvalRfis.status,
          isBlocking: approvalRfis.isBlocking,
        })
          .from(approvalRfis)
          .where(inArray(approvalRfis.projectId, projectIds))
          .orderBy(desc(approvalRfis.createdAt)),
        db.select({
          id: approvalInspections.id,
          projectId: approvalInspections.projectId,
          inspectionType: approvalInspections.inspectionType,
          title: approvalInspections.title,
          scheduledDate: approvalInspections.scheduledDate,
          scheduledTime: approvalInspections.scheduledTime,
          inspectorName: approvalInspections.inspectorName,
          status: approvalInspections.status,
          result: approvalInspections.result,
          inspectedAt: approvalInspections.inspectedAt,
          isBlocking: approvalInspections.isBlocking,
          defectCount: approvalInspections.defectCount,
        })
          .from(approvalInspections)
          .where(inArray(approvalInspections.projectId, projectIds))
          .orderBy(desc(approvalInspections.createdAt)),
        db.select().from(approvalCertificates)
          .where(inArray(approvalCertificates.projectId, projectIds))
          .orderBy(desc(approvalCertificates.updatedAt)),
        db.select().from(approvalLodgements)
          .where(inArray(approvalLodgements.projectId, projectIds))
          .orderBy(desc(approvalLodgements.updatedAt)),
        db.select({
          id: hbcfCertificates.id,
          approvalProjectId: hbcfCertificates.approvalProjectId,
          crmLeadId: hbcfCertificates.crmLeadId,
          certificateNumber: hbcfCertificates.certificateNumber,
          policyNumber: hbcfCertificates.policyNumber,
          status: hbcfCertificates.status,
          builderName: hbcfCertificates.builderName,
          insurerName: hbcfCertificates.insurerName,
          contractPrice: hbcfCertificates.contractPrice,
          issuedAt: hbcfCertificates.issuedAt,
          expiresAt: hbcfCertificates.expiresAt,
          certificateUrl: hbcfCertificates.certificateUrl,
          syncStatus: hbcfCertificates.syncStatus,
          syncError: hbcfCertificates.syncError,
          updatedAt: hbcfCertificates.updatedAt,
        })
          .from(hbcfCertificates)
          .where(and(
            eq(hbcfCertificates.tenantId, tenantId),
            leadIds.length > 0
              ? or(inArray(hbcfCertificates.approvalProjectId, projectIds), inArray(hbcfCertificates.crmLeadId, leadIds))
              : inArray(hbcfCertificates.approvalProjectId, projectIds),
          ))
          .orderBy(desc(hbcfCertificates.updatedAt)),
        certifierContactIds.length > 0
          ? db.select({
            id: suppliers.id,
            name: suppliers.name,
            contactName: suppliers.contactName,
            phone: suppliers.phone,
            email: suppliers.email,
            address: suppliers.address,
            category: suppliers.category,
          })
            .from(suppliers)
            .where(and(
              eq(suppliers.tenantId, tenantId),
              eq(suppliers.supplierScope, "construction"),
              inArray(suppliers.id, certifierContactIds),
            ))
          : Promise.resolve([]),
      ]);

      const certifierById = new Map((certifierContacts as any[]).map((contact) => [contact.id, contact]));

      const enrichedProjects = projects.map((project) => {
        const projectRfis = rfis.filter((rfi) => rfi.projectId === project.id);
        const projectInspections = inspections.filter((inspection) => inspection.projectId === project.id);
        const commencementCertificate = certificates.find((certificate) =>
          certificate.projectId === project.id && isCommencementCertificateType(certificate.certificateType)
        );
        const commencementLodgement = lodgements.find((lodgement) =>
          lodgement.projectId === project.id && isCommencementCertificateType(lodgement.lodgementType)
        );
        const approvalDate = commencementCertificate?.issuedAt ||
          commencementLodgement?.determinationAt ||
          commencementLodgement?.acceptedAt ||
          null;
        const sourceExpiry = commencementCertificate?.expiresAt || commencementLodgement?.expiresAt || null;
        const calculatedExpiry = !sourceExpiry && approvalDate ? addYears(new Date(approvalDate), 5) : null;
        const hbcfCertificate = hbcfRows.find((certificate) =>
          certificate.approvalProjectId === project.id ||
          (!!project.crmLeadId && certificate.crmLeadId === project.crmLeadId)
        );
        const certifierContact = project.certifierContactId ? certifierById.get(project.certifierContactId) : null;

        return {
          ...project,
          certifierContact: {
            businessName: certifierContact?.name || project.certifierName || null,
            contactName: certifierContact?.contactName || project.certifierName || null,
            notificationEmail: certifierContact?.email || null,
            phone: certifierContact?.phone || null,
            address: certifierContact?.address || null,
            category: certifierContact?.category || null,
          },
          hbcf: {
            required: project.hbcfRequired,
            status: hbcfCertificate?.status || project.hbcfStatus,
            certificateNumber: hbcfCertificate?.certificateNumber || null,
            policyNumber: hbcfCertificate?.policyNumber || null,
            issuedAt: hbcfCertificate?.issuedAt || null,
            expiresAt: hbcfCertificate?.expiresAt || null,
            certificateUrl: hbcfCertificate?.certificateUrl || null,
            syncStatus: hbcfCertificate?.syncStatus || null,
            syncError: hbcfCertificate?.syncError || null,
            requirementReason: project.hbcfRequirementReason || null,
          },
          commencementApproval: {
            certificateType: commencementCertificate?.certificateType || commencementLodgement?.lodgementType || null,
            certificateNumber: commencementCertificate?.certificateNumber || commencementLodgement?.externalReferenceNumber || null,
            status: commencementCertificate
              ? "issued"
              : commencementLodgement?.status || null,
            issuedBy: commencementCertificate?.issuedBy || commencementLodgement?.authorityName || null,
            approvalDate,
            expiresAt: sourceExpiry || calculatedExpiry,
            expiryIsEstimated: !sourceExpiry && !!calculatedExpiry,
          },
          rfis: projectRfis.slice(0, 5),
          rfiSummary: {
            total: projectRfis.length,
            open: projectRfis.filter((rfi) => ["open", "in_progress", "overdue"].includes(String(rfi.status))).length,
            blocking: projectRfis.filter((rfi) => rfi.isBlocking && !["responded", "closed"].includes(String(rfi.status))).length,
          },
          inspections: projectInspections.slice(0, 5),
          inspectionSummary: {
            total: projectInspections.length,
            pending: projectInspections.filter((inspection) => ["required", "scheduled", "booked", "deferred"].includes(String(inspection.status))).length,
            failed: projectInspections.filter((inspection) => inspection.status === "failed").length,
            passed: projectInspections.filter((inspection) => inspection.status === "passed").length,
          },
        };
      });

      return { projects: enrichedProjects };
    }),

  projectTeamByLeadId: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const [row] = await db.select({
        jobId: constructionJobs.id,
        clientName: constructionJobs.clientName,
        quoteNumber: constructionJobs.quoteNumber,
        constructionManagerId: constructionJobFinancials.constructionManagerId,
        constructionManagerName: constructionJobFinancials.constructionManagerName,
        technicalDesignerId: constructionJobFinancials.technicalDesignerId,
        technicalDesignerName: constructionJobFinancials.technicalDesignerName,
      })
        .from(constructionJobs)
        .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
        .leftJoin(crmLeads, eq(constructionJobs.leadId, crmLeads.id))
        .where(and(
          ...jobTenantConditions(ctx, eq(constructionJobs.leadId, input.leadId)),
          visibleConstructionClientCondition(),
        ))
        .orderBy(desc(constructionJobs.updatedAt))
        .limit(1);

      return row || null;
    }),

  jobInstructions: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobAccess(db, ctx, input.jobId);

      return db.select({
        id: constructionJobInstructions.id,
        jobId: constructionJobInstructions.jobId,
        title: constructionJobInstructions.title,
        description: constructionJobInstructions.description,
        category: constructionJobInstructions.category,
        status: constructionJobInstructions.status,
        priority: constructionJobInstructions.priority,
        visibleToTrade: constructionJobInstructions.visibleToTrade,
        visibleToClient: constructionJobInstructions.visibleToClient,
        assignedInstallerId: constructionJobInstructions.assignedInstallerId,
        sendToUserId: constructionJobInstructions.sendToUserId,
        assignedInstallerName: constructionInstallers.name,
        isBlocking: constructionJobInstructions.isBlocking,
        dueAt: constructionJobInstructions.dueAt,
        triggerLabel: constructionJobInstructions.triggerLabel,
        sortOrder: constructionJobInstructions.sortOrder,
        responseType: constructionJobInstructions.responseType,
        responseOptions: constructionJobInstructions.responseOptions,
        responseRequired: constructionJobInstructions.responseRequired,
        responseHelpText: constructionJobInstructions.responseHelpText,
        responseValue: constructionJobInstructions.responseValue,
        createdByName: constructionJobInstructions.createdByName,
        updatedByName: constructionJobInstructions.updatedByName,
        createdAt: constructionJobInstructions.createdAt,
        updatedAt: constructionJobInstructions.updatedAt,
      })
        .from(constructionJobInstructions)
        .leftJoin(
          constructionInstallers,
          and(...installerTenantConditions(ctx, eq(constructionInstallers.id, constructionJobInstructions.assignedInstallerId))),
        )
        .where(and(...instructionTenantConditions(ctx, eq(constructionJobInstructions.jobId, input.jobId))))
        .orderBy(desc(constructionJobInstructions.isBlocking), asc(constructionJobInstructions.sortOrder), asc(constructionJobInstructions.createdAt));
    }),

  createJobInstruction: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      title: z.string().trim().min(1).max(255),
      description: z.string().max(5000).nullable().optional(),
      category: jobInstructionCategorySchema.default("general"),
      status: jobInstructionStatusSchema.default("open"),
      priority: jobInstructionPrioritySchema.default("normal"),
      visibleToTrade: z.boolean().default(true),
      visibleToClient: z.boolean().default(false),
      assignedInstallerId: z.number().nullable().optional(),
      sendToUserId: z.number().nullable().optional(),
      isBlocking: z.boolean().default(false),
      dueAt: z.string().nullable().optional(),
      triggerLabel: z.string().max(255).nullable().optional(),
      sortOrder: z.number().int().optional(),
      responseType: jobInstructionResponseTypeSchema.default("check"),
      responseOptions: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
      responseRequired: z.boolean().default(false),
      responseHelpText: z.string().max(CONSTRUCTION_CHECKLIST_HELP_TEXT_MAX_LENGTH).nullable().optional(),
      responseValue: jobInstructionResponseValueSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobAccess(db, ctx, input.jobId);
      await requireVisibleJobInstaller(db, ctx, input.jobId, input.assignedInstallerId);
      if (input.sendToUserId != null) {
        await resolveProjectTeamRole(db, ctx, input.sendToUserId, null);
      }
      const tenantId = tenantIdFromContext(ctx);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const [result] = await db.insert(constructionJobInstructions).values({
        tenantId,
        jobId: input.jobId,
        title: input.title,
        description: trimNullable(input.description),
        category: input.category,
        status: input.status,
        priority: input.priority,
        visibleToTrade: input.visibleToTrade,
        visibleToClient: input.visibleToClient,
        assignedInstallerId: input.assignedInstallerId ?? null,
        sendToUserId: input.sendToUserId ?? null,
        isBlocking: input.isBlocking,
        dueAt: parseInstructionDate(input.dueAt),
        triggerLabel: trimNullable(input.triggerLabel),
        sourceType: "manual",
        sortOrder: input.sortOrder ?? 0,
        responseType: input.responseType,
        responseOptions: input.responseOptions,
        responseRequired: input.responseRequired,
        responseHelpText: trimNullable(input.responseHelpText),
        responseValue: input.responseValue ?? null,
        createdByUserId: ctx.user?.id ?? null,
        createdByName: actorName(ctx),
        updatedByUserId: ctx.user?.id ?? null,
        updatedByName: actorName(ctx),
      }).$returningId();

      return { id: result.id };
    }),

  updateJobInstruction: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().max(5000).nullable().optional(),
      category: jobInstructionCategorySchema.optional(),
      status: jobInstructionStatusSchema.optional(),
      priority: jobInstructionPrioritySchema.optional(),
      visibleToTrade: z.boolean().optional(),
      visibleToClient: z.boolean().optional(),
      assignedInstallerId: z.number().nullable().optional(),
      sendToUserId: z.number().nullable().optional(),
      isBlocking: z.boolean().optional(),
      dueAt: z.string().nullable().optional(),
      triggerLabel: z.string().max(255).nullable().optional(),
      sortOrder: z.number().int().optional(),
      responseType: jobInstructionResponseTypeSchema.optional(),
      responseOptions: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
      responseRequired: z.boolean().optional(),
      responseHelpText: z.string().max(CONSTRUCTION_CHECKLIST_HELP_TEXT_MAX_LENGTH).nullable().optional(),
      responseValue: jobInstructionResponseValueSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const instruction = await requireInstructionAccess(db, ctx, input.id);
      if ("assignedInstallerId" in input) {
        await requireVisibleJobInstaller(db, ctx, instruction.jobId, input.assignedInstallerId);
      }
      if ("sendToUserId" in input && input.sendToUserId != null) {
        await resolveProjectTeamRole(db, ctx, input.sendToUserId, null);
      }

      const updates: Record<string, any> = {
        updatedByUserId: ctx.user?.id ?? null,
        updatedByName: actorName(ctx),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = trimNullable(input.description);
      if (input.category !== undefined) updates.category = input.category;
      if (input.status !== undefined) updates.status = input.status;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.visibleToTrade !== undefined) updates.visibleToTrade = input.visibleToTrade;
      if (input.visibleToClient !== undefined) updates.visibleToClient = input.visibleToClient;
      if ("assignedInstallerId" in input) updates.assignedInstallerId = input.assignedInstallerId ?? null;
      if ("sendToUserId" in input) updates.sendToUserId = input.sendToUserId ?? null;
      if (input.isBlocking !== undefined) updates.isBlocking = input.isBlocking;
      if (input.dueAt !== undefined) updates.dueAt = parseInstructionDate(input.dueAt);
      if (input.triggerLabel !== undefined) updates.triggerLabel = trimNullable(input.triggerLabel);
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.responseType !== undefined) updates.responseType = input.responseType;
      if (input.responseOptions !== undefined) updates.responseOptions = input.responseOptions;
      if (input.responseRequired !== undefined) updates.responseRequired = input.responseRequired;
      if (input.responseHelpText !== undefined) updates.responseHelpText = trimNullable(input.responseHelpText);
      if (input.responseValue !== undefined) updates.responseValue = input.responseValue;

      await db.update(constructionJobInstructions)
        .set(updates)
        .where(and(...instructionTenantConditions(ctx, eq(constructionJobInstructions.id, input.id))));

      return { success: true };
    }),

  uploadJobInstructionResponseFile: protectedProcedure
    .input(z.object({
      instructionId: z.number(),
      fileName: z.string().trim().min(1).max(255),
      fileMimeType: z.string().trim().min(1).max(128),
      fileBase64: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const instruction = await requireInstructionAccess(db, ctx, input.instructionId);
      const responseType = String(instruction.responseType || "check");
      if (responseType !== "image_upload" && responseType !== "file_upload") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This checklist item does not accept file uploads" });
      }
      if (responseType === "image_upload" && !input.fileMimeType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please upload an image for this checklist item" });
      }

      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.byteLength > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Checklist upload must be under 25MB" });
      }

      const tenantId = tenantIdFromContext(ctx);
      const tenantSegment = tenantId ? String(tenantId) : "single";
      const suffix = crypto.randomBytes(6).toString("hex");
      const safeName = safeUploadFilename(input.fileName);
      const fileKey = `job-instruction-responses/${tenantSegment}/jobs/${instruction.jobId}/instruction-${instruction.id}/${Date.now()}-${suffix}-${safeName}`;
      const result = await storagePut(fileKey, buffer, input.fileMimeType);
      const existingValue = instruction.responseValue && typeof instruction.responseValue === "object" ? instruction.responseValue as any : {};
      const existingFiles = Array.isArray(existingValue.files) ? existingValue.files : [];
      const fileRecord = {
        url: result.url,
        key: result.key,
        fileName: input.fileName,
        mimeType: input.fileMimeType,
        size: buffer.byteLength,
        uploadedAt: new Date().toISOString(),
        uploadedBy: actorName(ctx),
      };
      const responseValue = {
        files: [...existingFiles, fileRecord],
      };

      await db.update(constructionJobInstructions)
        .set({
          responseValue,
          updatedByUserId: ctx.user?.id ?? null,
          updatedByName: actorName(ctx),
        })
        .where(and(...instructionTenantConditions(ctx, eq(constructionJobInstructions.id, input.instructionId))));

      return { success: true, file: fileRecord, responseValue };
    }),

  deleteJobInstruction: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireInstructionAccess(db, ctx, input.id);
      await db.delete(constructionJobInstructions)
        .where(and(...instructionTenantConditions(ctx, eq(constructionJobInstructions.id, input.id))));
      return { success: true };
    }),

  postBuildMaintenance: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobAccess(db, ctx, input.jobId);

      const [requests, defects] = await Promise.all([
        db.select({
          id: portalMaintenanceRequests.id,
          constructionJobId: portalMaintenanceRequests.constructionJobId,
          requestSource: portalMaintenanceRequests.requestSource,
          classification: portalMaintenanceRequests.classification,
          reportedByName: portalMaintenanceRequests.reportedByName,
          reportedByContact: portalMaintenanceRequests.reportedByContact,
          description: portalMaintenanceRequests.description,
          photoUrls: portalMaintenanceRequests.photoUrls,
          urgency: portalMaintenanceRequests.urgency,
          status: portalMaintenanceRequests.status,
          responseNotes: portalMaintenanceRequests.responseNotes,
          scheduledDate: portalMaintenanceRequests.scheduledDate,
          completedAt: portalMaintenanceRequests.completedAt,
          createdAt: portalMaintenanceRequests.createdAt,
          updatedAt: portalMaintenanceRequests.updatedAt,
        })
          .from(portalMaintenanceRequests)
          .innerJoin(constructionJobs, eq(portalMaintenanceRequests.constructionJobId, constructionJobs.id))
          .where(and(...jobTenantConditions(ctx, eq(portalMaintenanceRequests.constructionJobId, input.jobId))))
          .orderBy(desc(portalMaintenanceRequests.createdAt)),
        db.select({
          id: portalDefects.id,
          constructionJobId: portalDefects.constructionJobId,
          title: portalDefects.title,
          description: portalDefects.description,
          photoUrls: portalDefects.photoUrls,
          status: portalDefects.status,
          classification: portalDefects.classification,
          resolutionNotes: portalDefects.resolutionNotes,
          resolutionPhotoUrls: portalDefects.resolutionPhotoUrls,
          resolvedAt: portalDefects.resolvedAt,
          createdAt: portalDefects.createdAt,
          updatedAt: portalDefects.updatedAt,
        })
          .from(portalDefects)
          .innerJoin(constructionJobs, eq(portalDefects.constructionJobId, constructionJobs.id))
          .where(and(...jobTenantConditions(ctx, eq(portalDefects.constructionJobId, input.jobId))))
          .orderBy(desc(portalDefects.createdAt)),
      ]);

      return { requests, defects };
    }),

  createMaintenanceRequest: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      description: z.string().trim().min(1).max(5000),
      urgency: z.enum(["low", "medium", "high"]).default("medium"),
      requestSource: maintenanceRequestSourceSchema.default("phone"),
      classification: postBuildClassificationSchema.default("unclassified"),
      reportedByName: z.string().max(255).nullable().optional(),
      reportedByContact: z.string().max(255).nullable().optional(),
      responseNotes: z.string().max(5000).nullable().optional(),
      scheduledDate: z.string().nullable().optional(),
      attachments: z.array(maintenanceAttachmentSchema).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobAccess(db, ctx, input.jobId);
      const attachmentUrls = await storeMaintenanceAttachments({
        tenantId: tenantIdFromContext(ctx),
        jobId: input.jobId,
        files: input.attachments,
      });

      const [result] = await db.insert(portalMaintenanceRequests).values({
        constructionJobId: input.jobId,
        portalAccessId: null,
        requestSource: input.requestSource,
        classification: input.classification,
        reportedByName: trimNullable(input.reportedByName),
        reportedByContact: trimNullable(input.reportedByContact),
        description: input.description,
        photoUrls: attachmentUrls.length > 0 ? attachmentUrls : null,
        urgency: input.urgency,
        status: "submitted",
        responseNotes: trimNullable(input.responseNotes),
        scheduledDate: parseInstructionDate(input.scheduledDate),
      }).$returningId();

      return { id: result.id };
    }),

  updateMaintenanceRequest: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["submitted", "reviewed", "scheduled", "completed"]).optional(),
      urgency: z.enum(["low", "medium", "high"]).optional(),
      requestSource: maintenanceRequestSourceSchema.optional(),
      classification: postBuildClassificationSchema.optional(),
      reportedByName: z.string().max(255).nullable().optional(),
      reportedByContact: z.string().max(255).nullable().optional(),
      responseNotes: z.string().max(5000).nullable().optional(),
      scheduledDate: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireMaintenanceRequestAccess(db, ctx, input.id);

      const updates: Record<string, any> = {};
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status === "completed") updates.completedAt = new Date();
      }
      if (input.urgency !== undefined) updates.urgency = input.urgency;
      if (input.requestSource !== undefined) updates.requestSource = input.requestSource;
      if (input.classification !== undefined) updates.classification = input.classification;
      if (input.reportedByName !== undefined) updates.reportedByName = trimNullable(input.reportedByName);
      if (input.reportedByContact !== undefined) updates.reportedByContact = trimNullable(input.reportedByContact);
      if (input.responseNotes !== undefined) updates.responseNotes = trimNullable(input.responseNotes);
      if (input.scheduledDate !== undefined) updates.scheduledDate = parseInstructionDate(input.scheduledDate);

      if (Object.keys(updates).length === 0) return { success: true };

      await db.update(portalMaintenanceRequests)
        .set(updates)
        .where(eq(portalMaintenanceRequests.id, input.id));

      return { success: true };
    }),

  addMaintenanceRequestAttachments: protectedProcedure
    .input(z.object({
      id: z.number(),
      attachments: z.array(maintenanceAttachmentSchema).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const request = await requireMaintenanceRequestAccess(db, ctx, input.id);
      const attachmentUrls = await storeMaintenanceAttachments({
        tenantId: tenantIdFromContext(ctx),
        jobId: request.constructionJobId,
        files: input.attachments,
      });
      const existing = Array.isArray(request.photoUrls)
        ? request.photoUrls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
        : [];
      await db.update(portalMaintenanceRequests)
        .set({ photoUrls: [...existing, ...attachmentUrls] })
        .where(eq(portalMaintenanceRequests.id, input.id));
      return { success: true, attachments: attachmentUrls };
    }),

  updatePortalDefect: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["reported", "acknowledged", "scheduled", "resolved"]).optional(),
      classification: postBuildClassificationSchema.optional(),
      resolutionNotes: z.string().max(5000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requirePortalDefectAccess(db, ctx, input.id);

      const updates: Record<string, any> = {};
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status === "resolved") updates.resolvedAt = new Date();
      }
      if (input.classification !== undefined) updates.classification = input.classification;
      if (input.resolutionNotes !== undefined) updates.resolutionNotes = trimNullable(input.resolutionNotes);

      if (Object.keys(updates).length === 0) return { success: true };

      await db.update(portalDefects)
        .set(updates)
        .where(eq(portalDefects.id, input.id));

      return { success: true };
    }),

  updateJobDetails: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      clientFirstName: z.string().max(100).nullable().optional(),
      clientLastName: z.string().max(100).nullable().optional(),
      company: z.string().max(255).nullable().optional(),
      phone: z.string().max(50).nullable().optional(),
      email: z.string().max(320).nullable().optional(),
      siteAddress: z.string().max(5000).nullable().optional(),
      scheduledStart: z.string().nullable().optional(),
      scheduledEnd: z.string().nullable().optional(),
      actualStart: z.string().nullable().optional(),
      actualEnd: z.string().nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const job = await requireJobAccess(db, ctx, input.jobId);

      const jobUpdates: Record<string, any> = {};
      if (input.siteAddress !== undefined) jobUpdates.siteAddress = trimNullable(input.siteAddress);
      if (input.scheduledStart !== undefined) jobUpdates.scheduledStart = parseJobDetailDate(input.scheduledStart, "scheduled start");
      if (input.scheduledEnd !== undefined) jobUpdates.scheduledEnd = parseJobDetailDate(input.scheduledEnd, "scheduled end");
      if (input.actualStart !== undefined) jobUpdates.actualStart = parseJobDetailDate(input.actualStart, "actual start");
      if (input.actualEnd !== undefined) jobUpdates.actualEnd = parseJobDetailDate(input.actualEnd, "actual end");
      if (input.notes !== undefined) jobUpdates.notes = trimNullable(input.notes);

      const leadUpdates: Record<string, any> = {};
      if (input.clientFirstName !== undefined) leadUpdates.contactFirstName = trimNullable(input.clientFirstName);
      if (input.clientLastName !== undefined) leadUpdates.contactLastName = trimNullable(input.clientLastName);
      if (input.company !== undefined) leadUpdates.company = trimNullable(input.company);
      if (input.phone !== undefined) leadUpdates.contactPhone = trimNullable(input.phone);
      if (input.email !== undefined) leadUpdates.contactEmail = trimNullable(input.email);
      if (input.siteAddress !== undefined) leadUpdates.contactAddress = trimNullable(input.siteAddress);

      if (Object.keys(leadUpdates).length > 0) {
        if (job.leadId) {
          const leadConditions = [eq(crmLeads.id, job.leadId)];
          appendTenantScope(leadConditions, crmLeads.tenantId, tenantIdFromContext(ctx));
          await db.update(crmLeads)
            .set(leadUpdates)
            .where(and(...leadConditions));
        } else {
          const fallbackName = [
            trimNullable(input.clientFirstName),
            trimNullable(input.clientLastName),
          ].filter(Boolean).join(" ") || trimNullable(input.company);
          if (fallbackName) jobUpdates.clientName = fallbackName;
        }
      }

      if (Object.keys(jobUpdates).length > 0) {
        await db.update(constructionJobs)
          .set(jobUpdates)
          .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, input.jobId))));
      }

      return { success: true };
    }),

  updateProjectTeam: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      constructionManagerId: z.number().nullable().optional(),
      constructionManagerName: z.string().nullable().optional(),
      technicalDesignerId: z.number().nullable().optional(),
      technicalDesignerName: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { jobId } = input;
      await requireJobAccess(db, ctx, jobId);

      const constructionManager = await resolveProjectTeamRole(
        db,
        ctx,
        input.constructionManagerId,
        input.constructionManagerName,
      );
      const technicalDesigner = await resolveProjectTeamRole(
        db,
        ctx,
        input.technicalDesignerId,
        input.technicalDesignerName,
      );

      const values = {
        constructionManagerId: constructionManager.userId,
        constructionManagerName: constructionManager.name,
        technicalDesignerId: technicalDesigner.userId,
        technicalDesignerName: technicalDesigner.name,
      };

      const existing = await db.select({ id: constructionJobFinancials.id })
        .from(constructionJobFinancials)
        .where(eq(constructionJobFinancials.jobId, jobId))
        .limit(1);

      if (existing.length > 0) {
        await db.update(constructionJobFinancials)
          .set(values)
          .where(eq(constructionJobFinancials.jobId, jobId));
      } else {
        await db.insert(constructionJobFinancials).values({ jobId, ...values });
      }

      return { success: true };
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
      technicalDesignerId: z.number().nullable().optional(),
      technicalDesignerName: z.string().nullable().optional(),
      roofStyle: z.string().optional(),
      postcode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const { jobId, ...data } = input;
      await requireJobAccess(db, ctx, jobId);

      if ("constructionManagerId" in data || "constructionManagerName" in data) {
        const constructionManager = await resolveProjectTeamRole(
          db,
          ctx,
          data.constructionManagerId,
          data.constructionManagerName,
        );
        data.constructionManagerId = constructionManager.userId;
        data.constructionManagerName = constructionManager.name;
      }
      if ("technicalDesignerId" in data || "technicalDesignerName" in data) {
        const technicalDesigner = await resolveProjectTeamRole(
          db,
          ctx,
          data.technicalDesignerId,
          data.technicalDesignerName,
        );
        data.technicalDesignerId = technicalDesigner.userId;
        data.technicalDesignerName = technicalDesigner.name;
      }

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
