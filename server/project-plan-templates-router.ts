import { z } from "zod";
import { tenantAdminProcedure as adminProcedure, tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { eq, desc, and, asc, sql, inArray } from "drizzle-orm";
import {
  projectPlanTemplates,
  projectPlanTemplateStages,
  projectPlanTemplateTasks,
  constructionProgress,
  constructionKanbanTasks,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

function templateConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, projectPlanTemplates.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function stageConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, projectPlanTemplateStages.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function taskConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, projectPlanTemplateTasks.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function rowsFromExecuteResult(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function getSingleActiveTenantId(db: any) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count, MIN(id) AS tenantId
    FROM tenants
    WHERE status = 'active'
  `);
  const rows = rowsFromExecuteResult(result);
  const row = rows[0];
  return Number(row?.count || 0) === 1 ? Number(row?.tenantId) : null;
}

async function ensureProjectPlanTemplateTenantColumn(db: any, tenantId?: number | null) {
  async function hasTenantColumn(tableName: string) {
    const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
        AND table_name = ${tableName}
      AND column_name = 'tenantId'
  `);
    const rows = rowsFromExecuteResult(result);
    return Number(rows?.[0]?.count || 0) > 0;
  }

  if (!(await hasTenantColumn("project_plan_templates"))) {
    await db.execute(sql.raw("ALTER TABLE `project_plan_templates` ADD COLUMN `tenantId` int NULL"));
    await db.execute(sql.raw("ALTER TABLE `project_plan_templates` ADD KEY `idx_project_plan_templates_tenant` (`tenantId`)"));
  }
  if (!(await hasTenantColumn("project_plan_template_stages"))) {
    await db.execute(sql.raw("ALTER TABLE `project_plan_template_stages` ADD COLUMN `tenantId` int NULL"));
    await db.execute(sql.raw("ALTER TABLE `project_plan_template_stages` ADD KEY `idx_project_plan_template_stages_tenant` (`tenantId`)"));
    await db.execute(sql.raw("ALTER TABLE `project_plan_template_stages` ADD KEY `idx_project_plan_template_stages_tenant_template` (`tenantId`, `templateId`)"));
  }
  if (!(await hasTenantColumn("project_plan_template_tasks"))) {
    await db.execute(sql.raw("ALTER TABLE `project_plan_template_tasks` ADD COLUMN `tenantId` int NULL"));
    await db.execute(sql.raw("ALTER TABLE `project_plan_template_tasks` ADD KEY `idx_project_plan_template_tasks_tenant` (`tenantId`)"));
    await db.execute(sql.raw("ALTER TABLE `project_plan_template_tasks` ADD KEY `idx_project_plan_template_tasks_tenant_stage` (`tenantId`, `stageId`)"));
  }

  const singleTenantId = await getSingleActiveTenantId(db);
  const backfillTenantId = singleTenantId && (!tenantId || singleTenantId === tenantId) ? singleTenantId : null;
  if (backfillTenantId) {
    await db.execute(sql`
      UPDATE project_plan_templates
      SET tenantId = ${backfillTenantId}
      WHERE tenantId IS NULL
    `);
  }

  await db.execute(sql`
    UPDATE project_plan_template_stages stages
    INNER JOIN project_plan_templates templates ON templates.id = stages.templateId
    SET stages.tenantId = templates.tenantId
    WHERE stages.tenantId IS NULL
      AND templates.tenantId IS NOT NULL
  `);
  await db.execute(sql`
    UPDATE project_plan_template_tasks tasks
    INNER JOIN project_plan_template_stages stages ON stages.id = tasks.stageId
    SET tasks.tenantId = stages.tenantId
    WHERE tasks.tenantId IS NULL
      AND stages.tenantId IS NOT NULL
  `);
  if (backfillTenantId) {
    await db.execute(sql`
      UPDATE project_plan_template_stages
      SET tenantId = ${backfillTenantId}
      WHERE tenantId IS NULL
    `);
    await db.execute(sql`
      UPDATE project_plan_template_tasks
      SET tenantId = ${backfillTenantId}
      WHERE tenantId IS NULL
    `);
  }
}

// ─── Input Schemas ─────────────────────────────────────────────────────────

const stageInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  sortOrder: z.number().default(0),
  estimatedDays: z.number().optional().nullable(),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional().nullable(),
    sortOrder: z.number().default(0),
    defaultColumn: z.enum(["backlog", "todo", "in_progress", "review", "done"]).default("todo"),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  })).default([]),
});

const templateInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  stages: z.array(stageInput).default([]),
});

// ─── Router ────────────────────────────────────────────────────────────────

export const projectPlanTemplatesRouter = router({
  // ─── List all templates (admin) ────────────────────────────────────────────
  list: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

    const templates = await db
      .select()
      .from(projectPlanTemplates)
      .where(and(...templateConditions(ctx)))
      .orderBy(desc(projectPlanTemplates.createdAt));

    return templates;
  }),

  // ─── Get template with stages and tasks ────────────────────────────────────
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

      const [template] = await db
        .select()
        .from(projectPlanTemplates)
        .where(and(...templateConditions(ctx, eq(projectPlanTemplates.id, input.id))));

      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const stages = await db
        .select()
        .from(projectPlanTemplateStages)
        .where(and(...stageConditions(ctx, eq(projectPlanTemplateStages.templateId, input.id))))
        .orderBy(asc(projectPlanTemplateStages.sortOrder));

      const stageIds = stages.map((s) => s.id);
      let tasks: (typeof projectPlanTemplateTasks.$inferSelect)[] = [];
      if (stageIds.length > 0) {
        tasks = await db
          .select()
          .from(projectPlanTemplateTasks)
          .where(and(...taskConditions(ctx, inArray(projectPlanTemplateTasks.stageId, stageIds))))
          .orderBy(asc(projectPlanTemplateTasks.sortOrder));
      }

      return {
        ...template,
        stages: stages.map((stage) => ({
          ...stage,
          tasks: tasks.filter((t) => t.stageId === stage.id),
        })),
      };
    }),

  // ─── Create template with stages and tasks ─────────────────────────────────
  create: adminProcedure
    .input(templateInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await db
          .update(projectPlanTemplates)
          .set({ isDefault: false })
          .where(and(...templateConditions(ctx, eq(projectPlanTemplates.isDefault, true))));
      }

      const [result] = await db.insert(projectPlanTemplates).values({
        name: input.name,
        description: input.description || null,
        isDefault: input.isDefault,
        isActive: input.isActive,
        createdBy: ctx.user!.id,
        tenantId: tenantIdFromContext(ctx),
      });
      const templateId = result.insertId;

      // Create stages and their tasks
      const tenantId = tenantIdFromContext(ctx);
      for (const stage of input.stages) {
        const [stageResult] = await db.insert(projectPlanTemplateStages).values({
          tenantId,
          templateId,
          name: stage.name,
          description: stage.description || null,
          sortOrder: stage.sortOrder,
          estimatedDays: stage.estimatedDays ?? null,
        });
        const stageId = stageResult.insertId;

        for (const task of stage.tasks) {
          await db.insert(projectPlanTemplateTasks).values({
            tenantId,
            stageId,
            title: task.title,
            description: task.description || null,
            sortOrder: task.sortOrder,
            defaultColumn: task.defaultColumn,
            priority: task.priority,
          });
        }
      }

      return { id: templateId };
    }),

  // ─── Update template (full replace of stages/tasks) ────────────────────────
  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(templateInput))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

      const [existing] = await db
        .select()
        .from(projectPlanTemplates)
        .where(and(...templateConditions(ctx, eq(projectPlanTemplates.id, input.id))));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await db
          .update(projectPlanTemplates)
          .set({ isDefault: false })
          .where(
            and(...templateConditions(ctx, eq(projectPlanTemplates.isDefault, true)))
          );
      }

      await db
        .update(projectPlanTemplates)
        .set({
          name: input.name,
          description: input.description || null,
          isDefault: input.isDefault,
          isActive: input.isActive,
        })
        .where(and(...templateConditions(ctx, eq(projectPlanTemplates.id, input.id))));

      // Delete existing stages (cascades to tasks)
      await db
        .delete(projectPlanTemplateStages)
        .where(and(...stageConditions(ctx, eq(projectPlanTemplateStages.templateId, input.id))));

      // Re-create stages and tasks
      const tenantId = tenantIdFromContext(ctx);
      for (const stage of input.stages) {
        const [stageResult] = await db.insert(projectPlanTemplateStages).values({
          tenantId,
          templateId: input.id,
          name: stage.name,
          description: stage.description || null,
          sortOrder: stage.sortOrder,
          estimatedDays: stage.estimatedDays ?? null,
        });
        const stageId = stageResult.insertId;

        for (const task of stage.tasks) {
          await db.insert(projectPlanTemplateTasks).values({
            tenantId,
            stageId,
            title: task.title,
            description: task.description || null,
            sortOrder: task.sortOrder,
            defaultColumn: task.defaultColumn,
            priority: task.priority,
          });
        }
      }

      return { success: true };
    }),

  // ─── Duplicate template ─────────────────────────────────────────────────────
  duplicate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

      // Get original template
      const [original] = await db
        .select()
        .from(projectPlanTemplates)
        .where(and(...templateConditions(ctx, eq(projectPlanTemplates.id, input.id))));
      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      // Get stages
      const stages = await db
        .select()
        .from(projectPlanTemplateStages)
        .where(and(...stageConditions(ctx, eq(projectPlanTemplateStages.templateId, input.id))))
        .orderBy(asc(projectPlanTemplateStages.sortOrder));

      // Create new template with "(Copy)" suffix
      const [newTemplate] = await db.insert(projectPlanTemplates).values({
        name: `${original.name} (Copy)`,
        description: original.description,
        isDefault: false,
        isActive: original.isActive,
        createdBy: ctx.user!.id,
        tenantId: tenantIdFromContext(ctx),
      });
      const newTemplateId = newTemplate.insertId;
      const tenantId = tenantIdFromContext(ctx);

      // Clone stages and their tasks
      for (const stage of stages) {
        const [newStage] = await db.insert(projectPlanTemplateStages).values({
          tenantId,
          templateId: newTemplateId,
          name: stage.name,
          description: stage.description,
          sortOrder: stage.sortOrder,
          estimatedDays: stage.estimatedDays,
        });
        const newStageId = newStage.insertId;

        // Get tasks for this stage
        const tasks = await db
          .select()
          .from(projectPlanTemplateTasks)
          .where(and(...taskConditions(ctx, eq(projectPlanTemplateTasks.stageId, stage.id))))
          .orderBy(asc(projectPlanTemplateTasks.sortOrder));

        for (const task of tasks) {
          await db.insert(projectPlanTemplateTasks).values({
            tenantId,
            stageId: newStageId,
            title: task.title,
            description: task.description,
            sortOrder: task.sortOrder,
            defaultColumn: task.defaultColumn,
            priority: task.priority,
          });
        }
      }

      return { id: newTemplateId, name: `${original.name} (Copy)` };
    }),

  // ─── Delete template ───────────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

      await db
        .delete(projectPlanTemplates)
        .where(and(...templateConditions(ctx, eq(projectPlanTemplates.id, input.id))));

      return { success: true };
    }),

  // ─── List active templates (for seed-from-template dropdown) ───────────────
  listActive: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

    const templates = await db
      .select({
        id: projectPlanTemplates.id,
        name: projectPlanTemplates.name,
        description: projectPlanTemplates.description,
        isDefault: projectPlanTemplates.isDefault,
      })
      .from(projectPlanTemplates)
      .where(and(...templateConditions(ctx, eq(projectPlanTemplates.isActive, true))))
      .orderBy(desc(projectPlanTemplates.isDefault), asc(projectPlanTemplates.name));

    // Enrich with stage/task counts
    const enriched = await Promise.all(
      templates.map(async (tpl) => {
        const stages = await db
          .select({ id: projectPlanTemplateStages.id })
          .from(projectPlanTemplateStages)
          .where(and(...stageConditions(ctx, eq(projectPlanTemplateStages.templateId, tpl.id))));
        const stageIds = stages.map((s) => s.id);
        let taskCount = 0;
        if (stageIds.length > 0) {
          const tasks = await db
            .select({ id: projectPlanTemplateTasks.id })
            .from(projectPlanTemplateTasks)
            .where(and(...taskConditions(ctx, inArray(projectPlanTemplateTasks.stageId, stageIds))));
          taskCount = tasks.length;
        }
        return { ...tpl, stageCount: stages.length, taskCount };
      })
    );

    return enriched;
  }),

  // ─── Seed from template: create progress stages and kanban tasks for a job ─
  seedFromTemplate: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      templateId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ensureProjectPlanTemplateTenantColumn(db, tenantIdFromContext(ctx));

      // Get template with stages and tasks
      const [template] = await db
        .select()
        .from(projectPlanTemplates)
        .where(and(...templateConditions(ctx, eq(projectPlanTemplates.id, input.templateId))));

      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const stages = await db
        .select()
        .from(projectPlanTemplateStages)
        .where(and(...stageConditions(ctx, eq(projectPlanTemplateStages.templateId, input.templateId))))
        .orderBy(asc(projectPlanTemplateStages.sortOrder));

      let stagesCreated = 0;
      let tasksCreated = 0;
      const tenantId = tenantIdFromContext(ctx);

      for (const stage of stages) {
        // Create construction progress entry
        await db.insert(constructionProgress).values({
          tenantId,
          jobId: input.jobId,
          stage: stage.name,
          status: "pending",
          notes: stage.description || null,
          updatedBy: ctx.user.id,
        });
        stagesCreated++;

        // Get tasks for this stage
        const tasks = await db
          .select()
          .from(projectPlanTemplateTasks)
          .where(and(...taskConditions(ctx, eq(projectPlanTemplateTasks.stageId, stage.id))))
          .orderBy(asc(projectPlanTemplateTasks.sortOrder));

        for (const task of tasks) {
          await db.insert(constructionKanbanTasks).values({
            tenantId,
            jobId: input.jobId,
            title: task.title,
            description: task.description || null,
            column: task.defaultColumn,
            position: task.sortOrder,
            priority: task.priority,
            templateKey: `tpl-${template.id}-stage-${stage.id}`,
            createdBy: ctx.user.id,
          });
          tasksCreated++;
        }
      }

      return {
        success: true,
        stagesCreated,
        tasksCreated,
        templateName: template.name,
      };
    }),
});
