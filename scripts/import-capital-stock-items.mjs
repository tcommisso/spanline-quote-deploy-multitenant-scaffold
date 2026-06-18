#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const inputPath = valueFor("--input") || "/tmp/capital-stock-import.json";
const apply = args.includes("--apply");
const tenantIdArg = valueFor("--tenant-id") || process.env.IMPORT_TENANT_ID;
const tenantSlug = valueFor("--tenant-slug") || process.env.DEFAULT_TENANT_SLUG || null;
const databaseUrl = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL || process.env.MYSQL_URL;

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

function normalise(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function decimalOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function trim(value, length) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, length);
}

async function getTenant(connection) {
  if (tenantIdArg) {
    const [rows] = await connection.execute("SELECT id, slug, name FROM tenants WHERE id = ? LIMIT 1", [Number(tenantIdArg)]);
    if (!rows?.[0]) throw new Error(`Tenant id ${tenantIdArg} was not found.`);
    return rows[0];
  }

  if (tenantSlug) {
    const [rows] = await connection.execute("SELECT id, slug, name FROM tenants WHERE slug = ? LIMIT 1", [tenantSlug]);
    if (!rows?.[0]) throw new Error(`Tenant slug '${tenantSlug}' was not found.`);
    return rows[0];
  }

  const [rows] = await connection.execute(
    "SELECT id, slug, name FROM tenants WHERE status = 'active' ORDER BY id LIMIT 1",
  );
  if (!rows?.[0]) throw new Error("No active tenant was found.");
  return rows[0];
}

async function getBranches(connection, tenantId) {
  const [rows] = await connection.execute(
    "SELECT id, name FROM branches WHERE tenantId = ? AND isActive = 1 ORDER BY name",
    [tenantId],
  );
  return rows || [];
}

function resolveBranch(branches, requestedName) {
  const requested = normalise(requestedName);
  const candidates = branches.map((branch) => ({
    ...branch,
    key: normalise(branch.name),
  }));

  const exact = candidates.find((branch) => branch.key === requested);
  if (exact) return exact;

  const singular = requested.replace(/s$/, "");
  const near = candidates.find((branch) => branch.key.replace(/s$/, "") === singular);
  if (near) return near;

  return candidates.find((branch) => branch.key.includes(singular) || singular.includes(branch.key)) || null;
}

async function upsertItem(connection, tenantId, branchId, item) {
  const params = [
    tenantId,
    trim(item.code, 50),
    trim(item.name, 255),
    trim(item.serialNumber, 128),
    trim(item.category || "general", 100),
    trim(item.unit || "EA", 20),
    item.unitType === "lm" ? "lm" : "unit",
    branchId,
    item.conditionIndicator || "new",
    decimalOrNull(item.actualSize),
    decimalOrNull(item.sourceFullLength),
    item.description || null,
    trim(item.supplier, 255),
    decimalOrNull(item.costPrice),
  ];

  const [existing] = await connection.execute(
    "SELECT id FROM inventory_stock_items WHERE tenantId = ? AND branch_id = ? AND code = ? LIMIT 1",
    [tenantId, branchId, trim(item.code, 50)],
  );
  const existingId = existing?.[0]?.id;

  if (!apply) {
    return existingId ? "update" : "insert";
  }

  if (existingId) {
    await connection.execute(
      [
        "UPDATE inventory_stock_items",
        "SET name = ?, serial_number = ?, category = ?, unit = ?, unit_type = ?,",
        "condition_indicator = ?, actual_size = COALESCE(?, actual_size),",
        "source_full_length = COALESCE(?, source_full_length), description = ?,",
        "supplier = COALESCE(?, supplier), cost_price = COALESCE(?, cost_price),",
        "is_active = 1, updated_at = CURRENT_TIMESTAMP",
        "WHERE id = ? AND tenantId = ?",
      ].join(" "),
      [
        params[2],
        params[3],
        params[4],
        params[5],
        params[6],
        params[8],
        params[9],
        params[10],
        params[11],
        params[12],
        params[13],
        existingId,
        tenantId,
      ],
    );
    return "updated";
  }

  await connection.execute(
    [
      "INSERT INTO inventory_stock_items",
      "(tenantId, code, name, serial_number, category, unit, unit_type, branch_id,",
      "condition_indicator, actual_size, source_full_length, description, supplier, cost_price, is_active)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    ].join(" "),
    params,
  );
  return "inserted";
}

async function main() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL, MYSQL_PUBLIC_URL, or MYSQL_URL is required.");
  }

  const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
  if (!Array.isArray(payload.items)) {
    throw new Error(`Import file ${inputPath} does not contain an items array.`);
  }

  const connection = await mysql.createConnection(databaseUrl);
  try {
    const tenant = await getTenant(connection);
    const branches = await getBranches(connection, tenant.id);
    const branchByName = new Map();
    const missingBranches = new Set();
    for (const branchName of new Set(payload.items.map((item) => item.branch))) {
      const branch = resolveBranch(branches, branchName);
      if (branch) branchByName.set(branchName, branch);
      else missingBranches.add(branchName);
    }

    if (missingBranches.size) {
      throw new Error([
        `Missing branch(es): ${Array.from(missingBranches).join(", ")}`,
        `Available branches: ${branches.map((branch) => branch.name).join(", ") || "(none)"}`,
      ].join("\n"));
    }

    const counts = {};
    const samples = [];
    for (const item of payload.items) {
      const branch = branchByName.get(item.branch);
      const action = await upsertItem(connection, tenant.id, branch.id, item);
      counts[action] = (counts[action] || 0) + 1;
      if (samples.length < 8) {
        samples.push({
          branch: branch.name,
          code: item.code,
          name: item.name,
          category: item.category,
          supplier: item.supplier,
          action,
        });
      }
    }

    const summary = {
      mode: apply ? "apply" : "dry-run",
      tenant,
      sourceSummary: payload.summary,
      resolvedBranches: Array.from(branchByName.entries()).map(([requested, branch]) => ({
        requested,
        id: branch.id,
        name: branch.name,
      })),
      counts,
      samples,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
