/**
 * Quote Render Router — AI render generation for Deck and Eclipse quotes.
 * Follows the same pattern as patio-render-router but operates on quote records
 * directly (no separate planner project needed).
 */
import { z } from "zod";
import { router, tenantProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { generateImage } from "./_core/imageGeneration";
import { getPresetById } from "../shared/render-style-presets";
import { buildDeckRenderPrompt, buildDeckRenderPromptQuick, type DeckRenderInput } from "../shared/deck-render-prompt";
import { buildEclipseRenderPrompt, buildEclipseRenderPromptQuick, type EclipseRenderInput } from "../shared/eclipse-render-prompt";
import { randomUUID } from "crypto";
import { applyWatermark, fetchImageBuffer } from "./watermark";
import { storagePut } from "./storage";
import { logRenderCost } from "./render-cost-router";
import { getDb, getTenantBrandingSettings } from "./db";
import { getDeckProductById } from "./deck-db";
import { deckQuotes, eclipseQuotes } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getCompanyName } from "./company-name";
import { appendTenantScope } from "./_core/tenant-scope";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RenderHistoryEntry {
  id: string;
  imageUrl: string;
  prompt: string;
  promptMode: "full" | "quick";
  createdAt: number; // unix ms
  isFavourite?: boolean;
  stylePreset?: string;
}

function parseRenderHistory(raw: unknown): RenderHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return parsed as RenderHistoryEntry[];
    return [];
  } catch {
    return [];
  }
}

// ─── Deck helpers ───────────────────────────────────────────────────────────

async function getDeckQuote(quoteId: number, userId: number, userRole?: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  // Admin/super_admin can access any quote; non-admin must own it
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const conditions = isAdmin
    ? [eq(deckQuotes.id, quoteId)]
    : [eq(deckQuotes.id, quoteId), eq(deckQuotes.userId, userId)];
  appendTenantScope(conditions, deckQuotes.tenantId, tenantId);
  const [row] = await db.select().from(deckQuotes).where(and(...conditions)).limit(1);
  return row ?? null;
}

function deckQuoteToRenderInput(quote: any, productImageUrl?: string): DeckRenderInput {
  // Parse board layout from designInputsJson (the actual persisted source)
  let boardLayout: any = {};
  try {
    if (quote.designInputsJson) {
      const designInputs = typeof quote.designInputsJson === "string"
        ? JSON.parse(quote.designInputsJson)
        : quote.designInputsJson;
      boardLayout = designInputs?.boardLayout || {};
    }
  } catch { /* ignore parse errors */ }

  return {
    widthM: parseFloat(quote.deckWidthM) || 6,
    projectionM: parseFloat(quote.deckProjectionM) || 4,
    heightAboveGroundMm: quote.deckHeightAboveGroundMm || 300,
    shape: quote.deckShape || "rectangle",
    deckingBrand: quote.deckingBrand || "composite",
    productName: quote.deckingProduct || undefined,
    colour: quote.colour || "Spotted Gum",
    boardWidthMm: boardLayout.boardWidth || undefined,
    boardGapMm: boardLayout.boardGap || undefined,
    stockLengthM: boardLayout.boardLength ? boardLayout.boardLength / 1000 : undefined,
    fixingMethod: boardLayout.fixingMethod || undefined,
    boardDirection: boardLayout.boardDirection || quote.boardDirection || "parallel",
    staggerPattern: boardLayout.staggerPattern || "random",
    pictureFrame: boardLayout.pictureFrame || "none",
    breakerBoard: boardLayout.breakerBoard || "none",
    // Edge & Fascia (from boardLayout in designInputsJson)
    fascia: boardLayout.fascia || "none",
    fasciaHeightMm: boardLayout.fasciaHeightMm || undefined,
    infill: boardLayout.infill || "none",
    edgeDetail: quote.edgeDetail || undefined,
    // Product sample image
    productImageUrl: productImageUrl || undefined,
    // Frame
    frameType: quote.frameType || quote.framingSystem || "steel",
    framingProfile: quote.framingProfile || undefined,
    steelBeamSelection: quote.steelBeamSelection,
    stairsRequired: !!quote.stairsRequired,
    numberOfStairsFlights: quote.numberOfStairsFlights || 0,
    handrailRequired: !!quote.handrailRequired,
    screensRequired: !!quote.screensRequired,
    lightingRequired: !!quote.lightingRequired,
    levels: quote.levels || "single",
    siteCondition: quote.siteCondition || "flat",
    wallMounted: !!quote.wallMounted,
    hasPhoto: !!quote.photoUrl,
  };
}

// ─── Eclipse helpers ────────────────────────────────────────────────────────

async function getEclipseQuote(quoteId: number, userId: number, userRole?: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  // Admin/super_admin can access any quote; non-admin must own it
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const conditions = isAdmin
    ? [eq(eclipseQuotes.id, quoteId)]
    : [eq(eclipseQuotes.id, quoteId), eq(eclipseQuotes.userId, userId)];
  appendTenantScope(conditions, eclipseQuotes.tenantId, tenantId);
  const [row] = await db.select().from(eclipseQuotes).where(and(...conditions)).limit(1);
  return row ?? null;
}

function eclipseQuoteToRenderInput(quote: any): EclipseRenderInput {
  let units: EclipseRenderInput["units"] = [];
  try {
    const parsed = typeof quote.units === "string" ? JSON.parse(quote.units) : quote.units;
    if (Array.isArray(parsed)) {
      units = parsed.map((u: any) => ({
        bladeWidth: Number(u.bladeWidth) || 3245,
        length: Number(u.length) || 4000,
        height: Number(u.height) || 3000,
        posts: Number(u.posts) || 2,
        bladeColour: u.bladeColour || "White",
        colourbondBladeColour: u.colourbondBladeColour,
        structureColour: u.structureColour || "White",
        colourbondStructureColour: u.colourbondStructureColour,
        mountType: u.mountType || "freestanding",
        fallDirection: u.fallDirection,
        houseWalls: u.houseWalls,
        lights: Number(u.lights) || 0,
        rainSensor: !!u.rainSensor,
      }));
    }
  } catch { /* ignore */ }

  // Parse layout from sitePlanData
  let layoutPreset: string | undefined;
  let gap: number | undefined;
  try {
    const spd = typeof quote.sitePlanData === "string" ? JSON.parse(quote.sitePlanData) : quote.sitePlanData;
    if (spd?.siteLayout) {
      layoutPreset = spd.siteLayout.preset;
      gap = spd.siteLayout.gap;
    }
  } catch { /* ignore */ }

  return {
    unitCount: units.length || 1,
    units: units.length > 0 ? units : [{
      bladeWidth: 3245, length: 4000, height: 3000, posts: 2,
      bladeColour: "White", structureColour: "White",
    }],
    layoutPreset,
    gap,
    hasPhoto: !!quote.photoUrl,
  };
}

// ─── Watermark helper ───────────────────────────────────────────────────────

async function applyRenderWatermark(imageUrl: string, userId: number, tenantId?: number | null): Promise<string> {
  try {
    const rawBuffer = await fetchImageBuffer(imageUrl);
    let logoBuffer: Buffer | undefined;
    let companyName = "Altaspan";
    try {
      const branding = await getTenantBrandingSettings(tenantId);
      const companyInfo = await getCompanyName(tenantId);
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

    const wmKey = `quote-renders/${userId}/${Date.now()}-wm.png`;
    const { url: wmUrl } = await storagePut(wmKey, watermarked, "image/png");
    return wmUrl;
  } catch (e) {
    console.warn("[QuoteRender] Watermark failed, using original:", e);
    return imageUrl;
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const quoteRenderRouter = router({
  /**
   * Generate an AI render for a Deck quote.
   */
  generateDeck: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      mode: z.enum(["full", "quick"]).default("full"),
      stylePreset: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });
      }

      // Look up product sample image if a product is selected
      let productImageUrl: string | undefined;
      if (quote.deckingProductId) {
        try {
          const product = await getDeckProductById(quote.deckingProductId);
          if (product?.imageUrl) productImageUrl = product.imageUrl;
        } catch { /* non-critical */ }
      }

      const renderInput = deckQuoteToRenderInput(quote, productImageUrl);
      let prompt = input.mode === "quick"
        ? buildDeckRenderPromptQuick(renderInput)
        : buildDeckRenderPrompt(renderInput);

      if (input.stylePreset) {
        const preset = getPresetById(input.stylePreset);
        if (preset) prompt += `\n\n${preset.promptModifier}`;
      }

      // Build generation options — include photo and/or product sample as originalImages
      const genOptions: { prompt: string; originalImages?: { url: string; mimeType: string }[] } = { prompt };
      const refImages: { url: string; mimeType: string }[] = [];
      if (quote.photoUrl) {
        refImages.push({ url: quote.photoUrl, mimeType: "image/jpeg" });
      }
      if (productImageUrl) {
        refImages.push({ url: productImageUrl, mimeType: "image/jpeg" });
      }
      if (refImages.length > 0) {
        genOptions.originalImages = refImages;
      }

      const result = await generateImage(genOptions);
      if (!result.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Image generation did not return a URL" });
      }

      const finalUrl = await applyRenderWatermark(result.url, ctx.user.id, ctx.tenant?.id ?? null);

      // Log cost
      await logRenderCost({
        userId: ctx.user.id,
        projectId: input.quoteId,
        renderMode: input.mode,
        stylePreset: input.stylePreset,
        tenantId: ctx.tenant?.id,
      });

      // Build history entry
      const entry: RenderHistoryEntry = {
        id: randomUUID(),
        imageUrl: finalUrl,
        prompt,
        promptMode: input.mode,
        createdAt: Date.now(),
        stylePreset: input.stylePreset,
      };

      // Append to history
      const existing = parseRenderHistory(quote.renderHistory);
      const updated = [...existing, entry];

      const db = await getDb();
      if (db) {
        await db.update(deckQuotes)
          .set({ renderHistory: JSON.stringify(updated) })
          .where(eq(deckQuotes.id, input.quoteId));
      }

      return { id: entry.id, imageUrl: entry.imageUrl, prompt: entry.prompt, promptMode: entry.promptMode, createdAt: entry.createdAt };
    }),

  /**
   * Generate an AI render for an Eclipse quote.
   */
  generateEclipse: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      mode: z.enum(["full", "quick"]).default("full"),
      stylePreset: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });
      }

      const renderInput = eclipseQuoteToRenderInput(quote);
      let prompt = input.mode === "quick"
        ? buildEclipseRenderPromptQuick(renderInput)
        : buildEclipseRenderPrompt(renderInput);

      if (input.stylePreset) {
        const preset = getPresetById(input.stylePreset);
        if (preset) prompt += `\n\n${preset.promptModifier}`;
      }

      // Build generation options — include photo as originalImages if available
      const eclipseGenOptions: { prompt: string; originalImages?: { url: string; mimeType: string }[] } = { prompt };
      if (quote.photoUrl) {
        eclipseGenOptions.originalImages = [{ url: quote.photoUrl, mimeType: "image/jpeg" }];
      }

      const result = await generateImage(eclipseGenOptions);
      if (!result.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Image generation did not return a URL" });
      }

      const finalUrl = await applyRenderWatermark(result.url, ctx.user.id, ctx.tenant?.id ?? null);

      // Log cost
      await logRenderCost({
        userId: ctx.user.id,
        projectId: input.quoteId,
        renderMode: input.mode,
        stylePreset: input.stylePreset,
        tenantId: ctx.tenant?.id,
      });

      // Build history entry
      const entry: RenderHistoryEntry = {
        id: randomUUID(),
        imageUrl: finalUrl,
        prompt,
        promptMode: input.mode,
        createdAt: Date.now(),
        stylePreset: input.stylePreset,
      };

      // Append to history
      const existing = parseRenderHistory(quote.renderHistory);
      const updated = [...existing, entry];

      const db = await getDb();
      if (db) {
        await db.update(eclipseQuotes)
          .set({ renderHistory: JSON.stringify(updated) })
          .where(eq(eclipseQuotes.id, input.quoteId));
      }

      return { id: entry.id, imageUrl: entry.imageUrl, prompt: entry.prompt, promptMode: entry.promptMode, createdAt: entry.createdAt };
    }),

  /**
   * Get render history for a Deck quote.
   */
  deckHistory: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });
      return parseRenderHistory(quote.renderHistory);
    }),

  /**
   * Get render history for an Eclipse quote.
   */
  eclipseHistory: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });
      return parseRenderHistory(quote.renderHistory);
    }),

  /**
   * Delete a render from Deck quote history.
   */
  deleteDeckRender: tenantProcedure
    .input(z.object({ quoteId: z.number(), renderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });

      const history = parseRenderHistory(quote.renderHistory);
      const filtered = history.filter(r => r.id !== input.renderId);

      const db = await getDb();
      if (db) {
        await db.update(deckQuotes)
          .set({ renderHistory: JSON.stringify(filtered) })
          .where(eq(deckQuotes.id, input.quoteId));
      }
      return { success: true };
    }),

  /**
   * Delete a render from Eclipse quote history.
   */
  deleteEclipseRender: tenantProcedure
    .input(z.object({ quoteId: z.number(), renderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });

      const history = parseRenderHistory(quote.renderHistory);
      const filtered = history.filter(r => r.id !== input.renderId);

      const db = await getDb();
      if (db) {
        await db.update(eclipseQuotes)
          .set({ renderHistory: JSON.stringify(filtered) })
          .where(eq(eclipseQuotes.id, input.quoteId));
      }
      return { success: true };
    }),

  /**
   * Toggle favourite on a Deck render.
   */
  toggleDeckFavourite: tenantProcedure
    .input(z.object({ quoteId: z.number(), renderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });

      const history = parseRenderHistory(quote.renderHistory);
      const updated = history.map(r => r.id === input.renderId ? { ...r, isFavourite: !r.isFavourite } : r);

      const db = await getDb();
      if (db) {
        await db.update(deckQuotes)
          .set({ renderHistory: JSON.stringify(updated) })
          .where(eq(deckQuotes.id, input.quoteId));
      }
      const toggled = updated.find(r => r.id === input.renderId);
      return { success: true, isFavourite: toggled?.isFavourite ?? false };
    }),

  /**
   * Toggle favourite on an Eclipse render.
   */
  toggleEclipseFavourite: tenantProcedure
    .input(z.object({ quoteId: z.number(), renderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });

      const history = parseRenderHistory(quote.renderHistory);
      const updated = history.map(r => r.id === input.renderId ? { ...r, isFavourite: !r.isFavourite } : r);

      const db = await getDb();
      if (db) {
        await db.update(eclipseQuotes)
          .set({ renderHistory: JSON.stringify(updated) })
          .where(eq(eclipseQuotes.id, input.quoteId));
      }
      const toggled = updated.find(r => r.id === input.renderId);
      return { success: true, isFavourite: toggled?.isFavourite ?? false };
    }),

  /**
   * Upload a site photo for a Deck quote (used as base for AI render).
   */
  uploadDeckPhoto: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });

      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `deck-renders/${ctx.user.id}/${input.quoteId}/photo-${randomUUID()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      const db = await getDb();
      if (db) {
        await db.update(deckQuotes)
          .set({ photoUrl: url, photoKey: key })
          .where(eq(deckQuotes.id, input.quoteId));
      }

      return { url, key };
    }),

  /**
   * Upload a site photo for an Eclipse quote (used as base for AI render).
   */
  uploadEclipsePhoto: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      base64: z.string(),
      mimeType: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });

      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `eclipse-renders/${ctx.user.id}/${input.quoteId}/photo-${randomUUID()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      const db = await getDb();
      if (db) {
        await db.update(eclipseQuotes)
          .set({ photoUrl: url, photoKey: key })
          .where(eq(eclipseQuotes.id, input.quoteId));
      }

      return { url, key };
    }),

  /**
   * Remove the site photo from a Deck quote.
   */
  removeDeckPhoto: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });

      const db = await getDb();
      if (db) {
        await db.update(deckQuotes)
          .set({ photoUrl: null, photoKey: null, calibrationData: null })
          .where(eq(deckQuotes.id, input.quoteId));
      }
      return { success: true };
    }),

  /**
   * Remove the site photo from an Eclipse quote.
   */
  removeEclipsePhoto: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });

      const db = await getDb();
      if (db) {
        await db.update(eclipseQuotes)
          .set({ photoUrl: null, photoKey: null, calibrationData: null })
          .where(eq(eclipseQuotes.id, input.quoteId));
      }
      return { success: true };
    }),

  /**
   * Get photo info for a Deck quote.
   */
  getDeckPhoto: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });
      return { photoUrl: quote.photoUrl || null, calibrationData: quote.calibrationData || null };
    }),

  /**
   * Get photo info for an Eclipse quote.
   */
  getEclipsePhoto: tenantProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });
      return { photoUrl: quote.photoUrl || null, calibrationData: quote.calibrationData || null };
    }),
  /**
   * Save calibration data for a Deck quote photo.
   */
  saveDeckCalibration: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      calibrationData: z.object({
        point1: z.object({ x: z.number(), y: z.number() }),
        point2: z.object({ x: z.number(), y: z.number() }),
        realDistanceMm: z.number(),
      }).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getDeckQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Deck quote not found" });
      const db = await getDb();
      if (db) {
        await db.update(deckQuotes)
          .set({ calibrationData: input.calibrationData })
          .where(eq(deckQuotes.id, input.quoteId));
      }
      return { success: true };
    }),
  /**
   * Save calibration data for an Eclipse quote photo.
   */
  saveEclipseCalibration: tenantProcedure
    .input(z.object({
      quoteId: z.number(),
      calibrationData: z.object({
        point1: z.object({ x: z.number(), y: z.number() }),
        point2: z.object({ x: z.number(), y: z.number() }),
        realDistanceMm: z.number(),
      }).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await getEclipseQuote(input.quoteId, ctx.user.id, ctx.user.role, ctx.tenant.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Eclipse quote not found" });
      const db = await getDb();
      if (db) {
        await db.update(eclipseQuotes)
          .set({ calibrationData: input.calibrationData })
          .where(eq(eclipseQuotes.id, input.quoteId));
      }
      return { success: true };
    }),
});
