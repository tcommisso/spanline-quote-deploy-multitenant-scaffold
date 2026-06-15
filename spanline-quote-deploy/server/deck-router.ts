import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as deckDb from "./deck-db";
import { calculateDeckPricing, type DeckCalcInput } from "./deck-calc";
import { storagePut } from "./storage";

export const deckRouter = router({
  // ─── Deck Products ──────────────────────────────────────────────────────
  products: router({
    list: protectedProcedure
      .input(z.object({ brand: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return deckDb.getDeckProducts(input?.brand);
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return deckDb.getDeckProductById(input.id);
      }),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        productName: z.string().min(1),
        brand: z.string().min(1),
        profile: z.string().nullable().optional(),
        productRange: z.string().nullable().optional(),
        widthMm: z.coerce.number().optional(),
        thicknessMm: z.coerce.number().optional(),
        boardLengthM: z.coerce.number().optional(),
        standardBoardLengthM: z.coerce.number().optional(),
        pricePerLm: z.coerce.number().optional(),
        effectiveCoverMm: z.coerce.number().optional(),
        retailRatePerM2: z.coerce.number().optional(),
        clipFixingCostPerM2: z.coerce.number().optional(),
        colourOptions: z.string().nullable().optional(),
        wasteDefault: z.coerce.number().optional(),
        maxJoistSpacingMm: z.coerce.number().optional(),
        boardLengthMm: z.coerce.number().optional(),
        boardTypes: z.array(z.string()).nullable().optional(),
        suitableForPictureFrame: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        // Convert numbers to strings for decimal columns
        if (data.boardLengthM != null) data.boardLengthM = String(data.boardLengthM);
        if (data.standardBoardLengthM != null) data.standardBoardLengthM = String(data.standardBoardLengthM);
        if (data.pricePerLm != null) data.pricePerLm = String(data.pricePerLm);
        if (data.retailRatePerM2 != null) data.retailRatePerM2 = String(data.retailRatePerM2);
        if (data.clipFixingCostPerM2 != null) data.clipFixingCostPerM2 = String(data.clipFixingCostPerM2);
        if (data.wasteDefault != null) data.wasteDefault = String(data.wasteDefault);
        if (data.boardTypes != null) data.boardTypes = JSON.stringify(data.boardTypes);
        return deckDb.upsertDeckProduct(data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deckDb.deleteDeckProduct(input.id);
        return { success: true };
      }),
    uploadImage: adminProcedure
      .input(z.object({
        productId: z.number(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string().default("image/jpeg"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const suffix = Math.random().toString(36).slice(2, 8);
        const fileKey = `deck-products/product-${input.productId}/${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.contentType);
        await deckDb.updateDeckProductImage(input.productId, url);
        return { url };
      }),
  }),

  // ─── Deck Framing ───────────────────────────────────────────────────────
  framing: router({
    list: protectedProcedure
      .input(z.object({ frameType: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return deckDb.getDeckFraming(input?.frameType);
      }),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        productName: z.string().min(1),
        systemName: z.string().nullable().optional(),
        frameType: z.string().min(1),
        beamSize: z.string().min(1),
        memberCategory: z.string().nullable().optional(),
        memberSize: z.string().nullable().optional(),
        pricePerLm: z.coerce.number().optional(),
        ratePerUnit: z.coerce.number().optional(),
        weightPerLm: z.coerce.number().optional(),
        joistSpacingMm: z.coerce.number().optional(),
        beamSpacingM: z.coerce.number().optional(),
        postSpacingM: z.coerce.number().optional(),
        recommendedMinDeckSize: z.coerce.number().optional(),
        recommendedMaxDeckSize: z.coerce.number().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        if (data.pricePerLm != null) data.pricePerLm = String(data.pricePerLm);
        if (data.ratePerUnit != null) data.ratePerUnit = String(data.ratePerUnit);
        if (data.weightPerLm != null) data.weightPerLm = String(data.weightPerLm);
        if (data.beamSpacingM != null) data.beamSpacingM = String(data.beamSpacingM);
        if (data.postSpacingM != null) data.postSpacingM = String(data.postSpacingM);
        if (data.recommendedMinDeckSize != null) data.recommendedMinDeckSize = String(data.recommendedMinDeckSize);
        if (data.recommendedMaxDeckSize != null) data.recommendedMaxDeckSize = String(data.recommendedMaxDeckSize);
        return deckDb.upsertDeckFraming(data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deckDb.deleteDeckFraming(input.id);
        return { success: true };
      }),
    /** Fetch engineering pricing overrides for a framing system (spanmor/sfs01/clickdeck) */
    engineeringPricing: protectedProcedure
      .input(z.object({ systemName: z.string() }))
      .query(async ({ input }) => {
        return deckDb.getEngineeringPricing(input.systemName);
      }),
  }),

  // ─── Deck Labour Rules ──────────────────────────────────────────────────
  labourRules: router({
    list: protectedProcedure.query(async () => {
      return deckDb.getDeckLabourRules();
    }),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        ruleName: z.string().min(1),
        baseRatePerM2: z.coerce.number(),
        slopingSiteMultiplier: z.coerce.number().optional(),
        restrictedAccessMultiplier: z.coerce.number().optional(),
        elevatedDeckMultiplier: z.coerce.number().optional(),
        pictureFrameLabourUplift: z.coerce.number().optional(),
        splitLevelUplift: z.coerce.number().optional(),
        multiLevelUplift: z.coerce.number().optional(),
        description: z.string().nullish().transform(v => v ?? ""),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        data.baseRatePerM2 = String(data.baseRatePerM2);
        if (data.slopingSiteMultiplier != null) data.slopingSiteMultiplier = String(data.slopingSiteMultiplier);
        if (data.restrictedAccessMultiplier != null) data.restrictedAccessMultiplier = String(data.restrictedAccessMultiplier);
        if (data.elevatedDeckMultiplier != null) data.elevatedDeckMultiplier = String(data.elevatedDeckMultiplier);
        if (data.pictureFrameLabourUplift != null) data.pictureFrameLabourUplift = String(data.pictureFrameLabourUplift);
        if (data.splitLevelUplift != null) data.splitLevelUplift = String(data.splitLevelUplift);
        if (data.multiLevelUplift != null) data.multiLevelUplift = String(data.multiLevelUplift);
        return deckDb.upsertDeckLabourRule(data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deckDb.deleteDeckLabourRule(input.id);
        return { success: true };
      }),
  }),

  // ─── Deck Pricing Rules ─────────────────────────────────────────────────────
  pricingRules: router({
    list: protectedProcedure.query(async () => {
      return deckDb.getDeckPricingRules();
    }),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        ruleName: z.string().min(1),
        defaultDepositPercent: z.coerce.number().optional(),
        gstPercent: z.coerce.number().optional(),
        quoteValidityDays: z.coerce.number().optional(),
        defaultMarginPercent: z.coerce.number().optional(),
        minimumMarginPercent: z.coerce.number().optional(),
        stretchMarginPercent: z.coerce.number().optional(),
        restrictedAccessSurcharge: z.coerce.number().optional(),
        baseDeliveryFee: z.coerce.number().optional(),
        managerApprovalBelowMargin: z.coerce.number().optional(),
        notes: z.string().nullish().transform(v => v ?? ""),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        if (data.defaultDepositPercent != null) data.defaultDepositPercent = String(data.defaultDepositPercent);
        if (data.gstPercent != null) data.gstPercent = String(data.gstPercent);
        if (data.defaultMarginPercent != null) data.defaultMarginPercent = String(data.defaultMarginPercent);
        if (data.minimumMarginPercent != null) data.minimumMarginPercent = String(data.minimumMarginPercent);
        if (data.stretchMarginPercent != null) data.stretchMarginPercent = String(data.stretchMarginPercent);
        if (data.restrictedAccessSurcharge != null) data.restrictedAccessSurcharge = String(data.restrictedAccessSurcharge);
        if (data.baseDeliveryFee != null) data.baseDeliveryFee = String(data.baseDeliveryFee);
        if (data.managerApprovalBelowMargin != null) data.managerApprovalBelowMargin = String(data.managerApprovalBelowMargin);
        return deckDb.upsertDeckPricingRule(data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deckDb.deleteDeckPricingRule(input.id);
        return { success: true };
      }),
  }),

  // ─── Deck Add-On Items ────────────────────────────────────────────────────
  addonItems: router({
    list: protectedProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return deckDb.getDeckAddonItems(input?.category);
      }),
    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        itemName: z.string().min(1),
        category: z.string().min(1),
        unit: z.string().nullable().optional(),
        unitPrice: z.coerce.number().optional(),
        labourRate: z.coerce.number().optional(),
        pricingMethod: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        if (data.unitPrice != null) data.unitPrice = String(data.unitPrice);
        if (data.labourRate != null) data.labourRate = String(data.labourRate);
        return deckDb.upsertDeckAddonItem(data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deckDb.deleteDeckAddonItem(input.id);
        return { success: true };
      }),
  }),

  // ─── Deck Quotes ──────────────────────────────────────────────────────────
  quotes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") {
        return deckDb.getDeckQuotes();
      }
      return deckDb.getDeckQuotes(ctx.user.id);
    }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await deckDb.getDeckQuoteById(input.id);
        if (!quote) return null;
        if (ctx.user.role !== "admin" && quote.userId !== ctx.user.id) return null;
        return quote;
      }),
    create: protectedProcedure
      .input(z.object({
        clientId: z.number().optional(),
        clientName: z.string().min(1),
        clientPhone: z.string().nullable().optional(),
        clientEmail: z.string().nullable().optional(),
        clientCompany: z.string().nullable().optional(),
        siteAddress: z.string().nullable().optional(),
        designAdvisor: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quoteNumber = await deckDb.getNextDeckQuoteNumber();
        const result = await deckDb.createDeckQuote({
          ...input,
          userId: ctx.user.id,
          quoteNumber,
          status: "draft",
        });
        // If the lead (clientId) is archived, unarchive it
        let leadUnarchived = false;
        if (input.clientId) {
          try {
            const { updateLead, getLead } = await import("./crm-db");
            const lead = await getLead(input.clientId);
            if (lead && lead.archived) {
              await updateLead(input.clientId, { archived: false } as any);
              leadUnarchived = true;
            }
          } catch (e) { /* non-blocking */ }
        }
        return { ...result, leadUnarchived };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await deckDb.getDeckQuoteById(input.id);
        if (!quote) throw new Error("Quote not found");
        if (ctx.user.role !== "admin" && quote.userId !== ctx.user.id) {
          throw new Error("Not authorized");
        }
        // Track override history when selectedAddons changes
        if (input.data.selectedAddons) {
          try {
            const prevAddons: Array<{ addonItemId: number; priceOverride?: number | null }> =
              (quote as any).selectedAddons ? JSON.parse((quote as any).selectedAddons) : [];
            const newAddons: Array<{ addonItemId: number; priceOverride?: number | null; name?: string }> =
              typeof input.data.selectedAddons === "string"
                ? JSON.parse(input.data.selectedAddons)
                : input.data.selectedAddons;
            const historyEntries: Array<any> = [];
            for (const newAddon of newAddons) {
              if (newAddon.priceOverride == null) continue;
              const prevAddon = prevAddons.find(p => p.addonItemId === newAddon.addonItemId);
              const prevPrice = prevAddon?.priceOverride ?? null;
              // Only log if override changed (new override set, or value changed)
              if (prevPrice !== newAddon.priceOverride) {
                historyEntries.push({
                  deckQuoteId: input.id,
                  addonItemId: newAddon.addonItemId,
                  addonItemName: newAddon.name || `Item #${newAddon.addonItemId}`,
                  previousPrice: prevPrice != null ? String(prevPrice) : null,
                  newPrice: String(newAddon.priceOverride),
                  changedByUserId: ctx.user.id,
                  changedByName: ctx.user.name || "Unknown",
                });
              }
            }
            // Also log when an override is removed (was set, now null)
            for (const prevAddon of prevAddons) {
              if (prevAddon.priceOverride == null) continue;
              const newAddon = newAddons.find(n => n.addonItemId === prevAddon.addonItemId);
              if (!newAddon || newAddon.priceOverride == null) {
                historyEntries.push({
                  deckQuoteId: input.id,
                  addonItemId: prevAddon.addonItemId,
                  addonItemName: newAddon?.name || `Item #${prevAddon.addonItemId}`,
                  previousPrice: String(prevAddon.priceOverride),
                  newPrice: null,
                  changedByUserId: ctx.user.id,
                  changedByName: ctx.user.name || "Unknown",
                });
              }
            }
            if (historyEntries.length > 0) {
              await deckDb.insertOverrideHistoryEntries(historyEntries);
            }
          } catch (e) {
            console.error("[DeckQuote] Failed to record override history:", e);
          }
        }
        return deckDb.updateDeckQuote(input.id, input.data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const quote = await deckDb.getDeckQuoteById(input.id);
        if (!quote) throw new Error("Quote not found");
        await deckDb.deleteDeckQuote(input.id);
        return { success: true };
      }),
    archive: protectedProcedure
      .input(z.object({ id: z.number(), archived: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await deckDb.getDeckQuoteById(input.id);
        if (!quote) throw new Error("Quote not found");
        if (ctx.user.role !== "admin" && quote.userId !== ctx.user.id) {
          throw new Error("Not authorized");
        }
        await deckDb.updateDeckQuote(input.id, { archived: input.archived });
        return { success: true };
      }),
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await deckDb.getDeckQuoteById(input.id);
        if (!quote) throw new Error("Quote not found");
        if (ctx.user.role !== "admin" && quote.userId !== ctx.user.id) {
          throw new Error("Not authorized");
        }
        const newNumber = await deckDb.getNextDeckQuoteNumber();
        const newQuote = await deckDb.duplicateDeckQuote(input.id, ctx.user.id, newNumber);
        return { id: newQuote?.id, quoteNumber: newNumber };
      }),
    overrideHistory: protectedProcedure
      .input(z.object({ deckQuoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Only admin can view override history
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new Error("Not authorized");
        }
        return deckDb.getOverrideHistoryForQuote(input.deckQuoteId);
      }),
    lastOverrides: adminProcedure
      .query(async () => {
        return deckDb.getLastOverridePerQuote();
      }),
  }),

  // ─── Pricing Calculation ────────────────────────────────────────────────
  calculate: protectedProcedure
    .input(z.object({
      deckWidthM: z.number().positive(),
      deckProjectionM: z.number().positive(),
      areaM2Override: z.number().positive().optional(),
      perimeterMOverride: z.number().positive().optional(),
      deckingRatePerM2: z.number().nonnegative(),
      clipFixingCostPerM2: z.number().nonnegative(),
      wastePercent: z.number().nonnegative(),
      engineeringBoardCost: z.number().nonnegative().optional(),
      engineeringBoardCount: z.number().nonnegative().optional(),
      // Fascia board pricing
      fasciaRatePerBoard: z.number().nonnegative().optional(),
      fasciaBoardCount: z.number().nonnegative().optional(),
      fasciaBoardCost: z.number().nonnegative().optional(),
      // Edge board pricing
      edgeRatePerBoard: z.number().nonnegative().optional(),
      edgeBoardCount: z.number().nonnegative().optional(),
      edgeBoardCost: z.number().nonnegative().optional(),
      framingPricePerLm: z.number().nonnegative(),
      beamSpacingM: z.number().positive(),
      joistSpacingMm: z.number().positive(),
      postSpacingM: z.number().positive(),
      // Engineering BOM override (from subfloor-calc engine)
      engineeringFramingCost: z.number().nonnegative().optional(),
      engineeringBeamProfile: z.string().nullable().optional(),
      baseLabourRatePerM2: z.number().nonnegative(),
      slopingSite: z.boolean(),
      slopingSiteMultiplier: z.number(),
      restrictedAccess: z.boolean(),
      restrictedAccessMultiplier: z.number(),
      elevatedDeck: z.boolean(),
      elevatedDeckMultiplier: z.number(),
      pictureFrame: z.boolean(),
      pictureFrameLabourUplift: z.number(),
      splitLevel: z.boolean(),
      splitLevelUplift: z.number(),
      multiLevel: z.boolean(),
      multiLevelUplift: z.number(),
      stairsRequired: z.boolean(),
      numberOfStairsFlights: z.number().nonnegative(),
      stairsCostPerFlight: z.number().nonnegative(),
      handrailRequired: z.boolean(),
      handrailCostPerLm: z.number().nonnegative(),
      screensRequired: z.boolean(),
      screensCostPerLm: z.number().nonnegative(),
      lightingRequired: z.boolean(),
      lightingCost: z.number().nonnegative(),
      demolitionRequired: z.boolean(),
      demolitionCostPerM2: z.number().nonnegative(),
      disposalRequired: z.boolean(),
      disposalCost: z.number().nonnegative(),
      engineeringRequired: z.boolean(),
      engineeringCost: z.number().nonnegative(),
      permitRequired: z.boolean(),
      permitCost: z.number().nonnegative(),
      dynamicAddons: z.array(z.object({
        addonItemId: z.number(),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        priceOverride: z.number().nonnegative().nullable().optional(),
        name: z.string().optional(),
      })).optional(),
      marginPercent: z.number().positive(),
      commissionPercent: z.number().nonnegative().default(0),
      gstPercent: z.number().nonnegative(),
      depositPercent: z.number().nonnegative(),
      baseDeliveryFee: z.number().nonnegative(),
      restrictedAccessSurcharge: z.number().nonnegative(),
      councilFees: z.number().nonnegative().default(0),
      homeWarranty: z.number().nonnegative().default(0),
    }))
    .mutation(async ({ input }) => {
      return calculateDeckPricing(input as DeckCalcInput);
    }),
});
