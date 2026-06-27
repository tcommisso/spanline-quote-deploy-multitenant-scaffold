import { z } from "zod";
import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getQuoteById } from "./db";
import {
  listSpecMappings,
  getActiveSpecMappings,
  getSpecMapping,
  createSpecMapping,
  updateSpecMapping,
  deleteSpecMapping,
  getQuoteItems,
  createQuoteItem,
  createQuoteItemsBatch,
  updateQuoteItem,
  deleteQuoteItem,
  deleteAutoItems,
  flagManualItemsForConfirmation,
  confirmQuoteItem,
  confirmAllItems,
  getAllProducts,
  listWindowDoorOptionModifiers,
  getActiveWindowDoorOptionModifiers,
  createWindowDoorOptionModifier,
  updateWindowDoorOptionModifier,
  deleteWindowDoorOptionModifier,
  logMappingChange,
  getMappingHistory,
  getAllMappingHistory,
} from "./spec-items-db";
import { generateItemsFromSpec, type SpecValues } from "../shared/specEngine";
import {
  enrichDerivedSpecValues,
  VALID_SPEC_FIELD_VALUES,
  VALID_SPEC_FORMULA_VARIABLES,
} from "../shared/spec-field-catalogue";

// Helper: get spec values from a quote record
function extractSpecValues(quote: Record<string, any>): SpecValues {
  const specValues: SpecValues = {};
  for (const [key, value] of Object.entries(quote)) {
    if (key.startsWith("spec") || key === "descriptionOfWork") {
      specValues[key] = value;
    }
  }
  return specValues;
}

async function assertQuoteAccess(quoteId: number, tenantId: number, _user?: { role?: string | null } | null) {
  const quote = await getQuoteById(quoteId, tenantId);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
  return quote;
}

const optionModifierProductTypeSchema = z.enum(["window", "door"]);
const optionModifierGroupSchema = z.enum(["glass_type", "tint", "obscurity", "etched", "screen", "pet_door", "other"]);
const optionModifierAdjustmentTypeSchema = z.enum(["percent", "fixed"]);

const optionModifierInputSchema = z.object({
  productType: optionModifierProductTypeSchema,
  optionGroup: optionModifierGroupSchema,
  optionValue: z.string().min(1),
  adjustmentType: optionModifierAdjustmentTypeSchema,
  costAdjustmentValue: z.union([z.string(), z.number()]).optional(),
  sellAdjustmentValue: z.union([z.string(), z.number()]).optional(),
  appliesTo: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  active: z.boolean().optional(),
});

const DEFAULT_OPTION_MODIFIERS = [
  { productType: "window", optionGroup: "glass_type", optionValue: "Double Glaze", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 20, sortOrder: 10 },
  { productType: "window", optionGroup: "glass_type", optionValue: "Thermal Break", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 25, sortOrder: 11 },
  { productType: "window", optionGroup: "glass_type", optionValue: "Toughened", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 10, sortOrder: 12 },
  { productType: "window", optionGroup: "glass_type", optionValue: "Elow Glass", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 15, sortOrder: 13 },
  { productType: "window", optionGroup: "tint", optionValue: "Grey", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 20 },
  { productType: "window", optionGroup: "tint", optionValue: "Bronze", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 21 },
  { productType: "window", optionGroup: "tint", optionValue: "Green", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 22 },
  { productType: "door", optionGroup: "glass_type", optionValue: "Double Glaze", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 20, sortOrder: 30 },
  { productType: "door", optionGroup: "glass_type", optionValue: "Thermal Break", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 25, sortOrder: 31 },
  { productType: "door", optionGroup: "glass_type", optionValue: "Toughened", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 10, sortOrder: 32 },
  { productType: "door", optionGroup: "tint", optionValue: "Grey", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 40 },
  { productType: "door", optionGroup: "tint", optionValue: "Bronze", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 41 },
  { productType: "door", optionGroup: "tint", optionValue: "Green", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 42 },
  { productType: "window", optionGroup: "obscurity", optionValue: "Translucent", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 50 },
  { productType: "window", optionGroup: "obscurity", optionValue: "Acid Etched", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 10, sortOrder: 51 },
  { productType: "door", optionGroup: "obscurity", optionValue: "Translucent", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 5, sortOrder: 60 },
  { productType: "door", optionGroup: "obscurity", optionValue: "Acid Etched", adjustmentType: "percent", costAdjustmentValue: 0, sellAdjustmentValue: 10, sortOrder: 61 },
] as const;

export const specItemsRouter = router({
  // ─── Spec Mappings (Admin) ──────────────────────────────────────────────────

  mappings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listSpecMappings(ctx.tenant!.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const mapping = await getSpecMapping(input.id, ctx.tenant!.id);
        if (!mapping) throw new TRPCError({ code: "NOT_FOUND" });
        return mapping;
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        tabName: z.string().min(1),
        specField: z.string().min(1),
        condition: z.string().min(1),
        productId: z.number().nullable().optional(),
        productMatch: z.string().nullable().optional(),
        qtyFormula: z.string().min(1),
        description: z.string().nullable().optional(),
        colourField: z.string().nullable().optional(),
        bottomColourField: z.string().nullable().optional(),
        uom: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createSpecMapping(input, ctx.tenant!.id);
        await logMappingChange({
          mappingId: id,
          userId: ctx.user!.id,
          userName: ctx.user!.name,
          action: "created",
          snapshot: { ...input, id },
        }, ctx.tenant!.id);
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().min(1).optional(),
          tabName: z.string().min(1).optional(),
          specField: z.string().min(1).optional(),
          condition: z.string().min(1).optional(),
          productId: z.number().nullable().optional(),
          productMatch: z.string().nullable().optional(),
          qtyFormula: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          colourField: z.string().nullable().optional(),
          bottomColourField: z.string().nullable().optional(),
          uom: z.string().nullable().optional(),
          sortOrder: z.number().optional(),
          active: z.boolean().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        const before = await getSpecMapping(input.id, ctx.tenant!.id);
        if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Spec mapping not found" });
        await updateSpecMapping(input.id, input.data, ctx.tenant!.id);
        const changes = Object.entries(input.data)
          .filter(([k, v]) => v !== undefined && before && (before as any)[k] !== v)
          .map(([field, newValue]) => ({ field, oldValue: before ? (before as any)[field] : null, newValue }));
        await logMappingChange({
          mappingId: input.id,
          userId: ctx.user!.id,
          userName: ctx.user!.name,
          action: input.data.active !== undefined && input.data.active !== (before as any)?.active
            ? (input.data.active ? "activated" : "deactivated")
            : "updated",
          changes: changes.length > 0 ? changes : null,
          snapshot: { ...(before as any), ...input.data },
        }, ctx.tenant!.id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const before = await getSpecMapping(input.id, ctx.tenant!.id);
        if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Spec mapping not found" });
        await deleteSpecMapping(input.id, ctx.tenant!.id);
        await logMappingChange({
          mappingId: input.id,
          userId: ctx.user!.id,
          userName: ctx.user!.name,
          action: "deleted",
          snapshot: before as any,
        }, ctx.tenant!.id);
        return { success: true };
      }),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        for (const id of input.ids) {
          const before = await getSpecMapping(id, ctx.tenant!.id);
          if (!before) continue;
          await deleteSpecMapping(id, ctx.tenant!.id);
          await logMappingChange({
            mappingId: id,
            userId: ctx.user!.id,
            userName: ctx.user!.name,
            action: "deleted",
            snapshot: before as any,
          }, ctx.tenant!.id);
        }
        return { deleted: input.ids.length };
      }),
  }),

  optionModifiers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listWindowDoorOptionModifiers(ctx.tenant!.id);
    }),

    create: adminProcedure
      .input(optionModifierInputSchema)
      .mutation(async ({ input, ctx }) => {
        const id = await createWindowDoorOptionModifier({
          ...input,
          appliesTo: input.appliesTo || "base_line",
          label: input.label || null,
          notes: input.notes || null,
        }, ctx.tenant!.id);
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        data: optionModifierInputSchema.partial(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateWindowDoorOptionModifier(input.id, {
          ...input.data,
          appliesTo: input.data.appliesTo || undefined,
          label: input.data.label ?? undefined,
          notes: input.data.notes ?? undefined,
        }, ctx.tenant!.id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteWindowDoorOptionModifier(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    seedDefaults: adminProcedure.mutation(async ({ ctx }) => {
      const existing = await listWindowDoorOptionModifiers(ctx.tenant!.id);
      const existingKeys = new Set((existing as any[]).map(row => [
        row.productType,
        row.optionGroup,
        String(row.optionValue || "").trim().toLowerCase(),
      ].join("|")));

      let created = 0;
      for (const modifier of DEFAULT_OPTION_MODIFIERS) {
        const key = [modifier.productType, modifier.optionGroup, modifier.optionValue.toLowerCase()].join("|");
        if (existingKeys.has(key)) continue;
        await createWindowDoorOptionModifier(modifier, ctx.tenant!.id);
        created++;
      }
      return { created, skipped: DEFAULT_OPTION_MODIFIERS.length - created };
    }),
  }),

  // ─── Quote Items ────────────────────────────────────────────────────────────

  items: router({
    list: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ input, ctx }) => {
        await assertQuoteAccess(input.quoteId, ctx.tenant!.id, ctx.user);
        return getQuoteItems(input.quoteId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        tabName: z.string().min(1),
        description: z.string().min(1),
        colour: z.string().nullable().optional(),
        uom: z.string().nullable().optional(),
        qty: z.number(),
        costRate: z.number(),
        sellRate: z.number(),
        notes: z.string().nullable().optional(),
        productId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertQuoteAccess(input.quoteId, ctx.tenant!.id, ctx.user);
        const id = await createQuoteItem({
          ...input,
          source: "manual",
          sortOrder: 999, // Manual items go at the end
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          description: z.string().optional(),
          colour: z.string().nullable().optional(),
          uom: z.string().nullable().optional(),
          qty: z.number().optional(),
          costRate: z.number().optional(),
          sellRate: z.number().optional(),
          notes: z.string().nullable().optional(),
          sortOrder: z.number().optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateQuoteItem(input.id, input.data, ctx.tenant!.id);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteQuoteItem(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    confirm: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await confirmQuoteItem(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    confirmAll: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await assertQuoteAccess(input.quoteId, ctx.tenant!.id, ctx.user);
        await confirmAllItems(input.quoteId, ctx.tenant!.id);
        return { success: true };
      }),
  }),

  // ─── Generation Engine ──────────────────────────────────────────────────────

  generate: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      specValues: z.record(z.string(), z.any()), // The spec sheet field values
    }))
    .mutation(async ({ ctx, input }) => {
      const { quoteId, specValues } = input;
      await assertQuoteAccess(quoteId, ctx.tenant!.id, ctx.user);

      // Enrich specValues with derived calculations
      const width = parseFloat(String(specValues.specWidth || "0")) || 0;
      const length = parseFloat(String(specValues.specLength || "0")) || 0;
      const fall = parseFloat(String(specValues.specFall || "0")) || 0;
      const area = width * length;
      const perimeter = 2 * (width + length);
      // Roof area accounts for pitch: roofArea = area / cos(atan(fall/100))
      const pitchRad = Math.atan(fall / 100);
      const roofArea = pitchRad > 0 ? area / Math.cos(pitchRad) : area;
      specValues.area = area;
      specValues.perimeter = perimeter;
      specValues.roofArea = roofArea;
      specValues.specArea = area;
      specValues.specPerimeter = perimeter;
      specValues.specRoofArea = roofArea;

      // Roof run width: dimension perpendicular to fall direction
      // If fall is along A-B or C-D (top/bottom), run width = width (A-B side)
      // If fall is along B-C or D-A (left/right), run width = length (B-C side)
      const fallDir = String(specValues.specFallDirection || "");
      const roofRunWidth = (fallDir === "B-C" || fallDir === "D-A") ? width : length;
      specValues.roofRunWidth = roofRunWidth;
      specValues.specRoofRunWidth = roofRunWidth;

      // Roof sheet length: dimension parallel to fall direction (the "other side")
      const roofSheetLength = (fallDir === "B-C" || fallDir === "D-A") ? length : width;
      specValues.roofSheetLength = roofSheetLength;
      specValues.specRoofSheetLength = roofSheetLength;

      // Get waste factor from master data
      try {
        const { getMasterDataByCategory } = await import("./db");
        const wasteData = await getMasterDataByCategory("waste_factor", ctx.tenant?.id ?? null);
        const wasteEntry = wasteData.find((d: any) => d.key === "roof" || d.key === "default");
        specValues.wasteFactor = wasteEntry ? parseFloat(String(wasteEntry.value)) || 0 : 0;
      } catch { specValues.wasteFactor = 0; }

      enrichDerivedSpecValues(specValues as Record<string, any>);

      // Get active mappings
      const mappings = await getActiveSpecMappings(ctx.tenant!.id);
      if (mappings.length === 0) {
        return { generated: 0, flagged: 0, message: "No active spec mappings configured. Please set up mappings in Admin → Spec Mappings." };
      }

      // Get all products for lookup
      const allProducts = await getAllProducts(ctx.tenant!.id);
      const optionModifiers = await getActiveWindowDoorOptionModifiers(ctx.tenant!.id);

      // TODO: Get markup rates from master data (for now use default)
      const markupRates: Record<string, number> = {};

      // Generate items from spec
      const generatedItems = generateItemsFromSpec(
        mappings as any,
        specValues as SpecValues,
        allProducts as any,
        markupRates,
        2.2,
        optionModifiers as any
      );

      // Delete existing auto items for this quote
      await deleteAutoItems(quoteId, ctx.tenant!.id);

      // Flag existing manual items for confirmation
      await flagManualItemsForConfirmation(quoteId, ctx.tenant!.id);

      // Insert new auto-generated items
      if (generatedItems.length > 0) {
        await createQuoteItemsBatch(
          generatedItems.map((item, idx) => ({
            quoteId,
            source: "auto" as const,
            specMappingId: item.specMappingId,
            productId: item.productId,
            tabName: item.tabName,
            description: item.description,
            colour: item.colour,
            bottomColour: item.bottomColour,
            uom: item.uom,
            qty: item.qty,
            costRate: item.costRate,
            sellRate: item.sellRate,
            notes: item.notes,
            sortOrder: idx,
          })),
          ctx.tenant!.id
        );
      }

      // Count flagged manual items
      const { getQuoteItems: getItems } = await import("./spec-items-db");
      const allItems = await getItems(quoteId, ctx.tenant!.id);
      const flaggedCount = allItems.filter(i => i.needsConfirmation).length;

      return {
        generated: generatedItems.length,
        flagged: flaggedCount,
        message: `Generated ${generatedItems.length} items from spec sheet.${flaggedCount > 0 ? ` ${flaggedCount} manual items flagged for confirmation.` : ""}`,
      };
    }),

  // ─── Beam Cost Auto-Update ─────────────────────────────────────────────────
  // When auto-suggest changes a beam size, update the matching beam line item's
  // product, description, costRate, and sellRate without full regeneration.
  updateBeamCost: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      newBeamSize: z.string(), // e.g. "150x60" or "200×60"
      beamIndex: z.number().optional(), // Which beam entry (0-based); if omitted, updates the primary beam item
    }))
    .mutation(async ({ ctx, input }) => {
      const { quoteId, newBeamSize, beamIndex } = input;
      await assertQuoteAccess(quoteId, ctx.tenant!.id, ctx.user);

      // Normalise beam size: replace unicode × with x for matching
      const normalisedSize = newBeamSize.replace(/\u00d7/g, "x").toLowerCase();

      // Get all products in the beams tab
      const allProducts = await getAllProducts(ctx.tenant!.id);
      const beamProducts = (allProducts as any[]).filter(p =>
        p.tabName && p.tabName.toLowerCase().includes("beam")
      );

      // Find matching product by name containing the beam size
      const matchedProduct = beamProducts.find(p =>
        p.name.toLowerCase().replace(/\u00d7/g, "x").includes(normalisedSize)
      );

      if (!matchedProduct) {
        return { success: false, message: `No product found matching beam size "${newBeamSize}"` };
      }

      // Calculate rates for the matched product
      const { calculateRates } = await import("../shared/specEngine");
      const { getMasterDataByCategory } = await import("./db");

      // Get markup rates
      const markupData = await getMasterDataByCategory("markup", ctx.tenant?.id ?? null);
      const markupRates: Record<string, number> = {};
      for (const entry of markupData) {
        markupRates[entry.key] = parseFloat(String(entry.value)) || 2.2;
      }

      const { costRate, sellRate } = calculateRates(matchedProduct as any, markupRates, 2.2);

      // Find existing beam quote items for this quote
      const existingItems = await getQuoteItems(quoteId, ctx.tenant!.id);
      const beamItems = existingItems.filter(item =>
        item.tabName.toLowerCase().includes("beam") &&
        item.source === "auto"
      );

      // Determine which item to update
      const targetItem = beamIndex !== undefined && beamIndex < beamItems.length
        ? beamItems[beamIndex]
        : beamItems[0]; // Default to first beam item

      if (!targetItem) {
        return { success: false, message: "No beam line item found in quote items. Run 'Generate from Spec' first." };
      }

      // Update the item with new product, description, and rates
      await updateQuoteItem(targetItem.id, {
        description: matchedProduct.name,
        costRate,
        sellRate,
      }, ctx.tenant!.id);

      return {
        success: true,
        updatedItemId: targetItem.id,
        newProduct: matchedProduct.name,
        costRate,
        sellRate,
        message: `Beam item updated to ${matchedProduct.name} (cost: $${costRate.toFixed(2)}, sell: $${sellRate.toFixed(2)})`,
      };
    }),

  // ─── Angle Cutting Cost Auto-Update ────────────────────────────────────────
  // When angle cutting metres change, create or update the "Angle Cutting" line
  // item in the costing tab with qty = LM and the product's per-LM rate.
  updateAngleCuttingCost: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      angleCuttingMetres: z.number(), // The calculated LM of diagonal cuts
    }))
    .mutation(async ({ ctx, input }) => {
      const { quoteId, angleCuttingMetres } = input;
      await assertQuoteAccess(quoteId, ctx.tenant!.id, ctx.user);

      // If metres is 0 or negative, nothing to do (could optionally remove item)
      if (angleCuttingMetres <= 0) {
        return { success: true, message: "No angle cutting metres — no line item needed." };
      }

      // Get all products and find the "Angle Cutting" product
      const allProducts = await getAllProducts(ctx.tenant!.id);
      const angleCuttingProduct = (allProducts as any[]).find(p =>
        p.name.toLowerCase().includes("angle cutting") ||
        p.name.toLowerCase().includes("angle cut")
      );

      if (!angleCuttingProduct) {
        return { success: false, message: 'No "Angle Cutting" product found in master data. Please add one first.' };
      }

      // Calculate rates for the matched product
      const { calculateRates } = await import("../shared/specEngine");
      const { getMasterDataByCategory } = await import("./db");

      const markupData = await getMasterDataByCategory("markup", ctx.tenant?.id ?? null);
      const markupRates: Record<string, number> = {};
      for (const entry of markupData) {
        markupRates[entry.key] = parseFloat(String(entry.value)) || 2.2;
      }

      const { costRate, sellRate } = calculateRates(angleCuttingProduct as any, markupRates, 2.2);

      // Find existing angle cutting quote items for this quote
      const existingItems = await getQuoteItems(quoteId, ctx.tenant!.id);
      const angleCuttingItems = existingItems.filter(item =>
        (item.description.toLowerCase().includes("angle cutting") ||
         item.description.toLowerCase().includes("angle cut")) &&
        item.source === "auto"
      );

      if (angleCuttingItems.length > 0) {
        // Update existing item with new qty
        const targetItem = angleCuttingItems[0];
        await updateQuoteItem(targetItem.id, {
          qty: angleCuttingMetres,
          costRate,
          sellRate,
          description: angleCuttingProduct.name,
        }, ctx.tenant!.id);
        return {
          success: true,
          updatedItemId: targetItem.id,
          qty: angleCuttingMetres,
          costRate,
          sellRate,
          message: `Angle Cutting updated: ${angleCuttingMetres.toFixed(2)} LM × $${sellRate.toFixed(2)}/LM`,
        };
      } else {
        // Create new angle cutting line item
        const newId = await createQuoteItem({
          quoteId,
          source: "auto",
          productId: angleCuttingProduct.id,
          tabName: angleCuttingProduct.tabName || "Roof",
          description: angleCuttingProduct.name,
          uom: "LM",
          qty: angleCuttingMetres,
          costRate,
          sellRate,
          sortOrder: 900, // High sort order to appear near end
        }, ctx.tenant!.id);
        return {
          success: true,
          createdItemId: newId,
          qty: angleCuttingMetres,
          costRate,
          sellRate,
          message: `Angle Cutting created: ${angleCuttingMetres.toFixed(2)} LM × $${sellRate.toFixed(2)}/LM`,
        };
      }
    }),

  // ─── Dry-Run Preview ─────────────────────────────────────────────────────
  // Evaluates all active mappings against a chosen quote's spec data WITHOUT
  // creating, deleting, or modifying any quote items.
  dryRun: adminProcedure
    .input(z.object({ quoteId: z.number() }))
    .query(async ({ input, ctx }) => {

      // Load the quote
      const quote = await assertQuoteAccess(input.quoteId, ctx.tenant!.id, ctx.user);

      // Extract spec values
      const specValues = extractSpecValues(quote as Record<string, any>);

      // Enrich with computed values (same logic as generate)
      const width = parseFloat(String(specValues.specWidth || "0")) || 0;
      const length = parseFloat(String(specValues.specLength || "0")) || 0;
      const fall = parseFloat(String(specValues.specFall || "0")) || 0;
      const area = width * length;
      const perimeter = 2 * (width + length);
      const pitchRad = Math.atan(fall / 100);
      const roofArea = pitchRad > 0 ? area / Math.cos(pitchRad) : area;
      specValues.area = area;
      specValues.perimeter = perimeter;
      specValues.roofArea = roofArea;
      specValues.specArea = area;
      specValues.specPerimeter = perimeter;
      specValues.specRoofArea = roofArea;

      const fallDir = String(specValues.specFallDirection || "");
      const roofRunWidth = (fallDir === "B-C" || fallDir === "D-A") ? width : length;
      specValues.roofRunWidth = roofRunWidth;
      specValues.specRoofRunWidth = roofRunWidth;
      const roofSheetLength = (fallDir === "B-C" || fallDir === "D-A") ? length : width;
      specValues.roofSheetLength = roofSheetLength;
      specValues.specRoofSheetLength = roofSheetLength;

      // Waste factor
      try {
        const { getMasterDataByCategory } = await import("./db");
        const wasteData = await getMasterDataByCategory("waste_factor", ctx.tenant?.id ?? null);
        const wasteEntry = wasteData.find((d: any) => d.key === "roof" || d.key === "default");
        specValues.wasteFactor = wasteEntry ? parseFloat(String(wasteEntry.value)) || 0 : 0;
      } catch { specValues.wasteFactor = 0; }

      enrichDerivedSpecValues(specValues as Record<string, any>);

      // Get active mappings and products
      const mappings = await getActiveSpecMappings(ctx.tenant!.id);
      const allProducts = await getAllProducts(ctx.tenant!.id);
      const optionModifiers = await getActiveWindowDoorOptionModifiers(ctx.tenant!.id);

      // Markup rates
      const { getMasterDataByCategory: getMD } = await import("./db");
      const markupData = await getMD("markup", ctx.tenant?.id ?? null);
      const markupRates: Record<string, number> = {};
      for (const entry of markupData) {
        markupRates[entry.key] = parseFloat(String(entry.value)) || 2.2;
      }

      // Generate items (pure computation, no DB writes)
      const generatedItems = generateItemsFromSpec(
        mappings as any,
        specValues as SpecValues,
        allProducts as any,
        markupRates,
        2.2,
        optionModifiers as any
      );

      // Also report which mappings were skipped (condition not met)
      const activeMappings = (mappings as any[]).filter(m => m.active !== false);
      const triggeredIds = new Set(generatedItems.map(i => i.specMappingId));
      const skipped = activeMappings
        .filter(m => !triggeredIds.has(m.id))
        .map(m => ({ id: m.id, name: m.name, specField: m.specField, condition: m.condition, reason: "condition not met" }));

      return {
        quoteRef: (quote as any).quoteNumber || `#${input.quoteId}`,
        specSnapshot: {
          specWidth: width,
          specLength: length,
          specFall: fall,
          specFallDirection: fallDir,
          specArea: area,
          specPerimeter: perimeter,
          specRoofArea: roofArea,
          specRoofRunWidth: roofRunWidth,
          specRoofSheetLength: roofSheetLength,
          wasteFactor: specValues.wasteFactor,
        },
        items: generatedItems.map(item => ({
          ...item,
          total: Math.round(item.qty * item.sellRate * 100) / 100,
        })),
        skipped,
        totalCost: Math.round(generatedItems.reduce((s, i) => s + i.qty * i.costRate, 0) * 100) / 100,
        totalSell: Math.round(generatedItems.reduce((s, i) => s + i.qty * i.sellRate, 0) * 100) / 100,
      };
    }),

  // ─── Seed Starter Templates ────────────────────────────────────────────────
  // Inserts missing starter templates only. Existing tenant mappings are editable
  // source-of-truth rows and must not be refreshed back to starter defaults.
  seedTemplates: adminProcedure
    .mutation(async ({ ctx }) => {

      const TEMPLATES = [
        // ── Roof ──
        { name: "Roof Sheets (LM from coverage)", tabName: "roof", specField: "specRoofType", condition: "!= ''", productMatch: "specRoofType", qtyFormula: "roofSheetLM", description: null, colourField: "specRoofTopColour", bottomColourField: "specRoofBottomColour", uom: "LM", sortOrder: 10 },
        { name: "Polycarbonate Roof Sheets", tabName: "roof", specField: "specPolyType", condition: "!= ''", productMatch: "specPolyType", qtyFormula: "roofSheetLM", description: null, colourField: "specRoofTopColour", bottomColourField: "specRoofBottomColour", uom: "LM", sortOrder: 13 },
        { name: "Angle Cutting (LM)", tabName: "roof", specField: "specAngleCuttingMetres", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specAngleCuttingMetres", description: "Angle Cutting", colourField: "specRoofTopColour", bottomColourField: null, uom: "LM", sortOrder: 14 },
        { name: "Ridge Capping", tabName: "roof", specField: "specRoofType", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "specWidth", description: "Ridge Capping", colourField: "specRoofTopColour", bottomColourField: null, uom: "LM", sortOrder: 20 },
        { name: "Barge Capping", tabName: "roof", specField: "specRoofType", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "specLength * 2", description: "Barge Capping", colourField: "specRoofTopColour", bottomColourField: null, uom: "LM", sortOrder: 21 },
        { name: "Skylights (LM)", tabName: "roof", specField: "specSkylightQty", condition: "> 0", productMatch: "specSpanlitesType", qtyFormula: "specSkylightQty * specSkylightLm", description: null, colourField: "specSpanlitesFinish", bottomColourField: null, uom: "LM", sortOrder: 22 },
        { name: "Skylights (Each)", tabName: "roof", specField: "specSkylightQty", condition: "> 0", productMatch: "specSpanlitesType", qtyFormula: "specSkylightQty", description: null, colourField: "specSpanlitesFinish", bottomColourField: null, uom: "ea", sortOrder: 23 },
        { name: "Spanlites (Each)", tabName: "roof", specField: "specSpanlitesType", condition: "!= ''", productMatch: "specSpanlitesType", qtyFormula: "Math.max(1, specSkylightQty)", description: null, colourField: "specSpanlitesFinish", bottomColourField: null, uom: "ea", sortOrder: 24 },

        // ── Attachment & brackets ──
        { name: "Number of Brackets", tabName: "attachment", specField: "specBracketAttachmentMethod", condition: "!= ''", productMatch: "specBracketAttachmentMethod", qtyFormula: "specNumberOfBrackets", description: null, colourField: "specBracketColour", bottomColourField: null, uom: "ea", sortOrder: 30 },
        { name: "Bracket Cover", tabName: "attachment", specField: "specBracketCover", condition: "!= ''", productMatch: "specBracketCover", qtyFormula: "specNumberOfBrackets", description: null, colourField: "specBracketColour", bottomColourField: null, uom: "ea", sortOrder: 31 },
        { name: "Wall Fixing Beam", tabName: "attachment", specField: "specWallFixingBeam", condition: "!= ''", productMatch: "specWallFixingBeam", qtyFormula: "roofRunWidth", description: null, colourField: "specBeamColour", bottomColourField: null, uom: "LM", sortOrder: 32 },
        { name: "Bracket Infill", tabName: "infill", specField: "specBracketInfillType", condition: "!= ''", productMatch: "specBracketInfillType", qtyFormula: "(specBracketInfillLength / 1000) * (specBracketInfillHeight / 1000)", description: null, colourField: "specBracketInfillColour", bottomColourField: null, uom: "m2", sortOrder: 33 },

        // ── Beams, channels & flashings ──
        { name: "Beams from spec entries", tabName: "beams", specField: "specBeamEntries", condition: "!= ''", productMatch: "specBeamSize", qtyFormula: "specWidth", description: null, colourField: "specBeamColour", bottomColourField: null, uom: "LM", sortOrder: 40 },
        { name: "Beam Size Allowance", tabName: "beams", specField: "specBeamSize", condition: "!= ''", productMatch: "specBeamSize", qtyFormula: "specWidth", description: null, colourField: "specBeamColour", bottomColourField: null, uom: "LM", sortOrder: 41 },
        { name: "Back Channel", tabName: "back channel", specField: "specBackChannelLength", condition: "> 0", productMatch: "specBackChannelType", qtyFormula: "specBackChannelLength / 1000", description: null, colourField: "specBackChannelColour", bottomColourField: null, uom: "LM", sortOrder: 42 },
        { name: "Side Channels", tabName: "side channels", specField: "specSideChannelsLength", condition: "> 0", productMatch: "specSideChannelsType", qtyFormula: "specSideChannelsLength / 1000", description: null, colourField: "specSideChannelsColour", bottomColourField: null, uom: "LM", sortOrder: 43 },
        { name: "Flashings", tabName: "flashings", specField: "specFlashingsLength", condition: "> 0", productMatch: "specFlashingsType", qtyFormula: "(specFlashingsLength / 1000) * Math.max(1, specFlashingsQty)", description: null, colourField: "specFlashingsColour", bottomColourField: null, uom: "LM", sortOrder: 44 },

        // ── Posts ──
        { name: "Posts from spec count", tabName: "posts", specField: "specPostsNumber", condition: "> 0", productMatch: "specPostsType", qtyFormula: "specPostsNumber", description: null, colourField: "specPostsColour", bottomColourField: null, uom: "ea", sortOrder: 50 },
        { name: "Post Fixings", tabName: "posts", specField: "specPostsFixing", condition: "!= ''", productMatch: "specPostsFixing", qtyFormula: "specPostsNumber", description: null, colourField: "specPostsColour", bottomColourField: null, uom: "ea", sortOrder: 51 },
        { name: "Post Lengths", tabName: "posts", specField: "specPostSize", condition: "!= ''", productMatch: "specPostSize", qtyFormula: "specPostsNumber", description: null, colourField: "specPostsColour", bottomColourField: null, uom: "ea", sortOrder: 52 },

        // ── Gutters & downpipes ──
        { name: "Gutter (front)", tabName: "gutters", specField: "specBoxGutter", condition: "> 0", productMatch: "specGutterType", qtyFormula: "specBoxGutter / 1000", description: null, colourField: "specGutterColour", bottomColourField: null, uom: "LM", sortOrder: 60 },
        { name: "Gutter Sides", tabName: "gutters", specField: "specGutterSideCount", condition: "> 0", productMatch: "specGutterType", qtyFormula: "specGutterSideCount", description: "Gutter Sides", colourField: "specGutterColour", bottomColourField: null, uom: "ea", sortOrder: 61 },
        { name: "Downpipes", tabName: "gutters", specField: "specDownpipeType", condition: "!= ''", productMatch: "specDownpipeType", qtyFormula: "Math.max(1, specDownpipeCount)", description: null, colourField: "specDownpipeColour", bottomColourField: null, uom: "ea", sortOrder: 62 },
        { name: "Overflow", tabName: "gutters", specField: "specOverflow", condition: "!= ''", productMatch: "specOverflow", qtyFormula: "1", description: null, colourField: "specGutterColour", bottomColourField: null, uom: "ea", sortOrder: 63 },

        // ── Walls, windows, doors, glass ──
        { name: "Wall Panels", tabName: "walls", specField: "specWallPanels", condition: "> 0", productMatch: "specWallType", qtyFormula: "specWallPanels", description: null, colourField: "specWallColour", bottomColourField: null, uom: "ea", sortOrder: 70 },
        { name: "Wall LM", tabName: "walls", specField: "specWallLM", condition: "> 0", productMatch: "specWallType", qtyFormula: "specWallLM", description: null, colourField: "specWallColour", bottomColourField: null, uom: "LM", sortOrder: 71 },
        { name: "IWP / Ceiling Panels", tabName: "walls", specField: "specIwpEntries", condition: "!= ''", productMatch: "specIwpEntries", qtyFormula: "wallSheetLM", description: null, colourField: "specIwpColour", bottomColourField: null, uom: "LM", sortOrder: 72 },
        { name: "Ceiling Finish", tabName: "walls", specField: "specCeilingFinish", condition: "!= ''", productMatch: "specCeilingFinish", qtyFormula: "specArea", description: null, colourField: "specCeilingColour", bottomColourField: null, uom: "m2", sortOrder: 73 },
        { name: "Windows from schedule", tabName: "windows", specField: "specWindowEntries", condition: "!= ''", productMatch: "specWindowType", qtyFormula: "1", description: null, colourField: "specWindowsFrameColour", bottomColourField: null, uom: "ea", sortOrder: 74 },
        { name: "Doors from schedule", tabName: "doors", specField: "specDoorEntries", condition: "!= ''", productMatch: "specDoorType", qtyFormula: "1", description: null, colourField: "specDoorsFrameColour", bottomColourField: null, uom: "ea", sortOrder: 75 },
        { name: "Glass Screens", tabName: "glass", specField: "specGlassScreens", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specGlassScreens", description: "Glass Screens", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 76 },
        { name: "Glass Options Allowance", tabName: "glass", specField: "specGlassWindows", condition: "!= ''", productMatch: "specGlassWindows", qtyFormula: "1", description: null, colourField: "specGlassTint", bottomColourField: null, uom: "ea", sortOrder: 77 },
        { name: "Pet Door", tabName: "glass", specField: "specGlassPetDoor", condition: "!= ''", productMatch: "specGlassPetDoor", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 78 },

        // ── Concrete ──
        { name: "Concrete Slab (m²)", tabName: "concrete", specField: "specConcreteType", condition: "!= ''", productMatch: "specConcreteType", qtyFormula: "specConcreteArea", description: null, colourField: "specConcreteColour", bottomColourField: null, uom: "m2", sortOrder: 80 },
        { name: "Concrete Area Fallback", tabName: "concrete", specField: "specConcreteType", condition: "!= ''", productMatch: "specConcreteType", qtyFormula: "specArea", description: null, colourField: "specConcreteColour", bottomColourField: null, uom: "m2", sortOrder: 81 },
        { name: "Concrete Finish", tabName: "concrete", specField: "specConcreteFinish", condition: "!= ''", productMatch: "specConcreteFinish", qtyFormula: "specConcreteArea", description: null, colourField: "specConcreteColour", bottomColourField: null, uom: "m2", sortOrder: 82 },
        { name: "Concrete Pier Holes", tabName: "concrete", specField: "specConcreteItemChecks", condition: "contains Pier", productId: null, productMatch: null, qtyFormula: "1", description: "Pier Holes", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 83 },

        // ── Electrical ──
        { name: "Electrical Lights", tabName: "electrical", specField: "specElecLights", condition: "> 0", productMatch: "specElecLightType", qtyFormula: "specElecLights", description: "Electrical Lights", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 90 },
        { name: "Electrical Fans", tabName: "electrical", specField: "specElecFan", condition: "> 0", productMatch: null, qtyFormula: "specElecFan", description: "Ceiling Fans", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 91 },
        { name: "Power Points", tabName: "electrical", specField: "specElecPowerPoints", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecPowerPoints", description: "Power Points", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 92 },
        { name: "Electrical GPOs", tabName: "electrical", specField: "specElecGpos", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecGpos", description: "GPOs", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 93 },
        { name: "Electrical Switches", tabName: "electrical", specField: "specElecSwitches", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecSwitches", description: "Switches", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 94 },
        { name: "Electrical One-Way Switches", tabName: "electrical", specField: "specElecSwitchOneWay", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecSwitchOneWay", description: "One-Way Switches", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 95 },
        { name: "Electrical Two-Way Switches", tabName: "electrical", specField: "specElecSwitchTwoWay", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecSwitchTwoWay", description: "Two-Way Switches", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 96 },
        { name: "Electrical Dimmer Switches", tabName: "electrical", specField: "specElecSwitchDimmer", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecSwitchDimmer", description: "Dimmer Switches", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 97 },
        { name: "Electrical Remove/Reinstall", tabName: "electrical", specField: "specElecRemoveReinstall", condition: "!= ''", productMatch: "specElecRemoveReinstall", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 98 },

        // ── Plumbing ──
        { name: "Plumbing Fitoffs", tabName: "plumbing", specField: "specPlumbFitoffs", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specPlumbFitoffs", description: "Plumbing Fitoffs", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 100 },
        { name: "Plumbing Pipes", tabName: "plumbing", specField: "specPlumbPipes", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specPlumbPipes", description: "Plumbing Pipes", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 101 },
        { name: "Stormwater Allowance", tabName: "plumbing", specField: "specPlumbStormwater", condition: "!= ''", productMatch: "specPlumbStormwater", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 102 },
        { name: "Gas Allowance", tabName: "plumbing", specField: "specPlumbGas", condition: "!= ''", productMatch: "specPlumbGas", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 103 },

        // ── Flooring, stairs & balustrade ──
        { name: "Flooring (m²)", tabName: "flooring", specField: "specFloorFinish", condition: "!= ''", productMatch: "specFloorFinish", qtyFormula: "specArea", description: null, colourField: null, bottomColourField: null, uom: "m2", sortOrder: 110 },
        { name: "Subfloor (m²)", tabName: "flooring", specField: "specSubfloorM2", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specSubfloorM2", description: "Subfloor", colourField: null, bottomColourField: null, uom: "m2", sortOrder: 111 },
        { name: "Floor Prep", tabName: "flooring", specField: "specFloorPrep", condition: "!= ''", productMatch: "specFloorPrep", qtyFormula: "specArea", description: null, colourField: null, bottomColourField: null, uom: "m2", sortOrder: 112 },
        { name: "Stairs Steps", tabName: "stairs", specField: "specStairsSteps", condition: "> 0", productMatch: "specStairsType", qtyFormula: "specStairsSteps", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 120 },
        { name: "Stairs Gate", tabName: "stairs", specField: "specStairsGate", condition: "!= ''", productMatch: "specStairsGate", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 121 },
        { name: "Balustrade (LM)", tabName: "balustrade", specField: "specBalustradeType", condition: "!= ''", productMatch: "specBalustradeType", qtyFormula: "specBalustradeLM", description: null, colourField: null, bottomColourField: null, uom: "LM", sortOrder: 130 },
        { name: "Balustrade Posts", tabName: "balustrade", specField: "specBalustradePosts", condition: "> 0", productMatch: "specBalPostType", qtyFormula: "specBalustradePosts", description: null, colourField: "specBalPostColour", bottomColourField: null, uom: "ea", sortOrder: 131 },
        { name: "Balustrade Glass Spigots", tabName: "balustrade", specField: "specBalGlassSpigots", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specBalGlassSpigots", description: "Glass Spigots", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 132 },

        // ── Existing work & demolition ──
        { name: "Remove Gutter / Flashing", tabName: "existing", specField: "specRemoveGutterFlash", condition: "!= ''", productMatch: "specRemoveGutterFlash", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 140 },
        { name: "Existing Eave Work", tabName: "existing", specField: "specExistingEave", condition: "!= ''", productMatch: "specExistingEave", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 141 },
        { name: "Existing Fascia Work", tabName: "existing", specField: "specExistingFascia", condition: "!= ''", productMatch: "specExistingFascia", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 142 },
        { name: "Existing Wall Work", tabName: "existing", specField: "specExistingWalls", condition: "!= ''", productMatch: "specExistingWalls", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 143 },
        { name: "Existing Beam Work", tabName: "existing", specField: "specExistingBeams", condition: "!= ''", productMatch: "specExistingBeams", qtyFormula: "1", description: null, colourField: null, bottomColourField: null, uom: "ea", sortOrder: 144 },
        { name: "Demolition Allowance", tabName: "demolition", specField: "specDemolitionWorkItems", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "1", description: "Demolition Allowance", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 150 },

        // ── Site allowances ──
        { name: "Difficult Access Allowance", tabName: "site", specField: "specSiteAccess", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "1", description: "Difficult Access Allowance", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 160 },
        { name: "Restricted Work Times Allowance", tabName: "site", specField: "specSiteRestricted", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "1", description: "Restricted Work Times Allowance", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 161 },
        { name: "Mixed Materials / Angles Allowance", tabName: "site", specField: "specSiteMixed", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "1", description: "Mixed Materials / Angles Allowance", colourField: null, bottomColourField: null, uom: "ea", sortOrder: 162 },
      ];

      // Get existing mapping names to skip duplicates
      const existing = await listSpecMappings(ctx.tenant!.id);
      const existingByName = new Map((existing as any[]).map(m => [m.name, m]));
      const retiredTemplateNames = [
        "Roof Sheets + Waste Factor",
        "Roof Sheets (Qty x Length)",
        "Attachment Method Allowance",
        "Fascia Brackets",
        "Extenda Brackets",
        "Gable Brackets",
        "Pop-up Brackets",
        "Wall Fixing Bracket",
        "Twinwall",
        "Windows Allowance",
        "Doors Allowance",
        "Glass Options Allowance",
      ];

      let created = 0;
      let preserved = 0;
      let retired = 0;
      for (const tmpl of TEMPLATES) {
        const existingMapping = existingByName.get(tmpl.name);
        if (existingMapping) {
          preserved++;
          continue;
        }
        const id = await createSpecMapping({ ...tmpl, active: false }, ctx.tenant!.id);
        await logMappingChange({
          mappingId: id,
          userId: ctx.user!.id,
          userName: ctx.user!.name,
          action: "created",
          snapshot: { ...tmpl, id, active: false, source: "seed_template" },
        }, ctx.tenant!.id);
        created++;
      }

      for (const name of retiredTemplateNames) {
        const existingMapping = existingByName.get(name);
        if (existingMapping && (existingMapping as any).active !== false) {
          await updateSpecMapping((existingMapping as any).id, { active: false }, ctx.tenant!.id);
          await logMappingChange({
            mappingId: (existingMapping as any).id,
            userId: ctx.user!.id,
            userName: ctx.user!.name,
            action: "deactivated",
            snapshot: { id: (existingMapping as any).id, name, active: false, source: "retired_seed_template" },
          }, ctx.tenant!.id);
          retired++;
        }
      }

      return { created, updated: 0, preserved, retired, skipped: preserved, total: TEMPLATES.length };
    }),

  // Preview a formula against the most recent quote's spec values
  previewFormula: protectedProcedure
    .input(z.object({
      formula: z.string(),
      productId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { formula, productId } = input;
      // Get the most recent quote with spec values
      const { getDb } = await import("./db");
      const { quotes } = await import("../drizzle/schema");
      const { desc, eq } = await import("drizzle-orm");
      const db = (await getDb())!;
      const [latestQuote] = await db.select().from(quotes)
        .where(eq(quotes.tenantId, ctx.tenant!.id))
        .orderBy(desc(quotes.updatedAt))
        .limit(1);
      if (!latestQuote) return { result: "No quotes found", formula };

      const specValues = extractSpecValues(latestQuote as any);
      // Enrich with computed variables
      const width = parseFloat(String(specValues.specWidth || "0")) || 0;
      const length = parseFloat(String(specValues.specLength || "0")) || 0;
      const fall = parseFloat(String(specValues.specFall || "0")) || 0;
      const area = width * length;
      const perimeter = 2 * (width + length);
      const pitchRad = Math.atan(fall / 100);
      const roofArea = pitchRad > 0 ? area / Math.cos(pitchRad) : area;
      specValues.area = area;
      specValues.perimeter = perimeter;
      specValues.roofArea = roofArea;

      const fallDir = String(specValues.specFallDirection || "");
      const roofRunWidth = (fallDir === "B-C" || fallDir === "D-A") ? width : length;
      specValues.roofRunWidth = roofRunWidth;
      specValues.specRoofRunWidth = roofRunWidth;
      const roofSheetLength = (fallDir === "B-C" || fallDir === "D-A") ? length : width;
      specValues.roofSheetLength = roofSheetLength;
      specValues.specRoofSheetLength = roofSheetLength;

      // If productId provided, inject productCover and compute roof sheet quantity/LM.
      if (productId) {
        const allProducts = await getAllProducts(ctx.tenant!.id);
        const product = (allProducts as any[]).find(p => p.id === productId);
        if (product && product.coverageWidth) {
          specValues.productCover = product.coverageWidth;
          const coverM = product.coverageWidth / 1000;
          const roofSheetQty = coverM > 0 ? Math.ceil(roofRunWidth / coverM) : 0;
          specValues.roofSheetQty = roofSheetQty;
          specValues.specRoofSheetQty = roofSheetQty;
          specValues.roofSheetLM = roofSheetQty * roofSheetLength;
        }
      }

      // Get waste factor from master data
      try {
        const { getMasterDataByCategory } = await import("./db");
        const wasteData = await getMasterDataByCategory("waste_factor", ctx.tenant?.id ?? null);
        const wasteEntry = wasteData.find((d: any) => d.key === "roof" || d.key === "default");
        specValues.wasteFactor = wasteEntry ? parseFloat(String(wasteEntry.value)) || 0 : 0;
      } catch { specValues.wasteFactor = 0; }

      enrichDerivedSpecValues(specValues as Record<string, any>);

      // Evaluate formula
      const { evaluateFormula } = await import("../shared/specEngine");
      try {
        const result = evaluateFormula(formula, specValues);
        return {
          result: result,
          formula,
          specSnapshot: {
            specWidth: width,
            specLength: length,
            specFall: fall,
            specFallDirection: fallDir,
            roofRunWidth,
            roofSheetLength,
            area,
            perimeter,
            roofArea,
            productCover: specValues.productCover || "N/A",
            roofSheetQty: specValues.roofSheetQty || "N/A",
            roofSheetLM: specValues.roofSheetLM || "N/A",
            wasteFactor: specValues.wasteFactor || 0,
          },
        };
      } catch (e: any) {
        return { result: `Error: ${e.message}`, formula };
      }
    }),

  // ─── Mapping History (Audit Trail) ────────────────────────────────────────
  history: adminProcedure
    .input(z.object({ mappingId: z.number().optional(), limit: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      if (input.mappingId) {
        return getMappingHistory(input.mappingId, ctx.tenant!.id);
      }
      return getAllMappingHistory(input.limit || 50, ctx.tenant!.id);
    }),

  // ─── Validate All Mappings ─────────────────────────────────────────────────
  validateAll: adminProcedure
    .query(async ({ ctx }) => {
      const mappings = await getActiveSpecMappings(ctx.tenant!.id);
      const allProds = await getAllProducts(ctx.tenant!.id);

      const VALID_SPEC_FIELDS = new Set(VALID_SPEC_FIELD_VALUES);
      const VALID_FORMULA_VARS = new Set(VALID_SPEC_FORMULA_VARIABLES);
      const VALID_FORMULA_VARS_LOWER = new Set(VALID_SPEC_FORMULA_VARIABLES.map((value) => value.toLowerCase()));

      type Finding = {
        mappingId: number;
        mappingName: string;
        tabName: string;
        severity: "error" | "warning";
        category: string;
        message: string;
      };

      const findings: Finding[] = [];
      const normaliseProductTab = (value: string | null | undefined) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
      const productMatchesMappingTab = (product: any, tabName: string | null | undefined) => {
        const target = normaliseProductTab(tabName);
        return normaliseProductTab(product.tabName) === target || normaliseProductTab(product.subTab) === target;
      };

      for (const m of mappings as any[]) {
        // 1. Check specField is valid
        if (!VALID_SPEC_FIELDS.has(m.specField)) {
          findings.push({
            mappingId: m.id, mappingName: m.name, tabName: m.tabName,
            severity: "error", category: "Invalid Spec Field",
            message: `specField "${m.specField}" is not a recognised field`,
          });
        }

        // 2. Check colourField is valid (if set)
        if (m.colourField && !VALID_SPEC_FIELDS.has(m.colourField)) {
          findings.push({
            mappingId: m.id, mappingName: m.name, tabName: m.tabName,
            severity: "warning", category: "Invalid Colour Field",
            message: `colourField "${m.colourField}" is not a recognised field`,
          });
        }
        if ((m as any).bottomColourField && !VALID_SPEC_FIELDS.has((m as any).bottomColourField)) {
          findings.push({
            mappingId: m.id, mappingName: m.name, tabName: m.tabName,
            severity: "warning", category: "Invalid Bottom Colour Field",
            message: `bottomColourField "${(m as any).bottomColourField}" is not a recognised field`,
          });
        }

        // 3. Check product link
        if (m.productId) {
          const product = (allProds as any[]).find(p => p.id === m.productId);
          if (!product) {
            findings.push({
              mappingId: m.id, mappingName: m.name, tabName: m.tabName,
              severity: "error", category: "Broken Product Link",
              message: `productId ${m.productId} not found or inactive`,
            });
          } else if (!productMatchesMappingTab(product, m.tabName)) {
            findings.push({
              mappingId: m.id, mappingName: m.name, tabName: m.tabName,
              severity: "warning", category: "Product Tab Mismatch",
              message: `Product "${product.name}" is in tab "${product.tabName}"${product.subTab ? ` / "${product.subTab}"` : ""} but mapping targets "${m.tabName}"`,
            });
          }
        } else if (m.productMatch) {
          // Check productMatch field is valid
          if (!VALID_SPEC_FIELDS.has(m.productMatch)) {
            findings.push({
              mappingId: m.id, mappingName: m.name, tabName: m.tabName,
              severity: "warning", category: "Invalid Product Match Field",
              message: `productMatch field "${m.productMatch}" is not a recognised spec field`,
            });
          }
          // Check if there are any products in the target tab
          const tabProds = (allProds as any[]).filter(p => productMatchesMappingTab(p, m.tabName));
          if (tabProds.length === 0) {
            findings.push({
              mappingId: m.id, mappingName: m.name, tabName: m.tabName,
              severity: "error", category: "No Products in Tab",
              message: `No active products in tab "${m.tabName}" for dynamic matching`,
            });
          }
        } else {
          // No product link at all
          findings.push({
            mappingId: m.id, mappingName: m.name, tabName: m.tabName,
            severity: "warning", category: "No Product Link",
            message: `No productId or productMatch set — items will have no rate`,
          });
        }

        // 4. Validate formula syntax
        if (m.qtyFormula) {
          try {
            let testExpr = m.qtyFormula.trim();
            // Replace all valid field references with 1
            const fieldPattern = /\b(spec\w+|width|length|area|perimeter|roofRunWidth|roofSheetLength|roofSheetQty|roofSheetLM|productCover|wasteFactor)\b/gi;
            testExpr = testExpr.replace(fieldPattern, "1");
            // Try to evaluate
            const safeExpr = testExpr.replace(/Math\.(ceil|floor|round|max|min|abs)/g, "Math.$1");
            new Function("Math", `return ${safeExpr}`)(Math);
          } catch (e: any) {
            findings.push({
              mappingId: m.id, mappingName: m.name, tabName: m.tabName,
              severity: "error", category: "Invalid Formula",
              message: `Formula "${m.qtyFormula}" fails to evaluate: ${e.message}`,
            });
          }

          // Check for unrecognised variables in formula
          const varPattern = /\b([a-zA-Z]\w*)\b/g;
          let match;
          const usedVars = new Set<string>();
          while ((match = varPattern.exec(m.qtyFormula)) !== null) {
            const v = match[1];
            if (["Math", "ceil", "floor", "round", "max", "min", "abs"].includes(v)) continue;
            if (!isNaN(Number(v))) continue;
            usedVars.add(v);
          }
          for (const v of Array.from(usedVars)) {
            if (!VALID_FORMULA_VARS.has(v) && !VALID_FORMULA_VARS_LOWER.has(v.toLowerCase())) {
              findings.push({
                mappingId: m.id, mappingName: m.name, tabName: m.tabName,
                severity: "warning", category: "Unknown Formula Variable",
                message: `Variable "${v}" in formula is not a recognised spec field or computed value`,
              });
            }
          }
        } else {
          findings.push({
            mappingId: m.id, mappingName: m.name, tabName: m.tabName,
            severity: "error", category: "Missing Formula",
            message: `No quantity formula defined`,
          });
        }

        // 5. Check condition is not empty
        if (!m.condition || !m.condition.trim()) {
          findings.push({
            mappingId: m.id, mappingName: m.name, tabName: m.tabName,
            severity: "error", category: "Missing Condition",
            message: `No condition defined — mapping will never trigger`,
          });
        }
      }

      const errorCount = findings.filter(f => f.severity === "error").length;
      const warningCount = findings.filter(f => f.severity === "warning").length;
      const totalActive = (mappings as any[]).length;
      const passCount = totalActive - new Set(findings.map(f => f.mappingId)).size;

      return {
        totalActive,
        passCount,
        errorCount,
        warningCount,
        findings,
      };
    }),
});
