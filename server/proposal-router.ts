import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import * as proposalDb from "./proposal-db";
import * as db from "./db";
import * as eclipseDb from "./eclipse-db";
import * as deckDb from "./deck-db";

const sectionSchema = z.object({
  type: z.enum(["opq", "deck", "eclipse", "blind", "louvre", "security_door", "security_screen"]),
  quoteId: z.number(),
  label: z.string(),
  worksPrice: z.number(),
  description: z.string().optional(),
});

export const proposalRouter = router({
  // ─── List proposals ─────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      clientId: z.number().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return proposalDb.listProposals(input);
    }),

  // ─── Get single proposal ────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return proposalDb.getProposalById(input.id);
    }),

  // ─── Create proposal ────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      clientId: z.number(),
      sections: z.array(sectionSchema).optional(),
      coverMessage: z.string().optional(),
      validityDays: z.number().optional(),
      notes: z.string().optional(),
      progressPayments: z.record(z.string(), z.object({ percent: z.string(), amount: z.string() })).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const proposalNumber = await proposalDb.getNextProposalNumber();
      const result = await proposalDb.createProposal({
        proposalNumber,
        clientId: input.clientId,
        preparedBy: ctx.user.id,
        sections: input.sections || [],
        coverMessage: input.coverMessage,
        validityDays: input.validityDays || 30,
        notes: input.notes,
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
  update: protectedProcedure
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
      if (otherCost !== undefined) {
        payload.otherCostAmount = otherCost;
        payload.otherCostLabel = "Other Cost";
      }
      const result = await proposalDb.updateProposal(id, payload);
      await proposalDb.logActivity({
        proposalId: id,
        action: "updated",
        userId: ctx.user.id,
        detail: "Proposal updated",
      });
      return result;
    }),

  // ─── Delete proposal ────────────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await proposalDb.deleteProposal(input.id);
      return { success: true };
    }),

  // ─── Get active quotes for a client ─────────────────────────────────────────
  clientQuotes: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      return proposalDb.getActiveQuotesForClient(input.clientId);
    }),

  // ─── Get proposal activity log ─────────────────────────────────────────────
  activity: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .query(async ({ input }) => {
      return proposalDb.getProposalActivity(input.proposalId);
    }),

  // ─── Mark as sent ───────────────────────────────────────────────────────────
  markSent: protectedProcedure
    .input(z.object({
      id: z.number(),
      sentTo: z.string(),
      pdfUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const proposal = await proposalDb.getProposalById(input.id);
      if (!proposal) throw new Error("Proposal not found");

      const expiresAt = new Date(now.getTime() + (proposal.validityDays || 30) * 86400000);
      await proposalDb.updateProposal(input.id, {
        status: "sent",
        sentAt: now,
        sentTo: input.sentTo,
        expiresAt,
        pdfUrl: input.pdfUrl,
        pdfGeneratedAt: now,
      } as any);

      // Sync section quote statuses
      const sections = (proposal.sections || []) as { type: string; quoteId: number }[];
      await proposalDb.syncSectionStatuses(sections, "sent");

      await proposalDb.logActivity({
        proposalId: input.id,
        action: "sent",
        userId: ctx.user.id,
        detail: `Sent to ${input.sentTo}`,
      });

      return { success: true };
    }),

  // ─── Mark as accepted ───────────────────────────────────────────────────────
  markAccepted: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await proposalDb.getProposalById(input.id);
      if (!proposal) throw new Error("Proposal not found");

      await proposalDb.updateProposal(input.id, {
        status: "accepted",
        signedAt: new Date(),
      } as any);

      const sections = (proposal.sections || []) as { type: string; quoteId: number }[];
      await proposalDb.syncSectionStatuses(sections, "accepted");

      await proposalDb.logActivity({
        proposalId: input.id,
        action: "accepted",
        userId: ctx.user.id,
        detail: "Client accepted proposal",
      });

      return { success: true };
    }),

  // ─── Mark as declined ───────────────────────────────────────────────────────
  markDeclined: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await proposalDb.getProposalById(input.id);
      if (!proposal) throw new Error("Proposal not found");

      await proposalDb.updateProposal(input.id, { status: "declined" } as any);

      const sections = (proposal.sections || []) as { type: string; quoteId: number }[];
      await proposalDb.syncSectionStatuses(sections, "lost");

      await proposalDb.logActivity({
        proposalId: input.id,
        action: "declined",
        userId: ctx.user.id,
        detail: "Client declined proposal",
      });

      return { success: true };
    }),

  // ─── Save PDF URL ───────────────────────────────────────────────────────────
  savePdf: protectedProcedure
    .input(z.object({ id: z.number(), pdfUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await proposalDb.updateProposal(input.id, {
        pdfUrl: input.pdfUrl,
        pdfGeneratedAt: new Date(),
      } as any);
      await proposalDb.logActivity({
        proposalId: input.id,
        action: "pdf_generated",
        userId: ctx.user.id,
        detail: "PDF generated and stored",
      });
      return { success: true };
    }),

  // ─── Get client info ────────────────────────────────────────────────────────
  clientInfo: protectedProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      return proposalDb.getClientInfo(input.clientId);
    }),

  // ─── Appendix Data (materials/units for PDF appendix pages) ─────────────────
  appendixData: protectedProcedure
    .input(z.object({
      sections: z.array(z.object({
        type: z.enum(["opq", "deck", "eclipse", "blind", "louvre", "security_door", "security_screen"]),
        quoteId: z.number(),
      })),
    }))
    .query(async ({ input }) => {
      const results: Record<string, Record<string, unknown>> = {};
      for (const section of input.sections) {
        const key = `${section.type}_${section.quoteId}`;
        if (section.type === "opq") {
          const quote = await db.getQuoteById(section.quoteId);
          const components = await db.getComponentsByQuote(section.quoteId);
          const items = await db.getQuoteItems(section.quoteId);
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
            materials,
            specItems,
            specWidth: quote?.specWidth || null,
            specLength: quote?.specLength || null,
          };
        } else if (section.type === "eclipse") {
          const quote = await eclipseDb.getEclipseQuoteById(section.quoteId);
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
          };
        } else if (section.type === "deck") {
          const quote = await deckDb.getDeckQuoteById(section.quoteId);
          results[key] = {
            boardType: quote?.deckingBrand || "",
            area: quote?.areaM2 || null,
            width: quote?.deckWidthM || null,
            projection: quote?.deckProjectionM || null,
            frameType: quote?.frameType || "",
            colour: quote?.colour || "",
            shape: quote?.deckShape || "",
            addons: {
              stairs: quote?.stairsRequired || false,
              handrail: quote?.handrailRequired || false,
              screens: quote?.screensRequired || false,
              lighting: quote?.lightingRequired || false,
            },
          };
        }
      }
      return results;
    }),
});
