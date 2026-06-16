/**
 * Scheduled Quote Expiry Reminder
 * Sends reminder emails to clients 3 days before their quote expires.
 * Triggered by a Heartbeat cron job at /api/scheduled/quote-expiry-reminder
 * Runs daily at 9am AEST (23:00 UTC previous day).
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import mysql from "mysql2/promise";
import { sendNotificationEmail } from "./email";
import { getScheduledTenants } from "./_core/scheduled-tenants";

const pool = mysql.createPool(process.env.DATABASE_URL!);

interface ExpiringQuote {
  id: number;
  quoteNumber: string;
  clientName: string;
  clientEmail: string;
  validUntil: Date;
  quoteType: "patio" | "deck" | "eclipse";
  tenantId: number;
}

/**
 * Find quotes expiring in 2-4 days that haven't had a reminder sent yet.
 * Window is 2-4 days to account for cron timing variance.
 */
async function getExpiringQuotes(tenantId: number): Promise<ExpiringQuote[]> {
  const results: ExpiringQuote[] = [];

  // Patio quotes
  const [patioRows] = await pool.execute(`
    SELECT id, quoteNumber, clientName, clientEmail, validUntil
    FROM quotes
    WHERE tenantId = ?
      AND validUntil IS NOT NULL
      AND clientEmail IS NOT NULL
      AND clientEmail != ''
      AND status = 'sent'
      AND archived = 0
      AND expiryReminderSentAt IS NULL
      AND validUntil BETWEEN DATE_ADD(NOW(), INTERVAL 2 DAY) AND DATE_ADD(NOW(), INTERVAL 4 DAY)
  `, [tenantId]);
  for (const row of patioRows as any[]) {
    results.push({
      id: row.id,
      quoteNumber: row.quoteNumber,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      validUntil: new Date(row.validUntil),
      quoteType: "patio",
      tenantId,
    });
  }

  // Deck quotes
  const [deckRows] = await pool.execute(`
    SELECT id, quoteNumber, clientName, clientEmail, validUntil
    FROM deck_quotes
    WHERE validUntil IS NOT NULL
      AND clientEmail IS NOT NULL
      AND clientEmail != ''
      AND status = 'sent'
      AND archived = 0
      AND expiryReminderSentAt IS NULL
      AND EXISTS (
        SELECT 1
        FROM tenant_memberships tm
        WHERE tm.userId = deck_quotes.userId
          AND tm.tenantId = ?
      )
      AND validUntil BETWEEN DATE_ADD(NOW(), INTERVAL 2 DAY) AND DATE_ADD(NOW(), INTERVAL 4 DAY)
  `, [tenantId]);
  for (const row of deckRows as any[]) {
    results.push({
      id: row.id,
      quoteNumber: row.quoteNumber,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      validUntil: new Date(row.validUntil),
      quoteType: "deck",
      tenantId,
    });
  }

  // Eclipse quotes
  const [eclipseRows] = await pool.execute(`
    SELECT id, quoteNumber, clientName, clientEmail, validUntil
    FROM eclipse_quotes
    WHERE validUntil IS NOT NULL
      AND clientEmail IS NOT NULL
      AND clientEmail != ''
      AND status = 'sent'
      AND archived = 0
      AND expiryReminderSentAt IS NULL
      AND EXISTS (
        SELECT 1
        FROM tenant_memberships tm
        WHERE tm.userId = eclipse_quotes.userId
          AND tm.tenantId = ?
      )
      AND validUntil BETWEEN DATE_ADD(NOW(), INTERVAL 2 DAY) AND DATE_ADD(NOW(), INTERVAL 4 DAY)
  `, [tenantId]);
  for (const row of eclipseRows as any[]) {
    results.push({
      id: row.id,
      quoteNumber: row.quoteNumber,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      validUntil: new Date(row.validUntil),
      quoteType: "eclipse",
      tenantId,
    });
  }

  return results;
}

/**
 * Mark a quote as having had its expiry reminder sent.
 */
async function markReminderSent(quoteId: number, quoteType: "patio" | "deck" | "eclipse"): Promise<void> {
  const table = quoteType === "patio" ? "quotes" : quoteType === "deck" ? "deck_quotes" : "eclipse_quotes";
  await pool.execute(`UPDATE ${table} SET expiryReminderSentAt = NOW() WHERE id = ?`, [quoteId]);
}

/**
 * Build the reminder email HTML.
 */
function buildReminderHtml(clientName: string, quoteNumber: string, expiryDate: Date): string {
  const formattedDate = expiryDate.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">Hi ${clientName},</h2>
      <p style="color: #334155; line-height: 1.8;">
        This is a friendly reminder that your quote <strong>${quoteNumber}</strong> is due to expire on <strong>${formattedDate}</strong>.
      </p>
      <p style="color: #334155; line-height: 1.8;">
        If you'd like to proceed or have any questions about the proposal, please don't hesitate to get in touch with us. We're happy to discuss any adjustments or answer any queries you may have.
      </p>
      <p style="color: #334155; line-height: 1.8;">
        If you've already accepted or no longer require this quote, please disregard this email.
      </p>
      <p style="color: #334155; line-height: 1.8; margin-top: 24px;">
        Kind regards,<br />
        <strong>The Altaspan Team</strong>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #64748b; font-size: 12px;">
        This is an automated reminder from Altaspan regarding quote ${quoteNumber}.
      </p>
    </div>
  `;
}

export function registerScheduledQuoteExpiryReminder(app: Express) {
  app.post("/api/scheduled/quote-expiry-reminder", async (req: Request, res: Response) => {
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const tenants = await getScheduledTenants();
      let sent = 0;
      let failed = 0;
      let total = 0;
      const results: Array<{ quoteNumber: string; email: string; status: string; error?: string }> = [];

      for (const tenant of tenants) {
        const expiringQuotes = await getExpiringQuotes(tenant.id);
        total += expiringQuotes.length;
        for (const quote of expiringQuotes) {
          try {
            const htmlBody = buildReminderHtml(quote.clientName, quote.quoteNumber, quote.validUntil);
            const result = await sendNotificationEmail({
              tenantId: quote.tenantId,
              to: quote.clientEmail,
              subject: `Your Altaspan Quote ${quote.quoteNumber} Expires Soon`,
              htmlBody,
              fromName: "Altaspan",
              module: "sales",
            });

            if (result.success) {
              await markReminderSent(quote.id, quote.quoteType);
              sent++;
              results.push({ quoteNumber: quote.quoteNumber, email: quote.clientEmail, status: "sent" });
              console.log(`[QuoteExpiryReminder] Sent reminder for ${quote.quoteNumber} to ${quote.clientEmail}`);
            } else {
              failed++;
              results.push({ quoteNumber: quote.quoteNumber, email: quote.clientEmail, status: "failed", error: result.error });
              console.error(`[QuoteExpiryReminder] Failed for ${quote.quoteNumber}:`, result.error);
            }
          } catch (err: any) {
            failed++;
            results.push({ quoteNumber: quote.quoteNumber, email: quote.clientEmail, status: "error", error: err?.message });
            console.error(`[QuoteExpiryReminder] Exception for ${quote.quoteNumber}:`, err?.message);
          }
        }
      }

      return res.json({ ok: true, sent, failed, total, skipped: total === 0, message: total === 0 ? "No quotes expiring in 3 days" : undefined, results });
    } catch (err: any) {
      console.error("[QuoteExpiryReminder] Handler error:", err);
      return res.status(500).json({
        error: err?.message || "Internal error",
        stack: err?.stack,
        context: { url: req.url, taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
