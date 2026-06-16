/**
 * Signature Expiry Reminder Endpoint
 * Called by scheduled task to check for overdue unsigned documents
 * and send reminder emails to clients.
 */
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { quotes, users } from "../drizzle/schema";
import { eq, and, isNotNull, lt, isNull } from "drizzle-orm";
import { getMasterDataValue } from "./db";
import { sendNotificationEmail } from "./email";
import * as signwell from "./signwell";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";

export function registerSignatureReminderRoutes(app: Express) {
  /**
   * POST /api/scheduled/signature-reminders
   * Checks for documents sent for signature that haven't been signed
   * within the configured reminder days, and sends reminder emails.
   * Protected by the app-owned scheduled job secret.
   */
  app.post("/api/scheduled/signature-reminders", async (req: Request, res: Response) => {
    try {
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Get the configured reminder days from master data
      const reminderDaysStr = await getMasterDataValue("notification", "signature_reminder_days");
      const reminderDays = parseInt(reminderDaysStr || "3", 10);

      if (isNaN(reminderDays) || reminderDays <= 0) {
        return res.json({ success: true, message: "Reminders disabled (invalid or zero days)", sent: 0 });
      }

      // Calculate the cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - reminderDays);

      // Find quotes that are "sent" with a signwellDocumentId but not yet signed
      const overdueQuotes = await db
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.status, "sent"),
            isNotNull(quotes.signwellDocumentId),
            eq(quotes.signwellStatus, "pending"),
            lt(quotes.updatedAt, cutoffDate)
          )
        );

      let sentCount = 0;
      const errors: string[] = [];

      for (const quote of overdueQuotes) {
        try {
          // Send a reminder via SignWell API
          if (quote.signwellDocumentId) {
            await signwell.sendReminder(quote.signwellDocumentId);
          }

          // Also notify the adviser
          if (quote.userId) {
            const [adviser] = await db.select().from(users).where(eq(users.id, quote.userId));
            if (adviser?.email) {
              const daysSinceSent = Math.floor(
                (Date.now() - new Date(quote.updatedAt!).getTime()) / (1000 * 60 * 60 * 24)
              );
              await sendNotificationEmail({
                to: adviser.email,
                subject: `Signature Reminder - ${quote.quoteNumber} (${quote.clientName}) - ${daysSinceSent} days pending`,
                htmlBody: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #d97706;">⏰ Signature Pending</h2>
                    <p style="color: #334155; line-height: 1.6;">The proposal for <strong>${quote.clientName}</strong> (${quote.quoteNumber}) has been awaiting signature for <strong>${daysSinceSent} days</strong>.</p>
                    <p style="color: #334155; line-height: 1.6;">A reminder has been automatically sent to the client. You may want to follow up directly.</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                    <p style="color: #64748b; font-size: 12px;">This is an automated reminder from the Altaspan Quoting System. Configure reminder frequency in Admin &gt; Notification settings.</p>
                  </div>
                `,
              });
            }
          }

          sentCount++;
        } catch (err: any) {
          errors.push(`${quote.quoteNumber}: ${err.message}`);
        }
      }

      return res.json({
        success: true,
        totalOverdue: overdueQuotes.length,
        sent: sentCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err: any) {
      console.error("[Signature Reminders] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });
}
