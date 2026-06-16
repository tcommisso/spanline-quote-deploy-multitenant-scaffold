import type { Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  tenantMemberships,
  tenants,
  type Tenant,
  type TenantMembership,
  type User,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

type TenantContext = {
  tenant: Tenant | null;
  tenantMembership: TenantMembership | null;
};

function singleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function requestHost(req: Request) {
  const forwardedHost = singleHeader(req.headers["x-forwarded-host"]);
  return (forwardedHost || req.headers.host || "").split(",")[0].trim().toLowerCase();
}

function activeTenant(tenant: Tenant | null) {
  return tenant?.status === "active" ? tenant : null;
}

async function getTenantBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}

export async function getTenantById(tenantId: number) {
  const db = await getDb();
  if (!db) return null;
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant ?? null;
}

async function getTenantByDomain(host: string) {
  const db = await getDb();
  if (!db || !host) return null;
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.primaryDomain, host))
    .limit(1);
  return tenant ?? null;
}

async function getMembership(userId: number, tenantId: number) {
  const db = await getDb();
  if (!db) return null;
  const [membership] = await db
    .select()
    .from(tenantMemberships)
    .where(and(
      eq(tenantMemberships.userId, userId),
      eq(tenantMemberships.tenantId, tenantId),
    ))
    .limit(1);
  return membership ?? null;
}

function membershipRoleForUser(user: User): "owner" | "admin" | "member" {
  if (user.role === "super_admin") return "owner";
  if (user.role === "admin") return "admin";
  return "member";
}

async function ensureMembership(user: User, tenantId: number) {
  const db = await getDb();
  if (!db) return syntheticLegacyMembership(user, tenantId);
  const role = membershipRoleForUser(user);
  await db.insert(tenantMemberships)
    .values({
      tenantId,
      userId: user.id,
      role,
      isDefault: true,
    })
    .onDuplicateKeyUpdate({
      set: {
        role,
        isDefault: true,
      },
    });
  return getMembership(user.id, tenantId) ?? syntheticLegacyMembership(user, tenantId);
}

async function getDefaultMembership(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [membership] = await db
    .select()
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId))
    .orderBy(desc(tenantMemberships.isDefault), desc(tenantMemberships.createdAt))
    .limit(1);
  return membership ?? null;
}

function syntheticLegacyMembership(user: User, tenantId: number): TenantMembership {
  const now = new Date();
  return {
    id: 0,
    tenantId,
    userId: user.id,
    role: membershipRoleForUser(user),
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function resolveTenantForRequest(req: Request, user: User | null): Promise<TenantContext> {
  try {
    const requestedTenantId = Number(singleHeader(req.headers["x-tenant-id"]) || "");
    const requestedTenantSlug = singleHeader(req.headers["x-tenant-slug"]);
    const host = requestHost(req);

    let tenant: Tenant | null = null;
    if (Number.isInteger(requestedTenantId) && requestedTenantId > 0) {
      tenant = await getTenantById(requestedTenantId);
    } else if (requestedTenantSlug) {
      tenant = await getTenantBySlug(requestedTenantSlug);
    } else {
      tenant = await getTenantByDomain(host);
    }
    tenant = activeTenant(tenant);

    if (!user) {
      return { tenant, tenantMembership: null };
    }

    if (tenant) {
      const tenantMembership = await getMembership(user.id, tenant.id);
      if (tenantMembership) return { tenant, tenantMembership };
      if (ENV.tenancyMode === "single") {
        return { tenant, tenantMembership: await ensureMembership(user, tenant.id) };
      }
      return { tenant: null, tenantMembership: null };
    }

    const tenantMembership = await getDefaultMembership(user.id);
    if (tenantMembership) {
      return {
        tenant: activeTenant(await getTenantById(tenantMembership.tenantId)),
        tenantMembership,
      };
    }

    if (ENV.tenancyMode === "single") {
      const defaultTenant = activeTenant(await getTenantBySlug(ENV.defaultTenantSlug));
      if (defaultTenant) {
        return {
          tenant: defaultTenant,
          tenantMembership: await ensureMembership(user, defaultTenant.id),
        };
      }
    }
  } catch (error) {
    // Tenancy tables may not exist until the first migration is applied.
    // Keep legacy routes alive, but tenantProcedure will still refuse access.
  }

  return { tenant: null, tenantMembership: null };
}
