import { eq, and, desc, like, sql, notInArray, or, gte, lte, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, quotes, quoteDetails, quoteComponents, skyluxEntries, eclipseEntries, masterData, skyluxMatrix, products, deckQuotes, eclipseQuotes, colourGroups, colourGroupMembers, crmLeads, emailImages, quoteRevisions, smsDeliveryLog, userSettings, tenantSettings, techLibraryDocuments, practicalCompletionNotices, constructionJobs, constructionKanbanTasks, portalVariations, swmsDocuments, siteInductions, constructionInstallers, constructionAssignments, inductionFormConfig, invitations, tenantMemberships, manufacturingDrivers, tradePortalAccess, quoteItems, tenants, type InsertInductionFormConfig } from "../drizzle/schema";
import { randomBytes } from "crypto";
import type { InsertSwmsDocument, InsertSiteInduction } from "../drizzle/schema";
import type { InsertPracticalCompletionNotice, InsertPortalVariation } from "../drizzle/schema";
import type { InsertTechLibraryDocument } from "../drizzle/schema";
import type { InsertQuoteRevision, InsertSmsDeliveryLog } from "../drizzle/schema";
import type { InsertQuote, InsertQuoteComponent, InsertSkyluxEntry, InsertEclipseEntry, InsertMasterData, InsertSkyluxMatrix, InsertProduct, InsertColourGroup, InsertColourGroupMember } from "../drizzle/schema";
import { ENV } from './_core/env';
import { appendTenantScope, isMultiTenancyMode, tenantScoped } from "./_core/tenant-scope";

let _db: ReturnType<typeof drizzle> | null = null;

type QuoteTenantScopeOptions = {
  includeAllTenants?: boolean;
};

function appendQuoteTenantScope(
  conditions: any[],
  column: any,
  tenantId: number | null | undefined,
  options?: QuoteTenantScopeOptions,
) {
  if (options?.includeAllTenants && !isMultiTenancyMode()) return;
  appendTenantScope(conditions, column, tenantId);
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function getDefaultTenantId(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .orderBy(sql`(${tenants.status} = 'active') desc`, tenants.id)
    .limit(1);

  return tenant?.id ?? null;
}

/** Alias for getDb - used by procedures needing direct Drizzle access */
export const getRawDb = getDb;

// ─── Users ───────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) {
      // Only set to admin if the user doesn't already have a higher role (super_admin)
      // On insert (new user), default to admin; on update, don't downgrade
      values.role = 'admin';
      // Don't include role in updateSet — preserves existing role (e.g. super_admin)
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });

    // ─── Auto-accept pending invitation on login (email match) ─────────────
    if (user.email) {
      try {
        const [pendingInvite] = await db.select()
          .from(invitations)
          .where(and(
            eq(invitations.email, user.email),
            eq(invitations.status, "pending")
          ))
          .limit(1);

        if (pendingInvite && new Date() <= pendingInvite.expiresAt) {
          // Mark invitation as accepted
          await db.update(invitations)
            .set({ status: "accepted", acceptedAt: new Date() })
            .where(eq(invitations.id, pendingInvite.id));

          // Get the user record to update role
          const [existingUser] = await db.select().from(users)
            .where(eq(users.openId, user.openId)).limit(1);

          if (existingUser) {
            // Only update role if not already admin/super_admin
            if (existingUser.role !== 'admin' && existingUser.role !== 'super_admin') {
              await db.update(users)
                .set({ role: pendingInvite.role })
                .where(eq(users.id, existingUser.id));
            }

            if (pendingInvite.tenantId) {
              const tenantRole: "owner" | "admin" | "member" =
                pendingInvite.role === "super_admin" ? "owner" :
                pendingInvite.role === "admin" ? "admin" :
                "member";
              await db.insert(tenantMemberships)
                .values({
                  tenantId: pendingInvite.tenantId,
                  userId: existingUser.id,
                  role: tenantRole,
                  isDefault: true,
                })
                .onDuplicateKeyUpdate({
                  set: {
                    role: tenantRole,
                    isDefault: true,
                  },
                });
            }

            // Auto-link driver if role is 'driver'
            if (pendingInvite.role === 'driver') {
              const [driverRecord] = await db.select()
                .from(manufacturingDrivers)
                .where(and(
                  eq(manufacturingDrivers.email, user.email!),
                  eq(manufacturingDrivers.isActive, true)
                ))
                .limit(1);
              if (driverRecord && !driverRecord.userId) {
                await db.update(manufacturingDrivers)
                  .set({ userId: existingUser.id })
                  .where(eq(manufacturingDrivers.id, driverRecord.id));
              }
            }

            // Auto-create trade portal access if role is 'construction_user'
            if (pendingInvite.role === 'construction_user') {
              const [installer] = await db.select()
                .from(constructionInstallers)
                .where(and(
                  eq(constructionInstallers.email, user.email!),
                  eq(constructionInstallers.active, true)
                ))
                .limit(1);
              if (installer) {
                // Check if trade portal access already exists
                const [existingAccess] = await db.select()
                  .from(tradePortalAccess)
                  .where(eq(tradePortalAccess.installerId, installer.id))
                  .limit(1);
                if (!existingAccess) {
                  await db.insert(tradePortalAccess).values({
                    installerId: installer.id,
                    email: user.email!,
                    accessToken: randomBytes(32).toString("hex"),
                    isActive: true,
                  });
                }
              }
            }

            console.log(`[Invitations] Auto-accepted invitation for ${user.email} → role: ${pendingInvite.role}`);
          }
        }
      } catch (inviteErr) {
        // Don't fail the login if invitation processing fails
        console.warn("[Invitations] Auto-accept failed (non-blocking):", inviteErr);
      }
    }
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function acceptTerms(userId: number, version: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users)
    .set({ termsAcceptedAt: new Date(), termsVersion: version })
    .where(eq(users.id, userId));
}

// ─── Quotes ──────────────────────────────────────────────────────────────────
const QUOTE_CORE_KEYS = new Set([
  "tenantId", "userId", "quoteNumber", "clientId", "clientName", "clientPhone", "clientEmail",
  "siteAddress", "suburb", "localCouncil", "region", "status", "outcomeReason", "archived",
  "descriptionOfWork", "notes", "includeDelivery", "deliveryAmount", "includeTravelAllowance",
  "travelAllowance", "travelDistanceKm", "travelBandKey", "travelOverridden", "travelBranchName",
  "includeSmallJobSurcharge", "smallJobSurcharge", "includeConstructionMgmt", "constructionMgmtAmount",
  "constructionMgmtPercent", "constructionMgmtOverride", "complexityLoading", "complexityOverride",
  "discountPercent", "councilFees", "homeWarranty", "designAdvisor", "proposalSentAt",
  "proposalSentTo", "signwellDocumentId", "signwellStatus", "signedPdfUrl", "signwellSentAt",
  "signwellCompletedAt", "validUntil", "expiryReminderSentAt",
]);

function splitQuotePayload(data: Record<string, any>) {
  const core: Record<string, any> = {};
  const detail: Record<string, any> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || key === "id" || key === "createdAt" || key === "updatedAt") continue;
    if (QUOTE_CORE_KEYS.has(key)) core[key] = value;
    else detail[key] = value;
  }
  return { core, detail };
}

function hasValues(data: Record<string, any>) {
  return Object.keys(data).length > 0;
}

function mergeQuoteDetail(row: any, detail?: { data: Record<string, any> | null }) {
  return { ...row, ...((detail?.data as Record<string, any> | null) || {}) };
}

async function mergeQuoteDetails(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, rows: any[]) {
  if (rows.length === 0) return rows;
  const ids = rows.map((row) => row.id).filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return rows;
  const details = await db.select().from(quoteDetails).where(inArray(quoteDetails.quoteId, ids));
  const byQuoteId = new Map(details.map((detail) => [detail.quoteId, detail]));
  return rows.map((row) => mergeQuoteDetail(row, byQuoteId.get(row.id)));
}

async function upsertQuoteDetail(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  quoteId: number,
  patch: Record<string, any>,
  replace = false,
) {
  if (!hasValues(patch)) return;
  const [existing] = await db.select().from(quoteDetails).where(eq(quoteDetails.quoteId, quoteId)).limit(1);
  const data = replace ? patch : { ...((existing?.data as Record<string, any> | null) || {}), ...patch };
  if (existing) {
    await db.update(quoteDetails).set({ data }).where(eq(quoteDetails.quoteId, quoteId));
    return;
  }
  await db.insert(quoteDetails).values({ quoteId, data });
}

export async function createQuote(data: InsertQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { core, detail } = splitQuotePayload(data);
  const result = await db.insert(quotes).values(core as any);
  const quoteId = result[0].insertId;
  await upsertQuoteDetail(db, quoteId, detail, true);
  return quoteId;
}

export async function getQuoteById(id: number, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return undefined;
  const conditions: any[] = [eq(quotes.id, id)];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  const result = await db.select().from(quotes).where(and(...conditions)).limit(1);
  const [merged] = await mergeQuoteDetails(db, result);
  return merged;
}

export async function getQuotesByUser(userId: number, search?: string, status?: string, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(quotes.userId, userId)];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  if (status && status !== "all") conditions.push(eq(quotes.status, status as any));
  if (search) conditions.push(like(quotes.clientName, `%${search}%`));
  const rows = await db.select().from(quotes).where(and(...conditions)).orderBy(desc(quotes.updatedAt));
  return mergeQuoteDetails(db, rows);
}

export async function getAllQuotes(search?: string, status?: string, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  if (status && status !== "all") conditions.push(eq(quotes.status, status as any));
  if (search) conditions.push(like(quotes.clientName, `%${search}%`));
  const rows = await db.select().from(quotes).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(quotes.updatedAt));
  return mergeQuoteDetails(db, rows);
}
export async function getQuotesByDesignAdviser(adviserName: string, search?: string, status?: string, tenantId?: number | null, userId?: number, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return [];
  const ownerOrAdvisor = userId != null
    ? or(eq(quotes.designAdvisor, adviserName), eq(quotes.userId, userId))
    : eq(quotes.designAdvisor, adviserName);
  const conditions: any[] = [ownerOrAdvisor];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  if (status && status !== "all") conditions.push(eq(quotes.status, status as any));
  if (search) conditions.push(like(quotes.clientName, `%${search}%`));
  const rows = await db.select().from(quotes).where(and(...conditions)).orderBy(desc(quotes.updatedAt));
  return mergeQuoteDetails(db, rows);
}

export async function updateQuote(id: number, data: Partial<InsertQuote>, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getQuoteById(id, tenantId, options);
  if (!existing) throw new Error("Quote not found");
  const { core, detail } = splitQuotePayload(data);
  const conditions: any[] = [eq(quotes.id, id)];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  if (hasValues(core)) await db.update(quotes).set(core as any).where(and(...conditions));
  await upsertQuoteDetail(db, id, detail);
}

export async function deleteQuote(id: number, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getQuoteById(id, tenantId, options);
  if (!existing) throw new Error("Quote not found");
  await db.delete(quoteDetails).where(eq(quoteDetails.quoteId, id));
  await db.delete(quoteComponents).where(eq(quoteComponents.quoteId, id));
  await db.delete(skyluxEntries).where(eq(skyluxEntries.quoteId, id));
  await db.delete(eclipseEntries).where(eq(eclipseEntries.quoteId, id));
  const conditions: any[] = [eq(quotes.id, id)];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  await db.delete(quotes).where(and(...conditions));
}

export async function duplicateQuote(id: number, userId: number, newQuoteNumber: string, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const original = await getQuoteById(id, tenantId, options);
  if (!original) throw new Error("Quote not found");
  const { id: _id, createdAt, updatedAt, tenantId: originalTenantId, ...rest } = original;
  const newId = await createQuote({ ...rest, tenantId: tenantId ?? originalTenantId ?? null, userId, quoteNumber: newQuoteNumber, status: "draft" });
  // Copy components
  const components = await getComponentsByQuote(id);
  for (const comp of components) {
    const { id: _cid, createdAt: _ca, updatedAt: _ua, ...crest } = comp;
    await upsertComponent({ ...crest, quoteId: newId });
  }
  return newId;
}

export async function getNextQuoteNumber() {
  const db = await getDb();
  if (!db) return "Q-0001";
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(quotes);
  const count = result[0]?.count ?? 0;
  return `Q-${String(count + 1).padStart(4, "0")}`;
}

// ─── Quote Components ────────────────────────────────────────────────────────
export async function getComponentsByQuote(quoteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(quoteComponents).where(eq(quoteComponents.quoteId, quoteId));
}

export async function getComponentByTab(quoteId: number, tabName: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(quoteComponents)
    .where(and(eq(quoteComponents.quoteId, quoteId), eq(quoteComponents.tabName, tabName)))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertComponent(data: InsertQuoteComponent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getComponentByTab(data.quoteId, data.tabName);
  if (existing) {
    await db.update(quoteComponents).set({ lineItems: data.lineItems, included: data.included }).where(eq(quoteComponents.id, existing.id));
    return existing.id;
  } else {
    const result = await db.insert(quoteComponents).values(data);
    return result[0].insertId;
  }
}

// ─── Skylux ──────────────────────────────────────────────────────────────────
export async function getSkyluxByQuote(quoteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skyluxEntries).where(eq(skyluxEntries.quoteId, quoteId));
}

export async function upsertSkylux(data: InsertSkyluxEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    const { id, createdAt, updatedAt, ...rest } = data as any;
    await db.update(skyluxEntries).set(rest).where(eq(skyluxEntries.id, id));
    return id;
  }
  const result = await db.insert(skyluxEntries).values(data);
  return result[0].insertId;
}

export async function deleteSkylux(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(skyluxEntries).where(eq(skyluxEntries.id, id));
}

export async function lookupSkyluxPrice(length: number, width: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(skyluxMatrix)
    .where(and(eq(skyluxMatrix.length, length), eq(skyluxMatrix.width, width)))
    .limit(1);
  return result[0];
}

// ─── Eclipse ─────────────────────────────────────────────────────────────────
export async function getEclipseByQuote(quoteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(eclipseEntries).where(eq(eclipseEntries.quoteId, quoteId));
}

export async function upsertEclipse(data: InsertEclipseEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    const { id, createdAt, updatedAt, ...rest } = data as any;
    await db.update(eclipseEntries).set(rest).where(eq(eclipseEntries.id, id));
    return id;
  }
  const result = await db.insert(eclipseEntries).values(data);
  return result[0].insertId;
}

export async function deleteEclipse(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(eclipseEntries).where(eq(eclipseEntries.id, id));
}

// ─── Master Data ─────────────────────────────────────────────────────────────
type TenantScope = number | null | undefined;

function masterDataScopePredicate(tenantId: TenantScope) {
  return tenantId == null
    ? isNull(masterData.tenantId)
    : or(eq(masterData.tenantId, tenantId), isNull(masterData.tenantId))!;
}

function scopedTenantConditions(column: any, tenantId: TenantScope) {
  const conditions: any[] = [];
  appendTenantScope(conditions, column, tenantId);
  return conditions;
}

function preferTenantMasterData<T extends { tenantId?: number | null; category: string; key: string; sortOrder?: number | null }>(
  rows: T[],
  tenantId: TenantScope,
) {
  if (tenantId == null) return rows;
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.category}:${row.key}`;
    const existing = byKey.get(key);
    if (!existing || row.tenantId === tenantId) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const categoryCompare = a.category.localeCompare(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export async function getMasterDataByCategory(category: string, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(masterData)
    .where(and(eq(masterData.category, category), masterDataScopePredicate(tenantId)))
    .orderBy(masterData.sortOrder);
  return preferTenantMasterData(rows, tenantId);
}

export async function getAllMasterData(tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(masterData)
    .where(masterDataScopePredicate(tenantId))
    .orderBy(masterData.category, masterData.sortOrder);
  return preferTenantMasterData(rows, tenantId);
}

export async function upsertMasterData(data: InsertMasterData, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    const existing = await getMasterDataById(data.id, tenantId);
    if (!existing) throw new Error("Master data not found");
    const { id, ...rest } = data as any;
    if (tenantId != null) rest.tenantId = tenantId;
    await db.update(masterData).set(rest).where(eq(masterData.id, id));
    return id;
  }
  const result = await db.insert(masterData).values({ ...data, tenantId: tenantId ?? data.tenantId ?? null });
  return result[0].insertId;
}

export async function getMasterDataById(id: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(masterData)
    .where(and(eq(masterData.id, id), masterDataScopePredicate(tenantId)))
    .limit(1);
  return result[0];
}

export async function deleteMasterData(id: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getMasterDataById(id, tenantId);
  if (!existing) throw new Error("Master data not found");
  await db.delete(masterData).where(eq(masterData.id, id));
}

export async function updateMasterDataSortOrder(id: number, sortOrder: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getMasterDataById(id, tenantId);
  if (!existing) throw new Error("Master data not found");
  await db.update(masterData).set({ sortOrder }).where(eq(masterData.id, id));
}

export async function removeColourGroupMembersByValue(colourValue: string, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return;
  const conditions: any[] = [eq(colourGroupMembers.colourValue, colourValue)];
  appendTenantScope(conditions, colourGroupMembers.tenantId, tenantId);
  await db.delete(colourGroupMembers).where(and(...conditions));
}

export async function reassignProductsFromTab(oldTabKey: string, newTabKey: string | null, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return;
  const conditions: any[] = [eq(products.tabName, oldTabKey)];
  appendTenantScope(conditions, products.tenantId, tenantId);
  await db.update(products)
    .set({ tabName: newTabKey || "" })
    .where(and(...conditions));
}

export async function getProductCountByTab(tabKey: string, tenantId?: TenantScope): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions: any[] = [eq(products.tabName, tabKey)];
  appendTenantScope(conditions, products.tenantId, tenantId);
  const result = await db.select({ count: sql<number>`count(*)` }).from(products)
    .where(and(...conditions));
  return Number(result[0]?.count || 0);
}

export async function getMasterDataValue(category: string, key: string, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return undefined;
  if (tenantId != null) {
    const tenantResult = await db.select().from(masterData)
      .where(and(eq(masterData.category, category), eq(masterData.key, key), eq(masterData.tenantId, tenantId)))
      .limit(1);
    if (tenantResult[0]?.value !== undefined) return tenantResult[0].value;
  }
  const result = await db.select().from(masterData)
    .where(and(eq(masterData.category, category), eq(masterData.key, key), isNull(masterData.tenantId)))
    .limit(1);
  return result[0]?.value;
}

// ─── Skylux Matrix ───────────────────────────────────────────────────────────
export async function getAllSkyluxMatrix(tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions = scopedTenantConditions(skyluxMatrix.tenantId, tenantId);
  const query = db.select().from(skyluxMatrix);
  return (conditions.length ? query.where(and(...conditions)) : query)
    .orderBy(skyluxMatrix.length, skyluxMatrix.width);
}

export async function upsertSkyluxMatrix(data: InsertSkyluxMatrix, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    const { id, ...rest } = data as any;
    const existing = await db.select({ id: skyluxMatrix.id }).from(skyluxMatrix)
      .where(and(eq(skyluxMatrix.id, id), ...(scopedTenantConditions(skyluxMatrix.tenantId, tenantId))))
      .limit(1);
    if (!existing[0]) throw new Error("Skylux matrix row not found");
    if (tenantId != null) rest.tenantId = tenantId;
    await db.update(skyluxMatrix).set(rest).where(eq(skyluxMatrix.id, id));
    return id;
  }
  const result = await db.insert(skyluxMatrix).values({ ...data, tenantId: tenantId ?? data.tenantId ?? null });
  return result[0].insertId;
}

// ─── Products ────────────────────────────────────────────────────────────────
export async function getProductsByTab(tabName: string, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(products.tabName, tabName), eq(products.active, true)];
  appendTenantScope(conditions, products.tenantId, tenantId);
  return db.select().from(products)
    .where(and(...conditions))
    .orderBy(products.sortOrder);
}

export async function getProductNamesByTabPattern(pattern: string, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [like(products.tabName, `%${pattern}%`), eq(products.active, true)];
  appendTenantScope(conditions, products.tenantId, tenantId);
  const rows = await db.select({ name: products.name, subTab: products.subTab, colourGroup: products.colourGroup, colourGroupBottom: products.colourGroupBottom, coverageWidth: products.coverageWidth }).from(products)
    .where(and(...conditions))
    .orderBy(products.sortOrder);
  // Deduplicate by name, keeping the first subTab, colourGroup, colourGroupBottom and coverageWidth found
  const seen = new Map<string, { subTab: string | null; colourGroup: string | null; colourGroupBottom: string | null; coverageWidth: number | null }>();
  for (const r of rows) {
    if (!seen.has(r.name)) seen.set(r.name, { subTab: r.subTab, colourGroup: r.colourGroup, colourGroupBottom: r.colourGroupBottom, coverageWidth: r.coverageWidth });
  }
  return Array.from(seen.entries()).map(([name, data]) => ({ name, subTab: data.subTab, colourGroup: data.colourGroup, colourGroupBottom: data.colourGroupBottom, coverageWidth: data.coverageWidth }));
}

export async function getAllProducts(tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(products.active, true)];
  appendTenantScope(conditions, products.tenantId, tenantId);
  return db.select().from(products).where(and(...conditions)).orderBy(products.tabName, products.sortOrder);
}

export async function getProductById(id: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return undefined;
  const conditions: any[] = [eq(products.id, id)];
  appendTenantScope(conditions, products.tenantId, tenantId);
  const result = await db.select().from(products).where(and(...conditions)).limit(1);
  return result[0];
}

export async function upsertProduct(data: InsertProduct, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    const { id, createdAt, updatedAt, ...rest } = data as any;
    const existing = await getProductById(id, tenantId);
    if (!existing) throw new Error("Product not found");
    if (tenantId != null) rest.tenantId = tenantId;
    await db.update(products).set(rest).where(eq(products.id, id));
    return id;
  }
  const result = await db.insert(products).values({ ...data, tenantId: tenantId ?? data.tenantId ?? null });
  return result[0].insertId;
}

export async function deleteProduct(id: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getProductById(id, tenantId);
  if (!existing) throw new Error("Product not found");
  await db.delete(products).where(eq(products.id, id));
}

/**
 * Bulk upsert products from CSV import.
 * Matches existing products by tabName + name for updates, inserts new ones.
 * Returns { inserted, updated, errors }
 */
export async function bulkUpsertProducts(rows: Array<{
  productCode?: string | null;
  tabName: string;
  subTab?: string | null;
  name: string;
  uom: string;
  baseCost: string;
  materials?: string;
  installLabour?: string;
  consumables?: string;
  markupCategory?: string | null;
  fixedSell?: string | null;
  powderCoatSurcharge?: string;
  colourGroup?: string | null;
  coverageWidth?: number | null;
  sortOrder?: number;
  active?: boolean;
}>, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let inserted = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // Find existing product by tabName + name
      const conditions: any[] = [eq(products.tabName, row.tabName), eq(products.name, row.name)];
      appendTenantScope(conditions, products.tenantId, tenantId);
      const existing = await db.select().from(products)
        .where(and(...conditions))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db.update(products).set({
          productCode: row.productCode ?? existing[0].productCode,
          uom: row.uom,
          subTab: row.subTab ?? existing[0].subTab,
          baseCost: row.baseCost,
          materials: row.materials ?? existing[0].materials,
          installLabour: row.installLabour ?? existing[0].installLabour,
          consumables: row.consumables ?? existing[0].consumables,
          markupCategory: row.markupCategory ?? existing[0].markupCategory,
          fixedSell: row.fixedSell ?? existing[0].fixedSell,
          powderCoatSurcharge: row.powderCoatSurcharge ?? existing[0].powderCoatSurcharge,
          colourGroup: row.colourGroup ?? existing[0].colourGroup,
          coverageWidth: row.coverageWidth ?? existing[0].coverageWidth,
          sortOrder: row.sortOrder ?? existing[0].sortOrder,
          active: row.active ?? true,
          ...(tenantId != null ? { tenantId } : {}),
        }).where(eq(products.id, existing[0].id));
        updated++;
      } else {
        // Insert new
        await db.insert(products).values({
          tenantId: tenantId ?? null,
          productCode: row.productCode || null,
          tabName: row.tabName,
          subTab: row.subTab || null,
          name: row.name,
          uom: row.uom,
          baseCost: row.baseCost,
          materials: row.materials || "0",
          installLabour: row.installLabour || "0",
          consumables: row.consumables || "0",
          markupCategory: row.markupCategory || null,
          fixedSell: row.fixedSell || null,
          powderCoatSurcharge: row.powderCoatSurcharge || "0",
          colourGroup: row.colourGroup || null,
          coverageWidth: row.coverageWidth ?? null,
          sortOrder: row.sortOrder ?? 0,
          active: row.active ?? true,
        });
        inserted++;
      }
    } catch (err: any) {
      errors.push({ row: i + 1, message: err.message || "Unknown error" });
    }
  }

  return { inserted, updated, errors };
}

/**
 * Export all products as a flat array for CSV generation.
 */
export async function getAllProductsForExport(tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions = scopedTenantConditions(products.tenantId, tenantId);
  const query = db.select({
    productCode: products.productCode,
    tabName: products.tabName,
    subTab: products.subTab,
    name: products.name,
    uom: products.uom,
    baseCost: products.baseCost,
    materials: products.materials,
    installLabour: products.installLabour,
    consumables: products.consumables,
    markupCategory: products.markupCategory,
    fixedSell: products.fixedSell,
    powderCoatSurcharge: products.powderCoatSurcharge,
    colourGroup: products.colourGroup,
    coverageWidth: products.coverageWidth,
    sortOrder: products.sortOrder,
    active: products.active,
  }).from(products);
  return (conditions.length ? query.where(and(...conditions)) : query)
    .orderBy(products.tabName, products.sortOrder);
}

/**
 * Calculate the sell rate for a product based on its markup category and master data.
 * Implements: ROUNDDOWN(baseCost × markupMultiplier, 0) + powderCoatSurcharge (if applicable)
 * If fixedSell is set, returns that directly.
 */
export async function calculateProductSellRate(productId: number, isPowderCoated: boolean = false, region: string = "Canberra", tenantId?: TenantScope) {
  const product = await getProductById(productId, tenantId);
  if (!product) return { sellRate: 0, costRate: 0, regionMultiplier: 1 };

  // Cost Amount = sum of breakdown fields (Materials + Install + Consumables)
  const materials = parseFloat(product.materials || "0") || 0;
  const installLabour = parseFloat(product.installLabour || "0") || 0;
  const consumables = parseFloat(product.consumables || "0") || 0;
  const costAmount = materials + installLabour + consumables;
  const fixedSell = product.fixedSell ? parseFloat(product.fixedSell) : null;
  const pcSurcharge = parseFloat(product.powderCoatSurcharge || "0");

  // Look up region multiplier from master data
  const regionValue = await getMasterDataValue("region", region, tenantId);
  const regionMultiplier = regionValue ? parseFloat(regionValue) : 1;

  if (fixedSell !== null) {
    const adjustedSell = Math.floor(fixedSell * regionMultiplier);
    return { sellRate: adjustedSell, costRate: costAmount, regionMultiplier };
  }

  if (!product.markupCategory) {
    const adjustedSell = Math.floor(costAmount * regionMultiplier);
    return { sellRate: adjustedSell, costRate: costAmount, regionMultiplier };
  }

  // Look up the markup multiplier from master data
  const markupValue = await getMasterDataValue("markup", product.markupCategory, tenantId);
  const multiplier = markupValue ? parseFloat(markupValue) : 1;

  let sellRate = Math.floor(costAmount * multiplier * regionMultiplier); // ROUNDDOWN to 0 decimals
  if (isPowderCoated && pcSurcharge > 0) {
    sellRate += Math.floor(pcSurcharge * regionMultiplier);
  }

  return { sellRate, costRate: costAmount, regionMultiplier };
}

/**
 * Batch calculate sell rates for all products in a tab.
 * Returns a map of productId -> { sellRate, costRate }
 */
export async function calculateTabProductRates(tabName: string, region: string = "Canberra", tenantId?: TenantScope) {
  const tabProducts = await getProductsByTab(tabName, tenantId);
  const rates: Record<number, { sellRate: number; costRate: number; name: string; uom: string; baseCost: number; hasPowderCoat: boolean; regionMultiplier: number }> = {};

  // Pre-fetch all needed markup values to avoid N+1
  const markupCategories = Array.from(new Set(tabProducts.map(p => p.markupCategory).filter((c): c is string => c !== null && c !== undefined)));
  const markupMap: Record<string, number> = {};
  for (const cat of markupCategories) {
    const val = await getMasterDataValue("markup", cat, tenantId);
    markupMap[cat] = val ? parseFloat(val) : 1;
  }

  // Pre-fetch region multiplier
  const regionValue = await getMasterDataValue("region", region, tenantId);
  const regionMultiplier = regionValue ? parseFloat(regionValue) : 1;

  for (const product of tabProducts) {
    // Cost Amount = sum of breakdown fields
    const materials = parseFloat(product.materials || "0") || 0;
    const installLabour = parseFloat(product.installLabour || "0") || 0;
    const consumables = parseFloat(product.consumables || "0") || 0;
    const costAmount = materials + installLabour + consumables;
    const fixedSell = product.fixedSell ? parseFloat(product.fixedSell) : null;
    const pcSurcharge = parseFloat(product.powderCoatSurcharge || "0");

    let sellRate: number;
    if (fixedSell !== null) {
      sellRate = Math.floor(fixedSell * regionMultiplier);
    } else if (product.markupCategory && markupMap[product.markupCategory]) {
      sellRate = Math.floor(costAmount * markupMap[product.markupCategory] * regionMultiplier);
    } else {
      sellRate = Math.floor(costAmount * regionMultiplier);
    }

    rates[product.id] = {
      sellRate,
      costRate: costAmount,
      name: product.name,
      uom: product.uom,
      baseCost: costAmount,
      hasPowderCoat: pcSurcharge > 0,
      regionMultiplier,
    };
  }

  return rates;
}

// ─── Stats ───────────────────────────────────────────────────────────────────
export async function getQuoteStats(userId?: number, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return { total: 0, draft: 0, sent: 0, accepted: 0, lost: 0, totalValue: 0, draftValue: 0, sentValue: 0, acceptedValue: 0, lostValue: 0 };
  const conditions: any[] = [];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  if (userId) conditions.push(eq(quotes.userId, userId));
  const condition = conditions.length ? and(...conditions) : undefined;
  const all = await db.select({ status: quotes.status, count: sql<number>`COUNT(*)`, value: sql<number>`COALESCE(SUM(total_price), 0)` })
    .from(quotes).where(condition).groupBy(quotes.status);
  const stats = { total: 0, draft: 0, sent: 0, accepted: 0, lost: 0, totalValue: 0, draftValue: 0, sentValue: 0, acceptedValue: 0, lostValue: 0 };
  for (const row of all) {
    stats[row.status as keyof typeof stats] = row.count;
    stats.total += row.count;
    const valKey = `${row.status}Value` as keyof typeof stats;
    if (valKey in stats) (stats as any)[valKey] = Number(row.value) || 0;
    stats.totalValue += Number(row.value) || 0;
  }
  return stats;
}

// ─── Analytics ──────────────────────────────────────────────────────────────
export async function getAnalytics(userId?: number) {
  const db = await getDb();
  if (!db) return {
    volumeByMonth: [],
    statusBreakdown: [],
    avgValueByMonth: [],
    pipeline: [],
    topAdvisersByVolume: [],
    recentActivity: [],
    advisorPerformance: [],
  };

  const condition = userId ? eq(quotes.userId, userId) : undefined;

  // 1. Quote volume by month (last 12 months)
  const volumeByMonth = await db.select({
    month: sql<string>`DATE_FORMAT(createdAt, '%Y-%m')`,
    count: sql<number>`COUNT(*)`,
  }).from(quotes).where(condition)
    .groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(createdAt, '%Y-%m')`);

  // 2. Status breakdown (for conversion funnel)
  const statusBreakdown = await db.select({
    status: quotes.status,
    count: sql<number>`COUNT(*)`,
  }).from(quotes).where(condition).groupBy(quotes.status);

  // 3. Average job value by month — compute from components
  const allQuotes = await db.select({
    id: quotes.id,
    userId: quotes.userId,
    status: quotes.status,
    month: sql<string>`DATE_FORMAT(quotes.createdAt, '%Y-%m')`,
    deliveryAmount: quotes.deliveryAmount,
    travelAllowance: quotes.travelAllowance,
    smallJobSurcharge: quotes.smallJobSurcharge,
    constructionMgmtAmount: quotes.constructionMgmtAmount,
    councilFees: quotes.councilFees,
    homeWarranty: quotes.homeWarranty,
    clientName: quotes.clientName,
    quoteNumber: quotes.quoteNumber,
    createdAt: quotes.createdAt,
    designAdvisor: quotes.designAdvisor,
  }).from(quotes).where(condition).orderBy(desc(quotes.createdAt));

  // Get all components for value calculation
  const allComponents = await db.select().from(quoteComponents);
  const componentsByQuote = new Map<number, typeof allComponents>();
  for (const c of allComponents) {
    if (!componentsByQuote.has(c.quoteId)) componentsByQuote.set(c.quoteId, []);
    componentsByQuote.get(c.quoteId)!.push(c);
  }

  // Calculate value per quote
  const quoteValues: { id: number; userId: number; month: string; status: string; value: number; clientName: string; quoteNumber: string; createdAt: Date; designAdvisor: string | null }[] = [];
  for (const q of allQuotes) {
    let value = 0;
    const comps = componentsByQuote.get(q.id) || [];
    for (const comp of comps) {
      const items = (comp.lineItems as any[]) || [];
      for (const item of items) {
        value += (item.qty || 0) * (item.sellRate || 0);
      }
    }
    value += parseFloat(q.deliveryAmount || "0");
    value += parseFloat(q.travelAllowance || "0");
    value += parseFloat(q.smallJobSurcharge || "0");
    value += parseFloat(q.constructionMgmtAmount || "0");
    value += parseFloat(q.councilFees || "0");
    value += parseFloat(q.homeWarranty || "0");
    quoteValues.push({ id: q.id, userId: q.userId, month: q.month, status: q.status, value, clientName: q.clientName, quoteNumber: q.quoteNumber, createdAt: q.createdAt, designAdvisor: q.designAdvisor || null });
  }

  // Aggregate average value by month
  const monthMap = new Map<string, { total: number; count: number }>();
  for (const qv of quoteValues) {
    if (!monthMap.has(qv.month)) monthMap.set(qv.month, { total: 0, count: 0 });
    const m = monthMap.get(qv.month)!;
    m.total += qv.value;
    m.count++;
  }
  const avgValueByMonth = Array.from(monthMap.entries())
    .map(([month, { total, count }]) => ({ month, avgValue: Math.round(total / count), totalValue: Math.round(total), count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 4. Revenue pipeline (value by status)
  const pipelineMap = new Map<string, { count: number; value: number }>();
  for (const qv of quoteValues) {
    if (!pipelineMap.has(qv.status)) pipelineMap.set(qv.status, { count: 0, value: 0 });
    const p = pipelineMap.get(qv.status)!;
    p.count++;
    p.value += qv.value;
  }
  const pipeline = Array.from(pipelineMap.entries())
    .map(([status, { count, value }]) => ({ status, count, value: Math.round(value) }));

  // 5. Top advisers by volume (admin only)
  let topAdvisersByVolume: { name: string; count: number; value: number }[] = [];
  if (!userId) {
    const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u.name || "Unknown"]));
    // Group quoteValues by userId
    const adviserMap = new Map<number, { count: number; value: number }>();
    for (const qv of quoteValues) {
      if (!adviserMap.has(qv.userId)) adviserMap.set(qv.userId, { count: 0, value: 0 });
      const a = adviserMap.get(qv.userId)!;
      a.count++;
      a.value += qv.value;
    }
    topAdvisersByVolume = Array.from(adviserMap.entries())
      .map(([uid, { count, value }]) => ({ name: userMap.get(uid) || "Unknown", count, value: Math.round(value) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // ─── Include Deck & Eclipse quotes ─────────────────────────────────────
  const deckCondition = userId ? eq(deckQuotes.userId, userId) : undefined;
  const allDeckQuotes = await db.select({
    id: deckQuotes.id,
    userId: deckQuotes.userId,
    status: deckQuotes.status,
    month: sql<string>`DATE_FORMAT(deck_quotes.createdAt, '%Y-%m')`,
    clientName: deckQuotes.clientName,
    quoteNumber: deckQuotes.quoteNumber,
    sellPriceIncGst: deckQuotes.sellPriceIncGst,
    createdAt: deckQuotes.createdAt,
    archived: deckQuotes.archived,
    designAdvisor: deckQuotes.designAdvisor,
  }).from(deckQuotes).where(deckCondition).orderBy(desc(deckQuotes.createdAt));

  for (const dq of allDeckQuotes) {
    if (dq.archived) continue;
    const value = parseFloat(dq.sellPriceIncGst || "0");
    quoteValues.push({ id: dq.id, userId: dq.userId, month: dq.month, status: dq.status, value, clientName: dq.clientName, quoteNumber: dq.quoteNumber, createdAt: dq.createdAt, designAdvisor: dq.designAdvisor || null });
  }

  const eclipseCondition = userId ? eq(eclipseQuotes.userId, userId) : undefined;
  const allEclipseQuotes = await db.select({
    id: eclipseQuotes.id,
    userId: eclipseQuotes.userId,
    status: eclipseQuotes.status,
    month: sql<string>`DATE_FORMAT(eclipse_quotes.createdAt, '%Y-%m')`,
    clientName: eclipseQuotes.clientName,
    quoteNumber: eclipseQuotes.quoteNumber,
    totalRRPInc: eclipseQuotes.totalRRPInc,
    createdAt: eclipseQuotes.createdAt,
    archived: eclipseQuotes.archived,
    designAdvisor: eclipseQuotes.designAdvisor,
  }).from(eclipseQuotes).where(eclipseCondition).orderBy(desc(eclipseQuotes.createdAt));

  for (const eq2 of allEclipseQuotes) {
    if (eq2.archived) continue;
    const value = parseFloat(eq2.totalRRPInc || "0");
    quoteValues.push({ id: eq2.id, userId: eq2.userId, month: eq2.month, status: eq2.status, value, clientName: eq2.clientName, quoteNumber: eq2.quoteNumber, createdAt: eq2.createdAt, designAdvisor: eq2.designAdvisor || null });
  }

  // Re-sort by date after adding deck/eclipse
  quoteValues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Recompute aggregates with all quote types
  monthMap.clear();
  for (const qv of quoteValues) {
    if (!monthMap.has(qv.month)) monthMap.set(qv.month, { total: 0, count: 0 });
    const m = monthMap.get(qv.month)!;
    m.total += qv.value;
    m.count++;
  }
  const avgValueByMonthAll = Array.from(monthMap.entries())
    .map(([month, { total, count }]) => ({ month, avgValue: Math.round(total / count), totalValue: Math.round(total), count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  pipelineMap.clear();
  for (const qv of quoteValues) {
    if (!pipelineMap.has(qv.status)) pipelineMap.set(qv.status, { count: 0, value: 0 });
    const p = pipelineMap.get(qv.status)!;
    p.count++;
    p.value += qv.value;
  }
  const pipelineAll = Array.from(pipelineMap.entries())
    .map(([status, { count, value }]) => ({ status, count, value: Math.round(value) }));

  // Recompute top advisers with all quote types
  if (!userId) {
    const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
    const userMap2 = new Map(allUsers.map(u => [u.id, u.name || "Unknown"]));
    const adviserMap2 = new Map<number, { count: number; value: number }>();
    for (const qv of quoteValues) {
      if (!adviserMap2.has(qv.userId)) adviserMap2.set(qv.userId, { count: 0, value: 0 });
      const a = adviserMap2.get(qv.userId)!;
      a.count++;
      a.value += qv.value;
    }
    topAdvisersByVolume = Array.from(adviserMap2.entries())
      .map(([uid, { count, value }]) => ({ name: userMap2.get(uid) || "Unknown", count, value: Math.round(value) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // 6. Recent activity (last 10 quotes with values — all types)
  const recentActivity = quoteValues.slice(0, 10).map(qv => ({
    quoteNumber: qv.quoteNumber,
    clientName: qv.clientName,
    status: qv.status,
    value: qv.value,
    date: qv.createdAt,
  }));

  // Volume by month — include all types
  const volumeMonthMap = new Map<string, number>();
  for (const qv of quoteValues) {
    volumeMonthMap.set(qv.month, (volumeMonthMap.get(qv.month) || 0) + 1);
  }
  const volumeByMonthAll = Array.from(volumeMonthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Status breakdown — include all types
  const statusMap = new Map<string, number>();
  for (const qv of quoteValues) {
    statusMap.set(qv.status, (statusMap.get(qv.status) || 0) + 1);
  }
  const statusBreakdownAll = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count }));

  // 7. Design Advisor performance (admin only)
  let advisorPerformance: { name: string; totalQuotes: number; accepted: number; lost: number; conversionRate: number; totalRevenue: number; avgJobValue: number }[] = [];
  if (!userId) {
    const advisorMap3 = new Map<string, { total: number; accepted: number; lost: number; revenue: number }>();
    for (const qv of quoteValues) {
      const advisor = qv.designAdvisor || "Unassigned";
      if (!advisorMap3.has(advisor)) advisorMap3.set(advisor, { total: 0, accepted: 0, lost: 0, revenue: 0 });
      const a = advisorMap3.get(advisor)!;
      a.total++;
      if (qv.status === "accepted") { a.accepted++; a.revenue += qv.value; }
      if (qv.status === "lost") a.lost++;
    }
    advisorPerformance = Array.from(advisorMap3.entries())
      .map(([name, { total, accepted, lost, revenue }]) => {
        const decided = accepted + lost;
        const conversionRate = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
        const avgJobValue = accepted > 0 ? Math.round(revenue / accepted) : 0;
        return { name, totalQuotes: total, accepted, lost, conversionRate, totalRevenue: Math.round(revenue), avgJobValue };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  return {
    volumeByMonth: volumeByMonthAll,
    statusBreakdown: statusBreakdownAll,
    avgValueByMonth: avgValueByMonthAll,
    pipeline: pipelineAll,
    topAdvisersByVolume,
    recentActivity,
    advisorPerformance,
  };
}

// ─── Update proposal sent timestamp ──────────────────────────────────────────
export async function updateQuoteProposalSent(quoteId: number, sentTo: string, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return;
  const conditions: any[] = [eq(quotes.id, quoteId)];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  await db
    .update(quotes)
    .set({ proposalSentAt: new Date(), proposalSentTo: sentTo })
    .where(and(...conditions));
}

// ─── Colour Groups ──────────────────────────────────────────────────────────
export async function getAllColourGroups(tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions = scopedTenantConditions(colourGroups.tenantId, tenantId);
  const query = db.select().from(colourGroups);
  return (conditions.length ? query.where(and(...conditions)) : query).orderBy(colourGroups.sortOrder);
}

export async function getColourGroupById(id: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [eq(colourGroups.id, id)];
  appendTenantScope(conditions, colourGroups.tenantId, tenantId);
  const rows = await db.select().from(colourGroups).where(and(...conditions));
  return rows[0] || null;
}

export async function upsertColourGroup(data: { id?: number; name: string; description?: string | null; sortOrder?: number; standardColours?: string[] }, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return 0;
  if (data.id) {
    const existing = await getColourGroupById(data.id, tenantId);
    if (!existing) throw new Error("Colour group not found");
    await db.update(colourGroups).set({
      name: data.name,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
      standardColours: data.standardColours ?? [],
      ...(tenantId != null ? { tenantId } : {}),
    }).where(eq(colourGroups.id, data.id));
    return data.id;
  }
  const [result] = await db.insert(colourGroups).values({
    tenantId: tenantId ?? null,
    name: data.name,
    description: data.description ?? null,
    sortOrder: data.sortOrder ?? 0,
    standardColours: data.standardColours ?? [],
  }).$returningId();
  return result.id;
}

export async function updateColourGroupStandardColours(id: number, standardColours: string[], tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return;
  const existing = await getColourGroupById(id, tenantId);
  if (!existing) throw new Error("Colour group not found");
  await db.update(colourGroups).set({ standardColours }).where(eq(colourGroups.id, id));
}

export async function deleteColourGroup(id: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return;
  const existing = await getColourGroupById(id, tenantId);
  if (!existing) throw new Error("Colour group not found");
  // Remove all members of this group
  const memberConditions: any[] = [eq(colourGroupMembers.colourGroupId, id)];
  appendTenantScope(memberConditions, colourGroupMembers.tenantId, tenantId);
  await db.delete(colourGroupMembers).where(and(...memberConditions));
  // Remove group
  await db.delete(colourGroups).where(eq(colourGroups.id, id));
}

// ─── Colour Group Members ───────────────────────────────────────────────────
export async function getColourGroupMembers(colourGroupId: number, tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(colourGroupMembers.colourGroupId, colourGroupId)];
  appendTenantScope(conditions, colourGroupMembers.tenantId, tenantId);
  return db.select().from(colourGroupMembers).where(and(...conditions)).orderBy(colourGroupMembers.sortOrder);
}

export async function getAllColourGroupMembers(tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return [];
  const conditions = scopedTenantConditions(colourGroupMembers.tenantId, tenantId);
  const query = db.select().from(colourGroupMembers);
  return (conditions.length ? query.where(and(...conditions)) : query).orderBy(colourGroupMembers.sortOrder);
}

export async function setColourGroupMembers(colourGroupId: number, colours: string[], tenantId?: TenantScope) {
  const db = await getDb();
  if (!db) return;
  const existing = await getColourGroupById(colourGroupId, tenantId);
  if (!existing) throw new Error("Colour group not found");
  // Delete existing members for this group
  const conditions: any[] = [eq(colourGroupMembers.colourGroupId, colourGroupId)];
  appendTenantScope(conditions, colourGroupMembers.tenantId, tenantId);
  await db.delete(colourGroupMembers).where(and(...conditions));
  // Insert new members
  if (colours.length > 0) {
    await db.insert(colourGroupMembers).values(
      colours.map((c, i) => ({ tenantId: tenantId ?? null, colourGroupId, colourValue: c, sortOrder: i }))
    );
  }
}

export async function cleanupOrphanedColourGroupMembers(tenantId?: TenantScope): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Get all valid colour values from master data
  const colourConditions: any[] = [eq(masterData.category, "colour")];
  if (tenantId == null) colourConditions.push(isNull(masterData.tenantId));
  else colourConditions.push(or(eq(masterData.tenantId, tenantId), isNull(masterData.tenantId))!);
  const validColours = await db.select({ value: masterData.value })
    .from(masterData)
    .where(and(...colourConditions));
  const validValues = validColours.map(c => c.value);
  
  if (validValues.length === 0) {
    // If no colours exist at all, remove all members
    const memberScope = scopedTenantConditions(colourGroupMembers.tenantId, tenantId);
    const allMembersQuery = db.select({ id: colourGroupMembers.id }).from(colourGroupMembers);
    const allMembers = memberScope.length ? await allMembersQuery.where(and(...memberScope)) : await allMembersQuery;
    if (allMembers.length > 0) {
      await db.delete(colourGroupMembers).where(memberScope.length ? and(...memberScope) : sql`1=1`);
    }
    return allMembers.length;
  }
  
  // Find orphaned members (colourValue not in valid colours)
  const orphanConditions: any[] = [notInArray(colourGroupMembers.colourValue, validValues)];
  appendTenantScope(orphanConditions, colourGroupMembers.tenantId, tenantId);
  const orphaned = await db.select({ id: colourGroupMembers.id })
    .from(colourGroupMembers)
    .where(and(...orphanConditions));
  
  if (orphaned.length > 0) {
    await db.delete(colourGroupMembers)
      .where(and(...orphanConditions));
  }
  
  return orphaned.length;
}


// ─── Global Search ──────────────────────────────────────────────────────────
export async function globalSearch(query: string) {
  const db = await getDb();
  if (!db) return { quotes: [], deckQuotes: [], eclipseQuotes: [], leads: [] };
  const pattern = `%${query}%`;

  // Search structure quotes
  const structureResults = await db.select({
    id: quotes.id,
    quoteNumber: quotes.quoteNumber,
    clientName: quotes.clientName,
    status: quotes.status,
    siteAddress: quotes.siteAddress,
  }).from(quotes).where(
    or(
      like(quotes.clientName, pattern),
      like(quotes.quoteNumber, pattern),
      like(quotes.clientEmail, pattern),
      like(quotes.clientPhone, pattern),
      like(quotes.siteAddress, pattern),
    )
  ).orderBy(desc(quotes.updatedAt)).limit(10);

  // Search deck quotes
  const deckResults = await db.select({
    id: deckQuotes.id,
    quoteNumber: deckQuotes.quoteNumber,
    clientName: deckQuotes.clientName,
    status: deckQuotes.status,
    siteAddress: deckQuotes.siteAddress,
  }).from(deckQuotes).where(
    or(
      like(deckQuotes.clientName, pattern),
      like(deckQuotes.quoteNumber, pattern),
      like(deckQuotes.clientEmail, pattern),
      like(deckQuotes.clientPhone, pattern),
      like(deckQuotes.siteAddress, pattern),
    )
  ).orderBy(desc(deckQuotes.updatedAt)).limit(10);

  // Search eclipse quotes
  const eclipseResults = await db.select({
    id: eclipseQuotes.id,
    quoteNumber: eclipseQuotes.quoteNumber,
    clientName: eclipseQuotes.clientName,
    status: eclipseQuotes.status,
    clientAddress: eclipseQuotes.clientAddress,
  }).from(eclipseQuotes).where(
    or(
      like(eclipseQuotes.clientName, pattern),
      like(eclipseQuotes.quoteNumber, pattern),
      like(eclipseQuotes.clientEmail, pattern),
      like(eclipseQuotes.clientPhone, pattern),
      like(eclipseQuotes.clientAddress, pattern),
    )
  ).orderBy(desc(eclipseQuotes.updatedAt)).limit(10);

  // Search CRM leads
  const leadResults = await db.select({
    id: crmLeads.id,
    leadNumber: crmLeads.leadNumber,
    contactFirstName: crmLeads.contactFirstName,
    contactLastName: crmLeads.contactLastName,
    contactPhone: crmLeads.contactPhone,
    contactEmail: crmLeads.contactEmail,
    status: crmLeads.status,
  }).from(crmLeads).where(
    or(
      like(crmLeads.contactFirstName, pattern),
      like(crmLeads.contactLastName, pattern),
      like(crmLeads.contactEmail, pattern),
      like(crmLeads.contactPhone, pattern),
      like(crmLeads.company, pattern),
      like(crmLeads.leadNumber, pattern),
    )
  ).orderBy(desc(crmLeads.createdAt)).limit(10);

  return {
    quotes: structureResults,
    deckQuotes: deckResults,
    eclipseQuotes: eclipseResults,
    leads: leadResults,
  };
}


// ─── Email Image Library ────────────────────────────────────────────────────
export async function createEmailImage(data: {
  tenantId?: number | null;
  filename: string;
  url: string;
  fileKey: string;
  caption?: string;
  tags?: string[];
  width?: number;
  height?: number;
  sizeBytes?: number;
  uploadedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(emailImages).values({
    tenantId: data.tenantId ?? null,
    filename: data.filename,
    url: data.url,
    fileKey: data.fileKey,
    caption: data.caption || "",
    tags: data.tags || [],
    width: data.width || null,
    height: data.height || null,
    sizeBytes: data.sizeBytes || null,
    uploadedBy: data.uploadedBy || null,
  });
  return { id: result.insertId };
}

export async function listEmailImages(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (tenantId) {
    return db
      .select()
      .from(emailImages)
      .where(eq(emailImages.tenantId, tenantId))
      .orderBy(desc(emailImages.createdAt));
  }
  return db
    .select()
    .from(emailImages)
    .orderBy(desc(emailImages.createdAt));
}

export async function deleteEmailImage(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(emailImages.id, id)];
  if (tenantId) conditions.push(eq(emailImages.tenantId, tenantId));
  await db.delete(emailImages).where(and(...conditions));
}

export async function updateEmailImage(id: number, data: { caption?: string; tags?: string[] }, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(emailImages.id, id)];
  if (tenantId) conditions.push(eq(emailImages.tenantId, tenantId));
  await db.update(emailImages).set(data).where(and(...conditions));
}


// ─── Quote Revisions (Audit Log) ────────────────────────────────────────────
export async function createQuoteRevision(data: {
  quoteId: number;
  userId?: number;
  userName?: string;
  action: string;
  changes?: Array<{ field: string; oldValue: any; newValue: any }>;
  snapshot?: Record<string, any>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(quoteRevisions).values({
    quoteId: data.quoteId,
    userId: data.userId || null,
    userName: data.userName || null,
    action: data.action,
    changes: data.changes || null,
    snapshot: data.snapshot || null,
  });
  return { id: result[0].insertId };
}

export async function getQuoteRevisions(quoteId: number, limit = 50, filters?: { fromDate?: Date; toDate?: Date; action?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(quoteRevisions.quoteId, quoteId)];
  if (filters?.fromDate) conditions.push(gte(quoteRevisions.createdAt, filters.fromDate));
  if (filters?.toDate) {
    const endOfDay = new Date(filters.toDate);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(lte(quoteRevisions.createdAt, endOfDay));
  }
  if (filters?.action) conditions.push(eq(quoteRevisions.action, filters.action));
  return db.select().from(quoteRevisions)
    .where(and(...conditions))
    .orderBy(desc(quoteRevisions.createdAt))
    .limit(limit);
}


export async function getLatestRevisionsByQuoteIds(quoteIds: number[]) {
  const db = await getDb();
  if (!db || quoteIds.length === 0) return [];
  // Get the latest revision per quote using a subquery approach
  const results = await db.select({
    id: quoteRevisions.id,
    quoteId: quoteRevisions.quoteId,
    userName: quoteRevisions.userName,
    action: quoteRevisions.action,
    createdAt: quoteRevisions.createdAt,
  }).from(quoteRevisions)
    .where(sql`${quoteRevisions.quoteId} IN (${sql.raw(quoteIds.join(","))})`)
    .orderBy(desc(quoteRevisions.createdAt));
  // Deduplicate: keep only the first (latest) per quoteId
  const seen = new Set<number>();
  const latest: typeof results = [];
  for (const row of results) {
    if (!seen.has(row.quoteId)) {
      seen.add(row.quoteId);
      latest.push(row);
    }
  }
  return latest;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] || null;
}

export async function getRecentRevisions(limit: number = 5, tenantId?: number | null, options?: QuoteTenantScopeOptions) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  appendQuoteTenantScope(conditions, quotes.tenantId, tenantId, options);
  const results = await db.select({
    id: quoteRevisions.id,
    quoteId: quoteRevisions.quoteId,
    userId: quoteRevisions.userId,
    userName: quoteRevisions.userName,
    action: quoteRevisions.action,
    changes: quoteRevisions.changes,
    createdAt: quoteRevisions.createdAt,
    quoteNumber: quotes.quoteNumber,
    clientName: quotes.clientName,
  }).from(quoteRevisions)
    .innerJoin(quotes, eq(quoteRevisions.quoteId, quotes.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(quoteRevisions.createdAt))
    .limit(limit);
  return results.map(r => ({
    ...r,
    quoteNumber: r.quoteNumber || "Unknown",
    clientName: r.clientName || "Unknown",
  }));
}

// ─── SMS Delivery Log ─────────────────────────────────────────────────────────
export async function createSmsDeliveryLog(data: Omit<InsertSmsDeliveryLog, "id" | "sentAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(smsDeliveryLog).values(data);
  return result.insertId;
}

export async function getSmsDeliveryLogsByJob(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(smsDeliveryLog).where(eq(smsDeliveryLog.jobId, jobId)).orderBy(desc(smsDeliveryLog.sentAt));
}

// ─── User Settings ───────────────────────────────────────────────────────────
export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result[0] || null;
}

export async function upsertUserSettings(userId: number, data: {
  themeMode?: string;
  colorScheme?: string;
  customLogoUrl?: string | null;
  appIconUrl?: string | null;
  faviconUrl?: string | null;
  companyDetails?: any;
  proposalText?: any;
  companyTheme?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(userSettings).set(data).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({ userId, ...data });
  }
  return { success: true };
}

type TenantBrandingRecord = {
  companyDetails?: any;
  customLogoUrl?: string | null;
  appIconUrl?: string | null;
  faviconUrl?: string | null;
  companyTheme?: any;
  branding?: Record<string, any>;
};

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function legacyBrandingFromUserSettings(row: typeof userSettings.$inferSelect | undefined): TenantBrandingRecord | null {
  if (!row) return null;
  return {
    companyDetails: row.companyDetails,
    customLogoUrl: row.customLogoUrl ?? null,
    appIconUrl: row.appIconUrl ?? null,
    faviconUrl: row.faviconUrl ?? null,
    companyTheme: row.companyTheme,
    branding: {
      customLogoUrl: row.customLogoUrl ?? null,
      appIconUrl: row.appIconUrl ?? null,
      faviconUrl: row.faviconUrl ?? null,
      companyTheme: row.companyTheme,
    },
  };
}

async function getLegacyBrandingFallback(): Promise<TenantBrandingRecord | null> {
  if (ENV.tenancyMode === "multi") return null;
  const db = await getDb();
  if (!db) return null;

  const legacyRows = await db.select().from(userSettings).limit(10);
  const legacy = legacyRows.find((row) =>
    row.companyDetails ||
    row.customLogoUrl ||
    row.appIconUrl ||
    row.faviconUrl ||
    row.companyTheme
  );
  return legacyBrandingFromUserSettings(legacy);
}

export async function getTenantBrandingSettings(tenantId?: number | null): Promise<TenantBrandingRecord | null> {
  const db = await getDb();
  if (!db) return null;

  let tenantRow: typeof tenantSettings.$inferSelect | undefined;
  if (tenantId) {
    const rows = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
    tenantRow = rows[0];
  } else {
    if (ENV.tenancyMode === "multi") return null;
    const rows = await db.select().from(tenantSettings).limit(1);
    tenantRow = rows[0];
  }

  if (tenantRow) {
    const branding = objectRecord(tenantRow.branding);
    const legacy = await getLegacyBrandingFallback();
    const mergedBranding = { ...(legacy?.branding ?? {}), ...branding };
    const fieldOrFallback = <T = unknown>(key: string, fallback: T | null | undefined): T | null => {
      if (Object.prototype.hasOwnProperty.call(branding, key)) {
        return (branding[key] as T | null | undefined) ?? null;
      }
      return fallback ?? null;
    };

    return {
      companyDetails: tenantRow.companyDetails ?? legacy?.companyDetails ?? null,
      customLogoUrl: fieldOrFallback<string>("customLogoUrl", legacy?.customLogoUrl),
      appIconUrl: fieldOrFallback<string>("appIconUrl", legacy?.appIconUrl),
      faviconUrl: fieldOrFallback<string>("faviconUrl", legacy?.faviconUrl),
      companyTheme: fieldOrFallback("companyTheme", legacy?.companyTheme),
      branding: mergedBranding,
    };
  }

  return getLegacyBrandingFallback();
}

export async function upsertTenantBrandingSettings(
  tenantId: number,
  data: {
    companyDetails?: any;
    branding?: Record<string, any>;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingRows = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
  const existing = existingRows[0];
  if (existing) {
    const set: Record<string, any> = {};
    if (Object.prototype.hasOwnProperty.call(data, "companyDetails")) {
      set.companyDetails = data.companyDetails;
    }
    if (data.branding) {
      set.branding = { ...objectRecord(existing.branding), ...data.branding };
    }
    if (Object.keys(set).length > 0) {
      await db.update(tenantSettings).set(set).where(eq(tenantSettings.tenantId, tenantId));
    }
  } else {
    await db.insert(tenantSettings).values({
      tenantId,
      companyDetails: Object.prototype.hasOwnProperty.call(data, "companyDetails") ? data.companyDetails : null,
      branding: data.branding ?? {},
    });
  }
  return { success: true };
}


// ─── Company Theme ──────────────────────────────────────────────────────────
export async function getCompanyTheme(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const tenantBranding = await getTenantBrandingSettings(tenantId);
  if (tenantBranding?.companyTheme && typeof tenantBranding.companyTheme === "object") {
    return tenantBranding.companyTheme as Record<string, unknown>;
  }
  if (ENV.tenancyMode === "multi") return null;
  // Get the first user_settings row that has companyTheme set
  const rows = await db.select({ companyTheme: userSettings.companyTheme }).from(userSettings).limit(5);
  for (const row of rows) {
    if (row.companyTheme && typeof row.companyTheme === "object") {
      return row.companyTheme as Record<string, unknown>;
    }
  }
  return null;
}

// ─── Technical Library Documents ────────────────────────────────────────────
export async function getTechLibraryDocuments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(techLibraryDocuments).orderBy(desc(techLibraryDocuments.createdAt));
}

export async function getActiveTechLibraryDocuments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(techLibraryDocuments).where(eq(techLibraryDocuments.active, true)).orderBy(desc(techLibraryDocuments.createdAt));
}

export async function createTechLibraryDocument(doc: Omit<InsertTechLibraryDocument, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(techLibraryDocuments).values(doc);
  return { id: Number(result[0].insertId) };
}

export async function updateTechLibraryDocument(id: number, updates: Partial<Omit<InsertTechLibraryDocument, "id" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(techLibraryDocuments).set(updates).where(eq(techLibraryDocuments.id, id));
}

export async function deleteTechLibraryDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(techLibraryDocuments).where(eq(techLibraryDocuments.id, id));
}

export async function getTechLibraryDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(techLibraryDocuments).where(eq(techLibraryDocuments.id, id)).limit(1);
  return rows[0] ?? null;
}


// ─── Practical Completion Notices ──────────────────────────────────────────
export async function createPracticalCompletionNotice(data: InsertPracticalCompletionNotice) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(practicalCompletionNotices).values(data);
  return result.insertId;
}

export async function getPracticalCompletionNoticesByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(practicalCompletionNotices)
    .where(eq(practicalCompletionNotices.jobId, jobId))
    .orderBy(desc(practicalCompletionNotices.createdAt));
}

export async function getPracticalCompletionNoticeById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(practicalCompletionNotices)
    .where(eq(practicalCompletionNotices.id, id));
  return rows[0] || null;
}

export async function updatePracticalCompletionNotice(id: number, data: Partial<InsertPracticalCompletionNotice>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(practicalCompletionNotices).set(data).where(eq(practicalCompletionNotices.id, id));
}

// ─── Construction Job Lookup ───────────────────────────────────────────────
export async function getConstructionJobById(jobId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(constructionJobs).where(eq(constructionJobs.id, jobId));
  return rows[0] || null;
}

export async function getLeadByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return null;
  const job = await getConstructionJobById(jobId);
  if (!job?.leadId) return null;
  const rows = await db.select().from(crmLeads).where(eq(crmLeads.id, job.leadId));
  return rows[0] || null;
}

// ─── Contract Variations ──────────────────────────────────────────────────
export async function createVariation(data: InsertPortalVariation) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(portalVariations).values(data);
  return result.insertId;
}

export async function getVariationsByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portalVariations)
    .where(eq(portalVariations.constructionJobId, jobId))
    .orderBy(desc(portalVariations.createdAt));
}

export async function getVariationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(portalVariations)
    .where(eq(portalVariations.id, id));
  return rows[0] || null;
}

export async function updateVariation(id: number, data: Partial<InsertPortalVariation>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(portalVariations).set(data).where(eq(portalVariations.id, id));
}

// ─── Kanban Task Creation (for defects) ───────────────────────────────────
export async function createKanbanTask(data: {
  jobId: number;
  title: string;
  description?: string;
  column?: string;
  priority?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Get max position in the target column
  const existing = await db.select({ position: constructionKanbanTasks.position })
    .from(constructionKanbanTasks)
    .where(and(
      eq(constructionKanbanTasks.jobId, data.jobId),
      eq(constructionKanbanTasks.column, (data.column as any) || "todo"),
    ))
    .orderBy(desc(constructionKanbanTasks.position));
  const maxPos = existing.length > 0 ? existing[0].position : -1;
  const [job] = await db
    .select({ tenantId: constructionJobs.tenantId })
    .from(constructionJobs)
    .where(eq(constructionJobs.id, data.jobId));
  
  const [result] = await db.insert(constructionKanbanTasks).values({
    tenantId: job?.tenantId ?? null,
    jobId: data.jobId,
    title: data.title,
    description: data.description,
    column: (data.column as any) || "todo",
    position: maxPos + 1,
    priority: (data.priority as any) || "normal",
    createdBy: data.createdBy,
  });
  return result.insertId;
}


// ─── SWMS Documents ─────────────────────────────────────────────────────────
export async function createSwmsDocument(data: InsertSwmsDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(swmsDocuments).values(data);
  return result.insertId;
}

export async function getAllSwmsDocuments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(swmsDocuments).orderBy(swmsDocuments.sortOrder, desc(swmsDocuments.createdAt));
}

export async function getActiveSwmsDocuments(portal: "trade" | "client") {
  const db = await getDb();
  if (!db) return [];
  const condition = portal === "trade"
    ? and(eq(swmsDocuments.isActive, true), eq(swmsDocuments.showOnTradePortal, true))
    : and(eq(swmsDocuments.isActive, true), eq(swmsDocuments.showOnClientPortal, true));
  return db.select().from(swmsDocuments).where(condition).orderBy(swmsDocuments.sortOrder);
}

export async function updateSwmsDocument(id: number, data: Partial<InsertSwmsDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(swmsDocuments).set(data).where(eq(swmsDocuments.id, id));
}

export async function deleteSwmsDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(swmsDocuments).where(eq(swmsDocuments.id, id));
}


// ─── Site Inductions ────────────────────────────────────────────────────────
export async function createSiteInduction(data: InsertSiteInduction) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(siteInductions).values(data);
  return result[0].insertId;
}

export async function getSiteInductionById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  if (tenantId) {
    const result = await db
      .select({ induction: siteInductions })
      .from(siteInductions)
      .innerJoin(constructionJobs, eq(siteInductions.jobId, constructionJobs.id))
      .where(and(eq(siteInductions.id, id), eq(constructionJobs.tenantId, tenantId)))
      .limit(1);
    return result[0]?.induction;
  }
  const result = await db.select().from(siteInductions).where(eq(siteInductions.id, id)).limit(1);
  return result[0];
}

export async function getSiteInductionsByJob(jobId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (tenantId) {
    const result = await db
      .select({ induction: siteInductions })
      .from(siteInductions)
      .innerJoin(constructionJobs, eq(siteInductions.jobId, constructionJobs.id))
      .where(and(eq(siteInductions.jobId, jobId), eq(constructionJobs.tenantId, tenantId)))
      .orderBy(desc(siteInductions.createdAt));
    return result.map((row) => row.induction);
  }
  return db.select().from(siteInductions)
    .where(eq(siteInductions.jobId, jobId))
    .orderBy(desc(siteInductions.createdAt));
}

export async function getSiteInductionsByInstaller(installerId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (tenantId) {
    const result = await db
      .select({ induction: siteInductions })
      .from(siteInductions)
      .innerJoin(constructionJobs, eq(siteInductions.jobId, constructionJobs.id))
      .where(and(eq(siteInductions.installerId, installerId), eq(constructionJobs.tenantId, tenantId)))
      .orderBy(desc(siteInductions.createdAt));
    return result.map((row) => row.induction);
  }
  return db.select().from(siteInductions)
    .where(eq(siteInductions.installerId, installerId))
    .orderBy(desc(siteInductions.createdAt));
}

export async function getSiteInductionByJobAndInstaller(jobId: number, installerId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  if (tenantId) {
    const result = await db
      .select({ induction: siteInductions })
      .from(siteInductions)
      .innerJoin(constructionJobs, eq(siteInductions.jobId, constructionJobs.id))
      .where(and(
        eq(siteInductions.jobId, jobId),
        eq(siteInductions.installerId, installerId),
        eq(constructionJobs.tenantId, tenantId),
      ))
      .limit(1);
    return result[0]?.induction;
  }
  const result = await db.select().from(siteInductions)
    .where(and(eq(siteInductions.jobId, jobId), eq(siteInductions.installerId, installerId)))
    .limit(1);
  return result[0];
}

export async function updateSiteInduction(id: number, data: Partial<InsertSiteInduction>, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (tenantId) {
    const existing = await getSiteInductionById(id, tenantId);
    if (!existing) return false;
  }
  await db.update(siteInductions).set(data).where(eq(siteInductions.id, id));
  return true;
}

export async function deleteSiteInduction(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (tenantId) {
    const existing = await getSiteInductionById(id, tenantId);
    if (!existing) return false;
  }
  await db.delete(siteInductions).where(eq(siteInductions.id, id));
  return true;
}

export async function getAssignedInstallersForJob(jobId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select({
    assignmentId: constructionAssignments.id,
    installerId: constructionAssignments.installerId,
    role: constructionAssignments.role,
    installerName: constructionInstallers.name,
    installerPhone: constructionInstallers.phone,
    installerEmail: constructionInstallers.email,
  })
    .from(constructionAssignments)
    .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
    .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
    .$dynamic();

  query = query.where(tenantId
    ? and(eq(constructionAssignments.jobId, jobId), eq(constructionJobs.tenantId, tenantId))
    : eq(constructionAssignments.jobId, jobId));
  return query;
}


// ─── Induction Form Configuration ──────────────────────────────────────────
export async function getInductionFormConfig(tenantId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  let query = db.select().from(inductionFormConfig).$dynamic();
  if (tenantId) {
    query = query.where(eq(inductionFormConfig.tenantId, tenantId));
  }
  const result = await query.limit(1);
  return result[0];
}

export async function upsertInductionFormConfig(data: Partial<InsertInductionFormConfig>, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  let query = db.select().from(inductionFormConfig).$dynamic();
  if (tenantId) {
    query = query.where(eq(inductionFormConfig.tenantId, tenantId));
  }
  const existing = await query.limit(1);
  const values = tenantId ? { ...data, tenantId } : data;
  if (existing.length > 0) {
    await db.update(inductionFormConfig).set(values).where(eq(inductionFormConfig.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(inductionFormConfig).values(values as InsertInductionFormConfig);
    return result[0].insertId;
  }
}

// ─── Quote Items (Spec Sheet line items) ────────────────────────────────────
export async function getQuoteItems(quoteId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(quoteItems.quoteId, quoteId)];
  appendTenantScope(conditions, quoteItems.tenantId, tenantId);
  return db.select().from(quoteItems).where(and(...conditions)).orderBy(quoteItems.sortOrder);
}
