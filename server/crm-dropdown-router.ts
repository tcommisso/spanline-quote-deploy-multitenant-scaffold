import { router, tenantProcedure, tenantAdminProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { crmDropdownOptions } from "../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";

export const crmDropdownRouter = router({
  /**
   * List all options for a given category (or all categories).
   * Public to all authenticated users (they need to populate dropdowns).
   */
  list: tenantProcedure
    .input(z.object({
      category: z.string().optional(),
      activeOnly: z.boolean().optional().default(true),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(crmDropdownOptions.tenantId, ctx.tenant!.id)];
      if (input.category) conditions.push(eq(crmDropdownOptions.category, input.category));
      if (input.activeOnly) conditions.push(eq(crmDropdownOptions.active, true));

      const rows = await db.select()
        .from(crmDropdownOptions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(crmDropdownOptions.category), asc(crmDropdownOptions.sortOrder));

      return rows;
    }),

  /**
   * List all distinct categories.
   */
  categories: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.selectDistinct({ category: crmDropdownOptions.category })
      .from(crmDropdownOptions)
      .where(eq(crmDropdownOptions.tenantId, ctx.tenant!.id));
    return rows.map(r => r.category);
  }),

  /**
   * Create a new dropdown option (admin only).
   */
  create: tenantAdminProcedure
    .input(z.object({
      category: z.string().min(1).max(64),
      value: z.string().min(1).max(128),
      label: z.string().min(1).max(128),
      sortOrder: z.number().int().optional().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [result] = await db.insert(crmDropdownOptions).values({
        tenantId: ctx.tenant!.id,
        category: input.category,
        value: input.value,
        label: input.label,
        sortOrder: input.sortOrder,
      });
      return { id: result.insertId };
    }),

  /**
   * Update an existing dropdown option (admin only).
   */
  update: tenantAdminProcedure
    .input(z.object({
      id: z.number(),
      value: z.string().min(1).max(128).optional(),
      label: z.string().min(1).max(128).optional(),
      sortOrder: z.number().int().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const updates: Record<string, any> = {};
      if (input.value !== undefined) updates.value = input.value;
      if (input.label !== undefined) updates.label = input.label;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.active !== undefined) updates.active = input.active;

      if (Object.keys(updates).length > 0) {
        await db
          .update(crmDropdownOptions)
          .set(updates)
          .where(and(eq(crmDropdownOptions.id, input.id), eq(crmDropdownOptions.tenantId, ctx.tenant!.id)));
      }
      return { success: true };
    }),

  /**
   * Delete a dropdown option (admin only).
   */
  delete: tenantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .delete(crmDropdownOptions)
        .where(and(eq(crmDropdownOptions.id, input.id), eq(crmDropdownOptions.tenantId, ctx.tenant!.id)));
      return { success: true };
    }),

  /**
   * Bulk reorder options within a category (admin only).
   */
  reorder: tenantAdminProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.number(),
        sortOrder: z.number().int(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      for (const item of input.items) {
        await db.update(crmDropdownOptions)
          .set({ sortOrder: item.sortOrder })
          .where(and(eq(crmDropdownOptions.id, item.id), eq(crmDropdownOptions.tenantId, ctx.tenant!.id)));
      }
      return { success: true };
    }),
});
