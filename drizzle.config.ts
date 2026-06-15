import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL ?? process.env.MYSQL_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or MYSQL_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
