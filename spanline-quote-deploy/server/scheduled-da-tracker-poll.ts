/**
 * Scheduled DA Tracker Poll
 * Polls ACT ArcGIS REST API for active development applications,
 * detects new/updated/removed DAs, and dispatches webhook notifications.
 * Triggered by a Heartbeat cron job at /api/scheduled/da-tracker-poll (every 6 hours)
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { pollDaApplications, processWebhookDeliveries } from "./da-tracker-service";
import { runClientDaMatching, type CompetitorMatchAlert } from "./competitor-intel-service";
import { notifyOwner } from "./_core/notification";

export function registerScheduledDaTrackerPoll(app: Express) {
  app.post("/api/scheduled/da-tracker-poll", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      console.log("[DaTrackerPoll] Starting poll of ACT ArcGIS DA applications...");
      const pollResult = await pollDaApplications();
      console.log(`[DaTrackerPoll] Poll complete. New: ${pollResult.newCount}, Updated: ${pollResult.updatedCount}, Removed: ${pollResult.removedCount}, Total: ${pollResult.totalFetched}`);

      // Process pending webhook deliveries
      console.log("[DaTrackerPoll] Processing pending webhook deliveries...");
      const deliveryResult = await processWebhookDeliveries();
      console.log(`[DaTrackerPoll] Deliveries complete. Delivered: ${deliveryResult.delivered}, Failed: ${deliveryResult.failed}`);

      // Auto-sync: run client-DA matching for new leads (non-blocking)
      let matchResult = { matched: 0, skipped: 0, errors: [] as string[], newCompetitorMatches: [] as CompetitorMatchAlert[] };
      try {
        console.log("[DaTrackerPoll] Running client-DA matching (auto-sync)...");
        matchResult = await runClientDaMatching({ forceRefresh: false });
        console.log(`[DaTrackerPoll] Client-DA matching complete. Matched: ${matchResult.matched}, Skipped: ${matchResult.skipped}, New competitor: ${matchResult.newCompetitorMatches.length}`);

        // Notify owner if new "Lost to Competitor" matches detected
        if (matchResult.newCompetitorMatches.length > 0) {
          try {
            const alerts = matchResult.newCompetitorMatches;
            const title = `\u26A0\uFE0F ${alerts.length} new competitor DA${alerts.length > 1 ? "s" : ""} detected at your lead addresses`;
            const lines = alerts.slice(0, 5).map(a =>
              `\u2022 ${a.companyName} lodged DA ${a.daNumber} at ${a.address}${a.suburb ? `, ${a.suburb}` : ""}${a.leadName ? ` (Lead: ${a.leadName})` : ""}`
            );
            if (alerts.length > 5) {
              lines.push(`...and ${alerts.length - 5} more. View all in Competitor Intel > Lost to Competitor.`);
            }
            const content = lines.join("\n");
            await notifyOwner({ title, content, settingKey: "notify_competitor_da_match" });
            console.log(`[DaTrackerPoll] Competitor match notification sent (${alerts.length} matches)`);
          } catch (notifyErr: any) {
            console.error("[DaTrackerPoll] Notification error (non-fatal):", notifyErr.message);
          }
        }
      } catch (matchErr: any) {
        console.error("[DaTrackerPoll] Client-DA matching error (non-fatal):", matchErr.message);
      }

      return res.json({
        ok: true,
        poll: pollResult,
        deliveries: deliveryResult,
        clientDaMatching: matchResult,
        duration: Date.now() - startTime,
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
