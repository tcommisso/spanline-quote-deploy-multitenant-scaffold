import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq, desc, sql } from "drizzle-orm";
import { climboAccounts, googleReviews, type InsertClimboAccount, type InsertGoogleReview } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);
type TenantScope = number | null | undefined;

// ─── Climbo Accounts ─────────────────────────────────────────────────────────

export async function listClimboAccounts(tenantId?: TenantScope) {
  const conditions: any[] = [];
  appendTenantScope(conditions, climboAccounts.tenantId, tenantId);
  let query = db.select().from(climboAccounts).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));
  return query.orderBy(climboAccounts.name);
}

export async function getClimboAccount(id: number, tenantId?: TenantScope) {
  const conditions: any[] = [eq(climboAccounts.id, id)];
  appendTenantScope(conditions, climboAccounts.tenantId, tenantId);
  const rows = await db.select().from(climboAccounts).where(and(...conditions)).limit(1);
  return rows[0] ?? null;
}

export async function createClimboAccount(data: Omit<InsertClimboAccount, "id" | "createdAt" | "updatedAt">, tenantId?: TenantScope) {
  const result = await db.insert(climboAccounts).values({ ...data, tenantId } as any);
  return { id: Number(result[0].insertId) };
}

export async function updateClimboAccount(id: number, data: Partial<Omit<InsertClimboAccount, "id" | "createdAt" | "updatedAt">>, tenantId?: TenantScope) {
  const conditions: any[] = [eq(climboAccounts.id, id)];
  appendTenantScope(conditions, climboAccounts.tenantId, tenantId);
  await db.update(climboAccounts).set(data).where(and(...conditions));
}

export async function deleteClimboAccount(id: number, tenantId?: TenantScope) {
  const conditions: any[] = [eq(climboAccounts.id, id)];
  appendTenantScope(conditions, climboAccounts.tenantId, tenantId);
  await db.delete(climboAccounts).where(and(...conditions));
}

// ─── Google Reviews ──────────────────────────────────────────────────────────

export async function listReviewsByLead(leadId: number, tenantId?: TenantScope) {
  const conditions: any[] = [eq(googleReviews.leadId, leadId)];
  appendTenantScope(conditions, googleReviews.tenantId, tenantId);
  return db.select().from(googleReviews).where(and(...conditions)).orderBy(desc(googleReviews.reviewDate));
}

export async function listAllReviews(opts: { limit?: number; offset?: number } = {}, tenantId?: TenantScope) {
  const { limit = 50, offset = 0 } = opts;
  const conditions: any[] = [];
  appendTenantScope(conditions, googleReviews.tenantId, tenantId);
  let rowsQuery = db.select().from(googleReviews).$dynamic();
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(googleReviews).$dynamic();
  if (conditions.length) {
    rowsQuery = rowsQuery.where(and(...conditions));
    countQuery = countQuery.where(and(...conditions));
  }
  const rows = await rowsQuery.orderBy(desc(googleReviews.createdAt)).limit(limit).offset(offset);
  const countResult = await countQuery;
  return { rows, total: Number(countResult[0].count) };
}

export async function createReview(data: Omit<InsertGoogleReview, "id" | "createdAt">, tenantId?: TenantScope) {
  const result = await db.insert(googleReviews).values({ ...data, tenantId } as any);
  return { id: Number(result[0].insertId) };
}

export async function getReviewByGoogleId(googleReviewId: string, tenantId?: TenantScope) {
  const conditions: any[] = [eq(googleReviews.googleReviewId, googleReviewId)];
  appendTenantScope(conditions, googleReviews.tenantId, tenantId);
  const rows = await db.select().from(googleReviews).where(and(...conditions)).limit(1);
  return rows[0] ?? null;
}

export async function upsertReview(data: Omit<InsertGoogleReview, "id" | "createdAt">, tenantId?: TenantScope) {
  if (data.googleReviewId) {
    const existing = await getReviewByGoogleId(data.googleReviewId, tenantId);
    if (existing) {
      await db.update(googleReviews).set({ ...data, tenantId } as any).where(eq(googleReviews.id, existing.id));
      return { id: existing.id, updated: true };
    }
  }
  const result = await createReview(data, tenantId);
  return { id: result.id, updated: false };
}

// ─── Request Review (fire webhook to Zapier/Climbo) ─────────────────────────

export async function getActiveClimboAccountsWithWebhook(tenantId?: TenantScope) {
  const conditions: any[] = [eq(climboAccounts.active, true)];
  appendTenantScope(conditions, climboAccounts.tenantId, tenantId);
  return db.select().from(climboAccounts).where(and(...conditions));
}

export async function fireReviewRequestWebhook(webhookUrl: string, payload: {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  siteAddress: string;
  leadId: number;
  region?: string;
}) {
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: resp.ok, status: resp.status };
}

export async function getReviewStats(tenantId?: TenantScope) {
  const conditions: any[] = [];
  appendTenantScope(conditions, googleReviews.tenantId, tenantId);
  let query = db.select({
    total: sql<number>`count(*)`,
    avgRating: sql<number>`ROUND(AVG(rating), 1)`,
    fiveStar: sql<number>`SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END)`,
    fourStar: sql<number>`SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END)`,
    threeStar: sql<number>`SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END)`,
    twoStar: sql<number>`SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END)`,
    oneStar: sql<number>`SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END)`,
  }).from(googleReviews).$dynamic();
  if (conditions.length) query = query.where(and(...conditions));
  const result = await query;
  return result[0];
}
