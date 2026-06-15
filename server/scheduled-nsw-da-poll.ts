/**
 * Scheduled NSW DA Poll
 * Polls NSW Planning Portal DAApplicationTracker API for all target councils,
 * stores relevant outdoor-living DAs, and optionally sends a weekly digest.
 * Triggered by a Heartbeat cron job at /api/scheduled/nsw-da-poll (weekly on Monday 7am AEST)
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { pollNswDaApplications, getRecentRelevantNswDas, NSW_TARGET_COUNCILS } from "./nsw-da-service";
import { scrapeAndStoreT1CloudDas } from "./t1cloud-scraper-service";
import { notifyOwner } from "./_core/notification";
import { sendNotificationEmail } from "./email";
import { getDb } from "./db";
import { tenantMemberships, tenants, users } from "../drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

export function registerScheduledNswDaPoll(app: Express) {
  app.post("/api/scheduled/nsw-da-poll", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "DB unavailable" });
      }

      const activeTenants = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      const tenantResults = [];
      for (const tenant of activeTenants) {
        console.log(`[NswDaPoll] Starting NSW Planning Portal poll for tenant ${tenant.id} (${tenant.name})...`);
        const pollResult = await pollNswDaApplications({ tenantId: tenant.id });
        console.log(`[NswDaPoll] Tenant ${tenant.id} poll complete. New: ${pollResult.totalNew}, Updated: ${pollResult.totalUpdated}, Relevant: ${pollResult.totalRelevant}`);

        for (const r of pollResult.results) {
          if (r.errors.length > 0) {
            console.warn(`[NswDaPoll] tenant=${tenant.id} ${r.council}: ${r.errors.join(", ")}`);
          } else {
            console.log(`[NswDaPoll] tenant=${tenant.id} ${r.council}: fetched=${r.totalFetched}, new=${r.newCount}, relevant=${r.relevantCount}`);
          }
        }

        // Phase 2: Scrape T1Cloud portals for builder/applicant names (tenant planning config can narrow councils)
        let scrapeResult;
        try {
          console.log(`[NswDaPoll] Starting T1Cloud scrape for tenant ${tenant.id}...`);
          scrapeResult = await scrapeAndStoreT1CloudDas({ tenantId: tenant.id });
          console.log(`[NswDaPoll] Tenant ${tenant.id} T1Cloud scrape complete. New: ${scrapeResult.totalNew}, Updated: ${scrapeResult.totalUpdated}, Competitors: ${scrapeResult.totalCompetitorMatches}`);
        } catch (scrapeErr: any) {
          console.error(`[NswDaPoll] Tenant ${tenant.id} T1Cloud scrape error (non-fatal):`, scrapeErr.message);
        }

        // Notify owner if new relevant DAs found
        if (pollResult.totalRelevant > 0) {
          try {
            const title = `🏗️ ${pollResult.totalRelevant} new relevant NSW DA${pollResult.totalRelevant > 1 ? "s" : ""} detected for ${tenant.name}`;
            const lines = pollResult.results
              .filter(r => r.relevantCount > 0)
              .map(r => `• ${r.council}: ${r.relevantCount} relevant (${r.newCount} new total)`);
            const content = lines.join("\n") + "\n\nView details in DA Tracker > NSW tab.";
            await notifyOwner({ title, content, settingKey: "notify_nsw_da_relevant" });
          } catch (notifyErr: any) {
            console.error(`[NswDaPoll] Tenant ${tenant.id} notification error (non-fatal):`, notifyErr.message);
          }
        }

        tenantResults.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          results: pollResult.results,
          scrapeResult,
          totals: {
            new: pollResult.totalNew,
            updated: pollResult.totalUpdated,
            relevant: pollResult.totalRelevant,
          },
        });
      }

      return res.json({
        ok: true,
        tenantResults,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[NswDaPoll] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  });

  // ─── Weekly Competitor Digest Email ─────────────────────────────────────────
  app.post("/api/scheduled/nsw-competitor-digest", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "DB unavailable" });
      }

      console.log("[NswDigest] Generating weekly NSW competitor digest per tenant...");

      const activeTenants = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.status, "active"));

      const tenantResults = [];
      for (const tenant of activeTenants) {
        const recentDas = await getRecentRelevantNswDas(7, tenant.id);

        if (recentDas.length === 0) {
          console.log(`[NswDigest] Tenant ${tenant.id}: no new relevant DAs in the past week. Skipping.`);
          tenantResults.push({ tenantId: tenant.id, tenantName: tenant.name, skipped: "no_new_das" });
          continue;
        }

        const byCouncil = new Map<string, typeof recentDas>();
        for (const da of recentDas) {
          const key = da.councilName;
          if (!byCouncil.has(key)) byCouncil.set(key, []);
          byCouncil.get(key)!.push(da);
        }

        const html = buildDigestEmail(recentDas, byCouncil);

        const admins = await db.select({ email: users.email, name: users.name })
          .from(tenantMemberships)
          .innerJoin(users, eq(users.id, tenantMemberships.userId))
          .where(and(
            eq(tenantMemberships.tenantId, tenant.id),
            inArray(tenantMemberships.role, ["owner", "admin"]),
          ));

        const recipients = admins
          .filter(a => a.email)
          .map(a => a.email!);

        if (recipients.length === 0) {
          console.log(`[NswDigest] Tenant ${tenant.id}: no tenant admin recipients found. Skipping.`);
          tenantResults.push({ tenantId: tenant.id, tenantName: tenant.name, skipped: "no_recipients" });
          continue;
        }

        let sent = 0;
        const errors: string[] = [];
        for (const email of recipients) {
          try {
            await sendNotificationEmail({
              tenantId: tenant.id,
              to: email,
              subject: `Weekly NSW DA Digest: ${recentDas.length} relevant applications`,
              htmlBody: html,
            });
            sent++;
          } catch (err: any) {
            errors.push(`${email}: ${err.message}`);
          }
        }

        console.log(`[NswDigest] Tenant ${tenant.id}: digest sent to ${sent}/${recipients.length} recipients.`);
        tenantResults.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          totalDas: recentDas.length,
          councils: byCouncil.size,
          sent,
          errors,
        });
      }

      return res.json({
        ok: true,
        tenantResults,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[NswDigest] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
    }
  });
}

// ─── Email Template ──────────────────────────────────────────────────────────

function buildDigestEmail(
  allDas: Awaited<ReturnType<typeof getRecentRelevantNswDas>>,
  byCouncil: Map<string, Awaited<ReturnType<typeof getRecentRelevantNswDas>>>
): string {
  const categoryEmoji: Record<string, string> = {
    patio: "🏠",
    pergola: "🌿",
    carport: "🚗",
    deck: "🪵",
    pool: "🏊",
    outbuilding: "🏚️",
  };

  let councilRows = "";
  for (const [council, das] of Array.from(byCouncil.entries())) {
    const categories = new Map<string, number>();
    for (const da of das) {
      const cat = da.relevantCategory || "other";
      categories.set(cat, (categories.get(cat) || 0) + 1);
    }
    const catSummary = Array.from(categories.entries())
      .map(([cat, count]) => `${categoryEmoji[cat] || "📋"} ${cat}: ${count}`)
      .join(", ");

    councilRows += `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${council}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${das.length}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${catSummary}</td>
      </tr>`;
  }

  // Top 10 individual DAs
  let daRows = "";
  const topDas = allDas.slice(0, 15);
  for (const da of topDas) {
    const cat = da.relevantCategory || "other";
    const emoji = categoryEmoji[cat] || "📋";
    const lodgeDate = da.lodgementDate ? new Date(da.lodgementDate).toLocaleDateString("en-AU") : "—";
    daRows += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${emoji} ${cat}</td>
        <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${da.fullAddress || "—"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${da.suburb || "—"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${lodgeDate}</td>
        <td style="padding: 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${da.councilName}</td>
      </tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 20px;">
  <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 24px 32px; color: white;">
      <h1 style="margin: 0; font-size: 22px;">Weekly NSW DA Digest</h1>
      <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">
        ${allDas.length} relevant outdoor-living DAs detected across ${byCouncil.size} council${byCouncil.size > 1 ? "s" : ""}
      </p>
    </div>

    <!-- Summary by Council -->
    <div style="padding: 24px 32px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Summary by Council</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280;">Council</th>
            <th style="padding: 10px 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #6b7280;">Count</th>
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280;">Categories</th>
          </tr>
        </thead>
        <tbody>${councilRows}</tbody>
      </table>
    </div>

    <!-- Recent DAs -->
    <div style="padding: 0 32px 24px;">
      <h2 style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">Recent Applications</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Type</th>
            <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Address</th>
            <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Suburb</th>
            <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Lodged</th>
            <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Council</th>
          </tr>
        </thead>
        <tbody>${daRows}</tbody>
      </table>
      ${allDas.length > 15 ? `<p style="color: #6b7280; font-size: 13px; margin-top: 12px;">...and ${allDas.length - 15} more. View all in the DA Tracker.</p>` : ""}
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        This is an automated weekly digest from AltaSpan. Covers: ${NSW_TARGET_COUNCILS.join(", ")}.
      </p>
    </div>
  </div>
</body>
</html>`;
}
