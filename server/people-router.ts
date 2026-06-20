/**
 * Unified People Router
 * Consolidates Trades (construction_installers), Staff (design_advisors), and System Users
 * into a single queryable endpoint for the unified People management page.
 */
import { z } from "zod";
import { router, tenantAdminProcedure, sensitiveSuperAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { constructionInstallers, designAdvisors, tenantMemberships, users, constructionAssignments, constructionJobs, tradeNotificationRules, tradePortalAccess } from "../drizzle/schema";
import { eq, like, or, desc, sql, and, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";

const TRADE_TYPES = ["installer", "electrician", "plumber", "roofer", "carpenter", "concreter", "painter", "tiler", "fencer", "labourer", "other"] as const;

function normaliseEmail(email?: string | null) {
  return email?.trim().toLowerCase() || "";
}

function generateToken(length = 64): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

export const peopleRouter = router({
  /**
   * Unified search across all people (staff + trades + system users)
   * Returns a combined list with a `personType` discriminator
   */
  search: tenantAdminProcedure
    .input(z.object({
      query: z.string().optional(),
      type: z.enum(["all", "staff", "trade", "system"]).optional(),
      limit: z.number().min(1).max(200).default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const query = input?.query?.trim().toLowerCase() || "";
      const type = input?.type || "all";
      const limit = input?.limit || 100;
      let tenantUsersCache: Array<{
        id: number;
        name: string | null;
        email: string | null;
        role: string;
        lastSignedIn: Date | null;
        createdAt: Date;
        canViewAllQuotes: boolean | null;
        canViewAllLeads: boolean | null;
      }> | null = null;
      const linkedTradeUserIds = new Set<number>();

      async function getTenantUsers() {
        if (tenantUsersCache) return tenantUsersCache;
        const conditions = [eq(tenantMemberships.tenantId, ctx.tenant!.id)];
        if (query) {
          conditions.push(or(
            like(users.name, `%${query}%`),
            like(users.email, `%${query}%`),
          )!);
        }
        let sysQuery = db!.select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          lastSignedIn: users.lastSignedIn,
          createdAt: users.createdAt,
          canViewAllQuotes: users.canViewAllQuotes,
          canViewAllLeads: users.canViewAllLeads,
        }).from(tenantMemberships)
          .innerJoin(users, eq(users.id, tenantMemberships.userId))
          .where(and(...conditions))
          .orderBy(desc(users.lastSignedIn))
          .limit(limit);
        if (query) {
          sysQuery = sysQuery as any;
        }
        tenantUsersCache = await sysQuery;
        return tenantUsersCache;
      }

      const results: Array<{
        id: number;
        personType: "staff" | "trade" | "system";
        name: string;
        email: string | null;
        phone: string | null;
        role: string | null;
        tradeType: string | null;
        branchId: number | null;
        userId: number | null;
        active: boolean;
        archived: boolean;
        lastSignedIn: Date | null;
        createdAt: Date;
        canViewAllQuotes?: boolean;
        canViewAllLeads?: boolean;
      }> = [];

      // Staff (design_advisors)
      if (type === "all" || type === "staff") {
        const conditions = [eq(designAdvisors.tenantId, ctx.tenant!.id)];
        if (query) {
          conditions.push(or(
            like(designAdvisors.name, `%${query}%`),
            like(designAdvisors.email, `%${query}%`),
            like(designAdvisors.phone, `%${query}%`),
          )!);
        }
        let staffQuery = db.select().from(designAdvisors)
          .where(and(...conditions))
          .orderBy(designAdvisors.name)
          .limit(limit);
        if (query) {
          staffQuery = staffQuery as any;
        }
        const staff = await staffQuery;
        for (const s of staff) {
          results.push({
            id: s.id,
            personType: "staff",
            name: s.name,
            email: s.email,
            phone: s.phone,
            role: s.role,
            tradeType: null,
            branchId: s.branchId,
            userId: s.userId ?? null,
            active: !s.archived,
            archived: s.archived,
            lastSignedIn: null,
            createdAt: s.createdAt,
          });
        }
      }

      // Trades (construction_installers)
      if (type === "all" || type === "trade") {
        const conditions = [eq(constructionInstallers.tenantId, ctx.tenant!.id)];
        if (query) {
          conditions.push(or(
            like(constructionInstallers.name, `%${query}%`),
            like(constructionInstallers.email, `%${query}%`),
            like(constructionInstallers.phone, `%${query}%`),
          )!);
        }
        let tradeQuery = db.select().from(constructionInstallers)
          .where(and(...conditions))
          .orderBy(constructionInstallers.name)
          .limit(limit);
        if (query) {
          tradeQuery = tradeQuery as any;
        }
        const trades = await tradeQuery;
        const tenantUsers = await getTenantUsers();
        const usersByEmail = new Map(tenantUsers
          .filter((u) => Boolean(normaliseEmail(u.email)))
          .map((u) => [normaliseEmail(u.email), u]));
        const tradeIds = trades.map((t) => t.id);
        const accessRows = tradeIds.length > 0
          ? await db.select({
              installerId: tradePortalAccess.installerId,
              email: tradePortalAccess.email,
              isActive: tradePortalAccess.isActive,
            })
              .from(tradePortalAccess)
              .where(and(
                eq(tradePortalAccess.tenantId, ctx.tenant!.id),
                inArray(tradePortalAccess.installerId, tradeIds),
                eq(tradePortalAccess.isActive, true),
              ))
          : [];
        const accessEmailByInstaller = new Map(accessRows.map((row) => [row.installerId, row.email]));

        for (const t of trades) {
          const linkedUser = usersByEmail.get(normaliseEmail(accessEmailByInstaller.get(t.id) || t.email));
          if (linkedUser) linkedTradeUserIds.add(linkedUser.id);
          results.push({
            id: t.id,
            personType: "trade",
            name: t.name,
            email: t.email,
            phone: t.phone,
            role: null,
            tradeType: t.tradeType,
            branchId: null,
            userId: linkedUser?.id ?? null,
            active: t.active,
            archived: false,
            lastSignedIn: linkedUser?.lastSignedIn ?? null,
            createdAt: t.createdAt,
          });
        }
      }

      // System Users (users table - OAuth logged in)
      if (type === "all" || type === "system") {
        const sysUsers = await getTenantUsers();
        for (const u of sysUsers) {
          if (type === "all" && linkedTradeUserIds.has(u.id)) continue;
          results.push({
            id: u.id,
            personType: "system",
            name: u.name || "Unnamed",
            email: u.email,
            phone: null,
            role: u.role,
            tradeType: null,
            branchId: null,
            userId: null,
            active: true,
            archived: false,
            lastSignedIn: u.lastSignedIn,
            createdAt: u.createdAt,
            canViewAllQuotes: !!u.canViewAllQuotes,
            canViewAllLeads: !!u.canViewAllLeads,
          });
        }
      }

      return results;
    }),

  /** Get counts for each person type */
  counts: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { staff: 0, trades: 0, system: 0 };

    const [staffCount] = await db.select({ count: sql<number>`count(*)` }).from(designAdvisors)
      .where(and(eq(designAdvisors.tenantId, ctx.tenant!.id), eq(designAdvisors.archived, false)));
    const [tradeCount] = await db.select({ count: sql<number>`count(*)` }).from(constructionInstallers)
      .where(and(eq(constructionInstallers.tenantId, ctx.tenant!.id), eq(constructionInstallers.active, true)));
    const [sysCount] = await db.select({ count: sql<number>`count(*)` }).from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id));

    return {
      staff: Number(staffCount?.count || 0),
      trades: Number(tradeCount?.count || 0),
      system: Number(sysCount?.count || 0),
    };
  }),

  /** Trade performance metrics — jobs assigned, completed, completion rate */
  tradeMetrics: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // Get all active trades
    const trades = await db.select({ id: constructionInstallers.id, name: constructionInstallers.name })
      .from(constructionInstallers)
      .where(and(eq(constructionInstallers.tenantId, ctx.tenant!.id), eq(constructionInstallers.active, true)));

    if (trades.length === 0) return [];

    // Get assignments with job status for all trades
    const assignments = await db.select({
      installerId: constructionAssignments.installerId,
      jobStatus: constructionJobs.status,
    })
      .from(constructionAssignments)
      .innerJoin(constructionJobs, eq(constructionAssignments.jobId, constructionJobs.id))
      .where(eq(constructionJobs.tenantId, ctx.tenant!.id));

    // Build metrics per trade
    const metricsMap: Record<number, { totalJobs: number; completed: number; inProgress: number; }> = {};
    for (const a of assignments) {
      if (!metricsMap[a.installerId]) metricsMap[a.installerId] = { totalJobs: 0, completed: 0, inProgress: 0 };
      metricsMap[a.installerId].totalJobs++;
      if (a.jobStatus === "completed") metricsMap[a.installerId].completed++;
      if (a.jobStatus === "in_progress") metricsMap[a.installerId].inProgress++;
    }

    return trades.map(t => ({
      installerId: t.id,
      name: t.name,
      totalJobs: metricsMap[t.id]?.totalJobs || 0,
      completed: metricsMap[t.id]?.completed || 0,
      inProgress: metricsMap[t.id]?.inProgress || 0,
      completionRate: metricsMap[t.id]?.totalJobs ? Math.round((metricsMap[t.id].completed / metricsMap[t.id].totalJobs) * 100) : 0,
    }));
  }),

  /** List notification rules */
  notificationRules: router({
    list: tenantAdminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(tradeNotificationRules).orderBy(desc(tradeNotificationRules.createdAt));
    }),

    create: tenantAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        triggerType: z.enum(["before_job", "after_job", "on_assignment", "availability_reminder"]),
        channel: z.enum(["sms", "email", "both"]),
        hoursOffset: z.number().int().default(24),
        messageTemplate: z.string().min(1),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const [result] = await db.insert(tradeNotificationRules).values({
          name: input.name,
          triggerType: input.triggerType,
          channel: input.channel,
          hoursOffset: input.hoursOffset,
          messageTemplate: input.messageTemplate,
          isActive: input.isActive,
          createdBy: ctx.user!.id,
        });
        return { id: result.insertId };
      }),

    update: tenantAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        triggerType: z.enum(["before_job", "after_job", "on_assignment", "availability_reminder"]).optional(),
        channel: z.enum(["sms", "email", "both"]).optional(),
        hoursOffset: z.number().int().optional(),
        messageTemplate: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { id, ...updates } = input;
        await db.update(tradeNotificationRules).set(updates).where(eq(tradeNotificationRules.id, id));
        return { success: true };
      }),

    delete: tenantAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.delete(tradeNotificationRules).where(eq(tradeNotificationRules.id, input.id));
        return { success: true };
      }),
  }),

  /** Update a system user's details (admin only) */
  updateUser: tenantAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...updates } = input;
      const [membership] = await db.select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(and(
          eq(tenantMemberships.tenantId, ctx.tenant!.id),
          eq(tenantMemberships.userId, id),
        ))
        .limit(1);
      if (!membership) throw new Error("User is not a member of this tenant");
      const setObj: Record<string, unknown> = {};
      if (updates.name !== undefined) setObj.name = updates.name;
      if (updates.email !== undefined) setObj.email = updates.email;
      if (Object.keys(setObj).length === 0) throw new Error("No fields to update");
      await db.update(users).set(setObj).where(eq(users.id, id));
      return { success: true };
    }),

  /** Link a trade portal row to a system user by keeping portal access on that user's email */
  linkTradeToUser: tenantAdminProcedure
    .input(z.object({
      installerId: z.number(),
      userId: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [installer] = await db.select()
        .from(constructionInstallers)
        .where(and(
          eq(constructionInstallers.tenantId, ctx.tenant!.id),
          eq(constructionInstallers.id, input.installerId),
        ))
        .limit(1);
      if (!installer) throw new Error("Trade not found");

      const [existingAccess] = await db.select()
        .from(tradePortalAccess)
        .where(and(
          eq(tradePortalAccess.tenantId, ctx.tenant!.id),
          eq(tradePortalAccess.installerId, input.installerId),
        ))
        .limit(1);

      if (input.userId == null) {
        if (existingAccess) {
          await db.update(tradePortalAccess)
            .set({ isActive: false })
            .where(and(
              eq(tradePortalAccess.tenantId, ctx.tenant!.id),
              eq(tradePortalAccess.id, existingAccess.id),
            ));
        }
        return { success: true, linked: false };
      }

      const [membership] = await db.select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(and(
          eq(tenantMemberships.tenantId, ctx.tenant!.id),
          eq(tenantMemberships.userId, input.userId),
        ))
        .limit(1);
      if (!membership) throw new Error("User is not a member of this tenant");

      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new Error("User not found");
      if (!user.email) throw new Error("The selected user has no email address");

      const email = normaliseEmail(user.email);
      if (existingAccess) {
        await db.update(tradePortalAccess)
          .set({ email, accessToken: generateToken(64), isActive: true })
          .where(and(
            eq(tradePortalAccess.tenantId, ctx.tenant!.id),
            eq(tradePortalAccess.id, existingAccess.id),
          ));
      } else {
        await db.insert(tradePortalAccess).values({
          tenantId: ctx.tenant!.id,
          installerId: input.installerId,
          email,
          accessToken: generateToken(64),
          isActive: true,
        });
      }

      const installerUpdates: Record<string, unknown> = {};
      if (!installer.email || normaliseEmail(installer.email) !== email) installerUpdates.email = email;
      if (!installer.name && user.name) installerUpdates.name = user.name;
      if (Object.keys(installerUpdates).length > 0) {
        await db.update(constructionInstallers)
          .set(installerUpdates)
          .where(and(
            eq(constructionInstallers.tenantId, ctx.tenant!.id),
            eq(constructionInstallers.id, input.installerId),
          ));
      }

      if (user.role === "user") {
        await db.update(users)
          .set({ role: "construction_user" })
          .where(eq(users.id, input.userId));
      }

      return { success: true, linked: true };
    }),

  /** Delete a system user (admin only, cannot delete self) */
  deleteUser: sensitiveSuperAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user!.role !== "admin" && ctx.user!.role !== "super_admin") {
        throw new Error("Only admins can delete users");
      }
      if (ctx.user!.id === input.id) {
        throw new Error("Cannot delete your own account");
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Check for FK references before deleting
      const FK_CHECK = [
        "email_images:uploadedBy", "quote_revisions:userId", "construction_jobs:designAdviserId",
        "construction_jobs:supervisorId", "construction_jobs:createdBy", "user_settings:userId",
        "chat_channel_members:userId", "chat_messages:senderId", "smartshop_orders:userId",
        "da_commissions:daUserId", "nylas_grants:userId", "user_locations:user_id",
      ];
      let totalRefs = 0;
      for (const ref of FK_CHECK) {
        const [table, column] = ref.split(":");
        const [result] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${table}\` WHERE \`${column}\` = ${input.id}`));
        totalRefs += Number((result as any)?.cnt || 0);
      }
      if (totalRefs > 0) {
        throw new Error(`Cannot delete: user has ${totalRefs} references across the system. Use merge instead.`);
      }
      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),

  /** Merge two accounts: reassign all FK refs from secondary to primary, then delete secondary */
  mergeAccounts: sensitiveSuperAdminProcedure
    .input(z.object({
      primaryId: z.number(),
      secondaryId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user!.role !== "admin" && ctx.user!.role !== "super_admin") {
        throw new Error("Only admins can merge accounts");
      }
      if (input.primaryId === input.secondaryId) {
        throw new Error("Cannot merge an account with itself");
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Verify both accounts exist
      const [primary] = await db.select().from(users).where(eq(users.id, input.primaryId)).limit(1);
      const [secondary] = await db.select().from(users).where(eq(users.id, input.secondaryId)).limit(1);
      if (!primary) throw new Error("Primary account not found");
      if (!secondary) throw new Error("Secondary account not found");

      // All FK references to reassign
      const FK_REFS = [
        "email_images:uploadedBy", "quote_revisions:userId",
        "construction_jobs:designAdviserId", "construction_jobs:supervisorId", "construction_jobs:createdBy",
        "construction_progress:updatedBy", "permission_audit_log:adminUserId", "permission_audit_log:targetUserId",
        "check_measure_workbooks:checkedBy", "construction_schedule_events:createdBy",
        "construction_kanban_tasks:createdBy", "construction_job_financials:constructionManagerId",
        "xero_connections:userId", "portal_variations:createdBy", "project_plan_templates:createdBy",
        "cm_variance_items:resolvedBy", "cm_variance_items:createdBy", "cm_component_orders:orderedBy",
        "cm_work_orders:createdBy", "equipment_bookings:createdBy", "trade_invoices:reviewedBy",
        "trade_invoice_lines:approvedBy", "trade_invoice_approvals:supervisorId",
        "trade_notification_rules:createdBy", "overdue_alert_dismissals:userId",
        "xero_cost_import_batches:uploadedBy", "xero_budget_import_batches:uploadedBy",
        "user_settings:userId", "patio_planner:userId", "project_subcontracts:createdBy",
        "practical_completion_notices:sentBy", "practical_completion_notices:createdBy",
        "swms_documents:createdBy", "site_inductions:inductedByUserId", "induction_form_config:updatedBy",
        "job_communications:sentBy", "suppliers:createdBy", "job_shared_files:uploadedBy",
        "smartshop_orders:userId", "smartshop_order_status_history:changedByUserId",
        "order_templates:createdBy", "nylas_grants:userId", "da_commissions:daUserId",
        "da_commission_adjustments:adjustedByUserId", "da_invoices:daUserId", "da_invoices:approvedByUserId",
        "da_personal_details:userId", "user_calendar_selections:userId",
        "manufacturing_orders:receivedBy", "manufacturing_schedule:createdBy",
        "manufacturing_purchase_orders:createdBy", "manufacturing_drivers:userId",
        "manufacturing_dispatches:createdBy", "user_locations:user_id", "supplier_feedback:userId",
        "chat_channel_members:userId", "chat_messages:senderId", "chat_message_reactions:userId",
        "support_submissions:userId", "support_submissions:assignedToUserId",
        "support_submission_notes:userId", "rain_days:declaredByUserId", "rain_days:approvedByUserId",
        "extension_of_time_records:createdByUserId",
      ];

      let reassigned = 0;
      for (const ref of FK_REFS) {
        const [table, column] = ref.split(":");
        try {
          const result = await db.execute(sql.raw(
            `UPDATE \`${table}\` SET \`${column}\` = ${input.primaryId} WHERE \`${column}\` = ${input.secondaryId}`
          ));
          reassigned += (result as any)?.[0]?.affectedRows || 0;
        } catch (e) {
          // Unique constraint conflict — delete secondary's record since primary already has one
          try {
            await db.execute(sql.raw(
              `DELETE FROM \`${table}\` WHERE \`${column}\` = ${input.secondaryId}`
            ));
          } catch (_) { /* ignore */ }
        }
      }

      // Delete the secondary account
      await db.delete(users).where(eq(users.id, input.secondaryId));

      console.log(`[People] Merged account ${input.secondaryId} -> ${input.primaryId} (${reassigned} refs reassigned)`);
      return { success: true, reassigned, primaryName: primary.name, secondaryName: secondary.name };
    }),
});
