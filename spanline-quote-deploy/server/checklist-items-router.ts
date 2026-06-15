import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { checklistItems } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

// ─── DB Helpers ──────────────────────────────────────────────────────────────

async function listAllChecklistItems() {
  const db = (await getDb())!;
  return db.select().from(checklistItems).orderBy(asc(checklistItems.section), asc(checklistItems.sortOrder));
}

async function listActiveChecklistItems() {
  const db = (await getDb())!;
  return db.select().from(checklistItems).where(eq(checklistItems.isActive, true)).orderBy(asc(checklistItems.section), asc(checklistItems.sortOrder));
}

async function createChecklistItem(data: {
  section: string;
  label: string;
  unitPrice: string;
  unit: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const db = (await getDb())!;
  const [result] = await db.insert(checklistItems).values({
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
}>) {
  const db = (await getDb())!;
  await db.update(checklistItems).set(data).where(eq(checklistItems.id, id));
}

async function deleteChecklistItem(id: number) {
  const db = (await getDb())!;
  await db.delete(checklistItems).where(eq(checklistItems.id, id));
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const checklistItemsRouter = router({
  // All users can read active items (for spec sheet)
  listActive: protectedProcedure.query(async () => {
    return listActiveChecklistItems();
  }),

  // Admin: list all items (including inactive)
  listAll: adminProcedure.query(async () => {
    return listAllChecklistItems();
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
    .mutation(async ({ input }) => {
      const id = await createChecklistItem(input);
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
    .mutation(async ({ input }) => {
      await updateChecklistItem(input.id, input.data);
      return { success: true };
    }),

  // Admin: delete item
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteChecklistItem(input.id);
      return { success: true };
    }),

  // Admin: bulk reorder
  reorder: adminProcedure
    .input(z.object({
      items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      for (const item of input.items) {
        await db.update(checklistItems).set({ sortOrder: item.sortOrder }).where(eq(checklistItems.id, item.id));
      }
      return { success: true };
    }),
});
