import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse the DATABASE_URL
const url = new URL(DATABASE_URL);
const connection = await createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// Read and parse CSV (BOM-aware, Windows line endings)
const raw = readFileSync("/home/ubuntu/upload/bunningproductscalalogue.csv", "utf-8")
  .replace(/^\uFEFF/, "")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const records = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_quotes: true,
  relax_column_count: true,
});

console.log(`Parsed ${records.length} rows from CSV`);

// CSV columns: SPA Code, Description, Colour, Price, Category, Sub-Group, Tags, Colour Group, Particulars
// Map to products table: productCode, name, (colour→colourGroup if no ColourGroup), baseCost, tabName, subTab, (tags→markupCategory), colourGroup, notes

let inserted = 0;
let skipped = 0;

for (const row of records) {
  const productCode = (row["SPA Code"] || "").trim();
  const name = (row["Description"] || "").trim();
  const colour = (row["Colour"] || "").trim();
  const priceStr = (row["Price"] || "").replace("$", "").replace(",", "").trim();
  const category = (row["Category"] || "").trim();
  const subGroup = (row["Sub-Group"] || "").trim();
  const tags = (row["Tags"] || "").trim();
  const colourGroup = (row["Colour Group"] || colour || "").trim();
  const particulars = (row["Particulars"] || "").trim();

  if (!name) {
    skipped++;
    continue;
  }

  const baseCost = parseFloat(priceStr) || 0;

  // Use category as tabName, subGroup as subTab
  const tabName = category || "General";
  const subTab = subGroup || null;

  await connection.execute(
    `INSERT INTO products (productCode, tabName, subTab, name, uom, baseCost, materials, installLabour, consumables, markupCategory, colourGroup, notes, sortOrder, active)
     VALUES (?, ?, ?, ?, 'ea', ?, ?, 0, 0, ?, ?, ?, 0, 1)`,
    [
      productCode || null,
      tabName,
      subTab,
      name,
      baseCost.toFixed(2),
      baseCost.toFixed(2), // materials = baseCost for purchased items
      tags || null,       // markupCategory = tags (e.g., "Bunnings")
      colourGroup || null,
      particulars || null, // notes
    ]
  );
  inserted++;
}

console.log(`Import complete: ${inserted} inserted, ${skipped} skipped (no name)`);
await connection.end();
