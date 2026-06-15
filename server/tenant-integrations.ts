import { and, eq } from "drizzle-orm";
import {
  tenantIntegrationSettings,
  tenants,
  type TenantIntegrationSetting,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

export const TENANT_INTEGRATION_SERVICES = [
  "domain",
  "email",
  "msgraph",
  "nylas",
  "vocphone",
  "signwell",
  "zapier",
  "planning",
] as const;

export type TenantIntegrationService = typeof TENANT_INTEGRATION_SERVICES[number];

export type TenantDomainConfig = {
  publicAppUrl?: string;
  allowedOrigins?: string[];
};

export type TenantEmailConfig = {
  senderAddress?: string;
  senderName?: string;
  replyTo?: string;
};

export type TenantMsGraphConfig = {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
};

export type TenantNylasConfig = {
  clientId?: string;
  apiKey?: string;
  apiUri?: string;
};

export type TenantVocphoneConfig = {
  username?: string;
  password?: string;
  smsSender?: string;
  smsNumbers?: Array<{ number: string; name?: string }>;
};

export type TenantSignwellConfig = {
  apiKey?: string;
  testMode?: boolean;
  templateId?: string;
};

export type TenantZapierConfig = {
  apiKey?: string;
  ownerOpenId?: string;
};

export type TenantPlanningConfig = {
  councils?: string[];
  t1cloudCouncils?: string[];
  sharePublicFeeds?: boolean;
  daFinderEnabled?: boolean;
};

export type TenantIntegrationConfigMap = {
  domain: TenantDomainConfig;
  email: TenantEmailConfig;
  msgraph: TenantMsGraphConfig;
  nylas: TenantNylasConfig;
  vocphone: TenantVocphoneConfig;
  signwell: TenantSignwellConfig;
  zapier: TenantZapierConfig;
  planning: TenantPlanningConfig;
};

export function fallbackIntegrationConfig<T extends TenantIntegrationService>(service: T): TenantIntegrationConfigMap[T] {
  switch (service) {
    case "domain":
      return {
        publicAppUrl: ENV.publicAppUrl,
        allowedOrigins: ENV.allowedMagicLinkOrigins,
      } as TenantIntegrationConfigMap[T];
    case "email":
      return {
        senderAddress: ENV.emailSenderAddress,
        senderName: ENV.emailSenderName,
        replyTo: ENV.emailReplyTo,
      } as TenantIntegrationConfigMap[T];
    case "msgraph":
      return {
        tenantId: ENV.msGraphTenantId,
        clientId: ENV.msGraphClientId,
        clientSecret: ENV.msGraphClientSecret,
      } as TenantIntegrationConfigMap[T];
    case "nylas":
      return {
        clientId: ENV.nylasClientId,
        apiKey: ENV.nylasApiKey,
        apiUri: ENV.nylasApiUri,
      } as TenantIntegrationConfigMap[T];
    case "vocphone":
      return {
        username: process.env.VOCPHONE_API_USERNAME ?? "",
        password: process.env.VOCPHONE_API_PASSWORD ?? "",
        smsSender: process.env.VOCPHONE_SMS_SENDER ?? "61480855750",
      } as TenantIntegrationConfigMap[T];
    case "signwell":
      return {
        apiKey: ENV.signwellApiKey,
      } as TenantIntegrationConfigMap[T];
    case "zapier":
      return {
        apiKey: ENV.zapierApiKey,
        ownerOpenId: ENV.ownerOpenId,
      } as TenantIntegrationConfigMap[T];
    case "planning":
      return {
        sharePublicFeeds: true,
      } as TenantIntegrationConfigMap[T];
  }
}

export async function getTenantIntegrationRow(
  tenantId: number,
  service: TenantIntegrationService,
): Promise<TenantIntegrationSetting | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(tenantIntegrationSettings)
    .where(and(
      eq(tenantIntegrationSettings.tenantId, tenantId),
      eq(tenantIntegrationSettings.service, service),
    ))
    .limit(1);
  return row ?? null;
}

export async function getTenantIntegrationConfig<T extends TenantIntegrationService>(
  tenantId: number | null | undefined,
  service: T,
): Promise<TenantIntegrationConfigMap[T]> {
  const fallback = fallbackIntegrationConfig(service);
  if (!tenantId) return fallback;

  const row = await getTenantIntegrationRow(tenantId, service);
  if (!row || !row.enabled) return fallback;

  return {
    ...fallback,
    ...((row.config ?? {}) as TenantIntegrationConfigMap[T]),
  };
}

export const getTenantDomainConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "domain");
export const getTenantEmailConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "email");
export const getTenantMsGraphConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "msgraph");
export const getTenantNylasConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "nylas");
export const getTenantVocphoneConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "vocphone");
export const getTenantSignwellConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "signwell");
export const getTenantZapierConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "zapier");
export const getTenantPlanningConfig = (tenantId?: number | null) => getTenantIntegrationConfig(tenantId, "planning");

export function redactIntegrationConfig(config: Record<string, any> | null | undefined) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (/secret|password|token|apiKey|key/i.test(key)) {
      out[key] = value ? "********" : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function findTenantByZapierApiKey(apiKey: string) {
  if (!apiKey) return null;
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      setting: tenantIntegrationSettings,
      tenant: tenants,
    })
    .from(tenantIntegrationSettings)
    .innerJoin(tenants, eq(tenants.id, tenantIntegrationSettings.tenantId))
    .where(and(
      eq(tenantIntegrationSettings.service, "zapier"),
      eq(tenantIntegrationSettings.enabled, true),
    ));

  for (const row of rows) {
    const config = row.setting.config as TenantZapierConfig | null;
    if (config?.apiKey && config.apiKey === apiKey && row.tenant.status === "active") {
      return row.tenant;
    }
  }
  return null;
}

export async function findTenantByVocphoneNumber(phoneNumber: string) {
  const normalized = phoneNumber.replace(/[^0-9]/g, "");
  if (!normalized) return null;
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      setting: tenantIntegrationSettings,
      tenant: tenants,
    })
    .from(tenantIntegrationSettings)
    .innerJoin(tenants, eq(tenants.id, tenantIntegrationSettings.tenantId))
    .where(and(
      eq(tenantIntegrationSettings.service, "vocphone"),
      eq(tenantIntegrationSettings.enabled, true),
    ));

  for (const row of rows) {
    const config = row.setting.config as TenantVocphoneConfig | null;
    const configuredNumbers = [
      config?.smsSender,
      ...(config?.smsNumbers ?? []).map(n => n.number),
    ]
      .filter((n): n is string => !!n)
      .map(n => n.replace(/[^0-9]/g, ""));

    if (configuredNumbers.includes(normalized) && row.tenant.status === "active") {
      return row.tenant;
    }
  }
  return null;
}
