// Eclipse Opening Roof System - Database Helpers
import { eq, desc, like, or, and, sql, ne, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eclipseQuotes, eclipsePricing, tenants, users } from "../drizzle/schema";
import type { InsertEclipseQuote, InsertEclipsePricing } from "../drizzle/schema";
import { isAdminRole } from "../shared/const";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

type EclipseTenantScopeOptions = {
  includeAllTenants?: boolean;
};

function appendEclipseTenantScope(
  conditions: any[],
  tenantId: number | null | undefined,
  _options?: EclipseTenantScopeOptions,
) {
  if (!tenantId) {
    conditions.push(sql`1 = 0`);
    return;
  }
  conditions.push(eq(eclipseQuotes.tenantId, tenantId));
}

// ─── Eclipse Quotes ──────────────────────────────────────────────────────────

export async function listEclipseQuotes(
  user: { id: number; role: string; name?: string | null; canViewAllQuotes?: boolean },
  tenantId?: number | null,
  options?: EclipseTenantScopeOptions,
) {
  const conditions: any[] = [];
  appendEclipseTenantScope(conditions, tenantId, options);
  if (!isAdminRole(user.role) && !user.canViewAllQuotes) {
    if (user.role === "design_adviser" && user.name) {
      conditions.push(or(eq(eclipseQuotes.designAdvisor, user.name), eq(eclipseQuotes.userId, user.id)));
    } else {
      conditions.push(eq(eclipseQuotes.userId, user.id));
    }
  }
  const where = conditions.length ? and(...conditions) : undefined;
  return db.select().from(eclipseQuotes).where(where).orderBy(desc(eclipseQuotes.updatedAt));
}

export async function getEclipseQuoteById(id: number, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const conditions: any[] = [eq(eclipseQuotes.id, id)];
  appendEclipseTenantScope(conditions, tenantId, options);
  const rows = await db.select().from(eclipseQuotes).where(and(...conditions));
  return rows[0] || null;
}

export async function createEclipseQuote(data: InsertEclipseQuote) {
  const result = await db.insert(eclipseQuotes).values(data);
  return result[0].insertId;
}

export async function updateEclipseQuote(id: number, data: Partial<InsertEclipseQuote>, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const conditions: any[] = [eq(eclipseQuotes.id, id)];
  appendEclipseTenantScope(conditions, tenantId, options);
  await db.update(eclipseQuotes).set(data).where(and(...conditions));
}

export async function deleteEclipseQuote(id: number, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const conditions: any[] = [eq(eclipseQuotes.id, id)];
  appendEclipseTenantScope(conditions, tenantId, options);
  await db.delete(eclipseQuotes).where(and(...conditions));
}

export async function duplicateEclipseQuote(id: number, userId: number, newQuoteNumber: string, tenantId?: number | null, options?: EclipseTenantScopeOptions) {
  const original = await getEclipseQuoteById(id, tenantId, options);
  if (!original) throw new Error("Eclipse quote not found");
  const { id: _id, createdAt, updatedAt, quoteNumber, tenantId: _tenantId, ...rest } = original;
  const newId = await createEclipseQuote({
    ...rest,
    tenantId: tenantId ?? _tenantId,
    userId,
    quoteNumber: newQuoteNumber,
    status: "draft",
    archived: false,
  } as any);
  return newId;
}

export async function getNextEclipseQuoteNumber(): Promise<string> {
  const rows = await db.select({ quoteNumber: eclipseQuotes.quoteNumber })
    .from(eclipseQuotes)
    .orderBy(desc(eclipseQuotes.id))
    .limit(1);
  if (rows.length === 0) return "EQ-0001";
  const last = rows[0].quoteNumber;
  const num = parseInt(last.replace("EQ-", ""), 10);
  return `EQ-${String(num + 1).padStart(4, "0")}`;
}

type EclipseDiagnosticUser = {
  id: number;
  role: string;
  name?: string | null;
  email?: string | null;
  canViewAllQuotes?: boolean;
};

type EclipseDiagnosticOptions = {
  tenantId: number;
  tenantName?: string | null;
  tenantSlug?: string | null;
  tenantRole?: string | null;
  user: EclipseDiagnosticUser;
  listUser: EclipseDiagnosticUser;
  search?: string | null;
  limit?: number;
  includeGlobal?: boolean;
};

function diagnosticSearchCondition(search: string) {
  const pattern = `%${search}%`;
  const numericId = Number(search);
  return or(
    like(eclipseQuotes.quoteNumber, pattern),
    like(eclipseQuotes.clientName, pattern),
    like(eclipseQuotes.clientEmail, pattern),
    like(eclipseQuotes.clientPhone, pattern),
    like(eclipseQuotes.clientAddress, pattern),
    Number.isInteger(numericId) ? eq(eclipseQuotes.id, numericId) : sql`1 = 0`,
  );
}

function jsonArrayLength(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.length : null;
    } catch {
      return null;
    }
  }
  return null;
}

function hasJsonPayload(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  if (typeof value === "string") return value.trim() !== "" && value.trim() !== "null";
  return true;
}

const diagnosticQuoteSelect = {
  id: eclipseQuotes.id,
  tenantId: eclipseQuotes.tenantId,
  tenantName: tenants.name,
  tenantSlug: tenants.slug,
  userId: eclipseQuotes.userId,
  creatorName: users.name,
  creatorEmail: users.email,
  quoteNumber: eclipseQuotes.quoteNumber,
  status: eclipseQuotes.status,
  archived: eclipseQuotes.archived,
  clientId: eclipseQuotes.clientId,
  clientName: eclipseQuotes.clientName,
  clientPhone: eclipseQuotes.clientPhone,
  clientEmail: eclipseQuotes.clientEmail,
  clientAddress: eclipseQuotes.clientAddress,
  designAdvisor: eclipseQuotes.designAdvisor,
  totalSqm: eclipseQuotes.totalSqm,
  totalSellPriceEx: eclipseQuotes.totalSellPriceEx,
  totalGST: eclipseQuotes.totalGST,
  totalRRPInc: eclipseQuotes.totalRRPInc,
  units: eclipseQuotes.units,
  specData: eclipseQuotes.specData,
  checklistSelections: eclipseQuotes.checklistSelections,
  proposalSentAt: eclipseQuotes.proposalSentAt,
  proposalSentTo: eclipseQuotes.proposalSentTo,
  createdAt: eclipseQuotes.createdAt,
  updatedAt: eclipseQuotes.updatedAt,
};

function summarizeDiagnosticQuote(
  row: typeof diagnosticQuoteSelect extends Record<string, any> ? any : never,
  visibleQuoteIds: Set<number>,
  tenantId: number,
) {
  const visibilityReasons: string[] = [];
  const serverListVisible = visibleQuoteIds.has(row.id);

  if (row.tenantId !== tenantId) {
    visibilityReasons.push("Not in the currently selected tenant");
  }
  if (!serverListVisible) {
    visibilityReasons.push("The normal Eclipse list query did not return this quote for the current user/context");
  }
  if (row.archived) {
    visibilityReasons.push("Archived; may be hidden if the UI is filtered away from archived quotes");
  }
  if (!row.clientName) {
    visibilityReasons.push("Missing client name");
  }
  if (!row.quoteNumber) {
    visibilityReasons.push("Missing quote number");
  }

  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    tenantSlug: row.tenantSlug,
    userId: row.userId,
    creatorName: row.creatorName,
    creatorEmail: row.creatorEmail,
    quoteNumber: row.quoteNumber,
    status: row.status,
    archived: Boolean(row.archived),
    clientId: row.clientId,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    clientEmail: row.clientEmail,
    clientAddress: row.clientAddress,
    designAdvisor: row.designAdvisor,
    totalSqm: row.totalSqm,
    totalSellPriceEx: row.totalSellPriceEx,
    totalGST: row.totalGST,
    totalRRPInc: row.totalRRPInc,
    unitsCount: jsonArrayLength(row.units),
    hasSpecData: hasJsonPayload(row.specData),
    hasChecklistSelections: hasJsonPayload(row.checklistSelections),
    proposalSentAt: row.proposalSentAt,
    proposalSentTo: row.proposalSentTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    serverListVisible,
    defaultUiVisible: serverListVisible,
    visibilityReasons,
  };
}

export async function getEclipseQuoteDiagnostics(options: EclipseDiagnosticOptions) {
  const limit = Math.min(Math.max(options.limit ?? 25, 5), 100);
  const search = String(options.search || "").trim();
  const searchCondition = search ? diagnosticSearchCondition(search) : undefined;

  const tenantConditions: any[] = [eq(eclipseQuotes.tenantId, options.tenantId)];
  if (searchCondition) tenantConditions.push(searchCondition);

  const tenantRows = await db
    .select(diagnosticQuoteSelect)
    .from(eclipseQuotes)
    .leftJoin(users, eq(users.id, eclipseQuotes.userId))
    .leftJoin(tenants, eq(tenants.id, eclipseQuotes.tenantId))
    .where(and(...tenantConditions))
    .orderBy(desc(eclipseQuotes.updatedAt))
    .limit(limit);

  const listRows = await listEclipseQuotes(options.listUser, options.tenantId);
  const visibleQuoteIds = new Set(listRows.map((quote) => quote.id));

  const statusCounts = await db
    .select({
      status: eclipseQuotes.status,
      count: sql<number>`count(*)`,
    })
    .from(eclipseQuotes)
    .where(eq(eclipseQuotes.tenantId, options.tenantId))
    .groupBy(eclipseQuotes.status);

  const archiveCounts = await db
    .select({
      archived: eclipseQuotes.archived,
      count: sql<number>`count(*)`,
    })
    .from(eclipseQuotes)
    .where(eq(eclipseQuotes.tenantId, options.tenantId))
    .groupBy(eclipseQuotes.archived);

  const latestByCurrentUser = await db
    .select(diagnosticQuoteSelect)
    .from(eclipseQuotes)
    .leftJoin(users, eq(users.id, eclipseQuotes.userId))
    .leftJoin(tenants, eq(tenants.id, eclipseQuotes.tenantId))
    .where(and(eq(eclipseQuotes.tenantId, options.tenantId), eq(eclipseQuotes.userId, options.user.id)))
    .orderBy(desc(eclipseQuotes.updatedAt))
    .limit(5);

  let outsideTenantMatches: Array<ReturnType<typeof summarizeDiagnosticQuote>> = [];
  let nullTenantCount: number | null = null;

  if (options.includeGlobal) {
    const [nullTenantRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eclipseQuotes)
      .where(isNull(eclipseQuotes.tenantId));
    nullTenantCount = Number(nullTenantRow?.count || 0);

    if (searchCondition) {
      const outsideRows = await db
        .select(diagnosticQuoteSelect)
        .from(eclipseQuotes)
        .leftJoin(users, eq(users.id, eclipseQuotes.userId))
        .leftJoin(tenants, eq(tenants.id, eclipseQuotes.tenantId))
        .where(and(or(ne(eclipseQuotes.tenantId, options.tenantId), isNull(eclipseQuotes.tenantId)), searchCondition))
        .orderBy(desc(eclipseQuotes.updatedAt))
        .limit(10);
      outsideTenantMatches = outsideRows.map((row) => summarizeDiagnosticQuote(row, visibleQuoteIds, options.tenantId));
    }
  }

  return {
    context: {
      tenant: {
        id: options.tenantId,
        name: options.tenantName,
        slug: options.tenantSlug,
        membershipRole: options.tenantRole,
      },
      user: {
        id: options.user.id,
        name: options.user.name,
        email: options.user.email,
        role: options.user.role,
        canViewAllQuotes: Boolean(options.listUser.canViewAllQuotes || isAdminRole(options.user.role)),
      },
      search,
      limit,
    },
    summary: {
      serverListCount: listRows.length,
      currentTenantMatchCount: tenantRows.length,
      statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, Number(row.count || 0)])),
      archivedCount: Number(archiveCounts.find((row) => Boolean(row.archived))?.count || 0),
      activeCount: Number(archiveCounts.find((row) => !row.archived)?.count || 0),
      globalDiagnosticsAvailable: Boolean(options.includeGlobal),
      nullTenantCount,
    },
    latestQuotes: tenantRows.map((row) => summarizeDiagnosticQuote(row, visibleQuoteIds, options.tenantId)),
    latestByCurrentUser: latestByCurrentUser.map((row) => summarizeDiagnosticQuote(row, visibleQuoteIds, options.tenantId)),
    outsideTenantMatches,
  };
}

// ─── Eclipse Pricing ─────────────────────────────────────────────────────────

export async function getAllEclipsePricing() {
  return db.select().from(eclipsePricing).orderBy(eclipsePricing.category);
}

export async function upsertEclipsePricing(key: string, value: number, label?: string, category?: string) {
  // Try update first
  const existing = await db.select().from(eclipsePricing).where(eq(eclipsePricing.key, key));
  if (existing.length > 0) {
    await db.update(eclipsePricing)
      .set({ value: value.toString(), label, category })
      .where(eq(eclipsePricing.key, key));
    return existing[0].id;
  }
  const result = await db.insert(eclipsePricing).values({
    key,
    value: value.toString(),
    label,
    category,
  });
  return result[0].insertId;
}

export async function bulkUpsertEclipsePricing(rows: Array<{ key: string; value: number; label: string; category: string }>) {
  for (const row of rows) {
    await upsertEclipsePricing(row.key, row.value, row.label, row.category);
  }
}

export async function resetEclipsePricing() {
  await db.delete(eclipsePricing);
}
