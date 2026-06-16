/**
 * Scheduled Condition Due-Date Reminder
 * Sends email + push notifications for approval conditions approaching their due date.
 * Triggers: 7-day warning and 1-day warning, plus overdue alerts.
 * Cron: Daily at 07:00 AEST (21:00 UTC previous day) → "0 0 21 * * *"
 * Endpoint: /api/scheduled/condition-due-reminder
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { approvalConditions, approvalProjects } from "../drizzle/schema";
import { eq, and, isNotNull, notInArray } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { sendNotificationEmail } from "./email";
import { getScheduledTenants, getTenantNotificationRecipients } from "./_core/scheduled-tenants";

export function registerScheduledConditionDueReminder(app: Express) {
  app.post("/api/scheduled/condition-due-reminder", async (req: Request, res: Response) => {
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
      const oneDayMs = 24 * 60 * 60 * 1000;
      const tenants = await getScheduledTenants();
      let totalOverdue = 0;
      let totalDueTomorrow = 0;
      let totalDueIn7Days = 0;
      let emailsSent = 0;
      let notificationsSent = 0;

      for (const tenant of tenants) {
        const conditions = await db
          .select({
            id: approvalConditions.id,
            projectId: approvalConditions.projectId,
            conditionNumber: approvalConditions.conditionNumber,
            title: approvalConditions.title,
            category: approvalConditions.category,
            isBlocking: approvalConditions.isBlocking,
            dueAt: approvalConditions.dueAt,
            assignedToUserId: approvalConditions.assignedToUserId,
            assignedToName: approvalConditions.assignedToName,
            projectName: approvalProjects.name,
            projectNumber: approvalProjects.projectNumber,
          })
          .from(approvalConditions)
          .innerJoin(approvalProjects, eq(approvalConditions.projectId, approvalProjects.id))
          .where(
            and(
              eq(approvalProjects.tenantId, tenant.id),
              isNotNull(approvalConditions.dueAt),
              notInArray(approvalConditions.status, ["satisfied", "waived", "not_applicable"])
            )
          );

        if (conditions.length === 0) continue;

        const overdue: typeof conditions = [];
        const dueTomorrow: typeof conditions = [];
        const dueIn7Days: typeof conditions = [];

        for (const c of conditions) {
          if (!c.dueAt) continue;
          const dueDate = new Date(c.dueAt);
          const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / oneDayMs);

          if (daysUntilDue < 0) {
            overdue.push(c);
          } else if (daysUntilDue <= 1) {
            dueTomorrow.push(c);
          } else if (daysUntilDue <= 7 && daysUntilDue > 1) {
            dueIn7Days.push(c);
          }
        }

        const totalAlerts = overdue.length + dueTomorrow.length + dueIn7Days.length;
        if (totalAlerts === 0) continue;

        totalOverdue += overdue.length;
        totalDueTomorrow += dueTomorrow.length;
        totalDueIn7Days += dueIn7Days.length;

        const lines: string[] = [];
        let emailHtml = "";

        if (overdue.length > 0) {
          lines.push(`OVERDUE (${overdue.length}):`);
          emailHtml += `<h3 style="color:#dc2626;">Overdue Conditions (${overdue.length})</h3><ul>`;
          for (const c of overdue) {
            const daysOverdue = Math.floor((now.getTime() - new Date(c.dueAt!).getTime()) / oneDayMs);
            const line = `${c.projectNumber || ""} ${c.projectName || ""} - ${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title} (${daysOverdue}d overdue${c.isBlocking ? ", BLOCKING" : ""})`;
            lines.push(`  * ${line}`);
            emailHtml += `<li><strong>${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}</strong> - ${c.projectName || "Unknown"} (${daysOverdue} days overdue${c.isBlocking ? ", <span style='color:red'>BLOCKING</span>" : ""})</li>`;
          }
          emailHtml += "</ul>";
        }

        if (dueTomorrow.length > 0) {
          lines.push(`DUE TOMORROW (${dueTomorrow.length}):`);
          emailHtml += `<h3 style="color:#ea580c;">Due Tomorrow (${dueTomorrow.length})</h3><ul>`;
          for (const c of dueTomorrow) {
            const line = `${c.projectNumber || ""} ${c.projectName || ""} - ${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}${c.isBlocking ? " (BLOCKING)" : ""}`;
            lines.push(`  * ${line}`);
            emailHtml += `<li><strong>${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}</strong> - ${c.projectName || "Unknown"}${c.isBlocking ? " <span style='color:red'>(BLOCKING)</span>" : ""}</li>`;
          }
          emailHtml += "</ul>";
        }

        if (dueIn7Days.length > 0) {
          lines.push(`DUE WITHIN 7 DAYS (${dueIn7Days.length}):`);
          emailHtml += `<h3 style="color:#ca8a04;">Due Within 7 Days (${dueIn7Days.length})</h3><ul>`;
          for (const c of dueIn7Days) {
            const daysLeft = Math.floor((new Date(c.dueAt!).getTime() - now.getTime()) / oneDayMs);
            const line = `${c.projectNumber || ""} ${c.projectName || ""} - ${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title} (${daysLeft}d remaining${c.isBlocking ? ", BLOCKING" : ""})`;
            lines.push(`  * ${line}`);
            emailHtml += `<li><strong>${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}</strong> - ${c.projectName || "Unknown"} (${daysLeft} days remaining${c.isBlocking ? ", <span style='color:red'>BLOCKING</span>" : ""})</li>`;
          }
          emailHtml += "</ul>";
        }

        const title = `Condition Reminders: ${overdue.length} overdue, ${dueTomorrow.length} due tomorrow, ${dueIn7Days.length} due this week`;
        const delivered = await notifyOwner({ tenantId: tenant.id, title, content: lines.join("\n") });
        if (delivered) notificationsSent++;

        const recipients = await getTenantNotificationRecipients(tenant.id, {
          appRoles: ["admin", "super_admin", "office_user"],
        });
        for (const recipient of recipients) {
          const result = await sendNotificationEmail({
            tenantId: tenant.id,
            to: recipient.email,
            subject: `[Altaspan] ${totalAlerts} Approval Condition${totalAlerts > 1 ? "s" : ""} Require Attention`,
            htmlBody: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px;">
                <h2 style="margin-bottom: 4px;">Approval Condition Due-Date Reminders</h2>
                <p style="color: #6b7280; margin-top: 0;">Daily summary - ${now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                ${emailHtml}
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                <p style="color: #9ca3af; font-size: 12px;">This is an automated reminder from Altaspan Approvals.</p>
              </div>
            `,
            module: "approvals",
            settingKey: "condition_due_reminder",
          });
          if (result.success) emailsSent++;
        }
      }

      const totalAlerts = totalOverdue + totalDueTomorrow + totalDueIn7Days;
      console.log(`[ConditionDueReminder] ${totalAlerts} alerts processed. Overdue: ${totalOverdue}, Tomorrow: ${totalDueTomorrow}, 7-day: ${totalDueIn7Days}`);

      return res.json({
        ok: true,
        overdueCount: totalOverdue,
        dueTomorrowCount: totalDueTomorrow,
        dueIn7DaysCount: totalDueIn7Days,
        skipped: totalAlerts === 0,
        reason: totalAlerts === 0 ? "No conditions due within 7 days or overdue" : undefined,
        notificationSent: notificationsSent > 0,
        emailsSent,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[ConditionDueReminder] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/condition-due-reminder" },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
