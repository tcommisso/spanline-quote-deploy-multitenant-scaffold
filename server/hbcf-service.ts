import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { appendTenantScope, isMultiTenancyMode } from "./_core/tenant-scope";
import {
  approvalProjects,
  crmLeads,
  daCompetitorWatchlist,
  hbcfBuilderProfiles,
  hbcfCertificates,
  hbcfPolicyMatches,
  quoteComponents,
  quotes,
  type HbcfBuilderProfile,
  type InsertHbcfBuilderProfile,
  type InsertHbcfCertificate,
} from "../drizzle/schema";

export const HBCF_REQUIRED_THRESHOLD = 20000;
const CONVERTED_LEAD_STATUSES = ["contract", "building_authority", "construction", "completed", "won"] as const;
const DEFAULT_API_MONTHLY_LIMIT = 2500;
const NSW_POSTCODE_REGEX = "^(1[0-9]{3}|2[0-5][0-9]{2}|2619|26[2-9][0-9]|2[7-8][0-9]{2}|292[1-9]|29[3-9][0-9])$";
const NSW_POSTCODE_PATTERN = /^(1[0-9]{3}|2[0-5][0-9]{2}|2619|26[2-9][0-9]|2[7-8][0-9]{2}|292[1-9]|29[3-9][0-9])$/;
const ACT_POSTCODE_PATTERN = /^(260[0-9]|261[0-8]|29[0-1][0-9]|2920)$/;

type HbcfLocationLike = {
  jurisdiction?: string | null;
  state?: string | null;
  propertyState?: string | null;
  postcode?: string | null;
  propertyPostcode?: string | null;
  address?: string | null;
  propertyAddress?: string | null;
  siteAddress?: string | null;
  clientAddress?: string | null;
  region?: string | null;
  localCouncil?: string | null;
  suburb?: string | null;
  propertySuburb?: string | null;
};

type HbcfPolicyLike = {
  policyNumber?: string | null;
  certificateNumber?: string | null;
  status?: string | null;
  builderName?: string | null;
  builderLicenceNumber?: string | null;
  insurerName?: string | null;
  ownerName?: string | null;
  propertyAddress?: string | null;
  propertySuburb?: string | null;
  propertyPostcode?: string | null;
  contractPrice?: string | number | null;
  issuedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  certificateUrl?: string | null;
  externalId?: string | null;
  rawPayload?: Record<string, any> | null;
};

function currentApiMonth() {
  return new Date().toISOString().slice(0, 7);
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

function upperText(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function extractPostcodes(...values: unknown[]) {
  return values
    .flatMap((value) => String(value ?? "").match(/\b\d{4}\b/g) ?? [])
    .filter(Boolean);
}

export function isNswHbcfLocation(location?: HbcfLocationLike | null) {
  if (!location) return false;
  const jurisdiction = upperText(location.jurisdiction);
  if (jurisdiction === "NSW") return true;
  if (jurisdiction === "ACT") return false;

  const state = upperText(location.propertyState || location.state);
  if (state === "NSW" || state === "NEW SOUTH WALES") return true;
  if (state === "ACT" || state === "AUSTRALIAN CAPITAL TERRITORY") return false;

  const textValues = [
    location.address,
    location.propertyAddress,
    location.siteAddress,
    location.clientAddress,
    location.region,
    location.localCouncil,
    location.suburb,
    location.propertySuburb,
  ];
  const text = upperText(textValues.filter(Boolean).join(" "));
  if (/\b(NSW|NEW SOUTH WALES)\b/.test(text)) return true;
  if (/\b(ACT|AUSTRALIAN CAPITAL TERRITORY)\b/.test(text)) return false;
  if (/\b(WAGGA|RIVERINA)\b/.test(text)) return true;
  if (/\b(CANBERRA)\b/.test(text)) return false;

  const postcodes = extractPostcodes(location.postcode, location.propertyPostcode, ...textValues);
  if (postcodes.some((postcode) => NSW_POSTCODE_PATTERN.test(postcode))) return true;
  if (postcodes.some((postcode) => ACT_POSTCODE_PATTERN.test(postcode))) return false;
  return false;
}

export function hbcfRequirementFieldsForAmount(amount: unknown, quoteLabel = "Quote", location?: HbcfLocationLike | null) {
  const value = Number(String(amount ?? "0").replace(/[$,]/g, ""));
  if (Number.isFinite(value) && value >= HBCF_REQUIRED_THRESHOLD && isNswHbcfLocation(location)) {
    return {
      hbcfRequired: true,
      hbcfRequirementReason: `${quoteLabel} value $${value.toFixed(2)} is at or above the $${HBCF_REQUIRED_THRESHOLD.toLocaleString()} NSW HBCF threshold`,
      hbcfFlaggedAt: new Date(),
    };
  }
  return {
    hbcfRequired: false,
    hbcfRequirementReason: null,
    hbcfFlaggedAt: null,
  };
}

function normalizeAddress(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(road|rd)\b/g, "rd")
    .replace(/\b(avenue|ave)\b/g, "ave")
    .replace(/\b(drive|dr)\b/g, "dr")
    .replace(/\b(crescent|cres)\b/g, "cres")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSuburb(value?: string | null) {
  return (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function firstPostcode(...values: unknown[]) {
  return extractPostcodes(...values)[0] ?? null;
}

function firstString(record: any, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawPayloadOrNull(value: unknown): Record<string, any> | null {
  if (isRecord(value)) return value;
  if (Array.isArray(value)) return { items: value };
  if (value == null || value === "") return null;
  return { value };
}

function normalizePolicy(raw: any): HbcfPolicyLike {
  const issuedAt = firstString(raw, ["issuedAt", "issueDate", "issued_date", "certificateIssuedDate", "policyIssueDate"]);
  const expiresAt = firstString(raw, ["expiresAt", "expiryDate", "expiry_date", "policyExpiryDate"]);
  return {
    policyNumber: firstString(raw, ["policyNumber", "policy_number", "policyNo", "hbcfPolicyNumber"]),
    certificateNumber: firstString(raw, ["certificateNumber", "certificate_number", "certificateNo", "hbcfCertificateNumber"]),
    status: firstString(raw, ["status", "policyStatus", "certificateStatus"]) || "issued",
    builderName: firstString(raw, ["builderName", "builder", "contractorName", "builderTradingName"]),
    builderLicenceNumber: firstString(raw, ["builderLicenceNumber", "builderLicenseNumber", "licenceNumber", "licenseNumber"]),
    insurerName: firstString(raw, ["insurerName", "insurer", "provider"]),
    ownerName: firstString(raw, ["ownerName", "homeOwnerName", "customerName"]),
    propertyAddress: firstString(raw, ["propertyAddress", "address", "siteAddress", "riskAddress"]),
    propertySuburb: firstString(raw, ["propertySuburb", "suburb"]),
    propertyPostcode: firstString(raw, ["propertyPostcode", "postcode", "postCode"]),
    contractPrice: firstString(raw, ["contractPrice", "contractValue", "projectValue", "insuredValue"]),
    issuedAt,
    expiresAt,
    certificateUrl: firstString(raw, ["certificateUrl", "documentUrl", "url"]),
    externalId: firstString(raw, ["externalId", "id", "policyId", "certificateId"]),
    rawPayload: rawPayloadOrNull(raw),
  };
}

function extractPolicies(payload: any): HbcfPolicyLike[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.policies)
      ? payload.policies
      : Array.isArray(payload?.certificates)
        ? payload.certificates
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.results)
            ? payload.results
            : payload
              ? [payload]
              : [];
  return rows
    .filter((row: unknown) => row != null)
    .map(normalizePolicy)
    .filter((p: HbcfPolicyLike) => p.policyNumber || p.certificateNumber || p.builderName);
}

function resolveApiKey(profile: HbcfBuilderProfile) {
  const ref = profile.apiKeyRef?.trim();
  if (!ref) return null;
  if (ref.startsWith("env:")) return process.env[ref.slice(4)] || null;
  return process.env[ref] || ref;
}

function isOurBuilder(policy: HbcfPolicyLike, profile: HbcfBuilderProfile | null) {
  const builder = (policy.builderName || "").toLowerCase();
  const licence = (policy.builderLicenceNumber || "").toLowerCase();
  const names = [profile?.builderName, profile?.tradingName, "spanline", "altaspan"]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  const licences = [profile?.licenceNumber].filter(Boolean).map((v) => String(v).toLowerCase());
  return names.some((name) => builder.includes(name) || name.includes(builder)) ||
    licences.some((item) => !!item && licence === item);
}

function firstPresent(...values: unknown[]) {
  for (const value of values) {
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function leadDisplayName(lead: any) {
  return firstPresent(
    [lead?.contactFirstName, lead?.contactLastName].filter(Boolean).join(" "),
    lead?.company,
  );
}

function rawPayloadValue(rawPayload: unknown, ...keys: string[]) {
  if (!isRecord(rawPayload)) return null;
  for (const key of keys) {
    const value = rawPayload[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

function isSparseExternalHbcfRecord(row: any, profile: HbcfBuilderProfile | null) {
  if (row.approvalProjectId || row.quoteId || row.crmLeadId) return false;
  if (row.ownerName || row.propertyAddress || row.contractPrice || row.issuedAt || row.expiresAt) return false;

  const builderName = firstPresent(
    row.builderName,
    rawPayloadValue(row.rawPayload, "licensee", "businessNames", "builderName"),
  );
  const builderLicenceNumber = firstPresent(
    row.builderLicenceNumber,
    rawPayloadValue(row.rawPayload, "licenceName", "licenseNumber", "licenceNumber"),
  );
  if (!builderName && !builderLicenceNumber) return false;

  return !isOurBuilder({
    builderName: builderName == null ? null : String(builderName),
    builderLicenceNumber: builderLicenceNumber == null ? null : String(builderLicenceNumber),
  }, profile);
}

function scopedConditions(table: any, tenantId: number | null | undefined, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, table.tenantId, tenantId);
  return conditions;
}

function uniqueIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)));
}

async function enrichHbcfCertificates(rows: any[], tenantId: number | null | undefined) {
  if (!rows.length) return rows;
  const db = await getDb();
  if (!db) return rows;

  const projectIds = uniqueIds(rows.map((row) => row.approvalProjectId));
  const leadIds = uniqueIds(rows.map((row) => row.crmLeadId));
  const quoteIds = uniqueIds(rows.map((row) => row.quoteId));

  const [projects, leads, quoteRows] = await Promise.all([
    projectIds.length
      ? db.select({
        id: approvalProjects.id,
        clientName: approvalProjects.clientName,
        propertyAddress: approvalProjects.propertyAddress,
        propertySuburb: approvalProjects.propertySuburb,
        propertyPostcode: approvalProjects.propertyPostcode,
        estimatedCost: approvalProjects.estimatedCost,
      }).from(approvalProjects)
        .where(and(...scopedConditions(approvalProjects, tenantId, inArray(approvalProjects.id, projectIds))))
      : [],
    leadIds.length
      ? db.select({
        id: crmLeads.id,
        contactFirstName: crmLeads.contactFirstName,
        contactLastName: crmLeads.contactLastName,
        company: crmLeads.company,
        contactAddress: crmLeads.contactAddress,
        suburb: crmLeads.suburb,
        postcode: crmLeads.postcode,
      }).from(crmLeads)
        .where(and(...scopedConditions(crmLeads, tenantId, inArray(crmLeads.id, leadIds))))
      : [],
    quoteIds.length
      ? db.select({
        id: quotes.id,
        clientName: quotes.clientName,
        siteAddress: quotes.siteAddress,
        suburb: quotes.suburb,
      }).from(quotes)
        .where(and(...scopedConditions(quotes, tenantId, inArray(quotes.id, quoteIds))))
      : [],
  ]);

  const projectById = new Map(projects.map((project: any) => [Number(project.id), project]));
  const leadById = new Map(leads.map((lead: any) => [Number(lead.id), lead]));
  const quoteById = new Map(quoteRows.map((quote: any) => [Number(quote.id), quote]));

  return rows.map((row) => {
    const project = projectById.get(Number(row.approvalProjectId));
    const lead = leadById.get(Number(row.crmLeadId));
    const quote = quoteById.get(Number(row.quoteId));
    const address = firstPresent(row.propertyAddress, project?.propertyAddress, lead?.contactAddress, quote?.siteAddress);
    const suburb = firstPresent(row.propertySuburb, project?.propertySuburb, lead?.suburb, quote?.suburb);
    const postcode = firstPresent(row.propertyPostcode, project?.propertyPostcode, lead?.postcode, firstPostcode(address, suburb));

    return {
      ...row,
      ownerName: firstPresent(row.ownerName, project?.clientName, leadDisplayName(lead), quote?.clientName),
      propertyAddress: address,
      propertySuburb: suburb,
      propertyPostcode: postcode,
      contractPrice: firstPresent(row.contractPrice, project?.estimatedCost),
    };
  });
}

async function chargeApiCall(profile: HbcfBuilderProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const month = currentApiMonth();
  const callsThisMonth = profile.apiCallMonth === month ? profile.apiCallsThisMonth || 0 : 0;
  const limit = profile.apiMonthlyLimit || DEFAULT_API_MONTHLY_LIMIT;
  if (callsThisMonth >= limit) {
    throw new Error(`HBCF API monthly call limit reached (${callsThisMonth}/${limit})`);
  }
  await db.update(hbcfBuilderProfiles)
    .set({
      apiCallsThisMonth: callsThisMonth + 1,
      apiCallMonth: month,
      lastSyncAt: new Date(),
      lastSyncStatus: "running",
      lastSyncError: null,
    })
    .where(and(...scopedConditions(hbcfBuilderProfiles, profile.tenantId, eq(hbcfBuilderProfiles.id, profile.id))));
}

async function recordProfileSync(profile: HbcfBuilderProfile, status: "success" | "failed", error?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(hbcfBuilderProfiles)
    .set({ lastSyncAt: new Date(), lastSyncStatus: status, lastSyncError: error || null })
    .where(and(...scopedConditions(hbcfBuilderProfiles, profile.tenantId, eq(hbcfBuilderProfiles.id, profile.id))));
}

async function hbcfApiRequest(profile: HbcfBuilderProfile, params: Record<string, string | undefined> = {}) {
  if (!profile.apiEnabled || !profile.apiBaseUrl) {
    throw new Error("HBCF API is not enabled or no API endpoint is configured");
  }
  await chargeApiCall(profile);
  const url = new URL(profile.apiBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = resolveApiKey(profile);
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HBCF API returned ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

export async function getHbcfBuilderProfile(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [];
  if (tenantId) conditions.push(eq(hbcfBuilderProfiles.tenantId, tenantId));
  else conditions.push(isMultiTenancyMode() ? sql`1 = 0` : sql`${hbcfBuilderProfiles.tenantId} IS NULL`);
  const [profile] = await db.select()
    .from(hbcfBuilderProfiles)
    .where(and(...conditions))
    .limit(1);
  if (!profile) return null;

  const annualLimitYear = profile.annualLimitYear ?? new Date().getFullYear();
  const certificateConditions: any[] = [
    eq(hbcfCertificates.status, "issued"),
    sql`(
      ${hbcfCertificates.ownerName} IS NOT NULL
      OR ${hbcfCertificates.propertyAddress} IS NOT NULL
      OR ${hbcfCertificates.contractPrice} IS NOT NULL
      OR ${hbcfCertificates.issuedAt} IS NOT NULL
      OR ${hbcfCertificates.approvalProjectId} IS NOT NULL
      OR ${hbcfCertificates.quoteId} IS NOT NULL
      OR ${hbcfCertificates.crmLeadId} IS NOT NULL
    )`,
  ];
  if (tenantId) certificateConditions.push(eq(hbcfCertificates.tenantId, tenantId));
  else certificateConditions.push(isMultiTenancyMode() ? sql`1 = 0` : sql`${hbcfCertificates.tenantId} IS NULL`);

  const [derivedUsage] = await db.select({
    certificateCount: sql<number>`COUNT(*)`,
    usedAmount: sql<string>`COALESCE(SUM(CAST(${hbcfCertificates.contractPrice} AS DECIMAL(14,2))), 0)`,
  })
    .from(hbcfCertificates)
    .where(and(...certificateConditions));

  const storedUsed = Number(profile.annualLimitUsed || 0);
  const derivedUsed = Number(derivedUsage?.usedAmount || 0);
  const derivedCertificateCount = Number(derivedUsage?.certificateCount || 0);
  const shouldUseDerived = derivedCertificateCount > 0;

  return {
    ...profile,
    annualLimitYear,
    annualLimitUsed: shouldUseDerived ? derivedUsed.toFixed(2) : profile.annualLimitUsed,
    derivedAnnualLimitUsed: derivedUsed.toFixed(2),
    annualLimitUsedSource: shouldUseDerived ? "certificates" : "profile",
    annualLimitCertificateCount: derivedCertificateCount,
  };
}

export async function upsertHbcfBuilderProfile(
  tenantId: number | null | undefined,
  data: Partial<InsertHbcfBuilderProfile>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getHbcfBuilderProfile(tenantId);
  const values = {
    tenantId: tenantId ?? null,
    builderName: data.builderName || existing?.builderName || "Altaspan",
    tradingName: data.tradingName ?? existing?.tradingName ?? null,
    abn: data.abn ?? existing?.abn ?? null,
    licenceNumber: data.licenceNumber ?? existing?.licenceNumber ?? null,
    insurerName: data.insurerName ?? existing?.insurerName ?? null,
    annualLimit: data.annualLimit ?? existing?.annualLimit ?? "0",
    annualLimitUsed: data.annualLimitUsed ?? existing?.annualLimitUsed ?? "0",
    annualLimitYear: data.annualLimitYear ?? existing?.annualLimitYear ?? new Date().getFullYear(),
    apiEnabled: data.apiEnabled ?? existing?.apiEnabled ?? false,
    apiBaseUrl: data.apiBaseUrl ?? existing?.apiBaseUrl ?? null,
    apiKeyRef: data.apiKeyRef ?? existing?.apiKeyRef ?? null,
    apiMonthlyLimit: data.apiMonthlyLimit ?? existing?.apiMonthlyLimit ?? DEFAULT_API_MONTHLY_LIMIT,
    updatedByUserId: data.updatedByUserId,
  };
  if (existing) {
    await db.update(hbcfBuilderProfiles)
      .set(values)
      .where(and(...scopedConditions(hbcfBuilderProfiles, tenantId, eq(hbcfBuilderProfiles.id, existing.id))));
    return existing.id;
  }
  const [result] = await db.insert(hbcfBuilderProfiles).values(values);
  return (result as any).insertId as number;
}

export async function calculateQuoteHbcfValue(quoteId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [quote] = await db.select()
    .from(quotes)
    .where(and(...scopedConditions(quotes, tenantId, eq(quotes.id, quoteId))))
    .limit(1);
  if (!quote) throw new Error("Quote not found");
  const components = await db.select().from(quoteComponents).where(eq(quoteComponents.quoteId, quoteId));
  const componentSubtotal = components.reduce((sum, comp: any) => {
    if (comp.included === false) return sum;
    const items = (comp.lineItems as any[]) || [];
    return sum + items.reduce((itemSum, item) => itemSum + (Number(item.qty) || 0) * (Number(item.sellRate) || 0), 0);
  }, 0);
  const delivery = quote.includeDelivery ? Number(quote.deliveryAmount || 0) : 0;
  const travel = quote.includeTravelAllowance ? Number(quote.travelAllowance || 0) : 0;
  const smallJob = quote.includeSmallJobSurcharge ? Number(quote.smallJobSurcharge || 0) : 0;
  const constructionMgmt = quote.includeConstructionMgmt ? Number(quote.constructionMgmtAmount || 0) : 0;
  const complexity = Number(quote.complexityLoading || 0) / 100;
  const discount = Number(quote.discountPercent || 0) / 100;
  const council = Number(quote.councilFees || 0);
  const homeWarranty = Number(quote.homeWarranty || 0);
  const adjustedSell = componentSubtotal + delivery + travel + smallJob + constructionMgmt;
  const afterComplexity = adjustedSell * (1 + complexity);
  const afterDiscount = afterComplexity * (1 - discount);
  return afterDiscount + council + homeWarranty;
}

export async function syncQuoteHbcfRequirement(quoteId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const value = await calculateQuoteHbcfValue(quoteId, tenantId);
  const [quote] = await db.select()
    .from(quotes)
    .where(and(...scopedConditions(quotes, tenantId, eq(quotes.id, quoteId))))
    .limit(1);
  if (!quote) throw new Error("Quote not found");
  const requirement = hbcfRequirementFieldsForAmount(value, "Quote", {
    siteAddress: quote.siteAddress,
    suburb: quote.suburb,
    region: quote.region,
    localCouncil: quote.localCouncil,
  });
  const required = requirement.hbcfRequired;
  const updates: any = {
    hbcfRequired: required,
    hbcfRequirementReason: requirement.hbcfRequirementReason,
  };
  if (required && !quote.hbcfFlaggedAt) updates.hbcfFlaggedAt = new Date();
  if (!required) updates.hbcfFlaggedAt = null;
  await db.update(quotes)
    .set(updates)
    .where(and(...scopedConditions(quotes, tenantId, eq(quotes.id, quoteId))));
  return { required, value, reason: requirement.hbcfRequirementReason };
}

export async function applyQuoteHbcfToApprovalProject(quoteId: number, projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await syncQuoteHbcfRequirement(quoteId, tenantId);
  const [project] = await db.select()
    .from(approvalProjects)
    .where(and(...scopedConditions(approvalProjects, tenantId, eq(approvalProjects.id, projectId))))
    .limit(1);
  const appliesToProject = project ? isNswHbcfLocation(project) : false;
  if (result.required && appliesToProject) {
    await db.update(approvalProjects)
      .set({
        hbcfRequired: true,
        hbcfStatus: "required",
        hbcfRequirementReason: result.reason,
        hbcfFlaggedAt: new Date(),
      })
      .where(and(...scopedConditions(approvalProjects, tenantId, eq(approvalProjects.id, projectId))));
  } else if (project && !appliesToProject) {
    await db.update(approvalProjects)
      .set({
        hbcfRequired: false,
        hbcfStatus: "not_required",
        hbcfCertificateId: null,
        hbcfRequirementReason: null,
        hbcfFlaggedAt: null,
      })
      .where(and(...scopedConditions(approvalProjects, tenantId, eq(approvalProjects.id, projectId))));
  }
  return result;
}

export async function createOrUpdateHbcfCertificate(data: InsertHbcfCertificate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const tenantId = data.tenantId ?? null;
  const matchConditions: any[] = [];
  if (data.policyNumber) matchConditions.push(eq(hbcfCertificates.policyNumber, data.policyNumber));
  if (data.certificateNumber) matchConditions.push(eq(hbcfCertificates.certificateNumber, data.certificateNumber));
  let existing: any = null;
  if (matchConditions.length > 0) {
    const conditions: any[] = [or(...matchConditions)!];
    appendTenantScope(conditions, hbcfCertificates.tenantId, tenantId);
    const [row] = await db.select().from(hbcfCertificates).where(and(...conditions)).limit(1);
    existing = row ?? null;
  }
  const payload = {
    ...data,
    contractPrice: asMoney(data.contractPrice),
    issuedAt: asDate(data.issuedAt),
    expiresAt: asDate(data.expiresAt),
  };
  if (existing) {
    await db.update(hbcfCertificates)
      .set(payload as any)
      .where(and(...scopedConditions(hbcfCertificates, tenantId, eq(hbcfCertificates.id, existing.id))));
    await linkCertificateToProject(existing.id, payload.approvalProjectId ?? null, payload.status, tenantId);
    return existing.id;
  }
  const [result] = await db.insert(hbcfCertificates).values(payload as any);
  const id = (result as any).insertId as number;
  await linkCertificateToProject(id, payload.approvalProjectId ?? null, payload.status, tenantId);
  return id;
}

async function linkCertificateToProject(
  certificateId: number,
  projectId: number | null | undefined,
  status: string | null | undefined,
  tenantId?: number | null,
) {
  if (!projectId) return;
  const db = await getDb();
  if (!db) return;
  const issued = String(status || "").toLowerCase() === "issued";
  await db.update(approvalProjects)
    .set({
      hbcfRequired: true,
      hbcfStatus: issued ? "issued" : "required",
      hbcfCertificateId: issued ? certificateId : undefined,
      hbcfFlaggedAt: new Date(),
    } as any)
    .where(and(...scopedConditions(approvalProjects, tenantId, eq(approvalProjects.id, projectId))));
}

export async function listHbcfCertificates(filters: {
  tenantId?: number | null;
  projectId?: number;
  quoteId?: number;
  leadId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  appendTenantScope(conditions, hbcfCertificates.tenantId, filters.tenantId);
  if (filters.projectId) conditions.push(eq(hbcfCertificates.approvalProjectId, filters.projectId));
  if (filters.quoteId) conditions.push(eq(hbcfCertificates.quoteId, filters.quoteId));
  if (filters.leadId) conditions.push(eq(hbcfCertificates.crmLeadId, filters.leadId));
  const rows = await db.select().from(hbcfCertificates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(hbcfCertificates.updatedAt));
  const profile = await getHbcfBuilderProfile(filters.tenantId);
  const certificateRows = rows.filter((row) => !isSparseExternalHbcfRecord(row, profile));
  return enrichHbcfCertificates(certificateRows, filters.tenantId);
}

export async function getProjectHbcfGateStatus(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return { required: false, issued: false, blockers: [] as string[] };
  const [project] = await db.select()
    .from(approvalProjects)
    .where(and(...scopedConditions(approvalProjects, tenantId, eq(approvalProjects.id, projectId))))
    .limit(1);
  if (!project) return { required: false, issued: false, blockers: ["Project not found"] };
  const required = isNswHbcfLocation(project) &&
    (!!project.hbcfRequired || Number(project.estimatedCost || 0) >= HBCF_REQUIRED_THRESHOLD);
  if (!required) return { required: false, issued: true, blockers: [] as string[] };
  const issued = await db.select().from(hbcfCertificates)
    .where(and(
      ...scopedConditions(hbcfCertificates, tenantId),
      eq(hbcfCertificates.approvalProjectId, projectId),
      eq(hbcfCertificates.status, "issued"),
    ))
    .limit(1);
  return {
    required: true,
    issued: issued.length > 0,
    blockers: issued.length > 0 ? [] : ["Issued HBCF certificate is required before Construction Commencement Certificate can be issued"],
  };
}

export async function syncProjectHbcfFromApi(projectId: number, tenantId?: number | null, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [project] = await db.select()
    .from(approvalProjects)
    .where(and(...scopedConditions(approvalProjects, tenantId, eq(approvalProjects.id, projectId))))
    .limit(1);
  if (!project) throw new Error("Project not found");
  if (!isNswHbcfLocation(project)) {
    return { imported: 0, total: 0, skipped: "non_nsw_project" };
  }
  const profile = await getHbcfBuilderProfile(tenantId);
  if (!profile) throw new Error("HBCF builder profile has not been configured");
  try {
    const payload = await hbcfApiRequest(profile, {
      address: project.propertyAddress || undefined,
      suburb: project.propertySuburb || undefined,
      postcode: project.propertyPostcode || undefined,
      builderLicenceNumber: profile.licenceNumber || undefined,
      builderName: profile.builderName,
    });
    const policies = extractPolicies(payload).filter((p) => isOurBuilder(p, profile));
    let imported = 0;
    for (const policy of policies) {
      await createOrUpdateHbcfCertificate({
        tenantId: tenantId ?? null,
        approvalProjectId: project.id,
        quoteId: null,
        crmLeadId: project.crmLeadId ?? null,
        certificateNumber: policy.certificateNumber ?? null,
        policyNumber: policy.policyNumber ?? null,
        status: String(policy.status || "issued").toLowerCase(),
        builderName: policy.builderName ?? profile.builderName,
        builderLicenceNumber: policy.builderLicenceNumber ?? profile.licenceNumber,
        insurerName: policy.insurerName ?? profile.insurerName,
        ownerName: policy.ownerName ?? project.clientName,
        propertyAddress: policy.propertyAddress ?? project.propertyAddress,
        propertySuburb: policy.propertySuburb ?? project.propertySuburb,
        propertyPostcode: policy.propertyPostcode ?? project.propertyPostcode,
        contractPrice: asMoney(policy.contractPrice) ?? project.estimatedCost ?? null,
        issuedAt: asDate(policy.issuedAt),
        expiresAt: asDate(policy.expiresAt),
        certificateUrl: policy.certificateUrl ?? null,
        source: "api",
        externalId: policy.externalId ?? null,
        rawPayload: policy.rawPayload ?? null,
        lastSyncedAt: new Date(),
        syncStatus: "synced",
        createdByUserId: userId,
      } as any);
      imported++;
    }
    await recordProfileSync(profile, "success");
    return { imported, total: policies.length };
  } catch (error: any) {
    await recordProfileSync(profile, "failed", error?.message || String(error));
    throw error;
  }
}

export async function runHbcfCompetitorMatching(options: {
  tenantId?: number | null;
  leadIds?: number[];
  forceRefresh?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const profile = await getHbcfBuilderProfile(options.tenantId);
  if (!profile) throw new Error("HBCF builder profile has not been configured");
  const leadConditions: any[] = [
    sql`${crmLeads.contactAddress} IS NOT NULL`,
    sql`${crmLeads.contactAddress} != ''`,
    sql`${crmLeads.status} NOT IN (${sql.join(CONVERTED_LEAD_STATUSES.map((s) => sql`${s}`), sql`,`)})`,
    sql`(
      ${crmLeads.postcode} REGEXP ${NSW_POSTCODE_REGEX}
      OR UPPER(COALESCE(${crmLeads.contactAddress}, '')) LIKE '% NSW%'
      OR UPPER(COALESCE(${crmLeads.contactAddress}, '')) LIKE '%,NSW%'
      OR UPPER(COALESCE(${crmLeads.contactAddress}, '')) LIKE '%NEW SOUTH WALES%'
    )`,
  ];
  appendTenantScope(leadConditions, crmLeads.tenantId, options.tenantId);
  if (options.leadIds?.length) leadConditions.push(inArray(crmLeads.id, options.leadIds));
  const leads = await db.select({
    id: crmLeads.id,
    address: crmLeads.contactAddress,
    suburb: crmLeads.suburb,
    postcode: crmLeads.postcode,
    firstName: crmLeads.contactFirstName,
    lastName: crmLeads.contactLastName,
  })
    .from(crmLeads)
    .where(and(...leadConditions));

  let matched = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const lead of leads) {
    try {
      if (!lead.address) { skipped++; continue; }
      if (!options.forceRefresh) {
        const existing = await db.select({ id: hbcfPolicyMatches.id })
          .from(hbcfPolicyMatches)
          .where(and(
            eq(hbcfPolicyMatches.leadId, lead.id),
            ...scopedConditions(hbcfPolicyMatches, options.tenantId),
          ))
          .limit(1);
        if (existing.length > 0) { skipped++; continue; }
      }
      const payload = await hbcfApiRequest(profile, {
        address: lead.address,
        suburb: lead.suburb || undefined,
        postcode: lead.postcode || undefined,
      });
      const policies = extractPolicies(payload);
      for (const policy of policies) {
        const policyAddress = normalizeAddress(policy.propertyAddress);
        const leadAddress = normalizeAddress(lead.address);
        const highConfidence = !!policyAddress && !!leadAddress && (policyAddress.includes(leadAddress) || leadAddress.includes(policyAddress));
        const isOurs = isOurBuilder(policy, profile);
        const policyNumber = policy.policyNumber || policy.certificateNumber || `${lead.id}-${policy.builderName || "policy"}`;
        const existing = await db.select({ id: hbcfPolicyMatches.id })
          .from(hbcfPolicyMatches)
          .where(and(
            eq(hbcfPolicyMatches.leadId, lead.id),
            eq(hbcfPolicyMatches.policyNumber, policyNumber),
            ...scopedConditions(hbcfPolicyMatches, options.tenantId),
          ))
          .limit(1);
        const values = {
          tenantId: options.tenantId ?? null,
          leadId: lead.id,
          quoteId: null,
          policyNumber,
          certificateNumber: policy.certificateNumber ?? null,
          builderName: policy.builderName ?? null,
          builderLicenceNumber: policy.builderLicenceNumber ?? null,
          insurerName: policy.insurerName ?? null,
          ownerName: policy.ownerName ?? (`${lead.firstName || ""} ${lead.lastName || ""}`.trim() || null),
          propertyAddress: policy.propertyAddress ?? lead.address,
          propertySuburb: policy.propertySuburb ?? lead.suburb,
          propertyPostcode: policy.propertyPostcode ?? lead.postcode,
          contractPrice: asMoney(policy.contractPrice),
          issuedAt: asDate(policy.issuedAt),
          isOurs,
          matchConfidence: highConfidence ? "high" : "medium",
          matchReason: isOurs ? "HBCF policy appears to be ours" : "HBCF policy at unconverted lead address appears to belong to another builder",
          source: "api",
          rawPayload: policy.rawPayload ?? null,
        };
        if (existing.length) {
          await db.update(hbcfPolicyMatches)
            .set(values as any)
            .where(and(...scopedConditions(hbcfPolicyMatches, options.tenantId, eq(hbcfPolicyMatches.id, existing[0].id))));
        } else {
          await db.insert(hbcfPolicyMatches).values(values as any);
        }
        matched++;
      }
    } catch (error: any) {
      errors.push(`Lead ${lead.id}: ${error?.message || String(error)}`);
    }
  }
  return { matched, skipped, errors };
}

export async function listHbcfCompetitorMatches(filters: {
  tenantId?: number | null;
  leadId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const conditions: any[] = [eq(hbcfPolicyMatches.isOurs, false)];
  appendTenantScope(conditions, hbcfPolicyMatches.tenantId, filters.tenantId);
  if (filters.leadId) conditions.push(eq(hbcfPolicyMatches.leadId, filters.leadId));
  const where = and(...conditions);
  const [items, countResult] = await Promise.all([
    db.select().from(hbcfPolicyMatches)
      .where(where)
      .orderBy(desc(hbcfPolicyMatches.issuedAt), desc(hbcfPolicyMatches.createdAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(hbcfPolicyMatches).where(where),
  ]);
  return { items, total: countResult[0]?.count || 0 };
}
