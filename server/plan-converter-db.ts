import { getDb } from "./db";
import { planConversions, planConversionElements, productImages } from "../drizzle/schema";
import { eq, desc, and, like, or, sql, inArray } from "drizzle-orm";

export async function listPlanConversions(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(planConversions.userId, userId)];
  if (tenantId) conditions.push(eq(planConversions.tenantId, tenantId));
  return db.select().from(planConversions).where(and(...conditions)).orderBy(desc(planConversions.updatedAt));
}

export async function listAllPlanConversions(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(planConversions).$dynamic();
  if (tenantId) {
    query = query.where(eq(planConversions.tenantId, tenantId));
  }
  return query.orderBy(desc(planConversions.updatedAt));
}

export async function listPlanConversionsByJob(jobId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(planConversions.jobId, jobId)];
  if (tenantId) conditions.push(eq(planConversions.tenantId, tenantId));
  return db.select().from(planConversions).where(and(...conditions)).orderBy(desc(planConversions.updatedAt));
}

export async function getPlanConversion(id: number, userId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(planConversions.id, id)];
  if (userId) conditions.push(eq(planConversions.userId, userId));
  if (tenantId) conditions.push(eq(planConversions.tenantId, tenantId));
  const result = await db.select().from(planConversions).where(and(...conditions)).limit(1);
  return result[0] || null;
}

export async function createPlanConversion(data: {
  tenantId?: number;
  userId: number;
  projectTitle: string;
  diagramType: "floor_plan" | "elevation_front" | "elevation_side" | "elevation_rear";
  clientName?: string;
  siteAddress?: string;
  jobId?: number;
  scale?: string;
  drawnBy?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(planConversions).values(data);
  return { id: result[0].insertId };
}

export async function updatePlanConversion(id: number, data: Partial<{
  clientName: string;
  siteAddress: string;
  projectTitle: string;
  diagramType: "floor_plan" | "elevation_front" | "elevation_side" | "elevation_rear";
  scale: string;
  status: "uploaded" | "extracting" | "review" | "confirmed" | "generated";
  uploadedImageUrl: string;
  uploadedImageKey: string;
  extractedData: any;
  confirmedData: any;
  generatedPdfUrl: string;
  generatedPdfKey: string;
  notes: string;
  drawnBy: string;
  revision: string;
  jobId: number;
}>, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(planConversions.id, id)];
  if (tenantId) conditions.push(eq(planConversions.tenantId, tenantId));
  await db.update(planConversions).set(data).where(and(...conditions));
}

export async function deletePlanConversion(id: number, userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conversion = await getPlanConversion(id, userId, tenantId);
  if (!conversion) return false;
  await db.delete(planConversionElements).where(eq(planConversionElements.conversionId, id));
  const conditions = [eq(planConversions.id, id), eq(planConversions.userId, userId)];
  if (tenantId) conditions.push(eq(planConversions.tenantId, tenantId));
  const result = await db.delete(planConversions).where(and(...conditions));
  return result[0].affectedRows > 0;
}

export async function adminDeletePlanConversion(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (tenantId) {
    const conversion = await getPlanConversion(id, undefined, tenantId);
    if (!conversion) return false;
  }
  await db.delete(planConversionElements).where(eq(planConversionElements.conversionId, id));
  const conditions = [eq(planConversions.id, id)];
  if (tenantId) conditions.push(eq(planConversions.tenantId, tenantId));
  await db.delete(planConversions).where(and(...conditions));
  return true;
}

export async function getConversionElements(conversionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(planConversionElements)
    .where(eq(planConversionElements.conversionId, conversionId))
    .orderBy(planConversionElements.sortOrder);
}

export async function setConversionElements(conversionId: number, elements: Array<{
  elementType: "post" | "beam" | "wall_existing" | "wall_new" | "opening" | "dimension" | "annotation" | "roof_line" | "gutter" | "fascia";
  elementNumber?: string;
  label?: string;
  size?: string;
  material?: string;
  colour?: string;
  connectionType?: string | null;
  bracketCode?: string | null;
  bracketName?: string | null;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  rotation?: number;
  metadata?: any;
  sortOrder?: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(planConversionElements).where(eq(planConversionElements.conversionId, conversionId));
  if (elements.length > 0) {
    await db.insert(planConversionElements).values(
      elements.map((el, idx) => ({
        conversionId,
        ...el,
        sortOrder: el.sortOrder ?? idx,
      }))
    );
  }
}


// ─── Product Images ──────────────────────────────────────────────────────────

function productImageConditions(tenantId?: number | null, ...conditions: any[]) {
  const scoped = [...conditions];
  if (tenantId) scoped.push(eq(productImages.tenantId, tenantId));
  return scoped;
}

export async function listProductImages(category?: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const conditions = productImageConditions(
    tenantId,
    ...(category ? [eq(productImages.category, category)] : [])
  );
  if (conditions.length) {
    return db.select().from(productImages).where(and(...conditions)).orderBy(productImages.sortOrder);
  }
  return db.select().from(productImages).orderBy(productImages.sortOrder);
}

export async function getProductImagesByCode(code: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productImages)
    .where(and(...productImageConditions(tenantId, eq(productImages.code, code))))
    .orderBy(productImages.sortOrder);
}

export async function searchProductImages(query: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const searchTerm = `%${query}%`;
  return db.select().from(productImages).where(and(
    ...productImageConditions(tenantId),
    or(
      like(productImages.code, searchTerm),
      like(productImages.name, searchTerm),
      like(productImages.description, searchTerm),
      sql`JSON_SEARCH(${productImages.tags}, 'one', ${searchTerm}) IS NOT NULL`
    )
  )).orderBy(productImages.sortOrder);
}

export async function getProductImageById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(productImages)
    .where(and(...productImageConditions(tenantId, eq(productImages.id, id))));
  return rows[0] ?? null;
}

export async function createProductImage(data: {
  tenantId?: number | null;
  category: string;
  code: string;
  name: string;
  description?: string;
  imageUrl: string;
  sourceDocument?: string;
  pageNumber?: number;
  tags?: string[];
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(productImages).values({
    tenantId: data.tenantId ?? null,
    category: data.category,
    code: data.code,
    name: data.name,
    description: data.description || null,
    imageUrl: data.imageUrl,
    sourceDocument: data.sourceDocument || null,
    pageNumber: data.pageNumber || null,
    tags: data.tags || [],
    sortOrder: data.sortOrder || 0,
  });
  return { id: result.insertId };
}

export async function updateProductImage(id: number, data: {
  tenantId?: number | null;
  category?: string;
  code?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  sourceDocument?: string;
  pageNumber?: number;
  tags?: string[];
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, unknown> = {};
  if (data.category !== undefined) updates.category = data.category;
  if (data.code !== undefined) updates.code = data.code;
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
  if (data.sourceDocument !== undefined) updates.sourceDocument = data.sourceDocument;
  if (data.pageNumber !== undefined) updates.pageNumber = data.pageNumber;
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  const conditions = productImageConditions(data.tenantId, eq(productImages.id, id));
  await db.update(productImages).set(updates).where(and(...conditions));
}

export async function deleteProductImage(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(productImages).where(and(...productImageConditions(tenantId, eq(productImages.id, id))));
}

export async function reorderProductImages(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Update sortOrder for each image based on its position in the ids array
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(productImages)
      .set({ sortOrder: i })
      .where(and(...productImageConditions(tenantId, eq(productImages.id, ids[i]))));
  }
}

export async function bulkUpdateProductImageCategory(ids: number[], category: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(productImages)
    .set({ category })
    .where(and(...productImageConditions(tenantId, inArray(productImages.id, ids))));
}
