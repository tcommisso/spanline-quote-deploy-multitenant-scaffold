/**
 * Scheduled Missed Calls Digest
 * Sends a daily morning email summarising unreviewed missed calls from the previous day
 * to admin and sales staff, so the team can follow up on unanswered calls.
 * Triggered by a Heartbeat cron job at /api/scheduled/missed-calls-digest
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { callLogs, users, crmLeads } from "../drizzle/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { or } from "drizzle-orm";

export function registerScheduledMissedCallsDigest(app: Express) {
  app.post("/api/scheduled/missed-calls-digest", async (req: Request, res: Response) => {
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

      // Calculate yesterday's date range (AEST = UTC+10)
      const now = new Date();
      const aestOffset = 10 * 60 * 60 * 1000;
      const aestNow = new Date(now.getTime() + aestOffset);
      const aestYesterday = new Date(aestNow);
      aestYesterday.setDate(aestYesterday.getDate() - 1);
      aestYesterday.setHours(0, 0, 0, 0);
      const aestYesterdayEnd = new Date(aestYesterday);
      aestYesterdayEnd.setHours(23, 59, 59, 999);

      // Convert back to UTC for DB query
      const utcStart = new Date(aestYesterday.getTime() - aestOffset);
      const utcEnd = new Date(aestYesterdayEnd.getTime() - aestOffset);

      // Get unreviewed missed calls from yesterday (inbound + 0 duration)
      const missedCalls = await db.select({
        id: callLogs.id,
        fromNumber: callLogs.fromNumber,
        toNumber: callLogs.toNumber,
        createdAt: callLogs.createdAt,
        extension: callLogs.extension,
        leadId: callLogs.leadId,
        leadFirstName: crmLeads.contactFirstName,
        leadLastName: crmLeads.contactLastName,
      })
        .from(callLogs)
        .leftJoin(crmLeads, eq(callLogs.leadId, crmLeads.id))
        .where(and(
          eq(callLogs.direction, "inbound"),
          eq(callLogs.duration, 0),
          eq(callLogs.reviewed, false),
          gte(callLogs.createdAt, utcStart),
          lt(callLogs.createdAt, utcEnd),
        ))
        .orderBy(callLogs.createdAt);

      if (missedCalls.length === 0) {
        console.log("[MissedCallsDigest] No unreviewed missed calls yesterday — skipping");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No unreviewed missed calls",
          duration: Date.now() - startTime,
        });
      }

      // Get admin and sales staff recipients
      const staffRecipients = await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(
          or(
            eq(users.role, "admin"),
            eq(users.role, "super_admin"),
            eq(users.role, "office_user"),
          )
        );

      const recipients = staffRecipients.filter(u => u.email);

      if (recipients.length === 0) {
        console.log("[MissedCallsDigest] No recipients with email found — skipping");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No recipients",
          duration: Date.now() - startTime,
        });
      }

      // Build the HTML email
      const dateStr = aestYesterday.toLocaleDateString("en-AU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const htmlBody = buildMissedCallsEmail(missedCalls, dateStr);

      // Send to each recipient
      let sentCount = 0;
      const errors: string[] = [];

      for (const recipient of recipients) {
        const result = await sendNotificationEmail({
          to: recipient.email!,
          subject: `Missed Calls — ${missedCalls.length} unanswered call${missedCalls.length > 1 ? "s" : ""} (${aestYesterday.toLocaleDateString("en-AU")})`,
          htmlBody,
          fromName: "Altaspan Calls",
        });
        if (result.success) {
          sentCount++;
        } else {
          errors.push(`${recipient.email}: ${result.error}`);
        }
      }

      console.log(`[MissedCallsDigest] Sent digest to ${sentCount}/${recipients.length} recipients. ${missedCalls.length} missed calls.`);

      return res.json({
        ok: true,
        missedCallCount: missedCalls.length,
        recipientCount: recipients.length,
        sentCount,
        errors: errors.length > 0 ? errors : undefined,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[MissedCallsDigest] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/missed-calls-digest" },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

interface MissedCall {
  id: number;
  fromNumber: string | null;
  toNumber: string | null;
  createdAt: Date | null;
  extension: number | null;
  leadId: number | null;
  leadFirstName: string | null;
  leadLastName: string | null;
}

function buildMissedCallsEmail(calls: MissedCall[], dateStr: string): string {
  const rows = calls.map(call => {
    const time = call.createdAt
      ? new Date(call.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })
      : "—";
    const phone = call.fromNumber || "Unknown";
    const lead = call.leadFirstName
      ? `${call.leadFirstName} ${call.leadLastName || ""}`.trim()
      : "Unlinked";
    const ext = call.extension ? `Ext ${call.extension}` : "—";
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${time}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;font-family:monospace;">${phone}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${lead}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${ext}</td>
      </tr>`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:#dc2626;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Missed Calls Summary</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${dateStr}</p>
    </div>

    <!-- KPI -->
    <div style="padding:20px 32px;background:#fef2f2;border-bottom:1px solid #fecaca;">
      <div style="font-size:32px;font-weight:700;color:#dc2626;">${calls.length}</div>
      <div style="font-size:13px;color:#991b1b;margin-top:2px;">Unanswered call${calls.length > 1 ? "s" : ""} requiring follow-up</div>
    </div>

    <!-- Table -->
    <div style="padding:16px 32px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Time</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Phone</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Lead</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Extension</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">
        Log in to the <strong>Call Logs</strong> page to review, call back, or mark as reviewed.
      </p>
    </div>
  </div>
</body>
</html>`;
}
