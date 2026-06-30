import {
  router,
  tenantProcedure as protectedProcedure,
} from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  projectSubcontracts,
  constructionJobs,
  constructionJobFinancials,
  constructionInstallers,
  constructionAssignments,
  tradeInvoiceLines,
  crmLeads,
  branches,
  users,
  tenantMemberships,
  type PaymentMilestone,
  type BuildingFileChecklist,
  type InspectionChecklist,
  type OtherContractorsChecklist,
  type ElectricalCablingChecklist,
  type DownpipesChecklist,
} from "../drizzle/schema";
import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { generateSubcontractHtml } from "./subcontract-pdf";
import { createDocument } from "./signwell";
import { storagePut } from "./storage";
import { buildTrustedAppUrl } from "./_core/url";
import { getCompanyName } from "./company-name";
import { ENV } from "./_core/env";
import { invokeLLM, type MessageContent } from "./_core/llm";
import { assertRateLimit } from "./_core/rateLimit";

function subcontractScope(id: number, tenantId: number) {
  return and(eq(projectSubcontracts.id, id), eq(projectSubcontracts.tenantId, tenantId));
}

function jobScope(id: number, tenantId: number) {
  return and(eq(constructionJobs.id, id), eq(constructionJobs.tenantId, tenantId));
}

function installerScope(id: number, tenantId: number) {
  return and(eq(constructionInstallers.id, id), eq(constructionInstallers.tenantId, tenantId));
}

function nullableText(value: unknown) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function moneyString(value: unknown) {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : "0.00";
}

function moneyNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOrNull(value: unknown) {
  const text = nullableText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canonicalClientNameFromLead(lead?: {
  contactFirstName?: string | null;
  contactLastName?: string | null;
  company?: string | null;
} | null) {
  if (!lead) return null;
  const firstName = nullableText(lead.contactFirstName);
  const lastName = nullableText(lead.contactLastName);
  return [firstName, lastName].filter(Boolean).join(" ") || nullableText(lead.company);
}

async function getTenantUserById(db: any, tenantId: number, userId: number | null | undefined) {
  if (!userId) return null;
  const selectFields = {
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
  };

  if (ENV.tenancyMode === "single") {
    const [user] = await db.select(selectFields)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user || null;
  }

  const [user] = await db.select(selectFields)
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(
      eq(tenantMemberships.tenantId, tenantId),
      eq(tenantMemberships.userId, userId),
    ))
    .limit(1);
  return user || null;
}

async function getBranchConstructionManagerForJob(db: any, tenantId: number, jobId: number) {
  const [context] = await db.select({
    leadBranchId: crmLeads.branchId,
    financialBranch: constructionJobFinancials.branch,
  })
    .from(constructionJobs)
    .leftJoin(crmLeads, and(eq(constructionJobs.leadId, crmLeads.id), eq(crmLeads.tenantId, tenantId)))
    .leftJoin(constructionJobFinancials, eq(constructionJobFinancials.jobId, constructionJobs.id))
    .where(jobScope(jobId, tenantId))
    .limit(1);

  if (!context) return null;

  let branch: {
    id: number;
    name: string;
    managerName: string | null;
    managerEmail: string | null;
    defaultConstructionManagerStaffId: number | null;
  } | null = null;

  if (context.leadBranchId) {
    const [byId] = await db.select({
      id: branches.id,
      name: branches.name,
      managerName: branches.managerName,
      managerEmail: branches.managerEmail,
      defaultConstructionManagerStaffId: branches.defaultConstructionManagerStaffId,
    })
      .from(branches)
      .where(and(eq(branches.id, context.leadBranchId), eq(branches.tenantId, tenantId)))
      .limit(1);
    branch = byId || null;
  }

  const financialBranch = nullableText(context.financialBranch);
  if (!branch && financialBranch) {
    const [byName] = await db.select({
      id: branches.id,
      name: branches.name,
      managerName: branches.managerName,
      managerEmail: branches.managerEmail,
      defaultConstructionManagerStaffId: branches.defaultConstructionManagerStaffId,
    })
      .from(branches)
      .where(and(
        eq(branches.tenantId, tenantId),
        eq(sql`LOWER(TRIM(${branches.name}))`, financialBranch.toLowerCase()),
      ))
      .limit(1);
    branch = byName || null;
  }

  if (!branch) return null;

  const defaultUser = await getTenantUserById(db, tenantId, branch.defaultConstructionManagerStaffId);
  const name = nullableText(defaultUser?.name) || nullableText(defaultUser?.email) || nullableText(branch.managerName);
  const email = nullableText(defaultUser?.email) || nullableText(branch.managerEmail);

  if (!name && !email) return null;
  return {
    branchId: branch.id,
    branchName: branch.name,
    name,
    email,
  };
}

// ─── Default Payment Milestones ──────────────────────────────────────────────
export const DEFAULT_PAYMENT_MILESTONES: PaymentMilestone[] = [
  { label: "Demo", amountDollars: null, percentOfTotal: 20, usePercent: true },
  { label: "Week of Commencement", amountDollars: null, percentOfTotal: 20, usePercent: true },
  { label: "Week of Frame Erected", amountDollars: null, percentOfTotal: 20, usePercent: true },
  { label: "Week of Roof Installed", amountDollars: null, percentOfTotal: 25, usePercent: true },
  { label: "Week of Completion", amountDollars: null, percentOfTotal: 10, usePercent: true },
  { label: "Retention for 15 days", amountDollars: null, percentOfTotal: 5, usePercent: true },
];

export const DEFAULT_BUILDING_FILE: BuildingFileChecklist = {
  plans: "Yes",
  materialsList: "Yes",
  approvals: "N/A",
};

export const DEFAULT_INSPECTIONS: InspectionChecklist = {
  footings: "N/A",
  slab: "N/A",
  plumbing: "N/A",
  framing: "N/A",
  roofing: "N/A",
  other: "N/A",
};

export const DEFAULT_OTHER_CONTRACTORS: OtherContractorsChecklist = {
  electrician: "N/A",
  plumber: "N/A",
  concreter: "N/A",
  flooring: "N/A",
  painter: "N/A",
};

export const DEFAULT_ELECTRICAL_CABLING: ElectricalCablingChecklist = {
  wall: "N/A",
  roof: "N/A",
  fan: "N/A",
};

export const DEFAULT_DOWNPIPES: DownpipesChecklist = {
  toGround: "N/A",
  toSpreader: "N/A",
  toExistingDP: "N/A",
  toStormwater: "N/A",
};

// ─── Zod Schemas ─────────────────────────────────────────────────────────────
const paymentMilestoneSchema = z.object({
  label: z.string(),
  amountDollars: z.number().nullable(),
  percentOfTotal: z.number().nullable(),
  usePercent: z.boolean(),
  paidBeforeSystem: z.boolean().optional(),
  paidBeforeSystemAt: z.string().nullable().optional(),
  paidBeforeSystemBy: z.number().nullable().optional(),
  paidBeforeSystemNote: z.string().nullable().optional(),
});

const buildingFileSchema = z.object({
  plans: z.string(),
  materialsList: z.string(),
  approvals: z.string(),
});

const inspectionSchema = z.object({
  footings: z.string(),
  slab: z.string(),
  plumbing: z.string(),
  framing: z.string(),
  roofing: z.string(),
  other: z.string(),
});

const otherContractorsSchema = z.object({
  electrician: z.string(),
  plumber: z.string(),
  concreter: z.string(),
  flooring: z.string(),
  painter: z.string(),
});

const electricalCablingSchema = z.object({
  wall: z.string(),
  roof: z.string(),
  fan: z.string(),
});

const downpipesSchema = z.object({
  toGround: z.string(),
  toSpreader: z.string(),
  toExistingDP: z.string(),
  toStormwater: z.string(),
});
const subcontractStatusSchema = z.enum(["draft", "sent", "signed", "cancelled", "declined", "on_file"]);
const contractSourceSchema = z.enum(["generated", "manual_on_file"]);

const CHECKLIST_VALUE_SET = new Set(["N/A", "Yes", "No"]);
const MAX_SUBCONTRACT_IMPORT_BYTES = 10 * 1024 * 1024;

function checklistValue(value: unknown) {
  const text = String(value || "").trim();
  if (CHECKLIST_VALUE_SET.has(text)) return text;
  const normalised = text.toLowerCase();
  if (normalised === "yes" || normalised === "y") return "Yes";
  if (normalised === "no" || normalised === "n") return "No";
  if (normalised === "na" || normalised === "n/a" || normalised === "not applicable") return "N/A";
  return "N/A";
}

function inferSubcontractImportMimeType(fileName: string, fileMimeType?: string | null) {
  const explicit = String(fileMimeType || "").trim().toLowerCase();
  if (explicit) return explicit;
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function safeStorageFileName(fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
  return safe || "existing-subcontract.pdf";
}

function subcontractImportContentPart(input: {
  fileBase64: string;
  fileName: string;
  fileMimeType: string;
}): MessageContent {
  if (input.fileMimeType.startsWith("image/")) {
    return {
      type: "image_url",
      image_url: {
        url: `data:${input.fileMimeType};base64,${input.fileBase64}`,
        detail: "high",
      },
    };
  }

  return {
    type: "file_data",
    file_data: {
      data: input.fileBase64,
      filename: input.fileName,
      mime_type: "application/pdf",
    },
  };
}

function cleanPaymentSchedule(value: unknown): PaymentMilestone[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => {
      const label = nullableText(row?.label);
      if (!label) return null;
      const amount = row?.amountDollars == null ? null : parseFloat(String(row.amountDollars).replace(/[$,]/g, ""));
      const percent = row?.percentOfTotal == null ? null : parseFloat(String(row.percentOfTotal).replace(/%/g, ""));
      return {
        label,
        amountDollars: Number.isFinite(amount) && amount! >= 0 ? amount! : null,
        percentOfTotal: Number.isFinite(percent) && percent! >= 0 ? percent! : null,
        usePercent: Boolean(row?.usePercent ?? (Number.isFinite(percent) && percent! > 0)),
      };
    })
    .filter(Boolean) as PaymentMilestone[];
}

function cleanBuildingFileChecklist(value: any): BuildingFileChecklist {
  return {
    plans: checklistValue(value?.plans),
    materialsList: checklistValue(value?.materialsList),
    approvals: checklistValue(value?.approvals),
  };
}

function cleanInspectionChecklist(value: any): InspectionChecklist {
  return {
    footings: checklistValue(value?.footings),
    slab: checklistValue(value?.slab),
    plumbing: checklistValue(value?.plumbing),
    framing: checklistValue(value?.framing),
    roofing: checklistValue(value?.roofing),
    other: checklistValue(value?.other),
  };
}

function cleanOtherContractorsChecklist(value: any): OtherContractorsChecklist {
  return {
    electrician: checklistValue(value?.electrician),
    plumber: checklistValue(value?.plumber),
    concreter: checklistValue(value?.concreter),
    flooring: checklistValue(value?.flooring),
    painter: checklistValue(value?.painter),
  };
}

function cleanElectricalCablingChecklist(value: any): ElectricalCablingChecklist {
  return {
    wall: checklistValue(value?.wall),
    roof: checklistValue(value?.roof),
    fan: checklistValue(value?.fan),
  };
}

function cleanDownpipesChecklist(value: any): DownpipesChecklist {
  return {
    toGround: checklistValue(value?.toGround),
    toSpreader: checklistValue(value?.toSpreader),
    toExistingDP: checklistValue(value?.toExistingDP),
    toStormwater: checklistValue(value?.toStormwater),
  };
}

async function extractExistingSubcontract(input: {
  fileBase64: string;
  fileName: string;
  fileMimeType: string;
}) {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You extract data from existing Australian construction subcontract documents for migration into a job management system. Return only JSON matching the schema. Do not invent missing fields. Use null for unknown nullable fields, "N/A" for unknown checklist fields, empty arrays for missing payment schedules, and AUD numeric values excluding GST where visible.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract project subcontract details from ${input.fileName}.` },
          subcontractImportContentPart(input),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "existing_subcontract_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            jobNumber: { type: ["string", "null"] },
            clientName: { type: ["string", "null"] },
            clientAccountNumber: { type: ["string", "null"] },
            constructionManager: { type: ["string", "null"] },
            subcontractorName: { type: ["string", "null"] },
            subcontractorPhone: { type: ["string", "null"] },
            siteAddress: { type: ["string", "null"] },
            subcontractSum: { type: ["number", "null"] },
            estimatedCommencement: { type: ["string", "null"] },
            estimatedCompletion: { type: ["string", "null"] },
            paymentSchedule: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  amountDollars: { type: ["number", "null"] },
                  percentOfTotal: { type: ["number", "null"] },
                  usePercent: { type: "boolean" },
                },
                required: ["label", "amountDollars", "percentOfTotal", "usePercent"],
                additionalProperties: false,
              },
            },
            buildingFile: {
              type: "object",
              properties: {
                plans: { type: "string", enum: ["N/A", "Yes", "No"] },
                materialsList: { type: "string", enum: ["N/A", "Yes", "No"] },
                approvals: { type: "string", enum: ["N/A", "Yes", "No"] },
              },
              required: ["plans", "materialsList", "approvals"],
              additionalProperties: false,
            },
            inspections: {
              type: "object",
              properties: {
                footings: { type: "string", enum: ["N/A", "Yes", "No"] },
                slab: { type: "string", enum: ["N/A", "Yes", "No"] },
                plumbing: { type: "string", enum: ["N/A", "Yes", "No"] },
                framing: { type: "string", enum: ["N/A", "Yes", "No"] },
                roofing: { type: "string", enum: ["N/A", "Yes", "No"] },
                other: { type: "string", enum: ["N/A", "Yes", "No"] },
              },
              required: ["footings", "slab", "plumbing", "framing", "roofing", "other"],
              additionalProperties: false,
            },
            otherContractors: {
              type: "object",
              properties: {
                electrician: { type: "string", enum: ["N/A", "Yes", "No"] },
                plumber: { type: "string", enum: ["N/A", "Yes", "No"] },
                concreter: { type: "string", enum: ["N/A", "Yes", "No"] },
                flooring: { type: "string", enum: ["N/A", "Yes", "No"] },
                painter: { type: "string", enum: ["N/A", "Yes", "No"] },
              },
              required: ["electrician", "plumber", "concreter", "flooring", "painter"],
              additionalProperties: false,
            },
            electricalCabling: {
              type: "object",
              properties: {
                wall: { type: "string", enum: ["N/A", "Yes", "No"] },
                roof: { type: "string", enum: ["N/A", "Yes", "No"] },
                fan: { type: "string", enum: ["N/A", "Yes", "No"] },
              },
              required: ["wall", "roof", "fan"],
              additionalProperties: false,
            },
            downpipes: {
              type: "object",
              properties: {
                toGround: { type: "string", enum: ["N/A", "Yes", "No"] },
                toSpreader: { type: "string", enum: ["N/A", "Yes", "No"] },
                toExistingDP: { type: "string", enum: ["N/A", "Yes", "No"] },
                toStormwater: { type: "string", enum: ["N/A", "Yes", "No"] },
              },
              required: ["toGround", "toSpreader", "toExistingDP", "toStormwater"],
              additionalProperties: false,
            },
            flashingBySubcontractor: { type: "string", enum: ["N/A", "Yes", "No"] },
            confidence: { type: "integer" },
            notes: { type: ["string", "null"] },
          },
          required: [
            "jobNumber",
            "clientName",
            "clientAccountNumber",
            "constructionManager",
            "subcontractorName",
            "subcontractorPhone",
            "siteAddress",
            "subcontractSum",
            "estimatedCommencement",
            "estimatedCompletion",
            "paymentSchedule",
            "buildingFile",
            "inspections",
            "otherContractors",
            "electricalCabling",
            "downpipes",
            "flashingBySubcontractor",
            "confidence",
            "notes",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = result.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("No structured subcontract data returned");
  }
  return JSON.parse(content);
}

function isExecutedSubcontract(sc: { status?: string | null; signedAt?: Date | null; pdfUrl?: string | null }) {
  return sc.status === "signed" || sc.status === "on_file" || Boolean(sc.signedAt) || Boolean(sc.pdfUrl);
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const subcontractRouter = router({
  // Create a new subcontract (pre-filled from job data)
  create: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      installerId: z.number().optional(),
      sourceSubcontractId: z.number().optional(),
      contractSource: contractSourceSchema.optional(),
      onFileNotes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Fetch job details for pre-fill
      const [job] = await db
        .select()
        .from(constructionJobs)
        .where(jobScope(input.jobId, ctx.tenant!.id))
        .limit(1);

      if (!job) throw new Error("Job not found");

      let sourceSubcontract: typeof projectSubcontracts.$inferSelect | null = null;
      if (input.sourceSubcontractId) {
        const [source] = await db
          .select()
          .from(projectSubcontracts)
          .where(subcontractScope(input.sourceSubcontractId, ctx.tenant!.id))
          .limit(1);
        if (!source || source.jobId !== input.jobId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Source subcontract not found for this job" });
        }
        sourceSubcontract = source;
      }

      // Fetch installer if specified
      let installer: any = null;
      if (input.installerId) {
        const [inst] = await db
          .select()
          .from(constructionInstallers)
          .where(installerScope(input.installerId, ctx.tenant!.id))
          .limit(1);
        installer = inst;
      }

      const selectedInstallerId = input.installerId ?? sourceSubcontract?.installerId ?? null;
      const [lead] = job.leadId
        ? await db.select({
            contactFirstName: crmLeads.contactFirstName,
            contactLastName: crmLeads.contactLastName,
            company: crmLeads.company,
            clientNumber: crmLeads.clientNumber,
          })
            .from(crmLeads)
            .where(and(eq(crmLeads.id, job.leadId), eq(crmLeads.tenantId, ctx.tenant!.id)))
            .limit(1)
        : [];
      const canonicalClientName = canonicalClientNameFromLead(lead);
      const sourceClientName = nullableText(sourceSubcontract?.clientName);
      const sourceUsesStoredJobName = sourceClientName && sourceClientName === nullableText(job.clientName);
      const branchConstructionManager = await getBranchConstructionManagerForJob(db, ctx.tenant!.id, input.jobId);

      const isOnFile = input.contractSource === "manual_on_file";
      const [result] = await db.insert(projectSubcontracts).values({
        tenantId: ctx.tenant!.id,
        jobId: input.jobId,
        installerId: selectedInstallerId,
        jobNumber: sourceSubcontract?.jobNumber || job.quoteNumber || String(job.id),
        clientName: sourceUsesStoredJobName
          ? canonicalClientName || sourceClientName
          : sourceClientName || canonicalClientName || job.clientName,
        clientAccountNumber: sourceSubcontract?.clientAccountNumber || lead?.clientNumber || "",
        constructionManager: sourceSubcontract?.constructionManager || branchConstructionManager?.name || job.supervisorName || job.designAdviserName || "",
        subcontractorName: installer?.name || sourceSubcontract?.subcontractorName || "",
        subcontractorPhone: installer?.phone || sourceSubcontract?.subcontractorPhone || "",
        siteAddress: sourceSubcontract?.siteAddress || job.siteAddress || "",
        subcontractSum: sourceSubcontract?.subcontractSum || "0.00",
        paymentSchedule: sourceSubcontract?.paymentSchedule || DEFAULT_PAYMENT_MILESTONES,
        estimatedCommencement: sourceSubcontract?.estimatedCommencement || null,
        estimatedCompletion: sourceSubcontract?.estimatedCompletion || null,
        buildingFile: sourceSubcontract?.buildingFile || DEFAULT_BUILDING_FILE,
        inspections: sourceSubcontract?.inspections || DEFAULT_INSPECTIONS,
        otherContractors: sourceSubcontract?.otherContractors || DEFAULT_OTHER_CONTRACTORS,
        electricalCabling: sourceSubcontract?.electricalCabling || DEFAULT_ELECTRICAL_CABLING,
        downpipes: sourceSubcontract?.downpipes || DEFAULT_DOWNPIPES,
        flashingBySubcontractor: sourceSubcontract?.flashingBySubcontractor || "Yes",
        status: isOnFile ? "on_file" : "draft",
        contractSource: isOnFile ? "manual_on_file" : "generated",
        onFileAt: isOnFile ? new Date() : null,
        onFileNotes: isOnFile ? nullableText(input.onFileNotes) : null,
        createdBy: ctx.user.id,
      });

      return { id: result.insertId };
    }),

  importExistingContract: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      fileBase64: z.string().min(1).max(15_000_000),
      fileName: z.string().min(1).max(255),
      fileMimeType: z.string().optional(),
      onFileNotes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRateLimit({
        key: `subcontract-import:${ctx.tenant!.id}:${ctx.user.id}:${ctx.req.ip}`,
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const fileMimeType = inferSubcontractImportMimeType(input.fileName, input.fileMimeType);
      const isSupported = fileMimeType === "application/pdf" || fileMimeType === "image/png" || fileMimeType === "image/jpeg";
      if (!isSupported) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subcontract import supports PDF, JPG, and PNG files" });
      }

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      if (fileBuffer.length === 0 || fileBuffer.length > MAX_SUBCONTRACT_IMPORT_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contract file must be 10MB or smaller" });
      }

      const [job] = await db
        .select()
        .from(constructionJobs)
        .where(jobScope(input.jobId, ctx.tenant!.id))
        .limit(1);

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      const [lead] = job.leadId
        ? await db.select({
            contactFirstName: crmLeads.contactFirstName,
            contactLastName: crmLeads.contactLastName,
            company: crmLeads.company,
            clientNumber: crmLeads.clientNumber,
          })
            .from(crmLeads)
            .where(and(eq(crmLeads.id, job.leadId), eq(crmLeads.tenantId, ctx.tenant!.id)))
            .limit(1)
        : [];
      const canonicalClientName = canonicalClientNameFromLead(lead);
      const branchConstructionManager = await getBranchConstructionManagerForJob(db, ctx.tenant!.id, input.jobId);

      const storageFileName = safeStorageFileName(input.fileName);
      const storageKey = `tenants/${ctx.tenant!.id}/jobs/${input.jobId}/subcontracts/imports/${Date.now()}-${storageFileName}`;
      const storedFile = await storagePut(storageKey, fileBuffer, fileMimeType);

      let extracted: any = null;
      let extractionStatus: "ok" | "failed" = "ok";
      let extractionMessage: string | null = null;
      try {
        extracted = await extractExistingSubcontract({
          fileBase64: input.fileBase64,
          fileName: input.fileName,
          fileMimeType,
        });
      } catch (err: any) {
        extractionStatus = "failed";
        extractionMessage = err?.message || "AI extraction failed";
      }

      const extractedSubcontractorName = nullableText(extracted?.subcontractorName);
      const [matchedInstaller] = extractedSubcontractorName
        ? await db
            .select()
            .from(constructionInstallers)
            .where(and(
              eq(constructionInstallers.tenantId, ctx.tenant!.id),
              eq(sql`LOWER(TRIM(${constructionInstallers.name}))`, extractedSubcontractorName.toLowerCase()),
            ))
            .limit(1)
        : [];

      const paymentSchedule = cleanPaymentSchedule(extracted?.paymentSchedule);
      const importedNotes = [
        `Imported existing subcontract file: ${input.fileName}`,
        nullableText(input.onFileNotes),
        extractionStatus === "ok"
          ? `AI extraction confidence: ${Number.isFinite(Number(extracted?.confidence)) ? Number(extracted.confidence) : 0}/100`
          : `AI extraction failed: ${extractionMessage}`,
        paymentSchedule.length === 0 ? "Payment schedule defaulted because no schedule was detected in the uploaded contract." : null,
        nullableText(extracted?.notes),
      ].filter(Boolean).join("\n");

      const [result] = await db.insert(projectSubcontracts).values({
        tenantId: ctx.tenant!.id,
        jobId: input.jobId,
        installerId: matchedInstaller?.id || null,
        jobNumber: nullableText(extracted?.jobNumber) || job.quoteNumber || String(job.id),
        clientName: canonicalClientName || nullableText(extracted?.clientName) || job.clientName || "",
        clientAccountNumber: lead?.clientNumber || nullableText(extracted?.clientAccountNumber) || "",
        constructionManager: nullableText(extracted?.constructionManager) || branchConstructionManager?.name || job.supervisorName || job.designAdviserName || "",
        subcontractorName: matchedInstaller?.name || extractedSubcontractorName || "",
        subcontractorPhone: nullableText(extracted?.subcontractorPhone) || matchedInstaller?.phone || "",
        siteAddress: nullableText(extracted?.siteAddress) || job.siteAddress || "",
        subcontractSum: moneyString(extracted?.subcontractSum),
        paymentSchedule: paymentSchedule.length > 0 ? paymentSchedule : DEFAULT_PAYMENT_MILESTONES,
        estimatedCommencement: dateOrNull(extracted?.estimatedCommencement),
        estimatedCompletion: dateOrNull(extracted?.estimatedCompletion),
        buildingFile: extracted?.buildingFile ? cleanBuildingFileChecklist(extracted.buildingFile) : DEFAULT_BUILDING_FILE,
        inspections: extracted?.inspections ? cleanInspectionChecklist(extracted.inspections) : DEFAULT_INSPECTIONS,
        otherContractors: extracted?.otherContractors ? cleanOtherContractorsChecklist(extracted.otherContractors) : DEFAULT_OTHER_CONTRACTORS,
        electricalCabling: extracted?.electricalCabling ? cleanElectricalCablingChecklist(extracted.electricalCabling) : DEFAULT_ELECTRICAL_CABLING,
        downpipes: extracted?.downpipes ? cleanDownpipesChecklist(extracted.downpipes) : DEFAULT_DOWNPIPES,
        flashingBySubcontractor: checklistValue(extracted?.flashingBySubcontractor),
        status: "on_file",
        contractSource: "manual_on_file",
        onFileAt: new Date(),
        onFileNotes: importedNotes,
        pdfUrl: storedFile.url,
        pdfKey: storedFile.key,
        createdBy: ctx.user.id,
      });

      return {
        id: result.insertId,
        pdfUrl: storedFile.url,
        extractionStatus,
        extractionMessage,
        extracted,
      };
    }),

  // Get a single subcontract by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(projectSubcontracts)
        .where(subcontractScope(input.id, ctx.tenant!.id))
        .limit(1);
      if (!row) return null;
      const branchConstructionManager = await getBranchConstructionManagerForJob(db, ctx.tenant!.id, row.jobId);
      return {
        ...row,
        branchConstructionManagerName: branchConstructionManager?.name || null,
        branchConstructionManagerEmail: branchConstructionManager?.email || null,
        branchName: branchConstructionManager?.branchName || null,
      };
    }),

  // List subcontracts for a job
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number(), includeArchived: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [
        eq(projectSubcontracts.jobId, input.jobId),
        eq(projectSubcontracts.tenantId, ctx.tenant!.id),
      ];
      if (!input.includeArchived) conditions.push(isNull(projectSubcontracts.archivedAt));
      return db
        .select()
        .from(projectSubcontracts)
        .where(and(...conditions))
        .orderBy(desc(projectSubcontracts.createdAt));
    }),

  // List all subcontracts
  listAll: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const conditions = [eq(projectSubcontracts.tenantId, ctx.tenant!.id)];
    if (!input?.includeArchived) conditions.push(isNull(projectSubcontracts.archivedAt));
    return db
      .select()
      .from(projectSubcontracts)
      .where(and(...conditions))
      .orderBy(desc(projectSubcontracts.createdAt))
      .limit(100);
  }),

  // Update subcontract fields
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      installerId: z.number().nullable().optional(),
      jobNumber: z.string().optional(),
      clientName: z.string().optional(),
      clientAccountNumber: z.string().nullable().optional(),
      constructionManager: z.string().optional(),
      subcontractorName: z.string().optional(),
      subcontractorPhone: z.string().optional(),
      siteAddress: z.string().optional(),
      subcontractSum: z.string().optional(),
      paymentSchedule: z.array(paymentMilestoneSchema).optional(),
      estimatedCommencement: z.string().nullable().optional(),
      estimatedCompletion: z.string().nullable().optional(),
      buildingFile: buildingFileSchema.optional(),
      inspections: inspectionSchema.optional(),
      otherContractors: otherContractorsSchema.optional(),
      electricalCabling: electricalCablingSchema.optional(),
      downpipes: downpipesSchema.optional(),
      flashingBySubcontractor: z.string().optional(),
      status: subcontractStatusSchema.optional(),
      contractSource: contractSourceSchema.optional(),
      onFileNotes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { id, estimatedCommencement, estimatedCompletion, ...rest } = input;
      const updateData: any = { ...rest };

      if (estimatedCommencement !== undefined) {
        updateData.estimatedCommencement = estimatedCommencement
          ? new Date(estimatedCommencement)
          : null;
      }
      if (estimatedCompletion !== undefined) {
        updateData.estimatedCompletion = estimatedCompletion
          ? new Date(estimatedCompletion)
          : null;
      }
      if (updateData.onFileNotes !== undefined) {
        updateData.onFileNotes = nullableText(updateData.onFileNotes);
      }
      if (updateData.status === "on_file") {
        updateData.contractSource = "manual_on_file";
        updateData.onFileAt = new Date();
      }

      await db
        .update(projectSubcontracts)
        .set(updateData)
        .where(subcontractScope(id, ctx.tenant!.id));

      return { success: true };
    }),

  markMilestonePaidBeforeSystem: protectedProcedure
    .input(z.object({
      subcontractId: z.number(),
      milestoneIndex: z.number().int().min(0),
      paid: z.boolean(),
      paidAt: z.string().nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(subcontractScope(input.subcontractId, ctx.tenant!.id))
        .limit(1);

      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontract not found" });

      const schedule = ([...((sc.paymentSchedule as PaymentMilestone[]) || [])] as PaymentMilestone[]);
      const milestone = schedule[input.milestoneIndex];
      if (!milestone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment milestone not found" });
      }

      const [existingClaim] = await db.select({ id: tradeInvoiceLines.id })
        .from(tradeInvoiceLines)
        .where(and(
          eq(tradeInvoiceLines.subcontractId, input.subcontractId),
          eq(tradeInvoiceLines.subcontractMilestoneIndex, input.milestoneIndex),
        ))
        .limit(1);

      if (input.paid && existingClaim) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This milestone already has an invoice claim. Use invoice review instead." });
      }

      schedule[input.milestoneIndex] = input.paid
        ? {
            ...milestone,
            paidBeforeSystem: true,
            paidBeforeSystemAt: input.paidAt || new Date().toISOString(),
            paidBeforeSystemBy: ctx.user.id,
            paidBeforeSystemNote: nullableText(input.note),
          }
        : {
            ...milestone,
            paidBeforeSystem: false,
            paidBeforeSystemAt: null,
            paidBeforeSystemBy: null,
            paidBeforeSystemNote: null,
          };

      await db.update(projectSubcontracts)
        .set({ paymentSchedule: schedule })
        .where(subcontractScope(input.subcontractId, ctx.tenant!.id));

      return { success: true };
    }),

  // Cancel an unsigned subcontract so a replacement can be issued.
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(subcontractScope(input.id, ctx.tenant!.id))
        .limit(1);
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontract not found" });
      if (isExecutedSubcontract(sc)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Executed or on-file subcontracts cannot be cancelled. Archive them instead." });
      }
      await db
        .update(projectSubcontracts)
        .set({ status: "cancelled" })
        .where(subcontractScope(input.id, ctx.tenant!.id));
      return { success: true };
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(projectSubcontracts)
        .set({ archivedAt: new Date() })
        .where(subcontractScope(input.id, ctx.tenant!.id));
      return { success: true };
    }),

  unarchive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(projectSubcontracts)
        .set({ archivedAt: null })
        .where(subcontractScope(input.id, ctx.tenant!.id));
      return { success: true };
    }),

  // Delete an unsigned, inactive subcontract.
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(subcontractScope(input.id, ctx.tenant!.id))
        .limit(1);
      if (!sc) throw new TRPCError({ code: "NOT_FOUND", message: "Subcontract not found" });
      if (isExecutedSubcontract(sc)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Executed or on-file subcontracts cannot be deleted. Archive them instead." });
      }
      if (sc.status === "sent") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cancel the sent subcontract before deleting it." });
      }
      const [claim] = await db
        .select({ id: tradeInvoiceLines.id })
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.subcontractId, input.id))
        .limit(1);
      if (claim) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subcontracts with invoice claims cannot be deleted. Archive them instead." });
      }
      await db
        .delete(projectSubcontracts)
        .where(subcontractScope(input.id, ctx.tenant!.id));
      return { success: true };
    }),

  // Generate PDF and send for signature via SignWell
  sendForSignature: protectedProcedure
    .input(z.object({
      id: z.number(),
      subcontractorEmail: z.string().email(),
      spanlineSignerName: z.string(),
      spanlineSignerEmail: z.string().email(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(subcontractScope(input.id, ctx.tenant!.id))
        .limit(1);

      if (!sc) throw new Error("Subcontract not found");
      if (sc.archivedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Archived subcontracts must be unarchived before sending" });
      }
      if (sc.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft subcontracts can be sent. Create another subcontract for extra work or replacement documents." });
      }

      const company = await getCompanyName(ctx.tenant!.id);

      // Generate HTML
      const html = generateSubcontractHtml({
        companyName: company.companyName,
        jobNumber: sc.jobNumber || "",
        clientName: sc.clientName || "",
        clientAccountNumber: sc.clientAccountNumber || "",
        constructionManager: sc.constructionManager || "",
        subcontractorName: sc.subcontractorName || "",
        subcontractorPhone: sc.subcontractorPhone || "",
        siteAddress: sc.siteAddress || "",
        subcontractSum: sc.subcontractSum || "0.00",
        paymentSchedule: (sc.paymentSchedule as PaymentMilestone[]) || [],
        estimatedCommencement: sc.estimatedCommencement ? sc.estimatedCommencement.toISOString() : null,
        estimatedCompletion: sc.estimatedCompletion ? sc.estimatedCompletion.toISOString() : null,
        buildingFile: (sc.buildingFile as any) || DEFAULT_BUILDING_FILE,
        inspections: (sc.inspections as any) || { footings: "N/A", slab: "N/A", plumbing: "N/A", framing: "N/A", roofing: "N/A", other: "N/A" },
        otherContractors: (sc.otherContractors as any) || { electrician: "N/A", plumber: "N/A", concreter: "N/A", flooring: "N/A", painter: "N/A" },
        electricalCabling: (sc.electricalCabling as any) || { wall: "N/A", roof: "N/A", fan: "N/A" },
        downpipes: (sc.downpipes as any) || { toGround: "N/A", toSpreader: "N/A", toExistingDP: "N/A", toStormwater: "N/A" },
        flashingBySubcontractor: sc.flashingBySubcontractor || "Yes",
      });

      // Convert HTML to PDF using built-in approach (base64 encode the HTML for SignWell)
      const htmlBase64 = Buffer.from(html).toString("base64");

      // Store the HTML as a PDF-ready document in S3 for reference
      const fileKey = `subcontracts/${sc.id}-${Date.now()}.html`;
      await storagePut(fileKey, Buffer.from(html), "text/html");

      // Send via SignWell with dual signature blocks
      const doc = await createDocument({
        name: `Project Subcontract - ${sc.clientName} - ${sc.subcontractorName}`,
        fileBase64: htmlBase64,
        fileName: `subcontract-${sc.jobNumber}.html`,
        recipients: [
          {
            name: sc.subcontractorName || "Subcontractor",
            email: input.subcontractorEmail,
            signing_order: 1,
          },
          {
            name: input.spanlineSignerName,
            email: input.spanlineSignerEmail,
            signing_order: 2,
          },
        ],
        subject: `Project Subcontract - Job ${sc.jobNumber} - ${sc.clientName}`,
        message: `Please review and sign the attached Project Subcontract for Job ${sc.jobNumber} at ${sc.siteAddress}.`,
        redirectUrl: buildTrustedAppUrl(ctx.req, "/construction", input.origin),
        metadata: {
          subcontract_id: String(sc.id),
          job_id: String(sc.jobId),
        },
      });

      // Update subcontract status and store SignWell document ID
      await db
        .update(projectSubcontracts)
        .set({
          status: "sent",
          signwellDocumentId: doc.id,
          sentAt: new Date(),
        })
        .where(subcontractScope(sc.id, ctx.tenant!.id));

      return { success: true, documentId: doc.id };
    }),

  // Generate HTML preview of the subcontract
  previewHtml: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(subcontractScope(input.id, ctx.tenant!.id))
        .limit(1);
      if (!sc) throw new Error("Subcontract not found");
      const company = await getCompanyName(ctx.tenant!.id);
      const html = generateSubcontractHtml({
        companyName: company.companyName,
        jobNumber: sc.jobNumber || "",
        clientName: sc.clientName || "",
        clientAccountNumber: sc.clientAccountNumber || "",
        constructionManager: sc.constructionManager || "",
        subcontractorName: sc.subcontractorName || "",
        subcontractorPhone: sc.subcontractorPhone || "",
        siteAddress: sc.siteAddress || "",
        subcontractSum: sc.subcontractSum || "0.00",
        paymentSchedule: (sc.paymentSchedule as PaymentMilestone[]) || [],
        estimatedCommencement: sc.estimatedCommencement ? sc.estimatedCommencement.toISOString() : null,
        estimatedCompletion: sc.estimatedCompletion ? sc.estimatedCompletion.toISOString() : null,
        buildingFile: (sc.buildingFile as any) || DEFAULT_BUILDING_FILE,
        inspections: (sc.inspections as any) || { footings: "N/A", slab: "N/A", plumbing: "N/A", framing: "N/A", roofing: "N/A", other: "N/A" },
        otherContractors: (sc.otherContractors as any) || { electrician: "N/A", plumber: "N/A", concreter: "N/A", flooring: "N/A", painter: "N/A" },
        electricalCabling: (sc.electricalCabling as any) || { wall: "N/A", roof: "N/A", fan: "N/A" },
        downpipes: (sc.downpipes as any) || { toGround: "N/A", toSpreader: "N/A", toExistingDP: "N/A", toStormwater: "N/A" },
        flashingBySubcontractor: sc.flashingBySubcontractor || "Yes",
      });
      return { html };
    }),

  // Get installers assigned to a job (for subcontractor selection)
  getJobInstallers: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const assignments = await db
        .select({
          id: constructionInstallers.id,
          name: constructionInstallers.name,
          phone: constructionInstallers.phone,
          email: constructionInstallers.email,
          role: constructionAssignments.role,
        })
        .from(constructionAssignments)
        .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
        .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
        .where(and(
          eq(constructionAssignments.jobId, input.jobId),
          eq(constructionJobs.tenantId, ctx.tenant!.id),
          eq(constructionInstallers.tenantId, ctx.tenant!.id),
        ));
      return assignments;
    }),

  // Get claim status for a subcontract's milestones (admin view)
  getClaimStatus: protectedProcedure
    .input(z.object({ subcontractId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const [subcontract] = await db.select({
        id: projectSubcontracts.id,
        paymentSchedule: projectSubcontracts.paymentSchedule,
        subcontractSum: projectSubcontracts.subcontractSum,
      })
        .from(projectSubcontracts)
        .where(subcontractScope(input.subcontractId, ctx.tenant!.id))
        .limit(1);
      if (!subcontract) return [];
      const claims = await db.select({
        subcontractMilestoneIndex: tradeInvoiceLines.subcontractMilestoneIndex,
        amount: tradeInvoiceLines.amount,
        approvalStatus: tradeInvoiceLines.approvalStatus,
        invoiceId: tradeInvoiceLines.invoiceId,
      })
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.subcontractId, input.subcontractId));

      const historicalClaims = ((subcontract as any).paymentSchedule as PaymentMilestone[] || [])
        .map((milestone, index) => {
          if (!milestone?.paidBeforeSystem) return null;
          const amount = milestone.usePercent
            ? ((milestone.percentOfTotal || 0) / 100) * moneyNumber(subcontract.subcontractSum)
            : Number(milestone.amountDollars || 0);
          return {
            subcontractMilestoneIndex: index,
            amount: amount.toFixed(2),
            approvalStatus: "paid",
            invoiceId: null,
            source: "historical",
            paidBeforeSystem: true,
            paidBeforeSystemAt: milestone.paidBeforeSystemAt || null,
            paidBeforeSystemNote: milestone.paidBeforeSystemNote || null,
          };
        })
        .filter(Boolean);

      return [
        ...historicalClaims,
        ...claims.map((claim: any) => ({ ...claim, source: "invoice" })),
      ];
    }),
});
