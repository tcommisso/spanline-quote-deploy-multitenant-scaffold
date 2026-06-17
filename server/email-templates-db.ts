import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import { emailTemplates, type InsertEmailTemplate } from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

export async function listTemplates(tenantId?: number | null) {
  const conditions: any[] = [];
  appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
  return db.select().from(emailTemplates).where(conditions.length ? and(...conditions) : undefined);
}

export async function listByCategory(category: string, tenantId?: number | null) {
  const conditions: any[] = [eq(emailTemplates.category, category)];
  appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
  return db.select().from(emailTemplates).where(and(...conditions));
}

export async function getTemplate(letterType: string, tenantId?: number | null) {
  const conditions: any[] = [eq(emailTemplates.letterType, letterType)];
  appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
  const rows = await db.select().from(emailTemplates).where(and(...conditions));
  return rows[0] || null;
}

export async function upsertTemplate(data: { letterType: string; subject: string; body: string; category?: string; attachmentUrl?: string | null; attachmentName?: string | null }, tenantId?: number | null) {
  const existing = await getTemplate(data.letterType, tenantId);
  if (existing) {
    const conditions: any[] = [eq(emailTemplates.id, existing.id)];
    appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
    await db.update(emailTemplates)
      .set({ subject: data.subject, body: data.body, category: data.category ?? existing.category, attachmentUrl: data.attachmentUrl ?? null, attachmentName: data.attachmentName ?? null })
      .where(and(...conditions));
    return { ...existing, subject: data.subject, body: data.body, category: data.category ?? existing.category, attachmentUrl: data.attachmentUrl, attachmentName: data.attachmentName };
  } else {
    const result = await db.insert(emailTemplates).values({
      tenantId,
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

export async function resetTemplate(letterType: string, tenantId?: number | null) {
  const conditions: any[] = [eq(emailTemplates.letterType, letterType)];
  appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
  await db.delete(emailTemplates).where(and(...conditions));
}

export async function deleteById(id: number, tenantId?: number | null) {
  const conditions: any[] = [eq(emailTemplates.id, id)];
  appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
  await db.delete(emailTemplates).where(and(...conditions));
}
