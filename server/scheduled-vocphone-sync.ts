/**
 * Scheduled VOCPhone Call Sync
 * Syncs inbound and outbound calls from VOCPhone API hourly.
 * Endpoint: /api/scheduled/vocphone-sync
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { callLogs, tenants } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import * as vocphone from "./vocphone";
import { findLeadByPhone } from "./phone-match";

export function registerScheduledVocphoneSync(app: Express) {
  app.post("/api/scheduled/vocphone-sync", async (req: Request, res: Response) => {
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

      let synced = 0;
      let linked = 0;
      const tenantResults: Array<{ tenantId: number; slug: string; synced?: number; linked?: number; error?: string }> = [];
      // Sync last 2 hours of calls to account for any delays
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dateFrom = twoHoursAgo.toISOString().split("T")[0];
      const dateTo = now.toISOString().split("T")[0];

      const activeTenants = await db
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      for (const tenant of activeTenants) {
        let tenantSynced = 0;
        let tenantLinked = 0;

        try {
          // Sync inbound calls (paginated)
          let inboundPage = 1;
          let inboundTotalPages = 1;
          do {
            const inbound = await vocphone.getInboundCalls({
              tenantId: tenant.id,
              dateFrom,
              dateTo,
              perPage: 50,
              page: inboundPage,
            });
            inboundTotalPages = inbound.total_pages || 1;
            for (const call of inbound.data || []) {
              const existing = await db.select().from(callLogs)
                .where(and(eq(callLogs.tenantId, tenant.id), eq(callLogs.vocphoneCallId, String(call.id))))
                .limit(1);
              if (existing.length === 0) {
                const phoneToMatch = call.callerid || "";
                const leadId = phoneToMatch ? await findLeadByPhone(phoneToMatch, tenant.id) : null;
                await db.insert(callLogs).values({
                  tenantId: tenant.id,
                  ...(leadId !== null ? { leadId } : {}),
                  direction: "inbound",
                  fromNumber: call.callerid || "",
                  toNumber: call.desination_number || call.destination_number || "",
                  duration: call.billed_seconds || 0,
                  recordingUrl: call.download_url || null,
                  vocphoneCallId: String(call.id),
                  callSummary: call.call_summary || null,
                  extension: call.extension ? parseInt(call.extension) : null,
                });
                tenantSynced++;
              }
            }
            inboundPage++;
          } while (inboundPage <= inboundTotalPages);

          // Sync outbound calls (paginated)
          let outboundPage = 1;
          let outboundTotalPages = 1;
          do {
            const outbound = await vocphone.getOutboundCalls({
              tenantId: tenant.id,
              dateFrom,
              dateTo,
              perPage: 50,
              page: outboundPage,
            });
            outboundTotalPages = outbound.total_pages || 1;
            for (const call of outbound.data || []) {
              const existing = await db.select().from(callLogs)
                .where(and(eq(callLogs.tenantId, tenant.id), eq(callLogs.vocphoneCallId, String(call.id))))
                .limit(1);
              if (existing.length === 0) {
                const phoneToMatch = call.desination_number || call.destination_number || "";
                const leadId = phoneToMatch ? await findLeadByPhone(phoneToMatch, tenant.id) : null;
                await db.insert(callLogs).values({
                  tenantId: tenant.id,
                  ...(leadId !== null ? { leadId } : {}),
                  direction: "outbound",
                  fromNumber: call.callerid || "",
                  toNumber: call.desination_number || call.destination_number || "",
                  duration: call.billed_seconds || 0,
                  recordingUrl: call.download_url || null,
                  vocphoneCallId: String(call.id),
                  callSummary: call.call_summary || null,
                  extension: call.extension ? parseInt(call.extension) : null,
                });
                tenantSynced++;
              }
            }
            outboundPage++;
          } while (outboundPage <= outboundTotalPages);

          // Also resync unlinked calls (where leadId is NULL but phone matches a lead now)
          const unlinked = await db
            .select({ id: callLogs.id, direction: callLogs.direction, fromNumber: callLogs.fromNumber, toNumber: callLogs.toNumber })
            .from(callLogs)
            .where(and(eq(callLogs.tenantId, tenant.id), sql`${callLogs.leadId} IS NULL`))
            .limit(250);
          for (const call of unlinked) {
            const phoneToMatch = call.direction === "inbound" ? call.fromNumber : call.toNumber;
            if (!phoneToMatch) continue;
            const leadId = await findLeadByPhone(phoneToMatch, tenant.id);
            if (leadId) {
              await db.update(callLogs).set({ leadId }).where(and(eq(callLogs.tenantId, tenant.id), eq(callLogs.id, call.id)));
              tenantLinked++;
            }
          }

          synced += tenantSynced;
          linked += tenantLinked;
          tenantResults.push({ tenantId: tenant.id, slug: tenant.slug, synced: tenantSynced, linked: tenantLinked });
        } catch (error: any) {
          tenantResults.push({ tenantId: tenant.id, slug: tenant.slug, error: error.message || "Unknown error" });
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`[vocphone-sync] Synced ${synced} new calls, linked ${linked} unlinked calls in ${elapsed}ms`);
      res.json({ ok: true, synced, linked, elapsed, tenants: tenantResults });
    } catch (error: any) {
      console.error("[vocphone-sync] Error:", error);
      res.status(500).json({
        error: error.message || "Unknown error",
        stack: error.stack,
        context: { url: "/api/scheduled/vocphone-sync", taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
