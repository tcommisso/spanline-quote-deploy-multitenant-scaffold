import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const ADMIN_ROLES = ['admin', 'super_admin'];
const TENANT_ADMIN_ROLES = ['owner', 'admin'];

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !ADMIN_ROLES.includes(ctx.user!.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user!.role !== 'super_admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

const requireTenant = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (!ctx.tenant || !ctx.tenantMembership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A valid tenant context is required.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenant: ctx.tenant,
      tenantMembership: ctx.tenantMembership,
    },
  });
});

export const tenantProcedure = t.procedure.use(requireTenant);

export const tenantAdminProcedure = tenantProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (
      !TENANT_ADMIN_ROLES.includes(ctx.tenantMembership!.role) &&
      !ADMIN_ROLES.includes(ctx.user!.role)
    ) {
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
