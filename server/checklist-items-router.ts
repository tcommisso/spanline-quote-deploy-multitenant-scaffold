import { z } from "zod";
import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { checklistItems } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { appendTenantScope, isMultiTenancyMode, tenantIdFromContext } from "./_core/tenant-scope";

// ─── DB Helpers ──────────────────────────────────────────────────────────────

function checklistTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, checklistItems.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function rowsFromExecuteResult(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  return Array.isArray(result) ? result : [];
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

function isMissingChecklistSchema(error: unknown) {
  const message = errorText(error);
  if (!/checklist_items/i.test(message)) return false;
  return /(unknown column|no such column|doesn't exist|does not exist|er_no_such_table|er_bad_field_error)/i.test(message)
    || /failed query:\s*select/i.test(message);
}

function quoteIdent(identifier: string) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
}

async function checklistColumnSet(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [result] = await db.execute(sql.raw(`SHOW COLUMNS FROM ${quoteIdent("checklist_items")}`));
  return new Set(rowsFromExecuteResult(result).map((row) => String(row.Field)));
}

function checklistSelectColumn(columnSet: Set<string>, column: string, alias: string, fallbackSql = "NULL") {
  if (columnSet.has(column)) return `${quoteIdent(column)} AS ${quoteIdent(alias)}`;
  return `${fallbackSql} AS ${quoteIdent(alias)}`;
}

function checklistTenantWhereSql(columnSet: Set<string>, ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!columnSet.has("tenantId")) {
    return isMultiTenancyMode() ? "1 = 0" : "1 = 1";
  }
  if (!tenantId) return isMultiTenancyMode() ? "1 = 0" : "1 = 1";
  if (isMultiTenancyMode()) return `${quoteIdent("tenantId")} = ${Number(tenantId)}`;
  return `(${quoteIdent("tenantId")} = ${Number(tenantId)} OR ${quoteIdent("tenantId")} IS NULL)`;
}

async function listChecklistItemsColumnAware(ctx: any, activeOnly: boolean) {
  const db = (await getDb())!;
  try {
    const columnSet = await checklistColumnSet(db);
    const fields = [
      checklistSelectColumn(columnSet, "id", "id", "0"),
      checklistSelectColumn(columnSet, "tenantId", "tenantId"),
      checklistSelectColumn(columnSet, "section", "section", "'general'"),
      checklistSelectColumn(columnSet, "label", "label", "''"),
      checklistSelectColumn(columnSet, "unitPrice", "unitPrice", "'0.00'"),
      checklistSelectColumn(columnSet, "unit", "unit", "'each'"),
      checklistSelectColumn(columnSet, "sortOrder", "sortOrder", "0"),
      checklistSelectColumn(columnSet, "isActive", "isActive", "TRUE"),
      checklistSelectColumn(columnSet, "createdAt", "createdAt"),
      checklistSelectColumn(columnSet, "updatedAt", "updatedAt"),
    ];
    const conditions = [checklistTenantWhereSql(columnSet, ctx)];
    if (activeOnly && columnSet.has("isActive")) conditions.push(`${quoteIdent("isActive")} = TRUE`);
    const orderBy = [
      columnSet.has("section") ? quoteIdent("section") : null,
      columnSet.has("sortOrder") ? quoteIdent("sortOrder") : null,
      columnSet.has("id") ? quoteIdent("id") : null,
    ].filter(Boolean).join(", ");
    const [result] = await db.execute(sql.raw(`
      SELECT ${fields.join(", ")}
      FROM ${quoteIdent("checklist_items")}
      WHERE ${conditions.join(" AND ")}
      ${orderBy ? `ORDER BY ${orderBy}` : ""}
    `));
    return rowsFromExecuteResult(result).map((row) => ({
      ...row,
      id: Number(row.id),
      tenantId: row.tenantId == null ? null : Number(row.tenantId),
      sortOrder: Number(row.sortOrder ?? 0),
      isActive: row.isActive === true || row.isActive === 1 || row.isActive === "1",
    }));
  } catch (error) {
    if (isMissingChecklistSchema(error)) {
      console.warn("[checklist-items] checklist_items schema is not available; returning an empty checklist list.", error);
      return [];
    }
    throw error;
  }
}

async function listAllChecklistItems(ctx: any) {
  return listChecklistItemsColumnAware(ctx, false);
}

async function listActiveChecklistItems(ctx: any) {
  return listChecklistItemsColumnAware(ctx, true);
}

async function createChecklistItem(data: {
  section: string;
  label: string;
  unitPrice: string;
  unit: string;
  sortOrder?: number;
  isActive?: boolean;
}, ctx: any) {
  const db = (await getDb())!;
  const [result] = await db.insert(checklistItems).values({
    tenantId: tenantIdFromContext(ctx),
    section: data.section,
    label: data.label,
    unitPrice: data.unitPrice,
    unit: data.unit,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
  });
  return result.insertId;
}

async function updateChecklistItem(id: number, data: Partial<{
  section: string;
  label: string;
  unitPrice: string;
  unit: string;
  sortOrder: number;
  isActive: boolean;
}>, ctx: any) {
  const db = (await getDb())!;
  await db
    .update(checklistItems)
    .set(data)
    .where(and(...checklistTenantConditions(ctx, eq(checklistItems.id, id))));
}

async function deleteChecklistItem(id: number, ctx: any) {
  const db = (await getDb())!;
  await db
    .delete(checklistItems)
    .where(and(...checklistTenantConditions(ctx, eq(checklistItems.id, id))));
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const checklistItemsRouter = router({
  // All users can read active items (for spec sheet)
  listActive: protectedProcedure.query(async ({ ctx }) => {
    return listActiveChecklistItems(ctx);
  }),

  // Admin: list all items (including inactive)
  listAll: adminProcedure.query(async ({ ctx }) => {
    return listAllChecklistItems(ctx);
  }),

  // Admin: create new item
  create: adminProcedure
    .input(z.object({
      section: z.string().min(1),
      label: z.string().min(1),
      unitPrice: z.string().min(1),
      unit: z.enum(["each", "m", "m2", "lump"]),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createChecklistItem(input, ctx);
      return { id };
    }),

  // Admin: update item
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        section: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
        unitPrice: z.string().optional(),
        unit: z.enum(["each", "m", "m2", "lump"]).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateChecklistItem(input.id, input.data, ctx);
      return { success: true };
    }),

  // Admin: delete item
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteChecklistItem(input.id, ctx);
      return { success: true };
    }),

  // Admin: bulk reorder
  reorder: adminProcedure
    .input(z.object({
      items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      for (const item of input.items) {
        await db
          .update(checklistItems)
          .set({ sortOrder: item.sortOrder })
          .where(and(...checklistTenantConditions(ctx, eq(checklistItems.id, item.id))));
      }
      return { success: true };
    }),
});
