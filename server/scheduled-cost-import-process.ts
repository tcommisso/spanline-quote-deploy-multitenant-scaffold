/**
 * Scheduled Cost Import Processor
 * Processes large Xero cost import batches in chunks of 2000 rows per invocation.
 * Picks up batches in "processing" state that have a parsedDataKey (S3 reference).
 * Triggered by a Heartbeat cron job at /api/scheduled/cost-import-process (every 2 minutes)
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { getDb } from "./db";
import {
  xeroCostImportBatches,
  xeroCostImportItems,
  xeroProjectMappings,
  constructionJobs,
  constructionJobFinancials,
  crmLeads,
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

function scoreJobCandidate(group: { projectName: string }, job: {
  id: number;
  quoteNumber: string | null;
  clientName: string;
  siteAddress: string | null;
}) {
  const project = normaliseSearchText(group.projectName);
  const quote = normaliseSearchText(job.quoteNumber);
  const client = normaliseSearchText(job.clientName);
  const address = normaliseSearchText(job.siteAddress);
  let score = 0;

  if (quote && project.includes(quote)) score += 90;
  if (quote && group.projectName.toLowerCase().includes(quote.replace(/\s+/g, ""))) score += 70;
  if (client && project && (project.includes(client) || client.includes(project))) score += 45;

  for (const token of tokensFor(group.projectName)) {
    if (quote.includes(token)) score += 12;
    if (client.includes(token)) score += 8;
    if (address.includes(token)) score += 6;
  }

  return score;
}

function resolveCostJobId(
  row: SerializedCostRow,
  projectNameToJobId: Map<string, number>,
  jobs: Array<{ id: number; quoteNumber: string | null; clientName: string; siteAddress: string | null }>,
) {
  const exact = projectNameToJobId.get(row.projectName.toLowerCase().trim());
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

export function registerScheduledCostImportProcess(app: Express) {
  app.post("/api/scheduled/cost-import-process", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
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
        .where(tenantScoped(constructionJobs.tenantId, activeBatch.appTenantId));
      for (const job of jobs) {
        if (job.quoteNumber) {
          projectNameToJobId.set(job.quoteNumber.trim().toLowerCase(), job.id);
        }
      }

      // Process the chunk
      let chunkImported = 0;
      let chunkDuplicates = 0;
      let chunkSkipped = 0;
      const closedJobIds = new Set<number>();

      // Pre-compute hashes and match projects
      const rowsWithMeta = chunkRows.map(row => {
        const hash = generateImportHash(row, activeBatch.appTenantId);
        const legacyHash = generateImportHash(row);
        const jobId = resolveCostJobId(row, projectNameToJobId, jobs);
        if (jobId && isClosedProjectState(row.projectState)) {
          closedJobIds.add(jobId);
        }
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
      const closedUpdates = await completeClosedJobs(db, closedJobIds, jobs, activeBatch.appTenantId);

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
        closedJobsUpdated: closedUpdates.closedJobsUpdated,
        closedLeadsUpdated: closedUpdates.closedLeadsUpdated,
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
