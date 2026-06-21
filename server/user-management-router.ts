/**
 * User Management Router
 * Provides list and role update for super_admin users
 * Includes permission audit logging for all permission/role changes
 */
import { z } from "zod";
import { superAdminProcedure, protectedProcedure, sensitiveSuperAdminProcedure, tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tenantMemberships, users, permissionAuditLog, permissionOverrides } from "../drizzle/schema";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { USER_ROLES } from "./user-roles-const";
import {
  IMPERSONATE_COOKIE_NAME,
  EIGHT_HOURS_MS,
  DEFAULT_PERMISSION_MATRIX,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_MATRIX_ROLES,
  ROLE_LABELS,
  applyPermissionOverrides,
  defaultPermissionsForRole,
  isPermissionKey,
  isPermissionMatrixRole,
  normalizeUserRole,
  type PermissionKey,
  type UserRole,
} from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

const permissionKeySchema = z.string().refine(isPermissionKey, "Invalid permission key").transform(value => value as PermissionKey);
const permissionRoleSchema = z.string().refine(isPermissionMatrixRole, "Invalid role").transform(value => normalizeUserRole(value) as UserRole);

function rolePermissionRowsToMatrix(rows: Array<{ role: string; permissionKey: string; allowed: boolean }>) {
  return PERMISSION_MATRIX_ROLES.reduce((acc, role) => {
    acc[role] = applyPermissionOverrides(role, rows);
    return acc;
  }, {} as Record<UserRole, Record<PermissionKey, boolean>>);
}

function isDefaultPermission(role: UserRole, permissionKey: PermissionKey, allowed: boolean) {
  return Boolean(DEFAULT_PERMISSION_MATRIX[role]?.[permissionKey]) === allowed;
}

export const userManagementRouter = router({
  myPermissions: protectedProcedure.query(async ({ ctx }) => {
    const role = normalizeUserRole(ctx.user!.role) as UserRole;
    const tenantId = ctx.tenant?.id ?? null;
    const fallbackPermissions = defaultPermissionsForRole(role);
    if (!tenantId) {
      return {
        role,
        tenantId,
        tenantRole: ctx.tenantMembership?.role ?? null,
        permissions: fallbackPermissions,
      };
    }

    try {
      const db = (await getDb())!;
      const rows = await db.select({
        role: permissionOverrides.role,
        permissionKey: permissionOverrides.permissionKey,
        allowed: permissionOverrides.allowed,
      })
        .from(permissionOverrides)
        .where(and(
          eq(permissionOverrides.tenantId, tenantId),
          eq(permissionOverrides.role, role),
        ));

      return {
        role,
        tenantId,
        tenantRole: ctx.tenantMembership?.role ?? null,
        permissions: applyPermissionOverrides(role, rows),
      };
    } catch {
      return {
        role,
        tenantId,
        tenantRole: ctx.tenantMembership?.role ?? null,
        permissions: fallbackPermissions,
      };
    }
  }),

  permissionMatrix: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select({
      id: permissionOverrides.id,
      role: permissionOverrides.role,
      permissionKey: permissionOverrides.permissionKey,
      allowed: permissionOverrides.allowed,
      updatedByName: permissionOverrides.updatedByName,
      updatedAt: permissionOverrides.updatedAt,
    })
      .from(permissionOverrides)
      .where(eq(permissionOverrides.tenantId, ctx.tenant!.id))
      .orderBy(permissionOverrides.role, permissionOverrides.permissionKey);

    const effectiveMatrix = rolePermissionRowsToMatrix(rows);

    return {
      tenantId: ctx.tenant!.id,
      roles: PERMISSION_MATRIX_ROLES.map(role => ({
        role,
        label: ROLE_LABELS[role],
        locked: role === "super_admin",
      })),
      permissions: PERMISSION_KEYS.map(key => ({
        key,
        label: PERMISSION_LABELS[key],
      })),
      defaults: DEFAULT_PERMISSION_MATRIX,
      effective: effectiveMatrix,
      overrides: rows,
    };
  }),

  updatePermissionOverride: tenantAdminProcedure
    .input(z.object({
      role: permissionRoleSchema,
      permissionKey: permissionKeySchema,
      allowed: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.role === "super_admin") {
        throw new Error("Super admin permissions are fixed and cannot be overridden.");
      }

      const db = (await getDb())!;
      const tenantId = ctx.tenant!.id;
      const defaultAllowed = Boolean(DEFAULT_PERMISSION_MATRIX[input.role]?.[input.permissionKey]);
      const oldAllowed = (await db.select({
        allowed: permissionOverrides.allowed,
      })
        .from(permissionOverrides)
        .where(and(
          eq(permissionOverrides.tenantId, tenantId),
          eq(permissionOverrides.role, input.role),
          eq(permissionOverrides.permissionKey, input.permissionKey),
        ))
        .limit(1))[0]?.allowed ?? defaultAllowed;

      if (isDefaultPermission(input.role, input.permissionKey, input.allowed)) {
        await db.delete(permissionOverrides)
          .where(and(
            eq(permissionOverrides.tenantId, tenantId),
            eq(permissionOverrides.role, input.role),
            eq(permissionOverrides.permissionKey, input.permissionKey),
          ));
      } else {
        await db.insert(permissionOverrides)
          .values({
            tenantId,
            role: input.role,
            permissionKey: input.permissionKey,
            allowed: input.allowed,
            updatedBy: ctx.user!.id,
            updatedByName: ctx.user!.name || ctx.user!.email || "Admin",
          })
          .onDuplicateKeyUpdate({
            set: {
              allowed: input.allowed,
              updatedBy: ctx.user!.id,
              updatedByName: ctx.user!.name || ctx.user!.email || "Admin",
              updatedAt: new Date(),
            },
          });
      }

      if (oldAllowed !== input.allowed) {
        await db.insert(permissionAuditLog).values({
          tenantId,
          adminUserId: ctx.user!.id,
          adminUserName: ctx.user!.name || "Admin",
          targetUserId: ctx.user!.id,
          targetUserName: `${ROLE_LABELS[input.role]} role`,
          action: "role_permission_change",
          field: input.permissionKey,
          oldValue: String(oldAllowed),
          newValue: String(input.allowed),
        });
      }

      return { success: true };
    }),

  list: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (ENV.tenancyMode === "single") {
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
          tenantRole: sql<string>`COALESCE(${tenantMemberships.role}, CASE WHEN ${users.role} = 'super_admin' THEN 'owner' WHEN ${users.role} = 'admin' THEN 'admin' ELSE 'member' END)`,
        })
        .from(users)
        .leftJoin(
          tenantMemberships,
          and(
            eq(users.id, tenantMemberships.userId),
            eq(tenantMemberships.tenantId, ctx.tenant!.id),
          ),
        )
        .orderBy(desc(users.lastSignedIn));
      return allUsers;
    }

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

  getAuditLog: tenantAdminProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      targetUserId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const conditions: any[] = [];
      appendTenantScope(conditions, permissionAuditLog.tenantId, tenantIdFromContext(ctx));

      if (input?.targetUserId) {
        conditions.push(eq(permissionAuditLog.targetUserId, input.targetUserId));
      }

      const logs = await db
        .select()
        .from(permissionAuditLog)
        .where(and(...conditions))
        .orderBy(desc(permissionAuditLog.createdAt))
        .limit(limit)
        .offset(offset);
      return logs;
    }),

  getRoles: protectedProcedure.query(() => {
    return USER_ROLES;
  }),

  /** Get impersonation-specific audit log entries */
  getImpersonationLog: tenantAdminProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const conditions: any[] = [like(permissionAuditLog.action, "impersonation%")];
      appendTenantScope(conditions, permissionAuditLog.tenantId, tenantIdFromContext(ctx));
      const logs = await db
        .select()
        .from(permissionAuditLog)
        .where(and(...conditions))
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
