import fs from "node:fs";
import mysql from "mysql2/promise";

const files = [
  {
    label: "NSW DA applications",
    table: "nsw_da_applications",
    path: "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/nsw_da_applications.csv",
  },
  {
    label: "NSW DA poll log",
    table: "nsw_da_poll_log",
    path: "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/nsw_da_poll_log.csv",
  },
  {
    label: "Client DAs",
    table: "client_das",
    path: "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/client_das.csv",
  },
  {
    label: "ACT DA tracker applications",
    table: "da_tracker_applications",
    path: "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/da_tracker_applications.csv",
  },
];

function readIds(path) {
  return fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^"?(\d+)"?,/);
      if (!match) throw new Error(`Could not parse id from ${path}: ${line.slice(0, 80)}`);
      return Number(match[1]);
    });
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

let databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
if (!databaseUrl) throw new Error("DATABASE_URL/MYSQL_URL missing");

if (
  databaseUrl.includes(".railway.internal") &&
  process.env.RAILWAY_SERVICE_MYSQL_X4GF_URL
) {
  const parsed = new URL(databaseUrl);
  parsed.hostname = process.env.RAILWAY_SERVICE_MYSQL_X4GF_URL;
  databaseUrl = parsed.toString();
}

const connection = await mysql.createConnection(databaseUrl);

try {
  for (const file of files) {
    const ids = readIds(file.path);
    const [[summary]] = await connection.query(
      `select count(*) as total, min(id) as minId, max(id) as maxId from ${file.table}`
    );

    const found = new Set();
    for (const batch of chunks(ids, 500)) {
      const [rows] = await connection.query(
        `select id from ${file.table} where id in (${batch.map(() => "?").join(",")})`,
        batch
      );
      for (const row of rows) found.add(Number(row.id));
    }

    const missing = ids.filter((id) => !found.has(id));
    console.log(JSON.stringify({
      label: file.label,
      table: file.table,
      csvRows: ids.length,
      dbRows: Number(summary.total),
      dbMinId: summary.minId == null ? null : Number(summary.minId),
      dbMaxId: summary.maxId == null ? null : Number(summary.maxId),
      matchedCsvIds: found.size,
      missingCount: missing.length,
      missingSample: missing.slice(0, 10),
    }));
  }
} finally {
  await connection.end();
}
