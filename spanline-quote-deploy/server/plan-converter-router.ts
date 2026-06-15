import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as planDb from "./plan-converter-db";
import { storagePut } from "./storage";
import { invokeLLM, type Message } from "./_core/llm";

const diagramTypeEnum = z.enum(["floor_plan", "elevation_front", "elevation_side", "elevation_rear"]);

const elementSchema = z.object({
  elementType: z.enum(["post", "beam", "wall_existing", "wall_new", "opening", "dimension", "annotation", "roof_line", "gutter", "fascia"]),
  elementNumber: z.string().optional(),
  label: z.string().optional(),
  size: z.string().optional(),
  material: z.string().optional(),
  colour: z.string().optional(),
  connectionType: z.string().optional(),
  bracketCode: z.string().optional(),
  bracketName: z.string().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  metadata: z.any().optional(),
  sortOrder: z.number().optional(),
});

export const planConverterRouter = router({
  downloadTemplate: protectedProcedure
    .input(z.object({
      diagramType: diagramTypeEnum.optional(),
      scale: z.string().optional(),
      pageSize: z.enum(["A4", "A3"]).optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const { generateDrawingTemplate } = await import("./plan-converter-template");
      const pdfBuffer = await generateDrawingTemplate({
        diagramType: input?.diagramType || "floor_plan",
        scale: input?.scale || "1:100",
        pageSize: input?.pageSize || "A4",
      });
      return { base64: pdfBuffer.toString("base64") };
    }),

  downloadConnectionsIndex: protectedProcedure
    .input(z.object({
      includeConnectionTypes: z.boolean().optional(),
      includeBracketList: z.boolean().optional(),
      includeTechLibraryRefs: z.boolean().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const { generateConnectionsIndex } = await import("./plan-converter-connections-index");
      const pdfBuffer = await generateConnectionsIndex({
        includeConnectionTypes: input?.includeConnectionTypes ?? true,
        includeBracketList: input?.includeBracketList ?? true,
        includeTechLibraryRefs: input?.includeTechLibraryRefs ?? true,
      });
      return { base64: pdfBuffer.toString("base64") };
    }),

  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      return planDb.listPlanConversionsByJob(input.jobId);
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return planDb.listPlanConversions(ctx.user.id);
  }),

  adminList: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return planDb.listAllPlanConversions();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const conversion = await planDb.getPlanConversion(input.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });
      const elements = await planDb.getConversionElements(input.id);
      return { ...conversion, elements };
    }),

  create: protectedProcedure
    .input(z.object({
      projectTitle: z.string().min(1),
      diagramType: diagramTypeEnum,
      clientName: z.string().optional(),
      siteAddress: z.string().optional(),
      jobId: z.number().optional(),
      scale: z.string().optional(),
      drawnBy: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return planDb.createPlanConversion({ userId: ctx.user.id, ...input });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      clientName: z.string().optional(),
      siteAddress: z.string().optional(),
      projectTitle: z.string().optional(),
      diagramType: diagramTypeEnum.optional(),
      scale: z.string().optional(),
      notes: z.string().optional(),
      drawnBy: z.string().optional(),
      revision: z.string().optional(),
      jobId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const conversion = await planDb.getPlanConversion(id, ctx.user.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });
      await planDb.updatePlanConversion(id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await planDb.deletePlanConversion(input.id, ctx.user.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  adminDelete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await planDb.adminDeletePlanConversion(input.id);
    }),

  uploadImage: protectedProcedure
    .input(z.object({
      id: z.number(),
      imageBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversion = await planDb.getPlanConversion(input.id, ctx.user.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });

      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `plan-conversions/${input.id}/drawing-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      await planDb.updatePlanConversion(input.id, {
        uploadedImageUrl: url,
        uploadedImageKey: key,
        status: "uploaded",
      });

      return { url };
    }),

  extractFromImage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conversion = await planDb.getPlanConversion(input.id, ctx.user.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });
      if (!conversion.uploadedImageUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No image uploaded yet" });
      }

      await planDb.updatePlanConversion(input.id, { status: "extracting" });

      try {
        const extractionPrompt = buildExtractionPrompt(conversion.diagramType);

        const userMessage: Message = {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this hand-drawn ${conversion.diagramType.replace(/_/g, " ")} and extract all structural elements. The drawing uses these conventions:\n- RED lines = existing walls/structure\n- BLACK lines = new structure\n- BLUE lines/text = dimensions\n- Posts are numbered P1, P2, etc.\n- Beams are numbered B1, B2, etc.\n- Scale is ${conversion.scale || "1:100"}\n\nExtract all elements you can identify.`,
            },
            {
              type: "image_url",
              image_url: { url: conversion.uploadedImageUrl!, detail: "high" },
            },
          ],
        };

        const response = await invokeLLM({
          messages: [
            { role: "system", content: extractionPrompt },
            userMessage,
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "plan_extraction",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  elements: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        elementType: { type: "string", enum: ["post", "beam", "wall_existing", "wall_new", "opening", "dimension", "annotation", "roof_line", "gutter", "fascia"] },
                        elementNumber: { type: "string", description: "e.g. P1, B2, W3" },
                        label: { type: "string", description: "Human-readable label" },
                        size: { type: "string", description: "e.g. 150x150, 200x50, 2400mm" },
                        material: { type: "string", description: "e.g. Steel, Timber, Aluminium" },
                        colour: { type: "string", description: "e.g. Monument, Surfmist, Woodland Grey" },
                        connectionType: { type: "string", description: "Connection type code: FLY, BCH, CRK, FSS, GBL, POP, WFX, SPL, or empty string if not applicable" },
                        bracketCode: { type: "string", description: "Bracket code: EXT-STD, PC-ALU, BP-STD, etc., or empty string if not detected" },
                        bracketName: { type: "string", description: "Full bracket name if code detected, e.g. Extenda Bracket Standard, or empty string" },
                        x1: { type: "number", description: "Start X position (0-100 percentage of image width)" },
                        y1: { type: "number", description: "Start Y position (0-100 percentage of image height)" },
                        x2: { type: "number", description: "End X position (0-100 percentage)" },
                        y2: { type: "number", description: "End Y position (0-100 percentage)" },
                        width: { type: "number", description: "Width in mm (real-world)" },
                        height: { type: "number", description: "Height in mm (real-world)" },
                      },
                      required: ["elementType", "elementNumber", "label", "size", "material", "colour", "connectionType", "bracketCode", "bracketName", "x1", "y1", "x2", "y2", "width", "height"],
                      additionalProperties: false,
                    },
                  },
                  overallDimensions: {
                    type: "object",
                    properties: {
                      widthMm: { type: "number", description: "Overall width in mm" },
                      depthMm: { type: "number", description: "Overall depth/projection in mm" },
                      heightMm: { type: "number", description: "Overall height in mm (for elevations)" },
                    },
                    required: ["widthMm", "depthMm", "heightMm"],
                    additionalProperties: false,
                  },
                  detectedScale: { type: "string", description: "Detected or assumed scale e.g. 1:100" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  notes: { type: "string", description: "Any notes about the extraction" },
                },
                required: ["elements", "overallDimensions", "detectedScale", "confidence", "notes"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") throw new Error("No response from AI");

        const extractedData = JSON.parse(content);

        await planDb.updatePlanConversion(input.id, {
          extractedData,
          status: "review",
        });

        if (extractedData.elements && extractedData.elements.length > 0) {
          await planDb.setConversionElements(input.id, extractedData.elements.map((el: any, idx: number) => ({
            elementType: el.elementType,
            elementNumber: el.elementNumber || "",
            label: el.label || "",
            size: el.size || "",
            material: el.material || "",
            colour: el.colour || "",
            connectionType: el.connectionType || null,
            bracketCode: el.bracketCode || null,
            bracketName: el.bracketName || null,
            x1: el.x1,
            y1: el.y1,
            x2: el.x2,
            y2: el.y2,
            width: el.width,
            height: el.height,
            sortOrder: idx,
          })));
        }

        return extractedData;
      } catch (error: any) {
        await planDb.updatePlanConversion(input.id, { status: "uploaded" });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Extraction failed: ${error.message}`,
        });
      }
    }),

  confirmData: protectedProcedure
    .input(z.object({
      id: z.number(),
      elements: z.array(elementSchema),
      overallDimensions: z.object({
        widthMm: z.number(),
        depthMm: z.number(),
        heightMm: z.number().optional(),
      }).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversion = await planDb.getPlanConversion(input.id, ctx.user.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });

      const confirmedData = {
        elements: input.elements,
        overallDimensions: input.overallDimensions,
        confirmedAt: Date.now(),
        confirmedBy: ctx.user.name || String(ctx.user.id),
      };

      await planDb.updatePlanConversion(input.id, {
        confirmedData,
        status: "confirmed",
        notes: input.notes ?? conversion.notes ?? undefined,
      });

      await planDb.setConversionElements(input.id, input.elements as any[]);
      return { success: true };
    }),

  generatePdf: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conversion = await planDb.getPlanConversion(input.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });
      if (conversion.status !== "confirmed" && conversion.status !== "generated") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data must be confirmed before generating PDF" });
      }

      const elements = await planDb.getConversionElements(input.id);
      const { generateArchitecturalPlanPdf } = await import("./plan-converter-pdf");

      const pdfBuffer = await generateArchitecturalPlanPdf({ conversion, elements });

      const key = `plan-conversions/${input.id}/architectural-plan-${Date.now()}.pdf`;
      const { url } = await storagePut(key, pdfBuffer, "application/pdf");

      await planDb.updatePlanConversion(input.id, {
        generatedPdfUrl: url,
        generatedPdfKey: key,
        status: "generated",
      });

      return { url };
    }),

  updateElements: protectedProcedure
    .input(z.object({
      id: z.number(),
      elements: z.array(elementSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const conversion = await planDb.getPlanConversion(input.id, ctx.user.id);
      if (!conversion) throw new TRPCError({ code: "NOT_FOUND" });
      await planDb.setConversionElements(input.id, input.elements as any[]);
    }),

  // ─── Auto-Suggest Brackets ──────────────────────────────────────────────
  suggestBrackets: protectedProcedure
    .input(z.object({
      elementType: z.string(),
      connectionType: z.string().optional(),
      attachedToHouse: z.boolean().optional(),
      isFreeStanding: z.boolean().optional(),
      beamSplice: z.boolean().optional(),
      isGable: z.boolean().optional(),
    }))
    .query(({ input }) => {
      return getSuggestedBrackets(input);
    }),

  // ─── Product Images (brackets/connections reference) ────────────────────
  listProductImages: protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return planDb.listProductImages(input?.category);
    }),

  searchProductImages: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return planDb.searchProductImages(input.query);
    }),

  getProductImagesByCode: protectedProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      return planDb.getProductImagesByCode(input.code);
    }),

  createProductImage: protectedProcedure
    .input(z.object({
      category: z.string(),
      code: z.string(),
      name: z.string(),
      description: z.string().optional(),
      imageBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      sourceDocument: z.string().optional(),
      pageNumber: z.number().optional(),
      tags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
      directImageUrl: z.string().optional(), // Allow storing a URL directly without upload
    }))
    .mutation(async ({ input }) => {
      let url: string;
      if (input.directImageUrl) {
        // Use the provided URL directly (e.g. for default CDN-hosted images)
        url = input.directImageUrl;
      } else if (input.imageBase64) {
        const buffer = Buffer.from(input.imageBase64, "base64");
        const ext = input.fileName.split(".").pop() || "jpg";
        const key = `product-images/${input.category}/${input.code}-${Date.now()}.${ext}`;
        const result = await storagePut(key, buffer, input.mimeType);
        url = result.url;
      } else {
        throw new Error("Either imageBase64 or directImageUrl must be provided");
      }
      const { id } = await planDb.createProductImage({
        category: input.category,
        code: input.code,
        name: input.name,
        description: input.description,
        imageUrl: url,
        sourceDocument: input.sourceDocument,
        pageNumber: input.pageNumber,
        tags: input.tags,
        sortOrder: input.sortOrder,
      });
      return { id, imageUrl: url };
    }),

  updateProductImage: protectedProcedure
    .input(z.object({
      id: z.number(),
      category: z.string().optional(),
      code: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      imageBase64: z.string().optional(),
      fileName: z.string().optional(),
      mimeType: z.string().optional(),
      sourceDocument: z.string().optional(),
      pageNumber: z.number().optional(),
      tags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, imageBase64, fileName, mimeType, ...updates } = input;
      let imageUrl: string | undefined;
      if (imageBase64 && fileName && mimeType) {
        const buffer = Buffer.from(imageBase64, "base64");
        const ext = fileName.split(".").pop() || "jpg";
        const key = `product-images/${updates.category || "misc"}/${updates.code || "img"}-${Date.now()}.${ext}`;
        const result = await storagePut(key, buffer, mimeType);
        imageUrl = result.url;
      }
      await planDb.updateProductImage(id, { ...updates, ...(imageUrl ? { imageUrl } : {}) });
      return { success: true, imageUrl };
    }),

  deleteProductImage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await planDb.deleteProductImage(input.id);
      return { success: true };
    }),

  reorderProductImages: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await planDb.reorderProductImages(input.ids);
      return { success: true };
    }),

  bulkUpdateCategory: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), category: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await planDb.bulkUpdateProductImageCategory(input.ids, input.category);
      return { success: true, count: input.ids.length };
    }),
});

function buildExtractionPrompt(diagramType: string): string {
  const basePrompt = `You are an expert architectural plan reader specializing in Australian residential outdoor structures (patios, carports, pergolas, decks). You are analyzing a hand-drawn diagram that follows specific drawing conventions.

DRAWING CONVENTIONS:
- RED lines represent EXISTING walls, structures, or house elements
- BLACK lines represent NEW structure elements (posts, beams, roof)
- BLUE lines or text represent DIMENSIONS (measurements in mm)
- GREEN lines or text represent CONNECTIONS and BRACKETS
- Posts are labeled P1, P2, P3... (circles or squares at intersections)
- Beams are labeled B1, B2, B3... (lines connecting posts)
- Openings (windows, doors) may be marked with standard architectural symbols
- A scale reference or grid may be present

CONNECTION TYPE CODES (may be written near attachment points):
- FLY = Flyover Bracket (roof flies over existing house roof)
- BCH = Back Channel (aluminium channel bolts into eave rafters)
- CRK = Cranked Post (angled post to clear obstruction)
- FSS = Free Standing System (no attachment to existing building)
- GBL = Gable Bracket (gable roof ridge connection)
- POP = Pop-up Bracket (raises roof above fascia/gutter line)
- WFX = Wall Fixing (direct attachment to masonry/timber wall)
- SPL = Beam Splice (joins two beam sections end-to-end)

BRACKET CODES (may be written next to elements):
- EXT-STD = Extenda Bracket Standard (100-150mm rafter)
- EXT-HD = Extenda Bracket Heavy Duty (150-200mm rafter)
- GBL-100 / GBL-150 = Gable Bracket 100mm / 150mm
- POP-150 / POP-200 / POP-250 = Pop-up Bracket sizes
- PC-ALU = Aluminium Post Connector
- PC-STL = Steel Post Cap
- BP-STD = Base Plate Standard (150x150x6mm)
- BP-HD = Base Plate Heavy Duty (200x200x10mm)
- CRK-STD = Cranked Post Bracket (standard offset)
- CRK-90 = 90 Degree Cranked Post
- G1-RDG = G1 Ridge Extrusion
- G2-RDG = G2 Ridge Extrusion
- SPL-INT = Internal Splice Plate
- BCH-STD = Back Channel Standard
- BCH-B2B = Back to Back Channel
- BM-SAD = Beam Saddle
- KB-STD = Knee Brace Standard (600mm)
- KB-LG = Knee Brace Large (900mm)
- PF-STD = Portal Frame Kit
- RF-STR = Rafter Strengthening
- WB-STD = Wall Bracket Standard
- WB-HD = Wall Bracket Heavy Duty

YOUR TASK:
Extract every identifiable structural element from the drawing. For each element, determine:
1. Its type (post, beam, wall, opening, dimension, etc.)
2. Its number/label as written on the drawing
3. Its size if noted (e.g. 150x150 post, 200x50 beam)
4. Its material if noted (Steel, Timber, Aluminium)
5. Its colour if noted (Colorbond colour names)
6. Its approximate position on the drawing (as percentage 0-100 of image width/height)
7. Its real-world dimensions in mm if readable
8. Its CONNECTION TYPE code if written nearby (FLY, BCH, CRK, FSS, GBL, POP, WFX, SPL)
9. Its BRACKET CODE if written nearby (EXT-STD, PC-ALU, etc.)

IMPORTANT:
- If a value is not clearly visible, make your best estimate and note it
- Use Australian construction terminology
- Common beam sizes: 75x50, 100x50, 125x50, 150x50, 200x50, 250x50 (RHS/SHS)
- Common post sizes: 75x75, 90x90, 100x100, 125x125, 150x150
- Dimensions are typically in millimetres (mm)
- Provide overall dimensions of the structure
- Look for connection/bracket codes written in GREEN or near attachment points
- If you can infer the connection type from context (e.g. structure attaches to house at eave = BCH), include it with a note`;

  if (diagramType === "floor_plan") {
    return basePrompt + `\n\nFLOOR PLAN SPECIFIC:
- Look for post positions forming a grid pattern
- Identify beam runs connecting posts
- Note any existing house wall the structure attaches to
- Identify openings (sliding doors, bi-folds, windows) in existing walls
- Look for dimension lines showing spans between posts and overall width/depth
- Note any step-downs, cutouts, or irregular shapes in the floor plan`;
  }

  if (diagramType.startsWith("elevation")) {
    return basePrompt + `\n\nELEVATION SPECIFIC:
- Identify post heights from ground to beam
- Identify beam depth/size
- Look for roof pitch angle or slope indication
- Identify gutter and fascia lines
- Note connection point to existing house (if attached structure)
- Look for height dimensions (floor to beam, beam to ridge, overall height)
- Identify roof type (flat, skillion, gable, hip)`;
  }

  return basePrompt;
}

interface BracketSuggestion {
  connectionType: string;
  connectionName: string;
  bracketCode: string;
  bracketName: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

function getSuggestedBrackets(input: {
  elementType: string;
  connectionType?: string;
  attachedToHouse?: boolean;
  isFreeStanding?: boolean;
  beamSplice?: boolean;
  isGable?: boolean;
}): BracketSuggestion[] {
  const suggestions: BracketSuggestion[] = [];

  // ─── Post-specific suggestions ─────────────────────────────────────
  if (input.elementType === "post") {
    // Every post needs a base plate
    suggestions.push({
      connectionType: "",
      connectionName: "Post Base",
      bracketCode: "BP-STD",
      bracketName: "Base Plate (Standard)",
      reason: "Standard bolt-down base plate for post to slab connection",
      confidence: "high",
    });
    // Post cap connector
    suggestions.push({
      connectionType: "",
      connectionName: "Post to Beam",
      bracketCode: "PC-ALU",
      bracketName: "Aluminium Post Connector",
      reason: "Connects post top to beam underside",
      confidence: "high",
    });
    // If cranked connection type
    if (input.connectionType === "CRK") {
      suggestions.push({
        connectionType: "CRK",
        connectionName: "Cranked Post",
        bracketCode: "CRK-STD",
        bracketName: "Cranked Post Bracket",
        reason: "Post offset required — slab edge or obstruction clearance",
        confidence: "high",
      });
    }
    // Free standing needs bracing
    if (input.isFreeStanding || input.connectionType === "FSS") {
      suggestions.push({
        connectionType: "FSS",
        connectionName: "Free Standing System",
        bracketCode: "KB-STD",
        bracketName: "Knee Brace",
        reason: "Wind bracing required for free-standing structure",
        confidence: "high",
      });
      suggestions.push({
        connectionType: "FSS",
        connectionName: "Free Standing System",
        bracketCode: "PF-STD",
        bracketName: "Portal Frame Kit",
        reason: "Alternative bracing for free-standing — use instead of knee braces if preferred",
        confidence: "medium",
      });
      suggestions.push({
        connectionType: "FSS",
        connectionName: "Free Standing System",
        bracketCode: "BP-HD",
        bracketName: "Base Plate (Heavy Duty)",
        reason: "Larger base plate recommended for free-standing posts (higher wind load)",
        confidence: "medium",
      });
    }
  }

  // ─── Beam-specific suggestions ─────────────────────────────────────
  if (input.elementType === "beam") {
    // Beam saddle for post connection
    suggestions.push({
      connectionType: "",
      connectionName: "Beam Support",
      bracketCode: "BM-SAD",
      bracketName: "Beam Saddle",
      reason: "Saddle bracket for beam resting on post top",
      confidence: "high",
    });

    // Splice if beam is spliced
    if (input.beamSplice || input.connectionType === "SPL") {
      suggestions.push({
        connectionType: "SPL",
        connectionName: "Beam Splice",
        bracketCode: "SPL-INT",
        bracketName: "Internal Splice Plate",
        reason: "Joins two beam sections — must be at a support point",
        confidence: "high",
      });
    }

    // Flyover connection
    if (input.connectionType === "FLY" || (input.attachedToHouse && !input.connectionType)) {
      suggestions.push({
        connectionType: "FLY",
        connectionName: "Flyover Bracket",
        bracketCode: "EXT-STD",
        bracketName: "Extenda Bracket (Standard)",
        reason: "Primary flyover connection — roof flies over existing house roof",
        confidence: "high",
      });
      suggestions.push({
        connectionType: "FLY",
        connectionName: "Flyover Bracket",
        bracketCode: "RF-STR",
        bracketName: "Rafter Strengthening",
        reason: "May be required to support existing rafters under flyover load",
        confidence: "medium",
      });
    }

    // Back channel
    if (input.connectionType === "BCH") {
      suggestions.push({
        connectionType: "BCH",
        connectionName: "Back Channel",
        bracketCode: "BCH-STD",
        bracketName: "Back Channel Standard",
        reason: "Eave attachment — aluminium channel bolts into existing rafters",
        confidence: "high",
      });
    }

    // Wall fixing
    if (input.connectionType === "WFX") {
      suggestions.push({
        connectionType: "WFX",
        connectionName: "Wall Fixing",
        bracketCode: "WB-STD",
        bracketName: "Wall Bracket Standard",
        reason: "Direct wall attachment for flat/low-pitch roof",
        confidence: "high",
      });
    }

    // Pop-up
    if (input.connectionType === "POP") {
      suggestions.push({
        connectionType: "POP",
        connectionName: "Pop-up Bracket",
        bracketCode: "POP-200",
        bracketName: "Pop-up Bracket 200mm",
        reason: "Raises roof above existing fascia/gutter line — 200mm is standard",
        confidence: "high",
      });
    }

    // Gable
    if (input.isGable || input.connectionType === "GBL") {
      suggestions.push({
        connectionType: "GBL",
        connectionName: "Gable Bracket",
        bracketCode: "GBL-150",
        bracketName: "Gable Bracket 150mm",
        reason: "Ridge connection for gable roof style",
        confidence: "high",
      });
      suggestions.push({
        connectionType: "GBL",
        connectionName: "Gable Bracket",
        bracketCode: "G1-RDG",
        bracketName: "G1 Ridge Extrusion",
        reason: "Ridge extrusion for gable roof apex",
        confidence: "medium",
      });
    }
  }

  // ─── Wall elements (attached to house) ─────────────────────────────
  if (input.elementType === "wall_existing" && input.attachedToHouse) {
    if (!input.connectionType) {
      // Default suggestion for attached structures
      suggestions.push({
        connectionType: "FLY",
        connectionName: "Flyover Bracket",
        bracketCode: "EXT-STD",
        bracketName: "Extenda Bracket (Standard)",
        reason: "Most common connection for attached patio — roof flies over existing",
        confidence: "medium",
      });
      suggestions.push({
        connectionType: "BCH",
        connectionName: "Back Channel",
        bracketCode: "BCH-STD",
        bracketName: "Back Channel Standard",
        reason: "Alternative — lower profile eave attachment",
        confidence: "medium",
      });
      suggestions.push({
        connectionType: "WFX",
        connectionName: "Wall Fixing",
        bracketCode: "WB-STD",
        bracketName: "Wall Bracket Standard",
        reason: "Alternative — direct wall attachment for flat roof",
        confidence: "low",
      });
    }
  }

  return suggestions;
}
