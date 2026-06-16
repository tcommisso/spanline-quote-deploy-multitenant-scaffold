/**
 * Scheduled RFI Due Date Notification
 * Sends push notifications, email digests, and owner alerts when RFIs are approaching or past their due date.
 * Triggered by a Heartbeat cron job at /api/scheduled/rfi-due-notify
 *
 * Logic:
 * - Overdue: RFIs with dueAt < now AND status in (open, in_progress)
 * - Due soon: RFIs with dueAt within next 48 hours AND status in (open, in_progress)
 * - Updates overdue RFIs to status "overdue"
 * - Sends push notification to assigned staff + admins
 * - Sends email digest to assigned staff + admins (for those without push)
 * - Sends owner notification summary
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { approvalRfis, approvalProjects, users } from "../drizzle/schema";
import { eq, and, or, lte, gt, inArray, isNotNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { sendPushToUser, type PushPayload } from "./push";
import { sendNotificationEmail } from "./email";

interface RfiRow {
  rfiId: number;
  rfiNumber: string | null;
  subject: string;
  dueAt: Date | null;
  status: string;
  isBlocking: boolean;
  projectId: number;
  projectName: string;
  projectNumber: string | null;
  assignedToName: string | null;
  assignedToUserId: number | null;
}

function buildEmailHtml(userRfis: RfiRow[], now: Date, userName: string): string {
  const overdueRows = userRfis.filter((r) => r.dueAt && r.dueAt <= now);
  const dueSoonRows = userRfis.filter((r) => r.dueAt && r.dueAt > now);

  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a; border-bottom: 2px solid #e5e5e5; padding-bottom: 12px;">RFI Due Date Alert</h2>
      <p style="color: #555;">Hi ${userName || "Team"},</p>
      <p style="color: #555;">The following RFIs assigned to you require attention:</p>
  `;

  if (overdueRows.length > 0) {
    html += `<h3 style="color: #dc2626; margin-top: 20px;">🚨 Overdue (${overdueRows.length})</h3>`;
    html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr style="background: #fef2f2;">
        <th style="text-align: left; padding: 8px; border: 1px solid #fecaca; font-size: 12px;">Project</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #fecaca; font-size: 12px;">Subject</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #fecaca; font-size: 12px;">Days Overdue</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #fecaca; font-size: 12px;">Blocking</th>
      </tr>`;
    for (const r of overdueRows) {
      const daysPast = Math.ceil((now.getTime() - (r.dueAt?.getTime() || 0)) / (1000 * 60 * 60 * 24));
      html += `<tr>
        <td style="padding: 8px; border: 1px solid #fecaca; font-size: 13px;">${r.projectNumber || "—"}</td>
        <td style="padding: 8px; border: 1px solid #fecaca; font-size: 13px;">${r.subject}</td>
        <td style="padding: 8px; border: 1px solid #fecaca; font-size: 13px; color: #dc2626; font-weight: bold;">${daysPast}d</td>
        <td style="padding: 8px; border: 1px solid #fecaca; font-size: 13px;">${r.isBlocking ? "⛔ Yes" : "No"}</td>
      </tr>`;
    }
    html += `</table>`;
  }

  if (dueSoonRows.length > 0) {
    html += `<h3 style="color: #d97706; margin-top: 20px;">⚠️ Due Within 48 Hours (${dueSoonRows.length})</h3>`;
    html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr style="background: #fffbeb;">
        <th style="text-align: left; padding: 8px; border: 1px solid #fde68a; font-size: 12px;">Project</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #fde68a; font-size: 12px;">Subject</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #fde68a; font-size: 12px;">Hours Left</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #fde68a; font-size: 12px;">Blocking</th>
      </tr>`;
    for (const r of dueSoonRows) {
      const hoursLeft = Math.ceil(((r.dueAt?.getTime() || 0) - now.getTime()) / (1000 * 60 * 60));
      html += `<tr>
        <td style="padding: 8px; border: 1px solid #fde68a; font-size: 13px;">${r.projectNumber || "—"}</td>
        <td style="padding: 8px; border: 1px solid #fde68a; font-size: 13px;">${r.subject}</td>
        <td style="padding: 8px; border: 1px solid #fde68a; font-size: 13px; color: #d97706; font-weight: bold;">${hoursLeft}h</td>
        <td style="padding: 8px; border: 1px solid #fde68a; font-size: 13px;">${r.isBlocking ? "⛔ Yes" : "No"}</td>
      </tr>`;
    }
    html += `</table>`;
  }

  html += `
      <p style="color: #555; margin-top: 20px; font-size: 13px;">
        Log in to the Approvals dashboard to respond to these RFIs.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
      <p style="color: #999; font-size: 11px;">This is an automated notification from Altaspan Approvals.</p>
    </div>
  `;
  return html;
}

export function registerScheduledRfiDueNotify(app: Express) {
  app.post("/api/scheduled/rfi-due-notify", async (req: Request, res: Response) => {
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
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // Find RFIs that are open/in_progress with a due date
      const activeRfis: RfiRow[] = await db
        .select({
          rfiId: approvalRfis.id,
          rfiNumber: approvalRfis.rfiNumber,
          subject: approvalRfis.subject,
          dueAt: approvalRfis.dueAt,
          status: approvalRfis.status,
          isBlocking: approvalRfis.isBlocking,
          projectId: approvalRfis.projectId,
          projectName: approvalProjects.name,
          projectNumber: approvalProjects.projectNumber,
          assignedToName: approvalRfis.assignedToName,
          assignedToUserId: approvalRfis.assignedToUserId,
        })
        .from(approvalRfis)
        .innerJoin(approvalProjects, eq(approvalRfis.projectId, approvalProjects.id))
        .where(
          and(
            inArray(approvalRfis.status, ["open", "in_progress"]),
            lte(approvalRfis.dueAt, in48Hours)
          )
        );

      if (activeRfis.length === 0) {
        return res.json({
          ok: true,
          skipped: "no-rfis-due",
          duration: Date.now() - startTime,
        });
      }

      // Split into overdue vs due-soon
      const overdueRfis = activeRfis.filter((r) => r.dueAt && r.dueAt <= now);
      const dueSoonRfis = activeRfis.filter((r) => r.dueAt && r.dueAt > now && r.dueAt <= in48Hours);

      // Update overdue RFIs to "overdue" status
      if (overdueRfis.length > 0) {
        const overdueIds = overdueRfis.map((r) => r.rfiId);
        await db
          .update(approvalRfis)
          .set({ status: "overdue" })
          .where(inArray(approvalRfis.id, overdueIds));
      }

      // Build notification message for owner/push
      const lines: string[] = [];
      if (overdueRfis.length > 0) {
        lines.push(`🚨 ${overdueRfis.length} OVERDUE RFI${overdueRfis.length > 1 ? "s" : ""}:`);
        for (const r of overdueRfis.slice(0, 10)) {
          const daysPast = Math.ceil((now.getTime() - (r.dueAt?.getTime() || 0)) / (1000 * 60 * 60 * 24));
          lines.push(`  • [${r.projectNumber}] ${r.subject} — ${daysPast}d overdue${r.isBlocking ? " ⛔ BLOCKING" : ""}`);
        }
        if (overdueRfis.length > 10) lines.push(`  ... and ${overdueRfis.length - 10} more`);
      }
      if (dueSoonRfis.length > 0) {
        lines.push(`⚠️ ${dueSoonRfis.length} RFI${dueSoonRfis.length > 1 ? "s" : ""} due within 48h:`);
        for (const r of dueSoonRfis.slice(0, 10)) {
          const hoursLeft = Math.ceil(((r.dueAt?.getTime() || 0) - now.getTime()) / (1000 * 60 * 60));
          lines.push(`  • [${r.projectNumber}] ${r.subject} — ${hoursLeft}h remaining${r.isBlocking ? " ⛔ BLOCKING" : ""}`);
        }
        if (dueSoonRfis.length > 10) lines.push(`  ... and ${dueSoonRfis.length - 10} more`);
      }

      const notificationBody = lines.join("\n");
      const title = `RFI Alert: ${overdueRfis.length} overdue, ${dueSoonRfis.length} due soon`;

      // Send owner notification
      await notifyOwner({ title, content: notificationBody });

      // Collect all users to notify (assigned + admins)
      const assignedUserIds = Array.from(new Set(activeRfis.map((r) => r.assignedToUserId).filter(Boolean))) as number[];
      const adminUsers = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(inArray(users.role, ["admin", "super_admin"]));

      // Get assigned user details for email
      const assignedUsers = assignedUserIds.length > 0
        ? await db
            .select({ id: users.id, email: users.email, name: users.name })
            .from(users)
            .where(inArray(users.id, assignedUserIds))
        : [];

      // Combine all users to notify (dedup by id)
      const allUsersMap = new Map<number, { id: number; email: string | null; name: string | null }>();
      for (const u of assignedUsers) allUsersMap.set(u.id, u);
      for (const u of adminUsers) {
        if (!allUsersMap.has(u.id)) allUsersMap.set(u.id, u);
      }

      let emailsSent = 0;
      let pushesSent = 0;

      for (const [userId, userData] of Array.from(allUsersMap.entries())) {
        // Determine which RFIs are relevant to this user
        const isAssigned = assignedUserIds.includes(userId);
        const userRfis = isAssigned
          ? activeRfis.filter((r) => r.assignedToUserId === userId)
          : activeRfis; // Admins see all

        // Push notification
        const overdueCount = userRfis.filter((r) => r.dueAt && r.dueAt <= now).length;
        const dueCount = userRfis.filter((r) => r.dueAt && r.dueAt > now).length;
        const pushTitle = overdueCount > 0
          ? `${overdueCount} RFI${overdueCount > 1 ? "s" : ""} overdue`
          : `${dueCount} RFI${dueCount > 1 ? "s" : ""} due soon`;
        const pushBody = userRfis.slice(0, 3).map((r) => `[${r.projectNumber}] ${r.subject}`).join(", ");

        try {
          await sendPushToUser(userId, { title: pushTitle, body: pushBody, url: "/approvals/dashboard" });
          pushesSent++;
        } catch (e) {
          // Non-critical: user may not have push subscription — email will cover them
        }

        // Email digest (send to all users with an email address)
        if (userData.email) {
          try {
            const emailSubject = overdueCount > 0
              ? `⚠️ ${overdueCount} RFI${overdueCount > 1 ? "s" : ""} Overdue — Action Required`
              : `📋 ${dueCount} RFI${dueCount > 1 ? "s" : ""} Due Soon`;
            const htmlBody = buildEmailHtml(userRfis, now, userData.name || "Team");
            await sendNotificationEmail({
              to: userData.email,
              subject: emailSubject,
              htmlBody,
              fromName: "Altaspan Approvals",
              settingKey: "rfi_due_email",
            });
            emailsSent++;
          } catch (e) {
            console.error(`[RFI Due Notify] Email failed for user ${userId}:`, e);
          }
        }
      }

      return res.json({
        ok: true,
        overdueCount: overdueRfis.length,
        dueSoonCount: dueSoonRfis.length,
        notifiedUsers: allUsersMap.size,
        emailsSent,
        pushesSent,
        duration: Date.now() - startTime,
      });
    } catch (error: any) {
      console.error("[RFI Due Notify] Error:", error);
      return res.status(500).json({
        error: error.message || "Unknown error",
        stack: error.stack,
        context: { url: req.url, taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
