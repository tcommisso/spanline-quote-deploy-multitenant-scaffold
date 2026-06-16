import { and, desc, eq, or, sql } from "drizzle-orm";
import { crmLeads } from "../drizzle/schema";
import { getDb } from "./db";

function stripInternationalPrefix(digits: string) {
  if (digits.startsWith("0011")) return digits.slice(4);
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function phoneDigits(value?: string | null) {
  return stripInternationalPrefix(String(value ?? "").replace(/\D/g, ""));
}

export function normalizePhoneForMatch(value?: string | null) {
  let digits = phoneDigits(value);
  if (!digits) return "";

  if (digits.startsWith("61")) {
    const national = digits.slice(2);
    if (national.startsWith("0")) return national;
    if (national.length >= 9 && /^[23478]/.test(national)) {
      return `0${national}`;
    }
  }

  if (digits.length === 9 && /^[23478]/.test(digits)) {
    return `0${digits}`;
  }

  return digits;
}

export function phoneMatchVariants(value?: string | null) {
  const raw = phoneDigits(value);
  const normalized = normalizePhoneForMatch(value);
  const variants = new Set<string>();

  for (const candidate of [raw, normalized]) {
    if (candidate && candidate.length >= 8) variants.add(candidate);
  }

  if (normalized.startsWith("0") && normalized.length >= 10) {
    variants.add(`61${normalized.slice(1)}`);
    variants.add(normalized.slice(1));
  }

  if (raw.startsWith("61") && raw.length >= 11) {
    variants.add(`0${raw.slice(2)}`);
  }

  return Array.from(variants);
}

export function phoneMatchSuffixes(value?: string | null) {
  const normalized = normalizePhoneForMatch(value);
  return {
    last9: normalized.length >= 9 ? normalized.slice(-9) : "",
    last8: normalized.length >= 8 ? normalized.slice(-8) : "",
  };
}

export function scorePhoneMatch(needle?: string | null, candidate?: string | null) {
  const needleNormalized = normalizePhoneForMatch(needle);
  const candidateNormalized = normalizePhoneForMatch(candidate);
  if (!needleNormalized || !candidateNormalized) return 0;

  if (needleNormalized === candidateNormalized) return 100;

  const needleVariants = new Set(phoneMatchVariants(needle));
  if (phoneMatchVariants(candidate).some((variant) => needleVariants.has(variant))) return 90;

  const needleLast9 = phoneMatchSuffixes(needle).last9;
  const candidateLast9 = phoneMatchSuffixes(candidate).last9;
  if (needleLast9 && candidateLast9 && needleLast9 === candidateLast9) return 80;

  const needleLast8 = phoneMatchSuffixes(needle).last8;
  const candidateLast8 = phoneMatchSuffixes(candidate).last8;
  if (needleLast8 && candidateLast8 && needleLast8 === candidateLast8) return 60;

  return 0;
}

export function phoneSearchCondition(search: string, ...columns: any[]) {
  const variants = phoneMatchVariants(search);
  const { last9, last8 } = phoneMatchSuffixes(search);
  const conditions: any[] = [];

  for (const column of columns) {
    const normalizedColumn = sql<string>`REGEXP_REPLACE(${column}, '[^0-9]', '')`;
    conditions.push(sql`${column} LIKE ${`%${search}%`}`);
    if (variants.length) {
      conditions.push(sql`${normalizedColumn} IN (${sql.join(variants.map((variant) => sql`${variant}`), sql`, `)})`);
    }
    if (last9) conditions.push(sql`RIGHT(${normalizedColumn}, 9) = ${last9}`);
    if (last8) conditions.push(sql`RIGHT(${normalizedColumn}, 8) = ${last8}`);
  }

  return conditions.length ? or(...conditions) : undefined;
}

export async function findLeadByPhone(phone: string, tenantId?: number | null): Promise<number | null> {
  const variants = phoneMatchVariants(phone);
  const { last9, last8 } = phoneMatchSuffixes(phone);
  if (!variants.length && !last9 && !last8) return null;

  const normalizedPhone = sql<string>`REGEXP_REPLACE(${crmLeads.contactPhone}, '[^0-9]', '')`;
  const phoneConditions: any[] = [];
  if (variants.length) {
    phoneConditions.push(sql`${normalizedPhone} IN (${sql.join(variants.map((variant) => sql`${variant}`), sql`, `)})`);
  }
  if (last9) phoneConditions.push(sql`RIGHT(${normalizedPhone}, 9) = ${last9}`);
  if (last8) phoneConditions.push(sql`RIGHT(${normalizedPhone}, 8) = ${last8}`);

  const whereConditions: any[] = [
    eq(crmLeads.archived, false),
    sql`${crmLeads.contactPhone} IS NOT NULL`,
    or(...phoneConditions),
  ];
  if (tenantId) whereConditions.unshift(eq(crmLeads.tenantId, tenantId));

  const db = (await getDb())!;
  const candidates = await db
    .select({
      id: crmLeads.id,
      contactPhone: crmLeads.contactPhone,
      updatedAt: crmLeads.updatedAt,
    })
    .from(crmLeads)
    .where(and(...whereConditions))
    .orderBy(desc(crmLeads.updatedAt))
    .limit(10);

  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scorePhoneMatch(phone, candidate.contactPhone) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.updatedAt) - Number(a.updatedAt));

  return ranked[0]?.id ?? null;
}
