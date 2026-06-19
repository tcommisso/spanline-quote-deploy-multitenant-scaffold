import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { designAdvisors, tenantMemberships, users } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

async function syncDesignAdvisorUsers(tenantId?: number | null) {
  if (!tenantId) return;

  const advisorUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
    .where(and(
      eq(tenantMemberships.tenantId, tenantId),
      eq(users.role, "design_adviser"),
    ));

  for (const advisorUser of advisorUsers) {
    const identityCondition = advisorUser.email
      ? or(eq(designAdvisors.userId, advisorUser.id), eq(designAdvisors.email, advisorUser.email))
      : eq(designAdvisors.userId, advisorUser.id);
    const [existing] = await db
      .select()
      .from(designAdvisors)
      .where(and(or(eq(designAdvisors.tenantId, tenantId), isNull(designAdvisors.tenantId)), identityCondition))
      .limit(1);

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (!existing.tenantId) updates.tenantId = tenantId;
      if (!existing.userId) updates.userId = advisorUser.id;
      if (!existing.email && advisorUser.email) updates.email = advisorUser.email;
      if (!existing.name && advisorUser.name) updates.name = advisorUser.name;
      if (existing.archived) updates.archived = false;
      if (Object.keys(updates).length > 0) {
        await db.update(designAdvisors).set(updates).where(eq(designAdvisors.id, existing.id));
      }
      continue;
    }

    await db.insert(designAdvisors).values({
      tenantId,
      userId: advisorUser.id,
      name: advisorUser.name || advisorUser.email || `Design Adviser #${advisorUser.id}`,
      email: advisorUser.email || null,
      role: "design_adviser",
      archived: false,
    });
  }
}

export async function listDesignAdvisors(includeArchived = false, tenantId?: number | null) {
  await syncDesignAdvisorUsers(tenantId);

  const conditions: any[] = [];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  if (!includeArchived) conditions.push(eq(designAdvisors.archived, false));

  if (includeArchived) {
    return db.select()
      .from(designAdvisors)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(designAdvisors.createdAt));
  }
  return db.select()
    .from(designAdvisors)
    .where(and(...conditions))
    .orderBy(designAdvisors.name);
}

export async function getDesignAdvisor(id: number, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.id, id)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  const [row] = await db.select().from(designAdvisors).where(and(...conditions));
  return row || null;
}

export async function getDesignAdvisorByUserId(userId: number, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.userId, userId)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  const [row] = await db.select().from(designAdvisors).where(and(...conditions));
  return row || null;
}

export async function getDesignAdvisorByEmail(email: string, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.email, email)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  const [row] = await db.select().from(designAdvisors).where(and(...conditions));
  return row || null;
}

export async function createDesignAdvisor(data: { tenantId?: number | null; name: string; email?: string; phone?: string; role?: string; profileDescription?: string; photoUrl?: string | null; branchId?: number | null }) {
  const [result] = await db.insert(designAdvisors).values(data).$returningId();
  return result.id;
}

export async function updateDesignAdvisor(id: number, data: { name?: string; email?: string; phone?: string; role?: string; profileDescription?: string | null; photoUrl?: string | null; branchId?: number | null; archived?: boolean; userId?: number | null }, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.id, id)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  await db.update(designAdvisors).set(data).where(and(...conditions));
}

export async function deleteDesignAdvisor(id: number, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.id, id)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  await db.delete(designAdvisors).where(and(...conditions));
}

export async function getDesignAdvisorByName(name: string, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.name, name)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  const [row] = await db.select().from(designAdvisors).where(and(...conditions));
  return row || null;
}

export async function linkDesignAdvisorToUser(designAdvisorId: number, userId: number | null, tenantId?: number | null) {
  const conditions: any[] = [eq(designAdvisors.id, designAdvisorId)];
  appendTenantScope(conditions, designAdvisors.tenantId, tenantId);
  await db.update(designAdvisors).set({ userId }).where(and(...conditions));
}
