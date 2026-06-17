/**
 * Territory Management Router
 * Admin CRUD for territory → branch → postcode mappings.
 * Used by the Territory Management admin page and the Zapier API auto-allocation.
 */
import { z } from "zod";
import { tenantAdminProcedure, tenantProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { territoryPostcodes, branches } from "../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

function territoryScope(ctx: any, ...conditions: any[]) {
  appendTenantScope(conditions, territoryPostcodes.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function assertBranchBelongsToTenant(db: any, branchId: number, tenantId: number | null) {
  const conditions: any[] = [eq(branches.id, branchId)];
  appendTenantScope(conditions, branches.tenantId, tenantId);
  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(...conditions))
    .limit(1);
  if (!branch) throw new Error("Branch not found for this tenant");
}

export const territoryRouter = router({
  /**
   * List all territories grouped by territory name with their postcodes and branch info.
   */
  list: tenantProcedure.query(async ({ ctx }) => {
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
      .where(and(...territoryScope(ctx)))
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
  addPostcodes: tenantAdminProcedure
    .input(z.object({
      territory: z.string().min(1),
      branchId: z.number(),
      postcodes: z.array(z.string().min(1)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = tenantIdFromContext(ctx);
      await assertBranchBelongsToTenant(db, input.branchId, tenantId);

      const values = input.postcodes.map(pc => ({
        tenantId,
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
  removePostcodes: tenantAdminProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(territoryPostcodes).where(and(...territoryScope(ctx, inArray(territoryPostcodes.id, input.ids))));
      return { removed: input.ids.length };
    }),

  /**
   * Rename a territory.
   */
  rename: tenantAdminProcedure
    .input(z.object({
      oldName: z.string().min(1),
      newName: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(territoryPostcodes)
        .set({ territory: input.newName })
        .where(and(...territoryScope(ctx, eq(territoryPostcodes.territory, input.oldName))));
      return { success: true };
    }),

  /**
   * Change the branch assignment for an entire territory.
   */
  changeBranch: tenantAdminProcedure
    .input(z.object({
      territory: z.string().min(1),
      branchId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await assertBranchBelongsToTenant(db, input.branchId, tenantIdFromContext(ctx));
      await db.update(territoryPostcodes)
        .set({ branchId: input.branchId })
        .where(and(...territoryScope(ctx, eq(territoryPostcodes.territory, input.territory))));
      return { success: true };
    }),

  /**
   * Delete an entire territory (removes all its postcodes).
   */
  deleteTerritory: tenantAdminProcedure
    .input(z.object({ territory: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(territoryPostcodes).where(and(...territoryScope(ctx, eq(territoryPostcodes.territory, input.territory))));
      return { success: true };
    }),

  /**
   * Look up branch for a given postcode (used by API auto-allocation).
   * Returns the first matching territory's branchId (priority = order of territory creation).
   */
  lookupPostcode: tenantProcedure
    .input(z.object({ postcode: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select({ branchId: territoryPostcodes.branchId, territory: territoryPostcodes.territory })
        .from(territoryPostcodes)
        .where(and(...territoryScope(ctx, eq(territoryPostcodes.postcode, input.postcode.trim()))))
        .limit(1);
      return row || null;
    }),

  /**
   * Territory coverage report: returns all mapped postcodes grouped by territory/branch,
   * plus a list of postcodes from CRM leads that are NOT in any territory.
   */
  coverageReport: tenantProcedure.query(async ({ ctx }) => {
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
      .where(and(...territoryScope(ctx)))
      .orderBy(territoryPostcodes.territory, territoryPostcodes.postcode);

    // Get all unique postcodes from CRM leads
    const { crmLeads } = await import("../drizzle/schema");
    const leadConditions: any[] = [sql`${crmLeads.postcode} IS NOT NULL AND ${crmLeads.postcode} != ''`];
    appendTenantScope(leadConditions, crmLeads.tenantId, tenantIdFromContext(ctx));
    const leadPostcodes = await db
      .selectDistinct({ postcode: crmLeads.postcode })
      .from(crmLeads)
      .where(and(...leadConditions));

    // Build set of mapped postcodes
    const mappedSet = new Set(mappedRows.map(r => r.postcode));

    // Find unmapped postcodes from leads
    const unmapped = leadPostcodes
      .filter(lp => lp.postcode && !mappedSet.has(lp.postcode))
      .map(lp => lp.postcode!);

    // Count leads per unmapped postcode
    const unmappedWithCounts: { postcode: string; leadCount: number }[] = [];
    if (unmapped.length > 0) {
      const leadCountConditions: any[] = [inArray(crmLeads.postcode, unmapped)];
      appendTenantScope(leadCountConditions, crmLeads.tenantId, tenantIdFromContext(ctx));
      const counts = await db
        .select({
          postcode: crmLeads.postcode,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(crmLeads)
        .where(and(...leadCountConditions))
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
export async function getBranchIdForPostcodeFromDb(postcode: string | undefined | null, tenantId?: number | null): Promise<{ branchId: number; territory: string } | null> {
  if (!postcode) return null;
  const db = await getDb();
  if (!db) return null;
  const cleaned = postcode.trim();
  const conditions: any[] = [eq(territoryPostcodes.postcode, cleaned)];
  appendTenantScope(conditions, territoryPostcodes.tenantId, tenantId);
  const [row] = await db
    .select({ branchId: territoryPostcodes.branchId, territory: territoryPostcodes.territory })
    .from(territoryPostcodes)
    .where(and(...conditions))
    .limit(1);
  return row || null;
}

/**
 * Get branch manager info for a given branchId.
 */
export async function getBranchManager(branchId: number, tenantId?: number | null): Promise<{ managerUserId: number | null; managerName: string | null; email: string | null; managerEmail: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [eq(branches.id, branchId)];
  appendTenantScope(conditions, branches.tenantId, tenantId);
  const [row] = await db
    .select({
      managerUserId: branches.managerUserId,
      managerName: branches.managerName,
      email: branches.email,
      managerEmail: branches.managerEmail,
    })
    .from(branches)
    .where(and(...conditions))
    .limit(1);
  return row || null;
}
