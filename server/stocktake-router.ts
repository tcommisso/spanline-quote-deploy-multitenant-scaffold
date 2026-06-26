import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  stocktakes,
  stocktakeLines,
  inventoryStockItems,
  inventoryMovements,
  branches,
} from "../drizzle/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { makeRequest, type DistanceMatrixResult } from "./_core/map";
import { appendTenantScope, isMultiTenancyMode, tenantIdFromContext } from "./_core/tenant-scope";
import { privateTenantConditions } from "./private-tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function stocktakeTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, stocktakes.tenantId, tenantIdFromContext(ctx));
  return conditions;
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

async function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  return privateTenantConditions(ctx, branches.tenantId, ...baseConditions);
}

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nullableDecimal(value?: string | null): string | null {
  const trimmed = nullableText(value);
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid stocktake line size value." });
  }
  return String(numeric);
}

function stocktakeLineDescriptor(line: typeof stocktakeLines.$inferSelect): string {
  const parts = [`variance: ${Number(line.variance || 0) > 0 ? "+" : ""}${line.variance}`];
  if (line.conditionIndicator) parts.push(`condition: ${line.conditionIndicator.replace("_", " ")}`);
  if (line.colour) parts.push(`colour: ${line.colour}`);
  if (line.actualSize) parts.push(`actual size: ${line.actualSize}m`);
  if (line.actualWidth || line.actualHeight) {
    parts.push(`actual dimensions: ${line.actualWidth || "-"}m x ${line.actualHeight || "-"}m`);
  }
  if (line.sourceFullLength) parts.push(`source length: ${line.sourceFullLength}m`);
  if (line.sourceFullWidth || line.sourceFullHeight) {
    parts.push(`source dimensions: ${line.sourceFullWidth || "-"}m x ${line.sourceFullHeight || "-"}m`);
  }
  return parts.join("; ");
}

function normalizeVariantText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeVariantDecimal(value: unknown): string | null {
  const numeric = decimalToNumber(value);
  return numeric == null ? null : numeric.toFixed(2);
}

function stockItemBaseColour(item: typeof inventoryStockItems.$inferSelect) {
  return normalizeVariantText(item.description?.match(/Colour:\s*([^\n]+)/i)?.[1] || null);
}

function variantFieldChanged(lineValue: unknown, itemValue: unknown) {
  return normalizeVariantText(lineValue)?.toLowerCase() !== normalizeVariantText(itemValue)?.toLowerCase();
}

function variantDecimalChanged(lineValue: unknown, itemValue: unknown) {
  return normalizeVariantDecimal(lineValue) !== normalizeVariantDecimal(itemValue);
}

function stocktakeLineNeedsVariant(line: typeof stocktakeLines.$inferSelect, item: typeof inventoryStockItems.$inferSelect) {
  const itemColour = stockItemBaseColour(item);
  const lineColour = normalizeVariantText(line.colour) || itemColour;
  return variantFieldChanged(line.conditionIndicator || "new", item.conditionIndicator || "new")
    || variantFieldChanged(lineColour, itemColour)
    || variantDecimalChanged(line.actualSize, item.actualSize)
    || variantDecimalChanged(line.actualWidth, item.actualWidth)
    || variantDecimalChanged(line.actualHeight, item.actualHeight)
    || variantDecimalChanged(line.sourceFullLength, item.sourceFullLength)
    || variantDecimalChanged(line.sourceFullWidth, item.sourceFullWidth)
    || variantDecimalChanged(line.sourceFullHeight, item.sourceFullHeight);
}

function stableVariantHash(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  return (hash >>> 0).toString(36).toUpperCase().slice(0, 6);
}

function stocktakeVariantCode(baseCode: string, line: typeof stocktakeLines.$inferSelect) {
  const variantKey = [
    line.conditionIndicator || "new",
    normalizeVariantText(line.colour) || "",
    normalizeVariantDecimal(line.actualSize) || "",
    normalizeVariantDecimal(line.actualWidth) || "",
    normalizeVariantDecimal(line.actualHeight) || "",
    normalizeVariantDecimal(line.sourceFullLength) || "",
    normalizeVariantDecimal(line.sourceFullWidth) || "",
    normalizeVariantDecimal(line.sourceFullHeight) || "",
  ].join("|");
  const suffix = stableVariantHash(variantKey);
  return `${baseCode}`.slice(0, Math.max(1, 49 - suffix.length)) + `-${suffix}`;
}

function stocktakeVariantName(baseName: string, line: typeof stocktakeLines.$inferSelect) {
  const dimensions = line.actualWidth && line.actualHeight
    ? `${line.actualWidth}m x ${line.actualHeight}m`
    : line.actualSize ? `${line.actualSize}m` : null;
  const details = [
    line.conditionIndicator === "off_cut" ? "Off cut" : line.conditionIndicator === "damaged" ? "Damaged" : null,
    normalizeVariantText(line.colour),
    dimensions,
  ].filter(Boolean);
  return details.length ? `${baseName} (${details.join(", ")})` : baseName;
}

function proRataUnitCost(input: {
  baseCost: number | null;
  conditionIndicator?: string | null;
  actualSize?: unknown;
  sourceFullLength?: unknown;
  actualWidth?: unknown;
  actualHeight?: unknown;
  sourceFullWidth?: unknown;
  sourceFullHeight?: unknown;
}) {
  if (input.baseCost == null) return null;
  if (input.conditionIndicator !== "off_cut") return input.baseCost.toFixed(2);

  const actualWidth = decimalToNumber(input.actualWidth);
  const actualHeight = decimalToNumber(input.actualHeight);
  const sourceFullWidth = decimalToNumber(input.sourceFullWidth);
  const sourceFullHeight = decimalToNumber(input.sourceFullHeight);
  if (
    actualWidth != null && actualWidth > 0 &&
    actualHeight != null && actualHeight > 0 &&
    sourceFullWidth != null && sourceFullWidth > 0 &&
    sourceFullHeight != null && sourceFullHeight > 0
  ) {
    const ratio = (actualWidth * actualHeight) / (sourceFullWidth * sourceFullHeight);
    return (input.baseCost * Math.min(ratio, 1)).toFixed(2);
  }

  const actualSize = decimalToNumber(input.actualSize);
  const sourceFullLength = decimalToNumber(input.sourceFullLength);
  if (actualSize != null && sourceFullLength != null && sourceFullLength > 0) {
    return (input.baseCost * Math.min(actualSize / sourceFullLength, 1)).toFixed(2);
  }

  return input.baseCost.toFixed(2);
}

function lineUnitCost(line: typeof stocktakeLines.$inferSelect, item: typeof inventoryStockItems.$inferSelect) {
  const stocktakeCost = decimalToNumber(line.unitCost);
  const itemCost = decimalToNumber(item.costPrice);
  const baseCost = itemCost ?? stocktakeCost;
  return proRataUnitCost({
    baseCost,
    conditionIndicator: line.conditionIndicator,
    actualSize: line.actualSize,
    sourceFullLength: line.sourceFullLength,
    actualWidth: line.actualWidth,
    actualHeight: line.actualHeight,
    sourceFullWidth: line.sourceFullWidth,
    sourceFullHeight: line.sourceFullHeight,
  });
}

function stocktakeVariantDescription(item: typeof inventoryStockItems.$inferSelect, line: typeof stocktakeLines.$inferSelect) {
  const itemColour = stockItemBaseColour(item);
  const lineColour = normalizeVariantText(line.colour);
  const details = [
    normalizeVariantText(item.description),
    lineColour && lineColour.toLowerCase() !== itemColour?.toLowerCase() ? `Colour: ${lineColour}` : "",
    line.conditionIndicator ? `Condition: ${line.conditionIndicator.replace("_", " ")}` : "",
    line.actualSize ? `Actual size: ${line.actualSize}m` : "",
    line.actualWidth || line.actualHeight ? `Actual dimensions: ${line.actualWidth || "-"}m x ${line.actualHeight || "-"}m` : "",
    line.sourceFullLength ? `Source length: ${line.sourceFullLength}m` : "",
    line.sourceFullWidth || line.sourceFullHeight ? `Source dimensions: ${line.sourceFullWidth || "-"}m x ${line.sourceFullHeight || "-"}m` : "",
  ].filter(Boolean);
  return details.length ? details.join("\n") : null;
}

function rowsFromExecuteResult(result: unknown): any[] {
  return Array.isArray(result) ? result : [];
}

function manufacturingCatalogueTenantSql(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) return isMultiTenancyMode() ? sql`1 = 0` : sql`1 = 1`;
  return isMultiTenancyMode() ? sql`tenantId = ${tenantId}` : sql`(tenantId = ${tenantId} OR tenantId IS NULL)`;
}

async function requireStocktakeAccess(db: any, ctx: any, stocktakeId: number) {
  const [stocktake] = await db.select()
    .from(stocktakes)
    .where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, stocktakeId))))
    .limit(1);
  if (!stocktake) throw new TRPCError({ code: "NOT_FOUND", message: "Stocktake not found" });
  return stocktake;
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
    .where(and(...await branchTenantConditions(ctx, eq(branches.id, branchId))))
    .limit(1);
  if (!branch) throw new TRPCError({ code: "NOT_FOUND", message: "Branch not found" });
  return branch;
}

async function resolveStocktakeMovementStockItem(db: any, ctx: any, line: typeof stocktakeLines.$inferSelect, branchId: number) {
  const item = await requireStockItemAccess(db, ctx, line.stockItemId);
  if (!stocktakeLineNeedsVariant(line, item)) {
    return { stockItemId: item.id, unitCost: lineUnitCost(line, item), unitType: item.unitType || "unit" };
  }

  const variantCode = stocktakeVariantCode(item.code, line);
  const [existingVariant] = await db.select()
    .from(inventoryStockItems)
    .where(and(...stockItemTenantConditions(ctx,
      eq(inventoryStockItems.branchId, branchId),
      eq(inventoryStockItems.code, variantCode),
    )))
    .limit(1);

  if (existingVariant?.id) {
    return {
      stockItemId: existingVariant.id,
      unitCost: lineUnitCost(line, existingVariant),
      unitType: existingVariant.unitType || "unit",
    };
  }

  const [result] = await db.insert(inventoryStockItems).values({
    tenantId: tenantIdFromContext(ctx),
    code: variantCode,
    name: stocktakeVariantName(item.name, line),
    serialNumber: item.serialNumber || null,
    category: item.category || "general",
    unit: item.unit || "EA",
    unitType: item.unitType || "unit",
    reorderQty: null,
    minStockLevel: null,
    branchId,
    conditionIndicator: line.conditionIndicator || item.conditionIndicator || "new",
    actualSize: line.actualSize || null,
    actualWidth: line.actualWidth || null,
    actualHeight: line.actualHeight || null,
    sourceFullLength: line.sourceFullLength || item.sourceFullLength || null,
    sourceFullWidth: line.sourceFullWidth || item.sourceFullWidth || null,
    sourceFullHeight: line.sourceFullHeight || item.sourceFullHeight || null,
    description: stocktakeVariantDescription(item, line),
    supplier: item.supplier || null,
    costPrice: lineUnitCost(line, item),
    catalogueItemId: item.catalogueItemId || null,
    manufacturingCatalogueProductId: item.manufacturingCatalogueProductId || null,
    isActive: true,
  });

  const rawId = (result as any)?.insertId ?? (result as any)?.[0]?.insertId;
  const insertedId = Number(rawId);
  if (Number.isFinite(insertedId) && insertedId > 0) {
    return { stockItemId: insertedId, unitCost: lineUnitCost(line, item), unitType: item.unitType || "unit" };
  }

  const [createdVariant] = await db.select({
    id: inventoryStockItems.id,
    costPrice: inventoryStockItems.costPrice,
    unitType: inventoryStockItems.unitType,
  })
    .from(inventoryStockItems)
    .where(and(...stockItemTenantConditions(ctx,
      eq(inventoryStockItems.branchId, branchId),
      eq(inventoryStockItems.code, variantCode),
    )))
    .limit(1);

  if (!createdVariant?.id) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stock variant was created but could not be reloaded." });
  }

  return {
    stockItemId: createdVariant.id,
    unitCost: createdVariant.costPrice || lineUnitCost(line, item),
    unitType: createdVariant.unitType || item.unitType || "unit",
  };
}

export const stocktakeRouter = router({
  // ─── Stocktakes CRUD ─────────────────────────────────────────────────────
  list: protectedProcedure.input(z.object({
    branchId: z.number().optional(),
    status: z.enum(["in_progress", "review", "pending_approval", "finalised", "cancelled"]).optional(),
  }).optional()).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const conditions: any[] = [];
    if (input?.branchId) {
      await requireBranchAccess(db, ctx, input.branchId);
      conditions.push(eq(stocktakes.branchId, input.branchId));
    }
    if (input?.status) conditions.push(eq(stocktakes.status, input.status));

    return db.select().from(stocktakes)
      .where(and(...stocktakeTenantConditions(ctx, ...conditions)))
      .orderBy(desc(stocktakes.createdAt));
  }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);

    const lines = await db.select().from(stocktakeLines)
      .where(eq(stocktakeLines.stocktakeId, input.id))
      .orderBy(stocktakeLines.stockItemId, stocktakeLines.id);

    // Get stock item details for each line
    const itemIds = lines.map(l => l.stockItemId);
    let itemsMap: Record<number, any> = {};
    if (itemIds.length) {
      const items = await db.select().from(inventoryStockItems)
        .where(and(...stockItemTenantConditions(ctx, inArray(inventoryStockItems.id, itemIds))));
      itemsMap = Object.fromEntries(items.map(i => [i.id, i]));

      const productIds = Array.from(new Set(items
        .map((i: any) => Number(i.manufacturingCatalogueProductId))
        .filter((id: number) => Number.isFinite(id) && id > 0)));
      if (productIds.length) {
        try {
          const [productsResult] = await db.execute(sql`
            SELECT id, category, subGroup, colour
            FROM manufacturing_catalogue_products
            WHERE id IN (${sql.join(productIds, sql`,`)})
              AND ${manufacturingCatalogueTenantSql(ctx)}
          `);
          const productMap = Object.fromEntries(rowsFromExecuteResult(productsResult).map((p: any) => [Number(p.id), p]));
          items.forEach((item: any) => {
            const product = productMap[Number(item.manufacturingCatalogueProductId)];
            if (product && itemsMap[item.id]) {
              itemsMap[item.id] = {
                ...itemsMap[item.id],
                catalogueCategory: product.category || "",
                catalogueSubGroup: product.subGroup || "",
                catalogueColour: product.colour || "",
              };
            }
          });
        } catch (error) {
          console.warn("Unable to enrich stocktake lines with manufacturing catalogue metadata", error);
        }
      }
    }

    return {
      ...stocktake,
      lines: lines.map(l => ({
        ...l,
        actualSize: decimalToNumber(l.actualSize),
        actualWidth: decimalToNumber(l.actualWidth),
        actualHeight: decimalToNumber(l.actualHeight),
        sourceFullLength: decimalToNumber(l.sourceFullLength),
        sourceFullWidth: decimalToNumber(l.sourceFullWidth),
        sourceFullHeight: decimalToNumber(l.sourceFullHeight),
        systemQty: decimalToNumber(l.systemQty) ?? 0,
        countedQty: decimalToNumber(l.countedQty),
        variance: decimalToNumber(l.variance) ?? 0,
        unitCost: decimalToNumber(l.unitCost) ?? 0,
        varianceValue: decimalToNumber(l.varianceValue) ?? 0,
        stockItem: itemsMap[l.stockItemId] || null,
      })),
    };
  }),

  // Create a new stocktake - generates lines from all active stock items for the branch
  create: protectedProcedure.input(z.object({
    branchId: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireBranchAccess(db, ctx, input.branchId);

    const stocktakeNumber = `ST-${Date.now().toString(36).toUpperCase()}`;

    // Get all active stock items for this branch
    const items = await db.select().from(inventoryStockItems)
      .where(and(...stockItemTenantConditions(ctx,
        eq(inventoryStockItems.isActive, true),
        eq(inventoryStockItems.branchId, input.branchId)
      )));

    // Calculate system qty for each item
    const lineData: Array<{
      stockItemId: number;
      conditionIndicator: "new" | "damaged" | "off_cut";
      colour: string | null;
      actualSize: string | null;
      actualWidth: string | null;
      actualHeight: string | null;
      sourceFullLength: string | null;
      sourceFullWidth: string | null;
      sourceFullHeight: string | null;
      systemQty: string;
      unitCost: string;
    }> = [];
    for (const item of items) {
      const [result] = await db.select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase_return', 'allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
      }).from(inventoryMovements)
        .where(and(...movementTenantConditions(ctx,
          eq(inventoryMovements.stockItemId, item.id),
          eq(inventoryMovements.branchId, input.branchId)
        )));

      const onHand = Number(result.totalIn) - Number(result.totalOut);
      lineData.push({
        stockItemId: item.id,
        conditionIndicator: item.conditionIndicator || "new",
        colour: stockItemBaseColour(item),
        actualSize: item.actualSize || null,
        actualWidth: item.actualWidth || null,
        actualHeight: item.actualHeight || null,
        sourceFullLength: item.sourceFullLength || null,
        sourceFullWidth: item.sourceFullWidth || null,
        sourceFullHeight: item.sourceFullHeight || null,
        systemQty: String(onHand),
        unitCost: item.costPrice || "0",
      });
    }

    // Create stocktake
    const [result] = await db.insert(stocktakes).values({
      tenantId: tenantIdFromContext(ctx),
      stocktakeNumber,
      branchId: input.branchId,
      status: "in_progress",
      createdBy: ctx.user?.name || null,
      notes: input.notes || null,
      totalItems: items.length,
      itemsCounted: 0,
    });

    const stocktakeId = Number(result.insertId);

    // Create lines
    if (lineData.length) {
      await db.insert(stocktakeLines).values(lineData.map(l => ({
        stocktakeId,
        stockItemId: l.stockItemId,
        conditionIndicator: l.conditionIndicator,
        colour: l.colour,
        actualSize: l.actualSize,
        actualWidth: l.actualWidth,
        actualHeight: l.actualHeight,
        sourceFullLength: l.sourceFullLength,
        sourceFullWidth: l.sourceFullWidth,
        sourceFullHeight: l.sourceFullHeight,
        systemQty: l.systemQty,
        unitCost: l.unitCost,
      })));
    }

    return { id: stocktakeId, stocktakeNumber, totalItems: items.length };
  }),

  addCountLine: protectedProcedure.input(z.object({
    stocktakeId: z.number(),
    sourceLineId: z.number(),
    notes: z.string().optional(),
    conditionIndicator: z.enum(["new", "damaged", "off_cut"]).optional(),
    colour: z.string().nullable().optional(),
    actualSize: z.string().nullable().optional(),
    actualWidth: z.string().nullable().optional(),
    actualHeight: z.string().nullable().optional(),
    sourceFullLength: z.string().nullable().optional(),
    sourceFullWidth: z.string().nullable().optional(),
    sourceFullHeight: z.string().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.stocktakeId);
    if (stocktake.status !== "in_progress") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Additional count lines can only be added to an in-progress stocktake." });
    }

    const [sourceLine] = await db.select().from(stocktakeLines).where(and(
      eq(stocktakeLines.id, input.sourceLineId),
      eq(stocktakeLines.stocktakeId, input.stocktakeId)
    )).limit(1);
    if (!sourceLine) throw new TRPCError({ code: "NOT_FOUND", message: "Source stocktake line not found" });
    await requireStockItemAccess(db, ctx, sourceLine.stockItemId);

    const [result] = await db.insert(stocktakeLines).values({
      stocktakeId: input.stocktakeId,
      stockItemId: sourceLine.stockItemId,
      conditionIndicator: input.conditionIndicator || sourceLine.conditionIndicator || "new",
      colour: input.colour !== undefined ? nullableText(input.colour) : sourceLine.colour || null,
      actualSize: input.actualSize !== undefined ? nullableDecimal(input.actualSize) : sourceLine.actualSize || null,
      actualWidth: input.actualWidth !== undefined ? nullableDecimal(input.actualWidth) : sourceLine.actualWidth || null,
      actualHeight: input.actualHeight !== undefined ? nullableDecimal(input.actualHeight) : sourceLine.actualHeight || null,
      sourceFullLength: input.sourceFullLength !== undefined ? nullableDecimal(input.sourceFullLength) : sourceLine.sourceFullLength || null,
      sourceFullWidth: input.sourceFullWidth !== undefined ? nullableDecimal(input.sourceFullWidth) : sourceLine.sourceFullWidth || null,
      sourceFullHeight: input.sourceFullHeight !== undefined ? nullableDecimal(input.sourceFullHeight) : sourceLine.sourceFullHeight || null,
      systemQty: "0",
      unitCost: sourceLine.unitCost || "0",
      notes: input.notes || "Additional count line",
    });

    await db.update(stocktakes).set({
      totalItems: sql`${stocktakes.totalItems} + 1`,
    }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.stocktakeId))));

    return { success: true, id: Number(result.insertId) };
  }),

  // Update counted quantities for lines
  updateCounts: protectedProcedure.input(z.object({
    stocktakeId: z.number(),
    counts: z.array(z.object({
      lineId: z.number(),
      countedQty: z.string().optional(),
      notes: z.string().optional(),
      conditionIndicator: z.enum(["new", "damaged", "off_cut"]).optional(),
      colour: z.string().nullable().optional(),
      actualSize: z.string().nullable().optional(),
      actualWidth: z.string().nullable().optional(),
      actualHeight: z.string().nullable().optional(),
      sourceFullLength: z.string().nullable().optional(),
      sourceFullWidth: z.string().nullable().optional(),
      sourceFullHeight: z.string().nullable().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireStocktakeAccess(db, ctx, input.stocktakeId);

    for (const count of input.counts) {
      const [line] = await db.select().from(stocktakeLines).where(and(
        eq(stocktakeLines.id, count.lineId),
        eq(stocktakeLines.stocktakeId, input.stocktakeId)
      ));
      if (!line) continue;

      const updates: any = {};
      const countedQty = nullableText(count.countedQty);
      if (countedQty != null) {
        const numeric = Number(countedQty);
        if (!Number.isFinite(numeric)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid counted quantity." });
        }
        updates.countedQty = String(numeric);
        updates.countedAt = new Date();
        updates.countedBy = ctx.user?.name || null;
      }
      if (count.notes !== undefined) {
        updates.notes = count.notes || null;
      }
      if (count.conditionIndicator !== undefined) updates.conditionIndicator = count.conditionIndicator;
      if (count.colour !== undefined) updates.colour = nullableText(count.colour);
      if (count.actualSize !== undefined) updates.actualSize = nullableDecimal(count.actualSize);
      if (count.actualWidth !== undefined) updates.actualWidth = nullableDecimal(count.actualWidth);
      if (count.actualHeight !== undefined) updates.actualHeight = nullableDecimal(count.actualHeight);
      if (count.sourceFullLength !== undefined) updates.sourceFullLength = nullableDecimal(count.sourceFullLength);
      if (count.sourceFullWidth !== undefined) updates.sourceFullWidth = nullableDecimal(count.sourceFullWidth);
      if (count.sourceFullHeight !== undefined) updates.sourceFullHeight = nullableDecimal(count.sourceFullHeight);

      const shouldRecalculateVariance = updates.countedQty !== undefined
        || updates.conditionIndicator !== undefined
        || updates.actualSize !== undefined
        || updates.actualWidth !== undefined
        || updates.actualHeight !== undefined
        || updates.sourceFullLength !== undefined
        || updates.sourceFullWidth !== undefined
        || updates.sourceFullHeight !== undefined;
      const nextCountedQty = updates.countedQty !== undefined
        ? decimalToNumber(updates.countedQty)
        : shouldRecalculateVariance
          ? decimalToNumber(line.countedQty)
          : null;
      if (nextCountedQty != null) {
        const variance = nextCountedQty - (decimalToNumber(line.systemQty) ?? 0);
        const nextCondition = updates.conditionIndicator ?? line.conditionIndicator;
        let unitCost = decimalToNumber(line.unitCost) ?? 0;
        const nextUnitCost = decimalToNumber(proRataUnitCost({
          baseCost: unitCost,
          conditionIndicator: nextCondition,
          actualSize: updates.actualSize ?? line.actualSize,
          actualWidth: updates.actualWidth ?? line.actualWidth,
          actualHeight: updates.actualHeight ?? line.actualHeight,
          sourceFullLength: updates.sourceFullLength ?? line.sourceFullLength,
          sourceFullWidth: updates.sourceFullWidth ?? line.sourceFullWidth,
          sourceFullHeight: updates.sourceFullHeight ?? line.sourceFullHeight,
        }));
        if (nextUnitCost != null) unitCost = nextUnitCost;
        updates.variance = variance.toFixed(4);
        updates.varianceValue = (variance * unitCost).toFixed(4);
      }

      if (Object.keys(updates).length) {
        await db.update(stocktakeLines).set(updates).where(and(
          eq(stocktakeLines.id, count.lineId),
          eq(stocktakeLines.stocktakeId, input.stocktakeId)
        ));
      }
    }

    // Update items counted
    const [countResult] = await db.select({
      counted: sql<number>`COUNT(CASE WHEN ${stocktakeLines.countedQty} IS NOT NULL THEN 1 END)`,
    }).from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, input.stocktakeId));

    await db.update(stocktakes).set({
      itemsCounted: countResult.counted || 0,
    }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.stocktakeId))));

    return { success: true, itemsCounted: countResult.counted || 0 };
  }),

  // Move to review status - checks variance threshold for approval routing
  submitForReview: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);

    // Calculate total variance value
    const [totals] = await db.select({
      totalVariance: sql<string>`COALESCE(SUM(ABS(${stocktakeLines.varianceValue})), 0)`,
    }).from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, input.id));

    const totalVariance = Math.abs(parseFloat(totals.totalVariance || "0"));
    const thresholdValue = parseFloat(stocktake.varianceThresholdValue || "500");

    // If variance exceeds threshold, route to pending_approval
    const needsApproval = totalVariance > thresholdValue;

    await db.update(stocktakes).set({
      status: needsApproval ? "pending_approval" : "review",
      totalVarianceValue: String(totalVariance),
      approvalStatus: needsApproval ? "pending" : "not_required",
    } as any).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true, needsApproval, totalVariance, thresholdValue };
  }),

  // Approve a stocktake that exceeded variance threshold
  approve: protectedProcedure.input(z.object({
    id: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if ((stocktake as any).approvalStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake is not pending approval" });

    await db.update(stocktakes).set({
      status: "review",
      approvalStatus: "approved",
      approvedBy: ctx.user?.id || null,
      approvedAt: new Date(),
      approvalNotes: input.notes || null,
    } as any).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true };
  }),

  // Reject a stocktake that exceeded variance threshold
  reject: protectedProcedure.input(z.object({
    id: z.number(),
    notes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if ((stocktake as any).approvalStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake is not pending approval" });

    await db.update(stocktakes).set({
      status: "cancelled",
      approvalStatus: "rejected",
      approvedBy: ctx.user?.id || null,
      approvedAt: new Date(),
      approvalNotes: input.notes || null,
    } as any).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true };
  }),

  // Update variance thresholds for a stocktake
  updateThresholds: protectedProcedure.input(z.object({
    id: z.number(),
    varianceThresholdPct: z.number().min(0).max(100).optional(),
    varianceThresholdValue: z.number().min(0).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireStocktakeAccess(db, ctx, input.id);

    const updates: any = {};
    if (input.varianceThresholdPct !== undefined) updates.varianceThresholdPct = String(input.varianceThresholdPct);
    if (input.varianceThresholdValue !== undefined) updates.varianceThresholdValue = String(input.varianceThresholdValue);

    await db.update(stocktakes).set(updates).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));
    return { success: true };
  }),

  // List stocktakes pending approval
  pendingApprovals: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(stocktakes)
      .where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.status, "pending_approval"))))
      .orderBy(desc(stocktakes.createdAt));
  }),

  // Finalise stocktake - creates waste adjustment movements for all variances
  finalise: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if (stocktake.status !== "review" && stocktake.status !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake must be in review or approved status to finalise" });
    // If pending approval, check it's been approved
    if (stocktake.status === "pending_approval" && (stocktake as any).approvalStatus !== "approved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Stocktake requires approval before finalising" });
    }

    // Get all lines with variance
    const lines = await db.select().from(stocktakeLines)
      .where(and(
        eq(stocktakeLines.stocktakeId, input.id),
        sql`${stocktakeLines.variance} != 0`,
        sql`${stocktakeLines.countedQty} IS NOT NULL`
      ));

    // Create adjustment movements for each variance
    for (const line of lines) {
      const variance = parseFloat(line.variance || "0");
      if (variance === 0) continue;

      // Negative variance = stock missing = waste adjustment (subtract)
      // Positive variance = stock found = purchase adjustment (add)
      const movementType = variance < 0 ? "adjustment_waste" : "purchase";
      const quantity = Math.abs(variance);

      const resolvedItem = await resolveStocktakeMovementStockItem(db, ctx, line, stocktake.branchId!);
      await db.insert(inventoryMovements).values({
        tenantId: tenantIdFromContext(ctx),
        stockItemId: resolvedItem.stockItemId,
        branchId: stocktake.branchId!,
        movementType,
        quantity: String(quantity),
        unitType: resolvedItem.unitType,
        referenceType: "stocktake",
        referenceId: stocktake.id,
        notes: `Stocktake ${stocktake.stocktakeNumber} adjustment (${stocktakeLineDescriptor(line)})`,
        unitCostAtTime: resolvedItem.unitCost,
        createdBy: ctx.user?.name || null,
      });

      // Mark line as adjustment created
      await db.update(stocktakeLines).set({ adjustmentCreated: true }).where(eq(stocktakeLines.id, line.id));
    }

    // Finalise the stocktake
    await db.update(stocktakes).set({
      status: "finalised",
      completedAt: new Date(),
      finalisedBy: ctx.user?.name || null,
    }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));

    return { success: true, adjustmentsCreated: lines.length };
  }),

  // Cancel a stocktake
  cancel: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireStocktakeAccess(db, ctx, input.id);
    await db.update(stocktakes).set({ status: "cancelled" }).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));
    return { success: true };
  }),

  // Permanently delete a stocktake and its count lines. Finalised stocktakes are retained for audit integrity.
  deleteStocktake: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Super Admin access required to delete stocktakes." });
    }

    const db = await requireDb();
    const stocktake = await requireStocktakeAccess(db, ctx, input.id);
    if (stocktake.status === "finalised") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Finalised stocktakes cannot be deleted because they may have posted inventory movements.",
      });
    }

    await db.delete(stocktakeLines).where(eq(stocktakeLines.stocktakeId, input.id));
    await db.delete(stocktakes).where(and(...stocktakeTenantConditions(ctx, eq(stocktakes.id, input.id))));
    return { success: true };
  }),

  // ─── Low Stock Alerts ─────────────────────────────────────────────────────
  lowStockCheck: protectedProcedure.input(z.object({
    sendEmail: z.boolean().optional().default(false),
    recipientEmail: z.string().email().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();

    // Get all items with reorder qty set
    const items = await db.select().from(inventoryStockItems)
      .where(and(...stockItemTenantConditions(ctx,
        eq(inventoryStockItems.isActive, true),
        sql`${inventoryStockItems.reorderQty} IS NOT NULL`
      )));

    const alerts: Array<{
      id: number; code: string; name: string; category: string;
      branchId: number | null; onHand: number; reorderQty: number; deficit: number;
    }> = [];

    for (const item of items) {
      const branchConditions: any[] = [eq(inventoryMovements.stockItemId, item.id)];
      if (item.branchId) branchConditions.push(eq(inventoryMovements.branchId, item.branchId));

      const [result] = await db.select({
        totalIn: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase', 'transfer_in') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
        totalOut: sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.movementType} IN ('purchase_return', 'allocation', 'manufacture_use', 'adjustment_waste', 'transfer_out') THEN ${inventoryMovements.quantity} ELSE 0 END), 0)`,
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

    // Send email if requested
    if (input.sendEmail && alerts.length > 0 && input.recipientEmail) {
      const htmlBody = `
        <h2>Low Stock Alert - ${alerts.length} items below reorder level</h2>
        <p>The following inventory items are below their reorder quantities and require replenishment:</p>
        <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Code</th>
              <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Item</th>
              <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: left;">Category</th>
              <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">On Hand</th>
              <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Reorder Qty</th>
              <th style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">Deficit</th>
            </tr>
          </thead>
          <tbody>
            ${alerts.sort((a, b) => b.deficit - a.deficit).map(a => `
              <tr>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.code}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.name}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${a.category}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; color: ${a.onHand <= 0 ? '#dc2626' : '#d97706'};">${a.onHand}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right;">${a.reorderQty}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">${a.deficit}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p style="margin-top: 16px; color: #6b7280; font-size: 12px;">This is an automated alert from the AltaSpan Inventory Management System.</p>
      `;

      await sendNotificationEmail({
        to: input.recipientEmail,
        subject: `⚠️ Low Stock Alert: ${alerts.length} items below reorder level`,
        htmlBody,
        fromName: "AltaSpan Inventory",
      });

      // Update last alert sent timestamp
      const alertItemIds = alerts.map(a => a.id);
      if (alertItemIds.length) {
        await db.update(inventoryStockItems).set({
          lastLowStockAlertAt: new Date(),
        } as any).where(and(...stockItemTenantConditions(ctx, inArray(inventoryStockItems.id, alertItemIds))));
      }
    }

    return { alerts, totalAlerts: alerts.length, emailSent: input.sendEmail && alerts.length > 0 };
  }),

  // ─── Route Optimisation ───────────────────────────────────────────────────
  optimiseRoute: protectedProcedure.input(z.object({
    driverToken: z.string().optional(),
    addresses: z.array(z.object({
      id: z.number(),
      address: z.string(),
    })).min(2),
    startAddress: z.string().optional(),
  })).mutation(async ({ input }) => {
    const { addresses, startAddress } = input;

    // Use the first address as origin if no start address provided
    const origin = startAddress || addresses[0].address;
    const destinations = addresses.map(a => a.address);

    try {
      // Get distance matrix from origin to all destinations
      const matrixResult = await makeRequest<DistanceMatrixResult>(
        "/maps/api/distancematrix/json",
        {
          origins: origin,
          destinations: destinations.join("|"),
          mode: "driving",
          units: "metric",
        }
      );

      if (matrixResult.status !== "OK") {
        throw new Error(`Distance Matrix API error: ${matrixResult.status}`);
      }

      // Nearest-neighbour algorithm for route optimisation
      const n = addresses.length;
      const visited = new Set<number>();
      const optimisedOrder: number[] = [];

      // Find the nearest unvisited destination from origin
      let currentRow = matrixResult.rows[0];
      let elements = currentRow.elements;

      // Start with the nearest destination from origin
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let i = 0; i < elements.length; i++) {
        if (elements[i].status === "OK" && elements[i].distance.value < nearestDist) {
          nearestDist = elements[i].distance.value;
          nearestIdx = i;
        }
      }

      if (nearestIdx >= 0) {
        optimisedOrder.push(nearestIdx);
        visited.add(nearestIdx);
      }

      // For remaining stops, get inter-destination distances
      // Use a simple greedy approach: from each stop, go to the nearest unvisited
      while (optimisedOrder.length < n) {
        const lastIdx = optimisedOrder[optimisedOrder.length - 1];
        const lastAddress = addresses[lastIdx].address;

        // Get distances from last stop to all remaining
        const remaining = addresses.filter((_, i) => !visited.has(i));
        if (!remaining.length) break;

        const remainingAddresses = remaining.map(a => a.address);
        const subMatrix = await makeRequest<DistanceMatrixResult>(
          "/maps/api/distancematrix/json",
          {
            origins: lastAddress,
            destinations: remainingAddresses.join("|"),
            mode: "driving",
            units: "metric",
          }
        );

        if (subMatrix.status === "OK" && subMatrix.rows[0]) {
          let bestIdx = -1;
          let bestDist = Infinity;
          const subElements = subMatrix.rows[0].elements;

          for (let i = 0; i < subElements.length; i++) {
            if (subElements[i].status === "OK" && subElements[i].distance.value < bestDist) {
              bestDist = subElements[i].distance.value;
              bestIdx = i;
            }
          }

          if (bestIdx >= 0) {
            // Map back to original index
            const originalIdx = addresses.findIndex(a => a.address === remaining[bestIdx].address);
            if (originalIdx >= 0) {
              optimisedOrder.push(originalIdx);
              visited.add(originalIdx);
            }
          }
        } else {
          // If API fails for sub-route, just append remaining in order
          for (let i = 0; i < n; i++) {
            if (!visited.has(i)) {
              optimisedOrder.push(i);
              visited.add(i);
            }
          }
          break;
        }
      }

      // Add any missed items
      for (let i = 0; i < n; i++) {
        if (!visited.has(i)) optimisedOrder.push(i);
      }

      // Build result with distances
      const optimisedAddresses = optimisedOrder.map((idx, pos) => ({
        ...addresses[idx],
        order: pos + 1,
        distanceFromPrevious: pos === 0
          ? matrixResult.rows[0].elements[idx]?.distance?.text || "N/A"
          : undefined,
      }));

      // Calculate total estimated distance/time
      const totalDistance = matrixResult.rows[0].elements
        .filter((_, i) => optimisedOrder.includes(i))
        .reduce((sum, el) => sum + (el.status === "OK" ? el.distance.value : 0), 0);

      return {
        optimisedOrder: optimisedAddresses,
        totalDistanceMeters: totalDistance,
        totalDistanceText: `${(totalDistance / 1000).toFixed(1)} km`,
        stopsCount: n,
      };
    } catch (err: any) {
      console.error("[RouteOptimise] Error:", err.message);
      // Fallback: return original order
      return {
        optimisedOrder: addresses.map((a, i) => ({ ...a, order: i + 1 })),
        totalDistanceMeters: 0,
        totalDistanceText: "Unable to calculate",
        stopsCount: addresses.length,
        error: err.message,
      };
    }
  }),
});
