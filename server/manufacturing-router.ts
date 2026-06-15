import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  manufacturingOrders,
  manufacturingTasks,
  manufacturingSchedule,
  manufacturingPurchaseOrders,
  constructionJobs,
  cmComponentOrders,
  checkMeasureWorkbooks,
  branches,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte, inArray, sql, asc } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
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

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select()
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }
  return job;
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

async function requireComponentOrderAccess(db: any, ctx: any, componentOrderId: number) {
  const [row] = await db.select({
    componentOrder: cmComponentOrders,
    job: constructionJobs,
  })
    .from(cmComponentOrders)
    .innerJoin(checkMeasureWorkbooks, eq(cmComponentOrders.workbookId, checkMeasureWorkbooks.id))
    .innerJoin(constructionJobs, eq(checkMeasureWorkbooks.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(cmComponentOrders.id, componentOrderId))))
    .limit(1);
  if (!row?.componentOrder || !row.job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Component order not found" });
  }
  return row;
}

async function requireTaskAccess(db: any, ctx: any, taskId: number) {
  const [row] = await db.select({ task: manufacturingTasks })
    .from(manufacturingTasks)
    .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingTasks.id, taskId))))
    .limit(1);
  if (!row?.task) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Manufacturing task not found" });
  }
  return row.task;
}

async function requireTaskIdsAccess(db: any, ctx: any, taskIds: number[]) {
  if (taskIds.length === 0) return;
  const rows = await db.select({ id: manufacturingTasks.id })
    .from(manufacturingTasks)
    .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, inArray(manufacturingTasks.id, taskIds))));
  if (rows.length !== new Set(taskIds).size) {
    throw new TRPCError({ code: "FORBIDDEN", message: "One or more tasks are outside this tenant" });
  }
}

async function requireScheduleAccess(db: any, ctx: any, scheduleId: number) {
  const [row] = await db.select({ schedule: manufacturingSchedule })
    .from(manufacturingSchedule)
    .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingSchedule.id, scheduleId))))
    .limit(1);
  if (!row?.schedule) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Schedule entry not found" });
  }
  return row.schedule;
}

async function requirePurchaseOrderAccess(db: any, ctx: any, poId: number) {
  const [row] = await db.select({ po: manufacturingPurchaseOrders })
    .from(manufacturingPurchaseOrders)
    .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingPurchaseOrders.id, poId))))
    .limit(1);
  if (!row?.po) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });
  }
  return row.po;
}

export const manufacturingRouter = router({
  // ─── Orders ────────────────────────────────────────────────────────────────
  orders: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.status && input.status !== "all") {
          conditions.push(eq(manufacturingOrders.status, input.status as any));
        }
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        let orders = await db.select({
          id: manufacturingOrders.id,
          componentOrderId: manufacturingOrders.componentOrderId,
          jobId: manufacturingOrders.jobId,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
          siteAddress: manufacturingOrders.siteAddress,
          status: manufacturingOrders.status,
          priority: manufacturingOrders.priority,
          targetDate: manufacturingOrders.targetDate,
          completedAt: manufacturingOrders.completedAt,
          notes: manufacturingOrders.notes,
          receivedByName: manufacturingOrders.receivedByName,
          receivedAt: manufacturingOrders.receivedAt,
          createdAt: manufacturingOrders.createdAt,
        }).from(manufacturingOrders)
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(manufacturingOrders.createdAt));

        if (input?.search) {
          const s = input.search.toLowerCase();
          orders = orders.filter(o =>
            o.clientName?.toLowerCase().includes(s) ||
            o.orderNumber?.toLowerCase().includes(s) ||
            o.siteAddress?.toLowerCase().includes(s)
          );
        }
        return orders;
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const order = await requireOrderAccess(db, ctx, input.id);
        const tasks = await db.select().from(manufacturingTasks).where(eq(manufacturingTasks.orderId, input.id)).orderBy(asc(manufacturingTasks.category), asc(manufacturingTasks.productName));
        const schedule = await db.select().from(manufacturingSchedule).where(eq(manufacturingSchedule.orderId, input.id)).orderBy(asc(manufacturingSchedule.scheduledDate));
        const pos = await db.select().from(manufacturingPurchaseOrders).where(eq(manufacturingPurchaseOrders.orderId, input.id)).orderBy(desc(manufacturingPurchaseOrders.createdAt));
        return { ...order, tasks, schedule, purchaseOrders: pos };
      }),

    create: protectedProcedure
      .input(z.object({
        componentOrderId: z.number(),
        jobId: z.number(),
        clientName: z.string(),
        siteAddress: z.string().optional(),
        targetDate: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireJobAccess(db, ctx, input.jobId);
        const { componentOrder, job } = await requireComponentOrderAccess(db, ctx, input.componentOrderId);
        if (componentOrder.workbookId && job.id !== input.jobId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Component order does not belong to this job" });
        }
        // Generate order number
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingOrders);
        const orderNum = `MFG-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
        const [result] = await db.insert(manufacturingOrders).values({
          componentOrderId: input.componentOrderId,
          jobId: input.jobId,
          orderNumber: orderNum,
          clientName: input.clientName,
          siteAddress: input.siteAddress,
          status: "received",
          priority: input.priority || "normal",
          targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
          notes: input.notes,
          receivedBy: ctx.user.id,
          receivedByName: ctx.user.name,
        });
        return { id: result.insertId, orderNumber: orderNum };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["received", "in_production", "partially_complete", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();
        await db.update(manufacturingOrders).set(updates).where(eq(manufacturingOrders.id, input.id));
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        targetDate: z.string().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const { id, ...updates } = input;
        await requireOrderAccess(db, ctx, id);
        const setData: any = {};
        if (updates.targetDate !== undefined) setData.targetDate = updates.targetDate ? new Date(updates.targetDate) : null;
        if (updates.priority) setData.priority = updates.priority;
        if (updates.notes !== undefined) setData.notes = updates.notes;
        await db.update(manufacturingOrders).set(setData).where(eq(manufacturingOrders.id, id));
        return { success: true };
      }),

    // Receive a component order into manufacturing (auto-creates tasks from lineItems)
    receiveFromConstruction: protectedProcedure
      .input(z.object({ componentOrderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const { componentOrder: compOrder, job } = await requireComponentOrderAccess(db, ctx, input.componentOrderId);
        // Check if already received
        const existing = await db.select({ id: manufacturingOrders.id }).from(manufacturingOrders)
          .where(eq(manufacturingOrders.componentOrderId, input.componentOrderId));
        if (existing.length > 0) throw new Error("This component order has already been received into manufacturing");
        // Generate order number
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingOrders);
        const orderNum = `MFG-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
        // Create manufacturing order
        const [orderResult] = await db.insert(manufacturingOrders).values({
          componentOrderId: input.componentOrderId,
          jobId: job.id,
          orderNumber: orderNum,
          clientName: job.clientName,
          siteAddress: job.siteAddress || undefined,
          status: "received",
          priority: "normal",
          receivedBy: ctx.user.id,
          receivedByName: ctx.user.name,
        });
        const orderId = orderResult.insertId;
        // Parse lineItems from component order and create manufacturing tasks
        const lineItems = (compOrder.lineItems as any[]) || [];
        if (lineItems.length > 0) {
          const taskValues = lineItems.map((item: any) => ({
            orderId,
            productCode: item.code || item.productCode || null,
            productName: item.description || item.productName || item.name || "Unknown",
            category: item.category || item.type || null,
            colour: item.colour || item.color || null,
            colourGroup: item.colourGroup || null,
            quantity: item.qty || item.quantity || 1,
            unit: item.unit || "ea",
            length: item.length ? String(parseFloat(item.length)) : null,
            width: item.width ? String(parseFloat(item.width)) : null,
            description: item.notes || item.description || null,
            sourceType: (item.sourceType === "procure" ? "procure" : "manufacture") as "manufacture" | "procure",
            supplier: item.supplier || null,
            status: "pending" as const,
          }));
          await db.insert(manufacturingTasks).values(taskValues);
        }
        return { id: orderId, orderNumber: orderNum, tasksCreated: lineItems.length };
      }),
  }),

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure
      .input(z.object({
        orderId: z.number().optional(),
        status: z.string().optional(),
        category: z.string().optional(),
        sourceType: z.enum(["manufacture", "procure"]).optional(),
        branchId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
          conditions.push(eq(manufacturingTasks.orderId, input.orderId));
        }
        if (input?.status && input.status !== "all") conditions.push(eq(manufacturingTasks.status, input.status as any));
        if (input?.category) conditions.push(eq(manufacturingTasks.category, input.category));
        if (input?.sourceType) conditions.push(eq(manufacturingTasks.sourceType, input.sourceType));
        if (input?.branchId) conditions.push(eq(manufacturingTasks.branchId, input.branchId));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingTasks.id,
          orderId: manufacturingTasks.orderId,
          productCode: manufacturingTasks.productCode,
          productName: manufacturingTasks.productName,
          category: manufacturingTasks.category,
          colour: manufacturingTasks.colour,
          colourGroup: manufacturingTasks.colourGroup,
          quantity: manufacturingTasks.quantity,
          unit: manufacturingTasks.unit,
          length: manufacturingTasks.length,
          width: manufacturingTasks.width,
          description: manufacturingTasks.description,
          sourceType: manufacturingTasks.sourceType,
          supplier: manufacturingTasks.supplier,
          status: manufacturingTasks.status,
          scheduledDate: manufacturingTasks.scheduledDate,
          completedAt: manufacturingTasks.completedAt,
          branchId: manufacturingTasks.branchId,
          branchName: manufacturingTasks.branchName,
          notes: manufacturingTasks.notes,
          qrToken: manufacturingTasks.qrToken,
          createdAt: manufacturingTasks.createdAt,
          updatedAt: manufacturingTasks.updatedAt,
        }).from(manufacturingTasks)
          .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(manufacturingTasks.category), asc(manufacturingTasks.productName));
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "scheduled", "in_progress", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireTaskAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();
        await db.update(manufacturingTasks).set(updates).where(eq(manufacturingTasks.id, input.id));
        return { success: true };
      }),

    assignBranch: protectedProcedure
      .input(z.object({
        taskIds: z.array(z.number()),
        branchId: z.number(),
        branchName: z.string(),
        scheduledDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireTaskIdsAccess(db, ctx, input.taskIds);
        const updates: any = { branchId: input.branchId, branchName: input.branchName };
        if (input.scheduledDate) {
          updates.scheduledDate = new Date(input.scheduledDate);
          updates.status = "scheduled";
        }
        await db.update(manufacturingTasks).set(updates).where(inArray(manufacturingTasks.id, input.taskIds));
        return { success: true };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        taskIds: z.array(z.number()),
        status: z.enum(["pending", "scheduled", "in_progress", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireTaskIdsAccess(db, ctx, input.taskIds);
        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();
        await db.update(manufacturingTasks).set(updates).where(inArray(manufacturingTasks.id, input.taskIds));
        return { success: true };
      }),

    // Group tasks by product/category/colour for material grouping view
    grouped: protectedProcedure
      .input(z.object({ orderId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
          conditions.push(eq(manufacturingTasks.orderId, input.orderId));
        }
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const tasks = await db.select({
          category: manufacturingTasks.category,
          colour: manufacturingTasks.colour,
          colourGroup: manufacturingTasks.colourGroup,
          productName: manufacturingTasks.productName,
          productCode: manufacturingTasks.productCode,
          sourceType: manufacturingTasks.sourceType,
          totalQty: sql<number>`SUM(${manufacturingTasks.quantity})`,
          pendingQty: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} IN ('pending','scheduled') THEN ${manufacturingTasks.quantity} ELSE 0 END)`,
          completedQty: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} = 'completed' THEN ${manufacturingTasks.quantity} ELSE 0 END)`,
          taskCount: sql<number>`COUNT(*)`,
        }).from(manufacturingTasks)
          .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .groupBy(manufacturingTasks.category, manufacturingTasks.colour, manufacturingTasks.colourGroup, manufacturingTasks.productName, manufacturingTasks.productCode, manufacturingTasks.sourceType);
        return tasks;
      }),
  }),

  // ─── Schedule / Calendar ───────────────────────────────────────────────────
  schedule: router({
    list: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        branchId: z.number().optional(),
        status: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [
          gte(manufacturingSchedule.scheduledDate, new Date(input.startDate)),
          lte(manufacturingSchedule.scheduledDate, new Date(input.endDate)),
        ];
        if (input.branchId) conditions.push(eq(manufacturingSchedule.branchId, input.branchId));
        if (input.status && input.status !== "all") conditions.push(eq(manufacturingSchedule.status, input.status as any));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingSchedule.id,
          taskId: manufacturingSchedule.taskId,
          orderId: manufacturingSchedule.orderId,
          branchId: manufacturingSchedule.branchId,
          branchName: manufacturingSchedule.branchName,
          scheduledDate: manufacturingSchedule.scheduledDate,
          scheduledEndDate: manufacturingSchedule.scheduledEndDate,
          title: manufacturingSchedule.title,
          description: manufacturingSchedule.description,
          status: manufacturingSchedule.status,
          assignedTo: manufacturingSchedule.assignedTo,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
        }).from(manufacturingSchedule)
          .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(and(...conditions))
          .orderBy(asc(manufacturingSchedule.scheduledDate));
      }),

    create: protectedProcedure
      .input(z.object({
        taskId: z.number().optional(),
        orderId: z.number(),
        branchId: z.number(),
        branchName: z.string(),
        scheduledDate: z.string(),
        scheduledEndDate: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        assignedTo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.orderId);
        if (input.taskId) {
          const task = await requireTaskAccess(db, ctx, input.taskId);
          if (task.orderId !== input.orderId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Task does not belong to this manufacturing order" });
          }
        }
        const [result] = await db.insert(manufacturingSchedule).values({
          taskId: input.taskId,
          orderId: input.orderId,
          branchId: input.branchId,
          branchName: input.branchName,
          scheduledDate: new Date(input.scheduledDate),
          scheduledEndDate: input.scheduledEndDate ? new Date(input.scheduledEndDate) : undefined,
          title: input.title,
          description: input.description,
          assignedTo: input.assignedTo,
          createdBy: ctx.user.id,
        });
        return { id: result.insertId };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireScheduleAccess(db, ctx, input.id);
        await db.update(manufacturingSchedule).set({ status: input.status }).where(eq(manufacturingSchedule.id, input.id));
        return { success: true };
      }),

    reschedule: protectedProcedure
      .input(z.object({
        id: z.number(),
        scheduledDate: z.string(),
        scheduledEndDate: z.string().optional(),
        branchId: z.number().optional(),
        branchName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireScheduleAccess(db, ctx, input.id);
        const setData: any = { scheduledDate: new Date(input.scheduledDate) };
        if (input.scheduledEndDate) setData.scheduledEndDate = new Date(input.scheduledEndDate);
        if (input.branchId) setData.branchId = input.branchId;
        if (input.branchName) setData.branchName = input.branchName;
        await db.update(manufacturingSchedule).set(setData).where(eq(manufacturingSchedule.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireScheduleAccess(db, ctx, input.id);
        await db.delete(manufacturingSchedule).where(eq(manufacturingSchedule.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Purchase Orders ───────────────────────────────────────────────────────
  purchaseOrders: router({
    list: protectedProcedure
      .input(z.object({
        orderId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
          conditions.push(eq(manufacturingPurchaseOrders.orderId, input.orderId));
        }
        if (input?.status && input.status !== "all") conditions.push(eq(manufacturingPurchaseOrders.status, input.status as any));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingPurchaseOrders.id,
          orderId: manufacturingPurchaseOrders.orderId,
          poNumber: manufacturingPurchaseOrders.poNumber,
          supplier: manufacturingPurchaseOrders.supplier,
          supplierEmail: manufacturingPurchaseOrders.supplierEmail,
          status: manufacturingPurchaseOrders.status,
          lineItems: manufacturingPurchaseOrders.lineItems,
          totalAmount: manufacturingPurchaseOrders.totalAmount,
          requiredByDate: manufacturingPurchaseOrders.requiredByDate,
          issuedAt: manufacturingPurchaseOrders.issuedAt,
          receivedAt: manufacturingPurchaseOrders.receivedAt,
          createdByName: manufacturingPurchaseOrders.createdByName,
          createdAt: manufacturingPurchaseOrders.createdAt,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
        }).from(manufacturingPurchaseOrders)
          .innerJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(manufacturingPurchaseOrders.createdAt));
      }),

    create: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        supplier: z.string(),
        supplierEmail: z.string().optional(),
        supplierPhone: z.string().optional(),
        lineItems: z.array(z.object({
          productName: z.string(),
          productCode: z.string().optional(),
          quantity: z.number(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalPrice: z.number().optional(),
          colour: z.string().optional(),
          description: z.string().optional(),
        })),
        totalAmount: z.number().optional(),
        requiredByDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.orderId);
        // Generate PO number
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingPurchaseOrders);
        const poNum = `MPO-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
        const [result] = await db.insert(manufacturingPurchaseOrders).values({
          orderId: input.orderId,
          poNumber: poNum,
          supplier: input.supplier,
          supplierEmail: input.supplierEmail,
          supplierPhone: input.supplierPhone,
          status: "draft",
          lineItems: input.lineItems,
          totalAmount: input.totalAmount?.toString(),
          requiredByDate: input.requiredByDate ? new Date(input.requiredByDate) : undefined,
          notes: input.notes,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name,
        });
        return { id: result.insertId, poNumber: poNum };
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        return requirePurchaseOrderAccess(db, ctx, input.id);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "issued", "confirmed", "received", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "issued") updates.issuedAt = new Date();
        if (input.status === "received") updates.receivedAt = new Date();
        await db.update(manufacturingPurchaseOrders).set(updates).where(eq(manufacturingPurchaseOrders.id, input.id));
        return { success: true };
      }),

    updateLineItems: protectedProcedure
      .input(z.object({
        id: z.number(),
        lineItems: z.array(z.object({
          productName: z.string(),
          productCode: z.string().optional(),
          quantity: z.number(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalPrice: z.number().optional(),
          colour: z.string().optional(),
          description: z.string().optional(),
        })),
        totalAmount: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.id);
        const setData: any = { lineItems: input.lineItems };
        if (input.totalAmount !== undefined) setData.totalAmount = input.totalAmount.toString();
        await db.update(manufacturingPurchaseOrders).set(setData).where(eq(manufacturingPurchaseOrders.id, input.id));
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        supplier: z.string().optional(),
        supplierEmail: z.string().optional(),
        supplierPhone: z.string().optional(),
        requiredByDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const { id, ...updates } = input;
        await requirePurchaseOrderAccess(db, ctx, id);
        const setData: any = {};
        if (updates.supplier !== undefined) setData.supplier = updates.supplier;
        if (updates.supplierEmail !== undefined) setData.supplierEmail = updates.supplierEmail;
        if (updates.supplierPhone !== undefined) setData.supplierPhone = updates.supplierPhone;
        if (updates.requiredByDate !== undefined) setData.requiredByDate = updates.requiredByDate ? new Date(updates.requiredByDate) : null;
        if (updates.notes !== undefined) setData.notes = updates.notes;
        if (Object.keys(setData).length > 0) {
          await db.update(manufacturingPurchaseOrders).set(setData).where(eq(manufacturingPurchaseOrders.id, id));
        }
        return { success: true };
      }),
  }),

  // ─── Reports ───────────────────────────────────────────────────────────────
  reports: router({
    productionSchedule: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        branchId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [
          gte(manufacturingSchedule.scheduledDate, new Date(input.startDate)),
          lte(manufacturingSchedule.scheduledDate, new Date(input.endDate)),
        ];
        if (input.branchId) conditions.push(eq(manufacturingSchedule.branchId, input.branchId));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingSchedule.id,
          branchName: manufacturingSchedule.branchName,
          scheduledDate: manufacturingSchedule.scheduledDate,
          title: manufacturingSchedule.title,
          status: manufacturingSchedule.status,
          assignedTo: manufacturingSchedule.assignedTo,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
          orderStatus: manufacturingOrders.status,
        }).from(manufacturingSchedule)
          .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(and(...conditions))
          .orderBy(asc(manufacturingSchedule.scheduledDate), asc(manufacturingSchedule.branchName));
      }),

    jobsByStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select({
        status: manufacturingOrders.status,
        count: sql<number>`COUNT(*)`,
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)))
        .groupBy(manufacturingOrders.status);
    }),

    jobsByTargetDate: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.startDate) conditions.push(gte(manufacturingOrders.targetDate, new Date(input.startDate)));
        if (input?.endDate) conditions.push(lte(manufacturingOrders.targetDate, new Date(input.endDate)));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingOrders.id,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
          status: manufacturingOrders.status,
          priority: manufacturingOrders.priority,
          targetDate: manufacturingOrders.targetDate,
          createdAt: manufacturingOrders.createdAt,
        }).from(manufacturingOrders)
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(manufacturingOrders.targetDate));
      }),

    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const [orderStats] = await db.select({
        totalOrders: sql<number>`COUNT(*)`,
        inProduction: sql<number>`SUM(CASE WHEN ${manufacturingOrders.status} IN ('received','in_production','partially_complete') THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${manufacturingOrders.status} = 'completed' THEN 1 ELSE 0 END)`,
        overdue: sql<number>`SUM(CASE WHEN ${manufacturingOrders.status} IN ('received','in_production','partially_complete') AND ${manufacturingOrders.targetDate} < NOW() THEN 1 ELSE 0 END)`,
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)));
      const [taskStats] = await db.select({
        totalTasks: sql<number>`COUNT(*)`,
        pendingTasks: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} IN ('pending','scheduled','in_progress') THEN 1 ELSE 0 END)`,
      }).from(manufacturingTasks)
        .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)));
      return {
        totalOrders: orderStats?.totalOrders || 0,
        inProduction: orderStats?.inProduction || 0,
        completed: orderStats?.completed || 0,
        overdue: orderStats?.overdue || 0,
        totalTasks: taskStats?.totalTasks || 0,
        pendingTasks: taskStats?.pendingTasks || 0,
      };
    }),
  }),

  // ─── Branches (for dropdown) ───────────────────────────────────────────────
  branches: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ id: branches.id, name: branches.name }).from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.name));
  }),

  // ─── Xero PO Sync ─────────────────────────────────────────────────────────
  xeroSync: router({
    syncPO: protectedProcedure
      .input(z.object({ poId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const po = await requirePurchaseOrderAccess(db, ctx, input.poId);
        // Dynamically import xero-client to avoid circular deps
        const { getXeroContacts, createXeroContact, createXeroPurchaseOrder, getValidAccessToken } = await import("./xero-client");
        const auth = await getValidAccessToken();
        if (!auth) throw new Error("No active Xero connection. Please connect to Xero first.");
        // Find or create supplier contact in Xero
        let xeroContactId = po.xeroContactId;
        if (!xeroContactId) {
          const contactSearch = await getXeroContacts({ where: `Name=="${po.supplier.replace(/"/g, "\\\"")}"` });
          if (contactSearch.Contacts && contactSearch.Contacts.length > 0) {
            xeroContactId = contactSearch.Contacts[0].ContactID;
          } else {
            const newContact = await createXeroContact({
              Name: po.supplier,
              EmailAddress: po.supplierEmail || undefined,
              IsSupplier: true,
            });
            xeroContactId = newContact.Contacts[0].ContactID;
          }
          await db.update(manufacturingPurchaseOrders).set({ xeroContactId }).where(eq(manufacturingPurchaseOrders.id, input.poId));
        }
        // Build Xero PO line items
        const lineItems = (po.lineItems as any[]) || [];
        const xeroLineItems = lineItems.map((item: any) => ({
          Description: `${item.productName}${item.colour ? ` (${item.colour})` : ""}${item.description ? ` - ${item.description}` : ""}`,
          Quantity: item.quantity || 1,
          UnitAmount: item.unitPrice || 0,
          AccountCode: "300", // Default purchases account
        }));
        // Create PO in Xero
        const xeroResult = await createXeroPurchaseOrder({
          Contact: { ContactID: xeroContactId },
          PurchaseOrderNumber: po.poNumber || undefined,
          LineItems: xeroLineItems,
          Date: new Date().toISOString().split("T")[0],
          DeliveryDate: po.requiredByDate ? new Date(po.requiredByDate).toISOString().split("T")[0] : undefined,
          Reference: `Manufacturing PO - ${po.poNumber}`,
          Status: "DRAFT",
        });
        const xeroPO = xeroResult.PurchaseOrders?.[0];
        if (xeroPO?.PurchaseOrderID) {
          await db.update(manufacturingPurchaseOrders).set({
            xeroPoId: xeroPO.PurchaseOrderID,
            xeroSyncedAt: new Date(),
          }).where(eq(manufacturingPurchaseOrders.id, input.poId));
        }
        return { success: true, xeroPoId: xeroPO?.PurchaseOrderID };
      }),

    getSyncStatus: protectedProcedure
      .input(z.object({ poId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.poId);
        const [po] = await db.select({
          xeroPoId: manufacturingPurchaseOrders.xeroPoId,
          xeroContactId: manufacturingPurchaseOrders.xeroContactId,
          xeroSyncedAt: manufacturingPurchaseOrders.xeroSyncedAt,
        }).from(manufacturingPurchaseOrders).where(eq(manufacturingPurchaseOrders.id, input.poId));
        return po || null;
      }),
  }),

  // ─── Notify completion ─────────────────────────────────────────────────────
  notifyCompletion: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const order = await requireOrderAccess(db, ctx, input.orderId);
      await notifyOwner({
        title: `Manufacturing Order ${order.orderNumber} Completed`,
        content: input.message || `Manufacturing order ${order.orderNumber} for ${order.clientName} has been completed and is ready for dispatch.`,
      });
      return { success: true };
    }),
});
