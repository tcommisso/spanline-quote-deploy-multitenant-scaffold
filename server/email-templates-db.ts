import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { emailTemplates, type InsertEmailTemplate } from "../drizzle/schema";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

export async function listTemplates() {
  return db.select().from(emailTemplates);
}

export async function listByCategory(category: string) {
  return db.select().from(emailTemplates).where(eq(emailTemplates.category, category));
}

export async function getTemplate(letterType: string) {
  const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.letterType, letterType));
  return rows[0] || null;
}

export async function upsertTemplate(data: { letterType: string; subject: string; body: string; category?: string; attachmentUrl?: string | null; attachmentName?: string | null }) {
  const existing = await getTemplate(data.letterType);
  if (existing) {
    await db.update(emailTemplates)
      .set({ subject: data.subject, body: data.body, category: data.category ?? existing.category, attachmentUrl: data.attachmentUrl ?? null, attachmentName: data.attachmentName ?? null })
      .where(eq(emailTemplates.letterType, data.letterType));
    return { ...existing, subject: data.subject, body: data.body, category: data.category ?? existing.category, attachmentUrl: data.attachmentUrl, attachmentName: data.attachmentName };
  } else {
    const result = await db.insert(emailTemplates).values({
      letterType: data.letterType,
      subject: data.subject,
      body: data.body,
      category: data.category ?? "general",
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentName: data.attachmentName ?? null,
    });
    return { id: (result as any)[0].insertId, ...data };
  }
}

export async function resetTemplate(letterType: string) {
  await db.delete(emailTemplates).where(eq(emailTemplates.letterType, letterType));
}

export async function deleteById(id: number) {
  await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
}
