import { z } from "zod";
import { tenantAdminProcedure as adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { eq, desc, and, or } from "drizzle-orm";
import {
  portalAccess, portalSessions, portalDocuments, portalDefects, portalMaintenanceRequests,
  portalNews, portalProducts, portalContacts, portalVariations,
  cpcPlans, cpcSubscriptions, cpcServiceHistory, constructionJobs,
  portalPhotoComments, quotes, crmLeads, users, tenantMemberships, designAdvisors,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { triggerPushDocumentUploaded, triggerPushVariationCreated, triggerPushClientNewsPublished } from "./push-triggers";
import { sendNotificationEmail } from "./email";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { buildTrustedAppUrlForTenant } from "./_core/url";

function generateToken(length = 64): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function normaliseEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

function contactRoleTitle(role?: string | null) {
  if (!role) return "";
  const roleLabels: Record<string, string> = {
    super_admin: "Director",
    admin: "Admin",
    design_adviser: "Design Adviser",
    office_user: "Office Manager",
    construction_user: "Construction Manager",
    driver: "Driver",
    warehouse: "Warehouse",
    user: "Team Member",
  };
  return roleLabels[role] ?? role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function assertPortalJobAccess(ctx: any, jobId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const conditions = [eq(constructionJobs.id, jobId)];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  const [job] = await db.select().from(constructionJobs).where(and(...conditions)).limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Construction job not found" });
  return { db, job };
}

function portalNewsConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, portalNews.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function portalProductConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, portalProducts.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

export const adminPortalRouter = router({
  // ─── Portal Access Management ──────────────────────────────────────────────

  listPortalAccess: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conditions: any[] = [];
    appendTenantScope(conditions, portalAccess.tenantId, tenantIdFromContext(ctx));
    const accesses = await db
      .select({
        id: portalAccess.id,
        constructionJobId: portalAccess.constructionJobId,
        clientName: portalAccess.clientName,
        clientEmail: portalAccess.clientEmail,
        token: portalAccess.token,
        isActive: portalAccess.isActive,
        lastAccessedAt: portalAccess.lastAccessedAt,
        createdAt: portalAccess.createdAt,
      })
      .from(portalAccess)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(portalAccess.createdAt));

    return accesses;
  }),

  createPortalAccess: adminProcedure
    .input(z.object({
      constructionJobId: z.number(),
      clientName: z.string().min(1),
      clientEmail: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertPortalJobAccess(ctx, input.constructionJobId);

      const token = generateToken(64);
      const [result] = await db.insert(portalAccess).values({
        tenantId: ctx.tenant?.id ?? null,
        constructionJobId: input.constructionJobId,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        token,
        isActive: true,
      }).$returningId();

      return { id: result.id, token };
    }),

  revokePortalAccess: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(portalAccess.id, input.id)];
      appendTenantScope(conditions, portalAccess.tenantId, tenantIdFromContext(ctx));
      await db.update(portalAccess)
        .set({ isActive: false })
        .where(and(...conditions));
      return { success: true };
    }),

  reactivatePortalAccess: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(portalAccess.id, input.id)];
      appendTenantScope(conditions, portalAccess.tenantId, tenantIdFromContext(ctx));
      await db.update(portalAccess)
        .set({ isActive: true })
        .where(and(...conditions));
      return { success: true };
    }),

  sendPortalMagicLink: adminProcedure
    .input(z.object({ id: z.number(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(portalAccess.id, input.id)];
      appendTenantScope(conditions, portalAccess.tenantId, tenantIdFromContext(ctx));
      const [access] = await db.select()
        .from(portalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) throw new TRPCError({ code: "NOT_FOUND", message: "Client portal access not found" });

      const magicLinkToken = generateToken(32);
      const sessionToken = generateToken(64);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.insert(portalSessions).values({
        portalAccessId: access.id,
        sessionToken,
        magicLinkToken,
        magicLinkExpiresAt: expiresAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const magicLinkUrl = await buildTrustedAppUrlForTenant(
        ctx.req,
        access.tenantId ?? ctx.tenant?.id ?? null,
        `/portal/login?magic=${encodeURIComponent(magicLinkToken)}`,
        input.origin,
      );

      const emailResult = await sendNotificationEmail({
        tenantId: access.tenantId ?? ctx.tenant?.id ?? null,
        to: access.clientEmail,
        subject: "Your Altaspan Client Portal Login Link",
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Altaspan Client Portal</h2>
            <p>Hi ${access.clientName || "there"},</p>
            <p>A new login link has been generated for your client portal access.</p>
            <a href="${magicLinkUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
              Access Client Portal
            </a>
            <p style="color: #666; font-size: 14px;">This link expires in 30 minutes.</p>
          </div>
        `,
        module: "admin",
      });

      if (!emailResult.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: emailResult.error || "Client portal email could not be sent" });
      }

      return { success: true };
    }),

  /** Get or create portal access for a job — used by the quick "Portal Link" button on job cards */
  getOrCreatePortalAccess: adminProcedure
    .input(z.object({
      constructionJobId: z.number(),
      clientName: z.string().optional(),
      clientEmail: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { job } = await assertPortalJobAccess(ctx, input.constructionJobId);

      // Check for existing active access
      const accessConditions = [
        eq(portalAccess.constructionJobId, input.constructionJobId),
        eq(portalAccess.isActive, true),
      ];
      appendTenantScope(accessConditions, portalAccess.tenantId, tenantIdFromContext(ctx));
      const existing = await db.select()
        .from(portalAccess)
        .where(and(...accessConditions))
        .limit(1);

      if (existing.length > 0) {
        return { token: existing[0].token, created: false };
      }

      // Need client info to create — try to get from the job's quote/lead
      let clientName = input.clientName || "Client";
      let clientEmail = input.clientEmail || "";

      if (!input.clientEmail) {
        // Try to find from the construction job's linked data
        if (job) {
          clientName = job.clientName || clientName;
          if (job.quoteId) {
            const [quote] = await db.select({ email: quotes.clientEmail })
              .from(quotes).where(eq(quotes.id, job.quoteId));
            if (quote?.email) clientEmail = quote.email;
          }
          if (!clientEmail && job.leadId) {
            const [lead] = await db.select({ email: crmLeads.contactEmail })
              .from(crmLeads).where(eq(crmLeads.id, job.leadId));
            if (lead?.email) clientEmail = lead.email;
          }
        }
      }

      if (!clientEmail) {
        clientEmail = `client-${input.constructionJobId}@placeholder.local`;
      }

      const token = generateToken(64);
      await db.insert(portalAccess).values({
        tenantId: ctx.tenant?.id ?? null,
        constructionJobId: input.constructionJobId,
        clientName,
        clientEmail,
        token,
        isActive: true,
      });

      return { token, created: true };
    }),

  // ─── Portal Documents Management ──────────────────────────────────────────

  listDocuments: adminProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input?.jobId) {
        await assertPortalJobAccess(ctx, input.jobId);
        return db.select().from(portalDocuments)
          .where(eq(portalDocuments.constructionJobId, input.jobId))
          .orderBy(desc(portalDocuments.createdAt));
      }
      const conditions: any[] = [];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const rows = await db.select({ document: portalDocuments }).from(portalDocuments)
        .innerJoin(constructionJobs, eq(portalDocuments.constructionJobId, constructionJobs.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(portalDocuments.createdAt));
      return rows.map(r => r.document);
    }),

  uploadDocument: adminProcedure
    .input(z.object({
      constructionJobId: z.number(),
      title: z.string().min(1),
      category: z.enum(["contract", "plans", "variation", "invoice", "photos", "other"]),
      fileUrl: z.string().url(),
      fileKey: z.string().optional(),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertPortalJobAccess(ctx, input.constructionJobId);
      const [result] = await db.insert(portalDocuments).values({
        constructionJobId: input.constructionJobId,
        title: input.title,
        category: input.category,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey || null,
        mimeType: input.mimeType || null,
        uploadedBy: ctx.user!.id,
      }).$returningId();

      // Push notification to client portal users
      triggerPushDocumentUploaded(input.constructionJobId, input.title);

      return { id: result.id };
    }),

  deleteDocument: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(portalDocuments.id, input.id)];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const [doc] = await db.select({ id: portalDocuments.id })
        .from(portalDocuments)
        .innerJoin(constructionJobs, eq(portalDocuments.constructionJobId, constructionJobs.id))
        .where(and(...conditions));
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      await db.delete(portalDocuments).where(eq(portalDocuments.id, input.id));
      return { success: true };
    }),

  // ─── Photo Comments (Admin Side) ─────────────────────────────────────────

  getPhotoComments: adminProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select()
        .from(portalPhotoComments)
        .where(eq(portalPhotoComments.documentId, input.documentId))
        .orderBy(desc(portalPhotoComments.createdAt));
    }),

  replyToPhotoComment: adminProcedure
    .input(z.object({
      documentId: z.number(),
      comment: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(portalPhotoComments).values({
        documentId: input.documentId,
        authorName: ctx.user!.name || "Admin",
        authorType: "admin",
        comment: input.comment,
        reaction: null,
      });

      // Send email notification to client
      try {
        // Find the document to get the job context
        const [doc] = await db.select().from(portalDocuments)
          .where(eq(portalDocuments.id, input.documentId));
        if (doc?.constructionJobId) {
          // Find the portal access for this job to get client email
          const [access] = await db.select().from(portalAccess)
            .where(and(
              eq(portalAccess.constructionJobId, doc.constructionJobId),
              eq(portalAccess.isActive, true)
            ));
          if (access?.clientEmail) {
            const adminName = ctx.user!.name || "Your project team";
            await sendNotificationEmail({
              to: access.clientEmail,
              subject: `New reply on your photo - ${doc.title || "Project Photo"}`,
              htmlBody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #1e293b; margin-bottom: 16px;">Hi ${access.clientName},</h2>
                  <p style="color: #334155; line-height: 1.6;">${adminName} has replied to your comment on a photo in your project portal:</p>
                  <div style="background: #f1f5f9; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                    <p style="color: #1e293b; margin: 0; font-style: italic;">&ldquo;${input.comment}&rdquo;</p>
                  </div>
                  <p style="color: #334155; line-height: 1.6;">Log in to your Client Portal to view the full conversation and reply.</p>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                  <p style="color: #64748b; font-size: 12px;">This notification was sent from Altaspan. If you no longer wish to receive these emails, you can update your preferences in the Client Portal.</p>
                </div>
              `,
            });
          }
        }
      } catch (emailErr) {
        console.error("[PhotoComment] Failed to send email notification:", emailErr);
        // Don't fail the mutation if email fails
      }

      return { id: result.insertId };
    }),

  deletePhotoComment: adminProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(portalPhotoComments)
        .where(eq(portalPhotoComments.id, input.commentId));
      return { success: true };
    }),

  // ─── Defects Management ────────────────────────────────────────────────────

  listDefects: adminProcedure
    .input(z.object({ jobId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input?.jobId) {
        await assertPortalJobAccess(ctx, input.jobId);
        return db.select().from(portalDefects)
          .where(eq(portalDefects.constructionJobId, input.jobId))
          .orderBy(desc(portalDefects.createdAt));
      }
      const conditions: any[] = [];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const rows = await db.select({ defect: portalDefects }).from(portalDefects)
        .innerJoin(constructionJobs, eq(portalDefects.constructionJobId, constructionJobs.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(portalDefects.createdAt));
      return rows.map(r => r.defect);
    }),

  updateDefectStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["reported", "acknowledged", "scheduled", "resolved"]),
      resolutionNotes: z.string().optional(),
      resolutionPhotoUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(portalDefects.id, input.id)];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const [defect] = await db.select({ id: portalDefects.id })
        .from(portalDefects)
        .innerJoin(constructionJobs, eq(portalDefects.constructionJobId, constructionJobs.id))
        .where(and(...conditions));
      if (!defect) throw new TRPCError({ code: "NOT_FOUND", message: "Defect not found" });
      const updates: any = { status: input.status };
      if (input.resolutionNotes !== undefined) updates.resolutionNotes = input.resolutionNotes;
      if (input.resolutionPhotoUrls !== undefined) updates.resolutionPhotoUrls = input.resolutionPhotoUrls;
      if (input.status === "resolved") updates.resolvedAt = new Date();
      await db.update(portalDefects)
        .set(updates)
        .where(eq(portalDefects.id, input.id));
      return { success: true };
    }),

  // ─── Maintenance Requests Management ───────────────────────────────────────

  listMaintenanceRequests: adminProcedure
    .input(z.object({ jobId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input?.jobId) {
        await assertPortalJobAccess(ctx, input.jobId);
        return db.select().from(portalMaintenanceRequests)
          .where(eq(portalMaintenanceRequests.constructionJobId, input.jobId))
          .orderBy(desc(portalMaintenanceRequests.createdAt));
      }
      const conditions: any[] = [];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const rows = await db.select({ request: portalMaintenanceRequests }).from(portalMaintenanceRequests)
        .innerJoin(constructionJobs, eq(portalMaintenanceRequests.constructionJobId, constructionJobs.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(portalMaintenanceRequests.createdAt));
      return rows.map(r => r.request);
    }),

  updateMaintenanceStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["submitted", "reviewed", "scheduled", "completed"]),
      scheduledDate: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(portalMaintenanceRequests.id, input.id)];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const [request] = await db.select({ id: portalMaintenanceRequests.id })
        .from(portalMaintenanceRequests)
        .innerJoin(constructionJobs, eq(portalMaintenanceRequests.constructionJobId, constructionJobs.id))
        .where(and(...conditions));
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Maintenance request not found" });
      const updates: any = { status: input.status };
      if (input.scheduledDate) updates.scheduledDate = input.scheduledDate;
      if (input.status === "completed") updates.completedAt = new Date();
      await db.update(portalMaintenanceRequests)
        .set(updates)
        .where(eq(portalMaintenanceRequests.id, input.id));
      return { success: true };
    }),

  // ─── News Articles CMS ─────────────────────────────────────────────────────

  listNews: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(portalNews)
      .where(and(...portalNewsConditions(ctx)))
      .orderBy(desc(portalNews.createdAt));
  }),

  createNewsArticle: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      slug: z.string().min(1),
      excerpt: z.string().optional(),
      content: z.string().min(1),
      coverImageUrl: z.string().optional(),
      category: z.string().optional(),
      isPublished: z.boolean().default(false),
      portalType: z.enum(["client", "trade", "da", "both", "all"]).default("client"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(portalNews).values({
        tenantId: ctx.tenant?.id ?? null,
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt || null,
        content: input.content,
        coverImageUrl: input.coverImageUrl || null,
        category: input.category || null,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
        authorId: ctx.user!.id,
        portalType: input.portalType,
      }).$returningId();

      // Push notification to all client portal users when published
      if (input.isPublished) {
        triggerPushClientNewsPublished(input.title);
      }

      return { id: result.id };
    }),

  updateNewsArticle: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      slug: z.string().optional(),
      excerpt: z.string().optional(),
      content: z.string().optional(),
      coverImageUrl: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      isPublished: z.boolean().optional(),
      portalType: z.enum(["client", "trade", "da", "both", "all"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...updates } = input;
      const setData: any = { ...updates };
      if (updates.isPublished === true) {
        const [existing] = await db.select({ publishedAt: portalNews.publishedAt })
          .from(portalNews).where(and(...portalNewsConditions(ctx, eq(portalNews.id, id)))).limit(1);
        if (!existing?.publishedAt) setData.publishedAt = new Date();
      }
      await db.update(portalNews).set(setData).where(and(...portalNewsConditions(ctx, eq(portalNews.id, id))));
      return { success: true };
    }),

  deleteNewsArticle: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(portalNews).where(and(...portalNewsConditions(ctx, eq(portalNews.id, input.id))));
      return { success: true };
    }),

  // ─── Products CMS ──────────────────────────────────────────────────────────

  listProducts: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(portalProducts)
      .where(and(...portalProductConditions(ctx)))
      .orderBy(portalProducts.sortOrder);
  }),

  createProduct: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      category: z.string().optional(),
      priceFrom: z.string().optional(),
      ctaLabel: z.string().optional(),
      ctaUrl: z.string().optional(),
      isActive: z.boolean().default(true),
      isFeatured: z.boolean().default(false),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(portalProducts).values({
        tenantId: ctx.tenant?.id ?? null,
        name: input.name,
        description: input.description || null,
        imageUrl: input.imageUrl || null,
        category: input.category || null,
        priceFrom: input.priceFrom || null,
        ctaLabel: input.ctaLabel || null,
        ctaUrl: input.ctaUrl || null,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
        sortOrder: input.sortOrder || 0,
      }).$returningId();
      return { id: result.id };
    }),

  updateProduct: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      priceFrom: z.string().nullable().optional(),
      ctaLabel: z.string().nullable().optional(),
      ctaUrl: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...updates } = input;
      await db.update(portalProducts).set(updates as any).where(and(...portalProductConditions(ctx, eq(portalProducts.id, id))));
      return { success: true };
    }),

  deleteProduct: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(portalProducts).where(and(...portalProductConditions(ctx, eq(portalProducts.id, input.id))));
      return { success: true };
    }),

  // ─── CPC Plans Management ─────────────────────────────────────────────────

  listPlans: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conditions: any[] = [];
    appendTenantScope(conditions, cpcPlans.tenantId, tenantIdFromContext(ctx));
    return db.select().from(cpcPlans)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(cpcPlans.sortOrder);
  }),

  createPlan: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      frequency: z.enum(["annual", "seasonal", "premium"]),
      priceSmall: z.string(),
      priceMedium: z.string(),
      priceLarge: z.string(),
      features: z.array(z.string()).optional(),
      isActive: z.boolean().default(true),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(cpcPlans).values({
        tenantId: ctx.tenant?.id ?? null,
        name: input.name,
        description: input.description || null,
        frequency: input.frequency,
        priceSmall: input.priceSmall,
        priceMedium: input.priceMedium,
        priceLarge: input.priceLarge,
        features: input.features || null,
        isActive: input.isActive,
        sortOrder: input.sortOrder || 0,
      }).$returningId();
      return { id: result.id };
    }),

  updatePlan: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      priceSmall: z.string().optional(),
      priceMedium: z.string().optional(),
      priceLarge: z.string().optional(),
      features: z.array(z.string()).nullable().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...updates } = input;
      const conditions = [eq(cpcPlans.id, id)];
      appendTenantScope(conditions, cpcPlans.tenantId, tenantIdFromContext(ctx));
      await db.update(cpcPlans).set(updates as any).where(and(...conditions));
      return { success: true };
    }),

  // ─── Portal Contacts Management ───────────────────────────────────────────

  listContactUsers: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const tenantId = tenantIdFromContext(ctx);
    if (!tenantId) return [];

    const tenantUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    }).from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, tenantId))
      .orderBy(users.name);

    const staffRows = await db.select({
      id: designAdvisors.id,
      userId: designAdvisors.userId,
      name: designAdvisors.name,
      email: designAdvisors.email,
      phone: designAdvisors.phone,
      role: designAdvisors.role,
      profileDescription: designAdvisors.profileDescription,
      photoUrl: designAdvisors.photoUrl,
      archived: designAdvisors.archived,
    }).from(designAdvisors)
      .where(and(eq(designAdvisors.tenantId, tenantId), eq(designAdvisors.archived, false)))
      .orderBy(designAdvisors.name);

    const staffByUserId = new Map(staffRows.filter((staff) => staff.userId).map((staff) => [staff.userId!, staff]));
    const staffByEmail = new Map(staffRows
      .filter((staff) => normaliseEmail(staff.email))
      .map((staff) => [normaliseEmail(staff.email), staff]));
    const matchedStaffIds = new Set<number>();

    const contactUsers: Array<{
      key: string;
      source: "user" | "staff";
      userId: number | null;
      staffId: number;
      name: string;
      email: string | null;
      phone: string | null;
      role: string | null;
      roleLabel: string;
      profileDescription: string | null;
      photoUrl: string | null;
    }> = tenantUsers.map((tenantUser) => {
      const matchingStaff = staffByUserId.get(tenantUser.id) ?? staffByEmail.get(normaliseEmail(tenantUser.email));
      if (matchingStaff) matchedStaffIds.add(matchingStaff.id);
      const role = matchingStaff?.role || tenantUser.role;
      return {
        key: `user:${tenantUser.id}`,
        source: "user" as const,
        userId: tenantUser.id,
        staffId: matchingStaff?.id ?? tenantUser.id,
        name: tenantUser.name || tenantUser.email || `User #${tenantUser.id}`,
        email: tenantUser.email || matchingStaff?.email || null,
        phone: matchingStaff?.phone || null,
        role,
        roleLabel: contactRoleTitle(role),
        profileDescription: matchingStaff?.profileDescription || null,
        photoUrl: matchingStaff?.photoUrl || null,
      };
    });

    for (const staff of staffRows) {
      if (matchedStaffIds.has(staff.id)) continue;
      contactUsers.push({
        key: `staff:${staff.id}`,
        source: "staff" as const,
        userId: null,
        staffId: staff.id,
        name: staff.name,
        email: staff.email || null,
        phone: staff.phone || null,
        role: staff.role,
        roleLabel: contactRoleTitle(staff.role),
        profileDescription: staff.profileDescription || null,
        photoUrl: staff.photoUrl || null,
      });
    }

    return contactUsers.sort((a, b) => a.name.localeCompare(b.name));
  }),

  listContacts: adminProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertPortalJobAccess(ctx, input.jobId);
      return db.select().from(portalContacts)
        .where(eq(portalContacts.constructionJobId, input.jobId))
        .orderBy(portalContacts.sortOrder);
    }),

  upsertContact: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      constructionJobId: z.number(),
      staffId: z.number().nullable().optional(),
      name: z.string().min(1),
      role: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().optional(),
      profileDescription: z.string().optional(),
      photoUrl: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertPortalJobAccess(ctx, input.constructionJobId);
      if (input.id) {
        const { id, ...updates } = input;
        const conditions = [eq(portalContacts.id, id)];
        appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
        const [contact] = await db.select({ id: portalContacts.id })
          .from(portalContacts)
          .innerJoin(constructionJobs, eq(portalContacts.constructionJobId, constructionJobs.id))
          .where(and(...conditions));
        if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        await db.update(portalContacts).set(updates as any).where(eq(portalContacts.id, id));
        return { id };
      } else {
        const [result] = await db.insert(portalContacts).values({
          constructionJobId: input.constructionJobId,
          staffId: input.staffId || null,
          name: input.name,
          role: input.role,
          phone: input.phone || null,
          email: input.email || null,
          profileDescription: input.profileDescription || null,
          photoUrl: input.photoUrl || null,
          sortOrder: input.sortOrder || 0,
        }).$returningId();
        return { id: result.id };
      }
    }),

  deleteContact: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(portalContacts.id, input.id)];
      appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
      const [contact] = await db.select({ id: portalContacts.id })
        .from(portalContacts)
        .innerJoin(constructionJobs, eq(portalContacts.constructionJobId, constructionJobs.id))
        .where(and(...conditions));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await db.delete(portalContacts).where(eq(portalContacts.id, input.id));
      return { success: true };
    }),

  // ─── Variations Management ─────────────────────────────────────────────────

  createVariation: adminProcedure
    .input(z.object({
      constructionJobId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      costImpact: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertPortalJobAccess(ctx, input.constructionJobId);
      const [result] = await db.insert(portalVariations).values({
        constructionJobId: input.constructionJobId,
        title: input.title,
        description: input.description || null,
        costImpact: input.costImpact || "0",
        status: "pending",
      }).$returningId();

      // Push notification to client portal users
      triggerPushVariationCreated(input.constructionJobId, input.title);

      return { id: result.id };
    }),

  // ─── Construction Jobs for dropdown ────────────────────────────────────────

  listJobs: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conditions: any[] = [];
    appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
    return db.select({
      id: constructionJobs.id,
      quoteNumber: constructionJobs.quoteNumber,
      clientName: constructionJobs.clientName,
      status: constructionJobs.status,
    }).from(constructionJobs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(constructionJobs.createdAt));
  }),
});
