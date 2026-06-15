/**
 * Scheduled VOCPhone Call Sync
 * Syncs inbound and outbound calls from VOCPhone API hourly.
 * Endpoint: /api/scheduled/vocphone-sync
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { callLogs, crmLeads } from "../drizzle/schema";
import { eq, or, sql } from "drizzle-orm";
import * as vocphone from "./vocphone";

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, "").replace(/^\+/, "");
}

async function findLeadByPhone(phone: string): Promise<number | null> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) return null;
  const variants = [normalized];
  if (normalized.startsWith("0")) {
    variants.push("61" + normalized.slice(1));
    variants.push("+61" + normalized.slice(1));
  }
  if (normalized.startsWith("61")) {
    variants.push("0" + normalized.slice(2));
    variants.push("+" + normalized);
  }
  const db = (await getDb())!;
  const results = await db
    .select({ id: crmLeads.id })
    .from(crmLeads)
    .where(
      or(
        ...variants.flatMap((v) => [
          eq(crmLeads.contactPhone, v),
        ])
      )
    )
    .limit(1);
  return results.length > 0 ? results[0].id : null;
}

export function registerScheduledVocphoneSync(app: Express) {
  app.post("/api/scheduled/vocphone-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      let synced = 0;
      // Sync last 2 hours of calls to account for any delays
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dateFrom = twoHoursAgo.toISOString().split("T")[0];
      const dateTo = now.toISOString().split("T")[0];

      // Sync inbound calls (paginated)
      let inboundPage = 1;
      let inboundTotalPages = 1;
      do {
        const inbound = await vocphone.getInboundCalls({
          dateFrom,
          dateTo,
          perPage: 50,
          page: inboundPage,
        });
        inboundTotalPages = inbound.total_pages || 1;
        for (const call of inbound.data || []) {
          const existing = await db.select().from(callLogs)
            .where(eq(callLogs.vocphoneCallId, String(call.id)))
            .limit(1);
          if (existing.length === 0) {
            const phoneToMatch = call.callerid || "";
            const leadId = phoneToMatch ? await findLeadByPhone(phoneToMatch) : null;
            await db.insert(callLogs).values({
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
            synced++;
          }
        }
        inboundPage++;
      } while (inboundPage <= inboundTotalPages);

      // Sync outbound calls (paginated)
      let outboundPage = 1;
      let outboundTotalPages = 1;
      do {
        const outbound = await vocphone.getOutboundCalls({
          dateFrom,
          dateTo,
          perPage: 50,
          page: outboundPage,
        });
        outboundTotalPages = outbound.total_pages || 1;
        for (const call of outbound.data || []) {
          const existing = await db.select().from(callLogs)
            .where(eq(callLogs.vocphoneCallId, String(call.id)))
            .limit(1);
          if (existing.length === 0) {
            const phoneToMatch = call.desination_number || call.destination_number || "";
            const leadId = phoneToMatch ? await findLeadByPhone(phoneToMatch) : null;
            await db.insert(callLogs).values({
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
            synced++;
          }
        }
        outboundPage++;
      } while (outboundPage <= outboundTotalPages);

      // Also resync unlinked calls (where leadId is NULL but phone matches a lead now)
      const unlinked = await db
        .select({ id: callLogs.id, direction: callLogs.direction, fromNumber: callLogs.fromNumber, toNumber: callLogs.toNumber })
        .from(callLogs)
        .where(sql`${callLogs.leadId} IS NULL`)
        .limit(100); // limit to avoid timeout
      let linked = 0;
      for (const call of unlinked) {
        const phoneToMatch = call.direction === "inbound" ? call.fromNumber : call.toNumber;
        if (!phoneToMatch) continue;
        const leadId = await findLeadByPhone(phoneToMatch);
        if (leadId) {
          await db.update(callLogs).set({ leadId }).where(eq(callLogs.id, call.id));
          linked++;
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`[vocphone-sync] Synced ${synced} new calls, linked ${linked} unlinked calls in ${elapsed}ms`);
      res.json({ ok: true, synced, linked, elapsed });
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
