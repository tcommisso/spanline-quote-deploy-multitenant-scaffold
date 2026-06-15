/**
 * Competitor Intelligence tRPC Router
 * Provides endpoints for competitor watchlist management, DA search by company,
 * and client-DA matching operations.
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { daCompetitorWatchlist, clientDas, crmLeads, quotes } from "../drizzle/schema";
import { eq, and, desc, sql, like, inArray, isNull } from "drizzle-orm";
import { searchDasByCompany, searchDasByAddress, searchDasByApplicant, runClientDaMatching } from "./competitor-intel-service";
import { TRPCError } from "@trpc/server";

export const competitorIntelRouter = router({
  // ─── Watchlist CRUD ──────────────────────────────────────────────────────────

  watchlist: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(daCompetitorWatchlist).orderBy(daCompetitorWatchlist.companyName);
    }),

    create: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1).max(255),
        notes: z.string().optional(),
        colour: z.string().optional().default("#ef4444"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [result] = await db.insert(daCompetitorWatchlist).values({
          companyName: input.companyName,
          notes: input.notes || null,
          colour: input.colour,
          createdBy: ctx.user.id,
        });
        return { id: (result as any).insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyName: z.string().min(1).max(255).optional(),
        notes: z.string().nullable().optional(),
        colour: z.string().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { id, ...updates } = input;
        await db.update(daCompetitorWatchlist)
          .set({ ...updates, updatedAt: new Date() } as any)
          .where(eq(daCompetitorWatchlist.id, id));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.delete(daCompetitorWatchlist).where(eq(daCompetitorWatchlist.id, input.id));
        return { ok: true };
      }),
  }),

  // ─── DA Search (live query against ArcGIS) ──────────────────────────────────

  searchByCompany: protectedProcedure
    .input(z.object({
      companyName: z.string().min(1),
      suburb: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().min(1).max(500).optional().default(100),
    }))
    .query(async ({ input }) => {
      const results = await searchDasByCompany(input.companyName, {
        suburb: input.suburb,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit,
      });
      return results;
    }),

  searchByAddress: protectedProcedure
    .input(z.object({
      address: z.string().min(1),
      suburb: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return searchDasByAddress(input.address, input.suburb);
    }),

  // ─── Competitor Stats (aggregated from live queries) ─────────────────────────

  competitorStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const watchlist = await db.select()
      .from(daCompetitorWatchlist)
      .where(eq(daCompetitorWatchlist.active, true));

    const stats = [];
    for (const competitor of watchlist) {
      try {
        const results = await searchDasByCompany(competitor.companyName, { limit: 500 });
        const thisYear = results.filter(r => {
          if (!r.lodgementDate) return false;
          return new Date(r.lodgementDate).getFullYear() >= new Date().getFullYear();
        });
        stats.push({
          id: competitor.id,
          companyName: competitor.companyName,
          colour: competitor.colour,
          totalDas: results.length,
          dasThisYear: thisYear.length,
          suburbs: Array.from(new Set(results.map(r => r.suburb).filter(Boolean))).sort(),
        });
      } catch {
        stats.push({
          id: competitor.id,
          companyName: competitor.companyName,
          colour: competitor.colour,
          totalDas: 0,
          dasThisYear: 0,
          suburbs: [],
        });
      }
    }
        return stats;
  }),

  /**
   * Suburb breakdown — actual DA counts grouped by suburb × company
   * for the market share chart.
   */
  suburbBreakdown: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const watchlist = await db.select()
      .from(daCompetitorWatchlist)
      .where(eq(daCompetitorWatchlist.active, true));

    const breakdown: { suburb: string; company: string; colour: string; count: number }[] = [];

    for (const competitor of watchlist) {
      try {
        const results = await searchDasByCompany(competitor.companyName, { limit: 500 });
        const suburbCounts = new Map<string, number>();
        for (const r of results) {
          if (!r.suburb) continue;
          suburbCounts.set(r.suburb, (suburbCounts.get(r.suburb) || 0) + 1);
        }
        for (const [suburb, count] of Array.from(suburbCounts.entries())) {
          breakdown.push({
            suburb,
            company: competitor.companyName,
            colour: competitor.colour || "#6b7280",
            count,
          });
        }
      } catch {
        // skip on error
      }
    }
    return breakdown;
  }),

  // ─── Client-DA Matching ─────────────────────────────────────────────────────

  clientMatches: router({
    // Run matching (manual trigger)
    runMatch: protectedProcedure
      .input(z.object({
        leadIds: z.array(z.number()).optional(),
        forceRefresh: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input }) => {
        return runClientDaMatching({
          leadIds: input.leadIds || undefined,
          forceRefresh: input.forceRefresh,
        });
      }),

    // Get matches for a specific lead
    getByLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select()
          .from(clientDas)
          .where(eq(clientDas.leadId, input.leadId))
          .orderBy(desc(clientDas.lodgementDate));
      }),

    // Get matches for a specific quote
    getByQuote: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select()
          .from(clientDas)
          .where(eq(clientDas.quoteId, input.quoteId))
          .orderBy(desc(clientDas.lodgementDate));
      }),

    // Get all "lost to competitor" matches (competitor DAs at our lead addresses)
        lostToCompetitor: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).optional().default(50),
        offset: z.number().min(0).optional().default(0),
        companyName: z.string().optional(),
        unattributed: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const conditions: any[] = [eq(clientDas.isOurs, false)];
        if (input.unattributed) {
          conditions.push(sql`(${clientDas.companyName} IS NULL OR ${clientDas.companyName} = '')`);
        } else if (input.companyName) {
          conditions.push(like(clientDas.companyName, `%${input.companyName}%`));
        }

        const where = and(...conditions);

        const [items, countResult] = await Promise.all([
          db.select({
            id: clientDas.id,
            leadId: clientDas.leadId,
            quoteId: clientDas.quoteId,
            daNumber: clientDas.daNumber,
            companyName: clientDas.companyName,
            applicantName: clientDas.applicantName,
            proposalText: clientDas.proposalText,
            streetAddress: clientDas.streetAddress,
            suburb: clientDas.suburb,
            lodgementDate: clientDas.lodgementDate,
            daStage: clientDas.daStage,
            decision: clientDas.decision,
            matchType: clientDas.matchType,
            matchConfidence: clientDas.matchConfidence,
            centroidLat: clientDas.centroidLat,
            centroidLng: clientDas.centroidLng,
          })
            .from(clientDas)
            .where(where)
            .orderBy(desc(clientDas.lodgementDate))
            .limit(input.limit)
            .offset(input.offset),
          db.select({ count: sql<number>`count(*)` })
            .from(clientDas)
            .where(where),
        ]);

        return { items, total: countResult[0]?.count || 0 };
      }),

    // Summary stats
    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totalMatches: 0, oursCount: 0, competitorCount: 0, topCompetitors: [] };

      const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(clientDas);
      const [oursResult] = await db.select({ count: sql<number>`count(*)` }).from(clientDas).where(eq(clientDas.isOurs, true));
      const [compResult] = await db.select({ count: sql<number>`count(*)` }).from(clientDas).where(eq(clientDas.isOurs, false));

      const topCompetitors = await db.select({
        companyName: clientDas.companyName,
        count: sql<number>`count(*)`,
      })
        .from(clientDas)
        .where(and(
          eq(clientDas.isOurs, false),
          sql`${clientDas.companyName} IS NOT NULL AND ${clientDas.companyName} != ''`
        ))
        .groupBy(clientDas.companyName)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      return {
        totalMatches: totalResult?.count || 0,
        oursCount: oursResult?.count || 0,
        competitorCount: compResult?.count || 0,
        topCompetitors,
      };
    }),

    // Delete a match
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.delete(clientDas).where(eq(clientDas.id, input.id));
        return { ok: true };
      }),

    // Assign builder/company name to an unattributed DA
    assignBuilder: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyName: z.string().min(1).max(255),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.update(clientDas)
          .set({ companyName: input.companyName, updatedAt: new Date() })
          .where(eq(clientDas.id, input.id));
        return { ok: true };
      }),
  }),
});
