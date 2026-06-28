import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { componentCatalogueProducts } from "../drizzle/schema";
import { tenantIdFromContext, type TenantContextLike } from "./_core/tenant-scope";

export function requireComponentCatalogueTenantId(ctx: TenantContextLike) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context is required for component catalogue access" });
  }
  return tenantId;
}

export function componentCatalogueTenantConditions(ctx: TenantContextLike, ...baseConditions: any[]) {
  const tenantId = tenantIdFromContext(ctx);
  return [
    tenantId ? eq(componentCatalogueProducts.tenantId, tenantId) : sql`1 = 0`,
    ...baseConditions,
  ];
}

export function componentCatalogueWhere(ctx: TenantContextLike, ...baseConditions: any[]) {
  return and(...componentCatalogueTenantConditions(ctx, ...baseConditions));
}
