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
  constructionInstallers,
  constructionAssignments,
  tradeInvoiceLines,
  type PaymentMilestone,
  type BuildingFileChecklist,
  type InspectionChecklist,
  type OtherContractorsChecklist,
  type ElectricalCablingChecklist,
  type DownpipesChecklist,
} from "../drizzle/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { generateSubcontractHtml } from "./subcontract-pdf";
import { createDocument } from "./signwell";
import { storagePut } from "./storage";
import { buildTrustedAppUrl } from "./_core/url";

function subcontractScope(id: number, tenantId: number) {
  return and(eq(projectSubcontracts.id, id), eq(projectSubcontracts.tenantId, tenantId));
}

function jobScope(id: number, tenantId: number) {
  return and(eq(constructionJobs.id, id), eq(constructionJobs.tenantId, tenantId));
}

function installerScope(id: number, tenantId: number) {
  return and(eq(constructionInstallers.id, id), eq(constructionInstallers.tenantId, tenantId));
}

// ─── Default Payment Milestones ──────────────────────────────────────────────
export const DEFAULT_PAYMENT_MILESTONES: PaymentMilestone[] = [
  { label: "Demo", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Week of Commencement", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Week of Completion of Deck", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Week of Frame Erected", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Week of Roof Installed", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Week of Completion", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Week of Windows Installation", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Retention for 15 days", amountDollars: null, percentOfTotal: null, usePercent: false },
  { label: "Travel allowance", amountDollars: null, percentOfTotal: null, usePercent: true },
];

export const DEFAULT_BUILDING_FILE: BuildingFileChecklist = {
  plans: "N/A",
  materialsList: "N/A",
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

// ─── Router ──────────────────────────────────────────────────────────────────
export const subcontractRouter = router({
  // Create a new subcontract (pre-filled from job data)
  create: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      installerId: z.number().optional(),
      sourceSubcontractId: z.number().optional(),
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

      const [result] = await db.insert(projectSubcontracts).values({
        tenantId: ctx.tenant!.id,
        jobId: input.jobId,
        installerId: selectedInstallerId,
        jobNumber: sourceSubcontract?.jobNumber || job.quoteNumber || String(job.id),
        clientName: sourceSubcontract?.clientName || job.clientName,
        constructionManager: sourceSubcontract?.constructionManager || job.supervisorName || job.designAdviserName || "",
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
        flashingBySubcontractor: sourceSubcontract?.flashingBySubcontractor || "N/A",
        status: "draft",
        createdBy: ctx.user.id,
      });

      return { id: result.insertId };
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
      return row || null;
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
      status: z.enum(["draft", "sent", "signed", "cancelled", "declined"]).optional(),
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

      await db
        .update(projectSubcontracts)
        .set(updateData)
        .where(subcontractScope(id, ctx.tenant!.id));

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
      if (sc.status === "signed" || sc.signedAt || sc.pdfUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Signed subcontracts cannot be cancelled" });
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
      if (sc.status === "signed" || sc.signedAt || sc.pdfUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Signed subcontracts cannot be deleted. Archive them instead." });
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

      // Generate HTML
      const html = generateSubcontractHtml({
        jobNumber: sc.jobNumber || "",
        clientName: sc.clientName || "",
        constructionManager: sc.constructionManager || "",
        subcontractorName: sc.subcontractorName || "",
        subcontractorPhone: sc.subcontractorPhone || "",
        siteAddress: sc.siteAddress || "",
        subcontractSum: sc.subcontractSum || "0.00",
        paymentSchedule: (sc.paymentSchedule as PaymentMilestone[]) || [],
        estimatedCommencement: sc.estimatedCommencement ? sc.estimatedCommencement.toISOString() : null,
        estimatedCompletion: sc.estimatedCompletion ? sc.estimatedCompletion.toISOString() : null,
        buildingFile: (sc.buildingFile as any) || { plans: "N/A", materialsList: "N/A", approvals: "N/A" },
        inspections: (sc.inspections as any) || { footings: "N/A", slab: "N/A", plumbing: "N/A", framing: "N/A", roofing: "N/A", other: "N/A" },
        otherContractors: (sc.otherContractors as any) || { electrician: "N/A", plumber: "N/A", concreter: "N/A", flooring: "N/A", painter: "N/A" },
        electricalCabling: (sc.electricalCabling as any) || { wall: "N/A", roof: "N/A", fan: "N/A" },
        downpipes: (sc.downpipes as any) || { toGround: "N/A", toSpreader: "N/A", toExistingDP: "N/A", toStormwater: "N/A" },
        flashingBySubcontractor: sc.flashingBySubcontractor || "N/A",
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
      const html = generateSubcontractHtml({
        jobNumber: sc.jobNumber || "",
        clientName: sc.clientName || "",
        constructionManager: sc.constructionManager || "",
        subcontractorName: sc.subcontractorName || "",
        subcontractorPhone: sc.subcontractorPhone || "",
        siteAddress: sc.siteAddress || "",
        subcontractSum: sc.subcontractSum || "0.00",
        paymentSchedule: (sc.paymentSchedule as PaymentMilestone[]) || [],
        estimatedCommencement: sc.estimatedCommencement ? sc.estimatedCommencement.toISOString() : null,
        estimatedCompletion: sc.estimatedCompletion ? sc.estimatedCompletion.toISOString() : null,
        buildingFile: (sc.buildingFile as any) || { plans: "N/A", materialsList: "N/A", approvals: "N/A" },
        inspections: (sc.inspections as any) || { footings: "N/A", slab: "N/A", plumbing: "N/A", framing: "N/A", roofing: "N/A", other: "N/A" },
        otherContractors: (sc.otherContractors as any) || { electrician: "N/A", plumber: "N/A", concreter: "N/A", flooring: "N/A", painter: "N/A" },
        electricalCabling: (sc.electricalCabling as any) || { wall: "N/A", roof: "N/A", fan: "N/A" },
        downpipes: (sc.downpipes as any) || { toGround: "N/A", toSpreader: "N/A", toExistingDP: "N/A", toStormwater: "N/A" },
        flashingBySubcontractor: sc.flashingBySubcontractor || "N/A",
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
      const [subcontract] = await db.select({ id: projectSubcontracts.id })
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
      return claims;
    }),
});
