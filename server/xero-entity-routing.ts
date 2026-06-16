import { and, eq, isNull, or } from "drizzle-orm";
import { tenants, xeroConnections, xeroEntityDefaults } from "../drizzle/schema";

export const XERO_ENTITY_MODULES = [
  "global",
  "crm",
  "construction",
  "manufacturing",
  "approvals",
  "trade_portal",
  "portal",
  "scheduled_sync",
] as const;

export type XeroEntityModule = (typeof XERO_ENTITY_MODULES)[number];

export const XERO_ENTITY_MODULE_LABELS: Record<XeroEntityModule, string> = {
  global: "Global default",
  crm: "CRM",
  construction: "Construction",
  manufacturing: "Manufacturing",
  approvals: "Approvals",
  trade_portal: "Trade portal",
  portal: "Client portal",
  scheduled_sync: "Scheduled sync",
};

export function isXeroEntityModule(value: string): value is XeroEntityModule {
  return (XERO_ENTITY_MODULES as readonly string[]).includes(value);
}

export function normalizeXeroEntityModule(value?: string | null): XeroEntityModule {
  return value && isXeroEntityModule(value) ? value : "global";
}

function ambiguousEntityMessage(moduleKey: XeroEntityModule) {
  const label = XERO_ENTITY_MODULE_LABELS[moduleKey] || moduleKey;
  return `Multiple active Xero entities are connected. Configure the ${label} Xero entity default before syncing.`;
}

async function getDefaultConnection(db: any, appTenantId: number, moduleKey: XeroEntityModule) {
  const rows = await db
    .select({ connection: xeroConnections })
    .from(xeroEntityDefaults)
    .innerJoin(xeroConnections, eq(xeroEntityDefaults.xeroConnectionId, xeroConnections.id))
    .where(and(
      eq(xeroEntityDefaults.appTenantId, appTenantId),
      eq(xeroEntityDefaults.moduleKey, moduleKey),
      eq(xeroConnections.isActive, true),
    ))
    .limit(1);
  return rows[0]?.connection || null;
}

async function listActiveConnections(db: any, appTenantId?: number | null) {
  const conditions: any[] = [eq(xeroConnections.isActive, true)];
  if (appTenantId) {
    conditions.push(or(eq(xeroConnections.appTenantId, appTenantId), isNull(xeroConnections.appTenantId)));
  }
  return db
    .select()
    .from(xeroConnections)
    .where(and(...conditions))
    .limit(2);
}

export async function resolveXeroConnectionForModule(
  db: any,
  options: {
    connectionId?: number;
    appTenantId?: number | null;
    moduleKey?: XeroEntityModule | string | null;
  } = {},
) {
  const moduleKey = normalizeXeroEntityModule(options.moduleKey);

  if (options.connectionId) {
    const conditions: any[] = [
      eq(xeroConnections.id, options.connectionId),
      eq(xeroConnections.isActive, true),
    ];
    if (options.appTenantId) {
      conditions.push(or(eq(xeroConnections.appTenantId, options.appTenantId), isNull(xeroConnections.appTenantId)));
    }
    const [connection] = await db.select().from(xeroConnections).where(and(...conditions)).limit(1);
    return connection || null;
  }

  if (options.appTenantId) {
    const moduleDefault = await getDefaultConnection(db, options.appTenantId, moduleKey);
    if (moduleDefault) return moduleDefault;

    if (moduleKey !== "global") {
      const globalDefault = await getDefaultConnection(db, options.appTenantId, "global");
      if (globalDefault) return globalDefault;
    }

    const activeConnections = await listActiveConnections(db, options.appTenantId);
    if (activeConnections.length === 1) return activeConnections[0];
    if (activeConnections.length > 1) {
      throw new Error(ambiguousEntityMessage(moduleKey));
    }
    return null;
  }

  const activeConnections = await listActiveConnections(db);
  if (activeConnections.length === 1) return activeConnections[0];
  if (activeConnections.length > 1) {
    throw new Error("Multiple active Xero entities are connected. Use a tenant/module default or pass a Xero connection id.");
  }
  return null;
}

export async function resolveScheduledXeroConnectionScopes(
  db: any,
  moduleKey: XeroEntityModule | string | null,
) {
  const normalizedModule = normalizeXeroEntityModule(moduleKey);
  const activeTenants = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const scopes: Array<{
    appTenantId: number | null;
    tenantSlug: string | null;
    tenantName: string | null;
    connection: typeof xeroConnections.$inferSelect;
  }> = [];
  const skipped: Array<{ appTenantId: number | null; tenantName: string | null; reason: string }> = [];

  if (!activeTenants.length) {
    try {
      const connection = await resolveXeroConnectionForModule(db, { moduleKey: normalizedModule });
      if (connection) {
        scopes.push({ appTenantId: null, tenantSlug: null, tenantName: null, connection });
      }
    } catch (err: any) {
      skipped.push({ appTenantId: null, tenantName: null, reason: err.message });
    }
    return { scopes, skipped };
  }

  for (const tenant of activeTenants) {
    try {
      const connection = await resolveXeroConnectionForModule(db, {
        appTenantId: tenant.id,
        moduleKey: normalizedModule,
      });
      if (connection) {
        scopes.push({
          appTenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          connection,
        });
      } else {
        skipped.push({
          appTenantId: tenant.id,
          tenantName: tenant.name,
          reason: `No active Xero entity configured for ${XERO_ENTITY_MODULE_LABELS[normalizedModule]}.`,
        });
      }
    } catch (err: any) {
      skipped.push({
        appTenantId: tenant.id,
        tenantName: tenant.name,
        reason: err.message,
      });
    }
  }

  return { scopes, skipped };
}
