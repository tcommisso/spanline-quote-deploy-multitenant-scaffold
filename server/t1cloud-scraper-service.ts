/**
 * T1Cloud eProperty Scraper Service
 * Scrapes DA search results from T1Cloud-based council portals (QPRC, Wagga Wagga)
 * to extract applicant/builder names that are not available via the NSW Planning Portal API.
 *
 * Key insight: Applicant names are available directly in the search results table
 * (no need to scrape individual detail pages). Simple HTTP GET + HTML parsing.
 */
import * as cheerio from "cheerio";
import { getDb } from "./db";
import { nswDaApplications, daCompetitorWatchlist } from "../drizzle/schema";
import { eq, and, like, sql, isNull } from "drizzle-orm";
import { getTenantPlanningConfig } from "./tenant-integrations";

// ─── Configuration ───────────────────────────────────────────────────────────
const DA_TRACKER_DEFAULT_START_DATE = new Date("2022-09-01T00:00:00.000Z");

interface T1CloudCouncilConfig {
  name: string;
  baseUrl: string;
  searchResultsPath: string;
  /** Query params for the search results page */
  params: Record<string, string>;
  /** Source identifier stored in DB */
  source: string;
}

/**
 * T1Cloud council configurations.
 * Each council uses the same T1Cloud eProperty platform but with different
 * subdomain and URL parameter prefixes.
 */
export const T1CLOUD_COUNCILS: T1CloudCouncilConfig[] = [
  {
    name: "Queanbeyan-Palerang Regional Council",
    baseUrl: "https://qprc-web.t1cloud.com",
    searchResultsPath: "/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx",
    params: {
      r: "P1.WEBGUEST",
      f: "$P1.ETR.SEARCH.SL28",
      Field: "S",
      Period: "L28",
    },
    source: "t1cloud_qprc",
  },
  {
    name: "Wagga Wagga City Council",
    baseUrl: "https://wagga-web.t1cloud.com",
    searchResultsPath: "/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx",
    params: {
      r: "WW.P1.WEBGUEST",
      f: "$P1.ETR.SEARCH.SL28",
      Field: "S",
      Period: "L28",
    },
    source: "t1cloud_wagga",
  },
  {
    name: "Hilltops Council",
    baseUrl: "https://hilltops-web.t1cloud.com",
    searchResultsPath: "/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx",
    params: {
      r: "P1.WEBGUEST",
      f: "$P1.ETR.SEARCH.SL28",
      Field: "S",
      Period: "L28",
    },
    source: "t1cloud_hilltops",
  },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScrapedDa {
  daNumber: string;
  lodgementDate: string | null;
  description: string | null;
  applicationType: string | null;
  category: string | null;
  address: string | null;
  applicantName: string | null;
}

export interface ScrapeResult {
  council: string;
  source: string;
  totalScraped: number;
  newRecords: number;
  updatedRecords: number;
  competitorMatches: number;
  errors: string[];
}

// ─── Scraper ────────────────────────────────────────────────────────────────

/**
 * Scrape a T1Cloud council's "Submitted Last 28 Days" page.
 * Returns parsed DA records with applicant names.
 */
async function scrapeCouncilDas(config: T1CloudCouncilConfig): Promise<ScrapedDa[]> {
  const url = new URL(config.searchResultsPath, config.baseUrl);
  for (const [key, value] of Object.entries(config.params)) {
    url.searchParams.set(key, value);
  }

  console.log(`[T1CloudScraper] Fetching ${config.name}: ${url.toString()}`);

  const resp = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SpanlineBot/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${config.name}: ${resp.statusText}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  const results: ScrapedDa[] = [];

  // Find the grid table with DA results
  const table = $("table.grid");
  if (!table.length) {
    console.log(`[T1CloudScraper] No grid table found for ${config.name}`);
    return [];
  }

  const rows = table.find("tr");
  if (rows.length <= 1) {
    console.log(`[T1CloudScraper] No data rows for ${config.name}`);
    return [];
  }

  // Parse header to determine column positions
  const headerCells = rows.first().find("th, td");
  const headers: string[] = [];
  headerCells.each((_, el) => {
    headers.push($(el).text().trim().toLowerCase());
  });

  // Map column names to indices
  const colMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    if ((h.includes("application") && h.includes("link")) || (h.includes("application") && h.includes("id"))) colMap.daNumber = i;
    else if (h.includes("lodgement") && h.includes("date")) colMap.lodgementDate = i;
    else if (h === "description") colMap.description = i;
    else if (h.includes("application") && h.includes("type")) colMap.applicationType = i;
    else if (h === "group" || (h.includes("group") && h.includes("description"))) colMap.groupDescription = i;
    else if (h.includes("category")) colMap.category = i;
    else if (h.includes("address") || h.includes("formatted")) colMap.address = i;
    else if (h.includes("applicant")) colMap.applicantName = i;
    else if (h.includes("date determined") || h.includes("determined")) colMap.dateDetermined = i;
  });

  // Parse data rows
  rows.slice(1).each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length === 0) return;

    const getText = (colKey: string): string | null => {
      const idx = colMap[colKey];
      if (idx === undefined) return null;
      const text = $(cells[idx]).text().trim();
      return text || null;
    };

    const daNumber = getText("daNumber");
    if (!daNumber) return;

    results.push({
      daNumber,
      lodgementDate: getText("lodgementDate"),
      description: getText("description"),
      applicationType: getText("applicationType") || getText("groupDescription"),
      category: getText("category"),
      address: getText("address"),
      applicantName: getText("applicantName"),
    });
  });

  console.log(`[T1CloudScraper] Scraped ${results.length} DAs from ${config.name}`);
  return results;
}

// ─── Address Parsing ────────────────────────────────────────────────────────

/**
 * Extract suburb from T1Cloud address format.
 * Format: "123 STREET NAME SUBURB NSW POSTCODE"
 * e.g. "22 Trenerry Crescent GOOGONG NSW 2620" → "Googong"
 */
function extractSuburbFromT1Address(address: string | null): string | null {
  if (!address) return null;
  // Pattern: ... SUBURB NSW POSTCODE
  const match = address.match(/([A-Z][A-Z\s]+?)\s+NSW\s+\d{4}\s*$/i);
  if (match) {
    const suburb = match[1].trim();
    return suburb.charAt(0).toUpperCase() + suburb.slice(1).toLowerCase();
  }
  return null;
}

function extractPostcodeFromT1Address(address: string | null): string | null {
  if (!address) return null;
  const match = address.match(/(\d{4})\s*$/);
  return match ? match[1] : null;
}

// ─── Competitor Matching ────────────────────────────────────────────────────

/**
 * Check if an applicant name matches any competitor in the watchlist.
 * Returns the matched competitor ID or null.
 */
async function matchCompetitor(applicantName: string | null, tenantId?: number | null): Promise<{ id: number; name: string } | null> {
  if (!applicantName) return null;

  const db = await getDb();
  if (!db) return null;

  const conditions: any[] = [eq(daCompetitorWatchlist.active, true)];
  if (tenantId) conditions.push(eq(daCompetitorWatchlist.tenantId, tenantId));

  const watchlist = await db.select()
    .from(daCompetitorWatchlist)
    .where(and(...conditions));

  const lowerApplicant = applicantName.toLowerCase();

  for (const competitor of watchlist) {
    const lowerCompetitor = competitor.companyName.toLowerCase();
    // Check if the applicant name contains the competitor name or vice versa
    if (lowerApplicant.includes(lowerCompetitor) || lowerCompetitor.includes(lowerApplicant)) {
      return { id: competitor.id, name: competitor.companyName };
    }
    // Also check partial word matches (e.g., "Stratco" in "Stratco Pty Ltd")
    const competitorWords = lowerCompetitor.split(/\s+/).filter(w => w.length > 3);
    for (const word of competitorWords) {
      if (lowerApplicant.includes(word) && !["pty", "ltd", "the", "and"].includes(word)) {
        return { id: competitor.id, name: competitor.companyName };
      }
    }
  }

  return null;
}

// ─── Main Scrape & Store Function ───────────────────────────────────────────

/**
 * Scrape all configured T1Cloud councils and store results.
 * Matches applicant names against competitor watchlist.
 */
export async function scrapeAndStoreT1CloudDas(options?: {
  councils?: string[];
  tenantId?: number | null;
}): Promise<{
  results: ScrapeResult[];
  totalNew: number;
  totalUpdated: number;
  totalCompetitorMatches: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tenantId = options?.tenantId ?? null;
  const planningConfig = await getTenantPlanningConfig(tenantId);
  const configuredCouncils = planningConfig.t1cloudCouncils?.filter(Boolean) ?? [];
  const councilNames = options?.councils?.length
    ? options.councils
    : configuredCouncils.length > 0
      ? configuredCouncils
      : undefined;

  const targetConfigs = councilNames
    ? T1CLOUD_COUNCILS.filter(c => councilNames.includes(c.name))
    : T1CLOUD_COUNCILS;

  const results: ScrapeResult[] = [];
  let totalNew = 0;
  let totalUpdated = 0;
  let totalCompetitorMatches = 0;

  for (const config of targetConfigs) {
    const result: ScrapeResult = {
      council: config.name,
      source: config.source,
      totalScraped: 0,
      newRecords: 0,
      updatedRecords: 0,
      competitorMatches: 0,
      errors: [],
    };

    try {
      const scrapedDas = await scrapeCouncilDas(config);
      result.totalScraped = scrapedDas.length;

      for (const da of scrapedDas) {
        try {
          // Normalise the DA number for matching
          const normalisedDaNumber = da.daNumber.replace(/\./g, "/");
          if (!normalisedDaNumber || normalisedDaNumber.trim().length <= 3) {
            continue;
          }

          // Check if this DA already exists (by DA number + council)
          const [existing] = await db.select({
            id: nswDaApplications.id,
            applicantName: nswDaApplications.applicantName,
          })
            .from(nswDaApplications)
            .where(and(
              eq(nswDaApplications.portalAppNumber, normalisedDaNumber),
              eq(nswDaApplications.councilName, config.name),
              tenantId ? eq(nswDaApplications.tenantId, tenantId) : isNull(nswDaApplications.tenantId),
            ))
            .limit(1);

          // Check competitor match
          const competitorMatch = await matchCompetitor(da.applicantName, tenantId);
          const isCompetitor = !!competitorMatch;
          if (isCompetitor) result.competitorMatches++;

          // Parse lodgement date (format: DD/MM/YYYY)
          let lodgementDate: Date | null = null;
          if (da.lodgementDate) {
            const parts = da.lodgementDate.split("/");
            if (parts.length === 3) {
              lodgementDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            }
          }
          if (!lodgementDate || lodgementDate < DA_TRACKER_DEFAULT_START_DATE) {
            continue;
          }

          const suburb = extractSuburbFromT1Address(da.address);
          const postcode = extractPostcodeFromT1Address(da.address);

          // Determine relevance from description/category
          const descLower = (da.description || "").toLowerCase() + " " + (da.category || "").toLowerCase();
          const isRelevant = [
            "patio", "pergola", "carport", "verandah", "deck", "awning",
            "shade", "outbuilding", "shed", "garage",
            "sunroom", "screen room", "screened", "enclosure", "enclosed patio",
          ].some(kw => descLower.includes(kw));

          let relevantCategory: string | null = null;
          if (isRelevant) {
            if (descLower.includes("sunroom") || descLower.includes("screen room") || descLower.includes("screened") || descLower.includes("enclosure") || descLower.includes("enclosed patio")) relevantCategory = "sunroom";
            else if (descLower.includes("patio") || descLower.includes("verandah")) relevantCategory = "patio";
            else if (descLower.includes("pergola") || descLower.includes("shade") || descLower.includes("awning")) relevantCategory = "pergola";
            else if (descLower.includes("carport") || descLower.includes("garage")) relevantCategory = "carport";
            else if (descLower.includes("deck")) relevantCategory = "deck";
            else if (descLower.includes("outbuilding") || descLower.includes("shed")) relevantCategory = "outbuilding";
          }

          if (existing) {
            // Update with applicant info if we didn't have it before
            if (!existing.applicantName && da.applicantName) {
              await db.update(nswDaApplications)
                .set({
                  applicantName: da.applicantName,
                  applicantSource: config.source,
                  description: da.description,
                  isCompetitor,
                  matchedCompetitorId: competitorMatch?.id || null,
                  lastSeenAt: new Date(),
                })
                .where(and(
                  eq(nswDaApplications.id, existing.id),
                  tenantId ? eq(nswDaApplications.tenantId, tenantId) : isNull(nswDaApplications.tenantId),
                ));
              result.updatedRecords++;
            }
          } else {
            // Insert new record
            await db.insert(nswDaApplications).values({
              tenantId,
              portalAppNumber: normalisedDaNumber,
              councilName: config.name,
              applicationStatus: "Submitted",
              applicationType: da.applicationType || null,
              developmentType: da.category || null,
              fullAddress: da.address || null,
              suburb,
              postcode,
              lodgementDate,
              isRelevant,
              relevantCategory,
              applicantName: da.applicantName,
              applicantSource: config.source,
              description: da.description,
              isCompetitor,
              matchedCompetitorId: competitorMatch?.id || null,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              lastHash: "",
            });
            result.newRecords++;
          }
        } catch (err: any) {
          result.errors.push(`DA ${da.daNumber}: ${err.message}`);
        }
      }

      results.push(result);
      totalNew += result.newRecords;
      totalUpdated += result.updatedRecords;
      totalCompetitorMatches += result.competitorMatches;

    } catch (err: any) {
      result.errors.push(err.message);
      results.push(result);
    }
  }

  return { results, totalNew, totalUpdated, totalCompetitorMatches };
}

/**
 * Re-run competitor matching on all NSW DAs that have applicant names
 * but haven't been matched yet. Useful after adding new competitors to watchlist.
 */
export async function reMatchCompetitors(tenantId?: number | null): Promise<{ matched: number; total: number }> {
  const db = await getDb();
  if (!db) return { matched: 0, total: 0 };

  // Get all DAs with applicant names
  const conditions: any[] = [
    sql`${nswDaApplications.applicantName} IS NOT NULL`,
    eq(nswDaApplications.isOurs, false),
  ];
  if (tenantId) conditions.push(eq(nswDaApplications.tenantId, tenantId));

  const das = await db.select({
    id: nswDaApplications.id,
    applicantName: nswDaApplications.applicantName,
  })
    .from(nswDaApplications)
    .where(and(...conditions));

  let matched = 0;
  for (const da of das) {
    const competitorMatch = await matchCompetitor(da.applicantName, tenantId);
    const isCompetitor = !!competitorMatch;

    await db.update(nswDaApplications)
      .set({
        isCompetitor,
        matchedCompetitorId: competitorMatch?.id || null,
      })
      .where(and(
        eq(nswDaApplications.id, da.id),
        tenantId ? eq(nswDaApplications.tenantId, tenantId) : isNull(nswDaApplications.tenantId),
      ));

    if (isCompetitor) matched++;
  }

  return { matched, total: das.length };
}
