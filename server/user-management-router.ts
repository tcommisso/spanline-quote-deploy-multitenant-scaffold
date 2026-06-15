/**
 * User Management Router
 * Provides list and role update for super_admin users
 * Includes permission audit logging for all permission/role changes
 */
import { z } from "zod";
import { superAdminProcedure, protectedProcedure, adminProcedure, sensitiveSuperAdminProcedure, tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tenantMemberships, users, permissionAuditLog } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { USER_ROLES } from "./user-roles-const";
import { IMPERSONATE_COOKIE_NAME, EIGHT_HOURS_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

export const userManagementRouter = router({
  list: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const allUsers = await db
      .select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        canViewAllQuotes: users.canViewAllQuotes,
        canViewAllLeads: users.canViewAllLeads,
        lastSignedIn: users.lastSignedIn,
        createdAt: users.createdAt,
        tenantRole: tenantMemberships.role,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(eq(tenantMemberships.tenantId, ctx.tenant!.id))
      .orderBy(desc(users.lastSignedIn));
    return allUsers;
  }),

  updateRole: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin", "super_admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Prevent demoting yourself
      if (input.userId === ctx.user!.id && input.role !== "super_admin") {
        throw new Error("Cannot change your own role");
      }
      // Get current user info for audit log
      const [targetUser] = await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, input.userId));
      const oldRole = targetUser?.role || "unknown";

      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));

      // Log the role change
      if (oldRole !== input.role) {
        await db.insert(permissionAuditLog).values({
          tenantId: ctx.tenant?.id ?? null,
          adminUserId: ctx.user!.id,
          adminUserName: ctx.user.name || "Admin",
          targetUserId: input.userId,
          targetUserName: targetUser?.name || "Unknown",
          action: "role_change",
          field: "role",
          oldValue: oldRole,
          newValue: input.role,
        });
      }

      return { success: true };
    }),

  updatePermissions: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      canViewAllQuotes: z.boolean().optional(),
      canViewAllLeads: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Get current user info for audit log
      const [targetUser] = await db.select({
        name: users.name,
        canViewAllQuotes: users.canViewAllQuotes,
        canViewAllLeads: users.canViewAllLeads,
      }).from(users).where(eq(users.id, input.userId));

      const updates: Record<string, boolean> = {};
      if (input.canViewAllQuotes !== undefined) updates.canViewAllQuotes = input.canViewAllQuotes;
      if (input.canViewAllLeads !== undefined) updates.canViewAllLeads = input.canViewAllLeads;
      await db.update(users).set(updates).where(eq(users.id, input.userId));

      // Log each permission change
      if (input.canViewAllQuotes !== undefined && targetUser && input.canViewAllQuotes !== targetUser.canViewAllQuotes) {
        await db.insert(permissionAuditLog).values({
          tenantId: ctx.tenant?.id ?? null,
          adminUserId: ctx.user!.id,
          adminUserName: ctx.user.name || "Admin",
          targetUserId: input.userId,
          targetUserName: targetUser.name || "Unknown",
          action: "permission_change",
          field: "canViewAllQuotes",
          oldValue: String(targetUser.canViewAllQuotes ?? false),
          newValue: String(input.canViewAllQuotes),
        });
      }
      if (input.canViewAllLeads !== undefined && targetUser && input.canViewAllLeads !== targetUser.canViewAllLeads) {
        await db.insert(permissionAuditLog).values({
          tenantId: ctx.tenant?.id ?? null,
          adminUserId: ctx.user!.id,
          adminUserName: ctx.user.name || "Admin",
          targetUserId: input.userId,
          targetUserName: targetUser.name || "Unknown",
          action: "permission_change",
          field: "canViewAllLeads",
          oldValue: String(targetUser.canViewAllLeads ?? false),
          newValue: String(input.canViewAllLeads),
        });
      }

      return { success: true };
    }),

  getAuditLog: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      targetUserId: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      if (input?.targetUserId) {
        const logs = await db
          .select()
          .from(permissionAuditLog)
          .where(eq(permissionAuditLog.targetUserId, input.targetUserId))
          .orderBy(desc(permissionAuditLog.createdAt))
          .limit(limit)
          .offset(offset);
        return logs;
      }

      const logs = await db
        .select()
        .from(permissionAuditLog)
        .orderBy(desc(permissionAuditLog.createdAt))
        .limit(limit)
        .offset(offset);
      return logs;
    }),

  getRoles: protectedProcedure.query(() => {
    return USER_ROLES;
  }),

  /** Get impersonation-specific audit log entries */
  getImpersonationLog: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const { like } = await import("drizzle-orm");
      const logs = await db
        .select()
        .from(permissionAuditLog)
        .where(like(permissionAuditLog.action, "impersonation%"))
        .orderBy(desc(permissionAuditLog.createdAt))
        .limit(limit)
        .offset(offset);
      return logs;
    }),

  // ─── Impersonation ──────────────────────────────────────────────────────
  startImpersonation: sensitiveSuperAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const currentUser = ctx.user!; // guaranteed by sensitiveSuperAdminProcedure
      // Cannot impersonate yourself
      if (input.userId === currentUser.id) {
        throw new Error("Cannot impersonate yourself");
      }
      // Verify target user exists
      const [targetUser] = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.id, input.userId));
      if (!targetUser) {
        throw new Error("User not found");
      }
      // Set impersonation cookie (stores target user ID)
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(IMPERSONATE_COOKIE_NAME, String(input.userId), {
        ...cookieOptions,
        maxAge: EIGHT_HOURS_MS,
      });
      // Audit log
      await db.insert(permissionAuditLog).values({
        tenantId: ctx.tenant?.id ?? null,
        adminUserId: currentUser.id,
        adminUserName: currentUser.name || "Admin",
        targetUserId: input.userId,
        targetUserName: targetUser.name || "Unknown",
        action: "impersonation_start",
        field: "impersonation",
        oldValue: "",
        newValue: `Admin ${currentUser.name} started impersonating ${targetUser.name}`,
      });
      return { success: true, targetUser: { id: targetUser.id, name: targetUser.name, role: targetUser.role } };
    }),

  stopImpersonation: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Clear the impersonation cookie
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(IMPERSONATE_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      // If we have realUser in context, log the stop
      if (ctx.realUser) {
        const db = (await getDb())!;
        await db.insert(permissionAuditLog).values({
          tenantId: ctx.tenant?.id ?? null,
          adminUserId: ctx.realUser.id,
          adminUserName: ctx.realUser.name || "Admin",
          targetUserId: ctx.user!.id,
          targetUserName: ctx.user.name || "Unknown",
          action: "impersonation_stop",
          field: "impersonation",
          oldValue: `Was impersonating ${ctx.user.name}`,
          newValue: "",
        });
      }
      return { success: true };
    }),

  /** Returns the impersonation state for the current session */
  getImpersonationStatus: protectedProcedure
    .query(({ ctx }) => {
      return {
        isImpersonating: ctx.isImpersonating,
        realUser: ctx.realUser ? { id: ctx.realUser.id, name: ctx.realUser.name, role: ctx.realUser.role } : null,
        impersonatedUser: ctx.isImpersonating ? { id: ctx.user!.id, name: ctx.user.name, role: ctx.user!.role } : null,
      };
    }),
});
