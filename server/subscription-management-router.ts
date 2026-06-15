import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { cpcSubscriptions, cpcPlans, portalAccess, constructionJobs } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { getStripe } from "./stripe";

// ─── Subscription Management Admin Router ──────────────────────────────────

export const subscriptionManagementRouter = router({

  /** List all CPC subscriptions with joined plan + client info from DB */
  listSubscriptions: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const subs = await db
      .select({
        id: cpcSubscriptions.id,
        status: cpcSubscriptions.status,
        structureSize: cpcSubscriptions.structureSize,
        structureAreaM2: cpcSubscriptions.structureAreaM2,
        stripeSubscriptionId: cpcSubscriptions.stripeSubscriptionId,
        stripeCustomerId: cpcSubscriptions.stripeCustomerId,
        nextServiceDate: cpcSubscriptions.nextServiceDate,
        startDate: cpcSubscriptions.startDate,
        cancelledAt: cpcSubscriptions.cancelledAt,
        createdAt: cpcSubscriptions.createdAt,
        // Plan info
        planName: cpcPlans.name,
        planFrequency: cpcPlans.frequency,
        priceSmall: cpcPlans.priceSmall,
        priceMedium: cpcPlans.priceMedium,
        priceLarge: cpcPlans.priceLarge,
        // Client info from portal access
        clientName: portalAccess.clientName,
        clientEmail: portalAccess.clientEmail,
        clientPhone: portalAccess.clientPhone,
        // Job info
        jobClientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
      })
      .from(cpcSubscriptions)
      .leftJoin(cpcPlans, eq(cpcSubscriptions.planId, cpcPlans.id))
      .leftJoin(portalAccess, eq(cpcSubscriptions.portalAccessId, portalAccess.id))
      .leftJoin(constructionJobs, eq(cpcSubscriptions.constructionJobId, constructionJobs.id))
      .orderBy(desc(cpcSubscriptions.createdAt));

    // Enrich with Stripe data where available
    const enriched = await Promise.all(
      subs.map(async (sub) => {
        let stripeStatus: string | null = null;
        let currentPeriodEnd: number | null = null;
        let cancelAtPeriodEnd = false;
        let amountPaid: number | null = null;

        if (sub.stripeSubscriptionId) {
          try {
            const stripe = getStripe();
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
            stripeStatus = stripeSub.status;
            // Get period end from the first subscription item
            const firstItem = stripeSub.items?.data?.[0];
            if (firstItem && "current_period_end" in firstItem) {
              currentPeriodEnd = (firstItem as any).current_period_end * 1000;
            }
            cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
            // Get the price amount from the first item
            if (stripeSub.items?.data?.[0]?.price?.unit_amount) {
              amountPaid = stripeSub.items.data[0].price.unit_amount;
            }
          } catch {
            // Stripe API might fail for test/deleted subscriptions — use DB data
          }
        }

        // Calculate the price from DB if Stripe didn't provide it
        if (amountPaid === null && sub.priceSmall) {
          const priceStr = sub.structureSize === "small"
            ? sub.priceSmall
            : sub.structureSize === "medium"
              ? sub.priceMedium
              : sub.priceLarge;
          amountPaid = priceStr ? Math.round(parseFloat(priceStr) * 100) : null;
        }

        return {
          id: sub.id,
          status: sub.status,
          stripeStatus,
          structureSize: sub.structureSize,
          structureAreaM2: sub.structureAreaM2,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          stripeCustomerId: sub.stripeCustomerId,
          nextServiceDate: sub.nextServiceDate,
          startDate: sub.startDate,
          cancelledAt: sub.cancelledAt,
          createdAt: sub.createdAt,
          currentPeriodEnd,
          cancelAtPeriodEnd,
          amountPaid,
          planName: sub.planName || "Unknown Plan",
          planFrequency: sub.planFrequency || "annual",
          clientName: sub.clientName || sub.jobClientName || "Unknown",
          clientEmail: sub.clientEmail || "",
          clientPhone: sub.clientPhone || "",
          siteAddress: sub.siteAddress || "",
        };
      })
    );

    return enriched;
  }),

  /** Fetch payment history / invoices for a specific subscription from Stripe */
  getPaymentHistory: adminProcedure
    .input(z.object({
      subscriptionId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get the subscription to find the Stripe IDs
      const [sub] = await db
        .select()
        .from(cpcSubscriptions)
        .where(eq(cpcSubscriptions.id, input.subscriptionId));

      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });

      const invoices: Array<{
        id: string;
        number: string | null;
        status: string | null;
        amountDue: number;
        amountPaid: number;
        currency: string;
        created: number;
        periodStart: number;
        periodEnd: number;
        hostedInvoiceUrl: string | null;
        pdfUrl: string | null;
      }> = [];

      if (sub.stripeCustomerId) {
        try {
          const stripe = getStripe();
          const stripeInvoices = await stripe.invoices.list({
            customer: sub.stripeCustomerId,
            limit: 50,
          });

          for (const inv of stripeInvoices.data) {
            invoices.push({
              id: inv.id,
              number: inv.number,
              status: inv.status,
              amountDue: inv.amount_due,
              amountPaid: inv.amount_paid,
              currency: inv.currency,
              created: inv.created * 1000,
              periodStart: inv.period_start * 1000,
              periodEnd: inv.period_end * 1000,
              hostedInvoiceUrl: inv.hosted_invoice_url || null,
              pdfUrl: inv.invoice_pdf || null,
            });
          }
        } catch {
          // Stripe API might fail — return empty
        }
      }

      return {
        subscriptionId: sub.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        stripeCustomerId: sub.stripeCustomerId,
        invoices,
      };
    }),

  /** Get subscription stats summary */
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const allSubs = await db
      .select({
        status: cpcSubscriptions.status,
        structureSize: cpcSubscriptions.structureSize,
        priceSmall: cpcPlans.priceSmall,
        priceMedium: cpcPlans.priceMedium,
        priceLarge: cpcPlans.priceLarge,
      })
      .from(cpcSubscriptions)
      .leftJoin(cpcPlans, eq(cpcSubscriptions.planId, cpcPlans.id));

    let totalActive = 0;
    let totalCancelled = 0;
    let totalPaused = 0;
    let totalExpired = 0;
    let annualRevenue = 0;

    for (const sub of allSubs) {
      switch (sub.status) {
        case "active": totalActive++; break;
        case "cancelled": totalCancelled++; break;
        case "paused": totalPaused++; break;
        case "expired": totalExpired++; break;
      }

      if (sub.status === "active" && sub.priceSmall) {
        const priceStr = sub.structureSize === "small"
          ? sub.priceSmall
          : sub.structureSize === "medium"
            ? sub.priceMedium
            : sub.priceLarge;
        if (priceStr) {
          annualRevenue += parseFloat(priceStr);
        }
      }
    }

    return {
      totalActive,
      totalCancelled,
      totalPaused,
      totalExpired,
      totalSubscriptions: allSubs.length,
      annualRevenue,
    };
  }),
});
