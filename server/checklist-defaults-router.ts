import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { router, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { checklistDefaultItems } from "../drizzle/schema";
import {
  BUILTIN_WORK_CHECKLIST_DEFAULTS,
  WORK_CHECKLIST_SECTIONS,
  getWorkChecklistLabel,
} from "../shared/spec-checklist-defaults";

const responsibilitySchema = z.enum(["", "By Builder", "By Client"]);
const unitSchema = z.enum(["ea", "LM", "m", "m2", "m3", "hr", "day", "lump"]);

function checklistDefaultTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, checklistDefaultItems.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function whereForConditions(conditions: any[]) {
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function errorText(error: unknown, seen = new Set<unknown>()): string {
  if (error == null || seen.has(error)) return "";
  seen.add(error);
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);
  const err = error as Record<string, unknown>;
  return [
    err.message,
    err.sqlMessage,
    err.code,
    err.errno,
    err.sql,
    err.cause ? errorText(err.cause, seen) : "",
  ].filter(Boolean).join(" ");
}

function isMissingChecklistDefaultSchema(error: unknown) {
  const message = errorText(error);
  if (!/checklist_default_items/i.test(message)) return false;
  return /(unknown column|no such column|doesn't exist|does not exist|er_no_such_table|er_bad_field_error)/i.test(message)
    || /failed query:\s*select/i.test(message);
}

async function listChecklistDefaults(ctx: any, activeOnly: boolean) {
  const db = (await getDb())!;
  try {
    const conditions = checklistDefaultTenantConditions(ctx);
    if (activeOnly) conditions.push(eq(checklistDefaultItems.isActive, true));
    return await db
      .select()
      .from(checklistDefaultItems)
      .where(whereForConditions(conditions))
      .orderBy(checklistDefaultItems.section, checklistDefaultItems.sortOrder, checklistDefaultItems.id);
  } catch (error) {
    if (isMissingChecklistDefaultSchema(error)) {
      console.warn("[checklist-defaults] checklist_default_items schema is not available; using built-in defaults.", error);
      return [];
    }
    throw error;
  }
}

const defaultItemInput = z.object({
  section: z.string().min(1).max(64),
  label: z.string().min(1).max(255),
  unit: unitSchema.optional(),
  responsibility: responsibilitySchema.optional(),
  productMatch: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const checklistDefaultsRouter = router({
  sections: tenantProcedure.query(() => WORK_CHECKLIST_SECTIONS),

  listActive: tenantProcedure.query(async ({ ctx }) => {
    return listChecklistDefaults(ctx, true);
  }),

  listAll: tenantAdminProcedure.query(async ({ ctx }) => {
    return listChecklistDefaults(ctx, false);
  }),

  create: tenantAdminProcedure
    .input(defaultItemInput)
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(checklistDefaultItems).values({
        tenantId: tenantIdFromContext(ctx),
        section: input.section,
        label: input.label.trim(),
        unit: input.unit ?? "ea",
        responsibility: input.responsibility ?? "",
        productMatch: input.productMatch?.trim() ?? "",
        notes: input.notes?.trim() ?? "",
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      });
      return { id: result.insertId };
    }),

  update: tenantAdminProcedure
    .input(z.object({
      id: z.number().int(),
      data: defaultItemInput.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const data = input.data;
      await db
        .update(checklistDefaultItems)
        .set({
          ...(data.section !== undefined ? { section: data.section } : {}),
          ...(data.label !== undefined ? { label: data.label.trim() } : {}),
          ...(data.unit !== undefined ? { unit: data.unit } : {}),
          ...(data.responsibility !== undefined ? { responsibility: data.responsibility } : {}),
          ...(data.productMatch !== undefined ? { productMatch: data.productMatch.trim() } : {}),
          ...(data.notes !== undefined ? { notes: data.notes.trim() } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        })
        .where(whereForConditions(checklistDefaultTenantConditions(ctx, eq(checklistDefaultItems.id, input.id))));
      return { success: true };
    }),

  delete: tenantAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db
        .delete(checklistDefaultItems)
        .where(whereForConditions(checklistDefaultTenantConditions(ctx, eq(checklistDefaultItems.id, input.id))));
      return { success: true };
    }),

  seedBuiltIns: tenantAdminProcedure
    .input(z.object({
      section: z.string().optional(),
      replace: z.boolean().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const tenantId = tenantIdFromContext(ctx);
      const sectionIds = input?.section
        ? [input.section]
        : WORK_CHECKLIST_SECTIONS.map((section) => section.id);
      let inserted = 0;

      for (const section of sectionIds) {
        const defaults = BUILTIN_WORK_CHECKLIST_DEFAULTS[section] ?? [];
        if (defaults.length === 0) continue;

        const sectionConditions = checklistDefaultTenantConditions(ctx, eq(checklistDefaultItems.section, section));
        if (input?.replace) {
          await db
            .delete(checklistDefaultItems)
            .where(whereForConditions(sectionConditions));
        } else {
          const [existing] = await db
            .select({ count: sql<number>`count(*)` })
            .from(checklistDefaultItems)
            .where(whereForConditions(sectionConditions));
          if (Number(existing?.count ?? 0) > 0) continue;
        }

        await db.insert(checklistDefaultItems).values(defaults.map((row, index) => ({
          tenantId,
          section,
          label: getWorkChecklistLabel(row),
          unit: row.unit || "ea",
          responsibility: row.responsibility ?? "",
          productMatch: row.productMatch ?? "",
          notes: row.notes ?? "",
          sortOrder: index,
          isActive: true,
        })));
        inserted += defaults.length;
      }

      return { inserted };
    }),
});
