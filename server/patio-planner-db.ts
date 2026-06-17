// Patio Planner - Database Helpers
import { and, eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { patioPlanner } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

export async function listPatioProjects(userId: number, tenantId?: number | null) {
  const conditions = [eq(patioPlanner.userId, userId)];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  return db.select().from(patioPlanner).where(and(...conditions)).orderBy(desc(patioPlanner.updatedAt));
}

export async function getPatioProject(id: number, userId: number, tenantId?: number | null) {
  const conditions = [eq(patioPlanner.id, id)];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  const rows = await db.select().from(patioPlanner).where(and(...conditions));
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function createPatioProject(data: { userId: number; tenantId?: number | null; name: string; quoteId?: number }) {
  const [result] = await db.insert(patioPlanner).values({
    tenantId: data.tenantId ?? null,
    userId: data.userId,
    name: data.name,
    quoteId: data.quoteId ?? null,
  });
  return result.insertId;
}

export async function updatePatioProject(id: number, userId: number, data: Partial<Record<string, any>>, tenantId?: number | null) {
  // Verify ownership
  const project = await getPatioProject(id, userId, tenantId);
  if (!project) return null;
  // Remove fields that shouldn't be updated directly
  const { id: _id, tenantId: _tid, userId: _uid, createdAt: _ca, updatedAt: _ua, ...updateData } = data;
  const conditions = [eq(patioPlanner.id, id)];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  await db.update(patioPlanner).set(updateData).where(and(...conditions));
  return getPatioProject(id, userId, tenantId);
}

export async function deletePatioProject(id: number, userId: number, tenantId?: number | null) {
  const project = await getPatioProject(id, userId, tenantId);
  if (!project) return false;
  const conditions = [eq(patioPlanner.id, id)];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  await db.delete(patioPlanner).where(and(...conditions));
  return true;
}

/** Admin: delete any patio project regardless of ownership */
export async function adminDeletePatioProject(id: number, tenantId?: number | null) {
  const conditions = [eq(patioPlanner.id, id)];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  const rows = await db.select().from(patioPlanner).where(and(...conditions));
  if (!rows[0]) return false;
  await db.delete(patioPlanner).where(and(...conditions));
  return true;
}

/** Admin: list all patio projects across all users */
export async function listAllPatioProjects(tenantId?: number | null) {
  const conditions: any[] = [];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  const query = db.select().from(patioPlanner);
  return (conditions.length > 0 ? query.where(and(...conditions)) : query).orderBy(desc(patioPlanner.updatedAt));
}

/** Get the patio project linked to a specific quote (if any) */
export async function getPatioProjectByQuoteId(quoteId: number, userId: number, tenantId?: number | null) {
  const conditions = [eq(patioPlanner.quoteId, quoteId)];
  appendTenantScope(conditions, patioPlanner.tenantId, tenantId);
  const rows = await db.select().from(patioPlanner).where(and(...conditions));
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row;
}
