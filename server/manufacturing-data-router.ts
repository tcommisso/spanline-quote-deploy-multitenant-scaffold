import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { tenantIdFromContext } from "./_core/tenant-scope";

let tableEnsured = false;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function ensureManufacturingCatalogueTable(db: any) {
  if (tableEnsured) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS manufacturing_catalogue_products (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenantId int NULL,
      sku varchar(100) NULL,
      description text NOT NULL,
      category varchar(100) NULL,
      subGroup varchar(100) NULL,
      uom varchar(20) NULL,
      unitCost decimal(12,2) NOT NULL DEFAULT 0.00,
      supplier varchar(255) NULL,
      colour varchar(100) NULL,
      isActive tinyint(1) NOT NULL DEFAULT 1,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_mfg_catalogue_tenant (tenantId),
      KEY idx_mfg_catalogue_sku (sku),
      KEY idx_mfg_catalogue_category (category)
    )
  `));
  tableEnsured = true;
}

function tenantSql(tenantId: number) {
  return sql`(tenantId = ${tenantId} OR tenantId IS NULL)`;
}

function tenantIdForContext(ctx: any) {
  return tenantIdFromContext(ctx) ?? 1;
}

function rowsFromExecute(result: unknown): any[] {
  return Array.isArray(result) ? result : [];
}

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeProduct(row: any) {
  return {
    id: Number(row.id),
    tenantId: row.tenantId == null ? null : Number(row.tenantId),
    sku: row.sku || "",
    description: row.description || "",
    category: row.category || "",
    subGroup: row.subGroup || "",
    uom: row.uom || "",
    unitCost: Number(row.unitCost || 0),
    supplier: row.supplier || "",
    colour: row.colour || "",
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function compactSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s\-_/\\.]/g, "");
}

function catalogueSearchCondition(search: string) {
  const raw = search.trim().toLowerCase();
  const term = `%${raw}%`;
  const compact = compactSearchValue(search);
  const compactTerm = `%${compact}%`;
  const compactOAsZeroTerm = `%${compact.replace(/o/g, "0")}%`;
  const compactZeroAsOTerm = `%${compact.replace(/0/g, "o")}%`;
  const compactSku = sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(sku, ''), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))`;
  const compactDescription = sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(description, ''), ' ', ''), '-', ''), '/', ''), '.', ''), '_', ''))`;
  return sql`(
    LOWER(COALESCE(sku, '')) LIKE ${term}
    OR LOWER(description) LIKE ${term}
    OR LOWER(COALESCE(category, '')) LIKE ${term}
    OR LOWER(COALESCE(subGroup, '')) LIKE ${term}
    OR LOWER(COALESCE(colour, '')) LIKE ${term}
    OR ${compactSku} LIKE ${compactTerm}
    OR REPLACE(${compactSku}, 'o', '0') LIKE ${compactOAsZeroTerm}
    OR REPLACE(${compactSku}, '0', 'o') LIKE ${compactZeroAsOTerm}
    OR ${compactDescription} LIKE ${compactTerm}
  )`;
}

const productInput = z.object({
  sku: z.string().optional().nullable(),
  description: z.string().min(1),
  category: z.string().optional().nullable(),
  subGroup: z.string().optional().nullable(),
  uom: z.string().optional().nullable(),
  unitCost: z.number().optional(),
  supplier: z.string().optional().nullable(),
  colour: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const manufacturingDataRouter = router({
  list: tenantProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      subGroup: z.string().optional(),
      activeOnly: z.boolean().optional(),
      activeState: z.enum(["active", "archived", "all"]).optional(),
      limit: z.number().min(1).max(5000).default(500),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      const conditions = [tenantSql(tenantId)];
      if (input?.activeState === "active" || input?.activeOnly) conditions.push(sql`isActive = 1`);
      if (input?.activeState === "archived") conditions.push(sql`isActive = 0`);
      if (input?.category && input.category !== "all") conditions.push(sql`category = ${input.category}`);
      if (input?.subGroup && input.subGroup !== "all") conditions.push(sql`subGroup = ${input.subGroup}`);
      if (input?.search?.trim()) {
        conditions.push(catalogueSearchCondition(input.search));
      }
      const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
      const [rowsResult] = await db.execute(sql`
        SELECT id, tenantId, sku, description, category, subGroup, uom, unitCost, supplier, colour, isActive, createdAt, updatedAt
        FROM manufacturing_catalogue_products
        ${where}
        ORDER BY category IS NULL, category, sku IS NULL, sku, description
        LIMIT ${input?.limit ?? 500}
      `);
      return rowsFromExecute(rowsResult).map(normalizeProduct);
    }),

  search: tenantProcedure
    .input(z.object({
      query: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      const conditions = [tenantSql(tenantId), sql`isActive = 1`];
      if (input?.query?.trim()) {
        conditions.push(catalogueSearchCondition(input.query));
      }
      const [rowsResult] = await db.execute(sql`
        SELECT id, tenantId, sku, description, category, subGroup, uom, unitCost, supplier, colour, isActive, createdAt, updatedAt
        FROM manufacturing_catalogue_products
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY sku IS NULL, sku, description
        LIMIT ${input?.limit ?? 20}
      `);
      return rowsFromExecute(rowsResult).map(normalizeProduct);
    }),

  facets: tenantProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    await ensureManufacturingCatalogueTable(db);
    const tenantId = tenantIdForContext(ctx);
    const [categoryRows] = await db.execute(sql`
      SELECT DISTINCT category FROM manufacturing_catalogue_products
      WHERE ${tenantSql(tenantId)} AND category IS NOT NULL AND category <> ''
      ORDER BY category
    `);
    const [subGroupRows] = await db.execute(sql`
      SELECT DISTINCT subGroup FROM manufacturing_catalogue_products
      WHERE ${tenantSql(tenantId)} AND subGroup IS NOT NULL AND subGroup <> ''
      ORDER BY subGroup
    `);
    return {
      categories: rowsFromExecute(categoryRows).map((row: any) => row.category).filter(Boolean),
      subGroups: rowsFromExecute(subGroupRows).map((row: any) => row.subGroup).filter(Boolean),
    };
  }),

  create: tenantAdminProcedure
    .input(productInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      const [result] = await db.execute(sql`
        INSERT INTO manufacturing_catalogue_products
          (tenantId, sku, description, category, subGroup, uom, unitCost, supplier, colour, isActive)
        VALUES
          (${tenantId}, ${input.sku || null}, ${input.description}, ${input.category || null}, ${input.subGroup || null},
           ${input.uom || null}, ${input.unitCost ?? 0}, ${input.supplier || null}, ${input.colour || null}, ${input.isActive ?? true})
      `);
      return { id: Number(result?.insertId || 0) };
    }),

  update: tenantAdminProcedure
    .input(z.object({ id: z.number() }).merge(productInput))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      await db.execute(sql`
        UPDATE manufacturing_catalogue_products
        SET tenantId = ${tenantId},
            sku = ${input.sku || null},
            description = ${input.description},
            category = ${input.category || null},
            subGroup = ${input.subGroup || null},
            uom = ${input.uom || null},
            unitCost = ${input.unitCost ?? 0},
            supplier = ${input.supplier || null},
            colour = ${input.colour || null},
            isActive = ${input.isActive ?? true}
        WHERE id = ${input.id} AND ${tenantSql(tenantId)}
      `);
      return { success: true };
    }),

  delete: tenantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      await db.execute(sql`
        DELETE FROM manufacturing_catalogue_products
        WHERE id = ${input.id} AND ${tenantSql(tenantId)}
      `);
      return { success: true };
    }),

  bulkArchive: tenantAdminProcedure
    .input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(1000),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      const ids = Array.from(new Set(input.ids));
      await db.execute(sql`
        UPDATE manufacturing_catalogue_products
        SET isActive = ${input.isActive}
        WHERE ${tenantSql(tenantId)}
          AND id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      `);
      return { success: true, updated: ids.length };
    }),

  bulkDelete: tenantAdminProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      const ids = Array.from(new Set(input.ids));
      await db.execute(sql`
        DELETE FROM manufacturing_catalogue_products
        WHERE ${tenantSql(tenantId)}
          AND id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      `);
      return { success: true, deleted: ids.length };
    }),

  importCsvRows: tenantAdminProcedure
    .input(z.object({ rows: z.array(productInput).max(10000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await ensureManufacturingCatalogueTable(db);
      const tenantId = tenantIdForContext(ctx);
      const [existingRowsResult] = await db.execute(sql`
        SELECT id, sku, description, category
        FROM manufacturing_catalogue_products
        WHERE ${tenantSql(tenantId)}
      `);
      const bySku = new Map<string, any>();
      const byDescriptionCategory = new Map<string, any>();
      const existingRows = rowsFromExecute(existingRowsResult);
      for (const row of existingRows) {
        const skuKey = normalizeKey(row.sku);
        if (skuKey) bySku.set(skuKey, row);
        byDescriptionCategory.set(`${normalizeKey(row.description)}|${normalizeKey(row.category)}`, row);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let idx = 0; idx < input.rows.length; idx += 1) {
        const row = input.rows[idx];
        const description = row.description.trim();
        if (!description) {
          skipped += 1;
          continue;
        }
        const sku = row.sku?.trim() || null;
        const category = row.category?.trim() || null;
        const key = sku ? normalizeKey(sku) : `${normalizeKey(description)}|${normalizeKey(category)}`;
        const existing = sku ? bySku.get(key) : byDescriptionCategory.get(key);
        try {
          if (existing) {
            await db.execute(sql`
              UPDATE manufacturing_catalogue_products
              SET tenantId = ${tenantId},
                  sku = ${sku},
                  description = ${description},
                  category = ${category},
                  subGroup = ${row.subGroup?.trim() || null},
                  uom = ${row.uom?.trim() || null},
                  unitCost = ${row.unitCost ?? 0},
                  supplier = ${row.supplier?.trim() || null},
                  colour = ${row.colour?.trim() || null},
                  isActive = ${row.isActive ?? true}
              WHERE id = ${existing.id}
            `);
            updated += 1;
          } else {
            const [result] = await db.execute(sql`
              INSERT INTO manufacturing_catalogue_products
                (tenantId, sku, description, category, subGroup, uom, unitCost, supplier, colour, isActive)
              VALUES
                (${tenantId}, ${sku}, ${description}, ${category}, ${row.subGroup?.trim() || null}, ${row.uom?.trim() || null},
                 ${row.unitCost ?? 0}, ${row.supplier?.trim() || null}, ${row.colour?.trim() || null}, ${row.isActive ?? true})
            `);
            const inserted = { id: result?.insertId, sku, description, category };
            created += 1;
            if (sku) bySku.set(normalizeKey(sku), inserted);
            byDescriptionCategory.set(`${normalizeKey(description)}|${normalizeKey(category)}`, inserted);
          }
        } catch (err: any) {
          errors.push(`Row ${idx + 2}: ${err?.message || "import failed"}`);
        }
      }

      return { created, updated, skipped, errors };
    }),
});
