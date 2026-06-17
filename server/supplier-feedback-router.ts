import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { z } from "zod";
import {
  listFeedback,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  getSupplierRatingsSummary,
  getAllSupplierRatings,
  hasFeedbackForPo,
} from "./supplier-feedback-db";
import { getSupplierScorecard } from "./supplier-scorecard-db";
import { generateScorecardPdf } from "./supplier-scorecard-pdf";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "./_core/notification";
import { getMasterDataValue, getDb } from "./db";
import { suppliers } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { appendTenantScope } from "./_core/tenant-scope";

const ratingSchema = z.number().int().min(1).max(5);

export const supplierFeedbackRouter = router({
  list: protectedProcedure
    .input(z.object({
      supplierId: z.number().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listFeedback({
        tenantId: ctx.tenant!.id,
        supplierId: input?.supplierId,
        limit: input?.limit,
        offset: input?.offset,
      });
    }),

  create: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      timeliness: ratingSchema,
      quality: ratingSchema,
      communication: ratingSchema,
      pricing: ratingSchema,
      notes: z.string().optional(),
      poId: z.number().optional(),
      jobId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await createFeedback({
        tenantId: ctx.tenant!.id,
        supplierId: input.supplierId,
        userId: ctx.user.id,
        timeliness: input.timeliness,
        quality: input.quality,
        communication: input.communication,
        pricing: input.pricing,
        notes: input.notes,
        poId: input.poId,
        jobId: input.jobId,
      });

      // Check if supplier avg dropped below threshold and notify admin
      try {
        const thresholdStr = await getMasterDataValue("notification", "supplier_alert_threshold", ctx.tenant?.id ?? null);
        const threshold = parseFloat(thresholdStr || "3.0");
        const summary = await getSupplierRatingsSummary(input.supplierId, ctx.tenant!.id);
        if (summary && summary.avgOverall < threshold) {
          const db = await getDb();
          const supplierConditions = [eq(suppliers.id, input.supplierId)];
          appendTenantScope(supplierConditions, suppliers.tenantId, ctx.tenant!.id);
          const supplierRow = db ? await db.select().from(suppliers).where(and(...supplierConditions)).limit(1) : [];
          const supplierName = supplierRow[0]?.name || `Supplier #${input.supplierId}`;
          await notifyOwner({
            title: `⚠️ Supplier Alert: ${supplierName} below ${threshold} stars`,
            content: `${supplierName} now has an average rating of ${summary.avgOverall.toFixed(1)} stars (${summary.totalReviews} reviews). This is below your configured threshold of ${threshold}. Review submitted by user #${ctx.user.id}.`,
          });
        }
      } catch (e) {
        // Non-blocking — don't fail the review creation if notification fails
        console.error("[SupplierFeedback] Notification check failed:", e);
      }

      return result;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      timeliness: ratingSchema.optional(),
      quality: ratingSchema.optional(),
      communication: ratingSchema.optional(),
      pricing: ratingSchema.optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateFeedback(id, { ...data, tenantId: ctx.tenant!.id });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return deleteFeedback(input.id, ctx.tenant!.id);
    }),

  /** Get aggregated ratings for a single supplier */
  supplierSummary: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getSupplierRatingsSummary(input.supplierId, ctx.tenant!.id);
    }),

  /** Get all supplier ratings for directory display */
  allRatings: protectedProcedure.query(async ({ ctx }) => {
    return getAllSupplierRatings(ctx.tenant!.id);
  }),

  /** Check if user already submitted feedback for a PO */
  hasFeedbackForPo: protectedProcedure
    .input(z.object({ poId: z.number() }))
    .query(async ({ ctx, input }) => {
      return hasFeedbackForPo(ctx.user.id, input.poId, ctx.tenant!.id);
    }),

  /** Get scorecard data for a supplier */
  scorecard: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getSupplierScorecard(input.supplierId, ctx.tenant!.id);
    }),

  /** Generate scorecard PDF for a supplier */
  scorecardPdf: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const data = await getSupplierScorecard(input.supplierId, ctx.tenant!.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "No feedback data found for this supplier" });
      const pdfBuffer = await generateScorecardPdf(data);
      // Return as base64 string for frontend download
      return { pdf: pdfBuffer.toString("base64"), filename: `scorecard-${data.supplier.name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf` };
    }),
});
