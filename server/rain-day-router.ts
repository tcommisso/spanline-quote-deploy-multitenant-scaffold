import { z } from "zod";
import { tenantProcedure, tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { rainDays, rainDayJobImpacts, extensionOfTimeRecords, constructionScheduleEvents, constructionJobs, weatherHistory } from "../drizzle/schema";
import { eq, and, gte, lte, sql, desc, or } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { getCachedForecast, geocodeLocation, getTenantWeatherLocations, isRainWeatherCode } from "./weather-service";
import { getClientEmail } from "./construction-notifications";
import { storagePut } from "./storage";
import { generateEotSummaryPdf } from "./construction-pdf";

/** Helper to get db or throw */
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/** Build HTML email body for EOT report */
function buildEotReportEmail(job: any, message?: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a2e;">Extension of Time — Summary Report</h2>
      <p>Please find attached the Extension of Time Summary Report for the following project:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Client</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${job.clientName || "N/A"}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Site Address</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${job.siteAddress || "N/A"}</td></tr>
        ${job.quoteNumber ? `<tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Quote/Job No.</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${job.quoteNumber}</td></tr>` : ""}
      </table>
      ${message ? `<p style="margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 4px;">${message}</p>` : ""}
      <p style="margin-top: 24px; color: #666; font-size: 12px;">This is an automated notification from the Altaspan Construction Management System.</p>
    </div>
  `;
}

// ─── Rain Day Router ─────────────────────────────────────────────────────────

export const rainDayRouter = router({
  // List all rain days with optional filters
  list: tenantAdminProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.enum(["pending", "approved", "executed", "revoked"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [eq(rainDays.tenantId, ctx.tenant!.id)];
      if (input?.startDate) conditions.push(gte(rainDays.date, input.startDate));
      if (input?.endDate) conditions.push(lte(rainDays.date, input.endDate));
      if (input?.status) conditions.push(eq(rainDays.status, input.status));

      if (conditions.length > 0) {
        return db.select().from(rainDays)
          .where(and(...conditions))
          .orderBy(desc(rainDays.createdAt));
      }
      return db.select().from(rainDays).orderBy(desc(rainDays.createdAt));
    }),

  // Declare a rain day (creates in pending status)
  declare: tenantAdminProcedure
    .input(z.object({
      date: z.string(), // YYYY-MM-DD
      reason: z.string().min(1),
      zone: z.string().optional(),
      weatherData: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Check for duplicate declaration on same date+zone
      const existing = await db.select().from(rainDays)
        .where(and(
          eq(rainDays.tenantId, ctx.tenant!.id),
          eq(rainDays.date, input.date),
          input.zone ? eq(rainDays.zone, input.zone) : sql`1=1`
        ));

      if (existing.some((e: any) => e.status !== "revoked")) {
        throw new Error("A rain day has already been declared for this date" + (input.zone ? ` in zone ${input.zone}` : ""));
      }

      const [result] = await db.insert(rainDays).values({
        tenantId: ctx.tenant!.id,
        date: input.date,
        reason: input.reason,
        zone: input.zone || null,
        weatherData: input.weatherData || null,
        declaredByUserId: ctx.user!.id,
        declaredByUserName: ctx.user!.name || "Admin",
        status: "pending",
      });

      return { id: result.insertId, status: "pending" };
    }),

  // Approve a rain day (moves to approved, does NOT yet execute)
  approve: tenantAdminProcedure
    .input(z.object({ rainDayId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [rainDay] = await db.select().from(rainDays)
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      if (!rainDay) throw new Error("Rain day not found");
      if (rainDay.status !== "pending") throw new Error("Rain day is not pending approval");

      await db.update(rainDays)
        .set({
          status: "approved",
          approvedByUserId: ctx.user!.id,
          approvedByUserName: ctx.user!.name || "Admin",
          approvedAt: new Date(),
        })
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      return { approved: true };
    }),

  // Execute an approved rain day — reschedule jobs and create EOT records
  execute: tenantAdminProcedure
    .input(z.object({ rainDayId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [rainDay] = await db.select().from(rainDays)
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      if (!rainDay) throw new Error("Rain day not found");
      if (rainDay.status !== "approved") throw new Error("Rain day must be approved before execution");

      // Find all scheduled events on this date
      const affectedEventRows = await db.select({ event: constructionScheduleEvents }).from(constructionScheduleEvents)
        .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
        .where(and(
          eq(constructionJobs.tenantId, ctx.tenant!.id),
          eq(constructionScheduleEvents.status, "scheduled"),
          sql`DATE(${constructionScheduleEvents.startTime}) = ${rainDay.date}`
        ));
      const affectedEvents = affectedEventRows.map(row => row.event);

      // Push each event forward by 1 business day and record impacts
      const impactRecords: any[] = [];
      for (const event of affectedEvents) {
        const originalDate = new Date(event.startTime);
        const newDate = getNextBusinessDay(originalDate);

        // Calculate new end time
        let newEndTime = event.endTime ? new Date(event.endTime) : null;
        if (newEndTime) {
          const diffMs = newEndTime.getTime() - originalDate.getTime();
          newEndTime = new Date(newDate.getTime() + diffMs);
        }

        // Update the schedule event
        await db.update(constructionScheduleEvents)
          .set({
            startTime: newDate,
            ...(newEndTime ? { endTime: newEndTime } : {}),
          })
          .where(eq(constructionScheduleEvents.id, event.id));

        // Get job info for impact record
        const [job] = await db.select().from(constructionJobs)
          .where(and(eq(constructionJobs.id, event.jobId), eq(constructionJobs.tenantId, ctx.tenant!.id)));

        // Record impact
        const [impact] = await db.insert(rainDayJobImpacts).values({
          tenantId: ctx.tenant!.id,
          rainDayId: input.rainDayId,
          jobId: event.jobId,
          clientName: job?.clientName || null,
          siteAddress: job?.siteAddress || null,
          scheduleEventId: event.id,
          originalDate: rainDay.date,
          newDate: newDate.toISOString().split("T")[0],
          tradeIds: event.assignedInstallerId ? [event.assignedInstallerId] : null,
          clientNotified: false,
          tradesNotified: false,
        });
        impactRecords.push({ impactId: impact.insertId, jobId: event.jobId, eventId: event.id });
      }

      // Create EOT records grouped by job
      const jobIds = Array.from(new Set(affectedEvents.map((e: any) => e.jobId)));
      for (const jobId of jobIds) {
        const [job] = await db.select().from(constructionJobs)
          .where(and(eq(constructionJobs.id, jobId), eq(constructionJobs.tenantId, ctx.tenant!.id)));

        // Get existing cumulative days
        const existingEOTs = await db.select().from(extensionOfTimeRecords)
          .where(and(eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id), eq(extensionOfTimeRecords.jobId, jobId)));
        const cumulativeDays = existingEOTs.reduce((sum: number, e: any) => sum + (e.daysClaimed || 0), 0) + 1;

        await db.insert(extensionOfTimeRecords).values({
          tenantId: ctx.tenant!.id,
          jobId,
          clientName: job?.clientName || null,
          rainDayId: input.rainDayId,
          rainDate: rainDay.date,
          daysClaimed: 1,
          cumulativeDays,
          reason: `Rain day: ${rainDay.reason}`,
          createdByUserId: ctx.user!.id,
          createdByUserName: ctx.user!.name || "Admin",
        });
      }

      // Update rain day status
      await db.update(rainDays)
        .set({
          status: "executed",
          executedAt: new Date(),
          affectedJobCount: jobIds.length,
        })
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      return {
        executed: true,
        affectedEvents: affectedEvents.length,
        affectedJobs: jobIds.length,
        impacts: impactRecords,
      };
    }),

  // Reject a rain day declaration
  reject: tenantAdminProcedure
    .input(z.object({
      rainDayId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(rainDays)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));
      return { rejected: true };
    }),

  // Revoke an executed rain day (undo reschedule)
  revoke: tenantAdminProcedure
    .input(z.object({ rainDayId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [rainDay] = await db.select().from(rainDays)
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      if (!rainDay) throw new Error("Rain day not found");
      if (rainDay.status !== "executed") throw new Error("Can only revoke executed rain days");

      // Reverse schedule changes
      const impacts = await db.select().from(rainDayJobImpacts)
        .where(and(
          eq(rainDayJobImpacts.rainDayId, input.rainDayId),
          eq(rainDayJobImpacts.tenantId, ctx.tenant!.id),
        ));

      for (const impact of impacts) {
        if (impact.scheduleEventId && impact.originalDate) {
          const originalStart = new Date(impact.originalDate + "T09:00:00");
          await db.update(constructionScheduleEvents)
            .set({ startTime: originalStart })
            .where(eq(constructionScheduleEvents.id, impact.scheduleEventId));
        }
      }

      // Remove EOT records
      await db.delete(extensionOfTimeRecords)
        .where(and(
          eq(extensionOfTimeRecords.rainDayId, input.rainDayId),
          eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id),
        ));

      // Remove impacts
      await db.delete(rainDayJobImpacts)
        .where(and(
          eq(rainDayJobImpacts.rainDayId, input.rainDayId),
          eq(rainDayJobImpacts.tenantId, ctx.tenant!.id),
        ));

      // Update status
      await db.update(rainDays)
        .set({ status: "revoked", revokedAt: new Date(), affectedJobCount: 0 })
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      return { revoked: true, reversedEvents: impacts.length };
    }),

  // Send notifications for an executed rain day
  sendNotifications: tenantAdminProcedure
    .input(z.object({ rainDayId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [rainDay] = await db.select().from(rainDays)
        .where(and(eq(rainDays.id, input.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));

      if (!rainDay || rainDay.status !== "executed") {
        throw new Error("Rain day must be executed before sending notifications");
      }

      const impacts = await db.select({
        impact: rainDayJobImpacts,
        job: constructionJobs,
      }).from(rainDayJobImpacts)
        .innerJoin(constructionJobs, eq(rainDayJobImpacts.jobId, constructionJobs.id))
        .where(and(
          eq(rainDayJobImpacts.rainDayId, input.rainDayId),
          eq(rainDayJobImpacts.tenantId, ctx.tenant!.id),
          eq(constructionJobs.tenantId, ctx.tenant!.id),
        ));

      let clientNotifications = 0;
      let tradeNotifications = 0;

      for (const { impact, job } of impacts) {
        if (impact.clientNotified) continue;

        const clientEmail = await getClientEmail(job);
        if (clientEmail) {
          try {
            await sendNotificationEmail({
              to: clientEmail,
              subject: `Schedule Update - Rain Day (${impact.originalDate})`,
              htmlBody: buildClientRainDayEmail(job, impact, rainDay),
            });
            clientNotifications++;
            await db.update(rainDayJobImpacts)
              .set({ clientNotified: true, clientNotifiedAt: new Date() })
              .where(and(eq(rainDayJobImpacts.id, impact.id), eq(rainDayJobImpacts.tenantId, ctx.tenant!.id)));
          } catch (e) {
            console.error(`[RainDay] Failed to notify client for job ${job.id}:`, e);
          }
        }
      }

      return { clientNotifications, tradeNotifications };
    }),

  // Get impacts for a specific rain day
  getImpacts: tenantAdminProcedure
    .input(z.object({ rainDayId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db.select({
        impact: rainDayJobImpacts,
        job: constructionJobs,
      }).from(rainDayJobImpacts)
        .innerJoin(constructionJobs, eq(rainDayJobImpacts.jobId, constructionJobs.id))
        .where(and(
          eq(rainDayJobImpacts.rainDayId, input.rainDayId),
          eq(rainDayJobImpacts.tenantId, ctx.tenant!.id),
          eq(constructionJobs.tenantId, ctx.tenant!.id),
        ));
    }),

  // Get EOT records for a specific job
  getJobEOT: tenantProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db.select({
        eot: extensionOfTimeRecords,
        rainDay: rainDays,
      }).from(extensionOfTimeRecords)
        .innerJoin(constructionJobs, eq(extensionOfTimeRecords.jobId, constructionJobs.id))
        .leftJoin(rainDays, eq(extensionOfTimeRecords.rainDayId, rainDays.id))
        .where(and(
          eq(extensionOfTimeRecords.jobId, input.jobId),
          eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id),
          eq(constructionJobs.tenantId, ctx.tenant!.id),
        ))
        .orderBy(desc(extensionOfTimeRecords.createdAt));
    }),

  // Issue formal EOT notice to client
  issueEOTNotice: tenantAdminProcedure
    .input(z.object({
      eotId: z.number(),
      jobId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [eot] = await db.select().from(extensionOfTimeRecords)
        .where(and(eq(extensionOfTimeRecords.id, input.eotId), eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id)));
      if (!eot) throw new Error("EOT record not found");

      const [job] = await db.select().from(constructionJobs)
        .where(and(eq(constructionJobs.id, input.jobId), eq(constructionJobs.tenantId, ctx.tenant!.id)));
      if (!job) throw new Error("Job not found");

      let rainDay = null;
      if (eot.rainDayId) {
        const [rd] = await db.select().from(rainDays)
          .where(and(eq(rainDays.id, eot.rainDayId), eq(rainDays.tenantId, ctx.tenant!.id)));
        rainDay = rd;
      }

      const clientEmail = await getClientEmail(job);
      if (clientEmail) {
        await sendNotificationEmail({
          to: clientEmail,
          subject: `Extension of Time Notice - ${job.clientName || "Your Project"}`,
          htmlBody: buildEOTNoticeEmail(job, eot, rainDay),
        });

        await db.update(extensionOfTimeRecords)
          .set({ sentAt: new Date(), sentToEmail: clientEmail })
          .where(and(eq(extensionOfTimeRecords.id, input.eotId), eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id)));
      }

      return { issued: true, sentTo: clientEmail };
    }),

  // Get weather data for a specific date (uses existing weather service)
  getWeatherForDate: tenantAdminProcedure
    .input(z.object({
      date: z.string(),
      location: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const loc = input.location || "Sydney";
        const geo = await geocodeLocation(loc);
        if (!geo) return null;
        const forecast = await getCachedForecast(loc, geo.latitude, geo.longitude, ctx.tenant!.id);
        return forecast;
      } catch (e) {
        return null;
      }
    }),

  // Summary stats
  stats: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const allDays = await db.select().from(rainDays).where(eq(rainDays.tenantId, ctx.tenant!.id));
    const pending = allDays.filter((d: any) => d.status === "pending").length;
    const approved = allDays.filter((d: any) => d.status === "approved").length;
    const executed = allDays.filter((d: any) => d.status === "executed").length;
    const totalImpacts = await db.select({ count: sql<number>`count(*)` }).from(rainDayJobImpacts)
      .where(eq(rainDayJobImpacts.tenantId, ctx.tenant!.id));
    const totalEOTs = await db.select({ count: sql<number>`count(*)` }).from(extensionOfTimeRecords)
      .where(eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id));

    return {
      pending,
      approved,
      executed,
      totalDeclared: allDays.length,
      totalJobsAffected: Number(totalImpacts[0]?.count || 0),
      totalEOTsIssued: Number(totalEOTs[0]?.count || 0),
    };
  }),

  // ─── Bulk Declaration (multiple consecutive days) ─────────────────────────
  declareBulk: tenantAdminProcedure
    .input(z.object({
      startDate: z.string(), // YYYY-MM-DD
      endDate: z.string(),   // YYYY-MM-DD
      reason: z.string(),
      zone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      if (end < start) throw new Error("End date must be on or after start date");

      const dates: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        // Skip weekends
        if (current.getDay() !== 0 && current.getDay() !== 6) {
          dates.push(current.toISOString().split("T")[0]);
        }
        current.setDate(current.getDate() + 1);
      }

      if (dates.length === 0) throw new Error("No business days in selected range");
      if (dates.length > 14) throw new Error("Maximum 14 consecutive business days allowed");

      // Check for duplicates
      const existing = await db.select({ date: rainDays.date }).from(rainDays)
        .where(and(
          eq(rainDays.tenantId, ctx.tenant!.id),
          gte(rainDays.date, input.startDate),
          lte(rainDays.date, input.endDate),
        ));
      const existingDates = new Set(existing.map(e => e.date));
      const newDates = dates.filter(d => !existingDates.has(d));

      if (newDates.length === 0) throw new Error("All dates in range already declared");

      // Insert all rain days
      const insertedIds: number[] = [];
      for (const date of newDates) {
        const [result] = await db.insert(rainDays).values({
          tenantId: ctx.tenant!.id,
          date,
          reason: input.reason,
          zone: input.zone || null,
          weatherData: null,
          declaredByUserId: ctx.user!.id,
          declaredByUserName: ctx.user!.name || "Admin",
          status: "pending",
        });
        insertedIds.push(result.insertId);
      }

      return { count: newDates.length, dates: newDates, ids: insertedIds };
    }),

  // ─── Weather Auto-Suggest (forecast-based rain day recommendations) ────────
  weatherSuggest: tenantAdminProcedure
    .input(z.object({
      zone: z.string().optional(), // specific location or default to all main locations
      precipitationThreshold: z.number().default(10), // mm threshold
    }))
    .query(async ({ ctx, input }) => {
      const suggestions: Array<{
        date: string;
        location: string;
        precipitation: number;
        weatherCode: number;
        confidence: "high" | "medium" | "low";
      }> = [];

      // Determine which locations to check
      const locationsToCheck = input.zone
        ? [{ name: input.zone, latitude: 0, longitude: 0 }]
        : await getTenantWeatherLocations(ctx.tenant!.id);

      for (const loc of locationsToCheck) {
        try {
          let lat = loc.latitude;
          let lng = loc.longitude;

          // If zone specified but no coords, geocode it
          if (input.zone && lat === 0) {
            const geo = await geocodeLocation(input.zone);
            if (!geo) continue;
            lat = geo.latitude;
            lng = geo.longitude;
          }

          const forecast = await getCachedForecast(loc.name, lat, lng, ctx.tenant!.id);

          for (const day of forecast.daily) {
            // Skip past dates
            if (new Date(day.date) < new Date(new Date().toISOString().split("T")[0])) continue;

            // Check if precipitation exceeds threshold or weather code indicates rain
            const isRainy = day.precipitation >= input.precipitationThreshold || isRainWeatherCode(day.weatherCode);
            if (isRainy) {
              const confidence = day.precipitation >= input.precipitationThreshold * 2 ? "high"
                : day.precipitation >= input.precipitationThreshold ? "medium" : "low";

              suggestions.push({
                date: day.date,
                location: loc.name,
                precipitation: day.precipitation,
                weatherCode: day.weatherCode,
                confidence,
              });
            }
          }
        } catch (err) {
          console.error(`[RainDay] Failed to get forecast for ${loc.name}:`, err);
        }
      }

      // Deduplicate by date (take highest precipitation)
      const byDate = new Map<string, typeof suggestions[0]>();
      for (const s of suggestions) {
        const existing = byDate.get(s.date);
        if (!existing || s.precipitation > existing.precipitation) {
          byDate.set(s.date, s);
        }
      }

      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }),

  // ─── EOT Summary Report (PDF export per job) ──────────────────────────────
  generateEotReport: tenantAdminProcedure
    .input(z.object({
      jobId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Get job details
      const [job] = await db.select().from(constructionJobs)
        .where(and(
          eq(constructionJobs.id, input.jobId),
          eq(constructionJobs.tenantId, ctx.tenant!.id),
        ));
      if (!job) throw new Error("Job not found");

      // Get all EOT records for this job
      const eotRecords = await db.select().from(extensionOfTimeRecords)
        .where(and(
          eq(extensionOfTimeRecords.jobId, input.jobId),
          eq(extensionOfTimeRecords.tenantId, ctx.tenant!.id),
        ))
        .orderBy(extensionOfTimeRecords.createdAt);

      if (eotRecords.length === 0) throw new Error("No EOT records found for this job");

      // Get related rain days
      const rainDayIds = Array.from(new Set(eotRecords.map(e => e.rainDayId).filter(Boolean))) as number[];
      let relatedRainDays: any[] = [];
      if (rainDayIds.length > 0) {
        for (const rdId of rainDayIds) {
          const [rd] = await db.select().from(rainDays)
            .where(and(eq(rainDays.id, rdId), eq(rainDays.tenantId, ctx.tenant!.id)));
          if (rd) relatedRainDays.push(rd);
        }
      }

      // Generate PDF
      const pdfBuffer = await generateEotSummaryPdf({
        job: {
          id: job.id,
          clientName: job.clientName || "N/A",
          siteAddress: job.siteAddress || "N/A",
          quoteNumber: job.quoteNumber || undefined,
        },
        eotRecords: eotRecords.map(e => ({
          daysClaimed: e.daysClaimed,
          cumulativeDays: e.cumulativeDays,
          reason: e.reason || "Rain day",
          date: e.createdAt ? new Date(e.createdAt).toLocaleDateString("en-AU") : "N/A",
          rainDayDate: relatedRainDays.find(rd => rd.id === e.rainDayId)?.date || null,
        })),
        totalDays: eotRecords.reduce((sum, e) => sum + (e.daysClaimed || 0), 0),
        generatedBy: ctx.user!.name || "Admin",
        generatedDate: new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" }),
      });

      // Upload to S3
      const fileKey = `tenant-${ctx.tenant!.id}/eot-reports/${input.jobId}-eot-summary-${Date.now()}.pdf`;
      const { url: pdfUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

      return { pdfUrl, totalDays: eotRecords.reduce((sum, e) => sum + (e.daysClaimed || 0), 0), recordCount: eotRecords.length };
    }),

  // ─── Send EOT Report via Email ─────────────────────────────────────────────
  sendEotReport: tenantAdminProcedure
    .input(z.object({
      jobId: z.number(),
      recipientEmail: z.string().email(),
      pdfUrl: z.string(),
      subject: z.string().optional(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [job] = await db.select().from(constructionJobs)
        .where(and(
          eq(constructionJobs.id, input.jobId),
          eq(constructionJobs.tenantId, ctx.tenant!.id),
        ));
      if (!job) throw new Error("Job not found");

      // Download PDF from S3 to get base64
      const pdfResp = await fetch(input.pdfUrl);
      const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
      const pdfBase64 = pdfBuffer.toString("base64");

      const subject = input.subject || `Extension of Time Summary - ${job.clientName || "Project"} - ${job.siteAddress || ""}`;
      const htmlBody = buildEotReportEmail(job, input.message);

      const result = await sendNotificationEmail({
        to: input.recipientEmail,
        subject,
        htmlBody,
        fromName: ctx.user!.name || "Altaspan",
        attachments: [{
          filename: `EOT-Summary-${job.quoteNumber || job.id}.pdf`,
          content: pdfBase64,
          contentType: "application/pdf",
        }],
      });

      return { success: result.success, error: result.error };
    }),

  // Public-facing rain days for schedule indicator (any authenticated user)
  listForSchedule: tenantProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const results = await db.select({
        id: rainDays.id,
        date: rainDays.date,
        reason: rainDays.reason,
        status: rainDays.status,
        zone: rainDays.zone,
      }).from(rainDays)
        .where(and(
          eq(rainDays.tenantId, ctx.tenant!.id),
          gte(rainDays.date, input.startDate),
          lte(rainDays.date, input.endDate),
          or(eq(rainDays.status, "approved"), eq(rainDays.status, "executed"))
        ))
        .orderBy(rainDays.date);
      return results;
    }),

  // Weather history for dashboard chart (past 30 days)
  weatherHistoryChart: tenantAdminProcedure
    .input(z.object({
      days: z.number().min(7).max(90).default(30),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const days = input?.days ?? 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().slice(0, 10);

      const rows = await db.select({
        locationName: weatherHistory.locationName,
        date: weatherHistory.date,
        precipitation: weatherHistory.precipitation,
        tempMax: weatherHistory.tempMax,
        tempMin: weatherHistory.tempMin,
        weatherCode: weatherHistory.weatherCode,
      }).from(weatherHistory)
        .where(and(eq(weatherHistory.tenantId, ctx.tenant!.id), gte(weatherHistory.date, startStr)))
        .orderBy(weatherHistory.date, weatherHistory.locationName);

      // Group by location
      const byLocation: Record<string, Array<{ date: string; precipitation: number; tempMax: number | null; tempMin: number | null; weatherCode: number | null }>> = {};
      for (const row of rows) {
        const loc = row.locationName;
        if (!byLocation[loc]) byLocation[loc] = [];
        byLocation[loc].push({
          date: row.date,
          precipitation: Number(row.precipitation) || 0,
          tempMax: row.tempMax ? Number(row.tempMax) : null,
          tempMin: row.tempMin ? Number(row.tempMin) : null,
          weatherCode: row.weatherCode,
        });
      }

      // Also get declared rain days in the same period for overlay
      const declaredDays = await db.select({
        date: rainDays.date,
        status: rainDays.status,
      }).from(rainDays)
        .where(and(
          eq(rainDays.tenantId, ctx.tenant!.id),
          gte(rainDays.date, startStr),
        ))
        .orderBy(rainDays.date);

      return {
        locations: byLocation,
        declaredRainDays: declaredDays,
        startDate: startStr,
        endDate: new Date().toISOString().slice(0, 10),
      };
    }),
});

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getNextBusinessDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function buildClientRainDayEmail(job: any, impact: any, rainDay: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0;">Schedule Update - Rain Day</h2>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Dear ${job.clientName || "Valued Client"},</p>
        <p>Due to inclement weather on <strong>${impact.originalDate}</strong>, your scheduled work has been rescheduled.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">Original Date</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${impact.originalDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">New Date</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${impact.newDate || "TBC"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">Reason</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${rainDay.reason || "Inclement weather"}</td>
          </tr>
        </table>
        <p>We apologise for any inconvenience. A formal Extension of Time notice will follow.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Kind regards,<br/><strong>Altaspan</strong></p>
      </div>
    </div>
  `;
}

function buildEOTNoticeEmail(job: any, eot: any, rainDay: any): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0;">Extension of Time Notice</h2>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Dear ${job.clientName || "Valued Client"},</p>
        <p>This is a formal notice of Extension of Time for your project.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1e293b;">Extension Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; font-weight: bold;">Project:</td><td>${job.clientName || "N/A"}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold;">Site:</td><td>${job.siteAddress || "N/A"}</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold;">Days Claimed:</td><td>${eot.daysClaimed} day(s)</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold;">Cumulative Extension:</td><td>${eot.cumulativeDays} day(s)</td></tr>
            <tr><td style="padding: 6px 0; font-weight: bold;">Reason:</td><td>${eot.reason}</td></tr>
            ${rainDay ? `<tr><td style="padding: 6px 0; font-weight: bold;">Rain Day Date:</td><td>${rainDay.date}</td></tr>` : ""}
          </table>
        </div>
        <p>This extension is claimed in accordance with the terms of your contract. The revised completion date will be adjusted accordingly.</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">Kind regards,<br/><strong>Altaspan</strong></p>
      </div>
    </div>
  `;
}
