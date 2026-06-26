import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  constructionJobs,
  flashingOrderLines,
  flashingOrders,
  flashingOrderStatusHistory,
  flashingProfileTemplates,
} from "../drizzle/schema.js";
import { router, tenantProcedure } from "./_core/trpc.js";
import { tenantIdFromContext } from "./_core/tenant-scope";
import { getDb } from "./db.js";

const orderStatuses = [
  "draft",
  "submitted",
  "supplier_received",
  "in_production",
  "purchase_ordered",
  "ready",
  "completed",
  "cancelled",
  "archived",
] as const;

const lineStatuses = [
  "draft",
  "ready",
  "needs_clarification",
  "approved",
  "in_production",
  "completed",
  "cancelled",
] as const;

const colourSides = ["inside", "outside", "both", "unspecified"] as const;

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const profileGeometrySchema = z.object({
  points: z.array(pointSchema).min(2),
  gridSize: z.number().positive().default(20),
  snapToGrid: z.boolean().default(true),
  foldLabels: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});

const lineInputSchema = z.object({
  id: z.number().optional(),
  orderId: z.number(),
  templateId: z.number().nullish(),
  profileName: z.string().trim().min(1).max(255),
  category: z.string().trim().max(128).default("custom"),
  materialType: z.string().trim().max(128).default("Colorbond"),
  gauge: z.string().trim().max(64).nullish(),
  colour: z.string().trim().max(128).nullish(),
  colourSide: z.enum(colourSides).default("unspecified"),
  finish: z.string().trim().max(128).nullish(),
  quantity: z.number().int().min(1).max(999).default(1),
  lengthMm: z.number().min(0).max(999999).default(0),
  unitPrice: z.number().min(0).max(999999).default(0),
  geometry: profileGeometrySchema,
  foldDetails: z.record(z.string(), z.any()).optional().default({}),
  manufacturingNotes: z.string().nullish(),
  status: z.enum(lineStatuses).default("draft"),
});

function tenantIdOrThrow(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
  }
  return tenantId;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

function distance(a: z.infer<typeof pointSchema>, b: z.infer<typeof pointSchema>) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function profileGirthMm(geometry: z.infer<typeof profileGeometrySchema>) {
  return geometry.points.slice(1).reduce((total, point, index) => total + distance(geometry.points[index], point), 0);
}

function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function lineMetrics(input: z.infer<typeof lineInputSchema>) {
  const girthMm = round2(profileGirthMm(input.geometry));
  const totalLinealMetres = round2((input.lengthMm * input.quantity) / 1000);
  const bendCount = Math.max(0, input.geometry.points.length - 2);
  const lineTotal = round2(totalLinealMetres * input.unitPrice);
  return { girthMm, totalLinealMetres, bendCount, lineTotal };
}

async function nextOrderNumber(db: any, tenantId: number) {
  const [row] = await db
    .select({
      maxNumber: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${flashingOrders.orderNumber}, 4) AS UNSIGNED)), 0)`,
    })
    .from(flashingOrders)
    .where(eq(flashingOrders.tenantId, tenantId));
  const next = Number(row?.maxNumber || 0) + 1;
  return `FL-${String(next).padStart(4, "0")}`;
}

async function requireOrder(db: any, tenantId: number, orderId: number) {
  const [order] = await db
    .select()
    .from(flashingOrders)
    .where(and(eq(flashingOrders.id, orderId), eq(flashingOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Flashing order not found." });
  return order;
}

async function recalculateOrderTotals(db: any, tenantId: number, orderId: number) {
  const lines = await db
    .select({
      id: flashingOrderLines.id,
      quantity: flashingOrderLines.quantity,
      girthMm: flashingOrderLines.girthMm,
      totalLinealMetres: flashingOrderLines.totalLinealMetres,
      lineTotal: flashingOrderLines.lineTotal,
    })
    .from(flashingOrderLines)
    .where(and(eq(flashingOrderLines.orderId, orderId), eq(flashingOrderLines.tenantId, tenantId)));

  const totals = lines.reduce((acc: { totalGirthMm: number; totalLinealMetres: number; totalExGst: number }, line: any) => {
    acc.totalGirthMm += Number(line.girthMm || 0) * Number(line.quantity || 1);
    acc.totalLinealMetres += Number(line.totalLinealMetres || 0);
    acc.totalExGst += Number(line.lineTotal || 0);
    return acc;
  }, { totalGirthMm: 0, totalLinealMetres: 0, totalExGst: 0 });

  await db
    .update(flashingOrders)
    .set({
      lineCount: lines.length,
      totalGirthMm: round2(totals.totalGirthMm).toFixed(2),
      totalLinealMetres: round2(totals.totalLinealMetres).toFixed(2),
      totalExGst: round2(totals.totalExGst).toFixed(2),
    })
    .where(and(eq(flashingOrders.id, orderId), eq(flashingOrders.tenantId, tenantId)));
}

export const flashingRouter = router({
  listOrders: tenantProcedure
    .input(z.object({
      search: z.string().optional().default(""),
      status: z.enum(orderStatuses).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const parsed = input || { search: "", limit: 25, offset: 0 };
      const conditions: any[] = [eq(flashingOrders.tenantId, tenantId)];
      const search = parsed.search?.trim();
      if (parsed.status) conditions.push(eq(flashingOrders.status, parsed.status));
      if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${flashingOrders.orderNumber})`, pattern),
          like(sql`LOWER(${flashingOrders.jobNumber})`, pattern),
          like(sql`LOWER(${flashingOrders.clientName})`, pattern),
          like(sql`LOWER(${flashingOrders.siteAddress})`, pattern),
        )!);
      }

      const whereClause = and(...conditions);
      const [totalRow] = await db.select({ total: count() }).from(flashingOrders).where(whereClause);
      const orders = await db
        .select()
        .from(flashingOrders)
        .where(whereClause)
        .orderBy(desc(flashingOrders.updatedAt))
        .limit(parsed.limit)
        .offset(parsed.offset);

      return { orders, total: totalRow?.total || 0 };
    }),

  jobsForSelect: tenantProcedure
    .input(z.object({ search: z.string().optional().default("") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const conditions: any[] = [eq(constructionJobs.tenantId, tenantId)];
      const search = input?.search?.trim();
      if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${constructionJobs.clientName})`, pattern),
          like(sql`LOWER(${constructionJobs.quoteNumber})`, pattern),
          like(sql`LOWER(${constructionJobs.siteAddress})`, pattern),
        )!);
      }
      return db
        .select({
          id: constructionJobs.id,
          jobNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          status: constructionJobs.status,
        })
        .from(constructionJobs)
        .where(and(...conditions))
        .orderBy(desc(constructionJobs.updatedAt))
        .limit(50);
    }),

  createOrder: tenantProcedure
    .input(z.object({
      jobId: z.number().optional(),
      clientName: z.string().trim().max(255).optional(),
      siteAddress: z.string().trim().optional(),
      requestedDeliveryAt: z.string().optional(),
      deliveryMethod: z.string().trim().max(64).optional(),
      siteNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      let job: any = null;
      if (input.jobId) {
        [job] = await db.select().from(constructionJobs)
          .where(and(eq(constructionJobs.id, input.jobId), eq(constructionJobs.tenantId, tenantId)))
          .limit(1);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Construction job not found." });
      }

      const orderNumber = await nextOrderNumber(db, tenantId);
      const [result] = await db.insert(flashingOrders).values({
        tenantId,
        orderNumber,
        jobId: job?.id ?? null,
        jobNumber: job?.quoteNumber ?? null,
        clientName: job?.clientName ?? input.clientName ?? null,
        siteAddress: job?.siteAddress ?? input.siteAddress ?? null,
        requestedByUserId: ctx.user.id,
        requestedByName: ctx.user.name || null,
        requestedByEmail: ctx.user.email || null,
        deliveryMethod: input.deliveryMethod || "pickup",
        requestedDeliveryAt: input.requestedDeliveryAt ? new Date(input.requestedDeliveryAt) : null,
        siteNotes: input.siteNotes || null,
        createdBy: ctx.user.id,
      });

      const orderId = Number(result.insertId);
      await db.insert(flashingOrderStatusHistory).values({
        tenantId,
        orderId,
        fromStatus: null,
        toStatus: "draft",
        changedByUserId: ctx.user.id,
        changedByName: ctx.user.name || ctx.user.email || "Unknown",
        notes: "Order created",
      });
      return { id: orderId, orderNumber };
    }),

  getOrder: tenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const order = await requireOrder(db, tenantId, input.id);
      const [lines, statusHistory, templates] = await Promise.all([
        db.select().from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.orderId, input.id), eq(flashingOrderLines.tenantId, tenantId)))
          .orderBy(flashingOrderLines.lineNumber, flashingOrderLines.id),
        db.select().from(flashingOrderStatusHistory)
          .where(and(eq(flashingOrderStatusHistory.orderId, input.id), eq(flashingOrderStatusHistory.tenantId, tenantId)))
          .orderBy(desc(flashingOrderStatusHistory.createdAt)),
        db.select().from(flashingProfileTemplates)
          .where(and(eq(flashingProfileTemplates.tenantId, tenantId), eq(flashingProfileTemplates.isActive, true)))
          .orderBy(flashingProfileTemplates.category, flashingProfileTemplates.name)
          .limit(200),
      ]);
      return { order, lines, statusHistory, templates };
    }),

  updateOrder: tenantProcedure
    .input(z.object({
      id: z.number(),
      supplierName: z.string().trim().max(255).nullish(),
      requestedDeliveryAt: z.string().nullish(),
      deliveryMethod: z.string().trim().max(64).nullish(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      siteNotes: z.string().nullish(),
      internalNotes: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      await requireOrder(db, tenantId, input.id);
      await db.update(flashingOrders)
        .set({
          supplierName: input.supplierName ?? null,
          requestedDeliveryAt: input.requestedDeliveryAt ? new Date(input.requestedDeliveryAt) : null,
          deliveryMethod: input.deliveryMethod ?? "pickup",
          priority: input.priority,
          siteNotes: input.siteNotes ?? null,
          internalNotes: input.internalNotes ?? null,
        })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      return { success: true };
    }),

  saveLine: tenantProcedure
    .input(lineInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      await requireOrder(db, tenantId, input.orderId);
      const metrics = lineMetrics(input);
      const values = {
        tenantId,
        orderId: input.orderId,
        templateId: input.templateId ?? null,
        profileName: input.profileName,
        category: input.category,
        materialType: input.materialType,
        gauge: input.gauge ?? null,
        colour: input.colour ?? null,
        colourSide: input.colourSide,
        finish: input.finish ?? null,
        quantity: input.quantity,
        lengthMm: input.lengthMm.toFixed(2),
        totalLinealMetres: metrics.totalLinealMetres.toFixed(2),
        girthMm: metrics.girthMm.toFixed(2),
        bendCount: metrics.bendCount,
        unitPrice: input.unitPrice.toFixed(2),
        lineTotal: metrics.lineTotal.toFixed(2),
        geometry: input.geometry,
        foldDetails: input.foldDetails,
        manufacturingNotes: input.manufacturingNotes ?? null,
        status: input.status,
      };

      let lineId = input.id;
      if (lineId) {
        const [line] = await db.select({ id: flashingOrderLines.id }).from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.id, lineId), eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)))
          .limit(1);
        if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Flashing line not found." });
        await db.update(flashingOrderLines)
          .set(values)
          .where(and(eq(flashingOrderLines.id, lineId), eq(flashingOrderLines.tenantId, tenantId)));
      } else {
        const [maxLine] = await db.select({ maxLine: sql<number>`COALESCE(MAX(${flashingOrderLines.lineNumber}), 0)` })
          .from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)));
        const [result] = await db.insert(flashingOrderLines).values({
          ...values,
          lineNumber: Number(maxLine?.maxLine || 0) + 1,
        });
        lineId = Number(result.insertId);
      }

      await recalculateOrderTotals(db, tenantId, input.orderId);
      return { id: lineId, ...metrics };
    }),

  deleteLine: tenantProcedure
    .input(z.object({ id: z.number(), orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      await requireOrder(db, tenantId, input.orderId);
      await db.delete(flashingOrderLines)
        .where(and(eq(flashingOrderLines.id, input.id), eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)));
      await recalculateOrderTotals(db, tenantId, input.orderId);
      return { success: true };
    }),

  updateStatus: tenantProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(orderStatuses),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const order = await requireOrder(db, tenantId, input.id);
      await db.update(flashingOrders)
        .set({
          status: input.status,
          submittedAt: input.status === "submitted" && !order.submittedAt ? new Date() : order.submittedAt,
        })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      await db.insert(flashingOrderStatusHistory).values({
        tenantId,
        orderId: input.id,
        fromStatus: order.status,
        toStatus: input.status,
        notes: input.notes || null,
        changedByUserId: ctx.user.id,
        changedByName: ctx.user.name || ctx.user.email || "Unknown",
      });
      return { success: true };
    }),

  listTemplates: tenantProcedure
    .input(z.object({ search: z.string().optional().default(""), category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const conditions: any[] = [eq(flashingProfileTemplates.tenantId, tenantId), eq(flashingProfileTemplates.isActive, true)];
      if (input?.category) conditions.push(eq(flashingProfileTemplates.category, input.category));
      if (input?.search?.trim()) {
        const pattern = `%${input.search.trim().toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${flashingProfileTemplates.name})`, pattern),
          like(sql`LOWER(${flashingProfileTemplates.category})`, pattern),
          like(sql`LOWER(${flashingProfileTemplates.tags})`, pattern),
        )!);
      }
      return db.select().from(flashingProfileTemplates)
        .where(and(...conditions))
        .orderBy(flashingProfileTemplates.category, flashingProfileTemplates.name)
        .limit(200);
    }),

  saveTemplate: tenantProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(255),
      category: z.string().trim().max(128).default("custom"),
      geometry: profileGeometrySchema,
      defaultMaterialType: z.string().trim().max(128).nullish(),
      defaultGauge: z.string().trim().max(64).nullish(),
      defaultColour: z.string().trim().max(128).nullish(),
      defaultColourSide: z.enum(colourSides).default("unspecified"),
      defaultQuantity: z.number().int().min(1).default(1),
      defaultLengthMm: z.number().min(0).default(0),
      notes: z.string().nullish(),
      tags: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const [result] = await db.insert(flashingProfileTemplates).values({
        tenantId,
        name: input.name,
        category: input.category,
        geometry: input.geometry,
        defaultMaterialType: input.defaultMaterialType ?? null,
        defaultGauge: input.defaultGauge ?? null,
        defaultColour: input.defaultColour ?? null,
        defaultColourSide: input.defaultColourSide,
        defaultQuantity: input.defaultQuantity,
        defaultLengthMm: input.defaultLengthMm.toFixed(2),
        notes: input.notes ?? null,
        tags: input.tags ?? null,
        createdBy: ctx.user.id,
      });
      return { id: Number(result.insertId) };
    }),
});
