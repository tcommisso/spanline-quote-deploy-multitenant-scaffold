/**
 * Scheduled SMS Reminders
 * Sends SMS reminders to installers 24 hours before their scheduled events.
 * Triggered by a Heartbeat cron job at /api/scheduled/sms-reminders
 */

import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { constructionScheduleEvents, constructionInstallers, constructionJobs, smsDeliveryLog } from "../drizzle/schema";
import { eq, and, gte, lte, isNotNull, or, isNull } from "drizzle-orm";
import * as vocphone from "./vocphone";
import { normaliseAuPhone } from "./construction-notifications";
import { getScheduledTenants } from "./_core/scheduled-tenants";

function getSender(): string {
  return process.env.VOCPHONE_SMS_SENDER || "61480855750";
}

export function registerScheduledSmsReminders(app: Express) {
  app.post("/api/scheduled/sms-reminders", async (req: Request, res: Response) => {
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Find events starting in the next 24-26 hours (window to account for cron timing)
      const now = new Date();
      const from = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23h from now
      const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // 25h from now

      const tenants = await getScheduledTenants();
      let sent = 0;
      let failed = 0;
      let eventsFound = 0;
      const results: Array<{ tenantId: number; eventId: number; installer: string; status: string; error?: string }> = [];

      for (const tenant of tenants) {
        const upcomingEvents = await db
          .select({
            event: constructionScheduleEvents,
            installer: constructionInstallers,
            job: constructionJobs,
          })
          .from(constructionScheduleEvents)
          .innerJoin(constructionInstallers, eq(constructionScheduleEvents.assignedInstallerId, constructionInstallers.id))
          .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
          .where(and(
            eq(constructionJobs.tenantId, tenant.id),
            or(eq(constructionInstallers.tenantId, tenant.id), isNull(constructionInstallers.tenantId)),
            gte(constructionScheduleEvents.startTime, from),
            lte(constructionScheduleEvents.startTime, to),
            eq(constructionScheduleEvents.status, "scheduled"),
            isNotNull(constructionInstallers.phone),
          ));

        eventsFound += upcomingEvents.length;
        const tenantSender = await vocphone
          .getSmsNumbers(tenant.id)
          .then((numbers) => numbers.list[0]?.number || getSender())
          .catch(() => getSender());

        for (const row of upcomingEvents) {
          const phone = normaliseAuPhone(row.installer.phone || "");
          if (!phone) {
            results.push({ tenantId: tenant.id, eventId: row.event.id, installer: row.installer.name, status: "skipped", error: "Invalid phone" });
            continue;
          }

          const eventDate = new Date(row.event.startTime).toLocaleDateString("en-AU", {
            weekday: "short", day: "numeric", month: "short",
          });
          const eventTime = row.event.allDay ? "All day" : new Date(row.event.startTime).toLocaleTimeString("en-AU", {
            hour: "2-digit", minute: "2-digit",
          });

          const body = `Reminder: You have a ${row.event.eventType} tomorrow.\n\nClient: ${row.job.clientName}\nSite: ${row.job.siteAddress || "TBC"}\nDate: ${eventDate}\nTime: ${eventTime}\nDetails: ${row.event.title}\n\n- Altaspan Construction`;

          try {
            await vocphone.sendSms({ tenantId: tenant.id, recipient: phone, sender: tenantSender, body });
            await db.insert(smsDeliveryLog).values({
              jobId: row.event.jobId,
              installerId: row.installer.id,
              recipient: phone,
              sender: tenantSender,
              body,
              status: "sent",
            });
            sent++;
            results.push({ tenantId: tenant.id, eventId: row.event.id, installer: row.installer.name, status: "sent" });
          } catch (err: any) {
            failed++;
            try {
              await db.insert(smsDeliveryLog).values({
                jobId: row.event.jobId,
                installerId: row.installer.id,
                recipient: phone,
                sender: tenantSender,
                body,
                status: "failed",
                errorMessage: err?.message || String(err),
              });
            } catch (_) { /* ignore logging failure */ }
            results.push({ tenantId: tenant.id, eventId: row.event.id, installer: row.installer.name, status: "failed", error: err?.message });
          }
        }
      }

      console.log(`[SMS Reminders] Processed ${eventsFound} events: ${sent} sent, ${failed} failed`);

      res.json({
        ok: true,
        eventsFound,
        sent,
        failed,
        results,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[SMS Reminders] Handler error:", err);
      res.status(500).json({
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
