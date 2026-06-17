import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as reviewsDb from "./reviews-db";

export const reviewsRouter = router({
  // ─── Climbo Accounts CRUD (admin only) ─────────────────────────────────────
  climboAccounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return reviewsDb.listClimboAccounts(ctx.tenant!.id);
    }),

    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
      return reviewsDb.getClimboAccount(input.id, ctx.tenant!.id);
    }),

    create: adminProcedure.input(z.object({
      name: z.string().min(1),
      region: z.string().optional(),
      apiKey: z.string().optional(),
      accountId: z.string().optional(),
      webhookUrl: z.string().optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      return reviewsDb.createClimboAccount(input, ctx.tenant!.id);
    }),

    update: adminProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      region: z.string().optional(),
      apiKey: z.string().optional(),
      accountId: z.string().optional(),
      webhookUrl: z.string().optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await reviewsDb.updateClimboAccount(id, data, ctx.tenant!.id);
    }),

    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      await reviewsDb.deleteClimboAccount(input.id, ctx.tenant!.id);
    }),
  }),

  // ─── Google Reviews ────────────────────────────────────────────────────────
  list: protectedProcedure.input(z.object({
    leadId: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })).query(async ({ ctx, input }) => {
    if (input.leadId) {
      return { rows: await reviewsDb.listReviewsByLead(input.leadId, ctx.tenant!.id), total: 0 };
    }
    return reviewsDb.listAllReviews({ limit: input.limit, offset: input.offset }, ctx.tenant!.id);
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    return reviewsDb.getReviewStats(ctx.tenant!.id);
  }),

  // ─── Request Review ────────────────────────────────────────────────────────
  requestReview: protectedProcedure.input(z.object({
    leadId: z.number(),
    clientName: z.string(),
    clientEmail: z.string(),
    clientPhone: z.string().optional(),
    siteAddress: z.string().optional(),
    climboAccountId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const account = await reviewsDb.getClimboAccount(input.climboAccountId, ctx.tenant!.id);
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
  })).mutation(async ({ ctx, input }) => {
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
    }, ctx.tenant!.id);
  }),
});
