import { z } from "zod";
import { tenantProcedure, tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { branches, designAdvisors } from "../drizzle/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { privateTenantConditions } from "./private-tenant-scope";

async function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  return privateTenantConditions(ctx, branches.tenantId, ...baseConditions);
}

const defaultContactFields = {
  defaultBranchAdminStaffId: z.number().nullable().optional(),
  defaultConstructionManagerStaffId: z.number().nullable().optional(),
  defaultFinanceStaffId: z.number().nullable().optional(),
};

async function assertDefaultStaffAccess(ctx: any, db: any, staffIds: Array<number | null | undefined>) {
  const ids = Array.from(new Set(staffIds.filter((id): id is number => typeof id === "number")));
  if (ids.length === 0) return;

  const rows = await db.select({ id: designAdvisors.id })
    .from(designAdvisors)
    .where(and(
      ...await privateTenantConditions(ctx, designAdvisors.tenantId, inArray(designAdvisors.id, ids)),
      eq(designAdvisors.archived, false),
    ));

  if (rows.length !== ids.length) {
    throw new Error("One or more default client contacts are not active staff for this tenant");
  }
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
      ...defaultContactFields,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await assertDefaultStaffAccess(ctx, db, [
        input.defaultBranchAdminStaffId,
        input.defaultConstructionManagerStaffId,
        input.defaultFinanceStaffId,
      ]);
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
      ...defaultContactFields,
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await assertDefaultStaffAccess(ctx, db, [
        input.defaultBranchAdminStaffId,
        input.defaultConstructionManagerStaffId,
        input.defaultFinanceStaffId,
      ]);
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
