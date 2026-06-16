/**
 * Xero GL (General Ledger) Router
 * 
 * Handles syncing financial data from Xero's Accounting API:
 * - Invoices (ACCREC) for revenue/invoiced/paid amounts
 * - Bills (ACCPAY) for costs broken down by materials/labour/other
 * - Contact addresses for postcode extraction
 * - Branch derivation from project name prefix
 */
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  constructionJobs,
  constructionJobFinancials,
  xeroProjectMappings,
  xeroProjectCosts,
  xeroSyncLogs,
  xeroCostImportItems,
} from "../drizzle/schema";
import {
  xeroApiRequest,
  getValidAccessToken,
} from "./xero-client";
import {
  deriveBranchFromProjectName,
  extractPostcodeFromContact,
  categoriseBillLineItems,
} from "./xero-gl-helpers";

// ─── Types for Xero Accounting API responses ────────────────────────────────
interface XeroInvoiceDetailed {
  InvoiceID: string;
  InvoiceNumber: string;
  Reference: string;
  Type: "ACCREC" | "ACCPAY";
  Total: number;
  AmountPaid: number;
  AmountDue: number;
  Status: string;
  DateString: string;
  Contact: { ContactID: string; Name: string };
  LineItems: Array<{
    LineAmount: number;
    AccountCode: string;
    Description: string;
    Tracking: Array<{ Name: string; Option: string }>;
  }>;
}

interface XeroContactDetailed {
  ContactID: string;
  Name: string;
  Addresses: Array<{
    AddressType: string;
    AddressLine1?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }>;
}

export const xeroGLRouter = router({
  /**
   * Sync GL data for a single job - fetches invoices, bills, and contact info
   */
  syncJobGL: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
      if (!auth)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

      // Get the project mapping for this job
      const [mapping] = await db
        .select()
        .from(xeroProjectMappings)
        .where(
          and(
            eq(xeroProjectMappings.jobId, input.jobId),
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId)
          )
        );

      if (!mapping) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No Xero project mapping found for this job" });
      }

      const result = await syncSingleJobGL(db, auth, mapping);
      return result;
    }),

  /**
   * Batch sync GL data for all mapped jobs - populates branch, postcode, and enhanced financials.
   * Runs in background to avoid timeout.
   */
  syncAllGL: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    // Mutex: check if a sync is already running (not stale — less than 30 min old)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const [activeGLSync] = await db
      .select({ id: xeroSyncLogs.id, startedAt: xeroSyncLogs.startedAt })
      .from(xeroSyncLogs)
      .where(and(
        eq(xeroSyncLogs.status, "running"),
        sql`${xeroSyncLogs.startedAt} > ${thirtyMinAgo}`
      ))
      .limit(1);
    if (activeGLSync) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A sync is already in progress. Please wait for it to complete or try again in 30 minutes.",
      });
    }
    // Mark any stale running syncs as failed (older than 30 min)
    await db
      .update(xeroSyncLogs)
      .set({ status: "failed", completedAt: new Date(), errorMessage: "Timed out — marked as stale" })
      .where(and(
        eq(xeroSyncLogs.status, "running"),
        sql`${xeroSyncLogs.startedAt} <= ${thirtyMinAgo}`
      ));

    // Create sync log
    const [syncLog] = await db.insert(xeroSyncLogs).values({
      xeroConnectionId: auth.xeroConnectionId,
      syncType: "financials",
      status: "running",
    });
    const syncLogId = syncLog.insertId;

    // Fire-and-forget background sync
    runGLBatchSync(db, auth, syncLogId).catch((err) => {
      console.error("[Xero GL Sync] Background sync failed:", err);
    });

    return { success: true, syncLogId, status: "running" };
  }),

  /**
   * Populate branch and postcode for all jobs based on existing mapping data.
   * This doesn't call Xero API - it derives from local data.
   */
  populateBranchPostcode: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
    const routing = { connectionId: auth.xeroConnectionId };

    // Get all mappings with project names
    const mappings = await db
      .select({
        jobId: xeroProjectMappings.jobId,
        xeroProjectName: xeroProjectMappings.xeroProjectName,
        xeroContactId: xeroProjectMappings.xeroContactId,
      })
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));

    let updated = 0;
    let postcodesFetched = 0;

    for (const mapping of mappings) {
      const branch = deriveBranchFromProjectName(mapping.xeroProjectName);
      
      // Derive postcode from Xero contact address
      let postcode = "";
      if (mapping.xeroContactId) {
        try {
          const contactResult = await xeroApiRequest<{ Contacts: XeroContactDetailed[] }>(
            `/Contacts/${mapping.xeroContactId}`,
            routing
          );
          if (contactResult.Contacts?.[0]) {
            postcode = extractPostcodeFromContact(contactResult.Contacts[0]);
            if (postcode) postcodesFetched++;
          }
        } catch {
          // Contact fetch failed, skip postcode
        }
      }

      if (branch || postcode) {
        const updates: any = {};
        if (branch) updates.branch = branch;
        if (postcode) updates.postcode = postcode;

        await db
          .update(constructionJobFinancials)
          .set(updates)
          .where(eq(constructionJobFinancials.jobId, mapping.jobId));
        updated++;
      }
    }

    return { success: true, updated, postcodesFetched };
  }),

  /**
   * Quick branch population from project names only (no API calls).
   * Safe to run frequently as it only uses local data.
   */
  populateBranches: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "construction" });
    if (!auth)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });

    const mappings = await db
      .select({
        jobId: xeroProjectMappings.jobId,
        xeroProjectName: xeroProjectMappings.xeroProjectName,
      })
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));

    let updated = 0;
    for (const mapping of mappings) {
      const branch = deriveBranchFromProjectName(mapping.xeroProjectName);
      if (branch) {
        await db
          .update(constructionJobFinancials)
          .set({ branch })
          .where(eq(constructionJobFinancials.jobId, mapping.jobId));
        updated++;
      }
    }

    return { success: true, updated };
  }),

  /**
   * Get GL summary for a specific job (from local data, no API call)
   */
  getJobGLSummary: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [fin] = await db
        .select()
        .from(constructionJobFinancials)
        .where(eq(constructionJobFinancials.jobId, input.jobId));

      if (!fin) return null;

      const xeroInvoiced = parseFloat(String(fin.xeroInvoicedAmount || "0"));
      const xeroPaid = parseFloat(String(fin.xeroPaidAmount || "0"));
      const xeroLabour = parseFloat(String(fin.xeroLabourCost || "0"));
      const xeroMaterials = parseFloat(String(fin.xeroMaterialsCost || "0"));
      const xeroOther = parseFloat(String(fin.xeroOtherCost || "0"));
      const xeroTotalCost = parseFloat(String(fin.xeroTotalCost || "0"));
      const xeroContractValue = parseFloat(String(fin.xeroContractValue || "0"));
      const outstanding = xeroInvoiced - xeroPaid;
      const margin = xeroInvoiced - xeroTotalCost;
      const marginPercent = xeroInvoiced > 0 ? (margin / xeroInvoiced) * 100 : 0;

      return {
        // Green boxes
        contractValue: xeroContractValue,
        materialsCost: xeroMaterials,
        otherCost: xeroOther,
        // Red boxes
        branch: fin.branch || "",
        postcode: fin.postcode || "",
        // Purple boxes
        estimatedValue: xeroContractValue,
        actualCosts: xeroTotalCost,
        invoiced: xeroInvoiced,
        paid: xeroPaid,
        margin,
        marginPercent: Math.round(marginPercent * 10) / 10,
        outstanding,
        // Cost breakdown
        labourCost: xeroLabour,
      };
    }),
});

// ─── Background GL Batch Sync ────────────────────────────────────────────────
async function runGLBatchSync(
  db: any,
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number },
  syncLogId: number
): Promise<void> {
  let processed = 0;
  let failed = 0;

  try {
    const mappings = await db
      .select()
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId));

    console.log(`[Xero GL Sync] Starting batch sync for ${mappings.length} projects`);

    for (const mapping of mappings) {
      try {
        await syncSingleJobGL(db, auth, mapping);
        processed++;
        
        // Log progress every 50 jobs
        if (processed % 50 === 0) {
          console.log(`[Xero GL Sync] Progress: ${processed}/${mappings.length}`);
          await db
            .update(xeroSyncLogs)
            .set({ itemsProcessed: processed, itemsFailed: failed })
            .where(eq(xeroSyncLogs.id, syncLogId));
        }
      } catch (err: any) {
        failed++;
        console.error(`[Xero GL Sync] Failed job ${mapping.jobId}:`, err.message);
      }
    }

    await db
      .update(xeroSyncLogs)
      .set({
        status: "completed",
        itemsProcessed: processed,
        itemsFailed: failed,
        completedAt: new Date(),
      })
      .where(eq(xeroSyncLogs.id, syncLogId));

    console.log(`[Xero GL Sync] Completed: ${processed} processed, ${failed} failed`);
  } catch (err: any) {
    await db
      .update(xeroSyncLogs)
      .set({
        status: "failed",
        errorMessage: err.message,
        completedAt: new Date(),
      })
      .where(eq(xeroSyncLogs.id, syncLogId));
    console.error("[Xero GL Sync] Batch failed:", err.message);
  }
}

// ─── Single Job GL Sync ──────────────────────────────────────────────────────
async function syncSingleJobGL(
  db: any,
  auth: { accessToken: string; tenantId: string; xeroConnectionId: number },
  mapping: any
): Promise<{ invoiced: number; paid: number; costs: number; branch: string; postcode: string }> {
  const projectName = mapping.xeroProjectName || "";
  const contactId = mapping.xeroContactId;

  // 1. Derive branch from project name
  const branch = deriveBranchFromProjectName(projectName);

  // 2. Get postcode from contact address
  let postcode = "";
  if (contactId) {
    try {
      const contactResult = await xeroApiRequest<{ Contacts: XeroContactDetailed[] }>(
        `/Contacts/${contactId}`,
        { connectionId: auth.xeroConnectionId }
      );
      if (contactResult.Contacts?.[0]) {
        postcode = extractPostcodeFromContact(contactResult.Contacts[0]);
      }
    } catch {
      // Contact fetch failed, skip postcode
    }
  }

  // 3. Get invoices (ACCREC) for this contact
  let totalInvoiced = 0;
  let totalPaid = 0;
  if (contactId) {
    try {
      const invoicesResult = await xeroApiRequest<{ Invoices: XeroInvoiceDetailed[] }>(
        `/Invoices?ContactIDs=${contactId}&Statuses=AUTHORISED,PAID`,
        { connectionId: auth.xeroConnectionId }
      );
      const accrecInvoices = (invoicesResult.Invoices || []).filter(inv => inv.Type === "ACCREC");
      if (accrecInvoices.length) {
        totalInvoiced = accrecInvoices.reduce((sum, inv) => sum + (inv.Total || 0), 0);
        totalPaid = accrecInvoices.reduce((sum, inv) => sum + (inv.AmountPaid || 0), 0);
      }
    } catch {
      // Invoice fetch failed
    }
  }

  // 4. Get bills (ACCPAY) matched by project code in line item descriptions
  let materials = 0;
  let labour = 0;
  let other = 0;
  
  // Extract job number from project name (e.g., "NSW-98520-IS-AB-ic" → "98520")
  const jobNumberMatch = projectName.match(/-(\d{4,6})-/);
  const jobNumber = jobNumberMatch ? jobNumberMatch[1] : "";
  const projectCode = projectName; // Full project code for matching
  
  type AccpayBillForCostSync = {
    InvoiceID: string;
    InvoiceNumber: string;
    Reference: string;
    Type: string;
    Total: number;
    SubTotal: number;
    AmountPaid: number;
    AmountDue: number;
    Status: string;
    DateString: string;
    Contact: { Name: string; ContactID: string };
    LineItems: Array<{
      LineItemID: string;
      Description: string;
      LineAmount: number;
      AccountCode: string;
      Tracking: Array<{ Name: string; Option: string }>;
    }>;
  };
  
  const matchedBills: AccpayBillForCostSync[] = [];
  
  if (projectCode) {
    try {
      let billPage = 1;
      const maxBillPages = 50; // Up to 5000 bills

      while (billPage <= maxBillPages) {
        const billsResult = await xeroApiRequest<{ Invoices: AccpayBillForCostSync[] }>(
          `/Invoices?where=Type%3D%3D%22ACCPAY%22&Statuses=AUTHORISED,PAID&page=${billPage}`,
          { timeoutMs: 60000, connectionId: auth.xeroConnectionId }
        );
        const pageBills = billsResult.Invoices || [];
        
        // Match bills by project code in line item descriptions or tracking
        for (const bill of pageBills) {
          if (!bill.LineItems?.length) continue;
          const hasMatch = bill.LineItems.some((line: any) => {
            const desc = (line.Description || "").toLowerCase();
            // Check if description contains the full project code
            if (desc.includes(projectCode.toLowerCase())) return true;
            // Check if description contains the job number
            if (jobNumber && desc.includes(jobNumber)) return true;
            // Check tracking categories for project match
            if (line.Tracking?.length) {
              return line.Tracking.some((t: any) =>
                t.Name?.toLowerCase() === "project" &&
                t.Option?.toLowerCase().includes(projectCode.toLowerCase())
              );
            }
            return false;
          });
          if (hasMatch) matchedBills.push(bill);
        }
        
        console.log(`[SyncJobGL] ACCPAY page ${billPage}: ${pageBills.length} bills, ${matchedBills.length} matched so far`);
        if (pageBills.length < 100) break;
        billPage++;
      }
    } catch (err: any) {
      console.warn(`[SyncJobGL] Failed to fetch ACCPAY bills: ${err.message}`);
    }
  }
  
  // Categorise matched bills
  for (const bill of matchedBills) {
    if (bill.LineItems?.length) {
      const categorised = categoriseBillLineItems(bill.LineItems);
      materials += categorised.materials;
      labour += categorised.labour;
      other += categorised.other;
    } else {
      other += bill.Total || 0;
    }
  }
  
  // Store matched bills in xero_project_costs table
  if (matchedBills.length > 0) {
    // Clear existing costs for this mapping
    await db.delete(xeroProjectCosts).where(eq(xeroProjectCosts.mappingId, mapping.id));
    
    // Insert matched bills
    for (const bill of matchedBills) {
      const matchedLines = bill.LineItems.filter((line: any) => {
        const desc = (line.Description || "").toLowerCase();
        if (desc.includes(projectCode.toLowerCase())) return true;
        if (jobNumber && desc.includes(jobNumber)) return true;
        if (line.Tracking?.length) {
          return line.Tracking.some((t: any) =>
            t.Name?.toLowerCase() === "project" &&
            t.Option?.toLowerCase().includes(projectCode.toLowerCase())
          );
        }
        return false;
      });
      
      for (const line of matchedLines) {
        await db.insert(xeroProjectCosts).values({
          mappingId: mapping.id,
          xeroInvoiceId: bill.InvoiceID,
          invoiceNumber: bill.InvoiceNumber || "",
          supplierName: bill.Contact?.Name || "Unknown",
          description: line.Description || "",
          lineAmount: (Math.round((line.LineAmount || 0) * 100) / 100).toFixed(2),
          totalAmount: bill.Total ? bill.Total.toFixed(2) : null,
          amountPaid: bill.AmountPaid ? bill.AmountPaid.toFixed(2) : "0.00",
          amountDue: bill.AmountDue ? bill.AmountDue.toFixed(2) : "0.00",
          status: bill.Status || "UNKNOWN",
          invoiceDate: bill.DateString || null,
          reference: bill.Reference || null,
          costType: "bill",
        });
      }
    }
    console.log(`[SyncJobGL] Stored ${matchedBills.length} matched bills for project ${projectCode}`);
  }

  const outstanding = totalInvoiced - totalPaid;

  // 5. Recalculate xeroTotalCost from imported cost report items (single source of truth)
  const [importedCostRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${xeroCostImportItems.costIncGst}), 0)` })
    .from(xeroCostImportItems)
    .where(eq(xeroCostImportItems.jobId, mapping.jobId));
  const importedCost = parseFloat(importedCostRow?.total || "0");
  const automaticCost = materials + labour + other;
  const xeroTotalCost = importedCost > 0 ? importedCost : automaticCost;
  const margin = totalInvoiced - xeroTotalCost;

  // 5. Update the financials record
  const updates: any = {
    xeroInvoicedAmount: totalInvoiced.toFixed(2),
    xeroPaidAmount: totalPaid.toFixed(2),
    xeroLabourCost: importedCost > 0 ? "0" : labour.toFixed(2),
    xeroMaterialsCost: importedCost > 0 ? "0" : materials.toFixed(2),
    xeroOtherCost: importedCost > 0 ? "0" : other.toFixed(2),
    xeroTotalCost: xeroTotalCost.toFixed(2),
  };

  if (branch) updates.branch = branch;
  if (postcode) updates.postcode = postcode;

  await db
    .update(constructionJobFinancials)
    .set(updates)
    .where(eq(constructionJobFinancials.jobId, mapping.jobId));

  // 6. Update the mapping totals
  await db
    .update(xeroProjectMappings)
    .set({
      totalInvoiced: totalInvoiced.toFixed(2),
      totalCosts: xeroTotalCost.toFixed(2),
      totalProfit: margin.toFixed(2),
      lastSyncedAt: new Date(),
    })
    .where(eq(xeroProjectMappings.id, mapping.id));

  return { invoiced: totalInvoiced, paid: totalPaid, costs: xeroTotalCost, branch, postcode };
}
