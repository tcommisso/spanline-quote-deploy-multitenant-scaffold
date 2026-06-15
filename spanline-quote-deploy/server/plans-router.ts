import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { constructionPlans, constructionPlanComments, portalAccess, constructionJobs, constructionPlanAuditLog } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router, middleware } from "./_core/trpc";
import { storagePut } from "./storage";
import { sendNotificationEmail } from "./email";
import { notifyOwner } from "./_core/notification";
import crypto from "crypto";
import { inArray } from "drizzle-orm";
import { triggerPushPlanSubmitted, triggerPushPlanDecision } from "./push-triggers";

// ─── Audit log helper ─────────────────────────────────────────────────────────
async function logPlanAudit(params: {
  planId: number;
  jobId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  performedBy?: number | null;
  performedByType: "staff" | "client" | "system";
  performedByName?: string | null;
  details?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(constructionPlanAuditLog).values({
    planId: params.planId,
    jobId: params.jobId,
    action: params.action,
    fromStatus: params.fromStatus || null,
    toStatus: params.toStatus || null,
    performedBy: params.performedBy || null,
    performedByType: params.performedByType,
    performedByName: params.performedByName || null,
    details: params.details || null,
  });
}

// ─── Portal middleware (same pattern as portal-router.ts) ────────────────────
const requirePortalAccess = middleware(async ({ ctx, next }) => {
  if (!ctx.portalAccess) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Portal session expired or invalid" });
  }
  return next({ ctx: { ...ctx, portalAccess: ctx.portalAccess } });
});
const protectedPortalProcedure = publicProcedure.use(requirePortalAccess);

export const plansRouter = router({
  // ─── Staff: List plans for a job ───────────────────────────────────────────
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const plans = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.jobId, input.jobId))
        .orderBy(desc(constructionPlans.createdAt));
      return plans;
    }),

  // ─── Staff: Get overdue plans count (submitted_to_client for 7+ days) ──────
  overdueCount: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const overduePlans = await db
        .select({
          id: constructionPlans.id,
          jobId: constructionPlans.jobId,
          title: constructionPlans.title,
          submittedAt: constructionPlans.submittedAt,
        })
        .from(constructionPlans)
        .where(
          and(
            eq(constructionPlans.status, "submitted_to_client"),
            lte(constructionPlans.submittedAt, sevenDaysAgo)
          )
        );
      return { count: overduePlans.length, plans: overduePlans };
    }),
  // ─── Staff: Get plan detail with comments ──────────────────────────────────
  getDetail: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.planId));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      const comments = await db
        .select()
        .from(constructionPlanComments)
        .where(eq(constructionPlanComments.planId, input.planId))
        .orderBy(desc(constructionPlanComments.createdAt));

      return { plan, comments };
    }),

  // ─── Staff: Upload a new plan ──────────────────────────────────────────────
  upload: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `construction-plans/${input.jobId}/${sanitizedName}-${suffix}`;
      const { url } = await storagePut(key, fileBuffer, input.fileType || "application/pdf");

      const [result] = await db.insert(constructionPlans).values({
        jobId: input.jobId,
        title: input.title,
        description: input.description || null,
        category: input.category || null,
        version: 1,
        fileUrl: url,
        fileKey: key,
        fileName: input.fileName,
        fileType: input.fileType || null,
        status: "draft",
        uploadedBy: ctx.user.id,
      });

      await logPlanAudit({
        planId: result.insertId,
        jobId: input.jobId,
        action: "uploaded",
        toStatus: "draft",
        performedBy: ctx.user.id,
        performedByType: "staff",
        performedByName: ctx.user.name || null,
        details: `Plan "${input.title}" uploaded`,
      });

      return { id: result.insertId, url };
    }),

  // ─── Staff: Save thumbnail for a plan (generated client-side) ──────────
  saveThumbnail: protectedProcedure
    .input(z.object({
      planId: z.number(),
      thumbnailBase64: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const thumbBuffer = Buffer.from(input.thumbnailBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const key = `construction-plans/thumbnails/${input.planId}-${suffix}.png`;
      const { url } = await storagePut(key, thumbBuffer, "image/png");
      await db.update(constructionPlans)
        .set({ thumbnailUrl: url })
        .where(eq(constructionPlans.id, input.planId));
      return { thumbnailUrl: url };
    }),

  // ─── Staff: Update plan category ──────────────────────────────────────────
  updateCategory: protectedProcedure
    .input(z.object({
      planId: z.number(),
      category: z.string().max(100).nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(constructionPlans)
        .set({ category: input.category })
        .where(eq(constructionPlans.id, input.planId));
      return { success: true };
    }),

  // ─── Staff: Bulk upload multiple plans at once ────────────────────────
  bulkUpload: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      files: z.array(z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().max(100).optional(),
        fileBase64: z.string(),
        fileName: z.string(),
        fileType: z.string().optional(),
      })).min(1).max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const results: { id: number; title: string; url: string }[] = [];
      for (const file of input.files) {
        const fileBuffer = Buffer.from(file.fileBase64, "base64");
        const suffix = crypto.randomBytes(4).toString("hex");
        const sanitizedName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `construction-plans/${input.jobId}/${sanitizedName}-${suffix}`;
        const { url } = await storagePut(key, fileBuffer, file.fileType || "application/pdf");
        const [result] = await db.insert(constructionPlans).values({
          jobId: input.jobId,
          title: file.title,
          description: file.description || null,
          category: file.category || null,
          version: 1,
          fileUrl: url,
          fileKey: key,
          fileName: file.fileName,
          fileType: file.fileType || null,
          status: "draft",
          uploadedBy: ctx.user.id,
        });
        results.push({ id: result.insertId, title: file.title, url });
      }
      return { uploaded: results.length, plans: results };
    }),

  // ─── Staff: Upload new version of existing plan ────────────────────────────
  uploadNewVersion: protectedProcedure
    .input(z.object({
      parentPlanId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileType: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Get the parent plan
      const [parent] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.parentPlanId));
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Parent plan not found" });

      // Find the latest version number for this plan lineage
      const rootId = parent.parentPlanId || parent.id;
      const allVersions = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.jobId, parent.jobId));
      // Find all plans in this lineage
      const lineage = allVersions.filter((p: any) =>
        p.id === rootId || p.parentPlanId === rootId || p.id === parent.id || p.parentPlanId === parent.id
      );
      const maxVersion = Math.max(...lineage.map((p: any) => p.version), parent.version);

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `construction-plans/${parent.jobId}/${sanitizedName}-${suffix}`;
      const { url } = await storagePut(key, fileBuffer, input.fileType || "application/pdf");

      const [result] = await db.insert(constructionPlans).values({
        jobId: parent.jobId,
        title: parent.title,
        description: input.description || parent.description,
        version: maxVersion + 1,
        parentPlanId: rootId === parent.id ? parent.id : rootId,
        fileUrl: url,
        fileKey: key,
        fileName: input.fileName,
        fileType: input.fileType || null,
        status: "draft",
        uploadedBy: ctx.user.id,
      });

      return { id: result.insertId, url, version: maxVersion + 1 };
    }),

  // ─── Staff: Submit plan to client for review ───────────────────────────────
  submitToClient: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.planId));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "draft" && plan.status !== "client_rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan can only be submitted from draft or rejected status" });
      }

      const oldStatus = plan.status;
      await db
        .update(constructionPlans)
        .set({ status: "submitted_to_client", submittedAt: new Date(), rejectedAt: null })
        .where(eq(constructionPlans.id, input.planId));

      await logPlanAudit({
        planId: input.planId,
        jobId: plan.jobId,
        action: "submitted_to_client",
        fromStatus: oldStatus,
        toStatus: "submitted_to_client",
        performedBy: null,
        performedByType: "staff",
        details: `Plan "${plan.title}" submitted to client for approval`,
      });

      // Push notification to client portal users
      triggerPushPlanSubmitted(plan.jobId, plan.title);

      return { success: true };
    }),

  // ─── Staff: Notify client about plan via email ────────────────────────────
  notifyClient: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.planId));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "submitted_to_client") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan must be submitted to client before notifying" });
      }

      // Find active portal access records for this job
      const accessRecords = await db
        .select({
          id: portalAccess.id,
          clientEmail: portalAccess.clientEmail,
          clientName: portalAccess.clientName,
          token: portalAccess.token,
          emailNotifications: portalAccess.emailNotifications,
        })
        .from(portalAccess)
        .where(
          and(
            eq(portalAccess.constructionJobId, plan.jobId),
            eq(portalAccess.isActive, true)
          )
        );

      if (accessRecords.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active portal access found for this job. Create portal access first." });
      }

      let sent = 0;
      let failed = 0;

      for (const access of accessRecords) {
        if (!access.clientEmail || !access.emailNotifications) continue;

        const portalUrl = `https://spanquote-pfxpibxa.manus.space/portal/login?token=${access.token}`;
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc;">
            <div style="background-color: #0f172a; padding: 24px 32px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Altaspan</h1>
            </div>
            <div style="background-color: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
              <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px;">Plan Ready for Your Review</h2>
              <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">Hi ${access.clientName || "there"},</p>
              <p style="color: #475569; line-height: 1.6; margin: 0 0 20px 0;">A plan has been submitted for your review and approval:</p>
              <div style="background-color: #f1f5f9; border-left: 4px solid #0ea5e9; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
                <p style="color: #1e293b; font-weight: 600; margin: 0 0 8px 0; font-size: 15px;">${plan.title}${plan.version > 1 ? ` (v${plan.version})` : ""}</p>
                ${plan.description ? `<p style="color: #475569; margin: 0; line-height: 1.6; font-size: 14px;">${plan.description}</p>` : ""}
                <p style="color: #64748b; margin: 8px 0 0 0; font-size: 13px;">📎 ${plan.fileName}</p>
              </div>
              <p style="color: #475569; line-height: 1.6; margin: 0 0 20px 0;">Please log in to your portal to review the plan and provide your approval or feedback.</p>
              <div style="text-align: center; margin: 28px 0 8px 0;">
                <a href="${portalUrl}" style="display: inline-block; background-color: #0ea5e9; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">Review Plan in Portal</a>
              </div>
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 20px 0 0 0;">You're receiving this because you have portal access for your project with Altaspan.</p>
            </div>
            <div style="padding: 16px 32px; text-align: center;">
              <p style="color: #94a3b8; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} Altaspan. All rights reserved.</p>
            </div>
          </div>
        `;

        try {
          const result = await sendNotificationEmail({
            to: access.clientEmail,
            subject: `Plan for Review: ${plan.title}`,
            htmlBody,
          });
          if (result.success) sent++;
          else failed++;
        } catch {
          failed++;
        }
      }

      if (sent === 0 && failed > 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send notification emails" });
      }

      return { sent, failed };
    }),

  // ─── Staff: Submit plan to council ─────────────────────────────────────────
  submitToCouncil: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.planId));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "client_approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan must be client-approved before submitting to council" });
      }

      await db
        .update(constructionPlans)
        .set({ status: "submitted_to_council" })
        .where(eq(constructionPlans.id, input.planId));

      await logPlanAudit({
        planId: input.planId,
        jobId: plan.jobId,
        action: "submitted_to_council",
        fromStatus: plan.status,
        toStatus: "submitted_to_council",
        performedBy: null,
        performedByType: "staff",
        details: `Plan "${plan.title}" submitted to council`,
      });

      return { success: true };
    }),

  // ─── Staff: Mark council approved/rejected ─────────────────────────────────
  updateCouncilStatus: protectedProcedure
    .input(z.object({
      planId: z.number(),
      approved: z.boolean(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.planId));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "submitted_to_council") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan must be submitted to council first" });
      }

      const now = new Date();
      await db
        .update(constructionPlans)
        .set({
          status: input.approved ? "council_approved" : "council_rejected",
          approvedAt: input.approved ? now : null,
          rejectedAt: input.approved ? null : now,
        })
        .where(eq(constructionPlans.id, input.planId));

      if (input.comment) {
        await db.insert(constructionPlanComments).values({
          planId: input.planId,
          userId: ctx.user.id,
          userType: "staff",
          comment: input.comment,
        });
      }

      await logPlanAudit({
        planId: input.planId,
        jobId: plan.jobId,
        action: input.approved ? "council_approved" : "council_rejected",
        fromStatus: "submitted_to_council",
        toStatus: input.approved ? "council_approved" : "council_rejected",
        performedBy: ctx.user.id,
        performedByType: "staff",
        performedByName: ctx.user.name || null,
        details: `Council ${input.approved ? "approved" : "rejected"} plan "${plan.title}"${input.comment ? `: ${input.comment}` : ""}`,
      });

      return { success: true };
    }),

  // ─── Staff: Add comment ────────────────────────────────────────────────────
  addComment: protectedProcedure
    .input(z.object({
      planId: z.number(),
      comment: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.insert(constructionPlanComments).values({
        planId: input.planId,
        userId: ctx.user.id,
        userType: "staff",
        comment: input.comment,
      });
      return { success: true };
    }),

  // ─── Staff: Delete plan ────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(constructionPlanComments).where(eq(constructionPlanComments.planId, input.planId));
      await db.delete(constructionPlans).where(eq(constructionPlans.id, input.planId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // Portal (Client) Procedures
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Portal: List plans submitted to client ────────────────────────────────
  portalListPlans: protectedPortalProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const jobId = ctx.portalAccess.constructionJobId;
      const plans = await db
        .select()
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.jobId, jobId),
          // Only show plans that have been submitted to client or beyond
        ))
        .orderBy(desc(constructionPlans.createdAt));

      // Filter to only show plans visible to client (not drafts)
      return plans.filter((p: any) => p.status !== "draft");
    }),

  // ─── Portal: Get plan detail with comments ─────────────────────────────────
  portalGetDetail: protectedPortalProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const jobId = ctx.portalAccess.constructionJobId;
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.id, input.planId),
          eq(constructionPlans.jobId, jobId),
        ));
      if (!plan || plan.status === "draft") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      const comments = await db
        .select()
        .from(constructionPlanComments)
        .where(eq(constructionPlanComments.planId, input.planId))
        .orderBy(desc(constructionPlanComments.createdAt));

      return { plan, comments };
    }),

  // ─── Portal: Client approve plan ──────────────────────────────────────────
  portalApprovePlan: protectedPortalProcedure
    .input(z.object({
      planId: z.number(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const jobId = ctx.portalAccess.constructionJobId;
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.id, input.planId),
          eq(constructionPlans.jobId, jobId),
        ));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "submitted_to_client") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan is not awaiting your approval" });
      }

      await db
        .update(constructionPlans)
        .set({ status: "client_approved", approvedAt: new Date() })
        .where(eq(constructionPlans.id, input.planId));

      if (input.comment) {
        await db.insert(constructionPlanComments).values({
          planId: input.planId,
          portalClientId: ctx.portalAccess.id,
          userType: "client",
          comment: input.comment,
        });
      }

      await logPlanAudit({
        planId: input.planId,
        jobId,
        action: "client_approved",
        fromStatus: "submitted_to_client",
        toStatus: "client_approved",
        performedBy: ctx.portalAccess.id,
        performedByType: "client",
        performedByName: ctx.portalAccess.clientName || null,
        details: `Client approved plan "${plan.title}"${input.comment ? `: ${input.comment}` : ""}`,
      });

      // Notify staff about approval
      try {
        const [job] = await db.select({ quoteNumber: constructionJobs.quoteNumber, clientName: constructionJobs.clientName })
          .from(constructionJobs).where(eq(constructionJobs.id, jobId));
        await notifyOwner({
          title: `✅ Plan Approved: ${plan.title}`,
          content: `Client${job ? ` (${job.clientName})` : ""} has approved plan "${plan.title}"${job ? ` for job ${job.quoteNumber}` : ""}.${input.comment ? ` Comment: ${input.comment}` : ""}`,
        });
        // Push notification to all staff
        triggerPushPlanDecision(plan.title, job?.clientName || "Client", true);
      } catch (e) { /* notification failure is non-critical */ }

      return { success: true };
    }),

  // ─── Portal: Client reject plan ───────────────────────────────────────────
  portalRejectPlan: protectedPortalProcedure
    .input(z.object({
      planId: z.number(),
      comment: z.string().min(1, "Please provide a reason for rejection"),
      annotationBase64: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const jobId = ctx.portalAccess.constructionJobId;
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.id, input.planId),
          eq(constructionPlans.jobId, jobId),
        ));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "submitted_to_client") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Plan is not awaiting your approval" });
      }

      await db
        .update(constructionPlans)
        .set({ status: "client_rejected", rejectedAt: new Date() })
        .where(eq(constructionPlans.id, input.planId));

      // Upload annotation to S3 if provided
      let attachmentUrl: string | null = null;
      let attachmentKey: string | null = null;
      if (input.annotationBase64) {
        const buffer = Buffer.from(input.annotationBase64, "base64");
        const suffix = crypto.randomBytes(4).toString("hex");
        const key = `construction-plans/annotations/${input.planId}-${suffix}.png`;
        const { url } = await storagePut(key, buffer, "image/png");
        attachmentUrl = url;
        attachmentKey = key;
      }

      await db.insert(constructionPlanComments).values({
        planId: input.planId,
        portalClientId: ctx.portalAccess.id,
        userType: "client",
        comment: input.comment,
        attachmentUrl,
        attachmentKey,
      });

      await logPlanAudit({
        planId: input.planId,
        jobId,
        action: "client_rejected",
        fromStatus: "submitted_to_client",
        toStatus: "client_rejected",
        performedBy: ctx.portalAccess.id,
        performedByType: "client",
        performedByName: ctx.portalAccess.clientName || null,
        details: `Client rejected plan "${plan.title}": ${input.comment}${attachmentUrl ? " (with markup)" : ""}`,
      });

      // Notify staff about rejection
      try {
        const [job] = await db.select({ quoteNumber: constructionJobs.quoteNumber, clientName: constructionJobs.clientName })
          .from(constructionJobs).where(eq(constructionJobs.id, jobId));
        await notifyOwner({
          title: `❌ Plan Rejected: ${plan.title}`,
          content: `Client${job ? ` (${job.clientName})` : ""} has rejected plan "${plan.title}"${job ? ` for job ${job.quoteNumber}` : ""}. Reason: ${input.comment}${attachmentUrl ? " (Annotated markup attached)" : ""}`,
        });
        // Push notification to all staff
        triggerPushPlanDecision(plan.title, job?.clientName || "Client", false);
      } catch (e) { /* notification failure is non-critical */ }

      return { success: true, annotationUrl: attachmentUrl };
    }),

  // ─── Portal: Get all approved plan files for ZIP download ─────────────────
  portalGetApprovedFiles: protectedPortalProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const jobId = ctx.portalAccess.constructionJobId;
      const plans = await db
        .select({
          id: constructionPlans.id,
          title: constructionPlans.title,
          fileName: constructionPlans.fileName,
          fileUrl: constructionPlans.fileUrl,
          version: constructionPlans.version,
          category: constructionPlans.category,
          status: constructionPlans.status,
        })
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.jobId, jobId),
          eq(constructionPlans.status, "client_approved"),
        ))
        .orderBy(desc(constructionPlans.createdAt));
      return plans;
    }),

  // ─── Portal: Client add comment ───────────────────────────────────────────
  portalAddComment: protectedPortalProcedure
    .input(z.object({
      planId: z.number(),
      comment: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const jobId = ctx.portalAccess.constructionJobId;
      // Verify plan belongs to this client's job
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.id, input.planId),
          eq(constructionPlans.jobId, jobId),
        ));
      if (!plan || plan.status === "draft") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      }

      await db.insert(constructionPlanComments).values({
        planId: input.planId,
        portalClientId: ctx.portalAccess.id,
        userType: "client",
        comment: input.comment,
      });

      return { success: true };
    }),

  // ─── Staff: Get audit log for a plan ──────────────────────────────────────
  getAuditLog: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const logs = await db
        .select()
        .from(constructionPlanAuditLog)
        .where(eq(constructionPlanAuditLog.planId, input.planId))
        .orderBy(desc(constructionPlanAuditLog.createdAt));
      return logs;
    }),

  // ─── Staff: Get audit log for entire job ──────────────────────────────────
  getJobAuditLog: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const logs = await db
        .select()
        .from(constructionPlanAuditLog)
        .where(eq(constructionPlanAuditLog.jobId, input.jobId))
        .orderBy(desc(constructionPlanAuditLog.createdAt));
      return logs;
    }),

  // ─── Staff: Archive all plans for a job ───────────────────────────────────
  archiveJobPlans: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Get all non-draft, non-archived plans for this job
      const plans = await db
        .select()
        .from(constructionPlans)
        .where(and(
          eq(constructionPlans.jobId, input.jobId),
          sql`${constructionPlans.status} != 'draft'`,
          sql`${constructionPlans.status} != 'archived'`,
        ));

      if (plans.length === 0) return { archived: 0 };

      const planIds = plans.map(p => p.id);
      await db
        .update(constructionPlans)
        .set({ status: "archived" })
        .where(inArray(constructionPlans.id, planIds));

      // Log each archival
      for (const plan of plans) {
        await logPlanAudit({
          planId: plan.id,
          jobId: input.jobId,
          action: "archived",
          fromStatus: plan.status,
          toStatus: "archived",
          performedBy: ctx.user.id,
          performedByType: "staff",
          performedByName: ctx.user.name || null,
          details: `Plan "${plan.title}" archived (job completed)`,
        });
      }

      return { archived: plans.length };
    }),

  // ─── Staff: Unarchive a plan (restore to draft) ─────────────────────────────
  unarchivePlan: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [plan] = await db
        .select()
        .from(constructionPlans)
        .where(eq(constructionPlans.id, input.planId));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (plan.status !== "archived") throw new TRPCError({ code: "BAD_REQUEST", message: "Plan is not archived" });
      await db
        .update(constructionPlans)
        .set({ status: "draft" })
        .where(eq(constructionPlans.id, input.planId));
      await logPlanAudit({
        planId: plan.id,
        jobId: plan.jobId,
        action: "unarchived",
        fromStatus: "archived",
        toStatus: "draft",
        performedBy: ctx.user.id,
        performedByType: "staff",
        performedByName: ctx.user.name || null,
        details: `Plan "${plan.title}" restored from archive`,
      });
      return { success: true };
    }),
});

export type PlansRouter = typeof plansRouter;
