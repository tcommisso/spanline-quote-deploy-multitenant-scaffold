import { z } from "zod";
import { router, tenantProcedure as protectedProcedure } from "./_core/trpc";
import { isAdminRole } from "@shared/const";
import * as crmDb from "./crm-db";
import * as emailTemplatesDb from "./email-templates-db";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { quotes, quoteComponents, constructionJobs, constructionProgress, checkMeasureWorkbooks, users, crmLeads, deckQuotes, eclipseQuotes, branches, crmBuildingAuthority } from "../drizzle/schema";
import { and, eq, inArray, sql, isNull, or } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { getTenantAppSetting } from "./tenant-settings-store";

async function assertLeadAccess(ctx: any, leadId: number) {
  const lead = await crmDb.getLead(leadId, tenantIdFromContext(ctx));
  if (!lead) throw new Error("Lead not found");
  return lead;
}

async function assertAppointmentAccess(ctx: any, appointmentId: number) {
  const appointment = await crmDb.getAppointment(appointmentId, tenantIdFromContext(ctx));
  if (!appointment) throw new Error("Appointment not found");
  await assertLeadAccess(ctx, appointment.leadId);
  return appointment;
}

async function assertQuoteAccess(ctx: any, quoteId: number, quoteType: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tenantId = tenantIdFromContext(ctx);
  const normalizedType = quoteType.toLowerCase();
  const table =
    normalizedType === "deck" ? deckQuotes :
    normalizedType === "eclipse" ? eclipseQuotes :
    normalizedType === "structure" || normalizedType === "quote" ? quotes :
    null;

  if (!table) throw new Error("Quote type not supported");

  const conditions: any[] = [eq(table.id, quoteId)];
  appendTenantScope(conditions, table.tenantId, tenantId);
  const [quote] = await db.select({ id: table.id }).from(table).where(and(...conditions)).limit(1);
  if (!quote) throw new Error("Quote not found");
  return quote;
}

const appointmentParticipantSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().email(),
});

function syncErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Calendar sync failed";
}

function normalizeParticipants(participants?: Array<{ name?: string; email: string }>) {
  return (participants || [])
    .map((participant) => ({
      name: participant.name?.trim() || undefined,
      email: participant.email.trim(),
    }))
    .filter((participant) => participant.email);
}

async function markAppointmentSyncFailed(appointmentId: number, error: unknown, tenantId?: number | null) {
  await crmDb.updateAppointmentSyncStatus(appointmentId, {
    status: "failed",
    error: syncErrorMessage(error),
    syncedAt: null,
  }, tenantId);
}

export const crmRouter = router({
  // ─── Dashboard ──────────────────────────────────────────────────────────
  dashboard: router({
    kpis: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), designAdvisor: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const fyStart = input?.fyStart;
        const fyEnd = input?.fyEnd;
        const branchId = input?.branchId;
        // Design advisers only see their own KPIs (role-based restriction)
        let da = input?.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getDashboardKPIs(da, fyStart, fyEnd, branchId, tenantId);
      }),
    recentLeads: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), designAdvisor: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const fyStart = input?.fyStart;
        const fyEnd = input?.fyEnd;
        const branchId = input?.branchId;
        let da = input?.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getRecentLeads(10, da, fyStart, fyEnd, branchId, tenantId);
      }),
    leadsByStatus: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), designAdvisor: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const fyStart = input?.fyStart;
        const fyEnd = input?.fyEnd;
        const branchId = input?.branchId;
        let da = input?.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getLeadsByStatus(da, fyStart, fyEnd, branchId, tenantId);
      }),
    branchPerformance: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), designAdvisor: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        let da = input?.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getBranchPerformance(input?.fyStart, input?.fyEnd, da, input?.branchId, tenantIdFromContext(ctx));
      }),
    contractedSales: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), designAdvisor: z.string().optional(), branchId: z.number().optional(), limit: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        let da = input?.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getContractedSales(da, input?.fyStart, input?.fyEnd, input?.branchId, input?.limit ?? 50, tenantIdFromContext(ctx));
      }),
    adviserPerformance: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return crmDb.getAdviserPerformance(input?.fyStart, input?.fyEnd, input?.branchId, tenantIdFromContext(ctx));
      }),
    monthlyTrends: protectedProcedure
      .input(z.object({ fy: z.number(), designAdvisor: z.string().optional(), branchId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        let da = input.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getMonthlyTrends(input.fy, da, input.branchId, tenantIdFromContext(ctx));
      }),
    adviserTimeToClose: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return crmDb.getAdviserTimeToClose(input?.fyStart, input?.fyEnd, input?.branchId, tenantIdFromContext(ctx));
      }),
    leadSourceBreakdown: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional(), designAdvisor: z.string().optional(), branchId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        let da = input?.designAdvisor;
        if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
          da = ctx.user.name;
        }
        return crmDb.getLeadSourceBreakdown(input?.fyStart, input?.fyEnd, da, input?.branchId, tenantIdFromContext(ctx));
      }),
    outcomeBreakdown: protectedProcedure
      .input(z.object({ fyStart: z.string().optional(), fyEnd: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return crmDb.getOutcomeBreakdown(input?.fyStart, input?.fyEnd, tenantIdFromContext(ctx));
      }),
  }),

  // ─── Leads ──────────────────────────────────────────────────────────────
  leads: router({
    list: protectedProcedure.input(z.object({
      status: z.string().optional(),
      lifecycleView: z.enum(["pipeline", "clients", "all"]).optional(),
      productType: z.string().optional(),
      leadSource: z.string().optional(),
      designAdvisor: z.string().optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      franchiseNumber: z.string().optional(),
      branchId: z.union([z.number(), z.literal("unassigned")]).optional(),
      baStatus: z.string().optional(),
      showArchived: z.boolean().optional(),
      showAll: z.boolean().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sortBy: z.string().optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const filters = input || {};
      const tenantId = tenantIdFromContext(ctx);
      // Design advisers only see their own leads unless they have supervisor permission
      if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads) {
        if (ctx.user.role === 'design_adviser' && ctx.user.name) {
          filters.designAdvisor = ctx.user.name;
        }
      }
      return crmDb.listLeads({ ...filters, tenantId });
    }),

    postConstructionStatuses: protectedProcedure.input(z.object({
      leadIds: z.array(z.number().int().positive()).max(500),
    })).query(async ({ ctx, input }) => {
      return crmDb.getPostConstructionStatuses(input.leadIds, tenantIdFromContext(ctx));
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      return crmDb.getLead(input.id, tenantIdFromContext(ctx));
    }),

    create: protectedProcedure.input(z.object({
      contactFirstName: z.string().optional(),
      contactLastName: z.string().optional(),
      contactPhone: z.string().optional(),
      contactEmail: z.string().optional(),
      contactAddress: z.string().optional(),
      clientNumber: z.string().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      detectedRegion: z.string().optional(),
      productType: z.string().optional(),
      leadSource: z.string().optional(),
      designAdvisor: z.string().optional(),
      franchiseNumber: z.string().optional(),
      franchiseType: z.string().optional(),
      sourceCreatedAt: z.coerce.date().nullable().optional(),
      notes: z.string().optional(),
      branchId: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      // Reject test leads — prevent accidental storage of automation test data
      const fullName = `${input.contactFirstName || ""} ${input.contactLastName || ""}`.trim().toLowerCase();
      const emailLower = (input.contactEmail || "").toLowerCase();
      const isTestLead =
        fullName.includes("zapier test") ||
        emailLower.includes("zapier-test@") ||
        emailLower.includes("zapier+test@") ||
        emailLower === "vitest-runner@example.com" ||
        emailLower === "integration-check@example.com" ||
        emailLower.endsWith("@vitest.local") ||
        fullName === "test test" ||
        fullName === "test";
      if (isTestLead) {
        console.log(`[CRM] Rejected test lead via tRPC: ${fullName} / ${input.contactEmail}`);
        return { id: 0, leadNumber: "TEST-0000" };
      }

      const tenantId = tenantIdFromContext(ctx);
      const leadNumber = await crmDb.getNextLeadNumber(tenantId);

      // Auto-assign branch based on franchise number or address proximity
      let branchId = input.branchId;
      if (!branchId && input.franchiseNumber === 'RIV') {
        branchId = 2; // Wagga Wagga
      } else if (!branchId && input.franchiseNumber === 'ACT') {
        branchId = 1; // Canberra
      } else if (!branchId && input.contactAddress) {
        try {
          const { getDb } = await import("./db");
          const { branches } = await import("../drizzle/schema");
          const db = await getDb();
          if (db) {
            const branchConditions: any[] = [eq(branches.isActive, true)];
            appendTenantScope(branchConditions, branches.tenantId, tenantId);
            const branchRows = await db.select().from(branches).where(and(...branchConditions));
            if (branchRows.length > 0) {
              const { makeRequest } = await import("./_core/map");
              const origins = branchRows.map(b => b.address).filter(Boolean).join("|");
              if (origins) {
                const resp = await makeRequest(
                  "https://maps.googleapis.com/maps/api/distancematrix/json",
                  { origins, destinations: input.contactAddress, mode: "driving" }
                );
                if ((resp as any)?.rows) {
                  let minDist = Infinity;
                  let closestIdx = 0;
                  (resp as any).rows.forEach((row: any, idx: number) => {
                    const el = row.elements?.[0];
                    if (el?.status === "OK" && el.distance?.value < minDist) {
                      minDist = el.distance.value;
                      closestIdx = idx;
                    }
                  });
                  if (minDist < Infinity) {
                    branchId = branchRows.filter(b => b.address)[closestIdx]?.id || null;
                  }
                }
              }
            }
          }
        } catch (e) {
          // Non-blocking — don't fail lead creation if branch detection fails
          console.error("[CRM] Auto-branch detection failed:", e);
        }
      }

      return crmDb.createLead({ ...input, branchId, leadNumber, tenantId, createdBy: ctx.user.id });
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      contactFirstName: z.string().optional(),
      contactLastName: z.string().optional(),
      contactPhone: z.string().optional(),
      contactEmail: z.string().optional(),
      contactAddress: z.string().optional(),
      clientNumber: z.string().nullable().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      detectedRegion: z.string().nullable().optional(),
      productType: z.string().optional(),
      leadSource: z.string().optional(),
      status: z.string().optional(),
      outcome: z.string().optional(),
      designAdvisor: z.string().optional(),
      franchiseNumber: z.string().optional(),
      franchiseType: z.string().optional(),
      sourceCreatedAt: z.coerce.date().nullable().optional(),
      assignedDate: z.string().optional(),
      notes: z.string().optional(),
      branchId: z.number().nullable().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const tenantId = tenantIdFromContext(ctx);

      // Auto-create construction job when status changes to 'contract'
      if (data.status === "contract") {
        const lead = await crmDb.getLead(id, tenantId);
        if (lead) {
          const db = await getDb();
          if (db) {
            // Check if a job already exists for this lead
            const existingJobConditions = [eq(constructionJobs.leadId, id)];
            appendTenantScope(existingJobConditions, constructionJobs.tenantId, tenantId);
            const existingJobs = await db.select().from(constructionJobs).where(and(...existingJobConditions));
            if (existingJobs.length === 0) {
              // Find the quote linked to this lead (via clientId)
              const quoteConditions = [eq(quotes.clientId, id)];
              appendTenantScope(quoteConditions, quotes.tenantId, tenantId);
              const linkedQuotes = await db.select().from(quotes).where(and(...quoteConditions));
              const latestQuote = linkedQuotes.length > 0 ? linkedQuotes[linkedQuotes.length - 1] : null;

              // Find design adviser user by name
              let designAdviserId: number | null = null;
              const adviserName = lead.designAdvisor || latestQuote?.designAdvisor || null;
              if (adviserName) {
                const [adviserUser] = await db.select().from(users).where(eq(users.name, adviserName));
                if (adviserUser) designAdviserId = adviserUser.id;
              }

              // Create construction job
              const clientName = [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unknown";
              const [jobResult] = await db.insert(constructionJobs).values({
                quoteId: latestQuote?.id || null,
                quoteNumber: latestQuote?.quoteNumber || null,
                clientName,
                siteAddress: lead.contactAddress || latestQuote?.siteAddress || null,
                leadId: id,
                tenantId,
                designAdviserId,
                designAdviserName: adviserName,
                priority: "normal",
                createdBy: ctx.user.id,
              });
              const jobId = jobResult.insertId;

              // Create default progress stages
              const DEFAULT_STAGES = ["Site Prep", "Footings & Concrete", "Frame & Posts", "Roof Installation", "Electrical", "Plumbing", "Walls & Cladding", "Final Inspection"];
              for (const stage of DEFAULT_STAGES) {
                await db.insert(constructionProgress).values({ tenantId, jobId, stage, status: "pending" });
              }

              // Create check measure workbook (duplicate spec + components)
              {
                let specFields: Record<string, any> = {};
                let componentSnapshot: Array<{ tabName: string; included: boolean; lineItems: any }> = [];
                let originalQuoteId: number | null = null;
                let originalQuoteNumber: string | null = null;

                if (latestQuote) {
                  for (const [key, value] of Object.entries(latestQuote)) {
                    if (key.startsWith("spec") || key === "designAdvisor" || key === "descriptionOfWork") {
                      specFields[key] = value;
                    }
                  }
                  const components = await db.select().from(quoteComponents).where(eq(quoteComponents.quoteId, latestQuote.id));
                  componentSnapshot = components.map(c => ({
                    tabName: c.tabName,
                    included: c.included ?? false,
                    lineItems: c.lineItems,
                  }));
                  originalQuoteId = latestQuote.id;
                  originalQuoteNumber = latestQuote.quoteNumber;
                }

                // Snapshot Deck quote data (latest by clientId)
                let deckSpecData: Record<string, any> | null = null;
                const linkedDeckQuotes = await db.select().from(deckQuotes).where(eq(deckQuotes.clientId, id));
                if (linkedDeckQuotes.length > 0) {
                  const latestDeck = linkedDeckQuotes[linkedDeckQuotes.length - 1];
                  deckSpecData = {
                    quoteNumber: latestDeck.quoteNumber,
                    clientName: latestDeck.clientName,
                    siteAddress: latestDeck.siteAddress,
                    deckWidthM: latestDeck.deckWidthM,
                    deckProjectionM: latestDeck.deckProjectionM,
                    deckHeightAboveGroundMm: latestDeck.deckHeightAboveGroundMm,
                    frameType: latestDeck.frameType,
                    steelBeamSelection: latestDeck.steelBeamSelection,
                    deckingBrand: latestDeck.deckingBrand,
                    colour: latestDeck.colour,
                    edgeDetail: latestDeck.edgeDetail,
                    deckShape: latestDeck.deckShape,
                    boardDirection: latestDeck.boardDirection,
                    levels: latestDeck.levels,
                    siteCondition: latestDeck.siteCondition,
                    stairsRequired: latestDeck.stairsRequired,
                    numberOfStairsFlights: latestDeck.numberOfStairsFlights,
                    handrailRequired: latestDeck.handrailRequired,
                    screensRequired: latestDeck.screensRequired,
                    lightingRequired: latestDeck.lightingRequired,
                    demolitionRequired: latestDeck.demolitionRequired,
                    areaM2: latestDeck.areaM2,
                    perimeterM: latestDeck.perimeterM,
                    sellPriceExGst: latestDeck.sellPriceExGst,
                    sellPriceIncGst: latestDeck.sellPriceIncGst,
                    designInputsJson: latestDeck.designInputsJson,
                  };
                }

                // Snapshot Eclipse quote data (latest by clientId)
                let eclipseSpecData: Record<string, any> | null = null;
                const linkedEclipseQuotes = await db.select().from(eclipseQuotes).where(eq(eclipseQuotes.clientId, id));
                if (linkedEclipseQuotes.length > 0) {
                  const latestEclipse = linkedEclipseQuotes[linkedEclipseQuotes.length - 1];
                  eclipseSpecData = {
                    quoteNumber: latestEclipse.quoteNumber,
                    clientName: latestEclipse.clientName,
                    clientAddress: latestEclipse.clientAddress,
                    units: latestEclipse.units,
                    commissionRate: latestEclipse.commissionRate,
                    margin: latestEclipse.margin,
                    footings: latestEclipse.footings,
                    footingRate: (latestEclipse as any).footingRate,
                    approvals: latestEclipse.approvals,
                    projectManagement: latestEclipse.projectManagement,
                    gableBrackets: latestEclipse.gableBrackets,
                    constructionCleaning: latestEclipse.constructionCleaning,
                    attachmentToHouse: (latestEclipse as any).attachmentToHouse,
                    travel: (latestEclipse as any).travel,
                    siteClean: (latestEclipse as any).siteClean,
                    demolition: (latestEclipse as any).demolition,
                    plumbing: (latestEclipse as any).plumbing,
                    concrete: (latestEclipse as any).concrete,
                    electrical: (latestEclipse as any).electrical,
                    otherCost: (latestEclipse as any).otherCost,
                    otherCostDescription: (latestEclipse as any).otherCostDescription,
                    totalSqm: latestEclipse.totalSqm,
                    totalSellPriceEx: latestEclipse.totalSellPriceEx,
                    totalRRPInc: latestEclipse.totalRRPInc,
                    rrpPerSqm: latestEclipse.rrpPerSqm,
                    sitePlanData: latestEclipse.sitePlanData,
                  };
                }

                await db.insert(checkMeasureWorkbooks).values({
                  jobId,
                  originalQuoteId,
                  originalQuoteNumber,
                  title: `Construction Check Measure \u2014 ${clientName}`,
                  specData: Object.keys(specFields).length > 0 ? specFields : null,
                  components: componentSnapshot.length > 0 ? componentSnapshot : null,
                  deckSpecData,
                  eclipseSpecData,
                  status: "pending_review",
                });
              }
            }
          }
        }
      }

      await crmDb.updateLead(id, data as any, tenantId);
      return { success: true };
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await crmDb.deleteLead(input.id, tenantIdFromContext(ctx));
      return { success: true };
    }),

    listIds: protectedProcedure.input(z.object({
      status: z.string().optional(),
      lifecycleView: z.enum(["pipeline", "clients", "all"]).optional(),
      productType: z.string().optional(),
      leadSource: z.string().optional(),
      designAdvisor: z.string().optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      franchiseNumber: z.string().optional(),
      branchId: z.union([z.number(), z.literal("unassigned")]).optional(),
      baStatus: z.string().optional(),
      showArchived: z.boolean().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) {
        throw new Error("Only administrators can list all lead IDs");
      }
      const filters = input || {};
      return crmDb.listLeadIds({ ...filters, tenantId: tenantIdFromContext(ctx) });
    }),

    archive: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Only administrators can archive leads");
      await crmDb.archiveLead(input.id, tenantIdFromContext(ctx));
      console.log(`[CRM] Archived lead ${input.id} by ${ctx.user.name}`);
      return { success: true };
    }),

    unarchive: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Only administrators can unarchive leads");
      await crmDb.unarchiveLead(input.id, tenantIdFromContext(ctx));
      console.log(`[CRM] Unarchived lead ${input.id} by ${ctx.user.name}`);
      return { success: true };
    }),

    bulkArchive: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Only administrators can bulk-archive leads");
      const archived = await crmDb.bulkArchiveLeads(input.ids, tenantIdFromContext(ctx));
      console.log(`[CRM] Bulk-archived ${archived} leads by ${ctx.user.name}`);
      return { success: true, archived };
    }),

    bulkDelete: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      // Only admin roles can bulk-delete
      if (!isAdminRole(ctx.user.role)) {
        throw new Error("Only administrators can bulk-delete leads");
      }
      const deleted = await crmDb.bulkDeleteLeads(input.ids, tenantIdFromContext(ctx));
      console.log(`[CRM] Bulk-deleted ${deleted} leads by ${ctx.user.name} (IDs: ${input.ids.join(", ")})`);
      return { success: true, deleted };
    }),

    bulkMarkExempt: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Only administrators can bulk-exempt leads");
      const updated = await crmDb.bulkMarkExempt(input.ids, tenantIdFromContext(ctx));
      console.log(`[CRM] Bulk-marked leads as Approval Exempt by ${ctx.user.name}`);
      return { success: true, updated };
    }),

    bulkAssignBranch: protectedProcedure.input(z.object({
      ids: z.array(z.number()).min(1).max(500),
      branchId: z.number(),
    })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) {
        throw new Error("Only administrators can bulk-assign branches");
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const tenantId = tenantIdFromContext(ctx);
      const leadConditions = [inArray(crmLeads.id, input.ids)];
      appendTenantScope(leadConditions, crmLeads.tenantId, tenantId);
      const result = await db.update(crmLeads).set({ branchId: input.branchId }).where(and(...leadConditions));
      const updated = result[0]?.affectedRows || 0;
      console.log(`[CRM] Bulk-assigned ${updated} leads to branch ${input.branchId} by ${ctx.user.name}`);

      // Notify branch manager about bulk assignment
      try {
        const { getBranchManager } = await import("./territory-router");
        const manager = await getBranchManager(input.branchId, tenantId);
        const managerEmail = manager?.managerEmail || manager?.email;
        if (managerEmail && updated > 0) {
          const { sendNotificationEmail } = await import("./email");
          const branchConditions: any[] = [eq(branches.id, input.branchId)];
          appendTenantScope(branchConditions, branches.tenantId, tenantId);
          const branch = await db.select({ name: branches.name }).from(branches).where(and(...branchConditions)).limit(1);
          const branchName = branch[0]?.name || `Branch #${input.branchId}`;
          await sendNotificationEmail({
            to: managerEmail,
            subject: `${updated} Lead${updated === 1 ? '' : 's'} Bulk-Assigned to ${branchName}`,
            htmlBody: `<h2>Leads Assigned to Your Branch</h2>
              <p><strong>${updated}</strong> lead${updated === 1 ? ' has' : 's have'} been bulk-assigned to <strong>${branchName}</strong> by ${ctx.user.name || 'Admin'}.</p>
              <p>Please review the new leads in your CRM dashboard.</p>
              <p style="color:#666;font-size:12px;">This is an automated notification from AltaSpan.</p>`,
          });
          console.log(`[CRM] Notified branch manager ${managerEmail} about ${updated} bulk-assigned leads`);
        }
      } catch (emailErr) {
        console.error("[CRM] Failed to notify branch manager on bulk assign:", emailErr);
      }

      return { success: true, updated };
    }),

    merge: protectedProcedure.input(z.object({
      primaryId: z.number(),
      duplicateIds: z.array(z.number()).min(1).max(50),
    })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) {
        throw new Error("Only administrators can merge leads");
      }
      const result = await crmDb.mergeLeads(input.primaryId, input.duplicateIds, tenantIdFromContext(ctx));
      console.log(`[CRM] Merged leads: primary=${input.primaryId}, duplicates=${input.duplicateIds.join(",")}, transferred=${result.transferred}, archived=${result.archived} by ${ctx.user.name}`);
      return { success: true, ...result };
    }),

    findDuplicates: protectedProcedure.input(z.object({
      leadId: z.number(),
    })).query(async ({ ctx, input }) => {
      return crmDb.findDuplicateLeads(input.leadId, tenantIdFromContext(ctx));
    }),

    getDuplicateIds: protectedProcedure.query(async ({ ctx }) => {
      return crmDb.getDuplicateLeadIds(tenantIdFromContext(ctx));
    }),

    getStaleIds: protectedProcedure.query(async ({ ctx }) => {
      return crmDb.getStaleLeadIds(tenantIdFromContext(ctx));
    }),

    bulkImport: protectedProcedure.input(z.object({
      leads: z.array(z.object({
        contactFirstName: z.string().optional(),
        contactLastName: z.string().optional(),
        contactPhone: z.string().optional(),
        contactEmail: z.string().optional(),
        contactAddress: z.string().optional(),
        clientNumber: z.string().optional(),
        suburb: z.string().optional(),
        state: z.string().optional(),
        postcode: z.string().optional(),
        productType: z.string().optional(),
        leadSource: z.string().optional(),
        designAdvisor: z.string().optional(),
        franchiseNumber: z.string().optional(),
        franchiseType: z.string().optional(),
        notes: z.string().optional(),
      })).min(1).max(500),
    })).mutation(async ({ input, ctx }) => {
      // Collect emails and phones from the import batch
      const emails = input.leads
        .map(l => l.contactEmail?.trim().toLowerCase())
        .filter((e): e is string => !!e);
      const phones = input.leads
        .map(l => l.contactPhone?.trim())
        .filter((p): p is string => !!p);

      // Fetch existing emails/phones from the database
      const tenantId = tenantIdFromContext(ctx);
      const existingContacts = await crmDb.getExistingContacts(emails, phones, tenantId);
      const existingEmails = new Set(existingContacts.emails.map(e => e.toLowerCase()));
      const existingPhones = new Set(existingContacts.phones);

      // Filter out duplicates
      const uniqueLeads: typeof input.leads = [];
      const skippedReasons: string[] = [];
      for (const lead of input.leads) {
        const email = lead.contactEmail?.trim().toLowerCase();
        const phone = lead.contactPhone?.trim();
        if (email && existingEmails.has(email)) {
          skippedReasons.push(`${lead.contactFirstName || ""} ${lead.contactLastName || ""} (email: ${email})`.trim());
          continue;
        }
        if (phone && existingPhones.has(phone)) {
          skippedReasons.push(`${lead.contactFirstName || ""} ${lead.contactLastName || ""} (phone: ${phone})`.trim());
          continue;
        }
        uniqueLeads.push(lead);
        // Add to sets to catch intra-batch duplicates too
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);
      }

      if (uniqueLeads.length === 0) {
        return { imported: 0, skipped: skippedReasons.length, skippedReasons };
      }

      // Generate lead numbers for unique entries only
      const startNumber = await crmDb.getNextLeadNumber(tenantId);
      const startNum = parseInt(startNumber.replace("L-", ""), 10);
      const leadsWithNumbers = uniqueLeads.map((lead, idx) => ({
        ...lead,
        leadNumber: `L-${String(startNum + idx).padStart(4, "0")}`,
        tenantId,
        status: "new" as const,
        createdBy: ctx.user.id,
      }));
      const result = await crmDb.bulkCreateLeads(leadsWithNumbers);
      return { imported: result.count, skipped: skippedReasons.length, skippedReasons };
    }),

    convertToClient: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const tenantId = tenantIdFromContext(ctx);
      const lead = await crmDb.getLead(input.id, tenantId);
      if (!lead) throw new Error("Lead not found");
      if (lead.status === "won") throw new Error("Lead is already converted");

      // Simply change status to 'won' — leads ARE the clients
      await crmDb.updateLead(input.id, { status: "won" } as any, tenantId);

      // Notify admin of the conversion
      try {
        const { notifyOwner } = await import("./_core/notification");
        const clientName = [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unknown";
        await notifyOwner({
          title: `Lead Converted: ${clientName}`,
          content: `CRM Lead ${lead.leadNumber || "#" + lead.id} has been converted to a client.\n\nClient: ${clientName}\nEmail: ${lead.contactEmail || "N/A"}\nPhone: ${lead.contactPhone || "N/A"}\nProduct: ${lead.productType || "N/A"}\nDesign Advisor: ${lead.designAdvisor || "Unassigned"}\nConverted by: ${ctx.user.name || "Unknown user"}`,
        });
      } catch (e) {
        // Non-critical — don't fail the conversion if notification fails
        console.error("[CRM] Failed to send conversion notification:", e);
      }

      return { success: true };
    }),

    // Search all leads regardless of status (used by LeadPicker for quote creation)
    searchAll: protectedProcedure.input(z.object({
      query: z.string(),
    })).query(async ({ ctx, input }) => {
      return crmDb.searchAllLeads(input.query, tenantIdFromContext(ctx));
    }),

    timeline: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      const lead = await crmDb.getLead(input.id, tenantIdFromContext(ctx));
      if (!lead) throw new Error("Lead not found");
      return crmDb.getLeadTimeline(input.id);
    }),

    /** Bulk-assign a design advisor to multiple leads (and their linked quotes) */
    bulkAssignAdvisor: protectedProcedure.input(z.object({
      leadIds: z.array(z.number()).min(1).max(500),
      advisorName: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const tenantId = tenantIdFromContext(ctx);
      const leadConditions = [inArray(crmLeads.id, input.leadIds)];
      appendTenantScope(leadConditions, crmLeads.tenantId, tenantId);

      // 1. Update CRM leads
      await db.update(crmLeads)
        .set({ designAdvisor: input.advisorName })
        .where(and(...leadConditions));

      // 2. Get lead numbers to derive matching quote numbers (L-XXXX → Q-XXXX)
      const updatedLeads = await db.select({ leadNumber: crmLeads.leadNumber })
        .from(crmLeads)
        .where(and(...leadConditions));

      const quoteNumbers = updatedLeads
        .map(l => l.leadNumber)
        .filter(Boolean)
        .map(ln => "Q-" + ln.replace(/^L-/, ""));

      // 3. Update linked quotes (structure, deck, eclipse) that have no advisor
      if (quoteNumbers.length > 0) {
        const quoteTenantSql = tenantId ? sql` AND (${quotes.tenantId} = ${tenantId} OR ${quotes.tenantId} IS NULL)` : sql``;
        await db.update(quotes)
          .set({ designAdvisor: input.advisorName })
          .where(sql`${quotes.quoteNumber} IN (${sql.join(quoteNumbers.map(q => sql`${q}`), sql`, `)}) AND (${quotes.designAdvisor} IS NULL OR ${quotes.designAdvisor} = '')${quoteTenantSql}`);
        await db.update(deckQuotes)
          .set({ designAdvisor: input.advisorName })
          .where(sql`${deckQuotes.quoteNumber} IN (${sql.join(quoteNumbers.map(q => sql`${q}`), sql`, `)}) AND (${deckQuotes.designAdvisor} IS NULL OR ${deckQuotes.designAdvisor} = '')`);
        await db.update(eclipseQuotes)
          .set({ designAdvisor: input.advisorName })
          .where(sql`${eclipseQuotes.quoteNumber} IN (${sql.join(quoteNumbers.map(q => sql`${q}`), sql`, `)}) AND (${eclipseQuotes.designAdvisor} IS NULL OR ${eclipseQuotes.designAdvisor} = '')`);
      }

      return { success: true, updatedCount: updatedLeads.length };
    }),

    /** Get summary of advisor assignment status for bulk-assign UI */
    advisorAssignmentSummary: protectedProcedure.query(async ({ ctx }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      const db = await getDb();
      if (!db) return { total: 0, assigned: 0, unassigned: 0, byAdvisor: [] };
      const tenantId = tenantIdFromContext(ctx);
      const leadConditions: any[] = [];
      appendTenantScope(leadConditions, crmLeads.tenantId, tenantId);
      const leadWhere = leadConditions.length > 0 ? and(...leadConditions) : undefined;

      const [stats] = await db.select({
        total: sql<number>`COUNT(*)`,
        assigned: sql<number>`SUM(CASE WHEN designAdvisor IS NOT NULL AND designAdvisor != '' THEN 1 ELSE 0 END)`,
        unassigned: sql<number>`SUM(CASE WHEN designAdvisor IS NULL OR designAdvisor = '' THEN 1 ELSE 0 END)`,
      }).from(crmLeads).where(leadWhere);

      const byAdvisor = await db.select({
        advisor: crmLeads.designAdvisor,
        count: sql<number>`COUNT(*)`,
      }).from(crmLeads)
        .where(leadWhere ? and(leadWhere, sql`designAdvisor IS NOT NULL AND designAdvisor != ''`) : sql`designAdvisor IS NOT NULL AND designAdvisor != ''`)
        .groupBy(crmLeads.designAdvisor)
        .orderBy(sql`COUNT(*) DESC`);

      return {
        total: Number(stats.total),
        assigned: Number(stats.assigned),
        unassigned: Number(stats.unassigned),
        byAdvisor: byAdvisor.map(r => ({ name: r.advisor || "Unknown", count: Number(r.count) })),
      };
    }),
  }),

  // ─── Lead Notes ─────────────────────────────────────────────────────────
  notes: router({
    list: protectedProcedure.input(z.object({ leadId: z.number(), section: z.string().optional() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getLeadNotes(input.leadId, input.section);
    }),
    create: protectedProcedure.input(z.object({
      leadId: z.number(),
      section: z.string().optional(),
      content: z.string().min(1),
      category: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      const id = await crmDb.createLeadNote({
        leadId: input.leadId,
        section: input.section || "general",
        userId: ctx.user.id,
        userName: ctx.user.name || "Unknown",
        content: input.content,
        category: input.category || "general",
      });
      return { id };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const note = await crmDb.getLeadNote(input.id);
      if (!note) throw new Error("Note not found");
      await assertLeadAccess(ctx, note.leadId);
      await crmDb.deleteLeadNote(input.id);
      return { success: true };
    }),
    togglePin: protectedProcedure.input(z.object({ id: z.number(), pinned: z.boolean() })).mutation(async ({ ctx, input }) => {
      const note = await crmDb.getLeadNote(input.id);
      if (!note) throw new Error("Note not found");
      await assertLeadAccess(ctx, note.leadId);
      await crmDb.toggleLeadNotePin(input.id, input.pinned);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), content: z.string().min(1), category: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const note = await crmDb.getLeadNote(input.id);
      if (!note) throw new Error("Note not found");
      await assertLeadAccess(ctx, note.leadId);
      await crmDb.updateLeadNote(input.id, input.content, input.category);
      return { success: true };
    }),
  }),

  // ─── Quote Notes ─────────────────────────────────────────────────────────
  quoteNotes: router({
    list: protectedProcedure.input(z.object({ quoteId: z.number(), quoteType: z.string() })).query(async ({ ctx, input }) => {
      await assertQuoteAccess(ctx, input.quoteId, input.quoteType);
      return crmDb.getQuoteNotes(input.quoteId, input.quoteType);
    }),
    create: protectedProcedure.input(z.object({
      quoteId: z.number(),
      quoteType: z.string(),
      content: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      await assertQuoteAccess(ctx, input.quoteId, input.quoteType);
      const id = await crmDb.createQuoteNote({
        quoteId: input.quoteId,
        quoteType: input.quoteType,
        userId: ctx.user.id,
        userName: ctx.user.name || "Unknown",
        content: input.content,
      });
      return { id };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const note = await crmDb.getQuoteNote(input.id);
      if (!note) throw new Error("Note not found");
      await assertQuoteAccess(ctx, note.quoteId, note.quoteType);
      await crmDb.deleteQuoteNote(input.id);
      return { success: true };
    }),
    togglePin: protectedProcedure.input(z.object({ id: z.number(), pinned: z.boolean() })).mutation(async ({ ctx, input }) => {
      const note = await crmDb.getQuoteNote(input.id);
      if (!note) throw new Error("Note not found");
      await assertQuoteAccess(ctx, note.quoteId, note.quoteType);
      await crmDb.toggleQuoteNotePin(input.id, input.pinned);
      return { success: true };
    }),
  }),

  // ─── Appointments ───────────────────────────────────────────────────────
  appointments: router({
    list: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getAppointments(input.leadId, tenantIdFromContext(ctx));
    }),

    create: protectedProcedure.input(z.object({
      leadId: z.number(),
      appointmentType: z.string().optional(),
      appointmentDate: z.string().optional(),
      appointmentTime: z.string().optional(),
      duration: z.number().optional().default(60),
      location: z.string().optional(),
      notes: z.string().optional(),
      outcome: z.string().optional(),
      assignedUserId: z.number().optional(),
      participants: z.array(appointmentParticipantSchema).optional(),
      syncToCalendar: z.boolean().optional().default(true),
    })).mutation(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      const tenantId = tenantIdFromContext(ctx);
      const participants = normalizeParticipants(input.participants);
      const shouldSync = !!(input.syncToCalendar && input.appointmentDate && input.appointmentTime);
      const result = await crmDb.createAppointment({
        tenantId,
        leadId: input.leadId,
        appointmentType: input.appointmentType,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        duration: input.duration,
        location: input.location,
        notes: input.notes,
        outcome: input.outcome,
        assignedUserId: input.assignedUserId || ctx.user.id,
        participants,
        calendarSyncStatus: shouldSync ? "pending" : "not_synced",
        calendarSyncError: null,
      });

      // Sync to Nylas calendar if user has a connected grant
      if (shouldSync) {
        try {
          const { syncAppointmentToCalendar } = await import("./nylas-sync");
          await syncAppointmentToCalendar({
            tenantId,
            appointmentId: result.id,
            userId: input.assignedUserId || ctx.user.id,
            leadId: input.leadId,
            date: input.appointmentDate!,
            time: input.appointmentTime!,
            duration: input.duration || 60,
            location: input.location,
            notes: input.notes,
            participants,
          });
        } catch (err: any) {
          console.error("[Nylas] Calendar sync failed:", err.message);
          await markAppointmentSyncFailed(result.id, err, tenantId);
        }
      }

      return result;
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      appointmentType: z.string().optional(),
      appointmentDate: z.string().optional(),
      appointmentTime: z.string().optional(),
      duration: z.number().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      outcome: z.string().optional(),
      participants: z.array(appointmentParticipantSchema).optional(),
      syncToCalendar: z.boolean().optional().default(true),
    })).mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const existing = await assertAppointmentAccess(ctx, input.id);
      const { id, syncToCalendar, participants: rawParticipants, ...data } = input;
      const participants = rawParticipants ? normalizeParticipants(rawParticipants) : undefined;
      const nextAppointment = {
        ...existing,
        ...data,
        participants: participants ?? (existing.participants as any),
      };
      const shouldSync = !!(syncToCalendar && nextAppointment.appointmentDate && nextAppointment.appointmentTime);

      await crmDb.updateAppointment(id, {
        ...data,
        ...(participants !== undefined ? { participants } : {}),
        ...(shouldSync ? { calendarSyncStatus: "pending", calendarSyncError: null } : {}),
      } as any, tenantId);

      if (shouldSync) {
        try {
          const { updateCalendarEvent, syncAppointmentToCalendar } = await import("./nylas-sync");
          const ownerUserId = nextAppointment.assignedUserId || ctx.user.id;
          const updatedExistingEvent = existing.nylasEventId
            ? await updateCalendarEvent(id, ownerUserId, {
                date: nextAppointment.appointmentDate || undefined,
                time: nextAppointment.appointmentTime || undefined,
                duration: nextAppointment.duration || 60,
                location: nextAppointment.location || undefined,
                notes: nextAppointment.notes || undefined,
                participants: (nextAppointment.participants as any) || [],
              }, tenantId)
            : false;

          if (!updatedExistingEvent) {
            await syncAppointmentToCalendar({
              tenantId,
              appointmentId: id,
              userId: ownerUserId,
              leadId: nextAppointment.leadId,
              date: nextAppointment.appointmentDate!,
              time: nextAppointment.appointmentTime!,
              duration: nextAppointment.duration || 60,
              location: nextAppointment.location || undefined,
              notes: nextAppointment.notes || undefined,
              participants: (nextAppointment.participants as any) || [],
            });
          }
        } catch (err: any) {
          console.error("[Nylas] Calendar update failed:", err.message);
          await markAppointmentSyncFailed(id, err, tenantId);
        }
      }

      return { success: true };
    }),

    retryCalendarSync: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const appointment = await assertAppointmentAccess(ctx, input.id);
      if (!appointment.appointmentDate || !appointment.appointmentTime) {
        throw new Error("Appointment date and time are required before calendar sync can run");
      }

      await crmDb.updateAppointmentSyncStatus(input.id, {
        status: "pending",
        error: null,
        syncedAt: null,
      }, tenantId);

      try {
        const { updateCalendarEvent, syncAppointmentToCalendar } = await import("./nylas-sync");
        const ownerUserId = appointment.assignedUserId || ctx.user.id;
        const participants = (appointment.participants as any) || [];
        const updatedExistingEvent = appointment.nylasEventId
          ? await updateCalendarEvent(input.id, ownerUserId, {
              date: appointment.appointmentDate,
              time: appointment.appointmentTime,
              duration: appointment.duration || 60,
              location: appointment.location || undefined,
              notes: appointment.notes || undefined,
              participants,
            }, tenantId)
          : false;

        if (!updatedExistingEvent) {
          await syncAppointmentToCalendar({
            tenantId,
            appointmentId: input.id,
            userId: ownerUserId,
            leadId: appointment.leadId,
            date: appointment.appointmentDate,
            time: appointment.appointmentTime,
            duration: appointment.duration || 60,
            location: appointment.location || undefined,
            notes: appointment.notes || undefined,
            participants,
          });
        }

        return { success: true };
      } catch (err) {
        await markAppointmentSyncFailed(input.id, err, tenantId);
        throw err;
      }
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await assertAppointmentAccess(ctx, input.id);
      await crmDb.deleteAppointment(input.id, tenantIdFromContext(ctx));
      return { success: true };
    }),
  }),

  // ─── Contracts ──────────────────────────────────────────────────────────
  contracts: router({
    get: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getContract(input.leadId);
    }),

    upsert: protectedProcedure.input(z.object({
      leadId: z.number(),
      contractDate: z.string().optional(),
      contractValue: z.string().optional(),
      depositAmount: z.string().optional(),
      depositDate: z.string().optional(),
      paymentSchedule: z.string().optional(),
      welcomeLetterSent: z.boolean().optional(),
      welcomeLetterDate: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { leadId, ...data } = input;
      await assertLeadAccess(ctx, leadId);
      return crmDb.upsertContract(leadId, data as any);
    }),
  }),

  // ─── Approvals ─────────────────────────────────────────────────
  buildingAuthority: router({
    get: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getBuildingAuthority(input.leadId);
    }),

    batchStatuses: protectedProcedure.input(z.object({ leadIds: z.array(z.number()) })).query(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const visibleIds = await crmDb.getVisibleLeadIds(input.leadIds, tenantId);
      return crmDb.getBaStatusesForLeads(visibleIds);
    }),

    upsert: protectedProcedure.input(z.object({
      leadId: z.number(),
      councilName: z.string().optional(),
      applicationDate: z.string().optional(),
      approvalDate: z.string().optional(),
      approvalNumber: z.string().optional(),
      status: z.string().optional(),
      councilLetterType: z.string().optional(),
      councilLetterSentDate: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { leadId, ...data } = input;
      await assertLeadAccess(ctx, leadId);
      // Audit: detect date fields that were cleared
      const existing = await crmDb.getBuildingAuthority(leadId);
      const dateFields = ["applicationDate", "approvalDate", "councilLetterSentDate"] as const;
      const clearedDates: string[] = [];
      const setDates: string[] = [];
      for (const field of dateFields) {
        const oldVal = existing ? (existing as any)[field] : null;
        const newVal = (data as any)[field];
        if (oldVal && newVal === "") {
          const label = field === "applicationDate" ? "Application Date" : field === "approvalDate" ? "Approval Date" : "Letter Sent Date";
          clearedDates.push(`${label} (was: ${oldVal})`);
        } else if (!oldVal && newVal) {
          const label = field === "applicationDate" ? "Application Date" : field === "approvalDate" ? "Approval Date" : "Letter Sent Date";
          setDates.push(`${label}: ${newVal}`);
        }
      }
      // Log status change to Exempt
      if (data.status === "exempt" && existing?.status !== "exempt") {
        await crmDb.createLeadNote({
          leadId,
          section: "building_authority",
          userId: ctx.user.id,
          userName: ctx.user.name || "System",
          content: `Approval status set to Exempt${clearedDates.length ? " — cleared: " + clearedDates.join(", ") : ""}`,
          category: "audit",
        });
      } else if (clearedDates.length > 0) {
        await crmDb.createLeadNote({
          leadId,
          section: "building_authority",
          userId: ctx.user.id,
          userName: ctx.user.name || "System",
          content: `Date(s) cleared: ${clearedDates.join(", ")}`,
          category: "audit",
        });
      }
      return crmDb.upsertBuildingAuthority(leadId, data as any);
    }),

    statusCounts: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const overdueDays = (await getTenantAppSetting<number>(tenantIdFromContext(ctx), "baOverdueThresholdDays")) ?? 30;
      const rows = await db!
        .select({
          status: crmBuildingAuthority.status,
          applicationDate: crmBuildingAuthority.applicationDate,
        })
        .from(crmBuildingAuthority)
        .innerJoin(crmLeads, eq(crmBuildingAuthority.leadId, crmLeads.id))
        .where(and(...(() => {
          const conditions: any[] = [];
          appendTenantScope(conditions, crmLeads.tenantId, tenantIdFromContext(ctx));
          return conditions.length ? conditions : [sql`1=1`];
        })()));
      const counts = { approved: 0, pending: 0, lodged: 0, rejected: 0, exempt: 0, overdue: 0 };
      const cutoff = Date.now() - overdueDays * 24 * 60 * 60 * 1000;
      for (const r of rows) {
        const s = (r.status || "").toLowerCase();
        if (s in counts) (counts as any)[s]++;
        if ((s === "pending" || s === "lodged") && r.applicationDate) {
          const appDate = new Date(r.applicationDate).getTime();
          if (appDate < cutoff) counts.overdue++;
        }
      }
      return { ...counts, overdueDays };
    }),

    calendarEvents: protectedProcedure.input(z.object({
      month: z.number().min(1).max(12),
      year: z.number(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      const overdueDays = (await getTenantAppSetting<number>(tenantIdFromContext(ctx), "baOverdueThresholdDays")) ?? 30;

      // Get all Approval records with their lead info
      const baRecords = await db!
        .select({
          id: crmBuildingAuthority.id,
          leadId: crmBuildingAuthority.leadId,
          councilName: crmBuildingAuthority.councilName,
          applicationDate: crmBuildingAuthority.applicationDate,
          approvalDate: crmBuildingAuthority.approvalDate,
          status: crmBuildingAuthority.status,
          councilLetterSentDate: crmBuildingAuthority.councilLetterSentDate,
          firstName: crmLeads.contactFirstName,
          lastName: crmLeads.contactLastName,
        })
        .from(crmBuildingAuthority)
        .innerJoin(crmLeads, eq(crmBuildingAuthority.leadId, crmLeads.id))
        .where(and(...(() => {
          const conditions: any[] = [];
          appendTenantScope(conditions, crmLeads.tenantId, tenantIdFromContext(ctx));
          return conditions.length ? conditions : [sql`1=1`];
        })()));

      type CalendarEvent = {
        id: number;
        leadId: number;
        date: string;
        type: "application" | "approval" | "followup" | "letter_sent";
        label: string;
        clientName: string;
        councilName: string | null;
        status: string | null;
        isOverdue: boolean;
      };

      const events: CalendarEvent[] = [];
      const monthStr = `${input.year}-${String(input.month).padStart(2, "0")}`;

      for (const r of baRecords) {
        const clientName = [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown";

        // Application date event
        if (r.applicationDate && r.applicationDate.startsWith(monthStr)) {
          events.push({
            id: r.id,
            leadId: r.leadId,
            date: r.applicationDate,
            type: "application",
            label: `Approval Application - ${clientName}`,
            clientName,
            councilName: r.councilName,
            status: r.status,
            isOverdue: false,
          });
        }

        // Approval date event
        if (r.approvalDate && r.approvalDate.startsWith(monthStr)) {
          events.push({
            id: r.id,
            leadId: r.leadId,
            date: r.approvalDate,
            type: "approval",
            label: `Approval Granted - ${clientName}`,
            clientName,
            councilName: r.councilName,
            status: r.status,
            isOverdue: false,
          });
        }

        // Letter sent date event
        if (r.councilLetterSentDate && r.councilLetterSentDate.startsWith(monthStr)) {
          events.push({
            id: r.id,
            leadId: r.leadId,
            date: r.councilLetterSentDate,
            type: "letter_sent",
            label: `Letter Sent - ${clientName}`,
            clientName,
            councilName: r.councilName,
            status: r.status,
            isOverdue: false,
          });
        }

        // Follow-up deadline (application date + overdueDays)
        if (r.applicationDate && (r.status === "pending" || r.status === "lodged")) {
          const appDate = new Date(r.applicationDate);
          const followupDate = new Date(appDate.getTime() + overdueDays * 24 * 60 * 60 * 1000);
          const followupStr = followupDate.toISOString().split("T")[0];
          if (followupStr.startsWith(monthStr)) {
            const isOverdue = Date.now() > followupDate.getTime();
            events.push({
              id: r.id,
              leadId: r.leadId,
              date: followupStr,
              type: "followup",
              label: `Follow-up Due - ${clientName}`,
              clientName,
              councilName: r.councilName,
              status: r.status,
              isOverdue,
            });
          }
        }
      }

      return { events, overdueDays };
    }),

    bulkUpdateStatus: protectedProcedure.input(z.object({
      leadIds: z.array(z.number()),
      status: z.string(),
    })).mutation(async ({ input, ctx }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Only administrators can bulk-update Approval status");
      let updated = 0;
      const visibleIds = await crmDb.getVisibleLeadIds(input.leadIds, tenantIdFromContext(ctx));
      for (const leadId of visibleIds) {
        await crmDb.upsertBuildingAuthority(leadId, { status: input.status });
        updated++;
      }
      return { updated };
    }),
  }),

  // ─── Constructions ─────────────────────────────────────────────────────
  constructions: router({
    get: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getConstruction(input.leadId);
    }),

    upsert: protectedProcedure.input(z.object({
      leadId: z.number(),
      estimatedBuildDays: z.number().optional(),
      buildingSupervisor: z.string().optional(),
      roofSheetProduct: z.string().optional(),
      roofSheetColour: z.string().optional(),
      linealMetres: z.string().optional(),
      startDate: z.string().optional(),
      completionDate: z.string().optional(),
      tradesRequired: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { leadId, ...data } = input;
      await assertLeadAccess(ctx, leadId);
      return crmDb.upsertConstruction(leadId, data as any);
    }),
  }),

  // ─── Verifications ─────────────────────────────────────────────────────
  verifications: router({
    get: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getVerification(input.leadId);
    }),

    upsert: protectedProcedure.input(z.object({
      leadId: z.number(),
      designCorrect: z.boolean().optional(),
      designCheckDate: z.string().optional(),
      costingCorrect: z.boolean().optional(),
      costingCheckDate: z.string().optional(),
      franchiseAuthority: z.boolean().optional(),
      authorityDate: z.string().optional(),
      maintenanceLetterSentDate: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { leadId, ...data } = input;
      await assertLeadAccess(ctx, leadId);
      return crmDb.upsertVerification(leadId, data as any);
    }),
  }),

  // ─── Customer Reviews ──────────────────────────────────────────────────
  customerReviews: router({
    get: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getCustomerReview(input.leadId);
    }),

    upsert: protectedProcedure.input(z.object({
      leadId: z.number(),
      projectCompletedDate: z.string().optional(),
      warrantyReceivedDate: z.string().optional(),
      homeAdditionType: z.string().optional(),
      additionDescription: z.string().optional(),
      serviceRating: z.number().optional(),
      workmanshipRating: z.number().optional(),
      satisfactionRating: z.number().optional(),
      designConsultantRating: z.number().optional(),
      customerComments: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { leadId, ...data } = input;
      await assertLeadAccess(ctx, leadId);
      return crmDb.upsertCustomerReview(leadId, data as any);
    }),
  }),



  // ─── Activities ────────────────────────────────────────────────────────
  activities: router({
    list: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getActivities(input.leadId);
    }),

    create: protectedProcedure.input(z.object({
      leadId: z.number(),
      activityType: z.string(),
      description: z.string().optional(),
      emailType: z.string().optional(),
      sentDate: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.createActivity(input);
    }),
  }),

  // ─── Email Correspondence ──────────────────────────────────────────────
  sendLetter: protectedProcedure.input(z.object({
    leadId: z.number(),
    letterType: z.enum(["unassigned_intro", "assigned_intro", "welcome_letter", "council_intro", "council_out_of", "council_no_council"]),
    to: z.string().email(),
    clientName: z.string(),
    subject: z.string().optional(),
    body: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertLeadAccess(ctx, input.leadId);
    // Get lead details for placeholder variables
    const lead = await crmDb.getLead(input.leadId, tenantIdFromContext(ctx));
    const placeholderContext: { designAdvisor?: string; siteAddress?: string; productType?: string } = {};
    if (lead) {
      placeholderContext.designAdvisor = lead.designAdvisor || "";
      placeholderContext.siteAddress = lead.contactAddress || "";
      placeholderContext.productType = lead.productType || "";
    }
    // Check for custom template in DB first
    const customTemplate = await emailTemplatesDb.getTemplate(input.letterType, tenantIdFromContext(ctx));
    const overrides: { subject?: string; body?: string; attachmentUrl?: string | null; attachmentName?: string | null } = {};
    if (customTemplate) {
      overrides.subject = input.subject || customTemplate.subject;
      overrides.body = input.body || customTemplate.body;
      overrides.attachmentUrl = customTemplate.attachmentUrl;
      overrides.attachmentName = customTemplate.attachmentName;
    }
    const { sendCrmLetter } = await import("./crm-email");
    const result = await sendCrmLetter({ ...input, ...overrides, ...placeholderContext, tenantId: tenantIdFromContext(ctx) });
    if (result.success) {
      await crmDb.createActivity({
        leadId: input.leadId,
        activityType: "email_sent",
        description: `Sent ${input.letterType.replace(/_/g, " ")} to ${input.to}`,
        emailType: input.letterType,
        sentDate: new Date().toISOString().split("T")[0],
      });
    }
    return result;
  }),

  // ─── Email Templates (Admin) ──────────────────────────────────────────
  emailTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return emailTemplatesDb.listTemplates(tenantIdFromContext(ctx));
    }),

    get: protectedProcedure.input(z.object({ letterType: z.string() })).query(async ({ ctx, input }) => {
      return emailTemplatesDb.getTemplate(input.letterType, tenantIdFromContext(ctx));
    }),

    upsert: protectedProcedure.input(z.object({
      letterType: z.string(),
      subject: z.string().min(1),
      body: z.string().min(1),
      category: z.string().optional(),
      attachmentUrl: z.string().nullable().optional(),
      attachmentName: z.string().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      return emailTemplatesDb.upsertTemplate(input, tenantIdFromContext(ctx));
    }),

    listByCategory: protectedProcedure.input(z.object({ category: z.string() })).query(async ({ ctx, input }) => {
      return emailTemplatesDb.listByCategory(input.category, tenantIdFromContext(ctx));
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      await emailTemplatesDb.deleteById(input.id, tenantIdFromContext(ctx));
      return { success: true };
    }),

    reset: protectedProcedure.input(z.object({
      letterType: z.string(),
    })).mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      await emailTemplatesDb.resetTemplate(input.letterType, tenantIdFromContext(ctx));
      return { success: true };
    }),

    uploadAttachment: protectedProcedure.input(z.object({
      letterType: z.string(),
      fileName: z.string(),
      fileBase64: z.string(),
    })).mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      const { storagePut } = await import("./storage");
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const key = `tenants/${ctx.tenant!.id}/crm-email-attachments/${input.letterType}-${suffix}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, "application/pdf");
      return { url, fileName: input.fileName };
    }),
    uploadImage: protectedProcedure.input(z.object({
      fileName: z.string(),
      fileBase64: z.string(),
      mimeType: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!isAdminRole(ctx.user.role)) throw new Error("Admin only");
      const { storagePut } = await import("./storage");
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = Math.random().toString(36).slice(2, 8);
      const ext = input.fileName.split(".").pop() || "png";
      const key = `tenants/${ctx.tenant!.id}/crm-email-images/${suffix}-${input.fileName}`;
      const mime = input.mimeType || `image/${ext}`;
      const { url } = await storagePut(key, buffer, mime);
      return { url, fileName: input.fileName };
    }),
  }),

  // ─── Email Correspondence Log ───────────────────────────────────────────
  emailLog: protectedProcedure.input(z.object({
    search: z.string().optional(),
    letterType: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    return crmDb.getEmailLog({ ...(input || {}), tenantId: tenantIdFromContext(ctx) });
  }),

  // ─── Documents ─────────────────────────────────────────────────────────
  documents: router({
    list: protectedProcedure.input(z.object({ leadId: z.number() })).query(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      return crmDb.getDocuments(input.leadId);
    }),

    upload: protectedProcedure.input(z.object({
      leadId: z.number(),
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string(),
    })).mutation(async ({ ctx, input }) => {
      await assertLeadAccess(ctx, input.leadId);
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `tenants/${ctx.tenant!.id}/crm-docs/${input.leadId}/${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.contentType);
      return crmDb.createDocument({ leadId: input.leadId, fileName: input.fileName, fileUrl: url, fileKey });
    }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const document = await crmDb.getDocument(input.id);
      if (!document) throw new Error("Document not found");
      await assertLeadAccess(ctx, document.leadId);
      await crmDb.deleteDocument(input.id);
      return { success: true };
    }),
  }),

  // ─── Reports ───────────────────────────────────────────────────────────
  reports: router({
    salesStaffLeadSummary: protectedProcedure.input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      designAdvisor: z.string().optional(),
      status: z.string().optional(),
      franchiseNumber: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const filters = input || {};
      if (!isAdminRole(ctx.user.role) && !ctx.user.canViewAllLeads && ctx.user.role === 'design_adviser' && ctx.user.name) {
        filters.designAdvisor = ctx.user.name;
      }
      return crmDb.getSalesStaffLeadSummary({ ...filters, tenantId: tenantIdFromContext(ctx) });
    }),

    productSales: protectedProcedure.input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      productType: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return crmDb.getProductSalesReport({ ...(input || {}), tenantId: tenantIdFromContext(ctx) });
    }),

    outcomeSummary: protectedProcedure.input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      outcome: z.string().optional(),
      franchiseNumber: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return crmDb.getOutcomeSummaryReport({ ...(input || {}), tenantId: tenantIdFromContext(ctx) });
    }),

    leadSources: protectedProcedure.input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      leadSource: z.string().optional(),
      outcome: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return crmDb.getLeadSourceReport({ ...(input || {}), tenantId: tenantIdFromContext(ctx) });
    }),

    customerSatisfaction: protectedProcedure.input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      franchiseNumber: z.string().optional(),
      designAdvisor: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      return crmDb.getCustomerSatisfactionReport({ ...(input || {}), tenantId: tenantIdFromContext(ctx) });
    }),
  }),
});
