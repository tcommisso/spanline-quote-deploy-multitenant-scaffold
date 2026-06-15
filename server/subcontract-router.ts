import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
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
import { eq, desc } from "drizzle-orm";
import { generateSubcontractHtml } from "./subcontract-pdf";
import { createDocument } from "./signwell";
import { storagePut } from "./storage";
import { buildTrustedAppUrl } from "./_core/url";

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
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Fetch job details for pre-fill
      const [job] = await db
        .select()
        .from(constructionJobs)
        .where(eq(constructionJobs.id, input.jobId))
        .limit(1);

      if (!job) throw new Error("Job not found");

      // Fetch installer if specified
      let installer: any = null;
      if (input.installerId) {
        const [inst] = await db
          .select()
          .from(constructionInstallers)
          .where(eq(constructionInstallers.id, input.installerId))
          .limit(1);
        installer = inst;
      }

      const [result] = await db.insert(projectSubcontracts).values({
        jobId: input.jobId,
        installerId: input.installerId || null,
        jobNumber: job.quoteNumber || String(job.id),
        clientName: job.clientName,
        constructionManager: job.supervisorName || job.designAdviserName || "",
        subcontractorName: installer?.name || "",
        subcontractorPhone: installer?.phone || "",
        siteAddress: job.siteAddress || "",
        subcontractSum: "0.00",
        paymentSchedule: DEFAULT_PAYMENT_MILESTONES,
        buildingFile: DEFAULT_BUILDING_FILE,
        inspections: DEFAULT_INSPECTIONS,
        otherContractors: DEFAULT_OTHER_CONTRACTORS,
        electricalCabling: DEFAULT_ELECTRICAL_CABLING,
        downpipes: DEFAULT_DOWNPIPES,
        flashingBySubcontractor: "N/A",
        status: "draft",
        createdBy: ctx.user.id,
      });

      return { id: result.insertId };
    }),

  // Get a single subcontract by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(projectSubcontracts)
        .where(eq(projectSubcontracts.id, input.id))
        .limit(1);
      return row || null;
    }),

  // List subcontracts for a job
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(projectSubcontracts)
        .where(eq(projectSubcontracts.jobId, input.jobId))
        .orderBy(desc(projectSubcontracts.createdAt));
    }),

  // List all subcontracts
  listAll: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(projectSubcontracts)
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
      status: z.enum(["draft", "sent", "signed", "cancelled"]).optional(),
    }))
    .mutation(async ({ input }) => {
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
        .where(eq(projectSubcontracts.id, id));

      return { success: true };
    }),

  // Delete a subcontract
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .delete(projectSubcontracts)
        .where(eq(projectSubcontracts.id, input.id));
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
        .where(eq(projectSubcontracts.id, input.id))
        .limit(1);

      if (!sc) throw new Error("Subcontract not found");

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
        .where(eq(projectSubcontracts.id, sc.id));

      return { success: true, documentId: doc.id };
    }),

  // Generate HTML preview of the subcontract
  previewHtml: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(eq(projectSubcontracts.id, input.id))
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
    .query(async ({ input }) => {
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
        .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
        .where(eq(constructionAssignments.jobId, input.jobId));
      return assignments;
    }),

  // Get claim status for a subcontract's milestones (admin view)
  getClaimStatus: protectedProcedure
    .input(z.object({ subcontractId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
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
