import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { eq, desc, and, asc } from "drizzle-orm";
import {
  projectPlanTemplates,
  projectPlanTemplateStages,
  projectPlanTemplateTasks,
  constructionProgress,
  constructionKanbanTasks,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";

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
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const templates = await db
      .select()
      .from(projectPlanTemplates)
      .orderBy(desc(projectPlanTemplates.createdAt));

    return templates;
  }),

  // ─── Get template with stages and tasks ────────────────────────────────────
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [template] = await db
        .select()
        .from(projectPlanTemplates)
        .where(eq(projectPlanTemplates.id, input.id));

      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const stages = await db
        .select()
        .from(projectPlanTemplateStages)
        .where(eq(projectPlanTemplateStages.templateId, input.id))
        .orderBy(asc(projectPlanTemplateStages.sortOrder));

      const stageIds = stages.map((s) => s.id);
      let tasks: (typeof projectPlanTemplateTasks.$inferSelect)[] = [];
      if (stageIds.length > 0) {
        tasks = await db
          .select()
          .from(projectPlanTemplateTasks)
          .where(
            // Get tasks for all stages of this template
            stageIds.length === 1
              ? eq(projectPlanTemplateTasks.stageId, stageIds[0])
              : eq(projectPlanTemplateTasks.stageId, stageIds[0]) // will be overridden below
          )
          .orderBy(asc(projectPlanTemplateTasks.sortOrder));

        // For multiple stages, fetch all tasks
        if (stageIds.length > 1) {
          tasks = [];
          for (const stageId of stageIds) {
            const stageTasks = await db
              .select()
              .from(projectPlanTemplateTasks)
              .where(eq(projectPlanTemplateTasks.stageId, stageId))
              .orderBy(asc(projectPlanTemplateTasks.sortOrder));
            tasks.push(...stageTasks);
          }
        }
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

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await db
          .update(projectPlanTemplates)
          .set({ isDefault: false })
          .where(eq(projectPlanTemplates.isDefault, true));
      }

      const [result] = await db.insert(projectPlanTemplates).values({
        name: input.name,
        description: input.description || null,
        isDefault: input.isDefault,
        isActive: input.isActive,
        createdBy: ctx.user.id,
      });
      const templateId = result.insertId;

      // Create stages and their tasks
      for (const stage of input.stages) {
        const [stageResult] = await db.insert(projectPlanTemplateStages).values({
          templateId,
          name: stage.name,
          description: stage.description || null,
          sortOrder: stage.sortOrder,
          estimatedDays: stage.estimatedDays ?? null,
        });
        const stageId = stageResult.insertId;

        for (const task of stage.tasks) {
          await db.insert(projectPlanTemplateTasks).values({
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(projectPlanTemplates)
        .where(eq(projectPlanTemplates.id, input.id));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // If setting as default, unset other defaults
      if (input.isDefault) {
        await db
          .update(projectPlanTemplates)
          .set({ isDefault: false })
          .where(
            and(
              eq(projectPlanTemplates.isDefault, true),
              // Don't unset self
            )
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
        .where(eq(projectPlanTemplates.id, input.id));

      // Delete existing stages (cascades to tasks)
      await db
        .delete(projectPlanTemplateStages)
        .where(eq(projectPlanTemplateStages.templateId, input.id));

      // Re-create stages and tasks
      for (const stage of input.stages) {
        const [stageResult] = await db.insert(projectPlanTemplateStages).values({
          templateId: input.id,
          name: stage.name,
          description: stage.description || null,
          sortOrder: stage.sortOrder,
          estimatedDays: stage.estimatedDays ?? null,
        });
        const stageId = stageResult.insertId;

        for (const task of stage.tasks) {
          await db.insert(projectPlanTemplateTasks).values({
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

      // Get original template
      const [original] = await db
        .select()
        .from(projectPlanTemplates)
        .where(eq(projectPlanTemplates.id, input.id));
      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      // Get stages
      const stages = await db
        .select()
        .from(projectPlanTemplateStages)
        .where(eq(projectPlanTemplateStages.templateId, input.id))
        .orderBy(asc(projectPlanTemplateStages.sortOrder));

      // Create new template with "(Copy)" suffix
      const [newTemplate] = await db.insert(projectPlanTemplates).values({
        name: `${original.name} (Copy)`,
        description: original.description,
        isDefault: false,
        isActive: original.isActive,
        createdBy: ctx.user.id,
      });
      const newTemplateId = newTemplate.insertId;

      // Clone stages and their tasks
      for (const stage of stages) {
        const [newStage] = await db.insert(projectPlanTemplateStages).values({
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
          .where(eq(projectPlanTemplateTasks.stageId, stage.id))
          .orderBy(asc(projectPlanTemplateTasks.sortOrder));

        for (const task of tasks) {
          await db.insert(projectPlanTemplateTasks).values({
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(projectPlanTemplates)
        .where(eq(projectPlanTemplates.id, input.id));

      return { success: true };
    }),

  // ─── List active templates (for seed-from-template dropdown) ───────────────
  listActive: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const templates = await db
      .select({
        id: projectPlanTemplates.id,
        name: projectPlanTemplates.name,
        description: projectPlanTemplates.description,
        isDefault: projectPlanTemplates.isDefault,
      })
      .from(projectPlanTemplates)
      .where(eq(projectPlanTemplates.isActive, true))
      .orderBy(desc(projectPlanTemplates.isDefault), asc(projectPlanTemplates.name));

    // Enrich with stage/task counts
    const enriched = await Promise.all(
      templates.map(async (tpl) => {
        const stages = await db
          .select({ id: projectPlanTemplateStages.id })
          .from(projectPlanTemplateStages)
          .where(eq(projectPlanTemplateStages.templateId, tpl.id));
        const stageIds = stages.map((s) => s.id);
        let taskCount = 0;
        if (stageIds.length > 0) {
          for (const sid of stageIds) {
            const tasks = await db
              .select({ id: projectPlanTemplateTasks.id })
              .from(projectPlanTemplateTasks)
              .where(eq(projectPlanTemplateTasks.stageId, sid));
            taskCount += tasks.length;
          }
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

      // Get template with stages and tasks
      const [template] = await db
        .select()
        .from(projectPlanTemplates)
        .where(eq(projectPlanTemplates.id, input.templateId));

      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const stages = await db
        .select()
        .from(projectPlanTemplateStages)
        .where(eq(projectPlanTemplateStages.templateId, input.templateId))
        .orderBy(asc(projectPlanTemplateStages.sortOrder));

      let stagesCreated = 0;
      let tasksCreated = 0;

      for (const stage of stages) {
        // Create construction progress entry
        await db.insert(constructionProgress).values({
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
          .where(eq(projectPlanTemplateTasks.stageId, stage.id))
          .orderBy(asc(projectPlanTemplateTasks.sortOrder));

        for (const task of tasks) {
          await db.insert(constructionKanbanTasks).values({
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
