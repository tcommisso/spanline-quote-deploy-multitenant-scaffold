import { router, publicProcedure, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { manufacturingDrivers, users, driverLocations, tenantMemberships } from "../drizzle/schema";
import { eq, like, and, or, desc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function driverTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, manufacturingDrivers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireDriverAccess(db: any, ctx: any, driverId: number) {
  const [driver] = await db.select()
    .from(manufacturingDrivers)
    .where(and(...driverTenantConditions(ctx, eq(manufacturingDrivers.id, driverId))))
    .limit(1);
  if (!driver) throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });
  return driver;
}

async function requireTenantUser(db: any, ctx: any, userId: number) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
  }

  const [row] = await db.select({ user: users })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
    .limit(1);
  if (!row?.user) throw new TRPCError({ code: "NOT_FOUND", message: "User account not found in this tenant" });
  return row.user;
}

export const driverRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().optional().default(true),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input?.activeOnly !== false) {
        conditions.push(eq(manufacturingDrivers.isActive, true));
      }
      if (input?.search) {
        const s = `%${input.search}%`;
        conditions.push(or(
          like(manufacturingDrivers.name, s),
          like(manufacturingDrivers.phone, s),
          like(manufacturingDrivers.email, s),
        )!);
      }
      appendTenantScope(conditions, manufacturingDrivers.tenantId, tenantIdFromContext(ctx));
      return db.select().from(manufacturingDrivers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(manufacturingDrivers.name);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return requireDriverAccess(db, ctx, input.id);
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().optional(),
      vehicle: z.string().optional(),
      licencePlate: z.string().optional(),
      licenceNumber: z.string().optional(),
      licenceExpiry: z.string().optional(), // ISO date string
      userId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      if (input.userId) await requireTenantUser(db, ctx, input.userId);
      const accessToken = crypto.randomBytes(32).toString("hex");
      const [result] = await db.insert(manufacturingDrivers).values({
        tenantId: tenantIdFromContext(ctx),
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        vehicle: input.vehicle || null,
        licencePlate: input.licencePlate || null,
        licenceNumber: input.licenceNumber || null,
        licenceExpiry: input.licenceExpiry ? new Date(input.licenceExpiry) : null,
        userId: input.userId || null,
        notes: input.notes || null,
        driverAccessToken: accessToken,
      });
      return { id: result.insertId };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      vehicle: z.string().nullable().optional(),
      licencePlate: z.string().nullable().optional(),
      licenceNumber: z.string().nullable().optional(),
      licenceExpiry: z.string().nullable().optional(),
      userId: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { id, licenceExpiry, ...data } = input;
      await requireDriverAccess(db, ctx, id);
      if (data.userId) await requireTenantUser(db, ctx, data.userId);
      const updateData: any = { ...data };
      if (licenceExpiry !== undefined) {
        updateData.licenceExpiry = licenceExpiry ? new Date(licenceExpiry) : null;
      }
      await db.update(manufacturingDrivers)
        .set(updateData)
        .where(and(...driverTenantConditions(ctx, eq(manufacturingDrivers.id, id))));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireDriverAccess(db, ctx, input.id);
      await db.update(manufacturingDrivers)
        .set({ isActive: false })
        .where(and(...driverTenantConditions(ctx, eq(manufacturingDrivers.id, input.id))));
      return { success: true };
    }),

  // Get users that could be linked as drivers (system users + existing driver records)
  availableUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    // System user accounts (from OAuth login)
    const systemUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id))
      .orderBy(users.name);
    // Existing driver records (from manufacturing_drivers table)
    const driverConditions = driverTenantConditions(ctx, eq(manufacturingDrivers.isActive, true));
    const driverRecords = await db.select({ id: manufacturingDrivers.id, name: manufacturingDrivers.name, email: manufacturingDrivers.email })
      .from(manufacturingDrivers)
      .where(and(...driverConditions))
      .orderBy(manufacturingDrivers.name);
    return {
      systemUsers,
      driverRecords,
    };
  }),

  // ─── Merge driver with system user account ─────────────────────────────
  mergeWithUser: adminProcedure
    .input(z.object({
      driverId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Validate driver exists
      await requireDriverAccess(db, ctx, input.driverId);

      // Validate user exists
      const user = await requireTenantUser(db, ctx, input.userId);

      // Check user isn't already linked to another driver
      const [existingLink] = await db.select({ id: manufacturingDrivers.id, name: manufacturingDrivers.name })
        .from(manufacturingDrivers)
        .where(and(...driverTenantConditions(ctx,
          eq(manufacturingDrivers.userId, input.userId),
          eq(manufacturingDrivers.isActive, true),
        )))
        .limit(1);
      if (existingLink && existingLink.id !== input.driverId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `User is already linked to driver "${existingLink.name}" (ID: ${existingLink.id})`,
        });
      }

      // Link the user to the driver record
      await db.update(manufacturingDrivers)
        .set({ userId: input.userId })
        .where(and(...driverTenantConditions(ctx, eq(manufacturingDrivers.id, input.driverId))));

      // Auto-set the user's role to 'driver' if not already admin/super_admin
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        await db.update(users)
          .set({ role: 'driver' })
          .where(eq(users.id, input.userId));
      }

      return { success: true, driverId: input.driverId, userId: input.userId };
    }),

  // ─── Geotracking ────────────────────────────────────────────────────────

  /** Record a location update from a driver's mobile device (uses access token auth) */
  updateLocation: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      heading: z.number().min(0).max(360).optional(),
      speed: z.number().min(0).optional(),
      accuracy: z.number().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Authenticate via driver access token
      const [driver] = await db.select({ id: manufacturingDrivers.id })
        .from(manufacturingDrivers)
        .where(and(
          eq(manufacturingDrivers.driverAccessToken, input.token),
          eq(manufacturingDrivers.isActive, true),
        )).limit(1);
      if (!driver) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid driver token" });
      await db.insert(driverLocations).values({
        driverId: driver.id,
        latitude: input.latitude.toFixed(7),
        longitude: input.longitude.toFixed(7),
        heading: input.heading != null ? input.heading.toFixed(1) : null,
        speed: input.speed != null ? input.speed.toFixed(2) : null,
        accuracy: input.accuracy != null ? input.accuracy.toFixed(2) : null,
      });
      return { success: true };
    }),

  /** Get latest position for all active drivers */
  latestPositions: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    // Get latest location per active driver using a subquery approach
    const driverConditions = driverTenantConditions(ctx, eq(manufacturingDrivers.isActive, true));
    const drivers = await db.select().from(manufacturingDrivers)
      .where(and(...driverConditions));
    const positions = await Promise.all(drivers.map(async (d) => {
      const [loc] = await db.select().from(driverLocations)
        .where(eq(driverLocations.driverId, d.id))
        .orderBy(desc(driverLocations.recordedAt))
        .limit(1);
      return { driver: d, location: loc || null };
    }));
    return positions.filter(p => p.location !== null);
  }),

  /** Get location history for a specific driver within a date range */
  locationHistory: protectedProcedure
    .input(z.object({
      driverId: z.number(),
      from: z.string(), // ISO date
      to: z.string().optional(), // ISO date, defaults to now
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireDriverAccess(db, ctx, input.driverId);
      const fromDate = new Date(input.from);
      const toDate = input.to ? new Date(input.to) : new Date();
      return db.select().from(driverLocations)
        .where(and(
          eq(driverLocations.driverId, input.driverId),
          gte(driverLocations.recordedAt, fromDate),
          lte(driverLocations.recordedAt, toDate),
        ))
        .orderBy(driverLocations.recordedAt)
        .limit(1000);
    }),

  /** Regenerate a driver's access token */
  regenerateToken: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireDriverAccess(db, ctx, input.id);
      const newToken = crypto.randomBytes(32).toString("hex");
      await db.update(manufacturingDrivers)
        .set({ driverAccessToken: newToken })
        .where(and(...driverTenantConditions(ctx, eq(manufacturingDrivers.id, input.id))));
      return { token: newToken };
    }),
});
