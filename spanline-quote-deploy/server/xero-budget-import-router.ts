/**
 * Xero Budget Import Router
 * 
 * Handles importing Xero "Project Financials" (budget) Excel exports.
 * The report has columns: Contact, Project Name, Project Item Type, Project Item Name, Estimated Cost
 * 
 * Budget categories are normalised from the raw "Project Item Name" column:
 *   - Authorities, Councils & Certifiers
 *   - Builder's Fees
 *   - DA Commissions
 *   - Sub Contractors - Others
 *   - Stock & Building Costs
 *   - Other (catch-all for unmatched)
 * 
 * Values from the spreadsheet are ex-GST; we multiply by 1.1 for inc-GST storage.
 * Each import replaces ALL budget data (full refresh, not incremental).
 */
import { z } from "zod";
import { eq, and, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  xeroBudgetImportBatches,
  xeroBudgetImportItems,
  xeroProjectMappings,
  constructionJobs,
  constructionJobFinancials,
} from "../drizzle/schema";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { tenantScoped } from "./_core/tenant-scope";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedBudgetRow {
  contactName: string;
  projectName: string;
  itemType: string;
  itemName: string;
  estimatedCostExGst: number;
}

type BudgetCategory =
  | "authorities_councils_certifiers"
  | "builders_fees"
  | "da_commissions"
  | "sub_contractors_others"
  | "stock_building_costs"
  | "other";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateBudgetHash(row: ParsedBudgetRow, appTenantId?: number | null): string {
  const hashInput = [
    appTenantId ? `tenant:${appTenantId}` : "",
    row.projectName,
    row.contactName,
    row.itemName,
    row.estimatedCostExGst.toFixed(4),
  ].join("|");
  return createHash("sha256").update(hashInput).digest("hex").slice(0, 64);
}

/**
 * Normalise the raw "Project Item Name" into one of 6 budget categories.
 */
function classifyCategory(rawName: string): BudgetCategory {
  const lower = (rawName || "").toLowerCase().trim();

  // Authorities, Councils & Certifiers
  if (
    lower.includes("authorit") ||
    lower.includes("council") ||
    lower.includes("certif") ||
    lower.includes("preliminar")
  ) {
    return "authorities_councils_certifiers";
  }

  // Builder's Fees
  if (
    (lower.includes("builder") && (lower.includes("fee") || lower.includes("margin")))
  ) {
    return "builders_fees";
  }

  // DA Commissions
  if (lower.includes("da commis") || lower.includes("da commiss")) {
    return "da_commissions";
  }

  // Sub Contractors - Others
  if (lower.includes("sub con") || lower.includes("sub cont")) {
    return "sub_contractors_others";
  }

  // Stock & Building Costs
  if (
    lower.includes("stock") ||
    lower.includes("building cost") ||
    lower.includes("material")
  ) {
    return "stock_building_costs";
  }

  return "other";
}

/**
 * Parse the Xero Project Financials (budget) Excel file.
 * Expected columns: Contact, Project Name, Project Item Type, Project Item Name, Estimated Cost
 */
function parseXeroBudgetReport(buffer: Buffer): {
  rows: ParsedBudgetRow[];
  errors: string[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  });

  const rows: ParsedBudgetRow[] = [];
  const errors: string[] = [];

  // Find the header row (contains "Contact" and "Project Name")
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    const row = rawData[i];
    if (
      row &&
      row.some((cell: any) => String(cell || "").toLowerCase() === "contact") &&
      row.some((cell: any) => String(cell || "").toLowerCase() === "project name")
    ) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    errors.push("Could not find header row with 'Contact' and 'Project Name' columns");
    return { rows, errors };
  }

  // Map header columns
  const headers = rawData[headerRowIdx].map((h: any) =>
    String(h || "").toLowerCase().trim()
  );
  const contactIdx = headers.indexOf("contact");
  const projectNameIdx = headers.indexOf("project name");
  const itemTypeIdx = headers.indexOf("project item type");
  const itemNameIdx = headers.indexOf("project item name");
  const costIdx = headers.indexOf("estimated cost");

  if (contactIdx === -1 || projectNameIdx === -1 || costIdx === -1) {
    errors.push("Missing required columns: Contact, Project Name, Estimated Cost");
    return { rows, errors };
  }

  // Process data rows
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[projectNameIdx]) continue;

    const contact = String(row[contactIdx] || "").trim();
    const projectName = String(row[projectNameIdx] || "").trim();
    const itemType = itemTypeIdx >= 0 ? String(row[itemTypeIdx] || "").trim() : "";
    const itemName = itemNameIdx >= 0 ? String(row[itemNameIdx] || "").trim() : "";
    const cost = parseFloat(String(row[costIdx] || "0")) || 0;

    // Skip total rows and empty rows
    if (contact.toLowerCase() === "total" || projectName.toLowerCase() === "total") continue;
    if (!projectName || cost === 0) continue;

    rows.push({
      contactName: contact,
      projectName,
      itemType,
      itemName,
      estimatedCostExGst: cost,
    });
  }

  return { rows, errors };
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const xeroBudgetImportRouter = router({
  /**
   * Import a budget report Excel file.
   * This is a FULL REFRESH — all existing budget items are deleted and replaced.
   */
  importBudgetReport: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileBase64: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Decode file
      const buffer = Buffer.from(input.fileBase64, "base64");
      const { rows, errors } = parseXeroBudgetReport(buffer);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No valid budget rows found. ${errors.join("; ")}`,
        });
      }

      // Create batch record
      const [batch] = await db.insert(xeroBudgetImportBatches).values({
        appTenantId: ctx.tenant.id,
        filename: input.filename,
        uploadedBy: ctx.user.id,
        uploadedByName: ctx.user.name || "Unknown",
        totalRows: rows.length,
      });
      const batchId = batch.insertId;

      // Build project name → jobId mapping
      const mappings = await db
        .select({
          jobId: xeroProjectMappings.jobId,
          xeroProjectName: xeroProjectMappings.xeroProjectName,
        })
        .from(xeroProjectMappings)
        .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
        .where(and(
          sql`${xeroProjectMappings.xeroProjectName} IS NOT NULL`,
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
        ));

      const projectNameToJobId = new Map<string, number>();
      for (const m of mappings) {
        if (m.xeroProjectName && m.jobId) {
          projectNameToJobId.set(m.xeroProjectName.toLowerCase().trim(), m.jobId);
        }
      }

      // Also try matching by quoteNumber from construction_jobs
      const jobs = await db
        .select({ id: constructionJobs.id, quoteNumber: constructionJobs.quoteNumber })
        .from(constructionJobs)
        .where(tenantScoped(constructionJobs.tenantId, ctx.tenant.id));
      for (const j of jobs) {
        if (j.quoteNumber) {
          projectNameToJobId.set(j.quoteNumber.toLowerCase().trim(), j.id);
        }
      }

      // Delete this tenant's existing budget items (full refresh for the current tenant only)
      await db.delete(xeroBudgetImportItems)
        .where(tenantScoped(xeroBudgetImportItems.appTenantId, ctx.tenant.id));

      let importedCount = 0;
      let skippedCount = 0;
      const unmatchedProjects = new Set<string>();

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const values = chunk.map((row) => {
          const jobId = projectNameToJobId.get(row.projectName.toLowerCase().trim()) || null;
          if (!jobId) {
            unmatchedProjects.add(row.projectName);
            skippedCount++;
          } else {
            importedCount++;
          }

          const category = classifyCategory(row.itemName);
          const costExGst = row.estimatedCostExGst;
          const costIncGst = costExGst * 1.1;

          return {
            appTenantId: ctx.tenant.id,
            batchId: Number(batchId),
            jobId,
            importHash: generateBudgetHash(row, ctx.tenant.id),
            contactName: row.contactName,
            projectName: row.projectName,
            rawCategory: row.itemName,
            category,
            estimatedCostExGst: costExGst.toFixed(2),
            estimatedCostIncGst: costIncGst.toFixed(2),
          };
        });

        // Use individual inserts to handle duplicate hash conflicts gracefully
        for (const val of values) {
          try {
            await db.insert(xeroBudgetImportItems).values(val);
          } catch (e: any) {
            if (e.code === "ER_DUP_ENTRY") {
              // Update existing row
              await db
                .update(xeroBudgetImportItems)
                .set({
                  jobId: val.jobId,
                  contactName: val.contactName,
                  rawCategory: val.rawCategory,
                  category: val.category,
                  estimatedCostExGst: val.estimatedCostExGst,
                  estimatedCostIncGst: val.estimatedCostIncGst,
                })
                .where(eq(xeroBudgetImportItems.importHash, val.importHash));
            } else {
              throw e;
            }
          }
        }
      }

      // Update batch status
      await db
        .update(xeroBudgetImportBatches)
        .set({
          importedRows: importedCount,
          skippedRows: skippedCount,
          status: "completed",
        })
        .where(eq(xeroBudgetImportBatches.id, Number(batchId)));

      // Recalculate budget totals on constructionJobFinancials
      await recalculateBudgetsFromImports(db, ctx.tenant.id);

      return {
        batchId: Number(batchId),
        totalRows: rows.length,
        imported: importedCount,
        skipped: skippedCount,
        unmatchedProjects: Array.from(unmatchedProjects),
        errors: errors.slice(0, 10),
      };
    }),

  /**
   * Get import history (list of batches)
   */
  getImportHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const batches = await db
      .select()
      .from(xeroBudgetImportBatches)
      .where(tenantScoped(xeroBudgetImportBatches.appTenantId, ctx.tenant.id))
      .orderBy(sql`${xeroBudgetImportBatches.createdAt} DESC`)
      .limit(20);
    return batches;
  }),

  /**
   * Get budget breakdown for a specific job
   */
  getJobBudget: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { categories: [], total: 0 };

      // Get budget items grouped by category
      const items = await db
        .select({
          category: xeroBudgetImportItems.category,
          totalExGst: sql<string>`SUM(${xeroBudgetImportItems.estimatedCostExGst})`,
          totalIncGst: sql<string>`SUM(${xeroBudgetImportItems.estimatedCostIncGst})`,
          itemCount: sql<number>`COUNT(*)`,
        })
        .from(xeroBudgetImportItems)
        .innerJoin(constructionJobs, eq(xeroBudgetImportItems.jobId, constructionJobs.id))
        .where(and(
          eq(xeroBudgetImportItems.jobId, input.jobId),
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          tenantScoped(xeroBudgetImportItems.appTenantId, ctx.tenant.id),
        ))
        .groupBy(xeroBudgetImportItems.category);

      // Also get individual line items for detail view
      const lineItems = await db
        .select({
          id: xeroBudgetImportItems.id,
          rawCategory: xeroBudgetImportItems.rawCategory,
          category: xeroBudgetImportItems.category,
          estimatedCostExGst: xeroBudgetImportItems.estimatedCostExGst,
          estimatedCostIncGst: xeroBudgetImportItems.estimatedCostIncGst,
          contactName: xeroBudgetImportItems.contactName,
        })
        .from(xeroBudgetImportItems)
        .innerJoin(constructionJobs, eq(xeroBudgetImportItems.jobId, constructionJobs.id))
        .where(and(
          eq(xeroBudgetImportItems.jobId, input.jobId),
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          tenantScoped(xeroBudgetImportItems.appTenantId, ctx.tenant.id),
        ))
        .orderBy(sql`${xeroBudgetImportItems.estimatedCostIncGst} DESC`);

      const totalIncGst = items.reduce(
        (sum, i) => sum + parseFloat(i.totalIncGst || "0"),
        0
      );

      return {
        categories: items.map((i) => ({
          category: i.category,
          totalExGst: parseFloat(i.totalExGst || "0"),
          totalIncGst: parseFloat(i.totalIncGst || "0"),
          itemCount: i.itemCount,
        })),
        lineItems,
        total: totalIncGst,
      };
    }),

  /**
   * Delete a batch and recalculate
   */
  deleteBatch: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .delete(xeroBudgetImportBatches)
        .where(and(
          eq(xeroBudgetImportBatches.id, input.batchId),
          tenantScoped(xeroBudgetImportBatches.appTenantId, ctx.tenant.id),
        ));

      await recalculateBudgetsFromImports(db, ctx.tenant.id);
      return { success: true };
    }),
});

/**
 * Recalculate the budget totalCost on constructionJobFinancials from imported budget items.
 * This sums all budget categories per job and writes to materialsCost (total budget).
 */
async function recalculateBudgetsFromImports(db: any, appTenantId?: number | null) {
  const tenantJobs = await db
    .select({ id: constructionJobs.id })
    .from(constructionJobs)
    .where(tenantScoped(constructionJobs.tenantId, appTenantId));
  const tenantJobIds = tenantJobs.map((job: { id: number }) => job.id);
  if (!tenantJobIds.length) return;

  // First, reset this tenant's budget fields to 0
  await db
    .update(constructionJobFinancials)
    .set({
      materialsCost: "0",
      labourCost: "0",
      otherCost: "0",
      totalCost: "0",
      margin: "0",
      marginPercent: "0",
    })
    .where(inArray(constructionJobFinancials.jobId, tenantJobIds));

  // Get total budget per job from imported items
  const budgetsByJob = await db
    .select({
      jobId: xeroBudgetImportItems.jobId,
      totalIncGst: sql<string>`SUM(${xeroBudgetImportItems.estimatedCostIncGst})`,
    })
    .from(xeroBudgetImportItems)
    .where(and(
      sql`${xeroBudgetImportItems.jobId} IS NOT NULL`,
      tenantScoped(xeroBudgetImportItems.appTenantId, appTenantId),
      inArray(xeroBudgetImportItems.jobId, tenantJobIds),
    ))
    .groupBy(xeroBudgetImportItems.jobId);

  // Update each job's financials
  for (const { jobId, totalIncGst } of budgetsByJob) {
    if (!jobId) continue;
    const total = parseFloat(totalIncGst || "0");

    // Check if financials record exists
    const [existing] = await db
      .select({ id: constructionJobFinancials.id, contractValue: constructionJobFinancials.contractValue })
      .from(constructionJobFinancials)
      .where(eq(constructionJobFinancials.jobId, jobId));

    if (existing) {
      const contractValue = parseFloat(existing.contractValue || "0");
      const margin = contractValue - total;
      const marginPercent = contractValue > 0 ? (margin / contractValue) * 100 : 0;

      await db
        .update(constructionJobFinancials)
        .set({
          totalCost: total.toFixed(2),
          margin: margin.toFixed(2),
          marginPercent: marginPercent.toFixed(2),
        })
        .where(eq(constructionJobFinancials.jobId, jobId));
    } else {
      await db.insert(constructionJobFinancials).values({
        jobId,
        totalCost: total.toFixed(2),
        margin: (0 - total).toFixed(2),
        marginPercent: "0",
      });
    }
  }
}
