import fs from "fs";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { parse } from "csv-parse/sync";

const TENANT_ID = Number(process.env.IMPORT_TENANT_ID || "1");
const ITEMS_PATH =
  process.env.XERO_BUDGET_ITEMS_CSV ||
  "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/xero_budget_import_items.csv";
const BATCHES_PATH =
  process.env.XERO_BUDGET_BATCHES_CSV ||
  "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/xero_budget_import_batches.csv";

const VALID_CATEGORIES = new Set([
  "authorities_councils_certifiers",
  "builders_fees",
  "da_commissions",
  "sub_contractors_others",
  "stock_building_costs",
  "other",
]);

function norm(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function money(value) {
  const n = Number.parseFloat(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function classifyCategory(rawName) {
  const lower = String(rawName || "").toLowerCase().trim();
  if (
    lower.includes("authorit") ||
    lower.includes("council") ||
    lower.includes("certif") ||
    lower.includes("preliminar")
  ) {
    return "authorities_councils_certifiers";
  }
  if (lower.includes("builder") && (lower.includes("fee") || lower.includes("margin"))) {
    return "builders_fees";
  }
  if (lower.includes("da commis") || lower.includes("da commiss")) {
    return "da_commissions";
  }
  if (lower.includes("sub con") || lower.includes("sub cont")) {
    return "sub_contractors_others";
  }
  if (lower.includes("stock") || lower.includes("building cost") || lower.includes("material")) {
    return "stock_building_costs";
  }
  return "other";
}

function fallbackHash(row) {
  return crypto
    .createHash("sha256")
    .update(
      [
        `tenant:${TENANT_ID}`,
        row.projectName,
        row.contactName,
        row.rawCategory,
        money(row.estimatedCostExGst).toFixed(4),
      ].join("|"),
    )
    .digest("hex");
}

async function buildProjectMap(conn) {
  const [jobs] = await conn.query(
    "select id, quoteNumber, notes from construction_jobs where tenantId = ? or tenantId is null",
    [TENANT_ID],
  );
  const jobIds = new Set(jobs.map((job) => Number(job.id)));
  const projectNameToJobId = new Map();
  const add = (key, id) => {
    const normalised = norm(key);
    if (normalised && !projectNameToJobId.has(normalised)) {
      projectNameToJobId.set(normalised, Number(id));
    }
  };

  const [mappings] = await conn.query(
    [
      "select m.xeroProjectName, m.jobId",
      "from xero_project_mappings m",
      "join construction_jobs j on j.id = m.jobId",
      "where (j.tenantId = ? or j.tenantId is null)",
      "and m.xeroProjectName is not null",
    ].join(" "),
    [TENANT_ID],
  );
  for (const mapping of mappings) {
    add(mapping.xeroProjectName, mapping.jobId);
  }

  for (const job of jobs) {
    add(job.quoteNumber, job.id);
    const match = String(job.notes || "").match(/Imported from Xero Project:\s*(.+)$/i);
    if (match) add(match[1], job.id);
  }

  return { projectNameToJobId, jobIds };
}

async function recalculateBudgets(conn) {
  const [jobs] = await conn.query(
    "select id from construction_jobs where tenantId = ? or tenantId is null",
    [TENANT_ID],
  );
  const jobIds = jobs.map((job) => Number(job.id));
  if (!jobIds.length) return { updatedJobs: 0, insertedFinancialRows: 0 };

  await conn.query(
    [
      "update construction_job_financials",
      "set materialsCost = 0, labourCost = 0, otherCost = 0, totalCost = 0, margin = 0, marginPercent = 0",
      "where jobId in (?)",
    ].join(" "),
    [jobIds],
  );

  const [budgets] = await conn.query(
    [
      "select jobId, sum(estimatedCostIncGst) as totalIncGst",
      "from xero_budget_import_items",
      "where appTenantId = ? and jobId is not null and jobId in (?)",
      "group by jobId",
    ].join(" "),
    [TENANT_ID, jobIds],
  );

  let updatedJobs = 0;
  let insertedFinancialRows = 0;
  for (const budget of budgets) {
    const jobId = Number(budget.jobId);
    const total = money(budget.totalIncGst);
    const [existingRows] = await conn.query(
      "select id, contractValue from construction_job_financials where jobId = ? limit 1",
      [jobId],
    );
    const contractValue = money(existingRows[0]?.contractValue);
    const margin = contractValue - total;
    const marginPercent = contractValue > 0 ? (margin / contractValue) * 100 : 0;

    if (existingRows.length) {
      await conn.query(
        "update construction_job_financials set totalCost = ?, margin = ?, marginPercent = ? where id = ?",
        [total.toFixed(2), margin.toFixed(2), marginPercent.toFixed(2), existingRows[0].id],
      );
    } else {
      await conn.query(
        "insert into construction_job_financials (jobId, totalCost, margin, marginPercent) values (?, ?, ?, ?)",
        [jobId, total.toFixed(2), (0 - total).toFixed(2), "0.00"],
      );
      insertedFinancialRows += 1;
    }
    updatedJobs += 1;
  }

  return { updatedJobs, insertedFinancialRows };
}

async function main() {
  if (!process.env.MYSQL_PUBLIC_URL) {
    throw new Error("MYSQL_PUBLIC_URL is required. Run via Railway so production DB env is injected.");
  }

  const items = parse(fs.readFileSync(ITEMS_PATH), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  const batches = parse(fs.readFileSync(BATCHES_PATH), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  const sourceBatch = batches[0] || {};

  const conn = await mysql.createConnection(process.env.MYSQL_PUBLIC_URL);
  await conn.beginTransaction();
  try {
    const { projectNameToJobId, jobIds } = await buildProjectMap(conn);
    const buckets = {
      exactProjectOrQuote: 0,
      directJobId: 0,
      minus30000JobId: 0,
      unmatched: 0,
    };
    const unmatchedProjects = new Set();

    await conn.query("delete from xero_budget_import_items where appTenantId = ?", [TENANT_ID]);
    const [batchResult] = await conn.query(
      [
        "insert into xero_budget_import_batches",
        "(appTenantId, filename, uploadedBy, uploadedByName, totalRows, importedRows, skippedRows, duplicateRows, budgetImportStatus, errorMessage, createdAt)",
        "values (?, ?, null, ?, ?, 0, 0, ?, 'processing', null, ?)",
      ].join(" "),
      [
        TENANT_ID,
        sourceBatch.filename || "xero_budget_import_items.csv",
        sourceBatch.uploadedByName || "System Seed",
        items.length,
        Number(sourceBatch.duplicateRows || 0),
        sourceBatch.createdAt ? new Date(sourceBatch.createdAt) : new Date(),
      ],
    );
    const batchId = Number(batchResult.insertId);

    const seenHashes = new Set();
    const rows = items.map((row) => {
      const projectKey = norm(row.projectName);
      let jobId = projectNameToJobId.get(projectKey) || null;
      if (jobId) {
        buckets.exactProjectOrQuote += 1;
      } else if (jobIds.has(Number(row.jobId))) {
        jobId = Number(row.jobId);
        buckets.directJobId += 1;
      } else if (jobIds.has(Number(row.jobId) - 30000)) {
        jobId = Number(row.jobId) - 30000;
        buckets.minus30000JobId += 1;
      } else {
        buckets.unmatched += 1;
        unmatchedProjects.add(row.projectName);
      }

      const category = VALID_CATEGORIES.has(row.budgetCategory)
        ? row.budgetCategory
        : classifyCategory(row.rawCategory);
      let importHash = String(row.budgetImportHash || "").trim() || fallbackHash(row);
      if (seenHashes.has(importHash)) importHash = fallbackHash({ ...row, budgetImportHash: row.id });
      seenHashes.add(importHash);

      return [
        TENANT_ID,
        batchId,
        jobId,
        importHash,
        row.contactName || null,
        row.projectName,
        row.rawCategory || null,
        category,
        money(row.estimatedCostExGst).toFixed(2),
        money(row.estimatedCostIncGst).toFixed(2),
        row.createdAt ? new Date(row.createdAt) : new Date(),
      ];
    });

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await conn.query(
        [
          "insert into xero_budget_import_items",
          "(appTenantId, batchId, jobId, budgetImportHash, contactName, projectName, rawCategory, budgetCategory, estimatedCostExGst, estimatedCostIncGst, createdAt)",
          "values ?",
        ].join(" "),
        [chunk],
      );
    }

    const importedRows = items.length - buckets.unmatched;
    await conn.query(
      [
        "update xero_budget_import_batches",
        "set importedRows = ?, skippedRows = ?, budgetImportStatus = 'completed'",
        "where id = ? and appTenantId = ?",
      ].join(" "),
      [importedRows, buckets.unmatched, batchId, TENANT_ID],
    );

    const recalc = await recalculateBudgets(conn);
    await conn.commit();

    console.log(
      JSON.stringify(
        {
          tenantId: TENANT_ID,
          batchId,
          totalRows: items.length,
          importedRows,
          skippedRows: buckets.unmatched,
          matchBuckets: buckets,
          uniqueUnmatchedProjects: unmatchedProjects.size,
          unmatchedSample: Array.from(unmatchedProjects).slice(0, 20),
          recalc,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
