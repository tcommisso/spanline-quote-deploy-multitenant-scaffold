import { router, tenantProcedure as protectedProcedure, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  manufacturingOrders,
  manufacturingTasks,
  manufacturingDispatches,
  manufacturingDrivers,
  manufacturingSchedule,
  constructionJobs,
  branches,
  cmComponentOrders,
  suppliers,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte, sql, asc, count, isNotNull } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import crypto from "crypto";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function driverTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, manufacturingDrivers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function supplierTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, suppliers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireDriverAccess(db: any, ctx: any, driverId: number) {
  const [driver] = await db.select()
    .from(manufacturingDrivers)
    .where(and(...driverTenantConditions(ctx, eq(manufacturingDrivers.id, driverId))))
    .limit(1);
  if (!driver) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });
  }
  return driver;
}

async function requireOrderAccess(db: any, ctx: any, orderId: number) {
  const [row] = await db.select({ order: manufacturingOrders })
    .from(manufacturingOrders)
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingOrders.id, orderId))))
    .limit(1);
  if (!row?.order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Manufacturing order not found" });
  }
  return row.order;
}

async function requireDispatchAccess(db: any, ctx: any, dispatchId: number) {
  const [row] = await db.select({ dispatch: manufacturingDispatches })
    .from(manufacturingDispatches)
    .innerJoin(manufacturingOrders, eq(manufacturingDispatches.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingDispatches.id, dispatchId))))
    .limit(1);
  if (!row?.dispatch) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dispatch not found" });
  }
  return row.dispatch;
}

function publicDriverTenantCondition(driver: typeof manufacturingDrivers.$inferSelect) {
  if (!driver.tenantId) return undefined;
  return eq(constructionJobs.tenantId, driver.tenantId);
}

async function requirePublicDriverDispatch(db: any, driver: typeof manufacturingDrivers.$inferSelect, dispatchId: number) {
  const conditions: any[] = [
    eq(manufacturingDispatches.id, dispatchId),
    eq(manufacturingDispatches.driverId, driver.id),
  ];
  const tenantCondition = publicDriverTenantCondition(driver);
  if (tenantCondition) conditions.push(tenantCondition);

  const [row] = await db.select({ dispatch: manufacturingDispatches })
    .from(manufacturingDispatches)
    .innerJoin(manufacturingOrders, eq(manufacturingDispatches.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...conditions))
    .limit(1);
  if (!row?.dispatch) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Dispatch not found or not assigned to you" });
  }
  return row.dispatch;
}

export const manufacturingDispatchRouter = router({
  // ─── Drivers ──────────────────────────────────────────────────────────────
  drivers: router({
    list: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.activeOnly !== false) {
          conditions.push(eq(manufacturingDrivers.isActive, true));
        }
        appendTenantScope(conditions, manufacturingDrivers.tenantId, tenantIdFromContext(ctx));
        return db.select().from(manufacturingDrivers)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(manufacturingDrivers.name));
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        vehicle: z.string().optional(),
        licencePlate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [result] = await db.insert(manufacturingDrivers).values({
          ...input,
          tenantId: tenantIdFromContext(ctx),
        });
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        vehicle: z.string().optional(),
        licencePlate: z.string().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const { id, ...data } = input;
        await requireDriverAccess(db, ctx, id);
        await db.update(manufacturingDrivers).set(data).where(eq(manufacturingDrivers.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireDriverAccess(db, ctx, input.id);
        await db.delete(manufacturingDrivers).where(eq(manufacturingDrivers.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Dispatches ───────────────────────────────────────────────────────────
  dispatches: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        driverId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.status && input.status !== "all") {
          conditions.push(eq(manufacturingDispatches.status, input.status as any));
        }
        if (input?.driverId) {
          await requireDriverAccess(db, ctx, input.driverId);
          conditions.push(eq(manufacturingDispatches.driverId, input.driverId));
        }
        if (input?.startDate) {
          conditions.push(gte(manufacturingDispatches.scheduledDate, new Date(input.startDate)));
        }
        if (input?.endDate) {
          conditions.push(lte(manufacturingDispatches.scheduledDate, new Date(input.endDate)));
        }
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingDispatches.id,
          orderId: manufacturingDispatches.orderId,
          dispatchNumber: manufacturingDispatches.dispatchNumber,
          status: manufacturingDispatches.status,
          driverId: manufacturingDispatches.driverId,
          driverName: manufacturingDispatches.driverName,
          scheduledDate: manufacturingDispatches.scheduledDate,
          scheduledTimeSlot: manufacturingDispatches.scheduledTimeSlot,
          deliveryAddress: manufacturingDispatches.deliveryAddress,
          deliveryContact: manufacturingDispatches.deliveryContact,
          deliveryPhone: manufacturingDispatches.deliveryPhone,
          deliveryNotes: manufacturingDispatches.deliveryNotes,
          dispatchedAt: manufacturingDispatches.dispatchedAt,
          deliveredAt: manufacturingDispatches.deliveredAt,
          failureReason: manufacturingDispatches.failureReason,
          createdByName: manufacturingDispatches.createdByName,
          createdAt: manufacturingDispatches.createdAt,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
          siteAddress: manufacturingOrders.siteAddress,
        }).from(manufacturingDispatches)
          .innerJoin(manufacturingOrders, eq(manufacturingDispatches.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(manufacturingDispatches.scheduledDate));
      }),

    create: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        driverId: z.number().optional(),
        driverName: z.string().optional(),
        scheduledDate: z.string(),
        scheduledTimeSlot: z.string().optional(),
        deliveryAddress: z.string().optional(),
        deliveryContact: z.string().optional(),
        deliveryPhone: z.string().optional(),
        deliveryNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.orderId);
        if (input.driverId) await requireDriverAccess(db, ctx, input.driverId);

        // Generate dispatch number
        const [countResult] = await db.select({ cnt: count() }).from(manufacturingDispatches);
        const dispatchNumber = `DSP-${String((countResult?.cnt || 0) + 1).padStart(4, "0")}`;

        const [result] = await db.insert(manufacturingDispatches).values({
          ...input,
          scheduledDate: new Date(input.scheduledDate),
          dispatchNumber,
          status: input.driverId ? "scheduled" : "pending",
          createdBy: ctx.user.id,
          createdByName: ctx.user.name,
        });

        // Update order status to ready_for_dispatch if not already
        await db.update(manufacturingOrders)
          .set({ status: "ready_for_dispatch" })
          .where(eq(manufacturingOrders.id, input.orderId));

        return { id: result.insertId, dispatchNumber };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "scheduled", "in_transit", "delivered", "failed", "cancelled"]),
        failureReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const dispatch = await requireDispatchAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "in_transit") updates.dispatchedAt = new Date();
        if (input.status === "delivered") updates.deliveredAt = new Date();
        if (input.status === "failed") updates.failureReason = input.failureReason;
        await db.update(manufacturingDispatches).set(updates).where(eq(manufacturingDispatches.id, input.id));

        // If delivered, update the manufacturing order status
        if (input.status === "delivered") {
          if (dispatch) {
            await db.update(manufacturingOrders)
              .set({ status: "dispatched" })
              .where(eq(manufacturingOrders.id, dispatch.orderId));
          }
        }

        return { success: true };
      }),

    assignDriver: protectedProcedure
      .input(z.object({
        id: z.number(),
        driverId: z.number(),
        driverName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireDispatchAccess(db, ctx, input.id);
        await requireDriverAccess(db, ctx, input.driverId);
        await db.update(manufacturingDispatches).set({
          driverId: input.driverId,
          driverName: input.driverName,
          status: "scheduled",
        }).where(eq(manufacturingDispatches.id, input.id));
        return { success: true };
      }),

    confirmDelivery: protectedProcedure
      .input(z.object({
        id: z.number(),
        signature: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const dispatch = await requireDispatchAccess(db, ctx, input.id);
        await db.update(manufacturingDispatches).set({
          status: "delivered",
          deliveredAt: new Date(),
          deliverySignature: input.signature,
        }).where(eq(manufacturingDispatches.id, input.id));

        // Update order status
        if (dispatch) {
          await db.update(manufacturingOrders)
            .set({ status: "dispatched" })
            .where(eq(manufacturingOrders.id, dispatch.orderId));

          // Notify owner
          const order = await requireOrderAccess(db, ctx, dispatch.orderId);
          if (order) {
            await notifyOwner({
              title: `Delivery Confirmed: ${order.orderNumber}`,
              content: `Order ${order.orderNumber} for ${order.clientName} has been delivered successfully.`,
            });
          }
        }
        return { success: true };
      }),

    /** Confirm delivery with supplier feedback prompt data */
    confirmDeliveryWithFeedback: protectedProcedure
      .input(z.object({
        id: z.number(),
        signature: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const dispatch = await requireDispatchAccess(db, ctx, input.id);
        await db.update(manufacturingDispatches).set({
          status: "delivered",
          deliveredAt: new Date(),
          deliverySignature: input.signature,
        }).where(eq(manufacturingDispatches.id, input.id));

        // Get dispatch -> order -> component order -> supplier
        let supplierId: number | null = null;
        let supplierName: string | null = null;

        if (dispatch) {
          await db.update(manufacturingOrders)
            .set({ status: "dispatched" })
            .where(eq(manufacturingOrders.id, dispatch.orderId));

          // Get supplier from component order
          const [order] = await db.select({
            componentOrderId: manufacturingOrders.componentOrderId,
            clientName: manufacturingOrders.clientName,
            orderNumber: manufacturingOrders.orderNumber,
          }).from(manufacturingOrders).where(eq(manufacturingOrders.id, dispatch.orderId));

          if (order) {
            const [compOrder] = await db.select({ supplier: cmComponentOrders.supplier })
              .from(cmComponentOrders)
              .where(eq(cmComponentOrders.id, order.componentOrderId));
            if (compOrder?.supplier) {
              supplierName = compOrder.supplier;
              const [supplierRow] = await db.select({ id: suppliers.id })
                .from(suppliers)
                .where(and(...supplierTenantConditions(ctx, eq(suppliers.name, compOrder.supplier), eq(suppliers.supplierScope, "manufacturing"))))
                .limit(1);
              supplierId = supplierRow?.id || null;
            }

            await notifyOwner({
              title: `Delivery Confirmed: ${order.orderNumber}`,
              content: `Order ${order.orderNumber} for ${order.clientName} has been delivered successfully.`,
            });
          }
        }

        return { success: true, supplierId, supplierName };
      }),

    // Driver schedule (all dispatches for a driver in a date range)
    driverSchedule: protectedProcedure
      .input(z.object({
        driverId: z.number().optional(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [
          gte(manufacturingDispatches.scheduledDate, new Date(input.startDate)),
          lte(manufacturingDispatches.scheduledDate, new Date(input.endDate)),
        ];
        if (input.driverId) {
          await requireDriverAccess(db, ctx, input.driverId);
          conditions.push(eq(manufacturingDispatches.driverId, input.driverId));
        }
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingDispatches.id,
          orderId: manufacturingDispatches.orderId,
          dispatchNumber: manufacturingDispatches.dispatchNumber,
          status: manufacturingDispatches.status,
          driverId: manufacturingDispatches.driverId,
          driverName: manufacturingDispatches.driverName,
          scheduledDate: manufacturingDispatches.scheduledDate,
          scheduledTimeSlot: manufacturingDispatches.scheduledTimeSlot,
          deliveryAddress: manufacturingDispatches.deliveryAddress,
          deliveryContact: manufacturingDispatches.deliveryContact,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
        }).from(manufacturingDispatches)
          .innerJoin(manufacturingOrders, eq(manufacturingDispatches.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(and(...conditions))
          .orderBy(asc(manufacturingDispatches.scheduledDate));
      }),
  }),

  // ─── QR Code Task Scanning ────────────────────────────────────────────────
  qr: router({
    // Generate QR tokens for tasks that don't have one
    generateTokens: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.orderId);
        const tasks = await db.select({ id: manufacturingTasks.id, qrToken: manufacturingTasks.qrToken })
          .from(manufacturingTasks)
          .where(eq(manufacturingTasks.orderId, input.orderId));

        let generated = 0;
        for (const task of tasks) {
          if (!task.qrToken) {
            const token = crypto.randomBytes(16).toString("hex");
            await db.update(manufacturingTasks)
              .set({ qrToken: token })
              .where(eq(manufacturingTasks.id, task.id));
            generated++;
          }
        }
        return { generated, total: tasks.length };
      }),

    // Get tasks with QR tokens for an order (for printing)
    getTaskTokens: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.orderId);
        return db.select({
          id: manufacturingTasks.id,
          productName: manufacturingTasks.productName,
          category: manufacturingTasks.category,
          colour: manufacturingTasks.colour,
          quantity: manufacturingTasks.quantity,
          unit: manufacturingTasks.unit,
          status: manufacturingTasks.status,
          qrToken: manufacturingTasks.qrToken,
        }).from(manufacturingTasks)
          .where(eq(manufacturingTasks.orderId, input.orderId))
          .orderBy(asc(manufacturingTasks.id));
      }),

    // Public endpoint: scan a QR token and get task info
    scan: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [task] = await db.select({
          id: manufacturingTasks.id,
          productName: manufacturingTasks.productName,
          category: manufacturingTasks.category,
          colour: manufacturingTasks.colour,
          quantity: manufacturingTasks.quantity,
          unit: manufacturingTasks.unit,
          status: manufacturingTasks.status,
          orderId: manufacturingTasks.orderId,
          branchName: manufacturingTasks.branchName,
          description: manufacturingTasks.description,
        }).from(manufacturingTasks)
          .where(eq(manufacturingTasks.qrToken, input.token));
        if (!task) return null;

        // Get order info
        const [order] = await db.select({
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
        }).from(manufacturingOrders)
          .where(eq(manufacturingOrders.id, task.orderId));

        return { ...task, orderNumber: order?.orderNumber, clientName: order?.clientName };
      }),

    // Public endpoint: update task status via QR scan
    updateStatus: publicProcedure
      .input(z.object({
        token: z.string(),
        status: z.enum(["pending", "scheduled", "in_progress", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const [task] = await db.select({ id: manufacturingTasks.id })
          .from(manufacturingTasks)
          .where(eq(manufacturingTasks.qrToken, input.token));
        if (!task) throw new Error("Invalid QR code");

        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();

        await db.update(manufacturingTasks).set(updates).where(eq(manufacturingTasks.id, task.id));
        return { success: true, taskId: task.id };
      }),
  }),

  // ─── KPI Dashboard Queries ────────────────────────────────────────────────
  kpi: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();

      // Throughput: completed tasks in last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const [throughput] = await db.select({ cnt: count() }).from(manufacturingTasks)
        .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(
          eq(manufacturingTasks.status, "completed"),
          gte(manufacturingTasks.completedAt, sevenDaysAgo),
          ...jobTenantConditions(ctx),
        ));

      // Average lead time: avg days from order receivedAt to completedAt for completed orders
      const [leadTime] = await db.select({
        avgDays: sql<number>`AVG(DATEDIFF(${manufacturingOrders.completedAt}, ${manufacturingOrders.receivedAt}))`,
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(
          eq(manufacturingOrders.status, "completed" as any),
          isNotNull(manufacturingOrders.completedAt),
          ...jobTenantConditions(ctx),
        ));

      // Overdue: orders past target date that aren't completed/dispatched/cancelled
      const now = new Date();
      const [overdue] = await db.select({ cnt: count() }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(
          lte(manufacturingOrders.targetDate, now),
          sql`${manufacturingOrders.status} NOT IN ('completed', 'dispatched', 'cancelled', 'ready_for_dispatch')`,
          ...jobTenantConditions(ctx),
        ));

      // Total active orders
      const [active] = await db.select({ cnt: count() }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(
          sql`${manufacturingOrders.status} NOT IN ('completed', 'dispatched', 'cancelled')`,
          ...jobTenantConditions(ctx),
        ));

      const overduePercent = (active?.cnt || 0) > 0 ? Math.round(((overdue?.cnt || 0) / (active?.cnt || 1)) * 100) : 0;

      return {
        throughputRate: throughput?.cnt || 0,
        avgLeadTime: Math.round(leadTime?.avgDays || 0),
        overdueCount: overdue?.cnt || 0,
        overduePercent,
        totalActive: active?.cnt || 0,
      };
    }),

    // Throughput trend: completed tasks per day for last 30 days
    throughputTrend: protectedProcedure
      .input(z.object({ days: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const days = input?.days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const results = await db.select({
          date: sql<string>`DATE(${manufacturingTasks.completedAt})`,
          count: count(),
        }).from(manufacturingTasks)
          .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(and(
            eq(manufacturingTasks.status, "completed"),
            gte(manufacturingTasks.completedAt, startDate),
            ...jobTenantConditions(ctx),
          ))
          .groupBy(sql`DATE(${manufacturingTasks.completedAt})`)
          .orderBy(sql`DATE(${manufacturingTasks.completedAt})`);

        return results.map(r => ({ date: r.date, count: r.count }));
      }),

    // Lead time distribution: days from receivedAt to completedAt for last 90 days
    leadTimeDistribution: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const results = await db.select({
        days: sql<number>`DATEDIFF(${manufacturingOrders.completedAt}, ${manufacturingOrders.receivedAt})`,
        count: count(),
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(
          isNotNull(manufacturingOrders.completedAt),
          gte(manufacturingOrders.completedAt, ninetyDaysAgo),
          ...jobTenantConditions(ctx),
        ))
        .groupBy(sql`DATEDIFF(${manufacturingOrders.completedAt}, ${manufacturingOrders.receivedAt})`)
        .orderBy(sql`DATEDIFF(${manufacturingOrders.completedAt}, ${manufacturingOrders.receivedAt})`);

      return results.map(r => ({ days: r.days, count: r.count }));
    }),

    // Branch utilisation: tasks per branch (active vs capacity)
    branchUtilisation: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();

      const results = await db.select({
        branchId: manufacturingTasks.branchId,
        branchName: manufacturingTasks.branchName,
        total: count(),
        active: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} IN ('pending', 'scheduled', 'in_progress') THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      }).from(manufacturingTasks)
        .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(
          isNotNull(manufacturingTasks.branchId),
          ...jobTenantConditions(ctx),
        ))
        .groupBy(manufacturingTasks.branchId, manufacturingTasks.branchName);

      return results.map(r => ({
        branchId: r.branchId,
        branchName: r.branchName || "Unknown",
        total: r.total,
        active: Number(r.active) || 0,
        completed: Number(r.completed) || 0,
      }));
    }),

    // Orders by status breakdown
    ordersByStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const results = await db.select({
        status: manufacturingOrders.status,
        count: count(),
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)))
        .groupBy(manufacturingOrders.status);
      return results;
    }),
  }),

  // ─── Driver Mobile Access ──────────────────────────────────────────────────
  driverMobile: router({
    // Generate access token for a driver
    generateToken: protectedProcedure.input(z.object({ driverId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireDriverAccess(db, ctx, input.driverId);
      const token = crypto.randomBytes(24).toString("hex");
      await db.update(manufacturingDrivers).set({ driverAccessToken: token }).where(eq(manufacturingDrivers.id, input.driverId));
      return { token };
    }),

    // Revoke access token
    revokeToken: protectedProcedure.input(z.object({ driverId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireDriverAccess(db, ctx, input.driverId);
      await db.update(manufacturingDrivers).set({ driverAccessToken: null }).where(eq(manufacturingDrivers.id, input.driverId));
      return { success: true };
    }),

    // Public: Get driver schedule by token (no auth required)
    schedule: publicProcedure.input(z.object({ token: z.string() })).query(async ({ input }) => {
      const db = await requireDb();
      const [driver] = await db.select().from(manufacturingDrivers)
        .where(and(eq(manufacturingDrivers.driverAccessToken, input.token), eq(manufacturingDrivers.isActive, true)));
      if (!driver) throw new Error("Invalid or expired access token");

      // Get upcoming dispatches for this driver
      const conditions: any[] = [
        eq(manufacturingDispatches.driverId, driver.id),
        sql`${manufacturingDispatches.status} IN ('scheduled', 'in_transit')`,
      ];
      const tenantCondition = publicDriverTenantCondition(driver);
      if (tenantCondition) conditions.push(tenantCondition);

      const dispatches = await db.select({
        id: manufacturingDispatches.id,
        dispatchNumber: manufacturingDispatches.dispatchNumber,
        status: manufacturingDispatches.status,
        scheduledDate: manufacturingDispatches.scheduledDate,
        scheduledTimeSlot: manufacturingDispatches.scheduledTimeSlot,
        deliveryAddress: manufacturingDispatches.deliveryAddress,
        deliveryContact: manufacturingDispatches.deliveryContact,
        deliveryPhone: manufacturingDispatches.deliveryPhone,
        deliveryNotes: manufacturingDispatches.deliveryNotes,
      }).from(manufacturingDispatches)
        .innerJoin(manufacturingOrders, eq(manufacturingDispatches.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...conditions))
        .orderBy(asc(manufacturingDispatches.scheduledDate));

      return {
        driver: { id: driver.id, name: driver.name, vehicle: driver.vehicle, licencePlate: driver.licencePlate },
        dispatches,
      };
    }),

    // Public: Confirm delivery by token
    confirmDelivery: publicProcedure.input(z.object({
      token: z.string(),
      dispatchId: z.number(),
      signature: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const db = await requireDb();
      const [driver] = await db.select().from(manufacturingDrivers)
        .where(and(eq(manufacturingDrivers.driverAccessToken, input.token), eq(manufacturingDrivers.isActive, true)));
      if (!driver) throw new Error("Invalid or expired access token");

      const dispatch = await requirePublicDriverDispatch(db, driver, input.dispatchId);

      await db.update(manufacturingDispatches).set({
        status: "delivered",
        deliveredAt: new Date(),
        deliverySignature: input.signature || null,
        deliveryNotes: input.notes ? `${dispatch.deliveryNotes || ""}\n[Driver] ${input.notes}` : dispatch.deliveryNotes,
      }).where(eq(manufacturingDispatches.id, input.dispatchId));

      await db.update(manufacturingOrders)
        .set({ status: "dispatched" })
        .where(eq(manufacturingOrders.id, dispatch.orderId));

      // Notify owner
      await notifyOwner({
        title: "Delivery Confirmed",
        content: `Driver ${driver.name} confirmed delivery for ${dispatch.dispatchNumber || "dispatch #" + dispatch.id} at ${dispatch.deliveryAddress || "unknown address"}.`,
      });

      return { success: true };
    }),

    // Public: Mark dispatch as in transit
    markInTransit: publicProcedure.input(z.object({
      token: z.string(),
      dispatchId: z.number(),
    })).mutation(async ({ input }) => {
      const db = await requireDb();
      const [driver] = await db.select().from(manufacturingDrivers)
        .where(and(eq(manufacturingDrivers.driverAccessToken, input.token), eq(manufacturingDrivers.isActive, true)));
      if (!driver) throw new Error("Invalid or expired access token");

      await requirePublicDriverDispatch(db, driver, input.dispatchId);

      await db.update(manufacturingDispatches).set({
        status: "in_transit",
        dispatchedAt: new Date(),
      }).where(eq(manufacturingDispatches.id, input.dispatchId));

      return { success: true };
    }),
  }),
});
