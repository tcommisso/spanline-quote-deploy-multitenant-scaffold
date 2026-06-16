/**
 * Competitor Intelligence tRPC Router
 * Provides endpoints for competitor watchlist management, DA search by company,
 * and client-DA matching operations.
 */
import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { daCompetitorWatchlist, clientDas, crmLeads, quotes } from "../drizzle/schema";
import { eq, and, asc, desc, sql, like, inArray, isNull } from "drizzle-orm";
import { searchDasByCompany, searchDasByAddress, searchDasByApplicant, runClientDaMatching } from "./competitor-intel-service";
import { TRPCError } from "@trpc/server";

type ClientDaCanonical = {
  id: number;
  daNumber: string;
  companyName: string | null;
  streetAddress: string | null;
  suburb: string | null;
  isOurs?: boolean;
  matchType?: string;
  lodgementDate?: Date | string | null;
};

function normaliseDaKeyPart(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function clientDaCanonicalKey(row: ClientDaCanonical): string {
  return [
    normaliseDaKeyPart(row.daNumber),
    normaliseDaKeyPart(row.companyName),
    normaliseDaKeyPart(row.streetAddress),
    normaliseDaKeyPart(row.suburb),
  ].join("|");
}

function dedupeClientDaRows<T extends ClientDaCanonical>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = clientDaCanonicalKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const rowIsManual = row.matchType === "manual";
    const existingIsManual = existing.matchType === "manual";
    if (
      (rowIsManual && !existingIsManual) ||
      (row.isOurs && !existing.isOurs) ||
      (row.lodgementDate && !existing.lodgementDate)
    ) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

export const competitorIntelRouter = router({
  // ─── Watchlist CRUD ──────────────────────────────────────────────────────────

  watchlist: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select()
        .from(daCompetitorWatchlist)
        .where(eq(daCompetitorWatchlist.tenantId, ctx.tenant!.id))
        .orderBy(daCompetitorWatchlist.companyName);
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
          tenantId: ctx.tenant!.id,
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
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { id, ...updates } = input;
        await db.update(daCompetitorWatchlist)
          .set({ ...updates, updatedAt: new Date() } as any)
          .where(and(
            eq(daCompetitorWatchlist.id, id),
            eq(daCompetitorWatchlist.tenantId, ctx.tenant!.id),
          ));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.delete(daCompetitorWatchlist)
          .where(and(
            eq(daCompetitorWatchlist.id, input.id),
            eq(daCompetitorWatchlist.tenantId, ctx.tenant!.id),
          ));
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

  competitorStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const watchlist = await db.select()
      .from(daCompetitorWatchlist)
      .where(and(
        eq(daCompetitorWatchlist.tenantId, ctx.tenant!.id),
        eq(daCompetitorWatchlist.active, true),
      ));

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
  suburbBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const watchlist = await db.select()
      .from(daCompetitorWatchlist)
      .where(and(
        eq(daCompetitorWatchlist.tenantId, ctx.tenant!.id),
        eq(daCompetitorWatchlist.active, true),
      ));

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
      .mutation(async ({ ctx, input }) => {
        return runClientDaMatching({
          leadIds: input.leadIds || undefined,
          forceRefresh: input.forceRefresh,
          tenantId: ctx.tenant!.id,
        });
      }),

    // Get matches for a specific lead
    getByLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select()
          .from(clientDas)
          .where(and(
            eq(clientDas.tenantId, ctx.tenant!.id),
            eq(clientDas.leadId, input.leadId),
          ))
          .orderBy(desc(clientDas.lodgementDate));
      }),

    // Get matches for a specific quote
    getByQuote: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select()
          .from(clientDas)
          .where(and(
            eq(clientDas.tenantId, ctx.tenant!.id),
            eq(clientDas.quoteId, input.quoteId),
          ))
          .orderBy(desc(clientDas.lodgementDate));
      }),

    // Get all "lost to competitor" matches (competitor DAs at our lead addresses)
        lostToCompetitor: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).optional().default(50),
        offset: z.number().min(0).optional().default(0),
        companyName: z.string().optional(),
        unattributed: z.boolean().optional(),
        ours: z.boolean().optional().default(false),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const conditions: any[] = [
          eq(clientDas.tenantId, ctx.tenant!.id),
          eq(clientDas.isOurs, input.ours),
        ];
        if (input.ours) {
          // Associated DAs are shown as a reviewable list regardless of applicant/company.
        } else if (input.unattributed) {
          conditions.push(sql`(${clientDas.companyName} IS NULL OR ${clientDas.companyName} = '')`);
        } else if (input.companyName) {
          conditions.push(like(clientDas.companyName, `%${input.companyName}%`));
        }

        const where = and(...conditions);

        const rows = await db.select({
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
            isOurs: clientDas.isOurs,
            centroidLat: clientDas.centroidLat,
            centroidLng: clientDas.centroidLng,
          })
            .from(clientDas)
            .where(where)
            .orderBy(desc(clientDas.lodgementDate))
            .limit(2000);

        const deduped = dedupeClientDaRows(rows);
        const items = deduped.slice(input.offset, input.offset + input.limit);

        return { items, total: deduped.length };
      }),

    // Summary stats
    stats: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { totalMatches: 0, oursCount: 0, competitorCount: 0, topCompetitors: [] };

      const rows = await db.select({
        id: clientDas.id,
        daNumber: clientDas.daNumber,
        companyName: clientDas.companyName,
        streetAddress: clientDas.streetAddress,
        suburb: clientDas.suburb,
        isOurs: clientDas.isOurs,
        matchType: clientDas.matchType,
        lodgementDate: clientDas.lodgementDate,
      })
        .from(clientDas)
        .where(eq(clientDas.tenantId, ctx.tenant!.id))
        .orderBy(desc(clientDas.lodgementDate), asc(clientDas.id))
        .limit(5000);

      const canonicalRows = dedupeClientDaRows(rows);
      const topCompetitorMap = new Map<string, number>();
      for (const row of canonicalRows) {
        if (!row.isOurs && row.companyName?.trim()) {
          topCompetitorMap.set(row.companyName, (topCompetitorMap.get(row.companyName) || 0) + 1);
        }
      }
      const topCompetitors = Array.from(topCompetitorMap.entries())
        .map(([companyName, count]) => ({ companyName, count }))
        .sort((a, b) => b.count - a.count || a.companyName.localeCompare(b.companyName))
        .slice(0, 10);

      return {
        totalMatches: canonicalRows.length,
        oursCount: canonicalRows.filter((row) => row.isOurs).length,
        competitorCount: canonicalRows.filter((row) => !row.isOurs).length,
        topCompetitors,
      };
    }),

    // Delete a match
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.delete(clientDas)
          .where(and(
            eq(clientDas.id, input.id),
            eq(clientDas.tenantId, ctx.tenant!.id),
          ));
        return { ok: true };
      }),

    // Assign builder/company name to an unattributed DA
    assignBuilder: protectedProcedure
      .input(z.object({
        id: z.number(),
        companyName: z.string().min(1).max(255),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        await db.update(clientDas)
          .set({ companyName: input.companyName, updatedAt: new Date() })
          .where(and(
            eq(clientDas.id, input.id),
            eq(clientDas.tenantId, ctx.tenant!.id),
          ));
        return { ok: true };
      }),

    // Manually override whether a matched ACT DA belongs to us.
    setOwnership: protectedProcedure
      .input(z.object({
        id: z.number(),
        isOurs: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const [target] = await db.select({
          daNumber: clientDas.daNumber,
          companyName: clientDas.companyName,
          streetAddress: clientDas.streetAddress,
          suburb: clientDas.suburb,
        })
          .from(clientDas)
          .where(and(
            eq(clientDas.id, input.id),
            eq(clientDas.tenantId, ctx.tenant!.id),
          ))
          .limit(1);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "DA match not found" });

        await db.update(clientDas)
          .set({
            isOurs: input.isOurs,
            matchType: "manual",
            updatedAt: new Date(),
          })
          .where(and(
            eq(clientDas.tenantId, ctx.tenant!.id),
            eq(clientDas.daNumber, target.daNumber),
            sql`coalesce(${clientDas.companyName}, '') = ${target.companyName ?? ""}`,
            sql`coalesce(${clientDas.streetAddress}, '') = ${target.streetAddress ?? ""}`,
            sql`coalesce(${clientDas.suburb}, '') = ${target.suburb ?? ""}`,
          ));
        return { ok: true };
      }),
  }),
});
