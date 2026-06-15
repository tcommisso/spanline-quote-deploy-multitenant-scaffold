import { getDb } from "./db";
import { supplierFeedback, users, suppliers } from "../drizzle/schema";
import { eq, desc, avg, count, and, sql } from "drizzle-orm";

export async function listFeedback(opts?: { supplierId?: number; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const conditions = [];
  if (opts?.supplierId) conditions.push(eq(supplierFeedback.supplierId, opts.supplierId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [countRow]] = await Promise.all([
    db.select({
      id: supplierFeedback.id,
      supplierId: supplierFeedback.supplierId,
      supplierName: suppliers.name,
      userId: supplierFeedback.userId,
      userName: users.name,
      timeliness: supplierFeedback.timeliness,
      quality: supplierFeedback.quality,
      communication: supplierFeedback.communication,
      pricing: supplierFeedback.pricing,
      overallRating: supplierFeedback.overallRating,
      notes: supplierFeedback.notes,
      poId: supplierFeedback.poId,
      jobId: supplierFeedback.jobId,
      createdAt: supplierFeedback.createdAt,
    })
      .from(supplierFeedback)
      .leftJoin(suppliers, eq(supplierFeedback.supplierId, suppliers.id))
      .leftJoin(users, eq(supplierFeedback.userId, users.id))
      .where(where)
      .orderBy(desc(supplierFeedback.createdAt))
      .limit(opts?.limit || 50)
      .offset(opts?.offset || 0),
    db.select({ count: count() }).from(supplierFeedback).where(where),
  ]);

  return { rows, total: countRow?.count || 0 };
}

export async function createFeedback(data: {
  supplierId: number;
  userId: number;
  timeliness: number;
  quality: number;
  communication: number;
  pricing: number;
  notes?: string | null;
  poId?: number | null;
  jobId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const overallRating = ((data.timeliness + data.quality + data.communication + data.pricing) / 4).toFixed(2);

  const [result] = await db.insert(supplierFeedback).values({
    supplierId: data.supplierId,
    userId: data.userId,
    timeliness: data.timeliness,
    quality: data.quality,
    communication: data.communication,
    pricing: data.pricing,
    overallRating: overallRating,
    notes: data.notes || null,
    poId: data.poId || null,
    jobId: data.jobId || null,
  });

  return { id: result.insertId };
}

export async function updateFeedback(id: number, data: {
  timeliness?: number;
  quality?: number;
  communication?: number;
  pricing?: number;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const updateData: any = { ...data };
  // Recalculate overall if any category changed
  if (data.timeliness !== undefined || data.quality !== undefined || data.communication !== undefined || data.pricing !== undefined) {
    // Fetch current values to fill in unchanged fields
    const [current] = await db.select().from(supplierFeedback).where(eq(supplierFeedback.id, id)).limit(1);
    if (!current) throw new Error("Feedback not found");
    const t = data.timeliness ?? current.timeliness;
    const q = data.quality ?? current.quality;
    const c = data.communication ?? current.communication;
    const p = data.pricing ?? current.pricing;
    updateData.overallRating = ((t + q + c + p) / 4).toFixed(2);
  }

  await db.update(supplierFeedback).set(updateData).where(eq(supplierFeedback.id, id));
  return { success: true };
}

export async function deleteFeedback(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(supplierFeedback).where(eq(supplierFeedback.id, id));
  return { success: true };
}

/** Get aggregated ratings for a single supplier */
export async function getSupplierRatingsSummary(supplierId: number) {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db.select({
    avgTimeliness: avg(supplierFeedback.timeliness),
    avgQuality: avg(supplierFeedback.quality),
    avgCommunication: avg(supplierFeedback.communication),
    avgPricing: avg(supplierFeedback.pricing),
    avgOverall: avg(supplierFeedback.overallRating),
    totalReviews: count(),
  })
    .from(supplierFeedback)
    .where(eq(supplierFeedback.supplierId, supplierId));

  if (!row || row.totalReviews === 0) return null;
  return {
    avgTimeliness: Number(row.avgTimeliness) || 0,
    avgQuality: Number(row.avgQuality) || 0,
    avgCommunication: Number(row.avgCommunication) || 0,
    avgPricing: Number(row.avgPricing) || 0,
    avgOverall: Number(row.avgOverall) || 0,
    totalReviews: row.totalReviews,
  };
}

/** Get aggregated ratings for ALL suppliers (for directory display) */
export async function getAllSupplierRatings() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select({
    supplierId: supplierFeedback.supplierId,
    supplierName: suppliers.name,
    avgOverall: avg(supplierFeedback.overallRating),
    totalReviews: count(),
  })
    .from(supplierFeedback)
    .leftJoin(suppliers, eq(supplierFeedback.supplierId, suppliers.id))
    .groupBy(supplierFeedback.supplierId, suppliers.name);

  return rows.map(r => ({
    supplierId: r.supplierId,
    supplierName: r.supplierName || `Supplier #${r.supplierId}`,
    avgOverall: Number(r.avgOverall) || 0,
    totalReviews: r.totalReviews,
  }));
}

/** Check if a user already submitted feedback for a specific PO */
export async function hasFeedbackForPo(userId: number, poId: number) {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db.select({ id: supplierFeedback.id })
    .from(supplierFeedback)
    .where(and(eq(supplierFeedback.userId, userId), eq(supplierFeedback.poId, poId)))
    .limit(1);
  return !!row;
}
