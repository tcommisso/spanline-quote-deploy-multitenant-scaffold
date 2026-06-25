import { COOKIE_NAME, isAdminRole } from "@shared/const";
import { normalizeApiAddress } from "@shared/address-normalization";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, superAdminProcedure, tenantProcedure, tenantAdminProcedure, router, canAdministerTenant } from "./_core/trpc";
import { z } from "zod";
import { randomBytes } from "crypto";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";
import { guardedSend } from "./notification-gateway";
import { invokeLLM } from "./_core/llm";
import { sendProposalEmail } from "./email";
import { RB100_SYSTEM_CONTEXT } from "./rb100-data";
import { SPANLINE_TECHNICAL_PROMPT } from "../shared/spanline-technical-knowledge";
import { deckRouter } from "./deck-router";
import { eclipseRouter } from "./eclipse-router";
import { specItemsRouter } from "./spec-items-router";
import { crmRouter } from "./crm-router";
import { designAdvisorsRouter } from "./design-advisors-router";
import { vocphoneRouter } from "./vocphone-router";
import { userManagementRouter } from "./user-management-router";
import { globalSettingsRouter } from "./global-settings-router";
import { sectionTemplatesRouter } from "./section-templates-router";
import { branchesRouter } from "./branches-router";
import { signwellRouter } from "./signwell-router";
import { emailImagesRouter } from "./email-images-router";
import { constructionRouter } from "./construction-router";
import { constructionScheduleRouter } from "./construction-schedule-router";
import { constructionKanbanRouter } from "./construction-kanban-router";
import { constructionClientsRouter } from "./construction-clients-router";
import { constructionFinancialRouter } from "./construction-financial-router";
import { constructionDocsRouter } from "./construction-docs-router";
import { siteInductionRouter } from "./site-induction-router";
import { whsRouter } from "./whs-router";
import { xeroRouter } from "./xero-router";
import { xeroProjectsRouter } from "./xero-projects-router";
import { xeroAccountingRouter } from "./xero-accounting-router";
import { portalRouter } from "./portal-router";
import { adminPortalRouter } from "./admin-portal-router";
import { projectPlanTemplatesRouter } from "./project-plan-templates-router";
import { subscriptionManagementRouter } from "./subscription-management-router";
import { xeroClientImportRouter } from "./xero-client-import-router";
import { clientActivitiesRouter } from "./client-activities-router";
import { xeroGLRouter } from "./xero-gl-router";
import { inboxRouter } from "./inbox-router";
import { equipmentRouter } from "./equipment-router";
import { peopleRouter } from "./people-router";
import { tradePortalRouter } from "./trade-portal-router";
import { adminTradePortalRouter } from "./admin-trade-portal-router";
import { tradeInvoiceRouter } from "./trade-invoice-router";
import { xeroCostImportRouter } from "./xero-cost-import-router";
import { xeroBudgetImportRouter } from "./xero-budget-import-router";
import { patioRouter } from "./patio-planner-router";
import { patioRenderRouter } from "./patio-render-router";
import { quoteRenderRouter } from "./quote-render-router";
import { renderCostRouter } from "./render-cost-router";
import { subcontractRouter } from "./subcontract-router";
import { supplierRouter } from "./supplier-router";
import { supplierCategoryRouter } from "./supplier-category-router";
import { supplierFeedbackRouter } from "./supplier-feedback-router";
import { smartshopRouter } from "./smartshop-router";
import { gsheetImportRouter } from "./gsheet-import-router";
import { xeroSupplierSyncRouter } from "./xero-supplier-sync-router";
import { plansRouter } from "./plans-router";
import { planConverterRouter } from "./plan-converter-router";
import { weatherRouter } from "./weather-router";
import { proposalRouter } from "./proposal-router";
import { proposalLibraryRouter } from "./proposal-library-router";
import { reviewsRouter } from "./reviews-router";
import { territoryRouter } from "./territory-router";
import { nylasRouter } from "./nylas-router";
import { daPortalRouter } from "./da-portal-router";
import { profileRouter } from "./profile-router";
import { crmDropdownRouter } from "./crm-dropdown-router";
import { calendarViewsRouter } from "./calendar-views-router";
import { manufacturingRouter } from "./manufacturing-router";
import { manufacturingDataRouter } from "./manufacturing-data-router";
import { manufacturingDispatchRouter } from "./manufacturing-dispatch-router";
import { inventoryRouter } from "./inventory-router";
import { stocktakeRouter } from "./stocktake-router";
import { procurementRouter } from "./procurement-router";
import { driverRouter } from "./driver-router";
import { geotrackingRouter } from "./geotracking-router";
import { textBlocksRouter } from "./text-blocks-router";
import { notificationLogRouter } from "./notification-log-router";
import { appCentralRouter } from "./app-central-router";
import { checklistItemsRouter } from "./checklist-items-router";
import { chatRouter } from "./chat-router";
import { supportRouter } from "./support-router";
import { invitationsRouter } from "./invitations-router";
import { rainDayRouter } from "./rain-day-router";
import { approvalRouter } from "./approval-router";
import { daTrackerRouter } from "./da-tracker-router";
import { competitorIntelRouter } from "./competitor-intel-router";
import { nswDaRouter } from "./nsw-da-router";
import { aiLearningRouter } from "./ai-learning-router";
import { tenantRouter } from "./tenant-router";
import { apiHealthRouter } from "./api-health-router";
import { saasBillingRouter } from "./saas-billing-router";
import { securityScreensRouter } from "./security-screens-router";
import { blindsRouter } from "./blinds-router";
import { tenantIdFromContext, tenantScoped } from "./_core/tenant-scope";
import { isStorageConfigured, storageGet, storageDownload, storagePut } from "./storage";
import { syncQuoteHbcfRequirement } from "./hbcf-service";

function sanitizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "Unknown provider error");
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .slice(0, 700);
}

function enginiProviderFailure(error: unknown): string {
  return [
    "Engini could not get a usable OpenAI response.",
    sanitizeProviderError(error),
    "Check Railway OPENAI_API_KEY and OPENAI_MODEL. Use an enabled text model such as gpt-4o-mini, or set OPENAI_MODEL_FALLBACKS to another enabled model.",
  ].filter(Boolean).join("\n\n");
}

/** Check if a user can access a specific quote based on permissions */
function canAccessQuote(user: { id: number; role: string; name: string | null; canViewAllQuotes?: boolean }, quote: { userId: number; designAdvisor: string | null }): boolean {
  if (isAdminRole(user.role)) return true;
  if (user.canViewAllQuotes) return true;
  if (quote.userId === user.id) return true;
  if (user.role === 'design_adviser' && user.name && quote.designAdvisor === user.name) return true;
  return false;
}

function canViewAllTenantStructureQuotes(ctx: { user?: { role?: string | null } | null; tenantMembership?: { role?: string | null } | null }) {
  return canAdministerTenant(ctx.user?.role, ctx.tenantMembership?.role);
}

function quoteAccessUserForContext(ctx: {
  user: { id: number; role: string; name: string | null; canViewAllQuotes?: boolean };
  tenantMembership?: { role?: string | null } | null;
}) {
  if (!canViewAllTenantStructureQuotes(ctx)) return ctx.user;
  return { ...ctx.user, canViewAllQuotes: true };
}

function canAccessTenantRecord(
  tenant: { id: number } | null,
  record: { tenantId?: number | null }
): boolean {
  if (!tenant) return false;
  return record.tenantId === tenant.id;
}

function quoteScopeOptionsForContext(_ctx: { user?: { role?: string | null } | null }) {
  return undefined;
}

function canAccessQuoteTenantRecord(
  ctx: { tenant?: { id: number } | null; user?: { role?: string | null } | null },
  record: { tenantId?: number | null },
) {
  return canAccessTenantRecord(ctx.tenant ?? null, record);
}

type BrandingAssetKind = "customLogoUrl" | "appIconUrl" | "faviconUrl";

const BRANDING_ASSET_META_KEYS: Record<BrandingAssetKind, string> = {
  customLogoUrl: "customLogoMeta",
  appIconUrl: "appIconMeta",
  faviconUrl: "faviconMeta",
};

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("x-icon") || mimeType.includes("vnd.microsoft.icon")) return "ico";
  return "jpg";
}

async function persistBrandingAsset(
  tenantId: number | null | undefined,
  kind: BrandingAssetKind,
  value: string | null | undefined,
) {
  if (value == null || !value.startsWith("data:")) return value ?? null;
  const parsed = parseDataUrl(value);
  if (!parsed || !isStorageConfigured()) return value;

  const tenantSegment = tenantId ? `tenant-${tenantId}` : "global";
  const suffix = randomBytes(4).toString("hex");
  const key = `company/branding/${tenantSegment}/${kind}-${Date.now()}-${suffix}.${extensionForMimeType(parsed.mimeType)}`;
  const buffer = Buffer.from(parsed.base64, "base64");
  const result = await storagePut(key, buffer, parsed.mimeType);
  return result.url;
}

export const appRouter = router({
  system: systemRouter,
  tenants: tenantRouter,
  apiHealth: apiHealthRouter,
  saasBilling: saasBillingRouter,
  geotracking: geotrackingRouter,
  textBlocks: textBlocksRouter,
  notificationLog: notificationLogRouter,
  appCentral: appCentralRouter,
  chat: chatRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    acceptTerms: protectedProcedure
      .input(z.object({ version: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.acceptTerms(ctx.user.id, input.version);
        return { success: true } as const;
      }),
  }),

  // ─── Quote CRUD ────────────────────────────────────────────────────────────
  quotes: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), status: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quoteScopeOptions = quoteScopeOptionsForContext(ctx);
        let quotes;
        if (isAdminRole(ctx.user.role) || ctx.user.canViewAllQuotes || canViewAllTenantStructureQuotes(ctx)) {
          quotes = await db.getAllQuotes(input?.search, input?.status, tenantId, quoteScopeOptions);
        } else if (ctx.user.role === 'design_adviser' && ctx.user.name) {
          // Design advisers see only quotes assigned to them
          quotes = await db.getQuotesByDesignAdviser(ctx.user.name, input?.search, input?.status, tenantId, ctx.user.id, quoteScopeOptions);
        } else {
          quotes = await db.getQuotesByUser(ctx.user.id, input?.search, input?.status, tenantId, quoteScopeOptions);
        }
        quotes = quotes.filter(q => canAccessQuoteTenantRecord(ctx, q));
        // Attach latest revision info to each quote
        if (quotes.length > 0) {
          try {
            const quoteIds = quotes.map(q => q.id);
            const latestRevisions = await db.getLatestRevisionsByQuoteIds(quoteIds);
            const revMap = new Map(latestRevisions.map(r => [r.quoteId, r]));
            return quotes.map(q => ({
              ...q,
              lastRevision: revMap.get(q.id) || null,
            }));
          } catch { return quotes.map(q => ({ ...q, lastRevision: null })); }
        }
        return quotes.map(q => ({ ...q, lastRevision: null }));
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.id, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) return null;
        if (!canAccessQuoteTenantRecord(ctx, quote)) return null;
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) return null;
        return quote;
      }),

    /** Get all data needed for the PDF preview & edit screen */
    getQuotePdfData: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.id, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const components = await db.getComponentsByQuote(input.id);
        const lineItems: Array<{ tabName: string; component: string; colour: string; uom: string; qty: number; sellRate: number; total: number }> = [];
        let componentSubtotal = 0;
        for (const comp of (components || [])) {
          if (!comp.included) continue;
          const items = (comp.lineItems as any[]) || [];
          for (const item of items) {
            if (!item.qty || !item.sellRate) continue;
            const total = (item.qty || 0) * (item.sellRate || 0);
            lineItems.push({ tabName: comp.tabName, component: item.component || "", colour: item.colour || "", uom: item.uom || "", qty: item.qty || 0, sellRate: item.sellRate || 0, total });
            componentSubtotal += total;
          }
        }
        const adjustments: Array<{ name: string; amount: number }> = [];
        const delivery = quote.includeDelivery ? parseFloat(quote.deliveryAmount || "0") : 0;
        const travel = quote.includeTravelAllowance ? parseFloat(quote.travelAllowance || "0") : 0;
        const smallJob = quote.includeSmallJobSurcharge ? parseFloat(quote.smallJobSurcharge || "0") : 0;
        const constMgmt = quote.includeConstructionMgmt ? parseFloat(quote.constructionMgmtAmount || "0") : 0;
        const complexity = parseFloat(quote.complexityLoading || "0") / 100;
        const discountPct = parseFloat(quote.discountPercent || "0") / 100;
        const council = parseFloat(quote.councilFees || "0");
        const warranty = parseFloat(quote.homeWarranty || "0");
        if (delivery > 0) adjustments.push({ name: "Delivery", amount: delivery });
        if (travel > 0) adjustments.push({ name: "Travel Allowance", amount: travel });
        if (smallJob > 0) adjustments.push({ name: "Small Job Surcharge", amount: smallJob });
        if (constMgmt > 0) adjustments.push({ name: "Construction Management", amount: constMgmt });
        const adjustedSell = componentSubtotal + delivery + travel + smallJob + constMgmt;
        if (complexity > 0) adjustments.push({ name: `Complexity Loading (${(complexity * 100).toFixed(0)}%)`, amount: adjustedSell * complexity });
        const afterComplexity = adjustedSell * (1 + complexity);
        if (discountPct > 0) adjustments.push({ name: `Discount (${(discountPct * 100).toFixed(0)}%)`, amount: -afterComplexity * discountPct });
        const afterDiscount = afterComplexity * (1 - discountPct);
        if (council > 0) adjustments.push({ name: "Council Fees", amount: council });
        if (warranty > 0) adjustments.push({ name: "Home Warranty", amount: warranty });
        const grandTotalExGst = afterDiscount + council + warranty;
        const gst = grandTotalExGst * 0.1;
        const grandTotalIncGst = grandTotalExGst + gst;
        return {
          quoteNumber: quote.quoteNumber, status: quote.status,
          clientName: quote.clientName || "", clientPhone: quote.clientPhone || "",
          clientEmail: quote.clientEmail || "", siteAddress: quote.siteAddress || "",
          suburb: quote.suburb || "", region: quote.region || "",
          descriptionOfWork: quote.descriptionOfWork || "", notes: quote.notes || "",
          lineItems, componentSubtotal, adjustments,
          grandTotalExGst, gst, grandTotalIncGst,
          progressPayments: quote.specProgressPayments || null,
        };
      }),

    create: tenantProcedure
      .input(z.object({
        clientId: z.number().optional(),
        clientName: z.string().min(1),
        clientPhone: z.string().optional(),
        clientEmail: z.string().optional(),
        siteAddress: z.string().optional(),
        suburb: z.string().optional(),
        localCouncil: z.string().optional(),
        region: z.string().optional(),
        descriptionOfWork: z.string().optional(),
        notes: z.string().optional(),
        designAdvisor: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quoteNumber = await db.getNextQuoteNumber();
        const designAdvisor = input.designAdvisor || (ctx.user.role === "design_adviser" ? ctx.user.name || undefined : undefined);
        const id = await db.createQuote({
          ...input,
          designAdvisor,
          tenantId: ctx.tenant.id,
          userId: ctx.user.id,
          quoteNumber,
          status: "draft",
        });
        // If the lead (clientId) is archived, unarchive it
        let leadUnarchived = false;
        if (input.clientId) {
          try {
            const { updateLead, getLead } = await import("./crm-db");
            const lead = await getLead(input.clientId, ctx.tenant.id);
            if (lead && lead.archived) {
              await updateLead(input.clientId, { archived: false } as any, ctx.tenant.id);
              leadUnarchived = true;
            }
          } catch (e) { /* non-blocking */ }
        }
        // Notify owner
        try {
          await guardedSend(
            { tenantId: ctx.tenant?.id ?? null, settingKey: "notify_quote_created", channel: "owner_notify", recipientType: "owner", title: "New Quote Created" },
            () => notifyOwner({ title: "New Quote Created", content: `${ctx.user.name || "A design adviser"} created quote ${quoteNumber} for ${input.clientName}.` })
          );
        } catch (e) { /* non-blocking */ }
        return { id, quoteNumber, leadUnarchived };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        clientId: z.number().nullable().optional(),
        clientName: z.string().optional(),
        clientPhone: z.string().optional(),
        clientEmail: z.string().optional(),
        siteAddress: z.string().optional(),
        suburb: z.string().optional(),
        localCouncil: z.string().optional(),
        region: z.string().optional(),
        status: z.enum(["draft", "sent", "accepted", "lost"]).optional(),
        descriptionOfWork: z.string().optional(),
        notes: z.string().optional(),
        includeDelivery: z.boolean().optional(),
        deliveryAmount: z.string().optional(),
        includeTravelAllowance: z.boolean().optional(),
        travelAllowance: z.string().optional(),
        travelDistanceKm: z.string().optional(),
        travelBandKey: z.string().optional(),
        travelOverridden: z.boolean().optional(),
        includeSmallJobSurcharge: z.boolean().optional(),
        smallJobSurcharge: z.string().optional(),
        includeConstructionMgmt: z.boolean().optional(),
        constructionMgmtAmount: z.string().optional(),
        constructionMgmtPercent: z.string().optional(),
        constructionMgmtOverride: z.boolean().optional(),
        complexityLoading: z.string().optional(),
        complexityOverride: z.boolean().optional(),
        discountPercent: z.string().optional(),
        councilFees: z.string().optional(),
        homeWarranty: z.string().optional(),
        validUntil: z.string().nullable().optional(),
        outcomeReason: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const { id, validUntil: validUntilStr, ...data } = input;
        const oldStatus = quote.status;
        const updateData: any = { ...data };
        if (validUntilStr !== undefined) {
          updateData.validUntil = validUntilStr ? new Date(validUntilStr) : null;
        }
        await db.updateQuote(id, updateData, tenantId, quoteScopeOptionsForContext(ctx));

        // Log revision for financial/status changes
        try {
          const financialFields = ["deliveryAmount", "travelAllowance", "travelDistanceKm", "smallJobSurcharge", "constructionMgmtAmount", "constructionMgmtPercent", "complexityLoading", "discountPercent", "councilFees", "homeWarranty"];
          const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
          for (const field of financialFields) {
            if ((input as any)[field] !== undefined && (input as any)[field] !== (quote as any)[field]) {
              changes.push({ field, oldValue: (quote as any)[field], newValue: (input as any)[field] });
            }
          }
          if (input.status && input.status !== oldStatus) {
            changes.push({ field: "status", oldValue: oldStatus, newValue: input.status });
            await db.createQuoteRevision({ quoteId: id, userId: ctx.user.id, userName: ctx.user.name || "Unknown", action: "status_change", changes });
          } else if (changes.length > 0) {
            await db.createQuoteRevision({ quoteId: id, userId: ctx.user.id, userName: ctx.user.name || "Unknown", action: "financial_update", changes });
          }
        } catch (e) { /* non-blocking */ }

        // Notify on status change
        if (input.status && input.status !== oldStatus && (input.status === "accepted" || input.status === "lost")) {
          try {
            const key = input.status === "accepted" ? "notify_quote_accepted" : "notify_quote_lost";
            await guardedSend(
              { tenantId: ctx.tenant?.id ?? null, settingKey: key, channel: "owner_notify", recipientType: "owner", title: `Quote ${quote.quoteNumber} ${input.status}` },
              () => notifyOwner({ title: `Quote ${quote.quoteNumber} ${input.status === "accepted" ? "Accepted" : "Lost"}`, content: `Quote ${quote.quoteNumber} for ${quote.clientName} has been marked as ${input.status}.` })
            );
          } catch (e) { /* non-blocking */ }
        }
        // Check value threshold notification
        try {
          const components = await db.getComponentsByQuote(input.id);
          let totalSell = 0;
          for (const comp of components) {
            const items = (comp.lineItems as any[]) || [];
            for (const item of items) {
              totalSell += (item.qty || 0) * (item.sellRate || 0);
            }
          }
          // Add adjustments
          const updatedQuote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
          if (updatedQuote) {
            totalSell += parseFloat(updatedQuote.deliveryAmount || "0");
            totalSell += parseFloat(updatedQuote.travelAllowance || "0");
            totalSell += parseFloat(updatedQuote.smallJobSurcharge || "0");
            totalSell += parseFloat(updatedQuote.constructionMgmtAmount || "0");
            totalSell += parseFloat(updatedQuote.councilFees || "0");
            totalSell += parseFloat(updatedQuote.homeWarranty || "0");
          }
          const threshold = await db.getMasterDataValue("threshold", "quote_value_alert", ctx.tenant?.id ?? null);
          if (threshold && totalSell > parseFloat(threshold)) {
            await guardedSend(
              { tenantId: ctx.tenant?.id ?? null, settingKey: "notify_quote_value_exceeded", channel: "owner_notify", recipientType: "owner", title: "High-Value Quote Alert" },
              () => notifyOwner({ title: `High-Value Quote Alert`, content: `Quote ${quote.quoteNumber} for ${quote.clientName} has reached $${totalSell.toFixed(2)} (threshold: $${threshold}).` })
            );
          }
          await syncQuoteHbcfRequirement(input.id, tenantId);
        } catch (e) { /* non-blocking */ }
        return { success: true };
      }),

    updateSpec: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");

        // Log spec sheet changes to revision history
        try {
          const trackedSpecFields = ["specRoofType", "specRoofShape", "specWidth", "specLength", "specFloorHeight", "specRoofTopColour", "specRoofBottomColour", "specPostsColour", "specBeamColour", "specChannelColour", "specGutterColour", "specFasciaColour", "specSiteAccess", "specSiteRestricted", "specSiteMixed", "specFallDirection", "specHouseWalls"];
          const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
          for (const field of trackedSpecFields) {
            if (input.data[field] !== undefined && input.data[field] !== (quote as any)[field]) {
              changes.push({ field, oldValue: (quote as any)[field], newValue: input.data[field] });
            }
          }
          if (changes.length > 0) {
            await db.createQuoteRevision({ quoteId: input.id, userId: ctx.user.id, userName: ctx.user.name || "Unknown", action: "spec_update", changes });
          }
        } catch (e) { /* non-blocking */ }

        await db.updateQuote(input.id, input.data as any, tenantId, quoteScopeOptionsForContext(ctx));

        // Auto-calculate complexity loading if not manually overridden
        const updatedQuote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (updatedQuote && !(updatedQuote as any).complexityOverride) {
          const complexityRates = await db.getMasterDataByCategory("complexity", ctx.tenant?.id ?? null);
          const getRate = (key: string) => {
            const entry = complexityRates.find((r: any) => r.key.toLowerCase() === key.toLowerCase());
            return entry ? parseFloat(entry.value) || 0 : 0;
          };
          let total = 0;
          // Rule 1: Gable roof shape
          const roofShape = (updatedQuote.specRoofShape || "").toLowerCase();
          if (roofShape.includes("gable")) total += getRate("gable");
          // Rule 2: Pop-up roof type
          const roofType = (updatedQuote.specRoofType || "").toLowerCase();
          const hasPopup = roofType.includes("pop") || !!(updatedQuote as any).specPopupBrackets;
          if (hasPopup) total += getRate("pop-up");
          // Rule 3: Difficult access
          if ((updatedQuote as any).specSiteAccess === "1") total += getRate("access");
          // Rule 4: Restricted work times
          if ((updatedQuote as any).specSiteRestricted === "1") total += getRate("restricted");
          // Rule 5: Mixed materials/angles design
          if ((updatedQuote as any).specSiteMixed === "1") total += getRate("mixed");
          await db.updateQuote(input.id, { complexityLoading: String(total) } as any, tenantId, quoteScopeOptionsForContext(ctx));
        }

        // Auto-calculate construction management % if not manually overridden
        const quoteForMgmt = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (quoteForMgmt && !(quoteForMgmt as any).constructionMgmtOverride) {
          const mgmtRates = await db.getMasterDataByCategory("construction_mgmt_rates", ctx.tenant?.id ?? null);
          const getMgmtRate = (key: string) => {
            const entry = mgmtRates.find((r: any) => r.key.toLowerCase() === key.toLowerCase());
            return entry ? parseFloat(entry.value) || 0 : 0;
          };
          let mgmtTotal = 0;
          const roofShapeMgmt = (quoteForMgmt.specRoofShape || "").toLowerCase();
          // Apply rate based on roof shape (e.g. gable, skillion, flat, hip)
          for (const rate of mgmtRates) {
            if (roofShapeMgmt.includes(rate.key.toLowerCase())) {
              mgmtTotal += parseFloat(rate.value) || 0;
            }
          }
          await db.updateQuote(input.id, { constructionMgmtPercent: String(mgmtTotal) } as any, tenantId, quoteScopeOptionsForContext(ctx));
        }

        return { success: true };
      }),

    recalculateFinancials: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");

        const updates: Record<string, any> = {};

        // 1. Recalculate complexity loading (ignore override)
        const complexityRates = await db.getMasterDataByCategory("complexity", ctx.tenant?.id ?? null);
        const getRate = (key: string) => {
          const entry = complexityRates.find((r: any) => r.key.toLowerCase() === key.toLowerCase());
          return entry ? parseFloat(entry.value) || 0 : 0;
        };
        let complexityTotal = 0;
        const roofShape = (quote.specRoofShape || "").toLowerCase();
        if (roofShape.includes("gable")) complexityTotal += getRate("gable");
        const roofType = (quote.specRoofType || "").toLowerCase();
        const hasPopup = roofType.includes("pop") || !!(quote as any).specPopupBrackets;
        if (hasPopup) complexityTotal += getRate("pop-up");
        if ((quote as any).specSiteAccess === "1") complexityTotal += getRate("access");
        if ((quote as any).specSiteRestricted === "1") complexityTotal += getRate("restricted");
        if ((quote as any).specSiteMixed === "1") complexityTotal += getRate("mixed");
        updates.complexityLoading = String(complexityTotal);
        updates.complexityOverride = false;

        // 2. Recalculate construction management % (ignore override)
        const mgmtRates = await db.getMasterDataByCategory("construction_mgmt_rates", ctx.tenant?.id ?? null);
        let mgmtTotal = 0;
        for (const rate of mgmtRates) {
          if (roofShape.includes(rate.key.toLowerCase())) {
            mgmtTotal += parseFloat(rate.value) || 0;
          }
        }
        updates.constructionMgmtPercent = String(mgmtTotal);
        updates.constructionMgmtOverride = false;

        // 3. Recalculate delivery (distance × rate × factor)
        const deliveryRateData = await db.getMasterDataByCategory("delivery_rate", ctx.tenant?.id ?? null);
        const deliveryTiersData = await db.getMasterDataByCategory("delivery_factor_tiers", ctx.tenant?.id ?? null);
        const ratePerKm = deliveryRateData.length > 0 ? parseFloat(deliveryRateData[0].value) || 0 : 0;
        const distanceKm = Number(quote.travelDistanceKm) || 0;
        // Get subtotal for factor tier lookup
        const components = await db.getComponentsByQuote(input.id);
        const subtotal = (components || []).reduce((sum: number, comp: any) => {
          const items = (comp.lineItems as any[]) || [];
          return sum + items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.sellRate || 0), 0);
        }, 0);
        // Find applicable factor tier
        let factor = 1;
        const tiers = deliveryTiersData
          .map((t: any) => ({ threshold: parseFloat(t.key) || 0, factor: parseFloat(t.value) || 1 }))
          .sort((a: any, b: any) => a.threshold - b.threshold);
        for (const tier of tiers) {
          if (subtotal >= tier.threshold) factor = tier.factor;
        }
        const autoDelivery = distanceKm * ratePerKm * factor;
        updates.deliveryAmount = autoDelivery.toFixed(2);

        // 4. Recalculate small job surcharge
        const smallJobData = await db.getMasterDataByCategory("small_job_threshold", ctx.tenant?.id ?? null);
        const threshold = smallJobData.length > 0 ? parseFloat(smallJobData[0].value) || 0 : 0;
        const smallJobRate = smallJobData.length > 1 ? parseFloat(smallJobData[1].value) || 0 : 0;
        if (threshold > 0 && subtotal < threshold) {
          const surcharge = subtotal * (smallJobRate / 100);
          updates.smallJobSurcharge = surcharge.toFixed(2);
        } else {
          updates.smallJobSurcharge = "0";
        }

        await db.updateQuote(input.id, updates, tenantId, quoteScopeOptionsForContext(ctx));
        await syncQuoteHbcfRequirement(input.id, tenantId);

        // Log recalculation revision
        try {
          const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
          if (String(complexityTotal) !== (quote.complexityLoading || "0")) changes.push({ field: "complexityLoading", oldValue: quote.complexityLoading, newValue: String(complexityTotal) });
          if (String(mgmtTotal) !== (quote.constructionMgmtPercent || "0")) changes.push({ field: "constructionMgmtPercent", oldValue: quote.constructionMgmtPercent, newValue: String(mgmtTotal) });
          if (updates.deliveryAmount !== (quote.deliveryAmount || "0")) changes.push({ field: "deliveryAmount", oldValue: quote.deliveryAmount, newValue: updates.deliveryAmount });
          if (updates.smallJobSurcharge !== (quote.smallJobSurcharge || "0")) changes.push({ field: "smallJobSurcharge", oldValue: quote.smallJobSurcharge, newValue: updates.smallJobSurcharge });
          if (changes.length > 0) {
            await db.createQuoteRevision({ quoteId: input.id, userId: ctx.user.id, userName: ctx.user.name || "Unknown", action: "recalculate", changes, snapshot: { complexity: complexityTotal, constructionMgmt: mgmtTotal, delivery: autoDelivery, smallJob: parseFloat(updates.smallJobSurcharge) } });
          }
        } catch (e) { /* non-blocking */ }

        return { success: true, complexity: complexityTotal, constructionMgmt: mgmtTotal, delivery: autoDelivery, smallJob: parseFloat(updates.smallJobSurcharge) };
      }),

    getFinancialBreakdown: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.id, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");

        // 1. Complexity breakdown
        const complexityRates = await db.getMasterDataByCategory("complexity", ctx.tenant?.id ?? null);
        const getRate = (key: string) => {
          const entry = complexityRates.find((r: any) => r.key.toLowerCase() === key.toLowerCase());
          return entry ? parseFloat(entry.value) || 0 : 0;
        };
        const complexityCriteria: { name: string; rate: number }[] = [];
        const roofShape = (quote.specRoofShape || "").toLowerCase();
        if (roofShape.includes("gable")) complexityCriteria.push({ name: "Gable roof", rate: getRate("gable") });
        const roofType = (quote.specRoofType || "").toLowerCase();
        const hasPopup = roofType.includes("pop") || !!(quote as any).specPopupBrackets;
        if (hasPopup) complexityCriteria.push({ name: "Pop-up brackets", rate: getRate("pop-up") });
        if ((quote as any).specSiteAccess === "1") complexityCriteria.push({ name: "Difficult access", rate: getRate("access") });
        if ((quote as any).specSiteRestricted === "1") complexityCriteria.push({ name: "Restricted site", rate: getRate("restricted") });
        if ((quote as any).specSiteMixed === "1") complexityCriteria.push({ name: "Mixed materials", rate: getRate("mixed") });
        const complexityTotal = complexityCriteria.reduce((sum, c) => sum + c.rate, 0);

        // 2. Construction management breakdown
        const mgmtRates = await db.getMasterDataByCategory("construction_mgmt_rates", ctx.tenant?.id ?? null);
        let mgmtTotal = 0;
        for (const rate of mgmtRates) {
          if (roofShape.includes(rate.key.toLowerCase())) {
            mgmtTotal += parseFloat(rate.value) || 0;
          }
        }

        // 3. Delivery breakdown
        const deliveryRateData = await db.getMasterDataByCategory("delivery_rate", ctx.tenant?.id ?? null);
        const deliveryTiersData = await db.getMasterDataByCategory("delivery_factor_tiers", ctx.tenant?.id ?? null);
        const ratePerKm = deliveryRateData.length > 0 ? parseFloat(deliveryRateData[0].value) || 0 : 0;
        const distanceKm = Number(quote.travelDistanceKm) || 0;
        const components = await db.getComponentsByQuote(input.id);
        const subtotal = (components || []).reduce((sum: number, comp: any) => {
          const items = (comp.lineItems as any[]) || [];
          return sum + items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.sellRate || 0), 0);
        }, 0);
        let factor = 1;
        const tiers = deliveryTiersData
          .map((t: any) => ({ threshold: parseFloat(t.key) || 0, factor: parseFloat(t.value) || 1 }))
          .sort((a: any, b: any) => a.threshold - b.threshold);
        for (const tier of tiers) {
          if (subtotal >= tier.threshold) factor = tier.factor;
        }
        const deliveryTotal = distanceKm * ratePerKm * factor;

        // 4. Small job surcharge breakdown
        const smallJobData = await db.getMasterDataByCategory("small_job_threshold", ctx.tenant?.id ?? null);
        const threshold = smallJobData.length > 0 ? parseFloat(smallJobData[0].value) || 0 : 0;
        const smallJobRate = smallJobData.length > 1 ? parseFloat(smallJobData[1].value) || 0 : 0;
        const smallJobApplied = threshold > 0 && subtotal < threshold;
        const smallJobSurcharge = smallJobApplied ? subtotal * (smallJobRate / 100) : 0;

        return {
          complexity: { total: complexityTotal, criteria: complexityCriteria },
          constructionMgmt: { percent: mgmtTotal, roofShape: quote.specRoofShape || "N/A" },
          delivery: { distanceKm, ratePerKm, factorTier: factor, total: deliveryTotal },
          smallJob: { threshold, subtotal, applied: smallJobApplied, surcharge: smallJobSurcharge },
        };
      }),

    getRevisions: protectedProcedure
      .input(z.object({
        id: z.number(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        action: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.id, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        return db.getQuoteRevisions(input.id, input.limit || 50, {
          fromDate: input.fromDate ? new Date(input.fromDate) : undefined,
          toDate: input.toDate ? new Date(input.toDate) : undefined,
          action: input.action,
        });
      }),

    revertRevision: adminProcedure
      .input(z.object({ quoteId: z.number(), revisionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.quoteId, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        // Get the revision to revert
        const revisions = await db.getQuoteRevisions(input.quoteId, 200);
        const revision = revisions.find((r: any) => r.id === input.revisionId);
        if (!revision) throw new Error("Revision not found");
        // Build revert data from the revision's old values
        const changes = (revision.changes as Array<{ field: string; oldValue: any; newValue: any }>) || [];
        if (changes.length === 0) throw new Error("No changes to revert");
        const revertData: Record<string, any> = {};
        const revertChanges: Array<{ field: string; oldValue: any; newValue: any }> = [];
        for (const change of changes) {
          revertData[change.field] = change.oldValue;
          revertChanges.push({ field: change.field, oldValue: (quote as any)[change.field], newValue: change.oldValue });
        }
        await db.updateQuote(input.quoteId, revertData as any, tenantId, quoteScopeOptionsForContext(ctx));
        // Log the revert as a new revision
        await db.createQuoteRevision({
          quoteId: input.quoteId,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
          action: "revert",
          changes: revertChanges,
          snapshot: { revertedRevisionId: input.revisionId },
        });

        // Notify original change author via email (non-blocking)
        try {
          if (revision.userId && revision.userId !== ctx.user.id) {
            const originalAuthor = await db.getUserById(revision.userId);
            if (originalAuthor?.email) {
              const { sendNotificationEmail } = await import("./email");
              const fieldList = changes.map(c => c.field).join(", ");
              await sendNotificationEmail({
                to: originalAuthor.email,
                subject: `Change Reverted — Quote ${quote.quoteNumber}`,
                htmlBody: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #1e293b;">Change Reverted</h2>
                    <p style="color: #334155; line-height: 1.6;">Hi ${originalAuthor.name || "there"},</p>
                    <p style="color: #334155; line-height: 1.6;"><strong>${ctx.user.name || "An admin"}</strong> has reverted a change you made to quote <strong>${quote.quoteNumber}</strong> (${quote.clientName}).</p>
                    <p style="color: #334155; line-height: 1.6;"><strong>Fields reverted:</strong> ${fieldList}</p>
                    <p style="color: #334155; line-height: 1.6;">The values have been restored to their previous state.</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                    <p style="color: #64748b; font-size: 12px;">This is an automated notification from Altaspan.</p>
                  </div>
                `,
              });
            }
          }
        } catch (e) { /* non-blocking */ }

        return { success: true, revertedFields: changes.map(c => c.field) };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        await db.deleteQuote(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.number(), archived: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        await db.updateQuote(input.id, { archived: input.archived } as any, tenantId, quoteScopeOptionsForContext(ctx));
        return { success: true };
      }),

    uploadProposalPhoto: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        fileName: z.string(),
        base64Data: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");

        const { storagePut } = await import("./storage");
        const buffer = Buffer.from(input.base64Data, "base64");
        const suffix = Math.random().toString(36).slice(2, 8);
        const key = `proposal-photos/${input.quoteId}/${suffix}-${input.fileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url };
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.id, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const quoteNumber = await db.getNextQuoteNumber();
        const newId = await db.duplicateQuote(input.id, ctx.user.id, quoteNumber, tenantId, quoteScopeOptionsForContext(ctx));
        return { id: newId, quoteNumber };
      }),

     stats: protectedProcedure.query(async ({ ctx }) => {
      const tenantId = tenantIdFromContext(ctx);
      if (isAdminRole(ctx.user.role) || ctx.user.canViewAllQuotes || canViewAllTenantStructureQuotes(ctx)) {
        return db.getQuoteStats(undefined, tenantId, quoteScopeOptionsForContext(ctx));
      }
      if (ctx.user.role === "design_adviser" && ctx.user.name) {
        return db.getQuoteStats(ctx.user.id, tenantId, quoteScopeOptionsForContext(ctx), ctx.user.name);
      }
      return db.getQuoteStats(ctx.user.id, tenantId, quoteScopeOptionsForContext(ctx));
    }),

    recentRevisions: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(20).optional() }).optional())
      .query(async ({ ctx, input }) => {
        return db.getRecentRevisions(input?.limit || 5, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
      }),

    calculateTravel: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.quoteId, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        if (!quote.siteAddress) throw new Error("Site address is required to calculate travel distance");

        // Get all branch addresses from branches table
        const drizzleDb = (await (await import("./db")).getDb())!;
        const { branches: branchesTable } = await import("../drizzle/schema");
        const { and, eq } = await import("drizzle-orm");
        const branchConditions: any[] = [eq(branchesTable.isActive, true)];
        const tenantCondition = tenantScoped(branchesTable.tenantId, tenantId);
        if (tenantCondition) branchConditions.push(tenantCondition);
        const branchRows = await drizzleDb.select().from(branchesTable).where(and(...branchConditions));
        if (!branchRows.length) throw new Error("No branch addresses configured. Go to Company Settings to add branches.");

        const { makeRequest } = await import("./_core/map");

        // Build origins string with all branches separated by |
        const origins = branchRows.map(b => b.address).join("|");

        // Call Google Maps Distance Matrix API with all branches as origins
        const distResult = await makeRequest<any>("/maps/api/distancematrix/json", {
          origins,
          destinations: quote.siteAddress,
          mode: "driving",
          units: "metric",
        });

        if (distResult.status !== "OK" || !distResult.rows?.length) {
          throw new Error("Could not calculate distance. Check the site address.");
        }

        // Find the closest branch
        let closestIdx = 0;
        let closestDistance = Infinity;
        let closestBranchName = branchRows[0].name;
        for (let i = 0; i < distResult.rows.length; i++) {
          const el = distResult.rows[i].elements[0];
          if (el.status === "OK" && el.distance.value < closestDistance) {
            closestDistance = el.distance.value;
            closestIdx = i;
            closestBranchName = branchRows[i].name;
          }
        }

        const element = distResult.rows[closestIdx].elements[0];
        if (element.status !== "OK") {
          throw new Error("Route not found between any branch and site address.");
        }

        const distanceKm = Math.round(element.distance.value / 100) / 10; // metres to km, 1dp

        // Look up travel band
        const travelBands = await db.getMasterDataByCategory("travel_band", ctx.tenant?.id ?? null);
        travelBands.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        let matchedBand: { key: string; value: string } | null = null;
        for (const band of travelBands) {
          const rangeMatch = band.key.match(/(\d+)-(\d+)/);
          const plusMatch = band.key.match(/(\d+)\+/) || band.key.match(/(\d+)km\+/);
          if (rangeMatch) {
            const low = parseInt(rangeMatch[1]);
            const high = parseInt(rangeMatch[2]);
            if (distanceKm >= low && distanceKm < high) {
              matchedBand = band;
              break;
            }
          } else if (plusMatch) {
            const low = parseInt(plusMatch[1]);
            if (distanceKm >= low) {
              matchedBand = band;
              break;
            }
          }
        }

        const allowance = matchedBand ? matchedBand.value : "0";
        const bandKey = matchedBand ? matchedBand.key : "none";

        // Save to quote
        await db.updateQuote(input.quoteId, {
          travelDistanceKm: String(distanceKm),
          travelBandKey: bandKey,
          travelAllowance: allowance,
          includeTravelAllowance: parseFloat(allowance) > 0,
          travelOverridden: false,
          travelBranchName: closestBranchName,
        } as any, tenantId, quoteScopeOptionsForContext(ctx));

         return { distanceKm, bandKey, allowance: parseFloat(allowance), branchName: closestBranchName };
      }),

    lookupParcel: protectedProcedure
      .input(z.object({ address: z.string().min(3), suburb: z.string().optional(), region: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { lookupParcel } = await import("./parcelLookup");
        const result = await lookupParcel(input.address, { suburb: input.suburb, region: input.region });
        if (!result) throw new Error("Could not find parcel boundary for this address. Try a more specific address.");
        return result;
      }),
    staticMapImage: protectedProcedure
      .input(z.object({
        lat: z.number(),
        lng: z.number(),
        zoom: z.number().min(1).max(21).default(18),
        width: z.number().min(100).max(640).default(480),
        height: z.number().min(100).max(640).default(420),
      }))
      .query(async ({ input }) => {
        const earthRadiusM = 6378137;
        const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, input.lat));
        const lngRad = input.lng * Math.PI / 180;
        const latRad = clampedLat * Math.PI / 180;
        const centerX = earthRadiusM * lngRad;
        const centerY = earthRadiusM * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
        const metresPerPixel = 156543.03392804097 / Math.pow(2, input.zoom);
        const halfWidthM = input.width * metresPerPixel / 2;
        const halfHeightM = input.height * metresPerPixel / 2;

        const url = new URL("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export");
        url.searchParams.set("bbox", [
          centerX - halfWidthM,
          centerY - halfHeightM,
          centerX + halfWidthM,
          centerY + halfHeightM,
        ].join(","));
        url.searchParams.set("bboxSR", "3857");
        url.searchParams.set("imageSR", "3857");
        url.searchParams.set("size", `${input.width},${input.height}`);
        url.searchParams.set("format", "png");
        url.searchParams.set("transparent", "false");
        url.searchParams.set("f", "image");

        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`Static map request failed: ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const contentType = resp.headers.get("content-type") || "image/png";
        return { dataUrl: `data:${contentType};base64,${base64}` };
      }),

    placesAutocomplete: protectedProcedure
      .input(z.object({
        input: z.string().min(2),
        country: z.string().default("au"),
      }))
      .query(async ({ input: params }) => {
        const { makeRequest } = await import("./_core/map");
        const result = await makeRequest<any>("/maps/api/place/autocomplete/json", {
          input: params.input,
          components: `country:${params.country}`,
          types: "address",
        });
        if (result.status !== "OK") return [];
        return (result.predictions || []).map((p: any) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description,
          secondaryText: p.structured_formatting?.secondary_text || "",
        }));
      }),

    placeDetails: protectedProcedure
      .input(z.object({ placeId: z.string() }))
      .query(async ({ input }) => {
        const { makeRequest } = await import("./_core/map");
        const result = await makeRequest<any>("/maps/api/place/details/json", {
          place_id: input.placeId,
          fields: "address_components,formatted_address,geometry",
        });
        if (result.status !== "OK" || !result.result) {
          throw new Error("Could not retrieve place details");
        }
        const place = result.result;
        const components = place.address_components || [];
        let unitNumber = "", streetNumber = "", route = "", suburb = "", state = "", postcode = "", country = "";
        for (const comp of components) {
          const types = comp.types || [];
          if (types.includes("subpremise")) unitNumber = comp.long_name;
          if (types.includes("street_number")) streetNumber = comp.long_name;
          if (types.includes("route")) route = comp.long_name;
          if (types.includes("locality")) suburb = comp.long_name;
          if (types.includes("administrative_area_level_1")) state = comp.short_name;
          if (types.includes("postal_code")) postcode = comp.long_name;
          if (types.includes("country")) country = comp.long_name;
          if (types.includes("sublocality_level_1") && !suburb) suburb = comp.long_name;
        }
	        const streetAddress = normalizeApiAddress([streetNumber, route].filter(Boolean).join(" "));
	        const streetWithUnit = unitNumber && streetAddress ? `${unitNumber}/${streetAddress}` : streetAddress;
	        const suburbLine = [suburb, state, postcode].filter(Boolean).join(" ");
	        const fullAddress = normalizeApiAddress(
	          [streetWithUnit, suburbLine].filter(Boolean).join(", ") || place.formatted_address || ""
	        );
	        return {
	          fullAddress,
	          unitNumber,
	          streetAddress,
          suburb,
          state,
          postcode,
          country,
          lat: place.geometry?.location?.lat,
          lng: place.geometry?.location?.lng,
        };
      }),
  }),
  // ─── Components ────────────────────────────────────────────────────────────
  components: router({
    getByQuote: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) return [];
        if (!canAccessQuoteTenantRecord(ctx, quote)) return [];
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) return [];
        return db.getComponentsByQuote(input.quoteId);
      }),

    getByTab: protectedProcedure
      .input(z.object({ quoteId: z.number(), tabName: z.string() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) return null;
        if (!canAccessQuoteTenantRecord(ctx, quote)) return null;
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) return null;
        return db.getComponentByTab(input.quoteId, input.tabName);
      }),

    upsert: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        tabName: z.string(),
        included: z.boolean().optional(),
        lineItems: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const id = await db.upsertComponent(input);
        await syncQuoteHbcfRequirement(input.quoteId, tenantIdFromContext(ctx));
        return { id };
      }),
  }),

  // ─── Skylux ────────────────────────────────────────────────────────────────
  skylux: router({
    getByQuote: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) return [];
        if (!canAccessQuoteTenantRecord(ctx, quote)) return [];
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) return [];
        return db.getSkyluxByQuote(input.quoteId);
      }),

    lookup: protectedProcedure
      .input(z.object({ length: z.number(), width: z.number() }))
      .query(async ({ input }) => {
        return db.lookupSkyluxPrice(input.length, input.width);
      }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        quoteId: z.number(),
        included: z.boolean().optional(),
        length: z.string().optional(),
        width: z.string().optional(),
        baseCost: z.string().optional(),
        sellPrice: z.string().optional(),
        upgrades: z.any().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const id = await db.upsertSkylux(input as any);
        return { id };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteSkylux(input.id);
        return { success: true };
      }),
  }),

  // ─── Eclipse ───────────────────────────────────────────────────────────────
  eclipse: router({
    getByQuote: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .query(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) return [];
        if (!canAccessQuoteTenantRecord(ctx, quote)) return [];
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) return [];
        return db.getEclipseByQuote(input.quoteId);
      }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        quoteId: z.number(),
        included: z.boolean().optional(),
        systemWidth: z.string().optional(),
        systemProjection: z.string().optional(),
        bladeCount: z.number().optional(),
        materialLines: z.any().optional(),
        labourDays: z.string().optional(),
        labourRate: z.string().optional(),
        tradeDiscount: z.string().optional(),
        totalCost: z.string().optional(),
        totalSell: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const id = await db.upsertEclipse(input as any);
        return { id };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEclipse(input.id);
        return { success: true };
      }),
  }),

  // ─── Master Data ───────────────────────────────────────────────────────────
  masterData: router({
    getAll: tenantProcedure.query(async ({ ctx }) => db.getAllMasterData(ctx.tenant!.id)),

    getByCategory: tenantProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ ctx, input }) => db.getMasterDataByCategory(input.category, ctx.tenant!.id)),

    upsert: tenantAdminProcedure
      .input(z.object({
        id: z.number().optional(),
        category: z.string(),
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
        sortOrder: z.number().optional(),
        metadata: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // If updating an existing product_tab, cascade the key change to all products
        if (input.id && input.category === "product_tab") {
          const existing = await db.getMasterDataById(input.id, ctx.tenant!.id);
          if (existing && existing.key !== input.key) {
            // Tab key was renamed — update all products referencing the old key
            await db.reassignProductsFromTab(existing.key, input.key, ctx.tenant!.id);
          }
        }
        const id = await db.upsertMasterData(input as any, ctx.tenant!.id);
        return { id };
      }),

    delete: tenantAdminProcedure
      .input(z.object({ id: z.number(), reassignTo: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        // Check if this is a product_tab being deleted — handle orphaned products
        const entry = await db.getMasterDataById(input.id, ctx.tenant!.id);
        if (entry && entry.category === "product_tab") {
          await db.reassignProductsFromTab(entry.key, input.reassignTo || null, ctx.tenant!.id);
        }
        // If deleting a colour, also remove it from all colour group memberships
        if (entry && entry.category === "colour") {
          await db.removeColourGroupMembersByValue(entry.value, ctx.tenant!.id);
        }
        await db.deleteMasterData(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    reorder: tenantAdminProcedure
      .input(z.object({
        items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
      }))
      .mutation(async ({ ctx, input }) => {
        for (const item of input.items) {
          await db.updateMasterDataSortOrder(item.id, item.sortOrder, ctx.tenant!.id);
        }
        return { success: true };
      }),

    getProductCountByTab: tenantAdminProcedure
      .input(z.object({ tabKey: z.string() }))
      .query(async ({ ctx, input }) => db.getProductCountByTab(input.tabKey, ctx.tenant!.id)),

    skyluxMatrix: router({
      getAll: tenantProcedure.query(async ({ ctx }) => db.getAllSkyluxMatrix(ctx.tenant!.id)),
      upsert: tenantAdminProcedure
        .input(z.object({
          id: z.number().optional(),
          length: z.number(),
          width: z.number(),
          baseCost: z.string(),
          sellMultiplier: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const id = await db.upsertSkyluxMatrix(input as any, ctx.tenant!.id);
          return { id };
        }),
    }),
  }),

  // ─── Colour Groups ────────────────────────────────────────────────────────
  colourGroups: router({
    getAll: tenantProcedure.query(async ({ ctx }) => db.getAllColourGroups(ctx.tenant!.id)),

    getMembers: tenantProcedure
      .input(z.object({ colourGroupId: z.number() }))
      .query(async ({ ctx, input }) => db.getColourGroupMembers(input.colourGroupId, ctx.tenant!.id)),

    getAllMembers: tenantProcedure.query(async ({ ctx }) => db.getAllColourGroupMembers(ctx.tenant!.id)),

    upsert: tenantAdminProcedure
      .input(z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
        standardColours: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.upsertColourGroup(input, ctx.tenant!.id);
        return { id };
      }),

    updateStandardColours: tenantAdminProcedure
      .input(z.object({
        id: z.number(),
        standardColours: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateColourGroupStandardColours(input.id, input.standardColours, ctx.tenant!.id);
        return { success: true };
      }),

    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteColourGroup(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    setMembers: tenantAdminProcedure
      .input(z.object({
        colourGroupId: z.number(),
        colours: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.setColourGroupMembers(input.colourGroupId, input.colours, ctx.tenant!.id);
        return { success: true };
      }),

    cleanupOrphaned: tenantAdminProcedure
      .mutation(async ({ ctx }) => {
        const removed = await db.cleanupOrphanedColourGroupMembers(ctx.tenant!.id);
        return { removed };
      }),
  }),

  // ─── Products ──────────────────────────────────────────────────────────────
  products: router({
    getByTab: tenantProcedure
      .input(z.object({ tabName: z.string() }))
      .query(async ({ ctx, input }) => db.getProductsByTab(input.tabName, ctx.tenant!.id)),

    getAll: tenantProcedure.query(async ({ ctx }) => db.getAllProducts(ctx.tenant!.id)),

    getNamesByTabPattern: tenantProcedure
      .input(z.object({ pattern: z.string() }))
      .query(async ({ ctx, input }) => db.getProductNamesByTabPattern(input.pattern, ctx.tenant!.id)),

    getRatesForTab: tenantProcedure
      .input(z.object({ tabName: z.string(), region: z.string().optional() }))
      .query(async ({ ctx, input }) => db.calculateTabProductRates(input.tabName, input.region || "Canberra", ctx.tenant!.id)),

    calculateRate: tenantProcedure
      .input(z.object({ productId: z.number(), isPowderCoated: z.boolean().optional(), region: z.string().optional() }))
      .query(async ({ ctx, input }) => db.calculateProductSellRate(input.productId, input.isPowderCoated ?? false, input.region || "Canberra", ctx.tenant!.id)),

    upsert: tenantAdminProcedure
      .input(z.object({
        id: z.number().optional(),
        productCode: z.string().nullable().optional(),
        tabName: z.string(),
        subTab: z.string().nullable().optional(),
        name: z.string(),
        uom: z.string(),
        baseCost: z.string(),
        materials: z.string().optional(),
        installLabour: z.string().optional(),
        consumables: z.string().optional(),
        markupCategory: z.string().nullable().optional(),
        fixedSell: z.string().nullable().optional(),
        powderCoatSurcharge: z.string().optional(),
        colourGroup: z.string().nullable().optional(),
        colourGroupBottom: z.string().nullable().optional(),
        coverageWidth: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Auto-compute baseCost from breakdown fields
        const materials = parseFloat(input.materials || "0") || 0;
        const installLabour = parseFloat(input.installLabour || "0") || 0;
        const consumables = parseFloat(input.consumables || "0") || 0;
        const computedBaseCost = (materials + installLabour + consumables).toFixed(2);
        const id = await db.upsertProduct({ ...input, baseCost: computedBaseCost } as any, ctx.tenant!.id);
        return { id };
      }),
    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteProduct(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    bulkDelete: tenantAdminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        for (const id of input.ids) {
          await db.deleteProduct(id, ctx.tenant!.id);
        }
        return { deleted: input.ids.length };
      }),

    getTabsAndUoms: tenantProcedure.query(async ({ ctx }) => {
      const allMd = await db.getAllMasterData(ctx.tenant!.id);
      const tabs = allMd.filter(m => m.category === "product_tab").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const uoms = allMd.filter(m => m.category === "product_uom").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const subTabs = allMd.filter(m => m.category === "product_subtab").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return { tabs, uoms, subTabs };
    }),

    /**
     * Returns products grouped by specField for the Spec Sheet FilteredSelect dropdowns.
     * Each specField maps to one or more product tabs. Products are grouped by sub-tab within each tab.
     * Response shape: { [specField]: { categories: { id, label, options[] }[] } }
     */
    getSpecFieldOptions: tenantProcedure.query(async ({ ctx }) => {
      const allMd = await db.getAllMasterData(ctx.tenant!.id);
      const tabs = allMd.filter(m => m.category === "product_tab");
      const subTabs = allMd.filter(m => m.category === "product_subtab").sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      // Build map: specField -> list of tabKeys
      const specFieldToTabs: Record<string, { tabKey: string; tabLabel: string }[]> = {};
      for (const tab of tabs) {
        const meta = tab.metadata as any;
        if (meta?.specField) {
          if (!specFieldToTabs[meta.specField]) specFieldToTabs[meta.specField] = [];
          specFieldToTabs[meta.specField].push({ tabKey: tab.key, tabLabel: tab.value });
        }
      }

      // For each specField, fetch products from all mapped tabs and group by sub-tab
      const result: Record<string, { categories: { id: string; label: string; options: string[] }[] }> = {};
      // Map product name -> colourGroup for filtering colours by selected product
      const productColourGroups: Record<string, string> = {};
      // Map product name -> colourGroupBottom for filtering bottom/ceiling colours
      const productColourGroupsBottom: Record<string, string> = {};

      for (const [specField, mappedTabs] of Object.entries(specFieldToTabs)) {
        const categories: { id: string; label: string; options: string[] }[] = [];

        for (const { tabKey, tabLabel } of mappedTabs) {
          // Get sub-tabs for this tab
          const tabSubTabs = subTabs.filter(st => st.description === tabKey);
          // Get products for this tab
          const products = await db.getProductNamesByTabPattern(tabKey, ctx.tenant!.id);

          // Collect colourGroup mappings
          for (const p of products) {
            if (p.colourGroup) {
              productColourGroups[p.name] = p.colourGroup;
            }
            if (p.colourGroupBottom) {
              productColourGroupsBottom[p.name] = p.colourGroupBottom;
            }
          }

          if (tabSubTabs.length > 0) {
            // Group products by sub-tab
            for (const st of tabSubTabs) {
              const subTabKey = st.key.split("::")[1] || st.key;
              const subTabLabel = st.value;
              // Normalize: master_data keys use underscores, product subTab uses spaces
              const normalizedSubTabKey = subTabKey.replace(/_/g, " ").trim().toLowerCase();
              const matching = products.filter(p =>
                p.subTab && p.subTab.trim().toLowerCase() === normalizedSubTabKey
              );
              if (matching.length > 0) {
                categories.push({ id: `${tabKey}::${subTabKey}`, label: subTabLabel, options: matching.map(p => p.name) });
              }
            }
            // Products without a sub-tab go into the tab-level category
            const unmatched = products.filter(p => !p.subTab || !tabSubTabs.some(st => {
              const key = (st.key.split("::")[1] || st.key).replace(/_/g, " ").trim().toLowerCase();
              return key === (p.subTab || "").trim().toLowerCase();
            }));
            if (unmatched.length > 0) {
              categories.push({ id: `${tabKey}::other`, label: `${tabLabel} (Other)`, options: unmatched.map(p => p.name) });
            }
          } else {
            // No sub-tabs: use the tab itself as a single category
            if (products.length > 0) {
              categories.push({ id: tabKey, label: tabLabel, options: products.map(p => p.name) });
            }
          }
        }

        result[specField] = { categories };
      }

      return { fields: result, productColourGroups, productColourGroupsBottom };
    }),

    exportCsv: tenantAdminProcedure.query(async ({ ctx }) => {
      const allProducts = await db.getAllProductsForExport(ctx.tenant!.id);
      const headers = ["productCode", "tabName", "subTab", "name", "uom", "baseCost", "materials", "installLabour", "consumables", "markupCategory", "fixedSell", "powderCoatSurcharge", "colourGroup", "coverageWidth", "sortOrder", "active"];
      const csvRows = [headers.join(",")];
      for (const p of allProducts) {
        csvRows.push([
          p.productCode ?? "", p.tabName, p.subTab ?? "", `"${(p.name || "").replace(/"/g, '""')}"`, p.uom,
          p.baseCost ?? "0", p.materials ?? "0", p.installLabour ?? "0", p.consumables ?? "0",
          p.markupCategory ?? "", p.fixedSell ?? "",
          p.powderCoatSurcharge ?? "0", p.colourGroup ?? "", String(p.coverageWidth ?? ""), String(p.sortOrder ?? 0),
          String(p.active !== false)
        ].join(","));
      }
      return { csv: csvRows.join("\n"), count: allProducts.length };
    }),

    bulkImport: tenantAdminProcedure
      .input(z.object({
        rows: z.array(z.object({
          productCode: z.string().nullable().optional(),
          tabName: z.string().min(1),
          subTab: z.string().nullable().optional(),
          name: z.string().min(1),
          uom: z.string().min(1),
          baseCost: z.string(),
          materials: z.string().optional(),
          installLabour: z.string().optional(),
          consumables: z.string().optional(),
          markupCategory: z.string().nullable().optional(),
          fixedSell: z.string().nullable().optional(),
          powderCoatSurcharge: z.string().optional(),
          colourGroup: z.string().nullable().optional(),
          colourGroupBottom: z.string().nullable().optional(),
          coverageWidth: z.number().nullable().optional(),
          sortOrder: z.number().optional(),
          active: z.boolean().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // Auto-compute baseCost from breakdown fields for each row
        const rows = input.rows.map(row => {
          const mat = parseFloat(row.materials || "0") || 0;
          const lab = parseFloat(row.installLabour || "0") || 0;
          const con = parseFloat(row.consumables || "0") || 0;
          return { ...row, baseCost: (mat + lab + con).toFixed(2) };
        });
        return db.bulkUpsertProducts(rows, ctx.tenant!.id);
      }),

    /** Search the component catalogue for import candidates */
    searchCatalogue: tenantProcedure
      .input(z.object({
        category: z.string().optional(),
        search: z.string().optional().default(""),
        limit: z.number().int().min(1).max(200).optional().default(50),
      }))
      .query(async ({ input }) => {
        const { componentCatalogueProducts } = await import("../drizzle/schema");
        const { eq, and, like, or, sql, count } = await import("drizzle-orm");
        const rawDb = await db.getRawDb();
        if (!rawDb) return { items: [], total: 0 };

        const conditions: any[] = [eq(componentCatalogueProducts.isActive, true)];
        if (input.category) {
          conditions.push(eq(componentCatalogueProducts.category, input.category));
        }
        if (input.search.trim()) {
          const term = `%${input.search.trim().toLowerCase()}%`;
          conditions.push(
            or(
              like(sql`LOWER(${componentCatalogueProducts.spaCode})`, term),
              like(sql`LOWER(${componentCatalogueProducts.description})`, term),
              like(sql`LOWER(${componentCatalogueProducts.colour})`, term)
            )!
          );
        }

        const whereClause = and(...conditions);
        const [countResult] = await rawDb.select({ total: count() }).from(componentCatalogueProducts).where(whereClause);
        const rows = await rawDb.select().from(componentCatalogueProducts).where(whereClause).orderBy(componentCatalogueProducts.spaCode).limit(input.limit);

        return {
          items: rows.map(r => ({
            id: r.id,
            spaCode: r.spaCode,
            description: r.description,
            colour: r.colour || "",
            uom: r.uom || "",
            packQtySizes: r.packQtySizes || "",
            price: Number(r.price || 0),
            category: r.category,
          })),
          total: countResult?.total ?? 0,
        };
      }),

    /** Get catalogue categories for the import picker */
    catalogueCategories: tenantProcedure.query(async () => {
      return [
        "Aluminium", "Ampelite", "Back Channel", "Brackets & Componentry",
        "Coils", "Downlights", "Infill", "IRP IWP", "Laserlite",
        "Rainwater Harvesting", "Screws", "Silicone & Adhesive", "Spanlites", "Touch Up Paint",
      ];
    }),

    /** Import selected catalogue items into the products table */
    importFromCatalogue: tenantAdminProcedure
      .input(z.object({
        items: z.array(z.object({
          catalogueId: z.number(),
          spaCode: z.string(),
          description: z.string(),
          colour: z.string().optional().default(""),
          uom: z.string(),
          price: z.number(),
          category: z.string(),
        })),
        tabName: z.string().min(1),
        subTab: z.string().nullable().optional(),
        markupCategory: z.string().nullable().optional(),
        markupPercent: z.number().min(0).max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const allProducts = await db.getAllProducts(ctx.tenant!.id);
        const existingCodes = new Set(allProducts.map(p => p.productCode?.toLowerCase()).filter(Boolean));

        let imported = 0;
        let skipped = 0;

        for (const item of input.items) {
          // Skip if product code already exists
          if (existingCodes.has(item.spaCode.toLowerCase())) {
            skipped++;
            continue;
          }

          // Calculate materials cost (the catalogue price is the base material cost)
          const materialsCost = item.price;
          // Apply markup if specified to get a fixedSell price
          let fixedSell: string | null = null;
          if (input.markupPercent && input.markupPercent > 0) {
            fixedSell = (materialsCost * (1 + input.markupPercent / 100)).toFixed(2);
          }

          await db.upsertProduct({
            productCode: item.spaCode,
            tabName: input.tabName,
            subTab: input.subTab || null,
            name: item.description + (item.colour ? ` (${item.colour})` : ""),
            uom: item.uom || "ea",
            baseCost: materialsCost.toFixed(2),
            materials: materialsCost.toFixed(2),
            installLabour: "0",
            consumables: "0",
            markupCategory: input.markupCategory || "product_standard",
            fixedSell,
            powderCoatSurcharge: "0",
            colourGroup: null,
            coverageWidth: null,
            sortOrder: 0,
            active: true,
          } as any, ctx.tenant!.id);
          imported++;
          existingCodes.add(item.spaCode.toLowerCase());
        }

        return { imported, skipped, total: input.items.length };
      }),
  }),

  // ─── LLM Assistant ─────────────────────────────────────────────────────────
  assistant: router({
    generateDescription: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        jobSummary: z.string().optional(),
        roofShapeGroupKey: z.string().optional(), // Override roof shape group for examples
        refinementInstruction: z.string().optional(), // e.g. "make it shorter"
        previousDescription: z.string().optional(), // The current description to refine
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const components = await db.getComponentsByQuote(input.quoteId);
        const componentSummary = components
          .filter(c => c.included)
          .map(c => {
            const items = (c.lineItems as any[]) || [];
            const total = items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.sellRate || 0), 0);
            return `${c.tabName}: ${items.length} items, $${total.toFixed(0)}`;
          }).join("\n");

        // Fetch master Descriptions of Work as reference examples
        const dowGroups = await db.getMasterDataByCategory("dow_group", ctx.tenant?.id ?? null);
        const dowItems = await db.getMasterDataByCategory("dow_item", ctx.tenant?.id ?? null);

        // Build reference examples grouped by roof shape
        let referenceExamples = "";
        if (dowGroups.length > 0 && dowItems.length > 0) {
          const examplesByGroup: string[] = [];
          for (const group of dowGroups) {
            const groupItems = dowItems
              .filter(item => (item.metadata as any)?.groupKey === group.key)
              .slice(0, 3);
            if (groupItems.length > 0) {
              examplesByGroup.push(
                `[${group.value}]\n${groupItems.map(i => `- ${i.value}`).join("\n")}`
              );
            }
          }
          if (examplesByGroup.length > 0) {
            referenceExamples = `\n\nHere are reference examples of approved Descriptions of Work from our master library, grouped by roof shape. Match this style, tone, and level of detail:\n\n${examplesByGroup.join("\n\n")}`;
          }
        }

        // Determine which roof shape group to prioritise
        // Priority: explicit override > quote spec field > none
        let roofShapeHint = "";
        const targetGroupKey = input.roofShapeGroupKey;
        const targetGroup = targetGroupKey
          ? dowGroups.find(g => g.key === targetGroupKey)
          : quote.specRoofShape
            ? dowGroups.find(g =>
                g.value.toLowerCase().includes(quote.specRoofShape!.toLowerCase()) ||
                quote.specRoofShape!.toLowerCase().includes(g.value.toLowerCase())
              )
            : null;

        if (targetGroup) {
          const matchingItems = dowItems
            .filter(item => (item.metadata as any)?.groupKey === targetGroup.key)
            .slice(0, 5);
          if (matchingItems.length > 0) {
            roofShapeHint = `\n\nThe roof shape for this job is "${targetGroup.value}". Here are our standard descriptions for this shape - use these as your primary style guide:\n${matchingItems.map(i => `- ${i.value}`).join("\n")}`;
          }
        }

        // Build the refinement section if this is a regeneration
        let refinementSection = "";
        if (input.refinementInstruction && input.previousDescription) {
          refinementSection = `\n\nPREVIOUS DESCRIPTION (to refine):\n"${input.previousDescription}"\n\nREFINEMENT INSTRUCTION: ${input.refinementInstruction}\n\nRewrite the description following the refinement instruction while keeping it professional and accurate.`;
        }

        const baseInstruction = input.refinementInstruction && input.previousDescription
          ? "Refine the previous description according to the refinement instruction below."
          : "Write 2-4 sentences describing the work to be performed. Match the style and terminology from the reference examples above. Do not include pricing.";

        const prompt = `You are a technical writer for Altaspan, a construction company specialising in outdoor living structures (patios, carports, pergolas, sunrooms, etc.) in the ACT and NSW region of Australia.

Write a professional "Description of Work" for a project specification sheet. Be concise but thorough. Include the type of structure, key materials, dimensions if available, and scope of work.${referenceExamples}${roofShapeHint}

Client: ${quote.clientName}
Site: ${quote.siteAddress || "Not specified"}
Region: ${quote.region || "Canberra"}
${quote.specWidth && quote.specLength ? `Dimensions: ${quote.specWidth}m W x ${quote.specLength}m L` : ""}
${quote.specRoofType ? `Roof Type: ${quote.specRoofType}` : ""}
${quote.specRoofShape ? `Roof Shape: ${quote.specRoofShape}` : ""}
${quote.specRoofTopColour ? `Roof Colour: ${quote.specRoofTopColour}` : ""}
${quote.specPostsType ? `Posts: ${quote.specPostsType}` : ""}
${quote.specPostsColour ? `Post Colour: ${quote.specPostsColour}` : ""}
${quote.specGutterType ? `Gutter: ${quote.specGutterType}` : ""}
${quote.specAttachmentMethod ? `No. of Attached Side: ${quote.specAttachmentMethod}` : ""}
${(quote as any).specBracketAttachmentMethod ? `Attachment Method: ${(quote as any).specBracketAttachmentMethod}` : ""}
${(quote as any).specNumberOfBrackets ? `Number of Brackets: ${(quote as any).specNumberOfBrackets}` : ""}
${input.jobSummary ? `Additional context: ${input.jobSummary}` : ""}

Components included:
${componentSummary || "No components added yet"}${refinementSection}

${baseInstruction}`;

        const result = await invokeLLM({
          messages: [
            { role: "system", content: `You are a concise technical writer for Altaspan construction project specifications. You write in the same style as the company's existing approved descriptions of work. Keep descriptions professional, specific to the materials and structure, and avoid generic filler language.

Use the following technical knowledge for accurate component names and specifications:
${SPANLINE_TECHNICAL_PROMPT}` },
            { role: "user", content: prompt },
          ],
        });

        const description = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content
          : "";

        return { description };
      }),

    // Save a generated description back to the master library
    saveDescriptionToLibrary: protectedProcedure
      .input(z.object({
        description: z.string().min(1),
        groupKey: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get existing items in this group to determine sort order
        const dowItems = await db.getMasterDataByCategory("dow_item", ctx.tenant?.id ?? null);
        const groupItems = dowItems.filter(item => (item.metadata as any)?.groupKey === input.groupKey);
        const nextSortOrder = groupItems.length;
        const key = `dow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await db.upsertMasterData({
          category: "dow_item",
          key,
          value: input.description,
          sortOrder: nextSortOrder,
          metadata: { groupKey: input.groupKey },
        }, ctx.tenant?.id ?? null);
        return { success: true };
      }),

    // List available DOW groups for the roof shape selector
    listDowGroups: protectedProcedure.query(async ({ ctx }) => {
      const groups = await db.getMasterDataByCategory("dow_group", ctx.tenant?.id ?? null);
      return groups.map(g => ({ key: g.key, name: g.value }));
    }),

    // List DOW items (templates) optionally filtered by group
    listDowItems: protectedProcedure
      .input(z.object({ groupKey: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const dowItems = await db.getMasterDataByCategory("dow_item", ctx.tenant?.id ?? null);
        const filtered = input?.groupKey
          ? dowItems.filter(item => (item.metadata as any)?.groupKey === input.groupKey)
          : dowItems;
        return filtered.map(item => ({
          key: item.key,
          value: item.value,
          groupKey: (item.metadata as any)?.groupKey || "",
        }));
      }),

    suggestQuantities: protectedProcedure
      .input(z.object({
        jobDescription: z.string(),
        tabName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const masterDataItems = await db.getMasterDataByCategory("markup", ctx.tenant?.id ?? null);
        const prompt = `You are an experienced estimator for Altaspan. Based on this job description, suggest typical quantities for the "${input.tabName}" component tab.

Job Description: ${input.jobDescription}

Return a JSON array of objects with: component (string), qty (number), uom (string - m, m2, ea, set, lot), notes (string).
Only suggest items relevant to the "${input.tabName}" tab. Be realistic with quantities.`;

        const result = await invokeLLM({
          messages: [
            { role: "system", content: `You are a construction estimator for Altaspan. Return only valid JSON.

Use the following technical knowledge for accurate component names, sizes, and specifications:
${SPANLINE_TECHNICAL_PROMPT}` },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "quantity_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        component: { type: "string" },
                        qty: { type: "number" },
                        uom: { type: "string" },
                        notes: { type: "string" },
                      },
                      required: ["component", "qty", "uom", "notes"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = typeof result.choices[0]?.message?.content === "string"
          ? result.choices[0].message.content : "{}";
        try {
          return JSON.parse(content);
        } catch {
          return { suggestions: [] };
        }
      }),

    checkMargin: protectedProcedure
      .input(z.object({ quoteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const quote = await db.getQuoteById(input.quoteId, tenantIdFromContext(ctx), quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Unauthorized");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) throw new Error("Unauthorized");
        const components = await db.getComponentsByQuote(input.quoteId);
        let totalSell = 0, totalCost = 0;
        for (const comp of components) {
          const items = (comp.lineItems as any[]) || [];
          for (const item of items) {
            totalSell += (item.qty || 0) * (item.sellRate || 0);
            totalCost += (item.qty || 0) * (item.costRate || 0);
          }
        }
        const margin = totalSell > 0 ? ((totalSell - totalCost) / totalSell) * 100 : 0;
        const warnings: string[] = [];
        if (margin < 20) warnings.push(`Overall margin is very low at ${margin.toFixed(1)}%. Typical target is 40-55%.`);
        else if (margin < 35) warnings.push(`Overall margin of ${margin.toFixed(1)}% is below the typical 40-55% range.`);
        // Check individual tabs
        for (const comp of components) {
          const items = (comp.lineItems as any[]) || [];
          let tabSell = 0, tabCost = 0;
          for (const item of items) {
            tabSell += (item.qty || 0) * (item.sellRate || 0);
            tabCost += (item.qty || 0) * (item.costRate || 0);
          }
          const tabMargin = tabSell > 0 ? ((tabSell - tabCost) / tabSell) * 100 : 0;
          if (tabSell > 0 && tabMargin < 15) {
            warnings.push(`${comp.tabName} tab has a critically low margin of ${tabMargin.toFixed(1)}%.`);
          }
        }
        return { margin: margin.toFixed(1), totalSell, totalCost, warnings };
      }),

    askPricing: protectedProcedure
      .input(z.object({ question: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const allData = await db.getAllMasterData(ctx.tenant?.id ?? null);
        const dataContext = allData.map(d => `[${d.category}] ${d.key}: ${d.value}${d.description ? ` (${d.description})` : ""}`).join("\n");

        // ─── AI Learning: Fetch knowledge chunks, few-shot examples, corrections ───
        let aiKnowledgeContext = "";
        let aiFewShotMessages: { role: "user" | "assistant"; content: string }[] = [];
        let aiCorrectionsContext = "";
        try {
          const drizzleDb = (await (await import("./db")).getDb())!;
          if (drizzleDb) {
            const { aiKnowledgeChunks, aiFewShotExamples, aiCorrections } = await import("../drizzle/schema");
            const { eq, asc, and } = await import("drizzle-orm");
            const tenantId = tenantIdFromContext(ctx);
            const withTenantScope = (tenantColumn: any, conditions: any[]) => {
              const scope = tenantScoped(tenantColumn, tenantId);
              if (scope) conditions.push(scope);
              return conditions.length === 1 ? conditions[0] : and(...conditions);
            };

            // Active knowledge chunks
            const chunks = await drizzleDb.select().from(aiKnowledgeChunks)
              .where(withTenantScope(aiKnowledgeChunks.tenantId, [eq(aiKnowledgeChunks.isActive, true)]));
            if (chunks.length > 0) {
              aiKnowledgeContext = "\n\n--- ADDITIONAL KNOWLEDGE ---\n" + chunks.map(c => `[${c.category || "general"}] ${c.title}:\n${c.content}`).join("\n\n");
            }

            // Active few-shot examples for 'engini' prompt
            const examples = await drizzleDb.select().from(aiFewShotExamples)
              .where(withTenantScope(aiFewShotExamples.tenantId, [eq(aiFewShotExamples.isActive, true)]))
              .orderBy(asc(aiFewShotExamples.sortOrder));
            const enginiExamples = examples.filter(e => e.promptKey === "engini");
            for (const ex of enginiExamples.slice(0, 5)) { // Max 5 few-shot examples
              aiFewShotMessages.push({ role: "user", content: ex.userInput });
              aiFewShotMessages.push({ role: "assistant", content: ex.expectedOutput });
            }

            // Active corrections for 'engini' prompt — only inject those relevant to the current query
            const corrections = await drizzleDb.select().from(aiCorrections)
              .where(withTenantScope(aiCorrections.tenantId, [eq(aiCorrections.isActive, true)]));
            const enginiCorrections = corrections.filter(c => !c.promptKey || c.promptKey === "engini");
            // Relevance filter: inject correction only if query shares significant keywords with originalQuery
            const queryWords = input.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const relevantCorrections = enginiCorrections.filter(c => {
              const corrWords = c.originalQuery.toLowerCase().split(/\s+/);
              const overlap = queryWords.filter(qw => corrWords.some(cw => cw.includes(qw) || qw.includes(cw)));
              return overlap.length >= 2 || (queryWords.length <= 3 && overlap.length >= 1);
            });
            if (relevantCorrections.length > 0) {
              aiCorrectionsContext = "\n\n--- CORRECTIONS (IMPORTANT: Override previous wrong answers) ---\n" +
                relevantCorrections.slice(0, 10).map(c => `- When asked about: "${c.originalQuery}"\n  CORRECT answer: ${c.correction}${c.context ? ` (Context: ${c.context})` : ""}`).join("\n");
            }
          }
        } catch (aiErr) {
          console.warn("[Engini] AI learning data fetch error (non-fatal):", aiErr);
        }

        // Fetch active tech library documents for dynamic knowledge
        // Only include full knowledge summaries for relevant docs to stay within token limits
        const techDocs = await db.getActiveTechLibraryDocuments();
        const questionLower = input.question.toLowerCase();
        
        // Keywords that indicate building standards / tolerances / defects questions
        const bsgKeywords = ["tolerance", "defect", "standard", "building standard", "compliant", "acceptable", "workmanship", "rectif", "concrete slab", "bsg", "ncc", "building code"];
        const isBsgQuestion = bsgKeywords.some(kw => questionLower.includes(kw));
        
        // Build tech library context: include full summary only for relevant docs, just titles for others
        let techLibraryContext = "";
        if (techDocs.length > 0) {
          const relevantDocs: string[] = [];
          const otherDocTitles: string[] = [];
          
          for (const d of techDocs) {
            const titleLower = (d.title + " " + (d.description || "")).toLowerCase();
            // Include full knowledge if: (a) question matches doc keywords, or (b) doc is BSG and question is about standards
            const isRelevant = d.knowledgeSummary && (
              (d.code === "BSG-001" && isBsgQuestion) ||
              questionLower.split(/\s+/).some(word => word.length > 3 && titleLower.includes(word))
            );
            
            if (isRelevant && d.knowledgeSummary) {
              // Cap individual summaries at 5000 chars to prevent overflow
              const summary = d.knowledgeSummary.length > 5000 ? d.knowledgeSummary.slice(0, 5000) + "..." : d.knowledgeSummary;
              relevantDocs.push(`- ${d.title} (${d.code})${d.updatedLabel ? ` — Updated ${d.updatedLabel}` : ""}\n  Knowledge:\n${summary}`);
            } else {
              otherDocTitles.push(`- ${d.title} (${d.code})${d.updatedLabel ? ` — Updated ${d.updatedLabel}` : ""}`);
            }
          }
          
          techLibraryContext = `\n\n--- TECHNICAL LIBRARY DOCUMENTS ---\nThe following documents are available in the Technical Library (📖 icon in chat header).`;
          if (relevantDocs.length > 0) {
            techLibraryContext += `\n\nRELEVANT KNOWLEDGE FOR THIS QUESTION:\n${relevantDocs.join("\n\n")}`;
          }
          if (otherDocTitles.length > 0) {
            techLibraryContext += `\n\nOther available documents:\n${otherDocTitles.join("\n")}`;
          }
        }

        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: `You are **Engini**, the technical knowledge specialist for Altaspan. You wear a hard hat and know everything about Altaspan products, engineering, and construction.

You can answer questions about:
1. PRICING — markups, regional rates, thresholds, and product costs
2. ENGINEERING — beam spans, roof sheeting spans, post selection, footings, bolt capacities, rafter strengthening, wind classes, and pressure coefficients
3. COMPONENTS — quantities, specifications, materials
4. ASSEMBLY & DIAGRAMS — connection methods, installation guidance, and technical diagrams
5. BUILDING STANDARDS — tolerances, defect assessments, workmanship standards, compliance (from the Building Standards Guide)

IMPORTANT RULES:
- Always cite the specific table/section when answering engineering questions.
- If a configuration is shown as N/A, advise that specific engineering is required.
- When referencing technical documents, tell the user they are available for viewing in the Technical Library (click the 📖 book icon in the chat header). Do NOT tell users to consult external resources — all referenced documents are available within this app.
- When questions involve structural details, connections, or assembly methods, include relevant ASCII diagrams or text-based illustrations to visually explain the concept. For example, show beam-to-post connections, bracket placements, rafter strengthening layouts, or roof profile cross-sections using simple text diagrams.
- Format diagrams in markdown code blocks for clarity.
- Always be practical and specific — give actual values from the data, not generic advice.
- When discussing brackets or connections, reference the bracket code (e.g. EXT-STD, PC-ALU, BP-STD) and tell the user they can view product images in the Plan Converter's Reference tab.
- For building standards and tolerance questions, follow the Building Standards Guide knowledge format: provide a best-effort answer, cite guide sections, note caveats, and end with the disclaimer.

--- BRACKET & CONNECTION CODES ---
Connection Types: FLY (Flyover), BCH (Back Channel), CRK (Cranked Post), FSS (Free Standing), GBL (Gable), POP (Pop-up), WFX (Wall Fixing), SPL (Splice)
Bracket Codes: EXT-STD (Extenda Standard), EXT-HD (Extenda Heavy Duty), GBL-100/150 (Gable Bracket), POP-150/200/250 (Pop-up), PC-ALU (Post Connector Aluminium), PC-STL (Post Cap Steel), BP-STD (Base Plate Standard 150x150x6), BP-HD (Base Plate Heavy Duty 200x200x10), CRK-STD (Cranked Standard), CRK-90 (90 Degree Cranked), G1-RDG/G2-RDG (Ridge Extrusions), SPL-INT (Internal Splice), BCH-STD (Back Channel Standard), BCH-B2B (Back to Back Channel), BM-SAD (Beam Saddle), KB-STD (Knee Brace 600mm), KB-LG (Knee Brace 900mm), PF-STD (Portal Frame Kit), RF-STR (Rafter Strengthening), WB-STD (Wall Bracket Standard), WB-HD (Wall Bracket Heavy Duty)

For cyclonic areas using Altaspan profiles (not Versiclad): C1 uses N3 data, C2 uses N4 data, C3/C4 require specific engineering.
Versiclad insulated panels have native cyclonic data.

--- PRICING DATA ---
${dataContext}

--- ENGINEERING DATA (RB100) ---
${RB100_SYSTEM_CONTEXT}

--- CONSTRUCTION & COMPONENT KNOWLEDGE ---
${SPANLINE_TECHNICAL_PROMPT}${techLibraryContext}${aiKnowledgeContext}${aiCorrectionsContext}` },
              ...aiFewShotMessages,
              { role: "user", content: input.question },
            ],
          });

          const answer = typeof result.choices[0]?.message?.content === "string"
            ? result.choices[0].message.content : "Unable to answer.";
          return { answer };
        } catch (err: any) {
          console.error("[Engini] LLM error:", err.message);
          // If the error is likely a token limit issue, retry with minimal context
          if (err.message?.includes("too long") || err.message?.includes("token") || err.message?.includes("413") || err.message?.includes("400")) {
            try {
              const fallbackResult = await invokeLLM({
                messages: [
                  { role: "system", content: `You are Engini, a technical knowledge specialist for Altaspan (patio/outdoor structure builder). Answer the user's question using your general knowledge. If you need specific data from the Technical Library, tell the user to check the 📖 icon.${techLibraryContext}` },
                  { role: "user", content: input.question },
                ],
              });
              const fallbackAnswer = typeof fallbackResult.choices[0]?.message?.content === "string"
                ? fallbackResult.choices[0].message.content : "Unable to answer.";
              return { answer: fallbackAnswer };
            } catch (fallbackErr: any) {
              console.error("[Engini] Fallback LLM error:", fallbackErr.message);
              return { answer: enginiProviderFailure(fallbackErr) };
            }
          }
          return { answer: enginiProviderFailure(err) };
        }
      }),
  }),

  // ─── Email ─────────────────────────────────────────────────────────────────
  email: router({
    sendProposal: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        to: z.string().email(),
        subject: z.string().optional(),
        coverMessage: z.string().optional(),
        pdfBase64: z.string(),
        fromName: z.string().optional(),
        renderImageUrl: z.string().url().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const quote = await db.getQuoteById(input.quoteId, tenantId, quoteScopeOptionsForContext(ctx));
        if (!quote) throw new Error("Quote not found");
        if (!canAccessQuoteTenantRecord(ctx, quote)) throw new Error("Access denied");
        if (!canAccessQuote(quoteAccessUserForContext(ctx), quote)) {
          throw new Error("Access denied");
        }
        // If render URL provided, append to cover message
        let coverMessage = input.coverMessage;
        if (input.renderImageUrl) {
          coverMessage = (coverMessage || "") + `\n\nView your 3D patio visualisation: ${input.renderImageUrl}`;
        }
        const result = await sendProposalEmail({
          to: input.to,
          clientName: quote.clientName,
          quoteNumber: quote.quoteNumber || `Q-${quote.id}`,
          subject: input.subject,
          coverMessage,
          pdfBase64: input.pdfBase64,
          fromName: input.fromName,
        });
        if (result.success) {
          await db.updateQuoteProposalSent(input.quoteId, input.to, tenantId, quoteScopeOptionsForContext(ctx));
          // Auto-set validUntil to 30 days from now if not already set
          if (!quote.validUntil) {
            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 30);
            await db.updateQuote(input.quoteId, { validUntil } as any, tenantId, quoteScopeOptionsForContext(ctx));
          }
          await guardedSend(
            { settingKey: "notify_proposal_sent", channel: "owner_notify", recipientType: "owner", title: "Proposal Sent" },
            () => notifyOwner({ title: "Proposal Sent", content: `Proposal for ${quote.clientName} (${quote.quoteNumber}) sent to ${input.to} by ${ctx.user.name}` })
          );
        }
        return result;
      }),
    sendCompiledQuote: protectedProcedure
      .input(z.object({
        clientId: z.number(),
        clientName: z.string(),
        to: z.string().email(),
        subject: z.string().optional(),
        coverMessage: z.string().optional(),
        pdfBase64: z.string(),
        fromName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await sendProposalEmail({
          to: input.to,
          clientName: input.clientName,
          quoteNumber: `Compiled-${input.clientId}`,
          subject: input.subject || `Your Quote - ${input.clientName}`,
          coverMessage: input.coverMessage,
          pdfBase64: input.pdfBase64,
          fromName: input.fromName,
        });
        if (result.success) {
          await guardedSend(
            { settingKey: "notify_proposal_sent", channel: "owner_notify", recipientType: "owner", title: "Compiled Quote Sent" },
            () => notifyOwner({ title: "Compiled Quote Sent", content: `Compiled quote for ${input.clientName} sent to ${input.to} by ${ctx.user.name}` })
          );
        }
        return result;
      }),
  }),

  // ─── Analytics ───────────────────────────────────────────────────────────
  analytics: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      const userId = isAdminRole(ctx.user.role) ? undefined : ctx.user.id;
      return db.getAnalytics(userId);
    }),
  }),

  // ─── Deck Quoting ─────────────────────────────────────────────────────────
  deck: deckRouter,

  // ─── Eclipse Opening Roof ──────────────────────────────────────────────────
  eclipseRoof: eclipseRouter,

  // ─── Shared Clients ─────────────────────────────────────────────────────────

  // ─── Spec-to-Items Engine ──────────────────────────────────────────────────
  specItems: specItemsRouter,
  checklistItems: checklistItemsRouter,
  crm: crmRouter,
  designAdvisors: designAdvisorsRouter,
  vocphone: vocphoneRouter,
  userManagement: userManagementRouter,
  globalSettings: globalSettingsRouter,
  branches: branchesRouter,
  territory: territoryRouter,
  nylas: nylasRouter,
  daPortal: daPortalRouter,
  signwell: signwellRouter,
  emailImages: emailImagesRouter,
  construction: constructionRouter,
  constructionSchedule: constructionScheduleRouter,
  constructionKanban: constructionKanbanRouter,
  constructionClients: constructionClientsRouter,
  constructionFinancial: constructionFinancialRouter,
  constructionDocs: constructionDocsRouter,
  siteInductions: siteInductionRouter,
  whs: whsRouter,
  equipment: equipmentRouter,
  people: peopleRouter,
  xero: xeroRouter,
  xeroProjects: xeroProjectsRouter,
  portal: portalRouter,
  tradePortal: tradePortalRouter,
  adminPortal: adminPortalRouter,
  adminTradePortal: adminTradePortalRouter,
  tradeInvoice: tradeInvoiceRouter,
  projectPlanTemplates: projectPlanTemplatesRouter,
  subscriptionManagement: subscriptionManagementRouter,
  xeroClientImport: xeroClientImportRouter,
  clientActivities: clientActivitiesRouter,
  xeroGL: xeroGLRouter,
  xeroAccounting: xeroAccountingRouter,
  xeroCostImport: xeroCostImportRouter,
  xeroBudgetImport: xeroBudgetImportRouter,
  inbox: inboxRouter,
  patioPlanner: patioRouter,
  patioRender: patioRenderRouter,
  quoteRender: quoteRenderRouter,
  renderCost: renderCostRouter,
  subcontract: subcontractRouter,
  gsheetImport: gsheetImportRouter,
  xeroSupplierSync: xeroSupplierSyncRouter,
  plans: plansRouter,
  proposals: proposalRouter,
  proposalLibrary: proposalLibraryRouter,
  securityScreens: securityScreensRouter,
  blinds: blindsRouter,
  reviews: reviewsRouter,
  manufacturing: manufacturingRouter,
  manufacturingData: manufacturingDataRouter,
  manufacturingDispatch: manufacturingDispatchRouter,
  inventory: inventoryRouter,
  stocktake: stocktakeRouter,
  procurement: procurementRouter,
  drivers: driverRouter,

  // ─── Technical Library ──────────────────────────────────────────────────────
  techLibrary: router({
    listAll: adminProcedure.query(async ({ ctx }) => {
      return db.getTechLibraryDocuments(tenantIdFromContext(ctx));
    }),
    listActive: publicProcedure.query(async ({ ctx }) => {
      return db.getActiveTechLibraryDocuments(tenantIdFromContext(ctx));
    }),
    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        url: z.string().min(1),
        updatedLabel: z.string().optional(),
        knowledgeSummary: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.createTechLibraryDocument({
          tenantId: tenantIdFromContext(ctx),
          title: input.title,
          code: input.code,
          description: input.description ?? null,
          url: input.url,
          updatedLabel: input.updatedLabel ?? null,
          knowledgeSummary: input.knowledgeSummary ?? null,
          active: true,
        });
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        url: z.string().min(1).optional(),
        updatedLabel: z.string().nullable().optional(),
        active: z.boolean().optional(),
        knowledgeSummary: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        await db.updateTechLibraryDocument(id, updates, tenantIdFromContext(ctx));
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteTechLibraryDocument(input.id, tenantIdFromContext(ctx));
        return { success: true };
      }),
    updateKnowledge: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const tenantId = tenantIdFromContext(ctx);
        const doc = await db.getTechLibraryDocumentById(input.id, tenantId);
        if (!doc) throw new Error("Document not found");
        // Mark as pending
        await db.updateTechLibraryDocument(input.id, { knowledgeStatus: "pending", knowledgeError: null }, tenantId);
        // Download the PDF from S3 and convert to base64 for inline LLM processing
        let pdfBase64: string | null = null;
        try {
          const storageKey = doc.url.replace(/^\/manus-storage\//, "");
          const pdfBuffer = await storageDownload(storageKey);
          pdfBase64 = pdfBuffer.toString("base64");
          console.log(`[TechLibrary] Downloaded PDF for doc ${doc.id}: ${pdfBuffer.length} bytes`);
        } catch (e: any) {
          const errMsg = `PDF download failed: ${e?.message || String(e)}`;
          console.error(`[TechLibrary] Failed to download PDF for doc ${doc.id}:`, e);
          await db.updateTechLibraryDocument(input.id, { knowledgeStatus: "failed", knowledgeError: errMsg }, tenantId);
          throw new Error(errMsg);
        }
        try {
          // Build message content - include PDF as inline base64 data
          const userContent: any[] = [
            { type: "text", text: `Document: ${doc.title} (${doc.code})\nDescription: ${doc.description || 'N/A'}\n\nPlease read this PDF document and generate a comprehensive knowledge summary (max 800 words) of the key technical information. Include:\n- Specific measurements, spans, capacities, and load ratings\n- Material specifications and product codes\n- Installation procedures and connection methods\n- Engineering data tables (reproduce key values)\n- Any formulas or calculation methods\n- Wind class ratings and limitations\nFocus on extractable facts and data that would help answer engineering questions. Output plain text only.` },
          ];
          if (pdfBase64) {
            userContent.push({ type: "file", file: { filename: `${doc.code}.pdf`, file_data: `data:application/pdf;base64,${pdfBase64}` } } as any);
          }
          const result = await invokeLLM({
            messages: [
              { role: "system", content: "You are a technical documentation specialist for Altaspan/Spanline outdoor structures. Extract and summarize ALL key technical data from the provided PDF document. Include specific numbers, measurements, span tables, load ratings, product codes, and installation details. Be thorough — this summary will be used by an AI assistant to answer engineering questions without access to the original PDF." },
              { role: "user", content: userContent },
            ],
          });
          const summary = typeof result.choices[0]?.message?.content === "string"
            ? result.choices[0].message.content : "Unable to generate summary.";
          await db.updateTechLibraryDocument(input.id, { knowledgeSummary: summary, knowledgeStatus: "success", knowledgeError: null }, tenantId);
          return { success: true, summary };
        } catch (e: any) {
          const errMsg = `LLM processing failed: ${e?.message || String(e)}`;
          await db.updateTechLibraryDocument(input.id, { knowledgeStatus: "failed", knowledgeError: errMsg }, tenantId);
          throw new Error(errMsg);
        }
      }),
    updateAllKnowledge: adminProcedure
      .mutation(async ({ ctx }) => {
        const tenantId = tenantIdFromContext(ctx);
        const docs = await db.getActiveTechLibraryDocuments(tenantId);
        let updated = 0;
        const errors: { docId: number; title: string; error: string }[] = [];
        for (const doc of docs) {
          // Mark as pending
          await db.updateTechLibraryDocument(doc.id, { knowledgeStatus: "pending", knowledgeError: null }, tenantId);
          try {
            // Download PDF from S3 and convert to base64
            let pdfBase64: string | null = null;
            try {
              const storageKey = doc.url.replace(/^\/manus-storage\//, "");
              const pdfBuffer = await storageDownload(storageKey);
              pdfBase64 = pdfBuffer.toString("base64");
              console.log(`[TechLibrary] Downloaded PDF for doc ${doc.id} (${doc.code}): ${pdfBuffer.length} bytes`);
            } catch (e: any) {
              const errMsg = `PDF download failed: ${e?.message || String(e)}`;
              console.error(`[TechLibrary] Failed to download PDF for doc ${doc.id}:`, e);
              await db.updateTechLibraryDocument(doc.id, { knowledgeStatus: "failed", knowledgeError: errMsg }, tenantId);
              errors.push({ docId: doc.id, title: doc.title, error: errMsg });
              continue; // Skip to next doc — can't process without PDF
            }
            const userContent: any[] = [
              { type: "text", text: `Document: ${doc.title} (${doc.code})\nDescription: ${doc.description || 'N/A'}\n\nPlease read this PDF document and generate a comprehensive knowledge summary (max 800 words) of the key technical information. Include specific measurements, spans, capacities, load ratings, material specs, product codes, installation procedures, connection methods, engineering data tables, formulas, wind class ratings and limitations. Focus on extractable facts and data. Output plain text only.` },
            ];
            if (pdfBase64) {
              userContent.push({ type: "file", file: { filename: `${doc.code}.pdf`, file_data: `data:application/pdf;base64,${pdfBase64}` } } as any);
            }
            const result = await invokeLLM({
              messages: [
                { role: "system", content: "You are a technical documentation specialist for Altaspan/Spanline outdoor structures. Extract and summarize ALL key technical data from the provided PDF document. Include specific numbers, measurements, span tables, load ratings, product codes, and installation details. Be thorough \u2014 this summary will be used by an AI assistant to answer engineering questions without access to the original PDF." },
                { role: "user", content: userContent },
              ],
            });
            const summary = typeof result.choices[0]?.message?.content === "string"
              ? result.choices[0].message.content : "Unable to generate summary.";
            await db.updateTechLibraryDocument(doc.id, { knowledgeSummary: summary, knowledgeStatus: "success", knowledgeError: null }, tenantId);
            updated++;
          } catch (e: any) {
            const errMsg = e instanceof Error ? e.message : String(e);
            await db.updateTechLibraryDocument(doc.id, { knowledgeStatus: "failed", knowledgeError: errMsg }, tenantId);
            errors.push({ docId: doc.id, title: doc.title, error: errMsg });
            console.error(`Failed to update knowledge for doc ${doc.id}:`, e);
          }
        }
        return { success: true, updated, total: docs.length, failed: errors.length, errors: errors.length > 0 ? errors : undefined };
      }),
  }),

  // ─── User Settings (synced across devices) ──────────────────────────────────────────────
  userSettings: router({
    get: tenantProcedure.query(async ({ ctx }) => {
      const userSettings = await db.getUserSettings(ctx.user.id);
      const tenantBranding = await db.getTenantBrandingSettings(ctx.tenant?.id ?? null);
      if (!ctx.tenant?.id && !tenantBranding) return userSettings;
      return {
        ...(userSettings ?? {}),
        companyDetails: tenantBranding?.companyDetails ?? (!ctx.tenant?.id ? userSettings?.companyDetails : null) ?? null,
        customLogoUrl: tenantBranding?.customLogoUrl ?? (!ctx.tenant?.id ? userSettings?.customLogoUrl : null) ?? null,
        appIconUrl: tenantBranding?.appIconUrl ?? (!ctx.tenant?.id ? userSettings?.appIconUrl : null) ?? null,
        faviconUrl: tenantBranding?.faviconUrl ?? (!ctx.tenant?.id ? userSettings?.faviconUrl : null) ?? null,
        companyTheme: tenantBranding?.companyTheme ?? (!ctx.tenant?.id ? userSettings?.companyTheme : null) ?? db.DEFAULT_ALTASPAN_COMPANY_THEME,
      };
    }),
    save: tenantProcedure
      .input(z.object({
        themeMode: z.string().optional(),
        colorScheme: z.string().optional(),
        customLogoUrl: z.string().nullable().optional(),
        appIconUrl: z.string().nullable().optional(),
        faviconUrl: z.string().nullable().optional(),
        companyDetails: z.any().optional(),
        proposalText: z.any().optional(),
        companyTheme: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const normalizedInput: typeof input = { ...input };
        const tenantId = ctx.tenant?.id ?? null;

        const brandingPatch: Record<string, any> = {};
        for (const key of ["customLogoUrl", "appIconUrl", "faviconUrl"] as BrandingAssetKind[]) {
          if (Object.prototype.hasOwnProperty.call(input, key)) {
            const persistedUrl = await persistBrandingAsset(tenantId, key, input[key]);
            normalizedInput[key] = persistedUrl as any;
            brandingPatch[key] = persistedUrl;
            brandingPatch[BRANDING_ASSET_META_KEYS[key]] = {
              updatedAt: new Date().toISOString(),
              storage: persistedUrl?.startsWith("data:") ? "database" : "r2",
            };
          }
        }
        if (Object.prototype.hasOwnProperty.call(input, "companyTheme")) {
          brandingPatch.companyTheme = input.companyTheme;
        }

        if (tenantId && (
          Object.prototype.hasOwnProperty.call(input, "companyDetails") ||
          Object.keys(brandingPatch).length > 0
        )) {
          await db.upsertTenantBrandingSettings(tenantId, {
            ...(Object.prototype.hasOwnProperty.call(input, "companyDetails") ? { companyDetails: input.companyDetails } : {}),
            ...(Object.keys(brandingPatch).length > 0 ? { branding: brandingPatch } : {}),
          });
        }

        return db.upsertUserSettings(ctx.user.id, normalizedInput);
      }),
    getCompanyTheme: publicProcedure.query(async ({ ctx }) => {
      return db.getCompanyTheme(ctx.tenant?.id ?? null);
    }),
  }),
  // ─── Push Notifications ────────────────────────────────────────────────────
  push: router({
    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string().min(1),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const { subscribePush } = await import("./push");
        await subscribePush({
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        });
        return { success: true };
      }),
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const { unsubscribePush } = await import("./push");
        await unsubscribePush(input.endpoint);
        return { success: true };
      }),
    getVapidKey: publicProcedure.query(() => {
      return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "" };
    }),
  }),
  // ─── Suppliers ─────────────────────────────────────────────────────────────
  suppliers: supplierRouter,
  supplierCategories: supplierCategoryRouter,
  supplierFeedback: supplierFeedbackRouter,
  // ─── Smartshop / Construction Orders ────────────────────────────────────
  smartshop: smartshopRouter,
  planConverter: planConverterRouter,
  weather: weatherRouter,
  sectionTemplates: sectionTemplatesRouter,
  profile: profileRouter,
  crmDropdowns: crmDropdownRouter,
  calendarViews: calendarViewsRouter,
  support: supportRouter,
  invitations: invitationsRouter,
  rainDay: rainDayRouter,
  approvals: approvalRouter,
  daTracker: daTrackerRouter,
  competitorIntel: competitorIntelRouter,
  nswDa: nswDaRouter,
  aiLearning: aiLearningRouter,
  // ─── Global Search ─────────────────────────────────────────────────────────────────────
  globalSearch: tenantProcedure
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ ctx, input }) => {
      return db.globalSearch(input.query, ctx.tenant.id);
    }),
});

export type AppRouter = typeof appRouter;
