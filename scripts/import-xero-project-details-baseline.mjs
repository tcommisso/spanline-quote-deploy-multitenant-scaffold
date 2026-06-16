import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";

const TENANT_ID = Number(process.env.IMPORT_TENANT_ID || "1");
const APPLY = process.argv.includes("--apply");

const DEFAULT_BUDGET_FILES = [
  "/Users/tony_mac/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Commisso_Group_Pty_Limited_-_Project_Details_for_cost_report-6.csv",
  "/Users/tony_mac/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Commisso_Group_Pty_Limited_-_Project_Details_for_cost_report-7.xlsx",
];
const DEFAULT_COST_FILES = [
  "/Users/tony_mac/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Commisso_Group_Pty_Limited_-_Project_Details_for_cost_report-8.csv",
];

const BUDGET_FILES = splitFileList(process.env.XERO_PROJECT_DETAILS_BUDGET_FILES) || DEFAULT_BUDGET_FILES;
const COST_FILES = splitFileList(process.env.XERO_PROJECT_DETAILS_COST_FILES) || DEFAULT_COST_FILES;

const VALID_BUDGET_CATEGORIES = new Set([
  "authorities_councils_certifiers",
  "builders_fees",
  "da_commissions",
  "sub_contractors_others",
  "stock_building_costs",
  "other",
]);

function splitFileList(value) {
  const files = String(value || "")
    .split("::")
    .map((file) => file.trim())
    .filter(Boolean);
  return files.length ? files : null;
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function normaliseKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactKey(value) {
  return normaliseKey(value).replace(/\s+/g, "");
}

function parseMoney(value) {
  const amount = Number(
    String(value ?? "")
      .replace(/[$,\s]/g, "")
      .replace(/^\((.*)\)$/, "-$1"),
  );
  return Number.isFinite(amount) ? amount : 0;
}

function moneyString(value, scale = 2) {
  return parseMoney(value).toFixed(scale);
}

function clampMarginPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-999.99, Math.min(999.99, value));
}

function findHeaderIndex(headers, candidates) {
  return candidates
    .map((candidate) => headers.indexOf(candidate))
    .find((index) => index !== -1) ?? -1;
}

function parseExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    return date ? new Date(date.y, date.m - 1, date.d) : null;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (match) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.indexOf(match[2].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) return new Date(Number(match[3]), monthIndex, Number(match[1]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classifyCategory(rawName) {
  const lower = String(rawName || "").toLowerCase().trim();
  if (lower.includes("authorit") || lower.includes("council") || lower.includes("certif") || lower.includes("preliminar")) {
    return "authorities_councils_certifiers";
  }
  if (lower.includes("builder") && (lower.includes("fee") || lower.includes("margin"))) {
    return "builders_fees";
  }
  if (lower.includes("da commis") || lower.includes("da commiss")) return "da_commissions";
  if (lower.includes("sub con") || lower.includes("sub cont")) return "sub_contractors_others";
  if (lower.includes("stock") || lower.includes("building cost") || lower.includes("material")) return "stock_building_costs";
  return "other";
}

function isClosedProjectState(value) {
  return String(value || "").trim().toLowerCase() === "closed";
}

function readRows(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".csv") {
    const rows = parse(fs.readFileSync(filePath), {
      columns: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
    });
    return rows.map((row) => {
      const normalised = {};
      for (const [key, value] of Object.entries(row)) {
        normalised[String(key).toLowerCase().trim()] = value;
      }
      return normalised;
    });
  }

  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(30, rawRows.length); i += 1) {
    const headers = (rawRows[i] || []).map((cell) => String(cell || "").toLowerCase().trim());
    if (headers.includes("project name") && (headers.includes("contact") || headers.includes("date"))) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) throw new Error(`Could not find a Project Details header row in ${filePath}`);

  const headers = rawRows[headerRowIndex].map((header) => String(header || "").toLowerCase().trim());
  return rawRows.slice(headerRowIndex + 1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      if (header) object[header] = row[index];
    });
    return object;
  });
}

function cell(row, candidates) {
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function parseBudgetFiles(files) {
  const rows = [];
  for (const filePath of files) {
    const fileRows = readRows(filePath);
    for (const row of fileRows) {
      const contactName = clean(cell(row, ["contact"]));
      const projectName = clean(cell(row, ["project name"]));
      const projectState = clean(cell(row, ["project state"])) || "";
      const itemType = clean(cell(row, ["project item type", "item type"])) || "";
      const itemName = clean(cell(row, ["project item name", "item name"])) || "";
      const estimate = parseMoney(cell(row, ["estimated cost", "estimate"]));
      if (!projectName || projectName.toLowerCase() === "total" || estimate === 0) continue;
      rows.push({
        sourceFile: path.basename(filePath),
        contactName,
        projectName,
        projectState,
        itemType,
        itemName,
        estimatedCostExGst: estimate,
      });
    }
  }
  return rows;
}

function parseCostFiles(files) {
  const rows = [];
  let dateRangeStart = null;
  let dateRangeEnd = null;

  for (const filePath of files) {
    const fileRows = readRows(filePath);
    for (const row of fileRows) {
      const itemType = clean(cell(row, ["project item type", "item type"])) || "";
      if (itemType !== "Expense") continue;

      const costExGst = parseMoney(cell(row, ["cost"]));
      if (costExGst === 0) continue;

      const projectName = clean(cell(row, ["project name"]));
      if (!projectName || projectName.toLowerCase() === "total") continue;

      const date = parseExcelDate(cell(row, ["date"]));
      if (date) {
        const dateString = date.toISOString().slice(0, 10);
        if (!dateRangeStart || dateString < dateRangeStart) dateRangeStart = dateString;
        if (!dateRangeEnd || dateString > dateRangeEnd) dateRangeEnd = dateString;
      }

      rows.push({
        sourceFile: path.basename(filePath),
        date,
        contactName: clean(cell(row, ["contact"])),
        projectName,
        projectState: clean(cell(row, ["project state"])) || "",
        itemType,
        itemName: clean(cell(row, ["project item name", "item name"])) || "",
        itemCode: clean(cell(row, ["item code"])) || "",
        supplierName: clean(cell(row, ["supplier"])) || "",
        reference: clean(cell(row, ["reference"])) || "",
        costExGst,
        actual: parseMoney(cell(row, ["actual"])),
        totalInvoiced: parseMoney(cell(row, ["total invoiced"])),
      });
    }
  }

  return { rows, dateRangeStart, dateRangeEnd };
}

function budgetHash(row) {
  return crypto
    .createHash("sha256")
    .update([
      `tenant:${TENANT_ID}`,
      row.projectName,
      row.contactName || "",
      row.itemName || "",
      row.estimatedCostExGst.toFixed(4),
    ].join("|"))
    .digest("hex")
    .slice(0, 64);
}

function costHash(row) {
  return crypto
    .createHash("sha256")
    .update([
      `tenant:${TENANT_ID}`,
      row.projectName,
      row.date ? row.date.toISOString().slice(0, 10) : "",
      row.supplierName || "",
      row.itemName || "",
      row.costExGst.toFixed(4),
      row.reference || "",
      row.itemCode || "",
    ].join("|"))
    .digest("hex")
    .slice(0, 64);
}

function scoreJobCandidate(row, job) {
  const project = normaliseKey(row.projectName);
  const contact = normaliseKey(row.contactName);
  const quote = normaliseKey(job.quoteNumber);
  const client = normaliseKey(job.clientName);
  const address = normaliseKey(job.siteAddress);
  let score = 0;

  if (quote && project.includes(quote)) score += 90;
  if (quote && compactKey(row.projectName).includes(compactKey(job.quoteNumber))) score += 70;
  if (client && contact && (client.includes(contact) || contact.includes(client))) score += 65;
  if (client && project && (project.includes(client) || client.includes(project))) score += 45;

  for (const token of project.split(/\s+/).filter((value) => value.length >= 3)) {
    if (quote.includes(token)) score += 12;
    if (client.includes(token)) score += 8;
    if (address.includes(token)) score += 6;
  }
  for (const token of contact.split(/\s+/).filter((value) => value.length >= 3)) {
    if (client.includes(token)) score += 12;
    if (address.includes(token)) score += 4;
  }

  return score;
}

async function buildProjectMap(conn) {
  const [jobs] = await conn.query(
    "select id, quoteNumber, clientName, siteAddress, status, leadId, notes from construction_jobs where tenantId = ? or tenantId is null",
    [TENANT_ID],
  );

  const lookup = new Map();
  const add = (key, id) => {
    const normalised = normaliseKey(key);
    if (normalised && !lookup.has(normalised)) lookup.set(normalised, Number(id));
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

  for (const mapping of mappings) add(mapping.xeroProjectName, mapping.jobId);
  for (const job of jobs) {
    add(job.quoteNumber, job.id);
    add(job.clientName, job.id);
    const match = String(job.notes || "").match(/Imported from Xero Project:\s*(.+)$/i);
    if (match) add(match[1], job.id);
  }

  return { jobs, lookup };
}

function resolveJobId(row, lookup, jobs) {
  const exact = lookup.get(normaliseKey(row.projectName));
  if (exact) return { jobId: exact, match: "exact" };

  const scored = jobs
    .map((job) => ({ job, score: scoreJobCandidate(row, job) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score >= 70) return { jobId: Number(best.job.id), match: "scored" };
  return { jobId: null, match: "unmatched" };
}

async function existingValueSet(conn, table, column, values) {
  const existing = new Set();
  const unique = [...new Set(values.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const [rows] = await conn.query(`select ${column} as value from ${table} where ${column} in (${placeholders})`, chunk);
    for (const row of rows) existing.add(row.value);
  }
  return existing;
}

async function ensureColumn(conn, table, column, definition) {
  const [rows] = await conn.query(`show columns from ${table} like ?`, [column]);
  if (!rows.length) await conn.query(`alter table ${table} add column ${column} ${definition}`);
}

async function insertBudgetRows(conn, budgetRows, lookup, jobs) {
  const [batchResult] = await conn.query(
    [
      "insert into xero_budget_import_batches",
      "(appTenantId, filename, uploadedBy, uploadedByName, totalRows, importedRows, skippedRows, duplicateRows, budgetImportStatus, errorMessage, createdAt)",
      "values (?, ?, null, ?, ?, 0, 0, 0, 'processing', null, now())",
    ].join(" "),
    [TENANT_ID, "xero-project-details-baseline-budget", "System Baseline Import", budgetRows.length],
  );
  const batchId = Number(batchResult.insertId);

  const existingHashes = await existingValueSet(conn, "xero_budget_import_items", "budgetImportHash", budgetRows.map(budgetHash));
  const closedJobIds = new Set();
  const unmatchedProjects = new Set();
  const matchBuckets = { exact: 0, scored: 0, unmatched: 0 };
  let duplicateRows = 0;

  const values = budgetRows.map((row) => {
    const hash = budgetHash(row);
    if (existingHashes.has(hash)) duplicateRows += 1;
    const { jobId, match } = resolveJobId(row, lookup, jobs);
    matchBuckets[match] += 1;
    if (!jobId) unmatchedProjects.add(row.projectName);
    if (jobId && isClosedProjectState(row.projectState)) closedJobIds.add(jobId);

    const category = VALID_BUDGET_CATEGORIES.has(row.budgetCategory)
      ? row.budgetCategory
      : classifyCategory(row.itemName);
    const incGst = row.estimatedCostExGst * 1.1;

    return [
      TENANT_ID,
      batchId,
      jobId,
      hash,
      row.contactName,
      row.projectName,
      row.projectState || null,
      row.itemName || null,
      category,
      row.estimatedCostExGst.toFixed(2),
      incGst.toFixed(2),
      new Date(),
    ];
  });

  for (let i = 0; i < values.length; i += 250) {
    const chunk = values.slice(i, i + 250);
    await conn.query(
      [
        "insert into xero_budget_import_items",
        "(appTenantId, batchId, jobId, budgetImportHash, contactName, projectName, projectState, rawCategory, budgetCategory, estimatedCostExGst, estimatedCostIncGst, createdAt)",
        "values ?",
        "on duplicate key update",
        "jobId = values(jobId), contactName = values(contactName), projectState = values(projectState),",
        "rawCategory = values(rawCategory), budgetCategory = values(budgetCategory),",
        "estimatedCostExGst = values(estimatedCostExGst), estimatedCostIncGst = values(estimatedCostIncGst)",
      ].join(" "),
      [chunk],
    );
  }

  const skippedRows = matchBuckets.unmatched;
  await conn.query(
    [
      "update xero_budget_import_batches",
      "set importedRows = ?, skippedRows = ?, duplicateRows = ?, budgetImportStatus = 'completed'",
      "where id = ? and appTenantId = ?",
    ].join(" "),
    [budgetRows.length - skippedRows, skippedRows, duplicateRows, batchId, TENANT_ID],
  );

  return { batchId, totalRows: budgetRows.length, duplicateRows, matchBuckets, unmatchedProjects, closedJobIds };
}

async function insertCostRows(conn, costRows, lookup, jobs, dateRangeStart, dateRangeEnd) {
  const [batchResult] = await conn.query(
    [
      "insert into xero_cost_import_batches",
      "(appTenantId, filename, uploadedBy, uploadedByName, totalRows, importedRows, skippedRows, duplicateRows, dateRangeStart, dateRangeEnd, processingCursor, parsedDataKey, importStatus, errorMessage, createdAt)",
      "values (?, ?, null, ?, ?, 0, 0, 0, ?, ?, 0, null, 'processing', null, now())",
    ].join(" "),
    [TENANT_ID, "xero-project-details-baseline-expenses", "System Baseline Import", costRows.length, dateRangeStart, dateRangeEnd],
  );
  const batchId = Number(batchResult.insertId);

  const existingHashes = await existingValueSet(conn, "xero_cost_import_items", "importHash", costRows.map(costHash));
  const closedJobIds = new Set();
  const unmatchedProjects = new Set();
  const matchBuckets = { exact: 0, scored: 0, unmatched: 0 };
  let duplicateRows = 0;

  const values = [];
  for (const row of costRows) {
    const hash = costHash(row);
    if (existingHashes.has(hash)) {
      duplicateRows += 1;
      continue;
    }
    const { jobId, match } = resolveJobId(row, lookup, jobs);
    matchBuckets[match] += 1;
    if (!jobId) {
      unmatchedProjects.add(row.projectName);
      continue;
    }
    if (isClosedProjectState(row.projectState)) closedJobIds.add(jobId);

    const incGst = row.costExGst * 1.1;
    values.push([
      TENANT_ID,
      batchId,
      jobId,
      hash,
      row.date,
      row.projectName,
      row.projectState || null,
      row.itemType,
      row.itemName || null,
      row.itemCode || null,
      row.reference ? row.reference.slice(0, 512) : null,
      row.supplierName || null,
      row.costExGst.toFixed(4),
      incGst.toFixed(4),
      row.actual.toFixed(4),
      row.totalInvoiced.toFixed(4),
      new Date(),
    ]);
  }

  for (let i = 0; i < values.length; i += 250) {
    const chunk = values.slice(i, i + 250);
    await conn.query(
      [
        "insert into xero_cost_import_items",
        "(appTenantId, batchId, jobId, importHash, date, projectName, projectState, itemType, itemName, itemCode, reference, supplierName, costExGst, costIncGst, actual, totalInvoiced, createdAt)",
        "values ?",
        "on duplicate key update importHash = importHash",
      ].join(" "),
      [chunk],
    );
  }

  const skippedRows = matchBuckets.unmatched;
  await conn.query(
    [
      "update xero_cost_import_batches",
      "set importedRows = ?, skippedRows = ?, duplicateRows = ?, importStatus = 'completed'",
      "where id = ? and appTenantId = ?",
    ].join(" "),
    [values.length, skippedRows, duplicateRows, batchId, TENANT_ID],
  );

  return { batchId, totalRows: costRows.length, importedRows: values.length, duplicateRows, matchBuckets, unmatchedProjects, closedJobIds };
}

async function completeClosedJobs(conn, closedJobIds, jobs) {
  const ids = [...closedJobIds];
  if (!ids.length) return { jobsUpdated: 0, leadsUpdated: 0 };

  const [jobResult] = await conn.query(
    "update construction_jobs set status = 'completed', updatedAt = now() where (tenantId = ? or tenantId is null) and id in (?) and status <> 'completed'",
    [TENANT_ID, ids],
  );

  const leadIds = [
    ...new Set(
      jobs
        .filter((job) => ids.includes(Number(job.id)) && job.leadId)
        .map((job) => Number(job.leadId)),
    ),
  ];
  let leadsUpdated = 0;
  if (leadIds.length) {
    const [leadResult] = await conn.query(
      "update crm_leads set status = 'completed', updatedAt = now() where (tenantId = ? or tenantId is null) and id in (?) and status <> 'completed'",
      [TENANT_ID, leadIds],
    );
    leadsUpdated = Number(leadResult.affectedRows || 0);
  }

  return { jobsUpdated: Number(jobResult.affectedRows || 0), leadsUpdated };
}

async function recalculateBudgets(conn) {
  const [jobRows] = await conn.query(
    "select id from construction_jobs where tenantId = ? or tenantId is null",
    [TENANT_ID],
  );
  const jobIds = jobRows.map((row) => Number(row.id));
  if (!jobIds.length) return { budgetJobsUpdated: 0, budgetFinancialsInserted: 0 };

  await conn.query(
    [
      "update construction_job_financials",
      "set materialsCost = 0, labourCost = 0, otherCost = 0, totalCost = 0, margin = 0, marginPercent = 0",
      "where jobId in (?)",
    ].join(" "),
    [jobIds],
  );

  const [totals] = await conn.query(
    [
      "select jobId, sum(estimatedCostIncGst) as totalIncGst",
      "from xero_budget_import_items",
      "where appTenantId = ? and jobId is not null and jobId in (?)",
      "group by jobId",
    ].join(" "),
    [TENANT_ID, jobIds],
  );

  let updated = 0;
  let inserted = 0;
  for (const row of totals) {
    const jobId = Number(row.jobId);
    const total = parseMoney(row.totalIncGst);
    const [existing] = await conn.query(
      "select id, contractValue from construction_job_financials where jobId = ? limit 1",
      [jobId],
    );
    const contractValue = parseMoney(existing[0]?.contractValue);
    const margin = contractValue - total;
    const marginPercent = clampMarginPercent(contractValue > 0 ? (margin / contractValue) * 100 : 0);

    if (existing.length) {
      await conn.query(
        "update construction_job_financials set totalCost = ?, margin = ?, marginPercent = ? where id = ?",
        [total.toFixed(2), margin.toFixed(2), marginPercent.toFixed(2), existing[0].id],
      );
    } else {
      await conn.query(
        "insert into construction_job_financials (jobId, totalCost, margin, marginPercent) values (?, ?, ?, ?)",
        [jobId, total.toFixed(2), (0 - total).toFixed(2), "0.00"],
      );
      inserted += 1;
    }
    updated += 1;
  }
  return { budgetJobsUpdated: updated, budgetFinancialsInserted: inserted };
}

async function recalculateCosts(conn) {
  const [totals] = await conn.query(
    [
      "select jobId, sum(costIncGst) as totalIncGst",
      "from xero_cost_import_items",
      "where appTenantId = ? and jobId is not null",
      "group by jobId",
    ].join(" "),
    [TENANT_ID],
  );

  let updated = 0;
  let inserted = 0;
  for (const row of totals) {
    const jobId = Number(row.jobId);
    const total = parseMoney(row.totalIncGst);
    const [existing] = await conn.query(
      "select id from construction_job_financials where jobId = ? limit 1",
      [jobId],
    );
    if (existing.length) {
      await conn.query("update construction_job_financials set xeroTotalCost = ? where id = ?", [total.toFixed(2), existing[0].id]);
    } else {
      await conn.query("insert into construction_job_financials (jobId, xeroTotalCost) values (?, ?)", [jobId, total.toFixed(2)]);
      inserted += 1;
    }
    updated += 1;
  }
  return { costJobsUpdated: updated, costFinancialsInserted: inserted };
}

async function main() {
  const budgetRows = parseBudgetFiles(BUDGET_FILES);
  const costParsed = parseCostFiles(COST_FILES);

  if (!APPLY) {
    console.log(JSON.stringify({
      dryRun: true,
      tenantId: TENANT_ID,
      budgetFiles: BUDGET_FILES,
      budgetRows: budgetRows.length,
      costFiles: COST_FILES,
      costRows: costParsed.rows.length,
      dateRange: [costParsed.dateRangeStart, costParsed.dateRangeEnd],
      note: "Run with --apply inside Railway to write to the production database.",
    }, null, 2));
    return;
  }

  const databaseUrl = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (!databaseUrl) throw new Error("MYSQL_PUBLIC_URL, DATABASE_URL, or MYSQL_URL is required when using --apply.");

  const conn = await mysql.createConnection(databaseUrl);
  await conn.beginTransaction();
  try {
    await ensureColumn(conn, "xero_budget_import_items", "projectState", "varchar(64) null");
    await ensureColumn(conn, "xero_cost_import_items", "projectState", "varchar(64) null");

    const { jobs, lookup } = await buildProjectMap(conn);
    const budget = await insertBudgetRows(conn, budgetRows, lookup, jobs);
    const costs = await insertCostRows(conn, costParsed.rows, lookup, jobs, costParsed.dateRangeStart, costParsed.dateRangeEnd);
    const closedJobIds = new Set([...budget.closedJobIds, ...costs.closedJobIds]);
    const completed = await completeClosedJobs(conn, closedJobIds, jobs);
    const budgetRecalc = await recalculateBudgets(conn);
    const costRecalc = await recalculateCosts(conn);

    await conn.commit();
    console.log(JSON.stringify({
      tenantId: TENANT_ID,
      budget: {
        batchId: budget.batchId,
        totalRows: budget.totalRows,
        duplicateRows: budget.duplicateRows,
        matchBuckets: budget.matchBuckets,
        uniqueUnmatchedProjects: budget.unmatchedProjects.size,
        unmatchedSample: [...budget.unmatchedProjects].slice(0, 20),
      },
      costs: {
        batchId: costs.batchId,
        totalRows: costs.totalRows,
        importedRows: costs.importedRows,
        duplicateRows: costs.duplicateRows,
        matchBuckets: costs.matchBuckets,
        uniqueUnmatchedProjects: costs.unmatchedProjects.size,
        unmatchedSample: [...costs.unmatchedProjects].slice(0, 20),
      },
      completed,
      recalc: { ...budgetRecalc, ...costRecalc },
    }, null, 2));
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
