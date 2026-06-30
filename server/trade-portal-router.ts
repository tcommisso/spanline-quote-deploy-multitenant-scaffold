import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getTenantBrandingSettings } from "./db";
import { eq, and, desc, gte, lte, asc, or, inArray, gt, sql, count, like, isNull } from "drizzle-orm";
import {
  tradePortalAccess, tradePortalSessions,
  tradeAvailabilities, tradeInvoices, tradeRemittances,
  tradePhotos, tradeMessages, tradeInvoicePhotos,
  constructionInstallers, constructionJobs, constructionScheduleEvents,
  constructionHolidayCalendarDays,
  constructionAssignments, jobSharedFiles, quotes,
  crmLeads,
  portalNews, poMilestones, cmWorkOrders,
  projectSubcontracts, tradeInvoiceLines,
  chatChannels, chatMessages, chatChannelMembers,
  suppliers, flashingOrders, flashingOrderLines, flashingOrderStatusHistory,
  flashingProfileTemplates,
  approvalProjects, approvalInspections, constructionJobInstructions,
  tradeJobInstructionActions,
  type PaymentMilestone,
} from "../drizzle/schema";
import { publicProcedure, router, middleware } from "./_core/trpc";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import crypto from "crypto";
import { getCompanyName } from "./company-name";
import { triggerPushTradeInvoiceSubmitted } from "./push-triggers";
import { logNotification } from "./notification-gateway";
import { assertRateLimit } from "./_core/rateLimit";
import { buildTrustedAppUrlForTenant } from "./_core/url";
import { appendTenantScope, isRecordVisibleToTenant, tenantIdFromContext } from "./_core/tenant-scope";
import { resolveStorageUrlForPortal } from "./_core/storageSignedUrl";
import { sendNotificationEmail } from "./email";
import {
  addTradeRemittanceDedupeKeys,
  dedupeTradeRemittances,
  getXeroPaymentRemittancesForTrade,
  hasTradeRemittanceDedupeKey,
} from "./trade-remittance-xero";
import {
  dateKeyToStorageDate,
  isWeekendDateKey,
  localDateKeyFromDate,
  toDateKey,
} from "./_core/australianHolidays";
import { canonicalClientFromLead } from "./canonical-client";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateToken(length = 64): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function appendExactQuoteTenantScope(conditions: any[], column: any, tenantId: number | null | undefined) {
  conditions.push(tenantId ? eq(column, tenantId) : sql`1 = 0`);
}

function tradePortalAccessConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, tradePortalAccess.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tradePortalTenantId(ctx: any) {
  return ctx.tradeAccess?.tenantId ?? tenantIdFromContext(ctx);
}

function tradePortalCmsConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, portalNews.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

function requireTradeAccessVisible(
  ctx: any,
  access: typeof tradePortalAccess.$inferSelect | null | undefined,
) {
  if (!access || !isRecordVisibleToTenant(access.tenantId, tenantIdFromContext(ctx))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired link" });
  }
  return access;
}

function tradeInstallerConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionInstallers.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

function tradeHolidayConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionHolidayCalendarDays.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

function tradeJobConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

function tradeLeadJoinConditions(ctx: any) {
  const conditions = [eq(constructionJobs.leadId, crmLeads.id)];
  appendTenantScope(conditions, crmLeads.tenantId, tradePortalTenantId(ctx));
  return and(...conditions);
}

function canonicalClientFromRow(row: any) {
  return canonicalClientFromLead({
    id: row.leadId,
    contactFirstName: row.leadFirstName,
    contactLastName: row.leadLastName,
    company: row.leadCompany,
    contactPhone: row.leadPhone,
    contactEmail: row.leadEmail,
    contactAddress: row.leadAddress,
    clientNumber: row.leadClientNumber,
    status: row.leadStatus,
  });
}

function withCanonicalClientName<T extends { clientName?: string | null }>(row: T): T & { storedClientName?: string | null } {
  const canonicalClient = canonicalClientFromRow(row);
  if (!canonicalClient) return row;
  return {
    ...row,
    storedClientName: row.clientName ?? null,
    clientName: canonicalClient.name,
  };
}

async function getCanonicalClientForTradeJob(db: any, ctx: any, job: typeof constructionJobs.$inferSelect) {
  if (!job.leadId) return null;
  const conditions = [eq(crmLeads.id, job.leadId)];
  appendTenantScope(conditions, crmLeads.tenantId, tradePortalTenantId(ctx));
  const [lead] = await db.select({
    id: crmLeads.id,
    contactFirstName: crmLeads.contactFirstName,
    contactLastName: crmLeads.contactLastName,
    company: crmLeads.company,
    contactPhone: crmLeads.contactPhone,
    contactEmail: crmLeads.contactEmail,
    contactAddress: crmLeads.contactAddress,
    clientNumber: crmLeads.clientNumber,
    status: crmLeads.status,
  }).from(crmLeads).where(and(...conditions)).limit(1);
  return canonicalClientFromLead(lead);
}

function tradeJobInstructionConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobInstructions.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

function tradeInstructionActionConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, tradeJobInstructionActions.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

async function requireTradeJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select().from(constructionJobs)
    .where(and(...tradeJobConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }

  const installerId = ctx.tradeAccess.installerId;
  const [assignment] = await db.select({ id: constructionAssignments.id })
    .from(constructionAssignments)
    .where(and(
      eq(constructionAssignments.jobId, jobId),
      eq(constructionAssignments.installerId, installerId),
    ))
    .limit(1);

  if (assignment) return job;

  const [scheduledEvent] = await db.select({ id: constructionScheduleEvents.id })
    .from(constructionScheduleEvents)
    .where(and(
      eq(constructionScheduleEvents.jobId, jobId),
      eq(constructionScheduleEvents.assignedInstallerId, installerId),
    ))
    .limit(1);

  if (!scheduledEvent) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this job" });
  }

  return job;
}

async function requireOptionalTradeJobAccess(db: any, ctx: any, jobId?: number | null) {
  if (!jobId) return null;
  return requireTradeJobAccess(db, ctx, jobId);
}

async function getVisibleTradeJobIds(db: any, ctx: any, installerId: number) {
  const assignmentRows = await db.select({ jobId: constructionJobs.id })
    .from(constructionJobs)
    .innerJoin(constructionAssignments, eq(constructionAssignments.jobId, constructionJobs.id))
    .where(and(...tradeJobConditions(ctx, eq(constructionAssignments.installerId, installerId))));

  const scheduleRows = await db.select({ jobId: constructionJobs.id })
    .from(constructionJobs)
    .innerJoin(constructionScheduleEvents, eq(constructionScheduleEvents.jobId, constructionJobs.id))
    .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, installerId))));

  return Array.from(new Set([
    ...assignmentRows.map((row: { jobId: number }) => row.jobId),
    ...scheduleRows.map((row: { jobId: number }) => row.jobId),
  ]));
}

function approvalProjectMatchConditions(job: typeof constructionJobs.$inferSelect) {
  const matchConditions: any[] = [eq(approvalProjects.crmJobId, job.id)];
  if (job.leadId) matchConditions.push(eq(approvalProjects.crmLeadId, job.leadId));
  if (job.clientName && job.siteAddress) {
    matchConditions.push(and(
      eq(approvalProjects.clientName, job.clientName),
      eq(approvalProjects.propertyAddress, job.siteAddress),
    ));
  }
  return matchConditions;
}

async function getApprovalInspectionInstructionItems(db: any, ctx: any, job: typeof constructionJobs.$inferSelect) {
  const tenantId = tradePortalTenantId(ctx);
  const conditions: any[] = [];
  appendTenantScope(conditions, approvalProjects.tenantId, tenantId);
  conditions.push(or(...approvalProjectMatchConditions(job)));

  const projects = await db.select({
    id: approvalProjects.id,
    projectNumber: approvalProjects.projectNumber,
    name: approvalProjects.name,
  })
    .from(approvalProjects)
    .where(and(...conditions))
    .orderBy(desc(approvalProjects.updatedAt))
    .limit(5);

  if (projects.length === 0) return [];

  const projectMap = Object.fromEntries(projects.map((project: any) => [project.id, project]));
  const inspections = await db.select({
    id: approvalInspections.id,
    projectId: approvalInspections.projectId,
    inspectionType: approvalInspections.inspectionType,
    title: approvalInspections.title,
    description: approvalInspections.description,
    scheduledDate: approvalInspections.scheduledDate,
    scheduledTime: approvalInspections.scheduledTime,
    inspectorName: approvalInspections.inspectorName,
    status: approvalInspections.status,
    result: approvalInspections.result,
    resultNotes: approvalInspections.resultNotes,
    inspectedAt: approvalInspections.inspectedAt,
    hasDefects: approvalInspections.hasDefects,
    defectCount: approvalInspections.defectCount,
    isBlocking: approvalInspections.isBlocking,
    blockingGate: approvalInspections.blockingGate,
    createdAt: approvalInspections.createdAt,
    updatedAt: approvalInspections.updatedAt,
  })
    .from(approvalInspections)
    .where(and(
      inArray(approvalInspections.projectId, projects.map((project: any) => project.id)),
      sql`${approvalInspections.status} != 'cancelled'`,
    ))
    .orderBy(asc(approvalInspections.scheduledDate), desc(approvalInspections.createdAt));

  return inspections.map((inspection: any) => {
    const project = projectMap[inspection.projectId];
    return {
      id: `approval-inspection-${inspection.id}`,
      sourceType: "approval_inspection",
      sourceId: inspection.id,
      sourceKey: "",
      sourceLabel: project?.projectNumber ? `Approval ${project.projectNumber}` : "Approval inspection",
      title: inspection.title || String(inspection.inspectionType || "Inspection").replace(/_/g, " "),
      description: inspection.resultNotes || inspection.description || null,
      category: "inspection",
      status: inspection.status,
      priority: inspection.isBlocking ? "urgent" : "important",
      isBlocking: !!inspection.isBlocking,
      dueAt: inspection.scheduledDate || inspection.inspectedAt || null,
      scheduledTime: inspection.scheduledTime || null,
      triggerLabel: inspection.blockingGate ? `Gate ${inspection.blockingGate}` : null,
      inspectorName: inspection.inspectorName || null,
      defectCount: inspection.defectCount || 0,
      hasDefects: !!inspection.hasDefects,
      createdAt: inspection.createdAt,
      updatedAt: inspection.updatedAt,
    };
  });
}

async function getManualTradeInstructionItems(db: any, ctx: any, jobId: number, installerId: number) {
  const rows = await db.select({
    id: constructionJobInstructions.id,
    title: constructionJobInstructions.title,
    description: constructionJobInstructions.description,
    category: constructionJobInstructions.category,
    status: constructionJobInstructions.status,
    priority: constructionJobInstructions.priority,
    assignedInstallerId: constructionJobInstructions.assignedInstallerId,
    isBlocking: constructionJobInstructions.isBlocking,
    dueAt: constructionJobInstructions.dueAt,
    triggerLabel: constructionJobInstructions.triggerLabel,
    sortOrder: constructionJobInstructions.sortOrder,
    createdAt: constructionJobInstructions.createdAt,
    updatedAt: constructionJobInstructions.updatedAt,
  })
    .from(constructionJobInstructions)
    .where(and(
      ...tradeJobInstructionConditions(ctx, eq(constructionJobInstructions.jobId, jobId)),
      eq(constructionJobInstructions.visibleToTrade, true),
      or(
        isNull(constructionJobInstructions.assignedInstallerId),
        eq(constructionJobInstructions.assignedInstallerId, installerId),
      ),
    ))
    .orderBy(desc(constructionJobInstructions.isBlocking), asc(constructionJobInstructions.sortOrder), asc(constructionJobInstructions.createdAt));

  return rows.map((row: any) => ({
    id: `manual-${row.id}`,
    sourceType: "manual",
    sourceId: row.id,
    sourceKey: "",
    sourceLabel: row.assignedInstallerId ? "Trade instruction" : "Job instruction",
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    isBlocking: !!row.isBlocking,
    dueAt: row.dueAt,
    scheduledTime: null,
    triggerLabel: row.triggerLabel,
    inspectorName: null,
    defectCount: 0,
    hasDefects: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

const subcontractInspectionLabels: Record<string, string> = {
  footings: "Footings inspection",
  slab: "Slab inspection",
  plumbing: "Plumbing inspection",
  framing: "Framing inspection",
  roofing: "Roofing inspection",
  other: "Other inspection",
};

function isMeaningfulSubcontractInstruction(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return !["n/a", "na", "none", "not applicable", "-"].includes(text.toLowerCase());
}

function getSubcontractInspectionInstructionItems(subcontracts: any[]) {
  return subcontracts.flatMap((subcontract) => {
    const inspections = subcontract.inspections && typeof subcontract.inspections === "object"
      ? subcontract.inspections
      : {};
    return Object.entries(inspections)
      .filter(([, value]) => isMeaningfulSubcontractInstruction(value))
      .map(([key, value]) => ({
        id: `subcontract-inspection-${subcontract.id}-${key}`,
        sourceType: "subcontract_inspection",
        sourceId: subcontract.id,
        sourceKey: key,
        sourceLabel: "Subcontract reminder",
        title: subcontractInspectionLabels[key] || `${key.replace(/_/g, " ")} inspection`,
        description: String(value).trim(),
        category: "contract_reminder",
        status: "open",
        priority: "important",
        isBlocking: false,
        dueAt: null,
        scheduledTime: null,
        triggerLabel: subcontract.tradeType || "Contract inspection requirement",
        inspectorName: null,
        defectCount: 0,
        hasDefects: false,
        createdAt: subcontract.createdAt,
        updatedAt: subcontract.updatedAt,
      }));
  });
}

const tradeInstructionSourceTypeSchema = z.enum(["manual", "approval_inspection", "subcontract_inspection"]);
const tradeInstructionActionStatusSchema = z.enum(["acknowledged", "completed"]);

function instructionActionKey(sourceType: string, sourceId: number, sourceKey?: string | null) {
  return `${sourceType}:${sourceId}:${sourceKey || ""}`;
}

function normalizeInstructionSourceKey(value?: string | null) {
  return String(value || "").trim();
}

function safeUploadFilename(filename: string) {
  const cleaned = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "evidence-upload";
}

function visibleInstructionSourceMatches(item: any, sourceType: string, sourceId: number, sourceKey?: string | null) {
  return item.sourceType === sourceType &&
    Number(item.sourceId) === Number(sourceId) &&
    normalizeInstructionSourceKey(item.sourceKey) === normalizeInstructionSourceKey(sourceKey);
}

async function getTradeInstructionActions(db: any, ctx: any, jobId: number, installerId: number) {
  return db.select()
    .from(tradeJobInstructionActions)
    .where(and(
      ...tradeInstructionActionConditions(ctx,
        eq(tradeJobInstructionActions.jobId, jobId),
        eq(tradeJobInstructionActions.installerId, installerId),
      ),
    ));
}

function attachTradeInstructionActions(items: any[], actions: any[]) {
  const actionMap = new Map(actions.map((action: any) => [
    instructionActionKey(action.sourceType, action.sourceId, action.sourceKey),
    action,
  ]));

  return items.map((item) => {
    const action = actionMap.get(instructionActionKey(item.sourceType, item.sourceId, item.sourceKey));
    const evidenceFiles = Array.isArray(action?.evidenceFiles) ? action.evidenceFiles : [];
    return {
      ...item,
      actionId: action?.id || null,
      actionStatus: action?.actionStatus || null,
      actionNotes: action?.notes || null,
      acknowledgedAt: action?.acknowledgedAt || null,
      completedAt: action?.completedAt || null,
      evidenceFiles,
      evidenceCount: evidenceFiles.length,
    };
  });
}

async function buildTradeJobInstructionItems(
  db: any,
  ctx: any,
  job: typeof constructionJobs.$inferSelect,
  subcontracts: any[],
) {
  const installerId = ctx.tradeAccess.installerId;
  const [manualInstructionItems, approvalInspectionItems] = await Promise.all([
    getManualTradeInstructionItems(db, ctx, job.id, installerId),
    getApprovalInspectionInstructionItems(db, ctx, job),
  ]);
  const subcontractInstructionItems = getSubcontractInspectionInstructionItems(subcontracts);
  const sortedItems = [
    ...manualInstructionItems,
    ...approvalInspectionItems,
    ...subcontractInstructionItems,
  ].sort((a: any, b: any) => {
    if (a.isBlocking !== b.isBlocking) return a.isBlocking ? -1 : 1;
    const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  const actions = await getTradeInstructionActions(db, ctx, job.id, installerId);
  return attachTradeInstructionActions(sortedItems, actions);
}

async function requireVisibleTradeInstructionSource(
  db: any,
  ctx: any,
  input: { jobId: number; sourceType: string; sourceId: number; sourceKey?: string | null },
) {
  const job = await requireTradeJobAccess(db, ctx, input.jobId);
  const subcontracts = await db.select()
    .from(projectSubcontracts)
    .where(and(
      eq(projectSubcontracts.jobId, input.jobId),
      eq(projectSubcontracts.installerId, ctx.tradeAccess.installerId),
      isNull(projectSubcontracts.archivedAt),
      or(eq(projectSubcontracts.status, "sent"), eq(projectSubcontracts.status, "signed"))!,
    ));
  const items = await buildTradeJobInstructionItems(db, ctx, job, subcontracts);
  const item = items.find((candidate) => visibleInstructionSourceMatches(candidate, input.sourceType, input.sourceId, input.sourceKey));
  if (!item) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Instruction is not visible to this trade" });
  }
  return { job, item };
}

async function upsertTradeInstructionAction(
  db: any,
  ctx: any,
  input: {
    jobId: number;
    sourceType: "manual" | "approval_inspection" | "subcontract_inspection";
    sourceId: number;
    sourceKey?: string | null;
    actionStatus?: "acknowledged" | "completed";
    notes?: string | null;
    evidenceFiles?: any[];
  },
) {
  const tenantId = tradePortalTenantId(ctx);
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for instruction actions" });
  }

  const installerId = ctx.tradeAccess.installerId;
  const sourceKey = normalizeInstructionSourceKey(input.sourceKey);
  const [existing] = await db.select()
    .from(tradeJobInstructionActions)
    .where(and(
      eq(tradeJobInstructionActions.tenantId, tenantId),
      eq(tradeJobInstructionActions.jobId, input.jobId),
      eq(tradeJobInstructionActions.installerId, installerId),
      eq(tradeJobInstructionActions.sourceType, input.sourceType),
      eq(tradeJobInstructionActions.sourceId, input.sourceId),
      eq(tradeJobInstructionActions.sourceKey, sourceKey),
    ))
    .limit(1);

  const now = new Date();
  const existingEvidence = Array.isArray(existing?.evidenceFiles) ? existing.evidenceFiles : [];
  const nextEvidence = input.evidenceFiles || existingEvidence;
  const requestedStatus = input.actionStatus || existing?.actionStatus || "acknowledged";
  const nextStatus = existing?.actionStatus === "completed" ? "completed" : requestedStatus;
  const values = {
    actionStatus: nextStatus,
    notes: input.notes !== undefined ? (input.notes || null) : (existing?.notes || null),
    evidenceFiles: nextEvidence,
    acknowledgedAt: existing?.acknowledgedAt || now,
    completedAt: existing?.completedAt || (nextStatus === "completed" ? now : null),
  };

  if (existing) {
    await db.update(tradeJobInstructionActions)
      .set(values)
      .where(and(
        eq(tradeJobInstructionActions.id, existing.id),
        eq(tradeJobInstructionActions.installerId, installerId),
      ));
    return { id: existing.id };
  }

  const [result] = await db.insert(tradeJobInstructionActions).values({
    tenantId,
    jobId: input.jobId,
    installerId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceKey,
    ...values,
  });
  return { id: result.insertId };
}

async function requireWorkOrderAccess(db: any, ctx: any, workOrderId: number) {
  const [workOrder] = await db.select()
    .from(cmWorkOrders)
    .where(eq(cmWorkOrders.id, workOrderId))
    .limit(1);
  if (!workOrder) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
  }
  await requireTradeJobAccess(db, ctx, workOrder.jobId);
  return workOrder;
}

async function requireSubcontractAccess(db: any, ctx: any, subcontractId: number) {
  const [subcontract] = await db.select()
    .from(projectSubcontracts)
    .where(eq(projectSubcontracts.id, subcontractId))
    .limit(1);
  if (!subcontract) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Subcontract not found" });
  }
  if (subcontract.archivedAt) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Subcontract is archived" });
  }
  await requireTradeJobAccess(db, ctx, subcontract.jobId);
  if (
    subcontract.installerId !== ctx.tradeAccess.installerId &&
    subcontract.status !== "signed"
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Subcontract is not available to this trade" });
  }
  return subcontract;
}

function moneyNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyString(value: number): string {
  return value.toFixed(2);
}

const tradeFlashingOrderStatuses = [
  "draft",
  "submitted",
  "supplier_received",
  "in_production",
  "purchase_ordered",
  "ready",
  "completed",
  "cancelled",
  "archived",
] as const;

const tradeFlashingLineStatuses = [
  "draft",
  "ready",
  "needs_clarification",
  "approved",
  "in_production",
  "completed",
  "cancelled",
] as const;

const tradeFlashingColourSides = ["inside", "outside", "both", "unspecified"] as const;
const tradeFlashingSubjectPhotoType = "subject_area_photo";

const tradeFlashingPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const tradeFlashingGeometrySchema = z.object({
  points: z.array(tradeFlashingPointSchema).min(2),
  gridSize: z.number().positive().default(20),
  snapToGrid: z.boolean().default(true),
  foldLabels: z.record(z.string(), z.string()).optional(),
  foldDetails: z.record(z.string(), z.any()).optional(),
  notes: z.string().optional(),
});

const tradeFlashingLineInputSchema = z.object({
  id: z.number().optional(),
  orderId: z.number(),
  templateId: z.number().nullish(),
  profileName: z.string().trim().min(1).max(255),
  category: z.string().trim().max(128).default("custom"),
  materialType: z.string().trim().max(128).default("Colorbond"),
  gauge: z.string().trim().max(64).nullish(),
  colour: z.string().trim().max(128).nullish(),
  colourSide: z.enum(tradeFlashingColourSides).default("unspecified"),
  finish: z.string().trim().max(128).nullish(),
  quantity: z.number().int().min(1).max(999).default(1),
  lengthMm: z.number().min(1, "Length (mm) is required.").max(999999),
  unitPrice: z.number().min(0).max(999999).default(0),
  geometry: tradeFlashingGeometrySchema,
  foldDetails: z.record(z.string(), z.any()).optional().default({}),
  manufacturingNotes: z.string().nullish(),
  status: z.enum(tradeFlashingLineStatuses).default("draft"),
});

function roundFlashingNumber(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function tradeFlashingDistance(a: z.infer<typeof tradeFlashingPointSchema>, b: z.infer<typeof tradeFlashingPointSchema>) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function tradeFlashingProfileGirthMm(geometry: z.infer<typeof tradeFlashingGeometrySchema>) {
  return geometry.points.slice(1).reduce((total, point, index) => total + tradeFlashingDistance(geometry.points[index], point), 0);
}

function tradeFlashingLineMetrics(input: z.infer<typeof tradeFlashingLineInputSchema>) {
  const girthMm = roundFlashingNumber(tradeFlashingProfileGirthMm(input.geometry));
  const totalLinealMetres = roundFlashingNumber((input.lengthMm * input.quantity) / 1000);
  const bendCount = Math.max(0, input.geometry.points.length - 2);
  const lineTotal = roundFlashingNumber(totalLinealMetres * input.unitPrice);
  return { girthMm, totalLinealMetres, bendCount, lineTotal };
}

function normaliseFlashingAttachments(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value)
    ? value.filter((attachment): attachment is Record<string, any> => !!attachment && typeof attachment === "object")
    : [];
}

function uploadFlashingExtension(filename: string, mimeType: string) {
  const cleanMime = mimeType.toLowerCase();
  if (cleanMime === "image/png") return "png";
  if (cleanMime === "image/webp") return "webp";
  const fromName = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  return "jpg";
}

async function recalculateTradeFlashingOrderTotals(db: any, tenantId: number, orderId: number) {
  const lines = await db
    .select({
      id: flashingOrderLines.id,
      quantity: flashingOrderLines.quantity,
      girthMm: flashingOrderLines.girthMm,
      totalLinealMetres: flashingOrderLines.totalLinealMetres,
      lineTotal: flashingOrderLines.lineTotal,
    })
    .from(flashingOrderLines)
    .where(and(eq(flashingOrderLines.orderId, orderId), eq(flashingOrderLines.tenantId, tenantId)));

  const totals = lines.reduce((acc: { totalGirthMm: number; totalLinealMetres: number; totalExGst: number }, line: any) => {
    acc.totalGirthMm += Number(line.girthMm || 0) * Number(line.quantity || 1);
    acc.totalLinealMetres += Number(line.totalLinealMetres || 0);
    acc.totalExGst += Number(line.lineTotal || 0);
    return acc;
  }, { totalGirthMm: 0, totalLinealMetres: 0, totalExGst: 0 });

  await db
    .update(flashingOrders)
    .set({
      lineCount: lines.length,
      totalGirthMm: roundFlashingNumber(totals.totalGirthMm).toFixed(2),
      totalLinealMetres: roundFlashingNumber(totals.totalLinealMetres).toFixed(2),
      totalExGst: roundFlashingNumber(totals.totalExGst).toFixed(2),
    })
    .where(and(eq(flashingOrders.id, orderId), eq(flashingOrders.tenantId, tenantId)));
}

async function nextTradeFlashingOrderNumber(db: any, tenantId: number) {
  const [row] = await db
    .select({
      maxNumber: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${flashingOrders.orderNumber}, 4) AS UNSIGNED)), 0)`,
    })
    .from(flashingOrders)
    .where(eq(flashingOrders.tenantId, tenantId));
  const next = Number(row?.maxNumber || 0) + 1;
  return `FL-${String(next).padStart(4, "0")}`;
}

async function findTradePortalFlashingSupplier(db: any, ctx: any) {
  const access = requireTradeAccessVisible(ctx, ctx.tradeAccess);
  const tenantId = tradePortalTenantId(ctx);
  if (!tenantId) return null;

  const [installer] = await db.select()
    .from(constructionInstallers)
    .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId))))
    .limit(1);

  const email = String(access.email || installer?.email || "").trim().toLowerCase();
  const installerEmail = String(installer?.email || "").trim().toLowerCase();
  const installerName = String(installer?.name || "").trim().toLowerCase();
  const matchConditions: any[] = [];
  if (email) matchConditions.push(sql`LOWER(${suppliers.email}) = ${email}`);
  if (installerEmail && installerEmail !== email) matchConditions.push(sql`LOWER(${suppliers.email}) = ${installerEmail}`);
  if (installerName) matchConditions.push(sql`LOWER(${suppliers.name}) = ${installerName}`);
  if (matchConditions.length === 0) return null;

  const conditions: any[] = [
    eq(suppliers.isActive, true),
    eq(suppliers.tradePortalFlashingOrdersEnabled, true),
    or(...matchConditions)!,
  ];
  appendTenantScope(conditions, suppliers.tenantId, tenantId);

  const [supplier] = await db.select()
    .from(suppliers)
    .where(and(...conditions))
    .orderBy(asc(suppliers.name))
    .limit(1);

  return supplier || null;
}

async function requireTradePortalFlashingSupplier(db: any, ctx: any) {
  const supplier = await findTradePortalFlashingSupplier(db, ctx);
  if (!supplier) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Flashing orders are not enabled for this trade portal account.",
    });
  }
  return supplier;
}

function tradePortalFlashingOrderScope(ctx: any, supplier: typeof suppliers.$inferSelect, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, flashingOrders.tenantId, tradePortalTenantId(ctx));
  const supplierMatchers: any[] = [eq(flashingOrders.supplierId, supplier.id)];
  if (supplier.name) supplierMatchers.push(eq(flashingOrders.supplierName, supplier.name));
  conditions.push(or(...supplierMatchers)!);
  return conditions;
}

async function requireTradePortalFlashingOrder(db: any, ctx: any, supplier: typeof suppliers.$inferSelect, orderId: number) {
  const [order] = await db.select()
    .from(flashingOrders)
    .where(and(...tradePortalFlashingOrderScope(ctx, supplier, eq(flashingOrders.id, orderId))))
    .limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Flashing order not found." });
  return order;
}

function assertTradePortalFlashingEditable(order: typeof flashingOrders.$inferSelect) {
  if (!["draft", "supplier_received"].includes(order.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This flashing order is already under construction review and cannot be edited from the trade portal.",
    });
  }
}

// ─── Trade Portal Auth Middleware ────────────────────────────────────────────

const requireTradePortalAccess = middleware(async ({ ctx, next }) => {
  if (!ctx.tradePortalAccess) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Trade portal session expired or invalid" });
  }
  return next({
    ctx: {
      ...ctx,
      tradeAccess: ctx.tradePortalAccess,
    },
  });
});

const publicTradePortalProcedure = publicProcedure;
const protectedTradePortalProcedure = publicProcedure.use(requireTradePortalAccess);

// ─── Trade Portal Router ────────────────────────────────────────────────────

export const tradePortalRouter = router({

  // ─── Branding (public — no auth required) ──────────────────────────────────
  getBranding: publicTradePortalProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant?.id ?? null;
    const branding = await getTenantBrandingSettings(tenantId);
    const companyInfo = await getCompanyName(tenantId);
    return {
      companyName: companyInfo.displayName,
      logoUrl: branding?.customLogoUrl ?? null,
      appIconUrl: branding?.appIconUrl ?? null,
    };
  }),

  // ─── Auth ───────────────────────────────────────────────────────────────────

  requestMagicLink: publicTradePortalProcedure
    .input(z.object({ email: z.string().email(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRateLimit({
        key: `trade-portal-magic:${input.email.toLowerCase()}:${ctx.req.ip}`,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      const db = await requireDb();
      const conditions = tradePortalAccessConditions(
        ctx,
        eq(tradePortalAccess.email, input.email),
        eq(tradePortalAccess.isActive, true),
      );
      const [access] = await db
        .select()
        .from(tradePortalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) {
        // Don't reveal whether email exists
        return { success: true, message: "If an account exists, a login link has been sent." };
      }

      const sessionToken = generateToken();
      const magicLinkToken = generateToken(32);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

      await db.insert(tradePortalSessions).values({
        tradePortalAccessId: access.id,
        sessionToken,
        magicLinkToken,
        magicLinkExpiresAt: expiresAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      const magicLinkUrl = await buildTrustedAppUrlForTenant(
        ctx.req,
        access.tenantId,
        `/trade-portal/login?magic=${encodeURIComponent(magicLinkToken)}`,
        input.origin
      );

      try {
        // Get installer name
        const [installer] = await db.select().from(constructionInstallers)
          .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId)))).limit(1);

        const result = await sendNotificationEmail({
          tenantId: access.tenantId,
          to: input.email,
          subject: "Your Altaspan Trade Portal Login Link",
          htmlBody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">Altaspan Trade Portal</h2>
                  <p>Hi ${installer?.name || "there"},</p>
                  <p>Click the button below to access your trade portal:</p>
                  <a href="${magicLinkUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a1a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">
                    Access Trade Portal
                  </a>
                  <p style="color: #666; font-size: 14px;">This link expires in 30 minutes.</p>
                </div>
              `,
          module: "admin",
        });
        await logNotification(
          { settingKey: "trade_portal.magic_link", channel: "email", recipientType: "trade", recipientId: input.email, title: "Trade Portal Login Link" },
          result.success ? "sent" : "failed",
          result.error
        );
      } catch (e: any) {
        console.error("Failed to send trade portal magic link email:", e);
        await logNotification(
          { settingKey: "trade_portal.magic_link", channel: "email", recipientType: "trade", recipientId: input.email, title: "Trade Portal Login Link" },
          "failed",
          e?.message || "Unknown error"
        ).catch(() => {});
      }

      return { success: true, message: "If an account exists, a login link has been sent." };
    }),

  verifyMagicLink: publicTradePortalProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [session] = await db
        .select()
        .from(tradePortalSessions)
        .where(eq(tradePortalSessions.magicLinkToken, input.token))
        .limit(1);

      if (!session || !session.magicLinkExpiresAt || session.magicLinkExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired link" });
      }

      const [rawAccess] = await db.select().from(tradePortalAccess)
        .where(and(
          eq(tradePortalAccess.id, session.tradePortalAccessId),
          eq(tradePortalAccess.isActive, true),
        )).limit(1);
      const access = requireTradeAccessVisible(ctx, rawAccess);

      await db.update(tradePortalSessions)
        .set({ magicLinkToken: null, magicLinkExpiresAt: null })
        .where(eq(tradePortalSessions.id, session.id));

      await db.update(tradePortalAccess)
        .set({ lastAccessedAt: new Date() })
        .where(eq(tradePortalAccess.id, access.id));

      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId)))).limit(1);

      return {
        sessionToken: session.sessionToken,
        installerName: installer?.name || "Trade User",
      };
    }),

  verifyToken: publicTradePortalProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = tradePortalAccessConditions(
        ctx,
        eq(tradePortalAccess.accessToken, input.token),
        eq(tradePortalAccess.isActive, true),
      );
      const [access] = await db
        .select()
        .from(tradePortalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid access token" });
      }

      const sessionToken = generateToken();
      await db.insert(tradePortalSessions).values({
        tradePortalAccessId: access.id,
        sessionToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await db.update(tradePortalAccess)
        .set({ lastAccessedAt: new Date() })
        .where(eq(tradePortalAccess.id, access.id));

      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId)))).limit(1);

      return {
        sessionToken,
        installerName: installer?.name || "Trade User",
      };
    }),

  // ─── Me (session info) ──────────────────────────────────────────────────────

  me: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [installer] = await db.select().from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId)))).limit(1);

    return {
      installerId: ctx.tradeAccess.installerId,
      installerName: installer?.name || "Trade User",
      installerEmail: ctx.tradeAccess.email,
      phone: installer?.phone || null,
      tradeType: installer?.tradeType || null,
      speciality: installer?.speciality || null,
    };
  }),

  // ─── Flashing Orders (supplier-scoped) ─────────────────────────────────────

  getFlashingOrderAccess: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const supplier = await findTradePortalFlashingSupplier(db, ctx);
    return supplier
      ? { enabled: true, supplierId: supplier.id, supplierName: supplier.name }
      : { enabled: false, supplierId: null, supplierName: null };
  }),

  listFlashingOrders: protectedTradePortalProcedure
    .input(z.object({
      search: z.string().optional().default(""),
      status: z.enum(tradeFlashingOrderStatuses).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const parsed = input || { search: "", limit: 25, offset: 0 };
      const conditions = tradePortalFlashingOrderScope(ctx, supplier);
      const search = parsed.search?.trim();
      if (parsed.status) conditions.push(eq(flashingOrders.status, parsed.status));
      if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${flashingOrders.orderNumber})`, pattern),
          like(sql`LOWER(${flashingOrders.jobNumber})`, pattern),
          like(sql`LOWER(${flashingOrders.clientName})`, pattern),
          like(sql`LOWER(${flashingOrders.siteAddress})`, pattern),
        )!);
      }

      const whereClause = and(...conditions);
      const [totalRow] = await db.select({ total: count() }).from(flashingOrders).where(whereClause);
      const orders = await db
        .select()
        .from(flashingOrders)
        .where(whereClause)
        .orderBy(desc(flashingOrders.updatedAt))
        .limit(parsed.limit)
        .offset(parsed.offset);

      return { orders, total: totalRow?.total || 0, supplierName: supplier.name };
    }),

  searchFlashingJobs: protectedTradePortalProcedure
    .input(z.object({
      search: z.string().optional().default(""),
      limit: z.number().int().min(1).max(50).default(25),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const installerId = ctx.tradeAccess.installerId;
      const visibleJobIds = await getVisibleTradeJobIds(db, ctx, installerId);
      if (visibleJobIds.length === 0) return [];

      const parsed = input || { search: "", limit: 25 };
      const conditions = tradeJobConditions(ctx, inArray(constructionJobs.id, visibleJobIds));
      const search = parsed.search?.trim();
      if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${constructionJobs.clientName})`, pattern),
          like(sql`LOWER(${crmLeads.contactFirstName})`, pattern),
          like(sql`LOWER(${crmLeads.contactLastName})`, pattern),
          like(sql`LOWER(${crmLeads.company})`, pattern),
          like(sql`LOWER(${crmLeads.clientNumber})`, pattern),
          like(sql`LOWER(${constructionJobs.quoteNumber})`, pattern),
          like(sql`LOWER(${constructionJobs.siteAddress})`, pattern),
          like(sql`LOWER(${constructionJobs.status})`, pattern),
        )!);
      }

      const jobs = await db.select({
        id: constructionJobs.id,
        jobNumber: constructionJobs.quoteNumber,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        status: constructionJobs.status,
        scheduledStart: constructionJobs.scheduledStart,
        scheduledEnd: constructionJobs.scheduledEnd,
        updatedAt: constructionJobs.updatedAt,
        leadId: crmLeads.id,
        leadFirstName: crmLeads.contactFirstName,
        leadLastName: crmLeads.contactLastName,
        leadCompany: crmLeads.company,
        leadClientNumber: crmLeads.clientNumber,
      })
        .from(constructionJobs)
        .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
        .where(and(...conditions))
        .orderBy(desc(constructionJobs.updatedAt))
        .limit(parsed.limit);

      const jobIds = jobs.map((job: any) => job.id);
      if (jobIds.length === 0) return [];

      const linkedOrders = await db.select({
        id: flashingOrders.id,
        orderNumber: flashingOrders.orderNumber,
        jobId: flashingOrders.jobId,
        status: flashingOrders.status,
        updatedAt: flashingOrders.updatedAt,
      })
        .from(flashingOrders)
        .where(and(
          ...tradePortalFlashingOrderScope(ctx, supplier, inArray(flashingOrders.jobId, jobIds)),
          sql`${flashingOrders.status} NOT IN ('cancelled', 'archived')`,
        ))
        .orderBy(desc(flashingOrders.updatedAt));

      const latestOrderByJob = new Map<number, typeof linkedOrders[number]>();
      for (const order of linkedOrders) {
        if (order.jobId && !latestOrderByJob.has(order.jobId)) {
          latestOrderByJob.set(order.jobId, order);
        }
      }

      return jobs.map((job: any) => {
        const order = latestOrderByJob.get(job.id);
        return {
          ...withCanonicalClientName(job),
          flashingOrderId: order?.id ?? null,
          flashingOrderNumber: order?.orderNumber ?? null,
          flashingOrderStatus: order?.status ?? null,
          flashingOrderUpdatedAt: order?.updatedAt ?? null,
        };
      });
    }),

  createFlashingOrderForJob: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const tenantId = tradePortalTenantId(ctx);
      const job = await requireTradeJobAccess(db, ctx, input.jobId);

      const [existing] = await db.select({
        id: flashingOrders.id,
        orderNumber: flashingOrders.orderNumber,
      })
        .from(flashingOrders)
        .where(and(
          ...tradePortalFlashingOrderScope(ctx, supplier, eq(flashingOrders.jobId, input.jobId)),
          sql`${flashingOrders.status} NOT IN ('cancelled', 'archived')`,
        ))
        .orderBy(desc(flashingOrders.updatedAt))
        .limit(1);

      if (existing) {
        return { id: existing.id, orderNumber: existing.orderNumber, created: false };
      }

      const orderNumber = await nextTradeFlashingOrderNumber(db, tenantId);
      const requestedByName = supplier.name || ctx.tradeAccess.email || "Trade Portal";
      const canonicalClient = await getCanonicalClientForTradeJob(db, ctx, job);
      const [result] = await db.insert(flashingOrders).values({
        tenantId,
        orderNumber,
        jobId: job.id,
        jobNumber: job.quoteNumber || null,
        clientName: canonicalClient?.name || job.clientName || null,
        siteAddress: job.siteAddress || null,
        supplierId: supplier.id,
        supplierName: supplier.name,
        requestedByUserId: null,
        requestedByName,
        requestedByEmail: ctx.tradeAccess.email || null,
        deliveryMethod: "pickup",
        siteNotes: null,
        createdBy: null,
      });

      const orderId = Number(result.insertId);
      await db.insert(flashingOrderStatusHistory).values({
        tenantId,
        orderId,
        fromStatus: null,
        toStatus: "draft",
        changedByUserId: null,
        changedByName: `${requestedByName} (Trade Portal)`,
        notes: "Order created from an allocated trade portal job.",
      });

      return { id: orderId, orderNumber, created: true };
    }),

  getFlashingOrder: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.id);
      const tenantId = tradePortalTenantId(ctx);
      const [lines, statusHistory, templates] = await Promise.all([
        db.select().from(flashingOrderLines)
          .where(and(
            eq(flashingOrderLines.orderId, input.id),
            eq(flashingOrderLines.tenantId, tenantId),
          ))
          .orderBy(flashingOrderLines.lineNumber, flashingOrderLines.id),
        db.select().from(flashingOrderStatusHistory)
          .where(and(
            eq(flashingOrderStatusHistory.orderId, input.id),
            eq(flashingOrderStatusHistory.tenantId, tenantId),
          ))
          .orderBy(desc(flashingOrderStatusHistory.createdAt)),
        db.select().from(flashingProfileTemplates)
          .where(and(
            eq(flashingProfileTemplates.tenantId, tenantId),
            eq(flashingProfileTemplates.isActive, true),
          ))
          .orderBy(flashingProfileTemplates.category, flashingProfileTemplates.name)
          .limit(200),
      ]);
      return { order, lines, statusHistory, templates };
    }),

  updateFlashingOrder: protectedTradePortalProcedure
    .input(z.object({
      id: z.number(),
      requestedDeliveryAt: z.string().nullish(),
      deliveryMethod: z.string().trim().max(64).nullish(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      siteNotes: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.id);
      assertTradePortalFlashingEditable(order);

      await db.update(flashingOrders)
        .set({
          requestedDeliveryAt: input.requestedDeliveryAt ? new Date(input.requestedDeliveryAt) : null,
          deliveryMethod: input.deliveryMethod ?? "pickup",
          priority: input.priority,
          siteNotes: input.siteNotes ?? null,
        })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tradePortalTenantId(ctx))));
      return { success: true };
    }),

  uploadFlashingSubjectPhoto: protectedTradePortalProcedure
    .input(z.object({
      id: z.number(),
      base64: z.string().min(1),
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.id);
      assertTradePortalFlashingEditable(order);
      if (!input.mimeType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subject area photo must be an image." });
      }

      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.byteLength > 8 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subject area photo must be under 8MB." });
      }

      const tenantId = tradePortalTenantId(ctx);
      const ext = uploadFlashingExtension(input.filename, input.mimeType);
      const key = `tenants/${tenantId}/flashing-orders/${input.id}/trade-subject-area-${generateToken(12)}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const attachment = {
        type: tradeFlashingSubjectPhotoType,
        url,
        key,
        fileName: input.filename,
        mimeType: input.mimeType,
        uploadedAt: new Date().toISOString(),
        uploadedByName: supplier.name || ctx.tradeAccess.email || "Trade portal",
      };
      const attachments = [
        ...normaliseFlashingAttachments(order.attachments).filter((item) => item.type !== tradeFlashingSubjectPhotoType),
        attachment,
      ];

      await db.update(flashingOrders)
        .set({ attachments })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      return attachment;
    }),

  removeFlashingSubjectPhoto: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.id);
      assertTradePortalFlashingEditable(order);
      const attachments = normaliseFlashingAttachments(order.attachments).filter((item) => item.type !== tradeFlashingSubjectPhotoType);
      await db.update(flashingOrders)
        .set({ attachments })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tradePortalTenantId(ctx))));
      return { success: true };
    }),

  saveFlashingLine: protectedTradePortalProcedure
    .input(tradeFlashingLineInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.orderId);
      assertTradePortalFlashingEditable(order);
      const tenantId = tradePortalTenantId(ctx);
      const metrics = tradeFlashingLineMetrics(input);
      const values = {
        tenantId,
        orderId: input.orderId,
        templateId: input.templateId ?? null,
        profileName: input.profileName,
        category: input.category,
        materialType: input.materialType,
        gauge: input.gauge ?? null,
        colour: input.colour ?? null,
        colourSide: input.colourSide,
        finish: input.finish ?? null,
        quantity: input.quantity,
        lengthMm: input.lengthMm.toFixed(2),
        totalLinealMetres: metrics.totalLinealMetres.toFixed(2),
        girthMm: metrics.girthMm.toFixed(2),
        bendCount: metrics.bendCount,
        unitPrice: input.unitPrice.toFixed(2),
        lineTotal: metrics.lineTotal.toFixed(2),
        geometry: input.geometry,
        foldDetails: input.foldDetails,
        manufacturingNotes: input.manufacturingNotes ?? null,
        status: input.status,
      };

      let lineId = input.id;
      if (lineId) {
        const [line] = await db.select({ id: flashingOrderLines.id }).from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.id, lineId), eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)))
          .limit(1);
        if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Flashing line not found." });
        await db.update(flashingOrderLines)
          .set(values)
          .where(and(eq(flashingOrderLines.id, lineId), eq(flashingOrderLines.tenantId, tenantId)));
      } else {
        const [maxLine] = await db.select({ maxLine: sql<number>`COALESCE(MAX(${flashingOrderLines.lineNumber}), 0)` })
          .from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)));
        const [result] = await db.insert(flashingOrderLines).values({
          ...values,
          lineNumber: Number(maxLine?.maxLine || 0) + 1,
        });
        lineId = Number(result.insertId);
      }

      await recalculateTradeFlashingOrderTotals(db, tenantId, input.orderId);
      return { id: lineId, ...metrics };
    }),

  deleteFlashingLine: protectedTradePortalProcedure
    .input(z.object({ id: z.number(), orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.orderId);
      assertTradePortalFlashingEditable(order);
      const tenantId = tradePortalTenantId(ctx);
      await db.delete(flashingOrderLines)
        .where(and(eq(flashingOrderLines.id, input.id), eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)));
      await recalculateTradeFlashingOrderTotals(db, tenantId, input.orderId);
      return { success: true };
    }),

  submitFlashingOrderForReview: protectedTradePortalProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const supplier = await requireTradePortalFlashingSupplier(db, ctx);
      const order = await requireTradePortalFlashingOrder(db, ctx, supplier, input.id);
      assertTradePortalFlashingEditable(order);
      const tenantId = tradePortalTenantId(ctx);
      const [lineCountRow] = await db.select({ total: count() }).from(flashingOrderLines)
        .where(and(eq(flashingOrderLines.orderId, input.id), eq(flashingOrderLines.tenantId, tenantId)));
      if (!lineCountRow?.total) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one flashing line before submitting." });
      }

      await db.update(flashingOrders)
        .set({
          status: "supplier_received",
          submittedAt: order.submittedAt || new Date(),
          supplierId: supplier.id,
          supplierName: supplier.name,
        })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));

      await db.insert(flashingOrderStatusHistory).values({
        tenantId,
        orderId: input.id,
        fromStatus: order.status,
        toStatus: "supplier_received",
        notes: input.notes || "Submitted from Trade Portal for construction review.",
        changedByUserId: null,
        changedByName: `${supplier.name} (Trade Portal)`,
      });

      await notifyOwner({
        tenantId,
        title: "Flashing order ready for review",
        content: `${supplier.name} submitted ${order.orderNumber} for construction review${order.clientName ? ` (${order.clientName})` : ""}.`,
      });

      return { success: true };
    }),

  // ─── Dashboard (Job Details) ────────────────────────────────────────────────

  dashboard: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;

    // Get assigned jobs via schedule events
    const eventRows = await db
      .select({
        eventId: constructionScheduleEvents.id,
        eventTitle: constructionScheduleEvents.title,
        eventType: constructionScheduleEvents.eventType,
        startTime: constructionScheduleEvents.startTime,
        endTime: constructionScheduleEvents.endTime,
        eventStatus: constructionScheduleEvents.status,
        jobId: constructionJobs.id,
        quoteNumber: constructionJobs.quoteNumber,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        jobStatus: constructionJobs.status,
        leadId: crmLeads.id,
        leadFirstName: crmLeads.contactFirstName,
        leadLastName: crmLeads.contactLastName,
        leadCompany: crmLeads.company,
        leadClientNumber: crmLeads.clientNumber,
      })
      .from(constructionScheduleEvents)
      .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
      .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
      .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, installerId))))
      .orderBy(desc(constructionScheduleEvents.startTime))
      .limit(50);
    const events = eventRows.map((event: any) => withCanonicalClientName(event));

    const visibleJobIds = tenantIdFromContext(ctx)
      ? await getVisibleTradeJobIds(db, ctx, installerId)
      : [];

    // Count unread messages
    const messageConditions = [
      eq(tradeMessages.installerId, installerId),
      eq(tradeMessages.direction, "outbound"),
    ];
    if (tenantIdFromContext(ctx)) {
      if (visibleJobIds.length === 0) {
        messageConditions.push(sql`1 = 0`);
      } else {
        messageConditions.push(inArray(tradeMessages.jobId, visibleJobIds));
      }
    }
    const allMessages = await db.select({ id: tradeMessages.id, readAt: tradeMessages.readAt, direction: tradeMessages.direction })
      .from(tradeMessages)
      .where(and(...messageConditions));
    const unreadMessages = allMessages.filter(m => !m.readAt).length;

    // Count pending invoices
    const invoiceConditions = [eq(tradeInvoices.installerId, installerId)];
    if (tenantIdFromContext(ctx)) {
      if (visibleJobIds.length === 0) {
        invoiceConditions.push(sql`1 = 0`);
      } else {
        invoiceConditions.push(inArray(tradeInvoices.jobId, visibleJobIds));
      }
    }
    const invoices = await db.select({ id: tradeInvoices.id, status: tradeInvoices.status })
      .from(tradeInvoices)
      .where(and(...invoiceConditions));
    const pendingInvoices = invoices.filter(i => i.status === "submitted" || i.status === "under_review").length;

    // Upcoming events (next 14 days)
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcoming = events.filter(e => e.startTime >= now && e.startTime <= twoWeeks);

    // Unique active jobs
    const uniqueJobs = new Map<number, typeof events[0]>();
    events.forEach(e => {
      if (e.jobId && !uniqueJobs.has(e.jobId)) uniqueJobs.set(e.jobId, e);
    });

    const activeJobsList = Array.from(uniqueJobs.values()).filter(j => j.jobStatus !== "completed" && j.jobStatus !== "cancelled");

    // Get subcontract info for active jobs
    const activeJobIds = activeJobsList.map(j => j.jobId).filter(Boolean) as number[];
    let subcontractMap: Record<number, { count: number; signedCount: number; totalValue: number }> = {};
    if (activeJobIds.length > 0) {
      const subcontracts = await db.select({
        jobId: projectSubcontracts.jobId,
        status: projectSubcontracts.status,
        subcontractSum: projectSubcontracts.subcontractSum,
      }).from(projectSubcontracts)
        .where(and(
          inArray(projectSubcontracts.jobId, activeJobIds),
          eq(projectSubcontracts.installerId, installerId),
          isNull(projectSubcontracts.archivedAt),
          or(
            eq(projectSubcontracts.status, "draft"),
            eq(projectSubcontracts.status, "sent"),
            eq(projectSubcontracts.status, "signed"),
          )!,
        ));
      for (const sc of subcontracts) {
        if (!subcontractMap[sc.jobId]) subcontractMap[sc.jobId] = { count: 0, signedCount: 0, totalValue: 0 };
        subcontractMap[sc.jobId].count++;
        if (sc.status === "signed") subcontractMap[sc.jobId].signedCount++;
        subcontractMap[sc.jobId].totalValue += parseFloat(sc.subcontractSum || "0");
      }
    }

    return {
      activeJobs: activeJobsList.map(j => ({
        ...j,
        subcontracts: subcontractMap[j.jobId!] || null,
      })),
      upcomingEvents: upcoming.slice(0, 10),
      unreadMessages,
      pendingInvoices,
      totalJobs: uniqueJobs.size,
    };
  }),

  // ─── Schedule ───────────────────────────────────────────────────────────────

  getSchedule: protectedTradePortalProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const conditions = tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, installerId));

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
        if (input?.startDate) {
          const rangeStart = new Date(input.startDate);
          conditions.push(or(
            gte(constructionScheduleEvents.startTime, rangeStart),
            gte(constructionScheduleEvents.endTime, rangeStart),
          )!);
        }
        if (input?.endDate) conditions.push(lte(constructionScheduleEvents.startTime, new Date(input.endDate)));
      }

      const rows = await db
        .select({
          id: constructionScheduleEvents.id,
          title: constructionScheduleEvents.title,
          description: constructionScheduleEvents.description,
          startTime: constructionScheduleEvents.startTime,
          endTime: constructionScheduleEvents.endTime,
          allDay: constructionScheduleEvents.allDay,
          eventType: constructionScheduleEvents.eventType,
          status: constructionScheduleEvents.status,
          jobId: constructionJobs.id,
          quoteNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          leadId: crmLeads.id,
          leadFirstName: crmLeads.contactFirstName,
          leadLastName: crmLeads.contactLastName,
          leadCompany: crmLeads.company,
          leadClientNumber: crmLeads.clientNumber,
        })
        .from(constructionScheduleEvents)
        .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
        .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
        .where(and(...conditions))
        .orderBy(asc(constructionScheduleEvents.startTime));
      return rows.map((row: any) => withCanonicalClientName(row));
    }),

  // ─── Availabilities ─────────────────────────────────────────────────────────

  getAvailabilities: protectedTradePortalProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2050),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

      return db.select()
        .from(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.installerId, ctx.tradeAccess.installerId),
          gte(tradeAvailabilities.date, startDate),
          lte(tradeAvailabilities.date, endDate),
        ))
        .orderBy(asc(tradeAvailabilities.date));
    }),

  getAvailabilityCalendar: protectedTradePortalProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2050),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const startKey = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const daysInMonth = new Date(input.year, input.month, 0).getUTCDate();
      const endKey = `${input.year}-${String(input.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const start = new Date(`${startKey}T00:00:00.000Z`);
      const end = new Date(`${endKey}T23:59:59.999Z`);

      const holidays = await db.select()
        .from(constructionHolidayCalendarDays)
        .where(and(...tradeHolidayConditions(
          ctx,
          eq(constructionHolidayCalendarDays.active, true),
          gte(constructionHolidayCalendarDays.dateKey, startKey),
          lte(constructionHolidayCalendarDays.dateKey, endKey),
        )))
        .orderBy(asc(constructionHolidayCalendarDays.dateKey), asc(constructionHolidayCalendarDays.name));

      const holidayMap = new Map<string, typeof holidays>();
      for (const holiday of holidays) {
        const list = holidayMap.get(holiday.dateKey) || [];
        list.push(holiday);
        holidayMap.set(holiday.dateKey, list);
      }

      const overrides = await db.select()
        .from(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.installerId, ctx.tradeAccess.installerId),
          gte(tradeAvailabilities.date, start),
          lte(tradeAvailabilities.date, end),
        ));
      const overrideMap = new Map<string, typeof tradeAvailabilities.$inferSelect>();
      for (const override of overrides) {
        overrideMap.set(toDateKey(override.date), override);
      }

      return Array.from({ length: daysInMonth }, (_, index) => {
        const dateKey = `${input.year}-${String(input.month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
        const holidayRows = holidayMap.get(dateKey) || [];
        const override = overrideMap.get(dateKey);
        const defaultUnavailable = isWeekendDateKey(dateKey) || holidayRows.length > 0;
        const unavailable = override?.status === "available" ? false : override?.status === "unavailable" ? true : defaultUnavailable;
        return {
          dateKey,
          isWeekend: isWeekendDateKey(dateKey),
          holidays: holidayRows.map((holiday) => ({
            id: holiday.id,
            name: holiday.name,
            jurisdiction: holiday.jurisdiction,
          })),
          defaultUnavailable,
          unavailable,
          override: override
            ? {
                ...override,
                dateKey: toDateKey(override.date),
              }
            : null,
        };
      });
    }),

  setAvailability: protectedTradePortalProcedure
    .input(z.object({
      date: z.string(),
      status: z.enum(["available", "unavailable", "partial"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const key = /^\d{4}-\d{2}-\d{2}$/.test(input.date)
        ? input.date
        : localDateKeyFromDate(input.date);
      const dateObj = dateKeyToStorageDate(key);
      const dayStart = new Date(`${key}T00:00:00.000Z`);
      const dayEnd = new Date(`${key}T23:59:59.999Z`);

      // Check if entry exists for this date
      const [existing] = await db.select()
        .from(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.installerId, installerId),
          gte(tradeAvailabilities.date, dayStart),
          lte(tradeAvailabilities.date, dayEnd),
        ))
        .limit(1);

      if (existing) {
        await db.update(tradeAvailabilities)
          .set({ status: input.status, notes: input.notes || null })
          .where(eq(tradeAvailabilities.id, existing.id));
        return { id: existing.id };
      } else {
        const [result] = await db.insert(tradeAvailabilities).values({
          installerId,
          date: dateObj,
          status: input.status,
          notes: input.notes || null,
        });
        return { id: result.insertId };
      }
    }),

  removeAvailability: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.id, input.id),
          eq(tradeAvailabilities.installerId, ctx.tradeAccess.installerId),
        ));
      return { success: true };
    }),

  // ─── Contact Details ────────────────────────────────────────────────────────

  getContactDetails: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [installer] = await db.select().from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId)))).limit(1);
    return installer || null;
  }),

  updateContactDetails: protectedTradePortalProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      abn: z.string().optional(),
      address: z.string().optional(),
      bankBsb: z.string().optional(),
      bankAccount: z.string().optional(),
      bankName: z.string().optional(),
      emergencyContact: z.string().optional(),
      emergencyPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const updateFields: Record<string, any> = {};
      if (input.name) updateFields.name = input.name;
      if (input.phone !== undefined) updateFields.phone = input.phone;
      if (input.email !== undefined) updateFields.email = input.email;
      if (input.abn !== undefined) updateFields.abn = input.abn;
      if (input.address !== undefined) updateFields.address = input.address;
      if (input.bankBsb !== undefined) updateFields.bankBsb = input.bankBsb;
      if (input.bankAccount !== undefined) updateFields.bankAccount = input.bankAccount;
      if (input.bankName !== undefined) updateFields.bankName = input.bankName;
      if (input.emergencyContact !== undefined) updateFields.emergencyContact = input.emergencyContact;
      if (input.emergencyPhone !== undefined) updateFields.emergencyPhone = input.emergencyPhone;
      await db.update(constructionInstallers)
        .set(updateFields)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId))));

      // Also update trade portal access email if changed
      if (input.email) {
        await db.update(tradePortalAccess)
          .set({ email: input.email })
          .where(eq(tradePortalAccess.id, ctx.tradeAccess.id));
      }

      return { success: true };
    }),

  // ─── Remittance Advice ──────────────────────────────────────────────────────

  getRemittances: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select({ remittance: tradeRemittances })
      .from(tradeRemittances)
      .innerJoin(constructionInstallers, eq(tradeRemittances.installerId, constructionInstallers.id))
      .where(and(
        eq(tradeRemittances.installerId, ctx.tradeAccess.installerId),
        ...tradeInstallerConditions(ctx),
      ))
      .orderBy(desc(tradeRemittances.date));
    const persistedRemittances = rows.map((row) => row.remittance);
    const persistedXeroDedupeKeys = new Set<string>();
    persistedRemittances.forEach((remittance) => addTradeRemittanceDedupeKeys(persistedXeroDedupeKeys, remittance));

    const [installer] = await db.select({
      id: constructionInstallers.id,
      xeroContactId: constructionInstallers.xeroContactId,
    })
      .from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId))))
      .limit(1);

    let liveXeroRemittances: any[] = [];
    if (installer?.xeroContactId) {
      try {
        const xeroResult = await getXeroPaymentRemittancesForTrade({
          appTenantId: tradePortalTenantId(ctx),
          installer,
          timeoutMs: 45000,
        });
        if (xeroResult.error) {
          console.warn("[TradePortal] Xero remittances unavailable:", xeroResult.error);
        }
        liveXeroRemittances = xeroResult.remittances
          .filter((remittance) => !hasTradeRemittanceDedupeKey(persistedXeroDedupeKeys, remittance));
      } catch (err: any) {
        console.warn("[TradePortal] Failed to fetch live Xero remittances:", err?.message || err);
      }
    }

    const remittances = dedupeTradeRemittances([...persistedRemittances, ...liveXeroRemittances])
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return Promise.all(remittances.map(async (remittance: any) => ({
      ...remittance,
      fileUrl: await resolveStorageUrlForPortal(remittance.fileUrl),
    })));
  }),

  // ─── Invoice Submission ─────────────────────────────────────────────────────

  getInvoices: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const conditions = [eq(tradeInvoices.installerId, ctx.tradeAccess.installerId)];
    if (tenantIdFromContext(ctx)) {
      const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
      conditions.push(jobIds.length
        ? or(inArray(tradeInvoices.jobId, jobIds), isNull(tradeInvoices.jobId))!
        : isNull(tradeInvoices.jobId));
    }
    const invoices = await db.select()
      .from(tradeInvoices)
      .where(and(...conditions))
      .orderBy(desc(tradeInvoices.submittedAt));
    return Promise.all(invoices.map(async (invoice) => ({
      ...invoice,
      fileUrl: await resolveStorageUrlForPortal(invoice.fileUrl),
    })));
  }),

  submitInvoice: protectedTradePortalProcedure
    .input(z.object({
      invoiceNumber: z.string().min(1),
      amount: z.string(),
      description: z.string().optional(),
      jobId: z.number().optional(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      if (!input.jobId && !input.description?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Description is required for non-client invoice submissions" });
      }
      await requireOptionalTradeJobAccess(db, ctx, input.jobId);

      // Upload file to S3
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-invoices/${installerId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const [result] = await db.insert(tradeInvoices).values({
        installerId,
        jobId: input.jobId || null,
        invoiceNumber: input.invoiceNumber,
        amount: input.amount,
        description: input.description || null,
        fileUrl,
        fileKey,
        status: "submitted",
      });

      // Push notification to staff
      const [installerInfo] = await db.select({ name: constructionInstallers.name })
        .from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
        .limit(1);
      triggerPushTradeInvoiceSubmitted(
        installerInfo?.name || "Trade",
        input.invoiceNumber,
        input.amount
      );

      return { id: result.insertId, fileUrl };
    }),

  // ─── Invoice Photos (Proof of Work) ─────────────────────────────────────────

  getInvoicePhotos: protectedTradePortalProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const photos = await db.select()
        .from(tradeInvoicePhotos)
        .where(and(
          eq(tradeInvoicePhotos.invoiceId, input.invoiceId),
          eq(tradeInvoicePhotos.installerId, ctx.tradeAccess.installerId),
        ))
        .orderBy(desc(tradeInvoicePhotos.uploadedAt));
      return Promise.all(photos.map(async (photo) => ({
        ...photo,
        fileUrl: await resolveStorageUrlForPortal(photo.fileUrl),
      })));
    }),

  uploadInvoicePhoto: protectedTradePortalProcedure
    .input(z.object({
      invoiceId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
      caption: z.string().optional(),
      stage: z.enum(["before", "during", "after"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      // Verify the invoice belongs to this installer
      const [invoice] = await db.select({ id: tradeInvoices.id, jobId: tradeInvoices.jobId })
        .from(tradeInvoices)
        .where(and(
          eq(tradeInvoices.id, input.invoiceId),
          eq(tradeInvoices.installerId, installerId),
        ))
        .limit(1);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      await requireOptionalTradeJobAccess(db, ctx, invoice.jobId);

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-invoice-photos/${installerId}/${input.invoiceId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const [result] = await db.insert(tradeInvoicePhotos).values({
        invoiceId: input.invoiceId,
        installerId,
        fileUrl,
        fileKey,
        fileName: input.fileName,
        caption: input.caption || null,
        stage: input.stage || null,
      });

      return { id: result.insertId, fileUrl };
    }),

  deleteInvoicePhoto: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(tradeInvoicePhotos)
        .where(and(
          eq(tradeInvoicePhotos.id, input.id),
          eq(tradeInvoicePhotos.installerId, ctx.tradeAccess.installerId),
        ));
      return { success: true };
    }),

  // ─── News ───────────────────────────────────────────────────────────────────

  getNews: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select()
      .from(portalNews)
      .where(and(...tradePortalCmsConditions(
        ctx,
        eq(portalNews.isPublished, true),
        or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
      )))
      .orderBy(desc(portalNews.publishedAt))
      .limit(20);
  }),

  getNewsArticle: protectedTradePortalProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [article] = await db.select()
        .from(portalNews)
        .where(and(...tradePortalCmsConditions(
          ctx,
          eq(portalNews.slug, input.slug),
          eq(portalNews.isPublished, true),
          or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
        )))
        .limit(1);
      return article || null;
    }),

  // ─── Photos ─────────────────────────────────────────────────────────────────

  getPhotos: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(tradePhotos.installerId, ctx.tradeAccess.installerId)];
      if (input?.jobId) {
        await requireTradeJobAccess(db, ctx, input.jobId);
        conditions.push(eq(tradePhotos.jobId, input.jobId));
      } else if (tenantIdFromContext(ctx)) {
        const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
        if (jobIds.length === 0) return [];
        conditions.push(inArray(tradePhotos.jobId, jobIds));
      }
      const photos = await db.select()
        .from(tradePhotos)
        .where(and(...conditions))
        .orderBy(desc(tradePhotos.uploadedAt));
      return Promise.all(photos.map(async (photo) => ({
        ...photo,
        fileUrl: await resolveStorageUrlForPortal(photo.fileUrl),
      })));
    }),

  uploadPhoto: protectedTradePortalProcedure
    .input(z.object({
      jobId: z.number().optional(),
      caption: z.string().optional(),
      category: z.enum(["progress", "issue", "completion", "before", "after", "other"]).default("progress"),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      if (tenantIdFromContext(ctx) && !input.jobId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is required for tenant-scoped photo uploads" });
      }
      await requireOptionalTradeJobAccess(db, ctx, input.jobId);

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-photos/${installerId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const [result] = await db.insert(tradePhotos).values({
        installerId,
        jobId: input.jobId || null,
        fileUrl,
        fileKey,
        caption: input.caption || null,
        category: input.category,
      });

      return { id: result.insertId, fileUrl };
    }),

  deletePhoto: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(tradePhotos)
        .where(and(
          eq(tradePhotos.id, input.id),
          eq(tradePhotos.installerId, ctx.tradeAccess.installerId),
        ));
      return { success: true };
    }),

  // ─── Messages ───────────────────────────────────────────────────────────────

  getMessages: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(tradeMessages.installerId, ctx.tradeAccess.installerId)];
      if (input?.jobId) {
        await requireTradeJobAccess(db, ctx, input.jobId);
        conditions.push(eq(tradeMessages.jobId, input.jobId));
      } else if (tenantIdFromContext(ctx)) {
        const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
        if (jobIds.length === 0) return [];
        conditions.push(inArray(tradeMessages.jobId, jobIds));
      }
      const messages = await db.select()
        .from(tradeMessages)
        .where(and(...conditions))
        .orderBy(asc(tradeMessages.createdAt));

      // Mark outbound (office → trade) messages as read
      const unreadOutbound = messages.filter(m => m.direction === "outbound" && !m.readAt);
      if (unreadOutbound.length > 0) {
        for (const msg of unreadOutbound) {
          await db.update(tradeMessages)
            .set({ readAt: new Date() })
            .where(eq(tradeMessages.id, msg.id));
        }
      }

      return Promise.all(messages.map(async (message) => ({
        ...message,
        attachmentUrl: await resolveStorageUrlForPortal(message.attachmentUrl),
      })));
    }),

  sendMessage: protectedTradePortalProcedure
    .input(z.object({
      content: z.string().min(1),
      jobId: z.number().optional(),
      attachmentBase64: z.string().optional(),
      attachmentName: z.string().optional(),
      attachmentMimeType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      if (tenantIdFromContext(ctx) && !input.jobId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is required for tenant-scoped trade messages" });
      }
      await requireOptionalTradeJobAccess(db, ctx, input.jobId);

      let attachmentUrl: string | null = null;
      let attachmentKey: string | null = null;

      if (input.attachmentBase64 && input.attachmentName) {
        const fileBuffer = Buffer.from(input.attachmentBase64, "base64");
        const suffix = crypto.randomBytes(4).toString("hex");
        const key = `trade-messages/${installerId}/${input.attachmentName}-${suffix}`;
        const { url } = await storagePut(key, fileBuffer, input.attachmentMimeType || "application/octet-stream");
        attachmentUrl = url;
        attachmentKey = key;
      }

      // Get installer name
      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId)))).limit(1);

      const [result] = await db.insert(tradeMessages).values({
        installerId,
        jobId: input.jobId || null,
        content: input.content,
        direction: "inbound",
        senderName: installer?.name || "Trade User",
        attachmentUrl,
        attachmentKey,
      });

      return { id: result.insertId };
    }),

  getActiveJobs: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const eventRows = await db.select({
      jobId: constructionJobs.id,
      quoteNumber: constructionJobs.quoteNumber,
      clientName: constructionJobs.clientName,
      siteAddress: constructionJobs.siteAddress,
      status: constructionJobs.status,
      leadId: crmLeads.id,
      leadFirstName: crmLeads.contactFirstName,
      leadLastName: crmLeads.contactLastName,
      leadCompany: crmLeads.company,
      leadClientNumber: crmLeads.clientNumber,
    })
      .from(constructionScheduleEvents)
      .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
      .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
      .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, ctx.tradeAccess.installerId))));
    const events = eventRows.map((event: any) => withCanonicalClientName(event));
    const uniqueJobs = new Map<number, typeof events[0]>();
    events.forEach(e => { if (e.jobId && !uniqueJobs.has(e.jobId)) uniqueJobs.set(e.jobId, e); });
    return Array.from(uniqueJobs.values()).filter(j => j.status !== "completed" && j.status !== "cancelled");
  }),

  markMessagesRead: protectedTradePortalProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const conditions = [
      eq(tradeMessages.installerId, ctx.tradeAccess.installerId),
      eq(tradeMessages.direction, "outbound"),
    ];
    if (tenantIdFromContext(ctx)) {
      const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
      if (jobIds.length === 0) return { success: true };
      conditions.push(inArray(tradeMessages.jobId, jobIds));
    }
    const unread = await db.select({ id: tradeMessages.id })
      .from(tradeMessages)
      .where(and(...conditions));
    for (const msg of unread) {
      await db.update(tradeMessages).set({ readAt: new Date() }).where(eq(tradeMessages.id, msg.id));
    }
    return { success: true };
  }),

  getUnreadCount: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const conditions = [
      eq(tradeMessages.installerId, ctx.tradeAccess.installerId),
      eq(tradeMessages.direction, "outbound"),
    ];
    if (tenantIdFromContext(ctx)) {
      const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
      if (jobIds.length === 0) return { count: 0, news: 0 };
      conditions.push(inArray(tradeMessages.jobId, jobIds));
    }
    const messages = await db.select({ id: tradeMessages.id, readAt: tradeMessages.readAt })
      .from(tradeMessages)
      .where(and(...conditions));
    const unreadMessages = messages.filter(m => !m.readAt).length;

    // Count news articles newer than last viewed
    const newsArticles = await db.select({ id: portalNews.id })
      .from(portalNews)
      .where(
        ctx.tradeAccess.lastViewedNewsAt
          ? and(...tradePortalCmsConditions(
              ctx,
              eq(portalNews.isPublished, true),
              or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both")),
              gt(portalNews.publishedAt, ctx.tradeAccess.lastViewedNewsAt)
            ))
          : and(...tradePortalCmsConditions(
              ctx,
              eq(portalNews.isPublished, true),
              or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
            ))
      );
    return { count: unreadMessages, news: newsArticles.length };
  }),

  // ─── Work Orders & PO Milestones (Trade Portal) ───────────────────────
  getWorkOrders: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;
    // Get installer info to match by name/email
    const [installer] = await db.select()
      .from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
      .limit(1);
    if (!installer) return [];
    // Find work orders assigned to this trade (by email or name)
    const allOrders = await db.select()
      .from(cmWorkOrders)
      .where(eq(cmWorkOrders.assignedEmail, installer.email || ""))
      .orderBy(desc(cmWorkOrders.createdAt));
    const visibleOrders = [];
    for (const order of allOrders) {
      try {
        await requireTradeJobAccess(db, ctx, order.jobId);
        visibleOrders.push(order);
      } catch {
        // Hide work orders for jobs outside this tenant or assignment scope.
      }
    }
    return visibleOrders;
  }),

  getWorkOrderMilestones: protectedTradePortalProcedure
    .input(z.object({ workOrderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireWorkOrderAccess(db, ctx, input.workOrderId);
      return db.select()
        .from(poMilestones)
        .where(eq(poMilestones.workOrderId, input.workOrderId))
        .orderBy(asc(poMilestones.sortOrder));
    }),

  getInvoiceClaimOptions: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;
    const visibleJobIds = await getVisibleTradeJobIds(db, ctx, installerId);
    if (visibleJobIds.length === 0) {
      return { jobs: [], workOrders: [], poMilestones: [], subcontractMilestones: [] };
    }

    const jobRows = await db.select({
      jobId: constructionJobs.id,
      quoteNumber: constructionJobs.quoteNumber,
      clientName: constructionJobs.clientName,
      siteAddress: constructionJobs.siteAddress,
      status: constructionJobs.status,
      leadId: crmLeads.id,
      leadFirstName: crmLeads.contactFirstName,
      leadLastName: crmLeads.contactLastName,
      leadCompany: crmLeads.company,
      leadClientNumber: crmLeads.clientNumber,
    })
      .from(constructionJobs)
      .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
      .where(and(...tradeJobConditions(ctx, inArray(constructionJobs.id, visibleJobIds))))
      .orderBy(desc(constructionJobs.updatedAt));
    const jobs = jobRows.map((job: any) => withCanonicalClientName(job));

    const [installer] = await db.select()
      .from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
      .limit(1);

    const allWorkOrders = installer?.email
      ? await db.select()
        .from(cmWorkOrders)
        .where(and(
          eq(cmWorkOrders.assignedEmail, installer.email),
          inArray(cmWorkOrders.jobId, visibleJobIds),
        ))
        .orderBy(desc(cmWorkOrders.createdAt))
      : [];

    const workOrderIds = allWorkOrders.map((wo: any) => wo.id);
    const milestoneRows = workOrderIds.length
      ? await db.select()
        .from(poMilestones)
        .where(inArray(poMilestones.workOrderId, workOrderIds))
        .orderBy(asc(poMilestones.sortOrder))
      : [];

    const subcontracts = await db.select()
      .from(projectSubcontracts)
      .where(and(
        inArray(projectSubcontracts.jobId, visibleJobIds),
        eq(projectSubcontracts.installerId, installerId),
        eq(projectSubcontracts.status, "signed"),
        isNull(projectSubcontracts.archivedAt),
      ));

    const subcontractIds = subcontracts.map((subcontract: any) => subcontract.id);
    const existingClaims = subcontractIds.length
      ? await db.select({
        subcontractId: tradeInvoiceLines.subcontractId,
        subcontractMilestoneIndex: tradeInvoiceLines.subcontractMilestoneIndex,
        amount: tradeInvoiceLines.amount,
        approvalStatus: tradeInvoiceLines.approvalStatus,
      })
        .from(tradeInvoiceLines)
        .where(inArray(tradeInvoiceLines.subcontractId, subcontractIds))
      : [];

    const subcontractMilestones = subcontracts.flatMap((subcontract: any) => {
      const schedule = ((subcontract.paymentSchedule as PaymentMilestone[]) || []);
      return schedule.map((milestone, index) => {
        const claims = existingClaims.filter((claim: any) =>
          claim.subcontractId === subcontract.id && claim.subcontractMilestoneIndex === index
        );
        const amount = milestone.usePercent
          ? ((milestone.percentOfTotal || 0) / 100) * moneyNumber(subcontract.subcontractSum)
          : moneyNumber(milestone.amountDollars);
        return {
          subcontractId: subcontract.id,
          subcontractMilestoneIndex: index,
          jobId: subcontract.jobId,
          subcontractorName: subcontract.subcontractorName,
          label: milestone.label,
          amountDollars: amount,
          percentOfTotal: milestone.percentOfTotal,
          usePercent: milestone.usePercent,
          claimed: claims.length > 0,
          claimStatus: claims.length > 0 ? claims[0].approvalStatus : null,
          claimedAmount: claims.reduce((sum: number, claim: any) => sum + moneyNumber(claim.amount), 0),
        };
      });
    });

    return {
      jobs: jobs.filter((job: any) => job.status !== "completed" && job.status !== "cancelled"),
      workOrders: allWorkOrders,
      poMilestones: milestoneRows,
      subcontractMilestones,
    };
  }),

  // Submit invoice with PO milestone linking
  submitInvoiceWithMilestone: protectedTradePortalProcedure
    .input(z.object({
      invoiceNumber: z.string().min(1),
      amount: z.string().optional(),
      gstAmount: z.string().optional(),
      description: z.string().optional(),
      jobId: z.number().optional(),
      workOrderId: z.number().optional(),
      milestoneId: z.number().optional(),
      subcontractId: z.number().optional(),
      subcontractMilestoneIndex: z.number().optional(),
      items: z.array(z.object({
        description: z.string().optional(),
        amount: z.string(),
        gstAmount: z.string().optional(),
        jobId: z.number().optional(),
        workOrderId: z.number().optional(),
        milestoneId: z.number().optional(),
        subcontractId: z.number().optional(),
        subcontractMilestoneIndex: z.number().optional(),
      })).optional(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const rawItems = input.items?.length
        ? input.items
        : [{
          description: input.description,
          amount: input.amount || "0",
          gstAmount: input.gstAmount,
          jobId: input.jobId!,
          workOrderId: input.workOrderId,
          milestoneId: input.milestoneId,
          subcontractId: input.subcontractId,
          subcontractMilestoneIndex: input.subcontractMilestoneIndex,
        }];

      if (!rawItems.length || rawItems.some((item) => moneyNumber(item.amount) <= 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "At least one claim item with an amount is required" });
      }

      const validatedItems: Array<{
        description: string;
        amount: string;
        gstAmount: string;
        jobId: number | null;
        workOrderId: number | null;
        milestoneId: number | null;
        subcontractId: number | null;
        subcontractMilestoneIndex: number | null;
      }> = [];

      for (let index = 0; index < rawItems.length; index++) {
        const item = rawItems[index];
        const jobId = item.jobId ?? null;
        const description = item.description?.trim() || input.description?.trim() || "";
        let workOrderId = item.workOrderId ?? null;
        let milestoneId = item.milestoneId ?? null;
        let subcontractId = item.subcontractId ?? null;
        const subcontractMilestoneIndex = item.subcontractMilestoneIndex ?? null;

        if (!jobId) {
          if (workOrderId || milestoneId || subcontractId != null || subcontractMilestoneIndex != null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Line ${index + 1}: non-client charges cannot be linked to job milestones` });
          }
          if (!description) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Line ${index + 1}: description is required for non-client charges` });
          }
        } else {
          await requireTradeJobAccess(db, ctx, jobId);
        }

        if (workOrderId) {
          const workOrder = await requireWorkOrderAccess(db, ctx, workOrderId);
          if (workOrder.jobId !== jobId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Line ${index + 1}: work order does not belong to this job` });
          }
        }

        if (subcontractId != null) {
          const subcontract = await requireSubcontractAccess(db, ctx, subcontractId);
          if (subcontract.jobId !== jobId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Line ${index + 1}: subcontract does not belong to this job` });
          }
        }

        if (milestoneId) {
          const [milestone] = await db.select({
            id: poMilestones.id,
            workOrderId: poMilestones.workOrderId,
            jobId: poMilestones.jobId,
          })
            .from(poMilestones)
            .where(and(
              eq(poMilestones.id, milestoneId),
              eq(poMilestones.jobId, jobId!),
              ...(workOrderId ? [eq(poMilestones.workOrderId, workOrderId)] : []),
            ))
            .limit(1);
          if (!milestone) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Line ${index + 1}: milestone does not belong to this job/work order` });
          }
          await requireWorkOrderAccess(db, ctx, milestone.workOrderId);
          workOrderId = milestone.workOrderId;
        }

        validatedItems.push({
          description: description || `Invoice claim line ${index + 1}`,
          amount: moneyString(moneyNumber(item.amount)),
          gstAmount: moneyString(moneyNumber(item.gstAmount)),
          jobId,
          workOrderId,
          milestoneId,
          subcontractId,
          subcontractMilestoneIndex,
        });
      }

      // Upload file to S3
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-invoices/${installerId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const invoiceAmount = validatedItems.reduce((sum, item) => sum + moneyNumber(item.amount), 0);
      const gstAmount = validatedItems.reduce((sum, item) => sum + moneyNumber(item.gstAmount), 0);
      const totalWithGst = invoiceAmount + gstAmount;
      const primaryItem = validatedItems[0];

      const [result] = await db.insert(tradeInvoices).values({
        installerId,
        jobId: primaryItem.jobId,
        workOrderId: primaryItem.workOrderId,
        invoiceNumber: input.invoiceNumber,
        amount: moneyString(invoiceAmount),
        gstAmount: moneyString(gstAmount),
        totalWithGst: moneyString(totalWithGst),
        description: input.description || null,
        fileUrl,
        fileKey,
        status: "submitted",
      });

      const invoiceId = Number(result.insertId);

      for (let index = 0; index < validatedItems.length; index++) {
        const item = validatedItems[index];
        let lineDesc = item.description;
        if (item.subcontractId != null && item.subcontractMilestoneIndex != null) {
          const [sc] = await db.select()
            .from(projectSubcontracts)
            .where(eq(projectSubcontracts.id, item.subcontractId))
            .limit(1);
          if (sc && sc.paymentSchedule) {
            const milestone = (sc.paymentSchedule as any[])[item.subcontractMilestoneIndex];
            if (milestone) {
              const expectedAmount = milestone.usePercent
                ? ((milestone.percentOfTotal || 0) / 100) * moneyNumber(sc.subcontractSum)
                : moneyNumber(milestone.amountDollars);
              const itemAmount = moneyNumber(item.amount);
              if (expectedAmount > 0 && Math.abs(itemAmount - expectedAmount) > 0.01) {
                lineDesc = `${lineDesc} [AMOUNT MISMATCH: Invoice $${itemAmount.toFixed(2)} vs milestone expected $${expectedAmount.toFixed(2)}]`;
              }
            }
          }
        }

        const [lineResult] = await db.insert(tradeInvoiceLines).values({
          invoiceId,
          lineNumber: index + 1,
          description: lineDesc,
          quantity: "1",
          unitPrice: item.amount,
          amount: item.amount,
          gstAmount: item.gstAmount,
          jobId: item.jobId,
          workOrderId: item.workOrderId,
          milestoneId: item.milestoneId,
          subcontractId: item.subcontractId,
          subcontractMilestoneIndex: item.subcontractMilestoneIndex,
        });

        if (item.milestoneId) {
          await db.update(poMilestones)
            .set({ status: "claimed", claimedAt: new Date(), invoiceLineId: Number(lineResult.insertId) })
            .where(eq(poMilestones.id, item.milestoneId));
        }
      }

      // Notify owner/supervisor that a new invoice has been submitted
      const [installerInfo] = await db.select({ name: constructionInstallers.name })
        .from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
        .limit(1);
      notifyOwner({
        title: "New Trade Invoice Submitted",
        content: `${installerInfo?.name || "Trade"} submitted invoice ${input.invoiceNumber} for $${moneyString(invoiceAmount)} across ${validatedItems.length} item(s)`,
      }).catch(() => {});

      // Push notification to staff
      triggerPushTradeInvoiceSubmitted(
        installerInfo?.name || "Trade",
        input.invoiceNumber,
        moneyString(invoiceAmount)
      );

      return { id: invoiceId, fileUrl };
    }),

  // Get subcontract milestones for a job (for trade portal milestone selection)
  getJobSubcontractMilestones: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      await requireTradeJobAccess(db, ctx, input.jobId);

      // Get subcontracts for this job that are assigned to this installer
      const subcontracts = await db.select()
        .from(projectSubcontracts)
        .where(and(
          eq(projectSubcontracts.jobId, input.jobId),
          eq(projectSubcontracts.installerId, installerId),
          isNull(projectSubcontracts.archivedAt),
          or(eq(projectSubcontracts.status, "sent"), eq(projectSubcontracts.status, "signed"))!,
        ));

      // Also get subcontracts that are signed (available to all trades on the job)
      const signedSubcontracts = await db.select()
        .from(projectSubcontracts)
        .where(and(
          eq(projectSubcontracts.jobId, input.jobId),
          eq(projectSubcontracts.status, "signed"),
          isNull(projectSubcontracts.archivedAt),
        ));

      // Merge and deduplicate
      const allSubcontracts = [...subcontracts];
      for (const sc of signedSubcontracts) {
        if (!allSubcontracts.find(s => s.id === sc.id)) {
          allSubcontracts.push(sc);
        }
      }

      // Get existing invoice lines linked to these subcontracts to show claim status
      const subcontractIds = allSubcontracts.map(s => s.id);
      let existingClaims: any[] = [];
      if (subcontractIds.length > 0) {
        existingClaims = await db.select({
          subcontractId: tradeInvoiceLines.subcontractId,
          subcontractMilestoneIndex: tradeInvoiceLines.subcontractMilestoneIndex,
          amount: tradeInvoiceLines.amount,
          approvalStatus: tradeInvoiceLines.approvalStatus,
        })
          .from(tradeInvoiceLines)
          .where(inArray(tradeInvoiceLines.subcontractId, subcontractIds));
      }

      return allSubcontracts.map(sc => ({
        id: sc.id,
        subcontractorName: sc.subcontractorName,
        subcontractSum: sc.subcontractSum,
        status: sc.status,
        milestones: ((sc.paymentSchedule as PaymentMilestone[]) || []).map((m, index) => {
          const claims = existingClaims.filter(
            c => c.subcontractId === sc.id && c.subcontractMilestoneIndex === index
          );
          return {
            index,
            label: m.label,
            amountDollars: m.amountDollars,
            percentOfTotal: m.percentOfTotal,
            usePercent: m.usePercent,
            claimed: claims.length > 0,
            claimStatus: claims.length > 0 ? claims[0].approvalStatus : null,
            claimedAmount: claims.reduce((sum: number, c: any) => sum + parseFloat(c.amount || "0"), 0),
          };
        }),
      }));
    }),

  // Get signed contracts for this installer
  getContracts: protectedTradePortalProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const contracts = await db.select({
        id: projectSubcontracts.id,
        jobId: projectSubcontracts.jobId,
        subcontractorName: projectSubcontracts.subcontractorName,
        clientAccountNumber: projectSubcontracts.clientAccountNumber,
        subcontractSum: projectSubcontracts.subcontractSum,
        siteAddress: projectSubcontracts.siteAddress,
        status: projectSubcontracts.status,
        pdfUrl: projectSubcontracts.pdfUrl,
        signedAt: projectSubcontracts.signedAt,
        sentAt: projectSubcontracts.sentAt,
        createdAt: projectSubcontracts.createdAt,
      })
        .from(projectSubcontracts)
        .where(eq(projectSubcontracts.installerId, installerId))
        .orderBy(desc(projectSubcontracts.createdAt));

      // Get job details for each contract
      const jobIds = Array.from(new Set(contracts.map(c => c.jobId).filter(Boolean))) as number[];
      let jobMap: Record<number, { clientName: string; quoteNumber: string }> = {};
      let visibleJobIds = new Set<number>();
      if (jobIds.length > 0) {
        const jobConditions = tradeJobConditions(ctx, inArray(constructionJobs.id, jobIds));
        const jobRows = await db.select({
          id: constructionJobs.id,
          clientName: constructionJobs.clientName,
          quoteNumber: constructionJobs.quoteNumber,
          leadId: crmLeads.id,
          leadFirstName: crmLeads.contactFirstName,
          leadLastName: crmLeads.contactLastName,
          leadCompany: crmLeads.company,
          leadClientNumber: crmLeads.clientNumber,
        })
          .from(constructionJobs)
          .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
          .where(and(...jobConditions));
        const jobs = jobRows.map((job: any) => withCanonicalClientName(job));
        visibleJobIds = new Set(jobs.map(j => j.id));
        jobMap = Object.fromEntries(jobs.map(j => [j.id, { clientName: j.clientName || "", quoteNumber: j.quoteNumber || "" }]));
      }

      return Promise.all(contracts.filter(c => visibleJobIds.has(c.jobId)).map(async (c) => ({
        ...c,
        pdfUrl: await resolveStorageUrlForPortal(c.pdfUrl),
        clientName: c.jobId ? jobMap[c.jobId]?.clientName || "" : "",
        quoteNumber: c.jobId ? jobMap[c.jobId]?.quoteNumber || "" : "",
      })));
    }),

  // Get milestone claim status for a subcontract (used in SubcontractEditor)
  getSubcontractClaimStatus: protectedTradePortalProcedure
    .input(z.object({ subcontractId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireSubcontractAccess(db, ctx, input.subcontractId);
      const claims = await db.select({
        subcontractMilestoneIndex: tradeInvoiceLines.subcontractMilestoneIndex,
        amount: tradeInvoiceLines.amount,
        approvalStatus: tradeInvoiceLines.approvalStatus,
        invoiceId: tradeInvoiceLines.invoiceId,
      })
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.subcontractId, input.subcontractId));
      return claims;
    }),

  // ─── Job Details (full info for a specific job) ────────────────────────────

  getJobDetail: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const job = await requireTradeJobAccess(db, ctx, input.jobId);
      const canonicalClient = await getCanonicalClientForTradeJob(db, ctx, job);

      // Get client phone from linked quote
      let clientPhone: string | null = canonicalClient?.phone || null;
      let clientEmail: string | null = canonicalClient?.email || null;
      if (job.quoteId) {
        const quoteConditions = [eq(quotes.id, job.quoteId)];
        appendExactQuoteTenantScope(quoteConditions, quotes.tenantId, tenantIdFromContext(ctx));
        const [q] = await db.select({
          clientPhone: quotes.clientPhone,
          clientEmail: quotes.clientEmail,
        }).from(quotes).where(and(...quoteConditions));
        clientPhone = clientPhone || q?.clientPhone || null;
        clientEmail = clientEmail || q?.clientEmail || null;
      }

      // Get all assigned trades on this job (visible to other trades)
      const allAssignments = await db.select({
        id: constructionAssignments.id,
        role: constructionAssignments.role,
        installerName: constructionInstallers.name,
        installerPhone: constructionInstallers.phone,
        tradeType: constructionInstallers.tradeType,
      })
        .from(constructionAssignments)
        .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
        .where(eq(constructionAssignments.jobId, input.jobId));

      // Get work orders for this trade on this job
      const workOrders = await db.select()
        .from(cmWorkOrders)
        .where(eq(cmWorkOrders.jobId, input.jobId))
        .orderBy(desc(cmWorkOrders.createdAt));

	      // Get shared files for this job
	      const sharedFiles = await db.select()
	        .from(jobSharedFiles)
	        .where(and(
	          eq(jobSharedFiles.jobId, input.jobId),
	          sql`COALESCE(${jobSharedFiles.visibleToTradePortal}, ${jobSharedFiles.visible}, 1) != 0`,
	          sql`COALESCE(${jobSharedFiles.visible}, 1) != 0`,
	        ))
	        .orderBy(desc(jobSharedFiles.createdAt));

      // Get subcontracts for this trade on this job
      const subcontracts = await db.select()
        .from(projectSubcontracts)
        .where(and(
          eq(projectSubcontracts.jobId, input.jobId),
          eq(projectSubcontracts.installerId, installerId),
        ));

      const jobInstructions = await buildTradeJobInstructionItems(db, ctx, job, subcontracts);

      const signedSharedFiles = await Promise.all(sharedFiles.map(async (file) => ({
        ...file,
        fileUrl: await resolveStorageUrlForPortal(file.fileUrl),
      })));
      const signedSubcontracts = await Promise.all(subcontracts.map(async (subcontract) => ({
        ...subcontract,
        pdfUrl: await resolveStorageUrlForPortal(subcontract.pdfUrl),
      })));

      return {
        job: {
          id: job.id,
          quoteNumber: job.quoteNumber,
          storedClientName: job.clientName,
          clientName: canonicalClient?.name || job.clientName,
          clientPhone,
          clientEmail,
          siteAddress: job.siteAddress,
          status: job.status,
          priority: job.priority,
          scheduledStart: job.scheduledStart,
          scheduledEnd: job.scheduledEnd,
          supervisorName: job.supervisorName,
          designAdviserName: job.designAdviserName,
          notes: job.notes,
        },
        assignedTrades: allAssignments,
        jobInstructions,
        workOrders,
        sharedFiles: signedSharedFiles,
        subcontracts: signedSubcontracts,
      };
    }),

  updateJobInstructionAction: protectedTradePortalProcedure
    .input(z.object({
      jobId: z.number(),
      sourceType: tradeInstructionSourceTypeSchema,
      sourceId: z.number(),
      sourceKey: z.string().max(128).optional(),
      actionStatus: tradeInstructionActionStatusSchema,
      notes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireVisibleTradeInstructionSource(db, ctx, input);
      const result = await upsertTradeInstructionAction(db, ctx, {
        jobId: input.jobId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        actionStatus: input.actionStatus,
        notes: input.notes,
      });
      return { success: true, id: result.id };
    }),

  uploadJobInstructionEvidence: protectedTradePortalProcedure
    .input(z.object({
      jobId: z.number(),
      sourceType: tradeInstructionSourceTypeSchema,
      sourceId: z.number(),
      sourceKey: z.string().max(128).optional(),
      fileBase64: z.string().min(1),
      fileName: z.string().trim().min(1).max(255),
      fileMimeType: z.string().trim().min(1).max(128),
      caption: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireVisibleTradeInstructionSource(db, ctx, input);

      const installerId = ctx.tradeAccess.installerId;
      const tenantId = tradePortalTenantId(ctx);
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for evidence uploads" });
      }

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      if (fileBuffer.byteLength > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Evidence file must be under 15MB" });
      }

      const suffix = crypto.randomBytes(6).toString("hex");
      const safeName = safeUploadFilename(input.fileName);
      const safeSourceKey = safeUploadFilename(normalizeInstructionSourceKey(input.sourceKey) || "source");
      const fileKey = `trade-instruction-evidence/${tenantId}/${installerId}/${input.jobId}/${input.sourceType}-${input.sourceId}-${safeSourceKey}/${suffix}-${safeName}`;
      const { key, url } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const sourceKey = normalizeInstructionSourceKey(input.sourceKey);
      const [existing] = await db.select()
        .from(tradeJobInstructionActions)
        .where(and(
          eq(tradeJobInstructionActions.tenantId, tenantId),
          eq(tradeJobInstructionActions.jobId, input.jobId),
          eq(tradeJobInstructionActions.installerId, installerId),
          eq(tradeJobInstructionActions.sourceType, input.sourceType),
          eq(tradeJobInstructionActions.sourceId, input.sourceId),
          eq(tradeJobInstructionActions.sourceKey, sourceKey),
        ))
        .limit(1);
      const existingEvidence = Array.isArray(existing?.evidenceFiles) ? existing.evidenceFiles : [];
      const evidenceFile = {
        url,
        key,
        fileName: input.fileName,
        mimeType: input.fileMimeType,
        size: fileBuffer.byteLength,
        caption: input.caption || null,
        uploadedAt: new Date().toISOString(),
      };
      const result = await upsertTradeInstructionAction(db, ctx, {
        jobId: input.jobId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        actionStatus: existing?.actionStatus || "acknowledged",
        notes: existing?.notes || null,
        evidenceFiles: [...existingEvidence, evidenceFile],
      });

      return { success: true, id: result.id, evidenceFile };
    }),

  // ─── Job List with shared file counts (for job details page) ───────────────

  getJobsList: protectedTradePortalProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      const jobIds = await getVisibleTradeJobIds(db, ctx, installerId);
      if (jobIds.length === 0) return [];

      const jobRows = await db.select({
        id: constructionJobs.id,
        quoteNumber: constructionJobs.quoteNumber,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        status: constructionJobs.status,
        scheduledStart: constructionJobs.scheduledStart,
        scheduledEnd: constructionJobs.scheduledEnd,
        leadId: crmLeads.id,
        leadFirstName: crmLeads.contactFirstName,
        leadLastName: crmLeads.contactLastName,
        leadCompany: crmLeads.company,
        leadClientNumber: crmLeads.clientNumber,
      })
        .from(constructionJobs)
        .leftJoin(crmLeads, tradeLeadJoinConditions(ctx))
        .where(and(...tradeJobConditions(ctx, inArray(constructionJobs.id, jobIds))))
        .orderBy(desc(constructionJobs.scheduledStart));
      const jobs = jobRows.map((job: any) => withCanonicalClientName(job));

      // Count shared files per job
      const visibleJobIds = jobs.map(j => j.id);
      if (visibleJobIds.length === 0) return [];
	      const allSharedFiles = await db.select({
	        jobId: jobSharedFiles.jobId,
	      }).from(jobSharedFiles)
	        .where(and(
	          inArray(jobSharedFiles.jobId, visibleJobIds),
	          sql`COALESCE(${jobSharedFiles.visibleToTradePortal}, ${jobSharedFiles.visible}, 1) != 0`,
	          sql`COALESCE(${jobSharedFiles.visible}, 1) != 0`,
	        ));

      const fileCountMap: Record<number, number> = {};
      allSharedFiles.forEach(f => {
        fileCountMap[f.jobId] = (fileCountMap[f.jobId] || 0) + 1;
      });

      return jobs.map(j => ({
        ...j,
        sharedFileCount: fileCountMap[j.id] || 0,
      }));
    }),

  // ─── Push Notifications ────────────────────────────────────────────────────
  pushSubscribe: protectedTradePortalProcedure
    .input(z.object({
      endpoint: z.string().min(1),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { subscribePush } = await import("./push");
      await subscribePush({
        portalType: "trade",
        portalAccessId: ctx.tradeAccess.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
      return { success: true };
    }),

  pushUnsubscribe: protectedTradePortalProcedure
    .input(z.object({ endpoint: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { unsubscribePush } = await import("./push");
      await unsubscribePush(input.endpoint);
      return { success: true };
    }),

  getVapidKey: publicTradePortalProcedure.query(() => {
    return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "" };
  }),

  markNewsViewed: protectedTradePortalProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    await db.update(tradePortalAccess)
      .set({ lastViewedNewsAt: new Date() })
      .where(eq(tradePortalAccess.id, ctx.tradeAccess.id));
    return { success: true };
  }),

  // ─── Chat Procedures (Trade Portal) ──────────────────────────────────────

  chatListChannels: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;

    // Trades see: the system "Trades" channel + any job channels they're a member of
    const tradesChannel = await db.select().from(chatChannels)
      .where(and(eq(chatChannels.type, "system"), eq(chatChannels.name, "Trades")))
      .limit(1);

    const memberChannels = await db.select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.memberType, "trade"),
        eq(chatChannelMembers.memberId, installerId)
      ));

    const channelIds = [
      ...(tradesChannel.length ? [tradesChannel[0].id] : []),
      ...memberChannels.map(m => m.channelId),
    ];

    if (!channelIds.length) return [];

    const channels = await db.select().from(chatChannels)
      .where(inArray(chatChannels.id, channelIds))
      .orderBy(asc(chatChannels.name));

    // Get unread counts
    const result = await Promise.all(channels.map(async (ch) => {
      const member = await db.select().from(chatChannelMembers)
        .where(and(
          eq(chatChannelMembers.channelId, ch.id),
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, installerId)
        ))
        .limit(1);

      const lastRead = member[0]?.lastReadAt || new Date(0);
      const unreadMessages = await db.select().from(chatMessages)
        .where(and(
          eq(chatMessages.channelId, ch.id),
          gt(chatMessages.createdAt, lastRead)
        ));

      return { ...ch, unreadCount: unreadMessages.length };
    }));

    return result;
  }),

  chatGetMessages: protectedTradePortalProcedure
    .input(z.object({ channelId: z.number(), limit: z.number().optional().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const messages = await db.select().from(chatMessages)
        .where(eq(chatMessages.channelId, input.channelId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(input.limit);
      return messages;
    }),

  chatSendMessage: protectedTradePortalProcedure
    .input(z.object({
      channelId: z.number(),
      content: z.string().min(1).max(5000),
      attachments: z.array(z.object({
        url: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installer = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, ctx.tradeAccess.installerId))
        .limit(1);
      const senderName = installer[0]?.name || "Trade";

      const [msg] = await db.insert(chatMessages).values({
        channelId: input.channelId,
        senderId: ctx.tradeAccess.installerId,
        senderName,

        content: input.content,
        attachments: input.attachments ? JSON.stringify(input.attachments) : null,
      }).$returningId();

      return { id: msg.id };
    }),

  chatMarkRead: protectedTradePortalProcedure
    .input(z.object({ channelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      // Upsert membership + lastReadAt
      const existing = await db.select().from(chatChannelMembers)
        .where(and(
          eq(chatChannelMembers.channelId, input.channelId),
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, installerId)
        ))
        .limit(1);

      if (existing.length) {
        await db.update(chatChannelMembers)
          .set({ lastReadAt: new Date() })
          .where(eq(chatChannelMembers.id, existing[0].id));
      } else {
        await db.insert(chatChannelMembers).values({
          channelId: input.channelId,
          memberType: "trade",
          memberId: installerId,
          role: "member",
          lastReadAt: new Date(),
        });
      }
      return { success: true };
    }),

  chatUnreadTotal: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;

    // Get channels this trade user can see
    const tradesChannel = await db.select().from(chatChannels)
      .where(and(eq(chatChannels.type, "system"), eq(chatChannels.name, "Trades")))
      .limit(1);

    const memberChannels = await db.select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.memberType, "trade"),
        eq(chatChannelMembers.memberId, installerId)
      ));

    const channelIds = [
      ...(tradesChannel.length ? [tradesChannel[0].id] : []),
      ...memberChannels.map(m => m.channelId),
    ];
    const uniqueIds = Array.from(new Set(channelIds));

    let totalUnread = 0;
    for (const channelId of uniqueIds) {
      const member = await db.select({ lastReadAt: chatChannelMembers.lastReadAt })
        .from(chatChannelMembers)
        .where(and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, installerId)
        ))
        .limit(1);

      const lastRead = member[0]?.lastReadAt || new Date(0);
      const [unread] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.channelId, channelId),
          gt(chatMessages.createdAt, lastRead)
        ));
      totalUnread += unread?.count || 0;
    }

    return { total: totalUnread };
  }),
});
