import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const migrationPath = process.argv[2];
const databaseUrl = process.env.MYSQL_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.MYSQL_URL;

if (!migrationPath) {
  console.error("Usage: pnpm db:migrate:sql [path-to-sql-file]");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("DATABASE_URL, MYSQL_URL, or MYSQL_PUBLIC_URL is required.");
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), migrationPath);
const migrationName = path.basename(resolvedPath);

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const char of sql) {
    current += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement.slice(0, -1).trim());
      current = "";
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements.filter(statement => statement && !statement.startsWith("--"));
}

const sql = await fs.readFile(resolvedPath, "utf8");
const statements = splitSqlStatements(sql);
const connection = await mysql.createConnection(databaseUrl);

try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id int NOT NULL AUTO_INCREMENT,
      name varchar(255) NOT NULL,
      executedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_app_migrations_name (name)
    )
  `);

  const [existing] = await connection.execute(
    "SELECT id FROM app_migrations WHERE name = ? LIMIT 1",
    [migrationName]
  );

  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`Migration ${migrationName} has already been applied.`);
  } else {
    console.log(`Applying ${migrationName} (${statements.length} statements)...`);

    for (const statement of statements) {
      await connection.query(statement);
    }

    await connection.execute("INSERT INTO app_migrations (name) VALUES (?)", [
      migrationName,
    ]);
    console.log(`Migration ${migrationName} applied successfully.`);
  }
} catch (error) {
  console.error(`Migration ${migrationName} failed:`, error);
  process.exitCode = 1;
} finally {
  await connection.end();
}
