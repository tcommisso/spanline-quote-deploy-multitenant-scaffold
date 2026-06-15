import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, desc } from "drizzle-orm";
import { designAdvisors, type InsertDesignAdvisor } from "../drizzle/schema";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

export async function listDesignAdvisors(includeArchived = false) {
  if (includeArchived) {
    return db.select().from(designAdvisors).orderBy(desc(designAdvisors.createdAt));
  }
  return db.select().from(designAdvisors).where(eq(designAdvisors.archived, false)).orderBy(designAdvisors.name);
}

export async function getDesignAdvisor(id: number) {
  const [row] = await db.select().from(designAdvisors).where(eq(designAdvisors.id, id));
  return row || null;
}

export async function getDesignAdvisorByUserId(userId: number) {
  const [row] = await db.select().from(designAdvisors).where(eq(designAdvisors.userId, userId));
  return row || null;
}

export async function getDesignAdvisorByEmail(email: string) {
  const [row] = await db.select().from(designAdvisors).where(eq(designAdvisors.email, email));
  return row || null;
}

export async function createDesignAdvisor(data: { name: string; email?: string; phone?: string; role?: string; profileDescription?: string; photoUrl?: string | null; branchId?: number | null }) {
  const [result] = await db.insert(designAdvisors).values(data).$returningId();
  return result.id;
}

export async function updateDesignAdvisor(id: number, data: { name?: string; email?: string; phone?: string; role?: string; profileDescription?: string | null; photoUrl?: string | null; branchId?: number | null; archived?: boolean; userId?: number | null }) {
  await db.update(designAdvisors).set(data).where(eq(designAdvisors.id, id));
}

export async function deleteDesignAdvisor(id: number) {
  await db.delete(designAdvisors).where(eq(designAdvisors.id, id));
}

export async function getDesignAdvisorByName(name: string) {
  const [row] = await db.select().from(designAdvisors).where(eq(designAdvisors.name, name));
  return row || null;
}

export async function linkDesignAdvisorToUser(designAdvisorId: number, userId: number | null) {
  await db.update(designAdvisors).set({ userId }).where(eq(designAdvisors.id, designAdvisorId));
}
