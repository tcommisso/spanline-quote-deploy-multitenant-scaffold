/**
 * Site Induction Router
 * Handles CRUD, submission, PDF generation, and email notification
 * for Workplace Specific Induction Checklists
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import {
  createSiteInduction,
  getSiteInductionById,
  getSiteInductionsByJob,
  getSiteInductionsByInstaller,
  getSiteInductionByJobAndInstaller,
  updateSiteInduction,
  deleteSiteInduction,
  getAssignedInstallersForJob,
  getInductionFormConfig,
  upsertInductionFormConfig,
} from "./db";
import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import { constructionJobs, constructionInstallers, siteInductions, users } from "../drizzle/schema";
import { sendNotificationEmail } from "./email";
import { storagePut } from "./storage";
import { resolveStorageUrlForPortal } from "./_core/storageSignedUrl";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ─── Default Checklist Items ────────────────────────────────────────────────
const DEFAULT_CERTIFICATES = [
  { name: "General Induction Training (White Card)", expiryDate: "", status: "" },
  { name: "Asbestos Awareness Card", expiryDate: "", status: "" },
];

const DEFAULT_SITE_CHECKLIST = [
  { item: "WHS Management Plan (given by office staff)", status: "Y" },
  { item: "Site Safety Rules / Procedures", status: "Y" },
  { item: "Emergency Management Plan (required if works over $250K)", status: "Y" },
  { item: "Site Specific Hazards / Risk Control Measures", status: "Y" },
  { item: "Incident / Hazard / Injury Reporting", status: "Y" },
  { item: "Agree to use local Amenities", status: "Y" },
  { item: "High Risk Construction Work / Safe Work Method Statements", status: "Y" },
  { item: "Housekeeping", status: "Y" },
  { item: "Testing / Tagging", status: "Y" },
  { item: "Safety Data Sheets (given by office staff)", status: "Y" },
  { item: "PPE Requirements", status: "Y" },
];

const SITE_RULES = [
  "Keep site clear of debris and rubbish at all times.",
  "Use the right ladder or platform for the job — no makeshift scaffolding.",
  "All electrical equipment must be checked and tagged every 3 months.",
  "Earth Leakage Circuit Breakers (ELCB/RCD) must be used with all electrical equipment.",
  "Personal Protective Equipment (PPE) must be worn as required — hard hat, safety glasses, steel-cap boots, high-vis vest.",
  "Safety Data Sheets (SDS) must be available onsite for all hazardous substances.",
  "Clean the site daily before leaving.",
  "Disconnect all unattended electrical equipment.",
  "Keep hydrated — drink water regularly, especially in hot weather.",
  "No electrical work or use of electrical equipment in wet weather conditions.",
];

const EMERGENCY_PROCEDURE = [
  "Mobile phone or radio must be available onsite at all times.",
  "In an emergency, dial 000 (Police, Fire, Ambulance).",
  "Ensure the safety of yourself and others before attempting any rescue.",
  "Only fight a fire if it is safe to do so and you have been trained.",
  "Report all incidents, injuries, and near-misses to the Altaspan outlet immediately.",
];

// ─── Schemas ────────────────────────────────────────────────────────────────
const certificateSchema = z.object({
  name: z.string(),
  expiryDate: z.string().optional().default(""),
  status: z.enum(["Y", "N", "NA", ""]).default(""),
});

const siteChecklistItemSchema = z.object({
  item: z.string(),
  status: z.enum(["Y", "N", "NA", ""]).default(""),
});

// ─── PDF Generation ─────────────────────────────────────────────────────────
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

function drawWrappedText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  color = rgb(0, 0, 0)
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, size);
    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size + 2;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size + 2;
  }
  return currentY;
}

async function generateInductionPdf(induction: any, jobData: any): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 9;
  const headerSize = 12;
  const subHeaderSize = 10;

  // ─── Page 1: Checklist ────────────────────────────────────────────
  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  // Title
  page.drawText("WORKPLACE SPECIFIC INDUCTION CHECKLIST", {
    x: MARGIN, y, size: 14, font: fontBold, color: rgb(0, 0, 0),
  });
  y -= 18;
  page.drawText("Construction Project", {
    x: MARGIN, y, size: headerSize, font, color: rgb(0.3, 0.3, 0.3),
  });
  y -= 25;

  // PCBU / Site
  page.drawText("PCBU:", { x: MARGIN, y, size: subHeaderSize, font: fontBold });
  page.drawText("Altaspan", { x: MARGIN + 40, y, size: subHeaderSize, font });
  y -= 15;
  page.drawText("Site Address:", { x: MARGIN, y, size: subHeaderSize, font: fontBold });
  y = drawWrappedText(page, jobData?.siteAddress || "N/A", MARGIN + 80, y, CONTENT_WIDTH - 80, font, subHeaderSize);
  y -= 10;

  // Contractor Details
  page.drawText("CONTRACTOR DETAILS", { x: MARGIN, y, size: subHeaderSize, font: fontBold, color: rgb(0.1, 0.3, 0.6) });
  y -= 15;
  const contractorFields = [
    ["Name:", induction.contractorName || ""],
    ["Phone:", induction.contractorPhone || ""],
    ["Email:", induction.contractorEmail || ""],
    ["Medical Conditions / Allergies:", induction.medicalConditions || "None declared"],
  ];
  for (const [label, value] of contractorFields) {
    page.drawText(label, { x: MARGIN, y, size: fontSize, font: fontBold });
    page.drawText(value, { x: MARGIN + 170, y, size: fontSize, font });
    y -= 14;
  }
  y -= 8;

  // Certificates
  page.drawText("CERTIFICATES / LICENCES", { x: MARGIN, y, size: subHeaderSize, font: fontBold, color: rgb(0.1, 0.3, 0.6) });
  y -= 15;
  // Table header
  page.drawText("Certificate", { x: MARGIN, y, size: fontSize, font: fontBold });
  page.drawText("Expiry", { x: MARGIN + 280, y, size: fontSize, font: fontBold });
  page.drawText("Y/N/NA", { x: MARGIN + 400, y, size: fontSize, font: fontBold });
  y -= 3;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 12;
  const certs = (induction.certificates as any[]) || [];
  for (const cert of certs) {
    page.drawText(cert.name || "", { x: MARGIN, y, size: fontSize, font });
    page.drawText(cert.expiryDate || "", { x: MARGIN + 280, y, size: fontSize, font });
    page.drawText(cert.status || "", { x: MARGIN + 410, y, size: fontSize, font: fontBold });
    y -= 14;
  }
  y -= 8;

  // Site Checklist
  page.drawText("ISSUES SPECIFIC TO THIS SITE", { x: MARGIN, y, size: subHeaderSize, font: fontBold, color: rgb(0.1, 0.3, 0.6) });
  y -= 15;
  page.drawText("Item", { x: MARGIN, y, size: fontSize, font: fontBold });
  page.drawText("Y/N/NA", { x: MARGIN + 400, y, size: fontSize, font: fontBold });
  y -= 3;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 12;
  const checklist = (induction.siteChecklist as any[]) || [];
  for (const item of checklist) {
    if (y < MARGIN + 40) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN;
    }
    y = drawWrappedText(page, item.item || "", MARGIN, y, 340, font, fontSize);
    page.drawText(item.status || "", { x: MARGIN + 410, y: y + fontSize + 2, size: fontSize, font: fontBold });
    y -= 6;
  }

  // ─── Page 2: Site Rules ───────────────────────────────────────────
  page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  y = A4_HEIGHT - MARGIN;

  page.drawText("SITE RULES", { x: MARGIN, y, size: headerSize, font: fontBold, color: rgb(0.1, 0.3, 0.6) });
  y -= 20;
  for (const rule of SITE_RULES) {
    y = drawWrappedText(page, `• ${rule}`, MARGIN, y, CONTENT_WIDTH, font, fontSize);
    y -= 6;
  }
  y -= 10;

  page.drawText("EMERGENCY PROCEDURE", { x: MARGIN, y, size: headerSize, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
  y -= 20;
  for (const proc of EMERGENCY_PROCEDURE) {
    y = drawWrappedText(page, `• ${proc}`, MARGIN, y, CONTENT_WIDTH, font, fontSize);
    y -= 6;
  }
  y -= 20;

  // Acknowledgement
  page.drawText("ACKNOWLEDGEMENT", { x: MARGIN, y, size: subHeaderSize, font: fontBold, color: rgb(0.1, 0.3, 0.6) });
  y -= 18;
  page.drawText("I acknowledge that I have been inducted on the above site-specific requirements.", {
    x: MARGIN, y, size: fontSize, font,
  });
  y -= 25;

  // Person Being Inducted
  page.drawText("Person Being Inducted:", { x: MARGIN, y, size: fontSize, font: fontBold });
  y -= 15;
  page.drawText(`Name: ${induction.contractorName || ""}`, { x: MARGIN, y, size: fontSize, font });
  y -= 14;
  const completedDate = induction.completedAt
    ? new Date(induction.completedAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })
    : "Pending";
  page.drawText(`Date: ${completedDate}`, { x: MARGIN, y, size: fontSize, font });
  y -= 25;

  // Inducted By
  page.drawText("Inducted By:", { x: MARGIN, y, size: fontSize, font: fontBold });
  y -= 15;
  page.drawText(`Name: ${induction.inductedByName || ""}`, { x: MARGIN, y, size: fontSize, font });
  y -= 14;
  page.drawText(`Date: ${completedDate}`, { x: MARGIN, y, size: fontSize, font });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── Router ─────────────────────────────────────────────────────────────────
export const siteInductionRouter = router({
  // List all inductions for a job (admin view)
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const inductions = await getSiteInductionsByJob(input.jobId, ctx.tenant!.id);
      return inductions;
    }),

  // Get assigned trades for a job with their induction status
  getJobInductionStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const [assignedTrades, inductions] = await Promise.all([
        getAssignedInstallersForJob(input.jobId, ctx.tenant!.id),
        getSiteInductionsByJob(input.jobId, ctx.tenant!.id),
      ]);
      const inductionMap = new Map(inductions.map(i => [i.installerId, i]));
      return assignedTrades.map(trade => ({
        ...trade,
        induction: inductionMap.get(trade.installerId) || null,
        inductionStatus: inductionMap.get(trade.installerId)?.status || "not_started",
      }));
    }),

  // Get a single induction
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const induction = await getSiteInductionById(input.id, ctx.tenant!.id);
      if (!induction) throw new TRPCError({ code: "NOT_FOUND", message: "Induction not found" });
      return induction;
    }),

  // Create a pending induction for a trade on a job
  create: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      installerId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check if one already exists
      const existing = await getSiteInductionByJobAndInstaller(input.jobId, input.installerId, ctx.tenant!.id);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "An induction already exists for this trade on this job" });
      }
      // Get installer details
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [installer] = await db.select().from(constructionInstallers)
        .where(and(eq(constructionInstallers.id, input.installerId), eq(constructionInstallers.tenantId, ctx.tenant!.id))).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Installer not found" });

      const id = await createSiteInduction({
        jobId: input.jobId,
        installerId: input.installerId,
        contractorName: installer.name,
        contractorPhone: installer.phone || undefined,
        contractorEmail: installer.email || undefined,
        certificates: DEFAULT_CERTIFICATES,
        siteChecklist: DEFAULT_SITE_CHECKLIST,
        status: "pending",
      });
      return { id };
    }),

  // Create inductions for all assigned trades on a job
  createForAllTrades: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const assignedTrades = await getAssignedInstallersForJob(input.jobId, ctx.tenant!.id);
      const existingInductions = await getSiteInductionsByJob(input.jobId, ctx.tenant!.id);
      const existingInstallerIds = new Set(existingInductions.map(i => i.installerId));
      let created = 0;
      for (const trade of assignedTrades) {
        if (!existingInstallerIds.has(trade.installerId)) {
          const db = await getDb();
          if (!db) continue;
          const [installer] = await db.select().from(constructionInstallers)
            .where(and(eq(constructionInstallers.id, trade.installerId), eq(constructionInstallers.tenantId, ctx.tenant!.id))).limit(1);
          if (!installer) continue;
          await createSiteInduction({
            jobId: input.jobId,
            installerId: trade.installerId,
            contractorName: installer.name,
            contractorPhone: installer.phone || undefined,
            contractorEmail: installer.email || undefined,
            certificates: DEFAULT_CERTIFICATES,
            siteChecklist: DEFAULT_SITE_CHECKLIST,
            status: "pending",
          });
          created++;
        }
      }
      return { created };
    }),

  // Submit / complete an induction (from admin or trade portal)
  submit: protectedProcedure
    .input(z.object({
      id: z.number(),
      medicalConditions: z.string().optional(),
      certificates: z.array(certificateSchema),
      siteChecklist: z.array(siteChecklistItemSchema),
    }))
    .mutation(async ({ input, ctx }) => {
      const induction = await getSiteInductionById(input.id, ctx.tenant!.id);
      if (!induction) throw new TRPCError({ code: "NOT_FOUND", message: "Induction not found" });
      if (induction.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This induction has already been completed" });
      }
      const now = new Date();
      await updateSiteInduction(input.id, {
        medicalConditions: input.medicalConditions || null,
        certificates: input.certificates,
        siteChecklist: input.siteChecklist,
        status: "completed",
        completedAt: now,
        inductedByName: ctx.user?.name || "System",
        inductedByUserId: ctx.user?.id,
      }, ctx.tenant!.id);

      // Generate PDF
      const updated = await getSiteInductionById(input.id, ctx.tenant!.id);
      if (updated) {
        const db = await getDb();
        if (db) {
          const [job] = await db.select().from(constructionJobs)
            .where(and(eq(constructionJobs.id, updated.jobId), eq(constructionJobs.tenantId, ctx.tenant!.id))).limit(1);
          try {
            const pdfBuffer = await generateInductionPdf(updated, job);
            const pdfKey = `inductions/induction-${input.id}-${Date.now()}.pdf`;
            const { url } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
            await updateSiteInduction(input.id, { pdfUrl: url }, ctx.tenant!.id);
          } catch (err) {
            console.error("[SiteInduction] PDF generation failed:", err);
          }

          // Notify supervisor
          if (job?.supervisorId) {
            const [supervisor] = await db.select().from(users)
              .where(eq(users.id, job.supervisorId)).limit(1);
            if (supervisor?.email) {
              try {
                await sendNotificationEmail({
                  to: supervisor.email,
                  subject: `Site Induction Completed - ${updated.contractorName} - ${job.clientName || "Job"}`,
                  htmlBody: `
                    <h2>Site Induction Completed</h2>
                    <p><strong>${updated.contractorName}</strong> has completed their site induction for:</p>
                    <p><strong>Job:</strong> ${job.clientName || "N/A"}<br/>
                    <strong>Site:</strong> ${job.siteAddress || "N/A"}<br/>
                    <strong>Completed:</strong> ${now.toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</p>
                  `,
                });
                await updateSiteInduction(input.id, { notifiedSupervisorAt: now }, ctx.tenant!.id);
              } catch (err) {
                console.error("[SiteInduction] Supervisor notification failed:", err);
              }
            }
          }
        }
      }
      return { success: true, completedAt: now.toISOString() };
    }),

  // Trade portal: submit induction (uses trade portal auth context)
  tradePortalSubmit: publicProcedure
    .input(z.object({
      id: z.number(),
      medicalConditions: z.string().optional(),
      certificates: z.array(certificateSchema),
      siteChecklist: z.array(siteChecklistItemSchema),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify trade portal access
      if (!ctx.tradePortalAccess) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Trade portal session required" });
      }
      const tenantId = ctx.tradePortalAccess.tenantId ?? undefined;
      const induction = await getSiteInductionById(input.id, tenantId);
      if (!induction) throw new TRPCError({ code: "NOT_FOUND", message: "Induction not found" });
      if (induction.installerId !== ctx.tradePortalAccess.installerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This induction belongs to a different trade" });
      }
      if (induction.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This induction has already been completed" });
      }

      const now = new Date();
      await updateSiteInduction(input.id, {
        medicalConditions: input.medicalConditions || null,
        certificates: input.certificates,
        siteChecklist: input.siteChecklist,
        status: "completed",
        completedAt: now,
        inductedByName: induction.contractorName,
      }, tenantId);

      // Generate PDF
      const updated = await getSiteInductionById(input.id, tenantId);
      if (updated) {
        const db = await getDb();
        if (db) {
          const [job] = await db.select().from(constructionJobs)
            .where(tenantId
              ? and(eq(constructionJobs.id, updated.jobId), eq(constructionJobs.tenantId, tenantId))
              : eq(constructionJobs.id, updated.jobId)).limit(1);
          try {
            const pdfBuffer = await generateInductionPdf(updated, job);
            const pdfKey = `inductions/induction-${input.id}-${Date.now()}.pdf`;
            const { url } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
            await updateSiteInduction(input.id, { pdfUrl: url }, tenantId);
          } catch (err) {
            console.error("[SiteInduction] PDF generation failed:", err);
          }

          // Notify supervisor
          if (job?.supervisorId) {
            const [supervisor] = await db.select().from(users)
              .where(eq(users.id, job.supervisorId)).limit(1);
            if (supervisor?.email) {
              try {
                await sendNotificationEmail({
                  to: supervisor.email,
                  subject: `Site Induction Completed - ${updated.contractorName} - ${job.clientName || "Job"}`,
                  htmlBody: `
                    <h2>Site Induction Completed</h2>
                    <p><strong>${updated.contractorName}</strong> has completed their site induction for:</p>
                    <p><strong>Job:</strong> ${job.clientName || "N/A"}<br/>
                    <strong>Site:</strong> ${job.siteAddress || "N/A"}<br/>
                    <strong>Completed:</strong> ${now.toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</p>
                  `,
                });
                await updateSiteInduction(input.id, { notifiedSupervisorAt: now }, tenantId);
              } catch (err) {
                console.error("[SiteInduction] Supervisor notification failed:", err);
              }
            }
          }
        }
      }
      return { success: true, completedAt: now.toISOString() };
    }),

  // Trade portal: get my inductions
  tradePortalMyInductions: publicProcedure
    .query(async ({ ctx }) => {
      if (!ctx.tradePortalAccess) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Trade portal session required" });
      }
      const tenantId = ctx.tradePortalAccess.tenantId ?? undefined;
      const inductions = await getSiteInductionsByInstaller(ctx.tradePortalAccess.installerId, tenantId);
      // Enrich with job data
      const db = await getDb();
      if (!db) return [];
      const enriched = [];
      for (const ind of inductions) {
        const [job] = await db.select({
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          quoteNumber: constructionJobs.quoteNumber,
        }).from(constructionJobs)
          .where(tenantId
            ? and(eq(constructionJobs.id, ind.jobId), eq(constructionJobs.tenantId, tenantId))
            : eq(constructionJobs.id, ind.jobId))
          .limit(1);
        enriched.push({
          ...ind,
          pdfUrl: await resolveStorageUrlForPortal(ind.pdfUrl),
          job: job || null,
        });
      }
      return enriched;
    }),

  // Send reminder email to a trade
  sendReminder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const induction = await getSiteInductionById(input.id, ctx.tenant!.id);
      if (!induction) throw new TRPCError({ code: "NOT_FOUND", message: "Induction not found" });
      if (induction.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Induction already completed" });
      }
      if (!induction.contractorEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No email address for this contractor" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [job] = await db.select().from(constructionJobs)
        .where(and(eq(constructionJobs.id, induction.jobId), eq(constructionJobs.tenantId, ctx.tenant!.id))).limit(1);

      await sendNotificationEmail({
        to: induction.contractorEmail,
        subject: `Site Induction Required - ${job?.clientName || "Construction Job"}`,
        htmlBody: `
          <h2>Site Induction Required</h2>
          <p>Hi ${induction.contractorName},</p>
          <p>You are required to complete a Workplace Specific Induction Checklist for the following job:</p>
          <p><strong>Job:</strong> ${job?.clientName || "N/A"}<br/>
          <strong>Site:</strong> ${job?.siteAddress || "N/A"}</p>
          <p>Please log in to the Trade Portal to complete your induction.</p>
          <p>Regards,<br/>Altaspan</p>
        `,
      });

      await updateSiteInduction(input.id, { reminderSentAt: new Date() }, ctx.tenant!.id);
      return { success: true };
    }),

  // Download / generate PDF for a completed induction
  generatePdf: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const induction = await getSiteInductionById(input.id, ctx.tenant!.id);
      if (!induction) throw new TRPCError({ code: "NOT_FOUND", message: "Induction not found" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [job] = await db.select().from(constructionJobs)
        .where(and(eq(constructionJobs.id, induction.jobId), eq(constructionJobs.tenantId, ctx.tenant!.id))).limit(1);

      const pdfBuffer = await generateInductionPdf(induction, job);
      const pdfKey = `inductions/induction-${input.id}-${Date.now()}.pdf`;
      const { url } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      await updateSiteInduction(input.id, { pdfUrl: url }, ctx.tenant!.id);
      return { pdfUrl: url };
    }),

  // Delete an induction (admin only)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deleteSiteInduction(input.id, ctx.tenant!.id);
      return { success: true };
    }),

  // Get site rules and emergency procedures (dynamic from config or fallback to defaults)
  getSiteRules: publicProcedure.query(async ({ ctx }) => {
    const config = await getInductionFormConfig(ctx.tradePortalAccess?.tenantId ?? ctx.tenant?.id ?? undefined);
    return {
      siteRules: config?.siteRules
        ? config.siteRules.split("\n").filter((l: string) => l.trim())
        : SITE_RULES,
      emergencyProcedure: config?.emergencyProcedures
        ? config.emergencyProcedures.split("\n").filter((l: string) => l.trim())
        : EMERGENCY_PROCEDURE,
    };
  }),

  // Get default checklist items (dynamic from config or fallback to defaults)
  getDefaults: publicProcedure.query(async ({ ctx }) => {
    const config = await getInductionFormConfig(ctx.tradePortalAccess?.tenantId ?? ctx.tenant?.id ?? undefined);
    return {
      certificates: config?.certificates
        ? (config.certificates as string[]).map(name => ({ name, expiryDate: "", status: "" }))
        : DEFAULT_CERTIFICATES,
      siteChecklist: config?.checklistItems
        ? (config.checklistItems as string[]).map(item => ({ item, status: "Y" }))
        : DEFAULT_SITE_CHECKLIST,
    };
  }),

  // ─── Admin: Form Configuration ─────────────────────────────────────
  getFormConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await getInductionFormConfig(ctx.tenant!.id);
    if (!config) {
      // Return defaults
      return {
        certificates: DEFAULT_CERTIFICATES.map(c => c.name),
        checklistItems: DEFAULT_SITE_CHECKLIST.map(c => c.item),
        siteRules: SITE_RULES.join("\n"),
        emergencyProcedures: EMERGENCY_PROCEDURE.join("\n"),
      };
    }
    return {
      certificates: (config.certificates as string[]) || DEFAULT_CERTIFICATES.map(c => c.name),
      checklistItems: (config.checklistItems as string[]) || DEFAULT_SITE_CHECKLIST.map(c => c.item),
      siteRules: config.siteRules || SITE_RULES.join("\n"),
      emergencyProcedures: config.emergencyProcedures || EMERGENCY_PROCEDURE.join("\n"),
    };
  }),

  updateFormConfig: protectedProcedure
    .input(z.object({
      certificates: z.array(z.string()).min(1),
      checklistItems: z.array(z.string()).min(1),
      siteRules: z.string().min(1),
      emergencyProcedures: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      await upsertInductionFormConfig({
        certificates: input.certificates,
        checklistItems: input.checklistItems,
        siteRules: input.siteRules,
        emergencyProcedures: input.emergencyProcedures,
        updatedBy: ctx.user?.id,
      }, ctx.tenant!.id);
      return { success: true };
    }),
});
