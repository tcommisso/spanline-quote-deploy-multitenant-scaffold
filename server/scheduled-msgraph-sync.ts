/**
 * Scheduled Microsoft Graph Email Sync
 * Heartbeat cron endpoint that polls all configured Graph mailboxes for new messages.
 * Endpoint: /api/scheduled/msgraph-email-sync
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { syncAllMailboxes } from "./email/msgraph-sync";

export function registerScheduledMsGraphSync(app: Express) {
  app.post("/api/scheduled/msgraph-email-sync", async (req: Request, res: Response) => {
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      console.log("[MSGraph Sync] Heartbeat triggered — starting sync...");
      const results = await syncAllMailboxes();

      const totalNew = results.reduce((sum, r) => sum + r.newMessages, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      console.log(`[MSGraph Sync] Complete — ${totalNew} new messages, ${totalErrors} errors across ${results.length} mailbox(es)`);

      return res.json({
        success: true,
        mailboxes: results.length,
        totalNewMessages: totalNew,
        totalErrors,
        details: results.map(r => ({
          mailbox: r.mailbox,
          newMessages: r.newMessages,
          errors: r.errors.length,
        })),
      });
    } catch (err: any) {
      console.error("[MSGraph Sync] Scheduled handler error:", err);
      return res.status(500).json({ error: err.message || "Internal error" });
    }
  });
}
