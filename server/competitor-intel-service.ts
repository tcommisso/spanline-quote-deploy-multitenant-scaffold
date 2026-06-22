/**
 * Competitor Intelligence Service
 * Queries ACT DAFINDER_LIST_VIEW ArcGIS layer for DA data with applicant/company info.
 * Matches DAs against leads/quotes by address + name for competitor insights.
 */
import { getDb } from "./db";
import { clientDas, crmLeads, quotes, daCompetitorWatchlist } from "../drizzle/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { normalizeApiAddress } from "@shared/address-normalization";

const DAFINDER_LIST_URL = "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_DAFINDER_LIST_VIEW/FeatureServer/0";
const PAGE_SIZE = 1000;

export interface DaFinderRecord {
  daNumber: string;
  applicationType: string;
  amendmentVersion: string | null;
  lodgementDate: number | null;
  suburb: string | null;
  block: number | null;
  section: number | null;
  streetAddress: string | null;
  proposalText: string | null;
  companyOrgName: string | null;
  applicantName: string | null;
  blockKey: number | null;
  district: string | null;
  decision: string | null;
  decisionDate: number | null;
  daStage: string | null;
  centroidLat: number | null;
  centroidLng: number | null;
}

/**
 * Query DAFINDER_LIST_VIEW by company/org name (supports LIKE wildcards)
 */
export async function searchDasByCompany(
  companyName: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    suburb?: string;
    limit?: number;
  }
): Promise<DaFinderRecord[]> {
  const conditions: string[] = [];
  conditions.push(`COMPANYORG_NAME LIKE '%${escapeArcGIS(companyName)}%'`);

  if (options?.suburb) {
    conditions.push(`SUBURB='${escapeArcGIS(options.suburb)}'`);
  }
  if (options?.dateFrom) {
    conditions.push(`LODGEMENT_DATE >= '${options.dateFrom}'`);
  }
  if (options?.dateTo) {
    conditions.push(`LODGEMENT_DATE <= '${options.dateTo}'`);
  }

  const where = conditions.join(" AND ");
  const limit = options?.limit || 500;

  return queryDaFinder(where, limit);
}

/**
 * Query DAFINDER_LIST_VIEW by street address (for client matching)
 */
export async function searchDasByAddress(
  streetAddress: string,
  suburb?: string
): Promise<DaFinderRecord[]> {
  const conditions: string[] = [];

  // Normalise address for search - extract street number and name
  const normalised = normaliseAddress(normalizeApiAddress(streetAddress));
  if (normalised) {
    conditions.push(`STREET_ADDRESS LIKE '%${escapeArcGIS(normalised)}%'`);
  } else {
    return [];
  }

  if (suburb) {
    conditions.push(`SUBURB='${escapeArcGIS(suburb.toUpperCase())}'`);
  }

  const where = conditions.join(" AND ");
  return queryDaFinder(where, 50);
}

/**
 * Query DAFINDER_LIST_VIEW by applicant name
 */
export async function searchDasByApplicant(
  name: string,
  options?: { suburb?: string; limit?: number }
): Promise<DaFinderRecord[]> {
  const conditions: string[] = [];
  conditions.push(`APPLICANT_NAME LIKE '%${escapeArcGIS(name)}%'`);

  if (options?.suburb) {
    conditions.push(`SUBURB='${escapeArcGIS(options.suburb)}'`);
  }

  const where = conditions.join(" AND ");
  return queryDaFinder(where, options?.limit || 100);
}

/**
 * Run the full client-DA matching process:
 * 1. Get all leads/quotes with addresses
 * 2. For each, search DAFINDER by address
 * 3. Cross-reference company name to determine if ours or competitor
 * 4. Store matches in client_das table
 */
export interface CompetitorMatchAlert {
  leadId: number;
  leadName: string;
  address: string;
  suburb: string | null;
  daNumber: string;
  companyName: string;
  proposalText: string | null;
}

export async function runClientDaMatching(options?: {
  leadIds?: number[];
  forceRefresh?: boolean;
  tenantId?: number | null;
}): Promise<{ matched: number; skipped: number; errors: string[]; newCompetitorMatches: CompetitorMatchAlert[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let matched = 0;
  let skipped = 0;
  const errors: string[] = [];
  const newCompetitorMatches: CompetitorMatchAlert[] = [];
  const tenantId = options?.tenantId ?? null;

  // Companies that are always "ours" regardless of lead status
  const ALWAYS_OURS = ["spanline"];
  // Companies that are "ours" ONLY when the lead is converted (they work for multiple builders)
  const CONDITIONAL_OURS = ["simple site plans"];
  const watchlistConditions: any[] = [eq(daCompetitorWatchlist.active, true)];
  if (tenantId) watchlistConditions.push(eq(daCompetitorWatchlist.tenantId, tenantId));
  const watchlist = await db.select()
    .from(daCompetitorWatchlist)
    .where(and(...watchlistConditions));
  const alwaysOursNames = [
    ...watchlist
      .filter(w => ALWAYS_OURS.some(alias => w.companyName.toLowerCase().includes(alias)))
      .map(w => w.companyName.toLowerCase()),
    ...ALWAYS_OURS,
  ];
  const conditionalOursNames = [
    ...watchlist
      .filter(w => CONDITIONAL_OURS.some(alias => w.companyName.toLowerCase().includes(alias)))
      .map(w => w.companyName.toLowerCase()),
    ...CONDITIONAL_OURS,
  ];
  // Lead statuses that indicate conversion (the lead became a Spanline client)
  const CONVERTED_STATUSES = ["contract", "building_authority", "construction", "completed", "won"];

  // Get leads with addresses
  const leadConditions: any[] = options?.leadIds
    ? [inArray(crmLeads.id, options.leadIds)]
    : [
        sql`${crmLeads.contactAddress} IS NOT NULL`,
        sql`${crmLeads.contactAddress} != ''`,
      ];
  if (tenantId) leadConditions.push(eq(crmLeads.tenantId, tenantId));

  const leads = await db.select({
    id: crmLeads.id,
    address: crmLeads.contactAddress,
    suburb: crmLeads.suburb,
    firstName: crmLeads.contactFirstName,
    lastName: crmLeads.contactLastName,
    status: crmLeads.status,
  })
    .from(crmLeads)
    .where(and(...leadConditions));

  for (const lead of leads) {
    try {
      if (!lead.address) { skipped++; continue; }

      // Check if we already have matches for this lead (skip unless forceRefresh)
      if (!options?.forceRefresh) {
        const existing = await db.select({ id: clientDas.id })
          .from(clientDas)
          .where(and(
            eq(clientDas.leadId, lead.id),
            tenantId ? eq(clientDas.tenantId, tenantId) : sql`1=1`,
          ))
          .limit(1);
        if (existing.length > 0) { skipped++; continue; }
      }

      // Search by address
      const daResults = await searchDasByAddress(lead.address, lead.suburb || undefined);

      if (daResults.length === 0) { skipped++; continue; }

      for (const da of daResults) {
        const companyLower = (da.companyOrgName || "").toLowerCase();
        // Determine isOurs:
        // - Always ours if company matches Spanline
        // - Conditionally ours (Simple Site Plans) only if the lead is converted
        const isAlwaysOurs = alwaysOursNames.some(name => companyLower.includes(name) || name.includes(companyLower));
        const isConditionalOurs = conditionalOursNames.some(name => companyLower.includes(name) || name.includes(companyLower));
        const leadConverted = CONVERTED_STATUSES.includes(lead.status);
        const computedIsOurs = isAlwaysOurs || (isConditionalOurs && leadConverted);

        // Determine match type and confidence
        let matchType: "address" | "name" | "both" = "address";
        let matchConfidence: "high" | "medium" | "low" = "medium";

        // Check name match
        const leadName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim().toLowerCase();
        const daApplicant = (da.applicantName || "").toLowerCase();
        const nameMatches = leadName.length > 2 && daApplicant.length > 2 &&
          (daApplicant.includes(leadName) || leadName.includes(daApplicant) ||
           fuzzyNameMatch(leadName, daApplicant));

        if (nameMatches) {
          matchType = "both";
          matchConfidence = "high";
        } else {
          // Address-only match: check suburb matches exactly
          const suburbMatch = lead.suburb?.toUpperCase() === da.suburb?.toUpperCase();
          matchConfidence = suburbMatch ? "medium" : "low";
        }

        // Upsert into client_das
        const existingMatch = await db.select({
          id: clientDas.id,
          isOurs: clientDas.isOurs,
          matchType: clientDas.matchType,
        })
          .from(clientDas)
          .where(and(
            eq(clientDas.leadId, lead.id),
            eq(clientDas.daNumber, da.daNumber),
            tenantId ? eq(clientDas.tenantId, tenantId) : sql`1=1`,
          ))
          .limit(1);

        if (existingMatch.length === 0) {
          await db.insert(clientDas).values({
            tenantId,
            leadId: lead.id,
            daNumber: da.daNumber,
            companyName: da.companyOrgName,
            applicantName: da.applicantName,
            proposalText: da.proposalText,
            streetAddress: da.streetAddress,
            suburb: da.suburb,
            lodgementDate: da.lodgementDate ? new Date(da.lodgementDate) : null,
            daStage: da.daStage,
            decision: da.decision,
            decisionDate: da.decisionDate ? new Date(da.decisionDate) : null,
            isOurs: computedIsOurs,
            matchType,
            matchConfidence,
            centroidLat: da.centroidLat,
            centroidLng: da.centroidLng,
          });
          matched++;

          // Track new competitor matches for notification
          if (!computedIsOurs) {
            newCompetitorMatches.push({
              leadId: lead.id,
              leadName: `${lead.firstName || ""} ${lead.lastName || ""}`.trim(),
              address: lead.address || da.streetAddress || "",
              suburb: da.suburb,
              daNumber: da.daNumber,
              companyName: da.companyOrgName || "Unknown",
              proposalText: da.proposalText,
            });
          }
        } else {
          const hasManualOwnership = existingMatch[0].matchType === "manual";
          // Update existing
          await db.update(clientDas)
            .set({
              companyName: da.companyOrgName,
              applicantName: da.applicantName,
              proposalText: da.proposalText,
              daStage: da.daStage,
              decision: da.decision,
              decisionDate: da.decisionDate ? new Date(da.decisionDate) : null,
              isOurs: hasManualOwnership ? existingMatch[0].isOurs : computedIsOurs,
              matchType: hasManualOwnership ? "manual" : matchType,
              matchConfidence,
              updatedAt: new Date(),
            })
            .where(and(
              eq(clientDas.id, existingMatch[0].id),
              tenantId ? eq(clientDas.tenantId, tenantId) : sql`1=1`,
            ));
          matched++;
        }
      }
    } catch (err: any) {
      errors.push(`Lead ${lead.id}: ${err.message}`);
    }
  }

  // Also match quotes with addresses
  const quoteConditions: any[] = [
    sql`${quotes.siteAddress} IS NOT NULL`,
    sql`${quotes.siteAddress} != ''`,
  ];
  if (tenantId) quoteConditions.push(eq(quotes.tenantId, tenantId));

  const quotesWithAddress = await db.select({
    id: quotes.id,
    siteAddress: quotes.siteAddress,
    suburb: quotes.suburb,
    clientName: quotes.clientName,
    status: quotes.status,
  })
    .from(quotes)
    .where(and(...quoteConditions));

  for (const quote of quotesWithAddress) {
    try {
      if (!quote.siteAddress) { skipped++; continue; }

      if (!options?.forceRefresh) {
        const existing = await db.select({ id: clientDas.id })
          .from(clientDas)
          .where(and(
            eq(clientDas.quoteId, quote.id),
            tenantId ? eq(clientDas.tenantId, tenantId) : sql`1=1`,
          ))
          .limit(1);
        if (existing.length > 0) { skipped++; continue; }
      }

      const daResults = await searchDasByAddress(quote.siteAddress, quote.suburb || undefined);
      if (daResults.length === 0) { skipped++; continue; }

      for (const da of daResults) {
        const companyLower = (da.companyOrgName || "").toLowerCase();
        // Same isOurs logic: always ours for Spanline, conditional for Simple Site Plans
        const isAlwaysOursQ = alwaysOursNames.some(name => companyLower.includes(name) || name.includes(companyLower));
        const isConditionalOursQ = conditionalOursNames.some(name => companyLower.includes(name) || name.includes(companyLower));
        const quoteConverted = quote.status === "accepted";
        const isOurs = isAlwaysOursQ || (isConditionalOursQ && quoteConverted);

        let matchType: "address" | "name" | "both" = "address";
        let matchConfidence: "high" | "medium" | "low" = "medium";

        // Check name match against client name
        const clientNameLower = (quote.clientName || "").toLowerCase();
        const daApplicant = (da.applicantName || "").toLowerCase();
        const nameMatches = clientNameLower.length > 2 && daApplicant.length > 2 &&
          (daApplicant.includes(clientNameLower) || clientNameLower.includes(daApplicant) ||
           fuzzyNameMatch(clientNameLower, daApplicant));

        if (nameMatches) {
          matchType = "both";
          matchConfidence = "high";
        } else {
          const suburbMatch = quote.suburb?.toUpperCase() === da.suburb?.toUpperCase();
          matchConfidence = suburbMatch ? "medium" : "low";
        }

        const existingMatch = await db.select({ id: clientDas.id })
          .from(clientDas)
          .where(and(
            eq(clientDas.quoteId, quote.id),
            eq(clientDas.daNumber, da.daNumber),
            tenantId ? eq(clientDas.tenantId, tenantId) : sql`1=1`,
          ))
          .limit(1);

        if (existingMatch.length === 0) {
          await db.insert(clientDas).values({
            tenantId,
            quoteId: quote.id,
            daNumber: da.daNumber,
            companyName: da.companyOrgName,
            applicantName: da.applicantName,
            proposalText: da.proposalText,
            streetAddress: da.streetAddress,
            suburb: da.suburb,
            lodgementDate: da.lodgementDate ? new Date(da.lodgementDate) : null,
            daStage: da.daStage,
            decision: da.decision,
            decisionDate: da.decisionDate ? new Date(da.decisionDate) : null,
            isOurs,
            matchType,
            matchConfidence,
            centroidLat: da.centroidLat,
            centroidLng: da.centroidLng,
          });
          matched++;

          // Track new competitor matches from quotes for notification
          if (!isOurs) {
            newCompetitorMatches.push({
              leadId: quote.id, // using quote id
              leadName: quote.clientName || `Quote #${quote.id}`,
              address: quote.siteAddress || da.streetAddress || "",
              suburb: da.suburb,
              daNumber: da.daNumber,
              companyName: da.companyOrgName || "Unknown",
              proposalText: da.proposalText,
            });
          }
        }
      }
    } catch (err: any) {
      errors.push(`Quote ${quote.id}: ${err.message}`);
    }
  }

  return { matched, skipped, errors, newCompetitorMatches };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function queryDaFinder(where: string, limit: number): Promise<DaFinderRecord[]> {
  const allRecords: DaFinderRecord[] = [];
  let offset = 0;
  const pageSize = Math.min(limit, PAGE_SIZE);

  while (allRecords.length < limit) {
    const params = new URLSearchParams({
      where,
      outFields: "DA_NUMBER,APPLICATION_TYPE,AMENDMENT_VERSION,LODGEMENT_DATE,SUBURB,BLOCK,SECTION,STREET_ADDRESS,PROPOSAL_TEXT,COMPANYORG_NAME,APPLICANT_NAME,BLOCK_KEY,DISTRICT,DECISION,DECISION_DATE,DA_STAGE,CENTROID_LAT,CENTROID_LONG",
      returnGeometry: "false",
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
      orderByFields: "LODGEMENT_DATE DESC",
      f: "json",
    });

    const url = `${DAFINDER_LIST_URL}/query?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`ArcGIS API error: ${resp.status}`);
    const data = await resp.json();

    if (data.error) throw new Error(`ArcGIS query error: ${data.error.message}`);

    const features = data.features || [];
    for (const feat of features) {
      const a = feat.attributes;
      allRecords.push({
        daNumber: String(a.DA_NUMBER || ""),
        applicationType: a.APPLICATION_TYPE || "",
        amendmentVersion: a.AMENDMENT_VERSION || null,
        lodgementDate: a.LODGEMENT_DATE || null,
        suburb: a.SUBURB || null,
        block: a.BLOCK || null,
        section: a.SECTION || null,
        streetAddress: a.STREET_ADDRESS || null,
        proposalText: a.PROPOSAL_TEXT || null,
        companyOrgName: a.COMPANYORG_NAME || null,
        applicantName: a.APPLICANT_NAME || null,
        blockKey: a.BLOCK_KEY || null,
        district: a.DISTRICT || null,
        decision: a.DECISION || null,
        decisionDate: a.DECISION_DATE || null,
        daStage: a.DA_STAGE || null,
        centroidLat: a.CENTROID_LAT || null,
        centroidLng: a.CENTROID_LONG || null,
      });
    }

    if (features.length < pageSize) break;
    offset += pageSize;
  }

  return allRecords.slice(0, limit);
}

/**
 * Normalise an address for search:
 * Extract the street number and street name, uppercase, trim.
 * e.g. "42 Phippard Court, Kaleen ACT 2617" → "42 PHIPPARD"
 */
function normaliseAddress(address: string): string | null {
  if (!address) return null;
  // Remove unit/lot prefixes FIRST (before comma stripping), then postcodes, state
  const cleaned = normalizeApiAddress(address)
    .replace(/\b(unit|lot|suite|apt|apartment)\s*\d*\s*,?\s*/gi, "") // remove unit prefix + trailing comma
    .replace(/,.*$/, "") // remove everything after first comma
    .replace(/\b(ACT|NSW|VIC|QLD|SA|WA|TAS|NT)\b/gi, "")
    .replace(/\b\d{4}\b/g, "") // remove postcodes
    .trim()
    .toUpperCase();

  // Try to extract "NUMBER STREET_NAME" pattern
  const match = cleaned.match(/^(\d+[A-Z]?)\s+(.+?)(\s+(STREET|ST|ROAD|RD|AVENUE|AVE|DRIVE|DR|COURT|CT|CRESCENT|CRES|PLACE|PL|CIRCUIT|CCT|TERRACE|TCE|WAY|LANE|LN|CLOSE|CL|PARADE|PDE|BOULEVARD|BLVD|GROVE|GR))?$/i);
  if (match) {
    // Return number + first word of street name for broader matching
    const streetWords = match[2].split(/\s+/);
    return `${match[1]} ${streetWords[0]}`;
  }

  // Fallback: return first meaningful part
  const words = cleaned.split(/\s+/).filter(w => w.length > 1);
  if (words.length >= 2) {
    return `${words[0]} ${words[1]}`;
  }

  return null;
}

/**
 * Simple fuzzy name matching using Levenshtein-like approach.
 * Returns true if names are similar enough (>70% match).
 */
function fuzzyNameMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;

  // Split into parts and check if any surname part matches
  const parts1 = name1.toLowerCase().split(/\s+/);
  const parts2 = name2.toLowerCase().split(/\s+/);

  for (const p1 of parts1) {
    if (p1.length < 3) continue;
    for (const p2 of parts2) {
      if (p2.length < 3) continue;
      if (p1 === p2) return true;
      // Check if one contains the other
      if (p1.includes(p2) || p2.includes(p1)) return true;
      // Levenshtein distance <= 1 for short names
      if (p1.length >= 4 && p2.length >= 4 && levenshtein(p1, p2) <= 1) return true;
    }
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function escapeArcGIS(str: string): string {
  // Escape single quotes for ArcGIS SQL
  return str.replace(/'/g, "''");
}
