import fs from "node:fs/promises";
import process from "node:process";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const filePath = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
const tenantSlug = valueFor("--tenant-slug") || process.env.DEFAULT_TENANT_SLUG || "default";
const only = valueFor("--only");
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

const TABLE_ORDER = [
  "da_tracker_applications",
  "da_competitor_watchlist",
  "client_das",
  "nsw_da_applications",
  "da_tracker_poll_log",
  "nsw_da_poll_log",
  "da_tracker_webhook_subscriptions",
  "da_tracker_webhook_deliveries",
];

if (!filePath) {
  console.error("Usage: node scripts/import-da-competitor-data.mjs <export.md> [--apply] [--tenant-slug default] [--only table[,table]]");
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

function selectedTables() {
  if (!only) return new Set(TABLE_ORDER);
  return new Set(only.split(",").map((table) => table.trim()).filter(Boolean));
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function parseMarkdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = {};

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^## ([a-z0-9_]+) \(([^)]*)\)\s*$/i);
    if (!heading) continue;

    const table = heading[1];
    const declaredRows = Number(String(heading[2]).match(/\d+/)?.[0] ?? 0);
    const nextHeadingIndex = lines.findIndex((line, index) => index > i && /^## /.test(line));
    const sectionEnd = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
    const dataIndex = lines.findIndex((line, index) =>
      index > i && index < sectionEnd && /^### Data/.test(line.trim())
    );

    if (dataIndex === -1) {
      tables[table] = { declaredRows, rows: [], dataLabel: null };
      continue;
    }

    const dataLabel = lines[dataIndex].trim();
    const headerLineIndex = dataIndex + 1;
    const separatorLineIndex = dataIndex + 2;
    if (!lines[headerLineIndex]?.startsWith("|") || !lines[separatorLineIndex]?.startsWith("|")) {
      tables[table] = { declaredRows, rows: [], dataLabel };
      continue;
    }

    const headers = splitMarkdownRow(lines[headerLineIndex]);
    const rows = [];
    for (let j = dataIndex + 3; j < sectionEnd; j++) {
      if (!lines[j].startsWith("|")) break;
      const values = splitMarkdownRow(lines[j]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      rows.push(row);
    }
    tables[table] = { declaredRows, rows, dataLabel };
  }

  return tables;
}

function nil(value) {
  return value === undefined || value === null || value === "" || value === "NULL" ? null : value;
}

function parseDate(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  const parsed = new Date(valueOrNull);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
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

function json(value, column) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return notNullFallback(column);
  const text = String(valueOrNull);
  if (text.includes("...")) return null;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return null;
  }
}

function coerce(value, column) {
  const type = String(column.Type || "").toLowerCase();
  if (type.startsWith("json")) return json(value, column);
  if (type.startsWith("timestamp") || type.startsWith("datetime") || type === "date") return parseDate(value) ?? notNullFallback(column);
  if (type.startsWith("tinyint(1)") || column.Field === "active" || column.Field.startsWith("is_")) return bool(value);
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

function prepareRows(rows, columns, tenantIdValue) {
  const columnByName = new Map(columns.map((column) => [column.Field, column]));
  const targetColumns = columns
    .map((column) => column.Field)
    .filter((column) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, column)) || column === "tenantId");

  if (targetColumns.includes("tenantId")) {
    for (const row of rows) row.tenantId = tenantIdValue;
  }

  return {
    columns: targetColumns,
    rows: rows.map((row) => {
      const prepared = {};
      for (const column of targetColumns) {
        prepared[column] = coerce(row[column], columnByName.get(column));
      }
      return prepared;
    }),
  };
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
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

const markdown = await fs.readFile(filePath, "utf8");
const parsed = parseMarkdownTables(markdown);
const wanted = selectedTables();
const sourceTables = {};

for (const table of TABLE_ORDER) {
  if (!wanted.has(table)) continue;
  sourceTables[table] = parsed[table] ?? { declaredRows: 0, rows: [], dataLabel: null };
}

console.log("Parsed DA competitor data:", JSON.stringify(Object.fromEntries(
  Object.entries(sourceTables).map(([table, data]) => [table, {
    visibleRows: data.rows.length,
    declaredRows: data.declaredRows,
    partialPreview: data.declaredRows > data.rows.length,
    dataLabel: data.dataLabel,
  }])
), null, 2));

if (!databaseUrl) {
  console.log("No database URL available. Parsed file only.");
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
    const prepared = prepareRows(data.rows, columns, tenantIdValue);
    plan[table] = {
      visibleRows: data.rows.length,
      declaredRows: data.declaredRows,
      partialPreview: data.declaredRows > data.rows.length,
      importedRows: apply ? await batchUpsert(connection, table, prepared.columns, prepared.rows) : prepared.rows.length,
      columns: prepared.columns.length,
      mode: apply ? "apply" : "dry-run",
    };
  }
  console.log(JSON.stringify(plan, null, 2));
} finally {
  await connection.end();
}
