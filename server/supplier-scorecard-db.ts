import { getDb } from "./db";
import { supplierFeedback, suppliers, users } from "../drizzle/schema";
import { eq, desc, avg, count, sql } from "drizzle-orm";

export interface ScorecardData {
  supplier: { id: number; name: string; email: string | null; phone: string | null };
  summary: {
    avgTimeliness: number;
    avgQuality: number;
    avgCommunication: number;
    avgPricing: number;
    avgOverall: number;
    totalReviews: number;
  };
  monthlyTrend: Array<{
    month: string; // YYYY-MM
    avgOverall: number;
    reviewCount: number;
  }>;
  recentReviews: Array<{
    id: number;
    userName: string | null;
    timeliness: number;
    quality: number;
    communication: number;
    pricing: number;
    overallRating: string;
    notes: string | null;
    createdAt: Date;
  }>;
}

export async function getSupplierScorecard(supplierId: number): Promise<ScorecardData | null> {
  const db = await getDb();
  if (!db) return null;

  // Fetch supplier info
  const [supplierRow] = await db.select({
    id: suppliers.id,
    name: suppliers.name,
    email: suppliers.email,
    phone: suppliers.phone,
  }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);

  if (!supplierRow) return null;

  // Aggregated summary
  const [summaryRow] = await db.select({
    avgTimeliness: avg(supplierFeedback.timeliness),
    avgQuality: avg(supplierFeedback.quality),
    avgCommunication: avg(supplierFeedback.communication),
    avgPricing: avg(supplierFeedback.pricing),
    avgOverall: avg(supplierFeedback.overallRating),
    totalReviews: count(),
  })
    .from(supplierFeedback)
    .where(eq(supplierFeedback.supplierId, supplierId));

  if (!summaryRow || summaryRow.totalReviews === 0) return null;

  // Monthly trend (last 12 months)
  const monthlyTrend = await db.select({
    month: sql<string>`DATE_FORMAT(${supplierFeedback.createdAt}, '%Y-%m')`,
    avgOverall: avg(supplierFeedback.overallRating),
    reviewCount: count(),
  })
    .from(supplierFeedback)
    .where(eq(supplierFeedback.supplierId, supplierId))
    .groupBy(sql`DATE_FORMAT(${supplierFeedback.createdAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${supplierFeedback.createdAt}, '%Y-%m')`);

  // Recent reviews (last 20)
  const recentReviews = await db.select({
    id: supplierFeedback.id,
    userName: users.name,
    timeliness: supplierFeedback.timeliness,
    quality: supplierFeedback.quality,
    communication: supplierFeedback.communication,
    pricing: supplierFeedback.pricing,
    overallRating: supplierFeedback.overallRating,
    notes: supplierFeedback.notes,
    createdAt: supplierFeedback.createdAt,
  })
    .from(supplierFeedback)
    .leftJoin(users, eq(supplierFeedback.userId, users.id))
    .where(eq(supplierFeedback.supplierId, supplierId))
    .orderBy(desc(supplierFeedback.createdAt))
    .limit(20);

  return {
    supplier: supplierRow,
    summary: {
      avgTimeliness: Number(summaryRow.avgTimeliness) || 0,
      avgQuality: Number(summaryRow.avgQuality) || 0,
      avgCommunication: Number(summaryRow.avgCommunication) || 0,
      avgPricing: Number(summaryRow.avgPricing) || 0,
      avgOverall: Number(summaryRow.avgOverall) || 0,
      totalReviews: summaryRow.totalReviews,
    },
    monthlyTrend: monthlyTrend.map(r => ({
      month: r.month,
      avgOverall: Number(r.avgOverall) || 0,
      reviewCount: r.reviewCount,
    })),
    recentReviews,
  };
}
