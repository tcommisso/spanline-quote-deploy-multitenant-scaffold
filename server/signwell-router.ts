/**
 * SignWell Digital Signature Router
 * Procedures for sending proposals for signature, checking status, downloading signed PDFs
 */
import { z } from "zod";
import { publicProcedure, router, tenantProcedure } from "./_core/trpc";
import { isAdminRole } from "@shared/const";
import * as db from "./db";
import * as signwell from "./signwell";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { getDesignAdvisorByName } from "./design-advisors-db";
import { getDb } from "./db";
import { signatureAuditLog } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getTenantSignwellConfig } from "./tenant-integrations";

export const signwellRouter = router({
  /**
   * Send a quote proposal for digital signature
   * Accepts the PDF base64 from the frontend (same as sendProposal)
   */
  sendForSignature: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      recipientName: z.string(),
      recipientEmail: z.string().email(),
      pdfBase64: z.string(),
      subject: z.string().optional(),
      message: z.string().optional(),
      totalPages: z.number().optional(),
      signatureY: z.number().optional(),
      renderImageUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new Error("Quote not found");
      if (quote.tenantId != null && quote.tenantId !== ctx.tenant.id) {
        throw new Error("Access denied");
      }
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      // Look up the design adviser to CC them on the signed document
      // Skip if their email matches the recipient (SignWell rejects duplicate emails)
      let copiedContacts: Array<{ name: string; email: string }> = [];
      if (quote.designAdvisor) {
        const adviser = await getDesignAdvisorByName(quote.designAdvisor);
        if (adviser?.email && adviser.email.toLowerCase() !== input.recipientEmail.toLowerCase()) {
          copiedContacts.push({ name: adviser.name, email: adviser.email });
        }
      }

      const docName = `Proposal - ${quote.clientName} (${quote.quoteNumber || `Q-${quote.id}`})`;
      const fileName = `${quote.quoteNumber || `Q-${quote.id}`}-proposal.pdf`;
      const subject = input.subject || `Your Altaspan Proposal - ${quote.quoteNumber || `Q-${quote.id}`}`;
      let message = input.message || `Please review and sign the attached proposal for your Altaspan project. If you have any questions, please don't hesitate to contact us.`;

      // If a render image URL is provided, append a visual preview link to the message
      if (input.renderImageUrl) {
        message += `\n\nView your 3D patio visualisation: ${input.renderImageUrl}`;
      }
      const metadata = {
        tenantId: String(ctx.tenant.id),
        quoteId: String(input.quoteId),
        quoteNumber: quote.quoteNumber || `Q-${quote.id}`,
        clientName: quote.clientName || "",
      };

      // Check if a SignWell template is configured
      const signwellConfig = await getTenantSignwellConfig(ctx.tenant.id);
      const templateSetting = signwellConfig.templateId || await db.getMasterDataValue("signwell", "template_id");
      let doc: signwell.SignWellDocument;

      if (templateSetting) {
        // Use template-based signing (pre-placed fields on the template)
        doc = await signwell.createDocumentFromTemplate({
          tenantId: ctx.tenant.id,
          templateId: templateSetting,
          name: docName,
          fileBase64: input.pdfBase64,
          fileName,
          recipients: [
            {
              name: input.recipientName,
              email: input.recipientEmail,
              placeholder_name: "Client",
            },
          ],
          copiedContacts,
          subject,
          message,
          metadata,
        });
      } else {
        // Fallback: place signature/date fields on the last page of the PDF
        const lastPage = input.totalPages || 1;
        
        // Convert signatureY (mm from top) to points (72 DPI)
        // The PDF is A4 (210x297mm), SignWell uses points (1mm = 2.8346pt)
        // signatureY is the Y position where the signature lines section starts
        // Signature line is drawn at signatureY + 20mm
        // "Client Signature" label at signatureY + 26mm
        // "Date: ___/___/______" at signatureY + 32mm
        const MM_TO_PT = 72 / 25.4; // 2.8346
        const sigYMm = input.signatureY ?? 180; // fallback if not provided
        const marginMm = 14;
        
        // Position signature field so it sits ABOVE the signature line
        // Field bottom should align with the signature line (sigYMm + 20mm)
        const sigLineYPt = (sigYMm + 20) * MM_TO_PT;
        const sigFieldHeight = 40;
        const sigFieldY = sigLineYPt - sigFieldHeight; // field top
        const sigFieldX = marginMm * MM_TO_PT; // left margin in points
        
        // Position date field to align with "Date: ___/___/______" text (sigYMm + 32mm)
        const dateTextYPt = (sigYMm + 30) * MM_TO_PT;
        const dateFieldHeight = 20;
        const dateFieldY = dateTextYPt;
        const dateFieldX = (marginMm + 30) * MM_TO_PT; // offset slightly right of "Date:" label
        
        const signatureFields: signwell.SignWellField[] = [
          {
            type: "signature",
            required: true,
            x: Math.round(sigFieldX),
            y: Math.round(sigFieldY),
            page: lastPage,
            width: 200,
            height: sigFieldHeight,
            recipient_id: "1",
          },
          {
            type: "date",
            required: true,
            x: Math.round(dateFieldX),
            y: Math.round(dateFieldY),
            page: lastPage,
            width: 120,
            height: dateFieldHeight,
            recipient_id: "1",
          },
        ];

        doc = await signwell.createDocument({
          tenantId: ctx.tenant.id,
          name: docName,
          fileBase64: input.pdfBase64,
          fileName,
          recipients: [
            {
              name: input.recipientName,
              email: input.recipientEmail,
            },
          ],
          fields: signatureFields,
          copiedContacts,
          subject,
          message,
          metadata,
        });
      }


      // Update quote with SignWell document ID and status
      await db.updateQuote(input.quoteId, {
        signwellDocumentId: doc.id,
        signwellStatus: "pending",
        signwellSentAt: new Date(),
      });

      // Log audit event
      const drizzleDb = await getDb();
      await drizzleDb!.insert(signatureAuditLog).values({
        quoteId: input.quoteId,
        event: "sent",
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        metadata: JSON.stringify({ documentId: doc.id, sentBy: ctx.user.name }),
      });

      await notifyOwner({
        title: "Proposal Sent for Signature",
        content: `Proposal for ${quote.clientName} (${quote.quoteNumber}) sent to ${input.recipientEmail} for digital signature by ${ctx.user.name}`,
      });

      return {
        success: true,
        documentId: doc.id,
        status: "pending",
      };
    }),

  /**
   * Get the current signature status for a quote
   */
  getStatus: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new Error("Quote not found");
      if (quote.tenantId != null && quote.tenantId !== ctx.tenant.id) {
        throw new Error("Access denied");
      }
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      if (!quote.signwellDocumentId) {
        return { status: null, documentId: null, sentAt: null, completedAt: null, signedPdfUrl: null };
      }

      // Optionally refresh status from SignWell
      try {
        const doc = await signwell.getDocument(quote.signwellDocumentId, ctx.tenant.id);
        const newStatus = doc.status?.toLowerCase() || quote.signwellStatus;

        // Update if status changed
        if (newStatus !== quote.signwellStatus) {
          const updateData: any = { signwellStatus: newStatus };
          if (newStatus === "completed" && !quote.signwellCompletedAt) {
            updateData.signwellCompletedAt = new Date();
          }
          await db.updateQuote(input.quoteId, updateData);
        }

        return {
          status: newStatus,
          documentId: quote.signwellDocumentId,
          sentAt: quote.signwellSentAt,
          completedAt: quote.signwellCompletedAt,
          signedPdfUrl: quote.signedPdfUrl,
          recipients: doc.recipients?.map(r => ({
            name: r.name,
            email: r.email,
            status: r.status,
            signedAt: r.signed_at,
          })),
        };
      } catch (e) {
        // If API call fails, return cached status
        return {
          status: quote.signwellStatus,
          documentId: quote.signwellDocumentId,
          sentAt: quote.signwellSentAt,
          completedAt: quote.signwellCompletedAt,
          signedPdfUrl: quote.signedPdfUrl,
        };
      }
    }),

  /**
   * Download the signed PDF and store in S3
   */
  downloadSignedPdf: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new Error("Quote not found");
      if (quote.tenantId != null && quote.tenantId !== ctx.tenant.id) {
        throw new Error("Access denied");
      }
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Access denied");
      }
      if (!quote.signwellDocumentId) throw new Error("No signature document found");

      // If already downloaded, return existing URL
      if (quote.signedPdfUrl) {
        return { url: quote.signedPdfUrl };
      }

      // Download from SignWell
      const pdfBuffer = await signwell.downloadSignedPdf(quote.signwellDocumentId, ctx.tenant.id);

      // Upload to S3
      const fileKey = `signed-proposals/${quote.quoteNumber || `Q-${quote.id}`}-signed-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Update quote with signed PDF URL
      await db.updateQuote(input.quoteId, {
        signedPdfUrl: url,
        signwellStatus: "completed",
        signwellCompletedAt: quote.signwellCompletedAt || new Date(),
      });

      return { url };
    }),

  /**
   * Send a reminder to the signer
   */
  sendReminder: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new Error("Quote not found");
      if (quote.tenantId != null && quote.tenantId !== ctx.tenant.id) {
        throw new Error("Access denied");
      }
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Access denied");
      }
      if (!quote.signwellDocumentId) throw new Error("No signature document found");

      await signwell.sendReminder(quote.signwellDocumentId, ctx.tenant.id);

      // Log audit event
      const drizzleDb2 = await getDb();
      await drizzleDb2!.insert(signatureAuditLog).values({
        quoteId: input.quoteId,
        event: "reminder_sent",
        recipientEmail: null,
        recipientName: null,
        metadata: JSON.stringify({ sentBy: ctx.user.name }),
      });

      return { success: true };
    }),

  /**
   * Cancel a pending signature request
   */
  cancel: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new Error("Quote not found");
      if (quote.tenantId != null && quote.tenantId !== ctx.tenant.id) {
        throw new Error("Access denied");
      }
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Access denied");
      }
      if (!quote.signwellDocumentId) throw new Error("No signature document found");

      await signwell.cancelDocument(quote.signwellDocumentId, ctx.tenant.id);
      await db.updateQuote(input.quoteId, {
        signwellStatus: "cancelled",
      });

      return { success: true };
    }),

  /**
   * Webhook handler for SignWell callbacks (public — no auth, verified by document metadata)
   */
  webhook: publicProcedure
    .input(z.object({
      event: z.object({
        type: z.string(),
      }),
      document: z.object({
        id: z.string(),
        status: z.string().optional(),
        metadata: z.record(z.string(), z.string()).optional(),
        recipients: z.array(z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          status: z.string().optional(),
          signed_at: z.string().optional(),
        })).optional(),
      }),
    }).passthrough())
    .mutation(async ({ input }) => {
      const { event, document: doc } = input;
      const quoteIdStr = doc.metadata?.quoteId;
      if (!quoteIdStr) return { received: true };

      const quoteId = parseInt(quoteIdStr as string, 10);
      if (isNaN(quoteId)) return { received: true };
      const tenantId = doc.metadata?.tenantId ? Number(doc.metadata.tenantId) : undefined;

      const eventType = event.type;

      const drizzleDbWh = (await getDb())!;

      if (eventType === "document_completed") {
        // Document fully signed — download and store the signed PDF
        const signerInfo = doc.recipients?.find(r => r.status === "signed" || r.signed_at);
        try {
          const pdfBuffer = await signwell.downloadSignedPdf(doc.id, Number.isInteger(tenantId) ? tenantId : undefined);
          const quote = await db.getQuoteById(quoteId);
          const fileKey = `signed-proposals/${quote?.quoteNumber || `Q-${quoteId}`}-signed-${Date.now()}.pdf`;
          const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

          await db.updateQuote(quoteId, {
            signwellStatus: "completed",
            signwellCompletedAt: new Date(),
            signedPdfUrl: url,
            status: "accepted",
          });

          await notifyOwner({
            title: "Proposal Signed!",
            content: `${quote?.clientName} has signed the proposal for ${quote?.quoteNumber}. Signed PDF stored. Quote auto-accepted.`,
          });
        } catch (e) {
          console.error("[SignWell Webhook] Error processing completed document:", e);
          await db.updateQuote(quoteId, {
            signwellStatus: "completed",
            signwellCompletedAt: new Date(),
            status: "accepted",
          });
        }
        await drizzleDbWh.insert(signatureAuditLog).values({
          quoteId,
          event: "signed",
          recipientEmail: signerInfo?.email || null,
          recipientName: signerInfo?.name || null,
          metadata: JSON.stringify({ documentId: doc.id, signedAt: signerInfo?.signed_at }),
        });
      } else if (eventType === "document_declined") {
        await db.updateQuote(quoteId, { signwellStatus: "declined" });
        const quote = await db.getQuoteById(quoteId);
        await notifyOwner({
          title: "Proposal Declined",
          content: `${quote?.clientName} has declined to sign the proposal for ${quote?.quoteNumber}.`,
        });
        await drizzleDbWh.insert(signatureAuditLog).values({
          quoteId,
          event: "declined",
          recipientEmail: doc.recipients?.[0]?.email || null,
          recipientName: doc.recipients?.[0]?.name || null,
          metadata: JSON.stringify({ documentId: doc.id }),
        });
      } else if (eventType === "document_expired") {
        await db.updateQuote(quoteId, { signwellStatus: "expired" });
        await drizzleDbWh.insert(signatureAuditLog).values({
          quoteId,
          event: "expired",
          recipientEmail: null,
          recipientName: null,
          metadata: JSON.stringify({ documentId: doc.id }),
        });
      } else if (eventType === "document_viewed") {
        await drizzleDbWh.insert(signatureAuditLog).values({
          quoteId,
          event: "viewed",
          recipientEmail: doc.recipients?.[0]?.email || null,
          recipientName: doc.recipients?.[0]?.name || null,
          metadata: JSON.stringify({ documentId: doc.id }),
        });
      }

      return { received: true };
    }),

  /**
   * Get the signature audit trail for a quote
   */
  getAuditTrail: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quote = await db.getQuoteById(input.quoteId);
      if (!quote) throw new Error("Quote not found");
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      const drizzleDb = (await getDb())!;
      const logs = await drizzleDb
        .select()
        .from(signatureAuditLog)
        .where(eq(signatureAuditLog.quoteId, input.quoteId))
        .orderBy(desc(signatureAuditLog.createdAt));

      return logs.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));
    }),
});
