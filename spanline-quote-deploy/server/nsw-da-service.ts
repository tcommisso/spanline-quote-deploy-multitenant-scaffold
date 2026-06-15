/**
 * NSW DA Service
 * Polls the NSW Planning Portal DAApplicationTracker API for development applications
 * across specified councils, filters for outdoor-living-relevant development types,
 * and stores results in nsw_da_applications table.
 *
 * API Notes:
 * - The v0 endpoint returns all "On Exhibition" DAs across NSW (no server-side council filter)
 * - We fetch all and filter client-side by COUNCIL_NAME
 * - Properties use UPPER_CASE naming (PLANNING_PORTAL_APP_NUMBER, COUNCIL_NAME, etc.)
 * - No separate Suburb field — extracted from FULL_ADDRESS
 * - Content-Type must be application/json
 */
import { getDb } from "./db";
import { nswDaApplications, nswDaPollLog } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

// ─── Configuration ───────────────────────────────────────────────────────────

const NSW_DA_API_URL = "https://api.apps1.nsw.gov.au/eplanning/data/v0/DAApplicationTracker";

/**
 * Target councils for Spanline/AltaSpan NSW territory
 */
export const NSW_TARGET_COUNCILS = [
  "Queanbeyan-Palerang Regional Council",
  "Yass Valley Council",
  "Wagga Wagga City Council",
  "Griffith City Council",
  "Upper Lachlan Shire Council",
  "Hilltops Council",
] as const;

/**
 * Development types relevant to outdoor living / patio / pergola / carport work.
 * Matched against the TYPE_OF_DEVELOPMENT field (comma-separated values).
 */
const RELEVANT_DEV_TYPE_KEYWORDS = [
  "balconies",
  "decks",
  "patios",
  "terraces",
  "verandahs",
  "garages",
  "carports",
  "car parking",
  "awning",
  "pergola",
  "shade structure",
  "outbuilding",
  "shed",
  "garage",
  "carport",
  "sunroom",
  "screen room",
  "screened",
  "enclosed patio",
  "enclosure",
] as const;

/**
 * Categories for relevant DAs (maps keyword matches to business category)
 */
function categoriseDevType(devType: string): string | null {
  const lower = devType.toLowerCase();
  if (lower.includes("sunroom") || lower.includes("screen room") || lower.includes("screened") || lower.includes("enclosure") || lower.includes("enclosed patio")) return "sunroom";
  if (lower.includes("patio") || lower.includes("verandah") || lower.includes("terrace")) return "patio";
  if (lower.includes("pergola") || lower.includes("shade") || lower.includes("awning")) return "pergola";
  if (lower.includes("carport") || lower.includes("garage") || lower.includes("car parking")) return "carport";
  if (lower.includes("deck") || lower.includes("balcon")) return "deck";
  if (lower.includes("outbuilding") || lower.includes("shed")) return "outbuilding";
  return null;
}

function isRelevantDevType(devType: string | null): boolean {
  if (!devType) return false;
  const lower = devType.toLowerCase();
  return RELEVANT_DEV_TYPE_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Extract suburb from FULL_ADDRESS.
 * Format is typically: "123 STREET NAME SUBURB POSTCODE"
 * e.g. "262 GOULBURN ROAD CROOKWELL 2583" → "CROOKWELL"
 * e.g. "94 ROSSI STREET YASS 2582" → "YASS"
 */
function extractSuburbFromAddress(fullAddress: string | null): string | null {
  if (!fullAddress) return null;
  // Remove postcode (4 digits at end)
  const withoutPostcode = fullAddress.replace(/\s+\d{4}\s*$/, "").trim();
  // The suburb is typically the last word(s) after the street name
  // Common patterns: "NUMBER STREET_NAME SUBURB" or "NUMBER STREET_NAME STREET_TYPE SUBURB"
  const parts = withoutPostcode.split(/\s+/);
  if (parts.length < 3) return null;
  // Take the last word as suburb (works for single-word suburbs)
  // For multi-word suburbs, this is imperfect but covers most cases
  const lastPart = parts[parts.length - 1];
  // If it looks like a street type, take the one before
  const streetTypes = ["STREET", "ROAD", "AVENUE", "DRIVE", "LANE", "PLACE", "COURT", "CRESCENT", "WAY", "CLOSE", "CIRCUIT", "PARADE", "TERRACE", "BOULEVARD"];
  if (streetTypes.includes(lastPart.toUpperCase())) {
    return null; // Can't determine suburb
  }
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).toLowerCase();
}

/**
 * Extract postcode from FULL_ADDRESS
 */
function extractPostcodeFromAddress(fullAddress: string | null): string | null {
  if (!fullAddress) return null;
  const match = fullAddress.match(/(\d{4})\s*$/);
  return match ? match[1] : null;
}

// ─── API Types ───────────────────────────────────────────────────────────────

interface NswDaApiResponse {
  PageSize: number;
  PageNumber: number;
  TotalPages: number;
  TotalCount: number;
  features: NswDaFeature[];
  [key: string]: unknown;
}

interface NswDaFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[];
  } | null;
  properties: {
    PLANNING_PORTAL_APP_NUMBER: string;
    COUNCIL_NAME: string | null;
    STATUS: string | null;
    TYPE_OF_DEVELOPMENT: string | null;
    APPLICATION_TYPE: string | null;
    LODGEMENT_DATE: string | null;
    DETERMINATION_DATE?: string | null;
    FULL_ADDRESS: string | null;
    COST_OF_DEVELOPMENT?: number | null;
    [key: string]: unknown;
  };
}

// ─── API Client ──────────────────────────────────────────────────────────────

/**
 * Fetch all DAs from the NSW Planning Portal.
 * The v0 endpoint returns all "On Exhibition" DAs (no server-side council filter).
 * We fetch all pages and filter client-side by target councils.
 */
async function fetchAllDas(): Promise<NswDaFeature[]> {
  const allFeatures: NswDaFeature[] = [];
  const pageSize = 200; // Max reasonable page size
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const body = JSON.stringify({
      filters: {},
      PageSize: pageSize,
      PageNumber: page,
    });

    console.log(`[NswDaService] Fetching page ${page} (size=${pageSize})...`);

    const resp = await fetch(NSW_DA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`NSW DA API error: ${resp.status} ${resp.statusText} - ${text}`);
    }

    const data: NswDaApiResponse = await resp.json();
    const features = data.features || [];
    allFeatures.push(...features);

    console.log(`[NswDaService] Page ${page}: ${features.length} features (total so far: ${allFeatures.length}/${data.TotalCount})`);

    if (features.length < pageSize || allFeatures.length >= data.TotalCount) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allFeatures;
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

function computeNswDaHash(props: NswDaFeature["properties"]): string {
  const str = JSON.stringify({
    app: props.PLANNING_PORTAL_APP_NUMBER,
    status: props.STATUS,
    devType: props.TYPE_OF_DEVELOPMENT,
    addr: props.FULL_ADDRESS,
    det: props.DETERMINATION_DATE,
  });
  return crypto.createHash("md5").update(str).digest("hex");
}

// ─── Main Poll Function ──────────────────────────────────────────────────────

export interface NswPollResult {
  council: string;
  totalFetched: number;
  newCount: number;
  updatedCount: number;
  relevantCount: number;
  errors: string[];
}

/**
 * Poll all target councils for new/updated DAs.
 * Fetches all On Exhibition DAs from the API, filters by target councils,
 * and upserts into the database.
 */
export async function pollNswDaApplications(options?: {
  councils?: string[];
}): Promise<{
  results: NswPollResult[];
  totalNew: number;
  totalUpdated: number;
  totalRelevant: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const targetCouncils = options?.councils || [...NSW_TARGET_COUNCILS];
  const results: NswPollResult[] = [];
  let totalNew = 0;
  let totalUpdated = 0;
  let totalRelevant = 0;

  // Create a single poll log entry for this run
  const logResult = await db.insert(nswDaPollLog).values({
    councilName: "ALL",
    startedAt: new Date(),
  });
  const logId = (logResult as any)[0].insertId;
  const startTime = Date.now();

  try {
    // Fetch ALL On Exhibition DAs from the API (single call, ~158 records)
    const allFeatures = await fetchAllDas();
    console.log(`[NswDaService] Total features fetched: ${allFeatures.length}`);

    // Filter by target councils
    const targetFeatures = allFeatures.filter(f =>
      f.properties.COUNCIL_NAME &&
      targetCouncils.includes(f.properties.COUNCIL_NAME)
    );
    console.log(`[NswDaService] Features matching target councils: ${targetFeatures.length}`);

    // Group by council for reporting
    const byCouncil = new Map<string, NswDaFeature[]>();
    for (const council of targetCouncils) {
      byCouncil.set(council, []);
    }
    for (const f of targetFeatures) {
      const council = f.properties.COUNCIL_NAME!;
      if (byCouncil.has(council)) {
        byCouncil.get(council)!.push(f);
      }
    }

    // Process each council's features
    for (const [council, features] of Array.from(byCouncil.entries())) {
      let newCount = 0;
      let updatedCount = 0;
      let relevantCount = 0;
      const errors: string[] = [];

      try {
        for (const feature of features) {
          const props = feature.properties;
          const appNumber = props.PLANNING_PORTAL_APP_NUMBER;
          if (!appNumber) continue;

          const hash = computeNswDaHash(props);
          const devType = props.TYPE_OF_DEVELOPMENT || "";
          const relevant = isRelevantDevType(devType);
          const category = relevant ? categoriseDevType(devType) : null;

          // Parse coordinates
          let lat: number | null = null;
          let lng: number | null = null;
          if (feature.geometry?.coordinates) {
            lng = feature.geometry.coordinates[0];
            lat = feature.geometry.coordinates[1];
          }

          // Parse dates
          const lodgementDate = props.LODGEMENT_DATE ? new Date(props.LODGEMENT_DATE) : null;
          const determinationDate = props.DETERMINATION_DATE ? new Date(props.DETERMINATION_DATE) : null;

          // Extract suburb and postcode from address
          const suburb = extractSuburbFromAddress(props.FULL_ADDRESS);
          const postcode = extractPostcodeFromAddress(props.FULL_ADDRESS);

          // Check if exists
          const [existing] = await db.select({ id: nswDaApplications.id, lastHash: nswDaApplications.lastHash })
            .from(nswDaApplications)
            .where(eq(nswDaApplications.portalAppNumber, appNumber))
            .limit(1);

          if (!existing) {
            // New record
            await db.insert(nswDaApplications).values({
              portalAppNumber: appNumber,
              councilName: council,
              applicationStatus: props.STATUS || null,
              applicationType: props.APPLICATION_TYPE || null,
              developmentType: devType || null,
              fullAddress: props.FULL_ADDRESS || null,
              suburb,
              postcode,
              lodgementDate,
              determinationDate,
              centroidLat: lat,
              centroidLng: lng,
              costOfDevelopment: props.COST_OF_DEVELOPMENT?.toString() || null,
              isRelevant: relevant,
              relevantCategory: category,
              lastHash: hash,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
            });
            newCount++;
            if (relevant) relevantCount++;
          } else if (existing.lastHash !== hash) {
            // Updated record
            await db.update(nswDaApplications)
              .set({
                applicationStatus: props.STATUS || null,
                applicationType: props.APPLICATION_TYPE || null,
                developmentType: devType || null,
                fullAddress: props.FULL_ADDRESS || null,
                suburb,
                postcode,
                lodgementDate,
                determinationDate,
                centroidLat: lat,
                centroidLng: lng,
                costOfDevelopment: props.COST_OF_DEVELOPMENT?.toString() || null,
                isRelevant: relevant,
                relevantCategory: category,
                lastHash: hash,
                lastSeenAt: new Date(),
              })
              .where(eq(nswDaApplications.id, existing.id));
            updatedCount++;
            if (relevant) relevantCount++;
          }
        }

        results.push({ council, totalFetched: features.length, newCount, updatedCount, relevantCount, errors });
        totalNew += newCount;
        totalUpdated += updatedCount;
        totalRelevant += relevantCount;

      } catch (err: any) {
        errors.push(err.message);
        results.push({ council, totalFetched: 0, newCount: 0, updatedCount: 0, relevantCount: 0, errors });
      }
    }

    // Update poll log
    await db.update(nswDaPollLog)
      .set({
        completedAt: new Date(),
        totalFetched: targetFeatures.length,
        newApplications: totalNew,
        updatedApplications: totalUpdated,
        relevantCount: totalRelevant,
        durationMs: Date.now() - startTime,
      })
      .where(eq(nswDaPollLog.id, logId));

  } catch (err: any) {
    await db.update(nswDaPollLog)
      .set({
        completedAt: new Date(),
        errorMessage: err.message,
        durationMs: Date.now() - startTime,
      })
      .where(eq(nswDaPollLog.id, logId));
    throw err;
  }

  return { results, totalNew, totalUpdated, totalRelevant };
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Get NSW DA stats by council (for dashboard display)
 */
export async function getNswDaStats() {
  const db = await getDb();
  if (!db) return [];

  const stats = await db.select({
    councilName: nswDaApplications.councilName,
    total: sql<number>`count(*)`,
    relevant: sql<number>`sum(case when ${nswDaApplications.isRelevant} = true then 1 else 0 end)`,
  })
    .from(nswDaApplications)
    .groupBy(nswDaApplications.councilName);

  return stats;
}

/**
 * Get NSW DAs by suburb for market share analysis
 */
export async function getNswDaBySuburb(options?: {
  councilName?: string;
  relevantOnly?: boolean;
  dateFrom?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (options?.councilName) {
    conditions.push(eq(nswDaApplications.councilName, options.councilName));
  }
  if (options?.relevantOnly) {
    conditions.push(eq(nswDaApplications.isRelevant, true));
  }
  if (options?.dateFrom) {
    conditions.push(sql`${nswDaApplications.lodgementDate} >= ${new Date(options.dateFrom)}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select({
    suburb: nswDaApplications.suburb,
    category: nswDaApplications.relevantCategory,
    total: sql<number>`count(*)`,
  })
    .from(nswDaApplications)
    .where(where)
    .groupBy(nswDaApplications.suburb, nswDaApplications.relevantCategory)
    .orderBy(sql`count(*) desc`);
}

/**
 * Get recent relevant NSW DAs (for weekly digest)
 */
export async function getRecentRelevantNswDas(daysSince: number = 7) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);

  return db.select()
    .from(nswDaApplications)
    .where(and(
      eq(nswDaApplications.isRelevant, true),
      sql`${nswDaApplications.firstSeenAt} >= ${since}`
    ))
    .orderBy(sql`${nswDaApplications.councilName}, ${nswDaApplications.lodgementDate} desc`);
}
