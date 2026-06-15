import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, PortalAccess, TradePortalAccess, Tenant, TenantMembership } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { eq, and } from "drizzle-orm";
import { users, portalSessions, portalAccess, tradePortalSessions, tradePortalAccess } from "../../drizzle/schema";
import { IMPERSONATE_COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { isAdminRole } from "@shared/const";
import { getTenantById, resolveTenantForRequest } from "../tenant-db";
import { isRecordVisibleToTenant } from "./tenant-scope";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** The real admin user when impersonating; null otherwise */
  realUser: User | null;
  /** True when the current request is being served under impersonation */
  isImpersonating: boolean;
  tenant: Tenant | null;
  tenantMembership: TenantMembership | null;
  portalAccess: PortalAccess | null;
  tradePortalAccess: TradePortalAccess | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let realUser: User | null = null;
  let isImpersonating = false;
  let tenant: Tenant | null = null;
  let tenantMembership: TenantMembership | null = null;
  let portalAccessRecord: typeof portalAccess.$inferSelect | null = null;
  let tradePortalAccessRecord: typeof tradePortalAccess.$inferSelect | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // ─── Impersonation check ─────────────────────────────────────────────────
  // If the authenticated user is an admin and the impersonation cookie is set,
  // swap ctx.user to the target user while preserving the real admin in ctx.realUser
  if (user && isAdminRole(user.role)) {
    const cookies = parseCookieHeader(opts.req.headers.cookie || "");
    const impersonateUserId = cookies[IMPERSONATE_COOKIE_NAME];
    if (impersonateUserId) {
      const targetId = parseInt(impersonateUserId, 10);
      if (!isNaN(targetId) && targetId !== user.id) {
        try {
          const db = await getDb();
          if (db) {
            const [targetUser] = await db
              .select()
              .from(users)
              .where(eq(users.id, targetId))
              .limit(1);
            if (targetUser) {
              realUser = user;
              user = targetUser;
              isImpersonating = true;
            }
          }
        } catch (e) {
          // If impersonation lookup fails, continue as normal admin
        }
      }
    }
  }

  ({ tenant, tenantMembership } = await resolveTenantForRequest(opts.req, user));

  // Check for portal session token in header
  const portalSessionToken = opts.req.headers["x-portal-session"] as string | undefined;
  if (portalSessionToken) {
    try {
      const db = await getDb();
      if (db) {
        const [session] = await db
          .select()
          .from(portalSessions)
          .where(
            and(
              eq(portalSessions.sessionToken, portalSessionToken),
            )
          )
          .limit(1);

        if (session && session.expiresAt > new Date()) {
          const [access] = await db
            .select()
            .from(portalAccess)
            .where(
              and(
                eq(portalAccess.id, session.portalAccessId),
                eq(portalAccess.isActive, true)
              )
            )
            .limit(1);

          if (access && isRecordVisibleToTenant(access.tenantId, tenant?.id)) {
            portalAccessRecord = access;
            if (!tenant && access.tenantId) {
              tenant = await getTenantById(access.tenantId);
            }
          }
        }
      }
    } catch (e) {
      // Portal auth is optional, don't block request
    }
  }

  // Check for trade portal session token in header
  const tradePortalSessionToken = opts.req.headers["x-trade-portal-session"] as string | undefined;
  if (tradePortalSessionToken) {
    try {
      const db = await getDb();
      if (db) {
        const [session] = await db
          .select()
          .from(tradePortalSessions)
          .where(
            eq(tradePortalSessions.sessionToken, tradePortalSessionToken)
          )
          .limit(1);

        if (session && session.expiresAt > new Date()) {
          const [access] = await db
            .select()
            .from(tradePortalAccess)
            .where(
              and(
                eq(tradePortalAccess.id, session.tradePortalAccessId),
                eq(tradePortalAccess.isActive, true)
              )
            )
            .limit(1);

          if (access && isRecordVisibleToTenant(access.tenantId, tenant?.id)) {
            tradePortalAccessRecord = access;
            if (!tenant && access.tenantId) {
              tenant = await getTenantById(access.tenantId);
            }
          }
        }
      }
    } catch (e) {
      // Trade portal auth is optional, don't block request
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    realUser,
    isImpersonating,
    tenant,
    tenantMembership,
    portalAccess: portalAccessRecord,
    tradePortalAccess: tradePortalAccessRecord,
  };
}
