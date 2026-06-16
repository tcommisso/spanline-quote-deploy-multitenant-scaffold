/**
 * Scheduled Approvals Overdue Notification
 * Sends a push notification to the project owner when approval applications have been
 * pending/lodged longer than the configurable threshold (default 30 days).
 * Triggered by a Heartbeat cron job at /api/scheduled/ba-overdue-notify
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { crmBuildingAuthority, crmLeads } from "../drizzle/schema";
import { eq, and, or, isNotNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { getTenantAppSetting } from "./tenant-settings-store";
import { getScheduledTenants } from "./_core/scheduled-tenants";

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

      const tenants = await getScheduledTenants();
      let totalOverdue = 0;
      let notificationSent = false;

      for (const tenant of tenants) {
        const overdueDays = (await getTenantAppSetting<number>(tenant.id, "baOverdueThresholdDays")) ?? 30;
        const cutoff = Date.now() - overdueDays * 24 * 60 * 60 * 1000;

        const baRows = await db
          .select({
            id: crmBuildingAuthority.id,
            leadId: crmBuildingAuthority.leadId,
            status: crmBuildingAuthority.status,
            applicationDate: crmBuildingAuthority.applicationDate,
            councilName: crmBuildingAuthority.councilName,
            leadFirstName: crmLeads.contactFirstName,
            leadLastName: crmLeads.contactLastName,
            leadNumber: crmLeads.leadNumber,
          })
          .from(crmBuildingAuthority)
          .innerJoin(crmLeads, eq(crmBuildingAuthority.leadId, crmLeads.id))
          .where(
            and(
              eq(crmLeads.tenantId, tenant.id),
              or(
                eq(crmBuildingAuthority.status, "pending"),
                eq(crmBuildingAuthority.status, "lodged"),
                eq(crmBuildingAuthority.status, "submitted"),
              ),
              isNotNull(crmBuildingAuthority.applicationDate)
            )
          );

        const overdueApps = baRows.filter(r => {
          if (!r.applicationDate) return false;
          return new Date(r.applicationDate).getTime() < cutoff;
        });

        if (overdueApps.length === 0) {
          continue;
        }

        totalOverdue += overdueApps.length;
        const lines = overdueApps.map(app => {
          const daysOverdue = Math.floor((Date.now() - new Date(app.applicationDate!).getTime()) / (1000 * 60 * 60 * 24));
          const clientName = `${app.leadFirstName || ""} ${app.leadLastName || ""}`.trim() || app.leadNumber || "Unknown";
          const council = app.councilName || "Unknown council";
          return `* ${clientName} - ${council} (${daysOverdue} days, ${app.status})`;
        });

        const title = `${overdueApps.length} Approval Application${overdueApps.length > 1 ? "s" : ""} Overdue (>${overdueDays} days)`;
        const delivered = await notifyOwner({ tenantId: tenant.id, title, content: lines.join("\n") });
        notificationSent = notificationSent || delivered;
      }

      console.log(`[BaOverdueNotify] ${totalOverdue} overdue approval apps across ${tenants.length} tenant(s).`);

      return res.json({
        ok: true,
        overdueCount: totalOverdue,
        skipped: totalOverdue === 0,
        reason: totalOverdue === 0 ? "No overdue approval applications" : undefined,
        notificationSent,
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
