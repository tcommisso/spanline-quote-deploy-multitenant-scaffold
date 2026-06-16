import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
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
import { eq } from "drizzle-orm";

const ratingSchema = z.number().int().min(1).max(5);

export const supplierFeedbackRouter = router({
  list: protectedProcedure
    .input(z.object({
      supplierId: z.number().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ input }) => {
      return listFeedback({
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
        const summary = await getSupplierRatingsSummary(input.supplierId);
        if (summary && summary.avgOverall < threshold) {
          const db = await getDb();
          const supplierRow = db ? await db.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1) : [];
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateFeedback(id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return deleteFeedback(input.id);
    }),

  /** Get aggregated ratings for a single supplier */
  supplierSummary: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input }) => {
      return getSupplierRatingsSummary(input.supplierId);
    }),

  /** Get all supplier ratings for directory display */
  allRatings: protectedProcedure.query(async () => {
    return getAllSupplierRatings();
  }),

  /** Check if user already submitted feedback for a PO */
  hasFeedbackForPo: protectedProcedure
    .input(z.object({ poId: z.number() }))
    .query(async ({ ctx, input }) => {
      return hasFeedbackForPo(ctx.user.id, input.poId);
    }),

  /** Get scorecard data for a supplier */
  scorecard: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input }) => {
      return getSupplierScorecard(input.supplierId);
    }),

  /** Generate scorecard PDF for a supplier */
  scorecardPdf: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }) => {
      const data = await getSupplierScorecard(input.supplierId);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "No feedback data found for this supplier" });
      const pdfBuffer = await generateScorecardPdf(data);
      // Return as base64 string for frontend download
      return { pdf: pdfBuffer.toString("base64"), filename: `scorecard-${data.supplier.name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf` };
    }),
});
