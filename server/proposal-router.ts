import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { router, tenantProcedure, tenantAdminProcedure } from "./_core/trpc";
import * as proposalDb from "./proposal-db";
import * as db from "./db";
import * as eclipseDb from "./eclipse-db";
import * as deckDb from "./deck-db";
import {
  blindQuoteItems,
  blindQuotes,
  proposalLibraryItems,
  ssQuoteItems,
  ssQuotes,
} from "../drizzle/schema";

const sectionSchema = z.object({
  type: z.enum(["opq", "deck", "eclipse", "blind", "louvre", "security_door", "security_screen"]),
  quoteId: z.number(),
  label: z.string(),
  worksPrice: z.number(),
  description: z.string().optional(),
});

const proposalLibraryItemIdsSchema = z.array(z.number().int().positive()).optional();

async function filterTenantProposalLibraryItemIds(ids: number[] | undefined, tenantId: number) {
  const uniqueIds = Array.from(new Set((ids || []).filter((id) => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length === 0) return [];

  const appDb = await db.getDb();
  if (!appDb) return [];

  const rows = await appDb
    .select({ id: proposalLibraryItems.id })
    .from(proposalLibraryItems)
    .where(and(
      eq(proposalLibraryItems.tenantId, tenantId),
      eq(proposalLibraryItems.isActive, true),
      inArray(proposalLibraryItems.id, uniqueIds),
    ));

  const validIds = new Set(rows.map((row) => row.id));
  return uniqueIds.filter((id) => validIds.has(id));
}

function normaliseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function compactSpecSheet(source: Record<string, unknown> | null | undefined) {
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, value]) => key.startsWith("spec") && hasValue(value))
      .filter(([key]) => !["specDiagramAnnotations"].includes(key))
  );
}

function latestRenderImage(renderHistory: unknown) {
  const entries = normaliseJson<any[]>(renderHistory, []);
  return entries
    .filter((entry) => entry?.imageUrl)
    .sort((a, b) => {
      if (a?.isFavourite && !b?.isFavourite) return -1;
      if (!a?.isFavourite && b?.isFavourite) return 1;
      return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
    })[0]?.imageUrl as string | undefined;
}

function imageEntries(...items: Array<{ url?: unknown; caption: string }>) {
  const seen = new Set<string>();
  return items
    .map((item) => ({ url: String(item.url || "").trim(), caption: item.caption }))
    .filter((item) => item.url)
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 8);
}

export const proposalRouter = router({
  // ─── List proposals ─────────────────────────────────────────────────────────
  list: tenantProcedure
    .input(z.object({
      status: z.string().optional(),
      clientId: z.number().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return proposalDb.listProposals(input, ctx.tenant.id);
    }),

  // ─── Get single proposal ────────────────────────────────────────────────────
  get: tenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return proposalDb.getProposalById(input.id, ctx.tenant.id);
    }),

  // ─── Create proposal ────────────────────────────────────────────────────────
  create: tenantProcedure
    .input(z.object({
      clientId: z.number(),
      sections: z.array(sectionSchema).optional(),
      coverMessage: z.string().optional(),
      validityDays: z.number().optional(),
      notes: z.string().optional(),
      proposalLibraryItemIds: proposalLibraryItemIdsSchema,
      progressPayments: z.record(z.string(), z.object({ percent: z.string(), amount: z.string() })).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const proposalNumber = await proposalDb.getNextProposalNumber();
      const proposalLibraryItemIds = await filterTenantProposalLibraryItemIds(input.proposalLibraryItemIds, ctx.tenant.id);
      const result = await proposalDb.createProposal({
        proposalNumber,
        tenantId: ctx.tenant.id,
        clientId: input.clientId,
        preparedBy: ctx.user.id,
        sections: input.sections || [],
        coverMessage: input.coverMessage,
        validityDays: input.validityDays || 30,
        notes: input.notes,
        proposalLibraryItemIds,
        progressPayments: input.progressPayments || null,
      });
      await proposalDb.logActivity({
        proposalId: result.id,
        action: "created",
        userId: ctx.user.id,
        detail: `Proposal ${proposalNumber} created`,
      });
      return result;
    }),

  // ─── Update proposal ────────────────────────────────────────────────────────
  update: tenantProcedure
    .input(z.object({
      id: z.number(),
      sections: z.array(sectionSchema).optional(),
      // Shared additional costs (reduced set)
      siteClean: z.string().optional(),
      constructionMgmt: z.string().optional(),
      councilFees: z.string().optional(),
      homeWarranty: z.string().optional(),
      otherCost: z.string().optional(),
      // Legacy fields (still accepted for backward compat but no longer shown in UI)
      approvals: z.string().optional(),
      delivery: z.string().optional(),
      engineering: z.string().optional(),
      demolition: z.string().optional(),
      travel: z.string().optional(),
      plumbing: z.string().optional(),
      electrical: z.string().optional(),
      concrete: z.string().optional(),
      footings: z.string().optional(),
      attachmentToHouse: z.string().optional(),
      gableBrackets: z.string().optional(),
      otherCostLabel: z.string().optional(),
      otherCostAmount: z.string().optional(),
      // Adjustments
      discountPercent: z.string().optional(),
      discountAmount: z.string().optional(),
      markupPercent: z.string().optional(),
      markupAmount: z.string().optional(),
      // Presentation
      coverMessage: z.string().optional(),
      validityDays: z.number().optional(),
      depositPercent: z.string().optional(),
      depositAmount: z.string().optional(),
      notes: z.string().optional(),
      proposalLibraryItemIds: proposalLibraryItemIdsSchema,
      // Editable content
      termsAndConditions: z.string().optional(),
      scopeOfWorks: z.string().optional(),
      exclusions: z.string().optional(),
      // Progress Payments (JSON: Record<string, {percent, amount}>)
      progressPayments: z.record(z.string(), z.object({ percent: z.string(), amount: z.string() })).nullable().optional(),
      // Computed totals
      sectionsSubtotalExGst: z.string().optional(),
      additionalCostsTotal: z.string().optional(),
      adjustmentAmount: z.string().optional(),
      grandTotalExGst: z.string().optional(),
      gstAmount: z.string().optional(),
      grandTotalIncGst: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, otherCost, ...data } = input;
      // Map otherCost to the DB column otherCostAmount
      const payload: any = { ...data };
      if (input.proposalLibraryItemIds !== undefined) {
        payload.proposalLibraryItemIds = await filterTenantProposalLibraryItemIds(input.proposalLibraryItemIds, ctx.tenant.id);
      }
      if (otherCost !== undefined) {
        payload.otherCostAmount = otherCost;
        payload.otherCostLabel = "Other Cost";
      }
      const result = await proposalDb.updateProposal(id, payload, ctx.tenant.id);
      if (!result) throw new Error("Proposal not found");
      await proposalDb.logActivity({
        proposalId: id,
        action: "updated",
        userId: ctx.user.id,
        detail: "Proposal updated",
      });
      return result;
    }),

  // ─── Delete proposal ────────────────────────────────────────────────────────
  delete: tenantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await proposalDb.deleteProposal(input.id, ctx.tenant!.id);
      return { success: true };
    }),

  // ─── Get active quotes for a client ─────────────────────────────────────────
  clientQuotes: tenantProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      return proposalDb.getActiveQuotesForClient(input.clientId, ctx.tenant.id);
    }),

  // ─── Get proposal activity log ─────────────────────────────────────────────
  activity: tenantProcedure
    .input(z.object({ proposalId: z.number() }))
    .query(async ({ ctx, input }) => {
      return proposalDb.getProposalActivity(input.proposalId, ctx.tenant.id);
    }),

  // ─── Mark as sent ───────────────────────────────────────────────────────────
  markSent: tenantProcedure
    .input(z.object({
      id: z.number(),
      sentTo: z.string(),
      pdfUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const proposal = await proposalDb.getProposalById(input.id, ctx.tenant.id);
      if (!proposal) throw new Error("Proposal not found");

      const expiresAt = new Date(now.getTime() + (proposal.validityDays || 30) * 86400000);
      await proposalDb.updateProposal(input.id, {
        status: "sent",
        sentAt: now,
        sentTo: input.sentTo,
        expiresAt,
        pdfUrl: input.pdfUrl,
        pdfGeneratedAt: now,
      } as any, ctx.tenant.id);

      // Sync section quote statuses
      const sections = (proposal.sections || []) as { type: string; quoteId: number }[];
      await proposalDb.syncSectionStatuses(sections, "sent", ctx.tenant.id);

      await proposalDb.logActivity({
        proposalId: input.id,
        action: "sent",
        userId: ctx.user.id,
        detail: `Sent to ${input.sentTo}`,
      });

      return { success: true };
    }),

  // ─── Mark as accepted ───────────────────────────────────────────────────────
  markAccepted: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await proposalDb.getProposalById(input.id, ctx.tenant.id);
      if (!proposal) throw new Error("Proposal not found");

      await proposalDb.updateProposal(input.id, {
        status: "accepted",
        signedAt: new Date(),
      } as any, ctx.tenant.id);

      const sections = (proposal.sections || []) as { type: string; quoteId: number }[];
      await proposalDb.syncSectionStatuses(sections, "accepted", ctx.tenant.id);

      await proposalDb.logActivity({
        proposalId: input.id,
        action: "accepted",
        userId: ctx.user.id,
        detail: "Client accepted proposal",
      });

      return { success: true };
    }),

  // ─── Mark as declined ───────────────────────────────────────────────────────
  markDeclined: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await proposalDb.getProposalById(input.id, ctx.tenant.id);
      if (!proposal) throw new Error("Proposal not found");

      await proposalDb.updateProposal(input.id, { status: "declined" } as any, ctx.tenant.id);

      const sections = (proposal.sections || []) as { type: string; quoteId: number }[];
      await proposalDb.syncSectionStatuses(sections, "lost", ctx.tenant.id);

      await proposalDb.logActivity({
        proposalId: input.id,
        action: "declined",
        userId: ctx.user.id,
        detail: "Client declined proposal",
      });

      return { success: true };
    }),

  // ─── Save PDF URL ───────────────────────────────────────────────────────────
  savePdf: tenantProcedure
    .input(z.object({ id: z.number(), pdfUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await proposalDb.updateProposal(input.id, {
        pdfUrl: input.pdfUrl,
        pdfGeneratedAt: new Date(),
      } as any, ctx.tenant.id);
      if (!result) throw new Error("Proposal not found");
      await proposalDb.logActivity({
        proposalId: input.id,
        action: "pdf_generated",
        userId: ctx.user.id,
        detail: "PDF generated and stored",
      });
      return { success: true };
    }),

  // ─── Get client info ────────────────────────────────────────────────────────
  clientInfo: tenantProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      return proposalDb.getClientInfo(input.clientId, ctx.tenant.id);
    }),

  // ─── Appendix Data (materials/units for PDF appendix pages) ─────────────────
  appendixData: tenantProcedure
    .input(z.object({
      sections: z.array(z.object({
        type: z.enum(["opq", "deck", "eclipse", "blind", "louvre", "security_door", "security_screen"]),
        quoteId: z.number(),
      })),
    }))
    .query(async ({ ctx, input }) => {
      const results: Record<string, Record<string, unknown>> = {};
      for (const section of input.sections) {
        const key = `${section.type}_${section.quoteId}`;
        if (section.type === "opq") {
          const quote = await db.getQuoteById(section.quoteId, ctx.tenant.id);
          if (!quote) continue;
          const components = await db.getComponentsByQuote(section.quoteId);
          const items = await db.getQuoteItems(section.quoteId, ctx.tenant.id);
          const materials: Array<{ name: string; qty: number; unit: string; tab: string }> = [];
          for (const comp of (components || [])) {
            if (!comp.included) continue;
            const lineItems = (comp.lineItems as any[]) || [];
            for (const item of lineItems) {
              if (!item.qty) continue;
              materials.push({
                name: item.component || "Unknown",
                qty: item.qty || 0,
                unit: item.uom || "ea",
                tab: comp.tabName,
              });
            }
          }
          const specItems = (items || []).map((i: any) => ({
            description: i.description,
            qty: parseFloat(i.qty || "0"),
            uom: i.uom || "ea",
            tab: i.tabName,
          }));
          results[key] = {
            descriptionOfWorks: quote?.descriptionOfWork || "",
            notes: quote?.notes || "",
            materials,
            specItems,
            specSheet: compactSpecSheet(quote as Record<string, unknown>),
            specWidth: quote?.specWidth || null,
            specLength: quote?.specLength || null,
            images: imageEntries(
              ...((quote as any).proposalPhotos || []).map((url: string, index: number) => ({ url, caption: `Proposal photo ${index + 1}` })),
              { url: (quote as any).sitePlanImage, caption: "Site plan" },
              { url: (quote as any).photoUrl, caption: "Uploaded site photo" },
              { url: latestRenderImage((quote as any).renderHistory), caption: "AI render" },
            ),
          };
        } else if (section.type === "eclipse") {
          const quote = await eclipseDb.getEclipseQuoteById(section.quoteId, ctx.tenant.id);
          if (!quote) continue;
          const entries = await db.getEclipseByQuote(section.quoteId);
          // Safely parse units - may be JSON string, array, or null
          let rawUnits = quote?.units;
          if (typeof rawUnits === "string") {
            try { rawUnits = JSON.parse(rawUnits); } catch { rawUnits = []; }
          }
          const units: any[] = Array.isArray(rawUnits) ? rawUnits : [];
          const unitSummary = units.map((u: any, i: number) => ({
            name: u.name || `Unit ${i + 1}`,
            width: u.width || 0,
            projection: u.projection || 0,
            colour: u.colour || "",
          }));
          const materialLines: Array<{ description: string; qty: number }> = [];
          for (const entry of entries) {
            if (!entry.included) continue;
            let rawLines = entry.materialLines;
            if (typeof rawLines === "string") {
              try { rawLines = JSON.parse(rawLines); } catch { rawLines = []; }
            }
            const lines: any[] = Array.isArray(rawLines) ? rawLines : [];
            for (const line of lines) {
              if (line.qty && line.description) {
                materialLines.push({ description: line.description, qty: line.qty });
              }
            }
          }
          results[key] = {
            units: unitSummary,
            materialLines,
            totalSqm: quote?.totalSqm || null,
            descriptionOfWorks: quote?.descriptionOfWork || "",
            notes: quote?.notes || "",
            specSheet: normaliseJson<Record<string, unknown>>(quote?.specData, {}),
            images: imageEntries(
              { url: quote?.sitePlanImage, caption: "Site plan" },
              { url: quote?.photoUrl, caption: "Uploaded site photo" },
              { url: latestRenderImage(quote?.renderHistory), caption: "AI render" },
            ),
          };
        } else if (section.type === "deck") {
          const quote = await deckDb.getDeckQuoteById(section.quoteId, ctx.tenant.id);
          if (!quote) continue;
          results[key] = {
            boardType: quote?.deckingBrand || "",
            area: quote?.areaM2 || null,
            width: quote?.deckWidthM || null,
            projection: quote?.deckProjectionM || null,
            frameType: quote?.frameType || "",
            colour: quote?.colour || "",
            shape: quote?.deckShape || "",
            descriptionOfWorks: quote?.descriptionOfWork || "",
            notes: quote?.notes || "",
            specSheet: normaliseJson<Record<string, unknown>>(quote?.specData, {}),
            images: imageEntries(
              { url: quote?.photoUrl, caption: "Uploaded site photo" },
              { url: latestRenderImage(quote?.renderHistory), caption: "AI render" },
            ),
            addons: {
              stairs: quote?.stairsRequired || false,
              handrail: quote?.handrailRequired || false,
              screens: quote?.screensRequired || false,
              lighting: quote?.lightingRequired || false,
            },
          };
        } else if (section.type === "blind" || section.type === "security_screen") {
          const appDb = await db.getDb();
          if (!appDb) continue;
          const quoteTable = section.type === "blind" ? blindQuotes : ssQuotes;
          const itemTable = section.type === "blind" ? blindQuoteItems : ssQuoteItems;
          const [quote] = await appDb
            .select()
            .from(quoteTable as any)
            .where(and(eq((quoteTable as any).id, section.quoteId), eq((quoteTable as any).tenantId, ctx.tenant.id)))
            .limit(1);
          if (!quote) continue;
          const items = await appDb
            .select()
            .from(itemTable as any)
            .where(and(eq((itemTable as any).quoteId, section.quoteId), eq((itemTable as any).tenantId, ctx.tenant.id)))
            .orderBy(asc((itemTable as any).itemNumber));
          results[key] = {
            quoteNumber: quote.quoteNumber,
            notes: quote.notes || "",
            items: items.map((item: any) => ({
              itemNumber: item.itemNumber,
              brand: item.brand,
              productType: item.productType,
              widthMm: item.widthMm,
              heightMm: item.heightMm,
              quantity: item.quantity,
              colourName: item.colourName,
              fabricColourName: item.fabricColourName,
              handleSide: item.handleSide,
              hingeSide: item.hingeSide,
              openingDirection: item.openingDirection,
              hingePosition: item.hingePosition,
              glassInfillQuantity: item.glassInfillQuantity,
              notes: item.notes,
              lineTotalExGst: item.lineTotalExGst,
              photoUrl: item.photoUrl,
            })),
            images: imageEntries(
              ...items.map((item: any) => ({
                url: item.photoUrl,
                caption: `Item ${item.itemNumber}${item.productType ? ` — ${item.productType}` : ""}`,
              })),
            ),
          };
        }
      }
      return results;
    }),
});
