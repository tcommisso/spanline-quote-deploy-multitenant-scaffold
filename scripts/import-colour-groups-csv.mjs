import fs from "node:fs";
import process from "node:process";
import mysql from "mysql2/promise";
import { parse } from "csv-parse/sync";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const groupsPath =
  valueFor("--groups") ||
  process.env.COLOUR_GROUPS_CSV ||
  "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/colour_groups.csv";
const membersPath =
  valueFor("--members") ||
  process.env.COLOUR_GROUP_MEMBERS_CSV ||
  "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/colour_group_members.csv";
const tenantIdArg = valueFor("--tenant-id") || process.env.IMPORT_TENANT_ID;
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

function readCsv(filePath) {
  return parse(fs.readFileSync(filePath, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function numberOrZero(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function clean(value) {
  return String(value || "").trim();
}

function parseStandardColours(value) {
  const raw = clean(value);
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
    } catch {
      // Fall through to CSV-style splitting.
    }
  }
  return Array.from(new Set(raw.split(",").map(clean).filter(Boolean)));
}

async function getTenantId(connection) {
  if (tenantIdArg) return Number(tenantIdArg);
  const [rows] = await connection.execute(
    "SELECT id FROM tenants WHERE status = 'active' ORDER BY id LIMIT 1",
  );
  const tenantId = rows?.[0]?.id;
  if (!tenantId) throw new Error("No active tenant was found.");
  return Number(tenantId);
}

async function upsertGroup(connection, tenantId, row) {
  const oldId = numberOrZero(row.id);
  const name = clean(row.name);
  if (!name) throw new Error(`Colour group row ${oldId || "(new)"} is missing a name.`);

  const standardColours = parseStandardColours(row.standardColours);
  const sortOrder = numberOrZero(row.sortOrder);
  const description = clean(row.description) || null;

  const [existingRows] = await connection.execute(
    "SELECT id FROM colour_groups WHERE tenantId = ? AND name = ? LIMIT 1",
    [tenantId, name],
  );
  let productionId = existingRows?.[0]?.id;

  if (!apply) {
    return { oldId, productionId: productionId ?? null, name, standardColours, action: productionId ? "update" : "insert" };
  }

  if (productionId) {
    await connection.execute(
      [
        "UPDATE colour_groups",
        "SET description = ?, sortOrder = ?, standardColours = CAST(? AS JSON), updatedAt = CURRENT_TIMESTAMP",
        "WHERE id = ? AND tenantId = ?",
      ].join(" "),
      [description, sortOrder, JSON.stringify(standardColours), productionId, tenantId],
    );
  } else {
    const [result] = await connection.execute(
      [
        "INSERT INTO colour_groups (tenantId, name, description, standardColours, sortOrder, createdAt, updatedAt)",
        "VALUES (?, ?, ?, CAST(? AS JSON), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      ].join(" "),
      [tenantId, name, description, JSON.stringify(standardColours), sortOrder],
    );
    productionId = result.insertId;
  }

  return { oldId, productionId, name, standardColours, action: existingRows?.[0]?.id ? "updated" : "inserted" };
}

async function replaceMembers(connection, tenantId, productionGroupId, members) {
  if (!apply) return;
  await connection.execute(
    "DELETE FROM colour_group_members WHERE tenantId = ? AND colourGroupId = ?",
    [tenantId, productionGroupId],
  );
  for (const member of members) {
    await connection.execute(
      "INSERT INTO colour_group_members (tenantId, colourGroupId, colourValue, sortOrder) VALUES (?, ?, ?, ?)",
      [tenantId, productionGroupId, member.colourValue, member.sortOrder],
    );
  }
}

async function main() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL, MYSQL_PUBLIC_URL, or MYSQL_URL is required.");
  }

  const groupRows = readCsv(groupsPath);
  const memberRows = readCsv(membersPath);
  const connection = await mysql.createConnection(databaseUrl);

  try {
    const tenantId = await getTenantId(connection);
    const groupMap = new Map();
    const groups = [];

    for (const row of groupRows) {
      const group = await upsertGroup(connection, tenantId, row);
      groups.push(group);
      if (group.oldId) groupMap.set(group.oldId, group);
    }

    const membersByOldGroupId = new Map();
    const skippedMembers = [];
    for (const row of memberRows) {
      const oldGroupId = numberOrZero(row.colourGroupId);
      const colourValue = clean(row.colourValue);
      if (!oldGroupId || !colourValue) {
        skippedMembers.push({ reason: "missing_group_or_colour", row });
        continue;
      }
      const list = membersByOldGroupId.get(oldGroupId) || [];
      list.push({ colourValue, sortOrder: numberOrZero(row.sortOrder) });
      membersByOldGroupId.set(oldGroupId, list);
    }

    for (const [oldGroupId, members] of membersByOldGroupId) {
      const group = groupMap.get(oldGroupId);
      if (!group) {
        skippedMembers.push({ reason: "group_not_in_export", oldGroupId, count: members.length });
        continue;
      }
      await replaceMembers(connection, tenantId, group.productionId, members);
    }

    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      tenantId,
      groups: groups.length,
      members: Array.from(membersByOldGroupId.values()).reduce((total, rows) => total + rows.length, 0),
      skippedMembers,
      summary: groups.map((group) => ({
        oldId: group.oldId,
        productionId: group.productionId,
        name: group.name,
        action: group.action,
        standardColours: group.standardColours.length,
        members: membersByOldGroupId.get(group.oldId)?.length || 0,
      })),
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
