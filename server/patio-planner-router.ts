import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listPatioProjects,
  getPatioProject,
  createPatioProject,
  updatePatioProject,
  deletePatioProject,
  adminDeletePatioProject,
  listAllPatioProjects,
} from "./patio-planner-db";
import { storagePut } from "./storage";
import { randomUUID } from "crypto";
import { getQuoteById } from "./db";

/**
 * Map a quote's spec sheet roof shape to patio planner roof style.
 */
function mapRoofShape(specRoofShape: string | null | undefined): string {
  if (!specRoofShape) return "flyover";
  const lower = specRoofShape.toLowerCase();
  if (lower.includes("gable")) return "gable";
  if (lower.includes("hip")) return "hip";
  if (lower.includes("pop") || lower.includes("skillion")) return "popup-skillion";
  return "flyover";
}

/**
 * Extract prefill data from a quote's spec sheet fields.
 */
function extractPrefillFromQuote(quote: Record<string, any>): Record<string, any> {
  const prefill: Record<string, any> = {};

  // Dimensions
  if (quote.specWidth) prefill.structureWidth = String(Math.round(Number(quote.specWidth)));
  if (quote.specLength) prefill.structureProjection = String(Math.round(Number(quote.specLength)));
  if (quote.specFloorHeight) prefill.beamHeight = String(Number(quote.specFloorHeight) || 2700);
  if (quote.specFloorToGround) prefill.floorToGround = String(Number(quote.specFloorToGround) || 150);

  // Posts
  if (quote.specPostsNumber) prefill.postCount = Number(quote.specPostsNumber) || 2;

  // Roof
  prefill.roofStyle = mapRoofShape(quote.specRoofShape);

  // Colours (Colorbond)
  if (quote.specRoofTopColour) prefill.roofColour = quote.specRoofTopColour;
  if (quote.specBeamColour) prefill.beamColour = quote.specBeamColour;
  if (quote.specPostsColour) prefill.postColour = quote.specPostsColour;
  if (quote.specGutterColour) prefill.gutterColour = quote.specGutterColour;
  // Fascia colour: use gutter colour or beam colour as fallback
  if (quote.specGutterColour) prefill.fasciaColour = quote.specGutterColour;

  // Gutter & downpipe styles
  if (quote.specGutterType) {
    const gt = String(quote.specGutterType).toLowerCase();
    if (gt.includes("half") || gt.includes("round")) prefill.gutterStyle = "half-round";
    else if (gt.includes("fascia")) prefill.gutterStyle = "fascia";
    else if (gt.includes("quad")) prefill.gutterStyle = "quad";
    else if (gt.includes("none") || gt.includes("n/a")) prefill.gutterStyle = "none";
  }
  if (quote.specDownpipeType) {
    const dp = String(quote.specDownpipeType).toLowerCase();
    if (dp.includes("square")) prefill.downpipeStyle = "square";
    else if (dp.includes("round")) prefill.downpipeStyle = "round";
    else if (dp.includes("none") || dp.includes("n/a")) prefill.downpipeStyle = "none";
  }

  // Windows & doors from JSON entries
  const windowsDoors: any[] = [];
  if (quote.specWindowEntries) {
    try {
      const entries = typeof quote.specWindowEntries === "string"
        ? JSON.parse(quote.specWindowEntries)
        : quote.specWindowEntries;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const qty = Number(entry.qty) || 1;
          for (let i = 0; i < qty; i++) {
            windowsDoors.push({
              id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "window",
              label: `${entry.style || "Sliding"} Window`,
              width: Number(entry.width) || 1200,
              height: Number(entry.height) || 1200,
              screen: entry.screen || "N/A",
              x: 30 + (windowsDoors.length * 5),
              y: 40,
            });
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (quote.specDoorEntries) {
    try {
      const entries = typeof quote.specDoorEntries === "string"
        ? JSON.parse(quote.specDoorEntries)
        : quote.specDoorEntries;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          const qty = Number(entry.qty) || 1;
          for (let i = 0; i < qty; i++) {
            windowsDoors.push({
              id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "door",
              label: `${entry.style || "Sliding"} Door`,
              width: Number(entry.width) || 2400,
              height: Number(entry.height) || 2100,
              screen: entry.screen || "N/A",
              x: 30 + (windowsDoors.length * 5),
              y: 60,
            });
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (windowsDoors.length > 0) {
    prefill.windowsDoors = JSON.stringify(windowsDoors);
  }

  // Engineering context
  const engData: Record<string, string> = {};
  if (quote.specWindCat) engData.windRegion = quote.specWindCat;
  if (quote.specBeamSize) engData.beamSize = quote.specBeamSize;
  if (quote.specPostsType) engData.postSize = quote.specPostsType;
  if (Object.keys(engData).length > 0) {
    prefill.engineeringData = JSON.stringify(engData);
  }

  return prefill;
}

export const patioRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listPatioProjects(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getPatioProject(input.id, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return project;
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), quoteId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await createPatioProject({
        userId: ctx.user.id,
        name: input.name,
        quoteId: input.quoteId,
      });

      // If a quoteId was provided, pre-fill from spec sheet
      if (input.quoteId) {
        try {
          const quote = await getQuoteById(input.quoteId);
          if (quote) {
            const prefill = extractPrefillFromQuote(quote);
            if (Object.keys(prefill).length > 0) {
              await updatePatioProject(id, ctx.user.id, prefill);
            }
          }
        } catch (err) {
          // Non-critical: project is created but without prefill
          console.warn("[PatioPlanner] Failed to prefill from quote:", err);
        }
      }

      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updatePatioProject(input.id, ctx.user.id, input.data);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deletePatioProject(input.id, ctx.user.id);
      if (!success) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return { success: true };
    }),

  uploadPhoto: protectedProcedure
    .input(z.object({
      id: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await getPatioProject(input.id, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `patio-planner/${ctx.user.id}/${input.id}/${randomUUID()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      await updatePatioProject(input.id, ctx.user.id, {
        photoUrl: url,
        photoKey: key,
      });

      return { url, key };
    }),

  // ─── Admin procedures ─────────────────────────────────────────────────
  adminList: adminProcedure.query(async () => {
    return listAllPatioProjects();
  }),

  adminDelete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const success = await adminDeletePatioProject(input.id);
      if (!success) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return { success: true };
    }),
});
