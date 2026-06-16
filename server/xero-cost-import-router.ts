/**
 * Xero Cost Import Router
 * 
 * Handles importing Xero "Project Details for Cost Report" exports.
 * Supports both the older supplier-grouped Excel report and the newer flat CSV/XLSX report:
 *   - Date, Contact, Project Name, Project State, Project Item Type, Project Item Name, Item Code, Supplier, Reference, Cost
 * 
 * Only rows with Item Type = "Expense" and Cost != 0 are imported.
 * Costs from the report are ex-GST; we multiply by 1.1 for inc-GST storage.
 */
import { z } from "zod";
import { eq, and, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  xeroCostImportBatches,
  xeroCostImportItems,
  xeroProjectMappings,
  constructionJobs,
  constructionJobFinancials,
  crmLeads,
} from "../drizzle/schema";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { storagePut, storageGet } from "./storage";
import { tenantScoped } from "./_core/tenant-scope";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedCostRow {
  date: Date | null;
  projectName: string;
  projectState: string;
  itemType: string;
  itemName: string;
  itemCode: string;
  reference: string;
  costExGst: number;
  actual: number;
  totalInvoiced: number;
  supplierName: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateImportHash(row: ParsedCostRow, appTenantId?: number | null): string {
  // Create a unique hash from the key fields to prevent duplicates
  const hashInput = [
    appTenantId ? `tenant:${appTenantId}` : "",
    row.projectName,
    row.date ? row.date.toISOString().slice(0, 10) : "",
    row.supplierName,
    row.itemName,
    row.costExGst.toFixed(4),
    row.reference,
    row.itemCode,
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

function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date number
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return candidates
    .map((candidate) => headers.indexOf(candidate))
    .find((index) => index !== -1) ?? -1;
}

function cell(row: any[], index: number) {
  return index >= 0 ? row[index] : undefined;
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

function scoreJobCandidate(group: { projectName: string; contactName?: string | null }, job: {
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

function resolveCostJobId(
  row: ParsedCostRow,
  projectNameToJobId: Map<string, number>,
  jobs: Array<{ id: number; quoteNumber: string | null; clientName: string; siteAddress: string | null }>,
) {
  const projectKey = row.projectName.toLowerCase().trim();
  const exact = projectNameToJobId.get(projectKey);
  if (exact) return exact;

  const scored = jobs
    .map((job) => ({ job, score: scoreJobCandidate({ projectName: row.projectName }, job) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 70 ? best.job.id : null;
}

function isClosedProjectState(value: string | null | undefined) {
  return (value || "").trim().toLowerCase() === "closed";
}

async function completeClosedJobs(
  db: any,
  closedJobIds: Set<number>,
  jobs: Array<{ id: number; status: string; leadId: number | null }>,
  appTenantId?: number | null,
) {
  if (!closedJobIds.size) return { closedJobsUpdated: 0, closedLeadsUpdated: 0 };

  let closedJobsUpdated = 0;
  const closedIds = Array.from(closedJobIds);
  const closedJobs = jobs.filter((job) => closedIds.includes(job.id));
  for (const job of closedJobs) {
    if (job.status !== "completed") {
      const [result] = await db.update(constructionJobs)
        .set({ status: "completed", updatedAt: new Date() })
        .where(and(
          eq(constructionJobs.id, job.id),
          tenantScoped(constructionJobs.tenantId, appTenantId),
        ));
      closedJobsUpdated += Number((result as any)?.affectedRows || 0);
    }
  }

  let closedLeadsUpdated = 0;
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
        tenantScoped(crmLeads.tenantId, appTenantId),
      ));
    closedLeadsUpdated = Number((leadResult as any)?.affectedRows || 0);
  }

  return { closedJobsUpdated, closedLeadsUpdated };
}

/**
 * Parse the Xero Project Details report Excel file.
 * Detects supplier grouping headers and extracts expense rows.
 */
function parseXeroCostReport(buffer: Buffer): {
  rows: ParsedCostRow[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  errors: string[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Get all rows as array of arrays (raw, no header mapping)
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    dateNF: "yyyy-mm-dd",
  });

  const rows: ParsedCostRow[] = [];
  const errors: string[] = [];
  let currentSupplier = "";
  let dateRangeStart: string | null = null;
  let dateRangeEnd: string | null = null;

  // Find the header row (contains "Project Name" or "Date" in first few columns)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (row && row.some((cell: any) => {
      const s = String(cell || "").toLowerCase();
      return s === "project name" || s === "date";
    })) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    // Default: assume header is at row 7 (0-indexed: 6)
    headerRowIdx = 6;
  }

  const headers = (rawData[headerRowIdx] || []).map((h: any) =>
    String(h || "").toLowerCase().trim()
  );
  const dateIdx = findHeaderIndex(headers, ["date"]);
  const projectNameIdx = findHeaderIndex(headers, ["project name"]);
  const projectStateIdx = findHeaderIndex(headers, ["project state"]);
  const itemTypeIdx = findHeaderIndex(headers, ["project item type", "item type"]);
  const itemNameIdx = findHeaderIndex(headers, ["project item name", "item name"]);
  const itemCodeIdx = findHeaderIndex(headers, ["item code"]);
  const supplierIdx = findHeaderIndex(headers, ["supplier"]);
  const referenceIdx = findHeaderIndex(headers, ["reference"]);
  const costIdx = findHeaderIndex(headers, ["cost"]);
  const actualIdx = findHeaderIndex(headers, ["actual"]);
  const totalInvoicedIdx = findHeaderIndex(headers, ["total invoiced"]);

  if (projectNameIdx === -1 || itemTypeIdx === -1 || costIdx === -1) {
    errors.push("Missing required columns: Project Name, Project Item Type/Item Type, and Cost");
    return { rows, dateRangeStart, dateRangeEnd, errors };
  }

  // Process data rows starting after header
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const colA = row[0];
    const colB = row[1];
    const itemTypeCell = cell(row, itemTypeIdx);

    // Detect supplier header for older grouped exports when there is no Supplier column.
    if (supplierIdx === -1 && colA && !colB && !itemTypeCell) {
      const text = String(colA).trim();
      if (text && !(colA instanceof Date)) {
        if (text.startsWith("Total ")) {
          // Total row - skip
          continue;
        }
        // This is a supplier header
        currentSupplier = text;
        continue;
      }
    }

    // Check if this is an expense data row
    const itemType = String(itemTypeCell || "").trim();
    if (itemType !== "Expense") continue;

    const costExGst = parseMoney(cell(row, costIdx));
    
    // Skip rows where cost is 0 or nil
    if (!costExGst || costExGst === 0) continue;

    const date = parseExcelDate(cell(row, dateIdx));
    const projectName = String(cell(row, projectNameIdx) || "").trim();
    const projectState = String(cell(row, projectStateIdx) || "").trim();
    const itemName = String(cell(row, itemNameIdx) || "").trim();
    const itemCode = String(cell(row, itemCodeIdx) || "").trim();
    const reference = String(cell(row, referenceIdx) || "").trim();
    const actual = parseMoney(cell(row, actualIdx));
    const totalInvoiced = parseMoney(cell(row, totalInvoicedIdx));
    const supplierName = supplierIdx >= 0
      ? String(cell(row, supplierIdx) || "").trim()
      : currentSupplier;

    if (!projectName) {
      errors.push(`Row ${i + 1}: Missing project name`);
      continue;
    }

    // Track date range
    if (date) {
      const dateStr = date.toISOString().slice(0, 10);
      if (!dateRangeStart || dateStr < dateRangeStart) dateRangeStart = dateStr;
      if (!dateRangeEnd || dateStr > dateRangeEnd) dateRangeEnd = dateStr;
    }

    rows.push({
      date,
      projectName,
      projectState,
      itemType,
      itemName,
      itemCode,
      reference,
      costExGst,
      actual,
      totalInvoiced,
      supplierName,
    });
  }

  return { rows, dateRangeStart, dateRangeEnd, errors };
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const xeroCostImportRouter = router({
  /**
   * Upload and import a Xero Project Details cost report
   */
  importCostReport: protectedProcedure
    .input(z.object({
      fileBase64: z.string(), // Base64-encoded Excel file
      filename: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Decode the file
      const buffer = Buffer.from(input.fileBase64, "base64");

      // Parse the Excel file
      const { rows, dateRangeStart, dateRangeEnd, errors } = parseXeroCostReport(buffer);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No expense rows with non-zero cost found in the file. ${errors.length > 0 ? `Errors: ${errors.slice(0, 5).join("; ")}` : ""}`,
        });
      }

      // For large files (>10k rows), use chunked background processing
      const CHUNK_THRESHOLD = 10000;

      if (rows.length > CHUNK_THRESHOLD) {
        // Store parsed data in S3 for background processing
        const dataKey = `cost-imports/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        const serializedRows = JSON.stringify(rows.map(r => ({
          ...r,
          date: r.date ? r.date.toISOString() : null,
        })));
        await storagePut(dataKey, Buffer.from(serializedRows), "application/json");

        // Create batch record in "processing" state with cursor at 0
        const [batch] = await db.insert(xeroCostImportBatches).values({
          appTenantId: ctx.tenant.id,
          filename: input.filename,
          uploadedBy: ctx.user.id,
          uploadedByName: ctx.user.name || "Unknown",
          totalRows: rows.length,
          dateRangeStart,
          dateRangeEnd,
          processingCursor: 0,
          parsedDataKey: dataKey,
          status: "processing",
        }).$returningId();

        return {
          batchId: batch.id,
          totalRows: rows.length,
          imported: 0,
          duplicates: 0,
          skipped: 0,
          chunked: true,
          unmatchedProjects: [] as string[],
          dateRange: dateRangeStart && dateRangeEnd ? `${dateRangeStart} to ${dateRangeEnd}` : null,
          errors: errors.slice(0, 10),
        };
      }

      // ─── Small file: process inline (original logic) ─────────────────────
      const [batch] = await db.insert(xeroCostImportBatches).values({
        appTenantId: ctx.tenant.id,
        filename: input.filename,
        uploadedBy: ctx.user.id,
        uploadedByName: ctx.user.name || "Unknown",
        totalRows: rows.length,
        dateRangeStart,
        dateRangeEnd,
        status: "processing",
      }).$returningId();

      const batchId = batch.id;

      // Get all project mappings to match project names to job IDs
      const mappings = await db
        .select({
          jobId: xeroProjectMappings.jobId,
          xeroProjectName: xeroProjectMappings.xeroProjectName,
        })
        .from(xeroProjectMappings)
        .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
        .where(tenantScoped(constructionJobs.tenantId, ctx.tenant.id));

      // Build a lookup map: normalize project name → jobId
      const projectNameToJobId = new Map<string, number>();
      for (const m of mappings) {
        if (m.xeroProjectName) {
          projectNameToJobId.set(m.xeroProjectName.trim().toLowerCase(), m.jobId);
        }
      }

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
      for (const job of jobs) {
        if (job.quoteNumber) {
          projectNameToJobId.set(job.quoteNumber.trim().toLowerCase(), job.id);
        }
      }

      let importedCount = 0;
      let duplicateCount = 0;
      let skippedCount = 0;
      const closedJobIds = new Set<number>();

      // Pre-compute hashes and filter unmatched projects upfront
      const rowsWithMeta = rows.map(row => {
        const hash = generateImportHash(row, ctx.tenant.id);
        const legacyHash = generateImportHash(row);
        const jobId = resolveCostJobId(row, projectNameToJobId, jobs);
        if (jobId && isClosedProjectState(row.projectState)) {
          closedJobIds.add(jobId);
        }
        return { row, hash, legacyHash, jobId };
      });

      // Separate matched vs unmatched
      const matchedRows = rowsWithMeta.filter(r => r.jobId !== null);
      const unmatchedCount = rowsWithMeta.length - matchedRows.length;
      skippedCount = unmatchedCount;

      // Batch duplicate check: query existing hashes in chunks of 500
      const DEDUP_BATCH = 500;
      const existingHashes = new Set<string>();
      const allHashes = Array.from(new Set(matchedRows.flatMap(r => [r.hash, r.legacyHash])));
      for (let i = 0; i < allHashes.length; i += DEDUP_BATCH) {
        const hashChunk = allHashes.slice(i, i + DEDUP_BATCH);
        const existing = await db
          .select({ importHash: xeroCostImportItems.importHash })
          .from(xeroCostImportItems)
          .where(inArray(xeroCostImportItems.importHash, hashChunk));
        for (const e of existing) {
          existingHashes.add(e.importHash);
        }
      }

      // Filter out duplicates
      const newRows = matchedRows.filter(r => !existingHashes.has(r.hash) && !existingHashes.has(r.legacyHash));
      duplicateCount = matchedRows.length - newRows.length;

      // Batch insert in chunks of 200 using INSERT IGNORE to handle race conditions
      const INSERT_BATCH = 200;
      for (let i = 0; i < newRows.length; i += INSERT_BATCH) {
        const chunk = newRows.slice(i, i + INSERT_BATCH);
        const values = chunk.map(({ row, hash, jobId }) => {
          const costIncGst = row.costExGst * 1.1;
          return {
            appTenantId: ctx.tenant.id,
            batchId,
            jobId: jobId!,
            importHash: hash,
            date: row.date,
            projectName: row.projectName,
            projectState: row.projectState,
            itemType: row.itemType,
            itemName: row.itemName || null,
            itemCode: row.itemCode || null,
            reference: row.reference ? row.reference.substring(0, 512) : null,
            supplierName: row.supplierName || null,
            costExGst: row.costExGst.toFixed(4),
            costIncGst: costIncGst.toFixed(4),
            actual: row.actual.toFixed(4),
            totalInvoiced: row.totalInvoiced.toFixed(4),
          };
        });
        try {
          await db.insert(xeroCostImportItems).values(values).onDuplicateKeyUpdate({
            set: { importHash: sql`${xeroCostImportItems.importHash}` }, // no-op update on duplicate
          });
          importedCount += chunk.length;
        } catch (err: any) {
          // If batch fails, fall back to individual inserts for this chunk
          for (const val of values) {
            try {
              await db.insert(xeroCostImportItems).values(val);
              importedCount++;
            } catch (innerErr: any) {
              if (innerErr.code === "ER_DUP_ENTRY") {
                duplicateCount++;
              } else {
                skippedCount++;
              }
            }
          }
        }
      }

      // Update batch record
      await db.update(xeroCostImportBatches)
        .set({
          importedRows: importedCount,
          skippedRows: skippedCount,
          duplicateRows: duplicateCount,
          status: "completed",
        })
        .where(eq(xeroCostImportBatches.id, batchId));

      // Update job financials with new cost totals
      await recalculateJobCostsFromImports(db, ctx.tenant.id);
      const closedUpdates = await completeClosedJobs(db, closedJobIds, jobs, ctx.tenant.id);

      return {
        batchId,
        totalRows: rows.length,
        imported: importedCount,
        duplicates: duplicateCount,
        skipped: skippedCount,
        chunked: false,
        unmatchedProjects: Array.from(new Set(rowsWithMeta.filter(r => !r.jobId).map(r => r.row.projectName))).slice(0, 50),
        closedJobsUpdated: closedUpdates.closedJobsUpdated,
        closedLeadsUpdated: closedUpdates.closedLeadsUpdated,
        dateRange: dateRangeStart && dateRangeEnd ? `${dateRangeStart} to ${dateRangeEnd}` : null,
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
      .from(xeroCostImportBatches)
      .where(tenantScoped(xeroCostImportBatches.appTenantId, ctx.tenant.id))
      .orderBy(sql`${xeroCostImportBatches.createdAt} DESC`)
      .limit(20);
    return batches;
  }),

  /**
   * Get imported cost items for a specific job
   */
  getJobCosts: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const items = await db
        .select({ item: xeroCostImportItems })
        .from(xeroCostImportItems)
        .innerJoin(constructionJobs, eq(xeroCostImportItems.jobId, constructionJobs.id))
        .where(and(
          eq(xeroCostImportItems.jobId, input.jobId),
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          tenantScoped(xeroCostImportItems.appTenantId, ctx.tenant.id),
        ))
        .orderBy(sql`${xeroCostImportItems.date} DESC`);
      return items.map((row: any) => row.item);
    }),

  /**
   * Get cost summary for a specific job (grouped by supplier)
   */
  getJobCostSummary: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { totalExGst: 0, totalIncGst: 0, bySupplier: [] };
      
      const items = await db
        .select({
          supplierName: xeroCostImportItems.supplierName,
          totalExGst: sql<string>`SUM(${xeroCostImportItems.costExGst})`,
          totalIncGst: sql<string>`SUM(${xeroCostImportItems.costIncGst})`,
          itemCount: sql<number>`COUNT(*)`,
        })
        .from(xeroCostImportItems)
        .innerJoin(constructionJobs, eq(xeroCostImportItems.jobId, constructionJobs.id))
        .where(and(
          eq(xeroCostImportItems.jobId, input.jobId),
          tenantScoped(constructionJobs.tenantId, ctx.tenant.id),
          tenantScoped(xeroCostImportItems.appTenantId, ctx.tenant.id),
        ))
        .groupBy(xeroCostImportItems.supplierName);

      const totalExGst = items.reduce((sum, i) => sum + parseFloat(i.totalExGst || "0"), 0);
      const totalIncGst = items.reduce((sum, i) => sum + parseFloat(i.totalIncGst || "0"), 0);

      return {
        totalExGst,
        totalIncGst,
        bySupplier: items.map(i => ({
          supplierName: i.supplierName || "Unknown",
          totalExGst: parseFloat(i.totalExGst || "0"),
          totalIncGst: parseFloat(i.totalIncGst || "0"),
          itemCount: i.itemCount,
        })),
      };
    }),

  /**
   * Delete an import batch and all its items
   */
  deleteBatch: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      
      await db.delete(xeroCostImportBatches).where(and(
        eq(xeroCostImportBatches.id, input.batchId),
        tenantScoped(xeroCostImportBatches.appTenantId, ctx.tenant.id),
      ));
      
      // Recalculate job costs after deletion
      await recalculateJobCostsFromImports(db, ctx.tenant.id);
      
      return { success: true };
    }),
});

/**
 * Recalculate the xeroTotalCost on constructionJobFinancials based on imported cost items.
 * This updates the "Actual Costs" displayed in the Financials tab.
 */
async function recalculateJobCostsFromImports(db: any, appTenantId?: number | null) {
  // Get total costs per job from imported items
  const costsByJob = await db
    .select({
      jobId: xeroCostImportItems.jobId,
      totalIncGst: sql<string>`SUM(${xeroCostImportItems.costIncGst})`,
    })
    .from(xeroCostImportItems)
    .where(and(
      sql`${xeroCostImportItems.jobId} IS NOT NULL`,
      tenantScoped(xeroCostImportItems.appTenantId, appTenantId),
    ))
    .groupBy(xeroCostImportItems.jobId);

  // Update each job's financials
  for (const { jobId, totalIncGst } of costsByJob) {
    if (!jobId) continue;
    const total = parseFloat(totalIncGst || "0");
    
    // Check if financials record exists
    const [existing] = await db
      .select({ id: constructionJobFinancials.id })
      .from(constructionJobFinancials)
      .where(eq(constructionJobFinancials.jobId, jobId))
      .limit(1);

    if (existing) {
      await db.update(constructionJobFinancials)
        .set({ xeroTotalCost: total.toFixed(2) })
        .where(eq(constructionJobFinancials.jobId, jobId));
    }
  }
}
