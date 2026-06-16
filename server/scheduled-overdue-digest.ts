/**
 * Scheduled Overdue Digest
 * Sends a daily summary email listing all active overdue construction jobs
 * to admin and construction staff, keeping the team informed even when not logged in.
 * Triggered by a Heartbeat cron job at /api/scheduled/overdue-digest
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { constructionJobs } from "../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { getScheduledTenants, getTenantNotificationRecipients } from "./_core/scheduled-tenants";

export function registerScheduledOverdueDigest(app: Express) {
  app.post("/api/scheduled/overdue-digest", async (req: Request, res: Response) => {
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

      const now = new Date();
      const tenants = await getScheduledTenants();
      let totalOverdueJobs = 0;
      let totalRecipients = 0;
      let sentCount = 0;
      const errors: string[] = [];

      for (const tenant of tenants) {
        const overdueJobs = await db.select({
          id: constructionJobs.id,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          scheduledEnd: constructionJobs.scheduledEnd,
          quoteNumber: constructionJobs.quoteNumber,

        })
          .from(constructionJobs)
          .where(and(
            eq(constructionJobs.tenantId, tenant.id),
            eq(constructionJobs.status, "in_progress"),
            lt(constructionJobs.scheduledEnd, now)
          ));

        if (overdueJobs.length === 0) {
          continue;
        }

        const recipients = await getTenantNotificationRecipients(tenant.id, {
          appRoles: ["admin", "super_admin", "construction_user"],
        });
        if (recipients.length === 0) {
          errors.push(`${tenant.name}: no recipients`);
          continue;
        }

        totalOverdueJobs += overdueJobs.length;
        totalRecipients += recipients.length;

        const jobsWithDays = overdueJobs.map(job => {
          const daysOverdue = job.scheduledEnd
            ? Math.floor((now.getTime() - new Date(job.scheduledEnd).getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          return { ...job, daysOverdue };
        }).sort((a, b) => b.daysOverdue - a.daysOverdue);

        const dateStr = now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const htmlBody = buildDigestEmail(jobsWithDays, dateStr);

        for (const recipient of recipients) {
          const result = await sendNotificationEmail({
            tenantId: tenant.id,
            to: recipient.email,
            subject: `Overdue Jobs Digest — ${overdueJobs.length} job${overdueJobs.length > 1 ? "s" : ""} overdue (${now.toLocaleDateString("en-AU")})`,
            htmlBody,
            fromName: "Altaspan Construction",
            module: "construction",
          });
          if (result.success) {
            sentCount++;
          } else {
            errors.push(`${recipient.email}: ${result.error}`);
          }
        }
      }

      console.log(`[OverdueDigest] Sent digest to ${sentCount}/${totalRecipients} recipients. ${totalOverdueJobs} overdue jobs.`);

      return res.json({
        ok: true,
        overdueJobCount: totalOverdueJobs,
        recipientCount: totalRecipients,
        sentCount,
        skipped: totalOverdueJobs === 0,
        reason: totalOverdueJobs === 0 ? "No overdue jobs" : undefined,
        errors: errors.length > 0 ? errors : undefined,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[OverdueDigest] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/overdue-digest", taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

function buildDigestEmail(jobs: Array<{ id: number; clientName: string | null; siteAddress: string | null; scheduledEnd: Date | null; quoteNumber: string | null; daysOverdue: number }>, dateStr: string): string {
  const criticalJobs = jobs.filter(j => j.daysOverdue >= 14);
  const warningJobs = jobs.filter(j => j.daysOverdue >= 7 && j.daysOverdue < 14);
  const recentJobs = jobs.filter(j => j.daysOverdue < 7);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 640px; margin: 0 auto; padding: 24px; }
    .card { background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { color: #1a1a1a; font-size: 22px; margin: 0 0 8px; }
    .header p { color: #666; font-size: 14px; margin: 0; }
    .summary { display: flex; gap: 12px; margin-bottom: 24px; }
    .summary-item { flex: 1; text-align: center; padding: 12px; border-radius: 6px; }
    .summary-critical { background: #fef2f2; border: 1px solid #fecaca; }
    .summary-warning { background: #fffbeb; border: 1px solid #fde68a; }
    .summary-recent { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .summary-item .count { font-size: 24px; font-weight: 700; }
    .summary-item .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .section-title { font-size: 14px; font-weight: 600; color: #374151; margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    .job-row { padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .job-row:last-child { border-bottom: none; }
    .job-name { font-weight: 600; color: #1f2937; font-size: 14px; }
    .job-meta { color: #6b7280; font-size: 12px; margin-top: 2px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-critical { background: #fef2f2; color: #dc2626; }
    .badge-warning { background: #fffbeb; color: #d97706; }
    .badge-recent { background: #f0fdf4; color: #16a34a; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>Overdue Jobs Digest</h1>
        <p>${dateStr}</p>
      </div>

      <div class="summary" style="display: flex; gap: 12px;">
        <div class="summary-item summary-critical">
          <div class="count" style="color: #dc2626;">${criticalJobs.length}</div>
          <div class="label">Critical (14+ days)</div>
        </div>
        <div class="summary-item summary-warning">
          <div class="count" style="color: #d97706;">${warningJobs.length}</div>
          <div class="label">Warning (7-13 days)</div>
        </div>
        <div class="summary-item summary-recent">
          <div class="count" style="color: #16a34a;">${recentJobs.length}</div>
          <div class="label">Recent (&lt;7 days)</div>
        </div>
      </div>

      ${criticalJobs.length > 0 ? `
      <div class="section-title" style="color: #dc2626;">Critical — 14+ Days Overdue</div>
      ${criticalJobs.map(j => buildJobRow(j, "critical")).join("")}
      ` : ""}

      ${warningJobs.length > 0 ? `
      <div class="section-title" style="color: #d97706;">Warning — 7-13 Days Overdue</div>
      ${warningJobs.map(j => buildJobRow(j, "warning")).join("")}
      ` : ""}

      ${recentJobs.length > 0 ? `
      <div class="section-title" style="color: #16a34a;">Recently Overdue — Less Than 7 Days</div>
      ${recentJobs.map(j => buildJobRow(j, "recent")).join("")}
      ` : ""}
    </div>

    <div class="footer">
      <p>This is an automated daily digest from Altaspan Construction Management.</p>
      <p>Log in to dismiss or snooze individual alerts.</p>
    </div>
  </div>
</body>
</html>`;
}

function buildJobRow(job: { clientName: string | null; siteAddress: string | null; quoteNumber: string | null; daysOverdue: number }, severity: "critical" | "warning" | "recent"): string {
  const name = job.clientName || "Unknown Client";
  const ref = job.quoteNumber || "";
  const address = job.siteAddress || "";
  return `
    <div class="job-row">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="job-name">${name}${ref ? ` — ${ref}` : ""}</div>
          <div class="job-meta">${address}</div>
        </div>
        <span class="badge badge-${severity}">${job.daysOverdue}d overdue</span>
      </div>
    </div>`;
}
