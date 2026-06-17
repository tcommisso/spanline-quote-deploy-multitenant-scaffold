import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { generateImage } from "./_core/imageGeneration";
import { getPatioProject, updatePatioProject, getPatioProjectByQuoteId } from "./patio-planner-db";
import {
  buildPatioRenderPrompt,
  buildPatioRenderPromptQuick,
  type PatioRenderInput,
} from "../shared/patio-render-prompt";
import { getPresetById } from "../shared/render-style-presets";
import { randomUUID } from "crypto";
import { applyWatermark, fetchImageBuffer } from "./watermark";
import { storagePut } from "./storage";
import { logRenderCost } from "./render-cost-router";
import { getTenantBrandingSettings } from "./db";
import { getCompanyName } from "./company-name";

/** Shape of a single render history entry stored in the DB JSON column */
export interface PatioRenderHistoryEntry {
  id: string;
  imageUrl: string;
  imageKey: string;
  prompt: string;
  promptMode: "full" | "quick";
  createdAt: number; // unix ms
  isFavourite?: boolean;
  stylePreset?: string;
}

/**
 * Parse the renderHistory JSON column from the database.
 * Returns an empty array if null/undefined/invalid.
 */
function parseRenderHistory(raw: unknown): PatioRenderHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed as PatioRenderHistoryEntry[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Build a PatioRenderInput from a patio planner project record.
 */
function projectToRenderInput(project: Record<string, any>): PatioRenderInput {
  // Parse windows/doors
  let windowsDoors: PatioRenderInput["windowsDoors"] = [];
  if (project.windowsDoors) {
    try {
      const parsed =
        typeof project.windowsDoors === "string"
          ? JSON.parse(project.windowsDoors)
          : project.windowsDoors;
      if (Array.isArray(parsed)) {
        windowsDoors = parsed.map((el: any) => ({
          type: el.type || "",
          label: el.label || el.type || "",
          width: Number(el.width) || 0,
          height: Number(el.height) || 0,
          screen: el.screen || "N/A",
        }));
      }
    } catch {
      /* ignore */
    }
  }

  // Parse engineering data
  let beamSize: string | undefined;
  let postSize: string | undefined;
  let windRegion: string | undefined;
  if (project.engineeringData) {
    try {
      const eng =
        typeof project.engineeringData === "string"
          ? JSON.parse(project.engineeringData)
          : project.engineeringData;
      beamSize = eng.beamSize;
      postSize = eng.postSize;
      windRegion = eng.windRegion;
    } catch {
      /* ignore */
    }
  }

  return {
    roofStyle: project.roofStyle || "flyover",
    width: Number(project.structureWidth) || 6000,
    projection: Number(project.structureProjection) || 4000,
    roofPitch: Number(project.roofPitch) || 5,
    beamHeight: Number(project.beamHeight) || 2700,
    postHeight: Number(project.postHeight) || 2400,
    floorToGround: Number(project.floorToGround) || 150,
    postCount: project.postCount || 2,
    roofColour: project.roofColour || "Surfmist",
    beamColour: project.beamColour || "Surfmist",
    postColour: project.postColour || "Surfmist",
    gutterColour: project.gutterColour || "Surfmist",
    fasciaColour: project.fasciaColour || "Surfmist",
    gutterStyle: project.gutterStyle || "quad",
    downpipeStyle: project.downpipeStyle || "round",
    roofPanel: project.roofPanel || "double-u",
    connectionType: project.connectionType || "flyover-bracket",
    windowsDoors,
    beamSize,
    postSize,
    windRegion,
    hasPhoto: !!project.photoUrl,
  };
}

export const patioRenderRouter = router({
  /**
   * Generate an AI render for a patio project.
   * Uses the project's spec data + optional photo to create a realistic render.
   */
  generate: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        mode: z.enum(["full", "quick"]).default("full"),
        stylePreset: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load the project
      const project = await getPatioProject(input.projectId, ctx.user.id, ctx.tenant!.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Patio project not found",
        });
      }

      // Build the render input from project data
      const renderInput = projectToRenderInput(project);

      // Build the prompt
      let prompt =
        input.mode === "quick"
          ? buildPatioRenderPromptQuick(renderInput)
          : buildPatioRenderPrompt(renderInput);

      // Append style preset modifier if selected
      if (input.stylePreset) {
        const preset = getPresetById(input.stylePreset);
        if (preset) {
          prompt += `\n\n${preset.promptModifier}`;
        }
      }

      // Prepare image generation options
      const genOptions: Parameters<typeof generateImage>[0] = {
        prompt,
      };

      // If the project has a photo, use it as the base image for editing
      if (project.photoUrl) {
        genOptions.originalImages = [
          {
            url: project.photoUrl as string,
            mimeType: "image/jpeg",
          },
        ];
      }

      // Generate the image
      const result = await generateImage(genOptions);

      if (!result.url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Image generation did not return a URL",
        });
      }

      // Apply watermark (logo + copyright)
      let finalUrl = result.url;
      try {
        const rawBuffer = await fetchImageBuffer(result.url);

        // Try to fetch company logo from tenant branding
        let logoBuffer: Buffer | undefined;
        let companyName = "Altaspan";
        try {
          const branding = await getTenantBrandingSettings(ctx.tenant!.id);
          const companyInfo = await getCompanyName(ctx.tenant!.id);
          companyName = companyInfo.displayName || companyName;
          if (branding?.customLogoUrl) {
            logoBuffer = await fetchImageBuffer(branding.customLogoUrl);
          }
        } catch {
          // Continue without logo
        }

        const watermarked = await applyWatermark({
          imageBuffer: rawBuffer,
          logoBuffer,
          companyName,
          year: new Date().getFullYear(),
          opacity: 0.85,
          position: "bottom-right",
        });

        // Upload watermarked version to S3
        const wmKey = `tenants/${ctx.tenant!.id}/patio-renders/${ctx.user.id}/${input.projectId}/${Date.now()}-wm.png`;
        const { url: wmUrl } = await storagePut(wmKey, watermarked, "image/png");
        finalUrl = wmUrl;
      } catch (e) {
        // If watermarking fails, use the original URL
        console.warn("[PatioRender] Watermark failed, using original:", e);
      }

      // Log render cost
      await logRenderCost({
        userId: ctx.user.id,
        projectId: input.projectId,
        renderMode: input.mode,
        stylePreset: input.stylePreset,
        tenantId: ctx.tenant!.id,
      });

      // Build render history entry
      const entry: PatioRenderHistoryEntry = {
        id: randomUUID(),
        imageUrl: finalUrl,
        imageKey: `tenants/${ctx.tenant!.id}/patio-render/${ctx.user.id}/${input.projectId}/${Date.now()}.png`,
        prompt,
        promptMode: input.mode,
        createdAt: Date.now(),
        stylePreset: input.stylePreset,
      };

      // Append to render history
      const existingHistory = parseRenderHistory(
        (project as any).renderHistory
      );
      const updatedHistory = [...existingHistory, entry];

      // Save to database
      await updatePatioProject(input.projectId, ctx.user.id, {
        renderHistory: JSON.stringify(updatedHistory),
      }, ctx.tenant!.id);

      return {
        id: entry.id,
        imageUrl: entry.imageUrl,
        prompt: entry.prompt,
        promptMode: entry.promptMode,
        createdAt: entry.createdAt,
      };
    }),

  /**
   * Get render history for a patio project.
   */
  history: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getPatioProject(input.projectId, ctx.user.id, ctx.tenant!.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Patio project not found",
        });
      }

      return parseRenderHistory((project as any).renderHistory);
    }),

  /**
   * Delete a render from history.
   */
  deleteRender: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        renderId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getPatioProject(input.projectId, ctx.user.id, ctx.tenant!.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Patio project not found",
        });
      }

      const history = parseRenderHistory((project as any).renderHistory);
      const filtered = history.filter((r) => r.id !== input.renderId);

      await updatePatioProject(input.projectId, ctx.user.id, {
        renderHistory: JSON.stringify(filtered),
      }, ctx.tenant!.id);

      return { success: true };
    }),

  /**
   * Get the latest render for a quote's linked patio project.
   * Used by the Send for Signature dialog to attach renders.
   */
  getLatestRenderForQuote: protectedProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getPatioProjectByQuoteId(input.quoteId, ctx.user.id, ctx.tenant!.id);
      if (!project) return { hasRender: false, renders: [] as PatioRenderHistoryEntry[] };

      const history = parseRenderHistory((project as any).renderHistory);
      if (history.length === 0) return { hasRender: false, renders: [] as PatioRenderHistoryEntry[] };

      // Return sorted: favourites first, then by newest
      const sorted = [...history].sort((a, b) => {
        if (a.isFavourite && !b.isFavourite) return -1;
        if (!a.isFavourite && b.isFavourite) return 1;
        return b.createdAt - a.createdAt;
      });
      return { hasRender: true, renders: sorted };
    }),

  /**
   * Preview the prompt that would be generated (for debugging/transparency).
   */
  previewPrompt: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        mode: z.enum(["full", "quick"]).default("full"),
        stylePreset: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const project = await getPatioProject(input.projectId, ctx.user.id, ctx.tenant!.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Patio project not found",
        });
      }

      const renderInput = projectToRenderInput(project);
      let prompt =
        input.mode === "quick"
          ? buildPatioRenderPromptQuick(renderInput)
          : buildPatioRenderPrompt(renderInput);

      if (input.stylePreset) {
        const preset = getPresetById(input.stylePreset);
        if (preset) {
          prompt += `\n\n${preset.promptModifier}`;
        }
      }

      return { prompt, renderInput };
    }),

  /**
   * Toggle favourite status on a render.
   */
  toggleFavourite: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        renderId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getPatioProject(input.projectId, ctx.user.id, ctx.tenant!.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Patio project not found",
        });
      }

      const history = parseRenderHistory((project as any).renderHistory);
      const updated = history.map((r) => {
        if (r.id === input.renderId) {
          return { ...r, isFavourite: !r.isFavourite };
        }
        return r;
      });

      await updatePatioProject(input.projectId, ctx.user.id, {
        renderHistory: JSON.stringify(updated),
      }, ctx.tenant!.id);

      const toggled = updated.find((r) => r.id === input.renderId);
      return { success: true, isFavourite: toggled?.isFavourite ?? false };
    }),

  /**
   * Batch generate renders with multiple style presets.
   * Generates sequentially and returns all results.
   */
  batchGenerate: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        mode: z.enum(["full", "quick"]).default("full"),
        presets: z.array(z.string()).min(1).max(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load the project
      const project = await getPatioProject(input.projectId, ctx.user.id, ctx.tenant!.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Patio project not found",
        });
      }

      const renderInput = projectToRenderInput(project);
      const results: PatioRenderHistoryEntry[] = [];

      for (const presetId of input.presets) {
        try {
          // Build the prompt
          let prompt =
            input.mode === "quick"
              ? buildPatioRenderPromptQuick(renderInput)
              : buildPatioRenderPrompt(renderInput);

          const preset = getPresetById(presetId);
          if (preset) {
            prompt += `\n\n${preset.promptModifier}`;
          }

          // Prepare image generation options
          const genOptions: Parameters<typeof generateImage>[0] = { prompt };
          if (project.photoUrl) {
            genOptions.originalImages = [
              { url: project.photoUrl as string, mimeType: "image/jpeg" },
            ];
          }

          // Generate the image
          const result = await generateImage(genOptions);
          if (!result.url) continue;

          // Apply watermark
          let finalUrl = result.url;
          try {
            const rawBuffer = await fetchImageBuffer(result.url);
            let logoBuffer: Buffer | undefined;
            let companyName = "Altaspan";
            try {
              const branding = await getTenantBrandingSettings(ctx.tenant!.id);
              const companyInfo = await getCompanyName(ctx.tenant!.id);
              companyName = companyInfo.displayName || companyName;
              if (branding?.customLogoUrl) {
                logoBuffer = await fetchImageBuffer(branding.customLogoUrl);
              }
            } catch { /* continue without logo */ }

            const watermarked = await applyWatermark({
              imageBuffer: rawBuffer,
              logoBuffer,
              companyName,
              year: new Date().getFullYear(),
              opacity: 0.85,
              position: "bottom-right",
            });

            const wmKey = `tenants/${ctx.tenant!.id}/patio-renders/${ctx.user.id}/${input.projectId}/${Date.now()}-batch-wm.png`;
            const { url: wmUrl } = await storagePut(wmKey, watermarked, "image/png");
            finalUrl = wmUrl;
          } catch {
            // Use original if watermark fails
          }

          const entry: PatioRenderHistoryEntry = {
            id: randomUUID(),
            imageUrl: finalUrl,
            imageKey: `tenants/${ctx.tenant!.id}/patio-render/${ctx.user.id}/${input.projectId}/${Date.now()}.png`,
            prompt,
            promptMode: input.mode,
            createdAt: Date.now(),
            stylePreset: presetId,
          };
          results.push(entry);
        } catch (e) {
          // Skip failed generations in batch
          console.warn(`[PatioRender] Batch generation failed for preset ${presetId}:`, e);
        }
      }

      // Log batch render cost
      if (results.length > 0) {
        await logRenderCost({
          userId: ctx.user.id,
          projectId: input.projectId,
          renderMode: "batch",
          renderCount: results.length,
          tenantId: ctx.tenant!.id,
        });
      }

      // Append all results to render history
      if (results.length > 0) {
        const existingHistory = parseRenderHistory((project as any).renderHistory);
        const updatedHistory = [...existingHistory, ...results];
        await updatePatioProject(input.projectId, ctx.user.id, {
          renderHistory: JSON.stringify(updatedHistory),
        }, ctx.tenant!.id);
      }

      return {
        generated: results.length,
        total: input.presets.length,
        renders: results,
      };
    }),
});
