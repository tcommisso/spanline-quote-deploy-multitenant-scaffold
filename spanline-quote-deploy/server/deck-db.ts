import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
  deckProducts,
  deckFraming,
  deckLabourRules,
  deckPricingRules,
  deckAddonItems,
  deckQuotes,
  deckAddonOverrideHistory,
  type InsertDeckProduct,
  type InsertDeckFraming,
  type InsertDeckLabourRule,
  type InsertDeckPricingRule,
  type InsertDeckAddonItem,
  type InsertDeckQuote,
  type InsertDeckAddonOverrideHistory,
} from "../drizzle/schema";

// ─── Deck Products ──────────────────────────────────────────────────────────

export async function getDeckProducts(brand?: string) {
  const db = await getDb();
  if (!db) return [];
  if (brand) {
    return db.select().from(deckProducts).where(and(eq(deckProducts.status, "active"), eq(deckProducts.brand, brand)));
  }
  return db.select().from(deckProducts).where(eq(deckProducts.status, "active"));
}

export async function getDeckProductById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(deckProducts).where(eq(deckProducts.id, id));
  return rows[0] || null;
}

export async function upsertDeckProduct(data: Omit<InsertDeckProduct, "id" | "createdAt" | "updatedAt"> & { id?: number }) {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(deckProducts).set(rest).where(eq(deckProducts.id, id));
    return getDeckProductById(id);
  }
  const [result] = await db.insert(deckProducts).values(data as InsertDeckProduct);
  return getDeckProductById(result.insertId);
}

export async function deleteDeckProduct(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(deckProducts).set({ status: "inactive" }).where(eq(deckProducts.id, id));
}

export async function updateDeckProductImage(id: number, imageUrl: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(deckProducts).set({ imageUrl }).where(eq(deckProducts.id, id));
}

// ─── Deck Framing ───────────────────────────────────────────────────────────

export async function getDeckFraming(frameType?: string) {
  const db = await getDb();
  if (!db) return [];
  if (frameType) {
    return db.select().from(deckFraming).where(and(eq(deckFraming.status, "active"), eq(deckFraming.frameType, frameType)));
  }
  return db.select().from(deckFraming).where(eq(deckFraming.status, "active"));
}

export async function upsertDeckFraming(data: Omit<InsertDeckFraming, "id" | "createdAt" | "updatedAt"> & { id?: number }) {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(deckFraming).set(rest).where(eq(deckFraming.id, id));
    const rows = await db.select().from(deckFraming).where(eq(deckFraming.id, id));
    return rows[0];
  }
  const [result] = await db.insert(deckFraming).values(data as InsertDeckFraming);
  const rows = await db.select().from(deckFraming).where(eq(deckFraming.id, result.insertId));
  return rows[0];
}

/**
 * Fetch engineering profile pricing from deck_framing table.
 * Returns a map of profile ID → price per metre for use with calculateSubfloor().
 * Maps systemName + beamSize to the profile IDs used in subfloor-calc.ts:
 *   spanmor: spanmor_40, spanmor_105, spanmor_170, spanmor_235
 *   sfs01: sfs01_140, sfs01_150, sfs01_200
 *   clickdeck: clickdeck_28, clickdeck_55, clickdeck_110
 */
export async function getEngineeringPricing(systemName: string): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select()
    .from(deckFraming)
    .where(and(eq(deckFraming.status, "active"), eq(deckFraming.systemName, systemName)));

  const overrides: Record<string, number> = {};
  for (const row of rows) {
    if (!row.beamSize || !row.pricePerLm) continue;
    // Extract the depth number from beamSize (e.g. "40x50" → 40, "140x50" → 140)
    const depthMatch = row.beamSize.match(/^(\d+)/);
    if (!depthMatch) continue;
    const depth = depthMatch[1];
    const profileId = `${systemName}_${depth}`;
    overrides[profileId] = parseFloat(row.pricePerLm);
  }
  return overrides;
}

export async function deleteDeckFraming(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(deckFraming).set({ status: "inactive" }).where(eq(deckFraming.id, id));
}

// ─── Deck Labour Rules ──────────────────────────────────────────────────────

export async function getDeckLabourRules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deckLabourRules).where(eq(deckLabourRules.active, true));
}

export async function upsertDeckLabourRule(data: Omit<InsertDeckLabourRule, "id" | "createdAt" | "updatedAt"> & { id?: number }) {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(deckLabourRules).set(rest).where(eq(deckLabourRules.id, id));
    const rows = await db.select().from(deckLabourRules).where(eq(deckLabourRules.id, id));
    return rows[0];
  }
  const [result] = await db.insert(deckLabourRules).values(data as InsertDeckLabourRule);
  const rows = await db.select().from(deckLabourRules).where(eq(deckLabourRules.id, result.insertId));
  return rows[0];
}

export async function deleteDeckLabourRule(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(deckLabourRules).set({ active: false }).where(eq(deckLabourRules.id, id));
}

// ─── Deck Pricing Rules ─────────────────────────────────────────────────────

export async function getDeckPricingRules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deckPricingRules).where(eq(deckPricingRules.active, true));
}

export async function upsertDeckPricingRule(data: Omit<InsertDeckPricingRule, "id" | "createdAt" | "updatedAt"> & { id?: number }) {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(deckPricingRules).set(rest).where(eq(deckPricingRules.id, id));
    const rows = await db.select().from(deckPricingRules).where(eq(deckPricingRules.id, id));
    return rows[0];
  }
  const [result] = await db.insert(deckPricingRules).values(data as InsertDeckPricingRule);
  const rows = await db.select().from(deckPricingRules).where(eq(deckPricingRules.id, result.insertId));
  return rows[0];
}

export async function deleteDeckPricingRule(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(deckPricingRules).set({ active: false }).where(eq(deckPricingRules.id, id));
}

// ─── Deck Add-On Items ──────────────────────────────────────────────────────

export async function getDeckAddonItems(category?: string) {
  const db = await getDb();
  if (!db) return [];
  if (category) {
    return db.select().from(deckAddonItems).where(and(eq(deckAddonItems.active, true), eq(deckAddonItems.category, category)));
  }
  return db.select().from(deckAddonItems).where(eq(deckAddonItems.active, true));
}

export async function upsertDeckAddonItem(data: Omit<InsertDeckAddonItem, "id" | "createdAt" | "updatedAt"> & { id?: number }) {
  const db = await getDb();
  if (!db) return null;
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(deckAddonItems).set(rest).where(eq(deckAddonItems.id, id));
    const rows = await db.select().from(deckAddonItems).where(eq(deckAddonItems.id, id));
    return rows[0];
  }
  const [result] = await db.insert(deckAddonItems).values(data as InsertDeckAddonItem);
  const rows = await db.select().from(deckAddonItems).where(eq(deckAddonItems.id, result.insertId));
  return rows[0];
}

export async function deleteDeckAddonItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(deckAddonItems).set({ active: false }).where(eq(deckAddonItems.id, id));
}

// ─── Deck Quotes ────────────────────────────────────────────────────────────

export async function getDeckQuotes(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (userId) {
    return db.select().from(deckQuotes).where(eq(deckQuotes.userId, userId)).orderBy(desc(deckQuotes.updatedAt));
  }
  return db.select().from(deckQuotes).orderBy(desc(deckQuotes.updatedAt));
}

export async function getDeckQuoteById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(deckQuotes).where(eq(deckQuotes.id, id));
  return rows[0] || null;
}

export async function createDeckQuote(data: Omit<InsertDeckQuote, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(deckQuotes).values(data as InsertDeckQuote);
  return getDeckQuoteById(result.insertId);
}

export async function updateDeckQuote(id: number, data: Partial<Omit<InsertDeckQuote, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(deckQuotes).set(data).where(eq(deckQuotes.id, id));
  return getDeckQuoteById(id);
}

export async function getNextDeckQuoteNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return "DQ-0001";
  const rows = await db.select().from(deckQuotes).orderBy(desc(deckQuotes.id)).limit(1);
  if (rows.length === 0) return "DQ-0001";
  const lastNum = parseInt(rows[0].quoteNumber.replace("DQ-", ""), 10) || 0;
  return `DQ-${String(lastNum + 1).padStart(4, "0")}`;
}

export async function duplicateDeckQuote(id: number, userId: number, newQuoteNumber: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const original = await getDeckQuoteById(id);
  if (!original) throw new Error("Deck quote not found");
  const { id: _id, createdAt, updatedAt, quoteNumber, ...rest } = original;
  const [result] = await db.insert(deckQuotes).values({
    ...rest,
    userId,
    quoteNumber: newQuoteNumber,
    status: "draft",
    archived: false,
    proposalSentAt: null,
    proposalSentTo: null,
  } as any);
  return getDeckQuoteById(result.insertId);
}

export async function deleteDeckQuote(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(deckQuotes).where(eq(deckQuotes.id, id));
}

// ─── Deck Add-On Override History ───────────────────────────────────────────────

export async function insertOverrideHistoryEntries(entries: InsertDeckAddonOverrideHistory[]) {
  if (entries.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(deckAddonOverrideHistory).values(entries);
}

export async function getOverrideHistoryForQuote(deckQuoteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deckAddonOverrideHistory)
    .where(eq(deckAddonOverrideHistory.deckQuoteId, deckQuoteId))
    .orderBy(desc(deckAddonOverrideHistory.changedAt));
}

export async function getLastOverridePerQuote(): Promise<Array<{ deckQuoteId: number; changedAt: Date; changedByName: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  // Get the most recent override entry per quote using a subquery approach
  const all = await db.select({
    id: deckAddonOverrideHistory.id,
    deckQuoteId: deckAddonOverrideHistory.deckQuoteId,
    changedAt: deckAddonOverrideHistory.changedAt,
    changedByName: deckAddonOverrideHistory.changedByName,
  }).from(deckAddonOverrideHistory)
    .orderBy(desc(deckAddonOverrideHistory.changedAt));
  // Deduplicate to get only the latest per quote
  const seen = new Set<number>();
  const result: Array<{ deckQuoteId: number; changedAt: Date; changedByName: string | null }> = [];
  for (const row of all) {
    if (!seen.has(row.deckQuoteId)) {
      seen.add(row.deckQuoteId);
      result.push({ deckQuoteId: row.deckQuoteId, changedAt: row.changedAt, changedByName: row.changedByName });
    }
  }
  return result;
}
