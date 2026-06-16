import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, desc, asc, and, gte, lte, like, sql, or, isNull, inArray } from "drizzle-orm";
import {
  crmLeads, crmAppointments, crmContracts, crmBuildingAuthority,
  crmConstructions, crmVerifications, crmCustomerReviews,
  crmActivities, crmDocuments, leadNotes, quoteNotes, branches,
  smsMessages, callLogs, clientActivities, googleReviews,
  type InsertCrmLead, type InsertLeadNote
} from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

type TenantScopedFilter = {
  tenantId?: number | null;
};

function tenantClause(alias: string, tenantId?: number | null) {
  return tenantId
    ? { sql: ` AND (${alias}.tenantId = ? OR ${alias}.tenantId IS NULL)`, params: [tenantId] }
    : { sql: "", params: [] };
}

// ─── Lead Number Generation ─────────────────────────────────────────────────
export async function getNextLeadNumber(tenantId?: number | null): Promise<string> {
  const [rows] = await pool.execute(
    tenantId
      ? `SELECT MAX(CAST(SUBSTRING(leadNumber, 3) AS UNSIGNED)) AS maxNumber
         FROM crm_leads
         WHERE (tenantId = ? OR tenantId IS NULL)
           AND leadNumber REGEXP '^L-[0-9]+$'`
      : `SELECT MAX(CAST(SUBSTRING(leadNumber, 3) AS UNSIGNED)) AS maxNumber
         FROM crm_leads
         WHERE leadNumber REGEXP '^L-[0-9]+$'`,
    tenantId ? [tenantId] : []
  );
  const num = Number((rows as any[])[0]?.maxNumber || 0) + 1;
  return `L-${String(num).padStart(4, "0")}`;
}

// ─── Leads CRUD ─────────────────────────────────────────────────────────────
export async function listLeads(filters?: {
  status?: string;
  lifecycleView?: "pipeline" | "clients" | "all";
  productType?: string;
  leadSource?: string;
  designAdvisor?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  franchiseNumber?: string;
  branchId?: number | string; // number = specific branch, "unassigned" = no branch
  baStatus?: string;
  showArchived?: boolean;
  showAll?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  tenantId?: number | null;
}) {
  const conditions: any[] = [];
  appendTenantScope(conditions, crmLeads.tenantId, filters?.tenantId);
  // By default, exclude archived leads unless explicitly requested
  if (!filters?.showArchived) {
    conditions.push(eq(crmLeads.archived, false));
  }

  if (filters?.lifecycleView === "clients") {
    conditions.push(sql`${crmLeads.status} IN ('completed', 'won')`);
    conditions.push(
      filters.tenantId
        ? sql`EXISTS (
            SELECT 1 FROM construction_jobs cj
            WHERE cj.leadId = ${crmLeads.id}
              AND (cj.tenantId = ${filters.tenantId} OR cj.tenantId IS NULL)
          )`
        : sql`EXISTS (
            SELECT 1 FROM construction_jobs cj
            WHERE cj.leadId = ${crmLeads.id}
          )`
    );
  } else if (filters?.lifecycleView === "pipeline") {
    conditions.push(sql`${crmLeads.status} NOT IN ('completed', 'won', 'cancelled')`);
  }

  // Performance: default to active leads from past 3 months when no date/status filter is set
  // Skip this optimization when showAll is true, or when user has set explicit filters
  if (!filters?.lifecycleView && !filters?.showAll && !filters?.status && !filters?.startDate && !filters?.search && !filters?.showArchived) {
    // Exclude completed/won/cancelled by default
    conditions.push(
      sql`${crmLeads.status} NOT IN ('completed', 'won', 'cancelled')`
    );
    // Only load leads from the past 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    conditions.push(gte(crmLeads.createdAt, threeMonthsAgo));
  }

  if (filters?.status) conditions.push(eq(crmLeads.status, filters.status as any));
  if (filters?.productType) conditions.push(eq(crmLeads.productType, filters.productType));
  if (filters?.leadSource) conditions.push(eq(crmLeads.leadSource, filters.leadSource));
  if (filters?.designAdvisor === "__unassigned__") {
    conditions.push(or(isNull(crmLeads.designAdvisor), eq(crmLeads.designAdvisor, "")));
  } else if (filters?.designAdvisor) {
    conditions.push(eq(crmLeads.designAdvisor, filters.designAdvisor));
  }
  if (filters?.franchiseNumber) conditions.push(eq(crmLeads.franchiseNumber, filters.franchiseNumber));
  if (filters?.branchId === "unassigned") {
    conditions.push(isNull(crmLeads.branchId));
  } else if (filters?.branchId && typeof filters.branchId === "number") {
    conditions.push(eq(crmLeads.branchId, filters.branchId));
  }
  if (filters?.baStatus) {
    if (filters.baStatus === "none") {
      // Leads with no Approval record
      conditions.push(sql`${crmLeads.id} NOT IN (SELECT leadId FROM crm_building_authority)`);
    } else {
      conditions.push(sql`${crmLeads.id} IN (SELECT leadId FROM crm_building_authority WHERE status = ${filters.baStatus})`);
    }
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(crmLeads.contactFirstName, `%${filters.search}%`),
        like(crmLeads.contactLastName, `%${filters.search}%`),
        like(crmLeads.contactEmail, `%${filters.search}%`),
        like(crmLeads.contactPhone, `%${filters.search}%`),
        like(crmLeads.company, `%${filters.search}%`),
        like(crmLeads.leadNumber, `%${filters.search}%`),
        like(crmLeads.clientNumber, `%${filters.search}%`)
      )
    );
  }
  if (filters?.startDate) conditions.push(gte(crmLeads.createdAt, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(crmLeads.createdAt, new Date(filters.endDate)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Dynamic sort
  const sortCol = filters?.sortBy || "createdAt";
  const sortFn = filters?.sortDir === "asc" ? asc : desc;
  const sortColumnMap: Record<string, any> = {
    leadNumber: crmLeads.leadNumber,
    contactFirstName: crmLeads.contactFirstName,
    contactPhone: crmLeads.contactPhone,
    status: crmLeads.status,
    leadSource: crmLeads.leadSource,
    designAdvisor: crmLeads.designAdvisor,
    sourceCreatedAt: crmLeads.sourceCreatedAt,
    createdAt: crmLeads.createdAt,
    suburb: crmLeads.suburb,
  };
  const orderByCol = sortColumnMap[sortCol] || crmLeads.createdAt;

  const leads = await db.select().from(crmLeads)
    .where(where)
    .orderBy(sortFn(orderByCol))
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);

  const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(crmLeads).where(where);

  // Count unassigned leads (no branchId, not archived)
  const unassignedConditions: any[] = [
    isNull(crmLeads.branchId),
    eq(crmLeads.archived, false),
  ];
  appendTenantScope(unassignedConditions, crmLeads.tenantId, filters?.tenantId);
  const [unassignedResult] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(crmLeads)
    .where(and(...unassignedConditions));

  return { leads, total: countResult.count, unassignedCount: unassignedResult.count };
}

export async function listLeadIds(filters?: {
  status?: string;
  lifecycleView?: "pipeline" | "clients" | "all";
  productType?: string;
  leadSource?: string;
  designAdvisor?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  franchiseNumber?: string;
  branchId?: number | "unassigned";
  baStatus?: string;
  showArchived?: boolean;
  tenantId?: number | null;
}) {
  const conditions: any[] = [];
  appendTenantScope(conditions, crmLeads.tenantId, filters?.tenantId);
  if (!filters?.showArchived) {
    conditions.push(eq(crmLeads.archived, false));
  }
  if (filters?.lifecycleView === "clients") {
    conditions.push(sql`${crmLeads.status} IN ('completed', 'won')`);
    conditions.push(
      filters.tenantId
        ? sql`EXISTS (
            SELECT 1 FROM construction_jobs cj
            WHERE cj.leadId = ${crmLeads.id}
              AND (cj.tenantId = ${filters.tenantId} OR cj.tenantId IS NULL)
          )`
        : sql`EXISTS (
            SELECT 1 FROM construction_jobs cj
            WHERE cj.leadId = ${crmLeads.id}
          )`
    );
  } else if (filters?.lifecycleView === "pipeline") {
    conditions.push(sql`${crmLeads.status} NOT IN ('completed', 'won', 'cancelled')`);
  }
  if (filters?.status) conditions.push(eq(crmLeads.status, filters.status as any));
  if (filters?.productType) conditions.push(eq(crmLeads.productType, filters.productType));
  if (filters?.leadSource) conditions.push(eq(crmLeads.leadSource, filters.leadSource));
  if (filters?.designAdvisor === "__unassigned__") {
    conditions.push(or(isNull(crmLeads.designAdvisor), eq(crmLeads.designAdvisor, "")));
  } else if (filters?.designAdvisor) {
    conditions.push(eq(crmLeads.designAdvisor, filters.designAdvisor));
  }
    if (filters?.franchiseNumber) conditions.push(eq(crmLeads.franchiseNumber, filters.franchiseNumber));
  if (filters?.branchId === "unassigned") {
    conditions.push(isNull(crmLeads.branchId));
  } else if (filters?.branchId) {
    conditions.push(eq(crmLeads.branchId, filters.branchId));
  }
  if (filters?.baStatus) {
    if (filters.baStatus === "none") {
      conditions.push(sql`${crmLeads.id} NOT IN (SELECT leadId FROM crm_building_authority)`);
    } else {
      conditions.push(sql`${crmLeads.id} IN (SELECT leadId FROM crm_building_authority WHERE status = ${filters.baStatus})`);
    }
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(crmLeads.contactFirstName, `%${filters.search}%`),
        like(crmLeads.contactLastName, `%${filters.search}%`),
        like(crmLeads.contactEmail, `%${filters.search}%`),
        like(crmLeads.contactPhone, `%${filters.search}%`),
        like(crmLeads.company, `%${filters.search}%`),
        like(crmLeads.leadNumber, `%${filters.search}%`),
        like(crmLeads.clientNumber, `%${filters.search}%`)
      )
    );
  }
  if (filters?.startDate) conditions.push(gte(crmLeads.createdAt, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(crmLeads.createdAt, new Date(filters.endDate)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select({ id: crmLeads.id }).from(crmLeads).where(where).limit(5000);
  return rows.map(r => r.id);
}

export async function archiveLead(id: number, tenantId?: number | null) {
  const conditions = [eq(crmLeads.id, id)];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  await db.update(crmLeads).set({ archived: true }).where(and(...conditions));
}

export async function unarchiveLead(id: number, tenantId?: number | null) {
  const conditions = [eq(crmLeads.id, id)];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  await db.update(crmLeads).set({ archived: false }).where(and(...conditions));
}

async function visibleLeadIds(ids: number[], tenantId?: number | null) {
  if (ids.length === 0) return [];
  const conditions = [inArray(crmLeads.id, ids)];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  const rows = await db.select({ id: crmLeads.id }).from(crmLeads).where(and(...conditions));
  return rows.map(r => r.id);
}

export async function getVisibleLeadIds(ids: number[], tenantId?: number | null) {
  return visibleLeadIds(ids, tenantId);
}

export async function bulkArchiveLeads(ids: number[], tenantId?: number | null) {
  const scopedIds = await visibleLeadIds(ids, tenantId);
  if (scopedIds.length === 0) return 0;
  await db.update(crmLeads).set({ archived: true }).where(inArray(crmLeads.id, scopedIds));
  return scopedIds.length;
}

export async function bulkMarkExempt(ids: number[], tenantId?: number | null) {
  const scopedIds = await visibleLeadIds(ids, tenantId);
  if (scopedIds.length === 0) return 0;
  // For each lead, upsert building authority record with status=Exempt and clear dates
  for (const leadId of scopedIds) {
    const [existing] = await pool.execute(
      `SELECT id FROM crm_building_authority WHERE leadId = ?`, [leadId]
    );
    const rows = existing as any[];
    if (rows.length > 0) {
      await pool.execute(
        `UPDATE crm_building_authority SET status = 'Exempt', applicationDate = NULL, approvalDate = NULL, councilLetterSentDate = NULL WHERE leadId = ?`,
        [leadId]
      );
    } else {
      await pool.execute(
        `INSERT INTO crm_building_authority (leadId, status) VALUES (?, 'Exempt')`,
        [leadId]
      );
    }
  }
  return scopedIds.length;
}

export async function getLead(id: number, tenantId?: number | null) {
  const conditions = [eq(crmLeads.id, id)];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  const [lead] = await db.select().from(crmLeads).where(and(...conditions));
  return lead || null;
}

export async function createLead(data: Omit<InsertCrmLead, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(crmLeads).values(data as any);
  return { id: (result as any).insertId };
}

/**
 * Find an existing non-archived lead by phone (last 8 digits) or email.
 * Returns the first match (phone takes priority over email).
 */
export async function findExistingLeadByContact(
  phone: string | null | undefined,
  email: string | null | undefined,
  tenantId?: number | null,
): Promise<{ id: number; leadNumber: string } | null> {
  const tenantClause = tenantId ? " AND (tenantId = ? OR tenantId IS NULL)" : "";
  const tenantParams = tenantId ? [tenantId] : [];
  // Try phone match first (normalise to last 8 digits)
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const last8 = digits.slice(-8);
    if (last8.length >= 6) {
      const [rows] = await pool.execute(
        `SELECT id, leadNumber FROM crm_leads
	         WHERE archived = 0
           ${tenantClause}
	           AND contactPhone IS NOT NULL
	           AND RIGHT(REGEXP_REPLACE(contactPhone, '[^0-9]', ''), 8) = ?
	         ORDER BY createdAt DESC LIMIT 1`,
        [...tenantParams, last8]
      );
      const arr = rows as any[];
      if (arr.length > 0) return { id: arr[0].id, leadNumber: arr[0].leadNumber };
    }
  }
  // Try email match
  if (email) {
    const [rows] = await pool.execute(
      `SELECT id, leadNumber FROM crm_leads
       WHERE archived = 0
         ${tenantClause}
         AND LOWER(contactEmail) = LOWER(?)
       ORDER BY createdAt DESC LIMIT 1`,
      [...tenantParams, email]
    );
    const arr = rows as any[];
    if (arr.length > 0) return { id: arr[0].id, leadNumber: arr[0].leadNumber };
  }
  return null;
}

export async function getExistingContacts(
  emails: string[],
  phones: string[],
  tenantId?: number | null,
): Promise<{ emails: string[]; phones: string[] }> {
  const result: { emails: string[]; phones: string[] } = { emails: [], phones: [] };
  const tenantClause = tenantId ? " AND (tenantId = ? OR tenantId IS NULL)" : "";
  const tenantParams = tenantId ? [tenantId] : [];
  if (emails.length > 0) {
    // Query in batches of 100 to avoid query size limits
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const placeholders = batch.map(() => "?").join(",");
      const [rows] = await pool.execute(
        `SELECT LOWER(contactEmail) as email FROM crm_leads WHERE LOWER(contactEmail) IN (${placeholders})${tenantClause}`,
        [...batch, ...tenantParams]
      );
      result.emails.push(...(rows as any[]).map(r => r.email));
    }
  }
  if (phones.length > 0) {
    for (let i = 0; i < phones.length; i += 100) {
      const batch = phones.slice(i, i + 100);
      const placeholders = batch.map(() => "?").join(",");
      const [rows] = await pool.execute(
        `SELECT contactPhone as phone FROM crm_leads WHERE contactPhone IN (${placeholders})${tenantClause}`,
        [...batch, ...tenantParams]
      );
      result.phones.push(...(rows as any[]).map(r => r.phone));
    }
  }
  return result;
}

export async function bulkCreateLeads(leads: Omit<InsertCrmLead, "id" | "createdAt" | "updatedAt">[]) {
  if (leads.length === 0) return { count: 0 };
  // Insert in batches of 50 to avoid query size limits
  let count = 0;
  for (let i = 0; i < leads.length; i += 50) {
    const batch = leads.slice(i, i + 50);
    await db.insert(crmLeads).values(batch as any[]);
    count += batch.length;
  }
  return { count };
}

export async function updateLead(id: number, data: Partial<InsertCrmLead>, tenantId?: number | null) {
  const conditions = [eq(crmLeads.id, id)];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  await db.update(crmLeads).set(data as any).where(and(...conditions));
}

export async function deleteLead(id: number, tenantId?: number | null) {
  const conditions = [eq(crmLeads.id, id)];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  await db.delete(crmLeads).where(and(...conditions));
}

// Bulk-delete leads and all related child records
export async function bulkDeleteLeads(ids: number[], tenantId?: number | null): Promise<number> {
  const scopedIds = await visibleLeadIds(ids, tenantId);
  if (scopedIds.length === 0) return 0;
  // Delete child records first (order doesn't matter as long as leads go last)
  await db.delete(leadNotes).where(inArray(leadNotes.leadId, scopedIds));
  await db.delete(crmActivities).where(inArray(crmActivities.leadId, scopedIds));
  await db.delete(crmAppointments).where(inArray(crmAppointments.leadId, scopedIds));
  await db.delete(crmDocuments).where(inArray(crmDocuments.leadId, scopedIds));
  await db.delete(crmContracts).where(inArray(crmContracts.leadId, scopedIds));
  await db.delete(crmBuildingAuthority).where(inArray(crmBuildingAuthority.leadId, scopedIds));
  await db.delete(crmConstructions).where(inArray(crmConstructions.leadId, scopedIds));
  await db.delete(crmVerifications).where(inArray(crmVerifications.leadId, scopedIds));
  await db.delete(crmCustomerReviews).where(inArray(crmCustomerReviews.leadId, scopedIds));
  await db.delete(smsMessages).where(inArray(smsMessages.leadId, scopedIds));
  await db.delete(callLogs).where(inArray(callLogs.leadId, scopedIds));
  await db.delete(clientActivities).where(inArray(clientActivities.leadId, scopedIds));
  // Finally delete the leads themselves
  const [result] = await db.delete(crmLeads).where(inArray(crmLeads.id, scopedIds));
  return (result as any).affectedRows ?? scopedIds.length;
}


// ─── Merge Leads ────────────────────────────────────────────────────────────

export async function mergeLeads(primaryId: number, duplicateIds: number[], tenantId?: number | null): Promise<{ transferred: number; archived: number }> {
  if (duplicateIds.length === 0) return { transferred: 0, archived: 0 };
  // Ensure primary is not in duplicates
  const scopedIds = await visibleLeadIds([primaryId, ...duplicateIds], tenantId);
  if (!scopedIds.includes(primaryId)) return { transferred: 0, archived: 0 };
  const dupes = duplicateIds.filter(id => id !== primaryId && scopedIds.includes(id));
  if (dupes.length === 0) return { transferred: 0, archived: 0 };

  let transferred = 0;

  // Transfer all child records from duplicates to primary
  const tables = [
    { table: leadNotes, col: leadNotes.leadId },
    { table: crmActivities, col: crmActivities.leadId },
    { table: crmAppointments, col: crmAppointments.leadId },
    { table: crmDocuments, col: crmDocuments.leadId },
    { table: crmContracts, col: crmContracts.leadId },
    { table: crmBuildingAuthority, col: crmBuildingAuthority.leadId },
    { table: crmConstructions, col: crmConstructions.leadId },
    { table: crmVerifications, col: crmVerifications.leadId },
    { table: crmCustomerReviews, col: crmCustomerReviews.leadId },
    { table: smsMessages, col: smsMessages.leadId },
    { table: callLogs, col: callLogs.leadId },
    { table: clientActivities, col: clientActivities.leadId },
    { table: googleReviews, col: googleReviews.leadId },
  ];

  for (const { table, col } of tables) {
    const [result] = await db.update(table as any).set({ leadId: primaryId }).where(inArray(col as any, dupes));
    transferred += (result as any).affectedRows ?? 0;
  }

  // Archive the duplicate leads (soft-delete)
  const [archiveResult] = await db.update(crmLeads).set({ archived: true }).where(inArray(crmLeads.id, dupes));
  const archived = (archiveResult as any).affectedRows ?? dupes.length;

  // Log the merge as an activity on the primary lead
  await db.insert(crmActivities).values({
    leadId: primaryId,
    activityType: "note",
    description: `Merged ${dupes.length} duplicate lead(s) (${dupes.map(d => `L-${d}`).join(", ")}) into this lead. ${transferred} records transferred.`,
  });

  return { transferred, archived };
}

// ─── Find Duplicate Leads ───────────────────────────────────────────────────
export async function findDuplicateLeads(leadId: number, tenantId?: number | null): Promise<Array<{
  id: number;
  leadNumber: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  status: string;
  productType: string | null;
  leadSource: string | null;
  sourceCreatedAt: Date | null;
  createdAt: Date | null;
  matchReasons: string[];
}>> {
  // Get the source lead
  const sourceConditions = [eq(crmLeads.id, leadId)];
  appendTenantScope(sourceConditions, crmLeads.tenantId, tenantId);
  const [source] = await db.select().from(crmLeads).where(and(...sourceConditions)).limit(1);
  if (!source) return [];

  const conditions: ReturnType<typeof like>[] = [];

  // Normalise phone: strip spaces, dashes, parens
  const normPhone = source.contactPhone?.replace(/[\s\-()]/g, "");
  if (normPhone && normPhone.length >= 8) {
    // Match last 8 digits to handle country code differences
    const last8 = normPhone.slice(-8);
    conditions.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${crmLeads.contactPhone}, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ${"%" + last8}`);
  }

  if (source.contactEmail && source.contactEmail.trim()) {
    conditions.push(eq(crmLeads.contactEmail, source.contactEmail.trim()));
  }

  if (conditions.length === 0) return [];

  // Find leads matching phone OR email, excluding self and archived
  const candidateConditions: any[] = [
    or(...conditions),
    sql`${crmLeads.id} != ${leadId}`,
    eq(crmLeads.archived, false),
  ];
  appendTenantScope(candidateConditions, crmLeads.tenantId, tenantId);
  const candidates = await db.select().from(crmLeads).where(
    and(...candidateConditions)
  ).orderBy(desc(crmLeads.createdAt)).limit(20);

  // Annotate each candidate with match reasons
  return candidates.map((c) => {
    const matchReasons: string[] = [];
    if (normPhone && normPhone.length >= 8) {
      const cNorm = c.contactPhone?.replace(/[\s\-()]/g, "") || "";
      if (cNorm.length >= 8 && cNorm.slice(-8) === normPhone.slice(-8)) {
        matchReasons.push("phone");
      }
    }
    if (source.contactEmail && c.contactEmail &&
        source.contactEmail.trim().toLowerCase() === c.contactEmail.trim().toLowerCase()) {
      matchReasons.push("email");
    }
    return {
      id: c.id,
      leadNumber: c.leadNumber,
      contactFirstName: c.contactFirstName,
      contactLastName: c.contactLastName,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      contactAddress: c.contactAddress,
      status: c.status,
      productType: c.productType,
      leadSource: c.leadSource,
      sourceCreatedAt: c.sourceCreatedAt,
      createdAt: c.createdAt,
      matchReasons,
    };
  }).filter((c) => c.matchReasons.length > 0);
}

/**
 * Returns IDs of active (non-archived) leads that share a phone (last 8 digits)
 * or email (case-insensitive) with at least one other active lead.
 * Used to show "Possible Duplicate" badge on the leads list.
 */
export async function getDuplicateLeadIds(tenantId?: number | null): Promise<number[]> {
  // Use raw SQL for efficiency — self-join on normalised phone or email
  const tenantClause = tenantId
    ? " AND (a.tenantId = ? OR a.tenantId IS NULL) AND (b.tenantId = ? OR b.tenantId IS NULL)"
    : "";
  const [rows] = await pool.execute(`
    SELECT DISTINCT a.id
    FROM crm_leads a
    INNER JOIN crm_leads b
      ON a.id != b.id
      AND b.archived = 0
    WHERE a.archived = 0
      ${tenantClause}
      AND (
        (
          a.contactPhone IS NOT NULL AND a.contactPhone != ''
          AND b.contactPhone IS NOT NULL AND b.contactPhone != ''
          AND RIGHT(REGEXP_REPLACE(a.contactPhone, '[^0-9]', ''), 8) = RIGHT(REGEXP_REPLACE(b.contactPhone, '[^0-9]', ''), 8)
          AND LENGTH(REGEXP_REPLACE(a.contactPhone, '[^0-9]', '')) >= 8
          AND LENGTH(REGEXP_REPLACE(b.contactPhone, '[^0-9]', '')) >= 8
        )
        OR (
          a.contactEmail IS NOT NULL AND a.contactEmail != ''
          AND b.contactEmail IS NOT NULL AND b.contactEmail != ''
          AND LOWER(TRIM(a.contactEmail)) = LOWER(TRIM(b.contactEmail))
        )
      )
  `, tenantId ? [tenantId, tenantId] : []);
  return (rows as any[]).map(r => r.id);
}

// Search all leads regardless of status (for LeadPicker / quote creation)
export async function searchAllLeads(query: string, tenantId?: number | null) {
  const pattern = `%${query}%`;
  const conditions = [
    or(
      like(crmLeads.contactFirstName, pattern),
      like(crmLeads.contactLastName, pattern),
      like(crmLeads.contactEmail, pattern),
      like(crmLeads.contactPhone, pattern),
      like(crmLeads.company, pattern),
      like(crmLeads.leadNumber, pattern),
      like(crmLeads.clientNumber, pattern),
    ),
  ];
  appendTenantScope(conditions, crmLeads.tenantId, tenantId);
  return db.select().from(crmLeads).where(and(...conditions)).orderBy(desc(crmLeads.createdAt)).limit(20);
}

// ─── Appointments ───────────────────────────────────────────────────────────
export type AppointmentParticipant = { name?: string; email: string };

export async function getAppointment(id: number, tenantId?: number | null) {
  const conditions = [eq(crmAppointments.id, id)];
  appendTenantScope(conditions, crmAppointments.tenantId, tenantId);
  const [appointment] = await db.select().from(crmAppointments).where(and(...conditions)).limit(1);
  return appointment || null;
}

export async function getAppointments(leadId: number, tenantId?: number | null) {
  const conditions = [eq(crmAppointments.leadId, leadId)];
  appendTenantScope(conditions, crmAppointments.tenantId, tenantId);
  return db.select().from(crmAppointments).where(and(...conditions)).orderBy(desc(crmAppointments.createdAt));
}

export async function createAppointment(data: {
  tenantId?: number | null;
  leadId: number;
  appointmentType?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  duration?: number;
  location?: string;
  notes?: string;
  outcome?: string;
  assignedUserId?: number;
  participants?: AppointmentParticipant[];
  calendarSyncStatus?: string;
  calendarSyncError?: string | null;
}) {
  const [result] = await db.insert(crmAppointments).values(data as any);
  return { id: (result as any).insertId };
}

export async function updateAppointment(id: number, data: Partial<typeof crmAppointments.$inferInsert>, tenantId?: number | null) {
  const conditions = [eq(crmAppointments.id, id)];
  appendTenantScope(conditions, crmAppointments.tenantId, tenantId);
  await db.update(crmAppointments).set(data as any).where(and(...conditions));
}

export async function updateAppointmentSyncStatus(
  id: number,
  data: { status: string; error?: string | null; eventId?: string | null; syncedAt?: Date | null },
  tenantId?: number | null,
) {
  await updateAppointment(id, {
    calendarSyncStatus: data.status,
    calendarSyncError: data.error ?? null,
    nylasEventId: data.eventId ?? undefined,
    calendarSyncedAt: data.syncedAt ?? null,
  } as any, tenantId);
}

export async function deleteAppointment(id: number, tenantId?: number | null) {
  const conditions = [eq(crmAppointments.id, id)];
  appendTenantScope(conditions, crmAppointments.tenantId, tenantId);
  await db.delete(crmAppointments).where(and(...conditions));
}

// ─── Contracts ──────────────────────────────────────────────────────────────
export async function getContract(leadId: number) {
  const [contract] = await db.select().from(crmContracts).where(eq(crmContracts.leadId, leadId));
  return contract || null;
}

export async function upsertContract(leadId: number, data: Partial<typeof crmContracts.$inferInsert>) {
  const existing = await getContract(leadId);
  if (existing) {
    await db.update(crmContracts).set(data as any).where(eq(crmContracts.id, existing.id));
    return { id: existing.id };
  } else {
    const [result] = await db.insert(crmContracts).values({ ...data, leadId } as any);
    return { id: (result as any).insertId };
  }
}

// ─── Approvals ─────────────────────────────────────────────────────
export async function getBuildingAuthority(leadId: number) {
  const [ba] = await db.select().from(crmBuildingAuthority).where(eq(crmBuildingAuthority.leadId, leadId));
  return ba || null;
}

export async function getBaStatusesForLeads(leadIds: number[]) {
  if (leadIds.length === 0) return [];
  const rows = await db.select({
    leadId: crmBuildingAuthority.leadId,
    status: crmBuildingAuthority.status,
  }).from(crmBuildingAuthority).where(inArray(crmBuildingAuthority.leadId, leadIds));
  return rows;
}

export async function upsertBuildingAuthority(leadId: number, data: Partial<typeof crmBuildingAuthority.$inferInsert>) {
  const existing = await getBuildingAuthority(leadId);
  if (existing) {
    await db.update(crmBuildingAuthority).set(data as any).where(eq(crmBuildingAuthority.id, existing.id));
    return { id: existing.id };
  } else {
    const [result] = await db.insert(crmBuildingAuthority).values({ ...data, leadId } as any);
    return { id: (result as any).insertId };
  }
}

// ─── Constructions ──────────────────────────────────────────────────────────
export async function getConstruction(leadId: number) {
  const [c] = await db.select().from(crmConstructions).where(eq(crmConstructions.leadId, leadId));
  return c || null;
}

export async function upsertConstruction(leadId: number, data: Partial<typeof crmConstructions.$inferInsert>) {
  const existing = await getConstruction(leadId);
  if (existing) {
    await db.update(crmConstructions).set(data as any).where(eq(crmConstructions.id, existing.id));
    return { id: existing.id };
  } else {
    const [result] = await db.insert(crmConstructions).values({ ...data, leadId } as any);
    return { id: (result as any).insertId };
  }
}

// ─── Verifications ──────────────────────────────────────────────────────────
export async function getVerification(leadId: number) {
  const [v] = await db.select().from(crmVerifications).where(eq(crmVerifications.leadId, leadId));
  return v || null;
}

export async function upsertVerification(leadId: number, data: Partial<typeof crmVerifications.$inferInsert>) {
  const existing = await getVerification(leadId);
  if (existing) {
    await db.update(crmVerifications).set(data as any).where(eq(crmVerifications.id, existing.id));
    return { id: existing.id };
  } else {
    const [result] = await db.insert(crmVerifications).values({ ...data, leadId } as any);
    return { id: (result as any).insertId };
  }
}

// ─── Customer Reviews ───────────────────────────────────────────────────────
export async function getCustomerReview(leadId: number) {
  const [r] = await db.select().from(crmCustomerReviews).where(eq(crmCustomerReviews.leadId, leadId));
  return r || null;
}

export async function upsertCustomerReview(leadId: number, data: Partial<typeof crmCustomerReviews.$inferInsert>) {
  const existing = await getCustomerReview(leadId);
  if (existing) {
    await db.update(crmCustomerReviews).set(data as any).where(eq(crmCustomerReviews.id, existing.id));
    return { id: existing.id };
  } else {
    const [result] = await db.insert(crmCustomerReviews).values({ ...data, leadId } as any);
    return { id: (result as any).insertId };
  }
}

export type PostConstructionStatus = {
  leadId: number;
  constructionJobId: number | null;
  constructionCompleteDate: string | null;
  maintenanceLetterSent: boolean;
  maintenanceLetterSentDate: string | null;
  customerReviewReceived: boolean;
  portalActive: boolean;
  cpcSubscriptionActive: boolean;
  outstandingDefects: number;
  lastActivityAt: string | null;
};

function serializeDateValue(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function latestDateValue(values: unknown[]): string | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest ? latest.toISOString() : null;
}

// ─── Post-Construction Client Status ────────────────────────────────────────
export async function getPostConstructionStatuses(
  leadIds: number[],
  tenantId?: number | null,
): Promise<PostConstructionStatus[]> {
  const uniqueIds = Array.from(new Set(leadIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return [];

  const scopedIds = await visibleLeadIds(uniqueIds, tenantId);
  if (scopedIds.length === 0) return [];

  const placeholders = scopedIds.map(() => "?").join(",");
  const tenantJobClause = tenantId ? " AND (cj.tenantId = ? OR cj.tenantId IS NULL)" : "";
  const tenantPortalClause = tenantId ? " AND (pa.tenantId = ? OR pa.tenantId IS NULL)" : "";
  const params: any[] = [];
  if (tenantId) params.push(tenantId);
  if (tenantId) params.push(tenantId);
  params.push(...scopedIds);

  const [rows] = await pool.execute(
    `
      SELECT
        l.id AS leadId,
        MAX(cj.id) AS constructionJobId,
        MAX(cc.completionDate) AS crmCompletionDate,
        MAX(cj.actualEnd) AS jobActualEnd,
        MAX(cr.projectCompletedDate) AS reviewCompletedDate,
        MAX(cv.maintenanceLetterSentDate) AS maintenanceLetterSentDate,
        COUNT(DISTINCT cr.id) AS customerReviewCount,
        COUNT(DISTINCT CASE WHEN pa.isActive = 1 THEN pa.id END) AS portalActiveCount,
        COUNT(DISTINCT CASE WHEN cpc.status = 'active' THEN cpc.id END) AS cpcActiveCount,
        COUNT(DISTINCT CASE WHEN pd.status <> 'resolved' THEN pd.id END) AS outstandingDefects,
        MAX(ca.createdAt) AS crmLastActivityAt,
        MAX(cla.createdAt) AS clientLastActivityAt,
        MAX(l.updatedAt) AS leadUpdatedAt,
        MAX(cj.updatedAt) AS jobUpdatedAt
      FROM crm_leads l
      LEFT JOIN crm_constructions cc ON cc.leadId = l.id
      LEFT JOIN crm_verifications cv ON cv.leadId = l.id
      LEFT JOIN crm_customer_reviews cr ON cr.leadId = l.id
      LEFT JOIN construction_jobs cj ON cj.leadId = l.id${tenantJobClause}
      LEFT JOIN portal_access pa ON pa.constructionJobId = cj.id${tenantPortalClause}
      LEFT JOIN cpc_subscriptions cpc ON cpc.constructionJobId = cj.id
      LEFT JOIN portal_defects pd ON pd.constructionJobId = cj.id
      LEFT JOIN crm_activities ca ON ca.leadId = l.id
      LEFT JOIN client_activities cla ON cla.leadId = l.id OR cla.jobId = cj.id
      WHERE l.id IN (${placeholders})
      GROUP BY l.id
    `,
    params,
  );

  return (rows as any[]).map((row) => {
    const constructionCompleteDate =
      serializeDateValue(row.crmCompletionDate) ||
      serializeDateValue(row.jobActualEnd) ||
      serializeDateValue(row.reviewCompletedDate);
    const maintenanceLetterSentDate = serializeDateValue(row.maintenanceLetterSentDate);

    return {
      leadId: Number(row.leadId),
      constructionJobId: row.constructionJobId ? Number(row.constructionJobId) : null,
      constructionCompleteDate,
      maintenanceLetterSent: Boolean(maintenanceLetterSentDate),
      maintenanceLetterSentDate,
      customerReviewReceived: Number(row.customerReviewCount || 0) > 0,
      portalActive: Number(row.portalActiveCount || 0) > 0,
      cpcSubscriptionActive: Number(row.cpcActiveCount || 0) > 0,
      outstandingDefects: Number(row.outstandingDefects || 0),
      lastActivityAt: latestDateValue([
        row.crmLastActivityAt,
        row.clientLastActivityAt,
        row.jobUpdatedAt,
        row.leadUpdatedAt,
      ]),
    };
  });
}


// ─── Activities ─────────────────────────────────────────────────────────────
export async function getActivities(leadId: number) {
  return db.select().from(crmActivities).where(eq(crmActivities.leadId, leadId)).orderBy(desc(crmActivities.createdAt));
}

export async function createActivity(data: { leadId: number; activityType: string; description?: string; emailType?: string; sentDate?: string }) {
  const [result] = await db.insert(crmActivities).values(data as any);
  return { id: (result as any).insertId };
}

// ─── Email Correspondence Log ──────────────────────────────────────────────
export async function getEmailLog(filters?: { search?: string; letterType?: string; startDate?: string; endDate?: string } & TenantScopedFilter) {
  const conditions: any[] = [eq(crmActivities.activityType, "email_sent")];
  appendTenantScope(conditions, crmLeads.tenantId, filters?.tenantId);
  const results = await db.select({
    id: crmActivities.id,
    leadId: crmActivities.leadId,
    description: crmActivities.description,
    emailType: crmActivities.emailType,
    sentDate: crmActivities.sentDate,
    createdAt: crmActivities.createdAt,
    leadNumber: crmLeads.leadNumber,
    contactFirstName: crmLeads.contactFirstName,
    contactLastName: crmLeads.contactLastName,
    contactEmail: crmLeads.contactEmail,
  }).from(crmActivities)
    .innerJoin(crmLeads, eq(crmActivities.leadId, crmLeads.id))
    .where(and(...conditions))
    .orderBy(desc(crmActivities.createdAt));
  let filtered = results;
  if (filters?.letterType) {
    filtered = filtered.filter(r => r.emailType === filters.letterType);
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    filtered = filtered.filter(r =>
      (r.contactFirstName || "").toLowerCase().includes(s) ||
      (r.contactLastName || "").toLowerCase().includes(s) ||
      (r.contactEmail || "").toLowerCase().includes(s) ||
      (r.leadNumber || "").toLowerCase().includes(s) ||
      (r.description || "").toLowerCase().includes(s)
    );
  }
  if (filters?.startDate) {
    filtered = filtered.filter(r => r.createdAt && new Date(r.createdAt) >= new Date(filters.startDate!));
  }
  if (filters?.endDate) {
    filtered = filtered.filter(r => r.createdAt && new Date(r.createdAt) <= new Date(filters.endDate! + "T23:59:59"));
  }
  return filtered;
}

// ─── Documents ──────────────────────────────────────────────────────────────
export async function getDocuments(leadId: number) {
  return db.select().from(crmDocuments).where(eq(crmDocuments.leadId, leadId)).orderBy(desc(crmDocuments.uploadedAt));
}

export async function createDocument(data: { leadId: number; fileName: string; fileUrl: string; fileKey: string }) {
  const [result] = await db.insert(crmDocuments).values(data as any);
  return { id: (result as any).insertId };
}

export async function deleteDocument(id: number) {
  await db.delete(crmDocuments).where(eq(crmDocuments.id, id));
}

// ─── Reports Queries ────────────────────────────────────────────────────────
export async function getSalesStaffLeadSummary(filters: { startDate?: string; endDate?: string; designAdvisor?: string; status?: string; franchiseNumber?: string } & TenantScopedFilter) {
  const conditions: any[] = [];
  appendTenantScope(conditions, crmLeads.tenantId, filters.tenantId);
  if (filters.startDate) conditions.push(gte(crmLeads.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(crmLeads.createdAt, new Date(filters.endDate)));
  if (filters.designAdvisor) conditions.push(eq(crmLeads.designAdvisor, filters.designAdvisor));
  if (filters.status) conditions.push(eq(crmLeads.status, filters.status as any));
  if (filters.franchiseNumber) conditions.push(eq(crmLeads.franchiseNumber, filters.franchiseNumber));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.select({
    designAdvisor: crmLeads.designAdvisor,
    status: crmLeads.status,
    count: sql<number>`COUNT(*)`,
  }).from(crmLeads).where(where).groupBy(crmLeads.designAdvisor, crmLeads.status);
  return results;
}

export async function getProductSalesReport(filters: { startDate?: string; endDate?: string; productType?: string } & TenantScopedFilter) {
  const conditions: any[] = [];
  appendTenantScope(conditions, crmLeads.tenantId, filters.tenantId);
  if (filters.startDate) conditions.push(gte(crmLeads.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(crmLeads.createdAt, new Date(filters.endDate)));
  if (filters.productType) conditions.push(eq(crmLeads.productType, filters.productType));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.select({
    productType: crmLeads.productType,
    status: crmLeads.status,
    count: sql<number>`COUNT(*)`,
  }).from(crmLeads).where(where).groupBy(crmLeads.productType, crmLeads.status);
  return results;
}

export async function getOutcomeSummaryReport(filters: { startDate?: string; endDate?: string; outcome?: string; franchiseNumber?: string } & TenantScopedFilter) {
  const conditions: any[] = [];
  appendTenantScope(conditions, crmLeads.tenantId, filters.tenantId);
  if (filters.startDate) conditions.push(gte(crmLeads.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(crmLeads.createdAt, new Date(filters.endDate)));
  if (filters.outcome) conditions.push(eq(crmLeads.outcome, filters.outcome));
  if (filters.franchiseNumber) conditions.push(eq(crmLeads.franchiseNumber, filters.franchiseNumber));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.select({
    outcome: crmLeads.outcome,
    franchiseNumber: crmLeads.franchiseNumber,
    designAdvisor: crmLeads.designAdvisor,
    count: sql<number>`COUNT(*)`,
  }).from(crmLeads).where(where).groupBy(crmLeads.outcome, crmLeads.franchiseNumber, crmLeads.designAdvisor);
  return results;
}

export async function getLeadSourceReport(filters: { startDate?: string; endDate?: string; leadSource?: string; outcome?: string } & TenantScopedFilter) {
  const conditions: any[] = [];
  appendTenantScope(conditions, crmLeads.tenantId, filters.tenantId);
  if (filters.startDate) conditions.push(gte(crmLeads.createdAt, new Date(filters.startDate)));
  if (filters.endDate) conditions.push(lte(crmLeads.createdAt, new Date(filters.endDate)));
  if (filters.leadSource) conditions.push(eq(crmLeads.leadSource, filters.leadSource));
  if (filters.outcome) conditions.push(eq(crmLeads.outcome, filters.outcome));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.select({
    leadSource: crmLeads.leadSource,
    status: crmLeads.status,
    count: sql<number>`COUNT(*)`,
  }).from(crmLeads).where(where).groupBy(crmLeads.leadSource, crmLeads.status);
  return results;
}

export async function getCustomerSatisfactionReport(filters: { startDate?: string; endDate?: string; franchiseNumber?: string; designAdvisor?: string } & TenantScopedFilter) {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filters.startDate) {
    conditions.push("cr.createdAt >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("cr.createdAt <= ?");
    params.push(filters.endDate);
  }
  if (filters.franchiseNumber) {
    conditions.push("cl.franchiseNumber = ?");
    params.push(filters.franchiseNumber);
  }
  if (filters.designAdvisor) {
    conditions.push("cl.designAdvisor = ?");
    params.push(filters.designAdvisor);
  }
  const tenant = tenantClause("cl", filters.tenantId);
  params.push(...tenant.params);
  const where = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute(`
    SELECT cr.*, cl.leadNumber, cl.designAdvisor, cl.franchiseNumber, cl.contactFirstName, cl.contactLastName
    FROM crm_customer_reviews cr
    JOIN crm_leads cl ON cr.leadId = cl.id
    WHERE 1=1${where}${tenant.sql}
    ORDER BY cr.createdAt DESC
  `, params);
  return rows as any[];
}

// ─── Dashboard KPIs ─────────────────────────────────────────────────────────
export async function getDashboardKPIs(designAdvisor?: string, fyStart?: string, fyEnd?: string, branchId?: number, tenantId?: number | null) {
  // FY filtering strategy:
  // - Completed/Won leads: filter by contractDate (they have contracts)
  // - Active/New leads: filter by leadDate (they don't have contracts yet)
  // - Total leads: union of both (leads with contractDate in FY + leads with leadDate in FY)
  const fyStartDate = fyStart ? fyStart.slice(0, 10) : null;
  const fyEndDate = fyEnd ? fyEnd.slice(0, 10) : null;

  let daClause = '';
  let branchClauseStr = '';
  const leadTenant = tenantClause("l", tenantId);

  if (designAdvisor) {
    daClause = ' AND l.designAdvisor = ?';
  }
  if (branchId) {
    branchClauseStr = ' AND l.branchId = ?';
  }

  // Helper to build common params for lead queries
  const buildLeadParams = (dateParams: any[]) => {
    const p = [...dateParams];
    if (designAdvisor) p.push(designAdvisor);
    if (branchId) p.push(branchId);
    p.push(...leadTenant.params);
    return p;
  };

  // --- Active leads: status = 'new', filtered by leadDate in FY ---
  let activeLeadDateClause = '';
  const activeBaseParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    activeLeadDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    activeBaseParams.push(fyStartDate, fyEndDate);
  }
  const activeSql = `SELECT COUNT(*) as count FROM crm_leads l WHERE l.status NOT IN ('completed', 'won', 'cancelled')${activeLeadDateClause}${daClause}${branchClauseStr}${leadTenant.sql}`;
  const [activeRows] = await pool.execute(activeSql, buildLeadParams(activeBaseParams));
  const activeLeads = (activeRows as any[])[0]?.count || 0;

  // --- Completed leads: status = completed/won, filtered by contractDate in FY ---
  let completedDateClause = '';
  const completedBaseParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    completedDateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    completedBaseParams.push(fyStartDate, fyEndDate);
  }
  const completedSql = `SELECT COUNT(DISTINCT l.id) as count FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id WHERE l.status IN ('completed', 'won')${completedDateClause}${daClause}${branchClauseStr}${leadTenant.sql}`;
  const [completedRows] = await pool.execute(completedSql, buildLeadParams(completedBaseParams));
  const completedLeads = (completedRows as any[])[0]?.count || 0;

  // --- Total leads: active (by leadDate) + completed (by contractDate) ---
  const totalLeads = activeLeads + completedLeads;

  // --- Conversion rate ---
  const conversionRate = totalLeads > 0
    ? Math.round((completedLeads / totalLeads) * 100)
    : 0;

  // --- Contracts count and pipeline value filtered by contractDate + DA + branch ---
  let contractDateClause = '';
  let contractDaClause = '';
  let contractBranchClause = '';
  const contractCountParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    contractDateClause = ' AND c2.contractDate >= ? AND c2.contractDate <= ?';
    contractCountParams.push(fyStartDate, fyEndDate);
  }
  let contractJoin = '';
  const contractTenant = tenantClause("l2", tenantId);
  if (designAdvisor || branchId || tenantId) {
    contractJoin = ' INNER JOIN crm_leads l2 ON l2.id = c2.leadId';
    if (designAdvisor) {
      contractDaClause = ' AND l2.designAdvisor = ?';
      contractCountParams.push(designAdvisor);
    }
    if (branchId) {
      contractBranchClause = ' AND l2.branchId = ?';
      contractCountParams.push(branchId);
    }
    contractCountParams.push(...contractTenant.params);
  }
  const contractCountSql = `SELECT COUNT(*) as count FROM crm_contracts c2${contractJoin} WHERE 1=1${contractDateClause}${contractDaClause}${contractBranchClause}${contractTenant.sql}`;
  const [contractCountRows] = await pool.execute(contractCountSql, contractCountParams);
  const contractsCount = (contractCountRows as any[])[0]?.count || 0;

  const pipelineParams = [...contractCountParams];
  const pipelineSql = `SELECT COALESCE(SUM(c2.contractValue), 0) as total FROM crm_contracts c2${contractJoin} WHERE 1=1${contractDateClause}${contractDaClause}${contractBranchClause}`;
  const [pipelineRows] = await pool.execute(pipelineSql, pipelineParams);
  const pipelineValue = (pipelineRows as any[])[0]?.total || 0;

  // --- Uncontracted leads (Supply jobs) — leads with no linked contract, filtered by leadDate ---
  let uncontractedDateClause = '';
  const uncontractedParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    uncontractedDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    uncontractedParams.push(fyStartDate, fyEndDate);
  }
  if (designAdvisor) {
    uncontractedParams.push(designAdvisor);
  }
  if (branchId) {
    uncontractedParams.push(branchId);
  }
  uncontractedParams.push(...leadTenant.params);
  const uncontractedSql = `SELECT COUNT(*) as count FROM crm_leads l WHERE l.id NOT IN (SELECT leadId FROM crm_contracts WHERE leadId IS NOT NULL)${uncontractedDateClause}${daClause}${branchClauseStr}${leadTenant.sql}`;
  const [uncontractedRows] = await pool.execute(uncontractedSql, uncontractedParams);
  const uncontractedLeads = (uncontractedRows as any[])[0]?.count || 0;

  return {
    totalLeads,
    activeLeads,
    completedLeads,
    conversionRate,
    contractsThisMonth: contractsCount,
    pipelineValue: Number(pipelineValue),
    uncontractedLeads,
  };
}

export async function getRecentLeads(limit = 10, designAdvisor?: string, fyStart?: string, fyEnd?: string, branchId?: number, tenantId?: number | null) {
  // Filter by contractDate (the real activity date) via JOIN to crm_contracts
  const params: any[] = [];
  let dateClause = '';
  let daClause = '';
  let branchClause = '';
  if (fyStart && fyEnd) {
    dateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    params.push(fyStart.slice(0, 10), fyEnd.slice(0, 10));
  }
  if (designAdvisor) {
    daClause = ' AND l.designAdvisor = ?';
    params.push(designAdvisor);
  }
  if (branchId) {
    branchClause = ' AND l.branchId = ?';
    params.push(branchId);
  }
  const tenant = tenantClause("l", tenantId);
  params.push(...tenant.params);
  const [rows] = await pool.execute(
    `SELECT l.* FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id WHERE 1=1${dateClause}${daClause}${branchClause}${tenant.sql} ORDER BY c.contractDate DESC LIMIT ${Number(limit)}`,
    params
  );
  return rows as any[];
}

export async function getLeadsByStatus(designAdvisor?: string, fyStart?: string, fyEnd?: string, branchId?: number, tenantId?: number | null) {
  // Filter by contractDate via JOIN to crm_contracts
  const params: any[] = [];
  let dateClause = '';
  let daClause = '';
  let branchClause = '';
  if (fyStart && fyEnd) {
    dateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    params.push(fyStart.slice(0, 10), fyEnd.slice(0, 10));
  }
  if (designAdvisor) {
    daClause = ' AND l.designAdvisor = ?';
    params.push(designAdvisor);
  }
  if (branchId) {
    branchClause = ' AND l.branchId = ?';
    params.push(branchId);
  }
  const tenant = tenantClause("l", tenantId);
  params.push(...tenant.params);
  const [rows] = await pool.execute(
    `SELECT l.status, COUNT(DISTINCT l.id) as count FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id WHERE 1=1${dateClause}${daClause}${branchClause}${tenant.sql} GROUP BY l.status`,
    params
  );
  return rows as { status: string; count: number }[];
}

// ─── Contracted Sales List ─────────────────────────────────────────────────
export async function getContractedSales(designAdvisor?: string, fyStart?: string, fyEnd?: string, branchId?: number, limit = 50, tenantId?: number | null) {
  const params: any[] = [];
  let dateClause = '';
  let daClause = '';
  let branchClause = '';
  if (fyStart && fyEnd) {
    dateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    params.push(fyStart.slice(0, 10), fyEnd.slice(0, 10));
  }
  if (designAdvisor) {
    daClause = ' AND l.designAdvisor = ?';
    params.push(designAdvisor);
  }
  if (branchId) {
    branchClause = ' AND l.branchId = ?';
    params.push(branchId);
  }
  const tenant = tenantClause("l", tenantId);
  params.push(...tenant.params);
  const [rows] = await pool.execute(
    `SELECT l.id, l.leadNumber, l.contactFirstName, l.contactLastName, l.suburb, l.state, l.postcode,
      l.designAdvisor, l.productType, l.status,
      c.contractDate, c.contractValue, c.depositAmount
    FROM crm_leads l
    INNER JOIN crm_contracts c ON c.leadId = l.id
    WHERE 1=1${dateClause}${daClause}${branchClause}${tenant.sql}
    ORDER BY c.contractDate DESC
    LIMIT ${Number(limit)}`,
    params
  );
  return rows as any[];
}

// ─── Lead Timeline (replaces old getClientTimeline) ─────────────────────────
export async function getLeadTimeline(leadId: number) {
  // Fetch quotes, deck_quotes, eclipse_quotes, and CRM activities for this lead
  const [quoteRows] = await pool.execute(
    `SELECT id, quoteNumber, clientName, status, createdAt, 'structure' as quoteType FROM quotes WHERE clientId = ?`,
    [leadId]
  );
  const [deckRows] = await pool.execute(
    `SELECT id, quoteNumber, clientName, status, createdAt, 'deck' as quoteType FROM deck_quotes WHERE clientId = ?`,
    [leadId]
  );
  const [eclipseRows] = await pool.execute(
    `SELECT id, quoteNumber, clientName, status, createdAt, 'eclipse' as quoteType FROM eclipse_quotes WHERE clientId = ?`,
    [leadId]
  );
  const [activityRows] = await pool.execute(
    `SELECT id, activityType, description, emailType, sentDate, createdAt FROM crm_activities WHERE leadId = ?`,
    [leadId]
  );

  const events: any[] = [];

  for (const q of quoteRows as any[]) {
    events.push({
      type: "quote",
      quoteType: q.quoteType,
      id: q.id,
      quoteNumber: q.quoteNumber,
      clientName: q.clientName,
      status: q.status,
      date: q.createdAt,
    });
  }
  for (const q of deckRows as any[]) {
    events.push({
      type: "quote",
      quoteType: q.quoteType,
      id: q.id,
      quoteNumber: q.quoteNumber,
      clientName: q.clientName,
      status: q.status,
      date: q.createdAt,
    });
  }
  for (const q of eclipseRows as any[]) {
    events.push({
      type: "quote",
      quoteType: q.quoteType,
      id: q.id,
      quoteNumber: q.quoteNumber,
      clientName: q.clientName,
      status: q.status,
      date: q.createdAt,
    });
  }
  for (const a of activityRows as any[]) {
    events.push({
      type: "activity",
      id: a.id,
      activityType: a.activityType,
      description: a.description,
      emailType: a.emailType,
      sentDate: a.sentDate,
      date: a.createdAt,
    });
  }

  // Sort by date descending
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events;
}


// --- Lead Notes ---
export async function getLeadNotes(leadId: number, section?: string) {
  const conditions = [eq(leadNotes.leadId, leadId)];
  if (section) {
    conditions.push(eq(leadNotes.section, section));
  }
  const results = await db.select().from(leadNotes).where(and(...conditions)).orderBy(desc(leadNotes.createdAt));
  // Sort: pinned first, then by date descending
  return results.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function createLeadNote(data: { leadId: number; section?: string; userId: number; userName: string; content: string; category?: string }) {
  const [result] = await db.insert(leadNotes).values({ ...data, section: data.section || "general", category: data.category || "general" }).$returningId();
  return result.id;
}

export async function deleteLeadNote(noteId: number) {
  await db.delete(leadNotes).where(eq(leadNotes.id, noteId));
}

export async function toggleLeadNotePin(noteId: number, pinned: boolean) {
  await db.update(leadNotes).set({ pinned }).where(eq(leadNotes.id, noteId));
}

export async function updateLeadNote(noteId: number, content: string, category?: string) {
  const updates: any = { content };
  if (category !== undefined) updates.category = category;
  await db.update(leadNotes).set(updates).where(eq(leadNotes.id, noteId));
}

// --- Quote Notes ---
export async function getQuoteNotes(quoteId: number, quoteType: string) {
  const results = await db.select().from(quoteNotes)
    .where(and(eq(quoteNotes.quoteId, quoteId), eq(quoteNotes.quoteType, quoteType)))
    .orderBy(desc(quoteNotes.createdAt));
  return results.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function createQuoteNote(data: { quoteId: number; quoteType: string; userId: number; userName: string; content: string }) {
  const [result] = await db.insert(quoteNotes).values(data).$returningId();
  return result.id;
}

export async function deleteQuoteNote(noteId: number) {
  await db.delete(quoteNotes).where(eq(quoteNotes.id, noteId));
}

export async function toggleQuoteNotePin(noteId: number, pinned: boolean) {
  await db.update(quoteNotes).set({ pinned }).where(eq(quoteNotes.id, noteId));
}


// ─── Branch Performance Stats ──────────────────────────────────────────────
export async function getBranchPerformance(fyStart?: string, fyEnd?: string, designAdvisor?: string, branchId?: number, tenantId?: number | null) {
  // Get all active branches
  const allBranches = await db.select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.isActive, true));

  const fyStartDate = fyStart ? fyStart.slice(0, 10) : null;
  const fyEndDate = fyEnd ? fyEnd.slice(0, 10) : null;
  const tenant = tenantClause("l", tenantId);

  // --- Active leads per branch: status NOT completed/won/cancelled, filtered by leadDate ---
  let activeDateClause = '';
  let activeDaClause = '';
  let activeBranchClause = '';
  const activeParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    activeDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    activeParams.push(fyStartDate, fyEndDate);
  }
  if (designAdvisor) {
    activeDaClause = ' AND l.designAdvisor = ?';
    activeParams.push(designAdvisor);
  }
  if (branchId) {
    activeBranchClause = ' AND l.branchId = ?';
    activeParams.push(branchId);
  }
  activeParams.push(...tenant.params);
  const [activeRows] = await pool.execute(
    `SELECT l.branchId, COUNT(*) as activeLeads
    FROM crm_leads l
    WHERE l.branchId IS NOT NULL AND l.status NOT IN ('completed', 'won', 'cancelled')${activeDateClause}${activeDaClause}${activeBranchClause}${tenant.sql}
    GROUP BY l.branchId`,
    activeParams
  );
  const activeByBranch = activeRows as any[];

  // --- Won/completed leads per branch: status completed/won, filtered by leadDate ---
  let wonDateClause = '';
  let wonDaClause = '';
  let wonBranchClause = '';
  const wonParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    wonDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    wonParams.push(fyStartDate, fyEndDate);
  }
  if (designAdvisor) {
    wonDaClause = ' AND l.designAdvisor = ?';
    wonParams.push(designAdvisor);
  }
  if (branchId) {
    wonBranchClause = ' AND l.branchId = ?';
    wonParams.push(branchId);
  }
  wonParams.push(...tenant.params);
  const [wonRows] = await pool.execute(
    `SELECT l.branchId, COUNT(*) as wonLeads
    FROM crm_leads l
    WHERE l.branchId IS NOT NULL AND l.status IN ('completed', 'won')${wonDateClause}${wonDaClause}${wonBranchClause}${tenant.sql}
    GROUP BY l.branchId`,
    wonParams
  );
  const wonByBranch = wonRows as any[];

  // Get unassigned completed leads count
  const unassignedParams: any[] = [];
  let unassignedDateClause = '';
  if (fyStartDate && fyEndDate) {
    unassignedDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    unassignedParams.push(fyStartDate, fyEndDate);
  }
  unassignedParams.push(...tenant.params);
  const [unassignedRows] = await pool.execute(
    `SELECT COUNT(*) as count FROM crm_leads l WHERE l.branchId IS NULL AND l.status IN ('completed', 'won')${unassignedDateClause}${tenant.sql}`,
    unassignedParams
  );
  const unassignedCount = (unassignedRows as any[])[0]?.count || 0;

  // Merge branch names with stats
  const results = allBranches.map(branch => {
    const activeStats = activeByBranch.find((s: any) => s.branchId === branch.id);
    const wonStats = wonByBranch.find((s: any) => s.branchId === branch.id);
    const active = Number(activeStats?.activeLeads || 0);
    const won = Number(wonStats?.wonLeads || 0);
    const total = active + won;
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
    return {
      branchId: branch.id,
      branchName: branch.name,
      totalLeads: total,
      wonLeads: won,
      activeLeads: active,
      conversionRate,
    };
  });

  return {
    branches: results,
    unassignedLeads: unassignedCount,
  };
}


// ─── Adviser Performance Stats ──────────────────────────────────────────────
export async function getAdviserPerformance(fyStart?: string, fyEnd?: string, branchId?: number, tenantId?: number | null) {
  const fyStartDate = fyStart ? fyStart.slice(0, 10) : null;
  const fyEndDate = fyEnd ? fyEnd.slice(0, 10) : null;
  const tenant = tenantClause("l", tenantId);

  // --- Active leads per adviser: status NOT completed/won/cancelled, filtered by leadDate ---
  let activeDateClause = '';
  let activeBranchClause = '';
  const activeParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    activeDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    activeParams.push(fyStartDate, fyEndDate);
  }
  if (branchId) {
    activeBranchClause = ' AND l.branchId = ?';
    activeParams.push(branchId);
  }
  activeParams.push(...tenant.params);
  const [activeRows] = await pool.execute(
    `SELECT l.designAdvisor, COUNT(*) as activeLeads
    FROM crm_leads l
    WHERE l.designAdvisor IS NOT NULL AND l.designAdvisor != '' AND l.status NOT IN ('completed', 'won', 'cancelled')${activeDateClause}${activeBranchClause}${tenant.sql}
    GROUP BY l.designAdvisor`,
    activeParams
  );
  const activeByAdviser = activeRows as any[];

  // --- Won/completed leads per adviser: filtered by leadDate using lead.status ---
  let wonDateClause = '';
  let wonBranchClause = '';
  const wonParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    wonDateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    wonParams.push(fyStartDate, fyEndDate);
  }
  if (branchId) {
    wonBranchClause = ' AND l.branchId = ?';
    wonParams.push(branchId);
  }
  wonParams.push(...tenant.params);
  const [wonRows] = await pool.execute(
    `SELECT l.designAdvisor, COUNT(*) as wonLeads
    FROM crm_leads l
    WHERE l.designAdvisor IS NOT NULL AND l.designAdvisor != '' AND l.status IN ('completed', 'won')${wonDateClause}${wonBranchClause}${tenant.sql}
    GROUP BY l.designAdvisor`,
    wonParams
  );
  const wonByAdviser = wonRows as any[];

  // --- Revenue per adviser: from contracts (only those with actual contract records) ---
  let revDateClause = '';
  let revBranchClause = '';
  const revParams: any[] = [];
  if (fyStartDate && fyEndDate) {
    revDateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    revParams.push(fyStartDate, fyEndDate);
  }
  if (branchId) {
    revBranchClause = ' AND l.branchId = ?';
    revParams.push(branchId);
  }
  revParams.push(...tenant.params);
  const [revRows] = await pool.execute(
    `SELECT l.designAdvisor, COALESCE(SUM(c.contractValue), 0) as totalRevenue
    FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id
    WHERE l.designAdvisor IS NOT NULL AND l.designAdvisor != ''${revDateClause}${revBranchClause}${tenant.sql}
    GROUP BY l.designAdvisor`,
    revParams
  );
  const revenueByAdviser = revRows as any[];

  // Merge into a single list
  const adviserMap = new Map<string, { name: string; active: number; won: number; total: number; conversionRate: number; revenue: number }>();
  for (const row of activeByAdviser) {
    adviserMap.set(row.designAdvisor, {
      name: row.designAdvisor,
      active: Number(row.activeLeads),
      won: 0,
      total: Number(row.activeLeads),
      conversionRate: 0,
      revenue: 0,
    });
  }
  for (const row of wonByAdviser) {
    const existing = adviserMap.get(row.designAdvisor);
    if (existing) {
      existing.won = Number(row.wonLeads);
      existing.total = existing.active + existing.won;
      existing.conversionRate = existing.total > 0 ? Math.round((existing.won / existing.total) * 100) : 0;
    } else {
      const won = Number(row.wonLeads);
      adviserMap.set(row.designAdvisor, {
        name: row.designAdvisor,
        active: 0,
        won,
        total: won,
        conversionRate: 100,
        revenue: 0,
      });
    }
  }
  // Merge revenue from contracts (separate from won count)
  for (const row of revenueByAdviser) {
    const existing = adviserMap.get(row.designAdvisor);
    if (existing) {
      existing.revenue = Number(row.totalRevenue);
    }
  }

  // Sort by total leads descending
  const advisers = Array.from(adviserMap.values()).sort((a, b) => b.total - a.total);
  return { advisers };
}

// ─── Monthly Trends for KPI Sparklines ──────────────────────────────────────
export async function getMonthlyTrends(fy: number, designAdvisor?: string, branchId?: number, tenantId?: number | null) {
  // Generate 12 months of the FY: Jul(fy-1) to Jun(fy)
  const months: { start: string; end: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const year = i < 6 ? fy - 1 : fy; // Jul-Dec = fy-1, Jan-Jun = fy
    const month = i < 6 ? i + 7 : i - 5; // 1-based month
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'short' });
    months.push({ start, end, label });
  }

  let daClause = '';
  let branchClause = '';
  const baseParams: any[] = [];
  if (designAdvisor) {
    daClause = ' AND l.designAdvisor = ?';
    baseParams.push(designAdvisor);
  }
  if (branchId) {
    branchClause = ' AND l.branchId = ?';
    baseParams.push(branchId);
  }
  const tenant = tenantClause("l", tenantId);
  baseParams.push(...tenant.params);

  // Active leads by month (leadDate)
  const [activeRows] = await pool.execute(
    `SELECT DATE_FORMAT(l.leadDate, '%Y-%m') as ym, COUNT(*) as cnt
    FROM crm_leads l
    WHERE l.status NOT IN ('completed', 'won', 'cancelled')
      AND l.leadDate >= ? AND l.leadDate <= ?${daClause}${branchClause}
      ${tenant.sql}
    GROUP BY ym`,
    [months[0].start, months[11].end, ...baseParams]
  );
  const activeByMonth = new Map((activeRows as any[]).map(r => [r.ym, Number(r.cnt)]));

  // Won leads by month (contractDate)
  const wonBaseParams: any[] = [];
  let wonDaClause = '';
  let wonBranchClause = '';
  if (designAdvisor) {
    wonDaClause = ' AND l.designAdvisor = ?';
    wonBaseParams.push(designAdvisor);
  }
  if (branchId) {
    wonBranchClause = ' AND l.branchId = ?';
    wonBaseParams.push(branchId);
  }
  wonBaseParams.push(...tenant.params);
  const [wonRows] = await pool.execute(
    `SELECT DATE_FORMAT(c.contractDate, '%Y-%m') as ym, COUNT(DISTINCT l.id) as cnt, COALESCE(SUM(c.contractValue), 0) as revenue
    FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id
    WHERE l.status IN ('completed', 'won')
      AND c.contractDate >= ? AND c.contractDate <= ?${wonDaClause}${wonBranchClause}${tenant.sql}
    GROUP BY ym`,
    [months[0].start, months[11].end, ...wonBaseParams]
  );
  const wonByMonth = new Map((wonRows as any[]).map(r => [r.ym, { won: Number(r.cnt), revenue: Number(r.revenue) }]));

  // Supply jobs by month (leadDate, no contract)
  const [supplyRows] = await pool.execute(
    `SELECT DATE_FORMAT(l.leadDate, '%Y-%m') as ym, COUNT(*) as cnt
    FROM crm_leads l
    WHERE l.id NOT IN (SELECT leadId FROM crm_contracts WHERE leadId IS NOT NULL)
      AND l.leadDate >= ? AND l.leadDate <= ?${daClause}${branchClause}${tenant.sql}
    GROUP BY ym`,
    [months[0].start, months[11].end, ...baseParams]
  );
  const supplyByMonth = new Map((supplyRows as any[]).map(r => [r.ym, Number(r.cnt)]));

  // Build monthly data points
  const data = months.map(m => {
    const ym = m.start.slice(0, 7);
    const active = activeByMonth.get(ym) || 0;
    const wonData = wonByMonth.get(ym) || { won: 0, revenue: 0 };
    const total = active + wonData.won;
    const conversion = total > 0 ? Math.round((wonData.won / total) * 100) : 0;
    return {
      month: m.label,
      totalLeads: total,
      activeLeads: active,
      completedLeads: wonData.won,
      conversion,
      contracts: wonData.won,
      revenue: wonData.revenue,
      supplyJobs: supplyByMonth.get(ym) || 0,
    };
  });

  return { months: data };
}

// ─── Adviser Time-to-Close ──────────────────────────────────────────────────
export async function getAdviserTimeToClose(fyStart?: string, fyEnd?: string, branchId?: number, tenantId?: number | null) {
  const fyStartDate = fyStart ? fyStart.slice(0, 10) : null;
  const fyEndDate = fyEnd ? fyEnd.slice(0, 10) : null;

  let dateClause = '';
  let branchClause = '';
  const params: any[] = [];
  if (fyStartDate && fyEndDate) {
    dateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    params.push(fyStartDate, fyEndDate);
  }
  if (branchId) {
    branchClause = ' AND l.branchId = ?';
    params.push(branchId);
  }
  const tenant = tenantClause("l", tenantId);
  params.push(...tenant.params);

  const [rows] = await pool.execute(
    `SELECT l.designAdvisor,
      ROUND(AVG(DATEDIFF(c.contractDate, l.leadDate))) as avgDays,
      MIN(DATEDIFF(c.contractDate, l.leadDate)) as minDays,
      MAX(DATEDIFF(c.contractDate, l.leadDate)) as maxDays,
      COUNT(*) as sampleSize
    FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id
    WHERE l.designAdvisor IS NOT NULL AND l.designAdvisor != ''
      AND l.leadDate IS NOT NULL AND c.contractDate IS NOT NULL${dateClause}${branchClause}${tenant.sql}
    GROUP BY l.designAdvisor`,
    params
  );
  const byAdviser: Record<string, { avgDays: number; minDays: number; maxDays: number; sampleSize: number }> = {};
  for (const row of rows as any[]) {
    byAdviser[row.designAdvisor] = {
      avgDays: Number(row.avgDays) || 0,
      minDays: Number(row.minDays) || 0,
      maxDays: Number(row.maxDays) || 0,
      sampleSize: Number(row.sampleSize) || 0,
    };
  }
  return byAdviser;
}

// ─── Lead Source Breakdown ──────────────────────────────────────────────────
export async function getLeadSourceBreakdown(fyStart?: string, fyEnd?: string, designAdvisor?: string, branchId?: number, tenantId?: number | null) {
  const fyStartDate = fyStart ? fyStart.slice(0, 10) : null;
  const fyEndDate = fyEnd ? fyEnd.slice(0, 10) : null;

  let dateClause = '';
  let daClause = '';
  let branchClause = '';
  const params: any[] = [];
  if (fyStartDate && fyEndDate) {
    dateClause = ' AND l.leadDate >= ? AND l.leadDate <= ?';
    params.push(fyStartDate, fyEndDate);
  }
  if (designAdvisor) {
    daClause = ' AND l.designAdvisor = ?';
    params.push(designAdvisor);
  }
  if (branchId) {
    branchClause = ' AND l.branchId = ?';
    params.push(branchId);
  }
  const tenant = tenantClause("l", tenantId);
  params.push(...tenant.params);

  const [rows] = await pool.execute(
    `SELECT 
      COALESCE(NULLIF(l.leadSource, ''), 'Unknown') as source,
      COUNT(*) as totalLeads,
      SUM(CASE WHEN l.status IN ('completed', 'won') THEN 1 ELSE 0 END) as wonLeads,
      SUM(CASE WHEN l.status IN ('quoted', 'contract', 'building_authority', 'construction', 'completed', 'won') THEN 1 ELSE 0 END) as quotedLeads,
      SUM(CASE WHEN l.status IN ('contract', 'building_authority', 'construction', 'completed', 'won') THEN 1 ELSE 0 END) as contractedLeads,
      SUM(CASE WHEN l.status NOT IN ('completed', 'won', 'cancelled') THEN 1 ELSE 0 END) as activeLeads
    FROM crm_leads l
    WHERE 1=1${dateClause}${daClause}${branchClause}${tenant.sql}
    GROUP BY source
    ORDER BY totalLeads DESC`,
    params
  );

  // Also get revenue per source from contracts
  const revParams: any[] = [];
  let revDateClause = '';
  let revDaClause = '';
  let revBranchClause = '';
  if (fyStartDate && fyEndDate) {
    revDateClause = ' AND c.contractDate >= ? AND c.contractDate <= ?';
    revParams.push(fyStartDate, fyEndDate);
  }
  if (designAdvisor) {
    revDaClause = ' AND l.designAdvisor = ?';
    revParams.push(designAdvisor);
  }
  if (branchId) {
    revBranchClause = ' AND l.branchId = ?';
    revParams.push(branchId);
  }
  revParams.push(...tenant.params);
  const [revRows] = await pool.execute(
    `SELECT 
      COALESCE(NULLIF(l.leadSource, ''), 'Unknown') as source,
      COALESCE(SUM(c.contractValue), 0) as revenue
    FROM crm_leads l INNER JOIN crm_contracts c ON c.leadId = l.id
    WHERE 1=1${revDateClause}${revDaClause}${revBranchClause}${tenant.sql}
    GROUP BY source`,
    revParams
  );
  const revenueBySource = new Map<string, number>();
  for (const row of revRows as any[]) {
    revenueBySource.set(row.source, Number(row.revenue));
  }

  const sources = (rows as any[]).map(row => {
    const total = Number(row.totalLeads);
    const won = Number(row.wonLeads);
    const quoted = Number(row.quotedLeads || 0);
    const contracted = Number(row.contractedLeads || 0);
    const active = Number(row.activeLeads);
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
    return {
      source: row.source as string,
      totalLeads: total,
      wonLeads: won,
      quotedLeads: quoted,
      contractedLeads: contracted,
      activeLeads: active,
      conversionRate,
      revenue: revenueBySource.get(row.source) || 0,
    };
  });

  return { sources };
}

// ─── DA Zone Assignment ─────────────────────────────────────────────────────
export async function getAssignedDaForLead(suburb?: string, postcode?: string, state?: string): Promise<string | null> {
  if (!postcode || !state) return null;
  
  try {
    const [rows] = await pool.execute(
      `SELECT designAdvisorName FROM da_zone_assignments 
       WHERE active = true 
       AND state = ? 
       AND postcodeLow <= ? 
       AND postcodeHigh >= ?
       ORDER BY priority DESC
       LIMIT 1`,
      [state, postcode, postcode]
    );
    
    const result = (rows as any[])[0];
    return result?.designAdvisorName || null;
  } catch (error) {
    console.error("[CRM DB] Failed to get assigned DA:", error);
    return null;
  }
}


// ─── Stale Lead Detection (Follow-Up Reminders) ──────────────────────────────

/**
 * Default follow-up thresholds (days) per lead status.
 * These can be overridden via global_settings key "followUpThresholds".
 */
const DEFAULT_FOLLOW_UP_THRESHOLDS: Record<string, number> = {
  new: 3,
  assigned: 5,
  appointment_set: 7,
  quoted: 14,
  contract: 21,
  building_authority: 14,
  construction: 14,
};

/** Load follow-up thresholds from globalSettings, falling back to defaults. */
async function getFollowUpThresholds(): Promise<Record<string, number>> {
  try {
    const [rows] = await pool.execute(
      `SELECT value FROM global_settings WHERE settingKey = 'followUpThresholds' LIMIT 1`
    );
    const row = (rows as any[])[0];
    if (row?.value) {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return { ...DEFAULT_FOLLOW_UP_THRESHOLDS, ...parsed };
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_FOLLOW_UP_THRESHOLDS;
}

/**
 * Returns IDs of active (non-archived) leads that have not had any activity
 * within the threshold period for their current status.
 * Excludes completed/cancelled/won leads.
 */
export async function getStaleLeadIds(tenantId?: number | null): Promise<{ id: number; daysSinceActivity: number }[]> {
  const thresholds = await getFollowUpThresholds();
  // Build CASE expression for thresholds
  const caseParts = Object.entries(thresholds)
    .map(([status, days]) => `WHEN '${status}' THEN ${days}`)
    .join(' ');

  const tenantClause = tenantId ? " AND (l.tenantId = ? OR l.tenantId IS NULL)" : "";
  const [rows] = await pool.execute(`
    SELECT 
      l.id,
      DATEDIFF(NOW(), COALESCE(
        (SELECT MAX(a.createdAt) FROM crm_activities a WHERE a.leadId = l.id),
        l.createdAt
      )) as daysSinceActivity,
      CASE l.status ${caseParts} ELSE 14 END as threshold
    FROM crm_leads l
    WHERE l.archived = 0
      AND l.status NOT IN ('completed', 'won', 'cancelled')
      ${tenantClause}
    HAVING daysSinceActivity > threshold
    ORDER BY daysSinceActivity DESC
  `, tenantId ? [tenantId] : []);
  return (rows as any[]).map(r => ({ id: Number(r.id), daysSinceActivity: Number(r.daysSinceActivity) }));
}

// ─── Quote Outcome Breakdown ─────────────────────────────────────────────────
export async function getOutcomeBreakdown(fyStart?: string, fyEnd?: string, tenantId?: number | null) {
  const dateWhere = (alias: string) => {
    const conditions: string[] = [];
    const params: any[] = [];
    if (fyStart) { conditions.push(`${alias}.createdAt >= ?`); params.push(fyStart); }
    if (fyEnd) { conditions.push(`${alias}.createdAt < ?`); params.push(fyEnd); }
    return {
      sql: conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "",
      params,
    };
  };
  const quoteDates = dateWhere("q");
  const deckDates = dateWhere("dq");
  const eclipseDates = dateWhere("eq");
  const quoteTenant = tenantClause("q", tenantId);
  const linkedLeadTenant = tenantId ? " AND (l.tenantId = ? OR l.tenantId IS NULL)" : "";
  const linkedLeadParams = tenantId ? [tenantId] : [];
  const linkedLeadJoin = tenantId ? "INNER JOIN crm_leads l ON l.id = {alias}.clientId" : "";

  // Combine all 3 quote tables
  const sql = `
    SELECT outcomeReason, COUNT(*) as count, status
    FROM (
      SELECT q.outcomeReason, q.status, q.createdAt FROM quotes q WHERE q.outcomeReason IS NOT NULL AND q.outcomeReason != '' ${quoteDates.sql}${quoteTenant.sql}
      UNION ALL
      SELECT dq.outcomeReason, dq.status, dq.createdAt FROM deck_quotes dq ${linkedLeadJoin.replace("{alias}", "dq")} WHERE dq.outcomeReason IS NOT NULL AND dq.outcomeReason != '' ${deckDates.sql}${linkedLeadTenant}
      UNION ALL
      SELECT eq.outcomeReason, eq.status, eq.createdAt FROM eclipse_quotes eq ${linkedLeadJoin.replace("{alias}", "eq")} WHERE eq.outcomeReason IS NOT NULL AND eq.outcomeReason != '' ${eclipseDates.sql}${linkedLeadTenant}
    ) combined
    GROUP BY outcomeReason, status
    ORDER BY count DESC
  `;

  const allParams = [
    ...quoteDates.params,
    ...quoteTenant.params,
    ...deckDates.params,
    ...linkedLeadParams,
    ...eclipseDates.params,
    ...linkedLeadParams,
  ];
  const [rows] = await pool.execute(sql, allParams);
  return rows as { outcomeReason: string; count: number; status: string }[];
}
