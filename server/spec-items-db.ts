import { eq, and, asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { specMappings, specMappingHistory, quoteItems, products, windowDoorOptionModifiers } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";
import { appendPrivateTenantScope } from "./private-tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

function flattenErrorText(error: unknown): string {
  const visited = new Set<unknown>();
  const parts: string[] = [];

  const collect = (value: unknown) => {
    if (!value || visited.has(value)) return;
    visited.add(value);

    if (typeof value === "string") {
      parts.push(value);
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    for (const key of ["message", "code", "errno", "sqlMessage", "sql", "query"]) {
      const field = record[key];
      if (typeof field === "string" || typeof field === "number") {
        parts.push(String(field));
      }
    }

    collect(record.cause);
    collect(record.error);
    collect(record.originalError);
  };

  collect(error);
  return parts.join(" \n").toLowerCase();
}

function isMissingWindowDoorOptionModifierSchema(error: unknown): boolean {
  const text = flattenErrorText(error);
  if (!text.includes("window_door_option_modifiers")) return false;
  if (
    text.includes("access denied") ||
    text.includes("command denied") ||
    text.includes("permission") ||
    text.includes("econn") ||
    text.includes("timeout") ||
    text.includes("too many connections") ||
    text.includes("deadlock") ||
    text.includes("lock wait")
  ) {
    return false;
  }

  return (
    text.includes("er_no_such_table") ||
    text.includes("doesn't exist") ||
    text.includes("does not exist") ||
    text.includes("unknown table") ||
    text.includes("er_bad_field_error") ||
    text.includes("unknown column") ||
    text.includes("failed query: select")
  );
}

async function fallbackEmptyWindowDoorOptionModifiers<T>(operation: () => Promise<T[]>): Promise<T[]> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingWindowDoorOptionModifierSchema(error)) {
      console.warn(
        "[spec-items] window_door_option_modifiers schema is not available; continuing without window/door option modifiers."
      );
      return [];
    }
    throw error;
  }
}

async function withTenant(conditions: any[], column: any, tenantId?: number | null) {
  await appendPrivateTenantScope(conditions, column, tenantId);
  return and(...conditions);
}

// ─── Spec Mappings CRUD ─────────────────────────────────────────────────────

export async function listSpecMappings(tenantId?: number | null) {
  const conditions: any[] = [];
  await appendPrivateTenantScope(conditions, specMappings.tenantId, tenantId);
  return db.select().from(specMappings)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(specMappings.sortOrder), asc(specMappings.id));
}

export async function getActiveSpecMappings(tenantId?: number | null) {
  return db.select().from(specMappings)
    .where(await withTenant([eq(specMappings.active, true)], specMappings.tenantId, tenantId))
    .orderBy(asc(specMappings.sortOrder));
}

export async function getSpecMapping(id: number, tenantId?: number | null) {
  const [row] = await db.select().from(specMappings)
    .where(await withTenant([eq(specMappings.id, id)], specMappings.tenantId, tenantId));
  return row || null;
}

export async function createSpecMapping(data: {
  name: string;
  tabName: string;
  specField: string;
  condition: string;
  productId?: number | null;
  productMatch?: string | null;
  qtyFormula: string;
  description?: string | null;
  colourField?: string | null;
  bottomColourField?: string | null;
  uom?: string | null;
  sortOrder?: number;
  active?: boolean;
}, tenantId?: number | null) {
  const [result] = await db.insert(specMappings).values({ ...data, tenantId } as any);
  return result.insertId;
}

export async function updateSpecMapping(id: number, data: Partial<{
  name: string;
  tabName: string;
  specField: string;
  condition: string;
  productId: number | null;
  productMatch: string | null;
  qtyFormula: string;
  description: string | null;
  colourField: string | null;
  bottomColourField: string | null;
  uom: string | null;
  sortOrder: number;
  active: boolean;
}>, tenantId?: number | null) {
  await db.update(specMappings)
    .set(data as any)
    .where(await withTenant([eq(specMappings.id, id)], specMappings.tenantId, tenantId));
}

export async function deleteSpecMapping(id: number, tenantId?: number | null) {
  await db.delete(specMappings)
    .where(await withTenant([eq(specMappings.id, id)], specMappings.tenantId, tenantId));
}

// ─── Spec Mapping History ──────────────────────────────────────────────────

export async function logMappingChange(data: {
  mappingId: number;
  userId?: number | null;
  userName?: string | null;
  action: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }> | null;
  snapshot?: Record<string, any> | null;
}, tenantId?: number | null) {
  await db.insert(specMappingHistory).values({ ...data, tenantId } as any);
}

export async function getMappingHistory(mappingId: number, tenantId?: number | null) {
  return db.select().from(specMappingHistory)
    .where(await withTenant([eq(specMappingHistory.mappingId, mappingId)], specMappingHistory.tenantId, tenantId))
    .orderBy(desc(specMappingHistory.createdAt));
}

export async function getAllMappingHistory(limit = 50, tenantId?: number | null) {
  const conditions: any[] = [];
  await appendPrivateTenantScope(conditions, specMappingHistory.tenantId, tenantId);
  return db.select().from(specMappingHistory)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(specMappingHistory.createdAt))
    .limit(limit);
}

// ─── Quote Items CRUD ───────────────────────────────────────────────────────

export async function getQuoteItems(quoteId: number, tenantId?: number | null) {
  return db.select().from(quoteItems)
    .where(await withTenant([eq(quoteItems.quoteId, quoteId)], quoteItems.tenantId, tenantId))
    .orderBy(asc(quoteItems.sortOrder), asc(quoteItems.id));
}

export async function getAutoItems(quoteId: number, tenantId?: number | null) {
  return db.select().from(quoteItems).where(
    await withTenant([eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "auto")], quoteItems.tenantId, tenantId)
  );
}

export async function getManualItems(quoteId: number, tenantId?: number | null) {
  return db.select().from(quoteItems).where(
    await withTenant([eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "manual")], quoteItems.tenantId, tenantId)
  );
}

type QuoteItemWriteData = {
  quoteId: number;
  source: "auto" | "manual";
  sourceKey?: string | null;
  sourceHash?: string | null;
  specMappingId?: number | null;
  productId?: number | null;
  tabName: string;
  description: string;
  colour?: string | null;
  bottomColour?: string | null;
  uom?: string | null;
  qty: number | string;
  costRate: number | string;
  sellRate: number | string;
  needsConfirmation?: boolean;
  notes?: string | null;
  sortOrder?: number;
};

function normalizeQuoteItemSourceKey(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, 191) : null;
}

function normalizeQuoteItemSourceHash(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, 64) : null;
}

function quoteItemWriteValues(data: QuoteItemWriteData, tenantId?: number | null, sortOrder?: number) {
  return {
    ...data,
    tenantId,
    sourceKey: normalizeQuoteItemSourceKey(data.sourceKey),
    sourceHash: normalizeQuoteItemSourceHash(data.sourceHash),
    qty: String(data.qty),
    costRate: String(data.costRate),
    sellRate: String(data.sellRate),
    sortOrder: data.sortOrder ?? sortOrder ?? 0,
  };
}

function normalizeDecimalForCompare(value: unknown, decimals: number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(decimals) : String(value ?? "");
}

function nullableTextForCompare(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function needsGeneratedQuoteItemUpdate(existing: typeof quoteItems.$inferSelect, next: ReturnType<typeof quoteItemWriteValues>): boolean {
  if (normalizeQuoteItemSourceKey(existing.sourceKey) !== normalizeQuoteItemSourceKey(next.sourceKey)) return true;
  if (normalizeQuoteItemSourceHash(existing.sourceHash) !== normalizeQuoteItemSourceHash(next.sourceHash)) return true;
  if (Number(existing.sortOrder ?? 0) !== Number(next.sortOrder ?? 0)) return true;
  if (existing.needsConfirmation !== false) return true;
  if (next.sourceHash) return false;

  if (Number(existing.specMappingId ?? 0) !== Number(next.specMappingId ?? 0)) return true;
  if (Number(existing.productId ?? 0) !== Number(next.productId ?? 0)) return true;
  if (nullableTextForCompare(existing.tabName) !== nullableTextForCompare(next.tabName)) return true;
  if (nullableTextForCompare(existing.description) !== nullableTextForCompare(next.description)) return true;
  if (nullableTextForCompare(existing.colour) !== nullableTextForCompare(next.colour)) return true;
  if (nullableTextForCompare(existing.bottomColour) !== nullableTextForCompare(next.bottomColour)) return true;
  if (nullableTextForCompare(existing.uom) !== nullableTextForCompare(next.uom)) return true;
  if (nullableTextForCompare(existing.notes) !== nullableTextForCompare(next.notes)) return true;
  if (normalizeDecimalForCompare(existing.qty, 3) !== normalizeDecimalForCompare(next.qty, 3)) return true;
  if (normalizeDecimalForCompare(existing.costRate, 2) !== normalizeDecimalForCompare(next.costRate, 2)) return true;
  if (normalizeDecimalForCompare(existing.sellRate, 2) !== normalizeDecimalForCompare(next.sellRate, 2)) return true;
  return false;
}

function ensureUniqueGeneratedSourceKeys(items: QuoteItemWriteData[]): QuoteItemWriteData[] {
  const seen = new Map<string, number>();
  return items.map((item, index) => {
    const baseKey = normalizeQuoteItemSourceKey(item.sourceKey) || `spec:fallback:${index}`;
    const count = seen.get(baseKey) || 0;
    seen.set(baseKey, count + 1);
    const sourceKey = count === 0 ? baseKey : `${baseKey}:db_dup_${count + 1}`;
    return {
      ...item,
      sourceKey: sourceKey.slice(0, 191),
    };
  });
}

export async function createQuoteItem(data: QuoteItemWriteData, tenantId?: number | null) {
  const [result] = await db.insert(quoteItems).values({
    ...quoteItemWriteValues(data, tenantId),
  } as any);
  return result.insertId;
}

export async function createQuoteItemsBatch(items: QuoteItemWriteData[], tenantId?: number | null) {
  if (items.length === 0) return;
  const values = items.map((item, idx) => quoteItemWriteValues(item, tenantId, idx));
  await db.insert(quoteItems).values(values as any);
}

export async function updateQuoteItem(id: number, data: Partial<{
  specMappingId: number | null;
  productId: number | null;
  tabName: string;
  description: string;
  colour: string | null;
  bottomColour: string | null;
  uom: string | null;
  qty: number | string;
  costRate: number | string;
  sellRate: number | string;
  needsConfirmation: boolean;
  notes: string | null;
  sortOrder: number;
  source: "auto" | "manual";
  sourceKey: string | null;
  sourceHash: string | null;
}>, tenantId?: number | null) {
  const updateData: any = { ...data };
  if (data.qty !== undefined) updateData.qty = String(data.qty);
  if (data.costRate !== undefined) updateData.costRate = String(data.costRate);
  if (data.sellRate !== undefined) updateData.sellRate = String(data.sellRate);
  if (data.sourceKey !== undefined) updateData.sourceKey = normalizeQuoteItemSourceKey(data.sourceKey);
  if (data.sourceHash !== undefined) updateData.sourceHash = normalizeQuoteItemSourceHash(data.sourceHash);
  await db.update(quoteItems).set(updateData)
    .where(await withTenant([eq(quoteItems.id, id)], quoteItems.tenantId, tenantId));
}

export async function reconcileAutoQuoteItems(
  quoteId: number,
  generatedItems: QuoteItemWriteData[],
  tenantId?: number | null
) {
  const existingAutoItems = await getAutoItems(quoteId, tenantId);
  const existingBySourceKey = new Map<string, typeof quoteItems.$inferSelect>();
  const deleteIds = new Set<number>();

  for (const existing of existingAutoItems) {
    const sourceKey = normalizeQuoteItemSourceKey(existing.sourceKey);
    if (!sourceKey || existingBySourceKey.has(sourceKey)) {
      deleteIds.add(existing.id);
      continue;
    }
    existingBySourceKey.set(sourceKey, existing);
  }

  const nextKeys = new Set<string>();
  let inserted = 0;
  let updated = 0;
  const generatedWithKeys = ensureUniqueGeneratedSourceKeys(generatedItems);

  for (let index = 0; index < generatedWithKeys.length; index += 1) {
    const item = generatedWithKeys[index];
    const sourceKey = normalizeQuoteItemSourceKey(item.sourceKey);
    if (!sourceKey) continue;
    nextKeys.add(sourceKey);
    const nextValues = quoteItemWriteValues(
      {
        ...item,
        quoteId,
        source: "auto",
        sourceKey,
        needsConfirmation: false,
      },
      tenantId,
      index
    );
    const existing = existingBySourceKey.get(sourceKey);
    if (!existing) {
      await db.insert(quoteItems).values(nextValues as any);
      inserted += 1;
      continue;
    }
    if (needsGeneratedQuoteItemUpdate(existing, nextValues)) {
      await updateQuoteItem(existing.id, {
        specMappingId: item.specMappingId ?? null,
        productId: item.productId ?? null,
        tabName: item.tabName,
        description: item.description,
        colour: item.colour ?? null,
        bottomColour: item.bottomColour ?? null,
        uom: item.uom ?? null,
        qty: item.qty,
        costRate: item.costRate,
        sellRate: item.sellRate,
        notes: item.notes ?? null,
        sortOrder: nextValues.sortOrder,
        needsConfirmation: false,
        sourceKey,
        sourceHash: item.sourceHash ?? null,
      }, tenantId);
      updated += 1;
    }
  }

  for (const existing of existingAutoItems) {
    const sourceKey = normalizeQuoteItemSourceKey(existing.sourceKey);
    if (sourceKey && !nextKeys.has(sourceKey)) {
      deleteIds.add(existing.id);
    }
  }

  for (const id of Array.from(deleteIds)) {
    await deleteQuoteItem(id, tenantId);
  }

  return {
    inserted,
    updated,
    deleted: deleteIds.size,
  };
}

export async function deleteQuoteItem(id: number, tenantId?: number | null) {
  await db.delete(quoteItems)
    .where(await withTenant([eq(quoteItems.id, id)], quoteItems.tenantId, tenantId));
}

export async function deleteAutoItems(quoteId: number, tenantId?: number | null) {
  await db.delete(quoteItems).where(
    await withTenant([eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "auto")], quoteItems.tenantId, tenantId)
  );
}

export async function flagManualItemsForConfirmation(quoteId: number, tenantId?: number | null) {
  await db.update(quoteItems)
    .set({ needsConfirmation: true })
    .where(await withTenant([eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "manual")], quoteItems.tenantId, tenantId));
}

export async function confirmQuoteItem(id: number, tenantId?: number | null) {
  await db.update(quoteItems).set({ needsConfirmation: false })
    .where(await withTenant([eq(quoteItems.id, id)], quoteItems.tenantId, tenantId));
}

export async function confirmAllItems(quoteId: number, tenantId?: number | null) {
  await db.update(quoteItems).set({ needsConfirmation: false })
    .where(await withTenant([eq(quoteItems.quoteId, quoteId)], quoteItems.tenantId, tenantId));
}

// ─── Product Lookup ─────────────────────────────────────────────────────────

export async function getAllProducts(tenantId?: number | null) {
  const conditions: any[] = [eq(products.active, true)];
  await appendPrivateTenantScope(conditions, products.tenantId, tenantId);
  return db.select().from(products).where(and(...conditions)).orderBy(asc(products.tabName), asc(products.sortOrder));
}

// ─── Window/Door Option Modifiers ─────────────────────────────────────────

export async function listWindowDoorOptionModifiers(tenantId?: number | null) {
  const conditions: any[] = [];
  await appendPrivateTenantScope(conditions, windowDoorOptionModifiers.tenantId, tenantId);
  return fallbackEmptyWindowDoorOptionModifiers(() =>
    db.select().from(windowDoorOptionModifiers)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(windowDoorOptionModifiers.productType), asc(windowDoorOptionModifiers.optionGroup), asc(windowDoorOptionModifiers.sortOrder), asc(windowDoorOptionModifiers.id))
  );
}

export async function getActiveWindowDoorOptionModifiers(tenantId?: number | null) {
  return fallbackEmptyWindowDoorOptionModifiers(async () =>
    db.select().from(windowDoorOptionModifiers)
      .where(await withTenant([eq(windowDoorOptionModifiers.active, true)], windowDoorOptionModifiers.tenantId, tenantId))
      .orderBy(asc(windowDoorOptionModifiers.productType), asc(windowDoorOptionModifiers.optionGroup), asc(windowDoorOptionModifiers.sortOrder))
  );
}

export async function createWindowDoorOptionModifier(data: {
  productType: "window" | "door";
  optionGroup: "glass_type" | "tint" | "obscurity" | "etched" | "screen" | "pet_door" | "other";
  optionValue: string;
  adjustmentType: "percent" | "fixed";
  costAdjustmentValue?: string | number;
  sellAdjustmentValue?: string | number;
  appliesTo?: string | null;
  label?: string | null;
  notes?: string | null;
  sortOrder?: number;
  active?: boolean;
}, tenantId?: number | null) {
  const [result] = await pool.execute(
    `INSERT INTO window_door_option_modifiers
      (tenantId, productType, optionGroup, optionValue, adjustmentType, costAdjustmentValue,
       sellAdjustmentValue, appliesTo, label, notes, sortOrder, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId ?? null,
      data.productType,
      data.optionGroup,
      data.optionValue,
      data.adjustmentType,
      String(data.costAdjustmentValue ?? "0"),
      String(data.sellAdjustmentValue ?? "0"),
      data.appliesTo?.trim() || "base_line",
      data.label ?? null,
      data.notes ?? null,
      data.sortOrder ?? 0,
      data.active ?? true,
    ]
  );
  return (result as any).insertId;
}

export async function updateWindowDoorOptionModifier(id: number, data: Partial<{
  productType: "window" | "door";
  optionGroup: "glass_type" | "tint" | "obscurity" | "etched" | "screen" | "pet_door" | "other";
  optionValue: string;
  adjustmentType: "percent" | "fixed";
  costAdjustmentValue: string | number;
  sellAdjustmentValue: string | number;
  appliesTo: string | null;
  label: string | null;
  notes: string | null;
  sortOrder: number;
  active: boolean;
}>, tenantId?: number | null) {
  const updateData: any = { ...data };
  if (data.costAdjustmentValue !== undefined) updateData.costAdjustmentValue = String(data.costAdjustmentValue);
  if (data.sellAdjustmentValue !== undefined) updateData.sellAdjustmentValue = String(data.sellAdjustmentValue);
  if (data.appliesTo !== undefined) updateData.appliesTo = data.appliesTo?.trim() || "base_line";
  if (data.label !== undefined) updateData.label = data.label ?? null;
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;
  await db.update(windowDoorOptionModifiers).set(updateData)
    .where(await withTenant([eq(windowDoorOptionModifiers.id, id)], windowDoorOptionModifiers.tenantId, tenantId));
}

export async function deleteWindowDoorOptionModifier(id: number, tenantId?: number | null) {
  await db.delete(windowDoorOptionModifiers)
    .where(await withTenant([eq(windowDoorOptionModifiers.id, id)], windowDoorOptionModifiers.tenantId, tenantId));
}
