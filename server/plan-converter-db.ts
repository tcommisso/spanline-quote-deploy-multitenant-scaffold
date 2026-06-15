import { getDb } from "./db";
import { planConversions, planConversionElements, productImages } from "../drizzle/schema";
import { eq, desc, and, like, or, sql, inArray } from "drizzle-orm";

export async function listPlanConversions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(planConversions).where(eq(planConversions.userId, userId)).orderBy(desc(planConversions.updatedAt));
}

export async function listAllPlanConversions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(planConversions).orderBy(desc(planConversions.updatedAt));
}

export async function listPlanConversionsByJob(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(planConversions).where(eq(planConversions.jobId, jobId)).orderBy(desc(planConversions.updatedAt));
}

export async function getPlanConversion(id: number, userId?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = userId
    ? and(eq(planConversions.id, id), eq(planConversions.userId, userId))
    : eq(planConversions.id, id);
  const result = await db.select().from(planConversions).where(conditions).limit(1);
  return result[0] || null;
}

export async function createPlanConversion(data: {
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
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(planConversions).set(data).where(eq(planConversions.id, id));
}

export async function deletePlanConversion(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(planConversionElements).where(eq(planConversionElements.conversionId, id));
  const result = await db.delete(planConversions).where(
    and(eq(planConversions.id, id), eq(planConversions.userId, userId))
  );
  return result[0].affectedRows > 0;
}

export async function adminDeletePlanConversion(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(planConversionElements).where(eq(planConversionElements.conversionId, id));
  await db.delete(planConversions).where(eq(planConversions.id, id));
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

export async function listProductImages(category?: string) {
  const db = await getDb();
  if (!db) return [];
  if (category) {
    return db.select().from(productImages).where(eq(productImages.category, category)).orderBy(productImages.sortOrder);
  }
  return db.select().from(productImages).orderBy(productImages.sortOrder);
}

export async function getProductImagesByCode(code: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productImages).where(eq(productImages.code, code)).orderBy(productImages.sortOrder);
}

export async function searchProductImages(query: string) {
  const db = await getDb();
  if (!db) return [];
  const searchTerm = `%${query}%`;
  return db.select().from(productImages).where(
    or(
      like(productImages.code, searchTerm),
      like(productImages.name, searchTerm),
      like(productImages.description, searchTerm),
      sql`JSON_SEARCH(${productImages.tags}, 'one', ${searchTerm}) IS NOT NULL`
    )
  ).orderBy(productImages.sortOrder);
}

export async function getProductImageById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(productImages).where(eq(productImages.id, id));
  return rows[0] ?? null;
}

export async function createProductImage(data: {
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
  await db.update(productImages).set(updates).where(eq(productImages.id, id));
}

export async function deleteProductImage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(productImages).where(eq(productImages.id, id));
}

export async function reorderProductImages(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Update sortOrder for each image based on its position in the ids array
  for (let i = 0; i < ids.length; i++) {
    await db.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, ids[i]));
  }
}

export async function bulkUpdateProductImageCategory(ids: number[], category: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(productImages).set({ category }).where(inArray(productImages.id, ids));
}
