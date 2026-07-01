import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { marketingContactPreferences } from "../drizzle/schema";
import { ENV } from "./_core/env";

export type MarketingChannel = "email" | "sms";

const SMS_STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normaliseMarketingContact(channel: MarketingChannel, value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (channel === "email") return raw.toLowerCase();
  let phone = raw.replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("0")) phone = `61${phone.slice(1)}`;
  return phone;
}

export function isSmsStopRequest(body?: string | null) {
  const normalized = String(body || "").trim().toLowerCase().replace(/[\s-]+/g, "");
  return SMS_STOP_WORDS.has(normalized);
}

function createToken() {
  return randomBytes(32).toString("base64url");
}

export function unsubscribeUrl(origin: string, token: string) {
  const base = origin || ENV.publicAppUrl || "";
  const path = `/unsubscribe/${encodeURIComponent(token)}`;
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

export async function getMarketingPreference(params: {
  tenantId: number;
  channel: MarketingChannel;
  contact: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const contactValue = normaliseMarketingContact(params.channel, params.contact);
  if (!contactValue) return null;
  const [preference] = await db.select()
    .from(marketingContactPreferences)
    .where(and(
      eq(marketingContactPreferences.tenantId, params.tenantId),
      eq(marketingContactPreferences.channel, params.channel),
      eq(marketingContactPreferences.contactValue, contactValue),
    ))
    .limit(1);
  return preference || null;
}

export async function isMarketingUnsubscribed(params: {
  tenantId: number;
  channel: MarketingChannel;
  contact: string;
}) {
  const preference = await getMarketingPreference(params);
  return Boolean(preference?.unsubscribedAt);
}

export async function ensureMarketingPreference(params: {
  tenantId: number;
  channel: MarketingChannel;
  contact: string;
  leadId?: number | null;
  source?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contactValue = normaliseMarketingContact(params.channel, params.contact);
  if (!contactValue) throw new Error("Marketing recipient contact is required");

  const existing = await getMarketingPreference({ tenantId: params.tenantId, channel: params.channel, contact: contactValue });
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (params.leadId && !existing.leadId) updates.leadId = params.leadId;
    if (params.source && !existing.source) updates.source = params.source;
    if (Object.keys(updates).length) {
      await db.update(marketingContactPreferences)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(marketingContactPreferences.id, existing.id));
      return { ...existing, ...updates };
    }
    return existing;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const unsubscribeToken = createToken();
      const [result] = await db.insert(marketingContactPreferences).values({
        tenantId: params.tenantId,
        channel: params.channel,
        contactValue,
        unsubscribeToken,
        leadId: params.leadId || null,
        source: params.source || null,
      });
      const [created] = await db.select()
        .from(marketingContactPreferences)
        .where(eq(marketingContactPreferences.id, result.insertId))
        .limit(1);
      return created;
    } catch (error: any) {
      if (!/uq_marketing_pref_token|Duplicate entry/i.test(String(error?.message || error))) throw error;
    }
  }
  throw new Error("Could not create unsubscribe token");
}

export async function markMarketingUnsubscribed(params: {
  tenantId: number;
  channel: MarketingChannel;
  contact: string;
  leadId?: number | null;
  reason?: string | null;
  source?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const preference = await ensureMarketingPreference(params);
  await db.update(marketingContactPreferences)
    .set({
      unsubscribedAt: new Date(),
      unsubscribeReason: params.reason || "unsubscribe",
      leadId: params.leadId || preference.leadId || null,
      source: params.source || preference.source || null,
      updatedAt: new Date(),
    })
    .where(eq(marketingContactPreferences.id, preference.id));
}

export async function markMarketingUnsubscribedByToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [preference] = await db.select()
    .from(marketingContactPreferences)
    .where(eq(marketingContactPreferences.unsubscribeToken, token))
    .limit(1);
  if (!preference) return null;
  if (!preference.unsubscribedAt) {
    await db.update(marketingContactPreferences)
      .set({
        unsubscribedAt: new Date(),
        unsubscribeReason: "email_link",
        updatedAt: new Date(),
      })
      .where(eq(marketingContactPreferences.id, preference.id));
  }
  return preference;
}

export async function buildMarketingEmailBodies(params: {
  tenantId: number;
  contact: string;
  htmlBody: string;
  textBody?: string | null;
  origin: string;
  leadId?: number | null;
  source?: string | null;
}) {
  const preference = await ensureMarketingPreference({
    tenantId: params.tenantId,
    channel: "email",
    contact: params.contact,
    leadId: params.leadId,
    source: params.source,
  });
  const link = unsubscribeUrl(params.origin, preference.unsubscribeToken);
  const htmlFooter = `
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">
      You are receiving this marketing email from Spanline/Altaspan.
      <a href="${escapeHtml(link)}" style="color:#2563eb">Unsubscribe</a>
    </div>
  `;
  const textFooter = `\n\nYou are receiving this marketing email from Spanline/Altaspan. Unsubscribe: ${link}`;
  return {
    htmlBody: `${params.htmlBody}${htmlFooter}`,
    textBody: `${params.textBody || params.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}${textFooter}`,
  };
}

export async function buildMarketingSmsBody(params: {
  tenantId: number;
  contact: string;
  body: string;
  leadId?: number | null;
  source?: string | null;
}) {
  await ensureMarketingPreference({
    tenantId: params.tenantId,
    channel: "sms",
    contact: params.contact,
    leadId: params.leadId,
    source: params.source,
  });
  const footer = " Reply STOP to unsubscribe.";
  return params.body.toLowerCase().includes("reply stop") ? params.body : `${params.body}${footer}`;
}

export function registerMarketingUnsubscribeRoutes(app: Express) {
  app.get("/unsubscribe/:token", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) {
        res.status(400).send("Invalid unsubscribe link.");
        return;
      }
      const preference = await markMarketingUnsubscribedByToken(token);
      if (!preference) {
        res.status(404).send("This unsubscribe link could not be found.");
        return;
      }
      res.status(200).send(`<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Unsubscribed</title>
            <style>
              body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}
              main{max-width:560px;margin:10vh auto;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:28px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
              h1{font-size:24px;margin:0 0 12px}
              p{line-height:1.55;color:#475569}
            </style>
          </head>
          <body>
            <main>
              <h1>Unsubscribed</h1>
              <p>${escapeHtml(preference.contactValue)} has been unsubscribed from ${escapeHtml(preference.channel)} marketing messages.</p>
              <p>You may still receive operational messages about quotes, jobs, appointments, invoices, or safety notices.</p>
            </main>
          </body>
        </html>`);
    } catch (error) {
      console.error("[MarketingUnsubscribe] Link handling failed", error);
      res.status(500).send("Could not process unsubscribe request.");
    }
  });
}
