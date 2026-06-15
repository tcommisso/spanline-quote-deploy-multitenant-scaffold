import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { isAdminRole } from "@shared/const";
import * as crmDb from "./crm-db";
import { parse } from "csv-parse/sync";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

// Google Sheet tab configurations with their gids and column mappings
const SHEET_ID = "1VzLEc45j8bOjFjwFBOdXUqNc9t3tV59yXPzrzIe5eD8";

interface TabConfig {
  name: string;
  gid: string;
  region: string;
  columnMap: {
    date: number;
    designerEmail?: number;
    designerName?: number;
    name: number;
    email: number;
    phone: number;
    address: number;
    suburb: number;
    product?: number;
    message?: number;
    leadSource?: number;
    referral?: number;
    sourceUrl?: number;
  };
}

const TAB_CONFIGS: TabConfig[] = [
  {
    name: "ACT",
    gid: "1688168432",
    region: "ACT",
    columnMap: {
      date: 0,
      designerEmail: 1,
      name: 5,
      email: 6,
      phone: 7,
      address: 8,
      suburb: 9,
      product: 10,
      message: 11,
      leadSource: 12,
      referral: 13,
      sourceUrl: 14,
    },
  },
  {
    name: "South Coast",
    gid: "1618372894",
    region: "South Coast",
    columnMap: {
      date: 0,
      designerEmail: 1,
      name: 4,
      email: 5,
      phone: 6,
      address: 7,
      suburb: 8,
      product: 9,
      message: 10,
      leadSource: 11,
      referral: 12,
      sourceUrl: 13,
    },
  },
  {
    name: "Riverina",
    gid: "633643715",
    region: "Riverina",
    columnMap: {
      date: 0,
      designerEmail: 1,
      name: 5,
      email: 6,
      phone: 7,
      address: 8,
      suburb: 9,
      product: 10,
      message: 11,
      leadSource: 12,
      referral: 13,
      sourceUrl: 14,
    },
  },
  {
    name: "Allocation New",
    gid: "0",
    region: "ACT",
    columnMap: {
      date: -1, // No date column in this tab
      designerName: 0,
      name: 3,
      email: 4,
      phone: 5,
      address: 6,
      suburb: 7,
      product: 8,
      leadSource: 9,
      referral: 10,
    },
  },
];

/**
 * Parse Australian date format DD/MM/YYYY to a Date object
 */
function parseAusDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  // Try DD/MM/YYYY
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  return null;
}

/**
 * Derive Australian state from postcode
 */
function stateFromPostcode(postcode: string): string {
  const pc = parseInt(postcode, 10);
  if (isNaN(pc)) return "";
  // ACT
  if ((pc >= 2600 && pc <= 2618) || (pc >= 2900 && pc <= 2920) || pc === 2620) return "ACT";
  // NSW
  if ((pc >= 1000 && pc <= 2599) || (pc >= 2619 && pc <= 2899) || (pc >= 2921 && pc <= 2999)) return "NSW";
  // VIC
  if ((pc >= 3000 && pc <= 3999) || (pc >= 8000 && pc <= 8999)) return "VIC";
  // QLD
  if ((pc >= 4000 && pc <= 4999) || (pc >= 9000 && pc <= 9999)) return "QLD";
  // SA
  if (pc >= 5000 && pc <= 5999) return "SA";
  // WA
  if (pc >= 6000 && pc <= 6999) return "WA";
  // TAS
  if (pc >= 7000 && pc <= 7999) return "TAS";
  // NT
  if (pc >= 800 && pc <= 999) return "NT";
  return "";
}

/**
 * Parse suburb field "postcode, SUBURB_NAME" into separate parts
 */
function parseSuburb(raw: string): { suburb: string; postcode: string; state: string } {
  if (!raw) return { suburb: "", postcode: "", state: "" };
  const trimmed = raw.trim();
  // Format: "2621, BUNGENDORE" or "2621, BUNGENDORE "
  const match = trimmed.match(/^(\d{4}),?\s*(.+)$/);
  if (match) {
    const postcode = match[1];
    const suburb = match[2].trim();
    const state = stateFromPostcode(postcode);
    return { suburb, postcode, state };
  }
  // Try reverse: "SUBURB 2621" or just a postcode
  const pcOnly = trimmed.match(/^(\d{4})$/);
  if (pcOnly) {
    return { suburb: "", postcode: pcOnly[1], state: stateFromPostcode(pcOnly[1]) };
  }
  // Fallback: just return as suburb
  return { suburb: trimmed, postcode: "", state: "" };
}

/**
 * Normalize phone number: remove spaces, add leading 0 if 9 digits
 */
function normalizePhone(raw: string): string {
  if (!raw) return "";
  let phone = raw.trim().replace(/\s+/g, "").replace(/[^\d+]/g, "");
  // If 9 digits and doesn't start with 0 or +, add leading 0
  if (phone.length === 9 && !phone.startsWith("0") && !phone.startsWith("+")) {
    phone = "0" + phone;
  }
  return phone;
}

/**
 * Extract designer name from email
 */
function designerFromEmail(email: string): string {
  if (!email) return "";
  // e.g. "peter.dimock@act.spanline.com.au" -> "Peter Dimock"
  const local = email.split("@")[0] || "";
  return local
    .split(".")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Split a full name into first and last name
 */
function splitName(fullName: string): { first: string; last: string } {
  if (!fullName) return { first: "", last: "" };
  const trimmed = fullName.trim();
  // Handle "David & Helen Turner" -> first: "David & Helen", last: "Turner"
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return { first, last };
}

/**
 * Fetch a single tab from Google Sheets as CSV
 */
async function fetchTabCsv(gid: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tab gid=${gid}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Map raw product text from sheet to system product types
 */
const PRODUCT_TYPE_MAP: Record<string, string> = {
  "patio and verandahs": "Patio",
  "patio": "Patio",
  "patios": "Patio",
  "verandah": "Patio",
  "verandahs": "Patio",
  "outdoor living": "Outdoor Living",
  "carports and shelters": "Carport",
  "carport": "Carport",
  "carports": "Carport",
  "carpot": "Carport",
  "deck": "Deck",
  "decks": "Deck",
  "opening roof": "Eclipse Roof",
  "opening roofs": "Eclipse Roof",
  "eclipse roof": "Eclipse Roof",
  "glass and sunroom enclosures": "Glassroom",
  "glassroom": "Glassroom",
  "sunroom": "Glassroom",
  "screenroom": "Screenroom",
  "screen room": "Screenroom",
  "lattice": "Lattice",
  "spacemaker": "Spacemaker",
  "awning": "Awning",
  "awnings": "Awning",
  "pergola": "Patio",
  "windows and walling": "Glassroom",
  "spanlites": "Patio",
  "ezi struct insulated roofing & wall panels": "Patio",
};

function matchProductType(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  // Direct match
  if (PRODUCT_TYPE_MAP[lower]) return PRODUCT_TYPE_MAP[lower];
  // Try matching the first product if comma-separated
  const firstProduct = lower.split(",")[0].trim();
  if (PRODUCT_TYPE_MAP[firstProduct]) return PRODUCT_TYPE_MAP[firstProduct];
  // Fuzzy: check if any key is contained in the raw text
  for (const [key, value] of Object.entries(PRODUCT_TYPE_MAP)) {
    if (lower.includes(key)) return value;
  }
  // Return raw if no match (better than empty)
  return raw.trim();
}

/**
 * Parse a tab's CSV data into lead records
 */
function parseTabLeads(csvText: string, config: TabConfig, cutoffDate: Date): Array<{
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  productType: string;
  leadSource: string;
  designAdvisor: string;
  designAdvisorEmail: string;
  notes: string;
  detectedRegion: string;
  leadDate: string;
  sourceUrl: string;
}> {
  const records: string[][] = parse(csvText, {
    relax_column_count: true,
    skip_empty_lines: false,
  });

  // Skip header row
  const dataRows = records.slice(1);
  const leads: ReturnType<typeof parseTabLeads> = [];

  for (const row of dataRows) {
    // Get date
    let leadDate: Date | null = null;
    if (config.columnMap.date >= 0) {
      leadDate = parseAusDate(row[config.columnMap.date] || "");
    }

    // Apply date filter - skip leads before cutoff
    if (leadDate && leadDate < cutoffDate) continue;

    // For Allocation New tab (no date), include all rows (they're recent)
    // But still skip if no name/email/phone
    const name = (row[config.columnMap.name] || "").trim();
    const email = (row[config.columnMap.email] || "").trim();
    const phone = normalizePhone(row[config.columnMap.phone] || "");

    // Skip rows with no contact info
    if (!name && !email && !phone) continue;

    // Skip rows that look like headers or summary rows
    if (name.toLowerCase().includes("timeline") || name.toLowerCase().includes("grand total")) continue;
    if (name.toLowerCase() === "name" || name.toLowerCase() === "name ") continue;

    const { first, last } = splitName(name);
    const { suburb, postcode, state } = parseSuburb(row[config.columnMap.suburb] || "");

    // Get designer
    let designAdvisor = "";
    if (config.columnMap.designerEmail !== undefined) {
      designAdvisor = designerFromEmail(row[config.columnMap.designerEmail] || "");
    } else if (config.columnMap.designerName !== undefined) {
      designAdvisor = (row[config.columnMap.designerName] || "").trim();
    }

    // Build notes from message + referral
    const messageParts: string[] = [];
    if (config.columnMap.message !== undefined && row[config.columnMap.message]) {
      messageParts.push(row[config.columnMap.message].trim());
    }
    if (config.columnMap.referral !== undefined && row[config.columnMap.referral]) {
      messageParts.push(`Referral: ${row[config.columnMap.referral].trim()}`);
    }

    // Get source URL
    let sourceUrl = "";
    if (config.columnMap.sourceUrl !== undefined) {
      const rawUrl = (row[config.columnMap.sourceUrl] || "").trim();
      // Only store if it looks like a URL
      if (rawUrl.startsWith("http") || rawUrl.startsWith("www")) {
        sourceUrl = rawUrl;
      }
    }

    // Get raw product and match to system types
    const rawProduct = config.columnMap.product !== undefined ? (row[config.columnMap.product] || "").trim() : "";
    const productType = matchProductType(rawProduct);

    // Get designer email for DA matching
    let designAdvisorEmail = "";
    if (config.columnMap.designerEmail !== undefined) {
      designAdvisorEmail = (row[config.columnMap.designerEmail] || "").trim().toLowerCase();
    }

    leads.push({
      contactFirstName: first,
      contactLastName: last,
      contactPhone: phone,
      contactEmail: email.toLowerCase(),
      contactAddress: (row[config.columnMap.address] || "").trim(),
      suburb,
      state,
      postcode,
      productType,
      leadSource: config.columnMap.leadSource !== undefined ? (row[config.columnMap.leadSource] || "").trim() : "",
      designAdvisor,
      designAdvisorEmail,
      notes: messageParts.join("\n").trim(),
      detectedRegion: config.region,
      leadDate: leadDate ? `${leadDate.getDate().toString().padStart(2, "0")}/${(leadDate.getMonth() + 1).toString().padStart(2, "0")}/${leadDate.getFullYear()}` : "",
      sourceUrl,
    });
  }

  return leads;
}

export const gsheetImportRouter = router({
  /**
   * Preview: fetch and parse all tabs, return counts without importing
   */
  preview: protectedProcedure.input(z.object({
    sheetUrl: z.string().optional(),
    cutoffDate: z.string().default("2025-07-01"), // ISO date string
  })).query(async ({ input, ctx }) => {
    if (!isAdminRole(ctx.user.role)) {
      throw new Error("Only admins can import from Google Sheets");
    }

    const cutoff = new Date(input.cutoffDate);
    const results: Array<{ tab: string; totalRows: number; afterCutoff: number }> = [];

    for (const config of TAB_CONFIGS) {
      try {
        const csv = await fetchTabCsv(config.gid);
        const records: string[][] = parse(csv, { relax_column_count: true, skip_empty_lines: false });
        const totalRows = records.length - 1; // minus header

        const leads = parseTabLeads(csv, config, cutoff);
        results.push({ tab: config.name, totalRows, afterCutoff: leads.length });
      } catch (err: any) {
        results.push({ tab: config.name, totalRows: 0, afterCutoff: 0 });
      }
    }

    return { tabs: results, cutoffDate: input.cutoffDate };
  }),

  /**
   * Import: fetch all tabs, parse, deduplicate, and bulk insert
   */
  import: protectedProcedure.input(z.object({
    sheetUrl: z.string().optional(),
    cutoffDate: z.string().default("2025-07-01"),
    tabs: z.array(z.string()).optional(), // If provided, only import these tabs
  })).mutation(async ({ input, ctx }) => {
    if (!isAdminRole(ctx.user.role)) {
      throw new Error("Only admins can import from Google Sheets");
    }

    const cutoff = new Date(input.cutoffDate);
    const selectedTabs = input.tabs || TAB_CONFIGS.map(t => t.name);
    const tabResults: Array<{ tab: string; imported: number; skipped: number; errors: string[] }> = [];

    // Collect all leads from all tabs first
    let allLeads: ReturnType<typeof parseTabLeads> = [];
    for (const config of TAB_CONFIGS) {
      if (!selectedTabs.includes(config.name)) continue;
      try {
        const csv = await fetchTabCsv(config.gid);
        const leads = parseTabLeads(csv, config, cutoff);
        allLeads = allLeads.concat(leads);
      } catch (err: any) {
        tabResults.push({ tab: config.name, imported: 0, skipped: 0, errors: [err.message] });
      }
    }

    if (allLeads.length === 0) {
      return { totalImported: 0, totalSkipped: 0, tabResults };
    }

    // Collect all emails and phones for deduplication check
    const emails = allLeads
      .map(l => l.contactEmail)
      .filter((e): e is string => !!e && e.length > 0);
    const phones = allLeads
      .map(l => l.contactPhone)
      .filter((p): p is string => !!p && p.length > 0);

    // Fetch existing contacts from DB
    const existingContacts = await crmDb.getExistingContacts(emails, phones);
    const existingEmails = new Set(existingContacts.emails.map(e => e.toLowerCase()));
    const existingPhones = new Set(existingContacts.phones);

    // Deduplicate
    const uniqueLeads: typeof allLeads = [];
    const skippedCount = { total: 0 };
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (const lead of allLeads) {
      const email = lead.contactEmail?.toLowerCase();
      const phone = lead.contactPhone;

      // Skip if email already exists in DB or in this batch
      if (email && (existingEmails.has(email) || seenEmails.has(email))) {
        skippedCount.total++;
        continue;
      }
      // Skip if phone already exists in DB or in this batch
      if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
        skippedCount.total++;
        continue;
      }

      uniqueLeads.push(lead);
      if (email) seenEmails.add(email);
      if (phone) seenPhones.add(phone);
    }

    if (uniqueLeads.length === 0) {
      return { totalImported: 0, totalSkipped: skippedCount.total, tabResults, daMatched: 0 };
    }

    // Fetch all design_adviser users for DA matching
    const db = await getDb();
    const daUsers = await db!.select().from(users).where(
      eq(users.role, "design_adviser")
    );
    // Build email -> user lookup (case-insensitive)
    const daByEmail = new Map<string, { id: number; name: string | null }>();
    // Also build name -> user lookup for Allocation New tab which uses names
    const daByName = new Map<string, { id: number; name: string | null }>();
    for (const da of daUsers) {
      if (da.email) daByEmail.set(da.email.toLowerCase(), { id: da.id, name: da.name });
      if (da.name) daByName.set(da.name.toLowerCase(), { id: da.id, name: da.name });
    }

    // Generate lead numbers and insert
    const startNumber = await crmDb.getNextLeadNumber();
    const startNum = parseInt(startNumber.replace("L-", ""), 10);
    let daMatchedCount = 0;

    const leadsToInsert = uniqueLeads.map((lead, idx) => {
      // Match DA by email first, then by name
      let assignedTo: number | null = null;
      let designAdvisor = lead.designAdvisor || null;

      if (lead.designAdvisorEmail) {
        const matched = daByEmail.get(lead.designAdvisorEmail);
        if (matched) {
          assignedTo = matched.id;
          designAdvisor = matched.name || designAdvisor;
          daMatchedCount++;
        }
      }
      // If no email match, try name match (for Allocation New tab)
      if (!assignedTo && designAdvisor) {
        const matched = daByName.get(designAdvisor.toLowerCase());
        if (matched) {
          assignedTo = matched.id;
          designAdvisor = matched.name || designAdvisor;
          daMatchedCount++;
        }
      }

      // Truncate fields to fit DB column limits
      const trunc = (val: string | null | undefined, max: number) => {
        if (!val) return null;
        return val.length > max ? val.slice(0, max) : val;
      };

      return {
        leadNumber: `L-${String(startNum + idx).padStart(4, "0")}`,
        contactFirstName: trunc(lead.contactFirstName, 100),
        contactLastName: trunc(lead.contactLastName, 100),
        contactPhone: trunc(lead.contactPhone, 50),
        contactEmail: trunc(lead.contactEmail, 320),
        contactAddress: lead.contactAddress || null,
        suburb: trunc(lead.suburb, 128),
        state: trunc(lead.state, 32),
        postcode: trunc(lead.postcode, 16),
        productType: trunc(lead.productType, 100),
        leadSource: trunc(lead.leadSource || "Google Sheets Import", 100),
        designAdvisor: trunc(designAdvisor, 100),
        assignedTo,
        notes: lead.notes || null,
        detectedRegion: trunc(lead.detectedRegion, 64),
        leadDate: trunc(lead.leadDate, 10),
        sourceUrl: lead.sourceUrl || null,
        status: "new" as const,
        createdBy: ctx.user.id,
      };
    });

    const result = await crmDb.bulkCreateLeads(leadsToInsert);

    return {
      totalImported: result.count,
      totalSkipped: skippedCount.total,
      daMatched: daMatchedCount,
      tabResults: [{
        tab: "All",
        imported: result.count,
        skipped: skippedCount.total,
        errors: [],
      }],
    };
  }),
});
