import { router, tenantAdminProcedure as adminProcedure, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { supplierCategories, supplierCategoryAssignments, suppliers } from "../drizzle/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function supplierTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, suppliers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function categoryTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, supplierCategories.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireSupplierAccess(db: any, ctx: any, supplierId: number) {
  const [supplier] = await db.select({ id: suppliers.id })
    .from(suppliers)
    .where(and(...supplierTenantConditions(ctx, eq(suppliers.id, supplierId))))
    .limit(1);
  if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });
  return supplier;
}

async function requireCategoryAccess(db: any, ctx: any, categoryId: number) {
  const [category] = await db.select({ id: supplierCategories.id })
    .from(supplierCategories)
    .where(and(...categoryTenantConditions(ctx, eq(supplierCategories.id, categoryId))))
    .limit(1);
  if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier category not found" });
  return category;
}

export const supplierCategoryRouter = router({
  /**
   * List all active supplier categories (ordered by sortOrder)
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(supplierCategories)
      .where(and(...categoryTenantConditions(ctx, eq(supplierCategories.isActive, true))))
      .orderBy(asc(supplierCategories.sortOrder));
  }),

  /**
   * List ALL categories including inactive (for admin management)
   */
  listAll: adminProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(supplierCategories)
      .where(and(...categoryTenantConditions(ctx)))
      .orderBy(asc(supplierCategories.sortOrder));
  }),

  /**
   * Create a new supplier category
   */
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Get the max sortOrder to append at end
      const existing = await db.select({ sortOrder: supplierCategories.sortOrder })
        .from(supplierCategories)
        .where(and(...categoryTenantConditions(ctx)))
        .orderBy(asc(supplierCategories.sortOrder));
      const maxSort = existing.length > 0 ? Math.max(...existing.map(e => e.sortOrder)) : 0;
      const [result] = await db.insert(supplierCategories).values({
        tenantId: tenantIdFromContext(ctx),
        name: input.name,
        color: input.color || "#6B7280",
        sortOrder: maxSort + 1,
      });
      return { id: result.insertId };
    }),

  /**
   * Update a supplier category (name, color, active status)
   */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const { id, ...data } = input;
      await requireCategoryAccess(db, ctx, id);
      await db.update(supplierCategories).set(data).where(and(...categoryTenantConditions(ctx, eq(supplierCategories.id, id))));
      return { success: true };
    }),

  /**
   * Reorder categories (pass array of ids in desired order)
   */
  reorder: adminProcedure
    .input(z.object({
      ids: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      for (const id of input.ids) {
        await requireCategoryAccess(db, ctx, id);
      }
      for (let i = 0; i < input.ids.length; i++) {
        await db.update(supplierCategories)
          .set({ sortOrder: i + 1 })
          .where(and(...categoryTenantConditions(ctx, eq(supplierCategories.id, input.ids[i]))));
      }
      return { success: true };
    }),

  /**
   * Delete a supplier category (soft delete)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireCategoryAccess(db, ctx, input.id);
      await db.update(supplierCategories)
        .set({ isActive: false })
        .where(and(...categoryTenantConditions(ctx, eq(supplierCategories.id, input.id))));
      return { success: true };
    }),

  /**
   * Get categories assigned to a specific supplier
   */
  getForSupplier: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireSupplierAccess(db, ctx, input.supplierId);
      const assignments = await db.select({
        categoryId: supplierCategoryAssignments.categoryId,
        name: supplierCategories.name,
        color: supplierCategories.color,
      })
        .from(supplierCategoryAssignments)
        .innerJoin(supplierCategories, eq(supplierCategoryAssignments.categoryId, supplierCategories.id))
        .where(and(
          ...categoryTenantConditions(ctx),
          eq(supplierCategoryAssignments.supplierId, input.supplierId),
          eq(supplierCategories.isActive, true),
        ));
      return assignments;
    }),

  /**
   * Get category assignments for multiple suppliers (batch)
   */
  getForSuppliers: protectedProcedure
    .input(z.object({ supplierIds: z.array(z.number()) }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      if (input.supplierIds.length === 0) return {};
      const visibleSuppliers = await db.select({ id: suppliers.id })
        .from(suppliers)
        .where(and(...supplierTenantConditions(ctx, inArray(suppliers.id, input.supplierIds))));
      const visibleSupplierIds = visibleSuppliers.map((supplier: any) => supplier.id);
      if (visibleSupplierIds.length === 0) return {};
      const assignments = await db.select({
        supplierId: supplierCategoryAssignments.supplierId,
        categoryId: supplierCategoryAssignments.categoryId,
        name: supplierCategories.name,
        color: supplierCategories.color,
      })
        .from(supplierCategoryAssignments)
        .innerJoin(supplierCategories, eq(supplierCategoryAssignments.categoryId, supplierCategories.id))
        .where(and(
          ...categoryTenantConditions(ctx),
          inArray(supplierCategoryAssignments.supplierId, visibleSupplierIds),
          eq(supplierCategories.isActive, true),
        ));
      // Group by supplierId
      const grouped: Record<number, Array<{ categoryId: number; name: string; color: string | null }>> = {};
      for (const a of assignments) {
        if (!grouped[a.supplierId]) grouped[a.supplierId] = [];
        grouped[a.supplierId].push({ categoryId: a.categoryId, name: a.name, color: a.color });
      }
      return grouped;
    }),

  /**
   * Set categories for a supplier (replaces all existing assignments)
   */
  setForSupplier: adminProcedure
    .input(z.object({
      supplierId: z.number(),
      categoryIds: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireSupplierAccess(db, ctx, input.supplierId);
      for (const categoryId of input.categoryIds) {
        await requireCategoryAccess(db, ctx, categoryId);
      }
      // Remove all existing assignments
      await db.delete(supplierCategoryAssignments)
        .where(eq(supplierCategoryAssignments.supplierId, input.supplierId));
      // Insert new assignments
      if (input.categoryIds.length > 0) {
        await db.insert(supplierCategoryAssignments).values(
          input.categoryIds.map(categoryId => ({
            supplierId: input.supplierId,
            categoryId,
          }))
        );
      }
      return { success: true };
    }),
});
