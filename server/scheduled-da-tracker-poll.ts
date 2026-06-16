/**
 * Scheduled DA Tracker Poll
 * Polls ACT ArcGIS REST API for active development applications,
 * detects new/updated/removed DAs, and dispatches webhook notifications.
 * Triggered by a Heartbeat cron job at /api/scheduled/da-tracker-poll (every 6 hours)
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { pollDaApplications, processWebhookDeliveries } from "./da-tracker-service";
import { runClientDaMatching, type CompetitorMatchAlert } from "./competitor-intel-service";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { eq } from "drizzle-orm";

let actDaPollRunning = false;

async function runScheduledDaTrackerPoll(startTime: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("DB unavailable");
  }

  const activeTenants = await db.select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const tenantResults = [];
  for (const tenant of activeTenants) {
    console.log(`[DaTrackerPoll] Starting ACT ArcGIS poll for tenant ${tenant.id} (${tenant.name})...`);
    const pollResult = await pollDaApplications({ tenantId: tenant.id });
    console.log(`[DaTrackerPoll] Tenant ${tenant.id} poll complete. New: ${pollResult.newCount}, Updated: ${pollResult.updatedCount}, Removed: ${pollResult.removedCount}, Total: ${pollResult.totalFetched}`);

    // Process pending webhook deliveries
    console.log(`[DaTrackerPoll] Processing pending webhook deliveries for tenant ${tenant.id}...`);
    const deliveryResult = await processWebhookDeliveries({ tenantId: tenant.id });
    console.log(`[DaTrackerPoll] Tenant ${tenant.id} deliveries complete. Delivered: ${deliveryResult.delivered}, Failed: ${deliveryResult.failed}`);

    // Auto-sync: run client-DA matching for new leads (non-blocking)
    let matchResult = { matched: 0, skipped: 0, errors: [] as string[], newCompetitorMatches: [] as CompetitorMatchAlert[] };
    try {
      console.log(`[DaTrackerPoll] Running client-DA matching for tenant ${tenant.id}...`);
      matchResult = await runClientDaMatching({ forceRefresh: false, tenantId: tenant.id });
      console.log(`[DaTrackerPoll] Tenant ${tenant.id} client-DA matching complete. Matched: ${matchResult.matched}, Skipped: ${matchResult.skipped}, New competitor: ${matchResult.newCompetitorMatches.length}`);

      // Notify owner if new "Lost to Competitor" matches detected
      if (matchResult.newCompetitorMatches.length > 0) {
        try {
          const alerts = matchResult.newCompetitorMatches;
          const title = `\u26A0\uFE0F ${alerts.length} new competitor DA${alerts.length > 1 ? "s" : ""} detected at ${tenant.name} lead addresses`;
          const lines = alerts.slice(0, 5).map(a =>
            `\u2022 ${a.companyName} lodged DA ${a.daNumber} at ${a.address}${a.suburb ? `, ${a.suburb}` : ""}${a.leadName ? ` (Lead: ${a.leadName})` : ""}`
          );
          if (alerts.length > 5) {
            lines.push(`...and ${alerts.length - 5} more. View all in Competitor Intel > Lost to Competitor.`);
          }
          const content = lines.join("\n");
          await notifyOwner({ tenantId: tenant.id, title, content, settingKey: "notify_competitor_da_match" });
          console.log(`[DaTrackerPoll] Tenant ${tenant.id} competitor match notification sent (${alerts.length} matches)`);
        } catch (notifyErr: any) {
          console.error(`[DaTrackerPoll] Tenant ${tenant.id} notification error (non-fatal):`, notifyErr.message);
        }
      }
    } catch (matchErr: any) {
      console.error(`[DaTrackerPoll] Tenant ${tenant.id} client-DA matching error (non-fatal):`, matchErr.message);
    }

    tenantResults.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      poll: pollResult,
      deliveries: deliveryResult,
      clientDaMatching: matchResult,
    });
  }

  return {
    ok: true,
    tenantResults,
    duration: Date.now() - startTime,
  };
}

export function registerScheduledDaTrackerPoll(app: Express) {
  app.post("/api/scheduled/da-tracker-poll", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      if (req.query.wait === "1") {
        return res.json(await runScheduledDaTrackerPoll(startTime));
      }

      if (actDaPollRunning) {
        return res.status(202).json({
          ok: true,
          queued: false,
          alreadyRunning: true,
          message: "ACT DA poll is already running.",
        });
      }

      actDaPollRunning = true;
      void runScheduledDaTrackerPoll(startTime)
        .then((result) => console.log(`[DaTrackerPoll] Background poll complete in ${result.duration}ms`))
        .catch((err) => console.error("[DaTrackerPoll] Background poll failed:", err))
        .finally(() => { actDaPollRunning = false; });

      return res.status(202).json({
        ok: true,
        queued: true,
        mode: "background",
        message: "ACT DA poll queued.",
      });
    } catch (err: any) {
      console.error("[DaTrackerPoll] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  });
}
