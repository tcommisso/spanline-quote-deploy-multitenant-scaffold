import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { tenantIntegrationSettings, tenantMemberships, tenants, users } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router, sensitiveSuperAdminProcedure, tenantAdminProcedure } from "./_core/trpc";
import {
  TENANT_INTEGRATION_SERVICES,
  fallbackIntegrationConfig,
  redactIntegrationConfig,
} from "./tenant-integrations";

const tenantRoleSchema = z.enum(["owner", "admin", "member", "billing"]);
const tenantIntegrationServiceSchema = z.enum(TENANT_INTEGRATION_SERVICES);

export const tenantRouter = router({
  current: protectedProcedure.query(({ ctx }) => ({
    tenant: ctx.tenant,
    membership: ctx.tenantMembership,
  })),

  myTenants: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db.select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      primaryDomain: tenants.primaryDomain,
      role: tenantMemberships.role,
      isDefault: tenantMemberships.isDefault,
    })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(eq(tenantMemberships.userId, ctx.user!.id))
      .orderBy(desc(tenantMemberships.isDefault), tenants.name);
  }),

  createTenant: sensitiveSuperAdminProcedure
    .input(z.object({
      slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
      name: z.string().min(1).max(255),
      primaryDomain: z.string().max(255).optional().nullable(),
      ownerUserId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [result] = await db.insert(tenants).values({
        slug: input.slug,
        name: input.name,
        primaryDomain: input.primaryDomain || null,
        status: "active",
      });
      const tenantId = result.insertId;

      await db.insert(tenantMemberships).values({
        tenantId,
        userId: input.ownerUserId ?? ctx.user!.id,
        role: "owner",
        isDefault: true,
      });

      return { id: tenantId };
    }),

  members: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db.select({
      membershipId: tenantMemberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      globalRole: users.role,
      tenantRole: tenantMemberships.role,
      isDefault: tenantMemberships.isDefault,
      createdAt: tenantMemberships.createdAt,
    })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id))
      .orderBy(users.name);
  }),

  addMember: tenantAdminProcedure
    .input(z.object({
      userId: z.number(),
      role: tenantRoleSchema.default("member"),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      await db.insert(tenantMemberships).values({
        tenantId: ctx.tenant!.id,
        userId: input.userId,
        role: input.role,
        isDefault: input.isDefault,
      });

      return { success: true };
    }),

  updateMemberRole: tenantAdminProcedure
    .input(z.object({
      userId: z.number(),
      role: tenantRoleSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(tenantMemberships)
        .set({ role: input.role })
        .where(and(
          eq(tenantMemberships.tenantId, ctx.tenant!.id),
          eq(tenantMemberships.userId, input.userId),
        ));

      return { success: true };
    }),

  removeMember: tenantAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user!.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use another owner/admin to remove your own access" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(tenantMemberships)
        .where(and(
          eq(tenantMemberships.tenantId, ctx.tenant!.id),
          eq(tenantMemberships.userId, input.userId),
        ));

      return { success: true };
    }),

  integrations: router({
    list: tenantAdminProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db.select()
        .from(tenantIntegrationSettings)
        .where(eq(tenantIntegrationSettings.tenantId, ctx.tenant!.id))
        .orderBy(tenantIntegrationSettings.service);

      return TENANT_INTEGRATION_SERVICES.map(service => {
        const row = rows.find(r => r.service === service);
        return {
          service,
          enabled: row?.enabled ?? false,
          configured: !!row,
          config: redactIntegrationConfig(row?.config as Record<string, any> | undefined),
          fallback: redactIntegrationConfig(fallbackIntegrationConfig(service)),
          updatedAt: row?.updatedAt ?? null,
        };
      });
    }),

    get: tenantAdminProcedure
      .input(z.object({ service: tenantIntegrationServiceSchema }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const [row] = await db.select()
          .from(tenantIntegrationSettings)
          .where(and(
            eq(tenantIntegrationSettings.tenantId, ctx.tenant!.id),
            eq(tenantIntegrationSettings.service, input.service),
          ))
          .limit(1);

        return {
          service: input.service,
          enabled: row?.enabled ?? false,
          configured: !!row,
          config: redactIntegrationConfig(row?.config as Record<string, any> | undefined),
          fallback: redactIntegrationConfig(fallbackIntegrationConfig(input.service)),
          updatedAt: row?.updatedAt ?? null,
        };
      }),

    upsert: tenantAdminProcedure
      .input(z.object({
        service: tenantIntegrationServiceSchema,
        enabled: z.boolean().default(true),
        config: z.record(z.string(), z.unknown()).default({}),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        await db.insert(tenantIntegrationSettings)
          .values({
            tenantId: ctx.tenant!.id,
            service: input.service,
            enabled: input.enabled,
            config: input.config,
          })
          .onDuplicateKeyUpdate({
            set: {
              enabled: input.enabled,
              config: input.config,
              updatedAt: new Date(),
            },
          });

        return { success: true };
      }),
  }),
});
