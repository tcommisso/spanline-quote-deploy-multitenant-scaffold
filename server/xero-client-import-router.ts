import { z } from "zod";
import { eq, isNull, and, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs,
  crmLeads,
  xeroProjectMappings,
  branches,
} from "../drizzle/schema";
import * as crmDb from "./crm-db";
import {
  xeroApiRequest,
  getValidAccessToken,
  type XeroContact,
} from "./xero-client";
import { deriveBranchFromProjectName, extractPostcodeFromContact } from "./xero-gl-helpers";

/**
 * Import Xero clients (orphan construction jobs with no leadId) into CRM Leads
 * as "converted" status. This bridges the gap where Xero contacts don't have
 * a CRM lead record for communication history.
 */

// ─── Helper: resolve branchId from branch name ──────────────────────────────
async function resolveBranchId(db: any, branchName: string): Promise<number | undefined> {
  if (!branchName) return undefined;
  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.name, branchName))
    .limit(1);
  return branch?.id ?? undefined;
}

// ─── Helper: parse a single Xero contact into our fields ────────────────────
function parseXeroContact(contact: XeroContact): {
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  suburb: string | null;
  state: string | null;
  accountNumber: string | null;
} {
  const email = contact.EmailAddress || null;
  const accountNumber = contact.AccountNumber || null;

  let phone: string | null = null;
  if (contact.Phones?.length) {
    const defaultPhone = contact.Phones.find(p => p.PhoneType === "DEFAULT");
    const mobilePhone = contact.Phones.find(p => p.PhoneType === "MOBILE");
    const anyPhone = contact.Phones.find(p => p.PhoneNumber);
    phone = (defaultPhone?.PhoneNumber || mobilePhone?.PhoneNumber || anyPhone?.PhoneNumber) || null;
  }

  let address: string | null = null;
  let postcode: string | null = null;
  let suburb: string | null = null;
  let state: string | null = null;
  if (contact.Addresses?.length) {
    const streetAddr = contact.Addresses.find(a => a.AddressType === "STREET");
    const poboxAddr = contact.Addresses.find(a => a.AddressType === "POBOX");
    const addr = streetAddr || poboxAddr || contact.Addresses[0];
    address = [addr.AddressLine1, addr.City, addr.Region, addr.PostalCode]
      .filter(Boolean)
      .join(", ") || null;
    postcode = addr.PostalCode || null;
    suburb = addr.City || null;
    state = addr.Region || null;
  }

  return { email, phone, address, postcode, suburb, state, accountNumber };
}

// ─── Helper: fetch Xero contacts in batch (up to 50 per call) ───────────────
async function fetchXeroContactsBatch(
  contactIds: string[],
  connectionId: number,
): Promise<Map<string, ReturnType<typeof parseXeroContact>>> {
  const map = new Map<string, ReturnType<typeof parseXeroContact>>();
  if (contactIds.length === 0) return map;

  const BATCH_SIZE = 50;
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    try {
      // Xero supports filtering by IDs: /Contacts?IDs=id1,id2,...
      const idsParam = batch.join(",");
      const result = await xeroApiRequest<{ Contacts: XeroContact[] }>(
        `/Contacts?IDs=${idsParam}`,
        { connectionId }
      );
      for (const contact of (result.Contacts || [])) {
        map.set(contact.ContactID, parseXeroContact(contact));
      }
    } catch (err) {
      console.error(`[XeroImport] Batch contact fetch failed (batch ${i / BATCH_SIZE + 1}):`, err);
      // Continue with next batch — partial results are fine
    }
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < contactIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return map;
}

export const xeroClientImportRouter = router({
  /**
   * Get stats on how many orphan jobs exist (no leadId)
   */
  getOrphanStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // First get count efficiently
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(constructionJobs)
      .where(isNull(constructionJobs.leadId));

    const orphanCount = Number(countResult?.count || 0);

    // Only fetch details if there are orphans
    let orphans: { id: number; clientName: string; siteAddress: string | null; status: string }[] = [];
    if (orphanCount > 0) {
      orphans = await db
        .select({
          id: constructionJobs.id,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          status: constructionJobs.status,
        })
        .from(constructionJobs)
        .where(isNull(constructionJobs.leadId))
        .limit(50);
    }

    return {
      orphanCount,
      orphans,
    };
  }),

  /**
   * One-time bulk import: Create CRM leads for all construction jobs without a leadId.
   * Each lead is created with status "won" and linked back to the job.
   * Now also fetches Xero contact details (email, phone, address, branch, job number).
   */
  bulkImportOrphans: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Ensure Xero connection is available for fetching contact details
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });

    // Find all construction jobs without a lead, join with xeroProjectMappings
    const orphanJobs = await db
      .select({
        id: constructionJobs.id,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        quoteNumber: constructionJobs.quoteNumber,
        status: constructionJobs.status,
        xeroContactId: xeroProjectMappings.xeroContactId,
        xeroProjectName: xeroProjectMappings.xeroProjectName,
      })
      .from(constructionJobs)
      .leftJoin(xeroProjectMappings, eq(xeroProjectMappings.jobId, constructionJobs.id))
      .where(isNull(constructionJobs.leadId));

    if (orphanJobs.length === 0) {
      return { imported: 0, message: "No orphan jobs found — all jobs already have a linked lead." };
    }

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const job of orphanJobs) {
      try {
        // Parse client name into first/last
        const nameParts = (job.clientName || "Unknown").split(" ");
        const firstName = nameParts[0] || "Unknown";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Fetch Xero contact details if we have a contactId and Xero connection
        let contactEmail: string | undefined;
        let contactPhone: string | undefined;
        let contactAddress: string | undefined;
        let postcode: string | undefined;
        let suburb: string | undefined;
        let state: string | undefined;
        let clientNumber: string | undefined;
        let branchId: number | undefined;
        let constructionJobNumber: string | undefined;

        if (auth && job.xeroContactId) {
          let details: ReturnType<typeof parseXeroContact> = { email: null, phone: null, address: null, postcode: null, suburb: null, state: null, accountNumber: null };
          try {
            const result = await xeroApiRequest<{ Contacts: XeroContact[] }>(`/Contacts/${job.xeroContactId}`, {
              connectionId: auth.xeroConnectionId,
            });
            const contact = result.Contacts?.[0];
            if (contact) details = parseXeroContact(contact);
          } catch (err) {
            console.error(`[XeroImport] Failed to fetch contact ${job.xeroContactId}:`, err);
          }
          contactEmail = details.email || undefined;
          contactPhone = details.phone || undefined;
          contactAddress = details.address || job.siteAddress || undefined;
          clientNumber = details.accountNumber || undefined;
          postcode = details.postcode || undefined;
          suburb = details.suburb || undefined;
          state = details.state || undefined;
        } else {
          contactAddress = job.siteAddress || undefined;
        }

        // Derive branch from Xero project name
        if (job.xeroProjectName) {
          const branchName = deriveBranchFromProjectName(job.xeroProjectName);
          branchId = await resolveBranchId(db, branchName);
          constructionJobNumber = job.xeroProjectName;
        }

        // Generate lead number
        const leadNumber = await crmDb.getNextLeadNumber();

        // Create the lead with full contact details
        const result = await crmDb.createLead({
          leadNumber,
          contactFirstName: firstName,
          contactLastName: lastName,
          contactEmail,
          contactPhone,
          contactAddress,
          clientNumber,
          suburb,
          state,
          postcode,
          branchId,
          constructionJobNumber,
          status: "won",
          leadSource: "Xero Import",
          productType: "Construction",
          notes: `Auto-imported from Xero. Original job: ${job.quoteNumber || `#${job.id}`}`,
          createdBy: ctx.user.id,
        });

        // Link the lead back to the construction job
        await db
          .update(constructionJobs)
          .set({ leadId: result.id })
          .where(eq(constructionJobs.id, job.id));

        imported++;
      } catch (err: any) {
        failed++;
        errors.push(`Job #${job.id} (${job.clientName}): ${err.message}`);
      }
    }

    return {
      imported,
      failed,
      total: orphanJobs.length,
      errors: errors.slice(0, 10),
      message: `Imported ${imported} of ${orphanJobs.length} orphan jobs into CRM leads.`,
    };
  }),

  /**
   * Backfill existing CRM leads that were imported from Xero but are missing
   * contact details (email, phone, address, branch, constructionJobNumber).
   * Looks up the Xero contact via xeroProjectMappings and populates missing fields.
   */
  backfillContactDetails: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection — needed to fetch contact details." });

    // Find leads that came from Xero Import and are missing at least one field
    // Filter out already-complete leads in the query to avoid fetching 1200+ rows
    const leadsToBackfill = await db
      .select({
        leadId: crmLeads.id,
        leadEmail: crmLeads.contactEmail,
        leadPhone: crmLeads.contactPhone,
        leadAddress: crmLeads.contactAddress,
        clientNumber: crmLeads.clientNumber,
        leadPostcode: crmLeads.postcode,
        leadBranchId: crmLeads.branchId,
        leadJobNumber: crmLeads.constructionJobNumber,
        jobId: constructionJobs.id,
        xeroContactId: xeroProjectMappings.xeroContactId,
        xeroProjectName: xeroProjectMappings.xeroProjectName,
      })
      .from(crmLeads)
      .innerJoin(constructionJobs, eq(constructionJobs.leadId, crmLeads.id))
      .innerJoin(xeroProjectMappings, eq(xeroProjectMappings.jobId, constructionJobs.id))
      .where(
        and(
          eq(crmLeads.leadSource, "Xero Import"),
          isNotNull(xeroProjectMappings.xeroContactId),
          sql`(${crmLeads.contactEmail} IS NULL OR ${crmLeads.contactPhone} IS NULL OR ${crmLeads.contactAddress} IS NULL OR ${crmLeads.clientNumber} IS NULL OR ${crmLeads.postcode} IS NULL OR ${crmLeads.branchId} IS NULL OR ${crmLeads.constructionJobNumber} IS NULL)`
        )
      );

    if (leadsToBackfill.length === 0) {
      return { updated: 0, total: 0, skipped: 0, failed: 0, errors: [], message: "All leads already have complete contact details." };
    }

    console.log(`[Backfill] ${leadsToBackfill.length} leads need backfilling`);

    // Collect unique xeroContactIds and fetch them in batches (50 per API call)
    const uniqueContactIds = Array.from(new Set(
      leadsToBackfill
        .map(l => l.xeroContactId)
        .filter((id): id is string => !!id)
    ));

    console.log(`[Backfill] Fetching ${uniqueContactIds.length} unique Xero contacts in batches of 50`);
    const contactMap = await fetchXeroContactsBatch(uniqueContactIds, auth.xeroConnectionId);
    console.log(`[Backfill] Got details for ${contactMap.size} contacts`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const lead of leadsToBackfill) {
      try {
        const details = lead.xeroContactId ? contactMap.get(lead.xeroContactId) : null;

        // Build update object — only update fields that are currently empty
        const updates: Record<string, any> = {};
        if (!lead.leadEmail && details?.email) updates.contactEmail = details.email;
        if (!lead.leadPhone && details?.phone) updates.contactPhone = details.phone;
        if (!lead.leadAddress && details?.address) updates.contactAddress = details.address;
        if (!lead.clientNumber && details?.accountNumber) updates.clientNumber = details.accountNumber;
        if (!lead.leadPostcode && details?.postcode) updates.postcode = details.postcode;
        if (!lead.leadBranchId && lead.xeroProjectName) {
          const branchName = deriveBranchFromProjectName(lead.xeroProjectName);
          const branchId = await resolveBranchId(db, branchName);
          if (branchId) updates.branchId = branchId;
        }
        if (!lead.leadJobNumber && lead.xeroProjectName) {
          updates.constructionJobNumber = lead.xeroProjectName;
        }
        if (details?.suburb && !lead.leadPostcode) {
          updates.suburb = details.suburb;
          updates.state = details.state;
        }

        if (Object.keys(updates).length === 0) {
          skipped++;
          continue;
        }

        await db
          .update(crmLeads)
          .set(updates)
          .where(eq(crmLeads.id, lead.leadId));

        updated++;
      } catch (err: any) {
        failed++;
        errors.push(`Lead #${lead.leadId}: ${err.message}`);
      }
    }

    return {
      updated,
      skipped,
      failed,
      total: leadsToBackfill.length,
      errors: errors.slice(0, 10),
      message: `Backfilled ${updated} of ${leadsToBackfill.length} leads (${skipped} already complete, ${failed} failed).`,
    };
  }),
});

/**
 * Helper function to auto-create a CRM lead when a new construction job is created
 * from Xero sync (no existing lead). Call this from the Xero sync code.
 */
export async function ensureLeadForJob(
  jobId: number,
  clientName: string,
  siteAddress?: string | null,
  email?: string | null,
  phone?: string | null,
  createdBy?: number
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Check if job already has a lead
  const [job] = await db
    .select({ leadId: constructionJobs.leadId })
    .from(constructionJobs)
    .where(eq(constructionJobs.id, jobId));

  if (job?.leadId) return job.leadId;

  try {
    // Parse client name
    const nameParts = (clientName || "Unknown").split(" ");
    const firstName = nameParts[0] || "Unknown";
    const lastName = nameParts.slice(1).join(" ") || "";

    const leadNumber = await crmDb.getNextLeadNumber();

    const result = await crmDb.createLead({
      leadNumber,
      contactFirstName: firstName,
      contactLastName: lastName,
      contactEmail: email || undefined,
      contactPhone: phone || undefined,
      contactAddress: siteAddress || undefined,
      status: "won",
      leadSource: "Xero Import",
      productType: "Construction",
      notes: `Auto-created from Xero sync for job #${jobId}`,
      createdBy: createdBy || 1,
    });

    // Link lead to job
    await db
      .update(constructionJobs)
      .set({ leadId: result.id })
      .where(eq(constructionJobs.id, jobId));

    return result.id;
  } catch (err) {
    console.error(`[XeroImport] Failed to create lead for job ${jobId}:`, err);
    return null;
  }
}
