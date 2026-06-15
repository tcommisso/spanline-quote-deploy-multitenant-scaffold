/**
 * Territory Management Router
 * Admin CRUD for territory → branch → postcode mappings.
 * Used by the Territory Management admin page and the Zapier API auto-allocation.
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { territoryPostcodes, branches } from "../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export const territoryRouter = router({
  /**
   * List all territories grouped by territory name with their postcodes and branch info.
   */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: territoryPostcodes.id,
        territory: territoryPostcodes.territory,
        branchId: territoryPostcodes.branchId,
        postcode: territoryPostcodes.postcode,
      })
      .from(territoryPostcodes)
      .orderBy(territoryPostcodes.territory, territoryPostcodes.postcode);

    // Group by territory
    const grouped: Record<string, { territory: string; branchId: number; postcodes: { id: number; postcode: string }[] }> = {};
    for (const row of rows) {
      if (!grouped[row.territory]) {
        grouped[row.territory] = { territory: row.territory, branchId: row.branchId, postcodes: [] };
      }
      grouped[row.territory].postcodes.push({ id: row.id, postcode: row.postcode });
    }
    return Object.values(grouped);
  }),

  /**
   * Add postcodes to a territory. Creates the territory if it doesn't exist.
   */
  addPostcodes: adminProcedure
    .input(z.object({
      territory: z.string().min(1),
      branchId: z.number(),
      postcodes: z.array(z.string().min(1)).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const values = input.postcodes.map(pc => ({
        territory: input.territory,
        branchId: input.branchId,
        postcode: pc.trim(),
      }));

      // Use INSERT IGNORE to skip duplicates (unique constraint on territory+postcode)
      let inserted = 0;
      for (const val of values) {
        try {
          await db.insert(territoryPostcodes).values(val);
          inserted++;
        } catch (e: any) {
          // Skip duplicate key errors
          if (e?.code === "ER_DUP_ENTRY" || e?.message?.includes("Duplicate")) continue;
          throw e;
        }
      }
      return { inserted, total: values.length };
    }),

  /**
   * Remove specific postcodes from a territory by their IDs.
   */
  removePostcodes: adminProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(territoryPostcodes).where(inArray(territoryPostcodes.id, input.ids));
      return { removed: input.ids.length };
    }),

  /**
   * Rename a territory.
   */
  rename: adminProcedure
    .input(z.object({
      oldName: z.string().min(1),
      newName: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(territoryPostcodes)
        .set({ territory: input.newName })
        .where(eq(territoryPostcodes.territory, input.oldName));
      return { success: true };
    }),

  /**
   * Change the branch assignment for an entire territory.
   */
  changeBranch: adminProcedure
    .input(z.object({
      territory: z.string().min(1),
      branchId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(territoryPostcodes)
        .set({ branchId: input.branchId })
        .where(eq(territoryPostcodes.territory, input.territory));
      return { success: true };
    }),

  /**
   * Delete an entire territory (removes all its postcodes).
   */
  deleteTerritory: adminProcedure
    .input(z.object({ territory: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(territoryPostcodes).where(eq(territoryPostcodes.territory, input.territory));
      return { success: true };
    }),

  /**
   * Look up branch for a given postcode (used by API auto-allocation).
   * Returns the first matching territory's branchId (priority = order of territory creation).
   */
  lookupPostcode: protectedProcedure
    .input(z.object({ postcode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select({ branchId: territoryPostcodes.branchId, territory: territoryPostcodes.territory })
        .from(territoryPostcodes)
        .where(eq(territoryPostcodes.postcode, input.postcode.trim()))
        .limit(1);
      return row || null;
    }),

  /**
   * Territory coverage report: returns all mapped postcodes grouped by territory/branch,
   * plus a list of postcodes from CRM leads that are NOT in any territory.
   */
  coverageReport: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { mapped: [], unmapped: [], stats: { totalMapped: 0, totalUnmapped: 0, totalTerritories: 0 } };

    // Get all mapped postcodes
    const mappedRows = await db
      .select({
        territory: territoryPostcodes.territory,
        branchId: territoryPostcodes.branchId,
        postcode: territoryPostcodes.postcode,
      })
      .from(territoryPostcodes)
      .orderBy(territoryPostcodes.territory, territoryPostcodes.postcode);

    // Get all unique postcodes from CRM leads
    const { crmLeads } = await import("../drizzle/schema");
    const leadPostcodes = await db
      .selectDistinct({ postcode: crmLeads.postcode })
      .from(crmLeads)
      .where(sql`${crmLeads.postcode} IS NOT NULL AND ${crmLeads.postcode} != ''`);

    // Build set of mapped postcodes
    const mappedSet = new Set(mappedRows.map(r => r.postcode));

    // Find unmapped postcodes from leads
    const unmapped = leadPostcodes
      .filter(lp => lp.postcode && !mappedSet.has(lp.postcode))
      .map(lp => lp.postcode!);

    // Count leads per unmapped postcode
    const unmappedWithCounts: { postcode: string; leadCount: number }[] = [];
    if (unmapped.length > 0) {
      const counts = await db
        .select({
          postcode: crmLeads.postcode,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(crmLeads)
        .where(inArray(crmLeads.postcode, unmapped))
        .groupBy(crmLeads.postcode)
        .orderBy(sql`COUNT(*) DESC`);
      for (const c of counts) {
        if (c.postcode) unmappedWithCounts.push({ postcode: c.postcode, leadCount: Number(c.count) });
      }
    }

    // Group mapped by territory
    const grouped: Record<string, { territory: string; branchId: number; postcodes: string[] }> = {};
    for (const row of mappedRows) {
      if (!grouped[row.territory]) {
        grouped[row.territory] = { territory: row.territory, branchId: row.branchId, postcodes: [] };
      }
      grouped[row.territory].postcodes.push(row.postcode);
    }

    const territories = new Set(mappedRows.map(r => r.territory));

    return {
      mapped: Object.values(grouped),
      unmapped: unmappedWithCounts,
      stats: {
        totalMapped: mappedSet.size,
        totalUnmapped: unmappedWithCounts.length,
        totalTerritories: territories.size,
      },
    };
  }),
});

/**
 * DB-backed postcode → branchId lookup for use in zapier-api.ts and other server code.
 * Replaces the static config file lookup.
 */
export async function getBranchIdForPostcodeFromDb(postcode: string | undefined | null): Promise<{ branchId: number; territory: string } | null> {
  if (!postcode) return null;
  const db = await getDb();
  if (!db) return null;
  const cleaned = postcode.trim();
  const [row] = await db
    .select({ branchId: territoryPostcodes.branchId, territory: territoryPostcodes.territory })
    .from(territoryPostcodes)
    .where(eq(territoryPostcodes.postcode, cleaned))
    .limit(1);
  return row || null;
}

/**
 * Get branch manager info for a given branchId.
 */
export async function getBranchManager(branchId: number): Promise<{ managerUserId: number | null; managerName: string | null; email: string | null; managerEmail: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      managerUserId: branches.managerUserId,
      managerName: branches.managerName,
      email: branches.email,
      managerEmail: branches.managerEmail,
    })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row || null;
}
