import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import * as XLSX from "xlsx";
import {
  manufacturingOrders,
  manufacturingTasks,
  manufacturingSchedule,
  manufacturingPurchaseOrders,
  manufacturingTransitionImports,
  manufacturingTransitionImportRows,
  manufacturingProductMatchMappings,
  inventoryStockItems,
  constructionJobs,
  crmLeads,
  cmComponentOrders,
  checkMeasureWorkbooks,
  flashingOrders,
  branches,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte, inArray, sql, asc, or, isNull, like } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { appendTenantScope, tenantIdFromContext, tenantScoped } from "./_core/tenant-scope";
import { privateTenantConditions } from "./private-tenant-scope";
import { TRPCError } from "@trpc/server";
import { canonicalClientFromLead } from "./canonical-client";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

const manufacturingOrderStatuses = new Set([
  "received",
  "in_production",
  "partially_complete",
  "completed",
  "ready_for_dispatch",
  "dispatched",
  "on_hold",
  "cancelled",
]);

const flashingOrderStatuses = new Set([
  "draft",
  "submitted",
  "supplier_received",
  "in_production",
  "purchase_ordered",
  "ready",
  "completed",
  "cancelled",
  "archived",
]);

const transitionOrderStatuses = new Set([
  "imported",
  "in_review",
  "accepted",
  "cancelled",
  "archived",
]);

const HEADER_ALIASES: Record<string, string[]> = {
  productCode: ["code", "item code", "product code", "sku", "part", "part no", "part number"],
  productName: ["component", "components", "item", "product", "product name", "description", "item description", "material", "profile"],
  description: ["notes", "note", "details", "description", "scope"],
  category: ["category", "type", "group", "product group"],
  colour: ["colour", "color", "finish"],
  quantity: ["qty", "quantity", "count", "order qty", "required qty"],
  unit: ["unit", "uom", "measure", "unit of measure"],
  length: ["length", "length mm", "length (mm)", "size", "actual size"],
  width: ["width", "width mm", "width (mm)"],
};

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tenantIdOrThrow(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
  return tenantId;
}

async function branchTenantConditions(ctx: any, ...baseConditions: any[]) {
  return privateTenantConditions(ctx, branches.tenantId, ...baseConditions);
}

function purchaseOrderTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  const tenantId = tenantIdFromContext(ctx);
  const poScope = tenantScoped(manufacturingPurchaseOrders.tenantId, tenantId);
  const legacyJobScope = tenantScoped(constructionJobs.tenantId, tenantId);
  if (poScope && legacyJobScope) {
    conditions.push(or(poScope, and(isNull(manufacturingPurchaseOrders.tenantId), legacyJobScope))!);
  } else if (poScope) {
    conditions.push(poScope);
  }
  return conditions;
}

function stockItemTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, inventoryStockItems.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function transitionImportTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  conditions.push(eq(manufacturingTransitionImports.tenantId, tenantIdOrThrow(ctx)));
  return conditions;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawProductKey(input: { productCode?: string | null; productName?: string | null; description?: string | null }) {
  const code = normalizeText(input.productCode);
  const name = normalizeText(input.productName);
  const description = normalizeText(input.description);
  return (code || name || description).slice(0, 255);
}

function excelCellText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function headerKey(value: unknown) {
  return normalizeText(value);
}

function findHeaderRow(rawRows: unknown[][]) {
  let bestIndex = 0;
  let bestScore = -1;
  rawRows.slice(0, 25).forEach((row, index) => {
    const headers = row.map(headerKey);
    const score = Object.values(HEADER_ALIASES).reduce((total, aliases) => (
      total + (headers.some((header) => aliases.includes(header)) ? 1 : 0)
    ), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 2 ? bestIndex : 0;
}

function columnFor(headers: string[], field: keyof typeof HEADER_ALIASES) {
  const aliases = HEADER_ALIASES[field];
  const exactIndex = headers.findIndex((header) => aliases.includes(header));
  if (exactIndex >= 0) return exactIndex;
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
}

function parseTransitionWorkbook(params: { buffer: Buffer; filename: string }) {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(params.buffer, { type: "buffer", cellDates: true });
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Could not read the workbook. Upload a valid .xlsm, .xlsx, or .xls file." });
  }

  const worksheetName = workbook.SheetNames[0];
  if (!worksheetName) throw new TRPCError({ code: "BAD_REQUEST", message: "Workbook does not contain any worksheets." });

  const worksheet = workbook.Sheets[worksheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", blankrows: false });
  if (rawRows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "The first worksheet is empty." });

  const headerIndex = findHeaderRow(rawRows);
  const headers = (rawRows[headerIndex] || []).map(headerKey);
  const columnMap = {
    productCode: columnFor(headers, "productCode"),
    productName: columnFor(headers, "productName"),
    description: columnFor(headers, "description"),
    category: columnFor(headers, "category"),
    colour: columnFor(headers, "colour"),
    quantity: columnFor(headers, "quantity"),
    unit: columnFor(headers, "unit"),
    length: columnFor(headers, "length"),
    width: columnFor(headers, "width"),
  };

  const rows = rawRows.slice(headerIndex + 1).map((row, index) => {
    const get = (column: number) => column >= 0 ? row[column] : "";
    const fallbackName = excelCellText(row.find((cell) => excelCellText(cell)));
    const productCode = excelCellText(get(columnMap.productCode));
    const productName = excelCellText(get(columnMap.productName)) || fallbackName;
    const description = excelCellText(get(columnMap.description));
    const quantity = parseNumber(get(columnMap.quantity)) ?? 1;
    const length = parseNumber(get(columnMap.length));
    const width = parseNumber(get(columnMap.width));
    const rawData = Object.fromEntries((rawRows[headerIndex] || []).map((header, colIndex) => [
      excelCellText(header) || `Column ${colIndex + 1}`,
      excelCellText(row[colIndex]),
    ]));
    return {
      rowNumber: headerIndex + index + 2,
      rawProductCode: productCode || null,
      rawProductName: productName,
      rawDescription: description || null,
      rawCategory: excelCellText(get(columnMap.category)) || null,
      rawColour: excelCellText(get(columnMap.colour)) || null,
      rawUnit: excelCellText(get(columnMap.unit)) || null,
      quantity: Math.max(quantity, 0),
      length,
      width,
      rawData,
      rawProductKey: rawProductKey({ productCode, productName, description }),
    };
  }).filter((row) => row.rawProductName && row.rawProductKey);

  if (rows.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No product rows were found on the first worksheet." });
  }

  return { worksheetName, headerRow: headerIndex + 1, rows };
}

function tokenScore(left: string, right: string) {
  const a = new Set(normalizeText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) intersection += 1;
  });
  const union = new Set<string>();
  a.forEach((token) => union.add(token));
  b.forEach((token) => union.add(token));
  return intersection / union.size;
}

function findBestStockMatch(row: { rawProductCode?: string | null; rawProductName: string; rawDescription?: string | null }, stockItems: any[]) {
  const code = normalizeText(row.rawProductCode);
  const rowText = [row.rawProductCode, row.rawProductName, row.rawDescription].filter(Boolean).join(" ");
  let best: { item: any; confidence: number } | null = null;
  for (const item of stockItems) {
    const itemCode = normalizeText(item.code);
    const itemText = [item.code, item.name, item.category, item.description, item.supplier].filter(Boolean).join(" ");
    let confidence = Math.round(tokenScore(rowText, itemText) * 100);
    if (code && itemCode && code === itemCode) confidence = 100;
    else if (code && itemCode && (code.includes(itemCode) || itemCode.includes(code))) confidence = Math.max(confidence, 92);
    if (!best || confidence > best.confidence) best = { item, confidence };
  }
  return best && best.confidence >= 55 ? best : null;
}

async function matchTransitionRows(db: any, ctx: any, parsedRows: any[]) {
  const tenantId = tenantIdOrThrow(ctx);
  const [stockItems, mappings] = await Promise.all([
    db.select({
      id: inventoryStockItems.id,
      code: inventoryStockItems.code,
      name: inventoryStockItems.name,
      category: inventoryStockItems.category,
      unit: inventoryStockItems.unit,
      unitType: inventoryStockItems.unitType,
      supplier: inventoryStockItems.supplier,
      description: inventoryStockItems.description,
    }).from(inventoryStockItems)
      .where(and(...stockItemTenantConditions(ctx, eq(inventoryStockItems.isActive, true))))
      .orderBy(inventoryStockItems.category, inventoryStockItems.name),
    parsedRows.length
      ? db.select().from(manufacturingProductMatchMappings)
        .where(and(
          eq(manufacturingProductMatchMappings.tenantId, tenantId),
          inArray(manufacturingProductMatchMappings.rawProductKey, parsedRows.map((row) => row.rawProductKey)),
        ))
      : [],
  ]);
  const mappingByKey = new Map<string, any>((mappings as any[]).map((mapping: any) => [mapping.rawProductKey, mapping]));

  return parsedRows.map((row) => {
    const learned = mappingByKey.get(row.rawProductKey);
    if (learned?.stockItemId) {
      return {
        ...row,
        stockItemId: learned.stockItemId,
        stockItemCode: learned.stockItemCode,
        stockItemName: learned.stockItemName,
        matchStatus: "learned" as const,
        matchConfidence: Number(learned.confidence || 100),
      };
    }

    const best = findBestStockMatch(row, stockItems);
    return {
      ...row,
      stockItemId: best?.item?.id ?? null,
      stockItemCode: best?.item?.code ?? null,
      stockItemName: best?.item?.name ?? null,
      matchStatus: best ? "fuzzy" as const : "unmatched" as const,
      matchConfidence: best?.confidence ?? 0,
    };
  });
}

async function nextTransitionImportNumber(db: any, tenantId: number) {
  const [row] = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(manufacturingTransitionImports)
    .where(eq(manufacturingTransitionImports.tenantId, tenantId));
  return `MFG-UP-${String(Number(row?.count || 0) + 1).padStart(5, "0")}`;
}

async function stockItemsById(db: any, ctx: any, ids: number[]) {
  if (ids.length === 0) return new Map<number, any>();
  const rows = await db.select({
    id: inventoryStockItems.id,
    code: inventoryStockItems.code,
    name: inventoryStockItems.name,
    category: inventoryStockItems.category,
    unit: inventoryStockItems.unit,
    unitType: inventoryStockItems.unitType,
  }).from(inventoryStockItems)
    .where(and(...stockItemTenantConditions(ctx, inArray(inventoryStockItems.id, ids))));
  return new Map(rows.map((row: any) => [row.id, row]));
}

async function rememberProductMappings(db: any, ctx: any, rows: any[]) {
  const tenantId = tenantIdOrThrow(ctx);
  const matchedRows = rows.filter((row) => row.rawProductKey && row.stockItemId && (
    row.matchStatus === "manual" ||
    row.matchStatus === "learned" ||
    Number(row.matchConfidence || 0) >= 85
  ));
  for (const row of matchedRows) {
    await db.insert(manufacturingProductMatchMappings).values({
      tenantId,
      rawProductKey: row.rawProductKey,
      rawProductName: row.rawProductName,
      stockItemId: row.stockItemId,
      stockItemCode: row.stockItemCode || null,
      stockItemName: row.stockItemName || null,
      timesUsed: 1,
      confidence: String(row.matchStatus === "manual" ? 100 : Math.max(Number(row.matchConfidence || 0), 80)),
      lastUsedAt: new Date(),
      createdBy: ctx.user.id,
      createdByName: ctx.user.name || ctx.user.email || "Unknown",
    }).onDuplicateKeyUpdate({
      set: {
        stockItemId: row.stockItemId,
        stockItemCode: row.stockItemCode || null,
        stockItemName: row.stockItemName || null,
        rawProductName: row.rawProductName,
        timesUsed: sql`${manufacturingProductMatchMappings.timesUsed} + 1`,
        confidence: String(row.matchStatus === "manual" ? 100 : Math.max(Number(row.matchConfidence || 0), 80)),
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

async function requireTransitionImportAccess(db: any, ctx: any, importId: number) {
  const [row] = await db.select()
    .from(manufacturingTransitionImports)
    .where(and(...transitionImportTenantConditions(ctx, eq(manufacturingTransitionImports.id, importId))))
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Uploaded manufacturing order not found" });
  }
  return row;
}

async function requireTransitionRowAccess(db: any, ctx: any, rowId: number) {
  const [row] = await db.select({
    import: manufacturingTransitionImports,
    importRow: manufacturingTransitionImportRows,
  })
    .from(manufacturingTransitionImportRows)
    .innerJoin(manufacturingTransitionImports, eq(manufacturingTransitionImportRows.importId, manufacturingTransitionImports.id))
    .where(and(
      eq(manufacturingTransitionImportRows.id, rowId),
      ...transitionImportTenantConditions(ctx),
    ))
    .limit(1);
  if (!row?.importRow || !row.import) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Uploaded manufacturing order row not found" });
  }
  return row;
}

async function refreshTransitionImportCounts(db: any, tenantId: number, importId: number) {
  const [counts] = await db.select({
    lineCount: sql<number>`COUNT(*)`,
    matchedLineCount: sql<number>`SUM(CASE WHEN ${manufacturingTransitionImportRows.stockItemId} IS NOT NULL THEN 1 ELSE 0 END)`,
  }).from(manufacturingTransitionImportRows)
    .where(and(
      eq(manufacturingTransitionImportRows.tenantId, tenantId),
      eq(manufacturingTransitionImportRows.importId, importId),
    ));
  await db.update(manufacturingTransitionImports)
    .set({
      lineCount: Number(counts?.lineCount || 0),
      matchedLineCount: Number(counts?.matchedLineCount || 0),
      updatedAt: new Date(),
    })
    .where(and(
      eq(manufacturingTransitionImports.tenantId, tenantId),
      eq(manufacturingTransitionImports.id, importId),
    ));
}

const transitionRowInput = z.object({
  rowNumber: z.number(),
  rawProductKey: z.string().nullable().optional(),
  rawProductCode: z.string().nullable().optional(),
  rawProductName: z.string().min(1),
  rawDescription: z.string().nullable().optional(),
  rawCategory: z.string().nullable().optional(),
  rawColour: z.string().nullable().optional(),
  rawUnit: z.string().nullable().optional(),
  quantity: z.number().optional().default(1),
  length: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  stockItemId: z.number().nullable().optional(),
  stockItemCode: z.string().nullable().optional(),
  stockItemName: z.string().nullable().optional(),
  matchStatus: z.enum(["learned", "fuzzy", "manual", "unmatched"]).optional().default("unmatched"),
  matchConfidence: z.number().optional().default(0),
  sourceType: z.enum(["manufacture", "procure"]).optional().default("manufacture"),
  rawData: z.record(z.string(), z.any()).optional(),
  notes: z.string().nullable().optional(),
});

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select()
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }
  return job;
}

async function requireOrderAccess(db: any, ctx: any, orderId: number) {
  const [row] = await db.select({ order: manufacturingOrders })
    .from(manufacturingOrders)
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingOrders.id, orderId))))
    .limit(1);
  if (!row?.order) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Manufacturing order not found" });
  }
  return row.order;
}

async function requireComponentOrderAccess(db: any, ctx: any, componentOrderId: number) {
  const [row] = await db.select({
    componentOrder: cmComponentOrders,
    job: constructionJobs,
  })
    .from(cmComponentOrders)
    .innerJoin(checkMeasureWorkbooks, eq(cmComponentOrders.workbookId, checkMeasureWorkbooks.id))
    .innerJoin(constructionJobs, eq(checkMeasureWorkbooks.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(cmComponentOrders.id, componentOrderId))))
    .limit(1);
  if (!row?.componentOrder || !row.job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Component order not found" });
  }
  return row;
}

async function requireTaskAccess(db: any, ctx: any, taskId: number) {
  const [row] = await db.select({ task: manufacturingTasks })
    .from(manufacturingTasks)
    .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingTasks.id, taskId))))
    .limit(1);
  if (!row?.task) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Manufacturing task not found" });
  }
  return row.task;
}

async function requireTaskIdsAccess(db: any, ctx: any, taskIds: number[]) {
  if (taskIds.length === 0) return;
  const rows = await db.select({ id: manufacturingTasks.id })
    .from(manufacturingTasks)
    .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, inArray(manufacturingTasks.id, taskIds))));
  if (rows.length !== new Set(taskIds).size) {
    throw new TRPCError({ code: "FORBIDDEN", message: "One or more tasks are outside this tenant" });
  }
}

async function requireScheduleAccess(db: any, ctx: any, scheduleId: number) {
  const [row] = await db.select({ schedule: manufacturingSchedule })
    .from(manufacturingSchedule)
    .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
    .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(manufacturingSchedule.id, scheduleId))))
    .limit(1);
  if (!row?.schedule) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Schedule entry not found" });
  }
  return row.schedule;
}

async function requirePurchaseOrderAccess(db: any, ctx: any, poId: number) {
  const [row] = await db.select({ po: manufacturingPurchaseOrders })
    .from(manufacturingPurchaseOrders)
    .leftJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
    .leftJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
    .where(and(...purchaseOrderTenantConditions(ctx, eq(manufacturingPurchaseOrders.id, poId))))
    .limit(1);
  if (!row?.po) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });
  }
  return row.po;
}

export const manufacturingRouter = router({
  // ─── Orders ────────────────────────────────────────────────────────────────
  orders: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const statusFilter = input?.status && input.status !== "all" ? input.status : null;
        const search = input?.search?.trim();
        const tenantId = tenantIdFromContext(ctx);
        if (!tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
        }
        const includeComponentOrders = !statusFilter || manufacturingOrderStatuses.has(statusFilter);
        const includeFlashingOrders = !statusFilter || flashingOrderStatuses.has(statusFilter);
        const includeTransitionOrders = !statusFilter || transitionOrderStatuses.has(statusFilter);

        const componentOrderRows = includeComponentOrders
          ? await db.select({
              id: manufacturingOrders.id,
              componentOrderId: manufacturingOrders.componentOrderId,
              jobId: manufacturingOrders.jobId,
              orderNumber: manufacturingOrders.orderNumber,
              clientName: manufacturingOrders.clientName,
              siteAddress: manufacturingOrders.siteAddress,
              status: manufacturingOrders.status,
              priority: manufacturingOrders.priority,
              targetDate: manufacturingOrders.targetDate,
              completedAt: manufacturingOrders.completedAt,
              notes: manufacturingOrders.notes,
              receivedByName: manufacturingOrders.receivedByName,
              receivedAt: manufacturingOrders.receivedAt,
              createdAt: manufacturingOrders.createdAt,
            }).from(manufacturingOrders)
              .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
              .where(and(...jobTenantConditions(
                ctx,
                ...(statusFilter ? [eq(manufacturingOrders.status, statusFilter as any)] : []),
              )))
              .orderBy(desc(manufacturingOrders.createdAt))
          : [];

        const flashingConditions: any[] = [eq(flashingOrders.tenantId, tenantId)];
        if (statusFilter) {
          flashingConditions.push(eq(flashingOrders.status, statusFilter as any));
        } else {
          flashingConditions.push(sql`${flashingOrders.status} NOT IN ('draft', 'archived')`);
        }
        if (search) {
          const pattern = `%${search.toLowerCase()}%`;
          flashingConditions.push(or(
            like(sql`LOWER(${flashingOrders.orderNumber})`, pattern),
            like(sql`LOWER(${flashingOrders.jobNumber})`, pattern),
            like(sql`LOWER(${flashingOrders.clientName})`, pattern),
            like(sql`LOWER(${flashingOrders.siteAddress})`, pattern),
            like(sql`LOWER(${flashingOrders.supplierName})`, pattern),
          )!);
        }

        const flashingOrderRows = includeFlashingOrders
          ? await db.select({
              id: flashingOrders.id,
              jobId: flashingOrders.jobId,
              orderNumber: flashingOrders.orderNumber,
              clientName: flashingOrders.clientName,
              siteAddress: flashingOrders.siteAddress,
              status: flashingOrders.status,
              priority: flashingOrders.priority,
              targetDate: flashingOrders.requestedDeliveryAt,
              completedAt: sql<Date | null>`NULL`,
              notes: flashingOrders.siteNotes,
              receivedByName: flashingOrders.supplierName,
              receivedAt: sql<Date>`COALESCE(${flashingOrders.submittedAt}, ${flashingOrders.updatedAt}, ${flashingOrders.createdAt})`,
              createdAt: flashingOrders.createdAt,
              lineCount: flashingOrders.lineCount,
              totalLinealMetres: flashingOrders.totalLinealMetres,
              totalExGst: flashingOrders.totalExGst,
            }).from(flashingOrders)
              .where(and(...flashingConditions))
              .orderBy(desc(flashingOrders.updatedAt))
          : [];

        const transitionConditions: any[] = [eq(manufacturingTransitionImports.tenantId, tenantId)];
        if (statusFilter) {
          transitionConditions.push(eq(manufacturingTransitionImports.status, statusFilter as any));
        } else {
          transitionConditions.push(sql`${manufacturingTransitionImports.status} NOT IN ('archived')`);
        }
        if (search) {
          const pattern = `%${search.toLowerCase()}%`;
          transitionConditions.push(or(
            like(sql`LOWER(${manufacturingTransitionImports.importNumber})`, pattern),
            like(sql`LOWER(${manufacturingTransitionImports.sourceFileName})`, pattern),
            like(sql`LOWER(${manufacturingTransitionImports.clientName})`, pattern),
            like(sql`LOWER(${manufacturingTransitionImports.siteAddress})`, pattern),
          )!);
        }

        const transitionOrderRows = includeTransitionOrders
          ? await db.select({
              id: manufacturingTransitionImports.id,
              orderNumber: manufacturingTransitionImports.importNumber,
              clientName: manufacturingTransitionImports.clientName,
              siteAddress: manufacturingTransitionImports.siteAddress,
              status: manufacturingTransitionImports.status,
              priority: manufacturingTransitionImports.priority,
              targetDate: sql<Date | null>`NULL`,
              completedAt: sql<Date | null>`NULL`,
              notes: manufacturingTransitionImports.notes,
              receivedByName: manufacturingTransitionImports.createdByName,
              receivedAt: sql<Date>`COALESCE(${manufacturingTransitionImports.updatedAt}, ${manufacturingTransitionImports.createdAt})`,
              createdAt: manufacturingTransitionImports.createdAt,
              lineCount: manufacturingTransitionImports.lineCount,
              matchedLineCount: manufacturingTransitionImports.matchedLineCount,
              sourceFileName: manufacturingTransitionImports.sourceFileName,
            }).from(manufacturingTransitionImports)
              .where(and(...transitionConditions))
              .orderBy(desc(manufacturingTransitionImports.updatedAt))
          : [];

        let orders = [
          ...componentOrderRows.map((order: any) => ({
            ...order,
            sourceType: "component" as const,
            sourceLabel: "Component order",
            sourceHref: `/manufacturing/orders/${order.id}`,
            lineCount: null,
            totalLinealMetres: null,
            totalExGst: null,
          })),
          ...flashingOrderRows.map((order: any) => ({
            ...order,
            componentOrderId: null,
            clientName: order.clientName || "Manual flashing order",
            sourceType: "flashing" as const,
            sourceLabel: "Flashing order",
            sourceHref: `/manufacturing/flashing-orders/${order.id}`,
          })),
          ...transitionOrderRows.map((order: any) => ({
            ...order,
            componentOrderId: null,
            jobId: null,
            clientName: order.clientName || order.sourceFileName || "Uploaded manufacturing order",
            sourceType: "transition" as const,
            sourceLabel: "Uploaded order",
            sourceHref: `/manufacturing/transition-assistant?importId=${order.id}`,
            totalLinealMetres: null,
            totalExGst: null,
          })),
        ];

        if (search) {
          const s = search.toLowerCase();
          orders = orders.filter((order: any) =>
            order.clientName?.toLowerCase().includes(s) ||
            order.orderNumber?.toLowerCase().includes(s) ||
            order.siteAddress?.toLowerCase().includes(s) ||
            order.receivedByName?.toLowerCase().includes(s)
          );
        }

        return orders.sort((a: any, b: any) => {
          const aTime = new Date(a.receivedAt || a.createdAt || 0).getTime();
          const bTime = new Date(b.receivedAt || b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const order = await requireOrderAccess(db, ctx, input.id);
        const tasks = await db.select().from(manufacturingTasks).where(eq(manufacturingTasks.orderId, input.id)).orderBy(asc(manufacturingTasks.category), asc(manufacturingTasks.productName));
        const schedule = await db.select().from(manufacturingSchedule).where(eq(manufacturingSchedule.orderId, input.id)).orderBy(asc(manufacturingSchedule.scheduledDate));
        const pos = await db.select().from(manufacturingPurchaseOrders).where(eq(manufacturingPurchaseOrders.orderId, input.id)).orderBy(desc(manufacturingPurchaseOrders.createdAt));
        return { ...order, tasks, schedule, purchaseOrders: pos };
      }),

    create: protectedProcedure
      .input(z.object({
        componentOrderId: z.number(),
        jobId: z.number(),
        clientName: z.string(),
        siteAddress: z.string().optional(),
        targetDate: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireJobAccess(db, ctx, input.jobId);
        const { componentOrder, job } = await requireComponentOrderAccess(db, ctx, input.componentOrderId);
        if (componentOrder.workbookId && job.id !== input.jobId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Component order does not belong to this job" });
        }
        // Generate order number
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingOrders);
        const orderNum = `MFG-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
        const [result] = await db.insert(manufacturingOrders).values({
          componentOrderId: input.componentOrderId,
          jobId: input.jobId,
          orderNumber: orderNum,
          clientName: input.clientName,
          siteAddress: input.siteAddress,
          status: "received",
          priority: input.priority || "normal",
          targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
          notes: input.notes,
          receivedBy: ctx.user.id,
          receivedByName: ctx.user.name,
        });
        return { id: result.insertId, orderNumber: orderNum };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["received", "in_production", "partially_complete", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();
        await db.update(manufacturingOrders).set(updates).where(eq(manufacturingOrders.id, input.id));
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        targetDate: z.string().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const { id, ...updates } = input;
        await requireOrderAccess(db, ctx, id);
        const setData: any = {};
        if (updates.targetDate !== undefined) setData.targetDate = updates.targetDate ? new Date(updates.targetDate) : null;
        if (updates.priority) setData.priority = updates.priority;
        if (updates.notes !== undefined) setData.notes = updates.notes;
        await db.update(manufacturingOrders).set(setData).where(eq(manufacturingOrders.id, id));
        return { success: true };
      }),

    // Receive a component order into manufacturing (auto-creates tasks from lineItems)
    receiveFromConstruction: protectedProcedure
      .input(z.object({ componentOrderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const { componentOrder: compOrder, job } = await requireComponentOrderAccess(db, ctx, input.componentOrderId);
        // Check if already received
        const existing = await db.select({ id: manufacturingOrders.id }).from(manufacturingOrders)
          .where(eq(manufacturingOrders.componentOrderId, input.componentOrderId));
        if (existing.length > 0) throw new Error("This component order has already been received into manufacturing");
        // Generate order number
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingOrders);
        const orderNum = `MFG-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
        // Create manufacturing order
        const [orderResult] = await db.insert(manufacturingOrders).values({
          componentOrderId: input.componentOrderId,
          jobId: job.id,
          orderNumber: orderNum,
          clientName: job.clientName,
          siteAddress: job.siteAddress || undefined,
          status: "received",
          priority: "normal",
          receivedBy: ctx.user.id,
          receivedByName: ctx.user.name,
        });
        const orderId = orderResult.insertId;
        // Parse lineItems from component order and create manufacturing tasks
        const lineItems = (compOrder.lineItems as any[]) || [];
        if (lineItems.length > 0) {
          const taskValues = lineItems.map((item: any) => ({
            orderId,
            productCode: item.code || item.productCode || null,
            productName: item.description || item.productName || item.name || "Unknown",
            category: item.category || item.type || null,
            colour: item.colour || item.color || null,
            colourGroup: item.colourGroup || null,
            quantity: item.qty || item.quantity || 1,
            unit: item.unit || "ea",
            length: item.length ? String(parseFloat(item.length)) : null,
            width: item.width ? String(parseFloat(item.width)) : null,
            description: item.notes || item.description || null,
            sourceType: (item.sourceType === "procure" ? "procure" : "manufacture") as "manufacture" | "procure",
            supplier: item.supplier || null,
            status: "pending" as const,
          }));
          await db.insert(manufacturingTasks).values(taskValues);
        }
        return { id: orderId, orderNumber: orderNum, tasksCreated: lineItems.length };
      }),
  }),

  // ─── Transition Assistant ─────────────────────────────────────────────────
  transitionAssistant: router({
    searchConstructionClients: protectedProcedure
      .input(z.object({
        query: z.string().trim().min(2),
        limit: z.number().int().min(1).max(25).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdOrThrow(ctx);
        const pattern = `%${input.query.toLowerCase()}%`;
        const rows = await db.select({
          id: constructionJobs.id,
          quoteNumber: constructionJobs.quoteNumber,
          storedClientName: constructionJobs.clientName,
          status: constructionJobs.status,
          siteAddress: constructionJobs.siteAddress,
          updatedAt: constructionJobs.updatedAt,
          leadId: crmLeads.id,
          leadFirstName: crmLeads.contactFirstName,
          leadLastName: crmLeads.contactLastName,
          leadCompany: crmLeads.company,
          leadPhone: crmLeads.contactPhone,
          leadEmail: crmLeads.contactEmail,
          leadAddress: crmLeads.contactAddress,
          leadClientNumber: crmLeads.clientNumber,
          leadStatus: crmLeads.status,
        }).from(constructionJobs)
          .leftJoin(crmLeads, and(
            eq(constructionJobs.leadId, crmLeads.id),
            tenantScoped(crmLeads.tenantId, tenantId),
          ))
          .where(and(
            ...jobTenantConditions(
              ctx,
              or(
                like(sql`LOWER(${constructionJobs.clientName})`, pattern),
                like(sql`LOWER(${constructionJobs.quoteNumber})`, pattern),
                like(sql`LOWER(${constructionJobs.siteAddress})`, pattern),
                like(sql`LOWER(${crmLeads.clientNumber})`, pattern),
                like(sql`LOWER(${crmLeads.contactFirstName})`, pattern),
                like(sql`LOWER(${crmLeads.contactLastName})`, pattern),
                like(sql`LOWER(${crmLeads.company})`, pattern),
                like(sql`LOWER(${crmLeads.contactEmail})`, pattern),
                like(sql`LOWER(${crmLeads.contactPhone})`, pattern),
                like(sql`LOWER(${crmLeads.contactAddress})`, pattern),
              )!,
            ),
          ))
          .orderBy(desc(constructionJobs.updatedAt))
          .limit(input.limit || 12);

        return rows.map((row) => {
          const canonicalClient = canonicalClientFromLead({
            id: row.leadId,
            contactFirstName: row.leadFirstName,
            contactLastName: row.leadLastName,
            company: row.leadCompany,
            contactPhone: row.leadPhone,
            contactEmail: row.leadEmail,
            contactAddress: row.leadAddress,
            clientNumber: row.leadClientNumber,
            status: row.leadStatus,
          });
          const clientName = canonicalClient?.name || row.storedClientName;
          return {
            id: row.id,
            quoteNumber: row.quoteNumber,
            clientName,
            storedClientName: row.storedClientName,
            clientNumber: canonicalClient?.clientNumber || null,
            siteAddress: row.siteAddress || canonicalClient?.address || null,
            contactPhone: canonicalClient?.phone || null,
            contactEmail: canonicalClient?.email || null,
            status: row.status,
          };
        });
      }),

    previewUpload: protectedProcedure
      .input(z.object({
        filename: z.string().min(1),
        base64: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const extension = input.filename.split(".").pop()?.toLowerCase();
        if (!extension || !["xlsm", "xlsx", "xls"].includes(extension)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Upload an Excel workbook: .xlsm, .xlsx, or .xls." });
        }
        const encoded = input.base64.includes(",") ? input.base64.split(",").pop() || "" : input.base64;
        const buffer = Buffer.from(encoded, "base64");
        if (!buffer.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded workbook is empty." });
        }
        if (buffer.length > 15 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Workbook is too large. Keep transition uploads under 15 MB." });
        }

        const parsed = parseTransitionWorkbook({ buffer, filename: input.filename });
        const rows = await matchTransitionRows(db, ctx, parsed.rows);
        return {
          filename: input.filename,
          worksheetName: parsed.worksheetName,
          headerRow: parsed.headerRow,
          rows,
          summary: {
            totalRows: rows.length,
            matchedRows: rows.filter((row: any) => row.stockItemId).length,
            learnedRows: rows.filter((row: any) => row.matchStatus === "learned").length,
            unmatchedRows: rows.filter((row: any) => !row.stockItemId).length,
          },
        };
      }),

    listImports: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const conditions = transitionImportTenantConditions(ctx);
        if (input?.status && input.status !== "all") {
          conditions.push(eq(manufacturingTransitionImports.status, input.status as any));
        }
        if (input?.search?.trim()) {
          const pattern = `%${input.search.trim().toLowerCase()}%`;
          conditions.push(or(
            like(sql`LOWER(${manufacturingTransitionImports.importNumber})`, pattern),
            like(sql`LOWER(${manufacturingTransitionImports.sourceFileName})`, pattern),
            like(sql`LOWER(${manufacturingTransitionImports.clientName})`, pattern),
            like(sql`LOWER(${manufacturingTransitionImports.siteAddress})`, pattern),
          )!);
        }
        const db = await requireDb();
        return db.select().from(manufacturingTransitionImports)
          .where(and(...conditions))
          .orderBy(desc(manufacturingTransitionImports.updatedAt))
          .limit(50);
      }),

    getImport: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const importRow = await requireTransitionImportAccess(db, ctx, input.id);
        const rows = await db.select().from(manufacturingTransitionImportRows)
          .where(and(
            eq(manufacturingTransitionImportRows.importId, input.id),
            eq(manufacturingTransitionImportRows.tenantId, importRow.tenantId),
          ))
          .orderBy(asc(manufacturingTransitionImportRows.rowNumber));
        return { import: importRow, rows };
      }),

    commitImport: protectedProcedure
      .input(z.object({
        filename: z.string().min(1),
        worksheetName: z.string().nullable().optional(),
        clientName: z.string().nullable().optional(),
        siteAddress: z.string().nullable().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
        notes: z.string().nullable().optional(),
        rows: z.array(transitionRowInput).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdOrThrow(ctx);
        const stockIds = input.rows.reduce<number[]>((ids, row) => {
          if (row.stockItemId && !ids.includes(row.stockItemId)) ids.push(row.stockItemId);
          return ids;
        }, []);
        const stockMap = await stockItemsById(db, ctx, stockIds);
        if (stockMap.size !== stockIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "One or more selected stock items are outside this tenant." });
        }

        const importNumber = await nextTransitionImportNumber(db, tenantId);
        const normalizedRows = input.rows.map((row) => {
          const stockItem = row.stockItemId ? stockMap.get(row.stockItemId) : null;
          const stockItemId = stockItem?.id ?? null;
          const matchStatus: "learned" | "fuzzy" | "manual" | "unmatched" = stockItemId
            ? (row.matchStatus === "manual" ? "manual" : row.matchStatus === "learned" ? "learned" : "fuzzy")
            : "unmatched";
          return {
            ...row,
            rawProductKey: row.rawProductKey || rawProductKey({
              productCode: row.rawProductCode,
              productName: row.rawProductName,
              description: row.rawDescription,
            }),
            stockItemId,
            stockItemCode: stockItem?.code ?? row.stockItemCode ?? null,
            stockItemName: stockItem?.name ?? row.stockItemName ?? null,
            matchStatus,
            matchConfidence: stockItemId ? Math.max(Number(row.matchConfidence || 0), matchStatus === "manual" ? 100 : 80) : 0,
          };
        });

        const [result] = await db.insert(manufacturingTransitionImports).values({
          tenantId,
          importNumber,
          sourceFileName: input.filename,
          worksheetName: input.worksheetName || null,
          clientName: input.clientName?.trim() || null,
          siteAddress: input.siteAddress?.trim() || null,
          status: normalizedRows.some((row) => !row.stockItemId) ? "in_review" : "imported",
          priority: input.priority,
          lineCount: normalizedRows.length,
          matchedLineCount: normalizedRows.filter((row) => row.stockItemId).length,
          notes: input.notes?.trim() || null,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name || ctx.user.email || "Unknown",
        });
        const importId = result.insertId;

        const rowValues: Array<typeof manufacturingTransitionImportRows.$inferInsert> = normalizedRows.map((row) => ({
          tenantId,
          importId,
          rowNumber: row.rowNumber,
          rawProductKey: row.rawProductKey || null,
          rawProductCode: row.rawProductCode || null,
          rawProductName: row.rawProductName,
          rawDescription: row.rawDescription || null,
          rawCategory: row.rawCategory || null,
          rawColour: row.rawColour || null,
          rawUnit: row.rawUnit || null,
          quantity: String(row.quantity ?? 1),
          length: row.length == null ? null : String(row.length),
          width: row.width == null ? null : String(row.width),
          stockItemId: row.stockItemId,
          stockItemCode: row.stockItemCode || null,
          stockItemName: row.stockItemName || null,
          matchStatus: row.matchStatus,
          matchConfidence: String(row.matchConfidence || 0),
          sourceType: row.sourceType || "manufacture",
          rawData: row.rawData || {},
          notes: row.notes || null,
        }));

        for (let index = 0; index < rowValues.length; index += 300) {
          await db.insert(manufacturingTransitionImportRows).values(rowValues.slice(index, index + 300));
        }

        await rememberProductMappings(db, ctx, normalizedRows);
        return { id: importId, importNumber };
      }),

    updateRowMatch: protectedProcedure
      .input(z.object({
        rowId: z.number(),
        stockItemId: z.number().nullable(),
        sourceType: z.enum(["manufacture", "procure"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdOrThrow(ctx);
        const { import: importRow, importRow: row } = await requireTransitionRowAccess(db, ctx, input.rowId);
        let stockItem: any = null;
        if (input.stockItemId) {
          const stockMap = await stockItemsById(db, ctx, [input.stockItemId]);
          stockItem = stockMap.get(input.stockItemId);
          if (!stockItem) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Selected stock item is outside this tenant." });
          }
        }

        const updated = {
          stockItemId: stockItem?.id ?? null,
          stockItemCode: stockItem?.code ?? null,
          stockItemName: stockItem?.name ?? null,
          matchStatus: stockItem ? "manual" as const : "unmatched" as const,
          matchConfidence: stockItem ? "100" : "0",
          sourceType: input.sourceType || row.sourceType,
          updatedAt: new Date(),
        };
        await db.update(manufacturingTransitionImportRows)
          .set(updated)
          .where(and(
            eq(manufacturingTransitionImportRows.id, input.rowId),
            eq(manufacturingTransitionImportRows.tenantId, tenantId),
          ));

        if (stockItem) {
          await rememberProductMappings(db, ctx, [{
            ...row,
            stockItemId: stockItem.id,
            stockItemCode: stockItem.code,
            stockItemName: stockItem.name,
            matchStatus: "manual",
            matchConfidence: 100,
          }]);
        }
        await refreshTransitionImportCounts(db, tenantId, importRow.id);
        return { success: true };
      }),

    deleteRow: protectedProcedure
      .input(z.object({ rowId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdOrThrow(ctx);
        const { import: importRow } = await requireTransitionRowAccess(db, ctx, input.rowId);
        await db.delete(manufacturingTransitionImportRows)
          .where(and(
            eq(manufacturingTransitionImportRows.id, input.rowId),
            eq(manufacturingTransitionImportRows.tenantId, tenantId),
          ));
        await refreshTransitionImportCounts(db, tenantId, importRow.id);
        return { success: true };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["imported", "in_review", "accepted", "cancelled", "archived"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const tenantId = tenantIdOrThrow(ctx);
        await requireTransitionImportAccess(db, ctx, input.id);
        await db.update(manufacturingTransitionImports)
          .set({ status: input.status, updatedAt: new Date() })
          .where(and(
            eq(manufacturingTransitionImports.tenantId, tenantId),
            eq(manufacturingTransitionImports.id, input.id),
          ));
        return { success: true };
      }),
  }),

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure
      .input(z.object({
        orderId: z.number().optional(),
        status: z.string().optional(),
        category: z.string().optional(),
        sourceType: z.enum(["manufacture", "procure"]).optional(),
        branchId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
          conditions.push(eq(manufacturingTasks.orderId, input.orderId));
        }
        if (input?.status && input.status !== "all") conditions.push(eq(manufacturingTasks.status, input.status as any));
        if (input?.category) conditions.push(eq(manufacturingTasks.category, input.category));
        if (input?.sourceType) conditions.push(eq(manufacturingTasks.sourceType, input.sourceType));
        if (input?.branchId) conditions.push(eq(manufacturingTasks.branchId, input.branchId));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingTasks.id,
          orderId: manufacturingTasks.orderId,
          productCode: manufacturingTasks.productCode,
          productName: manufacturingTasks.productName,
          category: manufacturingTasks.category,
          colour: manufacturingTasks.colour,
          colourGroup: manufacturingTasks.colourGroup,
          quantity: manufacturingTasks.quantity,
          unit: manufacturingTasks.unit,
          length: manufacturingTasks.length,
          width: manufacturingTasks.width,
          description: manufacturingTasks.description,
          sourceType: manufacturingTasks.sourceType,
          supplier: manufacturingTasks.supplier,
          status: manufacturingTasks.status,
          scheduledDate: manufacturingTasks.scheduledDate,
          completedAt: manufacturingTasks.completedAt,
          branchId: manufacturingTasks.branchId,
          branchName: manufacturingTasks.branchName,
          notes: manufacturingTasks.notes,
          qrToken: manufacturingTasks.qrToken,
          createdAt: manufacturingTasks.createdAt,
          updatedAt: manufacturingTasks.updatedAt,
        }).from(manufacturingTasks)
          .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(manufacturingTasks.category), asc(manufacturingTasks.productName));
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "scheduled", "in_progress", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireTaskAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();
        await db.update(manufacturingTasks).set(updates).where(eq(manufacturingTasks.id, input.id));
        return { success: true };
      }),

    assignBranch: protectedProcedure
      .input(z.object({
        taskIds: z.array(z.number()),
        branchId: z.number(),
        branchName: z.string(),
        scheduledDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireTaskIdsAccess(db, ctx, input.taskIds);
        const updates: any = { branchId: input.branchId, branchName: input.branchName };
        if (input.scheduledDate) {
          updates.scheduledDate = new Date(input.scheduledDate);
          updates.status = "scheduled";
        }
        await db.update(manufacturingTasks).set(updates).where(inArray(manufacturingTasks.id, input.taskIds));
        return { success: true };
      }),

    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        taskIds: z.array(z.number()),
        status: z.enum(["pending", "scheduled", "in_progress", "completed", "on_hold", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireTaskIdsAccess(db, ctx, input.taskIds);
        const updates: any = { status: input.status };
        if (input.status === "completed") updates.completedAt = new Date();
        await db.update(manufacturingTasks).set(updates).where(inArray(manufacturingTasks.id, input.taskIds));
        return { success: true };
      }),

    // Group tasks by product/category/colour for material grouping view
    grouped: protectedProcedure
      .input(z.object({ orderId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
          conditions.push(eq(manufacturingTasks.orderId, input.orderId));
        }
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const tasks = await db.select({
          category: manufacturingTasks.category,
          colour: manufacturingTasks.colour,
          colourGroup: manufacturingTasks.colourGroup,
          productName: manufacturingTasks.productName,
          productCode: manufacturingTasks.productCode,
          sourceType: manufacturingTasks.sourceType,
          totalQty: sql<number>`SUM(${manufacturingTasks.quantity})`,
          pendingQty: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} IN ('pending','scheduled') THEN ${manufacturingTasks.quantity} ELSE 0 END)`,
          completedQty: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} = 'completed' THEN ${manufacturingTasks.quantity} ELSE 0 END)`,
          taskCount: sql<number>`COUNT(*)`,
        }).from(manufacturingTasks)
          .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .groupBy(manufacturingTasks.category, manufacturingTasks.colour, manufacturingTasks.colourGroup, manufacturingTasks.productName, manufacturingTasks.productCode, manufacturingTasks.sourceType);
        return tasks;
      }),
  }),

  // ─── Schedule / Calendar ───────────────────────────────────────────────────
  schedule: router({
    list: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        branchId: z.number().optional(),
        status: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [
          gte(manufacturingSchedule.scheduledDate, new Date(input.startDate)),
          lte(manufacturingSchedule.scheduledDate, new Date(input.endDate)),
        ];
        if (input.branchId) conditions.push(eq(manufacturingSchedule.branchId, input.branchId));
        if (input.status && input.status !== "all") conditions.push(eq(manufacturingSchedule.status, input.status as any));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingSchedule.id,
          taskId: manufacturingSchedule.taskId,
          orderId: manufacturingSchedule.orderId,
          constructionScheduleEventId: manufacturingSchedule.constructionScheduleEventId,
          branchId: manufacturingSchedule.branchId,
          branchName: manufacturingSchedule.branchName,
          scheduledDate: manufacturingSchedule.scheduledDate,
          scheduledEndDate: manufacturingSchedule.scheduledEndDate,
          title: manufacturingSchedule.title,
          description: manufacturingSchedule.description,
          status: manufacturingSchedule.status,
          assignedTo: manufacturingSchedule.assignedTo,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
        }).from(manufacturingSchedule)
          .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(and(...conditions))
          .orderBy(asc(manufacturingSchedule.scheduledDate));
      }),

    create: protectedProcedure
      .input(z.object({
        taskId: z.number().optional(),
        orderId: z.number(),
        branchId: z.number(),
        branchName: z.string(),
        scheduledDate: z.string(),
        scheduledEndDate: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        assignedTo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        await requireOrderAccess(db, ctx, input.orderId);
        if (input.taskId) {
          const task = await requireTaskAccess(db, ctx, input.taskId);
          if (task.orderId !== input.orderId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Task does not belong to this manufacturing order" });
          }
        }
        const [result] = await db.insert(manufacturingSchedule).values({
          taskId: input.taskId,
          orderId: input.orderId,
          branchId: input.branchId,
          branchName: input.branchName,
          scheduledDate: new Date(input.scheduledDate),
          scheduledEndDate: input.scheduledEndDate ? new Date(input.scheduledEndDate) : undefined,
          title: input.title,
          description: input.description,
          assignedTo: input.assignedTo,
          createdBy: ctx.user.id,
        });
        return { id: result.insertId };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireScheduleAccess(db, ctx, input.id);
        await db.update(manufacturingSchedule).set({ status: input.status }).where(eq(manufacturingSchedule.id, input.id));
        return { success: true };
      }),

    reschedule: protectedProcedure
      .input(z.object({
        id: z.number(),
        scheduledDate: z.string(),
        scheduledEndDate: z.string().optional(),
        branchId: z.number().optional(),
        branchName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireScheduleAccess(db, ctx, input.id);
        const setData: any = { scheduledDate: new Date(input.scheduledDate) };
        if (input.scheduledEndDate) setData.scheduledEndDate = new Date(input.scheduledEndDate);
        if (input.branchId) setData.branchId = input.branchId;
        if (input.branchName) setData.branchName = input.branchName;
        await db.update(manufacturingSchedule).set(setData).where(eq(manufacturingSchedule.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requireScheduleAccess(db, ctx, input.id);
        await db.delete(manufacturingSchedule).where(eq(manufacturingSchedule.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Purchase Orders ───────────────────────────────────────────────────────
  purchaseOrders: router({
    list: protectedProcedure
      .input(z.object({
        orderId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
          conditions.push(eq(manufacturingPurchaseOrders.orderId, input.orderId));
        }
        if (input?.status && input.status !== "all") conditions.push(eq(manufacturingPurchaseOrders.status, input.status as any));
        conditions.push(...purchaseOrderTenantConditions(ctx));
        return db.select({
          id: manufacturingPurchaseOrders.id,
          tenantId: manufacturingPurchaseOrders.tenantId,
          orderId: manufacturingPurchaseOrders.orderId,
          poNumber: manufacturingPurchaseOrders.poNumber,
          supplier: manufacturingPurchaseOrders.supplier,
          supplierEmail: manufacturingPurchaseOrders.supplierEmail,
          supplierPhone: manufacturingPurchaseOrders.supplierPhone,
          supplierAddress: manufacturingPurchaseOrders.supplierAddress,
          supplierAbn: manufacturingPurchaseOrders.supplierAbn,
          deliverToBranchId: manufacturingPurchaseOrders.deliverToBranchId,
          deliverToBranchName: manufacturingPurchaseOrders.deliverToBranchName,
          deliverToAddress: manufacturingPurchaseOrders.deliverToAddress,
          status: manufacturingPurchaseOrders.status,
          lineItems: manufacturingPurchaseOrders.lineItems,
          totalAmount: manufacturingPurchaseOrders.totalAmount,
          requiredByDate: manufacturingPurchaseOrders.requiredByDate,
          issuedAt: manufacturingPurchaseOrders.issuedAt,
          receivedAt: manufacturingPurchaseOrders.receivedAt,
          createdByName: manufacturingPurchaseOrders.createdByName,
          createdAt: manufacturingPurchaseOrders.createdAt,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
        }).from(manufacturingPurchaseOrders)
          .leftJoin(manufacturingOrders, eq(manufacturingPurchaseOrders.orderId, manufacturingOrders.id))
          .leftJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(manufacturingPurchaseOrders.createdAt));
      }),

    create: protectedProcedure
      .input(z.object({
        orderId: z.number().nullable().optional(),
        supplier: z.string(),
        supplierEmail: z.string().optional(),
        supplierPhone: z.string().optional(),
        supplierAddress: z.string().optional(),
        supplierAbn: z.string().optional(),
        deliverToBranchId: z.number().nullable().optional(),
        deliverToBranchName: z.string().optional(),
        deliverToAddress: z.string().optional(),
        lineItems: z.array(z.object({
          productName: z.string(),
          productCode: z.string().optional(),
          quantity: z.number(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalPrice: z.number().optional(),
          colour: z.string().optional(),
          description: z.string().optional(),
        })),
        totalAmount: z.number().optional(),
        requiredByDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        if (input.orderId) {
          await requireOrderAccess(db, ctx, input.orderId);
        }
        // Generate PO number
        const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(manufacturingPurchaseOrders);
        const poNum = `MPO-${String((countResult?.count || 0) + 1).padStart(5, "0")}`;
        const [result] = await db.insert(manufacturingPurchaseOrders).values({
          tenantId: tenantIdFromContext(ctx),
          orderId: input.orderId ?? null,
          poNumber: poNum,
          supplier: input.supplier,
          supplierEmail: input.supplierEmail,
          supplierPhone: input.supplierPhone,
          supplierAddress: input.supplierAddress,
          supplierAbn: input.supplierAbn,
          deliverToBranchId: input.deliverToBranchId ?? null,
          deliverToBranchName: input.deliverToBranchName,
          deliverToAddress: input.deliverToAddress,
          status: "draft",
          lineItems: input.lineItems,
          totalAmount: input.totalAmount?.toString(),
          requiredByDate: input.requiredByDate ? new Date(input.requiredByDate) : undefined,
          notes: input.notes,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name,
        });
        return { id: result.insertId, poNumber: poNum };
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        return requirePurchaseOrderAccess(db, ctx, input.id);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "issued", "confirmed", "partially_received", "received", "paid", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.id);
        const updates: any = { status: input.status };
        if (input.status === "issued") updates.issuedAt = new Date();
        if (input.status === "received") updates.receivedAt = new Date();
        await db.update(manufacturingPurchaseOrders).set(updates).where(eq(manufacturingPurchaseOrders.id, input.id));
        return { success: true };
      }),

    updateLineItems: protectedProcedure
      .input(z.object({
        id: z.number(),
        lineItems: z.array(z.object({
          productName: z.string(),
          productCode: z.string().optional(),
          quantity: z.number(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalPrice: z.number().optional(),
          colour: z.string().optional(),
          description: z.string().optional(),
        })),
        totalAmount: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.id);
        const setData: any = { lineItems: input.lineItems };
        if (input.totalAmount !== undefined) setData.totalAmount = input.totalAmount.toString();
        await db.update(manufacturingPurchaseOrders).set(setData).where(eq(manufacturingPurchaseOrders.id, input.id));
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        supplier: z.string().optional(),
        supplierEmail: z.string().optional(),
        supplierPhone: z.string().optional(),
        supplierAddress: z.string().optional(),
        supplierAbn: z.string().optional(),
        deliverToBranchId: z.number().nullable().optional(),
        deliverToBranchName: z.string().nullable().optional(),
        deliverToAddress: z.string().nullable().optional(),
        requiredByDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const { id, ...updates } = input;
        await requirePurchaseOrderAccess(db, ctx, id);
        const setData: any = {};
        if (updates.supplier !== undefined) setData.supplier = updates.supplier;
        if (updates.supplierEmail !== undefined) setData.supplierEmail = updates.supplierEmail;
        if (updates.supplierPhone !== undefined) setData.supplierPhone = updates.supplierPhone;
        if (updates.supplierAddress !== undefined) setData.supplierAddress = updates.supplierAddress;
        if (updates.supplierAbn !== undefined) setData.supplierAbn = updates.supplierAbn;
        if (updates.deliverToBranchId !== undefined) setData.deliverToBranchId = updates.deliverToBranchId;
        if (updates.deliverToBranchName !== undefined) setData.deliverToBranchName = updates.deliverToBranchName;
        if (updates.deliverToAddress !== undefined) setData.deliverToAddress = updates.deliverToAddress;
        if (updates.requiredByDate !== undefined) setData.requiredByDate = updates.requiredByDate ? new Date(updates.requiredByDate) : null;
        if (updates.notes !== undefined) setData.notes = updates.notes;
        if (Object.keys(setData).length > 0) {
          await db.update(manufacturingPurchaseOrders).set(setData).where(eq(manufacturingPurchaseOrders.id, id));
        }
        return { success: true };
      }),
  }),

  // ─── Reports ───────────────────────────────────────────────────────────────
  reports: router({
    productionSchedule: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        branchId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [
          gte(manufacturingSchedule.scheduledDate, new Date(input.startDate)),
          lte(manufacturingSchedule.scheduledDate, new Date(input.endDate)),
        ];
        if (input.branchId) conditions.push(eq(manufacturingSchedule.branchId, input.branchId));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingSchedule.id,
          branchName: manufacturingSchedule.branchName,
          scheduledDate: manufacturingSchedule.scheduledDate,
          title: manufacturingSchedule.title,
          status: manufacturingSchedule.status,
          assignedTo: manufacturingSchedule.assignedTo,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
          orderStatus: manufacturingOrders.status,
        }).from(manufacturingSchedule)
          .innerJoin(manufacturingOrders, eq(manufacturingSchedule.orderId, manufacturingOrders.id))
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(and(...conditions))
          .orderBy(asc(manufacturingSchedule.scheduledDate), asc(manufacturingSchedule.branchName));
      }),

    jobsByStatus: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select({
        status: manufacturingOrders.status,
        count: sql<number>`COUNT(*)`,
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)))
        .groupBy(manufacturingOrders.status);
    }),

    jobsByTargetDate: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        const conditions: any[] = [];
        if (input?.startDate) conditions.push(gte(manufacturingOrders.targetDate, new Date(input.startDate)));
        if (input?.endDate) conditions.push(lte(manufacturingOrders.targetDate, new Date(input.endDate)));
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        return db.select({
          id: manufacturingOrders.id,
          orderNumber: manufacturingOrders.orderNumber,
          clientName: manufacturingOrders.clientName,
          status: manufacturingOrders.status,
          priority: manufacturingOrders.priority,
          targetDate: manufacturingOrders.targetDate,
          createdAt: manufacturingOrders.createdAt,
        }).from(manufacturingOrders)
          .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(manufacturingOrders.targetDate));
      }),

    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const [orderStats] = await db.select({
        totalOrders: sql<number>`COUNT(*)`,
        inProduction: sql<number>`SUM(CASE WHEN ${manufacturingOrders.status} IN ('received','in_production','partially_complete') THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${manufacturingOrders.status} = 'completed' THEN 1 ELSE 0 END)`,
        overdue: sql<number>`SUM(CASE WHEN ${manufacturingOrders.status} IN ('received','in_production','partially_complete') AND ${manufacturingOrders.targetDate} < NOW() THEN 1 ELSE 0 END)`,
      }).from(manufacturingOrders)
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)));
      const [taskStats] = await db.select({
        totalTasks: sql<number>`COUNT(*)`,
        pendingTasks: sql<number>`SUM(CASE WHEN ${manufacturingTasks.status} IN ('pending','scheduled','in_progress') THEN 1 ELSE 0 END)`,
      }).from(manufacturingTasks)
        .innerJoin(manufacturingOrders, eq(manufacturingTasks.orderId, manufacturingOrders.id))
        .innerJoin(constructionJobs, eq(manufacturingOrders.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx)));
      return {
        totalOrders: orderStats?.totalOrders || 0,
        inProduction: orderStats?.inProduction || 0,
        completed: orderStats?.completed || 0,
        overdue: orderStats?.overdue || 0,
        totalTasks: taskStats?.totalTasks || 0,
        pendingTasks: taskStats?.pendingTasks || 0,
      };
    }),
  }),

  // ─── Branches (for dropdown) ───────────────────────────────────────────────
  branches: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(and(...await branchTenantConditions(ctx, eq(branches.isActive, true))))
      .orderBy(asc(branches.name));
  }),

  // ─── Xero PO Sync ─────────────────────────────────────────────────────────
  xeroSync: router({
    syncPO: protectedProcedure
      .input(z.object({ poId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const po = await requirePurchaseOrderAccess(db, ctx, input.poId);
        // Dynamically import xero-client to avoid circular deps
        const { getXeroContacts, createXeroContact, createXeroPurchaseOrder, getValidAccessToken } = await import("./xero-client");
        const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "manufacturing" });
        if (!auth) throw new Error("No active Xero connection. Please connect to Xero first.");
        const routing = { connectionId: auth.xeroConnectionId };
        // Find or create supplier contact in Xero
        let xeroContactId = po.xeroContactId;
        if (!xeroContactId) {
          const contactSearch = await getXeroContacts({ where: `Name=="${po.supplier.replace(/"/g, "\\\"")}"` }, routing);
          if (contactSearch.Contacts && contactSearch.Contacts.length > 0) {
            xeroContactId = contactSearch.Contacts[0].ContactID;
          } else {
            const newContact = await createXeroContact({
              Name: po.supplier,
              EmailAddress: po.supplierEmail || undefined,
              IsSupplier: true,
            }, routing);
            xeroContactId = newContact.Contacts[0].ContactID;
          }
          await db.update(manufacturingPurchaseOrders).set({ xeroContactId }).where(eq(manufacturingPurchaseOrders.id, input.poId));
        }
        // Build Xero PO line items
        const lineItems = (po.lineItems as any[]) || [];
        const xeroLineItems = lineItems.map((item: any) => ({
          Description: `${item.productName}${item.colour ? ` (${item.colour})` : ""}${item.description ? ` - ${item.description}` : ""}`,
          Quantity: item.quantity || 1,
          UnitAmount: item.unitPrice || 0,
          AccountCode: "300", // Default purchases account
        }));
        // Create PO in Xero
        const xeroResult = await createXeroPurchaseOrder({
          Contact: { ContactID: xeroContactId },
          PurchaseOrderNumber: po.poNumber || undefined,
          LineItems: xeroLineItems,
          Date: new Date().toISOString().split("T")[0],
          DeliveryDate: po.requiredByDate ? new Date(po.requiredByDate).toISOString().split("T")[0] : undefined,
          Reference: `Manufacturing PO - ${po.poNumber}`,
          Status: "DRAFT",
        }, routing);
        const xeroPO = xeroResult.PurchaseOrders?.[0];
        if (xeroPO?.PurchaseOrderID) {
          await db.update(manufacturingPurchaseOrders).set({
            xeroPoId: xeroPO.PurchaseOrderID,
            xeroSyncedAt: new Date(),
          }).where(eq(manufacturingPurchaseOrders.id, input.poId));
        }
        return { success: true, xeroPoId: xeroPO?.PurchaseOrderID };
      }),

    getSyncStatus: protectedProcedure
      .input(z.object({ poId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();
        await requirePurchaseOrderAccess(db, ctx, input.poId);
        const [po] = await db.select({
          xeroPoId: manufacturingPurchaseOrders.xeroPoId,
          xeroContactId: manufacturingPurchaseOrders.xeroContactId,
          xeroSyncedAt: manufacturingPurchaseOrders.xeroSyncedAt,
        }).from(manufacturingPurchaseOrders).where(eq(manufacturingPurchaseOrders.id, input.poId));
        return po || null;
      }),
  }),

  // ─── Notify completion ─────────────────────────────────────────────────────
  notifyCompletion: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const order = await requireOrderAccess(db, ctx, input.orderId);
      await notifyOwner({
        title: `Manufacturing Order ${order.orderNumber} Completed`,
        content: input.message || `Manufacturing order ${order.orderNumber} for ${order.clientName} has been completed and is ready for dispatch.`,
      });
      return { success: true };
    }),
});
