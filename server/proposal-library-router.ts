import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import {
  PROPOSAL_IMAGE_MAX_EDGE,
  PROPOSAL_IMAGE_MIN_LONG_EDGE,
  PROPOSAL_IMAGE_MIN_SHORT_EDGE,
  PROPOSAL_LIBRARY_CONTENT_TYPES,
  PROPOSAL_LIBRARY_SECTION_TYPES,
} from "../shared/proposal-library";
import { proposalLibraryItems } from "../drizzle/schema";
import { getDb } from "./db";
import { router, tenantAdminProcedure, tenantProcedure, canAdministerTenant } from "./_core/trpc";
import { appendTenantScope } from "./_core/tenant-scope";
import { storagePut } from "./storage";

const proposalLibrarySectionSchema = z.enum(PROPOSAL_LIBRARY_SECTION_TYPES);
const proposalLibraryContentSchema = z.enum(PROPOSAL_LIBRARY_CONTENT_TYPES);

const uploadSchema = z.object({
  imageBase64: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

type UploadInput = z.infer<typeof uploadSchema>;

function safeFileSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "proposal-image";
}

function buildImageWarning(width?: number | null, height?: number | null) {
  if (!width || !height) {
    return "Image resolution could not be checked. Use a high quality JPG or PNG for proposal output.";
  }

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge < PROPOSAL_IMAGE_MIN_LONG_EDGE || shortEdge < PROPOSAL_IMAGE_MIN_SHORT_EDGE) {
    return `Image is ${width} x ${height}px. Recommended minimum is ${PROPOSAL_IMAGE_MIN_LONG_EDGE}px on the long edge and ${PROPOSAL_IMAGE_MIN_SHORT_EDGE}px on the short edge for proposal use.`;
  }

  return null;
}

async function prepareProposalImageUpload(
  tenantId: number,
  sectionType: string,
  title: string,
  upload?: UploadInput | null,
) {
  if (!upload) return {};

  const inputBuffer = Buffer.from(upload.imageBase64, "base64");
  let outputBuffer: Uint8Array = inputBuffer;
  let imageMimeType = upload.mimeType;
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;
  let originalImageWidth: number | null = null;
  let originalImageHeight: number | null = null;
  let imageWarning: string | null = null;
  let extension = upload.fileName.split(".").pop()?.toLowerCase() || "jpg";

  try {
    const image = sharp(inputBuffer, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    originalImageWidth = metadata.width ?? null;
    originalImageHeight = metadata.height ?? null;
    imageWarning = buildImageWarning(originalImageWidth, originalImageHeight);

    outputBuffer = await image
      .flatten({ background: "#ffffff" })
      .resize({
        width: PROPOSAL_IMAGE_MAX_EDGE,
        height: PROPOSAL_IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();

    const resizedMetadata = await sharp(outputBuffer).metadata();
    imageWidth = resizedMetadata.width ?? null;
    imageHeight = resizedMetadata.height ?? null;
    imageMimeType = "image/jpeg";
    extension = "jpg";
  } catch {
    imageWarning = buildImageWarning(null, null);
  }

  const key = [
    "tenants",
    String(tenantId),
    "proposal-library",
    safeFileSegment(sectionType),
    `${Date.now()}-${safeFileSegment(title)}.${extension}`,
  ].join("/");
  const { url } = await storagePut(key, outputBuffer, imageMimeType);

  return {
    imageUrl: url,
    imageAlt: title,
    originalFileName: upload.fileName,
    originalImageWidth,
    originalImageHeight,
    imageWidth,
    imageHeight,
    imageSizeBytes: outputBuffer.length,
    imageMimeType,
    imageWarning,
  };
}

function scopedConditions(tenantId: number, ...conditions: any[]) {
  const allConditions = [...conditions];
  appendTenantScope(allConditions, proposalLibraryItems.tenantId, tenantId);
  return allConditions;
}

export const proposalLibraryRouter = router({
  list: tenantProcedure
    .input(z.object({
      sectionType: proposalLibrarySectionSchema.optional(),
      contentType: proposalLibraryContentSchema.optional(),
      activeOnly: z.boolean().optional().default(true),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      if (input?.activeOnly === false && !canAdministerTenant(ctx.user.role, ctx.tenantMembership.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required to view inactive proposal library items." });
      }

      const conditions = scopedConditions(ctx.tenant.id);
      if (input?.activeOnly !== false) conditions.push(eq(proposalLibraryItems.isActive, true));
      if (input?.sectionType) conditions.push(eq(proposalLibraryItems.sectionType, input.sectionType));
      if (input?.contentType) conditions.push(eq(proposalLibraryItems.contentType, input.contentType));

      return db
        .select()
        .from(proposalLibraryItems)
        .where(and(...conditions))
        .orderBy(asc(proposalLibraryItems.sectionType), asc(proposalLibraryItems.sortOrder), asc(proposalLibraryItems.title));
    }),

  listDefaultsForSections: tenantProcedure
    .input(z.object({
      sectionTypes: z.array(proposalLibrarySectionSchema).min(1),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const sectionTypes = Array.from(new Set(["all", ...input.sectionTypes]));
      const conditions = scopedConditions(
        ctx.tenant.id,
        eq(proposalLibraryItems.isActive, true),
        eq(proposalLibraryItems.defaultIncluded, true),
        inArray(proposalLibraryItems.sectionType, sectionTypes),
      );

      return db
        .select()
        .from(proposalLibraryItems)
        .where(and(...conditions))
        .orderBy(asc(proposalLibraryItems.sectionType), asc(proposalLibraryItems.sortOrder), asc(proposalLibraryItems.title));
    }),

  create: tenantAdminProcedure
    .input(z.object({
      sectionType: proposalLibrarySectionSchema,
      contentType: proposalLibraryContentSchema,
      title: z.string().trim().min(1).max(255),
      body: z.string().trim().nullable().optional(),
      defaultIncluded: z.boolean().optional().default(true),
      sortOrder: z.number().int().optional().default(0),
      upload: uploadSchema.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.body && !input.upload) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add text, an image, or both." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant!.id;

      const imageData = await prepareProposalImageUpload(tenantId, input.sectionType, input.title, input.upload);
      const [result] = await db.insert(proposalLibraryItems).values({
        tenantId,
        sectionType: input.sectionType,
        contentType: input.contentType,
        title: input.title,
        body: input.body || null,
        defaultIncluded: input.defaultIncluded,
        sortOrder: input.sortOrder,
        ...imageData,
      });

      const [item] = await db
        .select()
        .from(proposalLibraryItems)
        .where(and(...scopedConditions(tenantId, eq(proposalLibraryItems.id, Number(result.insertId)))))
        .limit(1);

      return item;
    }),

  update: tenantAdminProcedure
    .input(z.object({
      id: z.number(),
      sectionType: proposalLibrarySectionSchema.optional(),
      contentType: proposalLibraryContentSchema.optional(),
      title: z.string().trim().min(1).max(255).optional(),
      body: z.string().trim().nullable().optional(),
      defaultIncluded: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      clearImage: z.boolean().optional(),
      upload: uploadSchema.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant!.id;

      const [existing] = await db
        .select()
        .from(proposalLibraryItems)
        .where(and(...scopedConditions(tenantId, eq(proposalLibraryItems.id, input.id))))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal library item not found" });

      const imageData = input.upload
        ? await prepareProposalImageUpload(
          tenantId,
          input.sectionType || existing.sectionType,
          input.title || existing.title,
          input.upload,
        )
        : {};

      const updates: Record<string, unknown> = {};
      if (input.sectionType !== undefined) updates.sectionType = input.sectionType;
      if (input.contentType !== undefined) updates.contentType = input.contentType;
      if (input.title !== undefined) updates.title = input.title;
      if (input.body !== undefined) updates.body = input.body || null;
      if (input.defaultIncluded !== undefined) updates.defaultIncluded = input.defaultIncluded;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      Object.assign(updates, imageData);

      if (input.clearImage) {
        updates.imageUrl = null;
        updates.imageAlt = null;
        updates.originalFileName = null;
        updates.originalImageWidth = null;
        updates.originalImageHeight = null;
        updates.imageWidth = null;
        updates.imageHeight = null;
        updates.imageSizeBytes = null;
        updates.imageMimeType = null;
        updates.imageWarning = null;
      }

      await db
        .update(proposalLibraryItems)
        .set(updates)
        .where(and(...scopedConditions(tenantId, eq(proposalLibraryItems.id, input.id))));

      return { success: true };
    }),

  delete: tenantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant!.id;

      await db
        .update(proposalLibraryItems)
        .set({ isActive: false })
        .where(and(...scopedConditions(tenantId, eq(proposalLibraryItems.id, input.id))));

      return { success: true };
    }),

  reorder: tenantAdminProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.number(),
        sortOrder: z.number().int(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = ctx.tenant!.id;

      await Promise.all(input.items.map((item) =>
        db
          .update(proposalLibraryItems)
          .set({ sortOrder: item.sortOrder })
          .where(and(...scopedConditions(tenantId, eq(proposalLibraryItems.id, item.id))))
      ));

      return { success: true };
    }),
});
