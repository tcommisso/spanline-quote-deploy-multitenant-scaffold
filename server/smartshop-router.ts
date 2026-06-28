/**
 * Smartshop / Construction Order Form — tRPC router.
 * Provides product catalogue browsing, order submission, and order history
 * using the local database (component_catalogue_products, smartshop_orders, smartshop_order_lines).
 */
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc.js";
import { getDb } from "./db.js";
import {
  componentCatalogueProducts,
  smartshopOrders,
  smartshopOrderLines,
  smartshopOrderDrafts,
  smartshopOrderStatusHistory,
  productFavourites,
  orderTemplates,
  orderTemplateItems,
} from "../drizzle/schema.js";
import { eq, and, like, or, sql, desc, asc, count, gte, lte, inArray } from "drizzle-orm";
import { generateComponentOrderPdf } from "./smartshop-pdf.js";
import { logNotification } from "./notification-gateway";
import { sendNotificationEmail } from "./email";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import {
  componentCatalogueTenantConditions,
  componentCatalogueWhere,
  requireComponentCatalogueTenantId,
} from "./component-catalogue-scope";

// The 14 product categories (same as before)
const PRODUCT_CATEGORIES = [
  "Aluminium",
  "Ampelite",
  "Back Channel",
  "Brackets & Componentry",
  "Coils",
  "Downlights",
  "Infill",
  "IRP IWP",
  "Laserlite",
  "Rainwater Harvesting",
  "Screws",
  "Silicone & Adhesive",
  "Spanlites",
  "Touch Up Paint",
];

const catalogueProductFilterSchema = z.object({
  category: z.string().optional(),
  subGroup: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional().default(""),
  includeInactive: z.boolean().optional().default(false),
});

function catalogueProductConditions(ctx: any, input: z.infer<typeof catalogueProductFilterSchema>) {
  const conditions: any[] = componentCatalogueTenantConditions(ctx);

  if (input.category && PRODUCT_CATEGORIES.includes(input.category)) {
    conditions.push(eq(componentCatalogueProducts.category, input.category));
  }

  if (input.subGroup) {
    conditions.push(eq(componentCatalogueProducts.subGroup, input.subGroup));
  }

  if (input.tag) {
    conditions.push(
      or(
        like(componentCatalogueProducts.tags, `${input.tag},%`),
        like(componentCatalogueProducts.tags, `%,${input.tag},%`),
        like(componentCatalogueProducts.tags, `%,${input.tag}`),
        eq(componentCatalogueProducts.tags, input.tag)
      )!
    );
  }

  if (!input.includeInactive) {
    conditions.push(eq(componentCatalogueProducts.isActive, true));
  }

  if (input.search.trim()) {
    const searchTerm = `%${input.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`LOWER(${componentCatalogueProducts.spaCode})`, searchTerm),
        like(sql`LOWER(${componentCatalogueProducts.description})`, searchTerm),
        like(sql`LOWER(${componentCatalogueProducts.colour})`, searchTerm)
      )!
    );
  }

  return and(...conditions);
}

function orderTemplateTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, orderTemplates.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function orderDraftTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, smartshopOrderDrafts.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireOrderTemplateAccess(db: any, ctx: any, templateId: number) {
  const [template] = await db
    .select()
    .from(orderTemplates)
    .where(and(...orderTemplateTenantConditions(ctx, eq(orderTemplates.id, templateId))))
    .limit(1);
  if (!template) throw new Error("Template not found");
  return template;
}

async function requireOrderDraftAccess(db: any, ctx: any, draftId: number) {
  const [draft] = await db
    .select()
    .from(smartshopOrderDrafts)
    .where(and(
      ...orderDraftTenantConditions(ctx, eq(smartshopOrderDrafts.id, draftId)),
      eq(smartshopOrderDrafts.userId, ctx.user.id),
    ))
    .limit(1);
  if (!draft) throw new Error("Draft not found");
  return draft;
}

const orderDetailsDraftSchema = z.object({
  orderDate: z.string().default(""),
  requestedBy: z.string().default(""),
  email: z.string().default(""),
  locationRequired: z.string().default(""),
  jobNumber: z.string().default(""),
  dateRequired: z.string().default(""),
  notes: z.string().default(""),
});

const orderLineDraftSchema = z.object({
  id: z.string().optional(),
  category: z.string().default(""),
  spaCode: z.string().default(""),
  description: z.string().default(""),
  colour: z.string().default(""),
  requiredColour: z.string().default(""),
  uom: z.string().default(""),
  packQtySizes: z.string().default(""),
  unitPrice: z.number().default(0),
  quantity: z.number().min(1).default(1),
  length: z.string().default(""),
  lineNotes: z.string().default(""),
  lineTotal: z.number().default(0),
  colourInputAllowed: z.boolean().optional(),
  colourGroup: z.string().nullish(),
});

const selectedJobDraftSchema = z.object({
  id: z.number(),
  clientName: z.string(),
  quoteNumber: z.string().nullable().optional(),
  siteAddress: z.string().nullable().optional(),
}).nullable().optional();

const orderDraftPayloadSchema = z.object({
  orderDetails: orderDetailsDraftSchema,
  selectedJob: selectedJobDraftSchema,
  lines: z.array(orderLineDraftSchema).default([]),
});

function normaliseDraftPayload(payload: z.infer<typeof orderDraftPayloadSchema>) {
  const lines = payload.lines.map((line) => {
    const unitPrice = Number(line.unitPrice || 0);
    const quantity = Math.max(1, Number(line.quantity || 1));
    return {
      ...line,
      unitPrice,
      quantity,
      lineTotal: Number.isFinite(Number(line.lineTotal)) && Number(line.lineTotal) > 0
        ? Number(line.lineTotal)
        : unitPrice * quantity,
    };
  });
  return {
    orderDetails: payload.orderDetails,
    selectedJob: payload.selectedJob || null,
    lines,
  };
}

function parseCsvRows(csvContent: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const next = csvContent[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function normaliseCsvHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function csvColumn(headers: string[], aliases: string[]) {
  const normalisedAliases = aliases.map(normaliseCsvHeader);
  return headers.findIndex((header) => normalisedAliases.includes(normaliseCsvHeader(header)));
}

function csvValue(row: string[], index: number) {
  if (index < 0) return undefined;
  const value = row[index]?.trim();
  return value ? value : undefined;
}

function parseCsvNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalised = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "active", "allowed"].includes(normalised)) return true;
  if (["0", "false", "no", "n", "inactive", "not allowed"].includes(normalised)) return false;
  return undefined;
}

function parseCatalogueUploadRows(csvContent: string) {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const spaIdx = csvColumn(headers, ["spa code", "spacode", "sku", "code", "item code", "product code"]);
  const descriptionIdx = csvColumn(headers, ["description", "desc", "name", "product name", "item name"]);
  const categoryIdx = csvColumn(headers, ["category", "product category"]);
  const priceIdx = csvColumn(headers, ["price", "cost", "unit price", "sell rate", "rate"]);
  const colourIdx = csvColumn(headers, ["colour", "color"]);
  const uomIdx = csvColumn(headers, ["uom", "unit", "unit of measure"]);
  const packQtySizesIdx = csvColumn(headers, ["pack qty/sizes", "pack qty sizes", "pack quantity sizes", "pack qty", "pack sizes"]);
  const subGroupIdx = csvColumn(headers, ["sub-group", "sub group", "subgroup", "group"]);
  const tagsIdx = csvColumn(headers, ["tags", "tag"]);
  const colourGroupIdx = csvColumn(headers, ["colour group", "color group"]);
  const colourInputAllowedIdx = csvColumn(headers, ["colour input allowed", "color input allowed", "requires colour", "requires color"]);
  const activeIdx = csvColumn(headers, ["active", "is active", "status"]);

  if (spaIdx < 0) {
    throw new Error("CSV must include a SPA Code, SKU, Code, or Product Code column.");
  }

  return rows.slice(1).map((row, index) => {
    const priceValue = csvValue(row, priceIdx);
    const parsedPrice = parseCsvNumber(priceValue);
    return {
      rowNumber: index + 2,
      spaCode: csvValue(row, spaIdx) || "",
      description: csvValue(row, descriptionIdx),
      category: csvValue(row, categoryIdx),
      price: parsedPrice,
      priceRaw: priceValue,
      colour: csvValue(row, colourIdx),
      uom: csvValue(row, uomIdx),
      packQtySizes: csvValue(row, packQtySizesIdx),
      subGroup: csvValue(row, subGroupIdx),
      tags: csvValue(row, tagsIdx),
      colourGroup: csvValue(row, colourGroupIdx),
      colourInputAllowed: parseCsvBoolean(csvValue(row, colourInputAllowedIdx)),
      isActive: parseCsvBoolean(csvValue(row, activeIdx)),
    };
  }).filter((row) => row.spaCode || row.description || row.category || row.priceRaw);
}

function catalogueUploadSetData(row: ReturnType<typeof parseCatalogueUploadRows>[number]) {
  const setData: any = {};
  if (row.description !== undefined) setData.description = row.description;
  if (row.category !== undefined) setData.category = row.category || "Other";
  if (typeof row.price === "number") setData.price = row.price.toString();
  if (row.colour !== undefined) setData.colour = row.colour;
  if (row.uom !== undefined) setData.uom = row.uom || "ea";
  if (row.packQtySizes !== undefined) setData.packQtySizes = row.packQtySizes;
  if (row.subGroup !== undefined) setData.subGroup = row.subGroup;
  if (row.tags !== undefined) setData.tags = row.tags;
  if (row.colourGroup !== undefined) setData.colourGroup = row.colourGroup;
  if (row.colourInputAllowed !== undefined) setData.colourInputAllowed = row.colourInputAllowed;
  if (row.isActive !== undefined) setData.isActive = row.isActive;
  return setData;
}

function catalogueUploadChanged(row: ReturnType<typeof parseCatalogueUploadRows>[number], existing: typeof componentCatalogueProducts.$inferSelect) {
  const setData = catalogueUploadSetData(row);
  return Object.entries(setData).some(([key, value]) => {
    const current = (existing as any)[key];
    if (key === "price") return Math.abs(Number(current || 0) - Number(value || 0)) > 0.001;
    return String(current ?? "") !== String(value ?? "");
  });
}

export const smartshopRouter = router({
  /** List available product categories */
  categories: protectedProcedure.query(() => {
    return PRODUCT_CATEGORIES;
  }),

  /** List all distinct sub-groups */
  subGroups: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ subGroup: componentCatalogueProducts.subGroup })
      .from(componentCatalogueProducts)
      .where(and(...componentCatalogueTenantConditions(
        ctx,
        eq(componentCatalogueProducts.isActive, true),
        sql`${componentCatalogueProducts.subGroup} IS NOT NULL AND ${componentCatalogueProducts.subGroup} != ''`
      )))
      .orderBy(componentCatalogueProducts.subGroup);
    return rows.map((r) => r.subGroup || "").filter(Boolean);
  }),

  /** List all distinct tags */
  allTags: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ tags: componentCatalogueProducts.tags })
      .from(componentCatalogueProducts)
      .where(and(...componentCatalogueTenantConditions(
        ctx,
        eq(componentCatalogueProducts.isActive, true),
        sql`${componentCatalogueProducts.tags} IS NOT NULL AND ${componentCatalogueProducts.tags} != ''`
      )));
    const tagSet = new Set<string>();
    for (const r of rows) {
      if (r.tags) {
        r.tags.split(",").map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => tagSet.add(t));
      }
    }
    return Array.from(tagSet).sort();
  }),

  /** Bulk update tags for multiple products */
  bulkUpdateTags: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()),
      tags: z.string(), // comma-separated
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const visibleProducts = await db
        .select({ id: componentCatalogueProducts.id })
        .from(componentCatalogueProducts)
        .where(and(...componentCatalogueTenantConditions(ctx, inArray(componentCatalogueProducts.id, input.productIds))));
      const visibleIds = visibleProducts.map((product) => product.id);
      if (visibleIds.length === 0) return { updated: 0 };
      await db.update(componentCatalogueProducts)
        .set({ tags: input.tags })
        .where(and(...componentCatalogueTenantConditions(ctx, inArray(componentCatalogueProducts.id, visibleIds))));
      return { updated: visibleIds.length };
    }),

  /** Bulk update sub-group for multiple products */
  bulkUpdateSubGroup: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()),
      subGroup: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const visibleProducts = await db
        .select({ id: componentCatalogueProducts.id })
        .from(componentCatalogueProducts)
        .where(and(...componentCatalogueTenantConditions(ctx, inArray(componentCatalogueProducts.id, input.productIds))));
      const visibleIds = visibleProducts.map((product) => product.id);
      if (visibleIds.length === 0) return { updated: 0 };
      await db.update(componentCatalogueProducts)
        .set({ subGroup: input.subGroup })
        .where(and(...componentCatalogueTenantConditions(ctx, inArray(componentCatalogueProducts.id, visibleIds))));
      return { updated: visibleIds.length };
    }),

  /** Soft-delete catalogue products in bulk */
  bulkDeleteCatalogueProducts: adminProcedure
    .input(z.object({
      productIds: z.array(z.number().int().positive()).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const visibleProducts = await db
        .select({ id: componentCatalogueProducts.id })
        .from(componentCatalogueProducts)
        .where(and(...componentCatalogueTenantConditions(ctx, inArray(componentCatalogueProducts.id, input.productIds))));
      const visibleIds = visibleProducts.map((product) => product.id);
      if (visibleIds.length === 0) return { deleted: 0 };
      await db.update(componentCatalogueProducts)
        .set({ isActive: false })
        .where(and(...componentCatalogueTenantConditions(ctx, inArray(componentCatalogueProducts.id, visibleIds))));
      return { deleted: visibleIds.length };
    }),

  /** Fetch products from a category with optional search, sub-group, and tag filtering */
  fetchProducts: protectedProcedure
    .input(
      catalogueProductFilterSchema.extend({
        offset: z.number().int().min(0).optional().default(0),
        limit: z.number().int().min(1).max(500).optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { products: [], total: 0 };

      const whereClause = catalogueProductConditions(ctx, input);

      // Get total count
      const [countResult] = await db
        .select({ total: count() })
        .from(componentCatalogueProducts)
        .where(whereClause);
      const total = countResult?.total ?? 0;

      // Get products
      const rows = await db
        .select({
          id: componentCatalogueProducts.id,
          spaCode: componentCatalogueProducts.spaCode,
          description: componentCatalogueProducts.description,
          colour: componentCatalogueProducts.colour,
          uom: componentCatalogueProducts.uom,
          packQtySizes: componentCatalogueProducts.packQtySizes,
          price: componentCatalogueProducts.price,
          category: componentCatalogueProducts.category,
          subGroup: componentCatalogueProducts.subGroup,
          tags: componentCatalogueProducts.tags,
          isActive: componentCatalogueProducts.isActive,
          colourInputAllowed: componentCatalogueProducts.colourInputAllowed,
          colourGroup: componentCatalogueProducts.colourGroup,
        })
        .from(componentCatalogueProducts)
        .where(whereClause)
        .orderBy(componentCatalogueProducts.subGroup, componentCatalogueProducts.spaCode)
        .limit(input.limit)
        .offset(input.offset);

      const products = rows.map((row) => ({
        id: row.id,
        spaCode: row.spaCode || "",
        description: row.description || "",
        colour: row.colour || "",
        uom: row.uom || "",
        packQtySizes: row.packQtySizes || "",
        price: Number(row.price || 0),
        category: row.category || "",
        subGroup: row.subGroup || "",
        tags: row.tags || "",
        isActive: row.isActive,
        colourInputAllowed: row.colourInputAllowed,
        colourGroup: row.colourGroup || "",
      }));

      return { products, total };
    }),

  /** Export all matching catalogue products */
  exportCatalogueProducts: adminProcedure
    .input(catalogueProductFilterSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const whereClause = catalogueProductConditions(ctx, input);
      const rows = await db
        .select({
          id: componentCatalogueProducts.id,
          spaCode: componentCatalogueProducts.spaCode,
          description: componentCatalogueProducts.description,
          colour: componentCatalogueProducts.colour,
          uom: componentCatalogueProducts.uom,
          packQtySizes: componentCatalogueProducts.packQtySizes,
          price: componentCatalogueProducts.price,
          category: componentCatalogueProducts.category,
          subGroup: componentCatalogueProducts.subGroup,
          tags: componentCatalogueProducts.tags,
          isActive: componentCatalogueProducts.isActive,
          colourInputAllowed: componentCatalogueProducts.colourInputAllowed,
          colourGroup: componentCatalogueProducts.colourGroup,
        })
        .from(componentCatalogueProducts)
        .where(whereClause)
        .orderBy(componentCatalogueProducts.category, componentCatalogueProducts.subGroup, componentCatalogueProducts.spaCode);

      return {
        products: rows.map((row) => ({
          id: row.id,
          spaCode: row.spaCode || "",
          description: row.description || "",
          colour: row.colour || "",
          uom: row.uom || "",
          packQtySizes: row.packQtySizes || "",
          price: Number(row.price || 0),
          category: row.category || "",
          subGroup: row.subGroup || "",
          tags: row.tags || "",
          isActive: row.isActive,
          colourInputAllowed: row.colourInputAllowed,
          colourGroup: row.colourGroup || "",
        })),
      };
    }),

  /** List saved working drafts for the current user */
  listDrafts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: smartshopOrderDrafts.id,
        name: smartshopOrderDrafts.name,
        jobNumber: smartshopOrderDrafts.jobNumber,
        lineCount: smartshopOrderDrafts.lineCount,
        totalExGst: smartshopOrderDrafts.totalExGst,
        updatedAt: smartshopOrderDrafts.updatedAt,
        createdAt: smartshopOrderDrafts.createdAt,
      })
      .from(smartshopOrderDrafts)
      .where(and(
        ...orderDraftTenantConditions(ctx, eq(smartshopOrderDrafts.userId, ctx.user.id)),
      ))
      .orderBy(desc(smartshopOrderDrafts.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      jobNumber: row.jobNumber || "",
      lineCount: row.lineCount || 0,
      totalExGst: Number(row.totalExGst || 0),
      updatedAt: row.updatedAt?.toISOString?.() || null,
      createdAt: row.createdAt?.toISOString?.() || null,
    }));
  }),

  /** Save or update a working component order draft */
  saveDraft: protectedProcedure
    .input(z.object({
      id: z.number().optional().nullable(),
      name: z.string().trim().min(1).max(255).optional(),
      payload: orderDraftPayloadSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const payload = normaliseDraftPayload(input.payload);
      const lineCount = payload.lines.length;
      const totalExGst = payload.lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
      const jobNumber = payload.orderDetails.jobNumber || payload.selectedJob?.quoteNumber || null;
      const fallbackName = jobNumber ? `Component order ${jobNumber}` : "Component order draft";
      const name = input.name?.trim() || fallbackName;

      if (input.id) {
        await requireOrderDraftAccess(db, ctx, input.id);
        await db
          .update(smartshopOrderDrafts)
          .set({
            name,
            jobNumber,
            payload,
            lineCount,
            totalExGst: totalExGst.toFixed(2),
          })
          .where(and(
            ...orderDraftTenantConditions(ctx, eq(smartshopOrderDrafts.id, input.id)),
            eq(smartshopOrderDrafts.userId, ctx.user.id),
          ));
        return { id: input.id, name };
      }

      const [result] = await db.insert(smartshopOrderDrafts).values({
        tenantId: ctx.tenant!.id,
        userId: ctx.user.id,
        name,
        jobNumber,
        payload,
        lineCount,
        totalExGst: totalExGst.toFixed(2),
      });
      return { id: result.insertId, name };
    }),

  /** Load a saved working component order draft */
  getDraft: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const draft = await requireOrderDraftAccess(db, ctx, input.id);
      return {
        id: draft.id,
        name: draft.name,
        jobNumber: draft.jobNumber || "",
        payload: draft.payload,
        lineCount: draft.lineCount || 0,
        totalExGst: Number(draft.totalExGst || 0),
        updatedAt: draft.updatedAt?.toISOString?.() || null,
      };
    }),

  /** Delete a saved working component order draft */
  deleteDraft: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await requireOrderDraftAccess(db, ctx, input.id);
      await db
        .delete(smartshopOrderDrafts)
        .where(and(
          ...orderDraftTenantConditions(ctx, eq(smartshopOrderDrafts.id, input.id)),
          eq(smartshopOrderDrafts.userId, ctx.user.id),
        ));
      return { success: true };
    }),

  /** Submit a construction order (stored locally) */
  submitOrder: protectedProcedure
    .input(
      z.object({
        orderDate: z.string(),
        requestedBy: z.string().min(1, "Requested By is required"),
        email: z.string().email("Valid email is required"),
        locationRequired: z.string().min(1, "Location Required is required"),
        jobNumber: z.string().min(1, "Job Number is required"),
        dateRequired: z.string().min(1, "Date Required is required"),
        notes: z.string().optional().default(""),
        lines: z
          .array(
            z.object({
              category: z.string(),
              spaCode: z.string(),
              description: z.string(),
              colour: z.string(),
              requiredColour: z.string(),
              uom: z.string(),
              packQtySizes: z.string(),
              unitPrice: z.number(),
              quantity: z.number().int().min(1),
              lineNotes: z.string().optional().default(""),
            })
          )
          .min(1, "At least one line item is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Calculate total
      const totalExGst = input.lines.reduce(
        (sum, l) => sum + l.unitPrice * l.quantity,
        0
      );

      // Get next order number
      const [maxOrder] = await db
        .select({ maxNum: sql<number>`COALESCE(MAX(${smartshopOrders.orderNumber}), 0)` })
        .from(smartshopOrders);
      const nextOrderNumber = (maxOrder?.maxNum ?? 0) + 1;

      // Insert order
      const [insertResult] = await db.insert(smartshopOrders).values({
        orderNumber: nextOrderNumber,
        userId: ctx.user.id,
        requestedBy: input.requestedBy,
        email: input.email,
        jobNumber: input.jobNumber,
        locationRequired: input.locationRequired,
        dateRequired: input.dateRequired,
        status: "submitted",
        notes: input.notes,
        totalExGst: String(totalExGst.toFixed(2)),
      });

      const orderId = insertResult.insertId;

      // Insert line items
      if (input.lines.length > 0) {
        await db.insert(smartshopOrderLines).values(
          input.lines.map((line) => ({
            orderId,
            category: line.category,
            spaCode: line.spaCode,
            description: line.description,
            colour: line.colour,
            requiredColour: line.requiredColour,
            uom: line.uom,
            packQtySizes: line.packQtySizes,
            unitPrice: String(line.unitPrice.toFixed(2)),
            quantity: line.quantity,
            lineNotes: line.lineNotes || "",
            lineTotal: String((line.unitPrice * line.quantity).toFixed(2)),
          }))
        );
      }

      // Send email confirmation with PDF attachment (fire-and-forget)
      try {
        if (input.email) {
          const pdfBuffer = await generateComponentOrderPdf({
            order: {
              id: String(orderId),
              orderNumber: nextOrderNumber,
              orderDate: input.orderDate,
              requestedBy: input.requestedBy,
              email: input.email,
              jobNumber: input.jobNumber,
              locationRequired: input.locationRequired,
              dateRequired: input.dateRequired,
              status: "submitted",
              notes: input.notes,
            },
            lines: input.lines.map((l) => ({
              category: l.category,
              spaCode: l.spaCode,
              description: l.description,
              colour: l.colour,
              requiredColour: l.requiredColour,
              uom: l.uom,
              packQtySizes: l.packQtySizes,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineNotes: l.lineNotes || "",
              lineTotal: l.unitPrice * l.quantity,
            })),
          });

          const lineCount = input.lines.length;
          const totalFormatted = `$${totalExGst.toFixed(2)}`;

          const result = await sendNotificationEmail({
            tenantId: ctx.tenant?.id,
            to: input.email,
            subject: `Component Order #${nextOrderNumber} Confirmation - ${input.jobNumber}`,
            htmlBody: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #1e3a5f; padding: 20px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 20px;">Component Order Confirmation</h1>
                </div>
                <div style="padding: 24px; background: #f9fafb;">
                  <p>Hi ${input.requestedBy},</p>
                  <p>Your component order has been submitted successfully.</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Order Number</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">#${nextOrderNumber}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Job Number</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${input.jobNumber}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Location</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${input.locationRequired}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Items</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${lineCount} line${lineCount !== 1 ? "s" : ""}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Total (ex GST)</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${totalFormatted}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Date Required</td><td style="padding: 8px;">${input.dateRequired}</td></tr>
                  </table>
                  <p style="color: #6b7280; font-size: 14px;">A PDF copy of your order is attached for your records.</p>
                </div>
                <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
                  <p>Altaspan - Component Orders</p>
                </div>
              </div>
            `,
            attachments: [{
              filename: `Component-Order-${nextOrderNumber}.pdf`,
              content: pdfBuffer.toString("base64"),
              contentType: "application/pdf",
            }],
            module: "construction",
          });
          if (!result.success) {
            console.error(`[Smartshop] Microsoft Graph error for order #${nextOrderNumber}:`, result.error);
            await logNotification(
              { settingKey: "smartshop.order_confirmation", channel: "email", recipientType: "user", recipientId: input.email, title: `Order #${nextOrderNumber} Confirmation` },
              "failed",
              result.error
            );
          } else {
            console.log(`[Smartshop] Order confirmation email sent to ${input.email} for order #${nextOrderNumber}`);
            await logNotification(
              { settingKey: "smartshop.order_confirmation", channel: "email", recipientType: "user", recipientId: input.email, title: `Order #${nextOrderNumber} Confirmation` },
              "sent"
            );
          }
        }
      } catch (emailErr: any) {
        // Don't fail the order if email fails
        console.error("[Smartshop] Failed to send order confirmation email:", emailErr);
        await logNotification(
          { settingKey: "smartshop.order_confirmation", channel: "email", recipientType: "user", recipientId: input.email, title: `Order #${nextOrderNumber} Confirmation` },
          "failed",
          emailErr?.message || "Unknown error"
        ).catch(() => {});
      }

      return { success: true, orderNumber: nextOrderNumber, orderId: String(orderId) };
    }),

  /** Save a custom product to the catalogue */
  saveOtherProduct: protectedProcedure
    .input(
      z.object({
        spaCode: z.string(),
        description: z.string(),
        colour: z.string().optional().default(""),
        uom: z.string().optional().default(""),
        packQtySizes: z.string().optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const tenantId = requireComponentCatalogueTenantId(ctx);
      // Save as an "Other" category product (or whichever category makes sense)
      await db.insert(componentCatalogueProducts).values({
        tenantId,
        category: "Other",
        spaCode: input.spaCode,
        description: input.description,
        colour: input.colour,
        uom: input.uom,
        packQtySizes: input.packQtySizes,
        price: "0",
      });
      return { success: true };
    }),

  // ─── Order History ──────────────────────────────────────────────────────────

  /** List submitted orders (optionally filtered by job number, status, date range) */
  listOrders: protectedProcedure
    .input(
      z.object({
        jobNumber: z.string().optional(),
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { orders: [], total: 0 };

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const conditions = [];
      if (input?.jobNumber) {
        conditions.push(eq(smartshopOrders.jobNumber, input.jobNumber));
      }
      if (input?.status) {
        conditions.push(eq(smartshopOrders.status, input.status as any));
      }
      if (input?.dateFrom) {
        conditions.push(gte(smartshopOrders.createdAt, new Date(input.dateFrom)));
      }
      if (input?.dateTo) {
        const endDate = new Date(input.dateTo);
        endDate.setDate(endDate.getDate() + 1);
        conditions.push(lte(smartshopOrders.createdAt, endDate));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Count
      const [countResult] = await db
        .select({ total: count() })
        .from(smartshopOrders)
        .where(whereClause);
      const total = countResult?.total ?? 0;

      // Fetch orders
      const rows = await db
        .select()
        .from(smartshopOrders)
        .where(whereClause)
        .orderBy(desc(smartshopOrders.orderNumber))
        .limit(limit)
        .offset(offset);

      return {
        orders: rows.map((r) => ({
          id: String(r.id),
          orderNumber: r.orderNumber,
          orderDate: r.createdAt?.toISOString() || null,
          requestedBy: r.requestedBy || "",
          email: r.email || "",
          locationRequired: r.locationRequired || "",
          jobNumber: r.jobNumber || "",
          dateRequired: r.dateRequired || null,
          status: r.status || "submitted",
          notes: r.notes || "",
        })),
        total,
      };
    }),

  /** Get order detail with line items */
  getOrderDetail: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const orderId = parseInt(input.orderId, 10);
      if (isNaN(orderId)) throw new Error("Invalid order ID");

      // Fetch order header
      const [order] = await db
        .select()
        .from(smartshopOrders)
        .where(eq(smartshopOrders.id, orderId));

      if (!order) throw new Error("Order not found");

      // Fetch line items
      const lines = await db
        .select()
        .from(smartshopOrderLines)
        .where(eq(smartshopOrderLines.orderId, orderId));

      return {
        order: {
          id: String(order.id),
          orderNumber: order.orderNumber,
          orderDate: order.createdAt?.toISOString() || null,
          requestedBy: order.requestedBy || "",
          email: order.email || "",
          locationRequired: order.locationRequired || "",
          jobNumber: order.jobNumber || "",
          dateRequired: order.dateRequired || null,
          status: order.status || "submitted",
          notes: order.notes || "",
        },
        lines: lines.map((l) => ({
          category: l.category || "",
          spaCode: l.spaCode || "",
          description: l.description || "",
          colour: l.colour || "",
          requiredColour: l.requiredColour || "",
          uom: l.uom || "",
          packQtySizes: l.packQtySizes || "",
          unitPrice: Number(l.unitPrice || 0),
          quantity: l.quantity || 0,
          lineNotes: l.lineNotes || "",
        })),
      };
    }),

  /** Update order status (admin/super_admin only) */
  updateOrderStatus: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        status: z.enum(["submitted", "processing", "shipped", "delivered", "cancelled"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const orderId = parseInt(input.orderId, 10);
      if (isNaN(orderId)) throw new Error("Invalid order ID");

      // Get current order to find previous status
      const [order] = await db
        .select()
        .from(smartshopOrders)
        .where(eq(smartshopOrders.id, orderId));
      if (!order) throw new Error("Order not found");

      const fromStatus = order.status || "submitted";

      // Update the status
      await db
        .update(smartshopOrders)
        .set({ status: input.status })
        .where(eq(smartshopOrders.id, orderId));

      // Log to audit history
      await db.insert(smartshopOrderStatusHistory).values({
        orderId,
        fromStatus,
        toStatus: input.status,
        changedByUserId: ctx.user.id,
        changedByName: ctx.user.name || "Unknown",
        note: input.note || null,
      });

      // Send email notification on Shipped or Delivered
      if ((input.status === "shipped" || input.status === "delivered") && order.email) {
        try {
          const statusLabel = input.status === "shipped" ? "Shipped" : "Delivered";
          const result = await sendNotificationEmail({
            tenantId: ctx.tenant?.id,
            to: order.email,
            subject: `Order #${order.orderNumber} - ${statusLabel}`,
            htmlBody: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">Order Status Update</h2>
                  <p>Hi ${order.requestedBy || "there"},</p>
                  <p>Your order <strong>#${order.orderNumber}</strong> for job <strong>${order.jobNumber || "N/A"}</strong> has been updated to:</p>
                  <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
                    <span style="font-size: 18px; font-weight: 600; color: ${input.status === "shipped" ? "#2563eb" : "#16a34a"};">${statusLabel}</span>
                  </div>
                  ${input.status === "shipped" ? "<p>Your order is on its way to the specified delivery location.</p>" : "<p>Your order has been delivered successfully.</p>"}
                  ${order.locationRequired ? `<p><strong>Delivery Location:</strong> ${order.locationRequired}</p>` : ""}
                  <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">This is an automated notification from AltaSpan.</p>
                </div>
              `,
            module: "construction",
          });
          await logNotification(
            { settingKey: "smartshop.order_status", channel: "email", recipientType: "user", recipientId: order.email!, title: `Order #${order.orderNumber} - ${statusLabel}` },
            result.success ? "sent" : "failed",
            result.error
          );
        } catch (emailErr: any) {
          console.error("[SmartshopRouter] Failed to send status notification email:", emailErr);
          await logNotification(
            { settingKey: "smartshop.order_status", channel: "email", recipientType: "user", recipientId: order.email!, title: `Order #${order.orderNumber} - Status Update` },
            "failed",
            emailErr?.message || "Unknown error"
          ).catch(() => {});
          // Don't fail the mutation if email fails
        }
      }

      return { success: true };
    }),

  /** Get order status history (audit log) */
  getOrderStatusHistory: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const orderId = parseInt(input.orderId, 10);
      if (isNaN(orderId)) throw new Error("Invalid order ID");

      const history = await db
        .select()
        .from(smartshopOrderStatusHistory)
        .where(eq(smartshopOrderStatusHistory.orderId, orderId))
        .orderBy(desc(smartshopOrderStatusHistory.createdAt));

      return history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedByName: h.changedByName,
        note: h.note,
        createdAt: h.createdAt?.toISOString() || null,
      }));
    }),

  // ─── PDF Export ──────────────────────────────────────────────────────────────
  /** Generate a printable PDF for a component order */
  generateOrderPdf: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { generateComponentOrderPdf } = await import("./smartshop-pdf.js");

      const orderId = parseInt(input.orderId, 10);
      if (isNaN(orderId)) throw new Error("Invalid order ID");

      // Fetch order header
      const [order] = await db
        .select()
        .from(smartshopOrders)
        .where(eq(smartshopOrders.id, orderId));
      if (!order) throw new Error("Order not found");

      // Fetch line items
      const lines = await db
        .select()
        .from(smartshopOrderLines)
        .where(eq(smartshopOrderLines.orderId, orderId));

      const pdfData = {
        order: {
          id: String(order.id),
          orderNumber: order.orderNumber,
          orderDate: order.createdAt?.toISOString() || null,
          requestedBy: order.requestedBy || "",
          email: order.email || "",
          locationRequired: order.locationRequired || "",
          jobNumber: order.jobNumber || "",
          dateRequired: order.dateRequired || null,
          status: order.status || "submitted",
          notes: order.notes || "",
        },
        lines: lines.map((l) => ({
          category: l.category || "",
          spaCode: l.spaCode || "",
          description: l.description || "",
          colour: l.colour || "",
          requiredColour: l.requiredColour || "",
          uom: l.uom || "",
          packQtySizes: l.packQtySizes || "",
          unitPrice: Number(l.unitPrice || 0),
          quantity: l.quantity || 0,
          lineNotes: l.lineNotes || "",
        })),
      };
      const pdfBuffer = await generateComponentOrderPdf(pdfData);
      const orderNum = pdfData.order.orderNumber || "draft";
      return {
        pdfBase64: pdfBuffer.toString("base64"),
        fileName: `Component-Order-${orderNum}.pdf`,
      };
    }),

  // ─── Favourites ─────────────────────────────────────────────────────────────

  /** Get all favourites for the current user */
  getFavourites: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(productFavourites)
      .where(eq(productFavourites.userId, ctx.user.id));
    return rows.map((r: any) => ({ category: r.category, spaCode: r.spaCode }));
  }),

  /** Toggle a product as favourite (add if not exists, remove if exists) */
  toggleFavourite: protectedProcedure
    .input(
      z.object({
        category: z.string(),
        spaCode: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const existing = await db
        .select()
        .from(productFavourites)
        .where(
          and(
            eq(productFavourites.userId, ctx.user.id),
            eq(productFavourites.category, input.category),
            eq(productFavourites.spaCode, input.spaCode)
          )
        );
      if (existing.length > 0) {
        await db
          .delete(productFavourites)
          .where(
            and(
              eq(productFavourites.userId, ctx.user.id),
              eq(productFavourites.category, input.category),
              eq(productFavourites.spaCode, input.spaCode)
            )
          );
        return { favourited: false };
      } else {
        await db.insert(productFavourites).values({
          userId: ctx.user.id,
          category: input.category,
          spaCode: input.spaCode,
        });
        return { favourited: true };
      }
    }),

  // ─── Catalogue Admin CRUD ────────────────────────────────────────────────────

  /** Update a catalogue product */
  updateCatalogueProduct: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        spaCode: z.string().min(1),
        description: z.string().min(1),
        colour: z.string().optional().default(""),
        uom: z.string().optional().default("ea"),
        packQtySizes: z.string().optional().default(""),
        price: z.number().min(0),
        category: z.string().min(1),
        subGroup: z.string().optional().default(""),
        tags: z.string().optional().default(""),
        colourInputAllowed: z.boolean().optional().default(false),
        colourGroup: z.string().optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(componentCatalogueProducts)
        .set({
          spaCode: input.spaCode,
          description: input.description,
          colour: input.colour,
          uom: input.uom,
          packQtySizes: input.packQtySizes,
          price: input.price.toString(),
          category: input.category,
          subGroup: input.subGroup,
          tags: input.tags,
          colourInputAllowed: input.colourInputAllowed,
          colourGroup: input.colourGroup,
        })
        .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.id, input.id)));

      return { success: true };
    }),

  /** Create a new catalogue product */
  createCatalogueProduct: protectedProcedure
    .input(
      z.object({
        spaCode: z.string().min(1),
        description: z.string().min(1),
        colour: z.string().optional().default(""),
        uom: z.string().optional().default("ea"),
        packQtySizes: z.string().optional().default(""),
        price: z.number().min(0),
        category: z.string().min(1),
        subGroup: z.string().optional().default(""),
        tags: z.string().optional().default(""),
        colourInputAllowed: z.boolean().optional().default(false),
        colourGroup: z.string().optional().default(""),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = requireComponentCatalogueTenantId(ctx);

      await db.insert(componentCatalogueProducts).values({
        tenantId,
        spaCode: input.spaCode,
        description: input.description,
        colour: input.colour,
        uom: input.uom,
        packQtySizes: input.packQtySizes,
        price: input.price.toString(),
        category: input.category,
        subGroup: input.subGroup,
        tags: input.tags,
        isActive: true,
        colourInputAllowed: input.colourInputAllowed,
        colourGroup: input.colourGroup,
      });

      return { success: true };
    }),

  /** Toggle active status (soft delete/restore) */
  toggleCatalogueProductActive: protectedProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(componentCatalogueProducts)
        .set({ isActive: input.active })
        .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.id, input.id)));

      return { success: true };
    }),

  // ─── CSV Price Re-Import ─────────────────────────────────────────────────────

  /** Preview price changes from CSV content (returns diff) */
  previewPriceUpdate: protectedProcedure
    .input(z.object({ csvContent: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const lines = input.csvContent.trim().split("\n");
      if (lines.length < 2) return { changes: [] };

      // Parse header
      const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
      const spaIdx = header.findIndex((h) => h.includes("spa") || h.includes("code") || h === "sku");
      const priceIdx = header.findIndex((h) => h.includes("price") || h.includes("cost"));
      const descIdx = header.findIndex((h) => h.includes("desc"));
      const uomIdx = header.findIndex((h) => h === "uom" || h.includes("unit"));

      if (spaIdx === -1 || priceIdx === -1) {
        throw new Error("CSV must have columns for SPA Code and Price");
      }

      // Parse rows
      const changes: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const spaCode = cols[spaIdx];
        const newPrice = parseFloat(cols[priceIdx]?.replace(/[^0-9.\-]/g, "") || "0");
        const newDescription = descIdx >= 0 ? cols[descIdx] : undefined;
        const newUom = uomIdx >= 0 ? cols[uomIdx] : undefined;

        if (!spaCode || isNaN(newPrice)) continue;

        // Look up existing product
        const existing = await db
          .select({
            id: componentCatalogueProducts.id,
            price: componentCatalogueProducts.price,
            description: componentCatalogueProducts.description,
          })
          .from(componentCatalogueProducts)
          .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.spaCode, spaCode)))
          .limit(1);

        if (existing.length === 0) {
          changes.push({ spaCode, newPrice, description: newDescription, status: "not_found", oldPrice: null });
        } else {
          const oldPrice = Number(existing[0].price || 0);
          const priceChanged = Math.abs(oldPrice - newPrice) > 0.001;
          changes.push({
            spaCode,
            newPrice,
            oldPrice,
            description: existing[0].description,
            newDescription,
            newUom,
            status: priceChanged ? "changed" : "unchanged",
          });
        }
      }

      return { changes };
    }),

  /** Apply price updates from the preview */
  applyPriceUpdate: protectedProcedure
    .input(
      z.object({
        updates: z.array(
          z.object({
            spaCode: z.string(),
            newPrice: z.number(),
            newDescription: z.string().optional(),
            newUom: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      let updated = 0;
      let notFound = 0;
      let unchanged = 0;

      for (const update of input.updates) {
        const existing = await db
          .select({ id: componentCatalogueProducts.id })
          .from(componentCatalogueProducts)
          .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.spaCode, update.spaCode)))
          .limit(1);

        if (existing.length === 0) {
          notFound++;
          continue;
        }

        const setData: any = { price: update.newPrice.toString() };
        if (update.newDescription) setData.description = update.newDescription;
        if (update.newUom) setData.uom = update.newUom;

        await db
          .update(componentCatalogueProducts)
          .set(setData)
          .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.id, existing[0].id)));
        updated++;
      }

      return { updated, notFound, unchanged };
    }),

  /** Preview full catalogue upload from CSV content */
  previewCatalogueUpload: adminProcedure
    .input(z.object({ csvContent: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const rows = parseCatalogueUploadRows(input.csvContent);
      const seenSpaCodes = new Set<string>();
      const preview: any[] = [];

      for (const row of rows) {
        const errors: string[] = [];
        const normalisedSpaCode = row.spaCode.trim().toLowerCase();
        if (!row.spaCode.trim()) errors.push("SPA Code is required");
        if (row.price === null) errors.push("Price must be a valid number");
        if (normalisedSpaCode && seenSpaCodes.has(normalisedSpaCode)) errors.push("Duplicate SPA Code in upload");
        if (normalisedSpaCode) seenSpaCodes.add(normalisedSpaCode);

        const existing = row.spaCode.trim()
          ? await db.select().from(componentCatalogueProducts).where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.spaCode, row.spaCode.trim()))).limit(1)
          : [];

        if (existing.length === 0 && !row.description?.trim()) {
          errors.push("Description is required for new products");
        }

        const status = errors.length > 0
          ? "invalid"
          : existing.length === 0
            ? "create"
            : catalogueUploadChanged(row, existing[0])
              ? "update"
              : "unchanged";

        preview.push({
          rowNumber: row.rowNumber,
          spaCode: row.spaCode,
          description: row.description || existing[0]?.description || "",
          category: row.category || existing[0]?.category || "Other",
          price: typeof row.price === "number" ? row.price : Number(existing[0]?.price || 0),
          oldPrice: existing[0] ? Number(existing[0].price || 0) : null,
          existingId: existing[0]?.id || null,
          status,
          errors,
        });
      }

      return {
        rows: preview,
        summary: {
          create: preview.filter((row) => row.status === "create").length,
          update: preview.filter((row) => row.status === "update").length,
          unchanged: preview.filter((row) => row.status === "unchanged").length,
          invalid: preview.filter((row) => row.status === "invalid").length,
        },
      };
    }),

  /** Create or update catalogue products from CSV content */
  applyCatalogueUpload: adminProcedure
    .input(z.object({ csvContent: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = requireComponentCatalogueTenantId(ctx);

      const rows = parseCatalogueUploadRows(input.csvContent);
      const seenSpaCodes = new Set<string>();
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let invalid = 0;

      for (const row of rows) {
        const spaCode = row.spaCode.trim();
        const normalisedSpaCode = spaCode.toLowerCase();
        if (!spaCode || row.price === null || seenSpaCodes.has(normalisedSpaCode)) {
          invalid++;
          continue;
        }
        seenSpaCodes.add(normalisedSpaCode);

        const existing = await db.select().from(componentCatalogueProducts).where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.spaCode, spaCode))).limit(1);
        if (existing.length === 0) {
          if (!row.description?.trim()) {
            invalid++;
            continue;
          }
          await db.insert(componentCatalogueProducts).values({
            tenantId,
            spaCode,
            description: row.description.trim(),
            category: row.category?.trim() || "Other",
            price: typeof row.price === "number" ? row.price.toString() : "0",
            colour: row.colour || "",
            uom: row.uom || "ea",
            packQtySizes: row.packQtySizes || "",
            subGroup: row.subGroup || "",
            tags: row.tags || "",
            isActive: row.isActive ?? true,
            colourInputAllowed: row.colourInputAllowed ?? false,
            colourGroup: row.colourGroup || "",
          });
          created++;
          continue;
        }

        if (!catalogueUploadChanged(row, existing[0])) {
          unchanged++;
          continue;
        }

        await db.update(componentCatalogueProducts)
          .set(catalogueUploadSetData(row))
          .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.id, existing[0].id)));
        updated++;
      }

      return { created, updated, unchanged, invalid };
    }),

  // ─── Dynamic Categories ──────────────────────────────────────────────────
  /** Returns default categories plus active catalogue categories */
  allCategories: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [...PRODUCT_CATEGORIES];
    const rows = await db
      .selectDistinct({ category: componentCatalogueProducts.category })
      .from(componentCatalogueProducts)
      .where(componentCatalogueWhere(ctx, eq(componentCatalogueProducts.isActive, true)));
    const merged = new Set([...PRODUCT_CATEGORIES, ...rows.map((row) => row.category).filter(Boolean)]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }),

  // ─── Order Templates (Kits) ──────────────────────────────────────────────
  /** List all templates with item count */
  listTemplates: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional().default(true) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const activeOnly = input?.activeOnly ?? true;
      const conditions = orderTemplateTenantConditions(ctx);
      if (activeOnly) conditions.push(eq(orderTemplates.isActive, true));
      const templates = await db
        .select()
        .from(orderTemplates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(orderTemplates.name));

      const templateIds = templates.map((template) => template.id);
      if (templateIds.length === 0) return [];

      // Get item counts for each template
      const itemCounts = await db
        .select({
          templateId: orderTemplateItems.templateId,
          itemCount: count(orderTemplateItems.id),
        })
        .from(orderTemplateItems)
        .where(inArray(orderTemplateItems.templateId, templateIds))
        .groupBy(orderTemplateItems.templateId);
      const countMap = new Map(itemCounts.map((r) => [r.templateId, Number(r.itemCount)]));

      return templates.map((t) => ({
        ...t,
        itemCount: countMap.get(t.id) || 0,
      }));
    }),

  /** Get a single template with all its items */
  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const template = await requireOrderTemplateAccess(db, ctx, input.id);

      const items = await db
        .select()
        .from(orderTemplateItems)
        .where(eq(orderTemplateItems.templateId, input.id))
        .orderBy(asc(orderTemplateItems.sortOrder), asc(orderTemplateItems.id));

      return { ...template, items };
    }),

  /** Create a new template */
  createTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional().default(""),
        tag: z.string().optional().default(""),
        items: z.array(
          z.object({
            catalogueProductId: z.number().nullable().optional(),
            spaCode: z.string(),
            description: z.string(),
            category: z.string(),
            colour: z.string().optional().default(""),
            uom: z.string().optional().default(""),
            defaultQuantity: z.number().int().min(1).default(1),
            unitPrice: z.string().optional().default("0"),
            notes: z.string().optional().default(""),
            sortOrder: z.number().int().optional().default(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [result] = await db.insert(orderTemplates).values({
        tenantId: tenantIdFromContext(ctx),
        name: input.name,
        description: input.description || null,
        tag: input.tag,
        createdBy: ctx.user.id,
      });
      const templateId = result.insertId;

      if (input.items.length > 0) {
        await db.insert(orderTemplateItems).values(
          input.items.map((item, idx) => ({
            templateId: Number(templateId),
            catalogueProductId: item.catalogueProductId ?? null,
            spaCode: item.spaCode,
            description: item.description,
            category: item.category,
            colour: item.colour,
            uom: item.uom,
            defaultQuantity: item.defaultQuantity,
            unitPrice: item.unitPrice,
            notes: item.notes || null,
            sortOrder: item.sortOrder ?? idx,
          }))
        );
      }

      return { id: Number(templateId) };
    }),

  /** Update a template (name, description, tag, active status) */
  updateTemplate: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        tag: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await requireOrderTemplateAccess(db, ctx, input.id);
      const setData: Record<string, unknown> = {};
      if (input.name !== undefined) setData.name = input.name;
      if (input.description !== undefined) setData.description = input.description;
      if (input.tag !== undefined) setData.tag = input.tag;
      if (input.isActive !== undefined) setData.isActive = input.isActive;
      if (Object.keys(setData).length > 0) {
        await db.update(orderTemplates)
          .set(setData)
          .where(and(...orderTemplateTenantConditions(ctx, eq(orderTemplates.id, input.id))));
      }
      return { success: true };
    }),

  /** Delete a template (cascade deletes items) */
  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(orderTemplates)
        .where(and(...orderTemplateTenantConditions(ctx, eq(orderTemplates.id, input.id))));
      return { success: true };
    }),

  /** Replace all items in a template */
  setTemplateItems: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        items: z.array(
          z.object({
            catalogueProductId: z.number().nullable().optional(),
            spaCode: z.string(),
            description: z.string(),
            category: z.string(),
            colour: z.string().optional().default(""),
            uom: z.string().optional().default(""),
            defaultQuantity: z.number().int().min(1).default(1),
            unitPrice: z.string().optional().default("0"),
            notes: z.string().optional().default(""),
            sortOrder: z.number().int().optional().default(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await requireOrderTemplateAccess(db, ctx, input.templateId);
      // Delete existing items
      await db.delete(orderTemplateItems).where(eq(orderTemplateItems.templateId, input.templateId));
      // Insert new items
      if (input.items.length > 0) {
        await db.insert(orderTemplateItems).values(
          input.items.map((item, idx) => ({
            templateId: input.templateId,
            catalogueProductId: item.catalogueProductId ?? null,
            spaCode: item.spaCode,
            description: item.description,
            category: item.category,
            colour: item.colour,
            uom: item.uom,
            defaultQuantity: item.defaultQuantity,
            unitPrice: item.unitPrice,
            notes: item.notes || null,
            sortOrder: item.sortOrder ?? idx,
          }))
        );
      }
      return { success: true };
    }),

  /** Duplicate a template */
  duplicateTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [original] = await db
        .select()
        .from(orderTemplates)
        .where(and(...orderTemplateTenantConditions(ctx, eq(orderTemplates.id, input.id))))
        .limit(1);
      if (!original) throw new Error("Template not found");

      const items = await db
        .select()
        .from(orderTemplateItems)
        .where(eq(orderTemplateItems.templateId, input.id));

      const [result] = await db.insert(orderTemplates).values({
        tenantId: tenantIdFromContext(ctx),
        name: `${original.name} (Copy)`,
        description: original.description,
        tag: original.tag,
        createdBy: ctx.user.id,
      });
      const newId = Number(result.insertId);

      if (items.length > 0) {
        await db.insert(orderTemplateItems).values(
          items.map((item) => ({
            templateId: newId,
            catalogueProductId: item.catalogueProductId,
            spaCode: item.spaCode,
            description: item.description,
            category: item.category,
            colour: item.colour,
            uom: item.uom,
            defaultQuantity: item.defaultQuantity,
            unitPrice: item.unitPrice,
            notes: item.notes,
            sortOrder: item.sortOrder,
          }))
        );
      }

      return { id: newId };
    }),

  // ─── CSV Export ──────────────────────────────────────────────────────────────
  /** Export filtered orders as CSV data */
  exportOrdersCsv: protectedProcedure
    .input(
      z.object({
        jobNumber: z.string().optional(),
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions: any[] = [];
      if (input?.jobNumber) {
        conditions.push(like(smartshopOrders.jobNumber, `%${input.jobNumber}%`));
      }
      if (input?.status) {
        conditions.push(eq(smartshopOrders.status, input.status as any));
      }
      if (input?.dateFrom) {
        conditions.push(gte(smartshopOrders.createdAt, new Date(input.dateFrom)));
      }
      if (input?.dateTo) {
        conditions.push(lte(smartshopOrders.createdAt, new Date(input.dateTo)));
      }

      const orders = await db
        .select()
        .from(smartshopOrders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(smartshopOrders.createdAt));

      // Get all lines for these orders
      const orderIds = orders.map((o) => o.id);
      let allLines: any[] = [];
      if (orderIds.length > 0) {
        allLines = await db
          .select()
          .from(smartshopOrderLines)
          .where(sql`${smartshopOrderLines.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);
      }

      // Build CSV rows (one row per order line)
      const csvRows: string[][] = [];
      csvRows.push([
        "Order #", "Date", "Status", "Job Number", "Requested By", "Email",
        "Location", "SPA Code", "Description", "Colour", "Req Colour",
        "UOM", "Qty", "Unit Price", "Line Total"
      ]);

      for (const order of orders) {
        const lines = allLines.filter((l: any) => l.orderId === order.id);
        if (lines.length === 0) {
          csvRows.push([
            String(order.orderNumber || ""),
            order.createdAt?.toISOString().split("T")[0] || "",
            order.status || "",
            order.jobNumber || "",
            order.requestedBy || "",
            order.email || "",
            order.locationRequired || "",
            "", "", "", "", "", "", "", ""
          ]);
        } else {
          for (const line of lines) {
            csvRows.push([
              String(order.orderNumber || ""),
              order.createdAt?.toISOString().split("T")[0] || "",
              order.status || "",
              order.jobNumber || "",
              order.requestedBy || "",
              order.email || "",
              order.locationRequired || "",
              line.spaCode || "",
              line.description || "",
              line.colour || "",
              line.requiredColour || "",
              line.uom || "",
              String(line.quantity || 0),
              String(Number(line.unitPrice || 0).toFixed(2)),
              String((Number(line.unitPrice || 0) * (line.quantity || 0)).toFixed(2)),
            ]);
          }
        }
      }

      // Escape CSV fields
      const escapeCsv = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      const csvContent = csvRows.map((row) => row.map(escapeCsv).join(",")).join("\n");
      return { csvContent, rowCount: csvRows.length - 1 };
    }),

  /** Get template items formatted for the order form (apply kit) */
  getTemplateForOrder: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [template] = await db
        .select()
        .from(orderTemplates)
        .where(and(...orderTemplateTenantConditions(ctx, eq(orderTemplates.id, input.templateId), eq(orderTemplates.isActive, true))))
        .limit(1);
      if (!template) throw new Error("Template not found or inactive");

      const items = await db
        .select()
        .from(orderTemplateItems)
        .where(eq(orderTemplateItems.templateId, input.templateId))
        .orderBy(asc(orderTemplateItems.sortOrder));

      return {
        templateName: template.name,
        items: items.map((item) => ({
          spaCode: item.spaCode,
          description: item.description,
          category: item.category,
          colour: item.colour || "",
          uom: item.uom || "",
          quantity: item.defaultQuantity,
          unitPrice: item.unitPrice || "0",
          notes: item.notes || "",
        })),
      };
    }),
});
