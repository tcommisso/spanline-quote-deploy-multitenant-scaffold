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
import { approvalConditions, approvalProjects, users } from "../drizzle/schema";
import { eq, and, isNotNull, notInArray } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { sendNotificationEmail } from "./email";

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

      // Get all unsatisfied conditions with a due date
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
        })
        .from(approvalConditions)
        .where(
          and(
            isNotNull(approvalConditions.dueAt),
            notInArray(approvalConditions.status, ["satisfied", "waived", "not_applicable"])
          )
        );

      if (conditions.length === 0) {
        return res.json({
          ok: true,
          skipped: true,
          reason: "No conditions with due dates pending",
          duration: Date.now() - startTime,
        });
      }

      const now = new Date();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Categorise conditions
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

      // Get project names for context
      const projectIds = Array.from(new Set([...overdue, ...dueTomorrow, ...dueIn7Days].map(c => c.projectId)));
      const projects = projectIds.length > 0
        ? await db.select({ id: approvalProjects.id, name: approvalProjects.name, projectNumber: approvalProjects.projectNumber })
            .from(approvalProjects)
            .where(
              projectIds.length === 1
                ? eq(approvalProjects.id, projectIds[0])
                : undefined as any // fallback handled below
            )
        : [];

      // Simpler: fetch all projects for the condition project IDs
      const projectMap = new Map<number, { name: string; projectNumber: string }>();
      if (projectIds.length > 0) {
        for (const pid of projectIds) {
          const [proj] = await db.select({ name: approvalProjects.name, projectNumber: approvalProjects.projectNumber })
            .from(approvalProjects)
            .where(eq(approvalProjects.id, pid))
            .limit(1);
          if (proj) projectMap.set(pid, proj);
        }
      }

      // Build notification content
      const lines: string[] = [];
      let emailHtml = "";

      if (overdue.length > 0) {
        lines.push(`🔴 OVERDUE (${overdue.length}):`);
        emailHtml += `<h3 style="color:#dc2626;">Overdue Conditions (${overdue.length})</h3><ul>`;
        for (const c of overdue) {
          const proj = projectMap.get(c.projectId);
          const daysOverdue = Math.floor((now.getTime() - new Date(c.dueAt!).getTime()) / oneDayMs);
          const line = `${proj?.projectNumber || ""} ${proj?.name || ""} — ${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title} (${daysOverdue}d overdue${c.isBlocking ? ", BLOCKING" : ""})`;
          lines.push(`  • ${line}`);
          emailHtml += `<li><strong>${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}</strong> — ${proj?.name || "Unknown"} (${daysOverdue} days overdue${c.isBlocking ? ", <span style='color:red'>BLOCKING</span>" : ""})</li>`;
        }
        emailHtml += "</ul>";
      }

      if (dueTomorrow.length > 0) {
        lines.push(`🟠 DUE TOMORROW (${dueTomorrow.length}):`);
        emailHtml += `<h3 style="color:#ea580c;">Due Tomorrow (${dueTomorrow.length})</h3><ul>`;
        for (const c of dueTomorrow) {
          const proj = projectMap.get(c.projectId);
          const line = `${proj?.projectNumber || ""} ${proj?.name || ""} — ${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}${c.isBlocking ? " (BLOCKING)" : ""}`;
          lines.push(`  • ${line}`);
          emailHtml += `<li><strong>${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}</strong> — ${proj?.name || "Unknown"}${c.isBlocking ? " <span style='color:red'>(BLOCKING)</span>" : ""}</li>`;
        }
        emailHtml += "</ul>";
      }

      if (dueIn7Days.length > 0) {
        lines.push(`🟡 DUE WITHIN 7 DAYS (${dueIn7Days.length}):`);
        emailHtml += `<h3 style="color:#ca8a04;">Due Within 7 Days (${dueIn7Days.length})</h3><ul>`;
        for (const c of dueIn7Days) {
          const proj = projectMap.get(c.projectId);
          const daysLeft = Math.floor((new Date(c.dueAt!).getTime() - now.getTime()) / oneDayMs);
          const line = `${proj?.projectNumber || ""} ${proj?.name || ""} — ${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title} (${daysLeft}d remaining${c.isBlocking ? ", BLOCKING" : ""})`;
          lines.push(`  • ${line}`);
          emailHtml += `<li><strong>${c.conditionNumber ? c.conditionNumber + ". " : ""}${c.title}</strong> — ${proj?.name || "Unknown"} (${daysLeft} days remaining${c.isBlocking ? ", <span style='color:red'>BLOCKING</span>" : ""})</li>`;
        }
        emailHtml += "</ul>";
      }

      const totalAlerts = overdue.length + dueTomorrow.length + dueIn7Days.length;

      if (totalAlerts === 0) {
        return res.json({
          ok: true,
          skipped: true,
          reason: "No conditions due within 7 days or overdue",
          duration: Date.now() - startTime,
        });
      }

      // Send push notification to owner
      const title = `Condition Reminders: ${overdue.length} overdue, ${dueTomorrow.length} due tomorrow, ${dueIn7Days.length} due this week`;
      const content = lines.join("\n");
      const delivered = await notifyOwner({ title, content });

      // Send email to owner
      const ownerEmail = process.env.OWNER_EMAIL || "";
      if (ownerEmail) {
        await sendNotificationEmail({
          to: ownerEmail,
          subject: `[Altaspan] ${totalAlerts} Approval Condition${totalAlerts > 1 ? "s" : ""} Require Attention`,
          htmlBody: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px;">
              <h2 style="margin-bottom: 4px;">Approval Condition Due-Date Reminders</h2>
              <p style="color: #6b7280; margin-top: 0;">Daily summary — ${now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              ${emailHtml}
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="color: #9ca3af; font-size: 12px;">This is an automated reminder from Altaspan Approvals.</p>
            </div>
          `,
          settingKey: "condition_due_reminder",
        });
      }

      console.log(`[ConditionDueReminder] ${totalAlerts} alerts sent. Overdue: ${overdue.length}, Tomorrow: ${dueTomorrow.length}, 7-day: ${dueIn7Days.length}`);

      return res.json({
        ok: true,
        overdueCount: overdue.length,
        dueTomorrowCount: dueTomorrow.length,
        dueIn7DaysCount: dueIn7Days.length,
        notificationSent: delivered,
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
