/**
 * SignWell Webhook Handler
 * Receives document status callbacks from SignWell
 * Events: document_completed, document_declined, document_expired, document_viewed
 */
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { quotes, signatureAuditLog, users, projectSubcontracts } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as signwell from "./signwell";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { sendNotificationEmail } from "./email";
import { guardedSend } from "./notification-gateway";
import { portalVariations } from "../drizzle/schema";

export function registerSignwellWebhooks(app: Express) {
  app.post("/api/webhooks/signwell", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const eventType = body?.event_type || body?.event?.type;
      const document = body?.document || body?.data?.object;

      if (!eventType || !document?.id) {
        res.status(200).json({ received: true, skipped: "no event or document" });
        return;
      }

      // Check if this is a subcontract signature event
      const subcontractId = parseInt(document.metadata?.subcontract_id, 10);
      if (!isNaN(subcontractId)) {
        await handleSubcontractWebhook(eventType, document, subcontractId);
        res.status(200).json({ received: true });
        return;
      }

      // Check if this is a variation signature event
      const variationId = parseInt(document.metadata?.variation_id, 10);
      if (!isNaN(variationId)) {
        await handleVariationWebhook(eventType, document, variationId);
        res.status(200).json({ received: true });
        return;
      }

      // Extract quoteId from metadata (proposal signatures)
      const quoteId = parseInt(document.metadata?.quoteId, 10);
      if (isNaN(quoteId)) {
        res.status(200).json({ received: true, skipped: "no quoteId, subcontract_id, or variation_id in metadata" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      console.log(`[SignWell Webhook] Event: ${eventType}, Document: ${document.id}, Quote: ${quoteId}`);

      // Helper to get recipient info from document
      const recipientInfo = document.recipients?.[0];
      const signerInfo = document.recipients?.find((r: any) => r.status === "signed" || r.signed_at);

      if (eventType === "document_completed" || eventType === "document.completed") {
        // Document fully signed — download and store the signed PDF
        try {
          const pdfBuffer = await signwell.downloadSignedPdf(document.id);
          const quoteRows = await db.select().from(quotes).where(eq(quotes.id, quoteId));
          const quote = quoteRows[0];
          const fileKey = `signed-proposals/${quote?.quoteNumber || `Q-${quoteId}`}-signed-${Date.now()}.pdf`;
          const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

          await db.update(quotes).set({
            signwellStatus: "completed",
            signwellCompletedAt: new Date(),
            signedPdfUrl: url,
            status: "accepted",
          }).where(eq(quotes.id, quoteId));

          await guardedSend(
            { settingKey: "notify_proposal_signed", channel: "owner_notify", recipientType: "owner", title: "Proposal Signed!" },
            () => notifyOwner({ title: "Proposal Signed!", content: `${quote?.clientName} has signed the proposal for ${quote?.quoteNumber}. Signed PDF stored.` })
          );

          // Send email notification to the adviser/creator of the quote
          if (quote?.userId) {
            try {
              const [adviserUser] = await db.select().from(users).where(eq(users.id, quote.userId));
              if (adviserUser?.email) {
                await sendNotificationEmail({
                  to: adviserUser.email,
                  subject: `Proposal Signed - ${quote.quoteNumber} (${quote.clientName})`,
                  htmlBody: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                      <h2 style="color: #059669;">✓ Proposal Signed</h2>
                      <p style="color: #334155; line-height: 1.6;">Great news! <strong>${quote.clientName}</strong> has signed the proposal for <strong>${quote.quoteNumber}</strong>.</p>
                      <p style="color: #334155; line-height: 1.6;">The signed PDF has been stored and the quote status has been updated to <strong>Accepted</strong>.</p>
                      ${url ? `<p style="margin-top: 20px;"><a href="${url}" style="background: #059669; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Download Signed PDF</a></p>` : ""}
                      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                      <p style="color: #64748b; font-size: 12px;">This is an automated notification from the Altaspan Quoting System.</p>
                    </div>
                  `,
                });
                console.log(`[SignWell Webhook] Signature notification email sent to ${adviserUser.email}`);
              }
            } catch (emailErr: any) {
              console.error("[SignWell Webhook] Failed to send signature notification email:", emailErr.message);
            }
          }
        } catch (e: any) {
          console.error("[SignWell Webhook] Error processing completed document:", e.message);
          await db.update(quotes).set({
            signwellStatus: "completed",
            signwellCompletedAt: new Date(),
            status: "accepted",
          }).where(eq(quotes.id, quoteId));
        }
        await db.insert(signatureAuditLog).values({
          quoteId,
          event: "signed",
          recipientEmail: signerInfo?.email || recipientInfo?.email || null,
          recipientName: signerInfo?.name || recipientInfo?.name || null,
          metadata: JSON.stringify({ documentId: document.id, signedAt: signerInfo?.signed_at }),
        });
      } else if (eventType === "document_declined" || eventType === "document.declined") {
        await db.update(quotes).set({ signwellStatus: "declined" }).where(eq(quotes.id, quoteId));
        const quoteRows = await db.select().from(quotes).where(eq(quotes.id, quoteId));
        const quote = quoteRows[0];
        await guardedSend(
          { settingKey: "notify_proposal_declined", channel: "owner_notify", recipientType: "owner", title: "Proposal Declined" },
          () => notifyOwner({ title: "Proposal Declined", content: `${quote?.clientName} has declined to sign the proposal for ${quote?.quoteNumber}.` })
        );
        await db.insert(signatureAuditLog).values({
          quoteId,
          event: "declined",
          recipientEmail: recipientInfo?.email || null,
          recipientName: recipientInfo?.name || null,
          metadata: JSON.stringify({ documentId: document.id }),
        });
      } else if (eventType === "document_expired" || eventType === "document.expired") {
        await db.update(quotes).set({ signwellStatus: "expired" }).where(eq(quotes.id, quoteId));
        await db.insert(signatureAuditLog).values({
          quoteId,
          event: "expired",
          recipientEmail: null,
          recipientName: null,
          metadata: JSON.stringify({ documentId: document.id }),
        });
      } else if (eventType === "document_viewed" || eventType === "document.viewed") {
        await db.insert(signatureAuditLog).values({
          quoteId,
          event: "viewed",
          recipientEmail: recipientInfo?.email || null,
          recipientName: recipientInfo?.name || null,
          metadata: JSON.stringify({ documentId: document.id }),
        });
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[SignWell Webhook] Unhandled error:", err.message);
      res.status(200).json({ received: true, error: err.message });
    }
  });
}


/**
 * Handle SignWell webhook events for subcontract documents.
 * Sends notification to owner when a subcontract is signed.
 */
async function handleSubcontractWebhook(eventType: string, document: any, subcontractId: number) {
  const db = await getDb();
  if (!db) {
    console.error("[SignWell Webhook] Database unavailable for subcontract webhook");
    return;
  }

  console.log(`[SignWell Webhook] Subcontract event: ${eventType}, ID: ${subcontractId}`);

  if (eventType === "document_completed" || eventType === "document.completed") {
    // Download signed PDF and store it
    try {
      const pdfBuffer = await signwell.downloadSignedPdf(document.id);
      const [sc] = await db
        .select()
        .from(projectSubcontracts)
        .where(eq(projectSubcontracts.id, subcontractId))
        .limit(1);

      if (!sc) {
        console.error(`[SignWell Webhook] Subcontract ${subcontractId} not found`);
        return;
      }

      const fileKey = `subcontracts/signed/${sc.id}-${sc.jobNumber || "unknown"}-signed-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      // Update subcontract status to signed
      await db
        .update(projectSubcontracts)
        .set({
          status: "signed",
          signedAt: new Date(),
          pdfUrl: url,
        })
        .where(eq(projectSubcontracts.id, subcontractId));

      // Notify the owner
      await guardedSend(
        { settingKey: "notify_subcontract_signed", channel: "owner_notify", recipientType: "owner", title: "Subcontract Signed!" },
        () => notifyOwner({ title: "Subcontract Signed!", content: `${sc.subcontractorName} has signed the subcontract for Job ${sc.jobNumber} (${sc.clientName}) at ${sc.siteAddress}. Contract value: $${sc.subcontractSum || "0"}.` })
      );

      console.log(`[SignWell Webhook] Subcontract ${subcontractId} marked as signed, PDF stored at ${url}`);
    } catch (e: any) {
      console.error("[SignWell Webhook] Error processing signed subcontract:", e.message);
      // Still mark as signed even if PDF download fails
      await db
        .update(projectSubcontracts)
        .set({
          status: "signed",
          signedAt: new Date(),
        })
        .where(eq(projectSubcontracts.id, subcontractId));

      await guardedSend(
        { settingKey: "notify_subcontract_signed", channel: "owner_notify", recipientType: "owner", title: "Subcontract Signed!" },
        () => notifyOwner({ title: "Subcontract Signed!", content: `A subcontract (ID: ${subcontractId}) has been signed. Note: PDF download failed — check SignWell dashboard.` })
      );
    }
  } else if (eventType === "document_declined" || eventType === "document.declined") {
    await db
      .update(projectSubcontracts)
      .set({ status: "declined" })
      .where(eq(projectSubcontracts.id, subcontractId));

    const [sc] = await db
      .select()
      .from(projectSubcontracts)
      .where(eq(projectSubcontracts.id, subcontractId))
      .limit(1);

    await guardedSend(
      { settingKey: "notify_subcontract_declined", channel: "owner_notify", recipientType: "owner", title: "Subcontract Declined" },
      () => notifyOwner({ title: "Subcontract Declined", content: `${sc?.subcontractorName || "Unknown"} has declined to sign the subcontract for Job ${sc?.jobNumber || "unknown"} (${sc?.clientName || ""}).` })
    );
  } else if (eventType === "document_viewed" || eventType === "document.viewed") {
    console.log(`[SignWell Webhook] Subcontract ${subcontractId} viewed`);
  }
}


/**
 * Handle SignWell webhook events for contract variation documents.
 */
async function handleVariationWebhook(eventType: string, document: any, variationId: number) {
  const db = await getDb();
  if (!db) {
    console.error("[SignWell Webhook] Database unavailable for variation webhook");
    return;
  }
  console.log(`[SignWell Webhook] Variation event: ${eventType}, ID: ${variationId}`);

  if (eventType === "document_completed" || eventType === "document.completed") {
    try {
      const pdfBuffer = await signwell.downloadSignedPdf(document.id);
      const [variation] = await db
        .select()
        .from(portalVariations)
        .where(eq(portalVariations.id, variationId))
        .limit(1);
      if (!variation) {
        console.error(`[SignWell Webhook] Variation ${variationId} not found`);
        return;
      }
      const fileKey = `variations/signed/${variation.id}-signed-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      await db.update(portalVariations).set({
        signedPdfUrl: url,
        signwellStatus: "completed",
        signwellCompletedAt: new Date(),
        status: "approved",
      }).where(eq(portalVariations.id, variationId));

      await guardedSend(
        { settingKey: "notify_variation_signed", channel: "owner_notify", recipientType: "owner", title: "Variation Signed!" },
        () => notifyOwner({ title: "Variation Signed!", content: `Contract variation "${variation.title}" (Job ${variation.constructionJobId}) has been signed. Signed PDF stored.` })
      );
      console.log(`[SignWell Webhook] Variation ${variationId} marked as signed, PDF stored at ${url}`);
    } catch (e: any) {
      console.error("[SignWell Webhook] Error processing signed variation:", e.message);
      await db.update(portalVariations).set({
        signwellStatus: "completed",
        signwellCompletedAt: new Date(),
        status: "approved",
      }).where(eq(portalVariations.id, variationId));
      await guardedSend(
        { settingKey: "notify_variation_signed", channel: "owner_notify", recipientType: "owner", title: "Variation Signed!" },
        () => notifyOwner({ title: "Variation Signed!", content: `A contract variation (ID: ${variationId}) has been signed. Note: PDF download failed — check SignWell dashboard.` })
      );
    }
  } else if (eventType === "document_declined" || eventType === "document.declined") {
    await db.update(portalVariations).set({
      signwellStatus: "declined",
      status: "rejected",
    }).where(eq(portalVariations.id, variationId));
    const [variation] = await db.select().from(portalVariations).where(eq(portalVariations.id, variationId)).limit(1);
    await guardedSend(
      { settingKey: "notify_variation_declined", channel: "owner_notify", recipientType: "owner", title: "Variation Declined" },
      () => notifyOwner({ title: "Variation Declined", content: `Contract variation "${variation?.title || "Unknown"}" (Job ${variation?.constructionJobId || "?"}) has been declined.` })
    );
  } else if (eventType === "document_viewed" || eventType === "document.viewed") {
    console.log(`[SignWell Webhook] Variation ${variationId} viewed`);
  }
}
