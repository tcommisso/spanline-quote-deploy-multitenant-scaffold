// Eclipse Opening Roof System - Database Helpers
import { eq, desc, like, or, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eclipseQuotes, eclipsePricing } from "../drizzle/schema";
import type { InsertEclipseQuote, InsertEclipsePricing } from "../drizzle/schema";
import { isAdminRole } from "../shared/const";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

type EclipseTenantScopeOptions = {
  includeAllTenants?: boolean;
};

function appendEclipseTenantScope(
  conditions: any[],
  tenantId: number | null | undefined,
  _options?: EclipseTenantScopeOptions,
) {
  if (!tenantId) {
    conditions.push(sql`1 = 0`);
    return;
  }
  conditions.push(eq(eclipseQuotes.tenantId, tenantId));
}

// ─── Eclipse Quotes ──────────────────────────────────────────────────────────

export async function listEclipseQuotes(
  user: { id: number; role: string; name?: string | null; canViewAllQuotes?: boolean },
  tenantId?: number | null,
  options?: EclipseTenantScopeOptions,
) {
  const conditions: any[] = [];
  appendEclipseTenantScope(conditions, tenantId, options);
  if (!isAdminRole(user.role) && !user.canViewAllQuotes) {
    if (user.role === "design_adviser" && user.name) {
      conditions.push(or(eq(eclipseQuotes.designAdvisor, user.name), eq(eclipseQuotes.userId, user.id)));
    } else {
      conditions.push(eq(eclipseQuotes.userId, user.id));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(eclipseQuotes).where(where).orderBy(desc(eclipseQuotes.updatedAt));
}

export async function getEclipseQuoteById(id: number, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const conditions: any[] = [eq(eclipseQuotes.id, id)];
  appendEclipseTenantScope(conditions, tenantId, options);
  const rows = await db.select().from(eclipseQuotes).where(and(...conditions));
  return rows[0] || null;
}

export async function createEclipseQuote(data: InsertEclipseQuote) {
  const result = await db.insert(eclipseQuotes).values(data);
  return result[0].insertId;
}

export async function updateEclipseQuote(id: number, data: Partial<InsertEclipseQuote>, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const conditions: any[] = [eq(eclipseQuotes.id, id)];
  appendEclipseTenantScope(conditions, tenantId, options);
  await db.update(eclipseQuotes).set(data).where(and(...conditions));
}

export async function deleteEclipseQuote(id: number, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const conditions: any[] = [eq(eclipseQuotes.id, id)];
  appendEclipseTenantScope(conditions, tenantId, options);
  await db.delete(eclipseQuotes).where(and(...conditions));
}

export async function duplicateEclipseQuote(id: number, userId: number, newQuoteNumber: string, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const original = await getEclipseQuoteById(id, tenantId, options);
  if (!original) throw new Error("Eclipse quote not found");
  const { id: _id, createdAt, updatedAt, quoteNumber, tenantId: _tenantId, ...rest } = original;
  const newId = await createEclipseQuote({
    ...rest,
    tenantId: tenantId ?? _tenantId,
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
