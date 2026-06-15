import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { specSectionTemplates, quotes } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const sectionTemplatesRouter = router({
  // List all templates (any authenticated user can view)
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(specSectionTemplates).orderBy(specSectionTemplates.name);
    return rows;
  }),

  // Get a single template by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select().from(specSectionTemplates).where(eq(specSectionTemplates.id, input.id));
      return row || null;
    }),

  // Create a template (admin only)
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      hiddenSections: z.array(z.string()),
      sectionOrder: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [result] = await db.insert(specSectionTemplates).values({
        name: input.name,
        description: input.description || null,
        hiddenSections: input.hiddenSections,
        sectionOrder: input.sectionOrder || null,
        createdBy: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  // Update a template (admin only)
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      description: z.string().optional(),
      hiddenSections: z.array(z.string()).optional(),
      sectionOrder: z.array(z.string()).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.hiddenSections !== undefined) updateData.hiddenSections = input.hiddenSections;
      if (input.sectionOrder !== undefined) updateData.sectionOrder = input.sectionOrder;
      await db.update(specSectionTemplates).set(updateData).where(eq(specSectionTemplates.id, input.id));
      return { success: true };
    }),

  // Delete a template (admin only)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(specSectionTemplates).where(eq(specSectionTemplates.id, input.id));
      return { success: true };
    }),

  // ─── Per-Quote Section Preferences ─────────────────────────────────────────

  // Get section preferences for a specific quote
  getQuotePrefs: protectedProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select({ specSectionPrefs: quotes.specSectionPrefs })
        .from(quotes)
        .where(eq(quotes.id, input.quoteId));
      if (!row || !row.specSectionPrefs) return null;
      return row.specSectionPrefs as { sectionOrder?: string[]; hiddenSections?: string[]; templateId?: number };
    }),

  // Save section preferences for a specific quote
  saveQuotePrefs: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      sectionOrder: z.array(z.string()),
      hiddenSections: z.array(z.string()),
      templateId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const prefs = {
        sectionOrder: input.sectionOrder,
        hiddenSections: input.hiddenSections,
        templateId: input.templateId || null,
      };
      await db.update(quotes).set({ specSectionPrefs: prefs } as any).where(eq(quotes.id, input.quoteId));
      return { success: true };
    }),
});
