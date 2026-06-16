/**
 * Scheduled Approvals Overdue Notification
 * Sends a push notification to the project owner when approval applications have been
 * pending/lodged longer than the configurable threshold (default 30 days).
 * Triggered by a Heartbeat cron job at /api/scheduled/ba-overdue-notify
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { crmBuildingAuthority, constructionJobs } from "../drizzle/schema";
import { eq, and, or, isNotNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { getPrimaryTenantAppSetting } from "./tenant-settings-store";

export function registerScheduledBaOverdueNotify(app: Express) {
  app.post("/api/scheduled/ba-overdue-notify", async (req: Request, res: Response) => {
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

      const overdueDays = (await getPrimaryTenantAppSetting<number>("baOverdueThresholdDays")) ?? 30;
      const cutoff = Date.now() - overdueDays * 24 * 60 * 60 * 1000;

      // Get all pending/lodged approval applications
      const baRows = await db
        .select({
          id: crmBuildingAuthority.id,
          leadId: crmBuildingAuthority.leadId,
          status: crmBuildingAuthority.status,
          applicationDate: crmBuildingAuthority.applicationDate,
          councilName: crmBuildingAuthority.councilName,
        })
        .from(crmBuildingAuthority)
        .where(
          and(
            or(
              eq(crmBuildingAuthority.status, "pending"),
              eq(crmBuildingAuthority.status, "lodged"),
              eq(crmBuildingAuthority.status, "submitted"),
            ),
            isNotNull(crmBuildingAuthority.applicationDate)
          )
        );

      // Filter to overdue ones
      const overdueApps = baRows.filter(r => {
        if (!r.applicationDate) return false;
        return new Date(r.applicationDate).getTime() < cutoff;
      });

      if (overdueApps.length === 0) {
        console.log("[BaOverdueNotify] No overdue approval applications — skipping");
        return res.json({
          ok: true,
          skipped: true,
          reason: "No overdue approval applications",
          duration: Date.now() - startTime,
        });
      }

      // Get client names for the overdue applications
      const leadIds = overdueApps.map(a => a.leadId);
      const jobs = await db
        .select({
          leadId: constructionJobs.leadId,
          clientName: constructionJobs.clientName,
        })
        .from(constructionJobs)
        .where(
          or(...leadIds.map(id => eq(constructionJobs.leadId, id)))
        );

      const clientNameByLeadId = new Map(jobs.map(j => [j.leadId, j.clientName]));

      // Build notification content
      const lines = overdueApps.map(app => {
        const daysOverdue = Math.floor((Date.now() - new Date(app.applicationDate!).getTime()) / (1000 * 60 * 60 * 24));
        const clientName = clientNameByLeadId.get(app.leadId) || "Unknown";
        const council = app.councilName || "Unknown council";
        return `• ${clientName} — ${council} (${daysOverdue} days, ${app.status})`;
      });

      const title = `${overdueApps.length} Approval Application${overdueApps.length > 1 ? "s" : ""} Overdue (>${overdueDays} days)`;
      const content = lines.join("\n");

      // Send push notification to owner
      const delivered = await notifyOwner({ title, content });

      console.log(`[BaOverdueNotify] ${overdueApps.length} overdue approval apps. Notification ${delivered ? "sent" : "failed"}.`);

      return res.json({
        ok: true,
        overdueCount: overdueApps.length,
        notificationSent: delivered,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[BaOverdueNotify] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/ba-overdue-notify", taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
