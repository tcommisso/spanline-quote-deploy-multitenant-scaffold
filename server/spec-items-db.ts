import { eq, and, asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { specMappings, specMappingHistory, quoteItems, products, windowDoorOptionModifiers } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";
import { appendPrivateTenantScope } from "./private-tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

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

export async function createQuoteItem(data: {
  quoteId: number;
  source: "auto" | "manual";
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
}, tenantId?: number | null) {
  const [result] = await db.insert(quoteItems).values({
    ...data,
    tenantId,
    qty: String(data.qty),
    costRate: String(data.costRate),
    sellRate: String(data.sellRate),
  } as any);
  return result.insertId;
}

export async function createQuoteItemsBatch(items: Array<{
  quoteId: number;
  source: "auto" | "manual";
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
}>, tenantId?: number | null) {
  if (items.length === 0) return;
  const values = items.map((item, idx) => ({
    ...item,
    tenantId,
    qty: String(item.qty),
    costRate: String(item.costRate),
    sellRate: String(item.sellRate),
    sortOrder: item.sortOrder ?? idx,
  }));
  await db.insert(quoteItems).values(values as any);
}

export async function updateQuoteItem(id: number, data: Partial<{
  description: string;
  colour: string | null;
  uom: string | null;
  qty: number | string;
  costRate: number | string;
  sellRate: number | string;
  needsConfirmation: boolean;
  notes: string | null;
  sortOrder: number;
  source: "auto" | "manual";
}>, tenantId?: number | null) {
  const updateData: any = { ...data };
  if (data.qty !== undefined) updateData.qty = String(data.qty);
  if (data.costRate !== undefined) updateData.costRate = String(data.costRate);
  if (data.sellRate !== undefined) updateData.sellRate = String(data.sellRate);
  await db.update(quoteItems).set(updateData)
    .where(await withTenant([eq(quoteItems.id, id)], quoteItems.tenantId, tenantId));
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
  return db.select().from(windowDoorOptionModifiers)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(windowDoorOptionModifiers.productType), asc(windowDoorOptionModifiers.optionGroup), asc(windowDoorOptionModifiers.sortOrder), asc(windowDoorOptionModifiers.id));
}

export async function getActiveWindowDoorOptionModifiers(tenantId?: number | null) {
  return db.select().from(windowDoorOptionModifiers)
    .where(await withTenant([eq(windowDoorOptionModifiers.active, true)], windowDoorOptionModifiers.tenantId, tenantId))
    .orderBy(asc(windowDoorOptionModifiers.productType), asc(windowDoorOptionModifiers.optionGroup), asc(windowDoorOptionModifiers.sortOrder));
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
  const [result] = await db.insert(windowDoorOptionModifiers).values({
    ...data,
    tenantId,
    costAdjustmentValue: String(data.costAdjustmentValue ?? "0"),
    sellAdjustmentValue: String(data.sellAdjustmentValue ?? "0"),
  } as any);
  return result.insertId;
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
  await db.update(windowDoorOptionModifiers).set(updateData)
    .where(await withTenant([eq(windowDoorOptionModifiers.id, id)], windowDoorOptionModifiers.tenantId, tenantId));
}

export async function deleteWindowDoorOptionModifier(id: number, tenantId?: number | null) {
  await db.delete(windowDoorOptionModifiers)
    .where(await withTenant([eq(windowDoorOptionModifiers.id, id)], windowDoorOptionModifiers.tenantId, tenantId));
}
