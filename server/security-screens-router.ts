import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { router, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { tenantIdFromContext, tenantScoped } from "./_core/tenant-scope";
import {
  crmLeads,
  ssColours,
  ssCostAdditions,
  ssGlassInfill,
  ssPriceAdjustments,
  ssPricingMatrix,
  ssPricingSettings,
  ssProductOptions,
  ssQuoteCostAdditions,
  ssQuoteItemOptions,
  ssQuoteItems,
  ssQuotes,
  users,
} from "../drizzle/schema";
import { storagePut } from "./storage";

type ParsedMatrixRow = {
  widthMm: number;
  heightMm: number;
  priceIncGst: number;
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

function insertIdFromResult(result: any): number | null {
  const rawId = result?.insertId ?? result?.[0]?.insertId;
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function quoteIdFromInsertResult(db: any, tenantId: number, insertResult: any, quoteNumber: string) {
  const insertId = insertIdFromResult(insertResult);
  if (insertId) return insertId;

  const [quote] = await db
    .select({ id: ssQuotes.id })
    .from(ssQuotes)
    .where(and(eq(ssQuotes.quoteNumber, quoteNumber), scope(ssQuotes.tenantId, tenantId)))
    .limit(1);

  if (!quote?.id) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quote was created but could not be reloaded.",
    });
  }

  return Number(quote.id);
}

function createQuoteNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SS-${timestamp}-${suffix}`;
}

function compactKey(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalBrand(value: string) {
  const key = compactKey(value);
  if (key.includes("invisi")) return "invisigard";
  if (key.includes("alu")) return "alugard";
  return key;
}

function canonicalProductType(value: string) {
  const key = compactKey(value);
  if (key.includes("door")) return "door";
  if (key.includes("window") || key.includes("screen")) return "window";
  return key;
}

function compactSql(column: any) {
  return sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(${column}, '-', ''), ' ', ''), '_', ''), '/', ''))`;
}

function pricingMatrixIdentity(brand: string, productType: string) {
  return and(
    sql`${compactSql(ssPricingMatrix.brand)} = ${canonicalBrand(brand)}`,
    sql`${compactSql(ssPricingMatrix.productType)} = ${canonicalProductType(productType)}`,
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

  const brandIndex = findHeader("brand");
  const productTypeIndex = findHeader("productType", "type", "product");
  const heightIndex = findHeader("heightMm", "height", "h");
  const widthIndex = findHeader("widthMm", "width", "w");
  const priceIndex = findHeader("priceIncGst", "price", "incGst", "priceGst", "sellPrice");

  if (heightIndex >= 0 && widthIndex >= 0 && priceIndex >= 0) {
    return dataRows.flatMap((row) => {
      if (brandIndex >= 0 && canonicalBrand(row[brandIndex] || "") !== canonicalBrand(brand)) return [];
      if (productTypeIndex >= 0 && canonicalProductType(row[productTypeIndex] || "") !== canonicalProductType(productType)) return [];

      const heightMm = numberFromCell(row[heightIndex]);
      const widthMm = numberFromCell(row[widthIndex]);
      const priceIncGst = numberFromCell(row[priceIndex]);
      if (!heightMm || !widthMm || !priceIncGst) return [];
      return [{ heightMm: Math.round(heightMm), widthMm: Math.round(widthMm), priceIncGst }];
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
      return [{ heightMm: Math.round(heightMm), widthMm: Math.round(width), priceIncGst }];
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
    .from(ssPricingSettings)
    .where(eq(ssPricingSettings.tenantId, tenantId))
    .limit(1);

  if (settings) return Number(settings.defaultMarkupPercent || 30);

  await db.insert(ssPricingSettings).values({
    tenantId,
    defaultMarkupPercent: "30.00",
  }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  return 30;
}

async function getCumulativeAdjustmentFactor(db: any, tenantId: number): Promise<number> {
  const adjustments = await db
    .select()
    .from(ssPriceAdjustments)
    .where(scope(ssPriceAdjustments.tenantId, tenantId))
    .orderBy(asc(ssPriceAdjustments.effectiveDate));

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
    .from(ssPricingMatrix)
    .where(and(
      scope(ssPricingMatrix.tenantId, tenantId),
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
    .from(ssQuotes)
    .where(and(eq(ssQuotes.id, quoteId), scope(ssQuotes.tenantId, tenantId)))
    .limit(1);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Security screen quote not found" });
  return quote;
}

async function recalculateQuoteTotals(db: any, tenantId: number, quoteId: number) {
  const items = await db
    .select()
    .from(ssQuoteItems)
    .where(and(eq(ssQuoteItems.quoteId, quoteId), scope(ssQuoteItems.tenantId, tenantId)));
  const costs = await db
    .select()
    .from(ssQuoteCostAdditions)
    .where(and(eq(ssQuoteCostAdditions.quoteId, quoteId), scope(ssQuoteCostAdditions.tenantId, tenantId)));

  const subtotalExGst = [...items, ...costs].reduce((sum, row: any) => {
    return sum + Number(row.lineTotalExGst ?? row.lineTotal ?? 0);
  }, 0);
  const gstAmount = subtotalExGst * 0.1;
  const totalIncGst = subtotalExGst + gstAmount;

  await db.update(ssQuotes).set({
    subtotalExGst: subtotalExGst.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    totalIncGst: totalIncGst.toFixed(2),
  }).where(and(eq(ssQuotes.id, quoteId), scope(ssQuotes.tenantId, tenantId)));
}

const statusInput = z.enum(["draft", "sent", "accepted", "declined", "expired"]);

export const securityScreensRouter = router({
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
        await db.insert(ssPricingSettings).values({
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
        .from(ssPricingMatrix)
        .where(and(scope(ssPricingMatrix.tenantId, tenantId), pricingMatrixIdentity(input.brand, input.productType)));
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

      const brand = canonicalBrand(input.brand);
      const productType = canonicalProductType(input.productType);

      await db
        .delete(ssPricingMatrix)
        .where(and(scope(ssPricingMatrix.tenantId, tenantId), pricingMatrixIdentity(brand, productType)));

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await db.insert(ssPricingMatrix).values(chunk.map((row) => ({
          tenantId,
          brand,
          productType,
          heightMm: row.heightMm,
          widthMm: row.widthMm,
          priceIncGst: row.priceIncGst.toFixed(2),
        })));
      }

      return { imported: rows.length, brand, productType };
    }),

  calculatePrice: tenantProcedure
    .input(z.object({ brand: z.string(), productType: z.string(), widthMm: z.number(), heightMm: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      const price = await interpolatePrice(db, tenantId, input.brand, input.productType, input.widthMm, input.heightMm);
      if (!price) {
        return {
          basePrice: null,
          adjustedPrice: null,
          factor: 1,
          warnings: ["No pricing matrix exists for this brand/product type. Import the matrix in Admin > Data & Pricing > Screen Pricing > Matrix."],
          outOfRange: false,
        };
      }
      const factor = await getCumulativeAdjustmentFactor(db, tenantId);
      return {
        ...price,
        basePrice: Math.round(price.basePrice * 100) / 100,
        adjustedPrice: Math.round(price.basePrice * factor * 100) / 100,
        factor,
      };
    }),

  adjustments: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      return db.select().from(ssPriceAdjustments).where(scope(ssPriceAdjustments.tenantId, tenantId)).orderBy(asc(ssPriceAdjustments.effectiveDate));
    }),
    create: tenantAdminProcedure
      .input(z.object({ effectiveDate: z.string(), percentageIncrease: z.number(), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const userId = ctx.user?.id;
        if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "User context required" });
        await db.insert(ssPriceAdjustments).values({
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
        await db.delete(ssPriceAdjustments).where(and(eq(ssPriceAdjustments.id, input.id), scope(ssPriceAdjustments.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  costAdditions: router({
    list: tenantProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(ssCostAdditions.tenantId, tenantId), eq(ssCostAdditions.isActive, true)];
        if (input?.category) conditions.push(eq(ssCostAdditions.category, input.category));
        return db.select().from(ssCostAdditions).where(and(...conditions)).orderBy(asc(ssCostAdditions.category), asc(ssCostAdditions.name));
      }),
    create: tenantAdminProcedure
      .input(z.object({ category: z.string(), name: z.string(), description: z.string().optional(), cost: z.number(), uom: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(ssCostAdditions).values({
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
        await db.update(ssCostAdditions).set({ isActive: false }).where(and(eq(ssCostAdditions.id, input.id), scope(ssCostAdditions.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  productOptions: router({
    list: tenantProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(ssProductOptions.tenantId, tenantId), eq(ssProductOptions.isActive, true)];
        if (input?.category) conditions.push(eq(ssProductOptions.category, input.category));
        return db.select().from(ssProductOptions).where(and(...conditions)).orderBy(asc(ssProductOptions.category), asc(ssProductOptions.name));
      }),
    create: tenantAdminProcedure
      .input(z.object({ category: z.string(), orderCode: z.string().optional(), name: z.string(), description: z.string().optional(), brand: z.string().optional(), costPrice: z.number(), sellPrice: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(ssProductOptions).values({
          tenantId,
          category: input.category,
          orderCode: input.orderCode || null,
          name: input.name,
          description: input.description || null,
          brand: input.brand || null,
          costPrice: input.costPrice.toFixed(2),
          sellPrice: input.sellPrice.toFixed(2),
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(ssProductOptions).set({ isActive: false }).where(and(eq(ssProductOptions.id, input.id), scope(ssProductOptions.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  glassInfill: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      return db.select().from(ssGlassInfill).where(and(scope(ssGlassInfill.tenantId, tenantId), eq(ssGlassInfill.isActive, true))).orderBy(asc(ssGlassInfill.glassType));
    }),
    create: tenantAdminProcedure
      .input(z.object({ glassType: z.string(), description: z.string().optional(), cost: z.number(), uom: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(ssGlassInfill).values({ tenantId, glassType: input.glassType, description: input.description || null, cost: input.cost.toFixed(2), uom: input.uom });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(ssGlassInfill).set({ isActive: false }).where(and(eq(ssGlassInfill.id, input.id), scope(ssGlassInfill.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  colours: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdForContext(ctx);
      return db.select().from(ssColours).where(and(scope(ssColours.tenantId, tenantId), eq(ssColours.isActive, true))).orderBy(asc(ssColours.sortOrder), asc(ssColours.name));
    }),
    create: tenantAdminProcedure
      .input(z.object({ name: z.string(), hexCode: z.string(), colorbondName: z.string().optional(), surchargePercent: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.insert(ssColours).values({
          tenantId,
          name: input.name,
          hexCode: input.hexCode,
          colorbondName: input.colorbondName || null,
          surchargePercent: (input.surchargePercent || 0).toFixed(2),
        });
        return { success: true };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(ssColours).set({ isActive: false }).where(and(eq(ssColours.id, input.id), scope(ssColours.tenantId, tenantId)));
        return { success: true };
      }),
  }),

  quotes: router({
    list: tenantProcedure
      .input(z.object({ status: statusInput.optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const conditions = [scope(ssQuotes.tenantId, tenantId)];
        if (input?.status) conditions.push(eq(ssQuotes.status, input.status));
        return db.select().from(ssQuotes).where(and(...conditions)).orderBy(desc(ssQuotes.createdAt));
      }),

    getById: tenantProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quote = await requireQuote(db, tenantId, input.id);
        const items = await db.select().from(ssQuoteItems).where(and(eq(ssQuoteItems.quoteId, input.id), scope(ssQuoteItems.tenantId, tenantId))).orderBy(asc(ssQuoteItems.itemNumber));
        const itemOptions = await db.select().from(ssQuoteItemOptions).where(scope(ssQuoteItemOptions.tenantId, tenantId));
        const costAdditions = await db.select().from(ssQuoteCostAdditions).where(and(eq(ssQuoteCostAdditions.quoteId, input.id), scope(ssQuoteCostAdditions.tenantId, tenantId)));
        return {
          ...quote,
          items: items.map((item: any) => ({
            ...item,
            options: itemOptions.filter((option: any) => option.quoteItemId === item.id),
          })),
          costAdditions,
        };
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
        const [result] = await db.insert(ssQuotes).values({
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
        const [quoteResult] = await db.insert(ssQuotes).values({
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
        const items = await db.select().from(ssQuoteItems).where(and(eq(ssQuoteItems.quoteId, input.id), scope(ssQuoteItems.tenantId, tenantId))).orderBy(asc(ssQuoteItems.itemNumber));
        const itemIdMap = new Map<number, number>();
        for (const item of items) {
          const [itemResult] = await db.insert(ssQuoteItems).values({
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
            photoUrl: item.photoUrl,
            notes: item.notes,
            basePriceIncGst: item.basePriceIncGst,
            adjustedPrice: item.adjustedPrice,
            optionsTotal: item.optionsTotal,
            lineTotalExGst: item.lineTotalExGst,
          });
          const newItemId = insertIdFromResult(itemResult);
          if (newItemId) itemIdMap.set(item.id, newItemId);
        }
        const originalOptions = await db.select().from(ssQuoteItemOptions).where(scope(ssQuoteItemOptions.tenantId, tenantId));
        for (const option of originalOptions) {
          const newItemId = itemIdMap.get(option.quoteItemId);
          if (!newItemId) continue;
          await db.insert(ssQuoteItemOptions).values({
            tenantId,
            quoteItemId: newItemId,
            productOptionId: option.productOptionId,
            quantity: option.quantity,
            unitPrice: option.unitPrice,
            lineTotal: option.lineTotal,
          });
        }
        const costs = await db.select().from(ssQuoteCostAdditions).where(and(eq(ssQuoteCostAdditions.quoteId, input.id), scope(ssQuoteCostAdditions.tenantId, tenantId)));
        for (const cost of costs) {
          await db.insert(ssQuoteCostAdditions).values({
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
        colourId: z.number().optional(),
        colourName: z.string().optional(),
        handleSide: z.string().optional(),
        hingeSide: z.string().optional(),
        openingDirection: z.string().optional(),
        hingePosition: z.string().optional(),
        glassInfillId: z.number().optional(),
        photoUrl: z.string().optional(),
        notes: z.string().optional(),
        selectedOptions: z.array(z.object({ productOptionId: z.number(), quantity: z.number().default(1) })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        const quote = await requireQuote(db, tenantId, input.quoteId);
        const existingItems = await db.select().from(ssQuoteItems).where(and(eq(ssQuoteItems.quoteId, input.quoteId), scope(ssQuoteItems.tenantId, tenantId)));
        const itemNumber = existingItems.length + 1;
        const price = await interpolatePrice(db, tenantId, input.brand, input.productType, input.widthMm, input.heightMm);
        if (!price) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pricing matrix exists for this brand/product type. Import the matrix in Admin > Data & Pricing > Screen Pricing > Matrix before adding this item.",
          });
        }
        const factor = await getCumulativeAdjustmentFactor(db, tenantId);
        const basePrice = price.basePrice;
        const adjustedPrice = basePrice * factor;

        let colourSurcharge = 0;
        if (input.colourId) {
          const [colour] = await db.select().from(ssColours).where(and(eq(ssColours.id, input.colourId), scope(ssColours.tenantId, tenantId))).limit(1);
          colourSurcharge = adjustedPrice * (Number(colour?.surchargePercent || 0) / 100);
        }
        const priceWithColour = adjustedPrice + colourSurcharge;

        let optionsTotal = 0;
        const selectedOptions = input.selectedOptions || [];
        for (const selected of selectedOptions) {
          const [productOption] = await db.select().from(ssProductOptions).where(and(eq(ssProductOptions.id, selected.productOptionId), scope(ssProductOptions.tenantId, tenantId))).limit(1);
          if (productOption) optionsTotal += Number(productOption.sellPrice || 0) * selected.quantity;
        }

        const markupPercent = Number(quote.markupPercent || 30);
        const unitPriceExGst = priceWithColour / 1.1;
        const lineTotalExGst = (unitPriceExGst * (1 + markupPercent / 100) + optionsTotal) * input.quantity;

        const [result] = await db.insert(ssQuoteItems).values({
          tenantId,
          quoteId: input.quoteId,
          itemNumber,
          brand: input.brand,
          productType: input.productType,
          widthMm: input.widthMm,
          heightMm: input.heightMm,
          quantity: input.quantity,
          colourId: input.colourId || null,
          colourName: input.colourName || null,
          handleSide: input.handleSide || null,
          hingeSide: input.hingeSide || null,
          openingDirection: input.openingDirection || null,
          hingePosition: input.hingePosition || null,
          glassInfillId: input.glassInfillId || null,
          photoUrl: input.photoUrl || null,
          notes: input.notes || null,
          basePriceIncGst: basePrice.toFixed(2),
          adjustedPrice: priceWithColour.toFixed(2),
          optionsTotal: optionsTotal.toFixed(2),
          lineTotalExGst: lineTotalExGst.toFixed(2),
        });

        const quoteItemId = insertIdFromResult(result);
        if (!quoteItemId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Quote item was created but could not be reloaded.",
          });
        }

        for (const selected of selectedOptions) {
          const [productOption] = await db.select().from(ssProductOptions).where(and(eq(ssProductOptions.id, selected.productOptionId), scope(ssProductOptions.tenantId, tenantId))).limit(1);
          if (!productOption) continue;
          const lineTotal = Number(productOption.sellPrice || 0) * selected.quantity;
          await db.insert(ssQuoteItemOptions).values({
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

    removeItem: tenantProcedure
      .input(z.object({ itemId: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        await db.delete(ssQuoteItemOptions).where(and(eq(ssQuoteItemOptions.quoteItemId, input.itemId), scope(ssQuoteItemOptions.tenantId, tenantId)));
        await db.delete(ssQuoteItems).where(and(eq(ssQuoteItems.id, input.itemId), eq(ssQuoteItems.quoteId, input.quoteId), scope(ssQuoteItems.tenantId, tenantId)));
        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true };
      }),

    addCostAddition: tenantProcedure
      .input(z.object({ quoteId: z.number(), costAdditionId: z.number(), quantity: z.number().default(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        const [costDef] = await db.select().from(ssCostAdditions).where(and(eq(ssCostAdditions.id, input.costAdditionId), scope(ssCostAdditions.tenantId, tenantId))).limit(1);
        if (!costDef) throw new TRPCError({ code: "NOT_FOUND", message: "Cost addition not found" });
        const lineTotal = Number(costDef.cost || 0) * input.quantity;
        await db.insert(ssQuoteCostAdditions).values({
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

    removeCostAddition: tenantProcedure
      .input(z.object({ id: z.number(), quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        await db.delete(ssQuoteCostAdditions).where(and(eq(ssQuoteCostAdditions.id, input.id), eq(ssQuoteCostAdditions.quoteId, input.quoteId), scope(ssQuoteCostAdditions.tenantId, tenantId)));
        await recalculateQuoteTotals(db, tenantId, input.quoteId);
        return { success: true };
      }),

    updateStatus: tenantProcedure
      .input(z.object({ id: z.number(), status: statusInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await db.update(ssQuotes).set({ status: input.status }).where(and(eq(ssQuotes.id, input.id), scope(ssQuotes.tenantId, tenantId)));
        return { success: true };
      }),

    uploadPhoto: tenantProcedure
      .input(z.object({ quoteItemId: z.number(), quoteId: z.number(), base64: z.string(), filename: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdForContext(ctx);
        await requireQuote(db, tenantId, input.quoteId);
        const [item] = await db.select().from(ssQuoteItems).where(and(eq(ssQuoteItems.id, input.quoteItemId), eq(ssQuoteItems.quoteId, input.quoteId), scope(ssQuoteItems.tenantId, tenantId))).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found" });
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.filename.split(".").pop() || "jpg";
        const key = `ss-photos/${tenantId}/${input.quoteId}/${input.quoteItemId}-${Date.now()}.${ext}`;
        const { url } = await storagePut(key, buffer, `image/${ext === "png" ? "png" : "jpeg"}`);
        await db.update(ssQuoteItems).set({ photoUrl: url }).where(and(eq(ssQuoteItems.id, input.quoteItemId), scope(ssQuoteItems.tenantId, tenantId)));
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
        const [result] = await db.insert(ssQuotes).values({
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
        return { id: quoteId, quoteNumber, clientName };
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
