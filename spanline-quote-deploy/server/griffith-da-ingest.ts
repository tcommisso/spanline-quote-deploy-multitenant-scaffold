/**
 * Griffith DA Ingest Endpoint
 * 
 * Push/webhook approach: Your local VPN machine scrapes Griffith City Council's
 * DA tracker and POSTs the parsed DA data to this authenticated endpoint.
 * 
 * Authentication: Bearer token using ZAPIER_API_KEY (same key used for other integrations)
 * 
 * Endpoint: POST /api/v1/griffith-da-ingest
 * 
 * Expected payload:
 * {
 *   "das": [
 *     {
 *       "daNumber": "DA-2024/0123",
 *       "lodgementDate": "2024-03-15",  // ISO date string
 *       "description": "Construction of a patio",
 *       "applicationType": "Development Application",
 *       "category": "Residential",
 *       "address": "123 Main Street GRIFFITH NSW 2680",
 *       "applicantName": "Stratco Pty Ltd"
 *     }
 *   ]
 * }
 */
import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import * as dbHelpers from "./db";
import { nswDaApplications, daCompetitorWatchlist } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Auth Middleware ───────────────────────────────────────────────────────────

async function authenticateIngest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7);

  // Check static API key (ZAPIER_API_KEY)
  if (ENV.zapierApiKey && token === ENV.zapierApiKey) {
    next();
    return;
  }

  // Fall back to OAuth2 JWT verification
  try {
    const session = await sdk.verifySession(token);
    if (!session) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Authentication failed" });
  }
}

// ─── Category Classification ──────────────────────────────────────────────────

function categoriseDescription(description: string | null): { isRelevant: boolean; category: string | null } {
  if (!description) return { isRelevant: false, category: null };
  const lower = description.toLowerCase();

  const keywords = [
    "patio", "pergola", "carport", "verandah", "deck", "awning",
    "shade", "outbuilding", "shed", "garage",
    "sunroom", "screen room", "screened", "enclosure", "enclosed patio",
  ];

  const isRelevant = keywords.some(kw => lower.includes(kw));
  if (!isRelevant) return { isRelevant: false, category: null };

  if (lower.includes("sunroom") || lower.includes("screen room") || lower.includes("screened") || lower.includes("enclosure") || lower.includes("enclosed patio")) return { isRelevant: true, category: "sunroom" };
  if (lower.includes("patio") || lower.includes("verandah")) return { isRelevant: true, category: "patio" };
  if (lower.includes("pergola") || lower.includes("shade") || lower.includes("awning")) return { isRelevant: true, category: "pergola" };
  if (lower.includes("carport") || lower.includes("garage")) return { isRelevant: true, category: "carport" };
  if (lower.includes("deck")) return { isRelevant: true, category: "deck" };
  if (lower.includes("outbuilding") || lower.includes("shed")) return { isRelevant: true, category: "outbuilding" };

  return { isRelevant: true, category: null };
}

// ─── Address Parsing ──────────────────────────────────────────────────────────

function extractSuburb(address: string | null): string | null {
  if (!address) return null;
  const match = address.match(/([A-Z][A-Z\s]+?)\s+NSW\s+\d{4}\s*$/i);
  if (match) {
    const suburb = match[1].trim();
    return suburb.charAt(0).toUpperCase() + suburb.slice(1).toLowerCase();
  }
  return null;
}

function extractPostcode(address: string | null): string | null {
  if (!address) return null;
  const match = address.match(/(\d{4})\s*$/);
  return match ? match[1] : null;
}

// ─── Competitor Matching ──────────────────────────────────────────────────────

async function matchCompetitor(applicantName: string | null): Promise<{ id: number; name: string } | null> {
  if (!applicantName) return null;

  const db = await getDb();
  if (!db) return null;

  const watchlist = await db.select()
    .from(daCompetitorWatchlist)
    .where(eq(daCompetitorWatchlist.active, true));

  const lowerApplicant = applicantName.toLowerCase();

  for (const competitor of watchlist) {
    const lowerCompetitor = competitor.companyName.toLowerCase();
    if (lowerApplicant.includes(lowerCompetitor) || lowerCompetitor.includes(lowerApplicant)) {
      return { id: competitor.id, name: competitor.companyName };
    }
    const competitorWords = lowerCompetitor.split(/\s+/).filter(w => w.length > 3);
    for (const word of competitorWords) {
      if (lowerApplicant.includes(word) && !["pty", "ltd", "the", "and"].includes(word)) {
        return { id: competitor.id, name: competitor.companyName };
      }
    }
  }

  return null;
}

// ─── Ingest Handler ───────────────────────────────────────────────────────────

interface IngestDa {
  daNumber: string;
  lodgementDate?: string | null;
  description?: string | null;
  applicationType?: string | null;
  category?: string | null;
  address?: string | null;
  applicantName?: string | null;
}

async function handleIngest(req: Request, res: Response) {
  const { das } = req.body as { das: IngestDa[] };

  if (!das || !Array.isArray(das) || das.length === 0) {
    res.status(400).json({ error: "Request body must contain a non-empty 'das' array" });
    return;
  }

  const db = await getDb();
  if (!db) {
    res.status(500).json({ error: "Database not available" });
    return;
  }

  const councilName = "Griffith City Council";
  let newRecords = 0;
  let updatedRecords = 0;
  let competitorMatches = 0;
  const errors: string[] = [];

  for (const da of das) {
    try {
      if (!da.daNumber) {
        errors.push("Missing daNumber in record");
        continue;
      }

      // Check if exists
      const [existing] = await db.select({
        id: nswDaApplications.id,
        applicantName: nswDaApplications.applicantName,
      })
        .from(nswDaApplications)
        .where(and(
          eq(nswDaApplications.portalAppNumber, da.daNumber),
          eq(nswDaApplications.councilName, councilName),
        ))
        .limit(1);

      // Classify
      const fullDesc = (da.description || "") + " " + (da.category || "");
      const { isRelevant, category: relevantCategory } = categoriseDescription(fullDesc);
      const competitorMatch = await matchCompetitor(da.applicantName || null);
      const isCompetitor = !!competitorMatch;
      if (isCompetitor) competitorMatches++;

      // Parse date
      let lodgementDate: Date | null = null;
      if (da.lodgementDate) {
        const d = new Date(da.lodgementDate);
        if (!isNaN(d.getTime())) lodgementDate = d;
      }

      const suburb = extractSuburb(da.address || null);
      const postcode = extractPostcode(da.address || null);

      if (existing) {
        // Update if we have new applicant info
        if (!existing.applicantName && da.applicantName) {
          await db.update(nswDaApplications)
            .set({
              applicantName: da.applicantName,
              applicantSource: "griffith-ingest",
              description: da.description || null,
              isCompetitor,
              matchedCompetitorId: competitorMatch?.id || null,
              lastSeenAt: new Date(),
            })
            .where(eq(nswDaApplications.id, existing.id));
          updatedRecords++;
        } else {
          // Just update lastSeenAt
          await db.update(nswDaApplications)
            .set({ lastSeenAt: new Date() })
            .where(eq(nswDaApplications.id, existing.id));
        }
      } else {
        // Insert new
        await db.insert(nswDaApplications).values({
          portalAppNumber: da.daNumber,
          councilName,
          applicationStatus: "Submitted",
          applicationType: da.applicationType || null,
          developmentType: da.category || null,
          fullAddress: da.address || null,
          suburb,
          postcode,
          lodgementDate,
          isRelevant,
          relevantCategory,
          applicantName: da.applicantName || null,
          applicantSource: da.applicantName ? "griffith-ingest" : null,
          description: da.description || null,
          isCompetitor,
          matchedCompetitorId: competitorMatch?.id || null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          lastHash: "",
        });
        newRecords++;
      }
    } catch (err: any) {
      errors.push(`DA ${da.daNumber}: ${err.message}`);
    }
  }

  console.log(`[GriffithIngest] Processed ${das.length} DAs: ${newRecords} new, ${updatedRecords} updated, ${competitorMatches} competitor matches`);

  res.json({
    success: true,
    council: councilName,
    totalReceived: das.length,
    newRecords,
    updatedRecords,
    competitorMatches,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerGriffithDaIngest(app: Express) {
  app.post(
    "/api/v1/griffith-da-ingest",
    authenticateIngest,
    handleIngest,
  );
  console.log("[GriffithIngest] Registered POST /api/v1/griffith-da-ingest");
}
