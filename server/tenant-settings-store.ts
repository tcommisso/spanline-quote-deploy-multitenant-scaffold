import { eq } from "drizzle-orm";
import { globalSettings, tenants, tenantSettings } from "../drizzle/schema";
import { getDb } from "./db";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

async function getLegacyGlobalSetting<T = unknown>(key: string): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ value: globalSettings.value })
    .from(globalSettings)
    .where(eq(globalSettings.key, key))
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

async function upsertLegacyGlobalSetting(key: string, value: unknown) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(globalSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function getTenantAppSetting<T = unknown>(
  tenantId: number | null | undefined,
  key: string,
  options: { fallbackToGlobal?: boolean } = {},
): Promise<T | null> {
  const db = await getDb();
  const fallbackToGlobal = options.fallbackToGlobal ?? true;
  if (!db) return null;

  if (tenantId) {
    const [row] = await db
      .select({ appSettings: tenantSettings.appSettings })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    const appSettings = asRecord(row?.appSettings);
    if (Object.prototype.hasOwnProperty.call(appSettings, key)) {
      return appSettings[key] as T;
    }
  }

  return fallbackToGlobal ? getLegacyGlobalSetting<T>(key) : null;
}

export async function getPrimaryTenantAppSetting<T = unknown>(key: string): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .limit(1);
  return getTenantAppSetting<T>(tenant?.id, key);
}

export async function setTenantAppSetting(
  tenantId: number | null | undefined,
  key: string,
  value: unknown,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (!tenantId) {
    await upsertLegacyGlobalSetting(key, value);
    return { success: true };
  }

  const [row] = await db
    .select({ appSettings: tenantSettings.appSettings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const appSettings = { ...asRecord(row?.appSettings), [key]: value };

  await db
    .insert(tenantSettings)
    .values({
      tenantId,
      companyDetails: null,
      branding: {},
      featureFlags: {},
      appSettings,
    })
    .onDuplicateKeyUpdate({
      set: {
        appSettings,
      },
    });

  return { success: true };
}

export async function removeTenantAppSetting(
  tenantId: number | null | undefined,
  key: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (!tenantId) {
    await db.delete(globalSettings).where(eq(globalSettings.key, key));
    return { success: true };
  }

  const [row] = await db
    .select({ appSettings: tenantSettings.appSettings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const appSettings = { ...asRecord(row?.appSettings) };
  delete appSettings[key];

  await db
    .update(tenantSettings)
    .set({ appSettings })
    .where(eq(tenantSettings.tenantId, tenantId));

  return { success: true };
}
