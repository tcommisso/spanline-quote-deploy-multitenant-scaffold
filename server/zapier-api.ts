/**
 * Zapier API Integration
 * 
 * Authentication: Supports TWO methods:
 *   a) Static API key — set ZAPIER_API_KEY env var, use as Bearer token (simplest for Zapier webhooks)
 *   b) OAuth2 JWT — full OAuth2 authorization code flow for custom Zapier apps
 * 
 * Provides:
 * 1. POST /api/oauth/token — Standard OAuth2 token endpoint
 * 2. POST /api/v1/leads — Create a new CRM lead (authenticated via Bearer token)
 * 3. GET /api/v1/me — Test authentication endpoint (Zapier uses this to verify connection)
 */
import type { Express, Request, Response, NextFunction } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import * as crmDb from "./crm-db";
import * as db from "./db";
import * as reviewsDb from "./reviews-db";
import { getDesignAdvisorByEmail } from "./design-advisors-db";
import { tenants, type User } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { findTenantByZapierApiKey } from "./tenant-integrations";

const SOURCE_CREATED_FIELD_NAMES = [
  "sourceCreatedAt",
  "leadCreatedAt",
  "lead_created_at",
  "dateCreated",
  "date_created",
  "createdDate",
  "created_date",
  "createdAt",
  "created_at",
  "created",
  "Lead Created",
  "Lead Created Date",
  "Date Created",
  "Created Date",
  "Lead Date",
  "leadDate",
  "lead_date",
];

const ZAPIER_FIELD_ALIASES = {
  contactFirstName: ["contactFirstName", "firstName", "first_name", "first name", "First Name", "givenName", "given_name"],
  contactLastName: ["contactLastName", "lastName", "last_name", "last name", "Last Name", "surname", "familyName", "family_name"],
  contactName: ["name", "contactName", "contact_name", "fullName", "full_name", "full name", "Full Name", "clientName", "client_name"],
  contactPhone: ["contactPhone", "phone", "phoneNumber", "phone_number", "mobile", "mobilePhone", "mobile_phone", "Contact Phone"],
  contactEmail: ["contactEmail", "email", "emailAddress", "email_address", "e-mail", "Email", "Contact Email"],
  contactAddress: ["contactAddress", "address", "streetAddress", "street_address", "siteAddress", "site_address", "Street Address", "Address"],
  suburb: ["suburb", "city", "town", "locality", "Suburb", "City"],
  state: ["state", "region", "State"],
  postcode: ["postcode", "postCode", "post_code", "postalCode", "postal_code", "zip", "ZIP", "Postcode"],
  productType: ["productType", "product", "product_type", "Product", "Product Type", "enquiryType", "enquiry_type"],
  leadSource: ["leadSource", "source", "lead_source", "Lead Source"],
  designAdvisor: ["designAdvisor", "advisor", "design_advisor", "Design Advisor"],
  notes: ["notes", "message", "comments", "comment", "enquiry", "description", "Notes", "Message"],
  leadDate: ["leadDate", "lead_date", "Lead Date"],
} as const;

const PLACEHOLDER_TEXT_VALUES = new Set([
  "true",
  "false",
  "yes",
  "no",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "unknown",
  "not provided",
  "no email",
  "no-email",
  "-",
  "--",
]);

function normalizePayloadKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPayloadValue(body: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && String(body[key]).trim() !== "") {
      return body[key];
    }
  }

  const normalizedKeys = new Map<string, string>();
  for (const key of Object.keys(body)) {
    normalizedKeys.set(normalizePayloadKey(key), key);
  }

  for (const key of keys) {
    const actualKey = normalizedKeys.get(normalizePayloadKey(key));
    if (actualKey && body[actualKey] !== undefined && body[actualKey] !== null && String(body[actualKey]).trim() !== "") {
      return body[actualKey];
    }
  }

  return null;
}

function parseSourceCreatedAt(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value === undefined || value === null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      return new Date((value - 25569) * 86400000);
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    return new Date((numeric - 25569) * 86400000);
  }

  const auMatch = raw.match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (auMatch) {
    const a = Number(auMatch[1]);
    const b = Number(auMatch[2]);
    let c = Number(auMatch[3]);
    const hour = Number(auMatch[4] || 0);
    const minute = Number(auMatch[5] || 0);
    const second = Number(auMatch[6] || 0);
    if (c < 100) c += c >= 70 ? 1900 : 2000;

    const isYearFirst = auMatch[1].length === 4;
    const year = isYearFirst ? a : c;
    const month = b;
    const day = isYearFirst ? c : a;
    if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cleanZapierText(value: unknown, options: { allowNumber?: boolean } = {}) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return "";
  if (typeof value === "number" && !options.allowNumber) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  if (PLACEHOLDER_TEXT_VALUES.has(normalized)) return "";
  return raw;
}

function getPayloadText(body: Record<string, any>, keys: readonly string[], options: { allowNumber?: boolean } = {}) {
  return cleanZapierText(getPayloadValue(body, [...keys]), options);
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isLikelyPhoneNumber(value: unknown) {
  const cleaned = cleanZapierText(value, { allowNumber: true });
  if (!cleaned || isLikelyEmail(cleaned)) return false;
  if (!/^\+?[0-9][0-9\s().-]{6,18}$/.test(cleaned)) return false;

  const digits = cleaned.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function looksLikePersonName(value: string) {
  const cleaned = cleanZapierText(value);
  if (!cleaned || isLikelyEmail(cleaned) || /\d/.test(cleaned)) return false;
  return /^[A-Za-z][A-Za-z' -]{1,120}$/.test(cleaned);
}

function splitFullName(value: string) {
  const parts = cleanZapierText(value).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function looksLikeStreetAddress(value: string) {
  const cleaned = cleanZapierText(value);
  if (!cleaned || isLikelyPhoneNumber(cleaned)) return false;
  return /\d/.test(cleaned)
    && /\b(st|street|rd|road|ave|avenue|cres|crescent|lane|ln|place|pl|drive|dr|cct|circuit|court|ct|way|terrace|tce)\b/i.test(cleaned);
}

async function getDefaultApiTenantId() {
  if (ENV.tenancyMode !== "single") return null;
  const drizzleDb = await db.getDb();
  if (!drizzleDb) return null;
  const [tenant] = await drizzleDb.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, ENV.defaultTenantSlug))
    .limit(1);
  return tenant?.id ?? null;
}

// ─── Middleware: Authenticate Bearer token (supports static API key OR OAuth2 JWT) ───
async function authenticateBearer(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  const apiTenant = await findTenantByZapierApiKey(token);
  if (apiTenant) {
    const owner = await db.getUserByOpenId(ENV.ownerOpenId);
    (req as any).apiUser = owner || { id: 1, name: "API", role: "admin" };
    (req as any).apiTenantId = apiTenant.id;
    next();
    return;
  }

  // Check if it's the static API key first (fastest path for Zapier webhooks)
  if (ENV.zapierApiKey && token === ENV.zapierApiKey) {
    // Static API key auth — use the owner as the authenticated user
    const owner = await db.getUserByOpenId(ENV.ownerOpenId);
    (req as any).apiUser = owner || { id: 1, name: "API", role: "admin" };
    (req as any).apiTenantId = await getDefaultApiTenantId();
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
    // Look up the full user record from the database
    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    (req as any).apiUser = user;
    (req as any).apiTenantId = await getDefaultApiTenantId();
    next();
  } catch (err) {
    console.error("[Zapier API] Auth error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Register Routes ────────────────────────────────────────────────────────
export function registerZapierApi(app: Express) {
  /**
   * POST /api/oauth/token
   * Standard OAuth2 token endpoint.
   * Zapier sends: { code, grant_type, redirect_uri } (form-encoded or JSON)
   * We return: { access_token, token_type, expires_in }
   */
  app.post("/api/oauth/token", async (req: Request, res: Response) => {
    try {
      const { code, grant_type, redirect_uri, refresh_token } = req.body;

      if (grant_type === "refresh_token" && refresh_token) {
        // For refresh, verify the existing token and issue a new one
        try {
          const session = await sdk.verifySession(refresh_token);
          if (session) {
            // Create a fresh session token
            const newToken = await sdk.createSessionToken(session.openId, {
              name: session.name || "",
              expiresInMs: 365 * 24 * 60 * 60 * 1000, // 1 year
            });
            res.json({
              access_token: newToken,
              token_type: "Bearer",
              expires_in: 31536000, // 1 year in seconds
              refresh_token: newToken,
            });
            return;
          }
        } catch (e) {
          // Fall through to error
        }
        res.status(400).json({ error: "invalid_grant", error_description: "Refresh token is invalid or expired" });
        return;
      }

      if (grant_type !== "authorization_code") {
        res.status(400).json({ error: "unsupported_grant_type" });
        return;
      }

      if (!code) {
        res.status(400).json({ error: "invalid_request", error_description: "code is required" });
        return;
      }

      // Build state from redirect_uri (the SDK expects base64-encoded redirect URI as state)
      const state = redirect_uri ? btoa(redirect_uri) : btoa(`${req.protocol}://${req.get("host")}/api/oauth/callback`);

      // Exchange the code for a Manus token
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "invalid_grant", error_description: "Could not retrieve user info" });
        return;
      }

      // Create a long-lived session token that serves as the access_token
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: 365 * 24 * 60 * 60 * 1000, // 1 year
      });

      // Return standard OAuth2 response that Zapier expects
      res.json({
        access_token: sessionToken,
        token_type: "Bearer",
        expires_in: 31536000, // 1 year in seconds
        refresh_token: sessionToken, // Same token for refresh since it's long-lived
      });
    } catch (error: any) {
      console.error("[Zapier API] Token exchange failed:", error?.message || error);
      res.status(400).json({
        error: "invalid_grant",
        error_description: "Failed to exchange authorization code for token",
      });
    }
  });

  /**
   * GET /api/v1/me
   * Test authentication endpoint — Zapier calls this to verify the connection works.
   */
  app.get("/api/v1/me", authenticateBearer, (req: Request, res: Response) => {
    const user = (req as any).apiUser;
    const tenantId = (req as any).apiTenantId ?? null;
    res.json({
      id: user.openId,
      name: user.name,
      email: user.email || null,
      role: user.role,
      tenantId,
    });
  });

  /**
   * POST /api/v1/leads
   * Create a new CRM lead.
   * Body: { contactFirstName, contactLastName, contactPhone, contactEmail, contactAddress, suburb, state, postcode, productType, leadSource, designAdvisor, notes, dateCreated/sourceCreatedAt }
   * designAdvisor can be a DA email (e.g. peter.dimock@spanline.com.au) which will be auto-resolved to the DA name
   */
  app.post("/api/v1/leads", authenticateBearer, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const tenantId = (req as any).apiTenantId ?? null;
      let contactFirstName = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.contactFirstName);
      let contactLastName = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.contactLastName);
      let contactPhone = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.contactPhone, { allowNumber: true });
      let contactEmail = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.contactEmail);
      let contactAddress = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.contactAddress);
      let suburb = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.suburb);
      let state = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.state);
      let postcode = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.postcode, { allowNumber: true });
      let productType = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.productType);
      let leadSource = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.leadSource);
      let designAdvisor = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.designAdvisor);
      let notes = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.notes);
      const sourceCreatedAt = parseSourceCreatedAt(getPayloadValue(req.body, SOURCE_CREATED_FIELD_NAMES));

      // ── Smart parsing: handle common Zapier mapping issues ──

      // 0. Zapier sometimes maps placeholder values like "False" or "No Email"
      // into name/email fields. Never persist those as contact data.
      let nameFromInvalidEmail = "";
      if (contactEmail && !isLikelyEmail(contactEmail)) {
        if (looksLikePersonName(contactEmail)) nameFromInvalidEmail = contactEmail;
        contactEmail = "";
      }

      // Zapier field mappings can drift, especially when webhook columns are
      // renamed. Preserve recoverable values instead of writing swapped fields.
      if (contactPhone && isLikelyEmail(contactPhone)) {
        if (!contactEmail) contactEmail = contactPhone;
        contactPhone = "";
      }

      if (contactAddress && isLikelyPhoneNumber(contactAddress)) {
        if (!contactPhone) contactPhone = contactAddress;
        contactAddress = "";
      }

      // 1. Name splitting: if firstName has a space and lastName is empty, split it
      if (contactFirstName && !contactLastName && contactFirstName.trim().includes(" ")) {
        const parts = splitFullName(contactFirstName);
        contactFirstName = parts.firstName;
        contactLastName = parts.lastName;
      }

      // Also accept a "name" or "contactName" field as fallback
      if (!contactFirstName && !contactLastName) {
        const rawName = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.contactName) || nameFromInvalidEmail;
        if (rawName) {
          const parts = splitFullName(rawName);
          contactFirstName = parts.firstName;
          contactLastName = parts.lastName;
        }
      }

      // Zapier can map street address into suburb. Move it rather than storing
      // addresses as suburbs.
      if (!contactAddress && suburb && looksLikeStreetAddress(suburb)) {
        contactAddress = suburb;
        suburb = "";
      }

      // 2. Postcode extraction: if suburb contains a leading 4-digit postcode (e.g. "2603, RED HILL")
      if (suburb && /^\d{4}/.test(suburb.trim())) {
        const match = suburb.trim().match(/^(\d{4})[,\s]+(.+)$/);
        if (match) {
          if (!postcode) postcode = match[1];
          suburb = match[2].trim();
        } else if (/^\d{4}$/.test(suburb.trim())) {
          // suburb field contains ONLY a postcode
          if (!postcode) postcode = suburb.trim();
          suburb = "";
        }
      }

      // 3. Address contains suburb: if address has suburb appended (e.g. "46 Discovery St Red Hill")
      //    and suburb is now known, try to strip it from the address
      if (contactAddress && suburb) {
        const addrLower = contactAddress.toLowerCase().trim();
        const suburbLower = suburb.toLowerCase().trim();
        if (addrLower.endsWith(suburbLower)) {
          contactAddress = contactAddress.trim().slice(0, -suburb.length).replace(/[,\s]+$/, "");
        }
      }

      // 4. State inference from postcode (Australian postcodes)
      if (postcode && !state) {
        const pc = parseInt(postcode, 10);
        if (pc >= 2000 && pc <= 2599) state = "NSW";
        else if (pc >= 2600 && pc <= 2619) state = "ACT";
        else if (pc >= 2620 && pc <= 2899) state = "NSW";
        else if (pc >= 2900 && pc <= 2920) state = "ACT";
        else if (pc >= 3000 && pc <= 3999) state = "VIC";
        else if (pc >= 4000 && pc <= 4999) state = "QLD";
        else if (pc >= 5000 && pc <= 5799) state = "SA";
        else if (pc >= 6000 && pc <= 6797) state = "WA";
        else if (pc >= 7000 && pc <= 7799) state = "TAS";
        else if (pc >= 800 && pc <= 899) state = "NT";
      }

      // 5. Title-case the name fields
      const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
      if (contactFirstName) contactFirstName = titleCase(contactFirstName.toLowerCase());
      if (contactLastName) contactLastName = titleCase(contactLastName.toLowerCase());
      if (suburb) suburb = titleCase(suburb.toLowerCase());

      // Validate at least one contact field is provided
      if (!contactFirstName && !contactLastName && !contactEmail && !contactPhone) {
        res.status(400).json({
          error: "validation_error",
          message: "At least one contact field (name, email, or phone) is required",
        });
        return;
      }

      // Reject Zapier test leads — silently accept but do not persist
      const fullName = `${contactFirstName || ""} ${contactLastName || ""}`.trim().toLowerCase();
      const emailLower = (contactEmail || "").toLowerCase();
      const isTestLead =
        fullName.includes("zapier test") ||
        emailLower.includes("zapier-test@") ||
        emailLower.includes("zapier+test@") ||
        emailLower === "vitest-runner@example.com" ||
        emailLower === "integration-check@example.com" ||
        emailLower.endsWith("@vitest.local") ||
        fullName === "test test" ||
        fullName === "test";
      if (isTestLead) {
        console.log(`[Zapier API] Rejected test lead: ${fullName} / ${contactEmail}`);
        res.status(200).json({
          id: 0,
          leadNumber: "TEST-0000",
          message: "Test lead acknowledged (not stored)",
          designAdvisor: null,
        });
        return;
      }

      // If designAdvisor looks like an email, resolve it to the DA name
      if (designAdvisor && designAdvisor.includes("@")) {
        let resolved = false;
        try {
          // 1. Try users table first
          const daUser = await db.getUserByEmail(designAdvisor);
          if (daUser && daUser.name) {
            designAdvisor = daUser.name;
            resolved = true;
          }
        } catch (err) {
          console.warn(`[Zapier API] Could not resolve DA email from users:`, err);
        }
        if (!resolved) {
          try {
            // 2. Try design_advisors table
            const daRecord = await getDesignAdvisorByEmail(designAdvisor, tenantId);
            if (daRecord && daRecord.name) {
              designAdvisor = daRecord.name;
              resolved = true;
            }
          } catch (err) {
            console.warn(`[Zapier API] Could not resolve DA email from design_advisors:`, err);
          }
        }
        if (!resolved) {
          // 3. Fallback: parse first.last@domain -> "First Last"
          const localPart = designAdvisor.split("@")[0];
          const parts = localPart.split(".");
          if (parts.length >= 2) {
            designAdvisor = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
            console.log(`[Zapier API] Resolved DA email to name via parsing: ${designAdvisor}`);
          }
        }
      }

      // If no designAdvisor provided, try to assign based on zone rules
      if (!designAdvisor) {
        try {
          const assignedDa = await crmDb.getAssignedDaForLead(suburb, postcode, state);
          if (assignedDa) {
            designAdvisor = assignedDa;
            console.log(`[Zapier API] Auto-assigned lead to ${assignedDa} based on zone (${postcode}, ${state})`);
          }
        } catch (err) {
          console.warn(`[Zapier API] Could not auto-assign DA by zone:`, err);
        }
      }

      // ── Deduplication: check for existing lead by phone or email ──
      const existingLead = await crmDb.findExistingLeadByContact(
        contactPhone || null,
        contactEmail || null,
        tenantId,
      );

      if (existingLead) {
        // Build an update payload with only non-empty changed fields
        const updateData: Record<string, any> = {};
        const existingFull = await crmDb.getLead(existingLead.id, tenantId);
        if (contactFirstName) updateData.contactFirstName = contactFirstName;
        if (contactLastName) updateData.contactLastName = contactLastName;
        if (contactPhone) updateData.contactPhone = contactPhone;
        if (contactEmail) updateData.contactEmail = contactEmail;
        if (contactAddress) updateData.contactAddress = contactAddress;
        if (suburb) updateData.suburb = suburb;
        if (state) updateData.state = state;
        if (postcode) updateData.postcode = postcode;
        if (productType) updateData.productType = productType;
        if (designAdvisor) updateData.designAdvisor = designAdvisor;
        if (sourceCreatedAt && !existingFull?.sourceCreatedAt) updateData.sourceCreatedAt = sourceCreatedAt;
        // Append notes rather than overwrite
        if (notes) {
          // We'll append via a separate note rather than overwriting the lead notes field
          // to preserve history
        }

        // Auto-allocate branch if not already assigned (DB-backed territory lookup)
        if (postcode) {
          const { getBranchIdForPostcodeFromDb } = await import("./territory-router");
          const match = await getBranchIdForPostcodeFromDb(postcode, tenantId);
          if (match) {
            // Only set branch if the existing lead doesn't already have one
            if (existingFull && !existingFull.branchId) {
              updateData.branchId = match.branchId;
              // Notify branch manager (fire-and-forget)
              notifyBranchManager(match.branchId, tenantId, {
                leadName: `${contactFirstName || ""} ${contactLastName || ""}`.trim() || "Unknown",
                postcode: postcode || "",
                suburb: suburb || "",
                productType: productType || "",
                territory: match.territory,
                leadNumber: existingLead.leadNumber,
              }).catch(() => {});
            }
          }
        }

        if (Object.keys(updateData).length > 0) {
          await crmDb.updateLead(existingLead.id, updateData, tenantId);

          // Log activity with field-level change detail
          const fieldLabels: Record<string, string> = {
            contactFirstName: "First Name",
            contactLastName: "Last Name",
            contactPhone: "Phone",
            contactEmail: "Email",
            contactAddress: "Address",
            suburb: "Suburb",
            state: "State",
            postcode: "Postcode",
            productType: "Product Type",
            designAdvisor: "Design Advisor",
            sourceCreatedAt: "Date Created",
          };
          const changes = Object.entries(updateData)
            .map(([k, v]) => `${fieldLabels[k] || k}: ${v}`)
            .join(", ");
          await crmDb.createActivity({
            leadId: existingLead.id,
            activityType: "zapier_update",
            description: `Lead updated via Zapier (dedup). Changed: ${changes}`,
          });
        }

        console.log(`[Zapier API] Deduplicated: updated existing lead ${existingLead.leadNumber} (id=${existingLead.id})`);
        res.status(200).json({
          id: existingLead.id,
          leadNumber: existingLead.leadNumber,
          message: "Existing lead updated (duplicate detected by phone/email)",
          designAdvisor: designAdvisor || null,
          action: "updated",
        });
        return;
      }

      // ── No duplicate found — create new lead ──
      const leadNumber = await crmDb.getNextLeadNumber(tenantId);

      // Accept leadDate from API body, but always persist YYYY-MM-DD for reporting.
      const rawLeadDate = getPayloadText(req.body, ZAPIER_FIELD_ALIASES.leadDate, { allowNumber: true });
      const parsedLeadDate = rawLeadDate ? parseSourceCreatedAt(rawLeadDate) : null;
      const leadDate = parsedLeadDate
        ? formatDateOnly(parsedLeadDate)
        : (sourceCreatedAt ? formatDateOnly(sourceCreatedAt) : new Date().toISOString().slice(0, 10));

      // ── Auto-allocate branch from postcode (DB-backed territory lookup) ──
      const { getBranchIdForPostcodeFromDb } = await import("./territory-router");
      const territoryMatch = await getBranchIdForPostcodeFromDb(postcode, tenantId);
      const autoBranchId = territoryMatch?.branchId || null;
      if (autoBranchId) {
        console.log(`[Zapier API] Auto-assigned branch ${autoBranchId} (${territoryMatch!.territory}) for postcode ${postcode}`);
      }

      const result = await crmDb.createLead({
        tenantId,
        leadNumber,
        contactFirstName: contactFirstName || null,
        contactLastName: contactLastName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        contactAddress: contactAddress || null,
        suburb: suburb || null,
        state: state || null,
        postcode: postcode || null,
        productType: productType || null,
        leadSource: leadSource || "Zapier",
        designAdvisor: designAdvisor || null,
        notes: notes || null,
        status: "new",
        createdBy: user.id || null,
        leadDate: leadDate,
        sourceCreatedAt,
        branchId: autoBranchId,
      });

      // Notify branch manager of new auto-allocated lead (fire-and-forget)
      if (autoBranchId && territoryMatch) {
        notifyBranchManager(autoBranchId, tenantId, {
          leadName: `${contactFirstName || ""} ${contactLastName || ""}`.trim() || "Unknown",
          postcode: postcode || "",
          suburb: suburb || "",
          productType: productType || "",
          territory: territoryMatch.territory,
          leadNumber,
        }).catch(() => {});
      }

      res.status(201).json({
        id: result.id,
        leadNumber,
        message: "Lead created successfully",
        designAdvisor: designAdvisor,
        sourceCreatedAt: sourceCreatedAt ? sourceCreatedAt.toISOString() : null,
        branch: autoBranchId ? { id: autoBranchId, territory: territoryMatch!.territory, autoAllocated: true } : null,
        action: "created",
      });
    } catch (error: any) {
      console.error("[Zapier API] Create lead failed:", error?.message || error);
      res.status(500).json({
        error: "server_error",
        message: error?.message || "Failed to create lead",
      });
    }
  });

  // ─── POST /api/v1/reviews — Inbound Google Review from Climbo via Zapier ────
  app.post("/api/v1/reviews", authenticateBearer, async (req: Request, res: Response) => {
    try {
      const {
        reviewer_name, rating, review_text, review_date,
        google_review_id, location_name, reply_text, reply_date,
        lead_id, climbo_account_id, source,
      } = req.body;

      if (!rating && !reviewer_name && !review_text) {
        res.status(400).json({ error: "validation_error", message: "At least rating, reviewer_name, or review_text is required" });
        return;
      }

      // Safe integer cast — skip if value is alphanumeric (Climbo uses MongoDB-style IDs)
      const safeInt = (v: any): number | null => {
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const result = await reviewsDb.upsertReview({
        leadId: safeInt(lead_id),
        climboAccountId: safeInt(climbo_account_id),
        reviewerName: reviewer_name || null,
        rating: rating ? Number(rating) : null,
        reviewText: review_text || null,
        reviewDate: review_date ? new Date(review_date) : null,
        googleReviewId: google_review_id || null,
        locationName: location_name || null,
        replyText: reply_text || null,
        replyDate: reply_date ? new Date(reply_date) : null,
        source: source || "climbo",
        rawPayload: req.body,
      });

      res.status(result.updated ? 200 : 201).json({
        id: result.id,
        updated: result.updated,
        message: result.updated ? "Review updated" : "Review created",
      });
    } catch (error: any) {
      console.error("[Zapier API] Create review failed:", error?.message || error);
      res.status(500).json({ error: "server_error", message: "Failed to create review" });
    }
  });
}

// ─── Branch Manager Notification on Lead Auto-Allocation ───────────────────
interface LeadNotificationData {
  leadName: string;
  postcode: string;
  suburb: string;
  productType: string;
  territory: string;
  leadNumber: string;
}

async function notifyBranchManager(branchId: number, tenantId: number | null | undefined, lead: LeadNotificationData): Promise<void> {
  try {
    const { getBranchManager } = await import("./territory-router");
    const manager = await getBranchManager(branchId, tenantId);
    if (!manager || !manager.email) {
      console.log(`[Zapier API] No branch manager email for branch ${branchId}, skipping notification`);
      return;
    }

    const { sendNotificationEmail } = await import("./email");
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">New Lead Auto-Allocated</h2>
        <p style="color: #475569;">A new lead has been automatically assigned to your branch based on territory mapping.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 140px;">Lead #</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${lead.leadNumber}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Name</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${lead.leadName}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Suburb</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${lead.suburb || 'N/A'}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Postcode</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${lead.postcode}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Territory</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${lead.territory}</td></tr>
          <tr><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Product</td><td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${lead.productType || 'Not specified'}</td></tr>
        </table>
        <p style="color: #64748b; font-size: 13px;">Log in to the CRM to view and manage this lead.</p>
      </div>
    `;

    await sendNotificationEmail({
      to: manager.email,
      subject: `New Lead: ${lead.leadName} (${lead.territory} - ${lead.postcode})`,
      htmlBody,
      fromName: "Altaspan CRM",
    });
    console.log(`[Zapier API] Branch manager notification sent to ${manager.email} for lead ${lead.leadNumber}`);
  } catch (err: any) {
    console.error(`[Zapier API] Failed to notify branch manager for branch ${branchId}:`, err?.message || err);
  }
}
