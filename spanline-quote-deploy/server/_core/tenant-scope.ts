import { eq, isNull, or } from "drizzle-orm";

export type TenantContextLike = {
  tenant?: { id: number } | null;
};

export function tenantIdFromContext(ctx: TenantContextLike) {
  return ctx.tenant?.id ?? null;
}

export function tenantScoped(column: any, tenantId: number | null | undefined) {
  if (!tenantId) return undefined;
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
  return !tenantId || recordTenantId == null || recordTenantId === tenantId;
}
