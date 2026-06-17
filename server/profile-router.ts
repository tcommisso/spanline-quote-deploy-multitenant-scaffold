import { router, protectedProcedure, tenantProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { users, userScheduleBlocks, userTimeOff, designAdvisors, constructionJobs, constructionAssignments, constructionInstallers, userNotificationPreferences } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

// Canonical list of notification event types with labels and descriptions
export const NOTIFICATION_EVENT_TYPES = [
  // Construction
  { key: "schedule_event", label: "Schedule Events", description: "New or updated construction schedule events" },
  { key: "document_uploaded", label: "Documents", description: "New documents uploaded to your projects" },
  { key: "activity_posted", label: "Activity Updates", description: "New activities posted on your projects" },
  { key: "variation_created", label: "Variations", description: "New variations created on your projects" },
  { key: "plan_decision", label: "Plan Decisions", description: "Plan approvals or rejections from clients" },
  { key: "photo_comment", label: "Photo Comments", description: "New comments on project photos" },
  // Quotes & Sales
  { key: "notify_quote_accepted", label: "Quote Accepted", description: "Client accepts a quote" },
  { key: "notify_quote_created", label: "Quote Created", description: "New quote created by a DA" },
  { key: "notify_proposal_sent", label: "Proposal Sent", description: "Proposal emailed to client" },
  // Documents & Signatures
  { key: "notify_variation_signed", label: "Variation Signed", description: "Client signs a variation document" },
  { key: "notify_contract_signed", label: "Contract Signed", description: "Client signs a contract" },
  // CRM & Leads
  { key: "notify_new_lead", label: "New Lead", description: "New lead assigned to you" },
  { key: "notify_lead_followup_due", label: "Lead Follow-up Due", description: "Lead follow-up reminder" },
  // Invoices & Payments
  { key: "invoice_status", label: "Invoice Status", description: "Invoice approvals, rejections, and payments" },
  { key: "notify_payment_received", label: "Payment Received", description: "Client payment received" },
  // News & Announcements
  { key: "news_published", label: "News & Announcements", description: "Company news and announcements" },
  // Procurement & Inventory
  { key: "notify_low_stock", label: "Low Stock Alert", description: "Stock item below reorder level" },
  { key: "notify_po_approved", label: "PO Approved", description: "Purchase order approved" },
  { key: "notify_invoice_variance", label: "Invoice Variance", description: "Supplier invoice has variance above threshold" },
  // Trade & Installers
  { key: "notify_trade_job_assigned", label: "Job Assigned", description: "New job assigned to your trade" },
  { key: "notify_trade_schedule_change", label: "Schedule Change", description: "Job schedule changed" },
] as const;

function tenantConditions(ctx: any, tenantColumn: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, tenantColumn, tenantIdFromContext(ctx));
  return conditions;
}

export const profileRouter = router({
  // Get current user's profile with role-specific data
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!user) throw new Error("User not found");

    // Check if user has a linked DA record
    let linkedDa: { id: number; name: string; branchId: number | null } | null = null;
    if (user.role === "design_adviser") {
      const daConditions = tenantConditions(
        ctx,
        designAdvisors.tenantId,
        eq(designAdvisors.userId, ctx.user.id)
      );
      const [da] = await db.select({
        id: designAdvisors.id,
        name: designAdvisors.name,
        branchId: designAdvisors.branchId,
      }).from(designAdvisors).where(and(...daConditions)).limit(1);
      linkedDa = da || null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastSignedIn: user.lastSignedIn,
      linkedDa,
    };
  }),

  // Update basic profile info
  updateMyProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const updates: Record<string, any> = {};
      if (input.name) updates.name = input.name;

      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, ctx.user.id));
      }
      return { success: true };
    }),

  // ─── Schedule Blocks ─────────────────────────────────────────────────────
  schedule: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = tenantConditions(
        ctx,
        userScheduleBlocks.tenantId,
        eq(userScheduleBlocks.userId, ctx.user.id)
      );
      return db.select().from(userScheduleBlocks)
        .where(and(...conditions))
        .orderBy(userScheduleBlocks.dayOfWeek, userScheduleBlocks.startTime);
    }),

    set: tenantProcedure
      .input(z.object({
        blocks: z.array(z.object({
          dayOfWeek: z.number().min(0).max(6),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
          effectiveFrom: z.string().optional(),
          effectiveTo: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        // Replace all blocks for this user
        await db.delete(userScheduleBlocks).where(and(
          ...tenantConditions(ctx, userScheduleBlocks.tenantId, eq(userScheduleBlocks.userId, ctx.user.id))
        ));

        if (input.blocks.length > 0) {
          await db.insert(userScheduleBlocks).values(
            input.blocks.map(b => ({
              tenantId: ctx.tenant.id,
              userId: ctx.user.id,
              dayOfWeek: b.dayOfWeek,
              startTime: b.startTime,
              endTime: b.endTime,
              effectiveFrom: b.effectiveFrom || null,
              effectiveTo: b.effectiveTo || null,
            }))
          );
        }
        return { success: true };
      }),
  }),

  // ─── Time Off ────────────────────────────────────────────────────────────
  timeOff: router({
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = tenantConditions(
        ctx,
        userTimeOff.tenantId,
        eq(userTimeOff.userId, ctx.user.id)
      );
      return db.select().from(userTimeOff)
        .where(and(...conditions))
        .orderBy(userTimeOff.date);
    }),

    create: tenantProcedure
      .input(z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const [result] = await db.insert(userTimeOff).values({
          tenantId: ctx.tenant.id,
          userId: ctx.user.id,
          date: input.date,
          endDate: input.endDate || null,
          reason: input.reason || null,
        });
        return { id: result.insertId };
      }),

    delete: tenantProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        // Only allow deleting own time off
        await db.delete(userTimeOff).where(
          and(
            ...tenantConditions(
              ctx,
              userTimeOff.tenantId,
              eq(userTimeOff.id, input.id),
              eq(userTimeOff.userId, ctx.user.id)
            )
          )
        );
        return { success: true };
      }),
  }),

  // ─── My Upcoming Assignments (construction) ──────────────────────────────
  myAssignments: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // Find installer record linked to this user by matching name/email
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!user || !user.name) return [];

    // Match installer by name (case-insensitive)
    const installerMatch = user.email
      ? sql`(LOWER(${constructionInstallers.name}) = LOWER(${user.name}) OR LOWER(${constructionInstallers.email}) = LOWER(${user.email}))`
      : sql`LOWER(${constructionInstallers.name}) = LOWER(${user.name})`;
    const [installer] = await db.select({ id: constructionInstallers.id })
      .from(constructionInstallers)
      .where(and(...tenantConditions(ctx, constructionInstallers.tenantId, installerMatch)))
      .limit(1);

    if (!installer) return [];

    const assignments = await db.select({
      jobId: constructionJobs.id,
      jobNumber: constructionJobs.quoteNumber,
      clientName: constructionJobs.clientName,
      siteAddress: constructionJobs.siteAddress,
      status: constructionJobs.status,
      scheduledStart: constructionJobs.scheduledStart,
      scheduledEnd: constructionJobs.scheduledEnd,
    })
      .from(constructionJobs)
      .innerJoin(constructionAssignments, eq(constructionAssignments.jobId, constructionJobs.id))
      .where(
        and(
          ...tenantConditions(
            ctx,
            constructionJobs.tenantId,
            eq(constructionAssignments.installerId, installer.id),
            sql`${constructionJobs.status} NOT IN ('completed', 'cancelled')`
          )
        )
      )
      .orderBy(constructionJobs.scheduledStart)
      .limit(20);

    return assignments;
  }),

  // ─── Notification Preferences ────────────────────────────────────────────
  notifications: router({
    // Get all event types with user's current preferences
    list: tenantProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const prefs = await db
        .select()
        .from(userNotificationPreferences)
        .where(and(
          ...tenantConditions(
            ctx,
            userNotificationPreferences.tenantId,
            eq(userNotificationPreferences.userId, ctx.user.id)
          )
        ));

      // Merge with canonical event types — return defaults for any not yet set
      return NOTIFICATION_EVENT_TYPES.map((evt) => {
        const existing = prefs.find((p) => p.eventType === evt.key);
        return {
          eventType: evt.key,
          label: evt.label,
          description: evt.description,
          channelEmail: existing?.channelEmail ?? true,
          channelSms: existing?.channelSms ?? false,
          channelPush: existing?.channelPush ?? true,
        };
      });
    }),

    // Update a single event type's channel preferences
    update: tenantProcedure
      .input(z.object({
        eventType: z.string().max(64),
        channelEmail: z.boolean(),
        channelSms: z.boolean(),
        channelPush: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        const conditions = tenantConditions(
          ctx,
          userNotificationPreferences.tenantId,
          eq(userNotificationPreferences.userId, ctx.user.id),
          eq(userNotificationPreferences.eventType, input.eventType)
        );

        await db.delete(userNotificationPreferences).where(and(...conditions));
        await db
          .insert(userNotificationPreferences)
          .values({
            tenantId: ctx.tenant.id,
            userId: ctx.user.id,
            eventType: input.eventType,
            channelEmail: input.channelEmail,
            channelSms: input.channelSms,
            channelPush: input.channelPush,
          });

        return { success: true };
      }),

    // Bulk update all preferences at once
    bulkUpdate: tenantProcedure
      .input(z.array(z.object({
        eventType: z.string().max(64),
        channelEmail: z.boolean(),
        channelSms: z.boolean(),
        channelPush: z.boolean(),
      })))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");

        for (const pref of input) {
          const conditions = tenantConditions(
            ctx,
            userNotificationPreferences.tenantId,
            eq(userNotificationPreferences.userId, ctx.user.id),
            eq(userNotificationPreferences.eventType, pref.eventType)
          );

          await db.delete(userNotificationPreferences).where(and(...conditions));
          await db
            .insert(userNotificationPreferences)
            .values({
              tenantId: ctx.tenant.id,
              userId: ctx.user.id,
              eventType: pref.eventType,
              channelEmail: pref.channelEmail,
              channelSms: pref.channelSms,
              channelPush: pref.channelPush,
            });
        }

        return { success: true };
      }),
  }),
});
