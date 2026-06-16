import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, desc, eq } from "drizzle-orm";
import { designAdvisors } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

export async function listDesignAdvisors(includeArchived = false, tenantId?: number | null) {
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
