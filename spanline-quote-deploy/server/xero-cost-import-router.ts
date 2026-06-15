/**
 * Xero Cost Import Router
 * 
 * Handles importing Xero "Project Details for Cost Report" Excel exports.
 * The report is grouped by supplier with the following structure:
 *   - Supplier header row: Only column A has the supplier name (text, not a date)
 *   - Data rows: Date, Project Name, Project State, Item Type, Item Name, Item Code, Reference, Hours, Cost, Actual, Total Invoiced
 *   - Total row: "Total <supplier name>" in column A with sum formulas
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
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
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

  // Process data rows starting after header
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const colA = row[0];
    const colB = row[1];
    const colD = row[3]; // Item Type column

    // Detect supplier header: Column A has text (not a date), columns B-D are empty
    if (colA && !colB && !colD) {
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
    const itemType = String(colD || "").trim();
    if (itemType !== "Expense") continue;

    // Parse the cost value (column I, index 8)
    const costRaw = row[8];
    const costExGst = typeof costRaw === "number" ? costRaw : parseFloat(String(costRaw || "0"));
    
    // Skip rows where cost is 0 or nil
    if (!costExGst || costExGst === 0) continue;

    const date = parseExcelDate(colA);
    const projectName = String(row[1] || "").trim();
    const projectState = String(row[2] || "").trim();
    const itemName = String(row[4] || "").trim();
    const itemCode = String(row[5] || "").trim();
    const reference = String(row[6] || "").trim();
    const actual = typeof row[9] === "number" ? row[9] : parseFloat(String(row[9] || "0"));
    const totalInvoiced = typeof row[10] === "number" ? row[10] : parseFloat(String(row[10] || "0"));

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
      supplierName: currentSupplier,
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

      let importedCount = 0;
      let duplicateCount = 0;
      let skippedCount = 0;

      // Pre-compute hashes and filter unmatched projects upfront
      const rowsWithMeta = rows.map(row => {
        const hash = generateImportHash(row, ctx.tenant.id);
        const legacyHash = generateImportHash(row);
        const jobId = projectNameToJobId.get(row.projectName.toLowerCase()) || null;
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

      return {
        batchId,
        totalRows: rows.length,
        imported: importedCount,
        duplicates: duplicateCount,
        skipped: skippedCount,
        chunked: false,
        unmatchedProjects: Array.from(new Set(rows.filter(r => !projectNameToJobId.get(r.projectName.toLowerCase())).map(r => r.projectName))).slice(0, 50),
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
