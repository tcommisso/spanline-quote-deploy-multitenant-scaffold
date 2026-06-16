import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import { parse } from "csv-parse/sync";

const args = process.argv.slice(2);
const sourceDir = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
const onlyTable = valueFor("--only");
const tenantSlug = valueFor("--tenant-slug") || process.env.DEFAULT_TENANT_SLUG || "default";
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

if (!sourceDir) {
  console.error("Usage: node scripts/import-sales-data.mjs <export-directory> [--apply] [--tenant-slug default] [--only table_name]");
  process.exit(1);
}

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

function quoteIdent(name) {
  return `\`${name.replaceAll("`", "``")}\``;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function nil(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function date(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  const d = new Date(valueOrNull);
  return Number.isNaN(d.getTime()) ? null : d;
}

function json(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  if (typeof valueOrNull === "string") {
    try {
      return JSON.stringify(JSON.parse(valueOrNull));
    } catch {
      return valueOrNull;
    }
  }
  return JSON.stringify(valueOrNull);
}

function varcharLength(type) {
  const match = String(type).match(/varchar\((\d+)\)/i);
  return match ? Number(match[1]) : null;
}

function notNullFallback(column) {
  if (column.Null !== "NO") return null;
  if (String(column.Extra || "").includes("auto_increment")) return null;
  const type = String(column.Type || "").toLowerCase();
  if (type.startsWith("json")) return JSON.stringify([]);
  if (type.startsWith("timestamp") || type.startsWith("datetime") || type === "date") return new Date();
  if (type.startsWith("tinyint(1)") || /^(int|bigint|double|decimal|float)/.test(type)) return "0";
  return "";
}

function coerce(value, column) {
  const type = String(column.Type || "").toLowerCase();
  if (type.startsWith("json")) return json(value) ?? notNullFallback(column);
  if (type.startsWith("timestamp") || type.startsWith("datetime") || type === "date") return date(value) ?? notNullFallback(column);
  if (type.startsWith("tinyint(1)") || column.Field === "active" || column.Field === "isActive" || column.Field === "is_active") return bool(value);
  if (/^(int|bigint|double|decimal|float)/.test(type)) {
    const valueOrNull = nil(value);
    if (valueOrNull === null) return notNullFallback(column);
    const n = Number(valueOrNull);
    return Number.isFinite(n) ? String(valueOrNull) : notNullFallback(column);
  }
  const valueOrNull = nil(value);
  if (valueOrNull === null) return notNullFallback(column);
  const text = String(valueOrNull);
  const maxLength = varcharLength(type);
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
}

const NATURAL_KEY_TABLES = new Set([
  "global_settings",
  "inbox_settings",
  "user_settings",
  "email_templates",
  "eclipse_pricing",
]);

async function readCsv(fileName) {
  const content = await fs.readFile(path.join(sourceDir, fileName), "utf8");
  return parse(content, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  });
}

async function readMarkdownTables(fileName) {
  const markdown = await fs.readFile(path.join(sourceDir, fileName), "utf8");
  const headings = [...markdown.matchAll(/^## ([A-Za-z0-9_]+)\s*$/gm)];
  const tables = {};

  for (let i = 0; i < headings.length; i++) {
    const table = headings[i][1];
    const start = headings[i].index ?? 0;
    const end = headings[i + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    const dataMatch = section.match(/### Data \(([^)]*)\)\s+```json\s+([\s\S]*?)```/);
    if (!dataMatch) {
      tables[table] = { rows: [], note: "no data block" };
      continue;
    }
    const note = dataMatch[1];
    tables[table] = {
      note,
      rows: JSON.parse(dataMatch[2]),
    };
  }

  return tables;
}

async function tableColumns(connection, table) {
  const [exists] = await connection.execute(
    "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table],
  );
  if (!Number(exists?.[0]?.count || 0)) return null;
  const [columns] = await connection.query(`SHOW COLUMNS FROM ${quoteIdent(table)}`);
  return columns;
}

async function tenantId(connection) {
  const [rows] = await connection.execute("SELECT id FROM tenants WHERE slug = ? LIMIT 1", [tenantSlug]);
  const id = rows?.[0]?.id;
  if (!id) throw new Error(`Tenant '${tenantSlug}' was not found.`);
  return id;
}

function prepareRows(table, rows, columns, tenantIdValue) {
  const columnByName = new Map(columns.map((column) => [column.Field, column]));
  const targetColumns = columns
    .map((column) => column.Field)
    .filter((column) => !(column === "id" && NATURAL_KEY_TABLES.has(table)))
    .filter((column) => columnByName.has(column) && (rows.some((row) => Object.prototype.hasOwnProperty.call(row, column)) || column === "tenantId"));

  if (targetColumns.includes("tenantId")) {
    for (const row of rows) row.tenantId = tenantIdValue;
  }

  const prepared = rows.map((row) => {
    const next = {};
    for (const column of targetColumns) {
      next[column] = coerce(row[column], columnByName.get(column));
    }
    return next;
  });

  return { columns: targetColumns, rows: prepared };
}

async function batchUpsert(connection, table, columns, rows, batchSize = 500) {
  if (!rows.length || !columns.length) return 0;
  const values = rows.map((row) => columns.map((column) => row[column] ?? null));
  const updateColumns = columns.filter((column) => column !== "id");
  const sql = `
    INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
    VALUES ?
    ON DUPLICATE KEY UPDATE
      ${updateColumns.map((column) => `${quoteIdent(column)} = VALUES(${quoteIdent(column)})`).join(", ")}
  `;
  let count = 0;
  for (const batch of chunk(values, batchSize)) {
    await connection.query(sql, [batch]);
    count += batch.length;
  }
  return count;
}

const markdownTables = await readMarkdownTables("sales-data-export.md");
const componentCatalogueRows = await readCsv("component_catalogue_products-full.csv");

const sourceTables = {};
for (const [table, { rows, note }] of Object.entries(markdownTables)) {
  if (!rows.length) continue;
  if (table === "component_catalogue_products") continue;
  sourceTables[table] = { rows, note, source: "markdown" };
}
sourceTables.component_catalogue_products = {
  rows: componentCatalogueRows,
  note: `${componentCatalogueRows.length} CSV rows`,
  source: "csv",
};

if (onlyTable) {
  if (!sourceTables[onlyTable]) {
    console.error(`No source data found for table '${onlyTable}'.`);
    process.exit(1);
  }
  for (const table of Object.keys(sourceTables)) {
    if (table !== onlyTable) delete sourceTables[table];
  }
}

console.log("Parsed sales data:", JSON.stringify(Object.fromEntries(
  Object.entries(sourceTables).map(([table, data]) => [table, { rows: data.rows.length, source: data.source, note: data.note }])
), null, 2));

if (!databaseUrl) {
  console.log("No database URL available. Parsed files only.");
  process.exit(0);
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const tenantIdValue = await tenantId(connection);
  const plan = {};
  for (const [table, data] of Object.entries(sourceTables)) {
    const columns = await tableColumns(connection, table);
    if (!columns) {
      plan[table] = { sourceRows: data.rows.length, importedRows: 0, skipped: "table not present in current database" };
      continue;
    }
    const prepared = prepareRows(table, data.rows, columns, tenantIdValue);
    plan[table] = {
      sourceRows: data.rows.length,
      importedRows: apply ? await batchUpsert(connection, table, prepared.columns, prepared.rows) : prepared.rows.length,
      columns: prepared.columns.length,
      source: data.source,
      mode: apply ? "apply" : "dry-run",
    };
  }
  console.log(JSON.stringify(plan, null, 2));
} finally {
  await connection.end();
}
