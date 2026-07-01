import { isAdminRole, normalizeUserRole, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { logTrpcActivity } from "../user-activity-log";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const activityLogMiddleware = t.middleware(async opts => {
  const result = await opts.next();
  const activityOpts = opts as typeof opts & {
    path?: string;
    type?: string;
    rawInput?: unknown;
  };

  if (result.ok && activityOpts.path && activityOpts.type === "mutation") {
    void logTrpcActivity(opts.ctx, activityOpts.path, activityOpts.type, activityOpts.rawInput);
  }

  return result;
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  const user = ctx.user;

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser).use(activityLogMiddleware);

const TENANT_ADMIN_ROLES = ['owner', 'admin'];

export function canAdministerTenant(
  userRole: string | null | undefined,
  tenantRole: string | null | undefined,
) {
  if (tenantRole && TENANT_ADMIN_ROLES.includes(normalizeUserRole(tenantRole))) return true;
  return ENV.tenancyMode !== "multi" && isAdminRole(userRole);
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const user = ctx.user;

    if (!user || !isAdminRole(user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user,
      },
    });
  }),
).use(activityLogMiddleware);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const user = ctx.user;

    if (!user || normalizeUserRole(user.role) !== 'super_admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user,
      },
    });
  }),
).use(activityLogMiddleware);

const requireTenant = t.middleware(async opts => {
  const { ctx, next } = opts;
  const user = ctx.user;
  const tenant = ctx.tenant;
  const tenantMembership = ctx.tenantMembership;

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (!tenant || !tenantMembership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A valid tenant context is required.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user,
      tenant,
      tenantMembership,
    },
  });
});

export const tenantProcedure = t.procedure.use(requireTenant).use(activityLogMiddleware);

export const tenantAdminProcedure = tenantProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!canAdministerTenant(ctx.user!.role, ctx.tenantMembership!.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({ ctx });
  }),
);

/**
 * Middleware that blocks requests made during impersonation.
 * Use for sensitive actions like password changes, account deletion, or starting further impersonation.
 */
const noImpersonation = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (ctx.isImpersonating) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action is not allowed during impersonation. Please stop impersonating first.",
    });
  }
  return next({ ctx });
});

/** Admin procedure that also blocks impersonated sessions */
export const sensitiveAdminProcedure = adminProcedure.use(noImpersonation);

/** Super admin procedure that also blocks impersonated sessions */
export const sensitiveSuperAdminProcedure = superAdminProcedure.use(noImpersonation);
