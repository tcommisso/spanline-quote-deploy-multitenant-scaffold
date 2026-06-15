import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import sharp from "sharp";

const MAX_EMAIL_WIDTH = 600;

export const emailImagesRouter = router({
  list: protectedProcedure.query(async () => {
    return db.listEmailImages();
  }),

  upload: protectedProcedure
    .input(z.object({
      filename: z.string(),
      base64Data: z.string(),
      contentType: z.string(),
      caption: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Decode base64 to buffer
      const buffer = Buffer.from(input.base64Data, "base64");

      // Resize for email using sharp (max 600px width, maintain aspect ratio)
      let resizedBuffer: Buffer;
      let metadata: { width?: number; height?: number };
      try {
        const image = sharp(buffer);
        const meta = await image.metadata();
        if (meta.width && meta.width > MAX_EMAIL_WIDTH) {
          resizedBuffer = await image
            .resize({ width: MAX_EMAIL_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          const resizedMeta = await sharp(resizedBuffer).metadata();
          metadata = { width: resizedMeta.width, height: resizedMeta.height };
        } else {
          resizedBuffer = buffer;
          metadata = { width: meta.width, height: meta.height };
        }
      } catch {
        // If sharp fails (e.g. SVG), just use original
        resizedBuffer = buffer;
        metadata = {};
      }

      // Upload to S3
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const ext = input.filename.split(".").pop() || "jpg";
      const fileKey = `email-images/${Date.now()}-${randomSuffix}.${ext}`;
      const { url } = await storagePut(fileKey, resizedBuffer, input.contentType);

      // Save to DB
      const result = await db.createEmailImage({
        filename: input.filename,
        url,
        fileKey,
        caption: input.caption || "",
        tags: input.tags || [],
        width: metadata.width,
        height: metadata.height,
        sizeBytes: resizedBuffer.length,
        uploadedBy: ctx.user.id,
      });

      return { id: result.id, url, width: metadata.width, height: metadata.height };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      caption: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const updateData: { caption?: string; tags?: string[] } = {};
      if (input.caption !== undefined) updateData.caption = input.caption;
      if (input.tags !== undefined) updateData.tags = input.tags;
      await db.updateEmailImage(input.id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteEmailImage(input.id);
      return { success: true };
    }),
});
