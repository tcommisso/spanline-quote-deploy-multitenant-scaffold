/**
 * NSW DA tRPC Router
 * Provides endpoints for listing, filtering, and viewing NSW DA applications
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { nswDaApplications, nswDaPollLog } from "../drizzle/schema";
import { eq, and, desc, like, sql, gte, lte } from "drizzle-orm";
import { NSW_TARGET_COUNCILS, pollNswDaApplications, getNswDaStats, getNswDaBySuburb } from "./nsw-da-service";
import { scrapeAndStoreT1CloudDas, reMatchCompetitors, T1CLOUD_COUNCILS } from "./t1cloud-scraper-service";

export const nswDaRouter = router({
  // List NSW DAs with filters
  list: protectedProcedure
    .input(z.object({
      council: z.string().optional(),
      suburb: z.string().optional(),
      category: z.string().optional(),
      relevantOnly: z.boolean().optional().default(true),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(500).optional().default(100),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions: any[] = [];

      if (input.council) {
        conditions.push(eq(nswDaApplications.councilName, input.council));
      }
      if (input.suburb) {
        conditions.push(eq(nswDaApplications.suburb, input.suburb));
      }
      if (input.category) {
        conditions.push(eq(nswDaApplications.relevantCategory, input.category));
      }
      if (input.relevantOnly) {
        conditions.push(eq(nswDaApplications.isRelevant, true));
      }
      if (input.search) {
        conditions.push(like(nswDaApplications.fullAddress, `%${input.search}%`));
      }
      if (input.dateFrom) {
        conditions.push(gte(nswDaApplications.lodgementDate, new Date(input.dateFrom)));
      }
      if (input.dateTo) {
        conditions.push(lte(nswDaApplications.lodgementDate, new Date(input.dateTo)));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select()
          .from(nswDaApplications)
          .where(where)
          .orderBy(desc(nswDaApplications.lodgementDate))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` })
          .from(nswDaApplications)
          .where(where),
      ]);

      return { items, total: countResult[0]?.count || 0 };
    }),

  // Get stats by council
  stats: protectedProcedure.query(async () => {
    const stats = await getNswDaStats();
    return { stats, councils: [...NSW_TARGET_COUNCILS] };
  }),

  // Get suburb breakdown for market share chart
  suburbBreakdown: protectedProcedure
    .input(z.object({
      council: z.string().optional(),
      relevantOnly: z.boolean().optional().default(true),
      dateFrom: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return getNswDaBySuburb({
        councilName: input.council,
        relevantOnly: input.relevantOnly,
        dateFrom: input.dateFrom,
      });
    }),

  // Get poll history
  pollHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).optional().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db.select()
        .from(nswDaPollLog)
        .orderBy(desc(nswDaPollLog.startedAt))
        .limit(input.limit);
    }),

  // Manual trigger poll (admin only)
  triggerPoll: protectedProcedure
    .input(z.object({
      councils: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user as any).role !== "admin" && (ctx.user as any).role !== "super_admin") {
        throw new Error("Admin only");
      }
      const result = await pollNswDaApplications({
        councils: input.councils,
      });
      return result;
    }),

  // Trigger T1Cloud scrape (admin only)
  triggerScrape: protectedProcedure
    .input(z.object({
      councils: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user as any).role !== "admin" && (ctx.user as any).role !== "super_admin") {
        throw new Error("Admin only");
      }
      const result = await scrapeAndStoreT1CloudDas({
        councils: input.councils,
      });
      return result;
    }),

  // Re-match all DAs against competitor watchlist (admin only)
  reMatchCompetitors: protectedProcedure
    .mutation(async ({ ctx }) => {
      if ((ctx.user as any).role !== "admin" && (ctx.user as any).role !== "super_admin") {
        throw new Error("Admin only");
      }
      return reMatchCompetitors();
    }),

  // Get competitor DAs (DAs with matched competitors)
  competitorDas: protectedProcedure
    .input(z.object({
      council: z.string().optional(),
      limit: z.number().min(1).max(200).optional().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [eq(nswDaApplications.isCompetitor, true)];
      if (input.council) {
        conditions.push(eq(nswDaApplications.councilName, input.council));
      }

      return db.select()
        .from(nswDaApplications)
        .where(and(...conditions))
        .orderBy(desc(nswDaApplications.lodgementDate))
        .limit(input.limit);
    }),

  // ─── NSW Competitor Intelligence ─────────────────────────────────────────

  // NSW competitor stats (from T1Cloud scraped applicant names)
  nswCompetitorStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalCompetitorDas: 0, uniqueCompetitors: 0, topCompetitors: [] };

    const [totalResult] = await db.select({ count: sql<number>`count(*)` })
      .from(nswDaApplications)
      .where(eq(nswDaApplications.isCompetitor, true));

    const [uniqueResult] = await db.select({ count: sql<number>`count(distinct ${nswDaApplications.applicantName})` })
      .from(nswDaApplications)
      .where(and(
        eq(nswDaApplications.isCompetitor, true),
        sql`${nswDaApplications.applicantName} IS NOT NULL AND ${nswDaApplications.applicantName} != ''`
      ));

    const topCompetitors = await db.select({
      companyName: nswDaApplications.applicantName,
      count: sql<number>`count(*)`,
    })
      .from(nswDaApplications)
      .where(and(
        eq(nswDaApplications.isCompetitor, true),
        sql`${nswDaApplications.applicantName} IS NOT NULL AND ${nswDaApplications.applicantName} != ''`
      ))
      .groupBy(nswDaApplications.applicantName)
      .orderBy(desc(sql`count(*)`))  
      .limit(10);

    return {
      totalCompetitorDas: totalResult?.count || 0,
      uniqueCompetitors: uniqueResult?.count || 0,
      topCompetitors,
    };
  }),

  // NSW lost to competitor (DAs with matched competitor applicant names)
  nswLostToCompetitor: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).optional().default(50),
      offset: z.number().min(0).optional().default(0),
      companyName: z.string().optional(),
      council: z.string().optional(),
      unattributed: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions: any[] = [];
      
      if (input.unattributed) {
        // Show DAs that are relevant but have no applicant name (potential competitor DAs to investigate)
        conditions.push(eq(nswDaApplications.isRelevant, true));
        conditions.push(sql`(${nswDaApplications.applicantName} IS NULL OR ${nswDaApplications.applicantName} = '')`);
      } else {
        // Show confirmed competitor DAs
        conditions.push(eq(nswDaApplications.isCompetitor, true));
        if (input.companyName) {
          conditions.push(like(nswDaApplications.applicantName, `%${input.companyName}%`));
        }
      }

      if (input.council) {
        conditions.push(eq(nswDaApplications.councilName, input.council));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select()
          .from(nswDaApplications)
          .where(where)
          .orderBy(desc(nswDaApplications.lodgementDate))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` })
          .from(nswDaApplications)
          .where(where),
      ]);

      return { items, total: countResult[0]?.count || 0 };
    }),

  // NSW suburb breakdown for market share chart
  nswSuburbBreakdown: protectedProcedure
    .input(z.object({
      council: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [
        eq(nswDaApplications.isCompetitor, true),
        sql`${nswDaApplications.applicantName} IS NOT NULL AND ${nswDaApplications.applicantName} != ''`,
        sql`${nswDaApplications.suburb} IS NOT NULL AND ${nswDaApplications.suburb} != ''`,
      ];

      if (input.council) {
        conditions.push(eq(nswDaApplications.councilName, input.council));
      }

      const rows = await db.select({
        suburb: nswDaApplications.suburb,
        company: nswDaApplications.applicantName,
        count: sql<number>`count(*)`,
      })
        .from(nswDaApplications)
        .where(and(...conditions))
        .groupBy(nswDaApplications.suburb, nswDaApplications.applicantName)
        .orderBy(desc(sql`count(*)`));

      return rows.map(r => ({
        suburb: r.suburb || '',
        company: r.company || '',
        colour: '#6b7280',
        count: r.count,
      }));
    }),

  // Get available filter values
  filters: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { councils: [], suburbs: [], categories: [] };

    const [councils, suburbs, categories] = await Promise.all([
      db.selectDistinct({ value: nswDaApplications.councilName })
        .from(nswDaApplications)
        .orderBy(nswDaApplications.councilName),
      db.selectDistinct({ value: nswDaApplications.suburb })
        .from(nswDaApplications)
        .where(eq(nswDaApplications.isRelevant, true))
        .orderBy(nswDaApplications.suburb),
      db.selectDistinct({ value: nswDaApplications.relevantCategory })
        .from(nswDaApplications)
        .where(eq(nswDaApplications.isRelevant, true))
        .orderBy(nswDaApplications.relevantCategory),
    ]);

    return {
      councils: councils.map(c => c.value).filter(Boolean) as string[],
      suburbs: suburbs.map(s => s.value).filter(Boolean) as string[],
      categories: categories.map(c => c.value).filter(Boolean) as string[],
    };
  }),
});
