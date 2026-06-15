import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, desc, sql } from "drizzle-orm";
import { climboAccounts, googleReviews, type InsertClimboAccount, type InsertGoogleReview } from "../drizzle/schema";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

// ─── Climbo Accounts ─────────────────────────────────────────────────────────

export async function listClimboAccounts() {
  return db.select().from(climboAccounts).orderBy(climboAccounts.name);
}

export async function getClimboAccount(id: number) {
  const rows = await db.select().from(climboAccounts).where(eq(climboAccounts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createClimboAccount(data: Omit<InsertClimboAccount, "id" | "createdAt" | "updatedAt">) {
  const result = await db.insert(climboAccounts).values(data);
  return { id: Number(result[0].insertId) };
}

export async function updateClimboAccount(id: number, data: Partial<Omit<InsertClimboAccount, "id" | "createdAt" | "updatedAt">>) {
  await db.update(climboAccounts).set(data).where(eq(climboAccounts.id, id));
}

export async function deleteClimboAccount(id: number) {
  await db.delete(climboAccounts).where(eq(climboAccounts.id, id));
}

// ─── Google Reviews ──────────────────────────────────────────────────────────

export async function listReviewsByLead(leadId: number) {
  return db.select().from(googleReviews).where(eq(googleReviews.leadId, leadId)).orderBy(desc(googleReviews.reviewDate));
}

export async function listAllReviews(opts: { limit?: number; offset?: number } = {}) {
  const { limit = 50, offset = 0 } = opts;
  const rows = await db.select().from(googleReviews).orderBy(desc(googleReviews.createdAt)).limit(limit).offset(offset);
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(googleReviews);
  return { rows, total: Number(countResult[0].count) };
}

export async function createReview(data: Omit<InsertGoogleReview, "id" | "createdAt">) {
  const result = await db.insert(googleReviews).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getReviewByGoogleId(googleReviewId: string) {
  const rows = await db.select().from(googleReviews).where(eq(googleReviews.googleReviewId, googleReviewId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertReview(data: Omit<InsertGoogleReview, "id" | "createdAt">) {
  if (data.googleReviewId) {
    const existing = await getReviewByGoogleId(data.googleReviewId);
    if (existing) {
      await db.update(googleReviews).set(data).where(eq(googleReviews.id, existing.id));
      return { id: existing.id, updated: true };
    }
  }
  const result = await createReview(data);
  return { id: result.id, updated: false };
}

// ─── Request Review (fire webhook to Zapier/Climbo) ─────────────────────────

export async function getActiveClimboAccountsWithWebhook() {
  return db.select().from(climboAccounts).where(eq(climboAccounts.active, true));
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

export async function getReviewStats() {
  const result = await db.select({
    total: sql<number>`count(*)`,
    avgRating: sql<number>`ROUND(AVG(rating), 1)`,
    fiveStar: sql<number>`SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END)`,
    fourStar: sql<number>`SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END)`,
    threeStar: sql<number>`SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END)`,
    twoStar: sql<number>`SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END)`,
    oneStar: sql<number>`SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END)`,
  }).from(googleReviews);
  return result[0];
}
