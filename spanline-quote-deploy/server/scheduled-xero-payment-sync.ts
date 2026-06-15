/**
 * Scheduled Xero Payment Sync
 * Runs daily overnight to automatically reconcile Xero payments with trade remittances.
 * Triggered by a Heartbeat cron job at /api/scheduled/xero-payment-sync
 *
 * Logic mirrors the manual reconcileXeroPayments procedure in admin-trade-portal-router.ts
 * but runs unattended via the cron system.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { constructionInstallers, tradeRemittances, xeroPaymentSyncLog } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { getValidAccessToken, getXeroInvoices, getXeroPayments } from "./xero-client";
import { notifyOwner } from "./_core/notification";

export function registerScheduledXeroPaymentSync(app: Express) {
  app.post("/api/scheduled/xero-payment-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        // Also allow from admin for testing
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Check Xero connection
      const auth = await getValidAccessToken();
      if (!auth) {
        console.log("[XeroPaymentSync] No active Xero connection — skipping sync");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No active Xero connection",
          duration: Date.now() - startTime,
        });
      }

      // Get all trades linked to Xero
      const linkedTrades = await db.select({
        id: constructionInstallers.id,
        name: constructionInstallers.name,
        xeroContactId: constructionInstallers.xeroContactId,
      }).from(constructionInstallers)
        .where(and(
          eq(constructionInstallers.active, true),
          sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
        ));

      if (linkedTrades.length === 0) {
        console.log("[XeroPaymentSync] No trades linked to Xero — nothing to sync");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No trades linked to Xero",
          duration: Date.now() - startTime,
        });
      }

      // Get existing Xero-sourced remittances to avoid duplicates
      const existingXeroRemittances = await db.select({
        xeroPaymentId: tradeRemittances.xeroPaymentId,
      }).from(tradeRemittances)
        .where(eq(tradeRemittances.source, "xero"));
      const existingPaymentIds = new Set(
        existingXeroRemittances.map(r => r.xeroPaymentId).filter(Boolean)
      );

      let created = 0;
      let skipped = 0;
      let errors = 0;
      const errorDetails: string[] = [];

      for (const trade of linkedTrades) {
        try {
          // Fetch ACCPAY (bills) for this trade's Xero contact
          const invoiceResult = await getXeroInvoices({
            where: `Type=="ACCPAY"&&Contact.ContactID==guid("${trade.xeroContactId}")&&Status=="PAID"`,
          });

          for (const invoice of (invoiceResult.Invoices || [])) {
            if (!invoice.InvoiceID) continue;
            try {
              const paymentResult = await getXeroPayments({
                where: `Invoice.InvoiceID==guid("${invoice.InvoiceID}")`,
              });
              for (const payment of (paymentResult.Payments || [])) {
                if (!payment.PaymentID) continue;
                if (existingPaymentIds.has(payment.PaymentID)) {
                  skipped++;
                  continue;
                }
                // Create remittance record
                await db.insert(tradeRemittances).values({
                  installerId: trade.id,
                  amount: String(payment.Amount || 0),
                  date: payment.Date ? new Date(payment.Date) : new Date(),
                  reference: payment.Reference || invoice.InvoiceNumber || null,
                  notes: `Auto-synced from Xero (nightly). Invoice: ${invoice.InvoiceNumber || invoice.InvoiceID}`,
                  source: "xero",
                  xeroPaymentId: payment.PaymentID,
                  xeroInvoiceId: invoice.InvoiceID,
                  xeroInvoiceNumber: invoice.InvoiceNumber || null,
                });
                existingPaymentIds.add(payment.PaymentID);
                created++;
              }
            } catch (payErr: any) {
              console.error(`[XeroPaymentSync] Error fetching payments for invoice ${invoice.InvoiceID}:`, payErr.message);
              errors++;
              errorDetails.push(`${trade.name}: payment fetch error for ${invoice.InvoiceNumber || invoice.InvoiceID}`);
            }
          }
        } catch (err: any) {
          console.error(`[XeroPaymentSync] Error processing trade ${trade.name}:`, err.message);
          errors++;
          errorDetails.push(`${trade.name}: ${err.message}`);
        }
      }

      // Log the sync run summary as a single entry
      if (created > 0 || errors > 0) {
        await db.insert(xeroPaymentSyncLog).values({
          xeroPaymentId: `sync-run-${Date.now()}`,
          amount: String(created),
          paymentDate: new Date(),
          status: errors > 0 ? "error" : "synced",
          errorMessage: errors > 0 ? `${errors} errors. ${errorDetails.slice(0, 3).join("; ")}` : null,
        });
      }

      const duration = Date.now() - startTime;
      console.log(`[XeroPaymentSync] Completed: ${created} created, ${skipped} skipped, ${errors} errors (${duration}ms)`);

      // Notify owner if new payments were synced or if there were errors
      if (created > 0 || errors > 0) {
        const parts: string[] = [];
        if (created > 0) parts.push(`${created} new payment${created !== 1 ? "s" : ""} synced`);
        if (skipped > 0) parts.push(`${skipped} already up-to-date`);
        if (errors > 0) parts.push(`${errors} error${errors !== 1 ? "s" : ""}`);

        notifyOwner({
          title: errors > 0 ? "Xero Payment Sync — Completed with Errors" : "Xero Payment Sync — Complete",
          content: `Nightly sync processed ${linkedTrades.length} trades. ${parts.join(", ")}.${
            errorDetails.length > 0 ? `\n\nErrors:\n${errorDetails.slice(0, 5).join("\n")}` : ""
          }`,
        }).catch(() => {});
      }

      return res.json({
        ok: true,
        created,
        skipped,
        errors,
        tradesProcessed: linkedTrades.length,
        duration,
      });
    } catch (err: any) {
      console.error("[XeroPaymentSync] Fatal error:", err);
      return res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url, taskUid: (req as any).user?.taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
