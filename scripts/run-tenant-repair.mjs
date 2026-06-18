import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply;
const databaseUrl = process.env.MYSQL_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.MYSQL_URL;
const tenancyMode = process.env.TENANCY_MODE ?? process.env.VITE_TENANCY_MODE ?? "single";

if (!databaseUrl) {
  console.error("DATABASE_URL, MYSQL_URL, or MYSQL_PUBLIC_URL is required.");
  process.exit(1);
}

function quoteIdent(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
}

async function readRepairTables() {
  const routerPath = path.resolve(process.cwd(), "server/_core/systemRouter.ts");
  const source = await fs.readFile(routerPath, "utf8");

  function parseConstArray(name) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`));
    if (!match) throw new Error(`Could not find ${name} in ${routerPath}`);
    return [...match[1].matchAll(/"([^"]+)"/g)].map((row) => row[1]);
  }

  return {
    tenantTables: parseConstArray("TENANT_ID_TABLES"),
    appTenantTables: parseConstArray("APP_TENANT_ID_TABLES"),
  };
}

async function scalar(connection, query, params = []) {
  const [rows] = await connection.execute(query, params);
  return Number(rows?.[0]?.value ?? rows?.[0]?.count ?? 0);
}

async function tableExists(connection, tableName) {
  return (await scalar(
    connection,
    `SELECT COUNT(*) AS value
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [tableName],
  )) > 0;
}

async function columnExists(connection, tableName, columnName) {
  return (await scalar(
    connection,
    `SELECT COUNT(*) AS value
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName],
  )) > 0;
}

async function indexExists(connection, tableName, indexName) {
  return (await scalar(
    connection,
    `SELECT COUNT(*) AS value
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName],
  )) > 0;
}

async function ensureTenantColumn(connection, tableName, columnName) {
  if (!(await tableExists(connection, tableName))) return "missing-table";
  if (await columnExists(connection, tableName, columnName)) return "exists";
  if (dryRun) return "missing-column";

  const table = quoteIdent(tableName);
  const column = quoteIdent(columnName);
  const indexName = `idx_${tableName}_${columnName}`;
  await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} int NULL`);

  if (!(await indexExists(connection, tableName, indexName))) {
    await connection.query(`ALTER TABLE ${table} ADD KEY ${quoteIdent(indexName)} (${column})`);
  }

  return "created";
}

async function repairTableTenant(connection, tableName, columnName, tenantId) {
  const status = await ensureTenantColumn(connection, tableName, columnName);
  if (status === "missing-table" || status === "missing-column") {
    return {
      table: tableName,
      column: columnName,
      status,
      updated: 0,
      nullRows: 0,
      otherTenantRows: 0,
    };
  }

  const table = quoteIdent(tableName);
  const column = quoteIdent(columnName);
  const [beforeRows] = await connection.query(
    `SELECT
       SUM(CASE WHEN ${column} IS NULL THEN 1 ELSE 0 END) AS nullRows,
       SUM(CASE WHEN ${column} IS NOT NULL AND ${column} <> ? THEN 1 ELSE 0 END) AS otherTenantRows
     FROM ${table}`,
    [tenantId],
  );
  const nullRows = Number(beforeRows?.[0]?.nullRows || 0);
  const otherTenantRows = Number(beforeRows?.[0]?.otherTenantRows || 0);

  if (dryRun) {
    return { table: tableName, column: columnName, status, updated: 0, nullRows, otherTenantRows };
  }

  const where = tenancyMode === "single"
    ? `${column} IS NULL OR ${column} <> ?`
    : `${column} IS NULL`;
  const params = tenancyMode === "single" ? [tenantId, tenantId] : [tenantId];
  const [result] = await connection.query(`UPDATE ${table} SET ${column} = ? WHERE ${where}`, params);

  return {
    table: tableName,
    column: columnName,
    status,
    updated: Number(result?.affectedRows || 0),
    nullRows,
    otherTenantRows,
  };
}

async function getTenantId(connection) {
  if (process.env.TENANT_REPAIR_TENANT_ID) {
    return Number(process.env.TENANT_REPAIR_TENANT_ID);
  }

  const [rows] = await connection.execute(
    "SELECT id FROM tenants WHERE status = 'active' ORDER BY id ASC LIMIT 1",
  );
  const tenantId = Number(rows?.[0]?.id || 0);
  if (!tenantId) throw new Error("No active tenant found. Set TENANT_REPAIR_TENANT_ID to override.");
  return tenantId;
}

async function repairMemberships(connection, tenantId) {
  if (!(await tableExists(connection, "users")) || !(await tableExists(connection, "tenant_memberships"))) {
    return {
      table: "tenant_memberships",
      column: "tenantId",
      status: "missing-table",
      updated: 0,
      nullRows: 0,
      otherTenantRows: 0,
    };
  }

  const [previewRows] = await connection.query(
    `SELECT
       COUNT(*) AS totalUsers,
       SUM(CASE WHEN tm.id IS NOT NULL THEN 1 ELSE 0 END) AS linkedUsers,
       SUM(CASE WHEN tm.id IS NULL THEN 1 ELSE 0 END) AS missingLinks
     FROM users u
     LEFT JOIN tenant_memberships tm
       ON tm.userId = u.id
      AND tm.tenantId = ?`,
    [tenantId],
  );
  const missingLinks = Number(previewRows?.[0]?.missingLinks || 0);

  if (tenancyMode !== "single") {
    return {
      table: "tenant_memberships",
      column: "tenantId",
      status: "skipped-multi-tenant",
      updated: 0,
      nullRows: missingLinks,
      otherTenantRows: 0,
    };
  }

  if (dryRun) {
    return {
      table: "tenant_memberships",
      column: "tenantId",
      status: "preview",
      updated: 0,
      nullRows: missingLinks,
      otherTenantRows: 0,
    };
  }

  const [result] = await connection.query(
    `INSERT IGNORE INTO tenant_memberships
       (tenantId, userId, role, isDefault, createdAt, updatedAt)
     SELECT
       ?,
       u.id,
       CASE
         WHEN u.role = 'super_admin' THEN 'owner'
         WHEN u.role = 'admin' THEN 'admin'
         ELSE 'member'
       END,
       CASE
         WHEN NOT EXISTS (
           SELECT 1
           FROM tenant_memberships tm_any
           WHERE tm_any.userId = u.id
         ) THEN 1
         ELSE 0
       END,
       NOW(),
       NOW()
     FROM users u
     WHERE NOT EXISTS (
       SELECT 1
       FROM tenant_memberships tm
       WHERE tm.tenantId = ?
         AND tm.userId = u.id
     )`,
    [tenantId, tenantId],
  );

  return {
    table: "tenant_memberships",
    column: "tenantId",
    status: "created-links",
    updated: Number(result?.affectedRows || 0),
    nullRows: missingLinks,
    otherTenantRows: 0,
  };
}

async function main() {
  const { tenantTables, appTenantTables } = await readRepairTables();
  const connection = await mysql.createConnection(databaseUrl);

  try {
    const tenantId = await getTenantId(connection);
    const results = [];

    for (const table of tenantTables) {
      try {
        results.push(await repairTableTenant(connection, table, "tenantId", tenantId));
      } catch (error) {
        results.push({
          table,
          column: "tenantId",
          status: "failed",
          updated: 0,
          nullRows: 0,
          otherTenantRows: 0,
          error: error?.message || String(error),
        });
      }
    }

    for (const table of appTenantTables) {
      try {
        results.push(await repairTableTenant(connection, table, "appTenantId", tenantId));
      } catch (error) {
        results.push({
          table,
          column: "appTenantId",
          status: "failed",
          updated: 0,
          nullRows: 0,
          otherTenantRows: 0,
          error: error?.message || String(error),
        });
      }
    }

    results.push(await repairMemberships(connection, tenantId));

    const summary = {
      mode: dryRun ? "dry-run" : "apply",
      tenantId,
      tenancyMode,
      tableCount: results.length,
      createdColumns: results.filter((row) => row.status === "created").length,
      missingColumns: results.filter((row) => row.status === "missing-column").length,
      missingTables: results.filter((row) => row.status === "missing-table").length,
      failedTables: results.filter((row) => row.status === "failed").length,
      updatedRows: results.reduce((sum, row) => sum + Number(row.updated || 0), 0),
      rowsNeedingRepair: results.reduce(
        (sum, row) => sum + Number(row.nullRows || 0) + (tenancyMode === "single" ? Number(row.otherTenantRows || 0) : 0),
        0,
      ),
      top: results
        .filter((row) => row.status !== "exists" || row.nullRows || row.otherTenantRows || row.updated || row.error)
        .slice(0, 80),
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
