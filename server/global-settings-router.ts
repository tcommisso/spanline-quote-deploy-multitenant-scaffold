import { router, publicProcedure, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { z } from "zod";
import { getActiveStorageProvider, isStorageConfigured, storagePut } from "./storage";
import crypto from "crypto";
import { ENV } from "./_core/env";
import {
  getTenantAppSetting,
  removeTenantAppSetting,
  setTenantAppSetting,
} from "./tenant-settings-store";
import {
  NAVIGATION_SETTINGS_KEY,
  normalizeNavigationSettings,
} from "../shared/navigation-config";

const LOGIN_BACKGROUND_MAX_BYTES = 1.5 * 1024 * 1024;
const LOGIN_BACKGROUND_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function loginBackgroundDataUrl(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`;
}

function parseCsv(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

export const globalSettingsRouter = router({
  // Get a setting by key (any authenticated user can read)
  get: tenantProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      return getTenantAppSetting(ctx.tenant?.id, input.key);
    }),

  // Set a setting (tenant admin only)
  set: tenantAdminProcedure
    .input(z.object({ key: z.string(), value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      return setTenantAppSetting(ctx.tenant!.id, input.key, input.value);
    }),

  // Get colour palette config (convenience wrapper)
  getColourPalette: tenantProcedure.query(async ({ ctx }) => {
    // Expected shape: { defaultGroup: string, sectionOverrides: { [sectionKey]: string (comma-separated groups) } }
    return (await getTenantAppSetting(ctx.tenant?.id, "colourPalette") as { defaultGroup?: string; sectionOverrides?: Record<string, string> } | null) ?? { defaultGroup: "", sectionOverrides: {} };
  }),

  // Set colour palette config (tenant admin only)
  setColourPalette: tenantAdminProcedure
    .input(z.object({
      defaultGroup: z.string(),
      sectionOverrides: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      return setTenantAppSetting(ctx.tenant!.id, "colourPalette", input);
    }),

  // Get AI render pricing settings
  getRenderPricing: tenantProcedure.query(async ({ ctx }) => {
    const stored = await getTenantAppSetting<Partial<RenderPricingSettings>>(ctx.tenant?.id, "renderPricing");
    return { ...getDefaultRenderPricing(), ...stored };
  }),

  // Set AI render pricing settings (tenant admin only)
  setRenderPricing: tenantAdminProcedure
    .input(z.object({
      fullRenderCostAud: z.number().min(0).max(10),
      quickRenderCostAud: z.number().min(0).max(10),
      batchRenderCostAud: z.number().min(0).max(10),
      monthlyBudgetAud: z.number().min(0).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      return setTenantAppSetting(ctx.tenant!.id, "renderPricing", input);
    }),

  // Read-only AI provider state. Secrets remain platform-managed in Railway.
  getAiProviderState: tenantAdminProcedure.query(async ({ ctx }) => {
    const pricing = {
      ...getDefaultRenderPricing(),
      ...(await getTenantAppSetting<Partial<RenderPricingSettings>>(ctx.tenant?.id, "renderPricing")),
    };
    const configured = Boolean(ENV.openAiApiKey);

    return {
      provider: "OpenAI",
      providerMode: "platform_managed",
      connectionSource: "Railway environment variables",
      configured,
      apiKey: {
        configured,
        source: "OPENAI_API_KEY",
        editableInApp: false,
      },
      text: {
        model: ENV.openAiModel || "gpt-4o-mini",
        fallbackModels: parseCsv(ENV.openAiModelFallbacks),
      },
      image: {
        model: ENV.openAiImageModel || "gpt-image-2",
        fallbackModels: parseCsv(ENV.openAiImageModelFallbacks),
      },
      transcription: {
        model: ENV.openAiTranscriptionModel || "gpt-4o-mini-transcribe",
      },
      tenantLimits: {
        fullRenderCostAud: pricing.fullRenderCostAud,
        quickRenderCostAud: pricing.quickRenderCostAud,
        batchRenderCostAud: pricing.batchRenderCostAud,
        monthlyBudgetAud: pricing.monthlyBudgetAud,
      },
    };
  }),

  // Get role-based App Central and mobile bottom navigation settings.
  getNavigationSettings: tenantProcedure.query(async ({ ctx }) => {
    const stored = await getTenantAppSetting(ctx.tenant?.id, NAVIGATION_SETTINGS_KEY);
    return normalizeNavigationSettings(stored);
  }),

  // Set role-based App Central and mobile bottom navigation settings.
  setNavigationSettings: tenantAdminProcedure
    .input(z.any())
    .mutation(async ({ ctx, input }) => {
      const settings = normalizeNavigationSettings(input);
      await setTenantAppSetting(ctx.tenant!.id, NAVIGATION_SETTINGS_KEY, settings);
      return settings;
    }),

  // ─── Approvals Overdue Threshold ──────────────────────────────────────────────────
  getBaOverdueThreshold: tenantProcedure.query(async ({ ctx }) => {
    return (await getTenantAppSetting<number>(ctx.tenant?.id, "baOverdueThresholdDays")) ?? 30;
  }),
  setBaOverdueThreshold: tenantAdminProcedure
    .input(z.object({ days: z.number().min(1).max(365) }))
    .mutation(async ({ ctx, input }) => {
      return setTenantAppSetting(ctx.tenant!.id, "baOverdueThresholdDays", input.days);
    }),

  // ─── Login Background Image ──────────────────────────────────────────────

  // Public: anyone (including unauthenticated) can fetch the login background
  getLoginBackground: publicProcedure.query(async ({ ctx }) => {
    return (await getTenantAppSetting(ctx.tenant?.id, "loginBackgroundImage") as { url: string; originalName?: string; uploadedAt?: string } | null) ?? null;
  }),

  // Admin: upload a new login background image (receives base64)
  uploadLoginBackground: tenantAdminProcedure
    .input(z.object({
      fileBase64: z.string(), // base64-encoded image data
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      if (!LOGIN_BACKGROUND_ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new Error("Unsupported image type. Please upload a JPEG, PNG, or WebP image.");
      }
      if (fileBuffer.byteLength > LOGIN_BACKGROUND_MAX_BYTES) {
        throw new Error("Login background is too large after compression. Please choose a smaller image.");
      }

      const suffix = crypto.randomBytes(4).toString("hex");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `company/login-background/tenant-${ctx.tenant!.id}/login-background-${suffix}.${ext}`;
      const storageResult = isStorageConfigured()
        ? await storagePut(key, fileBuffer, input.mimeType)
        : { key, url: loginBackgroundDataUrl(input.mimeType, input.fileBase64) };

      const value = {
        url: storageResult.url,
        key: storageResult.key,
        storageProvider: getActiveStorageProvider() ?? "database",
        originalName: input.fileName,
        uploadedAt: new Date().toISOString(),
      };

      await setTenantAppSetting(ctx.tenant!.id, "loginBackgroundImage", value);

      return value;
    }),

  // Admin: remove the login background image (revert to default)
  removeLoginBackground: tenantAdminProcedure
    .mutation(async ({ ctx }) => {
      return removeTenantAppSetting(ctx.tenant!.id, "loginBackgroundImage");
    }),

  // Public: get login tagline text
  getLoginTagline: publicProcedure.query(async ({ ctx }) => {
    return (await getTenantAppSetting(ctx.tenant?.id, "loginTagline") as { headline: string; subtitle: string; signInPrompt?: string } | null) ?? null;
  }),

  // Admin: set login tagline text
  setLoginTagline: tenantAdminProcedure
    .input(z.object({
      headline: z.string().max(100),
      subtitle: z.string().max(200),
      signInPrompt: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const value = { headline: input.headline, subtitle: input.subtitle, signInPrompt: input.signInPrompt || "" };
      return setTenantAppSetting(ctx.tenant!.id, "loginTagline", value);
    }),

  // Get colour scheme hex values
  getColourScheme: tenantProcedure.query(async ({ ctx }) => {
    return (await getTenantAppSetting(ctx.tenant?.id, "colourSchemeHex") as Record<string, string> | null) ?? null;
  }),

  // Set colour scheme hex values (tenant admin only)
  setColourScheme: tenantAdminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ ctx, input }) => {
      return setTenantAppSetting(ctx.tenant!.id, "colourSchemeHex", input);
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
