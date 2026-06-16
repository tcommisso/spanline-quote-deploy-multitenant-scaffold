/**
 * Vocphone Webhook Handlers
 * Receives inbound SMS and call event notifications from Vocphone
 */
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { smsMessages, callLogs, tenants } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { ENV } from "./_core/env";
import { findTenantByVocphoneNumber } from "./tenant-integrations";
import { findLeadByPhone } from "./phone-match";

async function resolveWebhookTenant(serviceNumber?: string | null) {
  if (serviceNumber) {
    const matched = await findTenantByVocphoneNumber(serviceNumber);
    if (matched) return matched;
  }

  if (ENV.tenancyMode === "single") {
    const db = await getDb();
    if (!db) return null;
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.slug, ENV.defaultTenantSlug))
      .limit(1);
    return tenant ?? null;
  }

  return null;
}

export function registerVocphoneWebhooks(app: Express) {
  /**
   * Inbound SMS Webhook
   * Vocphone sends: { From, To, Body } (per their docs)
   * Also handles legacy format: { from, to, message, message_id }
   */
  app.post("/api/webhooks/vocphone/sms", async (req: Request, res: Response) => {
    try {
      // Support both documented format (From/To/Body) and legacy (from/to/message)
      const from = req.body.From || req.body.from;
      const to = req.body.To || req.body.to;
      const body = req.body.Body || req.body.message;
      const messageId = req.body.message_id || null;

      if (!from || !body) {
        res.status(400).json({ error: "Missing required fields (From, Body)" });
        return;
      }

      const tenant = await resolveWebhookTenant(to);
      // Try to match to a lead
      const leadId = await findLeadByPhone(from, tenant?.id);
      const db = (await getDb())!;
      await db.insert(smsMessages).values({
        tenantId: tenant?.id ?? null,
        leadId,
        direction: "inbound",
        fromNumber: from,
        toNumber: to || "",
        body,
        status: "received",
        vocphoneMessageId: messageId,
      });

      console.log(`[Vocphone SMS Webhook] Inbound SMS from ${from} → lead ${leadId || 'unmatched'}`);
      res.status(200).json({ success: true, leadId });
    } catch (error) {
      console.error("[Vocphone SMS Webhook] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * Call Event Webhook
   * Vocphone sends various call events: inboundCallEnd, outboundCallEnd, callRecordingAvailable
   * Payload: { event, call_id, from, to, duration, extension, recording_url, summary, date }
   */
  app.post("/api/webhooks/vocphone/call", async (req: Request, res: Response) => {
    try {
      const { event, call_id, from, to, duration, extension, recording_url, summary, date } = req.body;
      if (!event || !call_id) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const direction = event.includes("inbound") ? "inbound" : "outbound";
      const phoneToMatch = direction === "inbound" ? from : to;
      const serviceNumber = direction === "inbound" ? to : from;
      const tenant = await resolveWebhookTenant(serviceNumber);
      const resolvedLeadId = phoneToMatch ? await findLeadByPhone(phoneToMatch, tenant?.id) : null;
      // Drizzle requires explicit null for nullable int columns, not undefined
      const leadId = resolvedLeadId ?? null;

      const db = (await getDb())!;
      if (event === "callRecordingAvailable") {
        // Update existing call log with recording URL
        const existing = await db
          .select()
          .from(callLogs)
          .where(tenant ? and(eq(callLogs.tenantId, tenant.id), eq(callLogs.vocphoneCallId, String(call_id))) : eq(callLogs.vocphoneCallId, String(call_id)))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(callLogs)
            .set({ recordingUrl: recording_url || null })
            .where(tenant ? and(eq(callLogs.tenantId, tenant.id), eq(callLogs.vocphoneCallId, String(call_id))) : eq(callLogs.vocphoneCallId, String(call_id)));
        } else {
          // Create new entry if we missed the initial event
          await db.insert(callLogs).values({
            tenantId: tenant?.id ?? null,
            ...(leadId !== null ? { leadId } : {}),
            direction,
            fromNumber: from || "",
            toNumber: to || "",
            duration: duration ? parseInt(String(duration)) : 0,
            recordingUrl: recording_url || null,
            vocphoneCallId: String(call_id),
            callSummary: summary || null,
            extension: extension ? parseInt(String(extension)) : null,
          });
        }
      } else {
        // inboundCallEnd or outboundCallEnd
        await db.insert(callLogs).values({
          tenantId: tenant?.id ?? null,
          ...(leadId !== null ? { leadId } : {}),
          direction,
          fromNumber: from || "",
          toNumber: to || "",
          duration: duration ? parseInt(String(duration)) : 0,
          recordingUrl: recording_url || null,
          vocphoneCallId: String(call_id),
          callSummary: summary || null,
          extension: extension ? parseInt(String(extension)) : null,
        });
      }

      res.status(200).json({ success: true, leadId });
    } catch (error) {
      console.error("[Vocphone Call Webhook] Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
