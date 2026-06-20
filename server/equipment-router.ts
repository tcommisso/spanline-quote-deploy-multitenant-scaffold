import { z } from "zod";
import { router, tenantAdminProcedure, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { equipment, equipmentBookings, constructionJobs, constructionScheduleEvents } from "../drizzle/schema";
import { eq, and, gte, lte, inArray, isNull, sql } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext, tenantScoped } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";

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

function bookingTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, equipmentBookings.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function rowsFromExecuteResult(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result?.rows) return result.rows;
  return [];
}

async function hasDbColumn(db: any, tableName: string, columnName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
  return Number(rowsFromExecuteResult(result)?.[0]?.count || 0) > 0;
}

async function hasDbIndex(db: any, tableName: string, indexName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND index_name = ${indexName}
  `);
  return Number(rowsFromExecuteResult(result)?.[0]?.count || 0) > 0;
}

async function addIndexIfMissing(db: any, tableName: string, indexName: string, createSql: string) {
  if (!(await hasDbIndex(db, tableName, indexName))) {
    await db.execute(sql.raw(createSql));
  }
}

async function ensureEquipmentBookingTenantColumn(db: any, tenantId?: number | null) {
  if (!(await hasDbColumn(db, "equipment_bookings", "tenantId"))) {
    await db.execute(sql.raw("ALTER TABLE `equipment_bookings` ADD COLUMN `tenantId` int NULL"));
  }

  await addIndexIfMissing(
    db,
    "equipment_bookings",
    "idx_equipment_bookings_tenant",
    "CREATE INDEX `idx_equipment_bookings_tenant` ON `equipment_bookings` (`tenantId`)",
  );
  await addIndexIfMissing(
    db,
    "equipment_bookings",
    "idx_equipment_bookings_tenant_equipment",
    "CREATE INDEX `idx_equipment_bookings_tenant_equipment` ON `equipment_bookings` (`tenantId`, `equipmentId`)",
  );
  await addIndexIfMissing(
    db,
    "equipment_bookings",
    "idx_equipment_bookings_tenant_job",
    "CREATE INDEX `idx_equipment_bookings_tenant_job` ON `equipment_bookings` (`tenantId`, `jobId`)",
  );

  await db.execute(sql`
    UPDATE equipment_bookings bookings
    INNER JOIN equipment eqp ON eqp.id = bookings.equipmentId
    SET bookings.tenantId = eqp.tenantId
    WHERE bookings.tenantId IS NULL
      AND eqp.tenantId IS NOT NULL
  `);
  await db.execute(sql`
    UPDATE equipment_bookings bookings
    INNER JOIN construction_jobs jobs ON jobs.id = bookings.jobId
    SET bookings.tenantId = jobs.tenantId
    WHERE bookings.tenantId IS NULL
      AND jobs.tenantId IS NOT NULL
  `);
  if (ENV.tenancyMode === "single" && tenantId) {
    await db.execute(sql`
      UPDATE equipment_bookings
      SET tenantId = ${tenantId}
      WHERE tenantId IS NULL
    `);
  }
}

const importEquipmentRow = z.object({
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

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
  await ensureEquipmentBookingTenantColumn(db, tenantIdFromContext(ctx));
  const [row] = await db.select({ booking: equipmentBookings })
    .from(equipmentBookings)
    .innerJoin(equipment, eq(equipmentBookings.equipmentId, equipment.id))
    .where(and(
      ...equipmentTenantConditions(ctx, eq(equipmentBookings.id, bookingId)),
      ...bookingTenantConditions(ctx),
    ))
    .limit(1);
  if (!row?.booking) throw new TRPCError({ code: "NOT_FOUND", message: "Equipment booking not found" });
  return row.booking;
}

export const equipmentRouter = router({
  // ─── Equipment CRUD ─────────────────────────────────────────────────────────
  tenantSummary: tenantAdminProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdFromContext(ctx);
      const visibleWhere = tenantScoped(equipment.tenantId, tenantId);
      const [total] = await db.select({ count: sql<number>`count(*)` }).from(equipment);
      const [visible] = await db.select({ count: sql<number>`count(*)` }).from(equipment).where(visibleWhere);
      const [unassigned] = await db.select({ count: sql<number>`count(*)` }).from(equipment).where(isNull(equipment.tenantId));
      const [otherTenants] = await db.select({ count: sql<number>`count(*)` }).from(equipment)
        .where(sql`${equipment.tenantId} IS NOT NULL AND ${equipment.tenantId} <> ${tenantId}`);

      return {
        tenantId,
        tenancyMode: ENV.tenancyMode,
        total: Number(total?.count || 0),
        visible: Number(visible?.count || 0),
        unassigned: Number(unassigned?.count || 0),
        otherTenants: Number(otherTenants?.count || 0),
      };
    }),

  repairTenantAssignments: tenantAdminProcedure
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdFromContext(ctx);
      const where = ENV.tenancyMode === "single"
        ? sql`${equipment.tenantId} IS NULL OR ${equipment.tenantId} <> ${tenantId}`
        : isNull(equipment.tenantId);

      const [before] = await db.select({ count: sql<number>`count(*)` }).from(equipment).where(where);
      if (Number(before?.count || 0) > 0) {
        await db.update(equipment).set({ tenantId }).where(where);
      }
      const [visible] = await db.select({ count: sql<number>`count(*)` }).from(equipment)
        .where(tenantScoped(equipment.tenantId, tenantId));

      return {
        reassigned: Number(before?.count || 0),
        visible: Number(visible?.count || 0),
      };
    }),

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

  importCsvRows: tenantAdminProcedure
    .input(z.object({
      rows: z.array(importEquipmentRow).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdFromContext(ctx);
      const existingRows = await db.select().from(equipment)
        .where(tenantScoped(equipment.tenantId, tenantId));
      const bySerial = new Map<string, any>();
      const byNameCategory = new Map<string, any>();
      for (const row of existingRows) {
        const serialKey = normalizeKey(row.serialNumber);
        if (serialKey) bySerial.set(serialKey, row);
        byNameCategory.set(`${normalizeKey(row.name)}|${normalizeKey(row.category)}`, row);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let idx = 0; idx < input.rows.length; idx += 1) {
        const row = input.rows[idx];
        const name = row.name.trim();
        if (!name) {
          skipped += 1;
          continue;
        }
        const serialNumber = row.serialNumber?.trim() || null;
        const category = row.category?.trim() || null;
        const description = row.description?.trim() || null;
        const serialKey = normalizeKey(serialNumber);
        const nameCategoryKey = `${normalizeKey(name)}|${normalizeKey(category)}`;
        const existing = serialKey ? bySerial.get(serialKey) : byNameCategory.get(nameCategoryKey);
        const values = {
          tenantId,
          name,
          category,
          description,
          serialNumber,
          isActive: row.isActive ?? true,
        };

        try {
          if (existing) {
            await db.update(equipment)
              .set(values)
              .where(and(...equipmentTenantConditions(ctx, eq(equipment.id, existing.id))));
            updated += 1;
            const refreshed = { ...existing, ...values };
            if (serialKey) bySerial.set(serialKey, refreshed);
            byNameCategory.set(nameCategoryKey, refreshed);
          } else {
            const [result] = await db.insert(equipment).values(values);
            const inserted = { id: result.insertId, ...values };
            created += 1;
            if (serialKey) bySerial.set(serialKey, inserted);
            byNameCategory.set(nameCategoryKey, inserted);
          }
        } catch (err: any) {
          errors.push(`Row ${idx + 2}: ${err?.message || "import failed"}`);
        }
      }

      return { created, updated, skipped, errors };
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
        await ensureEquipmentBookingTenantColumn(db, tenantIdFromContext(ctx));
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
          .where(and(
            ...equipmentTenantConditions(ctx, ...conditions),
            ...bookingTenantConditions(ctx),
          ))
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
        await ensureEquipmentBookingTenantColumn(db, tenantIdFromContext(ctx));
        await requireEquipmentAccess(db, ctx, input.equipmentId);
        if (input.jobId) await requireJobAccess(db, ctx, input.jobId);

        // Check for conflicts
        const conflicts = await db.select().from(equipmentBookings)
          .where(and(...bookingTenantConditions(
            ctx,
            eq(equipmentBookings.equipmentId, input.equipmentId),
            lte(equipmentBookings.startDate, new Date(input.endDate)),
            gte(equipmentBookings.endDate, new Date(input.startDate)),
          )));

        if (conflicts.length > 0) {
          throw new Error("Equipment is already booked for this date range");
        }

        const [result] = await db.insert(equipmentBookings).values({
          tenantId: tenantIdFromContext(ctx),
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
        await db.update(equipmentBookings).set(vals).where(and(...bookingTenantConditions(ctx, eq(equipmentBookings.id, id))));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireBookingAccess(db, ctx, input.id);
        await db.delete(equipmentBookings).where(and(...bookingTenantConditions(ctx, eq(equipmentBookings.id, input.id))));
        return { success: true };
      }),
  }),
});
