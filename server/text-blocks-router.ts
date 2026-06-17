import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { textBlocks } from "../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appendTenantScope } from "./_core/tenant-scope";

const VALID_CATEGORIES = ["Engineering", "Specifications"] as const;

export const textBlocksRouter = router({
  /** List text blocks, optionally filtered by category */
  list: protectedProcedure
    .input(z.object({
      category: z.enum(VALID_CATEGORIES).optional(),
      activeOnly: z.boolean().optional().default(true),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      appendTenantScope(conditions, textBlocks.tenantId, ctx.tenant!.id);
      if (input?.activeOnly !== false) {
        conditions.push(eq(textBlocks.isActive, true));
      }
      if (input?.category) {
        conditions.push(eq(textBlocks.category, input.category));
      }
      return db.select().from(textBlocks)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(textBlocks.sortOrder), asc(textBlocks.title));
    }),

  /** Get a single text block by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions: any[] = [eq(textBlocks.id, input.id)];
      appendTenantScope(conditions, textBlocks.tenantId, ctx.tenant!.id);
      const [block] = await db.select().from(textBlocks)
        .where(and(...conditions)).limit(1);
      if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Text block not found" });
      return block;
    }),

  /** Create a new text block */
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      category: z.enum(VALID_CATEGORIES),
      content: z.string().min(1),
      imageUrl: z.string().nullable().optional(),
      imageKey: z.string().nullable().optional(),
      sortOrder: z.number().optional().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [result] = await db.insert(textBlocks).values({
        tenantId: ctx.tenant!.id,
        title: input.title,
        category: input.category,
        content: input.content,
        imageUrl: input.imageUrl || null,
        imageKey: input.imageKey || null,
        sortOrder: input.sortOrder,
      });
      return { id: result.insertId };
    }),

  /** Update an existing text block */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      category: z.enum(VALID_CATEGORIES).optional(),
      content: z.string().min(1).optional(),
      imageUrl: z.string().nullable().optional(),
      imageKey: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      const conditions: any[] = [eq(textBlocks.id, id)];
      appendTenantScope(conditions, textBlocks.tenantId, ctx.tenant!.id);
      await db.update(textBlocks).set(data).where(and(...conditions));
      return { success: true };
    }),

  /** Delete (soft) a text block */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const conditions: any[] = [eq(textBlocks.id, input.id)];
      appendTenantScope(conditions, textBlocks.tenantId, ctx.tenant!.id);
      await db.update(textBlocks).set({ isActive: false }).where(and(...conditions));
      return { success: true };
    }),

  /** Reorder text blocks within a category */
  reorder: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.number(),
        sortOrder: z.number(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await Promise.all(
        input.items.map(item =>
          db.update(textBlocks)
            .set({ sortOrder: item.sortOrder })
            .where(and(
              eq(textBlocks.id, item.id),
              eq(textBlocks.tenantId, ctx.tenant!.id),
            ))
        )
      );
      return { success: true };
    }),

  /** Associate an image with a text block */
  associateImage: adminProcedure
    .input(z.object({
      id: z.number(),
      imageUrl: z.string().nullable(),
      imageKey: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(textBlocks).set({
        imageUrl: input.imageUrl,
        imageKey: input.imageKey,
      }).where(and(
        eq(textBlocks.id, input.id),
        eq(textBlocks.tenantId, ctx.tenant!.id),
      ));
      return { success: true };
    }),
});
