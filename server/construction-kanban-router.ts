import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { constructionKanbanTasks, constructionKanbanTemplates, constructionJobs, constructionInstallers } from "../drizzle/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { sendTaskAssignmentNotification } from "./task-notifications";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

const COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function installerTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function templateTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionKanbanTemplates.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select()
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

async function requireInstallerAccess(db: any, ctx: any, installerId: number) {
  const [installer] = await db.select()
    .from(constructionInstallers)
    .where(and(...installerTenantConditions(ctx, eq(constructionInstallers.id, installerId))))
    .limit(1);
  if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Installer not found" });
  return installer;
}

async function requireTaskAccess(db: any, ctx: any, taskId: number) {
  const [row] = await db.select({ task: constructionKanbanTasks })
    .from(constructionKanbanTasks)
    .innerJoin(constructionJobs, eq(constructionKanbanTasks.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(constructionKanbanTasks.id, taskId))))
    .limit(1);
  if (!row?.task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
  return row.task;
}

export const constructionKanbanRouter = router({
  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireJobAccess(db, ctx, input.jobId);
        const tasks = await db.select().from(constructionKanbanTasks)
          .where(eq(constructionKanbanTasks.jobId, input.jobId))
          .orderBy(asc(constructionKanbanTasks.position));

        // Enrich with installer names
        const installerIds = Array.from(new Set(tasks.filter(t => t.assignedTo).map(t => t.assignedTo!)));
        const installers = installerIds.length > 0
          ? await db.select({ id: constructionInstallers.id, name: constructionInstallers.name }).from(constructionInstallers)
              .where(and(...installerTenantConditions(ctx, inArray(constructionInstallers.id, installerIds))))
          : [];
        const installerMap = Object.fromEntries(installers.map(i => [i.id, i.name]));

        return tasks.map(t => ({
          ...t,
          assignedToName: t.assignedTo ? (installerMap[t.assignedTo] || null) : null,
        }));
      }),

    create: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        column: z.enum(COLUMNS).optional(),
        position: z.number().optional(),
        assignedTo: z.number().optional(),
        dueDate: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        templateKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireJobAccess(db, ctx, input.jobId);
        if (input.assignedTo) await requireInstallerAccess(db, ctx, input.assignedTo);
        // Get max position in the target column
        const existing = await db.select({ position: constructionKanbanTasks.position })
          .from(constructionKanbanTasks)
          .where(and(
            eq(constructionKanbanTasks.jobId, input.jobId),
            eq(constructionKanbanTasks.column, input.column || "backlog"),
          ))
          .orderBy(desc(constructionKanbanTasks.position));
        const maxPos = existing.length > 0 ? existing[0].position : -1;

        const [result] = await db.insert(constructionKanbanTasks).values({
          tenantId: tenantIdFromContext(ctx),
          jobId: input.jobId,
          title: input.title,
          description: input.description,
          column: input.column || "backlog",
          position: input.position ?? (maxPos + 1),
          assignedTo: input.assignedTo,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          priority: input.priority || "normal",
          templateKey: input.templateKey,
          createdBy: ctx.user.id,
        });
        return { id: result.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        column: z.enum(COLUMNS).optional(),
        position: z.number().optional(),
        assignedTo: z.number().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const { id, ...updates } = input;
        await requireTaskAccess(db, ctx, id);
        if (updates.assignedTo) await requireInstallerAccess(db, ctx, updates.assignedTo);
        const vals: any = {};
        if (updates.title !== undefined) vals.title = updates.title;
        if (updates.description !== undefined) vals.description = updates.description;
        if (updates.column !== undefined) vals.column = updates.column;
        if (updates.position !== undefined) vals.position = updates.position;
        if (updates.assignedTo !== undefined) vals.assignedTo = updates.assignedTo;
        if (updates.dueDate !== undefined) vals.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
        if (updates.priority !== undefined) vals.priority = updates.priority;
        await db.update(constructionKanbanTasks).set(vals).where(eq(constructionKanbanTasks.id, id));

        // Send notification if assignedTo changed
        if (updates.assignedTo) {
          const task = await requireTaskAccess(db, ctx, id);
          if (task) {
            sendTaskAssignmentNotification({
              section: "Construction",
              taskTitle: task.title,
              assignedToInstallerId: updates.assignedTo,
              assignedByName: ctx.user.name || "A team member",
            }).catch(err => console.error("[Kanban] Assignment notification failed:", err?.message));
          }
        }

        return { success: true };
      }),

    move: protectedProcedure
      .input(z.object({
        id: z.number(),
        column: z.enum(COLUMNS),
        position: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireTaskAccess(db, ctx, input.id);
        await db.update(constructionKanbanTasks)
          .set({ column: input.column, position: input.position })
          .where(eq(constructionKanbanTasks.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireTaskAccess(db, ctx, input.id);
        await db.delete(constructionKanbanTasks).where(eq(constructionKanbanTasks.id, input.id));
        return { success: true };
      }),

    // Seed tasks from templates for a job
    seedFromTemplates: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireJobAccess(db, ctx, input.jobId);
        const templates = await db.select().from(constructionKanbanTemplates)
          .where(and(...templateTenantConditions(ctx, eq(constructionKanbanTemplates.active, true))))
          .orderBy(asc(constructionKanbanTemplates.sortOrder));

        if (templates.length === 0) return { count: 0 };

        const values = templates.map((t, idx) => ({
          tenantId: tenantIdFromContext(ctx),
          jobId: input.jobId,
          title: t.title,
          description: t.description,
          column: t.defaultColumn,
          position: idx,
          templateKey: t.title.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          priority: "normal" as const,
          createdBy: ctx.user.id,
        }));

        await db.insert(constructionKanbanTasks).values(values);
        return { count: values.length };
      }),
  }),

  // ─── Templates ─────────────────────────────────────────────────────────────
  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select()
        .from(constructionKanbanTemplates)
        .where(and(...templateTenantConditions(ctx)))
        .orderBy(asc(constructionKanbanTemplates.sortOrder));
    }),
  }),
});
