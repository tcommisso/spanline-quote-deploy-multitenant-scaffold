import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
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
  logMappingChange,
  getMappingHistory,
  getAllMappingHistory,
} from "./spec-items-db";
import { generateItemsFromSpec, type SpecValues } from "../shared/specEngine";

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

export const specItemsRouter = router({
  // ─── Spec Mappings (Admin) ──────────────────────────────────────────────────

  mappings: router({
    list: protectedProcedure.query(async () => {
      return listSpecMappings();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const mapping = await getSpecMapping(input.id);
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
        const id = await createSpecMapping(input);
        await logMappingChange({
          mappingId: id,
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "created",
          snapshot: { ...input, id },
        });
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
        const before = await getSpecMapping(input.id);
        await updateSpecMapping(input.id, input.data);
        const changes = Object.entries(input.data)
          .filter(([k, v]) => v !== undefined && before && (before as any)[k] !== v)
          .map(([field, newValue]) => ({ field, oldValue: before ? (before as any)[field] : null, newValue }));
        await logMappingChange({
          mappingId: input.id,
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: input.data.active !== undefined && input.data.active !== (before as any)?.active
            ? (input.data.active ? "activated" : "deactivated")
            : "updated",
          changes: changes.length > 0 ? changes : null,
          snapshot: { ...(before as any), ...input.data },
        });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const before = await getSpecMapping(input.id);
        await deleteSpecMapping(input.id);
        await logMappingChange({
          mappingId: input.id,
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "deleted",
          snapshot: before as any,
        });
        return { success: true };
      }),
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        for (const id of input.ids) {
          const before = await getSpecMapping(id);
          await deleteSpecMapping(id);
          await logMappingChange({
            mappingId: id,
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "deleted",
            snapshot: before as any,
          });
        }
        return { deleted: input.ids.length };
      }),
  }),

  // ─── Quote Items ────────────────────────────────────────────────────────────

  items: router({
    list: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ input }) => {
        return getQuoteItems(input.quoteId);
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
      .mutation(async ({ input }) => {
        const id = await createQuoteItem({
          ...input,
          source: "manual",
          sortOrder: 999, // Manual items go at the end
        });
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
      .mutation(async ({ input }) => {
        await updateQuoteItem(input.id, input.data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteQuoteItem(input.id);
        return { success: true };
      }),

    confirm: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await confirmQuoteItem(input.id);
        return { success: true };
      }),

    confirmAll: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ input }) => {
        await confirmAllItems(input.quoteId);
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

      // Get active mappings
      const mappings = await getActiveSpecMappings();
      if (mappings.length === 0) {
        return { generated: 0, flagged: 0, message: "No active spec mappings configured. Please set up mappings in Admin → Spec Mappings." };
      }

      // Get all products for lookup
      const allProducts = await getAllProducts();

      // TODO: Get markup rates from master data (for now use default)
      const markupRates: Record<string, number> = {};

      // Generate items from spec
      const generatedItems = generateItemsFromSpec(
        mappings as any,
        specValues as SpecValues,
        allProducts as any,
        markupRates,
        2.2
      );

      // Delete existing auto items for this quote
      await deleteAutoItems(quoteId);

      // Flag existing manual items for confirmation
      await flagManualItemsForConfirmation(quoteId);

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
            sortOrder: idx,
          }))
        );
      }

      // Count flagged manual items
      const { getQuoteItems: getItems } = await import("./spec-items-db");
      const allItems = await getItems(quoteId);
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

      // Normalise beam size: replace unicode × with x for matching
      const normalisedSize = newBeamSize.replace(/\u00d7/g, "x").toLowerCase();

      // Get all products in the beams tab
      const allProducts = await getAllProducts();
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
      const existingItems = await getQuoteItems(quoteId);
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
      });

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

      // If metres is 0 or negative, nothing to do (could optionally remove item)
      if (angleCuttingMetres <= 0) {
        return { success: true, message: "No angle cutting metres — no line item needed." };
      }

      // Get all products and find the "Angle Cutting" product
      const allProducts = await getAllProducts();
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
      const existingItems = await getQuoteItems(quoteId);
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
        });
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
        });
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
      const { getQuoteById } = await import("./db");
      const quote = await getQuoteById(input.quoteId);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });

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

      // Get active mappings and products
      const mappings = await getActiveSpecMappings();
      const allProducts = await getAllProducts();

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
        2.2
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
  // Inserts a set of common spec mapping templates (idempotent: skips if name exists)
  seedTemplates: adminProcedure
    .mutation(async ({ ctx }) => {

      const TEMPLATES = [
        // ── Roof ──
        { name: "Roof Sheets (LM from coverage)", tabName: "roof", specField: "specRoofSheetType", condition: "!= ''", productMatch: "specRoofSheetType", qtyFormula: "Math.ceil(roofRunWidth / (productCover / 1000)) * roofSheetLength", description: null, colourField: "specRoofColourTop", uom: "LM", sortOrder: 10 },
        { name: "Roof Sheets + Waste Factor", tabName: "roof", specField: "specRoofSheetType", condition: "!= ''", productMatch: "specRoofSheetType", qtyFormula: "Math.ceil(roofRunWidth / (productCover / 1000)) * roofSheetLength * (1 + wasteFactor / 100)", description: null, colourField: "specRoofColourTop", uom: "LM", sortOrder: 11 },
        { name: "Ridge Capping", tabName: "roof", specField: "specRoofSheetType", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "specWidth", description: "Ridge Capping", colourField: "specRoofColourTop", uom: "LM", sortOrder: 20 },
        { name: "Barge Capping", tabName: "roof", specField: "specRoofSheetType", condition: "!= ''", productId: null, productMatch: null, qtyFormula: "specLength * 2", description: "Barge Capping", colourField: "specRoofColourTop", uom: "LM", sortOrder: 21 },
        // ── Beams ──
        { name: "Beams from spec entries", tabName: "beams", specField: "specBeamEntries", condition: "!= ''", productMatch: "specBeamSize", qtyFormula: "specWidth", description: null, colourField: "specBeamColour", uom: "LM", sortOrder: 30 },
        // ── Posts ──
        { name: "Posts from spec count", tabName: "posts", specField: "specPostsNumber", condition: "> 0", productMatch: "specPostsType", qtyFormula: "specPostsNumber", description: null, colourField: "specPostsColour", uom: "ea", sortOrder: 40 },
        // ── Gutters ──
        { name: "Gutter (front)", tabName: "gutters", specField: "specGutterType", condition: "!= ''", productMatch: "specGutterType", qtyFormula: "specWidth", description: null, colourField: "specGutterColour", uom: "LM", sortOrder: 50 },
        { name: "Downpipes", tabName: "gutters", specField: "specDownpipes", condition: "> 0", productMatch: null, qtyFormula: "specDownpipes", description: "Downpipes", colourField: "specGutterColour", uom: "ea", sortOrder: 51 },
        // ── Concrete ──
        { name: "Concrete Slab (m²)", tabName: "concrete", specField: "specConcreteType", condition: "!= ''", productMatch: "specConcreteType", qtyFormula: "specArea", description: null, colourField: null, uom: "m2", sortOrder: 60 },
        { name: "Concrete Pier Holes", tabName: "concrete", specField: "specConcretePierHoles", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specConcretePierHoles", description: "Pier Holes", colourField: null, uom: "ea", sortOrder: 61 },
        // ── Electrical ──
        { name: "Electrical Lights", tabName: "electrical", specField: "specElecLights", condition: "> 0", productMatch: "specElecLightType", qtyFormula: "specElecLights", description: null, colourField: null, uom: "ea", sortOrder: 70 },
        { name: "Electrical Fans", tabName: "electrical", specField: "specElecFans", condition: "> 0", productMatch: null, qtyFormula: "specElecFans", description: "Ceiling Fans", colourField: null, uom: "ea", sortOrder: 71 },
        { name: "Power Points", tabName: "electrical", specField: "specElecPowerPoints", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specElecPowerPoints", description: "Power Points", colourField: null, uom: "ea", sortOrder: 72 },
        // ── Plumbing ──
        { name: "Plumbing Fitoffs", tabName: "plumbing", specField: "specPlumbFitoffs", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specPlumbFitoffs", description: "Plumbing Fitoffs", colourField: null, uom: "ea", sortOrder: 80 },
        // ── Flooring ──
        { name: "Flooring (m²)", tabName: "flooring", specField: "specFlooringType", condition: "!= ''", productMatch: "specFlooringType", qtyFormula: "specArea", description: null, colourField: "specFlooringColour", uom: "m2", sortOrder: 90 },
        { name: "Subfloor (m²)", tabName: "flooring", specField: "specSubfloorM2", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specSubfloorM2", description: "Subfloor", colourField: null, uom: "m2", sortOrder: 91 },
        // ── Balustrade ──
        { name: "Balustrade (LM)", tabName: "balustrade", specField: "specBalustradeType", condition: "!= ''", productMatch: "specBalustradeType", qtyFormula: "specBalustradeLm", description: null, colourField: "specBalustradeColour", uom: "LM", sortOrder: 100 },
        // ── Glass / Screens ──
        { name: "Glass Screens", tabName: "glass", specField: "specGlassScreens", condition: "> 0", productId: null, productMatch: null, qtyFormula: "specGlassScreens", description: "Glass Screens", colourField: null, uom: "ea", sortOrder: 110 },
      ];

      // Get existing mapping names to skip duplicates
      const existing = await listSpecMappings();
      const existingNames = new Set((existing as any[]).map(m => m.name));

      let created = 0;
      for (const tmpl of TEMPLATES) {
        if (existingNames.has(tmpl.name)) continue;
        const id = await createSpecMapping({ ...tmpl, active: false });
        await logMappingChange({
          mappingId: id,
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "created",
          snapshot: { ...tmpl, id, active: false, source: "seed_template" },
        });
        created++;
      }

      return { created, skipped: TEMPLATES.length - created, total: TEMPLATES.length };
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
      const { desc } = await import("drizzle-orm");
      const db = (await getDb())!;
      const [latestQuote] = await db.select().from(quotes).orderBy(desc(quotes.updatedAt)).limit(1);
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
      const roofSheetLength = (fallDir === "B-C" || fallDir === "D-A") ? length : width;
      specValues.roofSheetLength = roofSheetLength;

      // If productId provided, inject productCover and compute roofSheetLM
      if (productId) {
        const allProducts = await getAllProducts();
        const product = (allProducts as any[]).find(p => p.id === productId);
        if (product && product.coverageWidth) {
          specValues.productCover = product.coverageWidth;
          const coverM = product.coverageWidth / 1000;
          specValues.roofSheetLM = coverM > 0 ? Math.ceil(roofRunWidth / coverM) * roofSheetLength : 0;
        }
      }

      // Get waste factor from master data
      try {
        const { getMasterDataByCategory } = await import("./db");
        const wasteData = await getMasterDataByCategory("waste_factor", ctx.tenant?.id ?? null);
        const wasteEntry = wasteData.find((d: any) => d.key === "roof" || d.key === "default");
        specValues.wasteFactor = wasteEntry ? parseFloat(String(wasteEntry.value)) || 0 : 0;
      } catch { specValues.wasteFactor = 0; }

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
    .query(async ({ input }) => {
      if (input.mappingId) {
        return getMappingHistory(input.mappingId);
      }
      return getAllMappingHistory(input.limit || 50);
    }),

  // ─── Validate All Mappings ─────────────────────────────────────────────────
  validateAll: adminProcedure
    .query(async () => {
      const mappings = await getActiveSpecMappings();
      const allProds = await getAllProducts();

      // Valid spec fields (from schema + computed)
      const VALID_SPEC_FIELDS = new Set([
        "specWidth", "specLength", "specHeight", "specFall", "specRoofPitch", "specRoofSheetType",
        "specRoofColourTop", "specRoofColourBottom", "specRoofFinishTop", "specRoofFinishBottom",
        "specBeamType", "specBeamSize", "specBeamColour", "specBeamEntries", "specPostsType",
        "specPostsColour", "specPostsNumber", "specPostSpacing", "specRoofOverhang",
        "specGutterType", "specGutterColour", "specGutterSides", "specDownpipes",
        "specAttachmentMethod", "specBackChannelColour", "specIwpEntries",
        "specFlooringType", "specFlooringColour", "specSubfloorM2",
        "specBalustradeType", "specBalustradeColour", "specBalustradeLm",
        "specBalustradeCompliance", "specBalustradePosts", "specBalustradePrivacy", "specBalustradeRails",
        "specElecLights", "specElecFans", "specElecPowerPoints", "specElecHeaters",
        "specElecLightType", "specElecLightTypes",
        "specPlumbFitoffs", "specPlumbDownpipes", "specPlumbStormwater",
        "specConcreteType", "specConcretePierHoles", "specConcreteChecks", "specConcreteExtras",
        "specGlassScreens", "specGlassType", "specGlassColour",
        "specWindowType", "specWindowColour", "specWindowEntries",
        "specDoorType", "specDoorColour", "specDoorEntries",
        "specWallType", "specWallColour", "specWallEntries",
        "specCeilingType", "specCeilingColour",
        "specSpanliteType", "specSpanliteColour", "specSpanliteEntries",
        "specHouseRoofType", "specCutBackEave", "specRemoveGutterFlash",
        "specHouseWallType", "specFallOnGround", "specGroundLevel",
        "specDemoScope", "specDemoNotes", "specDemoItems",
        "specSetbackFront", "specSetbackRear", "specSetbackLeft", "specSetbackRight",
        "specAngleCutting", "specAngleCuttingMetres",
        "specProgressPayments", "specSectionPrefs", "specSectionTemplates",
        "specChecklistSelections", "specSpeciality",
        // Computed
        "specArea", "specPerimeter", "specRoofArea", "specRoofRunWidth", "specRoofSheetLength",
        "wasteFactor",
        // Balustrade extended
        "specBalPostType", "specBalPostColour", "specBalPostMount",
        "specBalRailTopStyle", "specBalRailTopColour", "specBalRailBottomStyle", "specBalRailBottomColour",
        "specBalGlassType", "specBalGlassTint", "specBalGlassSpigots", "specBalGlassStairs",
        "specBalWireFrame", "specBalWireFinish", "specBalWireStairs",
        "specBalTubularVertical", "specBalTubularVertSlat", "specBalTubularHorizSlat", "specBalTubularStairs",
        "specBalPrivacy", "specBalCertification",
      ]);

      // Valid formula variables (spec fields + computed aliases)
      const VALID_FORMULA_VARS = new Set(Array.from(VALID_SPEC_FIELDS).concat([
        "width", "length", "area", "perimeter",
        "roofRunWidth", "roofSheetLength", "roofSheetLM", "productCover",
      ]));

      type Finding = {
        mappingId: number;
        mappingName: string;
        tabName: string;
        severity: "error" | "warning";
        category: string;
        message: string;
      };

      const findings: Finding[] = [];

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
          } else if (product.tabName?.toLowerCase() !== m.tabName?.toLowerCase()) {
            findings.push({
              mappingId: m.id, mappingName: m.name, tabName: m.tabName,
              severity: "warning", category: "Product Tab Mismatch",
              message: `Product "${product.name}" is in tab "${product.tabName}" but mapping targets tab "${m.tabName}"`,
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
          const tabProds = (allProds as any[]).filter(p => p.tabName?.toLowerCase() === m.tabName?.toLowerCase());
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
            const fieldPattern = /\b(spec\w+|width|length|area|perimeter|roofRunWidth|roofSheetLength|roofSheetLM|productCover|wasteFactor)\b/gi;
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
            if (!VALID_FORMULA_VARS.has(v)) {
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
