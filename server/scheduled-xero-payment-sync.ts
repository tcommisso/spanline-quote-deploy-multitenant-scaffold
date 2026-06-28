/**
 * Scheduled Xero Payment Sync
 * Runs daily overnight to automatically reconcile Xero payments with trade remittances.
 * Triggered by a Heartbeat cron job at /api/scheduled/xero-payment-sync
 *
 * Logic mirrors the manual reconcileXeroPayments procedure in admin-trade-portal-router.ts
 * but runs unattended via the cron system.
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { constructionInstallers, tradeRemittances, xeroPaymentSyncLog } from "../drizzle/schema";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import { getValidAccessToken } from "./xero-client";
import { notifyOwner } from "./_core/notification";
import { resolveScheduledXeroConnectionScopes } from "./xero-entity-routing";
import { getXeroPaymentRemittancesForTrade } from "./trade-remittance-xero";

type XeroAuth = {
  accessToken: string;
  tenantId: string;
  xeroConnectionId: number;
  appTenantId?: number | null;
};

async function syncTradePaymentsForScope(
  db: any,
  auth: XeroAuth,
  appTenantId: number | null,
) {
  const linkedTradeConditions: any[] = [
    eq(constructionInstallers.active, true),
    sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
  ];
  if (appTenantId) {
    linkedTradeConditions.push(or(eq(constructionInstallers.tenantId, appTenantId), isNull(constructionInstallers.tenantId)));
  }

  // Get all trades linked to Xero for this tenant/entity scope.
  const linkedTrades = await db.select({
    id: constructionInstallers.id,
    name: constructionInstallers.name,
    xeroContactId: constructionInstallers.xeroContactId,
  }).from(constructionInstallers)
    .where(and(...linkedTradeConditions));

  if (linkedTrades.length === 0) {
    return { created: 0, skipped: 0, errors: 0, tradesProcessed: 0, errorDetails: [] as string[] };
  }

  // Get existing Xero-sourced remittances in this tenant scope to avoid duplicates.
  const remittanceConditions: any[] = [eq(tradeRemittances.source, "xero")];
  if (appTenantId) {
    remittanceConditions.push(or(eq(constructionInstallers.tenantId, appTenantId), isNull(constructionInstallers.tenantId)));
  }
  const existingXeroRemittances = await db.select({
    xeroPaymentId: tradeRemittances.xeroPaymentId,
  }).from(tradeRemittances)
    .innerJoin(constructionInstallers, eq(tradeRemittances.installerId, constructionInstallers.id))
    .where(and(...remittanceConditions));
  const existingPaymentIds = new Set(
    existingXeroRemittances.map((r: any) => r.xeroPaymentId).filter(Boolean)
  );

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const trade of linkedTrades) {
    try {
      const paymentResult = await getXeroPaymentRemittancesForTrade({
        appTenantId,
        connectionId: auth.xeroConnectionId,
        installer: trade,
        timeoutMs: 45000,
      });
      if (!paymentResult.connected) {
        throw new Error(paymentResult.error || "No active Xero connection");
      }
      if (paymentResult.error) {
        throw new Error(paymentResult.error);
      }

      for (const payment of paymentResult.remittances) {
        if (!payment.xeroPaymentId) continue;
        if (existingPaymentIds.has(payment.xeroPaymentId)) {
          skipped++;
          continue;
        }
        await db.insert(tradeRemittances).values({
          installerId: trade.id,
          amount: payment.amount,
          date: payment.date,
          reference: payment.reference,
          notes: payment.notes,
          source: "xero",
          xeroPaymentId: payment.xeroPaymentId,
          xeroInvoiceId: payment.xeroInvoiceId,
          xeroInvoiceNumber: payment.xeroInvoiceNumber,
        });
        existingPaymentIds.add(payment.xeroPaymentId);
        created++;
      }
    } catch (err: any) {
      console.error(`[XeroPaymentSync] Error processing trade ${trade.name}:`, err.message);
      errors++;
      errorDetails.push(`${trade.name}: ${err.message}`);
    }
  }

  return {
    created,
    skipped,
    errors,
    tradesProcessed: linkedTrades.length,
    errorDetails,
  };
}

export function registerScheduledXeroPaymentSync(app: Express) {
  app.post("/api/scheduled/xero-payment-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      let created = 0;
      let skipped = 0;
      let errors = 0;
      let tradesProcessed = 0;
      const errorDetails: string[] = [];
      const scopeSummaries: Array<{
        appTenantId: number | null;
        label: string;
        created: number;
        skipped: number;
        errors: number;
        tradesProcessed: number;
        errorDetails: string[];
      }> = [];
      const { scopes, skipped: skippedScopes } = await resolveScheduledXeroConnectionScopes(db, "trade_portal");

      if (scopes.length === 0) {
        console.log("[XeroPaymentSync] No tenant Xero trade portal connection — skipping sync");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No active Xero trade portal connection",
          skippedScopes,
          duration: Date.now() - startTime,
        });
      }

      for (const scope of scopes) {
        const label = scope.tenantName || scope.tenantSlug || `tenant ${scope.appTenantId || "default"}`;
        const auth = await getValidAccessToken({
          connectionId: scope.connection.id,
          appTenantId: scope.appTenantId,
          moduleKey: "trade_portal",
        });
        if (!auth) {
          errors++;
          const errorMessage = `${label}: Xero connection unavailable or token refresh failed`;
          errorDetails.push(errorMessage);
          scopeSummaries.push({
            appTenantId: scope.appTenantId,
            label,
            created: 0,
            skipped: 0,
            errors: 1,
            tradesProcessed: 0,
            errorDetails: [errorMessage],
          });
          continue;
        }

        const result = await syncTradePaymentsForScope(db, auth, scope.appTenantId);
        created += result.created;
        skipped += result.skipped;
        errors += result.errors;
        tradesProcessed += result.tradesProcessed;
        const labelledErrors = result.errorDetails.map((detail) => `${label}: ${detail}`);
        errorDetails.push(...labelledErrors);
        scopeSummaries.push({
          appTenantId: scope.appTenantId,
          label,
          created: result.created,
          skipped: result.skipped,
          errors: result.errors,
          tradesProcessed: result.tradesProcessed,
          errorDetails: labelledErrors,
        });
      }

      for (const skippedScope of skippedScopes) {
        console.warn(`[XeroPaymentSync] Skipped ${skippedScope.tenantName || skippedScope.appTenantId || "tenant"}: ${skippedScope.reason}`);
      }

      if (tradesProcessed === 0 && created === 0 && errors === 0) {
        console.log("[XeroPaymentSync] No trades linked to Xero — nothing to sync");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No trades linked to Xero",
          skippedScopes,
          duration: Date.now() - startTime,
        });
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
      console.log(`[XeroPaymentSync] Completed: ${created} created, ${skipped} skipped, ${errors} errors across ${tradesProcessed} trades (${duration}ms)`);

      // Notify tenant owners if new payments were synced or if there were errors
      for (const summary of scopeSummaries) {
        if (summary.created === 0 && summary.errors === 0) continue;
        const parts: string[] = [];
        if (summary.created > 0) parts.push(`${summary.created} new payment${summary.created !== 1 ? "s" : ""} synced`);
        if (summary.skipped > 0) parts.push(`${summary.skipped} already up-to-date`);
        if (summary.errors > 0) parts.push(`${summary.errors} error${summary.errors !== 1 ? "s" : ""}`);

        notifyOwner({
          tenantId: summary.appTenantId,
          title: summary.errors > 0 ? `Xero Payment Sync — ${summary.label} Completed with Errors` : `Xero Payment Sync — ${summary.label} Complete`,
          content: `Nightly sync processed ${summary.tradesProcessed} trades. ${parts.join(", ")}.${
            summary.errorDetails.length > 0 ? `\n\nErrors:\n${summary.errorDetails.slice(0, 5).join("\n")}` : ""
          }`,
        }).catch(() => {});
      }

      return res.json({
        ok: true,
        created,
        skipped,
        errors,
        tradesProcessed,
        skippedScopes,
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
