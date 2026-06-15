import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { branches } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const branchesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(branches).where(eq(branches.isActive, true));
  }),

  listAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(branches);
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      smsNumber: z.string().optional(),
      managerUserId: z.number().nullable().optional(),
      managerName: z.string().nullable().optional(),
      managerEmail: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [result] = await db.insert(branches).values(input);
      return { id: result.insertId };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      smsNumber: z.string().optional(),
      managerUserId: z.number().nullable().optional(),
      managerName: z.string().nullable().optional(),
      managerEmail: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db.update(branches).set(data).where(eq(branches.id, id));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(branches).set({ isActive: false }).where(eq(branches.id, input.id));
      return { success: true };
    }),
});
