import fs from "node:fs/promises";
import process from "node:process";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const filePath = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
const only = valueFor("--only");
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

const TABLE_ORDER = [
  "weather_history",
  "weather_forecast_cache",
  "manufacturing_drivers",
  "driver_locations",
  "chat_channels",
  "chat_channel_members",
  "chat_messages",
  "chat_message_reactions",
  "user_locations",
];

if (!filePath) {
  console.error("Usage: node scripts/import-weather-tracking-chat-data.mjs <export.md> [--apply] [--only table[,table]]");
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

function wantedTables() {
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
    const heading = lines[i].match(/^## ([a-z0-9_]+) \((\d+) rows?\)\s*$/i);
    if (!heading) continue;

    const table = heading[1];
    const rowCount = Number(heading[2]);
    const nextHeadingIndex = lines.findIndex((line, index) => index > i && /^## /.test(line));
    const sectionEnd = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
    const dataIndex = lines.findIndex((line, index) =>
      index > i && index < sectionEnd && line.trim() === "### Data"
    );
    if (dataIndex === -1) {
      tables[table] = { declaredRows: rowCount, rows: [] };
      continue;
    }

    const headerLineIndex = dataIndex + 1;
    const separatorLineIndex = dataIndex + 2;
    if (!lines[headerLineIndex]?.startsWith("|") || !lines[separatorLineIndex]?.startsWith("|")) {
      tables[table] = { declaredRows: rowCount, rows: [] };
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
    tables[table] = { declaredRows: rowCount, rows };
  }

  return tables;
}

function parseForecastAppendix(markdown) {
  const forecasts = {};
  const sectionRegex = /^## ([^\n]+)\n\nFetched: ([^\n]+)\n\n```json\n([\s\S]*?)\n```/gm;
  for (const match of markdown.matchAll(sectionRegex)) {
    const locationKey = match[1].trim();
    if (/^[a-z0-9_]+ \(\d+ rows?\)$/i.test(locationKey)) continue;
    try {
      forecasts[locationKey] = {
        fetchedAt: match[2].trim(),
        forecastJson: JSON.stringify(JSON.parse(match[3])),
      };
    } catch {
      // Leave malformed appendix data out of the import plan.
    }
  }
  return forecasts;
}

function nil(value) {
  return value === undefined || value === null || value === "" || value === "NULL" ? null : value;
}

function parseDate(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  const date = new Date(valueOrNull);
  return Number.isNaN(date.getTime()) ? null : date;
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

function jsonValue(value, column) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  if (column.Field === "mentions") {
    const ids = String(valueOrNull)
      .split(/[,\s]+/)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    return JSON.stringify(ids);
  }
  try {
    return JSON.stringify(JSON.parse(String(valueOrNull)));
  } catch {
    return JSON.stringify(valueOrNull);
  }
}

function coerce(value, column) {
  const type = String(column.Type || "").toLowerCase();
  if (type.startsWith("json")) return jsonValue(value, column) ?? notNullFallback(column);
  if (type.startsWith("timestamp") || type.startsWith("datetime") || type === "date") return parseDate(value) ?? notNullFallback(column);
  if (type.startsWith("tinyint(1)") || column.Field === "isArchived" || column.Field === "isPinned") {
    return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
  }
  if (/^(int|bigint|double|decimal|float)/.test(type)) {
    const valueOrNull = nil(value);
    if (valueOrNull === null) return notNullFallback(column);
    const number = Number(valueOrNull);
    return Number.isFinite(number) ? String(valueOrNull) : notNullFallback(column);
  }
  return nil(value) ?? notNullFallback(column);
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

async function existingIds(connection, table, column = "id") {
  const [rows] = await connection.query(`SELECT ${quoteIdent(column)} AS id FROM ${quoteIdent(table)}`);
  return new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
}

function attachForecastJson(rows, appendix) {
  return rows.map((row) => {
    const full = appendix[row.locationKey];
    return {
      ...row,
      forecastJson: full?.forecastJson ?? row.forecastJson,
      fetchedAt: full?.fetchedAt ?? row.fetchedAt,
    };
  });
}

function prepareRows(rows, columns) {
  const columnByName = new Map(columns.map((column) => [column.Field, column]));
  const targetColumns = columns
    .map((column) => column.Field)
    .filter((column) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, column)));

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

async function filterRows(connection, table, rows) {
  if (!rows.length) return { rows, skipped: 0, reason: null };

  if (table === "chat_channel_members") {
    const userIds = await existingIds(connection, "users");
    const filtered = rows.filter((row) => !row.userId || userIds.has(Number(row.userId)));
    return { rows: filtered, skipped: rows.length - filtered.length, reason: "missing users.id" };
  }

  if (table === "chat_messages") {
    const userIds = await existingIds(connection, "users");
    const channelIds = await existingIds(connection, "chat_channels");
    const filtered = rows.filter((row) =>
      userIds.has(Number(row.senderId)) && channelIds.has(Number(row.channelId))
    );
    return { rows: filtered, skipped: rows.length - filtered.length, reason: "missing sender/channel" };
  }

  if (table === "chat_message_reactions") {
    const userIds = await existingIds(connection, "users");
    const messageIds = await existingIds(connection, "chat_messages");
    const filtered = rows.filter((row) =>
      userIds.has(Number(row.userId)) && messageIds.has(Number(row.messageId))
    );
    return { rows: filtered, skipped: rows.length - filtered.length, reason: "missing user/message" };
  }

  if (table === "driver_locations") {
    const driverIds = await existingIds(connection, "manufacturing_drivers");
    const filtered = rows.filter((row) => driverIds.has(Number(row.driver_id)));
    return { rows: filtered, skipped: rows.length - filtered.length, reason: "missing driver" };
  }

  if (table === "user_locations") {
    const userIds = await existingIds(connection, "users");
    const filtered = rows.filter((row) => userIds.has(Number(row.user_id)));
    return { rows: filtered, skipped: rows.length - filtered.length, reason: "missing users.id" };
  }

  return { rows, skipped: 0, reason: null };
}

const markdown = await fs.readFile(filePath, "utf8");
const parsedTables = parseMarkdownTables(markdown);
const appendixForecasts = parseForecastAppendix(markdown);
const selectedTables = wantedTables();
const sourceTables = {};

for (const table of TABLE_ORDER) {
  if (!selectedTables.has(table)) continue;
  const rows = parsedTables[table]?.rows ?? [];
  sourceTables[table] = {
    rows: table === "weather_forecast_cache" ? attachForecastJson(rows, appendixForecasts) : rows,
    declaredRows: parsedTables[table]?.declaredRows ?? 0,
  };
}

console.log("Parsed operational data:", JSON.stringify(Object.fromEntries(
  Object.entries(sourceTables).map(([table, data]) => [table, {
    rows: data.rows.length,
    declaredRows: data.declaredRows,
  }])
), null, 2));

if (!databaseUrl) {
  console.log("No database URL available. Parsed file only.");
  process.exit(0);
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const plan = {};
  for (const [table, data] of Object.entries(sourceTables)) {
    const columns = await tableColumns(connection, table);
    if (!columns) {
      plan[table] = { sourceRows: data.rows.length, importedRows: 0, skipped: "table not present in current database" };
      continue;
    }

    const filtered = await filterRows(connection, table, data.rows);
    const prepared = prepareRows(filtered.rows, columns);
    plan[table] = {
      sourceRows: data.rows.length,
      skippedRows: filtered.skipped,
      skipReason: filtered.skipped ? filtered.reason : null,
      importedRows: apply ? await batchUpsert(connection, table, prepared.columns, prepared.rows) : prepared.rows.length,
      columns: prepared.columns.length,
      mode: apply ? "apply" : "dry-run",
    };
  }
  console.log(JSON.stringify(plan, null, 2));
} finally {
  await connection.end();
}
