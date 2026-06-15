// Patio Planner - Database Helpers
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { patioPlanner } from "../drizzle/schema";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

export async function listPatioProjects(userId: number) {
  return db.select().from(patioPlanner).where(eq(patioPlanner.userId, userId)).orderBy(desc(patioPlanner.updatedAt));
}

export async function getPatioProject(id: number, userId: number) {
  const rows = await db.select().from(patioPlanner).where(eq(patioPlanner.id, id));
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row;
}

export async function createPatioProject(data: { userId: number; name: string; quoteId?: number }) {
  const [result] = await db.insert(patioPlanner).values({
    userId: data.userId,
    name: data.name,
    quoteId: data.quoteId ?? null,
  });
  return result.insertId;
}

export async function updatePatioProject(id: number, userId: number, data: Partial<Record<string, any>>) {
  // Verify ownership
  const project = await getPatioProject(id, userId);
  if (!project) return null;
  // Remove fields that shouldn't be updated directly
  const { id: _id, userId: _uid, createdAt: _ca, updatedAt: _ua, ...updateData } = data;
  await db.update(patioPlanner).set(updateData).where(eq(patioPlanner.id, id));
  return getPatioProject(id, userId);
}

export async function deletePatioProject(id: number, userId: number) {
  const project = await getPatioProject(id, userId);
  if (!project) return false;
  await db.delete(patioPlanner).where(eq(patioPlanner.id, id));
  return true;
}

/** Admin: delete any patio project regardless of ownership */
export async function adminDeletePatioProject(id: number) {
  const rows = await db.select().from(patioPlanner).where(eq(patioPlanner.id, id));
  if (!rows[0]) return false;
  await db.delete(patioPlanner).where(eq(patioPlanner.id, id));
  return true;
}

/** Admin: list all patio projects across all users */
export async function listAllPatioProjects() {
  return db.select().from(patioPlanner).orderBy(desc(patioPlanner.updatedAt));
}

/** Get the patio project linked to a specific quote (if any) */
export async function getPatioProjectByQuoteId(quoteId: number, userId: number) {
  const rows = await db.select().from(patioPlanner).where(eq(patioPlanner.quoteId, quoteId));
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row;
}
