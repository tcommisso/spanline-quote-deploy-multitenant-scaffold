import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { equipment, equipmentBookings, constructionJobs, constructionScheduleEvents } from "../drizzle/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function equipmentTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, equipment.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireEquipmentAccess(db: any, ctx: any, equipmentId: number) {
  const [row] = await db.select()
    .from(equipment)
    .where(and(...equipmentTenantConditions(ctx, eq(equipment.id, equipmentId))))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment not found" });
  return row;
}

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select({ id: constructionJobs.id })
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

async function requireBookingAccess(db: any, ctx: any, bookingId: number) {
  const [row] = await db.select({ booking: equipmentBookings })
    .from(equipmentBookings)
    .innerJoin(equipment, eq(equipmentBookings.equipmentId, equipment.id))
    .where(and(...equipmentTenantConditions(ctx, eq(equipmentBookings.id, bookingId))))
    .limit(1);
  if (!row?.booking) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment booking not found" });
  return row.booking;
}

export const equipmentRouter = router({
  // ─── Equipment CRUD ─────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input?.activeOnly) conditions.push(eq(equipment.isActive, true));
      appendTenantScope(conditions, equipment.tenantId, tenantIdFromContext(ctx));
      return db.select().from(equipment)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(equipment.name);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      category: z.string().optional(),
      description: z.string().optional(),
      serialNumber: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [result] = await db.insert(equipment).values({
        tenantId: tenantIdFromContext(ctx),
        name: input.name,
        category: input.category,
        description: input.description,
        serialNumber: input.serialNumber,
      });
      return { id: result.insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      category: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      serialNumber: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { id, ...updates } = input;
      await requireEquipmentAccess(db, ctx, id);
      const vals: any = {};
      if (updates.name !== undefined) vals.name = updates.name;
      if (updates.category !== undefined) vals.category = updates.category;
      if (updates.description !== undefined) vals.description = updates.description;
      if (updates.serialNumber !== undefined) vals.serialNumber = updates.serialNumber;
      if (updates.isActive !== undefined) vals.isActive = updates.isActive;
      await db.update(equipment).set(vals).where(and(...equipmentTenantConditions(ctx, eq(equipment.id, id))));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireEquipmentAccess(db, ctx, input.id);
      await db.delete(equipment).where(and(...equipmentTenantConditions(ctx, eq(equipment.id, input.id))));
      return { success: true };
    }),

  // ─── Equipment Bookings ───────────────────────────────────────────────────
  bookings: router({
    list: protectedProcedure
      .input(z.object({
        equipmentId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        jobId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.equipmentId) {
          await requireEquipmentAccess(db, ctx, input.equipmentId);
          conditions.push(eq(equipmentBookings.equipmentId, input.equipmentId));
        }
        if (input?.jobId) {
          await requireJobAccess(db, ctx, input.jobId);
          conditions.push(eq(equipmentBookings.jobId, input.jobId));
        }
        // Overlapping date range: booking overlaps if booking.startDate <= endDate AND booking.endDate >= startDate
        if (input?.startDate) conditions.push(lte(equipmentBookings.startDate, new Date(input.endDate || input.startDate)));
        if (input?.endDate) conditions.push(gte(equipmentBookings.endDate, new Date(input.startDate || input.endDate)));

        const rows = await db.select({ booking: equipmentBookings }).from(equipmentBookings)
          .innerJoin(equipment, eq(equipmentBookings.equipmentId, equipment.id))
          .where(and(...equipmentTenantConditions(ctx, ...conditions)))
          .orderBy(equipmentBookings.startDate);
        const bookings = rows.map((row: any) => row.booking);

        // Enrich with equipment names and job info
        const eqIds = Array.from(new Set(bookings.map(b => b.equipmentId)));
        const jobIds = Array.from(new Set(bookings.filter(b => b.jobId).map(b => b.jobId!)));

        const eqList = eqIds.length > 0
          ? await db.select({ id: equipment.id, name: equipment.name, category: equipment.category })
              .from(equipment)
              .where(and(...equipmentTenantConditions(ctx, inArray(equipment.id, eqIds))))
          : [];
        const jobList = jobIds.length > 0
          ? await db.select({ id: constructionJobs.id, clientName: constructionJobs.clientName, quoteNumber: constructionJobs.quoteNumber, siteAddress: constructionJobs.siteAddress })
              .from(constructionJobs)
              .where(and(...jobTenantConditions(ctx, inArray(constructionJobs.id, jobIds))))
          : [];

        const eqMap = Object.fromEntries(eqList.map(e => [e.id, e]));
        const jobMap = Object.fromEntries(jobList.map(j => [j.id, j]));

        return bookings.map(b => ({
          ...b,
          equipmentName: eqMap[b.equipmentId]?.name || "Unknown",
          equipmentCategory: eqMap[b.equipmentId]?.category || null,
          jobClientName: b.jobId ? (jobMap[b.jobId]?.clientName || "Unknown") : null,
          quoteNumber: b.jobId ? (jobMap[b.jobId]?.quoteNumber || null) : null,
          jobSiteAddress: b.jobId ? (jobMap[b.jobId]?.siteAddress || null) : null,
        }));
      }),

    create: protectedProcedure
      .input(z.object({
        equipmentId: z.number(),
        scheduleEventId: z.number().optional(),
        jobId: z.number().optional(),
        startDate: z.string(),
        endDate: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireEquipmentAccess(db, ctx, input.equipmentId);
        if (input.jobId) await requireJobAccess(db, ctx, input.jobId);

        // Check for conflicts
        const conflicts = await db.select().from(equipmentBookings)
          .where(and(
            eq(equipmentBookings.equipmentId, input.equipmentId),
            lte(equipmentBookings.startDate, new Date(input.endDate)),
            gte(equipmentBookings.endDate, new Date(input.startDate)),
          ));

        if (conflicts.length > 0) {
          throw new Error("Equipment is already booked for this date range");
        }

        const [result] = await db.insert(equipmentBookings).values({
          equipmentId: input.equipmentId,
          scheduleEventId: input.scheduleEventId,
          jobId: input.jobId,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          notes: input.notes,
          createdBy: ctx.user.id,
        });
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().nullable().optional(),
        equipmentId: z.number().optional(),
        jobId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const { id, ...updates } = input;
        await requireBookingAccess(db, ctx, id);
        if (updates.equipmentId) await requireEquipmentAccess(db, ctx, updates.equipmentId);
        if (updates.jobId) await requireJobAccess(db, ctx, updates.jobId);
        const vals: any = {};
        if (updates.startDate !== undefined) vals.startDate = new Date(updates.startDate);
        if (updates.endDate !== undefined) vals.endDate = new Date(updates.endDate);
        if (updates.notes !== undefined) vals.notes = updates.notes;
        if (updates.equipmentId !== undefined) vals.equipmentId = updates.equipmentId;
        if (updates.jobId !== undefined) vals.jobId = updates.jobId;
        await db.update(equipmentBookings).set(vals).where(eq(equipmentBookings.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireBookingAccess(db, ctx, input.id);
        await db.delete(equipmentBookings).where(eq(equipmentBookings.id, input.id));
        return { success: true };
      }),
  }),
});
