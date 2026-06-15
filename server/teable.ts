/**
 * Teable API helper — SQL queries and record creation against the Altaspan product catalogue.
 * Mirrors the patterns from the standalone ConstructionOrderForm Next.js app.
 */
import { ENV } from "./_core/env.js";

const BASE_ID = "bseAzGENTGYSP3F2iuW";

function getConfig() {
  return {
    baseUrl: ENV.teableApiUrl,
    token: ENV.teableAppToken,
  };
}

// ─── SQL Query ──────────────────────────────────────────────────────────────
interface SqlQueryResult {
  rows: Record<string, unknown>[];
}

export async function sqlQuery(
  baseId: string,
  sql: string
): Promise<SqlQueryResult> {
  const { baseUrl, token } = getConfig();
  const url = `${baseUrl}/api/base/${baseId}/sql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      `Teable SQL Error [${res.status}]: ${(err as any).message || "Unknown error"}`
    );
  }
  const data = await res.json();
  return { rows: (data as any).rows ?? (data as any).data ?? [] };
}

// ─── Record Creation ────────────────────────────────────────────────────────
interface TeableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>
): Promise<TeableRecord> {
  const { baseUrl, token } = getConfig();
  const url = `${baseUrl}/api/table/${tableId}/record`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fieldKeyType: "id",
      typecast: true,
      records: [{ fields }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      `Teable Create Error [${res.status}]: ${(err as any).message || "Unknown error"}`
    );
  }
  const data = await res.json();
  const records = (data as any).records ?? [];
  return records[0] ?? { id: "", fields: {} };
}

export async function createRecords(
  tableId: string,
  records: Array<{ fields: Record<string, unknown> }>
): Promise<TeableRecord[]> {
  const { baseUrl, token } = getConfig();
  const url = `${baseUrl}/api/table/${tableId}/record`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fieldKeyType: "id",
      typecast: true,
      records,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      `Teable Create Error [${res.status}]: ${(err as any).message || "Unknown error"}`
    );
  }
  const data = await res.json();
  return (data as any).records ?? [];
}

// ─── Constants ──────────────────────────────────────────────────────────────
export const TEABLE_BASE_ID = BASE_ID;

export const PRODUCT_CATEGORIES = [
  { name: "Aluminium", tableId: "tbl7tSDIafWDHuFSGV0", sqlTable: "Aluminium" },
  { name: "Ampelite", tableId: "tblZjBWokWNtepe3ytb", sqlTable: "Ampelite" },
  { name: "Back Channel", tableId: "tblr0VKTnuzAeTKb2wl", sqlTable: "Back_Channel" },
  { name: "Brackets & Componentry", tableId: "tblGd1LBNdx6VOVBodm", sqlTable: "Brackets_Componentry" },
  { name: "Coils", tableId: "tbldELnsMj0I60cXwZ6", sqlTable: "Coils" },
  { name: "Downlights", tableId: "tbl844HmLywtZYF1oms", sqlTable: "Downlights" },
  { name: "Infill", tableId: "tbl9sE2Wd2uxyLTZZZg", sqlTable: "Infill" },
  { name: "IRP IWP", tableId: "tblpQ91YV50uYVowIAG", sqlTable: "IRP_IWP" },
  { name: "Laserlite", tableId: "tblqQweYMUgbswQzuJq", sqlTable: "Laserlite" },
  { name: "Rainwater Harvesting", tableId: "tblQcKryNJy1aQ27cDf", sqlTable: "Rainwater_Harvesting" },
  { name: "Screws", tableId: "tbl9KTmLBAc1MmgkOr7", sqlTable: "Screws" },
  { name: "Silicone & Adhesive", tableId: "tblrSyEq9xeqfC88NTs", sqlTable: "Silicone_Adhesive" },
  { name: "Spanlites", tableId: "tbluIs1xP1BATCgI7xZ", sqlTable: "Spanlites" },
  { name: "Touch Up Paint", tableId: "tblQJ9FbLw4aQo4F87N", sqlTable: "Touch_Up_Paint" },
] as const;

// Table IDs for write operations
export const CONSTRUCTION_ORDERS_TABLE = "tblnYcgKX0VwINbTo55";
export const CONSTRUCTION_ORDER_LINES_TABLE = "tbl6MGnhDHT31HhCcxM";
export const OTHER_PRODUCTS_TABLE = "tblJpxzQZudKshPTKMS";

// Field IDs for Construction Orders
export const ORDER_FIELDS = {
  orderDate: "fldVlOgVQcWNxnLfcon",
  requestedBy: "fld9L9tv8EPn9uwhR1R",
  email: "fldfYY1XW6KO94Jz43R",
  locationRequired: "fldvkeUjp6YRH7WbVtt",
  jobNumber: "fldxChin3miMqNXaU39",
  dateRequired: "fld8zJHD4p6jTVlTqKG",
  status: "fldqmjZERX40FPLR7pZ",
  notes: "fldNIUFylf6ywpjHSH3",
} as const;

// Field IDs for Construction Order Lines
export const LINE_FIELDS = {
  category: "fld10X9KTsYQRIPoISL",
  spaCode: "fldkhpz5l5FB12xsDan",
  description: "fldAvFKY8gXL48PE03h",
  colour: "fldfypi0OCWUR2HApy6",
  requiredColour: "fldQ06S0qbPnskitRD0",
  uom: "fldmdbkfrnc8d5mQPIb",
  packQtySizes: "fldet3bxBJxRqiJ9uXX",
  unitPrice: "fld8VZoRjLzdxVaPJ36",
  quantity: "fld1sPiN1rGxK9vnVij",
  lineNotes: "fldGE4ygYeGvySdXBlz",
  order: "fldbLC1Ha2EmuiQgBdf",
} as const;

// Field IDs for Other Products
export const OTHER_PRODUCT_FIELDS = {
  number: "fldS9V3u9DVPeyJKtD0",
  status: "fldarevtZeMNz6GJ02m",
  label: "fldQiRQYZoatLsfa0ER",
  uom: "fldrynMl7pnDwl4fCYk",
  packQtySizes: "fldeiVwEfH1auV0Ny35",
  price: "fld6fqaGBN8cjpHaMtb",
} as const;
