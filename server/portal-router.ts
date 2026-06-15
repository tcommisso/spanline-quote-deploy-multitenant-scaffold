import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { eq, and, desc, or, gt } from "drizzle-orm";
import {
  portalAccess, portalSessions, portalContacts, portalDocuments,
  portalVariations, portalDefects, portalMaintenanceRequests,
  portalNews, portalProducts, cpcPlans, cpcSubscriptions, cpcServiceHistory,
  constructionJobs, constructionProgress, clientActivities, xeroProjectMappings,
  portalPhotoComments,
  approvalProjects, approvalLodgements, approvalInspections, approvalTasks, approvalRfis,
} from "../drizzle/schema";
import { publicProcedure, router, middleware } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import crypto from "crypto";
import { getXeroProjectTasks, getValidAccessToken, xeroApiRequest, XeroProjectTask } from "./xero-client";
import { getCompanyName } from "./company-name";
import { logNotification } from "./notification-gateway";
import { assertRateLimit } from "./_core/rateLimit";
import { buildTrustedAppUrl, buildTrustedAppUrlForTenant } from "./_core/url";
import { appendTenantScope, isRecordVisibleToTenant, tenantIdFromContext } from "./_core/tenant-scope";
import { sendNotificationEmail } from "./email";

// ─── Portal Context ─────────────────────────────────────────────────────────
// Portal now uses the main tRPC instance and reads portalAccess from the shared context
// The context.ts resolves portal sessions via x-portal-session header

const publicPortalProcedure = publicProcedure;

// Middleware: require authenticated portal session (reads from shared context)
const requirePortalAccess = middleware(async ({ ctx, next }) => {
  if (!ctx.portalAccess) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Portal session expired or invalid" });
  }
  return next({
    ctx: {
      ...ctx,
      portalAccess: ctx.portalAccess,
    },
  });
});

const protectedPortalProcedure = publicProcedure.use(requirePortalAccess);

// ─── Helper: Generate secure token ─────────────────────────────────────────
function generateToken(length = 64): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function portalAccessConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, portalAccess.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function requirePortalAccessVisible(
  ctx: any,
  access: typeof portalAccess.$inferSelect | null | undefined,
) {
  if (!access || !isRecordVisibleToTenant(access.tenantId, tenantIdFromContext(ctx))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired link" });
  }
  return access;
}

// ─── Portal Router ──────────────────────────────────────────────────────────

export const portalRouter = router({
  // ─── Branding (public — no auth required) ──────────────────────────────────
  getBranding: publicPortalProcedure.query(async () => {
    const db = await requireDb();
    const { userSettings: userSettingsTable } = await import("../drizzle/schema");
    // Get the first user settings row that has companyDetails or customLogoUrl
    const rows = await db.select({
      companyDetails: userSettingsTable.companyDetails,
      customLogoUrl: userSettingsTable.customLogoUrl,
      appIconUrl: userSettingsTable.appIconUrl,
    }).from(userSettingsTable).limit(5);

    let logoUrl: string | null = null;
    let appIconUrl: string | null = null;
    for (const row of rows) {
      if (row.customLogoUrl && !logoUrl) logoUrl = row.customLogoUrl;
      if (row.appIconUrl && !appIconUrl) appIconUrl = row.appIconUrl;
      if (logoUrl && appIconUrl) break;
    }

    const companyInfo = await getCompanyName();
    return {
      companyName: companyInfo.displayName,
      logoUrl,
      appIconUrl,
    };
  }),

  // ─── Auth ───────────────────────────────────────────────────────────────────
  
  requestMagicLink: publicPortalProcedure
    .input(z.object({ email: z.string().email(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRateLimit({
        key: `portal-magic:${input.email.toLowerCase()}:${ctx.req.ip}`,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      const db = await requireDb();
      const conditions = portalAccessConditions(
        ctx,
        eq(portalAccess.clientEmail, input.email),
        eq(portalAccess.isActive, true),
      );
      const [access] = await db
        .select()
        .from(portalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) {
        return { success: true, message: "If an account exists, a login link has been sent." };
      }

      const magicLinkToken = generateToken(64);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const sessionToken = generateToken(64);

      await db.insert(portalSessions).values({
        portalAccessId: access.id,
        sessionToken,
        magicLinkToken,
        magicLinkExpiresAt: expiresAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const magicLinkUrl = await buildTrustedAppUrlForTenant(
        ctx.req,
        access.tenantId,
        `/portal/login?magic=${encodeURIComponent(magicLinkToken)}`,
        input.origin
      );
      
      try {
        const result = await sendNotificationEmail({
          tenantId: access.tenantId,
          to: input.email,
          subject: "Your Altaspan Client Portal Login Link",
          htmlBody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">Altaspan Client Portal</h2>
                  <p>Hi ${access.clientName || "there"},</p>
                  <p>Click the button below to access your project portal:</p>
                  <a href="${magicLinkUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
                    Access My Portal
                  </a>
                  <p style="color: #666; font-size: 14px;">This link expires in 30 minutes.</p>
                </div>
              `,
          module: "admin",
        });
        await logNotification(
          { settingKey: "portal.magic_link", channel: "email", recipientType: "client", recipientId: input.email, title: "Client Portal Login Link" },
          result.success ? "sent" : "failed",
          result.error
        );
      } catch (e: any) {
        console.error("Failed to send magic link email:", e);
        await logNotification(
          { settingKey: "portal.magic_link", channel: "email", recipientType: "client", recipientId: input.email, title: "Client Portal Login Link" },
          "failed",
          e?.message || "Unknown error"
        ).catch(() => {});
      }

      return { success: true, message: "If an account exists, a login link has been sent." };
    }),

  verifyMagicLink: publicPortalProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [session] = await db
        .select()
        .from(portalSessions)
        .where(eq(portalSessions.magicLinkToken, input.token))
        .limit(1);

      if (!session || !session.magicLinkExpiresAt || session.magicLinkExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired link" });
      }

      const [rawAccess] = await db
        .select()
        .from(portalAccess)
        .where(and(
          eq(portalAccess.id, session.portalAccessId),
          eq(portalAccess.isActive, true),
        ))
        .limit(1);
      const access = requirePortalAccessVisible(ctx, rawAccess);

      await db.update(portalSessions)
        .set({ magicLinkToken: null, magicLinkExpiresAt: null })
        .where(eq(portalSessions.id, session.id));

      await db.update(portalAccess)
        .set({ lastAccessedAt: new Date() })
        .where(eq(portalAccess.id, access.id));

      return { sessionToken: session.sessionToken };
    }),

  verifyPortalToken: publicPortalProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = portalAccessConditions(
        ctx,
        eq(portalAccess.token, input.token),
        eq(portalAccess.isActive, true),
      );
      const [access] = await db
        .select()
        .from(portalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid portal link" });
      }

      const sessionToken = generateToken(64);
      await db.insert(portalSessions).values({
        portalAccessId: access.id,
        sessionToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await db.update(portalAccess)
        .set({ lastAccessedAt: new Date() })
        .where(eq(portalAccess.id, access.id));

      return { sessionToken, clientName: access.clientName };
    }),

  me: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [job] = await db
      .select({ id: constructionJobs.id, clientName: constructionJobs.clientName, status: constructionJobs.status })
      .from(constructionJobs)
      .where(eq(constructionJobs.id, ctx.portalAccess.constructionJobId))
      .limit(1);

    return {
      clientName: ctx.portalAccess.clientName,
      clientEmail: ctx.portalAccess.clientEmail,
      job: job || null,
    };
  }),

  // ─── Project Status ─────────────────────────────────────────────────────────

  getProjectStatus: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const jobId = ctx.portalAccess.constructionJobId;

    const [job] = await db
      .select()
      .from(constructionJobs)
      .where(eq(constructionJobs.id, jobId))
      .limit(1);

    if (!job) throw new TRPCError({ code: "NOT_FOUND" });

    const stages = await db
      .select()
      .from(constructionProgress)
      .where(eq(constructionProgress.jobId, jobId));

    const completedStages = stages.filter((s: { status: string }) => s.status === "completed");

    return {
      quoteNumber: job.quoteNumber,
      clientName: job.clientName,
      status: job.status,
      siteAddress: job.siteAddress,
      stages,
      totalStages: stages.length,
      completedStages: completedStages.length,
      progressPercent: stages.length > 0 ? Math.round((completedStages.length / stages.length) * 100) : 0,
    };
  }),

  // ─── Documents ──────────────────────────────────────────────────────────────

  getDocuments: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(portalDocuments)
      .where(eq(portalDocuments.constructionJobId, ctx.portalAccess.constructionJobId))
      .orderBy(desc(portalDocuments.createdAt));
  }),

  // ─── Photo Comments ─────────────────────────────────────────────────────────

  getPhotoComments: protectedPortalProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify the document belongs to this portal's job
      const [doc] = await db.select({ id: portalDocuments.id })
        .from(portalDocuments)
        .where(and(
          eq(portalDocuments.id, input.documentId),
          eq(portalDocuments.constructionJobId, ctx.portalAccess.constructionJobId),
        ))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

      return db.select()
        .from(portalPhotoComments)
        .where(eq(portalPhotoComments.documentId, input.documentId))
        .orderBy(desc(portalPhotoComments.createdAt));
    }),

  addPhotoComment: protectedPortalProcedure
    .input(z.object({
      documentId: z.number(),
      comment: z.string().min(1).max(500),
      reaction: z.enum(["love", "thumbsup", "question"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Verify the document belongs to this portal's job
      const [doc] = await db.select({ id: portalDocuments.id })
        .from(portalDocuments)
        .where(and(
          eq(portalDocuments.id, input.documentId),
          eq(portalDocuments.constructionJobId, ctx.portalAccess.constructionJobId),
        ))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

      const [result] = await db.insert(portalPhotoComments).values({
        documentId: input.documentId,
        authorName: ctx.portalAccess.clientName || "Client",
        authorType: "client",
        comment: input.comment,
        reaction: input.reaction || null,
      });

      // Notify admin of client comment
      const clientName = ctx.portalAccess.clientName || "A client";
      const reactionLabel = input.reaction ? ` [${input.reaction}]` : "";
      notifyOwner({
        title: `Photo Comment: ${clientName}`,
        content: `${clientName} commented on a photo${reactionLabel}:\n"${input.comment.slice(0, 200)}"`,
      }).catch(() => {}); // fire-and-forget

      return { id: result.insertId };
    }),

  deletePhotoComment: protectedPortalProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Only allow deleting own comments (verify via portal access)
      const [comment] = await db.select()
        .from(portalPhotoComments)
        .where(eq(portalPhotoComments.id, input.commentId))
        .limit(1);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify the document belongs to this portal
      const [doc] = await db.select({ id: portalDocuments.id })
        .from(portalDocuments)
        .where(and(
          eq(portalDocuments.id, comment.documentId),
          eq(portalDocuments.constructionJobId, ctx.portalAccess.constructionJobId),
        ))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "FORBIDDEN" });

      await db.delete(portalPhotoComments)
        .where(eq(portalPhotoComments.id, input.commentId));
      return { success: true };
    }),

  // ─── Contacts Directory ─────────────────────────────────────────────────────

  getContacts: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(portalContacts)
      .where(eq(portalContacts.constructionJobId, ctx.portalAccess.constructionJobId))
      .orderBy(portalContacts.sortOrder);
  }),

  // ─── Variations ─────────────────────────────────────────────────────────────

  getVariations: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(portalVariations)
      .where(eq(portalVariations.constructionJobId, ctx.portalAccess.constructionJobId))
      .orderBy(desc(portalVariations.createdAt));
  }),

  approveVariation: protectedPortalProcedure
    .input(z.object({ variationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [variation] = await db
        .select()
        .from(portalVariations)
        .where(and(
          eq(portalVariations.id, input.variationId),
          eq(portalVariations.constructionJobId, ctx.portalAccess.constructionJobId)
        ))
        .limit(1);

      if (!variation) throw new TRPCError({ code: "NOT_FOUND" });
      if (variation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Variation is not pending" });

      await db.update(portalVariations)
        .set({ status: "approved", clientApprovedAt: new Date() })
        .where(eq(portalVariations.id, input.variationId));

      return { success: true };
    }),

  rejectVariation: protectedPortalProcedure
    .input(z.object({ variationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [variation] = await db
        .select()
        .from(portalVariations)
        .where(and(
          eq(portalVariations.id, input.variationId),
          eq(portalVariations.constructionJobId, ctx.portalAccess.constructionJobId)
        ))
        .limit(1);

      if (!variation) throw new TRPCError({ code: "NOT_FOUND" });
      if (variation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Variation is not pending" });

      await db.update(portalVariations)
        .set({ status: "rejected" })
        .where(eq(portalVariations.id, input.variationId));

      return { success: true };
    }),

  // ─── Defects ────────────────────────────────────────────────────────────────

  getDefects: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(portalDefects)
      .where(eq(portalDefects.constructionJobId, ctx.portalAccess.constructionJobId))
      .orderBy(desc(portalDefects.createdAt));
  }),

  reportDefect: protectedPortalProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      photoUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [defect] = await db.insert(portalDefects).values({
        constructionJobId: ctx.portalAccess.constructionJobId,
        portalAccessId: ctx.portalAccess.id,
        title: input.title,
        description: input.description || null,
        photoUrls: input.photoUrls || null,
      }).$returningId();

      return { id: defect.id };
    }),

  // ─── Maintenance Requests ───────────────────────────────────────────────────

  getMaintenanceRequests: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(portalMaintenanceRequests)
      .where(eq(portalMaintenanceRequests.constructionJobId, ctx.portalAccess.constructionJobId))
      .orderBy(desc(portalMaintenanceRequests.createdAt));
  }),

  submitMaintenanceRequest: protectedPortalProcedure
    .input(z.object({
      description: z.string().min(1),
      photoUrls: z.array(z.string()).optional(),
      urgency: z.enum(["low", "medium", "high"]).default("medium"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [request] = await db.insert(portalMaintenanceRequests).values({
        constructionJobId: ctx.portalAccess.constructionJobId,
        portalAccessId: ctx.portalAccess.id,
        description: input.description,
        photoUrls: input.photoUrls || null,
        urgency: input.urgency,
      }).$returningId();

      return { id: request.id };
    }),

  // ─── CPC Subscription ──────────────────────────────────────────────────────

  getPlans: publicPortalProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select()
      .from(cpcPlans)
      .where(eq(cpcPlans.isActive, true))
      .orderBy(cpcPlans.sortOrder);
  }),

  getMySubscription: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [subscription] = await db
      .select()
      .from(cpcSubscriptions)
      .where(and(
        eq(cpcSubscriptions.portalAccessId, ctx.portalAccess.id),
        eq(cpcSubscriptions.constructionJobId, ctx.portalAccess.constructionJobId)
      ))
      .limit(1);

    if (!subscription) return null;

    const [plan] = await db
      .select()
      .from(cpcPlans)
      .where(eq(cpcPlans.id, subscription.planId))
      .limit(1);

    const history = await db
      .select()
      .from(cpcServiceHistory)
      .where(eq(cpcServiceHistory.subscriptionId, subscription.id))
      .orderBy(desc(cpcServiceHistory.serviceDate));

    return { subscription, plan, history };
  }),

  // ─── CPC Stripe Checkout ──────────────────────────────────────────────────

  createSubscriptionCheckout: protectedPortalProcedure
    .input(z.object({
      planId: z.number(),
      structureSize: z.enum(["small", "medium", "large"]),
      structureAreaM2: z.string().optional(),
      origin: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const { getStripe, getBillingInterval, getPriceInCents } = await import("./stripe");
      const stripe = getStripe();

      // Get the plan
      const [plan] = await db.select().from(cpcPlans).where(eq(cpcPlans.id, input.planId)).limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      const priceInCents = getPriceInCents(plan, input.structureSize);
      const { interval, intervalCount } = getBillingInterval(plan.frequency);

      // Create a local subscription record (pending until Stripe confirms)
      const [newSub] = await db.insert(cpcSubscriptions).values({
        portalAccessId: ctx.portalAccess.id,
        constructionJobId: ctx.portalAccess.constructionJobId,
        planId: input.planId,
        structureSize: input.structureSize,
        structureAreaM2: input.structureAreaM2 || null,
        status: "paused", // will be set to active by webhook
      }).$returningId();

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{
          price_data: {
            currency: "aud",
            product_data: {
              name: `${plan.name} - ${input.structureSize.charAt(0).toUpperCase() + input.structureSize.slice(1)}`,
              description: plan.description || `CPC ${plan.frequency} care plan`,
            },
            unit_amount: priceInCents,
            recurring: {
              interval,
              interval_count: intervalCount,
            },
          },
          quantity: 1,
        }],
        customer_email: ctx.portalAccess.clientEmail,
        metadata: {
          cpc_subscription_id: String(newSub.id),
          portal_access_id: String(ctx.portalAccess.id),
          plan_name: plan.name,
          structure_size: input.structureSize,
        },
        allow_promotion_codes: true,
        success_url: buildTrustedAppUrl(ctx.req, "/portal/subscription?success=true", input.origin),
        cancel_url: buildTrustedAppUrl(ctx.req, "/portal/subscription?cancelled=true", input.origin),
      });

      return { checkoutUrl: session.url, subscriptionId: newSub.id };
    }),

  cancelSubscription: protectedPortalProcedure
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const { getStripe } = await import("./stripe");

      const [subscription] = await db.select().from(cpcSubscriptions)
        .where(and(
          eq(cpcSubscriptions.portalAccessId, ctx.portalAccess.id),
          eq(cpcSubscriptions.status, "active")
        ))
        .limit(1);

      if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription" });

      if (subscription.stripeSubscriptionId) {
        const stripe = getStripe();
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      }

      await db.update(cpcSubscriptions)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(cpcSubscriptions.id, subscription.id));

      return { success: true };
    }),

  // ─── News & Products ────────────────────────────────────────────────────────

  getNews: publicPortalProcedure
    .input(z.object({ limit: z.number().default(10), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const limit = input?.limit || 10;
      const offset = input?.offset || 0;

      return db
        .select()
        .from(portalNews)
        .where(and(
          eq(portalNews.isPublished, true),
          or(eq(portalNews.portalType, "client"), eq(portalNews.portalType, "both"))
        ))
        .orderBy(desc(portalNews.publishedAt))
        .limit(limit)
        .offset(offset);
    }),

  getNewsArticle: publicPortalProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [article] = await db
        .select()
        .from(portalNews)
        .where(and(
          eq(portalNews.slug, input.slug),
          eq(portalNews.isPublished, true),
          or(eq(portalNews.portalType, "client"), eq(portalNews.portalType, "both"))
        ))
        .limit(1);

      if (!article) throw new TRPCError({ code: "NOT_FOUND" });
      return article;
    }),

  getProducts: publicPortalProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select()
      .from(portalProducts)
      .where(eq(portalProducts.isActive, true))
      .orderBy(portalProducts.sortOrder);
  }),

  // ─── Portal Activities (portal-visible only) ────────────────────────────────

  getPortalActivities: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db
      .select()
      .from(clientActivities)
      .where(
        and(
          eq(clientActivities.jobId, ctx.portalAccess.constructionJobId),
          eq(clientActivities.portalVisible, true)
        )
      )
      .orderBy(desc(clientActivities.createdAt))
      .limit(50);
  }),

  // ─── Notification Preferences ──────────────────────────────────────────────

  getNotificationPreferences: protectedPortalProcedure.query(async ({ ctx }) => {
    return {
      emailNotifications: ctx.portalAccess.emailNotifications,
    };
  }),

  updateNotificationPreferences: protectedPortalProcedure
    .input(z.object({
      emailNotifications: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(portalAccess)
        .set({ emailNotifications: input.emailNotifications })
        .where(eq(portalAccess.id, ctx.portalAccess.id));
      return { success: true };
    }),

  // ─── AI Render Gallery ─────────────────────────────────────────────────────

  getRenderGallery: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const jobId = ctx.portalAccess.constructionJobId;

    // Find the construction job to get the quoteId
    const [job] = await db
      .select()
      .from(constructionJobs)
      .where(eq(constructionJobs.id, jobId))
      .limit(1);

    if (!job || !job.quoteId) return { hasRenders: false, renders: [] };

    // Find patio planner project linked to this quote
    const { patioPlanner } = await import("../drizzle/schema");
    const [project] = await db
      .select()
      .from(patioPlanner)
      .where(eq(patioPlanner.quoteId, job.quoteId))
      .limit(1);

    if (!project || !(project as any).renderHistory) {
      return { hasRenders: false, renders: [] };
    }

    // Parse render history and return only favourites or all if none favourited
    let history: Array<{ id: string; imageUrl: string; createdAt: number; isFavourite?: boolean; stylePreset?: string }> = [];
    try {
      const parsed = JSON.parse((project as any).renderHistory as string);
      if (Array.isArray(parsed)) history = parsed;
    } catch { /* empty */ }

    if (history.length === 0) return { hasRenders: false, renders: [] };

    // Sort: favourites first, then newest
    const sorted = [...history].sort((a, b) => {
      if (a.isFavourite && !b.isFavourite) return -1;
      if (!a.isFavourite && b.isFavourite) return 1;
      return b.createdAt - a.createdAt;
    });

    return {
      hasRenders: true,
      renders: sorted.map(r => ({
        id: r.id,
        imageUrl: r.imageUrl,
        createdAt: r.createdAt,
        isFavourite: r.isFavourite || false,
      })),
      projectName: (project as any).name || "Patio Design",
    };
  }),

  // ─── Payment Schedule from Xero Projects ──────────────────────────────────
  getPaymentSchedule: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const jobId = ctx.portalAccess.constructionJobId;
    if (!jobId) return { hasXeroProject: false, schedule: [], summary: null, error: null };

    const auth = await getValidAccessToken();
    if (!auth) return { hasXeroProject: false, schedule: [], summary: null, error: "Xero not connected" };

    // Find the project mapping for this job
    const [mapping] = await db
      .select()
      .from(xeroProjectMappings)
      .where(and(
        eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
        eq(xeroProjectMappings.jobId, jobId)
      ));

    if (!mapping) return { hasXeroProject: false, schedule: [], summary: null, error: null };

    try {
      // Fetch tasks for the project (FIXED tasks = payment milestones)
      const tasksResult = await getXeroProjectTasks(mapping.xeroProjectId, { pageSize: 100 });
      const milestones = (tasksResult.items || [])
        .filter((t: XeroProjectTask) => t.chargeType === "FIXED")
        .map((t: XeroProjectTask) => ({
          id: t.taskId,
          name: t.name,
          amount: t.rate?.value || 0,
          amountInvoiced: t.amountInvoiced?.value || 0,
          amountToBeInvoiced: t.amountToBeInvoiced?.value || 0,
          status: t.status,
          isInvoiced: t.status === "INVOICED" || (t.amountInvoiced?.value || 0) > 0,
          isPaid: false as boolean,
        }));

      // Check ACCREC invoices for payment status
      if (mapping.xeroContactId) {
        try {
          const invResult = await xeroApiRequest<{ Invoices: Array<{ InvoiceID: string; Reference: string; Status: string; AmountPaid: number; Total: number }> }>(
            `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID`
          );
          const paidInvoices = (invResult.Invoices || []).filter((inv) => inv.Status === "PAID");
          const totalPaidFromInvoices = paidInvoices.reduce((sum, inv) => sum + (inv.AmountPaid || 0), 0);
          // Simple heuristic: mark milestones as paid in order up to the total paid amount
          let runningPaid = 0;
          for (const m of milestones) {
            if (m.amountInvoiced > 0 && runningPaid + m.amountInvoiced <= totalPaidFromInvoices) {
              m.isPaid = true;
              runningPaid += m.amountInvoiced;
            }
          }
        } catch (_e) {
          // Non-critical
        }
      }

      const totalContract = milestones.reduce((s: number, m: { amount: number }) => s + m.amount, 0);
      const totalInvoiced = milestones.reduce((s: number, m: { amountInvoiced: number }) => s + m.amountInvoiced, 0);
      const totalPaid = milestones.filter((m: { isPaid: boolean }) => m.isPaid).reduce((s: number, m: { amountInvoiced: number }) => s + m.amountInvoiced, 0);
      const totalRemaining = totalContract - totalInvoiced;

      return {
        hasXeroProject: true,
        schedule: milestones,
        summary: {
          totalContract,
          totalInvoiced,
          totalPaid,
          totalRemaining,
          progressPercent: totalContract > 0 ? Math.round((totalPaid / totalContract) * 100) : 0,
        },
        error: null,
      };
    } catch (err: any) {
      console.error("[Portal] Failed to fetch payment schedule:", err.message);
      return { hasXeroProject: true, schedule: [], summary: null, error: "Unable to load payment schedule" };
    }
  }),

  // ─── Badge Counts (unread items for bottom nav) ──────────────────────────

  getBadgeCounts: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const access = ctx.portalAccess;
    const jobId = access.constructionJobId;

    // Count documents newer than last viewed
    const docsResult = await db
      .select()
      .from(portalDocuments)
      .where(
        access.lastViewedDocumentsAt
          ? and(
              eq(portalDocuments.constructionJobId, jobId),
              gt(portalDocuments.createdAt, access.lastViewedDocumentsAt)
            )
          : eq(portalDocuments.constructionJobId, jobId)
      );
    const newDocsCount = docsResult.length;

    // Count variations newer than last viewed invoices (invoices tab shows payment schedule + variations)
    const variationsResult = await db
      .select()
      .from(portalVariations)
      .where(
        access.lastViewedInvoicesAt
          ? and(
              eq(portalVariations.constructionJobId, jobId),
              gt(portalVariations.createdAt, access.lastViewedInvoicesAt)
            )
          : eq(portalVariations.constructionJobId, jobId)
      );
    const newInvoicesCount = variationsResult.length;

    // Count activities (updates) newer than last viewed
    const activitiesResult = await db
      .select()
      .from(clientActivities)
      .where(
        access.lastViewedUpdatesAt
          ? and(
              eq(clientActivities.jobId, jobId),
              eq(clientActivities.portalVisible, true),
              gt(clientActivities.createdAt, access.lastViewedUpdatesAt)
            )
          : and(
              eq(clientActivities.jobId, jobId),
              eq(clientActivities.portalVisible, true)
            )
      );
    const newUpdatesCount = activitiesResult.length;

    return { documents: newDocsCount, invoices: newInvoicesCount, updates: newUpdatesCount };
  }),

  markSectionViewed: protectedPortalProcedure
    .input(z.object({ section: z.enum(["documents", "invoices", "updates"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const now = new Date();
      if (input.section === "documents") {
        await db.update(portalAccess)
          .set({ lastViewedDocumentsAt: now })
          .where(eq(portalAccess.id, ctx.portalAccess.id));
      } else if (input.section === "invoices") {
        await db.update(portalAccess)
          .set({ lastViewedInvoicesAt: now })
          .where(eq(portalAccess.id, ctx.portalAccess.id));
      } else if (input.section === "updates") {
        await db.update(portalAccess)
          .set({ lastViewedUpdatesAt: now })
          .where(eq(portalAccess.id, ctx.portalAccess.id));
      }
      return { success: true };
    }),

  // ─── Push Notifications ────────────────────────────────────────────────────
  pushSubscribe: protectedPortalProcedure
    .input(z.object({
      endpoint: z.string().min(1),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { subscribePush } = await import("./push");
      await subscribePush({
        portalType: "client",
        portalAccessId: ctx.portalAccess.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
      return { success: true };
    }),

  pushUnsubscribe: protectedPortalProcedure
    .input(z.object({ endpoint: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { unsubscribePush } = await import("./push");
      await unsubscribePush(input.endpoint);
      return { success: true };
    }),

  getVapidKey: publicPortalProcedure.query(() => {
    return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "" };
  }),

  // ─── Approval Timeline (view-only summary for client) ──────────────────────
  getApprovalTimeline: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const jobId = ctx.portalAccess.constructionJobId;

    // Find the construction job to get its leadId
    const [job] = await db
      .select({ id: constructionJobs.id, leadId: constructionJobs.leadId })
      .from(constructionJobs)
      .where(eq(constructionJobs.id, jobId))
      .limit(1);
    if (!job || !job.leadId) return { project: null, milestones: [] };

    // Find the approval project linked to this lead
    const [project] = await db
      .select({
        id: approvalProjects.id,
        name: approvalProjects.name,
        overallStatus: approvalProjects.overallStatus,
        currentGate: approvalProjects.currentGate,
        createdAt: approvalProjects.createdAt,
      })
      .from(approvalProjects)
      .where(eq(approvalProjects.crmLeadId, job.leadId))
      .limit(1);
    if (!project) return { project: null, milestones: [] };

    // Gather milestone events for the timeline
    const milestones: Array<{
      type: string;
      label: string;
      date: Date | null;
      status: string;
    }> = [];

    // 1. Lodgements
    const lodgements = await db
      .select({
        id: approvalLodgements.id,
        lodgementType: approvalLodgements.lodgementType,
        status: approvalLodgements.status,
        lodgedAt: approvalLodgements.submittedAt,
        determinedAt: approvalLodgements.determinationAt,
      })
      .from(approvalLodgements)
      .where(eq(approvalLodgements.projectId, project.id));

    for (const l of lodgements) {
      milestones.push({
        type: "lodgement",
        label: `${l.lodgementType?.replace(/_/g, " ").toUpperCase() || "Lodgement"} submitted`,
        date: l.lodgedAt,
        status: l.status || "pending",
      });
      if (l.determinedAt) {
        milestones.push({
          type: "determination",
          label: `${l.lodgementType?.replace(/_/g, " ").toUpperCase() || "Lodgement"} determined`,
          date: l.determinedAt,
          status: "completed",
        });
      }
    }

    // 2. Inspections
    const inspections = await db
      .select({
        id: approvalInspections.id,
        inspectionType: approvalInspections.inspectionType,
        status: approvalInspections.status,
        scheduledDate: approvalInspections.scheduledDate,
      })
      .from(approvalInspections)
      .where(eq(approvalInspections.projectId, project.id));

    for (const i of inspections) {
      milestones.push({
        type: "inspection",
        label: `${i.inspectionType?.replace(/_/g, " ") || "Inspection"}`,
        date: i.scheduledDate,
        status: i.status || "scheduled",
      });
    }

    // 3. Key tasks (gates only — don't expose internal tasks to client)
    const tasks = await db
      .select({
        id: approvalTasks.id,
        title: approvalTasks.title,
        status: approvalTasks.status,
        dueAt: approvalTasks.dueAt,
        gate: approvalTasks.gateNumber,
      })
      .from(approvalTasks)
      .where(and(
        eq(approvalTasks.projectId, project.id),
        // Only show gate-level milestones to client
      ));

    // Only include tasks that represent gates (not internal admin tasks)
    for (const t of tasks) {
      if (t.gate) {
        milestones.push({
          type: "gate",
          label: t.title || `Gate: ${t.gate}`,
          date: t.dueAt,
          status: t.status || "pending",
        });
      }
    }

    // 4. Open RFIs (client should know about these)
    const rfis = await db
      .select({
        id: approvalRfis.id,
        subject: approvalRfis.subject,
        status: approvalRfis.status,
        dueAt: approvalRfis.dueAt,
        createdAt: approvalRfis.createdAt,
      })
      .from(approvalRfis)
      .where(eq(approvalRfis.projectId, project.id));

    for (const r of rfis) {
      milestones.push({
        type: "rfi",
        label: `RFI: ${r.subject || "Information Request"}`,
        date: r.dueAt || r.createdAt,
        status: r.status || "open",
      });
    }

    // Sort by date (nulls last)
    milestones.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return {
      project: {
        name: project.name,
        status: project.overallStatus,
        currentGate: project.currentGate,
      },
      milestones,
    };
  }),
});

export type PortalRouter = typeof portalRouter;
