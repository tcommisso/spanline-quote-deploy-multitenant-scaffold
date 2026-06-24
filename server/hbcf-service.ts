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
  hbcfSyncLogs,
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
const ONEGOV_HOST = "api.onegov.nsw.gov.au";

const oneGovTokenCache = new Map<string, { token: string; expiresAt: number }>();

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
  const text = String(value).trim();
  const australianDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (australianDate) {
    const [, day, month, year] = australianDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
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
    .replace(/\b(close|cl)\b/g, "cl")
    .replace(/\b(place|pl)\b/g, "pl")
    .replace(/\b(court|ct)\b/g, "ct")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSuburb(value?: string | null) {
  return (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normalizeLooseText(value?: string | null) {
  return (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function looseTextMatch(left?: string | null, right?: string | null) {
  const a = normalizeLooseText(left);
  const b = normalizeLooseText(right);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

function looseAddressMatch(left?: string | null, right?: string | null) {
  const a = normalizeAddress(left);
  const b = normalizeAddress(right);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

function firstPostcode(...values: unknown[]) {
  return extractPostcodes(...values)[0] ?? null;
}

function firstString(record: any, keys: string[]): string | null {
  if (Array.isArray(record)) {
    for (const item of record) {
      const value: string | null = firstString(item, keys);
      if (value) return value;
    }
    return null;
  }
  for (const key of keys) {
    const value = record?.[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

function normalizeHbcfStatus(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "issued";
  if (["current", "active", "valid", "issued"].includes(text)) return "issued";
  if (["application", "applied", "pending", "lodged"].includes(text)) return "applied";
  if (["cancelled", "canceled", "expired", "suspended", "refused"].includes(text)) return text;
  return text;
}

function isIssuedHbcfStatus(value: unknown) {
  return normalizeHbcfStatus(value) === "issued";
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

function stringValue(value: unknown) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => isRecord(item)
        ? firstString(item, ["businessName", "name", "licenceNumber", "address", "description"])
        : String(item || "").trim())
      .filter(Boolean)
      .join(", ") || null;
  }
  const text = String(value).trim();
  return text || null;
}

function oneGovBusinessNames(raw: any) {
  return stringValue(raw?.businessNames) || stringValue(raw?.licenceDetail?.businessNames);
}

function oneGovAssociatedLicenceNumber(raw: any) {
  const associated = Array.isArray(raw?.associatedLicences) ? raw.associatedLicences : [];
  return firstString(associated.find((item: any) => item?.licenceNumber), ["licenceNumber"]);
}

function oneGovBuildingSiteAddress(raw: any) {
  return firstString(Array.isArray(raw?.buildingSites) ? raw.buildingSites[0] : raw?.buildingSites, ["address"]) ||
    firstString(Array.isArray(raw?.venues) ? raw.venues[0] : null, ["address"]) ||
    firstString(Array.isArray(raw?.premises) ? raw.premises[0] : null, ["businessAddress"]);
}

function oneGovLicenceId(raw: any) {
  return firstString(raw, ["licenceID", "licenceId", "licenceid", "id"]);
}

function isOneGovSummaryRow(row: any) {
  return isRecord(row) && !!oneGovLicenceId(row) && !isRecord(row.licenceDetail);
}

function mergeOneGovDetailRow(summary: any, detail: any) {
  if (!isRecord(detail)) return summary;
  return {
    ...summary,
    ...detail,
    licenceID: oneGovLicenceId(summary) || oneGovLicenceId(detail),
    searchResult: summary,
  };
}

function normalizeOneGovPolicy(raw: any): HbcfPolicyLike {
  const detail = isRecord(raw?.licenceDetail) ? raw.licenceDetail : {};
  const licenceNumber = firstString(detail, ["licenceNumber"]) || firstString(raw, ["licenceNumber"]);
  const status = normalizeHbcfStatus(firstString(detail, ["status"]) || firstString(raw, ["status"]));
  const address = oneGovBuildingSiteAddress(raw) || firstString(detail, ["address"]) || firstString(raw, ["address"]);

  return {
    policyNumber: firstString(raw, ["policyNumber", "policy_number", "policyNo", "policyId", "hbcfPolicyNumber", "insurancePolicyNumber"]),
    certificateNumber: firstString(raw, ["certificateNumber", "certificate_number", "certificateNo", "certificateOfInsuranceNo", "certificateOfInsuranceNumber", "hbcfCertificateNo", "hbcfCertificateNumber", "hbcfNumber"]) || licenceNumber,
    status,
    builderName: firstString(raw, ["builderName", "builder", "contractorName", "builderTradingName", "licensee"]) ||
      firstString(detail, ["licensee", "licenceName"]) ||
      oneGovBusinessNames(raw),
    builderLicenceNumber: firstString(raw, ["builderLicenceNumber", "builderLicenseNumber", "builderLicence", "builderLicense"]) ||
      oneGovAssociatedLicenceNumber(raw),
    insurerName: firstString(raw, ["insurerName", "insurer", "provider"]),
    ownerName: firstString(raw, ["ownerName", "owner", "insuredName", "homeOwnerName", "homeownerName", "customerName"]),
    propertyAddress: address,
    propertySuburb: firstString(raw, ["propertySuburb", "suburb"]),
    propertyPostcode: firstString(raw, ["propertyPostcode", "postcode", "postCode"]) || firstPostcode(address),
    contractPrice: firstString(raw, ["contractPrice", "contractValue", "projectValue", "insuredValue", "insuredAmount", "contractAmount", "constructionCost", "jobValue", "coverAmount"]),
    issuedAt: firstString(raw, ["issuedAt", "issueDate", "issued_date", "dateIssued", "dateOfIssue", "certificateIssuedDate", "policyIssueDate"]) ||
      firstString(detail, ["startDate"]),
    expiresAt: firstString(raw, ["expiresAt", "expiryDate", "expiry_date", "expiry", "dateExpired", "periodEndDate", "policyExpiryDate"]) ||
      firstString(detail, ["expiryDate"]),
    certificateUrl: firstString(raw, ["certificateUrl", "documentUrl", "url"]),
    externalId: firstString(raw, ["externalId", "id", "policyId", "certificateId", "licenceID", "licenceId"]) ||
      firstString(detail, ["licenceID", "licenceId"]),
    rawPayload: rawPayloadOrNull(raw),
  };
}

function normalizePolicy(raw: any): HbcfPolicyLike {
  if (isRecord(raw?.licenceDetail)) return normalizeOneGovPolicy(raw);
  const issuedAt = firstString(raw, ["issuedAt", "issueDate", "issued_date", "dateIssued", "dateOfIssue", "certificateIssuedDate", "policyIssueDate"]);
  const expiresAt = firstString(raw, ["expiresAt", "expiryDate", "expiry_date", "expiry", "dateExpired", "periodEndDate", "policyExpiryDate"]);
  return {
    policyNumber: firstString(raw, ["policyNumber", "policy_number", "policyNo", "policyId", "hbcfPolicyNumber", "insurancePolicyNumber"]),
    certificateNumber: firstString(raw, ["certificateNumber", "certificate_number", "certificateNo", "certificateOfInsuranceNo", "certificateOfInsuranceNumber", "hbcfCertificateNo", "hbcfCertificateNumber", "hbcfNumber", "licenceNumber"]),
    status: normalizeHbcfStatus(firstString(raw, ["status", "applicationStatus", "policyStatus", "certificateStatus", "insuranceStatus"])),
    builderName: firstString(raw, ["builderName", "builder", "contractorName", "builderTradingName", "licensee", "businessNames"]),
    builderLicenceNumber: firstString(raw, ["builderLicenceNumber", "builderLicenseNumber", "builderLicence", "builderLicense"]),
    insurerName: firstString(raw, ["insurerName", "insurer", "provider"]),
    ownerName: firstString(raw, ["ownerName", "owner", "insuredName", "homeOwnerName", "homeownerName", "customerName"]),
    propertyAddress: firstString(raw, ["propertyAddress", "address", "siteAddress", "riskAddress", "insuredAddress", "projectAddress"]),
    propertySuburb: firstString(raw, ["propertySuburb", "suburb"]),
    propertyPostcode: firstString(raw, ["propertyPostcode", "postcode", "postCode"]),
    contractPrice: firstString(raw, ["contractPrice", "contractValue", "projectValue", "insuredValue", "insuredAmount", "contractAmount", "constructionCost", "jobValue", "coverAmount"]),
    issuedAt,
    expiresAt,
    certificateUrl: firstString(raw, ["certificateUrl", "documentUrl", "url"]),
    externalId: firstString(raw, ["externalId", "id", "policyId", "certificateId", "licenceID", "licenceId"]),
    rawPayload: rawPayloadOrNull(raw),
  };
}

function extractApiRows(payload: any): any[] {
  return Array.isArray(payload)
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
}

function extractPolicies(payload: any): HbcfPolicyLike[] {
  return extractApiRows(payload)
    .filter((row: unknown) => row != null)
    .map(normalizePolicy)
    .filter((p: HbcfPolicyLike) => p.policyNumber || p.certificateNumber || p.builderName);
}

async function hydrateOneGovHbcfRows(profile: HbcfBuilderProfile, payload: any) {
  const rows = extractApiRows(payload);
  if (!rows.some(isOneGovSummaryRow)) return payload;

  const seen = new Set<string>();
  const hydrated: any[] = [];
  for (const row of rows) {
    if (!isOneGovSummaryRow(row)) {
      hydrated.push(row);
      continue;
    }
    const licenceId = oneGovLicenceId(row);
    if (!licenceId || seen.has(licenceId)) continue;
    seen.add(licenceId);
    const detail = await hbcfApiRequest(profile, { licenceid: licenceId });
    hydrated.push(mergeOneGovDetailRow(row, detail));
  }
  return hydrated;
}

async function fetchHbcfPolicies(profile: HbcfBuilderProfile, params: Record<string, string | undefined> = {}) {
  const payload = await hbcfApiRequest(profile, params);
  const hydrated = await hydrateOneGovHbcfRows(profile, payload);
  return extractPolicies(hydrated);
}

function resolveApiKey(profile: HbcfBuilderProfile) {
  const ref = profile.apiKeyRef?.trim();
  if (!ref) return null;
  if (ref.startsWith("env:")) return process.env[ref.slice(4)] || null;
  return process.env[ref] || ref;
}

function apiKeyRefEnvName(profile: HbcfBuilderProfile) {
  const ref = profile.apiKeyRef?.trim();
  if (!ref) return null;
  return ref.startsWith("env:") ? ref.slice(4) : ref;
}

function resolveOneGovApiSecret(profile: HbcfBuilderProfile) {
  const keyRef = apiKeyRefEnvName(profile);
  const candidates = [
    keyRef ? process.env[`${keyRef}_SECRET`] : null,
    keyRef?.endsWith("_KEY") ? process.env[`${keyRef.slice(0, -4)}_SECRET`] : null,
    process.env.HBCF_API_SECRET,
    process.env.ONEGOV_API_SECRET,
  ];
  return candidates.find((value) => value && value.trim()) || null;
}

function isOneGovHbcfUrl(url: URL) {
  return url.hostname === ONEGOV_HOST || url.pathname.startsWith("/hbccheckregister/");
}

function oneGovHbcfSearchText(params: Record<string, string | undefined>) {
  return params.searchText ||
    [params.address, params.suburb, params.postcode].filter(Boolean).join(" ").trim() ||
    params.builderName ||
    params.licenceNumber ||
    params.builderLicenceNumber ||
    "";
}

function buildHbcfRequestUrl(profile: HbcfBuilderProfile, params: Record<string, string | undefined>) {
  const configured = new URL(profile.apiBaseUrl!);
  if (!isOneGovHbcfUrl(configured)) {
    for (const [key, value] of Object.entries(params)) {
      if (value) configured.searchParams.set(key, value);
    }
    return { url: configured, oneGov: false };
  }

  const origin = configured.hostname === ONEGOV_HOST
    ? configured.origin
    : `https://${ONEGOV_HOST}`;
  const hasAddressSearch = !!(params.searchText || params.address || params.suburb || params.postcode);
  const licenceNumber = params.licenceNumber || params.builderLicenceNumber;
  const licenceId = params.licenceid || params.licenceId;

  let path = "/hbccheckregister/v1/browse";
  if (licenceId && !hasAddressSearch) {
    path = "/hbccheckregister/v1/details";
  } else if (licenceNumber && !hasAddressSearch) {
    path = "/hbccheckregister/v1/verify";
  }

  const url = new URL(path, origin);
  if (path.endsWith("/details")) {
    url.searchParams.set("licenceid", licenceId || "");
  } else if (path.endsWith("/verify")) {
    url.searchParams.set("licenceNumber", licenceNumber || "");
  } else {
    url.searchParams.set("searchText", oneGovHbcfSearchText(params));
  }
  return { url, oneGov: true };
}

async function getOneGovAccessToken(origin: string, apiKey: string, apiSecret: string) {
  const cacheKey = `${origin}:${apiKey}`;
  const cached = oneGovTokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) return cached.token;

  const url = new URL("/oauth/client_credential/accesstoken", origin);
  url.searchParams.set("grant_type", "client_credentials");
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HBCF OneGov token request returned ${response.status}${text.trim() ? `: ${text.trim().slice(0, 300)}` : ""}`);
  }
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch (error: any) {
    throw new Error(`HBCF OneGov token response was not valid JSON: ${error?.message || String(error)}`);
  }
  const token = payload.access_token || payload.accessToken;
  if (!token) throw new Error("HBCF OneGov token response did not include access_token");
  const expiresIn = Number(payload.expires_in || payload.expiresIn || 3600);
  oneGovTokenCache.set(cacheKey, {
    token,
    expiresAt: now + Math.max(60, expiresIn - 60) * 1000,
  });
  return token;
}

function hbcfEndpointLabel(url: URL) {
  return `${url.origin}${url.pathname}`;
}

function hbcfFetchFailureMessage(error: any) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return "request timed out after 15 seconds";
  }
  return error?.cause?.code ||
    error?.code ||
    error?.cause?.message ||
    error?.message ||
    String(error || "unknown network error");
}

function isOurBuilder(policy: HbcfPolicyLike, profile: HbcfBuilderProfile | null) {
  const builder = (policy.builderName || "").toLowerCase();
  const licence = (policy.builderLicenceNumber || "").toLowerCase();
  const names = [profile?.builderName, profile?.tradingName, "spanline", "altaspan"]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  const licences = [profile?.licenceNumber].filter(Boolean).map((v) => String(v).toLowerCase());
  return (!!builder && names.some((name) => builder.includes(name) || name.includes(builder))) ||
    (!!licence && licences.some((item) => !!item && licence === item));
}

function hbcfPolicyKey(policy: HbcfPolicyLike) {
  return [
    policy.certificateNumber,
    policy.policyNumber,
    policy.externalId,
    policy.propertyAddress && policy.ownerName
      ? `${normalizeAddress(policy.propertyAddress)}:${normalizeLooseText(policy.ownerName)}`
      : null,
  ].find((value) => value && String(value).trim())?.toString().toLowerCase() || null;
}

function dedupeHbcfPolicies(policies: HbcfPolicyLike[]) {
  const seen = new Set<string>();
  const unique: HbcfPolicyLike[] = [];
  for (const policy of policies) {
    const key = hbcfPolicyKey(policy);
    if (!key) {
      unique.push(policy);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(policy);
  }
  return unique;
}

function hbcfTenantSearchTerms(profile: HbcfBuilderProfile) {
  const terms = [
    profile.licenceNumber,
    profile.builderName,
    profile.tradingName,
    profile.abn,
  ];
  return Array.from(new Set(
    terms
      .map((term) => String(term || "").trim())
      .filter((term) => term.length >= 3),
  ));
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

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function hasValue(value: unknown) {
  return value != null && String(value).trim() !== "";
}

function sameMoney(left: unknown, right: unknown) {
  const a = asMoney(left);
  const b = asMoney(right);
  return !a || !b || a === b;
}

function projectMatchesCertificate(project: any, certificate: any) {
  if (Number(certificate.approvalProjectId) === Number(project.id)) return true;
  if (project.crmLeadId && Number(certificate.crmLeadId) === Number(project.crmLeadId)) return true;

  const projectPostcode = String(project.propertyPostcode || firstPostcode(project.propertyAddress) || "").trim();
  const certificatePostcode = String(certificate.propertyPostcode || firstPostcode(certificate.propertyAddress) || "").trim();
  const postcodeMatches = !!projectPostcode && !!certificatePostcode && projectPostcode === certificatePostcode;
  const addressMatches = looseAddressMatch(project.propertyAddress, certificate.propertyAddress);
  const ownerMatches = looseTextMatch(project.clientName, certificate.ownerName);

  if (addressMatches && postcodeMatches) return true;
  if (addressMatches && (!project.clientName || !certificate.ownerName || ownerMatches)) return true;
  if (ownerMatches && postcodeMatches) return true;
  return false;
}

function leadMatchesCertificate(lead: any, certificate: any) {
  if (Number(certificate.crmLeadId) === Number(lead.id)) return true;

  const leadPostcode = String(lead.postcode || firstPostcode(lead.contactAddress) || "").trim();
  const certificatePostcode = String(certificate.propertyPostcode || firstPostcode(certificate.propertyAddress) || "").trim();
  const postcodeMatches = !!leadPostcode && !!certificatePostcode && leadPostcode === certificatePostcode;
  const addressMatches = looseAddressMatch(lead.contactAddress, certificate.propertyAddress);
  return addressMatches && postcodeMatches;
}

async function findMatchingProjectHbcfCertificate(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  project: any,
  tenantId: number | null | undefined,
) {
  const exactConditions: any[] = [eq(hbcfCertificates.approvalProjectId, project.id)];
  appendTenantScope(exactConditions, hbcfCertificates.tenantId, tenantId);
  const [linked] = await db.select().from(hbcfCertificates).where(and(...exactConditions)).limit(1);
  if (linked) return linked;

  const projectPostcode = String(project.propertyPostcode || firstPostcode(project.propertyAddress) || "").trim();
  if (!projectPostcode && !project.crmLeadId) return null;

  const candidateConditions: any[] = [
    sql`(${hbcfCertificates.approvalProjectId} IS NULL OR ${hbcfCertificates.approvalProjectId} = ${project.id})`,
  ];
  appendTenantScope(candidateConditions, hbcfCertificates.tenantId, tenantId);
  if (projectPostcode) {
    candidateConditions.push(or(
      eq(hbcfCertificates.propertyPostcode, projectPostcode),
      like(hbcfCertificates.propertyAddress, `%${projectPostcode}%`),
    )!);
  }
  else if (project.crmLeadId) candidateConditions.push(eq(hbcfCertificates.crmLeadId, project.crmLeadId));

  const candidates = await db.select()
    .from(hbcfCertificates)
    .where(and(...candidateConditions))
    .orderBy(desc(hbcfCertificates.updatedAt))
    .limit(100);

  return candidates.find((candidate) => projectMatchesCertificate(project, candidate)) ?? null;
}

async function linkExistingHbcfCertificateToProject(project: any, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const certificate = await findMatchingProjectHbcfCertificate(db, project, tenantId);
  if (!certificate) return null;

  const updates: any = {
    approvalProjectId: project.id,
    crmLeadId: project.crmLeadId ?? certificate.crmLeadId ?? null,
    ownerName: hasValue(certificate.ownerName) ? certificate.ownerName : project.clientName ?? null,
    propertyAddress: hasValue(certificate.propertyAddress) ? certificate.propertyAddress : project.propertyAddress ?? null,
    propertySuburb: hasValue(certificate.propertySuburb) ? certificate.propertySuburb : project.propertySuburb ?? null,
    propertyPostcode: hasValue(certificate.propertyPostcode) ? certificate.propertyPostcode : project.propertyPostcode ?? null,
    contractPrice: hasValue(certificate.contractPrice) ? certificate.contractPrice : asMoney(project.estimatedCost),
    lastSyncedAt: new Date(),
  };

  await db.update(hbcfCertificates)
    .set(updates)
    .where(and(...scopedConditions(hbcfCertificates, tenantId, eq(hbcfCertificates.id, certificate.id))));
  await linkCertificateToProject(certificate.id, project.id, certificate.status, tenantId);
  return { ...certificate, ...updates };
}

async function findExistingHbcfCertificate(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, tenantId: number | null, data: InsertHbcfCertificate) {
  const exactConditions: any[] = [];
  if (data.policyNumber) exactConditions.push(eq(hbcfCertificates.policyNumber, data.policyNumber));
  if (data.certificateNumber) exactConditions.push(eq(hbcfCertificates.certificateNumber, data.certificateNumber));
  if (data.externalId) exactConditions.push(eq(hbcfCertificates.externalId, data.externalId));

  if (exactConditions.length > 0) {
    const conditions: any[] = [or(...exactConditions)!];
    appendTenantScope(conditions, hbcfCertificates.tenantId, tenantId);
    const [row] = await db.select().from(hbcfCertificates).where(and(...conditions)).limit(1);
    if (row) return row;
  }

  const linkConditions: any[] = [];
  if (data.approvalProjectId) linkConditions.push(eq(hbcfCertificates.approvalProjectId, data.approvalProjectId));
  if (data.quoteId) linkConditions.push(eq(hbcfCertificates.quoteId, data.quoteId));
  if (data.crmLeadId) linkConditions.push(eq(hbcfCertificates.crmLeadId, data.crmLeadId));
  if (linkConditions.length > 0) {
    const conditions: any[] = [
      or(...linkConditions)!,
      sql`LOWER(COALESCE(${hbcfCertificates.status}, '')) <> 'issued'`,
    ];
    appendTenantScope(conditions, hbcfCertificates.tenantId, tenantId);
    const [row] = await db.select().from(hbcfCertificates).where(and(...conditions)).limit(1);
    if (row) return row;
  }

  const targetPostcode = data.propertyPostcode ? String(data.propertyPostcode).trim() : "";
  const targetAddress = data.propertyAddress ? String(data.propertyAddress) : "";
  const targetOwner = data.ownerName ? String(data.ownerName) : "";
  if (!targetPostcode || (!targetAddress && !targetOwner)) return null;

  const conditions: any[] = [
    eq(hbcfCertificates.propertyPostcode, targetPostcode),
    sql`LOWER(COALESCE(${hbcfCertificates.status}, '')) <> 'issued'`,
  ];
  appendTenantScope(conditions, hbcfCertificates.tenantId, tenantId);
  const candidates = await db.select().from(hbcfCertificates).where(and(...conditions)).limit(50);
  return candidates.find((candidate: any) => {
    const addressMatches = targetAddress && looseAddressMatch(candidate.propertyAddress, targetAddress);
    const ownerMatches = targetOwner && looseTextMatch(candidate.ownerName, targetOwner);
    if (!sameMoney(candidate.contractPrice, data.contractPrice)) return false;
    return addressMatches && (!targetOwner || ownerMatches) || ownerMatches && !targetAddress;
  }) ?? null;
}

function mergeApiCertificateUpdate(existing: any, payload: any) {
  return {
    ...payload,
    approvalProjectId: payload.approvalProjectId ?? existing.approvalProjectId ?? null,
    quoteId: payload.quoteId ?? existing.quoteId ?? null,
    crmLeadId: payload.crmLeadId ?? existing.crmLeadId ?? null,
    certificateNumber: hasValue(payload.certificateNumber) ? payload.certificateNumber : existing.certificateNumber,
    policyNumber: hasValue(payload.policyNumber) ? payload.policyNumber : existing.policyNumber,
    builderName: hasValue(payload.builderName) ? payload.builderName : existing.builderName,
    builderLicenceNumber: hasValue(payload.builderLicenceNumber) ? payload.builderLicenceNumber : existing.builderLicenceNumber,
    insurerName: hasValue(payload.insurerName) ? payload.insurerName : existing.insurerName,
    ownerName: hasValue(payload.ownerName) ? payload.ownerName : existing.ownerName,
    propertyAddress: hasValue(payload.propertyAddress) ? payload.propertyAddress : existing.propertyAddress,
    propertySuburb: hasValue(payload.propertySuburb) ? payload.propertySuburb : existing.propertySuburb,
    propertyPostcode: hasValue(payload.propertyPostcode) ? payload.propertyPostcode : existing.propertyPostcode,
    contractPrice: hasValue(payload.contractPrice) ? payload.contractPrice : existing.contractPrice,
    issuedAt: payload.issuedAt ?? existing.issuedAt ?? null,
    expiresAt: payload.expiresAt ?? existing.expiresAt ?? null,
    certificateUrl: hasValue(payload.certificateUrl) ? payload.certificateUrl : existing.certificateUrl,
    externalId: hasValue(payload.externalId) ? payload.externalId : existing.externalId,
    rawPayload: payload.rawPayload ?? existing.rawPayload ?? null,
    createdByUserId: payload.createdByUserId ?? existing.createdByUserId ?? null,
  };
}

async function enrichHbcfCertificates(rows: any[], tenantId: number | null | undefined) {
  if (!rows.length) return rows;
  const db = await getDb();
  if (!db) return rows;

  const projectIds = uniqueIds(rows.map((row) => row.approvalProjectId));
  const leadIds = uniqueIds(rows.map((row) => row.crmLeadId));
  const quoteIds = uniqueIds(rows.map((row) => row.quoteId));
  const rowPostcodes = uniqueStrings(rows.map((row) => row.propertyPostcode || firstPostcode(row.propertyAddress)));

  const [projects, leads, quoteRows, candidateProjects, candidateLeads] = await Promise.all([
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
    rowPostcodes.length
      ? db.select({
        id: approvalProjects.id,
        clientName: approvalProjects.clientName,
        propertyAddress: approvalProjects.propertyAddress,
        propertySuburb: approvalProjects.propertySuburb,
        propertyPostcode: approvalProjects.propertyPostcode,
        estimatedCost: approvalProjects.estimatedCost,
      }).from(approvalProjects)
        .where(and(...scopedConditions(approvalProjects, tenantId, inArray(approvalProjects.propertyPostcode, rowPostcodes))))
      : [],
    rowPostcodes.length
      ? db.select({
        id: crmLeads.id,
        contactFirstName: crmLeads.contactFirstName,
        contactLastName: crmLeads.contactLastName,
        company: crmLeads.company,
        contactAddress: crmLeads.contactAddress,
        suburb: crmLeads.suburb,
        postcode: crmLeads.postcode,
      }).from(crmLeads)
        .where(and(...scopedConditions(crmLeads, tenantId, inArray(crmLeads.postcode, rowPostcodes))))
      : [],
  ]);

  const projectById = new Map(projects.map((project: any) => [Number(project.id), project]));
  const leadById = new Map(leads.map((lead: any) => [Number(lead.id), lead]));
  const quoteById = new Map(quoteRows.map((quote: any) => [Number(quote.id), quote]));
  const candidateProjectsByPostcode = new Map<string, any[]>();
  for (const project of candidateProjects) {
    const postcode = String(project.propertyPostcode || firstPostcode(project.propertyAddress) || "").trim();
    if (!postcode) continue;
    const list = candidateProjectsByPostcode.get(postcode) || [];
    list.push(project);
    candidateProjectsByPostcode.set(postcode, list);
  }
  const candidateLeadsByPostcode = new Map<string, any[]>();
  for (const lead of candidateLeads) {
    const postcode = String(lead.postcode || firstPostcode(lead.contactAddress) || "").trim();
    if (!postcode) continue;
    const list = candidateLeadsByPostcode.get(postcode) || [];
    list.push(lead);
    candidateLeadsByPostcode.set(postcode, list);
  }

  const findDisplayProject = (row: any) => {
    const postcode = String(row.propertyPostcode || firstPostcode(row.propertyAddress) || "").trim();
    const candidates = postcode ? candidateProjectsByPostcode.get(postcode) || [] : [];
    return candidates.find((project: any) => projectMatchesCertificate(project, row)) ?? null;
  };
  const findDisplayLead = (row: any) => {
    const postcode = String(row.propertyPostcode || firstPostcode(row.propertyAddress) || "").trim();
    const candidates = postcode ? candidateLeadsByPostcode.get(postcode) || [] : [];
    return candidates.find((lead: any) => leadMatchesCertificate(lead, row)) ?? null;
  };

  return rows.map((row) => {
    const project = projectById.get(Number(row.approvalProjectId)) || findDisplayProject(row);
    const lead = leadById.get(Number(row.crmLeadId)) || findDisplayLead(row);
    const quote = quoteById.get(Number(row.quoteId));
    const address = firstPresent(row.propertyAddress, project?.propertyAddress, lead?.contactAddress, quote?.siteAddress);
    const suburb = firstPresent(row.propertySuburb, project?.propertySuburb, lead?.suburb, quote?.suburb);
    const postcode = firstPresent(row.propertyPostcode, project?.propertyPostcode, lead?.postcode, firstPostcode(address, suburb));

    return {
      ...row,
      approvalProjectId: row.approvalProjectId ?? project?.id ?? null,
      crmLeadId: row.crmLeadId ?? lead?.id ?? null,
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
  let url: URL;
  let oneGov = false;
  try {
    const request = buildHbcfRequestUrl(profile, params);
    url = request.url;
    oneGov = request.oneGov;
  } catch {
    throw new Error("HBCF API base URL is invalid. Check the API base URL in HBCF Builder Profile.");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = resolveApiKey(profile);
  if (profile.apiKeyRef?.trim().startsWith("env:") && !key) {
    throw new Error(`HBCF API key environment variable ${profile.apiKeyRef.trim().slice(4)} is not available on this server.`);
  }
  if (oneGov) {
    if (!key) throw new Error("HBCF OneGov API key is not configured.");
    const secret = resolveOneGovApiSecret(profile);
    if (!secret) {
      throw new Error("HBCF OneGov API secret is not configured. Set HBCF_API_SECRET in Railway or use a matching *_SECRET variable for the API key reference.");
    }
    headers.apikey = key;
    headers.Authorization = `Bearer ${await getOneGovAccessToken(url.origin, key, secret)}`;
  } else if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  await chargeApiCall(profile);

  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  } catch (error: any) {
    throw new Error(`HBCF API request failed for ${hbcfEndpointLabel(url)}: ${hbcfFetchFailureMessage(error)}. Check the API base URL, server network access, and authentication settings in HBCF Builder Profile.`);
  }

  let text = "";
  try {
    text = await response.text();
  } catch (error: any) {
    throw new Error(`HBCF API response could not be read from ${hbcfEndpointLabel(url)}: ${hbcfFetchFailureMessage(error)}.`);
  }

  if (!response.ok) {
    const body = text.trim().slice(0, 600);
    throw new Error(`HBCF API returned ${response.status} from ${hbcfEndpointLabel(url)}${body ? `: ${body}` : ""}`);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (error: any) {
    throw new Error(`HBCF API returned invalid JSON from ${hbcfEndpointLabel(url)}: ${error?.message || String(error)}`);
  }
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
  const payload = {
    ...data,
    contractPrice: asMoney(data.contractPrice),
    issuedAt: asDate(data.issuedAt),
    expiresAt: asDate(data.expiresAt),
  };
  const existing = await findExistingHbcfCertificate(db, tenantId, payload as any);
  if (existing) {
    const updatePayload = payload.source === "api"
      ? mergeApiCertificateUpdate(existing, payload)
      : payload;
    await db.update(hbcfCertificates)
      .set(updatePayload as any)
      .where(and(...scopedConditions(hbcfCertificates, tenantId, eq(hbcfCertificates.id, existing.id))));
    await linkCertificateToProject(
      existing.id,
      updatePayload.approvalProjectId ?? existing.approvalProjectId ?? null,
      updatePayload.status,
      tenantId,
    );
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
  const issued = isIssuedHbcfStatus(status);
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
  if (filters.projectId) {
    const [project] = await db.select()
      .from(approvalProjects)
      .where(and(...scopedConditions(approvalProjects, filters.tenantId, eq(approvalProjects.id, filters.projectId))))
      .limit(1);
    if (project) {
      const match = await findMatchingProjectHbcfCertificate(db, project, filters.tenantId);
      if (match && !rows.some((row) => Number(row.id) === Number(match.id))) {
        rows.unshift(match);
      }
    }
  }
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
      sql`LOWER(COALESCE(${hbcfCertificates.status}, '')) IN ('issued', 'current', 'active', 'valid')`,
    ))
    .limit(1);
  if (issued.length === 0) {
    const match = await findMatchingProjectHbcfCertificate(db, project, tenantId);
    if (match && isIssuedHbcfStatus(match.status)) {
      return { required: true, issued: true, blockers: [] as string[] };
    }
  }
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
  const linkedExisting = await linkExistingHbcfCertificateToProject(project, tenantId);
  if (linkedExisting) {
    return { imported: 0, linked: 1, total: 1, source: "certificate_register" };
  }
  const profile = await getHbcfBuilderProfile(tenantId);
  if (!profile) throw new Error("HBCF builder profile has not been configured");
  try {
    const policies = (await fetchHbcfPolicies(profile, {
      address: project.propertyAddress || undefined,
      suburb: project.propertySuburb || undefined,
      postcode: project.propertyPostcode || undefined,
      builderLicenceNumber: profile.licenceNumber || undefined,
      builderName: profile.builderName,
    })).filter((p) => isOurBuilder(p, profile) || (!p.builderName && !p.builderLicenceNumber));
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
    return { imported, linked: 0, total: policies.length, source: "api" };
  } catch (error: any) {
    await recordProfileSync(profile, "failed", error?.message || String(error));
    throw error;
  }
}

export async function syncTenantHbcfCertificatesFromApi(tenantId?: number | null, userId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const profile = await getHbcfBuilderProfile(tenantId);
  if (!profile) throw new Error("HBCF builder profile has not been configured");

  const startedAt = new Date();
  const [logResult] = await db.insert(hbcfSyncLogs).values({
    tenantId: tenantId ?? null,
    syncType: "certificate_register",
    startedAt,
    status: "running",
    source: "api",
  } as any);
  const logId = (logResult as any)?.insertId as number | undefined;

  try {
    const searchTerms = hbcfTenantSearchTerms(profile);
    if (!searchTerms.length) {
      throw new Error("HBCF Builder Profile needs a licence number, builder name, trading name, or ABN before API sync can search the register.");
    }
    const foundPolicies: HbcfPolicyLike[] = [];
    for (const searchText of searchTerms) {
      const policies = await fetchHbcfPolicies(profile, { searchText });
      foundPolicies.push(...policies);
    }
    const policies = dedupeHbcfPolicies(foundPolicies)
      .filter((policy) => isOurBuilder(policy, profile) || (!policy.builderName && !policy.builderLicenceNumber));
    let updated = 0;
    for (const policy of policies) {
      await createOrUpdateHbcfCertificate({
        tenantId: tenantId ?? null,
        approvalProjectId: null,
        quoteId: null,
        crmLeadId: null,
        certificateNumber: policy.certificateNumber ?? null,
        policyNumber: policy.policyNumber ?? null,
        status: String(policy.status || "issued").toLowerCase(),
        builderName: policy.builderName ?? profile.builderName,
        builderLicenceNumber: policy.builderLicenceNumber ?? profile.licenceNumber,
        insurerName: policy.insurerName ?? profile.insurerName,
        ownerName: policy.ownerName ?? null,
        propertyAddress: policy.propertyAddress ?? null,
        propertySuburb: policy.propertySuburb ?? null,
        propertyPostcode: policy.propertyPostcode ?? null,
        contractPrice: asMoney(policy.contractPrice),
        issuedAt: asDate(policy.issuedAt),
        expiresAt: asDate(policy.expiresAt),
        certificateUrl: policy.certificateUrl ?? null,
        source: "api",
        externalId: policy.externalId ?? null,
        rawPayload: policy.rawPayload ?? null,
        lastSyncedAt: new Date(),
        syncStatus: "synced",
        createdByUserId: userId ?? null,
      } as any);
      updated++;
    }

    await recordProfileSync(profile, "success");
    if (logId) {
      await db.update(hbcfSyncLogs)
        .set({
          certificatesChecked: policies.length,
          certificatesUpdated: updated,
          completedAt: new Date(),
          status: "success",
        } as any)
        .where(and(...scopedConditions(hbcfSyncLogs, tenantId, eq(hbcfSyncLogs.id, logId))));
    }
    return {
      checked: policies.length,
      updated,
      searchTermsChecked: searchTerms.length,
      message: policies.length === 0
        ? `HBCF API returned no matching certificate rows for the current Builder Profile search terms (${searchTerms.length} checked). Try syncing an individual NSW project by address, or update the Builder Profile name/licence/ABN.`
        : null,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    await recordProfileSync(profile, "failed", message);
    if (logId) {
      await db.update(hbcfSyncLogs)
        .set({
          completedAt: new Date(),
          status: "failed",
          errors: 1,
          errorDetails: message,
        } as any)
        .where(and(...scopedConditions(hbcfSyncLogs, tenantId, eq(hbcfSyncLogs.id, logId))));
    }
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
      const policies = await fetchHbcfPolicies(profile, {
        address: lead.address,
        suburb: lead.suburb || undefined,
        postcode: lead.postcode || undefined,
      });
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
