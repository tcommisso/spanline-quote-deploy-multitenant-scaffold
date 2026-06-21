import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, getTenantBrandingSettings } from "./db";
import { eq, and, desc, gte, lte, asc, or, inArray, gt, sql } from "drizzle-orm";
import {
  tradePortalAccess, tradePortalSessions,
  tradeAvailabilities, tradeInvoices, tradeRemittances,
  tradePhotos, tradeMessages, tradeInvoicePhotos,
  constructionInstallers, constructionJobs, constructionScheduleEvents,
  constructionAssignments, jobSharedFiles, quotes,
  portalNews, poMilestones, cmWorkOrders,
  projectSubcontracts, tradeInvoiceLines,
  chatChannels, chatMessages, chatChannelMembers,
  type PaymentMilestone,
} from "../drizzle/schema";
import { publicProcedure, router, middleware } from "./_core/trpc";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import crypto from "crypto";
import { getCompanyName } from "./company-name";
import { triggerPushTradeInvoiceSubmitted } from "./push-triggers";
import { logNotification } from "./notification-gateway";
import { assertRateLimit } from "./_core/rateLimit";
import { buildTrustedAppUrlForTenant } from "./_core/url";
import { appendTenantScope, isRecordVisibleToTenant, tenantIdFromContext } from "./_core/tenant-scope";
import { sendNotificationEmail } from "./email";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateToken(length = 64): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

function appendExactQuoteTenantScope(conditions: any[], column: any, tenantId: number | null | undefined) {
  conditions.push(tenantId ? eq(column, tenantId) : sql`1 = 0`);
}

function tradePortalAccessConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, tradePortalAccess.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tradePortalTenantId(ctx: any) {
  return ctx.tradeAccess?.tenantId ?? tenantIdFromContext(ctx);
}

function tradePortalCmsConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, portalNews.tenantId, tradePortalTenantId(ctx));
  return conditions;
}

function requireTradeAccessVisible(
  ctx: any,
  access: typeof tradePortalAccess.$inferSelect | null | undefined,
) {
  if (!access || !isRecordVisibleToTenant(access.tenantId, tenantIdFromContext(ctx))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired link" });
  }
  return access;
}

function tradeInstallerConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tradeJobConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireTradeJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select().from(constructionJobs)
    .where(and(...tradeJobConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }

  const installerId = ctx.tradeAccess.installerId;
  const [assignment] = await db.select({ id: constructionAssignments.id })
    .from(constructionAssignments)
    .where(and(
      eq(constructionAssignments.jobId, jobId),
      eq(constructionAssignments.installerId, installerId),
    ))
    .limit(1);

  if (assignment) return job;

  const [scheduledEvent] = await db.select({ id: constructionScheduleEvents.id })
    .from(constructionScheduleEvents)
    .where(and(
      eq(constructionScheduleEvents.jobId, jobId),
      eq(constructionScheduleEvents.assignedInstallerId, installerId),
    ))
    .limit(1);

  if (!scheduledEvent) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this job" });
  }

  return job;
}

async function requireOptionalTradeJobAccess(db: any, ctx: any, jobId?: number | null) {
  if (!jobId) return null;
  return requireTradeJobAccess(db, ctx, jobId);
}

async function getVisibleTradeJobIds(db: any, ctx: any, installerId: number) {
  const assignmentRows = await db.select({ jobId: constructionJobs.id })
    .from(constructionJobs)
    .innerJoin(constructionAssignments, eq(constructionAssignments.jobId, constructionJobs.id))
    .where(and(...tradeJobConditions(ctx, eq(constructionAssignments.installerId, installerId))));

  const scheduleRows = await db.select({ jobId: constructionJobs.id })
    .from(constructionJobs)
    .innerJoin(constructionScheduleEvents, eq(constructionScheduleEvents.jobId, constructionJobs.id))
    .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, installerId))));

  return Array.from(new Set([
    ...assignmentRows.map((row: { jobId: number }) => row.jobId),
    ...scheduleRows.map((row: { jobId: number }) => row.jobId),
  ]));
}

async function requireWorkOrderAccess(db: any, ctx: any, workOrderId: number) {
  const [workOrder] = await db.select()
    .from(cmWorkOrders)
    .where(eq(cmWorkOrders.id, workOrderId))
    .limit(1);
  if (!workOrder) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
  }
  await requireTradeJobAccess(db, ctx, workOrder.jobId);
  return workOrder;
}

async function requireSubcontractAccess(db: any, ctx: any, subcontractId: number) {
  const [subcontract] = await db.select()
    .from(projectSubcontracts)
    .where(eq(projectSubcontracts.id, subcontractId))
    .limit(1);
  if (!subcontract) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Subcontract not found" });
  }
  await requireTradeJobAccess(db, ctx, subcontract.jobId);
  if (
    subcontract.installerId !== ctx.tradeAccess.installerId &&
    subcontract.status !== "signed"
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Subcontract is not available to this trade" });
  }
  return subcontract;
}

// ─── Trade Portal Auth Middleware ────────────────────────────────────────────

const requireTradePortalAccess = middleware(async ({ ctx, next }) => {
  if (!ctx.tradePortalAccess) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Trade portal session expired or invalid" });
  }
  return next({
    ctx: {
      ...ctx,
      tradeAccess: ctx.tradePortalAccess,
    },
  });
});

const publicTradePortalProcedure = publicProcedure;
const protectedTradePortalProcedure = publicProcedure.use(requireTradePortalAccess);

// ─── Trade Portal Router ────────────────────────────────────────────────────

export const tradePortalRouter = router({

  // ─── Branding (public — no auth required) ──────────────────────────────────
  getBranding: publicTradePortalProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant?.id ?? null;
    const branding = await getTenantBrandingSettings(tenantId);
    const companyInfo = await getCompanyName(tenantId);
    return {
      companyName: companyInfo.displayName,
      logoUrl: branding?.customLogoUrl ?? null,
      appIconUrl: branding?.appIconUrl ?? null,
    };
  }),

  // ─── Auth ───────────────────────────────────────────────────────────────────

  requestMagicLink: publicTradePortalProcedure
    .input(z.object({ email: z.string().email(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertRateLimit({
        key: `trade-portal-magic:${input.email.toLowerCase()}:${ctx.req.ip}`,
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      const db = await requireDb();
      const conditions = tradePortalAccessConditions(
        ctx,
        eq(tradePortalAccess.email, input.email),
        eq(tradePortalAccess.isActive, true),
      );
      const [access] = await db
        .select()
        .from(tradePortalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) {
        // Don't reveal whether email exists
        return { success: true, message: "If an account exists, a login link has been sent." };
      }

      const sessionToken = generateToken();
      const magicLinkToken = generateToken(32);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

      await db.insert(tradePortalSessions).values({
        tradePortalAccessId: access.id,
        sessionToken,
        magicLinkToken,
        magicLinkExpiresAt: expiresAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      const magicLinkUrl = await buildTrustedAppUrlForTenant(
        ctx.req,
        access.tenantId,
        `/trade-portal/login?magic=${encodeURIComponent(magicLinkToken)}`,
        input.origin
      );

      try {
        // Get installer name
        const [installer] = await db.select().from(constructionInstallers)
          .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId)))).limit(1);

        const result = await sendNotificationEmail({
          tenantId: access.tenantId,
          to: input.email,
          subject: "Your Altaspan Trade Portal Login Link",
          htmlBody: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #1a1a1a;">Altaspan Trade Portal</h2>
                  <p>Hi ${installer?.name || "there"},</p>
                  <p>Click the button below to access your trade portal:</p>
                  <a href="${magicLinkUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a1a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">
                    Access Trade Portal
                  </a>
                  <p style="color: #666; font-size: 14px;">This link expires in 30 minutes.</p>
                </div>
              `,
          module: "admin",
        });
        await logNotification(
          { settingKey: "trade_portal.magic_link", channel: "email", recipientType: "trade", recipientId: input.email, title: "Trade Portal Login Link" },
          result.success ? "sent" : "failed",
          result.error
        );
      } catch (e: any) {
        console.error("Failed to send trade portal magic link email:", e);
        await logNotification(
          { settingKey: "trade_portal.magic_link", channel: "email", recipientType: "trade", recipientId: input.email, title: "Trade Portal Login Link" },
          "failed",
          e?.message || "Unknown error"
        ).catch(() => {});
      }

      return { success: true, message: "If an account exists, a login link has been sent." };
    }),

  verifyMagicLink: publicTradePortalProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [session] = await db
        .select()
        .from(tradePortalSessions)
        .where(eq(tradePortalSessions.magicLinkToken, input.token))
        .limit(1);

      if (!session || !session.magicLinkExpiresAt || session.magicLinkExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired link" });
      }

      const [rawAccess] = await db.select().from(tradePortalAccess)
        .where(and(
          eq(tradePortalAccess.id, session.tradePortalAccessId),
          eq(tradePortalAccess.isActive, true),
        )).limit(1);
      const access = requireTradeAccessVisible(ctx, rawAccess);

      await db.update(tradePortalSessions)
        .set({ magicLinkToken: null, magicLinkExpiresAt: null })
        .where(eq(tradePortalSessions.id, session.id));

      await db.update(tradePortalAccess)
        .set({ lastAccessedAt: new Date() })
        .where(eq(tradePortalAccess.id, access.id));

      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId)))).limit(1);

      return {
        sessionToken: session.sessionToken,
        installerName: installer?.name || "Trade User",
      };
    }),

  verifyToken: publicTradePortalProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = tradePortalAccessConditions(
        ctx,
        eq(tradePortalAccess.accessToken, input.token),
        eq(tradePortalAccess.isActive, true),
      );
      const [access] = await db
        .select()
        .from(tradePortalAccess)
        .where(and(...conditions))
        .limit(1);

      if (!access) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid access token" });
      }

      const sessionToken = generateToken();
      await db.insert(tradePortalSessions).values({
        tradePortalAccessId: access.id,
        sessionToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await db.update(tradePortalAccess)
        .set({ lastAccessedAt: new Date() })
        .where(eq(tradePortalAccess.id, access.id));

      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, access.installerId)))).limit(1);

      return {
        sessionToken,
        installerName: installer?.name || "Trade User",
      };
    }),

  // ─── Me (session info) ──────────────────────────────────────────────────────

  me: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [installer] = await db.select().from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId)))).limit(1);

    return {
      installerId: ctx.tradeAccess.installerId,
      installerName: installer?.name || "Trade User",
      installerEmail: ctx.tradeAccess.email,
      phone: installer?.phone || null,
      tradeType: installer?.tradeType || null,
      speciality: installer?.speciality || null,
    };
  }),

  // ─── Dashboard (Job Details) ────────────────────────────────────────────────

  dashboard: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;

    // Get assigned jobs via schedule events
    const events = await db
      .select({
        eventId: constructionScheduleEvents.id,
        eventTitle: constructionScheduleEvents.title,
        eventType: constructionScheduleEvents.eventType,
        startTime: constructionScheduleEvents.startTime,
        endTime: constructionScheduleEvents.endTime,
        eventStatus: constructionScheduleEvents.status,
        jobId: constructionJobs.id,
        quoteNumber: constructionJobs.quoteNumber,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        jobStatus: constructionJobs.status,
      })
      .from(constructionScheduleEvents)
      .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
      .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, installerId))))
      .orderBy(desc(constructionScheduleEvents.startTime))
      .limit(50);

    const visibleJobIds = tenantIdFromContext(ctx)
      ? await getVisibleTradeJobIds(db, ctx, installerId)
      : [];

    // Count unread messages
    const messageConditions = [
      eq(tradeMessages.installerId, installerId),
      eq(tradeMessages.direction, "outbound"),
    ];
    if (tenantIdFromContext(ctx)) {
      if (visibleJobIds.length === 0) {
        messageConditions.push(sql`1 = 0`);
      } else {
        messageConditions.push(inArray(tradeMessages.jobId, visibleJobIds));
      }
    }
    const allMessages = await db.select({ id: tradeMessages.id, readAt: tradeMessages.readAt, direction: tradeMessages.direction })
      .from(tradeMessages)
      .where(and(...messageConditions));
    const unreadMessages = allMessages.filter(m => !m.readAt).length;

    // Count pending invoices
    const invoiceConditions = [eq(tradeInvoices.installerId, installerId)];
    if (tenantIdFromContext(ctx)) {
      if (visibleJobIds.length === 0) {
        invoiceConditions.push(sql`1 = 0`);
      } else {
        invoiceConditions.push(inArray(tradeInvoices.jobId, visibleJobIds));
      }
    }
    const invoices = await db.select({ id: tradeInvoices.id, status: tradeInvoices.status })
      .from(tradeInvoices)
      .where(and(...invoiceConditions));
    const pendingInvoices = invoices.filter(i => i.status === "submitted" || i.status === "under_review").length;

    // Upcoming events (next 14 days)
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcoming = events.filter(e => e.startTime >= now && e.startTime <= twoWeeks);

    // Unique active jobs
    const uniqueJobs = new Map<number, typeof events[0]>();
    events.forEach(e => {
      if (e.jobId && !uniqueJobs.has(e.jobId)) uniqueJobs.set(e.jobId, e);
    });

    const activeJobsList = Array.from(uniqueJobs.values()).filter(j => j.jobStatus !== "completed" && j.jobStatus !== "cancelled");

    // Get subcontract info for active jobs
    const activeJobIds = activeJobsList.map(j => j.jobId).filter(Boolean) as number[];
    let subcontractMap: Record<number, { count: number; signedCount: number; totalValue: number }> = {};
    if (activeJobIds.length > 0) {
      const subcontracts = await db.select({
        jobId: projectSubcontracts.jobId,
        status: projectSubcontracts.status,
        subcontractSum: projectSubcontracts.subcontractSum,
      }).from(projectSubcontracts)
        .where(and(
          inArray(projectSubcontracts.jobId, activeJobIds),
          eq(projectSubcontracts.installerId, installerId),
        ));
      for (const sc of subcontracts) {
        if (!subcontractMap[sc.jobId]) subcontractMap[sc.jobId] = { count: 0, signedCount: 0, totalValue: 0 };
        subcontractMap[sc.jobId].count++;
        if (sc.status === "signed") subcontractMap[sc.jobId].signedCount++;
        subcontractMap[sc.jobId].totalValue += parseFloat(sc.subcontractSum || "0");
      }
    }

    return {
      activeJobs: activeJobsList.map(j => ({
        ...j,
        subcontracts: subcontractMap[j.jobId!] || null,
      })),
      upcomingEvents: upcoming.slice(0, 10),
      unreadMessages,
      pendingInvoices,
      totalJobs: uniqueJobs.size,
    };
  }),

  // ─── Schedule ───────────────────────────────────────────────────────────────

  getSchedule: protectedTradePortalProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      let query = db
        .select({
          id: constructionScheduleEvents.id,
          title: constructionScheduleEvents.title,
          description: constructionScheduleEvents.description,
          startTime: constructionScheduleEvents.startTime,
          endTime: constructionScheduleEvents.endTime,
          allDay: constructionScheduleEvents.allDay,
          eventType: constructionScheduleEvents.eventType,
          status: constructionScheduleEvents.status,
          jobId: constructionJobs.id,
          quoteNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
        })
        .from(constructionScheduleEvents)
        .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
        .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, installerId))))
        .orderBy(asc(constructionScheduleEvents.startTime))
        .$dynamic();

      const results = await query;

      // Filter by date range if provided
      if (input?.startDate || input?.endDate) {
        const start = input.startDate ? new Date(input.startDate) : new Date(0);
        const end = input.endDate ? new Date(input.endDate) : new Date("2099-12-31");
        return results.filter(e => e.startTime >= start && e.startTime <= end);
      }

      return results;
    }),

  // ─── Availabilities ─────────────────────────────────────────────────────────

  getAvailabilities: protectedTradePortalProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2050),
    }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

      return db.select()
        .from(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.installerId, ctx.tradeAccess.installerId),
          gte(tradeAvailabilities.date, startDate),
          lte(tradeAvailabilities.date, endDate),
        ))
        .orderBy(asc(tradeAvailabilities.date));
    }),

  setAvailability: protectedTradePortalProcedure
    .input(z.object({
      date: z.string(),
      status: z.enum(["available", "unavailable", "partial"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const dateObj = new Date(input.date);

      // Check if entry exists for this date
      const [existing] = await db.select()
        .from(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.installerId, installerId),
          eq(tradeAvailabilities.date, dateObj),
        ))
        .limit(1);

      if (existing) {
        await db.update(tradeAvailabilities)
          .set({ status: input.status, notes: input.notes || null })
          .where(eq(tradeAvailabilities.id, existing.id));
        return { id: existing.id };
      } else {
        const [result] = await db.insert(tradeAvailabilities).values({
          installerId,
          date: dateObj,
          status: input.status,
          notes: input.notes || null,
        });
        return { id: result.insertId };
      }
    }),

  removeAvailability: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(tradeAvailabilities)
        .where(and(
          eq(tradeAvailabilities.id, input.id),
          eq(tradeAvailabilities.installerId, ctx.tradeAccess.installerId),
        ));
      return { success: true };
    }),

  // ─── Contact Details ────────────────────────────────────────────────────────

  getContactDetails: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [installer] = await db.select().from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId)))).limit(1);
    return installer || null;
  }),

  updateContactDetails: protectedTradePortalProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      abn: z.string().optional(),
      address: z.string().optional(),
      bankBsb: z.string().optional(),
      bankAccount: z.string().optional(),
      bankName: z.string().optional(),
      emergencyContact: z.string().optional(),
      emergencyPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const updateFields: Record<string, any> = {};
      if (input.name) updateFields.name = input.name;
      if (input.phone !== undefined) updateFields.phone = input.phone;
      if (input.email !== undefined) updateFields.email = input.email;
      if (input.abn !== undefined) updateFields.abn = input.abn;
      if (input.address !== undefined) updateFields.address = input.address;
      if (input.bankBsb !== undefined) updateFields.bankBsb = input.bankBsb;
      if (input.bankAccount !== undefined) updateFields.bankAccount = input.bankAccount;
      if (input.bankName !== undefined) updateFields.bankName = input.bankName;
      if (input.emergencyContact !== undefined) updateFields.emergencyContact = input.emergencyContact;
      if (input.emergencyPhone !== undefined) updateFields.emergencyPhone = input.emergencyPhone;
      await db.update(constructionInstallers)
        .set(updateFields)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, ctx.tradeAccess.installerId))));

      // Also update trade portal access email if changed
      if (input.email) {
        await db.update(tradePortalAccess)
          .set({ email: input.email })
          .where(eq(tradePortalAccess.id, ctx.tradeAccess.id));
      }

      return { success: true };
    }),

  // ─── Remittance Advice ──────────────────────────────────────────────────────

  getRemittances: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select()
      .from(tradeRemittances)
      .where(eq(tradeRemittances.installerId, ctx.tradeAccess.installerId))
      .orderBy(desc(tradeRemittances.date));
  }),

  // ─── Invoice Submission ─────────────────────────────────────────────────────

  getInvoices: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const conditions = [eq(tradeInvoices.installerId, ctx.tradeAccess.installerId)];
    if (tenantIdFromContext(ctx)) {
      const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
      if (jobIds.length === 0) return [];
      conditions.push(inArray(tradeInvoices.jobId, jobIds));
    }
    return db.select()
      .from(tradeInvoices)
      .where(and(...conditions))
      .orderBy(desc(tradeInvoices.submittedAt));
  }),

  submitInvoice: protectedTradePortalProcedure
    .input(z.object({
      invoiceNumber: z.string().min(1),
      amount: z.string(),
      description: z.string().optional(),
      jobId: z.number().optional(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      if (tenantIdFromContext(ctx) && !input.jobId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is required for tenant-scoped invoice submission" });
      }
      await requireOptionalTradeJobAccess(db, ctx, input.jobId);

      // Upload file to S3
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-invoices/${installerId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const [result] = await db.insert(tradeInvoices).values({
        installerId,
        jobId: input.jobId || null,
        invoiceNumber: input.invoiceNumber,
        amount: input.amount,
        description: input.description || null,
        fileUrl,
        fileKey,
        status: "submitted",
      });

      // Push notification to staff
      const [installerInfo] = await db.select({ name: constructionInstallers.name })
        .from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
        .limit(1);
      triggerPushTradeInvoiceSubmitted(
        installerInfo?.name || "Trade",
        input.invoiceNumber,
        input.amount
      );

      return { id: result.insertId, fileUrl };
    }),

  // ─── Invoice Photos (Proof of Work) ─────────────────────────────────────────

  getInvoicePhotos: protectedTradePortalProcedure
    .input(z.object({ invoiceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db.select()
        .from(tradeInvoicePhotos)
        .where(and(
          eq(tradeInvoicePhotos.invoiceId, input.invoiceId),
          eq(tradeInvoicePhotos.installerId, ctx.tradeAccess.installerId),
        ))
        .orderBy(desc(tradeInvoicePhotos.uploadedAt));
    }),

  uploadInvoicePhoto: protectedTradePortalProcedure
    .input(z.object({
      invoiceId: z.number(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
      caption: z.string().optional(),
      stage: z.enum(["before", "during", "after"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      // Verify the invoice belongs to this installer
      const [invoice] = await db.select({ id: tradeInvoices.id, jobId: tradeInvoices.jobId })
        .from(tradeInvoices)
        .where(and(
          eq(tradeInvoices.id, input.invoiceId),
          eq(tradeInvoices.installerId, installerId),
        ))
        .limit(1);
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      await requireOptionalTradeJobAccess(db, ctx, invoice.jobId);

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-invoice-photos/${installerId}/${input.invoiceId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const [result] = await db.insert(tradeInvoicePhotos).values({
        invoiceId: input.invoiceId,
        installerId,
        fileUrl,
        fileKey,
        fileName: input.fileName,
        caption: input.caption || null,
        stage: input.stage || null,
      });

      return { id: result.insertId, fileUrl };
    }),

  deleteInvoicePhoto: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(tradeInvoicePhotos)
        .where(and(
          eq(tradeInvoicePhotos.id, input.id),
          eq(tradeInvoicePhotos.installerId, ctx.tradeAccess.installerId),
        ));
      return { success: true };
    }),

  // ─── News ───────────────────────────────────────────────────────────────────

  getNews: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select()
      .from(portalNews)
      .where(and(...tradePortalCmsConditions(
        ctx,
        eq(portalNews.isPublished, true),
        or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
      )))
      .orderBy(desc(portalNews.publishedAt))
      .limit(20);
  }),

  getNewsArticle: protectedTradePortalProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [article] = await db.select()
        .from(portalNews)
        .where(and(...tradePortalCmsConditions(
          ctx,
          eq(portalNews.slug, input.slug),
          eq(portalNews.isPublished, true),
          or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
        )))
        .limit(1);
      return article || null;
    }),

  // ─── Photos ─────────────────────────────────────────────────────────────────

  getPhotos: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(tradePhotos.installerId, ctx.tradeAccess.installerId)];
      if (input?.jobId) {
        await requireTradeJobAccess(db, ctx, input.jobId);
        conditions.push(eq(tradePhotos.jobId, input.jobId));
      } else if (tenantIdFromContext(ctx)) {
        const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
        if (jobIds.length === 0) return [];
        conditions.push(inArray(tradePhotos.jobId, jobIds));
      }
      return db.select()
        .from(tradePhotos)
        .where(and(...conditions))
        .orderBy(desc(tradePhotos.uploadedAt));
    }),

  uploadPhoto: protectedTradePortalProcedure
    .input(z.object({
      jobId: z.number().optional(),
      caption: z.string().optional(),
      category: z.enum(["progress", "issue", "completion", "before", "after", "other"]).default("progress"),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      if (tenantIdFromContext(ctx) && !input.jobId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is required for tenant-scoped photo uploads" });
      }
      await requireOptionalTradeJobAccess(db, ctx, input.jobId);

      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-photos/${installerId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const [result] = await db.insert(tradePhotos).values({
        installerId,
        jobId: input.jobId || null,
        fileUrl,
        fileKey,
        caption: input.caption || null,
        category: input.category,
      });

      return { id: result.insertId, fileUrl };
    }),

  deletePhoto: protectedTradePortalProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(tradePhotos)
        .where(and(
          eq(tradePhotos.id, input.id),
          eq(tradePhotos.installerId, ctx.tradeAccess.installerId),
        ));
      return { success: true };
    }),

  // ─── Messages ───────────────────────────────────────────────────────────────

  getMessages: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(tradeMessages.installerId, ctx.tradeAccess.installerId)];
      if (input?.jobId) {
        await requireTradeJobAccess(db, ctx, input.jobId);
        conditions.push(eq(tradeMessages.jobId, input.jobId));
      } else if (tenantIdFromContext(ctx)) {
        const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
        if (jobIds.length === 0) return [];
        conditions.push(inArray(tradeMessages.jobId, jobIds));
      }
      const messages = await db.select()
        .from(tradeMessages)
        .where(and(...conditions))
        .orderBy(asc(tradeMessages.createdAt));

      // Mark outbound (office → trade) messages as read
      const unreadOutbound = messages.filter(m => m.direction === "outbound" && !m.readAt);
      if (unreadOutbound.length > 0) {
        for (const msg of unreadOutbound) {
          await db.update(tradeMessages)
            .set({ readAt: new Date() })
            .where(eq(tradeMessages.id, msg.id));
        }
      }

      return messages;
    }),

  sendMessage: protectedTradePortalProcedure
    .input(z.object({
      content: z.string().min(1),
      jobId: z.number().optional(),
      attachmentBase64: z.string().optional(),
      attachmentName: z.string().optional(),
      attachmentMimeType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      if (tenantIdFromContext(ctx) && !input.jobId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is required for tenant-scoped trade messages" });
      }
      await requireOptionalTradeJobAccess(db, ctx, input.jobId);

      let attachmentUrl: string | null = null;
      let attachmentKey: string | null = null;

      if (input.attachmentBase64 && input.attachmentName) {
        const fileBuffer = Buffer.from(input.attachmentBase64, "base64");
        const suffix = crypto.randomBytes(4).toString("hex");
        const key = `trade-messages/${installerId}/${input.attachmentName}-${suffix}`;
        const { url } = await storagePut(key, fileBuffer, input.attachmentMimeType || "application/octet-stream");
        attachmentUrl = url;
        attachmentKey = key;
      }

      // Get installer name
      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId)))).limit(1);

      const [result] = await db.insert(tradeMessages).values({
        installerId,
        jobId: input.jobId || null,
        content: input.content,
        direction: "inbound",
        senderName: installer?.name || "Trade User",
        attachmentUrl,
        attachmentKey,
      });

      return { id: result.insertId };
    }),

  getActiveJobs: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const events = await db.select({
      jobId: constructionJobs.id,
      quoteNumber: constructionJobs.quoteNumber,
      clientName: constructionJobs.clientName,
      siteAddress: constructionJobs.siteAddress,
      status: constructionJobs.status,
    })
      .from(constructionScheduleEvents)
      .innerJoin(constructionJobs, eq(constructionScheduleEvents.jobId, constructionJobs.id))
      .where(and(...tradeJobConditions(ctx, eq(constructionScheduleEvents.assignedInstallerId, ctx.tradeAccess.installerId))));
    const uniqueJobs = new Map<number, typeof events[0]>();
    events.forEach(e => { if (e.jobId && !uniqueJobs.has(e.jobId)) uniqueJobs.set(e.jobId, e); });
    return Array.from(uniqueJobs.values()).filter(j => j.status !== "completed" && j.status !== "cancelled");
  }),

  markMessagesRead: protectedTradePortalProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const conditions = [
      eq(tradeMessages.installerId, ctx.tradeAccess.installerId),
      eq(tradeMessages.direction, "outbound"),
    ];
    if (tenantIdFromContext(ctx)) {
      const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
      if (jobIds.length === 0) return { success: true };
      conditions.push(inArray(tradeMessages.jobId, jobIds));
    }
    const unread = await db.select({ id: tradeMessages.id })
      .from(tradeMessages)
      .where(and(...conditions));
    for (const msg of unread) {
      await db.update(tradeMessages).set({ readAt: new Date() }).where(eq(tradeMessages.id, msg.id));
    }
    return { success: true };
  }),

  getUnreadCount: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const conditions = [
      eq(tradeMessages.installerId, ctx.tradeAccess.installerId),
      eq(tradeMessages.direction, "outbound"),
    ];
    if (tenantIdFromContext(ctx)) {
      const jobIds = await getVisibleTradeJobIds(db, ctx, ctx.tradeAccess.installerId);
      if (jobIds.length === 0) return { count: 0, news: 0 };
      conditions.push(inArray(tradeMessages.jobId, jobIds));
    }
    const messages = await db.select({ id: tradeMessages.id, readAt: tradeMessages.readAt })
      .from(tradeMessages)
      .where(and(...conditions));
    const unreadMessages = messages.filter(m => !m.readAt).length;

    // Count news articles newer than last viewed
    const newsArticles = await db.select({ id: portalNews.id })
      .from(portalNews)
      .where(
        ctx.tradeAccess.lastViewedNewsAt
          ? and(...tradePortalCmsConditions(
              ctx,
              eq(portalNews.isPublished, true),
              or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both")),
              gt(portalNews.publishedAt, ctx.tradeAccess.lastViewedNewsAt)
            ))
          : and(...tradePortalCmsConditions(
              ctx,
              eq(portalNews.isPublished, true),
              or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
            ))
      );
    return { count: unreadMessages, news: newsArticles.length };
  }),

  // ─── Work Orders & PO Milestones (Trade Portal) ───────────────────────
  getWorkOrders: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;
    // Get installer info to match by name/email
    const [installer] = await db.select()
      .from(constructionInstallers)
      .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
      .limit(1);
    if (!installer) return [];
    // Find work orders assigned to this trade (by email or name)
    const allOrders = await db.select()
      .from(cmWorkOrders)
      .where(eq(cmWorkOrders.assignedEmail, installer.email || ""))
      .orderBy(desc(cmWorkOrders.createdAt));
    const visibleOrders = [];
    for (const order of allOrders) {
      try {
        await requireTradeJobAccess(db, ctx, order.jobId);
        visibleOrders.push(order);
      } catch {
        // Hide work orders for jobs outside this tenant or assignment scope.
      }
    }
    return visibleOrders;
  }),

  getWorkOrderMilestones: protectedTradePortalProcedure
    .input(z.object({ workOrderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireWorkOrderAccess(db, ctx, input.workOrderId);
      return db.select()
        .from(poMilestones)
        .where(eq(poMilestones.workOrderId, input.workOrderId))
        .orderBy(asc(poMilestones.sortOrder));
    }),

  // Submit invoice with PO milestone linking
  submitInvoiceWithMilestone: protectedTradePortalProcedure
    .input(z.object({
      invoiceNumber: z.string().min(1),
      amount: z.string(),
      gstAmount: z.string().optional(),
      description: z.string().optional(),
      jobId: z.number(),
      workOrderId: z.number().optional(),
      milestoneId: z.number().optional(),
      subcontractId: z.number().optional(),
      subcontractMilestoneIndex: z.number().optional(),
      fileBase64: z.string(),
      fileName: z.string(),
      fileMimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      await requireTradeJobAccess(db, ctx, input.jobId);
      if (input.workOrderId) {
        const workOrder = await requireWorkOrderAccess(db, ctx, input.workOrderId);
        if (workOrder.jobId !== input.jobId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Work order does not belong to this job" });
        }
      }
      if (input.subcontractId != null) {
        const subcontract = await requireSubcontractAccess(db, ctx, input.subcontractId);
        if (subcontract.jobId !== input.jobId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Subcontract does not belong to this job" });
        }
      }
      if (input.milestoneId) {
        const [milestone] = await db.select({
          id: poMilestones.id,
          workOrderId: poMilestones.workOrderId,
          jobId: poMilestones.jobId,
        })
          .from(poMilestones)
          .where(and(
            eq(poMilestones.id, input.milestoneId),
            eq(poMilestones.jobId, input.jobId),
            ...(input.workOrderId ? [eq(poMilestones.workOrderId, input.workOrderId)] : []),
          ))
          .limit(1);
        if (!milestone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Milestone does not belong to this work order" });
        }
        await requireWorkOrderAccess(db, ctx, milestone.workOrderId);
      }

      // Upload file to S3
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `trade-invoices/${installerId}/${input.fileName}-${suffix}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, input.fileMimeType);

      const gstAmount = input.gstAmount || "0";
      const totalWithGst = String(parseFloat(input.amount) + parseFloat(gstAmount));

      const [result] = await db.insert(tradeInvoices).values({
        installerId,
        jobId: input.jobId,
        workOrderId: input.workOrderId || null,
        invoiceNumber: input.invoiceNumber,
        amount: input.amount,
        gstAmount,
        totalWithGst,
        description: input.description || null,
        fileUrl,
        fileKey,
        status: "submitted",
      });

      const invoiceId = Number(result.insertId);

      // Create an invoice line linked to subcontract milestone if specified
      let amountDiscrepancy: string | null = null;
      if (input.subcontractId != null && input.subcontractMilestoneIndex != null) {
        // Check milestone expected amount for discrepancy flagging
        const [sc] = await db.select()
          .from(projectSubcontracts)
          .where(eq(projectSubcontracts.id, input.subcontractId))
          .limit(1);
        if (sc && sc.paymentSchedule) {
          const milestone = (sc.paymentSchedule as any[])[input.subcontractMilestoneIndex];
          if (milestone) {
            const expectedAmount = milestone.usePercent
              ? ((milestone.percentOfTotal || 0) / 100) * parseFloat(sc.subcontractSum || "0")
              : milestone.amountDollars || 0;
            const invoiceAmount = parseFloat(input.amount);
            if (expectedAmount > 0 && Math.abs(invoiceAmount - expectedAmount) > 0.01) {
              amountDiscrepancy = `Invoice $${invoiceAmount.toFixed(2)} vs milestone expected $${expectedAmount.toFixed(2)}`;
            }
          }
        }
        const lineDesc = amountDiscrepancy
          ? `${input.description || "Milestone claim"} [AMOUNT MISMATCH: ${amountDiscrepancy}]`
          : input.description || `Milestone claim`;
        await db.insert(tradeInvoiceLines).values({
          invoiceId,
          lineNumber: 1,
          description: lineDesc,
          amount: input.amount,
          gstAmount: gstAmount,
          jobId: input.jobId,
          workOrderId: input.workOrderId || null,
          subcontractId: input.subcontractId,
          subcontractMilestoneIndex: input.subcontractMilestoneIndex,
        });
      }

      // If PO milestone specified, update its status to claimed
      if (input.milestoneId) {
        await db.update(poMilestones)
          .set({ status: "claimed", claimedAt: new Date(), invoiceLineId: invoiceId })
          .where(eq(poMilestones.id, input.milestoneId));
      }

      // Notify owner/supervisor that a new invoice has been submitted
      const [installerInfo] = await db.select({ name: constructionInstallers.name })
        .from(constructionInstallers)
        .where(and(...tradeInstallerConditions(ctx, eq(constructionInstallers.id, installerId))))
        .limit(1);
      notifyOwner({
        title: "New Trade Invoice Submitted",
        content: `${installerInfo?.name || "Trade"} submitted invoice ${input.invoiceNumber} for $${input.amount} (Job #${input.jobId})`,
      }).catch(() => {});

      // Push notification to staff
      triggerPushTradeInvoiceSubmitted(
        installerInfo?.name || "Trade",
        input.invoiceNumber,
        input.amount
      );

      return { id: invoiceId, fileUrl };
    }),

  // Get subcontract milestones for a job (for trade portal milestone selection)
  getJobSubcontractMilestones: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      await requireTradeJobAccess(db, ctx, input.jobId);

      // Get subcontracts for this job that are assigned to this installer
      const subcontracts = await db.select()
        .from(projectSubcontracts)
        .where(and(
          eq(projectSubcontracts.jobId, input.jobId),
          eq(projectSubcontracts.installerId, installerId)
        ));

      // Also get subcontracts that are signed (available to all trades on the job)
      const signedSubcontracts = await db.select()
        .from(projectSubcontracts)
        .where(and(
          eq(projectSubcontracts.jobId, input.jobId),
          eq(projectSubcontracts.status, "signed")
        ));

      // Merge and deduplicate
      const allSubcontracts = [...subcontracts];
      for (const sc of signedSubcontracts) {
        if (!allSubcontracts.find(s => s.id === sc.id)) {
          allSubcontracts.push(sc);
        }
      }

      // Get existing invoice lines linked to these subcontracts to show claim status
      const subcontractIds = allSubcontracts.map(s => s.id);
      let existingClaims: any[] = [];
      if (subcontractIds.length > 0) {
        existingClaims = await db.select({
          subcontractId: tradeInvoiceLines.subcontractId,
          subcontractMilestoneIndex: tradeInvoiceLines.subcontractMilestoneIndex,
          amount: tradeInvoiceLines.amount,
          approvalStatus: tradeInvoiceLines.approvalStatus,
        })
          .from(tradeInvoiceLines)
          .where(inArray(tradeInvoiceLines.subcontractId, subcontractIds));
      }

      return allSubcontracts.map(sc => ({
        id: sc.id,
        subcontractorName: sc.subcontractorName,
        subcontractSum: sc.subcontractSum,
        status: sc.status,
        milestones: ((sc.paymentSchedule as PaymentMilestone[]) || []).map((m, index) => {
          const claims = existingClaims.filter(
            c => c.subcontractId === sc.id && c.subcontractMilestoneIndex === index
          );
          return {
            index,
            label: m.label,
            amountDollars: m.amountDollars,
            percentOfTotal: m.percentOfTotal,
            usePercent: m.usePercent,
            claimed: claims.length > 0,
            claimStatus: claims.length > 0 ? claims[0].approvalStatus : null,
            claimedAmount: claims.reduce((sum: number, c: any) => sum + parseFloat(c.amount || "0"), 0),
          };
        }),
      }));
    }),

  // Get signed contracts for this installer
  getContracts: protectedTradePortalProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const contracts = await db.select({
        id: projectSubcontracts.id,
        jobId: projectSubcontracts.jobId,
        subcontractorName: projectSubcontracts.subcontractorName,
        subcontractSum: projectSubcontracts.subcontractSum,
        siteAddress: projectSubcontracts.siteAddress,
        status: projectSubcontracts.status,
        pdfUrl: projectSubcontracts.pdfUrl,
        signedAt: projectSubcontracts.signedAt,
        sentAt: projectSubcontracts.sentAt,
        createdAt: projectSubcontracts.createdAt,
      })
        .from(projectSubcontracts)
        .where(eq(projectSubcontracts.installerId, installerId))
        .orderBy(desc(projectSubcontracts.createdAt));

      // Get job details for each contract
      const jobIds = Array.from(new Set(contracts.map(c => c.jobId).filter(Boolean))) as number[];
      let jobMap: Record<number, { clientName: string; quoteNumber: string }> = {};
      let visibleJobIds = new Set<number>();
      if (jobIds.length > 0) {
        const jobConditions = tradeJobConditions(ctx, inArray(constructionJobs.id, jobIds));
        const jobs = await db.select({
          id: constructionJobs.id,
          clientName: constructionJobs.clientName,
          quoteNumber: constructionJobs.quoteNumber,
        }).from(constructionJobs).where(and(...jobConditions));
        visibleJobIds = new Set(jobs.map(j => j.id));
        jobMap = Object.fromEntries(jobs.map(j => [j.id, { clientName: j.clientName || "", quoteNumber: j.quoteNumber || "" }]));
      }

      return contracts.filter(c => visibleJobIds.has(c.jobId)).map(c => ({
        ...c,
        clientName: c.jobId ? jobMap[c.jobId]?.clientName || "" : "",
        quoteNumber: c.jobId ? jobMap[c.jobId]?.quoteNumber || "" : "",
      }));
    }),

  // Get milestone claim status for a subcontract (used in SubcontractEditor)
  getSubcontractClaimStatus: protectedTradePortalProcedure
    .input(z.object({ subcontractId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireSubcontractAccess(db, ctx, input.subcontractId);
      const claims = await db.select({
        subcontractMilestoneIndex: tradeInvoiceLines.subcontractMilestoneIndex,
        amount: tradeInvoiceLines.amount,
        approvalStatus: tradeInvoiceLines.approvalStatus,
        invoiceId: tradeInvoiceLines.invoiceId,
      })
        .from(tradeInvoiceLines)
        .where(eq(tradeInvoiceLines.subcontractId, input.subcontractId));
      return claims;
    }),

  // ─── Job Details (full info for a specific job) ────────────────────────────

  getJobDetail: protectedTradePortalProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;
      const job = await requireTradeJobAccess(db, ctx, input.jobId);

      // Get client phone from linked quote
      let clientPhone: string | null = null;
      let clientEmail: string | null = null;
      if (job.quoteId) {
        const quoteConditions = [eq(quotes.id, job.quoteId)];
        appendExactQuoteTenantScope(quoteConditions, quotes.tenantId, tenantIdFromContext(ctx));
        const [q] = await db.select({
          clientPhone: quotes.clientPhone,
          clientEmail: quotes.clientEmail,
        }).from(quotes).where(and(...quoteConditions));
        clientPhone = q?.clientPhone || null;
        clientEmail = q?.clientEmail || null;
      }

      // Get all assigned trades on this job (visible to other trades)
      const allAssignments = await db.select({
        id: constructionAssignments.id,
        role: constructionAssignments.role,
        installerName: constructionInstallers.name,
        installerPhone: constructionInstallers.phone,
        tradeType: constructionInstallers.tradeType,
      })
        .from(constructionAssignments)
        .innerJoin(constructionInstallers, eq(constructionAssignments.installerId, constructionInstallers.id))
        .where(eq(constructionAssignments.jobId, input.jobId));

      // Get work orders for this trade on this job
      const workOrders = await db.select()
        .from(cmWorkOrders)
        .where(eq(cmWorkOrders.jobId, input.jobId))
        .orderBy(desc(cmWorkOrders.createdAt));

      // Get shared files for this job
      const sharedFiles = await db.select()
        .from(jobSharedFiles)
        .where(eq(jobSharedFiles.jobId, input.jobId))
        .orderBy(desc(jobSharedFiles.createdAt));

      // Get subcontracts for this trade on this job
      const subcontracts = await db.select()
        .from(projectSubcontracts)
        .where(and(
          eq(projectSubcontracts.jobId, input.jobId),
          eq(projectSubcontracts.installerId, installerId),
        ));

      return {
        job: {
          id: job.id,
          quoteNumber: job.quoteNumber,
          clientName: job.clientName,
          clientPhone,
          clientEmail,
          siteAddress: job.siteAddress,
          status: job.status,
          priority: job.priority,
          scheduledStart: job.scheduledStart,
          scheduledEnd: job.scheduledEnd,
          supervisorName: job.supervisorName,
          designAdviserName: job.designAdviserName,
          notes: job.notes,
        },
        assignedTrades: allAssignments,
        workOrders,
        sharedFiles,
        subcontracts,
      };
    }),

  // ─── Job List with shared file counts (for job details page) ───────────────

  getJobsList: protectedTradePortalProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      // Get all jobs this trade is assigned to
      const assignments = await db.select({
        jobId: constructionAssignments.jobId,
      })
        .from(constructionAssignments)
        .where(eq(constructionAssignments.installerId, installerId));

      const jobIds = assignments.map(a => a.jobId);
      if (jobIds.length === 0) return [];

      const jobs = await db.select({
        id: constructionJobs.id,
        quoteNumber: constructionJobs.quoteNumber,
        clientName: constructionJobs.clientName,
        siteAddress: constructionJobs.siteAddress,
        status: constructionJobs.status,
        scheduledStart: constructionJobs.scheduledStart,
        scheduledEnd: constructionJobs.scheduledEnd,
      })
        .from(constructionJobs)
        .where(and(...tradeJobConditions(ctx, inArray(constructionJobs.id, jobIds))))
        .orderBy(desc(constructionJobs.scheduledStart));

      // Count shared files per job
      const visibleJobIds = jobs.map(j => j.id);
      if (visibleJobIds.length === 0) return [];
      const allSharedFiles = await db.select({
        jobId: jobSharedFiles.jobId,
      }).from(jobSharedFiles)
        .where(inArray(jobSharedFiles.jobId, visibleJobIds));

      const fileCountMap: Record<number, number> = {};
      allSharedFiles.forEach(f => {
        fileCountMap[f.jobId] = (fileCountMap[f.jobId] || 0) + 1;
      });

      return jobs.map(j => ({
        ...j,
        sharedFileCount: fileCountMap[j.id] || 0,
      }));
    }),

  // ─── Push Notifications ────────────────────────────────────────────────────
  pushSubscribe: protectedTradePortalProcedure
    .input(z.object({
      endpoint: z.string().min(1),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { subscribePush } = await import("./push");
      await subscribePush({
        portalType: "trade",
        portalAccessId: ctx.tradeAccess.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      });
      return { success: true };
    }),

  pushUnsubscribe: protectedTradePortalProcedure
    .input(z.object({ endpoint: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { unsubscribePush } = await import("./push");
      await unsubscribePush(input.endpoint);
      return { success: true };
    }),

  getVapidKey: publicTradePortalProcedure.query(() => {
    return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "" };
  }),

  markNewsViewed: protectedTradePortalProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    await db.update(tradePortalAccess)
      .set({ lastViewedNewsAt: new Date() })
      .where(eq(tradePortalAccess.id, ctx.tradeAccess.id));
    return { success: true };
  }),

  // ─── Chat Procedures (Trade Portal) ──────────────────────────────────────

  chatListChannels: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;

    // Trades see: the system "Trades" channel + any job channels they're a member of
    const tradesChannel = await db.select().from(chatChannels)
      .where(and(eq(chatChannels.type, "system"), eq(chatChannels.name, "Trades")))
      .limit(1);

    const memberChannels = await db.select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.memberType, "trade"),
        eq(chatChannelMembers.memberId, installerId)
      ));

    const channelIds = [
      ...(tradesChannel.length ? [tradesChannel[0].id] : []),
      ...memberChannels.map(m => m.channelId),
    ];

    if (!channelIds.length) return [];

    const channels = await db.select().from(chatChannels)
      .where(inArray(chatChannels.id, channelIds))
      .orderBy(asc(chatChannels.name));

    // Get unread counts
    const result = await Promise.all(channels.map(async (ch) => {
      const member = await db.select().from(chatChannelMembers)
        .where(and(
          eq(chatChannelMembers.channelId, ch.id),
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, installerId)
        ))
        .limit(1);

      const lastRead = member[0]?.lastReadAt || new Date(0);
      const unreadMessages = await db.select().from(chatMessages)
        .where(and(
          eq(chatMessages.channelId, ch.id),
          gt(chatMessages.createdAt, lastRead)
        ));

      return { ...ch, unreadCount: unreadMessages.length };
    }));

    return result;
  }),

  chatGetMessages: protectedTradePortalProcedure
    .input(z.object({ channelId: z.number(), limit: z.number().optional().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const messages = await db.select().from(chatMessages)
        .where(eq(chatMessages.channelId, input.channelId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(input.limit);
      return messages;
    }),

  chatSendMessage: protectedTradePortalProcedure
    .input(z.object({
      channelId: z.number(),
      content: z.string().min(1).max(5000),
      attachments: z.array(z.object({
        url: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installer = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, ctx.tradeAccess.installerId))
        .limit(1);
      const senderName = installer[0]?.name || "Trade";

      const [msg] = await db.insert(chatMessages).values({
        channelId: input.channelId,
        senderId: ctx.tradeAccess.installerId,
        senderName,

        content: input.content,
        attachments: input.attachments ? JSON.stringify(input.attachments) : null,
      }).$returningId();

      return { id: msg.id };
    }),

  chatMarkRead: protectedTradePortalProcedure
    .input(z.object({ channelId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const installerId = ctx.tradeAccess.installerId;

      // Upsert membership + lastReadAt
      const existing = await db.select().from(chatChannelMembers)
        .where(and(
          eq(chatChannelMembers.channelId, input.channelId),
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, installerId)
        ))
        .limit(1);

      if (existing.length) {
        await db.update(chatChannelMembers)
          .set({ lastReadAt: new Date() })
          .where(eq(chatChannelMembers.id, existing[0].id));
      } else {
        await db.insert(chatChannelMembers).values({
          channelId: input.channelId,
          memberType: "trade",
          memberId: installerId,
          role: "member",
          lastReadAt: new Date(),
        });
      }
      return { success: true };
    }),

  chatUnreadTotal: protectedTradePortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const installerId = ctx.tradeAccess.installerId;

    // Get channels this trade user can see
    const tradesChannel = await db.select().from(chatChannels)
      .where(and(eq(chatChannels.type, "system"), eq(chatChannels.name, "Trades")))
      .limit(1);

    const memberChannels = await db.select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(and(
        eq(chatChannelMembers.memberType, "trade"),
        eq(chatChannelMembers.memberId, installerId)
      ));

    const channelIds = [
      ...(tradesChannel.length ? [tradesChannel[0].id] : []),
      ...memberChannels.map(m => m.channelId),
    ];
    const uniqueIds = Array.from(new Set(channelIds));

    let totalUnread = 0;
    for (const channelId of uniqueIds) {
      const member = await db.select({ lastReadAt: chatChannelMembers.lastReadAt })
        .from(chatChannelMembers)
        .where(and(
          eq(chatChannelMembers.channelId, channelId),
          eq(chatChannelMembers.memberType, "trade"),
          eq(chatChannelMembers.memberId, installerId)
        ))
        .limit(1);

      const lastRead = member[0]?.lastReadAt || new Date(0);
      const [unread] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.channelId, channelId),
          gt(chatMessages.createdAt, lastRead)
        ));
      totalUnread += unread?.count || 0;
    }

    return { total: totalUnread };
  }),
});
