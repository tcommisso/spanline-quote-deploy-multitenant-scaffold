// Eclipse Opening Roof System - tRPC Router
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as eclipseDb from "./eclipse-db";
import { isAdminRole } from "../shared/const";
import { calculateProject, calculateProjectWithLayout, type UnitInput, type PositionedUnit } from "../shared/eclipseCalculations";
import { getDefaultPrices, toPricingData, editablePricesToDbRows, dbRowsToEditablePrices } from "../shared/eclipsePricing";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { hbcfRequirementFieldsForAmount } from "./hbcf-service";

const unitInputSchema = z.object({
  bladeWidth: z.number(),
  length: z.number(),
  height: z.number(),
  posts: z.number(),
  noOfLights: z.number(),
  mountType: z.enum(["Freestanding", "Fascia"]),
  rainSensor: z.boolean(),
  remote: z.boolean(),
  electrical: z.boolean(),
  downpipe: z.number(),
  flashing: z.boolean(),
  bladeColour: z.enum(["White", "Powder Coated"]),
  structureColour: z.enum(["White", "Powder Coated"]),
  colourbondBladeColour: z.string(),
  colourbondStructureColour: z.string(),
  installationDays: z.number(),
  notes: z.string(),
  fallDirection: z.string().optional().default(""),
  houseWalls: z.string().optional().default(""),
  bladeDirection: z.string().optional().default("along-width"),
  motorPosition: z.string().optional().default("A-B"),
  isRaked: z.boolean().optional().default(false),
  rakedShortLength: z.number().optional().default(0),
  rakedWidth: z.number().optional().default(0),
  rakedEdge: z.string().optional().default("C-D"),
  // Attachment & Brackets
  attachmentMethod: z.string().optional().default("None"),
  fasciaBrackets: z.number().optional().default(0),
  extendaBrackets: z.number().optional().default(0),
  gableBracketsQty: z.number().optional().default(0),
  bracketCover: z.string().optional().default(""),
  // New bracket types
  oversizedDGutter: z.number().optional().default(0),
  popupBrackets: z.number().optional().default(0),
  wallFixingBeam: z.number().optional().default(0),
  wallFixingBracket: z.number().optional().default(0),
});

export const eclipseRouter = router({
  // ─── Quotes ──────────────────────────────────────────────────────────────────
  quotes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return eclipseDb.listEclipseQuotes(ctx.user.id, ctx.user.role);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await eclipseDb.getEclipseQuoteById(input.id);
        if (!quote) throw new Error("Eclipse quote not found");
        if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return quote;
      }),

    create: protectedProcedure
      .input(z.object({
        clientId: z.number().optional(),
        clientName: z.string().min(1),
        clientPhone: z.string().optional(),
        clientEmail: z.string().optional(),
        clientAddress: z.string().optional(),
        designAdvisor: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quoteNumber = await eclipseDb.getNextEclipseQuoteNumber();
        const id = await eclipseDb.createEclipseQuote({
          userId: ctx.user.id,
          quoteNumber,
          clientId: input.clientId || null,
          clientName: input.clientName,
          clientPhone: input.clientPhone || null,
          clientEmail: input.clientEmail || null,
          clientAddress: input.clientAddress || null,
          designAdvisor: input.designAdvisor || null,
          units: JSON.stringify([]),
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
        return { id, quoteNumber, leadUnarchived };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        clientId: z.number().nullable().optional(),
        clientName: z.string().optional(),
        clientPhone: z.string().optional(),
        clientEmail: z.string().optional(),
        clientAddress: z.string().optional(),
        status: z.enum(["draft", "sent", "accepted", "lost"]).optional(),
        commissionRate: z.string().optional(),
        margin: z.string().optional(),
        units: z.any().optional(), // UnitInput[] as JSON
        footings: z.string().optional(),
        footingRate: z.string().optional(),
        approvals: z.string().optional(),
        projectManagement: z.string().optional(),
        gableBrackets: z.string().optional(),
        constructionCleaning: z.string().optional(),
        attachmentToHouse: z.string().optional(),
        travel: z.string().optional(),
        siteClean: z.string().optional(),
        demolition: z.string().optional(),
        plumbing: z.string().optional(),
        concrete: z.string().optional(),
        electrical: z.string().optional(),
        otherCost: z.string().optional(),
        otherCostDescription: z.string().optional(),
        councilFees: z.string().optional(),
        homeWarranty: z.string().optional(),
        deliveryAmount: z.string().optional(),
        deliveryOverride: z.boolean().optional(),
        travelAllowanceAmount: z.string().optional(),
        travelDistanceKm: z.string().optional(),
        travelBranchName: z.string().optional(),
        travelBandKey: z.string().optional(),
        travelOverridden: z.boolean().optional(),
        smallJobSurcharge: z.string().optional(),
        constructionMgmtPercent: z.string().optional(),
        constructionMgmtOverride: z.boolean().optional(),
        complexityLoadingPercent: z.string().optional(),
        complexityOverride: z.boolean().optional(),
        totalSqm: z.string().optional(),
        totalSellPriceEx: z.string().optional(),
        totalGST: z.string().optional(),
        totalRRPInc: z.string().optional(),
        rrpPerSqm: z.string().optional(),
        notes: z.string().optional(),
        designAdvisor: z.string().optional(),
        region: z.string().optional(),
        localCouncil: z.string().optional(),
        descriptionOfWork: z.string().optional(),
        sitePlanData: z.string().optional(),
        sitePlanImage: z.string().optional(),
        proposalSentAt: z.date().optional(),
        proposalSentTo: z.string().optional(),
        checklistSelections: z.any().optional(),
        specData: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await eclipseDb.getEclipseQuoteById(input.id);
        if (!quote) throw new Error("Eclipse quote not found");
        if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        const { id, ...data } = input;
        // Convert units array to JSON string for storage
        if (data.units) {
          data.units = JSON.stringify(data.units);
        }
        if (data.checklistSelections) {
          data.checklistSelections = JSON.stringify(data.checklistSelections);
        }
        if (data.specData) {
          data.specData = JSON.stringify(data.specData);
        }
        const amount = data.totalSellPriceEx ?? quote.totalSellPriceEx;
        await eclipseDb.updateEclipseQuote(id, {
          ...data,
          ...hbcfRequirementFieldsForAmount(amount, "Eclipse quote"),
        } as any);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const quote = await eclipseDb.getEclipseQuoteById(input.id);
        if (!quote) throw new Error("Eclipse quote not found");
        await eclipseDb.deleteEclipseQuote(input.id);
        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.number(), archived: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await eclipseDb.getEclipseQuoteById(input.id);
        if (!quote) throw new Error("Eclipse quote not found");
        if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        await eclipseDb.updateEclipseQuote(input.id, { archived: input.archived });
        return { success: true };
      }),
    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await eclipseDb.getEclipseQuoteById(input.id);
        if (!quote) throw new Error("Eclipse quote not found");
        if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        const newNumber = await eclipseDb.getNextEclipseQuoteNumber();
        const newId = await eclipseDb.duplicateEclipseQuote(input.id, ctx.user.id, newNumber);
        return { id: newId, quoteNumber: newNumber };
      }),
  }),

  // ─── Calculate ───────────────────────────────────────────────────────────────
  calculate: protectedProcedure
    .input(z.object({
      units: z.array(unitInputSchema),
      commissionRate: z.number().optional(),
      margin: z.number().optional(),
      positions: z.array(z.object({
        x: z.number(),
        y: z.number(),
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      // Load pricing from DB (or use defaults if not seeded)
      const pricingRows = await eclipseDb.getAllEclipsePricing();
      let editablePrices;
      if (pricingRows.length > 0) {
        editablePrices = dbRowsToEditablePrices(pricingRows.map(r => ({ key: r.key, value: r.value })));
      } else {
        editablePrices = getDefaultPrices();
      }
      const pricingData = toPricingData(editablePrices);
      // Use master data commission/margin (stored as percentages, convert to decimals)
      const commissionRate = (editablePrices.commissionRate ?? 10) / 100;
      const margin = (editablePrices.margin ?? 38) / 100;
      const positions: PositionedUnit[] | undefined = input.positions;
      const result = calculateProjectWithLayout(input.units, commissionRate, margin, pricingData, positions);
      return result;
    }),

  // ─── Pricing Admin ───────────────────────────────────────────────────────────
  pricing: router({
    getAll: protectedProcedure.query(async () => {
      const rows = await eclipseDb.getAllEclipsePricing();
      if (rows.length === 0) {
        // Return defaults if no pricing has been saved yet
        const defaults = getDefaultPrices();
        return { prices: defaults, isDefault: true };
      }
      const prices = dbRowsToEditablePrices(rows.map(r => ({ key: r.key, value: r.value })));
      return { prices, isDefault: false };
    }),

    save: adminProcedure
      .input(z.object({
        prices: z.any(), // EditablePrices object
      }))
      .mutation(async ({ input }) => {
        const rows = editablePricesToDbRows(input.prices);
        await eclipseDb.bulkUpsertEclipsePricing(rows);
        return { success: true };
      }),

    reset: adminProcedure
      .mutation(async () => {
        await eclipseDb.resetEclipsePricing();
        return { success: true, prices: getDefaultPrices() };
      }),
  }),

  generateDescription: protectedProcedure
    .input(z.object({
      eclipseQuoteId: z.number(),
      refinementInstruction: z.string().optional(),
      previousDescription: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const quote = await eclipseDb.getEclipseQuoteById(input.eclipseQuoteId);
      if (!quote) throw new Error("Eclipse quote not found");
      if (!isAdminRole(ctx.user.role) && quote.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }

      const units = (quote.units as any[]) || [];
      const unitSummary = units.map((u, i) => {
        const sqm = ((u.bladeWidth || 0) / 1000) * ((u.length || 0) / 1000);
        return `Unit ${i + 1}: ${u.bladeWidth}mm W × ${u.length}mm L (${sqm.toFixed(1)}m²), ${u.mountType}, ${u.bladeColour} blades, ${u.structureColour} structure`;
      }).join("\n");

      const totalSqm = units.reduce((s, u) => s + ((u.bladeWidth || 0) / 1000) * ((u.length || 0) / 1000), 0);

      // Fetch DOW reference examples
      const dowGroups = await db.getMasterDataByCategory("dow_group");
      const dowItems = await db.getMasterDataByCategory("dow_item");
      let referenceExamples = "";
      if (dowGroups.length > 0 && dowItems.length > 0) {
        const eclipseGroup = dowGroups.find(g => g.value.toLowerCase().includes("eclipse") || g.value.toLowerCase().includes("louvre") || g.value.toLowerCase().includes("opening"));
        if (eclipseGroup) {
          const items = dowItems.filter(item => (item.metadata as any)?.groupKey === eclipseGroup.key).slice(0, 5);
          if (items.length > 0) {
            referenceExamples = `\n\nReference examples of approved Eclipse descriptions:\n${items.map(i => `- ${i.value}`).join("\n")}`;
          }
        }
        if (!referenceExamples) {
          const allExamples = dowItems.slice(0, 5);
          if (allExamples.length > 0) {
            referenceExamples = `\n\nReference examples of approved descriptions (adapt style for Eclipse opening roof):\n${allExamples.map(i => `- ${i.value}`).join("\n")}`;
          }
        }
      }

      let refinementSection = "";
      if (input.refinementInstruction && input.previousDescription) {
        refinementSection = `\n\nPREVIOUS DESCRIPTION (to refine):\n"${input.previousDescription}"\n\nREFINEMENT INSTRUCTION: ${input.refinementInstruction}\n\nRewrite the description following the refinement instruction while keeping it professional and accurate.`;
      }

      const baseInstruction = input.refinementInstruction && input.previousDescription
        ? "Refine the previous description according to the refinement instruction below."
        : "Write 2-4 sentences describing the work to be performed. Be concise but thorough. Do not include pricing.";

      const prompt = `You are a technical writer for Altaspan, a construction company specialising in outdoor living structures in the ACT and NSW region of Australia.

Write a professional "Description of Work" for an Eclipse Opening Roof (motorised louvre) project specification.${referenceExamples}

Client: ${quote.clientName}
Site: ${quote.clientAddress || "Not specified"}
Region: ${quote.region || "Canberra"}
Total Area: ${totalSqm.toFixed(1)}m²
Number of Units: ${units.length}
${unitSummary}
${quote.notes ? `Notes: ${quote.notes}` : ""}${refinementSection}

${baseInstruction}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "You are a concise technical writer for Altaspan construction project specifications. You write in the same style as the company's existing approved descriptions of work. Keep descriptions professional, specific to the Eclipse opening roof system, and avoid generic filler language." },
          { role: "user", content: prompt },
        ],
      });

      const description = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : "";

      return { description };
    }),
});
