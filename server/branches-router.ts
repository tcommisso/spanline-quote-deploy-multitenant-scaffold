import { z } from "zod";
import { tenantProcedure, tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { branches } from "../drizzle/schema";
import { and, asc, eq } from "drizzle-orm";
import { privateTenantConditions } from "./private-tenant-scope";

async function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  return privateTenantConditions(ctx, branches.tenantId, ...baseConditions);
}

export const branchesRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(branches)
      .where(and(...await branchTenantConditions(ctx, eq(branches.isActive, true))))
      .orderBy(asc(branches.name));
  }),

  listAll: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(branches)
      .where(and(...await branchTenantConditions(ctx)))
      .orderBy(asc(branches.name));
  }),

  create: tenantAdminProcedure
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
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [result] = await db.insert(branches).values({
        ...input,
        tenantId: ctx.tenant!.id,
      });
      return { id: result.insertId };
    }),

  update: tenantAdminProcedure
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
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...data } = input;
      await db
        .update(branches)
        .set({ ...data, tenantId: ctx.tenant!.id })
        .where(and(...await branchTenantConditions(ctx, eq(branches.id, id))));
      return { success: true };
    }),

  delete: tenantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(branches)
        .set({ isActive: false, tenantId: ctx.tenant!.id })
        .where(and(...await branchTenantConditions(ctx, eq(branches.id, input.id))));
      return { success: true };
    }),
});
