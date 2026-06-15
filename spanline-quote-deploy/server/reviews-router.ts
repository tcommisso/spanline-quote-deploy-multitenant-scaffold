import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as reviewsDb from "./reviews-db";

export const reviewsRouter = router({
  // ─── Climbo Accounts CRUD (admin only) ─────────────────────────────────────
  climboAccounts: router({
    list: protectedProcedure.query(async () => {
      return reviewsDb.listClimboAccounts();
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return reviewsDb.getClimboAccount(input.id);
    }),

    create: adminProcedure.input(z.object({
      name: z.string().min(1),
      region: z.string().optional(),
      apiKey: z.string().optional(),
      accountId: z.string().optional(),
      webhookUrl: z.string().optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      return reviewsDb.createClimboAccount(input);
    }),

    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      region: z.string().optional(),
      apiKey: z.string().optional(),
      accountId: z.string().optional(),
      webhookUrl: z.string().optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await reviewsDb.updateClimboAccount(id, data);
    }),

    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await reviewsDb.deleteClimboAccount(input.id);
    }),
  }),

  // ─── Google Reviews ────────────────────────────────────────────────────────
  list: protectedProcedure.input(z.object({
    leadId: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })).query(async ({ input }) => {
    if (input.leadId) {
      return { rows: await reviewsDb.listReviewsByLead(input.leadId), total: 0 };
    }
    return reviewsDb.listAllReviews({ limit: input.limit, offset: input.offset });
  }),

  stats: protectedProcedure.query(async () => {
    return reviewsDb.getReviewStats();
  }),

  // ─── Request Review ────────────────────────────────────────────────────────
  requestReview: protectedProcedure.input(z.object({
    leadId: z.number(),
    clientName: z.string(),
    clientEmail: z.string(),
    clientPhone: z.string().optional(),
    siteAddress: z.string().optional(),
    climboAccountId: z.number(),
  })).mutation(async ({ input }) => {
    const account = await reviewsDb.getClimboAccount(input.climboAccountId);
    if (!account || !account.webhookUrl) {
      throw new Error("Climbo account not found or no webhook URL configured");
    }
    const result = await reviewsDb.fireReviewRequestWebhook(account.webhookUrl, {
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone || "",
      siteAddress: input.siteAddress || "",
      leadId: input.leadId,
      region: account.region || undefined,
    });
    if (!result.ok) {
      throw new Error(`Webhook failed with status ${result.status}`);
    }
    return { sent: true };
  }),

  // Manual review creation (for admin to add reviews manually)
  create: adminProcedure.input(z.object({
    leadId: z.number().optional(),
    climboAccountId: z.number().optional(),
    reviewerName: z.string().optional(),
    rating: z.number().min(1).max(5),
    reviewText: z.string().optional(),
    reviewDate: z.string().optional(),
    locationName: z.string().optional(),
    source: z.string().optional(),
  })).mutation(async ({ input }) => {
    return reviewsDb.createReview({
      leadId: input.leadId ?? null,
      climboAccountId: input.climboAccountId ?? null,
      reviewerName: input.reviewerName ?? null,
      rating: input.rating,
      reviewText: input.reviewText ?? null,
      reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
      googleReviewId: null,
      locationName: input.locationName ?? null,
      replyText: null,
      replyDate: null,
      source: input.source ?? "manual",
      rawPayload: null,
    });
  }),
});
