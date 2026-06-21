import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { router, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { isMultiTenancyMode, tenantIdFromContext, tenantScoped } from "./_core/tenant-scope";
import { normalizeUserRole } from "../shared/const";
import { blindFabricCategoryLabel, blindFabricCategoryNumber, blindFabricCategoryValue, blindProductTypeValue } from "../shared/blinds";
import {
  crmLeads,
  masterData,
  blindColours,
  blindCostAdditions,
  blindFabricColours,
  blindGlassInfill,
  blindPriceAdjustments,
  blindPricingMatrix,
  blindPricingSettings,
  blindProductOptions,
  blindQuoteCostAdditions,
  blindQuoteItemOptions,
  blindQuoteItems,
  blindQuotes,
  users,
} from "../drizzle/schema";
import { storagePut } from "./storage";

type ParsedMatrixRow = {
  brand: string;
  productType: string;
  fabricCategory: string;
  fabricCategoryNumber: string;
  categoryFabrics: string | null;
  widthMm: number;
  heightMm: number;
  priceIncGst: number;
  discountedCost: number | null;
  supplierListPrice: number | null;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function tenantIdForContext(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
  return tenantId;
}

function scope(column: any, tenantId: number) {
  return tenantScoped(column, tenantId)!;
}

type ScreenQuoteScopeOptions = {
  includeAllTenants?: boolean;
};

function screenQuoteScopeOptionsForContext(ctx: { user?: { role?: string | null } | null }): ScreenQuoteScopeOptions | undefined {
  return normalizeUserRole(ctx.user?.role) === "super_admin"
    ? { includeAllTenants: true }
    : undefined;
}

function addScreenQuoteTenantScope(
  conditions: any[],
  column: any,
  tenantId: number,
  options?: ScreenQuoteScopeOptions,
) {
  if (options?.includeAllTenants && !isMultiTenancyMode()) return;
  conditions.push(scope(column, tenantId));
}

function insertIdFromResult(result: any): number | null {
  const rawId = result?.insertId ?? result?.[0]?.insertId;
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function rowsFromExecuteResult(result: any): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function hasDbColumn(db: any, tableName: string, columnName: string) {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `);
  return Number(rowsFromExecuteResult(result)?.[0]?.count || 0) > 0;
}

const ssQuoteItemDetailColumns = [
  { name: "colourId", definition: "`colourId` int NULL AFTER `quantity`" },
  { name: "colourName", definition: "`colourName` varchar(128) NULL AFTER `colourId`" },
  { name: "handleSide", definition: "`handleSide` varchar(32) NULL AFTER `colourName`" },
  { name: "hingeSide", definition: "`hingeSide` varchar(32) NULL AFTER `handleSide`" },
  { name: "openingDirection", definition: "`openingDirection` varchar(32) NULL AFTER `hingeSide`" },
  { name: "hingePosition", definition: "`hingePosition` varchar(32) NULL AFTER `openingDirection`" },
  { name: "glassInfillId", definition: "`glassInfillId` int NULL AFTER `hingePosition`" },
  { name: "glassInfillQuantity", definition: "`glassInfillQuantity` decimal(10,2) NOT NULL DEFAULT '1.00' AFTER `glassInfillId`" },
  { name: "fabricColourId", definition: "`fabricColourId` int NULL AFTER `glassInfillQuantity`" },
  { name: "fabricColourName", definition: "`fabricColourName` varchar(128) NULL AFTER `fabricColourId`" },
];

let ssQuoteItemDetailColumnsPromise: Promise<void> | null = null;

async function ensureSsQuoteItemDetailColumns(db: any) {
  if (!ssQuoteItemDetailColumnsPromise) {
    ssQuoteItemDetailColumnsPromise = (async () => {
      for (const column of ssQuoteItemDetailColumns) {
        if (await hasDbColumn(db, "blind_quote_items", column.name)) continue;
        await db.execute(sql.raw(`ALTER TABLE \`blind_quote_items\` ADD COLUMN ${column.definition}`));
      }
    })().catch((error) => {
      ssQuoteItemDetailColumnsPromise = null;
      console.error("[Blinds] Failed to verify quote item detail columns", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Blind quote item columns are not up to date. Run the blind quote database migration.",
      });
    });
  }

  await ssQuoteItemDetailColumnsPromise;
}

async function quoteIdFromInsertResult(db: any, tenantId: number, insertResult: any, quoteNumber: string) {
  const [quote] = await db
    .select({ id: blindQuotes.id })
    .from(blindQuotes)
    .where(and(eq(blindQuotes.quoteNumber, quoteNumber), scope(blindQuotes.tenantId, tenantId)))
    .limit(1);

  const quoteId = Number(quote?.id);
  if (Number.isFinite(quoteId) && quoteId > 0) return quoteId;

  const insertId = insertIdFromResult(insertResult);
  if (insertId) return insertId;

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Quote was created but could not be reloaded.",
  });
}

async function quoteItemIdFromInsertResult(
  db: any,
  tenantId: number,
  insertResult: any,
  quoteId: number,
  itemNumber: number,
) {
  const [item] = await db
    .select({ id: blindQuoteItems.id })
    .from(blindQuoteItems)
    .where(and(
      eq(blindQuoteItems.quoteId, quoteId),
      eq(blindQuoteItems.itemNumber, itemNumber),
      scope(blindQuoteItems.tenantId, tenantId),
    ))
    .orderBy(desc(blindQuoteItems.id))
    .limit(1);

  const itemId = Number(item?.id);
  if (Number.isFinite(itemId) && itemId > 0) return itemId;

  const insertId = insertIdFromResult(insertResult);
  if (insertId) return insertId;

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quote item was created but could not be reloaded.",
    });
}

function createQuoteNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BL-${timestamp}-${suffix}`;
}

function compactKey(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseMetadata(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function validHex(value: unknown) {
  const text = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : null;
}

function fallbackColourHex(...values: unknown[]) {
  const key = compactKey(values.filter(Boolean).join(" "));
  const matches: Array<[string, string]> = [
    ["doverwhite", "#f7f7f2"],
    ["offwhite", "#f7f7f2"],
    ["surfmist", "#d9d8cf"],
    ["classiccream", "#e8dcc4"],
    ["smoothcream", "#e8dcc4"],
    ["paperbark", "#c9bda4"],
    ["merino", "#c9bda4"],
    ["woodlandgrey", "#4b5047"],
    ["slategrey", "#4b5047"],
    ["monument", "#2b3135"],
    ["eveninghaze", "#c2b9a5"],
    ["irongrey", "#4f5251"],
    ["ironstone", "#4f5251"],
    ["basalt", "#575b5e"],
    ["jasminbrown", "#7d6a52"],
    ["armourgrey", "#6b7175"],
    ["mistgreen", "#9aa58d"],
    ["ebonyblackmatt", "#0d1117"],
    ["black", "#0d1117"],
  ];
  return matches.find(([needle]) => key.includes(needle))?.[1] || "#f8fafc";
}

function masterColourName(row: any) {
  return String(row.value || row.key || "");
}

function masterColourHex(row: any) {
  const metadata = parseMetadata(row.metadata);
  return validHex(metadata.hexCode)
    || validHex(metadata.hex)
    || validHex(metadata.color)
    || fallbackColourHex(row.key, row.value);
}

function isActiveFlag(value: unknown) {
  return value !== false && value !== 0 && value !== "0";
}

function coloursMatchMaster(colour: any, row: any) {
  const masterKeys = [row.key, row.value].map(compactKey).filter(Boolean);
  return [colour.name, colour.colorbondName].map(compactKey).some((value) => value && masterKeys.includes(value));
}

async function resolveScreenColour(db: any, tenantId: number, selection: unknown, fallbackName?: string | null) {
  const raw = String(selection ?? "").trim();
  const requestedName = String(fallbackName || raw || "").trim();
  if (!raw && !requestedName) {
    return { validColourId: null as number | null, colourName: null as string | null, surchargePercent: 0 };
  }

  const customId = typeof selection === "number" ? selection : (/^\d+$/.test(raw) ? Number(raw) : null);
  const customRows = await db.select().from(blindColours).where(scope(blindColours.tenantId, tenantId));

  if (customId) {
    const colour = customRows.find((row: any) => Number(row.id) === customId);
    if (colour && isActiveFlag(colour.isActive)) {
      return {
        validColourId: colour.id,
        colourName: requestedName || colour.name || colour.colorbondName || null,
        surchargePercent: Number(colour.surchargePercent || 0),
      };
    }
  }

  const masterId = raw.startsWith("master:") ? Number(raw.slice(7)) : null;
  if (Number.isFinite(masterId) && masterId && masterId > 0) {
    const [master] = await db
      .select()
      .from(masterData)
      .where(and(eq(masterData.id, masterId), eq(masterData.category, "colour"), scope(masterData.tenantId, tenantId)))
      .limit(1);
    if (master) {
      const overlay = customRows.find((colour: any) => coloursMatchMaster(colour, master));
      return {
        validColourId: overlay?.id ?? null,
        colourName: requestedName || masterColourName(master),
        surchargePercent: overlay && isActiveFlag(overlay.isActive) ? Number(overlay.surchargePercent || 0) : 0,
      };
    }
  }

  const key = compactKey(requestedName || raw);
  const custom = customRows.find((colour: any) => [colour.name, colour.colorbondName].map(compactKey).includes(key));
  if (custom && isActiveFlag(custom.isActive)) {
    return {
      validColourId: custom.id,
      colourName: requestedName || custom.name || custom.colorbondName || null,
      surchargePercent: Number(custom.surchargePercent || 0),
    };
  }

  const masterRows = await db
    .select()
    .from(masterData)
    .where(and(eq(masterData.category, "colour"), scope(masterData.tenantId, tenantId)));
  const master = masterRows.find((row: any) => [row.key, row.value].map(compactKey).includes(key));
  if (master) {
    const overlay = customRows.find((colour: any) => coloursMatchMaster(colour, master));
    return {
      validColourId: overlay?.id ?? null,
      colourName: requestedName || masterColourName(master),
      surchargePercent: overlay && isActiveFlag(overlay.isActive) ? Number(overlay.surchargePercent || 0) : 0,
    };
  }

  return { validColourId: null as number | null, colourName: requestedName || null, surchargePercent: 0 };
}

async function resolveBlindFabricColour(db: any, tenantId: number, selection: unknown, fallbackName?: string | null) {
  const raw = String(selection ?? "").trim();
  const requestedName = String(fallbackName || raw || "").trim();
  const customId = typeof selection === "number" ? selection : (/^\d+$/.test(raw) ? Number(raw) : null);

  if (customId) {
    const [fabricColour] = await db
      .select()
      .from(blindFabricColours)
      .where(and(eq(blindFabricColours.id, customId), scope(blindFabricColours.tenantId, tenantId), eq(blindFabricColours.isActive, true)))
      .limit(1);
    if (fabricColour) {
      return {
        validFabricColourId: fabricColour.id,
        fabricColourName: fabricColour.name,
      };
    }
  }

  if (!requestedName) {
    return { validFabricColourId: null as number | null, fabricColourName: null as string | null };
  }

  const [fabricColour] = await db
    .select()
    .from(blindFabricColours)
    .where(and(eq(blindFabricColours.name, requestedName), scope(blindFabricColours.tenantId, tenantId), eq(blindFabricColours.isActive, true)))
    .limit(1);

  return {
    validFabricColourId: fabricColour?.id ?? null,
    fabricColourName: fabricColour?.name || requestedName,
  };
}

function canonicalBrand(value: string) {
  return blindFabricCategoryValue(value);
}

function canonicalProductType(value: string) {
  return blindProductTypeValue(value);
}

function compactSql(column: any) {
  return sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(${column}, '-', ''), ' ', ''), '_', ''), '/', ''))`;
}

function pricingMatrixIdentity(brand: string, productType: string) {
  return and(
    sql`${compactSql(blindPricingMatrix.brand)} = ${canonicalBrand(brand)}`,
    sql`${compactSql(blindPricingMatrix.productType)} = ${canonicalProductType(productType)}`,
  );
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function numberFromCell(value: unknown): number | null {
  const cleaned = String(value ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePricingMatrixCsv(csv: string, brand: string, productType: string): ParsedMatrixRow[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return [];

  const headers = rows[0]!.map(compactKey);
  const dataRows = rows.slice(1);
  const findHeader = (...aliases: string[]) => {
    const keys = aliases.map(compactKey);
    return headers.findIndex((header) => keys.includes(header));
  };

  const brandIndex = findHeader("brand", "fabricCategory", "fabricCategoryNumber", "category");
  const fabricCategoryIndex = findHeader("fabricCategory", "fabricCategoryNumber", "category");
  const fabricCategoryLabelIndex = findHeader("fabricCategory", "category");
  const categoryFabricsIndex = findHeader("categoryFabrics", "fabrics");
  const productTypeIndex = findHeader("productType", "type", "product", "blindType");
  const heightIndex = findHeader("heightMm", "height", "h");
  const widthIndex = findHeader("widthMm", "width", "w");
  const priceIndex = findHeader("priceIncGst", "sellPriceIncGst", "price", "incGst", "priceGst", "sellPrice");
  const discountedCostIndex = findHeader("discountedCost", "unitCost", "cost");
  const supplierListPriceIndex = findHeader("supplierListPrice", "listPrice");

  if (heightIndex >= 0 && widthIndex >= 0 && priceIndex >= 0) {
    return dataRows.flatMap((row) => {
      const rowBrand = brandIndex >= 0 ? canonicalBrand(row[brandIndex] || brand) : canonicalBrand(brand);
      const rowProductType = productTypeIndex >= 0 ? canonicalProductType(row[productTypeIndex] || productType) : canonicalProductType(productType);
      if (brandIndex < 0 && rowBrand !== canonicalBrand(brand)) return [];
      if (productTypeIndex < 0 && rowProductType !== canonicalProductType(productType)) return [];

      const heightMm = numberFromCell(row[heightIndex]);
      const widthMm = numberFromCell(row[widthIndex]);
      const priceIncGst = numberFromCell(row[priceIndex]);
      if (!heightMm || !widthMm || !priceIncGst) return [];
      const rawCategory = fabricCategoryIndex >= 0 ? row[fabricCategoryIndex] : rowBrand;
      const categoryValue = blindFabricCategoryValue(rawCategory || rowBrand);
      const categoryNumber = blindFabricCategoryNumber(categoryValue);
      return [{
        brand: categoryValue,
        productType: rowProductType,
        fabricCategory: fabricCategoryLabelIndex >= 0 ? (row[fabricCategoryLabelIndex] || blindFabricCategoryLabel(categoryValue)) : blindFabricCategoryLabel(categoryValue),
        fabricCategoryNumber: categoryNumber,
        categoryFabrics: categoryFabricsIndex >= 0 ? (row[categoryFabricsIndex] || null) : null,
        heightMm: Math.round(heightMm),
        widthMm: Math.round(widthMm),
        priceIncGst,
        discountedCost: discountedCostIndex >= 0 ? numberFromCell(row[discountedCostIndex]) : null,
        supplierListPrice: supplierListPriceIndex >= 0 ? numberFromCell(row[supplierListPriceIndex]) : null,
      }];
    });
  }

  const pivotWidthIndexes = headers
    .map((_, index) => ({ index, width: index === 0 ? null : numberFromCell(rows[0]![index]) }))
    .filter((entry): entry is { index: number; width: number } => Number.isFinite(entry.width));

  if (pivotWidthIndexes.length === 0) return [];

  return dataRows.flatMap((row) => {
    const heightMm = numberFromCell(row[0]);
    if (!heightMm) return [];

    return pivotWidthIndexes.flatMap(({ index, width }) => {
      const priceIncGst = numberFromCell(row[index]);
      if (!priceIncGst) return [];
      const categoryValue = canonicalBrand(brand);
      return [{
        brand: categoryValue,
        productType: canonicalProductType(productType),
        fabricCategory: blindFabricCategoryLabel(categoryValue),
        fabricCategoryNumber: blindFabricCategoryNumber(categoryValue),
        categoryFabrics: null,
        heightMm: Math.round(heightMm),
        widthMm: Math.round(width),
        priceIncGst,
        discountedCost: null,
        supplierListPrice: null,
      }];
    });
  });
}

async function nullableExistingUserId(db: any, userId: unknown): Promise<number | null> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user?.id ?? null;
}

async function getDefaultMarkupPercent(db: any, tenantId: number) {
  const [settings] = await db
    .select()
    .from(blindPricingSettings)
    .where(eq(blindPricingSettings.tenantId, tenantId))
    .limit(1);

  if (settings) return Number(settings.defaultMarkupPercent || 30);

  await db.insert(blindPricingSettings).values({
    tenantId,
    defaultMarkupPercent: "30.00",
  }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  return 30;
}

async function getCumulativeAdjustmentFactor(db: any, tenantId: number): Promise<number> {
  const adjustments = await db
    .select()
    .from(blindPriceAdjustments)
    .where(scope(blindPriceAdjustments.tenantId, tenantId))
    .orderBy(asc(blindPriceAdjustments.effectiveDate));

  const today = new Date().toISOString().slice(0, 10);
  let factor = 1;
  for (const adjustment of adjustments) {
    if (adjustment.effectiveDate <= today) {
      factor *= 1 + Number(adjustment.percentageIncrease || 0) / 100;
    }
  }
  return factor;
}

async function interpolatePrice(
  db: any,
  tenantId: number,
  brand: string,
  productType: string,
  widthMm: number,
  heightMm: number,
) {
  const rows = await db
    .select()
    .from(blindPricingMatrix)
    .where(and(
      scope(blindPricingMatrix.tenantId, tenantId),
      pricingMatrixIdentity(brand, productType),
    ));

  if (rows.length === 0) return null;

  const widths: number[] = Array.from(new Set<number>(rows.map((r: any) => Number(r.widthMm)))).sort((a, b) => a - b);
  const heights: number[] = Array.from(new Set<number>(rows.map((r: any) => Number(r.heightMm)))).sort((a, b) => a - b);
  const minWidth = widths[0] ?? widthMm;
  const maxWidth = widths[widths.length - 1] ?? widthMm;
  const minHeight = heights[0] ?? heightMm;
  const maxHeight = heights[heights.length - 1] ?? heightMm;
  const warnings: string[] = [];

  if (widthMm < minWidth) warnings.push(`Width ${widthMm}mm is below the matrix minimum of ${minWidth}mm; using nearest edge price.`);
  if (widthMm > maxWidth) warnings.push(`Width ${widthMm}mm is above the matrix maximum of ${maxWidth}mm; using nearest edge price.`);
  if (heightMm < minHeight) warnings.push(`Height ${heightMm}mm is below the matrix minimum of ${minHeight}mm; using nearest edge price.`);
  if (heightMm > maxHeight) warnings.push(`Height ${heightMm}mm is above the matrix maximum of ${maxHeight}mm; using nearest edge price.`);

  let w1 = minWidth;
  let w2 = maxWidth;
  for (let i = 0; i < widths.length - 1; i++) {
    const left = widths[i] ?? minWidth;
    const right = widths[i + 1] ?? maxWidth;
    if (left <= widthMm && right >= widthMm) {
      w1 = left;
      w2 = right;
      break;
    }
  }
  if (widthMm <= minWidth) { w1 = minWidth; w2 = minWidth; }
  if (widthMm >= maxWidth) { w1 = maxWidth; w2 = maxWidth; }

  let h1 = minHeight;
  let h2 = maxHeight;
  for (let i = 0; i < heights.length - 1; i++) {
    const lower = heights[i] ?? minHeight;
    const upper = heights[i + 1] ?? maxHeight;
    if (lower <= heightMm && upper >= heightMm) {
      h1 = lower;
      h2 = upper;
      break;
    }
  }
  if (heightMm <= minHeight) { h1 = minHeight; h2 = minHeight; }
  if (heightMm >= maxHeight) { h1 = maxHeight; h2 = maxHeight; }

  const getPrice = (h: number, w: number): number | null => {
    const row = rows.find((r: any) => Number(r.heightMm) === h && Number(r.widthMm) === w);
    return row ? Number(row.priceIncGst) : null;
  };

  const q11 = getPrice(h1, w1);
  const q12 = getPrice(h1, w2);
  const q21 = getPrice(h2, w1);
  const q22 = getPrice(h2, w2);
  let basePrice: number;

  if (q11 === null || q12 === null || q21 === null || q22 === null) {
    let nearest = rows[0] as any;
    let minDistance = Infinity;
    for (const row of rows as any[]) {
      const distance = Math.abs(Number(row.widthMm) - widthMm) + Math.abs(Number(row.heightMm) - heightMm);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = row;
      }
    }
    basePrice = Number(nearest.priceIncGst);
    warnings.push("No complete matrix intersection was found; using the nearest available price point.");
  } else if (w1 === w2 && h1 === h2) {
    basePrice = q11;
  } else if (w1 === w2) {
    const t = (heightMm - h1) / (h2 - h1);
    basePrice = q11 + t * (q21 - q11);
  } else if (h1 === h2) {
    const t = (widthMm - w1) / (w2 - w1);
    basePrice = q11 + t * (q12 - q11);
  } else {
    const tw = (widthMm - w1) / (w2 - w1);
    const th = (heightMm - h1) / (h2 - h1);
    const r1 = q11 + tw * (q12 - q11);
    const r2 = q21 + tw * (q22 - q21);
    basePrice = r1 + th * (r2 - r1);
  }

  return {
    basePrice,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    outOfRange: warnings.length > 0,
    warnings,
  };
}

async function requireQuote(db: any, tenantId: number, quoteId: number) {
  const [quote] = await db
    .select()
    .from(blindQuotes)
    .where(and(eq(blindQuotes.id, quoteId), scope(blindQuotes.tenantId, tenantId)))
    .limit(1);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Blind quote not found" });
  return quote;
}

async function recalculateQuoteTotals(db: any, tenantId: number, quoteId: number) {
  await ensureSsQuoteItemDetailColumns(db);
  const items = await db
    .select()
    .from(blindQuoteItems)
    .where(and(eq(blindQuoteItems.quoteId, quoteId), scope(blindQuoteItems.tenantId, tenantId)));
  const costs = await db
    .select()
    .from(blindQuoteCostAdditions)
    .where(and(eq(blindQuoteCostAdditions.quoteId, quoteId), scope(blindQuoteCostAdditions.tenantId, tenantId)));

  const subtotalExGst = [...items, ...costs].reduce((sum, row: any) => {
    return sum + Number(row.lineTotalExGst ?? row.lineTotal ?? 0);
  }, 0);
  const gstAmount = subtotalExGst * 0.1;
  const totalIncGst = subtotalExGst + gstAmount;

  await db.update(blindQuotes).set({
    subtotalExGst: subtotalExGst.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    totalIncGst: totalIncGst.toFixed(2),
  }).where(and(eq(blindQuotes.id, quoteId), scope(blindQuotes.tenantId, tenantId)));
}

const statusInput = z.enum(["draft", "sent", "accepted", "declined", "expired"]);
const quoteIdentifierInput = z.union([z.number().int().positive(), z.string().trim().min(1)]);

function compactQuoteReference(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function quoteLookupCondition(identifier: z.infer<typeof quoteIdentifierInput>) {
  const rawIdentifier = String(identifier).trim();
  const numericId = typeof identifier === "number"
    ? identifier
    : (/^\d+$/.test(rawIdentifier) ? Number(rawIdentifier) : null);
  const conditions: any[] = [];

  if (numericId && Number.isSafeInteger(numericId) && numericId > 0) {
    conditions.push(eq(blindQuotes.id, numericId));
  }

  if (rawIdentifier && !/^\d+$/.test(rawIdentifier)) {
    conditions.push(eq(blindQuotes.quoteNumber, rawIdentifier.toUpperCase()));
    const compactIdentifier = compactQuoteReference(rawIdentifier);
    if (compactIdentifier.length >= 8) {
      const compactColumn = sql<string>`REPLACE(REPLACE(UPPER(${blindQuotes.quoteNumber}), '-', ''), ' ', '')`;
      conditions.push(eq(compactColumn, compactIdentifier));
      conditions.push(sql`${compactColumn} LIKE ${`${compactIdentifier}%`}`);
    }
  }

  if (conditions.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid blind quote reference" });
  }

  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

async function loadQuoteDetailRows(db: any, tenantId: number, quote: any, options?: ScreenQuoteScopeOptions) {
  const quoteId = Number(quote.id);
  let items: any[] = [];
  let itemOptions: any[] = [];
  let costAdditions: any[] = [];
  let costDefinitions: any[] = [];

  try {
    await ensureSsQuoteItemDetailColumns(db);
    const conditions: any[] = [eq(blindQuoteItems.quoteId, quoteId)];
    addScreenQuoteTenantScope(conditions, blindQuoteItems.tenantId, tenantId, options);
    items = await db.select().from(blindQuoteItems).where(and(...conditions)).orderBy(asc(blindQuoteItems.itemNumber));
  } catch (error) {
    console.warn("[Blinds] Quote items failed to load", { quoteId, error });
  }

  try {
    const itemIds = items.map((item: any) => Number(item.id)).filter((id: number) => Number.isFinite(id) && id > 0);
    if (itemIds.length) {
      const conditions: any[] = [inArray(blindQuoteItemOptions.quoteItemId, itemIds)];
      addScreenQuoteTenantScope(conditions, blindQuoteItemOptions.tenantId, tenantId, options);
      itemOptions = await db.select().from(blindQuoteItemOptions).where(and(...conditions));
    }
  } catch (error) {
    console.warn("[Blinds] Quote item options failed to load", { quoteId, error });
  }

  try {
    const conditions: any[] = [eq(blindQuoteCostAdditions.quoteId, quoteId)];
    addScreenQuoteTenantScope(conditions, blindQuoteCostAdditions.tenantId, tenantId, options);
    costAdditions = await db.select().from(blindQuoteCostAdditions).where(and(...conditions));
  } catch (error) {
    console.warn("[Blinds] Quote cost additions failed to load", { quoteId, error });
  }

  try {
    const costIds = costAdditions
      .map((cost: any) => Number(cost.costAdditionId))
      .filter((id: number) => Number.isFinite(id) && id > 0);
    if (costIds.length) {
      const conditions: any[] = [inArray(blindCostAdditions.id, costIds)];
      addScreenQuoteTenantScope(conditions, blindCostAdditions.tenantId, tenantId, options);
      costDefinitions = await db.select().from(blindCostAdditions).where(and(...conditions));
    }
  } catch (error) {
    console.warn("[Blinds] Cost definitions failed to load", { quoteId, error });
  }

  return {
    ...quote,
    items: items.map((item: any) => ({
      ...item,
      options: itemOptions.filter((option: any) => option.quoteItemId === item.id),
    })),
    costAdditions: costAdditions.map((cost: any) => {
      const definition = costDefinitions.find((item: any) => item.id === cost.costAdditionId);
      return {
        ...cost,
        name: definition?.name || "Additional cost",
        category: definition?.category || null,
        uom: definition?.uom || null,
      };
    }),
  };
}

export const blindsRouter = router({
  pricingSettings: router({
    get: tenantProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      const defaultMarkupPercent = await getDefaultMarkupPercent(db, tenantId);
      return { defaultMarkupPercent };
    }),
    update: tenantAdminProcedure
      .input(z.object({ defaultMarkupPercent: z.number().min(0).max(300) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const userId = ctx.user?.id;
        if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "User context required" });
        await db.insert(blindPricingSettings).values({
          tenantId,
          defaultMarkupPercent: input.defaultMarkupPercent.toFixed(2),
          updatedBy: userId,
        }).onDuplicateKeyUpdate({
          set: {
            defaultMarkupPercent: input.defaultMarkupPercent.toFixed(2),
            updatedBy: userId,
          },
        });
        return { success: true };
      }),
  }),

  getMatrix: tenantProcedure
    .input(z.object({ brand: z.string(), productType: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      return db
        .select()
        .from(blindPricingMatrix)
        .where(and(scope(blindPricingMatrix.tenantId, tenantId), pricingMatrixIdentity(input.brand, input.productType)))
        .orderBy(asc(blindPricingMatrix.heightMm), asc(blindPricingMatrix.widthMm));
    }),

  importMatrixCsv: tenantAdminProcedure
    .input(z.object({
      brand: z.string().min(1),
      productType: z.string().min(1),
      csv: z.string().min(1).max(5_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      const rows = parsePricingMatrixCsv(input.csv, input.brand, input.productType);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No pricing rows found. Upload a CSV with brand/productType/widthMm/heightMm/priceIncGst columns, or a matrix with heights down the first column and widths across the header row.",
        });
      }

      const importedCombos = Array.from(
        new Set(rows.map((row) => `${row.brand}\t${row.productType}`)),
        (key) => {
          const [brand, productType] = key.split("\t");
          return { brand: brand || canonicalBrand(input.brand), productType: productType || canonicalProductType(input.productType) };
        },
      );

      for (const combo of importedCombos) {
        await db
          .delete(blindPricingMatrix)
          .where(and(scope(blindPricingMatrix.tenantId, tenantId), pricingMatrixIdentity(combo.brand, combo.productType)));
      }

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await db.insert(blindPricingMatrix).values(chunk.map((row) => ({
          tenantId,
          brand: row.brand,
          productType: row.productType,
          fabricCategory: row.fabricCategory,
          fabricCategoryNumber: row.fabricCategoryNumber,
          categoryFabrics: row.categoryFabrics,
          heightMm: row.heightMm,
          widthMm: row.widthMm,
          discountedCost: row.discountedCost == null ? null : row.discountedCost.toFixed(2),
          supplierListPrice: row.supplierListPrice == null ? null : row.supplierListPrice.toFixed(2),
          priceIncGst: row.priceIncGst.toFixed(2),
        })));
      }

      return { imported: rows.length, brand: importedCombos[0]?.brand, productType: importedCombos[0]?.productType, combinations: importedCombos.length };
    }),

  calculatePrice: tenantProcedure
    .input(z.object({ brand: z.string(), productType: z.string(), widthMm: z.number(), heightMm: z.number(), quoteId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      const price = await interpolatePrice(db, tenantId, input.brand, input.productType, input.widthMm, input.heightMm);
      if (!price) {
        return {
          basePrice: null,
          adjustedPrice: null,
          factor: 1,
          markupPercent: 0,
          warnings: ["No pricing matrix exists for this brand/product type. Import the matrix in Admin > Data & Pricing > Blinds Data > Matrix."],
          outOfRange: false,
        };
      }
      const factor = await getCumulativeAdjustmentFactor(db, tenantId);
      const quote = input.quoteId ? await requireQuote(db, tenantId, input.quoteId) : null;
      const markupPercent = quote?.markupPercent != null
        ? Number(quote.markupPercent)
        : await getDefaultMarkupPercent(db, tenantId);
      const matrixPriceExGst = price.basePrice / 1.1;
      const adjustedPriceExGst = matrixPriceExGst * factor * (1 + markupPercent / 100);
      return {
        ...price,
        matrixPriceIncGst: Math.round(price.basePrice * 100) / 100,
        basePrice: Math.round(matrixPriceExGst * 100) / 100,
        adjustedPrice: Math.round(adjustedPriceExGst * 100) / 100,
        factor,
        markupPercent,
      };
    }),

  adjustments: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      return db.select().from(blindPriceAdjustments).where(scope(blindPriceAdjustments.tenantId, tenantId)).orderBy(asc(blindPriceAdjustments.effectiveDate));
    }),
    create: tenantAdminProcedure
      .input(z.object({ effectiveDate: z.string(), percentageIncrease: z.number(), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const userId = ctx.user?.id;
        if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "User context required" });
        await db.insert(blindPriceAdjustments).values({
          tenantId,
          effectiveDate: input.effectiveDate,
          percentageIncrease: input.percentageIncrease.toFixed(2),
          description: input.description || null,
          createdBy: userId,
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.delete(blindPriceAdjustments).where(and(eq(blindPriceAdjustments.id, input.id), scope(blindPriceAdjustments.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  costAdditions: router({
    list: tenantProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(blindCostAdditions.tenantId, tenantId), eq(blindCostAdditions.isActive, true)];
        if (input?.category) conditions.push(eq(blindCostAdditions.category, input.category));
        return db.select().from(blindCostAdditions).where(and(...conditions)).orderBy(asc(blindCostAdditions.category), asc(blindCostAdditions.name));
      }),
    create: tenantAdminProcedure
      .input(z.object({ category: z.string(), name: z.string(), description: z.string().optional(), cost: z.number(), uom: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(blindCostAdditions).values({
          tenantId,
          category: input.category,
          name: input.name,
          description: input.description || null,
          cost: input.cost.toFixed(2),
          uom: input.uom || null,
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(blindCostAdditions).set({ isActive: false }).where(and(eq(blindCostAdditions.id, input.id), scope(blindCostAdditions.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  productOptions: router({
    list: tenantProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(blindProductOptions.tenantId, tenantId), eq(blindProductOptions.isActive, true)];
        if (input?.category) conditions.push(eq(blindProductOptions.category, input.category));
        return db.select().from(blindProductOptions).where(and(...conditions)).orderBy(asc(blindProductOptions.category), asc(blindProductOptions.name));
      }),
    create: tenantAdminProcedure
      .input(z.object({
        category: z.string(),
        orderCode: z.string().optional(),
        name: z.string(),
        description: z.string().optional(),
        brand: z.string().optional(),
        costPrice: z.number(),
        sellPrice: z.number(),
        priceUnit: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(blindProductOptions).values({
          tenantId,
          category: input.category,
          orderCode: input.orderCode || null,
          name: input.name,
          description: input.description || null,
          brand: input.brand || null,
          costPrice: input.costPrice.toFixed(2),
          sellPrice: input.sellPrice.toFixed(2),
          priceUnit: input.priceUnit || null,
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(blindProductOptions).set({ isActive: false }).where(and(eq(blindProductOptions.id, input.id), scope(blindProductOptions.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  glassInfill: router({
    list: tenantProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(blindGlassInfill.tenantId, tenantId), eq(blindGlassInfill.isActive, true)];
        const categoryNumber = input?.category ? blindFabricCategoryNumber(input.category) : "";
        if (categoryNumber) conditions.push(eq(blindGlassInfill.categoryNumber, categoryNumber));
        return db
          .select()
          .from(blindGlassInfill)
          .where(and(...conditions))
          .orderBy(asc(blindGlassInfill.categoryNumber), asc(blindGlassInfill.glassType));
      }),
    create: tenantAdminProcedure
      .input(z.object({
        glassType: z.string(),
        description: z.string().optional(),
        cost: z.number(),
        uom: z.string(),
        category: z.string().optional(),
        fabricBrand: z.string().optional(),
        fabricType: z.string().optional(),
        fabricWidth: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const categoryValue = input.category ? blindFabricCategoryValue(input.category) : "";
        await db.insert(blindGlassInfill).values({
          tenantId,
          glassType: input.glassType,
          categoryName: categoryValue ? blindFabricCategoryLabel(categoryValue) : null,
          categoryNumber: categoryValue ? blindFabricCategoryNumber(categoryValue) : null,
          fabricBrand: input.fabricBrand || null,
          fabricType: input.fabricType || null,
          fabricWidth: input.fabricWidth || null,
          description: input.description || null,
          cost: input.cost.toFixed(2),
          uom: input.uom,
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(blindGlassInfill).set({ isActive: false }).where(and(eq(blindGlassInfill.id, input.id), scope(blindGlassInfill.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  fabricColours: router({
    list: tenantProcedure
      .input(z.object({ category: z.string().optional(), fabricRangeId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(blindFabricColours.tenantId, tenantId), eq(blindFabricColours.isActive, true)];
        const categoryNumber = input?.category ? blindFabricCategoryNumber(input.category) : "";
        if (categoryNumber) conditions.push(eq(blindFabricColours.categoryNumber, categoryNumber));
        if (input?.fabricRangeId) conditions.push(eq(blindFabricColours.fabricRangeId, input.fabricRangeId));
        return db
          .select()
          .from(blindFabricColours)
          .where(and(...conditions))
          .orderBy(asc(blindFabricColours.categoryNumber), asc(blindFabricColours.fabricRangeName), asc(blindFabricColours.sortOrder), asc(blindFabricColours.name));
      }),
    create: tenantAdminProcedure
      .input(z.object({
        name: z.string().trim().min(1, "Fabric colour name is required"),
        hexCode: z.string().optional(),
        swatchUrl: z.string().optional(),
        fabricRangeId: z.number().optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const hexCode = input.hexCode?.trim() ? validHex(input.hexCode) : null;
        if (input.hexCode?.trim() && !hexCode) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Fabric colour hex code must be a valid #RRGGBB value." });
        }

        let fabricRangeName: string | null = null;
        let categoryNumber: string | null = input.category ? blindFabricCategoryNumber(input.category) || null : null;
        let fabricRangeId: number | null = null;

        if (input.fabricRangeId) {
          const [fabricRange] = await db
            .select()
            .from(blindGlassInfill)
            .where(and(eq(blindGlassInfill.id, input.fabricRangeId), scope(blindGlassInfill.tenantId, tenantId)))
            .limit(1);
          if (!fabricRange) throw new TRPCError({ code: "NOT_FOUND", message: "Fabric range not found" });
          fabricRangeId = fabricRange.id;
          fabricRangeName = fabricRange.glassType;
          categoryNumber = fabricRange.categoryNumber || categoryNumber;
        }

        await db.insert(blindFabricColours).values({
          tenantId,
          fabricRangeId,
          fabricRangeName,
          categoryNumber,
          name: input.name.trim(),
          hexCode,
          swatchUrl: input.swatchUrl?.trim() || null,
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db
          .update(blindFabricColours)
          .set({ isActive: false })
          .where(and(eq(blindFabricColours.id, input.id), scope(blindFabricColours.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  colours: router({
    list: tenantProcedure
      .input(z.object({ includeHidden: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const includeHidden = Boolean(input?.includeHidden);
        const [masterRows, customRows] = await Promise.all([
          db
            .select()
            .from(masterData)
            .where(and(eq(masterData.category, "colour"), scope(masterData.tenantId, tenantId)))
            .orderBy(asc(masterData.sortOrder), asc(masterData.key)),
          db
            .select()
            .from(blindColours)
            .where(scope(blindColours.tenantId, tenantId))
            .orderBy(asc(blindColours.sortOrder), asc(blindColours.name)),
        ]);

        if (masterRows.length > 0) {
          const usedCustomIds = new Set<number>();
          const mergedMaster = masterRows
            .map((row: any) => {
              const overlay = customRows.find((colour: any) => coloursMatchMaster(colour, row));
              if (overlay?.id) usedCustomIds.add(Number(overlay.id));
              const isActive = overlay ? isActiveFlag(overlay.isActive) : true;
              return {
                id: `master:${row.id}`,
                masterDataId: row.id,
                customColourId: overlay?.id ?? null,
                name: masterColourName(row),
                colorbondName: row.key || masterColourName(row),
                hexCode: validHex(overlay?.hexCode) || masterColourHex(row),
                surchargePercent: String(overlay?.surchargePercent ?? "0.00"),
                sortOrder: row.sortOrder ?? 0,
                isActive,
                source: "master",
              };
            })
            .filter((colour: any) => includeHidden || colour.isActive);

          const customOnly = customRows
            .filter((colour: any) => !usedCustomIds.has(Number(colour.id)))
            .map((colour: any) => ({
              ...colour,
              hexCode: validHex(colour.hexCode) || fallbackColourHex(colour.name, colour.colorbondName),
              isActive: isActiveFlag(colour.isActive),
              source: "custom",
            }))
            .filter((colour: any) => includeHidden || colour.isActive);

          return [...mergedMaster, ...customOnly];
        }

        return customRows
          .map((colour: any) => ({
            ...colour,
            hexCode: validHex(colour.hexCode) || fallbackColourHex(colour.name, colour.colorbondName),
            isActive: isActiveFlag(colour.isActive),
            source: "custom",
          }))
          .filter((colour: any) => includeHidden || colour.isActive);
      }),
    create: tenantAdminProcedure
      .input(z.object({ name: z.string(), hexCode: z.string(), colorbondName: z.string().optional(), surchargePercent: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(blindColours).values({
          tenantId,
          name: input.name,
          hexCode: input.hexCode,
          colorbondName: input.colorbondName || null,
          surchargePercent: (input.surchargePercent || 0).toFixed(2),
        });
        return { success: true };
      }),
    setHidden: tenantAdminProcedure
      .input(z.object({ id: z.union([z.number(), z.string()]), hidden: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const rawId = String(input.id);

        if (rawId.startsWith("master:")) {
          const masterId = Number(rawId.slice(7));
          const [row] = await db
            .select()
            .from(masterData)
            .where(and(eq(masterData.id, masterId), eq(masterData.category, "colour"), scope(masterData.tenantId, tenantId)))
            .limit(1);
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Colour not found" });

          const customRows = await db.select().from(blindColours).where(scope(blindColours.tenantId, tenantId));
          const overlay = customRows.find((colour: any) => coloursMatchMaster(colour, row));
          if (overlay) {
            await db
              .update(blindColours)
              .set({ isActive: !input.hidden })
              .where(and(eq(blindColours.id, overlay.id), scope(blindColours.tenantId, tenantId)));
          } else {
            await db.insert(blindColours).values({
              tenantId,
              name: masterColourName(row),
              colorbondName: row.key || null,
              hexCode: masterColourHex(row),
              surchargePercent: "0.00",
              isActive: !input.hidden,
            });
          }
          return { success: true };
        }

        const id = Number(input.id);
        if (!Number.isFinite(id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid colour id" });
        await db
          .update(blindColours)
          .set({ isActive: !input.hidden })
          .where(and(eq(blindColours.id, id), scope(blindColours.tenantId, tenantId)));
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.union([z.number(), z.string()]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const rawId = String(input.id);
        if (rawId.startsWith("master:")) {
          const masterId = Number(rawId.slice(7));
          const [row] = await db
            .select()
            .from(masterData)
            .where(and(eq(masterData.id, masterId), eq(masterData.category, "colour"), scope(masterData.tenantId, tenantId)))
            .limit(1);
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Colour not found" });
          const customRows = await db.select().from(blindColours).where(scope(blindColours.tenantId, tenantId));
          const overlay = customRows.find((colour: any) => coloursMatchMaster(colour, row));
          if (overlay) {
            await db.update(blindColours).set({ isActive: false }).where(and(eq(blindColours.id, overlay.id), scope(blindColours.tenantId, tenantId)));
          } else {
            await db.insert(blindColours).values({
              tenantId,
              name: masterColourName(row),
              colorbondName: row.key || null,
              hexCode: masterColourHex(row),
              surchargePercent: "0.00",
              isActive: false,
            });
          }
          return { success: true };
        }
        const id = Number(input.id);
        if (!Number.isFinite(id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid colour id" });
        await db.update(blindColours).set({ isActive: false }).where(and(eq(blindColours.id, id), scope(blindColours.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  quotes: router({
    list: tenantProcedure
      .input(z.object({ status: statusInput.optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quoteScopeOptions = screenQuoteScopeOptionsForContext(ctx);
        const conditions: any[] = [];
        addScreenQuoteTenantScope(conditions, blindQuotes.tenantId, tenantId, quoteScopeOptions);
        if (input?.status) conditions.push(eq(blindQuotes.status, input.status));
        return db.select().from(blindQuotes).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(blindQuotes.createdAt));
      }),

    getById: tenantProcedure
      .input(z.object({ id: quoteIdentifierInput }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quoteScopeOptions = screenQuoteScopeOptionsForContext(ctx);
        const conditions: any[] = [quoteLookupCondition(input.id)];
        addScreenQuoteTenantScope(conditions, blindQuotes.tenantId, tenantId, quoteScopeOptions);
        const [quote] = await db
          .select()
          .from(blindQuotes)
          .where(and(...conditions))
          .orderBy(desc(blindQuotes.updatedAt))
          .limit(1);
        if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Blind quote not found" });
        return loadQuoteDetailRows(db, tenantId, quote, quoteScopeOptions);
      }),

    create: tenantProcedure
      .input(z.object({
        clientName: z.string().trim().min(1, "Client name is required"),
        clientEmail: z.string().optional(),
        clientPhone: z.string().optional(),
        siteAddress: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quoteNumber = createQuoteNumber();
        const markupPercent = await getDefaultMarkupPercent(db, tenantId);
        const createdBy = await nullableExistingUserId(db, ctx.user?.id);
        const [result] = await db.insert(blindQuotes).values({
          tenantId,
          quoteNumber,
          clientName: input.clientName.trim(),
          clientEmail: input.clientEmail?.trim() || null,
          clientPhone: input.clientPhone?.trim() || null,
          siteAddress: input.siteAddress?.trim() || null,
          markupPercent: markupPercent.toFixed(2),
          notes: input.notes?.trim() || null,
          createdBy,
        });
        const quoteId = await quoteIdFromInsertResult(db, tenantId, result, quoteNumber);
        return { id: quoteId, quoteNumber };
      }),

    clone: tenantProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quote = await requireQuote(db, tenantId, input.id);
        const quoteNumber = createQuoteNumber();
        const createdBy = await nullableExistingUserId(db, ctx.user?.id);
        const [quoteResult] = await db.insert(blindQuotes).values({
          tenantId,
          quoteNumber,
          clientName: quote.clientName,
          clientEmail: quote.clientEmail,
          clientPhone: quote.clientPhone,
          siteAddress: quote.siteAddress,
          markupPercent: quote.markupPercent,
          notes: quote.notes ? `${quote.notes}\n\nCloned from ${quote.quoteNumber}` : `Cloned from ${quote.quoteNumber}`,
          leadId: quote.leadId,
          createdBy,
        });
        const newQuoteId = await quoteIdFromInsertResult(db, tenantId, quoteResult, quoteNumber);
        await ensureSsQuoteItemDetailColumns(db);
        const items = await db.select().from(blindQuoteItems).where(and(eq(blindQuoteItems.quoteId, input.id), scope(blindQuoteItems.tenantId, tenantId))).orderBy(asc(blindQuoteItems.itemNumber));
        const itemIdMap = new Map<number, number>();
        for (const item of items) {
          const [itemResult] = await db.insert(blindQuoteItems).values({
            tenantId,
            quoteId: newQuoteId,
            itemNumber: item.itemNumber,
            brand: item.brand,
            productType: item.productType,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
            quantity: item.quantity,
            colourId: item.colourId,
            colourName: item.colourName,
            handleSide: item.handleSide,
            hingeSide: item.hingeSide,
            openingDirection: item.openingDirection,
            hingePosition: item.hingePosition,
            glassInfillId: item.glassInfillId,
            glassInfillQuantity: item.glassInfillQuantity ?? "1.00",
            fabricColourId: item.fabricColourId,
            fabricColourName: item.fabricColourName,
            photoUrl: item.photoUrl,
            notes: item.notes,
            basePriceIncGst: item.basePriceIncGst,
            adjustedPrice: item.adjustedPrice,
            optionsTotal: item.optionsTotal,
            lineTotalExGst: item.lineTotalExGst,
          });
          const newItemId = await quoteItemIdFromInsertResult(db, tenantId, itemResult, newQuoteId, Number(item.itemNumber));
          itemIdMap.set(item.id, newItemId);
        }
        const originalOptions = await db.select().from(blindQuoteItemOptions).where(scope(blindQuoteItemOptions.tenantId, tenantId));
        for (const option of originalOptions) {
          const newItemId = itemIdMap.get(option.quoteItemId);
          if (!newItemId) continue;
          await db.insert(blindQuoteItemOptions).values({
            tenantId,
            quoteItemId: newItemId,
            productOptionId: option.productOptionId,
            quantity: option.quantity,
            unitPrice: option.unitPrice,
            lineTotal: option.lineTotal,
          });
        }
        const costs = await db.select().from(blindQuoteCostAdditions).where(and(eq(blindQuoteCostAdditions.quoteId, input.id), scope(blindQuoteCostAdditions.tenantId, tenantId)));
        for (const cost of costs) {
          await db.insert(blindQuoteCostAdditions).values({
            tenantId,
            quoteId: newQuoteId,
            costAdditionId: cost.costAdditionId,
            quantity: cost.quantity,
            unitCost: cost.unitCost,
            lineTotal: cost.lineTotal,
          });
        }
        await recalculateQuoteTotals(db, tenantId, newQuoteId);
        return { id: newQuoteId, quoteNumber };
      }),

    addItem: tenantProcedure
      .input(z.object({
        quoteId: z.number(),
        brand: z.string(),
        productType: z.string(),
        widthMm: z.number(),
        heightMm: z.number(),
        quantity: z.number().default(1),
        colourId: z.union([z.number(), z.string()]).optional(),
        colourName: z.string().optional(),
        handleSide: z.string().optional(),
        hingeSide: z.string().optional(),
        openingDirection: z.string().optional(),
        hingePosition: z.string().optional(),
        glassInfillId: z.number().optional(),
        glassInfillQuantity: z.number().optional(),
        fabricColourId: z.union([z.number(), z.string()]).optional(),
        fabricColourName: z.string().optional(),
        photoUrl: z.string().optional(),
        notes: z.string().optional(),
        selectedOptions: z.array(z.object({ productOptionId: z.number(), quantity: z.number().default(1) })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quote = await requireQuote(db, tenantId, input.quoteId);
        await ensureSsQuoteItemDetailColumns(db);
        const existingItems = await db.select().from(blindQuoteItems).where(and(eq(blindQuoteItems.quoteId, input.quoteId), scope(blindQuoteItems.tenantId, tenantId)));
        const itemNumber = existingItems.length + 1;
        const brand = canonicalBrand(input.brand);
        const productType = canonicalProductType(input.productType);
        const price = await interpolatePrice(db, tenantId, brand, productType, input.widthMm, input.heightMm);
        if (!price) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pricing matrix exists for this brand/product type. Import the matrix in Admin > Data & Pricing > Blinds Data > Matrix before adding this item.",
          });
        }
        const factor = await getCumulativeAdjustmentFactor(db, tenantId);
        const matrixPriceIncGst = price.basePrice;
        const matrixPriceExGst = matrixPriceIncGst / 1.1;
        const adjustedPriceExGst = matrixPriceExGst * factor;

        let colourSurchargeExGst = 0;
        const colourResolution = await resolveScreenColour(db, tenantId, input.colourId, input.colourName || null);
        const validColourId = colourResolution.validColourId;
        const colourName = colourResolution.colourName;
        if (colourResolution.surchargePercent) {
          colourSurchargeExGst = adjustedPriceExGst * (colourResolution.surchargePercent / 100);
        }
        const fabricColourResolution = await resolveBlindFabricColour(db, tenantId, input.fabricColourId, input.fabricColourName || null);
        const adjustedPriceWithColourExGst = adjustedPriceExGst + colourSurchargeExGst;

        let optionsTotal = 0;
        const glassInfillQuantity = input.glassInfillId ? Math.max(0, Number(input.glassInfillQuantity ?? 1)) : 1;
        if (input.glassInfillId) {
          const [glass] = await db.select().from(blindGlassInfill).where(and(eq(blindGlassInfill.id, input.glassInfillId), scope(blindGlassInfill.tenantId, tenantId))).limit(1);
          if (glass) optionsTotal += Number(glass.cost || 0) * glassInfillQuantity;
        }
        const selectedOptions = input.selectedOptions || [];
        for (const selected of selectedOptions) {
          const [productOption] = await db.select().from(blindProductOptions).where(and(eq(blindProductOptions.id, selected.productOptionId), scope(blindProductOptions.tenantId, tenantId))).limit(1);
          if (productOption) optionsTotal += Number(productOption.sellPrice || 0) * selected.quantity;
        }

        const markupPercent = quote.markupPercent != null
          ? Number(quote.markupPercent)
          : await getDefaultMarkupPercent(db, tenantId);
        const basePriceExGst = adjustedPriceWithColourExGst * (1 + markupPercent / 100);
        const lineTotalExGst = (basePriceExGst + optionsTotal) * input.quantity;

        const [result] = await db.insert(blindQuoteItems).values({
          tenantId,
          quoteId: input.quoteId,
          itemNumber,
          brand,
          productType,
          widthMm: input.widthMm,
          heightMm: input.heightMm,
          quantity: input.quantity,
          colourId: validColourId,
          colourName,
          handleSide: input.handleSide || null,
          hingeSide: input.hingeSide || null,
          openingDirection: input.openingDirection || null,
          hingePosition: input.hingePosition || null,
          glassInfillId: input.glassInfillId || null,
          glassInfillQuantity: glassInfillQuantity.toFixed(2),
          fabricColourId: fabricColourResolution.validFabricColourId,
          fabricColourName: fabricColourResolution.fabricColourName,
          photoUrl: input.photoUrl || null,
          notes: input.notes || null,
          basePriceIncGst: matrixPriceIncGst.toFixed(2),
          adjustedPrice: basePriceExGst.toFixed(2),
          optionsTotal: optionsTotal.toFixed(2),
          lineTotalExGst: lineTotalExGst.toFixed(2),
        });

        const quoteItemId = await quoteItemIdFromInsertResult(db, tenantId, result, input.quoteId, itemNumber);

        for (const selected of selectedOptions) {
          const [productOption] = await db.select().from(blindProductOptions).where(and(eq(blindProductOptions.id, selected.productOptionId), scope(blindProductOptions.tenantId, tenantId))).limit(1);
          if (!productOption) continue;
          const lineTotal = Number(productOption.sellPrice || 0) * selected.quantity;
          await db.insert(blindQuoteItemOptions).values({
            tenantId,
            quoteItemId,
            productOptionId: selected.productOptionId,
            quantity: selected.quantity,
            unitPrice: productOption.sellPrice,
            lineTotal: lineTotal.toFixed(2),
          });
        }

        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { id: quoteItemId, itemNumber, warnings: price?.warnings || [] };
      }),

    updateItem: tenantProcedure
      .input(z.object({
        itemId: z.number(),
        quoteId: z.number(),
        brand: z.string(),
        productType: z.string(),
        widthMm: z.number(),
        heightMm: z.number(),
        quantity: z.number().default(1),
        colourId: z.union([z.number(), z.string()]).optional(),
        colourName: z.string().optional(),
        handleSide: z.string().optional(),
        hingeSide: z.string().optional(),
        openingDirection: z.string().optional(),
        hingePosition: z.string().optional(),
        glassInfillId: z.number().optional(),
        glassInfillQuantity: z.number().optional(),
        fabricColourId: z.union([z.number(), z.string()]).optional(),
        fabricColourName: z.string().optional(),
        notes: z.string().optional(),
        selectedOptions: z.array(z.object({ productOptionId: z.number(), quantity: z.number().default(1) })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quote = await requireQuote(db, tenantId, input.quoteId);
        await ensureSsQuoteItemDetailColumns(db);
        const [item] = await db
          .select()
          .from(blindQuoteItems)
          .where(and(eq(blindQuoteItems.id, input.itemId), eq(blindQuoteItems.quoteId, input.quoteId), scope(blindQuoteItems.tenantId, tenantId)))
          .limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found" });

        const brand = canonicalBrand(input.brand);
        const productType = canonicalProductType(input.productType);
        const price = await interpolatePrice(db, tenantId, brand, productType, input.widthMm, input.heightMm);
        if (!price) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pricing matrix exists for this brand/product type. Import the matrix in Admin > Data & Pricing > Blinds Data > Matrix before updating this item.",
          });
        }
        const factor = await getCumulativeAdjustmentFactor(db, tenantId);
        const matrixPriceIncGst = price.basePrice;
        const matrixPriceExGst = matrixPriceIncGst / 1.1;
        const adjustedPriceExGst = matrixPriceExGst * factor;

        let colourSurchargeExGst = 0;
        const colourResolution = await resolveScreenColour(db, tenantId, input.colourId, input.colourName || null);
        const validColourId = colourResolution.validColourId;
        const colourName = colourResolution.colourName;
        if (colourResolution.surchargePercent) {
          colourSurchargeExGst = adjustedPriceExGst * (colourResolution.surchargePercent / 100);
        }
        const fabricColourResolution = await resolveBlindFabricColour(db, tenantId, input.fabricColourId, input.fabricColourName || null);
        const adjustedPriceWithColourExGst = adjustedPriceExGst + colourSurchargeExGst;

        let optionsTotal = 0;
        const glassInfillQuantity = input.glassInfillId ? Math.max(0, Number(input.glassInfillQuantity ?? 1)) : 1;
        if (input.glassInfillId) {
          const [glass] = await db.select().from(blindGlassInfill).where(and(eq(blindGlassInfill.id, input.glassInfillId), scope(blindGlassInfill.tenantId, tenantId))).limit(1);
          if (glass) optionsTotal += Number(glass.cost || 0) * glassInfillQuantity;
        }
        const selectedOptions = input.selectedOptions || [];
        for (const selected of selectedOptions) {
          const [productOption] = await db.select().from(blindProductOptions).where(and(eq(blindProductOptions.id, selected.productOptionId), scope(blindProductOptions.tenantId, tenantId))).limit(1);
          if (productOption) optionsTotal += Number(productOption.sellPrice || 0) * selected.quantity;
        }

        const markupPercent = quote.markupPercent != null
          ? Number(quote.markupPercent)
          : await getDefaultMarkupPercent(db, tenantId);
        const basePriceExGst = adjustedPriceWithColourExGst * (1 + markupPercent / 100);
        const lineTotalExGst = (basePriceExGst + optionsTotal) * input.quantity;

        await db.update(blindQuoteItems).set({
          brand,
          productType,
          widthMm: input.widthMm,
          heightMm: input.heightMm,
          quantity: input.quantity,
          colourId: validColourId,
          colourName,
          handleSide: input.handleSide || null,
          hingeSide: input.hingeSide || null,
          openingDirection: input.openingDirection || null,
          hingePosition: input.hingePosition || null,
          glassInfillId: input.glassInfillId || null,
          glassInfillQuantity: glassInfillQuantity.toFixed(2),
          fabricColourId: fabricColourResolution.validFabricColourId,
          fabricColourName: fabricColourResolution.fabricColourName,
          notes: input.notes || null,
          basePriceIncGst: matrixPriceIncGst.toFixed(2),
          adjustedPrice: basePriceExGst.toFixed(2),
          optionsTotal: optionsTotal.toFixed(2),
          lineTotalExGst: lineTotalExGst.toFixed(2),
        }).where(and(eq(blindQuoteItems.id, input.itemId), eq(blindQuoteItems.quoteId, input.quoteId), scope(blindQuoteItems.tenantId, tenantId)));

        await db.delete(blindQuoteItemOptions).where(and(eq(blindQuoteItemOptions.quoteItemId, input.itemId), scope(blindQuoteItemOptions.tenantId, tenantId)));
        for (const selected of selectedOptions) {
          const [productOption] = await db.select().from(blindProductOptions).where(and(eq(blindProductOptions.id, selected.productOptionId), scope(blindProductOptions.tenantId, tenantId))).limit(1);
          if (!productOption) continue;
          const lineTotal = Number(productOption.sellPrice || 0) * selected.quantity;
          await db.insert(blindQuoteItemOptions).values({
            tenantId,
            quoteItemId: input.itemId,
            productOptionId: selected.productOptionId,
            quantity: selected.quantity,
            unitPrice: productOption.sellPrice,
            lineTotal: lineTotal.toFixed(2),
          });
        }

        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true, warnings: price?.warnings || [] };
      }),

    removeItem: tenantProcedure
      .input(z.object({ itemId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        await db.delete(blindQuoteItemOptions).where(and(eq(blindQuoteItemOptions.quoteItemId, input.itemId), scope(blindQuoteItemOptions.tenantId, tenantId)));
        await db.delete(blindQuoteItems).where(and(eq(blindQuoteItems.id, input.itemId), eq(blindQuoteItems.quoteId, input.quoteId), scope(blindQuoteItems.tenantId, tenantId)));
        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true };
      }),

    addCostAddition: tenantProcedure
      .input(z.object({ quoteId: z.number(), costAdditionId: z.number(), quantity: z.number().default(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        const [costDef] = await db.select().from(blindCostAdditions).where(and(eq(blindCostAdditions.id, input.costAdditionId), scope(blindCostAdditions.tenantId, tenantId))).limit(1);
        if (!costDef) throw new TRPCError({ code: "NOT_FOUND", message: "Cost addition not found" });
        const lineTotal = Number(costDef.cost || 0) * input.quantity;
        await db.insert(blindQuoteCostAdditions).values({
          tenantId,
          quoteId: input.quoteId,
          costAdditionId: input.costAdditionId,
          quantity: input.quantity.toFixed(2),
          unitCost: costDef.cost,
          lineTotal: lineTotal.toFixed(2),
        });
        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true };
      }),

    updateCostAddition: tenantProcedure
      .input(z.object({ id: z.number(), quoteId: z.number(), quantity: z.number().min(0.01), unitCost: z.number().min(0) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        const lineTotal = input.quantity * input.unitCost;
        await db.update(blindQuoteCostAdditions).set({
          quantity: input.quantity.toFixed(2),
          unitCost: input.unitCost.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        }).where(and(eq(blindQuoteCostAdditions.id, input.id), eq(blindQuoteCostAdditions.quoteId, input.quoteId), scope(blindQuoteCostAdditions.tenantId, tenantId)));
        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true };
      }),

    removeCostAddition: tenantProcedure
      .input(z.object({ id: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        await db.delete(blindQuoteCostAdditions).where(and(eq(blindQuoteCostAdditions.id, input.id), eq(blindQuoteCostAdditions.quoteId, input.quoteId), scope(blindQuoteCostAdditions.tenantId, tenantId)));
        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true };
      }),

    updateStatus: tenantProcedure
      .input(z.object({ id: z.number(), status: statusInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(blindQuotes).set({ status: input.status }).where(and(eq(blindQuotes.id, input.id), scope(blindQuotes.tenantId, tenantId)));
        return { success: true };
      }),

    uploadPhoto: tenantProcedure
      .input(z.object({ quoteItemId: z.number(), quoteId: z.number(), base64: z.string(), filename: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        await ensureSsQuoteItemDetailColumns(db);
        const [item] = await db.select().from(blindQuoteItems).where(and(eq(blindQuoteItems.id, input.quoteItemId), eq(blindQuoteItems.quoteId, input.quoteId), scope(blindQuoteItems.tenantId, tenantId))).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found" });
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.filename.split(".").pop() || "jpg";
        const key = `ss-photos/${tenantId}/${input.quoteId}/${input.quoteItemId}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, `image/${ext === "png" ? "png" : "jpeg"}`);
        await db.update(blindQuoteItems).set({ photoUrl: url }).where(and(eq(blindQuoteItems.id, input.quoteItemId), scope(blindQuoteItems.tenantId, tenantId)));
        return { url };
      }),

    createFromLead: tenantProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const [lead] = await db.select().from(crmLeads).where(and(eq(crmLeads.id, input.leadId), scope(crmLeads.tenantId, tenantId))).limit(1);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
        const clientName = [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || lead.company || "Unknown";
        const quoteNumber = createQuoteNumber();
        const markupPercent = await getDefaultMarkupPercent(db, tenantId);
        const createdBy = await nullableExistingUserId(db, ctx.user?.id);
        const [result] = await db.insert(blindQuotes).values({
          tenantId,
          quoteNumber,
          clientName,
          clientEmail: lead.contactEmail || null,
          clientPhone: lead.contactPhone || null,
          siteAddress: lead.contactAddress || null,
          markupPercent: markupPercent.toFixed(2),
          leadId: input.leadId,
          createdBy,
        });
        const quoteId = await quoteIdFromInsertResult(db, tenantId, result, quoteNumber);
        let leadUnarchived = false;
        if (lead.archived) {
          await db.update(crmLeads).set({ archived: false }).where(and(eq(crmLeads.id, input.leadId), scope(crmLeads.tenantId, tenantId)));
          leadUnarchived = true;
        }
        return { id: quoteId, quoteNumber, clientName, leadUnarchived };
      }),
  }),

  leads: router({
    search: tenantProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const query = `%${input.query}%`;
        return db.select({
          id: crmLeads.id,
          leadNumber: crmLeads.leadNumber,
          contactFirstName: crmLeads.contactFirstName,
          contactLastName: crmLeads.contactLastName,
          contactEmail: crmLeads.contactEmail,
          contactPhone: crmLeads.contactPhone,
          contactAddress: crmLeads.contactAddress,
          suburb: crmLeads.suburb,
          company: crmLeads.company,
        }).from(crmLeads).where(and(
          scope(crmLeads.tenantId, tenantId),
          sql`(${crmLeads.contactFirstName} LIKE ${query} OR ${crmLeads.contactLastName} LIKE ${query} OR ${crmLeads.contactEmail} LIKE ${query} OR ${crmLeads.contactAddress} LIKE ${query} OR ${crmLeads.company} LIKE ${query} OR ${crmLeads.leadNumber} LIKE ${query})`,
        )).limit(20);
      }),
  }),
});
