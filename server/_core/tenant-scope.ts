import { eq, isNull, or, sql } from "drizzle-orm";
import { ENV } from "./env";

export type TenantContextLike = {
  tenant?: { id: number } | null;
};

export function tenantIdFromContext(ctx: TenantContextLike) {
  return ctx.tenant?.id ?? null;
}

export function isMultiTenancyMode() {
  return ENV.tenancyMode === "multi";
}

export function tenantScoped(column: any, tenantId: number | null | undefined) {
  if (!tenantId) {
    return isMultiTenancyMode() ? sql`1 = 0` : undefined;
  }
  if (isMultiTenancyMode()) return eq(column, tenantId);
  return or(eq(column, tenantId), isNull(column));
}

export function appendTenantScope(
  conditions: any[],
  column: any,
  tenantId: number | null | undefined,
) {
  const condition = tenantScoped(column, tenantId);
  if (condition) conditions.push(condition);
}

export function isRecordVisibleToTenant(
  recordTenantId: number | null | undefined,
  tenantId: number | null | undefined,
) {
  if (isMultiTenancyMode()) {
    return tenantId != null && recordTenantId === tenantId;
  }
  return !tenantId || recordTenantId == null || recordTenantId === tenantId;
}
