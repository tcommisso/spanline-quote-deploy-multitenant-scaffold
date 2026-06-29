import { z } from "zod";
import { tenantProcedure, tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { branches, designAdvisors, tenantMemberships, users } from "../drizzle/schema";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { privateTenantConditions } from "./private-tenant-scope";

async function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  return privateTenantConditions(ctx, branches.tenantId, ...baseConditions);
}

const NO_DEFAULT_CONTACT = "__none";
const defaultContactSelection = z.union([z.number(), z.string()]).nullable().optional();
const defaultContactFieldNames = [
  "defaultBranchAdminStaffId",
  "defaultConstructionManagerStaffId",
  "defaultFinanceStaffId",
] as const;
type DefaultContactFieldName = typeof defaultContactFieldNames[number];
type DefaultContactDbValues = Partial<Record<DefaultContactFieldName, number | null | undefined>>;
const defaultContactFields: Record<DefaultContactFieldName, typeof defaultContactSelection> = {
  defaultBranchAdminStaffId: defaultContactSelection,
  defaultConstructionManagerStaffId: defaultContactSelection,
  defaultFinanceStaffId: defaultContactSelection,
};

function normaliseEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

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

async function resolveDefaultContactSelection(ctx: any, db: any, selection: number | string | null | undefined) {
  if (selection === undefined) return undefined;
  if (selection === null || selection === "" || selection === NO_DEFAULT_CONTACT) return null;

  if (typeof selection === "number" || /^\d+$/.test(selection)) {
    const staffId = Number(selection);
    await assertDefaultStaffAccess(ctx, db, [staffId]);
    return staffId;
  }

  const [kind, rawId] = selection.split(":");
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid default client contact selection");
  }

  if (kind === "staff") {
    await assertDefaultStaffAccess(ctx, db, [id]);
    return id;
  }

  if (kind !== "user") {
    throw new Error("Invalid default client contact selection");
  }

  const [tenantUser] = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
  })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(
      eq(tenantMemberships.tenantId, ctx.tenant!.id),
      eq(users.id, id),
    ))
    .limit(1);

  if (!tenantUser) {
    throw new Error("Selected default client contact is not a user for this tenant");
  }

  const identityCondition = tenantUser.email
    ? or(eq(designAdvisors.userId, tenantUser.id), eq(designAdvisors.email, tenantUser.email))
    : eq(designAdvisors.userId, tenantUser.id);
  const [existingStaff] = await db.select()
    .from(designAdvisors)
    .where(and(...await privateTenantConditions(ctx, designAdvisors.tenantId, identityCondition)))
    .limit(1);

  if (existingStaff) {
    const updates: Record<string, unknown> = {};
    if (!existingStaff.tenantId) updates.tenantId = ctx.tenant!.id;
    if (!existingStaff.userId) updates.userId = tenantUser.id;
    if (!existingStaff.email && tenantUser.email) updates.email = tenantUser.email;
    if (!existingStaff.name && tenantUser.name) updates.name = tenantUser.name;
    if (existingStaff.archived) updates.archived = false;
    if (Object.keys(updates).length > 0) {
      await db.update(designAdvisors).set(updates).where(eq(designAdvisors.id, existingStaff.id));
    }
    return existingStaff.id;
  }

  const [result] = await db.insert(designAdvisors).values({
    tenantId: ctx.tenant!.id,
    userId: tenantUser.id,
    name: tenantUser.name || tenantUser.email || `User #${tenantUser.id}`,
    email: tenantUser.email || null,
    role: tenantUser.role || "user",
    archived: false,
  }).$returningId();
  return result.id;
}

async function resolveDefaultContactSelections(ctx: any, db: any, input: Record<string, unknown>): Promise<DefaultContactDbValues> {
  const resolved: DefaultContactDbValues = {};
  for (const fieldName of defaultContactFieldNames) {
    if (!Object.prototype.hasOwnProperty.call(input, fieldName)) continue;
    resolved[fieldName] = await resolveDefaultContactSelection(
      ctx,
      db,
      input[fieldName] as number | string | null | undefined,
    );
  }
  return resolved;
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

  defaultContactOptions: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const tenantUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id))
      .orderBy(asc(users.name));

    const staffRows = await db.select({
      id: designAdvisors.id,
      userId: designAdvisors.userId,
      name: designAdvisors.name,
      email: designAdvisors.email,
      phone: designAdvisors.phone,
      role: designAdvisors.role,
      profileDescription: designAdvisors.profileDescription,
      photoUrl: designAdvisors.photoUrl,
    })
      .from(designAdvisors)
      .where(and(
        ...await privateTenantConditions(ctx, designAdvisors.tenantId, eq(designAdvisors.archived, false)),
      ))
      .orderBy(asc(designAdvisors.name));

    const staffByUserId = new Map(staffRows.filter((staff) => staff.userId).map((staff) => [staff.userId!, staff]));
    const staffByEmail = new Map(staffRows
      .filter((staff) => normaliseEmail(staff.email))
      .map((staff) => [normaliseEmail(staff.email), staff]));
    const matchedStaffIds = new Set<number>();

    const options: Array<{
      value: string;
      source: "staff" | "user";
      userId: number | null;
      staffId: number | null;
      name: string;
      email: string | null;
      phone: string | null;
      role: string | null;
      profileDescription: string | null;
      photoUrl: string | null;
    }> = tenantUsers.map((tenantUser) => {
      const matchingStaff = staffByUserId.get(tenantUser.id) ?? staffByEmail.get(normaliseEmail(tenantUser.email));
      if (matchingStaff) matchedStaffIds.add(matchingStaff.id);
      return {
        value: matchingStaff ? `staff:${matchingStaff.id}` : `user:${tenantUser.id}`,
        source: matchingStaff ? "staff" as const : "user" as const,
        userId: tenantUser.id,
        staffId: matchingStaff?.id ?? null,
        name: matchingStaff?.name || tenantUser.name || tenantUser.email || `User #${tenantUser.id}`,
        email: matchingStaff?.email || tenantUser.email || null,
        phone: matchingStaff?.phone || null,
        role: matchingStaff?.role || tenantUser.role,
        profileDescription: matchingStaff?.profileDescription || null,
        photoUrl: matchingStaff?.photoUrl || null,
      };
    });

    for (const staff of staffRows) {
      if (matchedStaffIds.has(staff.id)) continue;
      options.push({
        value: `staff:${staff.id}`,
        source: "staff" as const,
        userId: staff.userId || null,
        staffId: staff.id,
        name: staff.name,
        email: staff.email || null,
        phone: staff.phone || null,
        role: staff.role,
        profileDescription: staff.profileDescription || null,
        photoUrl: staff.photoUrl || null,
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
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
      const defaultContactValues = await resolveDefaultContactSelections(ctx, db, input);
      const {
        defaultBranchAdminStaffId,
        defaultConstructionManagerStaffId,
        defaultFinanceStaffId,
        ...branchData
      } = input;
      const [result] = await db.insert(branches).values({
        ...branchData,
        ...defaultContactValues,
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
      const {
        id,
        defaultBranchAdminStaffId,
        defaultConstructionManagerStaffId,
        defaultFinanceStaffId,
        ...data
      } = input;
      const defaultContactValues = await resolveDefaultContactSelections(ctx, db, input);
      await db
        .update(branches)
        .set({ ...data, ...defaultContactValues, tenantId: ctx.tenant!.id })
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
