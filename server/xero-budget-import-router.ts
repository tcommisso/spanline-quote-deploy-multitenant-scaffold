/**
 * Xero Budget Import Router
 * 
 * Handles importing Xero "Project Details" budget/task exports.
 * The report has columns: Contact, Project Name, Project State, Project Item Type, Project Item Name, Estimate
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
 * Imports are cumulative and deduplicated by hash, so an initial baseline and later exports can coexist.
 */
import { z } from "zod";
import { eq, and, sql, inArray, isNull, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  xeroBudgetImportBatches,
  xeroBudgetImportItems,
  xeroProjectMappings,
  constructionJobs,
  constructionJobFinancials,
  crmLeads,
} from "../drizzle/schema";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { tenantScoped } from "./_core/tenant-scope";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedBudgetRow {
  contactName: string;
  projectName: string;
  projectState: string;
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

function parseMoney(value: unknown) {
  const normalised = String(value ?? "")
    .replace(/[$,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const amount = Number(normalised);
  return Number.isFinite(amount) ? amount : 0;
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return candidates
    .map((candidate) => headers.indexOf(candidate))
    .find((index) => index !== -1) ?? -1;
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
 * Parse the Xero Project Details budget/task export.
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
  const projectStateIdx = headers.indexOf("project state");
  const itemTypeIdx = headers.indexOf("project item type");
  const itemNameIdx = headers.indexOf("project item name");
  const costIdx = findHeaderIndex(headers, ["estimated cost", "estimate"]);

  if (contactIdx === -1 || projectNameIdx === -1 || costIdx === -1) {
    errors.push("Missing required columns: Contact, Project Name, Estimated Cost or Estimate");
    return { rows, errors };
  }

  // Process data rows
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[projectNameIdx]) continue;

    const contact = String(row[contactIdx] || "").trim();
    const projectName = String(row[projectNameIdx] || "").trim();
    const projectState = projectStateIdx >= 0 ? String(row[projectStateIdx] || "").trim() : "";
    const itemType = itemTypeIdx >= 0 ? String(row[itemTypeIdx] || "").trim() : "";
    const itemName = itemNameIdx >= 0 ? String(row[itemNameIdx] || "").trim() : "";
    const cost = parseMoney(row[costIdx]);

    // Skip total rows and empty rows
    if (contact.toLowerCase() === "total" || projectName.toLowerCase() === "total") continue;
    if (!projectName || cost === 0) continue;

    rows.push({
      contactName: contact,
      projectName,
      projectState,
      itemType,
      itemName,
      estimatedCostExGst: cost,
    });
  }

  return { rows, errors };
}

function normaliseSearchText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensFor(value: string | null | undefined) {
  return normaliseSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function scoreJobCandidate(group: { projectName: string; contactName: string | null }, job: {
  id: number;
  quoteNumber: string | null;
  clientName: string;
  siteAddress: string | null;
}) {
  const project = normaliseSearchText(group.projectName);
  const contact = normaliseSearchText(group.contactName);
  const quote = normaliseSearchText(job.quoteNumber);
  const client = normaliseSearchText(job.clientName);
  const address = normaliseSearchText(job.siteAddress);
  let score = 0;

  if (quote && project.includes(quote)) score += 90;
  if (quote && group.projectName.toLowerCase().includes(quote.replace(/\s+/g, ""))) score += 70;
  if (client && contact && (client.includes(contact) || contact.includes(client))) score += 65;
  if (client && project && (project.includes(client) || client.includes(project))) score += 45;

  for (const token of tokensFor(group.projectName)) {
    if (quote.includes(token)) score += 12;
    if (client.includes(token)) score += 8;
    if (address.includes(token)) score += 6;
  }
  for (const token of tokensFor(group.contactName)) {
    if (client.includes(token)) score += 12;
    if (address.includes(token)) score += 4;
  }

  return score;
}

function resolveBudgetJobId(
  row: ParsedBudgetRow,
  projectNameToJobId: Map<string, number>,
  jobs: Array<{ id: number; quoteNumber: string | null; clientName: string; siteAddress: string | null }>,
) {
  const projectKey = row.projectName.toLowerCase().trim();
  const exact = projectNameToJobId.get(projectKey);
  if (exact) return exact;

  const scored = jobs
    .map((job) => ({ job, score: scoreJobCandidate(row, job) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 70 ? best.job.id : null;
}

function isClosedProjectState(value: string | null | undefined) {
  return (value || "").trim().toLowerCase() === "closed";
}

function clampMarginPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-999.99, Math.min(999.99, value));
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const xeroBudgetImportRouter = router({
  /**
   * Import a budget report Excel file.
   * Default behaviour is cumulative: rows are upserted by hash so multiple Xero exports
   * can be loaded without duplicating the existing Manus/import baseline.
   */
  importBudgetReport: protectedProcedure
    .input(
      z.object({
        filename: z.string(),
        fileBase64: z.string(),
        replaceExisting: z.boolean().default(false),
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
        .select({
          id: constructionJobs.id,
          quoteNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          status: constructionJobs.status,
          leadId: constructionJobs.leadId,
        })
        .from(constructionJobs)
        .where(tenantScoped(constructionJobs.tenantId, ctx.tenant.id));
      for (const j of jobs) {
        if (j.quoteNumber) {
          projectNameToJobId.set(j.quoteNumber.toLowerCase().trim(), j.id);
        }
      }

      if (input.replaceExisting) {
        await db.delete(xeroBudgetImportItems)
          .where(tenantScoped(xeroBudgetImportItems.appTenantId, ctx.tenant.id));
      }

      let importedCount = 0;
      let skippedCount = 0;
      let duplicateCount = 0;
      const unmatchedProjects = new Set<string>();
      const closedJobIds = new Set<number>();

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const values = chunk.map((row) => {
          const jobId = resolveBudgetJobId(row, projectNameToJobId, jobs);
          if (!jobId) {
            unmatchedProjects.add(row.projectName);
            skippedCount++;
          } else {
            importedCount++;
            if (isClosedProjectState(row.projectState)) closedJobIds.add(jobId);
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
            projectState: row.projectState || null,
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
              duplicateCount++;
              // Update existing row
              await db
                .update(xeroBudgetImportItems)
                .set({
                  jobId: val.jobId,
                  contactName: val.contactName,
                  projectState: val.projectState,
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
          duplicateRows: duplicateCount,
          status: "completed",
        })
        .where(eq(xeroBudgetImportBatches.id, Number(batchId)));

      let closedJobsUpdated = 0;
      let closedLeadsUpdated = 0;
      if (closedJobIds.size) {
        const closedIds = Array.from(closedJobIds);
        const closedJobs = jobs.filter((job) => closedIds.includes(job.id));
        for (const job of closedJobs) {
          if (job.status !== "completed") {
            const [result] = await db.update(constructionJobs)
              .set({ status: "completed", updatedAt: new Date() })
              .where(and(
                eq(constructionJobs.id, job.id),
                tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
              ));
            closedJobsUpdated += Number((result as any)?.affectedRows || 0);
          }
        }

        const leadIds = Array.from(new Set(
          closedJobs
            .map((job) => job.leadId)
            .filter((id): id is number => Boolean(id))
        ));
        if (leadIds.length) {
          const [leadResult] = await db.update(crmLeads)
            .set({ status: "completed", updatedAt: new Date() })
            .where(and(
              inArray(crmLeads.id, leadIds),
              tenantScoped(crmLeads.tenantId, ctx.tenant.id),
            ));
          closedLeadsUpdated = Number((leadResult as any)?.affectedRows || 0);
        }
      }

      // Recalculate budget totals on constructionJobFinancials
      await recalculateBudgetsFromImports(db, ctx.tenant.id);

      return {
        batchId: Number(batchId),
        totalRows: rows.length,
        imported: importedCount,
        skipped: skippedCount,
        duplicates: duplicateCount,
        closedJobsUpdated,
        closedLeadsUpdated,
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
   * Summarise imported budget rows that could not be linked to a construction job.
   * These rows still have value, so admins can manually attach them after import.
   */
  getUnmatchedSummary: protectedProcedure
    .input(z.object({
      search: z.string().trim().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rows: [], totalGroups: 0, totalItems: 0, totalIncGst: 0 };

      const search = input?.search?.trim();
      const where = [
        tenantScoped(xeroBudgetImportItems.appTenantId, ctx.tenant.id),
        isNull(xeroBudgetImportItems.jobId),
      ];
      if (search) {
        const pattern = `%${search}%`;
        where.push(or(
          like(xeroBudgetImportItems.projectName, pattern),
          like(xeroBudgetImportItems.contactName, pattern),
        ) as any);
      }

      const groups = await db
        .select({
          projectName: xeroBudgetImportItems.projectName,
          contactName: xeroBudgetImportItems.contactName,
          itemCount: sql<number>`COUNT(*)`,
          totalExGst: sql<string>`SUM(${xeroBudgetImportItems.estimatedCostExGst})`,
          totalIncGst: sql<string>`SUM(${xeroBudgetImportItems.estimatedCostIncGst})`,
          firstSeen: sql<Date>`MIN(${xeroBudgetImportItems.createdAt})`,
        })
        .from(xeroBudgetImportItems)
        .where(and(...where))
        .groupBy(xeroBudgetImportItems.projectName, xeroBudgetImportItems.contactName)
        .orderBy(sql`SUM(${xeroBudgetImportItems.estimatedCostIncGst}) DESC`)
        .limit(input?.limit ?? 25)
        .offset(input?.offset ?? 0);

      const [totals] = await db
        .select({
          totalGroups: sql<number>`COUNT(DISTINCT CONCAT(${xeroBudgetImportItems.projectName}, '|', COALESCE(${xeroBudgetImportItems.contactName}, '')))`,
          totalItems: sql<number>`COUNT(*)`,
          totalIncGst: sql<string>`SUM(${xeroBudgetImportItems.estimatedCostIncGst})`,
        })
        .from(xeroBudgetImportItems)
        .where(and(...where));

      const jobs = await db
        .select({
          id: constructionJobs.id,
          quoteNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
        })
        .from(constructionJobs)
        .where(tenantScoped(constructionJobs.tenantId, ctx.tenant.id));

      return {
        rows: groups.map((group) => {
          const suggestions = jobs
            .map((job) => ({ ...job, score: scoreJobCandidate(group, job) }))
            .filter((job) => job.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

          return {
            projectName: group.projectName,
            contactName: group.contactName,
            itemCount: Number(group.itemCount || 0),
            totalExGst: parseFloat(group.totalExGst || "0"),
            totalIncGst: parseFloat(group.totalIncGst || "0"),
            firstSeen: group.firstSeen,
            suggestions,
          };
        }),
        totalGroups: Number(totals?.totalGroups || 0),
        totalItems: Number(totals?.totalItems || 0),
        totalIncGst: parseFloat(totals?.totalIncGst || "0"),
      };
    }),

  searchJobs: protectedProcedure
    .input(z.object({
      search: z.string().trim().min(2),
      limit: z.number().min(1).max(20).default(8),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const pattern = `%${input.search}%`;
      return db
        .select({
          id: constructionJobs.id,
          quoteNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          status: constructionJobs.status,
        })
        .from(constructionJobs)
        .where(and(
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          or(
            like(constructionJobs.quoteNumber, pattern),
            like(constructionJobs.clientName, pattern),
            like(constructionJobs.siteAddress, pattern),
          ),
        ))
        .limit(input.limit);
    }),

  attachUnmatchedProject: protectedProcedure
    .input(z.object({
      projectName: z.string().trim().min(1),
      contactName: z.string().trim().nullable().optional(),
      jobId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [job] = await db
        .select({ id: constructionJobs.id, clientName: constructionJobs.clientName, quoteNumber: constructionJobs.quoteNumber })
        .from(constructionJobs)
        .where(and(
          eq(constructionJobs.id, input.jobId),
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
        ))
        .limit(1);

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Construction job not found for this tenant." });
      }

      const conditions = [
        tenantScoped(xeroBudgetImportItems.appTenantId, ctx.tenant.id),
        isNull(xeroBudgetImportItems.jobId),
        eq(xeroBudgetImportItems.projectName, input.projectName),
      ];
      if (input.contactName) {
        conditions.push(eq(xeroBudgetImportItems.contactName, input.contactName));
      }

      const [result] = await db
        .update(xeroBudgetImportItems)
        .set({ jobId: input.jobId })
        .where(and(...conditions));

      await recalculateBudgetsFromImports(db, ctx.tenant.id);

      return {
        success: true,
        attachedRows: (result as any)?.affectedRows ?? 0,
        job,
      };
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
      const marginPercent = clampMarginPercent(contractValue > 0 ? (margin / contractValue) * 100 : 0);

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
