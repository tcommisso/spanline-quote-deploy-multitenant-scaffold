import mysql from "mysql2/promise";

async function main() {
  const url = process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("MYSQL_PUBLIC_URL or DATABASE_URL is required");

  const conn = await mysql.createConnection(url);
  try {
    const [columns] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'crm_leads'
         AND COLUMN_NAME = 'sourceCreatedAt'`
    );

    if (Number(columns[0]?.count ?? 0) === 0) {
      await conn.query("ALTER TABLE `crm_leads` ADD COLUMN `sourceCreatedAt` timestamp NULL AFTER `leadDate`");
      console.log("Added crm_leads.sourceCreatedAt");
    } else {
      console.log("crm_leads.sourceCreatedAt already exists");
    }

    const [indexes] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'crm_leads'
         AND INDEX_NAME = 'idx_crm_leads_source_created_at'`
    );

    if (Number(indexes[0]?.count ?? 0) === 0) {
      await conn.query("CREATE INDEX `idx_crm_leads_source_created_at` ON `crm_leads` (`sourceCreatedAt`)");
      console.log("Added idx_crm_leads_source_created_at");
    } else {
      console.log("idx_crm_leads_source_created_at already exists");
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
