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

export type EmailTemplateUpsertInput = {
  letterType: string;
  subject: string;
  body: string;
  category?: string;
  triggerKey?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
};

export type EmailTemplateImportInput = {
  templateId: string;
  category: string;
  channel?: string | null;
  status?: string | null;
  subject: string;
  body: string;
  autoTrigger?: string | null;
  rowNumber?: number;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanOptionalText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeMergeFields(value: string) {
  return value.replace(/(?<!\{)\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}(?!\})/g, "{{$1}}");
}

function cleanHtmlTemplateBody(value: unknown) {
  let html = String(value ?? "").replace(/\r\n/g, "\n").trim();
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) html = bodyMatch[1].trim();
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
}

function normalizeImportRow(row: EmailTemplateImportInput) {
  const letterType = cleanText(row.templateId);
  const category = cleanText(row.category) || "General";
  const channel = cleanText(row.channel || "Email") || "Email";
  const subject = normalizeMergeFields(cleanText(row.subject));
  const body = normalizeMergeFields(cleanHtmlTemplateBody(row.body));
  const triggerKey = cleanOptionalText(row.autoTrigger) || cleanOptionalText(row.status);

  return {
    letterType,
    category,
    channel,
    subject,
    body,
    triggerKey,
    rowNumber: row.rowNumber,
  };
}

export async function upsertTemplate(data: EmailTemplateUpsertInput, tenantId?: number | null) {
  const existing = await getTemplate(data.letterType, tenantId);
  const body = normalizeMergeFields(cleanHtmlTemplateBody(data.body));
  if (existing) {
    const conditions: any[] = [eq(emailTemplates.id, existing.id)];
    appendTenantScope(conditions, emailTemplates.tenantId, tenantId);
    const nextTriggerKey = data.triggerKey !== undefined ? data.triggerKey : existing.triggerKey;
    await db.update(emailTemplates)
      .set({
        subject: data.subject,
        body,
        category: data.category ?? existing.category,
        triggerKey: nextTriggerKey,
        attachmentUrl: data.attachmentUrl ?? null,
        attachmentName: data.attachmentName ?? null,
      })
      .where(and(...conditions));
    return {
      ...existing,
      subject: data.subject,
      body,
      category: data.category ?? existing.category,
      triggerKey: nextTriggerKey,
      attachmentUrl: data.attachmentUrl,
      attachmentName: data.attachmentName,
    };
  } else {
    const result = await db.insert(emailTemplates).values({
      tenantId,
      letterType: data.letterType,
      subject: data.subject,
      body,
      category: data.category ?? "general",
      triggerKey: data.triggerKey ?? null,
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentName: data.attachmentName ?? null,
    });
    return { id: (result as any)[0].insertId, ...data, body };
  }
}

export async function importEmailTemplates(rows: EmailTemplateImportInput[], tenantId: number) {
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    normalized: 0,
    rows: [] as Array<{
      rowNumber?: number;
      letterType?: string;
      category?: string;
      triggerKey?: string | null;
      action: "created" | "updated" | "skipped";
      reason?: string;
    }>,
  };

  const seenLetterTypes = new Set<string>();

  for (const rawRow of rows) {
    const row = normalizeImportRow(rawRow);
    if (!row.letterType) {
      result.skipped++;
      result.rows.push({ rowNumber: row.rowNumber, action: "skipped", reason: "Missing Template ID" });
      continue;
    }
    if (seenLetterTypes.has(row.letterType)) {
      result.skipped++;
      result.rows.push({ rowNumber: row.rowNumber, letterType: row.letterType, action: "skipped", reason: "Duplicate Template ID in import" });
      continue;
    }
    seenLetterTypes.add(row.letterType);

    if (row.channel.toLowerCase() !== "email") {
      result.skipped++;
      result.rows.push({ rowNumber: row.rowNumber, letterType: row.letterType, action: "skipped", reason: `Unsupported channel: ${row.channel}` });
      continue;
    }
    if (!row.subject || !row.body) {
      result.skipped++;
      result.rows.push({ rowNumber: row.rowNumber, letterType: row.letterType, action: "skipped", reason: "Missing subject or body" });
      continue;
    }

    const existing = await getTemplate(row.letterType, tenantId);
    await upsertTemplate({
      letterType: row.letterType,
      subject: row.subject,
      body: row.body,
      category: row.category,
      triggerKey: row.triggerKey,
    }, tenantId);

    if (row.subject !== cleanText(rawRow.subject) || row.body !== String(rawRow.body ?? "").replace(/\r\n/g, "\n").trim()) {
      result.normalized++;
    }

    const action = existing ? "updated" : "created";
    result[action]++;
    result.rows.push({
      rowNumber: row.rowNumber,
      letterType: row.letterType,
      category: row.category,
      triggerKey: row.triggerKey,
      action,
    });
  }

  return result;
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
