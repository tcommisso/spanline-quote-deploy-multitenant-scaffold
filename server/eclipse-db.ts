// Eclipse Opening Roof System - Database Helpers
import { eq, desc, or, and, sql } from "drizzle-orm";
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

type DiagnosticQuoteRow = Record<string, any>;
type DiagnosticQuoteColumn = {
  alias: string;
  column: string;
  fallback?: string;
};

const diagnosticQuoteColumns: DiagnosticQuoteColumn[] = [
  { alias: "id", column: "id" },
  { alias: "tenantId", column: "tenantId" },
  { alias: "userId", column: "userId" },
  { alias: "quoteNumber", column: "quoteNumber" },
  { alias: "status", column: "status" },
  { alias: "archived", column: "archived", fallback: "FALSE" },
  { alias: "clientId", column: "clientId" },
  { alias: "clientName", column: "clientName" },
  { alias: "clientPhone", column: "clientPhone" },
  { alias: "clientEmail", column: "clientEmail" },
  { alias: "clientAddress", column: "clientAddress" },
  { alias: "designAdvisor", column: "designAdvisor" },
  { alias: "totalSqm", column: "totalSqm" },
  { alias: "totalSellPriceEx", column: "totalSellPriceEx" },
  { alias: "totalGST", column: "totalGST" },
  { alias: "totalRRPInc", column: "totalRRPInc" },
  { alias: "units", column: "units" },
  { alias: "specData", column: "specData" },
  { alias: "checklistSelections", column: "eclipseChecklistSelections" },
  { alias: "proposalSentAt", column: "proposalSentAt" },
  { alias: "proposalSentTo", column: "proposalSentTo" },
  { alias: "createdAt", column: "createdAt" },
  { alias: "updatedAt", column: "updatedAt" },
] as const satisfies DiagnosticQuoteColumn[];

const diagnosticSearchColumns = [
  "quoteNumber",
  "clientName",
  "clientEmail",
  "clientPhone",
  "clientAddress",
] as const;

function quoteIdent(identifier: string) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
}

function selectDiagnosticColumn(columnSet: Set<string>, alias: string, column: string, fallback = "NULL") {
  if (columnSet.has(column)) {
    return `q.${quoteIdent(column)} AS ${quoteIdent(alias)}`;
  }
  return `${fallback} AS ${quoteIdent(alias)}`;
}

async function getEclipseQuoteColumnSet() {
  const [rows] = await pool.query<any[]>("SHOW COLUMNS FROM `eclipse_quotes`");
  return new Set(rows.map((row) => String(row.Field)));
}

function diagnosticSelectSql(columnSet: Set<string>) {
  const quoteColumns = diagnosticQuoteColumns.map((field) =>
    selectDiagnosticColumn(columnSet, field.alias, field.column, field.fallback),
  );
  return [
    ...quoteColumns,
    "t.`name` AS `tenantName`",
    "t.`slug` AS `tenantSlug`",
    "u.`name` AS `creatorName`",
    "u.`email` AS `creatorEmail`",
  ].join(", ");
}

function diagnosticJoinSql(columnSet: Set<string>, options: { forcePrimary?: boolean } = {}) {
  const userJoin = columnSet.has("userId") ? "u.`id` = q.`userId`" : "1 = 0";
  const tenantJoin = columnSet.has("tenantId") ? "t.`id` = q.`tenantId`" : "1 = 0";
  const indexHint = options.forcePrimary && columnSet.has("id") ? " FORCE INDEX (PRIMARY)" : "";
  return `FROM \`eclipse_quotes\` q${indexHint}
    LEFT JOIN \`users\` u ON ${userJoin}
    LEFT JOIN \`tenants\` t ON ${tenantJoin}`;
}

function appendSearchSql(columnSet: Set<string>, search: string, params: any[]) {
  const trimmed = search.trim();
  if (!trimmed) return "";

  const clauses: string[] = [];
  const pattern = `%${trimmed}%`;
  for (const column of diagnosticSearchColumns) {
    if (columnSet.has(column)) {
      clauses.push(`q.${quoteIdent(column)} LIKE ?`);
      params.push(pattern);
    }
  }

  const numericId = Number(trimmed);
  if (Number.isInteger(numericId) && columnSet.has("id")) {
    clauses.push("q.`id` = ?");
    params.push(numericId);
  }

  return clauses.length ? ` AND (${clauses.join(" OR ")})` : "";
}

function appendAccessSql(columnSet: Set<string>, user: EclipseDiagnosticUser, params: any[]) {
  if (isAdminRole(user.role) || user.canViewAllQuotes) return "";
  if (!columnSet.has("userId")) return " AND 1 = 0";

  if (user.role === "design_adviser" && user.name && columnSet.has("designAdvisor")) {
    params.push(user.name, user.id);
    return " AND (q.`designAdvisor` = ? OR q.`userId` = ?)";
  }

  params.push(user.id);
  return " AND q.`userId` = ?";
}

function isDiagnosticRowListVisible(row: DiagnosticQuoteRow, user: EclipseDiagnosticUser, tenantId: number) {
  if (Number(row.tenantId) !== tenantId) return false;
  if (isAdminRole(user.role) || user.canViewAllQuotes) return true;
  if (Number(row.userId) === user.id) return true;
  if (user.role === "design_adviser" && user.name && row.designAdvisor === user.name) return true;
  return false;
}

async function queryDiagnosticRows(
  columnSet: Set<string>,
  whereSql: string,
  params: any[],
  limit: number,
) {
  const orderClause = columnSet.has("id") ? "ORDER BY q.`id` DESC" : "";
  const [rows] = await pool.execute<any[]>(
    `SELECT ${diagnosticSelectSql(columnSet)}
     ${diagnosticJoinSql(columnSet, { forcePrimary: true })}
     WHERE ${whereSql}
     ${orderClause}
     LIMIT ${limit}`,
    params,
  );
  return rows as DiagnosticQuoteRow[];
}

async function countDiagnosticRows(columnSet: Set<string>, whereSql: string, params: any[]) {
  const [rows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS count
     ${diagnosticJoinSql(columnSet)}
     WHERE ${whereSql}`,
    params,
  );
  return Number(rows[0]?.count || 0);
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

function summarizeDiagnosticQuote(
  row: DiagnosticQuoteRow,
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
  const columnSet = await getEclipseQuoteColumnSet();
  const missingDiagnosticColumns = diagnosticQuoteColumns
    .filter((field) => !columnSet.has(field.column))
    .map((field) => field.column);

  const tenantParams: any[] = [];
  const tenantWhere = columnSet.has("tenantId")
    ? (tenantParams.push(options.tenantId), "q.`tenantId` = ?")
    : "1 = 0";
  const tenantRows = await queryDiagnosticRows(
    columnSet,
    `${tenantWhere}${appendSearchSql(columnSet, search, tenantParams)}`,
    tenantParams,
    limit,
  );

  const visibleQuoteIds = new Set(
    tenantRows
      .filter((row) => isDiagnosticRowListVisible(row, options.listUser, options.tenantId))
      .map((row) => Number(row.id)),
  );

  const listCountParams: any[] = [];
  const listCountWhere = columnSet.has("tenantId")
    ? (listCountParams.push(options.tenantId), "q.`tenantId` = ?")
    : "1 = 0";
  const serverListCount = await countDiagnosticRows(
    columnSet,
    `${listCountWhere}${appendAccessSql(columnSet, options.listUser, listCountParams)}`,
    listCountParams,
  );

  let statusCounts: Record<string, number> = {};
  if (columnSet.has("tenantId") && columnSet.has("status")) {
    const [rows] = await pool.execute<any[]>(
      "SELECT q.`status` AS status, COUNT(*) AS count FROM `eclipse_quotes` q WHERE q.`tenantId` = ? GROUP BY q.`status`",
      [options.tenantId],
    );
    statusCounts = Object.fromEntries(rows.map((row) => [String(row.status || "unknown"), Number(row.count || 0)]));
  }

  let archivedCount = 0;
  let activeCount = tenantRows.length;
  if (columnSet.has("tenantId") && columnSet.has("archived")) {
    const [rows] = await pool.execute<any[]>(
      "SELECT q.`archived` AS archived, COUNT(*) AS count FROM `eclipse_quotes` q WHERE q.`tenantId` = ? GROUP BY q.`archived`",
      [options.tenantId],
    );
    archivedCount = Number(rows.find((row) => Boolean(row.archived))?.count || 0);
    activeCount = Number(rows.find((row) => !row.archived)?.count || 0);
  } else if (columnSet.has("tenantId")) {
    activeCount = await countDiagnosticRows(columnSet, "q.`tenantId` = ?", [options.tenantId]);
  }

  const currentUserParams: any[] = [];
  const currentUserWhere = columnSet.has("tenantId") && columnSet.has("userId")
    ? (currentUserParams.push(options.tenantId, options.user.id), "q.`tenantId` = ? AND q.`userId` = ?")
    : "1 = 0";
  const latestByCurrentUser = await queryDiagnosticRows(
    columnSet,
    currentUserWhere,
    currentUserParams,
    5,
  );

  for (const row of latestByCurrentUser) {
    if (isDiagnosticRowListVisible(row, options.listUser, options.tenantId)) {
      visibleQuoteIds.add(Number(row.id));
    }
  }

  let outsideTenantMatches: Array<ReturnType<typeof summarizeDiagnosticQuote>> = [];
  let nullTenantCount: number | null = null;

  if (options.includeGlobal) {
    if (columnSet.has("tenantId")) {
      nullTenantCount = await countDiagnosticRows(columnSet, "q.`tenantId` IS NULL", []);
    }

    if (search && columnSet.has("tenantId")) {
      const outsideParams: any[] = [options.tenantId];
      const outsideRows = await queryDiagnosticRows(
        columnSet,
        `(q.\`tenantId\` <> ? OR q.\`tenantId\` IS NULL)${appendSearchSql(columnSet, search, outsideParams)}`,
        outsideParams,
        10,
      );
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
      serverListCount,
      currentTenantMatchCount: tenantRows.length,
      statusCounts,
      archivedCount,
      activeCount,
      globalDiagnosticsAvailable: Boolean(options.includeGlobal),
      nullTenantCount,
      missingDiagnosticColumns,
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
