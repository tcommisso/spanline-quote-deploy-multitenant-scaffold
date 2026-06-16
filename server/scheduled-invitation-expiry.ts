/**
 * Scheduled Invitation Expiry Cleanup
 * Marks pending invitations past their expiresAt date as "expired".
 * Triggered by a Heartbeat cron job at /api/scheduled/invitation-expiry (daily at 2am UTC)
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import { invitations } from "../drizzle/schema";
import { and, eq, lt, sql } from "drizzle-orm";

export function registerScheduledInvitationExpiry(app: Express) {
  app.post("/api/scheduled/invitation-expiry", async (req: Request, res: Response) => {
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

      // Find and mark all pending invitations that have expired
      const result = await db.update(invitations)
        .set({ status: "expired" })
        .where(and(
          eq(invitations.status, "pending"),
          lt(invitations.expiresAt, new Date())
        ));

      const expiredCount = (result as any)[0]?.affectedRows ?? 0;

      const duration = Date.now() - startTime;
      return res.json({
        ok: true,
        expiredCount,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[scheduled/invitation-expiry] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
        context: { url: "/api/scheduled/invitation-expiry", taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
