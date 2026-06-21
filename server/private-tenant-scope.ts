import { eq, isNull, or, sql } from "drizzle-orm";
import { isMultiTenancyMode, tenantIdFromContext, type TenantContextLike } from "./_core/tenant-scope";
import { getDefaultTenantId } from "./db";

export { tenantIdFromContext };

export async function canReadLegacyRowsForTenant(tenantId: number | null | undefined) {
  if (isMultiTenancyMode()) return false;
  if (!tenantId) return true;
  return (await getDefaultTenantId()) === tenantId;
}

export async function privateTenantScope(column: any, tenantId: number | null | undefined) {
  if (!tenantId) {
    return isMultiTenancyMode() ? sql`1 = 0` : undefined;
  }
  if (isMultiTenancyMode()) return eq(column, tenantId);
  return (await canReadLegacyRowsForTenant(tenantId))
    ? or(eq(column, tenantId), isNull(column))
    : eq(column, tenantId);
}

export async function appendPrivateTenantScope(conditions: any[], column: any, tenantId: number | null | undefined) {
  const condition = await privateTenantScope(column, tenantId);
  if (condition) conditions.push(condition);
}

export async function privateTenantConditions(ctx: TenantContextLike, column: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  await appendPrivateTenantScope(conditions, column, tenantIdFromContext(ctx));
  return conditions;
}
