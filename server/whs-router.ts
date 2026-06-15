import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createSwmsDocument,
  getAllSwmsDocuments,
  getActiveSwmsDocuments,
  updateSwmsDocument,
  deleteSwmsDocument,
} from "./db";
import { storagePut } from "./storage";

export const whsRouter = router({
  // Admin: list all SWMS documents
  listAll: protectedProcedure.query(async () => {
    return getAllSwmsDocuments();
  }),

  // Admin: create a new SWMS document
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        fileBase64: z.string().min(1),
        fileName: z.string().min(1),
        contentType: z.string().default("application/pdf"),
        showOnTradePortal: z.boolean().default(false),
        showOnClientPortal: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }

      // Upload file to S3
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const fileKey = `whs/swms/${suffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.contentType);

      const id = await createSwmsDocument({
        title: input.title,
        description: input.description,
        fileUrl: url,
        fileName: input.fileName,
        showOnTradePortal: input.showOnTradePortal,
        showOnClientPortal: input.showOnClientPortal,
        createdBy: ctx.user.id,
      });

      return { id, fileUrl: url };
    }),

  // Admin: update SWMS document details (not the file itself)
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        showOnTradePortal: z.boolean().optional(),
        showOnClientPortal: z.boolean().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const { id, ...data } = input;
      await updateSwmsDocument(id, data);
      return { success: true };
    }),

  // Admin: replace the file for an existing SWMS document
  replaceFile: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        fileBase64: z.string().min(1),
        fileName: z.string().min(1),
        contentType: z.string().default("application/pdf"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const fileKey = `whs/swms/${suffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.contentType);

      await updateSwmsDocument(input.id, { fileUrl: url, fileName: input.fileName });
      return { fileUrl: url };
    }),

  // Admin: delete a SWMS document
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      await deleteSwmsDocument(input.id);
      return { success: true };
    }),

  // Portal: get active SWMS documents for trade portal
  tradePortalDocs: publicProcedure.query(async () => {
    return getActiveSwmsDocuments("trade");
  }),

  // Portal: get active SWMS documents for client portal
  clientPortalDocs: publicProcedure.query(async () => {
    return getActiveSwmsDocuments("client");
  }),
});
