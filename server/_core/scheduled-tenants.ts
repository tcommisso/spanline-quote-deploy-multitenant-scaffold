import { and, eq, inArray, or, sql } from "drizzle-orm";
import { tenantMemberships, tenants, users } from "../../drizzle/schema";
import { getDb, getDefaultTenantId } from "../db";

export type ScheduledTenant = {
  id: number;
  slug: string;
  name: string;
};

export type TenantNotificationRecipient = {
  id: number;
  name: string | null;
  email: string;
  role: string;
  tenantRole: string;
};

export async function getScheduledTenants(): Promise<ScheduledTenant[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .orderBy(tenants.id);

  if (rows.length > 0) return rows;

  const defaultTenantId = await getDefaultTenantId();
  return defaultTenantId
    ? [{ id: defaultTenantId, slug: "default", name: "Default Tenant" }]
    : [];
}

export async function getTenantNotificationRecipients(
  tenantId: number,
  options: {
    appRoles?: string[];
    tenantRoles?: string[];
  } = {},
): Promise<TenantNotificationRecipient[]> {
  const db = await getDb();
  if (!db) return [];

  const appRoles = options.appRoles ?? [];
  const tenantRoles = options.tenantRoles ?? ["owner", "admin"];

  const roleConditions: any[] = [];
  if (appRoles.length > 0) {
    roleConditions.push(inArray(users.role as any, appRoles as any));
  }
  if (tenantRoles.length > 0) {
    roleConditions.push(inArray(tenantMemberships.role as any, tenantRoles as any));
  }

  const conditions: any[] = [
    eq(tenantMemberships.tenantId, tenantId),
    sql`${users.email} IS NOT NULL`,
    sql`${users.email} != ''`,
  ];

  if (roleConditions.length === 1) {
    conditions.push(roleConditions[0]);
  } else if (roleConditions.length > 1) {
    conditions.push(or(...roleConditions));
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      tenantRole: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(tenantMemberships.userId, users.id))
    .where(and(...conditions));

  const byEmail = new Map<string, TenantNotificationRecipient>();
  for (const row of rows) {
    if (!row.email) continue;
    byEmail.set(row.email.toLowerCase(), {
      ...row,
      email: row.email,
    });
  }

  return Array.from(byEmail.values());
}
