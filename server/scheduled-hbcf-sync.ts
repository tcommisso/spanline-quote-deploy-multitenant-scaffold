/**
 * Scheduled HBCF certificate sync.
 * Refreshes tenant HBCF certificate registers from the configured API.
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getScheduledTenants } from "./_core/scheduled-tenants";
import { syncTenantHbcfCertificatesFromApi } from "./hbcf-service";

let hbcfSyncRunning = false;

async function runScheduledHbcfSync(startTime: number) {
  const tenants = await getScheduledTenants();
  const tenantResults = [];

  for (const tenant of tenants) {
    try {
      const result = await syncTenantHbcfCertificatesFromApi(tenant.id, null);
      tenantResults.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ok: true,
        ...result,
      });
    } catch (error: any) {
      tenantResults.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  return {
    ok: tenantResults.some((result) => result.ok),
    tenantResults,
    duration: Date.now() - startTime,
  };
}

export function registerScheduledHbcfSync(app: Express) {
  app.post("/api/scheduled/hbcf-sync", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      if (req.query.wait === "1") {
        return res.json(await runScheduledHbcfSync(startTime));
      }

      if (hbcfSyncRunning) {
        return res.status(202).json({
          ok: true,
          queued: false,
          alreadyRunning: true,
          message: "HBCF sync is already running.",
        });
      }

      hbcfSyncRunning = true;
      void runScheduledHbcfSync(startTime)
        .then((result) => console.log(`[HBCF Sync] Background sync complete in ${result.duration}ms`))
        .catch((error) => console.error("[HBCF Sync] Background sync failed:", error))
        .finally(() => { hbcfSyncRunning = false; });

      return res.status(202).json({
        ok: true,
        queued: true,
        mode: "background",
        message: "HBCF sync queued.",
      });
    } catch (error: any) {
      hbcfSyncRunning = false;
      console.error("[HBCF Sync] Failed:", error);
      return res.status(500).json({
        error: "scheduled-hbcf-sync-failed",
        message: error?.message || String(error),
      });
    }
  });
}
