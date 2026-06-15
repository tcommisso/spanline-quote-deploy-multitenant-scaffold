/**
 * Scheduled Cost Import Processor
 * Processes large Xero cost import batches in chunks of 2000 rows per invocation.
 * Picks up batches in "processing" state that have a parsedDataKey (S3 reference).
 * Triggered by a Heartbeat cron job at /api/scheduled/cost-import-process (every 2 minutes)
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import {
  xeroCostImportBatches,
  xeroCostImportItems,
  xeroProjectMappings,
  constructionJobs,
  constructionJobFinancials,
} from "../drizzle/schema";
import { eq, and, sql, inArray, isNotNull } from "drizzle-orm";
import { storageGet } from "./storage";
import { createHash } from "crypto";
import { tenantScoped } from "./_core/tenant-scope";

const CHUNK_SIZE = 2000;

interface SerializedCostRow {
  date: string | null;
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

function generateImportHash(row: SerializedCostRow, appTenantId?: number | null): string {
  const hashInput = [
    appTenantId ? `tenant:${appTenantId}` : "",
    row.projectName,
    row.date ? row.date.slice(0, 10) : "",
    row.supplierName,
    row.itemName,
    row.costExGst.toFixed(4),
    row.reference,
    row.itemCode,
  ].join("|");
  return createHash("sha256").update(hashInput).digest("hex").slice(0, 64);
}

export function registerScheduledCostImportProcess(app: Express) {
  app.post("/api/scheduled/cost-import-process", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database unavailable" });
      }

      // Find the next batch to process (oldest first)
      const [activeBatch] = await db
        .select()
        .from(xeroCostImportBatches)
        .where(and(
          eq(xeroCostImportBatches.status, "processing"),
          isNotNull(xeroCostImportBatches.parsedDataKey),
        ))
        .orderBy(xeroCostImportBatches.id)
        .limit(1);

      if (!activeBatch) {
        return res.json({ ok: true, skipped: "no-active-batch" });
      }

      const batchId = activeBatch.id;
      const cursor = activeBatch.processingCursor || 0;
      const totalRows = activeBatch.totalRows;

      // Fetch parsed data from S3
      let allRows: SerializedCostRow[];
      try {
        const { url } = await storageGet(activeBatch.parsedDataKey!);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`S3 fetch failed: ${response.status}`);
        allRows = await response.json() as SerializedCostRow[];
      } catch (err: any) {
        // Mark batch as failed if we can't read the data
        await db.update(xeroCostImportBatches)
          .set({ status: "failed", errorMessage: `Failed to read parsed data: ${err.message}` })
          .where(eq(xeroCostImportBatches.id, batchId));
        return res.json({ ok: false, error: "data-fetch-failed", batchId });
      }

      // Get the chunk to process
      const chunkRows = allRows.slice(cursor, cursor + CHUNK_SIZE);

      if (chunkRows.length === 0) {
        // All done - mark as completed
        await db.update(xeroCostImportBatches)
          .set({ status: "completed" })
          .where(eq(xeroCostImportBatches.id, batchId));

        // Recalculate job financials
        await recalculateJobCostsFromImports(db, activeBatch.appTenantId);

        console.log(`[CostImportProcess] Batch ${batchId} completed. Imported: ${activeBatch.importedRows}, Skipped: ${activeBatch.skippedRows}, Duplicates: ${activeBatch.duplicateRows}`);
        return res.json({
          ok: true,
          completed: true,
          batchId,
          imported: activeBatch.importedRows,
          skipped: activeBatch.skippedRows,
          duplicates: activeBatch.duplicateRows,
          duration: Date.now() - startTime,
        });
      }

      // Get project mappings
      const mappings = await db
        .select({
          jobId: xeroProjectMappings.jobId,
          xeroProjectName: xeroProjectMappings.xeroProjectName,
        })
        .from(xeroProjectMappings)
        .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
        .where(tenantScoped(constructionJobs.tenantId, activeBatch.appTenantId));

      const projectNameToJobId = new Map<string, number>();
      for (const m of mappings) {
        if (m.xeroProjectName) {
          projectNameToJobId.set(m.xeroProjectName.trim().toLowerCase(), m.jobId);
        }
      }

      // Process the chunk
      let chunkImported = 0;
      let chunkDuplicates = 0;
      let chunkSkipped = 0;

      // Pre-compute hashes and match projects
      const rowsWithMeta = chunkRows.map(row => {
        const hash = generateImportHash(row, activeBatch.appTenantId);
        const legacyHash = generateImportHash(row);
        const jobId = projectNameToJobId.get(row.projectName.toLowerCase()) || null;
        return { row, hash, legacyHash, jobId };
      });

      const matchedRows = rowsWithMeta.filter(r => r.jobId !== null);
      chunkSkipped = rowsWithMeta.length - matchedRows.length;

      // Batch dedup check
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

      const newRows = matchedRows.filter(r => !existingHashes.has(r.hash) && !existingHashes.has(r.legacyHash));
      chunkDuplicates = matchedRows.length - newRows.length;

      // Batch insert
      const INSERT_BATCH = 200;
      for (let i = 0; i < newRows.length; i += INSERT_BATCH) {
        const chunk = newRows.slice(i, i + INSERT_BATCH);
        const values = chunk.map(({ row, hash, jobId }) => {
          const costIncGst = row.costExGst * 1.1;
          return {
            appTenantId: activeBatch.appTenantId,
            batchId,
            jobId: jobId!,
            importHash: hash,
            date: row.date ? new Date(row.date) : null,
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
            set: { importHash: sql`${xeroCostImportItems.importHash}` },
          });
          chunkImported += chunk.length;
        } catch (err: any) {
          for (const val of values) {
            try {
              await db.insert(xeroCostImportItems).values(val);
              chunkImported++;
            } catch (innerErr: any) {
              if ((innerErr as any).code === "ER_DUP_ENTRY") {
                chunkDuplicates++;
              } else {
                chunkSkipped++;
              }
            }
          }
        }
      }

      // Update batch progress
      const newCursor = cursor + chunkRows.length;
      const newImported = (activeBatch.importedRows || 0) + chunkImported;
      const newSkipped = (activeBatch.skippedRows || 0) + chunkSkipped;
      const newDuplicates = (activeBatch.duplicateRows || 0) + chunkDuplicates;

      await db.update(xeroCostImportBatches)
        .set({
          processingCursor: newCursor,
          importedRows: newImported,
          skippedRows: newSkipped,
          duplicateRows: newDuplicates,
        })
        .where(eq(xeroCostImportBatches.id, batchId));

      console.log(`[CostImportProcess] Batch ${batchId} chunk done: ${chunkImported} imported, ${chunkDuplicates} dupes, ${chunkSkipped} skipped. Progress: ${newCursor}/${totalRows}`);

      return res.json({
        ok: true,
        batchId,
        chunkImported,
        chunkDuplicates,
        chunkSkipped,
        progress: { cursor: newCursor, total: totalRows },
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[CostImportProcess] Fatal error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/cost-import-process", taskUid: (req as any).taskUid },
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Recalculate the xeroTotalCost on constructionJobFinancials based on imported cost items.
 */
async function recalculateJobCostsFromImports(db: any, appTenantId?: number | null) {
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

  for (const { jobId, totalIncGst } of costsByJob) {
    if (!jobId) continue;
    const total = parseFloat(totalIncGst || "0");
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
