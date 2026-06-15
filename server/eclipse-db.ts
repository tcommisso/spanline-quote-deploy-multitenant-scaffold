// Eclipse Opening Roof System - Database Helpers
import { eq, desc, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eclipseQuotes, eclipsePricing } from "../drizzle/schema";
import type { InsertEclipseQuote, InsertEclipsePricing } from "../drizzle/schema";
import { isAdminRole } from "../shared/const";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

// ─── Eclipse Quotes ──────────────────────────────────────────────────────────

export async function listEclipseQuotes(userId: number, role: string) {
  if (isAdminRole(role)) {
    return db.select().from(eclipseQuotes).orderBy(desc(eclipseQuotes.updatedAt));
  }
  return db.select().from(eclipseQuotes).where(eq(eclipseQuotes.userId, userId)).orderBy(desc(eclipseQuotes.updatedAt));
}

export async function getEclipseQuoteById(id: number) {
  const rows = await db.select().from(eclipseQuotes).where(eq(eclipseQuotes.id, id));
  return rows[0] || null;
}

export async function createEclipseQuote(data: InsertEclipseQuote) {
  const result = await db.insert(eclipseQuotes).values(data);
  return result[0].insertId;
}

export async function updateEclipseQuote(id: number, data: Partial<InsertEclipseQuote>) {
  await db.update(eclipseQuotes).set(data).where(eq(eclipseQuotes.id, id));
}

export async function deleteEclipseQuote(id: number) {
  await db.delete(eclipseQuotes).where(eq(eclipseQuotes.id, id));
}

export async function duplicateEclipseQuote(id: number, userId: number, newQuoteNumber: string) {
  const original = await getEclipseQuoteById(id);
  if (!original) throw new Error("Eclipse quote not found");
  const { id: _id, createdAt, updatedAt, quoteNumber, ...rest } = original;
  const newId = await createEclipseQuote({
    ...rest,
    userId,
    quoteNumber: newQuoteNumber,
    status: "draft",
    archived: false,
  } as any);
  return newId;
}

export async function getNextEclipseQuoteNumber(): Promise<string> {
  const rows = await db.select({ quoteNumber: eclipseQuotes.quoteNumber })
    .from(eclipseQuotes)
    .orderBy(desc(eclipseQuotes.id))
    .limit(1);
  if (rows.length === 0) return "EQ-0001";
  const last = rows[0].quoteNumber;
  const num = parseInt(last.replace("EQ-", ""), 10);
  return `EQ-${String(num + 1).padStart(4, "0")}`;
}

// ─── Eclipse Pricing ─────────────────────────────────────────────────────────

export async function getAllEclipsePricing() {
  return db.select().from(eclipsePricing).orderBy(eclipsePricing.category);
}

export async function upsertEclipsePricing(key: string, value: number, label?: string, category?: string) {
  // Try update first
  const existing = await db.select().from(eclipsePricing).where(eq(eclipsePricing.key, key));
  if (existing.length > 0) {
    await db.update(eclipsePricing)
      .set({ value: value.toString(), label, category })
      .where(eq(eclipsePricing.key, key));
    return existing[0].id;
  }
  const result = await db.insert(eclipsePricing).values({
    key,
    value: value.toString(),
    label,
    category,
  });
  return result[0].insertId;
}

export async function bulkUpsertEclipsePricing(rows: Array<{ key: string; value: number; label: string; category: string }>) {
  for (const row of rows) {
    await upsertEclipsePricing(row.key, row.value, row.label, row.category);
  }
}

export async function resetEclipsePricing() {
  await db.delete(eclipsePricing);
}
