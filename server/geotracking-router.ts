import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { tenantMemberships, userLocations, users } from "../drizzle/schema";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// AEST = UTC+10. Tracking window: 7am–5pm AEST (21:00–07:00 UTC previous day to same day)
const TRACKING_START_HOUR_AEST = 7;
const TRACKING_END_HOUR_AEST = 17;
const AEST_OFFSET_HOURS = 10;

/** Tracked roles — trades and construction users */
const TRACKED_ROLES = ["construction_user", "driver", "warehouse"] as const;

/** Check if current time is within the 7am–5pm AEST tracking window */
function isWithinTrackingWindow(): boolean {
  const now = new Date();
  // Convert to AEST
  const aestHour = (now.getUTCHours() + AEST_OFFSET_HOURS) % 24;
  return aestHour >= TRACKING_START_HOUR_AEST && aestHour < TRACKING_END_HOUR_AEST;
}

/** Get today's tracking window boundaries in UTC */
function getTodayTrackingWindowUTC(): { start: Date; end: Date } {
  const now = new Date();
  // Get current date in AEST
  const aestNow = new Date(now.getTime() + AEST_OFFSET_HOURS * 60 * 60 * 1000);
  const aestDateStr = aestNow.toISOString().split("T")[0]; // YYYY-MM-DD in AEST

  // 7am AEST = previous day 21:00 UTC (7 - 10 = -3, so 21:00 UTC prev day)
  // Actually: 7am AEST = 7:00 - 10:00 offset = 21:00 UTC previous day? No.
  // AEST is UTC+10, so 7am AEST = 7:00 - 10 = -3:00 UTC same day = 21:00 UTC previous day
  // 5pm AEST = 17:00 - 10 = 07:00 UTC same day
  const startUTC = new Date(`${aestDateStr}T${String(TRACKING_START_HOUR_AEST - AEST_OFFSET_HOURS + 24).padStart(2, "0")}:00:00.000Z`);
  // Adjust: 7 - 10 = -3, so we need previous day at 21:00
  const start = new Date(aestNow);
  start.setUTCHours(TRACKING_START_HOUR_AEST - AEST_OFFSET_HOURS + 24, 0, 0, 0);
  if (start > aestNow) {
    start.setUTCDate(start.getUTCDate() - 1);
  }

  // 5pm AEST = 07:00 UTC same AEST day
  const end = new Date(start);
  end.setUTCHours(start.getUTCHours() + (TRACKING_END_HOUR_AEST - TRACKING_START_HOUR_AEST));

  // Simpler approach: use the AEST date to compute UTC boundaries
  const dayStart = new Date(`${aestDateStr}T00:00:00.000Z`);
  dayStart.setUTCHours(dayStart.getUTCHours() - AEST_OFFSET_HOURS); // midnight AEST in UTC

  const trackingStart = new Date(dayStart.getTime() + TRACKING_START_HOUR_AEST * 60 * 60 * 1000);
  const trackingEnd = new Date(dayStart.getTime() + TRACKING_END_HOUR_AEST * 60 * 60 * 1000);

  return { start: trackingStart, end: trackingEnd };
}

export const geotrackingRouter = router({
  /** Record a location update from a tracked user's mobile device */
  updateLocation: protectedProcedure
    .input(z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      heading: z.number().min(0).max(360).optional(),
      speed: z.number().min(0).optional(),
      accuracy: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant!.id;
      // Time gate: only accept during 7am–5pm AEST
      if (!isWithinTrackingWindow()) {
        return { success: false, reason: "outside_tracking_hours" };
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify user has a tracked role
      const [user] = await db.select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || !TRACKED_ROLES.includes(user.role as any)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User role not eligible for tracking" });
      }

      await db.insert(userLocations).values({
        tenantId,
        userId: ctx.user.id,
        latitude: input.latitude.toFixed(7),
        longitude: input.longitude.toFixed(7),
        heading: input.heading != null ? input.heading.toFixed(1) : null,
        speed: input.speed != null ? input.speed.toFixed(2) : null,
        accuracy: input.accuracy != null ? input.accuracy.toFixed(2) : null,
      });

      return { success: true };
    }),

  /** Get latest position for all tracked users (admin/office view) */
  latestPositions: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant!.id;
    const db = await getDb();
    if (!db) return { positions: [], isTrackingActive: isWithinTrackingWindow() };

    // Get tracked users in the active tenant only.
    const trackedUsers = await db.select({
      id: users.id,
      name: users.name,
      role: users.role,
      email: users.email,
    }).from(users)
      .innerJoin(tenantMemberships, eq(users.id, tenantMemberships.userId))
      .where(and(
        eq(tenantMemberships.tenantId, tenantId),
        inArray(users.role, [...TRACKED_ROLES]),
      ));

    if (trackedUsers.length === 0) {
      return { positions: [], isTrackingActive: isWithinTrackingWindow() };
    }

    // Get latest location for each tracked user
    const positions = await Promise.all(trackedUsers.map(async (u) => {
      const [loc] = await db.select().from(userLocations)
        .where(and(
          eq(userLocations.userId, u.id),
          eq(userLocations.tenantId, tenantId),
        ))
        .orderBy(desc(userLocations.recordedAt))
        .limit(1);
      return {
        user: u,
        location: loc ? {
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          heading: loc.heading ? Number(loc.heading) : null,
          speed: loc.speed ? Number(loc.speed) : null,
          accuracy: loc.accuracy ? Number(loc.accuracy) : null,
          recordedAt: loc.recordedAt,
        } : null,
      };
    }));

    return {
      positions: positions.filter(p => p.location !== null),
      isTrackingActive: isWithinTrackingWindow(),
    };
  }),

  /** Get location history for a specific user within a date range */
  locationHistory: protectedProcedure
    .input(z.object({
      userId: z.number(),
      date: z.string(), // ISO date string (YYYY-MM-DD) — returns that day's tracking window
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenant!.id;
      const db = await getDb();
      if (!db) return { points: [], isTrackingActive: isWithinTrackingWindow() };

      const [membership] = await db.select({ userId: tenantMemberships.userId })
        .from(tenantMemberships)
        .where(and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, input.userId),
        ))
        .limit(1);
      if (!membership) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tracked user not found in this tenant" });
      }

      // Compute tracking window for the requested date (AEST)
      const dayStart = new Date(`${input.date}T00:00:00.000Z`);
      dayStart.setUTCHours(dayStart.getUTCHours() - AEST_OFFSET_HOURS); // midnight AEST in UTC
      const trackingStart = new Date(dayStart.getTime() + TRACKING_START_HOUR_AEST * 60 * 60 * 1000);
      const trackingEnd = new Date(dayStart.getTime() + TRACKING_END_HOUR_AEST * 60 * 60 * 1000);

      const points = await db.select().from(userLocations)
        .where(and(
          eq(userLocations.tenantId, tenantId),
          eq(userLocations.userId, input.userId),
          gte(userLocations.recordedAt, trackingStart),
          lte(userLocations.recordedAt, trackingEnd),
        ))
        .orderBy(userLocations.recordedAt)
        .limit(2000);

      return {
        points: points.map(p => ({
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          heading: p.heading ? Number(p.heading) : null,
          speed: p.speed ? Number(p.speed) : null,
          accuracy: p.accuracy ? Number(p.accuracy) : null,
          recordedAt: p.recordedAt,
        })),
        isTrackingActive: isWithinTrackingWindow(),
      };
    }),

  /** Check tracking status (is within window, current AEST time) */
  trackingStatus: protectedProcedure.query(async () => {
    const now = new Date();
    const aestHour = (now.getUTCHours() + AEST_OFFSET_HOURS) % 24;
    const aestMinute = now.getUTCMinutes();
    return {
      isActive: isWithinTrackingWindow(),
      currentAestTime: `${String(aestHour).padStart(2, "0")}:${String(aestMinute).padStart(2, "0")}`,
      windowStart: `${String(TRACKING_START_HOUR_AEST).padStart(2, "0")}:00`,
      windowEnd: `${String(TRACKING_END_HOUR_AEST).padStart(2, "0")}:00`,
    };
  }),
});
