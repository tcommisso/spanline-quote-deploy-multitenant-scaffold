import { z } from "zod";
import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { checklistItems } from "../drizzle/schema";
import { and, eq, asc } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

// ─── DB Helpers ──────────────────────────────────────────────────────────────

function checklistTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, checklistItems.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function listAllChecklistItems(ctx: any) {
  const db = (await getDb())!;
  return db
    .select()
    .from(checklistItems)
    .where(and(...checklistTenantConditions(ctx)))
    .orderBy(asc(checklistItems.section), asc(checklistItems.sortOrder));
}

async function listActiveChecklistItems(ctx: any) {
  const db = (await getDb())!;
  return db
    .select()
    .from(checklistItems)
    .where(and(...checklistTenantConditions(ctx, eq(checklistItems.isActive, true))))
    .orderBy(asc(checklistItems.section), asc(checklistItems.sortOrder));
}

async function createChecklistItem(data: {
  section: string;
  label: string;
  unitPrice: string;
  unit: string;
  sortOrder?: number;
  isActive?: boolean;
}, ctx: any) {
  const db = (await getDb())!;
  const [result] = await db.insert(checklistItems).values({
    tenantId: tenantIdFromContext(ctx),
    section: data.section,
    label: data.label,
    unitPrice: data.unitPrice,
    unit: data.unit,
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
  });
  return result.insertId;
}

async function updateChecklistItem(id: number, data: Partial<{
  section: string;
  label: string;
  unitPrice: string;
  unit: string;
  sortOrder: number;
  isActive: boolean;
}>, ctx: any) {
  const db = (await getDb())!;
  await db
    .update(checklistItems)
    .set(data)
    .where(and(...checklistTenantConditions(ctx, eq(checklistItems.id, id))));
}

async function deleteChecklistItem(id: number, ctx: any) {
  const db = (await getDb())!;
  await db
    .delete(checklistItems)
    .where(and(...checklistTenantConditions(ctx, eq(checklistItems.id, id))));
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const checklistItemsRouter = router({
  // All users can read active items (for spec sheet)
  listActive: protectedProcedure.query(async ({ ctx }) => {
    return listActiveChecklistItems(ctx);
  }),

  // Admin: list all items (including inactive)
  listAll: adminProcedure.query(async ({ ctx }) => {
    return listAllChecklistItems(ctx);
  }),

  // Admin: create new item
  create: adminProcedure
    .input(z.object({
      section: z.string().min(1),
      label: z.string().min(1),
      unitPrice: z.string().min(1),
      unit: z.enum(["each", "m", "m2", "lump"]),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createChecklistItem(input, ctx);
      return { id };
    }),

  // Admin: update item
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        section: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
        unitPrice: z.string().optional(),
        unit: z.enum(["each", "m", "m2", "lump"]).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateChecklistItem(input.id, input.data, ctx);
      return { success: true };
    }),

  // Admin: delete item
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteChecklistItem(input.id, ctx);
      return { success: true };
    }),

  // Admin: bulk reorder
  reorder: adminProcedure
    .input(z.object({
      items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      for (const item of input.items) {
        await db
          .update(checklistItems)
          .set({ sortOrder: item.sortOrder })
          .where(and(...checklistTenantConditions(ctx, eq(checklistItems.id, item.id))));
      }
      return { success: true };
    }),
});
