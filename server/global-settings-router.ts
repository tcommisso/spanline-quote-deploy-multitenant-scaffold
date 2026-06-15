import { router, adminProcedure, protectedProcedure, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { globalSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "./storage";
import crypto from "crypto";

export const globalSettingsRouter = router({
  // Get a setting by key (any authenticated user can read)
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.key, input.key))
        .limit(1);
      return row?.value ?? null;
    }),

  // Set a setting (admin only)
  set: adminProcedure
    .input(z.object({ key: z.string(), value: z.any() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Upsert: insert or update on duplicate key
      await db
        .insert(globalSettings)
        .values({ key: input.key, value: input.value })
        .onDuplicateKeyUpdate({ set: { value: input.value } });
      return { success: true };
    }),

  // Get colour palette config (convenience wrapper)
  getColourPalette: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { defaultGroup: "", sectionOverrides: {} };
    const [row] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "colourPalette"))
      .limit(1);
    // Expected shape: { defaultGroup: string, sectionOverrides: { [sectionKey]: string (comma-separated groups) } }
    return (row?.value as { defaultGroup?: string; sectionOverrides?: Record<string, string> }) ?? { defaultGroup: "", sectionOverrides: {} };
  }),

  // Set colour palette config (admin only)
  setColourPalette: adminProcedure
    .input(z.object({
      defaultGroup: z.string(),
      sectionOverrides: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .insert(globalSettings)
        .values({ key: "colourPalette", value: input })
        .onDuplicateKeyUpdate({ set: { value: input } });
      return { success: true };
    }),

  // Get AI render pricing settings
  getRenderPricing: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return getDefaultRenderPricing();
    const [row] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "renderPricing"))
      .limit(1);
    const stored = row?.value as Partial<RenderPricingSettings> | null;
    return { ...getDefaultRenderPricing(), ...stored };
  }),

  // Set AI render pricing settings (admin only)
  setRenderPricing: adminProcedure
    .input(z.object({
      fullRenderCostAud: z.number().min(0).max(10),
      quickRenderCostAud: z.number().min(0).max(10),
      batchRenderCostAud: z.number().min(0).max(10),
      monthlyBudgetAud: z.number().min(0).max(10000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .insert(globalSettings)
        .values({ key: "renderPricing", value: input })
        .onDuplicateKeyUpdate({ set: { value: input } });
      return { success: true };
    }),
  // ─── Approvals Overdue Threshold ──────────────────────────────────────────────────
  getBaOverdueThreshold: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return 30;
    const [row] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "baOverdueThresholdDays"))
      .limit(1);
    return (row?.value as number) ?? 30;
  }),
  setBaOverdueThreshold: adminProcedure
    .input(z.object({ days: z.number().min(1).max(365) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .insert(globalSettings)
        .values({ key: "baOverdueThresholdDays", value: input.days })
        .onDuplicateKeyUpdate({ set: { value: input.days } });
      return { success: true };
    }),

  // ─── Login Background Image ──────────────────────────────────────────────

  // Public: anyone (including unauthenticated) can fetch the login background
  getLoginBackground: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "loginBackgroundImage"))
      .limit(1);
    return (row?.value as { url: string; originalName?: string; uploadedAt?: string } | null) ?? null;
  }),

  // Admin: upload a new login background image (receives base64)
  uploadLoginBackground: adminProcedure
    .input(z.object({
      fileBase64: z.string(), // base64-encoded image data
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `company/login-background-${suffix}.${ext}`;
      const { url } = await storagePut(key, fileBuffer, input.mimeType);

      const value = {
        url,
        key,
        originalName: input.fileName,
        uploadedAt: new Date().toISOString(),
      };

      await db
        .insert(globalSettings)
        .values({ key: "loginBackgroundImage", value })
        .onDuplicateKeyUpdate({ set: { value } });

      return value;
    }),

  // Admin: remove the login background image (revert to default)
  removeLoginBackground: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(globalSettings).where(eq(globalSettings.key, "loginBackgroundImage"));
      return { success: true };
    }),

  // Public: get login tagline text
  getLoginTagline: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "loginTagline"))
      .limit(1);
    return (row?.value as { headline: string; subtitle: string; signInPrompt?: string } | null) ?? null;
  }),

  // Admin: set login tagline text
  setLoginTagline: adminProcedure
    .input(z.object({
      headline: z.string().max(100),
      subtitle: z.string().max(200),
      signInPrompt: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const value = { headline: input.headline, subtitle: input.subtitle, signInPrompt: input.signInPrompt || "" };
      await db
        .insert(globalSettings)
        .values({ key: "loginTagline", value })
        .onDuplicateKeyUpdate({ set: { value } });
      return { success: true };
    }),

  // Get colour scheme hex values
  getColourScheme: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "colourSchemeHex"))
      .limit(1);
    return (row?.value as Record<string, string>) ?? null;
  }),

  // Set colour scheme hex values (admin only)
  setColourScheme: adminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .insert(globalSettings)
        .values({ key: "colourSchemeHex", value: input })
        .onDuplicateKeyUpdate({ set: { value: input } });
      return { success: true };
    }),
});

// ─── Render Pricing Types & Defaults ─────────────────────────────────────────
export interface RenderPricingSettings {
  fullRenderCostAud: number;
  quickRenderCostAud: number;
  batchRenderCostAud: number;
  monthlyBudgetAud: number;
}

export function getDefaultRenderPricing(): RenderPricingSettings {
  return {
    fullRenderCostAud: 0.08,
    quickRenderCostAud: 0.04,
    batchRenderCostAud: 0.06,
    monthlyBudgetAud: 10.0,
  };
}

export function getRenderCostAud(mode: string, pricing: RenderPricingSettings): number {
  switch (mode) {
    case "full": return pricing.fullRenderCostAud;
    case "quick": return pricing.quickRenderCostAud;
    case "batch": return pricing.batchRenderCostAud;
    default: return pricing.quickRenderCostAud;
  }
}
