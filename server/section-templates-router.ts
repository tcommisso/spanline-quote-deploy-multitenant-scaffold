import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure, router } from "./_core/trpc";
import { getDb, getQuoteById } from "./db";
import { specSectionTemplates, quoteDetails } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { appendTenantScope } from "./_core/tenant-scope";

function sectionTemplateConditions(id: number | null, tenantId?: number | null) {
  const conditions: any[] = [];
  if (id != null) conditions.push(eq(specSectionTemplates.id, id));
  appendTenantScope(conditions, specSectionTemplates.tenantId, tenantId);
  return conditions;
}

export const sectionTemplatesRouter = router({
  // List all templates (any authenticated user can view)
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const conditions = sectionTemplateConditions(null, ctx.tenant!.id);
    const rows = await db.select().from(specSectionTemplates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(specSectionTemplates.name);
    return rows;
  }),

  // Get a single template by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select().from(specSectionTemplates)
        .where(and(...sectionTemplateConditions(input.id, ctx.tenant!.id)));
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
        tenantId: ctx.tenant!.id,
        name: input.name,
        description: input.description || null,
        hiddenSections: input.hiddenSections,
        sectionOrder: input.sectionOrder || null,
        createdBy: ctx.user!.id,
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.hiddenSections !== undefined) updateData.hiddenSections = input.hiddenSections;
      if (input.sectionOrder !== undefined) updateData.sectionOrder = input.sectionOrder;
      await db.update(specSectionTemplates).set(updateData)
        .where(and(...sectionTemplateConditions(input.id, ctx.tenant!.id)));
      return { success: true };
    }),

  // Delete a template (admin only)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(specSectionTemplates)
        .where(and(...sectionTemplateConditions(input.id, ctx.tenant!.id)));
      return { success: true };
    }),

  // ─── Per-Quote Section Preferences ─────────────────────────────────────────

  // Get section preferences for a specific quote
  getQuotePrefs: protectedProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const quote = await getQuoteById(input.quoteId, ctx.tenant!.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      const [row] = await db.select()
        .from(quoteDetails)
        .where(eq(quoteDetails.quoteId, input.quoteId));
      const data = (row?.data as Record<string, any> | null) || {};
      if (!data.specSectionPrefs) return null;
      return data.specSectionPrefs as { sectionOrder?: string[]; hiddenSections?: string[]; templateId?: number };
    }),

  // Save section preferences for a specific quote
  saveQuotePrefs: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      sectionOrder: z.array(z.string()),
      hiddenSections: z.array(z.string()),
      templateId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const quote = await getQuoteById(input.quoteId, ctx.tenant!.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      const prefs = {
        sectionOrder: input.sectionOrder,
        hiddenSections: input.hiddenSections,
        templateId: input.templateId || null,
      };
      const [existing] = await db.select()
        .from(quoteDetails)
        .where(eq(quoteDetails.quoteId, input.quoteId))
        .limit(1);
      const data = { ...((existing?.data as Record<string, any> | null) || {}), specSectionPrefs: prefs };
      if (existing) {
        await db.update(quoteDetails).set({ data }).where(eq(quoteDetails.quoteId, input.quoteId));
      } else {
        await db.insert(quoteDetails).values({ quoteId: input.quoteId, data });
      }
      return { success: true };
    }),
});
