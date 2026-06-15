/**
 * Construction Documents Router
 * Handles Notice of Practical Completion and Contract Variations
 */
import { z } from "zod";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as signwell from "./signwell";
import { storagePut } from "./storage";
import { sendNotificationEmail } from "./email";
import { notifyOwner } from "./_core/notification";
import { generateNpcPdf, generateVariationPdf } from "./construction-pdf";
import { getDb } from "./db";
import { constructionJobs } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDatabase() {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return database;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireJobAccess(database: any, ctx: any, jobId: number) {
  const [job] = await database.select({ id: constructionJobs.id })
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

async function getNpcForTenant(ctx: any, npcId: number) {
  const npc = await db.getPracticalCompletionNoticeById(npcId);
  if (!npc) throw new Error("NPC not found");
  const database = await requireDatabase();
  await requireJobAccess(database, ctx, npc.jobId);
  return npc;
}

async function getVariationForTenant(ctx: any, variationId: number) {
  const variation = await db.getVariationById(variationId);
  if (!variation) throw new Error("Variation not found");
  const database = await requireDatabase();
  await requireJobAccess(database, ctx, variation.constructionJobId);
  return variation;
}

export const constructionDocsRouter = router({
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTICE OF PRACTICAL COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════

  /** List all NPCs for a construction job */
  listNpc: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const database = await requireDatabase();
      await requireJobAccess(database, ctx, input.jobId);
      return db.getPracticalCompletionNoticesByJob(input.jobId);
    }),

  /** Get a single NPC by ID */
  getNpc: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return getNpcForTenant(ctx, input.id);
    }),

  /** Create a new NPC, generate PDF, and optionally create defect tasks */
  createNpc: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      ownerName: z.string(),
      ownerAddress: z.string().optional(),
      jobNumber: z.string().optional(),
      defects: z.array(z.object({
        description: z.string(),
        id: z.string(),
      })).default([]),
      signatoryTitle: z.string().optional(),
      // Builder details (from company settings)
      builderCompanyName: z.string().optional(),
      builderTradingAs: z.string().optional(),
      builderAddress: z.string().optional(),
      builderAbn: z.string().optional(),
      builderLicenceAct: z.string().optional(),
      builderLicenceNsw: z.string().optional(),
      builderPhone: z.string().optional(),
      builderAccountsEmail: z.string().optional(),
      builderEmail: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await requireDatabase();
      await requireJobAccess(database, ctx, input.jobId);
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });

      // Generate PDF
      const pdfBuffer = await generateNpcPdf({
        date: dateStr,
        jobNumber: input.jobNumber,
        ownerName: input.ownerName,
        ownerAddress: input.ownerAddress,
        builder: {
          companyName: input.builderCompanyName,
          tradingAs: input.builderTradingAs,
          address: input.builderAddress,
          abn: input.builderAbn,
          licenceAct: input.builderLicenceAct,
          licenceNsw: input.builderLicenceNsw,
          phone: input.builderPhone,
          accountsEmail: input.builderAccountsEmail,
          email: input.builderEmail,
        },
        defects: input.defects,
        signatoryName: ctx.user.name || "Authorised Representative",
        signatoryTitle: input.signatoryTitle,
      });

      // Upload PDF to S3
      const fileKey = `npc/${input.jobId}-npc-${Date.now()}.pdf`;
      const { url: pdfUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Save to database
      const npcId = await db.createPracticalCompletionNotice({
        jobId: input.jobId,
        noticeDate: now,
        ownerName: input.ownerName,
        ownerAddress: input.ownerAddress,
        jobNumber: input.jobNumber,
        builderCompanyName: input.builderCompanyName,
        builderTradingAs: input.builderTradingAs,
        builderAddress: input.builderAddress,
        builderAbn: input.builderAbn,
        builderLicenceAct: input.builderLicenceAct,
        builderLicenceNsw: input.builderLicenceNsw,
        builderPhone: input.builderPhone,
        builderAccountsEmail: input.builderAccountsEmail,
        builderEmail: input.builderEmail,
        defects: input.defects,
        signatoryName: ctx.user.name || "Authorised Representative",
        signatoryTitle: input.signatoryTitle,
        pdfUrl,
        createdBy: ctx.user.id,
      });

      // Create kanban tasks for each defect
      const taskIds: number[] = [];
      for (const defect of input.defects) {
        const taskId = await db.createKanbanTask({
          jobId: input.jobId,
          title: `[NPC Defect] ${defect.description}`,
          description: `Defect identified in Notice of Practical Completion (NPC #${npcId}). Must be rectified within 14 business days.`,
          column: "todo",
          priority: "high",
          createdBy: ctx.user.id,
        });
        taskIds.push(taskId);
      }

      return { id: npcId, pdfUrl, defectTaskIds: taskIds };
    }),

  /** Send NPC via email */
  sendNpc: protectedProcedure
    .input(z.object({
      npcId: z.number(),
      recipientEmail: z.string().email(),
      subject: z.string().optional(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const npc = await getNpcForTenant(ctx, input.npcId);
      if (!npc.pdfUrl) throw new Error("NPC PDF not generated");

      // Download PDF from S3 to get base64
      const pdfResp = await fetch(npc.pdfUrl);
      const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString("base64");

      const subject = input.subject || `Notice of Practical Completion - ${npc.ownerName}`;
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a1a1a;">Notice of Practical Completion</h2>
          <p>Dear ${npc.ownerName},</p>
          <p>${input.message || "Please find attached the Notice of Practical Completion for your project."}</p>
          ${(npc.defects as any[])?.length > 0 ? `
            <p>The notice includes ${(npc.defects as any[]).length} minor defect(s) that will be rectified by the Builder within 14 business days.</p>
          ` : ""}
          <p>In accordance with the contract terms, you have five (5) Business Days from receiving this Notice to serve a written notice identifying any items you consider are required to reach Practical Completion.</p>
          <p>Kind regards,<br/>${ctx.user.name}<br/>${npc.builderCompanyName || "Altaspan"}</p>
        </div>
      `;

      const result = await sendNotificationEmail({
        to: input.recipientEmail,
        subject,
        htmlBody,
        fromName: ctx.user.name || "Altaspan",
        attachments: [{
          filename: `NPC-${npc.jobNumber || npc.jobId}.pdf`,
          content: pdfBase64,
          contentType: "application/pdf",
        }],
      });

      if (result.success) {
        await db.updatePracticalCompletionNotice(input.npcId, {
          status: "sent",
          sentAt: new Date(),
          sentTo: input.recipientEmail,
          sentBy: ctx.user.id,
        });

        await notifyOwner({
          title: "NPC Sent",
          content: `Notice of Practical Completion for ${npc.ownerName} (Job ${npc.jobNumber || npc.jobId}) sent to ${input.recipientEmail} by ${ctx.user.name}`,
        });
      }

      return { success: result.success, error: result.error };
    }),

  /** Send NPC for digital signature via SignWell (two-signer: builder first, then client) */
  sendNpcForSignature: protectedProcedure
    .input(z.object({
      npcId: z.number(),
      builderName: z.string(),
      builderEmail: z.string().email(),
      clientName: z.string(),
      clientEmail: z.string().email(),
      subject: z.string().optional(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const npc = await getNpcForTenant(ctx, input.npcId);
      if (!npc.pdfUrl) throw new Error("NPC PDF not generated");
      // Download PDF from S3
      const pdfResp = await fetch(npc.pdfUrl);
      const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString("base64");
      const docName = `Notice of Practical Completion - ${npc.ownerName} (Job ${npc.jobNumber || npc.jobId})`;
      const fileName = `npc-${npc.id}.pdf`;
      const subject = input.subject || `Notice of Practical Completion - ${npc.ownerName}`;
      const message = input.message || `Please review and sign the attached Notice of Practical Completion.`;
      // Two-signer flow: builder signs first (order 1), client signs second (order 2)
      const doc = await signwell.createDocument({
        name: docName,
        fileBase64: pdfBase64,
        fileName,
        recipients: [
          { name: input.builderName, email: input.builderEmail, signing_order: 1 },
          { name: input.clientName, email: input.clientEmail, signing_order: 2 },
        ],
        subject,
        message,
        metadata: { npc_id: String(npc.id), jobId: String(npc.jobId), type: "npc" },
        copiedContacts: [{ name: "Accounts", email: "accounts@commisso.com.au" }],
      });
      await db.updatePracticalCompletionNotice(input.npcId, {
        signwellDocumentId: doc.id,
        signwellStatus: "pending",
        signwellSentAt: new Date(),
        status: "builder_signing",
        sentTo: input.clientEmail,
        sentBy: ctx.user.id,
      });
      await notifyOwner({
        title: "NPC Sent for Signature",
        content: `NPC for ${npc.ownerName} (Job ${npc.jobNumber || npc.jobId}) sent for signature. Builder: ${input.builderName} \u2192 Client: ${input.clientName}. CC: accounts@commisso.com.au`,
      });
      return { success: true, documentId: doc.id };
    }),

  /** Check SignWell signature status for an NPC */
  getNpcSignatureStatus: protectedProcedure
    .input(z.object({ npcId: z.number() }))
    .query(async ({ ctx, input }) => {
      const npc = await getNpcForTenant(ctx, input.npcId);
      if (!npc.signwellDocumentId) {
        return { status: npc.signwellStatus || "none", documentId: null, recipients: [] as any[] };
      }
      try {
        const doc = await signwell.getDocument(npc.signwellDocumentId);
        const newStatus = doc.status?.toLowerCase() || npc.signwellStatus;
        const recipients = doc.recipients?.map((r: any) => ({
          name: r.name, email: r.email, status: r.status, signedAt: r.signed_at,
        })) || [];
        if (newStatus !== npc.signwellStatus) {
          const updateData: any = { signwellStatus: newStatus };
          if (newStatus === "completed") {
            updateData.signwellCompletedAt = new Date();
            updateData.status = "completed";
            updateData.clientSignedAt = new Date();
          }
          await db.updatePracticalCompletionNotice(input.npcId, updateData);
        }
        // Check if builder has signed (first recipient)
        const builderRecipient = recipients[0];
        if (builderRecipient?.status === "signed" && npc.status === "builder_signing") {
          await db.updatePracticalCompletionNotice(input.npcId, {
            status: "sent_to_client",
            builderSignedAt: new Date(),
          });
        }
        return { status: newStatus, documentId: npc.signwellDocumentId, recipients };
      } catch {
        return { status: npc.signwellStatus || "none", documentId: npc.signwellDocumentId, recipients: [] as any[] };
      }
    }),

  /** Download signed NPC PDF */
  downloadSignedNpc: protectedProcedure
    .input(z.object({ npcId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const npc = await getNpcForTenant(ctx, input.npcId);
      if (npc.signedPdfUrl) return { url: npc.signedPdfUrl };
      if (!npc.signwellDocumentId) throw new Error("No signature document found");
      const pdfBuffer = await signwell.downloadSignedPdf(npc.signwellDocumentId);
      const fileKey = `npc/signed/${npc.id}-signed-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
      await db.updatePracticalCompletionNotice(input.npcId, {
        signedPdfUrl: url,
        signwellStatus: "completed",
        signwellCompletedAt: npc.signwellCompletedAt || new Date(),
        status: "completed",
      });
      return { url };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT VARIATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** List all variations for a construction job */
  listVariations: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const database = await requireDatabase();
      await requireJobAccess(database, ctx, input.jobId);
      return db.getVariationsByJob(input.jobId);
    }),

  /** Get a single variation by ID */
  getVariation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return getVariationForTenant(ctx, input.id);
    }),

  /** Create a new variation, generate PDF */
  createVariation: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      variationDetails: z.string().optional(),
      costImpact: z.string().optional(),
      lineItems: z.array(z.object({ description: z.string(), cost: z.number() })).optional(),
      contractNumber: z.string().optional(),
      ownerName: z.string().optional(),
      ownerAddress: z.string().optional(),
      // Builder details
      builderCompanyName: z.string().optional(),
      builderAddress: z.string().optional(),
      builderAbn: z.string().optional(),
      builderLicence: z.string().optional(),
      builderPhone: z.string().optional(),
      builderAccountsEmail: z.string().optional(),
      builderEmail: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await requireDatabase();
      await requireJobAccess(database, ctx, input.jobId);
      // Compute total cost from line items if provided
      const items = input.lineItems?.filter(i => i.description.trim()) || [];
      const totalCost = items.length > 0
        ? items.reduce((sum, i) => sum + (i.cost || 0), 0).toFixed(2)
        : input.costImpact || "0";

      // Generate PDF
      const pdfBuffer = await generateVariationPdf({
        ownerName: input.ownerName || "",
        ownerAddress: input.ownerAddress,
        contractNumber: input.contractNumber,
        builder: {
          companyName: input.builderCompanyName,
          address: input.builderAddress,
          abn: input.builderAbn,
          licence: input.builderLicence,
          phone: input.builderPhone,
          accountsEmail: input.builderAccountsEmail,
          email: input.builderEmail,
        },
        variationTitle: input.title,
        variationDescription: input.description,
        variationDetails: input.variationDetails,
        lineItems: items.length > 0 ? items : undefined,
        costImpact: totalCost,
      });

      // Upload PDF to S3
      const fileKey = `variations/${input.jobId}-var-${Date.now()}.pdf`;
      const { url: pdfUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Save to database
      const variationId = await db.createVariation({
        constructionJobId: input.jobId,
        title: input.title,
        description: input.description,
        variationDetails: input.variationDetails,
        costImpact: totalCost,
        lineItems: items.length > 0 ? items : undefined,
        contractNumber: input.contractNumber,
        ownerName: input.ownerName,
        ownerAddress: input.ownerAddress,
        builderCompanyName: input.builderCompanyName,
        builderAddress: input.builderAddress,
        builderAbn: input.builderAbn,
        builderLicence: input.builderLicence,
        builderPhone: input.builderPhone,
        builderAccountsEmail: input.builderAccountsEmail,
        builderEmail: input.builderEmail,
        pdfUrl,
        createdBy: ctx.user.id,
      });

      return { id: variationId, pdfUrl };
    }),

  /** Send a variation for digital signature via SignWell */
  sendVariationForSignature: protectedProcedure
    .input(z.object({
      variationId: z.number(),
      recipientName: z.string(),
      recipientEmail: z.string().email(),
      subject: z.string().optional(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const variation = await getVariationForTenant(ctx, input.variationId);
      if (!variation.pdfUrl) throw new Error("Variation PDF not generated");

      // Download PDF from S3
      const pdfResp = await fetch(variation.pdfUrl);
      const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString("base64");

      const docName = `Variation - ${variation.title} (Job ${variation.constructionJobId})`;
      const fileName = `variation-${variation.id}.pdf`;
      const subject = input.subject || `Contract Variation - ${variation.title}`;
      const message = input.message || `Please review and sign the attached contract variation. If you have any questions, please don't hesitate to contact us.`;

      // Create SignWell document with signature fields on the last page
      const doc = await signwell.createDocument({
        name: docName,
        fileBase64: pdfBase64,
        fileName,
        recipients: [
          {
            name: input.recipientName,
            email: input.recipientEmail,
          },
        ],
        subject,
        message,
        metadata: {
          variation_id: String(variation.id),
          jobId: String(variation.constructionJobId),
          type: "variation",
        },
      });

      // Update variation with SignWell info
      await db.updateVariation(input.variationId, {
        signwellDocumentId: doc.id,
        signwellStatus: "pending",
        signwellSentAt: new Date(),
        sentTo: input.recipientEmail,
        status: "pending",
      });

      await notifyOwner({
        title: "Variation Sent for Signature",
        content: `Variation "${variation.title}" for Job ${variation.constructionJobId} sent to ${input.recipientEmail} for signature by ${ctx.user.name}`,
      });

      return { success: true, documentId: doc.id };
    }),

  /** Check SignWell status for a variation */
  getVariationSignatureStatus: protectedProcedure
    .input(z.object({ variationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const variation = await getVariationForTenant(ctx, input.variationId);
      if (!variation.signwellDocumentId) {
        return { status: variation.signwellStatus || "none", documentId: null };
      }

      try {
        const doc = await signwell.getDocument(variation.signwellDocumentId);
        const newStatus = doc.status?.toLowerCase() || variation.signwellStatus;
        if (newStatus !== variation.signwellStatus) {
          const updateData: any = { signwellStatus: newStatus };
          if (newStatus === "completed" && !variation.signwellCompletedAt) {
            updateData.signwellCompletedAt = new Date();
            updateData.status = "approved";
          }
          await db.updateVariation(input.variationId, updateData);
        }
        return {
          status: newStatus,
          documentId: variation.signwellDocumentId,
          recipients: doc.recipients?.map(r => ({
            name: r.name,
            email: r.email,
            status: r.status,
            signedAt: r.signed_at,
          })),
        };
      } catch {
        return { status: variation.signwellStatus || "none", documentId: variation.signwellDocumentId };
      }
    }),

  /** Download signed variation PDF */
  downloadSignedVariation: protectedProcedure
    .input(z.object({ variationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const variation = await getVariationForTenant(ctx, input.variationId);
      if (variation.signedPdfUrl) return { url: variation.signedPdfUrl };
      if (!variation.signwellDocumentId) throw new Error("No signature document found");

      const pdfBuffer = await signwell.downloadSignedPdf(variation.signwellDocumentId);
      const fileKey = `variations/signed/${variation.id}-signed-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      await db.updateVariation(input.variationId, {
        signedPdfUrl: url,
        signwellStatus: "completed",
        signwellCompletedAt: variation.signwellCompletedAt || new Date(),
        status: "approved",
      });

      return { url };
    }),

  /** Send a reminder for a pending variation signature */
  sendVariationReminder: protectedProcedure
    .input(z.object({ variationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const variation = await getVariationForTenant(ctx, input.variationId);
      if (!variation?.signwellDocumentId) throw new Error("No signature document found");
      await signwell.sendReminder(variation.signwellDocumentId);
      return { success: true };
    }),
});
