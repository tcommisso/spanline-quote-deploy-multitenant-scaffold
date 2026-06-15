import { Express, Request, Response } from "express";
import { getDb } from "./db";
import { emailEvents } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Resend Webhook Event Types:
 * - email.sent: Email accepted by Resend
 * - email.delivered: Email delivered to recipient's mail server
 * - email.delivery_delayed: Email delivery is delayed
 * - email.opened: Recipient opened the email
 * - email.clicked: Recipient clicked a link in the email
 * - email.bounced: Email bounced
 * - email.complained: Recipient marked email as spam
 */

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // For bounce events
    bounce?: {
      message: string;
    };
    // For click events
    click?: {
      link: string;
      timestamp: string;
    };
  };
}

export function registerResendWebhooks(app: Express) {
  app.post("/api/resend/webhook", async (req: Request, res: Response) => {
    try {
      const payload = req.body as ResendWebhookPayload;

      if (!payload || !payload.type || !payload.data) {
        console.log("[Resend Webhook] Invalid payload received");
        return res.status(400).json({ error: "Invalid payload" });
      }

      const { type, data } = payload;
      const resendEmailId = data.email_id;

      console.log(`[Resend Webhook] Received event: ${type} for email ${resendEmailId}`);

      const db = await getDb();
      if (!db) {
        console.error("[Resend Webhook] Database not available");
        return res.status(500).json({ error: "Database not available" });
      }

      // Find the email event record by resendEmailId
      const [existingEvent] = await db
        .select()
        .from(emailEvents)
        .where(eq(emailEvents.resendEmailId, resendEmailId))
        .limit(1);

      if (!existingEvent) {
        // No matching record — this email wasn't sent from our activity system
        console.log(`[Resend Webhook] No matching email event for ${resendEmailId}, skipping`);
        return res.json({ received: true });
      }

      const now = new Date();

      switch (type) {
        case "email.sent":
          await db
            .update(emailEvents)
            .set({ status: "sent", sentAt: now })
            .where(eq(emailEvents.id, existingEvent.id));
          break;

        case "email.delivered":
          await db
            .update(emailEvents)
            .set({ status: "delivered", deliveredAt: now })
            .where(eq(emailEvents.id, existingEvent.id));
          break;

        case "email.opened":
          await db
            .update(emailEvents)
            .set({
              status: "opened",
              openedAt: existingEvent.openedAt || now,
              openCount: sql`${emailEvents.openCount} + 1`,
            })
            .where(eq(emailEvents.id, existingEvent.id));
          break;

        case "email.clicked":
          await db
            .update(emailEvents)
            .set({
              status: "clicked",
              clickedAt: existingEvent.clickedAt || now,
              clickCount: sql`${emailEvents.clickCount} + 1`,
            })
            .where(eq(emailEvents.id, existingEvent.id));
          break;

        case "email.bounced":
          await db
            .update(emailEvents)
            .set({
              status: "bounced",
              bouncedAt: now,
              bounceReason: data.bounce?.message || "Unknown bounce reason",
            })
            .where(eq(emailEvents.id, existingEvent.id));
          break;

        case "email.complained":
          await db
            .update(emailEvents)
            .set({ status: "complained" })
            .where(eq(emailEvents.id, existingEvent.id));
          break;

        default:
          console.log(`[Resend Webhook] Unhandled event type: ${type}`);
      }

      return res.json({ received: true });
    } catch (err: any) {
      console.error("[Resend Webhook] Error processing webhook:", err?.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
