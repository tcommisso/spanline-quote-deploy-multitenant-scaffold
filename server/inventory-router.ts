import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { inventoryStockItems, inventoryMovements, inventoryTransfers, componentCatalogueProducts, branches } from "../drizzle/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { appendTenantScope, isMultiTenancyMode, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function insertIdFromResult(result: any): number | null {
  const rawId = result?.insertId ?? result?.[0]?.insertId;
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function optionalText(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function optionalDecimal(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function decimalFromNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function unitTypeFromUom(uom?: string | null): "unit" | "lm" {
  return /\b(lm|linear|lineal|metre|meter|m)\b/i.test(uom || "") ? "lm" : "unit";
}

function numericFromDecimal(value?: string | null) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function inferFullLengthMetres(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(" ");
  const candidates: number[] = [];

  const metrePattern = /(\d+(?:\.\d+)?)\s*(?:m|metre|meter|metres|meters)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = metrePattern.exec(text)) !== null) {
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value) && value > 0.2 && value <= 30) candidates.push(value);
  }

  const mmPattern = /(\d{3,5})\s*mm\b/gi;
  while ((match = mmPattern.exec(text)) !== null) {
    const value = Number.parseFloat(match[1]) / 1000;
    if (Number.isFinite(value) && value > 0.2 && value <= 30) candidates.push(value);
  }

  return candidates.length ? Math.max(...candidates) : null;
}

function proRataOffCutCost(input: {
  conditionIndicator?: string | null;
  costPrice?: string | null;
  actualSize?: string | null;
  sourceFullLength?: string | null;
  name?: string | null;
  description?: string | null;
}) {
  if (input.conditionIndicator !== "off_cut") return optionalDecimal(input.costPrice);
  const baseCost = numericFromDecimal(input.costPrice);
  const actualSize = numericFromDecimal(input.actualSize);
  const sourceFullLength = numericFromDecimal(input.sourceFullLength)
    ?? inferFullLengthMetres(input.name, input.description);

  if (baseCost == null || actualSize == null || sourceFullLength == null || sourceFullLength <= 0) {
    return optionalDecimal(input.costPrice);
  }

  return decimalFromNumber(baseCost * Math.min(actualSize / sourceFullLength, 1));
}

function stockDescriptionFromManufacturingProduct(product: any) {
  return [
    product.description,
    product.colour ? `Colour: ${product.colour}` : "",
    product.subGroup ? `Sub-group: ${product.subGroup}` : "",
  ].filter(Boolean).join("\n");
}

function rowsFromExecuteResult(result: unknown): any[] {
  return Array.isArray(result) ? result : [];
}

function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, branches.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function isInventorySeedBranch(branch: { name?: string | null }) {
  const name = String(branch.name || "").trim().toLowerCase();
  return /(^|[^a-z])act([^a-z]|$)/i.test(name)
    || name.includes("riverina")
    || /(^|[^a-z])riv([^a-z]|$)/i.test(name);
}

async function stockItemIdFromInsertResult(db: any, ctx: any, result: any, code: string) {
  const id = insertIdFromResult(result);
  if (id) return id;

  const [item] = await db.select({ id: inventoryStockItems.id })
    .from(inventoryStockItems)
    .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.code, code.trim()))))
    .orderBy(desc(inventoryStockItems.createdAt))
    .limit(1);

  if (!item?.id) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stock item was created but could not be reloaded." });
  }
  return item.id;
}

function stockItemTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, inventoryStockItems.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function movementTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, inventoryMovements.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function transferTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, inventoryTransfers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireStockItemAccess(db: any, ctx: any, stockItemId: number) {
  const [item] = await db.select()
    .from(inventoryStockItems)
    .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, stockItemId))))
    .limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Stock item not found" });
  return item;
}

async function requireBranchAccess(db: any, ctx: any, branchId: number) {
  const [branch] = await db.select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(and(...branchTenantConditions(ctx, eq(branches.id, branchId))))
    .limit(1);
  if (!branch) throw new TRPCError({ code: "NOT_FOUND", message: "Branch not found" });
  return branch;
}

async function requireTransferAccess(db: any, ctx: any, transferId: number) {
  const [transfer] = await db.select()
    .from(inventoryTransfers)
    .where(and(...transferTenantConditions(ctx, eq(inventoryTransfers.id, transferId))))
    .limit(1);
  if (!transfer) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory transfer not found" });
  return transfer;
}

export const inventoryRouter = router({
  // ─── Stock Items CRUD ─────────────────────────────────────────────────────
  stockItems: router({
    list: protectedProcedure.input(z.object({
      branchId: z.number().optional(),
      category: z.string().optional(),
      condition: z.enum(["new", "damaged", "off_cut"]).optional(),
      search: z.string().optional(),
      activeOnly: z.boolean().optional().default(true),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input.activeOnly) conditions.push(eq(inventoryStockItems.isActive, true));
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(eq(inventoryStockItems.branchId, input.branchId));
      }
      if (input.category) conditions.push(eq(inventoryStockItems.category, input.category));
      if (input.condition) conditions.push(eq(inventoryStockItems.conditionIndicator, input.condition));
      if (input.search?.trim()) {
        const term = `%${input.search.trim()}%`;
        conditions.push(sql`(
          ${inventoryStockItems.name} LIKE ${term}
          OR ${inventoryStockItems.code} LIKE ${term}
          OR ${inventoryStockItems.serialNumber} LIKE ${term}
          OR ${inventoryStockItems.category} LIKE ${term}
          OR ${inventoryStockItems.supplier} LIKE ${term}
          OR ${inventoryStockItems.description} LIKE ${term}
        )`);
      }
      appendTenantScope(conditions, inventoryStockItems.tenantId, tenantIdFromContext(ctx));

      const items = await db.select().from(inventoryStockItems)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(inventoryStockItems.category, inventoryStockItems.name);
      return items;
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      return requireStockItemAccess(db, ctx, input.id);
    }),

    create: protectedProcedure.input(z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      serialNumber: z.string().nullable().optional(),
      category: z.string().default("general"),
      unit: z.string().default("EA"),
      unitType: z.enum(["unit", "lm"]).default("unit"),
      reorderQty: z.string().nullable().optional(),
      minStockLevel: z.string().nullable().optional(),
      branchId: z.number().nullable().optional(),
      conditionIndicator: z.enum(["new", "damaged", "off_cut"]).default("new"),
      actualSize: z.string().nullable().optional(),
      sourceFullLength: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      supplier: z.string().nullable().optional(),
      costPrice: z.string().nullable().optional(),
      catalogueItemId: z.number().nullable().optional(),
      manufacturingCatalogueProductId: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      if (input.branchId) await requireBranchAccess(db, ctx, input.branchId);
      const [result] = await db.insert(inventoryStockItems).values({
        tenantId: tenantIdFromContext(ctx),
        code: input.code.trim(),
        name: input.name.trim(),
        serialNumber: optionalText(input.serialNumber),
        category: input.category.trim() || "general",
        unit: input.unit.trim() || "EA",
        unitType: input.unitType,
        reorderQty: optionalDecimal(input.reorderQty),
        minStockLevel: optionalDecimal(input.minStockLevel),
        branchId: input.branchId || null,
        conditionIndicator: input.conditionIndicator,
        actualSize: optionalDecimal(input.actualSize),
        sourceFullLength: optionalDecimal(input.sourceFullLength),
        description: optionalText(input.description),
        supplier: optionalText(input.supplier),
        costPrice: proRataOffCutCost(input),
        catalogueItemId: input.catalogueItemId || null,
        manufacturingCatalogueProductId: input.manufacturingCatalogueProductId || null,
      });
      const id = await stockItemIdFromInsertResult(db, ctx, result, input.code);
      return { id };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      code: z.string().optional(),
      name: z.string().optional(),
      serialNumber: z.string().nullable().optional(),
      category: z.string().optional(),
      unit: z.string().optional(),
      unitType: z.enum(["unit", "lm"]).optional(),
      reorderQty: z.string().nullable().optional(),
      minStockLevel: z.string().nullable().optional(),
      branchId: z.number().nullable().optional(),
      conditionIndicator: z.enum(["new", "damaged", "off_cut"]).optional(),
      actualSize: z.string().nullable().optional(),
      sourceFullLength: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      supplier: z.string().nullable().optional(),
      costPrice: z.string().nullable().optional(),
      catalogueItemId: z.number().nullable().optional(),
      manufacturingCatalogueProductId: z.number().nullable().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { id, ...updates } = input;
      const item = await requireStockItemAccess(db, ctx, id);
      if (updates.branchId) await requireBranchAccess(db, ctx, updates.branchId);
      const cleanedUpdates: Record<string, unknown> = {};
      if (updates.code !== undefined) cleanedUpdates.code = updates.code.trim();
      if (updates.name !== undefined) cleanedUpdates.name = updates.name.trim();
      if (updates.serialNumber !== undefined) cleanedUpdates.serialNumber = optionalText(updates.serialNumber);
      if (updates.category !== undefined) cleanedUpdates.category = updates.category.trim() || "general";
      if (updates.unit !== undefined) cleanedUpdates.unit = updates.unit.trim() || "EA";
      if (updates.unitType !== undefined) cleanedUpdates.unitType = updates.unitType;
      if (updates.reorderQty !== undefined) cleanedUpdates.reorderQty = optionalDecimal(updates.reorderQty);
      if (updates.minStockLevel !== undefined) cleanedUpdates.minStockLevel = optionalDecimal(updates.minStockLevel);
      if (updates.branchId !== undefined) cleanedUpdates.branchId = updates.branchId || null;
      if (updates.conditionIndicator !== undefined) cleanedUpdates.conditionIndicator = updates.conditionIndicator;
      if (updates.actualSize !== undefined) cleanedUpdates.actualSize = optionalDecimal(updates.actualSize);
      if (updates.sourceFullLength !== undefined) cleanedUpdates.sourceFullLength = optionalDecimal(updates.sourceFullLength);
      if (updates.description !== undefined) cleanedUpdates.description = optionalText(updates.description);
      if (updates.supplier !== undefined) cleanedUpdates.supplier = optionalText(updates.supplier);
      if (updates.costPrice !== undefined) {
        cleanedUpdates.costPrice = proRataOffCutCost({
          conditionIndicator: updates.conditionIndicator ?? item.conditionIndicator,
          costPrice: updates.costPrice,
          actualSize: updates.actualSize ?? item.actualSize,
          sourceFullLength: updates.sourceFullLength ?? item.sourceFullLength,
          name: updates.name ?? item.name,
          description: updates.description ?? item.description,
        });
      }
      if (updates.catalogueItemId !== undefined) cleanedUpdates.catalogueItemId = updates.catalogueItemId || null;
      if (updates.manufacturingCatalogueProductId !== undefined) cleanedUpdates.manufacturingCatalogueProductId = updates.manufacturingCatalogueProductId || null;
      if (updates.isActive !== undefined) cleanedUpdates.isActive = updates.isActive;
      await db.update(inventoryStockItems).set(cleanedUpdates).where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, id))));
      return { success: true };
    }),

    seedFromManufacturingData: protectedProcedure.input(z.object({
      branchIds: z.array(z.number()).optional(),
      includeArchived: z.boolean().optional().default(false),
    }).optional()).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const contextTenantId = tenantIdFromContext(ctx);
      if (!contextTenantId && isMultiTenancyMode()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Tenant context is required" });
      }
      const tenantId = contextTenantId ?? 1;

      const branchRows = await db.select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(and(...branchTenantConditions(ctx, eq(branches.isActive, true))));

      const requestedBranchIds = new Set(input?.branchIds || []);
      const targetBranches = requestedBranchIds.size
        ? branchRows.filter((branch) => requestedBranchIds.has(branch.id))
        : branchRows.filter(isInventorySeedBranch);

      if (!targetBranches.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No ACT or Riverina branches were found for this tenant.",
        });
      }

      const productConditions = [
        isMultiTenancyMode()
          ? sql`tenantId = ${tenantId}`
          : sql`(tenantId = ${tenantId} OR tenantId IS NULL)`
      ];
      if (!input?.includeArchived) productConditions.push(sql`isActive = 1`);
      const [rowsResult] = await db.execute(sql`
        SELECT id, sku, description, category, subGroup, uom, unitCost, supplier, colour, isActive
        FROM manufacturing_catalogue_products
        WHERE ${sql.join(productConditions, sql` AND `)}
        ORDER BY category IS NULL, category, sku IS NULL, sku, description
      `);
      const products = rowsFromExecuteResult(rowsResult);

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const product of products) {
        const code = String(product.sku || "").trim();
        const name = String(product.description || "").trim();
        if (!code || !name) {
          skipped += targetBranches.length;
          continue;
        }

        const unitCost = Number(product.unitCost || 0);
        const fullLength = inferFullLengthMetres(product.sku, product.description, product.category, product.subGroup);
        const productValues = {
          tenantId,
          code,
          name,
          category: String(product.category || product.subGroup || "general").trim() || "general",
          unit: String(product.uom || "EA").trim() || "EA",
          unitType: unitTypeFromUom(product.uom),
          conditionIndicator: "new" as const,
          description: stockDescriptionFromManufacturingProduct(product) || null,
          supplier: optionalText(product.supplier),
          costPrice: Number.isFinite(unitCost) ? unitCost.toFixed(2) : "0.00",
          manufacturingCatalogueProductId: Number(product.id) || null,
          sourceFullLength: decimalFromNumber(fullLength),
          isActive: true,
        };

        for (const branch of targetBranches) {
          const [existing] = await db.select({ id: inventoryStockItems.id })
            .from(inventoryStockItems)
            .where(and(...stockItemTenantConditions(ctx,
              eq(inventoryStockItems.branchId, branch.id),
              eq(inventoryStockItems.code, code)
            )))
            .limit(1);

          if (existing?.id) {
            await db.update(inventoryStockItems)
              .set({
                name: productValues.name,
                category: productValues.category,
                unit: productValues.unit,
                unitType: productValues.unitType,
                description: productValues.description,
                supplier: productValues.supplier,
                costPrice: productValues.costPrice,
                manufacturingCatalogueProductId: productValues.manufacturingCatalogueProductId,
                sourceFullLength: productValues.sourceFullLength,
                isActive: true,
              })
              .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, existing.id))));
            updated += 1;
          } else {
            await db.insert(inventoryStockItems).values({
              ...productValues,
              branchId: branch.id,
            });
            created += 1;
          }
        }
      }

      return {
        created,
        updated,
        skipped,
        products: products.length,
        branches: targetBranches.map((branch) => branch.name),
      };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.id);
      await db.update(inventoryStockItems).set({ isActive: false }).where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, input.id))));
      return { success: true };
    }),

    categories: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const results = await db.select({ category: inventoryStockItems.category })
        .from(inventoryStockItems)
        .where(and(...stockItemTenantConditions(ctx)))
        .groupBy(inventoryStockItems.category)
        .orderBy(inventoryStockItems.category);
      return results.map(r => r.category);
    }),

    // Stock on hand calculation per item
    stockOnHand: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      branchId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      if (input.branchId) await requireBranchAccess(db, ctx, input.branchId);
      const conditions: any[] = [eq(inventoryMovements.stockItemId, input.stockItemId)];
      if (input.branchId) conditions.push(eq(inventoryMovements.branchId, input.branchId));

      const [result] = await db.select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
      }).from(inventoryMovements).where(and(...movementTenantConditions(ctx, ...conditions)));

      const onHand = Number(result.totalIn) - Number(result.totalOut);
      return { stockItemId: input.stockItemId, branchId: input.branchId, onHand };
    }),
  }),

  // ─── Stock Movements ──────────────────────────────────────────────────────
  movements: router({
    list: protectedProcedure.input(z.object({
      stockItemId: z.number().optional(),
      branchId: z.number().optional(),
      movementType: z.enum(["purchase", "allocation", "manufacture_use", "adjustment_waste", "transfer_in", "transfer_out"]).optional(),
      limit: z.number().optional().default(100),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input.stockItemId) {
        await requireStockItemAccess(db, ctx, input.stockItemId);
        conditions.push(eq(inventoryMovements.stockItemId, input.stockItemId));
      }
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(eq(inventoryMovements.branchId, input.branchId));
      }
      if (input.movementType) conditions.push(eq(inventoryMovements.movementType, input.movementType));

      const movements = await db.select().from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx, ...conditions)))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(input.limit);
      return movements;
    }),

    // Record a purchase (adds stock + recalculates weighted average cost)
    recordPurchase: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      branchId: z.number(),
      quantity: z.string(),
      unitCost: z.string().optional(),
      unitType: z.enum(["unit", "lm"]).default("unit"),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const item = await requireStockItemAccess(db, ctx, input.stockItemId);
      await requireBranchAccess(db, ctx, input.branchId);
      const [result] = await db.insert(inventoryMovements).values({
        tenantId: tenantIdFromContext(ctx),
        stockItemId: input.stockItemId,
        branchId: input.branchId,
        movementType: "purchase",
        quantity: input.quantity,
        unitType: input.unitType,
        unitCostAtTime: input.unitCost || null,
        notes: input.notes || null,
        createdBy: ctx.user?.name || null,
      });
      // Recalculate weighted average cost if unitCost provided
      if (input.unitCost) {
        if (item) {
          const currentCost = parseFloat(item.costPrice || "0");
          // Get current on-hand (purchases + transfers_in - allocations - mfg_use - waste - transfers_out)
          const [onHandResult] = await db.select({
            total: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase','transfer_in') THEN ${inventoryMovements.quantity} ELSE -${inventoryMovements.quantity} END), 0)`,
          }).from(inventoryMovements)
            .where(and(...movementTenantConditions(ctx,
              eq(inventoryMovements.stockItemId, input.stockItemId),
              eq(inventoryMovements.branchId, input.branchId)
            )));
          const onHand = parseFloat(onHandResult?.total || "0");
          const purchaseQty = parseFloat(input.quantity);
          const purchaseCost = parseFloat(input.unitCost);
          // Weighted average: (existing_value + new_value) / total_qty
          const existingQty = onHand - purchaseQty; // qty before this purchase
          const existingValue = existingQty * currentCost;
          const newValue = purchaseQty * purchaseCost;
          const newAvgCost = onHand > 0 ? (existingValue + newValue) / onHand : purchaseCost;
          await db.update(inventoryStockItems).set({
            costPrice: String(Math.round(newAvgCost * 100) / 100),
          }).where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, input.stockItemId))));
        }
      }
      return { id: result.insertId };
    }),

    // Record allocation from stores (subtracts stock)
    recordAllocation: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      branchId: z.number(),
      quantity: z.string(),
      unitType: z.enum(["unit", "lm"]).default("unit"),
      referenceType: z.string().optional(),
      referenceId: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      await requireBranchAccess(db, ctx, input.branchId);
      const [result] = await db.insert(inventoryMovements).values({
        tenantId: tenantIdFromContext(ctx),
        stockItemId: input.stockItemId,
        branchId: input.branchId,
        movementType: "allocation",
        quantity: input.quantity,
        unitType: input.unitType,
        referenceType: input.referenceType || null,
        referenceId: input.referenceId || null,
        notes: input.notes || null,
        createdBy: ctx.user?.name || null,
      });
      return { id: result.insertId };
    }),

    // Record manufacturing coil usage (subtracts stock, recorded in LM)
    recordManufactureUse: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      branchId: z.number(),
      quantity: z.string(),
      unitType: z.enum(["unit", "lm"]).default("lm"),
      referenceType: z.string().optional(),
      referenceId: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      await requireBranchAccess(db, ctx, input.branchId);
      const [result] = await db.insert(inventoryMovements).values({
        tenantId: tenantIdFromContext(ctx),
        stockItemId: input.stockItemId,
        branchId: input.branchId,
        movementType: "manufacture_use",
        quantity: input.quantity,
        unitType: input.unitType,
        referenceType: input.referenceType || null,
        referenceId: input.referenceId || null,
        notes: input.notes || null,
        createdBy: ctx.user?.name || null,
      });
      return { id: result.insertId };
    }),

    // Record waste adjustment (subtracts stock, coded to waste)
    recordWasteAdjustment: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      branchId: z.number(),
      quantity: z.string(),
      unitType: z.enum(["unit", "lm"]).default("unit"),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      await requireBranchAccess(db, ctx, input.branchId);
      const [result] = await db.insert(inventoryMovements).values({
        tenantId: tenantIdFromContext(ctx),
        stockItemId: input.stockItemId,
        branchId: input.branchId,
        movementType: "adjustment_waste",
        quantity: input.quantity,
        unitType: input.unitType,
        notes: input.notes || `Waste adjustment`,
        createdBy: ctx.user?.name || null,
      });
      return { id: result.insertId };
    }),
  }),

  // ─── Inter-Branch Transfers ───────────────────────────────────────────────
  transfers: router({
    list: protectedProcedure.input(z.object({
      status: z.enum(["pending", "approved", "in_transit", "completed", "cancelled"]).optional(),
      branchId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(inventoryTransfers.status, input.status));
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(
          sql`(${inventoryTransfers.fromBranchId} = ${input.branchId} OR ${inventoryTransfers.toBranchId} = ${input.branchId})`
        );
      }
      const transfers = await db.select().from(inventoryTransfers)
        .where(and(...transferTenantConditions(ctx, ...conditions)))
        .orderBy(desc(inventoryTransfers.createdAt));
      return transfers;
    }),

    create: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      fromBranchId: z.number(),
      toBranchId: z.number(),
      quantity: z.string(),
      unitType: z.enum(["unit", "lm"]).default("unit"),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      await requireBranchAccess(db, ctx, input.fromBranchId);
      await requireBranchAccess(db, ctx, input.toBranchId);
      if (input.fromBranchId === input.toBranchId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Transfer branches must be different." });
      }
      const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;
      const [result] = await db.insert(inventoryTransfers).values({
        tenantId: tenantIdFromContext(ctx),
        transferNumber,
        stockItemId: input.stockItemId,
        fromBranchId: input.fromBranchId,
        toBranchId: input.toBranchId,
        quantity: input.quantity,
        unitType: input.unitType,
        notes: input.notes || null,
        requestedBy: ctx.user?.name || null,
      });
      return { id: result.insertId, transferNumber };
    }),

    approve: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTransferAccess(db, ctx, input.id);
      await db.update(inventoryTransfers).set({
        status: "approved",
        approvedBy: ctx.user?.name || null,
      }).where(and(...transferTenantConditions(ctx, eq(inventoryTransfers.id, input.id))));
      return { success: true };
    }),

    markInTransit: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Record transfer_out movement
      const transfer = await requireTransferAccess(db, ctx, input.id);
      if (transfer) {
        await db.insert(inventoryMovements).values({
          tenantId: tenantIdFromContext(ctx),
          stockItemId: transfer.stockItemId,
          branchId: transfer.fromBranchId,
          movementType: "transfer_out",
          quantity: transfer.quantity!,
          unitType: transfer.unitType,
          referenceType: "transfer",
          referenceId: transfer.id,
          notes: `Transfer to branch ${transfer.toBranchId} (${transfer.transferNumber})`,
        });
      }
      await db.update(inventoryTransfers).set({ status: "in_transit" }).where(and(...transferTenantConditions(ctx, eq(inventoryTransfers.id, input.id))));
      return { success: true };
    }),

    complete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const transfer = await requireTransferAccess(db, ctx, input.id);
      if (transfer) {
        // Record transfer_in movement
        await db.insert(inventoryMovements).values({
          tenantId: tenantIdFromContext(ctx),
          stockItemId: transfer.stockItemId,
          branchId: transfer.toBranchId,
          movementType: "transfer_in",
          quantity: transfer.quantity!,
          unitType: transfer.unitType,
          referenceType: "transfer",
          referenceId: transfer.id,
          notes: `Transfer from branch ${transfer.fromBranchId} (${transfer.transferNumber})`,
        });
      }
      await db.update(inventoryTransfers).set({
        status: "completed",
        completedAt: new Date(),
      }).where(and(...transferTenantConditions(ctx, eq(inventoryTransfers.id, input.id))));
      return { success: true };
    }),

    cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTransferAccess(db, ctx, input.id);
      await db.update(inventoryTransfers).set({ status: "cancelled" }).where(and(...transferTenantConditions(ctx, eq(inventoryTransfers.id, input.id))));
      return { success: true };
    }),
  }),

  // ─── Reports ──────────────────────────────────────────────────────────────
  reports: router({
    // Stock on hand by category/branch
    onHandByCategory: protectedProcedure.input(z.object({
      branchId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      // Get all active stock items
      const conditions: any[] = [eq(inventoryStockItems.isActive, true)];
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(eq(inventoryStockItems.branchId, input.branchId));
      }

      const items = await db.select().from(inventoryStockItems).where(and(...stockItemTenantConditions(ctx, ...conditions)));

      // Get all movements for these items
      const itemIds = items.map(i => i.id);
      if (!itemIds.length) return [];

      const movements = await db.select({
        stockItemId: inventoryMovements.stockItemId,
        branchId: inventoryMovements.branchId,
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx, inArray(inventoryMovements.stockItemId, itemIds))))
        .groupBy(inventoryMovements.stockItemId, inventoryMovements.branchId);

      // Build report grouped by category
      const movementMap = new Map<string, { totalIn: number; totalOut: number }>();
      for (const m of movements) {
        const key = `${m.stockItemId}-${m.branchId}`;
        movementMap.set(key, { totalIn: Number(m.totalIn), totalOut: Number(m.totalOut) });
      }

      const report = items.map(item => {
        const key = `${item.id}-${item.branchId || 0}`;
        const mov = movementMap.get(key) || { totalIn: 0, totalOut: 0 };
        const onHand = mov.totalIn - mov.totalOut;
        const belowReorder = item.reorderQty ? onHand < Number(item.reorderQty) : false;
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          unit: item.unit,
          unitType: item.unitType,
          branchId: item.branchId,
          conditionIndicator: item.conditionIndicator,
          onHand,
          reorderQty: item.reorderQty ? Number(item.reorderQty) : null,
          minStockLevel: item.minStockLevel ? Number(item.minStockLevel) : null,
          belowReorder,
          costPrice: item.costPrice ? Number(item.costPrice) : null,
          totalValue: item.costPrice ? onHand * Number(item.costPrice) : null,
        };
      });

      return report;
    }),

    // Reorder alerts - items below reorder level
    reorderAlerts: protectedProcedure.input(z.object({
      branchId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions: any[] = [eq(inventoryStockItems.isActive, true)];
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(eq(inventoryStockItems.branchId, input.branchId));
      }

      const items = await db.select().from(inventoryStockItems)
        .where(and(...stockItemTenantConditions(ctx, ...conditions, sql`${inventoryStockItems.reorderQty} IS NOT NULL`)));

      const alerts: Array<{ id: number; code: string; name: string; category: string; branchId: number | null; onHand: number; reorderQty: number; deficit: number }> = [];

      for (const item of items) {
        const branchConditions: any[] = [eq(inventoryMovements.stockItemId, item.id)];
        if (item.branchId) branchConditions.push(eq(inventoryMovements.branchId, item.branchId));

        const [result] = await db.select({
          totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
          totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        }).from(inventoryMovements).where(and(...movementTenantConditions(ctx, ...branchConditions)));

        const onHand = Number(result.totalIn) - Number(result.totalOut);
        const reorderQty = Number(item.reorderQty);
        if (onHand < reorderQty) {
          alerts.push({
            id: item.id,
            code: item.code,
            name: item.name,
            category: item.category,
            branchId: item.branchId,
            onHand,
            reorderQty,
            deficit: reorderQty - onHand,
          });
        }
      }

      return alerts.sort((a, b) => b.deficit - a.deficit);
    }),

    // Branch summary
    branchSummary: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const results = await db.select({
        branchId: inventoryStockItems.branchId,
        totalItems: sql<number>`COUNT(*)`,
        totalCategories: sql<number>`COUNT(DISTINCT ${inventoryStockItems.category})`,
      }).from(inventoryStockItems)
        .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.isActive, true))))
        .groupBy(inventoryStockItems.branchId);
      return results;
    }),

    // Inventory valuation report - weighted average cost x on-hand by branch/category
    valuation: protectedProcedure.input(z.object({
      branchId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions: any[] = [eq(inventoryStockItems.isActive, true)];
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(eq(inventoryStockItems.branchId, input.branchId));
      }

      const items = await db.select().from(inventoryStockItems).where(and(...stockItemTenantConditions(ctx, ...conditions)));
      const itemIds = items.map(i => i.id);
      if (!itemIds.length) return { items: [], summary: { totalItems: 0, totalValue: 0, byCategory: [], byBranch: [] } };

      const movements = await db.select({
        stockItemId: inventoryMovements.stockItemId,
        branchId: inventoryMovements.branchId,
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx, inArray(inventoryMovements.stockItemId, itemIds))))
        .groupBy(inventoryMovements.stockItemId, inventoryMovements.branchId);

      const movementMap = new Map<string, { totalIn: number; totalOut: number }>();
      for (const m of movements) {
        movementMap.set(`${m.stockItemId}-${m.branchId}`, { totalIn: Number(m.totalIn), totalOut: Number(m.totalOut) });
      }

      const valuationItems = items.map(item => {
        const key = `${item.id}-${item.branchId || 0}`;
        const mov = movementMap.get(key) || { totalIn: 0, totalOut: 0 };
        const onHand = mov.totalIn - mov.totalOut;
        const unitCost = item.costPrice ? Number(item.costPrice) : 0;
        const totalValue = onHand * unitCost;
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          branchId: item.branchId,
          unit: item.unit,
          unitType: item.unitType,
          onHand,
          unitCost,
          totalValue,
          conditionIndicator: item.conditionIndicator,
        };
      }).filter(i => i.onHand > 0 || i.totalValue !== 0);

      // Summary by category
      const catMap = new Map<string, number>();
      const branchMap = new Map<number, number>();
      let totalValue = 0;
      for (const item of valuationItems) {
        totalValue += item.totalValue;
        catMap.set(item.category, (catMap.get(item.category) || 0) + item.totalValue);
        if (item.branchId) branchMap.set(item.branchId, (branchMap.get(item.branchId) || 0) + item.totalValue);
      }

      return {
        items: valuationItems,
        summary: {
          totalItems: valuationItems.length,
          totalValue,
          byCategory: Array.from(catMap.entries()).map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value),
          byBranch: Array.from(branchMap.entries()).map(([branchId, value]) => ({ branchId, value })).sort((a, b) => b.value - a.value),
        },
      };
    }),

    // Waste report
    wasteReport: protectedProcedure.input(z.object({
      branchId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions: any[] = [eq(inventoryMovements.movementType, "adjustment_waste")];
      if (input.branchId) {
        await requireBranchAccess(db, ctx, input.branchId);
        conditions.push(eq(inventoryMovements.branchId, input.branchId));
      }
      if (input.startDate) conditions.push(sql`${inventoryMovements.createdAt} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${inventoryMovements.createdAt} <= ${input.endDate}`);

      const waste = await db.select().from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx, ...conditions)))
        .orderBy(desc(inventoryMovements.createdAt));
      return waste;
    }),
  }),

  // ─── Dashboard KPIs ─────────────────────────────────────────────────────
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();

      // Total stock value (on-hand × cost price)
      const items = await db.select().from(inventoryStockItems)
        .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.isActive, true))));

      let totalStockValue = 0;
      let itemsBelowReorder = 0;
      let totalItems = items.length;

      for (const item of items) {
        const [result] = await db.select({
          totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
          totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        }).from(inventoryMovements).where(and(...movementTenantConditions(ctx, eq(inventoryMovements.stockItemId, item.id))));

        const onHand = Number(result.totalIn) - Number(result.totalOut);
        const costPrice = parseFloat(item.costPrice || "0");
        totalStockValue += onHand * costPrice;

        if (item.reorderQty && onHand < Number(item.reorderQty)) {
          itemsBelowReorder++;
        }
      }

      // Pending transfers
      const [transferCount] = await db.select({
        count: sql<number>`COUNT(*)`,
      }).from(inventoryTransfers).where(
        and(
          ...transferTenantConditions(ctx, sql`${inventoryTransfers.status} IN ('pending', 'approved', 'in_transit')`)
        )
      );

      // Recent adjustments (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [adjustmentCount] = await db.select({
        count: sql<number>`COUNT(*)`,
      }).from(inventoryMovements).where(
        and(
          ...movementTenantConditions(ctx),
          eq(inventoryMovements.movementType, "adjustment_waste"),
          sql`${inventoryMovements.createdAt} >= ${thirtyDaysAgo}`
        )
      );

      return {
        totalStockValue: Math.round(totalStockValue * 100) / 100,
        totalItems,
        itemsBelowReorder,
        pendingTransfers: transferCount.count || 0,
        recentAdjustments: adjustmentCount.count || 0,
      };
    }),

    // Stock value trend (weekly for last 12 weeks)
    stockValueTrend: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();

      // Get weekly movement totals for the last 12 weeks
      const weeks = await db.select({
        week: sql<string>`DATE_FORMAT(${inventoryMovements.createdAt}, '%Y-%u')`,
        weekStart: sql<string>`DATE_FORMAT(DATE_SUB(${inventoryMovements.createdAt}, INTERVAL WEEKDAY(${inventoryMovements.createdAt}) DAY), '%Y-%m-%d')`,
        totalPurchaseValue: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} = 'purchase' THEN ${inventoryMovements.quantity} * COALESCE(${inventoryMovements.unitCostAtTime}, 0) ELSE 0 END), 0)`,
        totalWasteValue: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} = 'adjustment_waste' THEN ${inventoryMovements.quantity} * COALESCE(${inventoryMovements.unitCostAtTime}, 0) ELSE 0 END), 0)`,
        movementCount: sql<number>`COUNT(*)`,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx, sql`${inventoryMovements.createdAt} >= DATE_SUB(NOW(), INTERVAL 12 WEEK)`)))
        .groupBy(sql`DATE_FORMAT(${inventoryMovements.createdAt}, '%Y-%u')`, sql`DATE_FORMAT(DATE_SUB(${inventoryMovements.createdAt}, INTERVAL WEEKDAY(${inventoryMovements.createdAt}) DAY), '%Y-%m-%d')`)
        .orderBy(sql`DATE_FORMAT(${inventoryMovements.createdAt}, '%Y-%u')`);

      return weeks;
    }),

    // Movement counts by type (last 30 days)
    movementsByType: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const movements = await db.select({
        type: inventoryMovements.movementType,
        count: sql<number>`COUNT(*)`,
        totalQty: sql<string>`COALESCE(SUM(${inventoryMovements.quantity}), 0)`,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx, sql`${inventoryMovements.createdAt} >= ${thirtyDaysAgo}`)))
        .groupBy(inventoryMovements.movementType);

      return movements;
    }),

    // Recent activity (last 20 movements)
    recentActivity: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();

      const movements = await db.select({
        id: inventoryMovements.id,
        stockItemId: inventoryMovements.stockItemId,
        branchId: inventoryMovements.branchId,
        movementType: inventoryMovements.movementType,
        quantity: inventoryMovements.quantity,
        notes: inventoryMovements.notes,
        createdAt: inventoryMovements.createdAt,
        createdBy: inventoryMovements.createdBy,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx)))
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(20);

      // Get stock item names
      const itemIds = Array.from(new Set(movements.map(m => m.stockItemId)));
      let itemsMap: Record<number, string> = {};
      if (itemIds.length) {
        const items = await db.select({ id: inventoryStockItems.id, name: inventoryStockItems.name })
          .from(inventoryStockItems)
          .where(and(...stockItemTenantConditions(ctx, inArray(inventoryStockItems.id, itemIds))));
        itemsMap = Object.fromEntries(items.map(i => [i.id, i.name]));
      }

      return movements.map(m => ({
        ...m,
        itemName: itemsMap[m.stockItemId] || "Unknown",
      }));
    }),
  }),

  // ─── Catalogue Linking ─────────────────────────────────────────────────────
  catalogue: router({
    // Search catalogue for linking
    search: protectedProcedure.input(z.object({
      query: z.string().min(1),
      category: z.string().optional(),
      limit: z.number().optional().default(20),
    })).query(async ({ input }) => {
      const db = await requireDb();
      const conditions: any[] = [eq(componentCatalogueProducts.isActive, true)];
      if (input.category) conditions.push(eq(componentCatalogueProducts.category, input.category));
      conditions.push(
        sql`(${componentCatalogueProducts.spaCode} LIKE ${`%${input.query}%`} OR ${componentCatalogueProducts.description} LIKE ${`%${input.query}%`})`
      );
      const results = await db.select({
        id: componentCatalogueProducts.id,
        spaCode: componentCatalogueProducts.spaCode,
        description: componentCatalogueProducts.description,
        category: componentCatalogueProducts.category,
        subGroup: componentCatalogueProducts.subGroup,
        uom: componentCatalogueProducts.uom,
        price: componentCatalogueProducts.price,
        colour: componentCatalogueProducts.colour,
      }).from(componentCatalogueProducts)
        .where(and(...conditions))
        .limit(input.limit);
      return results;
    }),

    // Link a stock item to a catalogue product
    linkItem: protectedProcedure.input(z.object({
      stockItemId: z.number(),
      catalogueItemId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      await db.update(inventoryStockItems)
        .set({ catalogueItemId: input.catalogueItemId })
        .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, input.stockItemId))));
      return { success: true };
    }),

    // Unlink a stock item from catalogue
    unlinkItem: protectedProcedure.input(z.object({
      stockItemId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireStockItemAccess(db, ctx, input.stockItemId);
      await db.update(inventoryStockItems)
        .set({ catalogueItemId: null })
        .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.id, input.stockItemId))));
      return { success: true };
    }),

    // Add a new item to the Component Catalogue (workflow: item not found)
    addToCatalogue: protectedProcedure.input(z.object({
      spaCode: z.string().min(1),
      description: z.string().min(1),
      category: z.string().min(1),
      subGroup: z.string().optional(),
      uom: z.string().optional(),
      price: z.string().optional(),
      colour: z.string().optional(),
      tags: z.string().optional(),
    })).mutation(async ({ input }) => {
      const db = await requireDb();
      const [result] = await db.insert(componentCatalogueProducts).values({
        spaCode: input.spaCode,
        description: input.description,
        category: input.category,
        subGroup: input.subGroup || "",
        uom: input.uom || "",
        price: input.price || "0",
        colour: input.colour || "",
        tags: input.tags || "",
        isActive: true,
      });
      return { id: result.insertId };
    }),

    // Get catalogue item details for a stock item
    getLinked: protectedProcedure.input(z.object({
      stockItemId: z.number(),
    })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const item = await requireStockItemAccess(db, ctx, input.stockItemId);
      if (!item?.catalogueItemId) return null;
      const [catItem] = await db.select().from(componentCatalogueProducts).where(eq(componentCatalogueProducts.id, item.catalogueItemId));
      return catItem || null;
    }),
  }),
});
