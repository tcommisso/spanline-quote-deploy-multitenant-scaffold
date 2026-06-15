import { eq, and, asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { specMappings, specMappingHistory, quoteItems, products } from "../drizzle/schema";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

// ─── Spec Mappings CRUD ─────────────────────────────────────────────────────

export async function listSpecMappings() {
  return db.select().from(specMappings).orderBy(asc(specMappings.sortOrder), asc(specMappings.id));
}

export async function getActiveSpecMappings() {
  return db.select().from(specMappings).where(eq(specMappings.active, true)).orderBy(asc(specMappings.sortOrder));
}

export async function getSpecMapping(id: number) {
  const [row] = await db.select().from(specMappings).where(eq(specMappings.id, id));
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
}) {
  const [result] = await db.insert(specMappings).values(data as any);
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
}>) {
  await db.update(specMappings).set(data as any).where(eq(specMappings.id, id));
}

export async function deleteSpecMapping(id: number) {
  await db.delete(specMappings).where(eq(specMappings.id, id));
}

// ─── Spec Mapping History ──────────────────────────────────────────────────

export async function logMappingChange(data: {
  mappingId: number;
  userId?: number | null;
  userName?: string | null;
  action: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }> | null;
  snapshot?: Record<string, any> | null;
}) {
  await db.insert(specMappingHistory).values(data as any);
}

export async function getMappingHistory(mappingId: number) {
  return db.select().from(specMappingHistory)
    .where(eq(specMappingHistory.mappingId, mappingId))
    .orderBy(desc(specMappingHistory.createdAt));
}

export async function getAllMappingHistory(limit = 50) {
  return db.select().from(specMappingHistory)
    .orderBy(desc(specMappingHistory.createdAt))
    .limit(limit);
}

// ─── Quote Items CRUD ───────────────────────────────────────────────────────

export async function getQuoteItems(quoteId: number) {
  return db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId)).orderBy(asc(quoteItems.sortOrder), asc(quoteItems.id));
}

export async function getAutoItems(quoteId: number) {
  return db.select().from(quoteItems).where(
    and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "auto"))
  );
}

export async function getManualItems(quoteId: number) {
  return db.select().from(quoteItems).where(
    and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "manual"))
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
  uom?: string | null;
  qty: number | string;
  costRate: number | string;
  sellRate: number | string;
  needsConfirmation?: boolean;
  notes?: string | null;
  sortOrder?: number;
}) {
  const [result] = await db.insert(quoteItems).values({
    ...data,
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
  uom?: string | null;
  qty: number | string;
  costRate: number | string;
  sellRate: number | string;
  needsConfirmation?: boolean;
  notes?: string | null;
  sortOrder?: number;
}>) {
  if (items.length === 0) return;
  const values = items.map((item, idx) => ({
    ...item,
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
}>) {
  const updateData: any = { ...data };
  if (data.qty !== undefined) updateData.qty = String(data.qty);
  if (data.costRate !== undefined) updateData.costRate = String(data.costRate);
  if (data.sellRate !== undefined) updateData.sellRate = String(data.sellRate);
  await db.update(quoteItems).set(updateData).where(eq(quoteItems.id, id));
}

export async function deleteQuoteItem(id: number) {
  await db.delete(quoteItems).where(eq(quoteItems.id, id));
}

export async function deleteAutoItems(quoteId: number) {
  await db.delete(quoteItems).where(
    and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "auto"))
  );
}

export async function flagManualItemsForConfirmation(quoteId: number) {
  await db.update(quoteItems)
    .set({ needsConfirmation: true })
    .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.source, "manual")));
}

export async function confirmQuoteItem(id: number) {
  await db.update(quoteItems).set({ needsConfirmation: false }).where(eq(quoteItems.id, id));
}

export async function confirmAllItems(quoteId: number) {
  await db.update(quoteItems).set({ needsConfirmation: false }).where(eq(quoteItems.quoteId, quoteId));
}

// ─── Product Lookup ─────────────────────────────────────────────────────────

export async function getAllProducts() {
  return db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.tabName), asc(products.sortOrder));
}
