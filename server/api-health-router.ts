import { z } from "zod";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { tenantAdminProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb, getDefaultTenantId } from "./db";
import { daTrackerPollLog, inboxAddresses, nswDaPollLog, xeroWebhookEvents } from "../drizzle/schema";
import { getTenantMsGraphConfig } from "./tenant-integrations";
import { TRPCError } from "@trpc/server";

type ApiKey =
  | "hbcf_onegov"
  | "hbcf_direct"
  | "act_active_das"
  | "act_dafinder"
  | "act_blocks"
  | "nsw_planning"
  | "nsw_six_maps"
  | "open_meteo"
  | "osm_tiles"
  | "locationiq"
  | "openai"
  | "xero"
  | "xero_webhook"
  | "o365_graph"
  | "nylas"
  | "vocphone"
  | "signwell"
  | "zapier";

const apiKeySchema = z.enum([
  "hbcf_onegov",
  "hbcf_direct",
  "act_active_das",
  "act_dafinder",
  "act_blocks",
  "nsw_planning",
  "nsw_six_maps",
  "open_meteo",
  "osm_tiles",
  "locationiq",
  "openai",
  "xero",
  "xero_webhook",
  "o365_graph",
  "nylas",
  "vocphone",
  "signwell",
  "zapier",
]);

type ApiCheck = {
  key: ApiKey;
  name: string;
  category: string;
  baseUrl: string;
  configured: boolean;
  schedule?: string;
  lastSuccessAt?: string | null;
  lastError?: string | null;
};

const API_CHECKS: ApiCheck[] = [
  { key: "hbcf_onegov", name: "HBCF OneGov", category: "Government", baseUrl: "https://api.onegov.nsw.gov.au", configured: true, schedule: "Daily 5:30am + on demand" },
  { key: "hbcf_direct", name: "HBCF Direct", category: "Government", baseUrl: "https://api.hbcf.nsw.gov.au/api/v1/certificates/", configured: true, schedule: "Daily 5:30am + on demand" },
  { key: "act_active_das", name: "ACT Active DAs", category: "Government", baseUrl: "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_ACTIVE_DEVELOPMENT_APPLICATIONS/FeatureServer/0", configured: true, schedule: "Every 6 hours" },
  { key: "act_dafinder", name: "ACT DAFINDER", category: "Government", baseUrl: "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_DAFINDER_LIST_VIEW/FeatureServer/0", configured: true, schedule: "On demand + competitor scans" },
  { key: "act_blocks", name: "ACT Blocks", category: "Government", baseUrl: "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query", configured: true, schedule: "On demand parcel lookup" },
  { key: "nsw_planning", name: "NSW Planning Portal", category: "Government", baseUrl: "https://api.apps1.nsw.gov.au/eplanning/data/v0/DAApplicationTracker", configured: true, schedule: "Daily" },
  { key: "nsw_six_maps", name: "NSW SIX Maps Cadastre", category: "Government", baseUrl: "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9/query", configured: true, schedule: "On demand parcel lookup" },
  { key: "open_meteo", name: "Open-Meteo", category: "Weather", baseUrl: "https://api.open-meteo.com/v1/forecast", configured: true, schedule: "Daily 6am AEST" },
  { key: "osm_tiles", name: "OpenStreetMap Tiles", category: "Maps", baseUrl: "https://tile.openstreetmap.org", configured: true, schedule: "Browser tile fetch" },
  { key: "locationiq", name: "LocationIQ", category: "Maps", baseUrl: "https://api.locationiq.com", configured: !!ENV.locationIqApiKey, schedule: "On demand geocoding" },
  { key: "openai", name: "OpenAI", category: "AI", baseUrl: "https://api.openai.com", configured: !!ENV.openAiApiKey, schedule: "On demand" },
  { key: "xero", name: "Xero", category: "Finance", baseUrl: "https://api.xero.com", configured: !!(ENV.xeroClientId && ENV.xeroClientSecret), schedule: "Every 5 min worker + hourly catch-up + webhooks" },
  { key: "xero_webhook", name: "Xero Webhook", category: "Finance", baseUrl: "/api/xero/webhook", configured: !!ENV.xeroWebhookKey, schedule: "Event-driven" },
  { key: "o365_graph", name: "O365 Graph", category: "Email", baseUrl: "https://graph.microsoft.com", configured: !!(ENV.msGraphTenantId && ENV.msGraphClientId && ENV.msGraphClientSecret), schedule: "Every 5 minutes" },
  { key: "nylas", name: "Nylas", category: "Calendar", baseUrl: ENV.nylasApiUri || "https://api.eu.nylas.com", configured: !!(ENV.nylasClientId && ENV.nylasApiKey), schedule: "On demand calendar sync" },
  { key: "vocphone", name: "VOCPhone", category: "Voice", baseUrl: "VOCPhone API", configured: !!(process.env.VOCPHONE_API_USERNAME && process.env.VOCPHONE_API_PASSWORD), schedule: "Hourly" },
  { key: "signwell", name: "SignWell", category: "Signing", baseUrl: "https://www.signwell.com/api/v1", configured: !!ENV.signwellApiKey, schedule: "Webhooks + on demand" },
  { key: "zapier", name: "Zapier Lead API", category: "Automation", baseUrl: "/api/v1/leads", configured: !!ENV.zapierApiKey, schedule: "Inbound webhook" },
];

async function ensureDefaultTenantAccess(tenantId: number | null | undefined) {
  const defaultTenantId = await getDefaultTenantId();
  if (!defaultTenantId || tenantId !== defaultTenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "API Health is only available to the default tenant.",
    });
  }
}

async function fetchJsonHealth(url: string, init?: RequestInit): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const detail = `${response.status} ${response.statusText}`;
    return { ok: response.ok, detail };
  } catch (error: any) {
    const detail = error?.name === "AbortError"
      ? "Request timed out after 8 seconds"
      : error?.cause?.code || error?.cause?.message || error?.message || "Request failed";
    return { ok: false, detail };
  } finally {
    clearTimeout(timeout);
  }
}

async function testApi(key: ApiKey, tenantId?: number | null): Promise<{ ok: boolean; detail: string }> {
  switch (key) {
    case "act_active_das":
      return fetchJsonHealth("https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_ACTIVE_DEVELOPMENT_APPLICATIONS/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID&returnGeometry=false&resultRecordCount=1&f=json");
    case "act_dafinder":
      return fetchJsonHealth("https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_DAFINDER_LIST_VIEW/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID&returnGeometry=false&resultRecordCount=1&f=json");
    case "act_blocks":
      return fetchJsonHealth("https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID&returnGeometry=false&resultRecordCount=1&f=json");
    case "nsw_planning":
      return fetchJsonHealth("https://api.apps1.nsw.gov.au/eplanning/data/v0/DAApplicationTracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: {}, PageSize: 1, PageNumber: 1 }),
      });
    case "nsw_six_maps":
      return fetchJsonHealth("https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9/query?where=1%3D0&outFields=OBJECTID&returnGeometry=false&f=json");
    case "open_meteo":
      return fetchJsonHealth("https://api.open-meteo.com/v1/forecast?latitude=-35.2809&longitude=149.1300&current=temperature_2m");
    case "osm_tiles":
      return fetchJsonHealth("https://tile.openstreetmap.org/0/0/0.png");
    case "locationiq":
      if (!ENV.locationIqApiKey) return { ok: false, detail: "LOCATIONIQ_API_KEY missing" };
      return fetchJsonHealth(`https://api.locationiq.com/v1/search?key=${ENV.locationIqApiKey}&q=Canberra%20ACT&format=json&limit=1`);
    case "openai":
      if (!ENV.openAiApiKey) return { ok: false, detail: "OPENAI_API_KEY missing" };
      return fetchJsonHealth("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${ENV.openAiApiKey}` } });
    case "xero_webhook":
      return {
        ok: !!ENV.xeroWebhookKey,
        detail: ENV.xeroWebhookKey
          ? "Webhook endpoint configured; validate delivery in Xero by saving the webhook URL, then edit an invoice or credit note."
          : "XERO_WEBHOOK_KEY missing",
      };
    case "o365_graph": {
      const config = await getTenantMsGraphConfig(tenantId);
      const configured = !!(config.tenantId && config.clientId && config.clientSecret);
      if (!configured) {
        return {
          ok: false,
          detail: "Microsoft Graph credentials are missing for this tenant. Configure MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and MS_GRAPH_CLIENT_SECRET in Railway or enable the tenant msgraph integration.",
        };
      }
      const msgraph = await import("./email/msgraph");
      const result = await msgraph.testConnection(tenantId);
      return {
        ok: result.success,
        detail: result.success ? `Connected to ${result.org || "Microsoft Graph"}` : result.error || "Microsoft Graph connection failed",
      };
    }
    default: {
      const check = API_CHECKS.find((item) => item.key === key);
      return {
        ok: !!check?.configured,
        detail: check?.configured ? "Credentials/configuration present" : "Missing credentials/configuration",
      };
    }
  }
}

function toIsoTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export const apiHealthRouter = router({
  list: tenantAdminProcedure.query(async ({ ctx }) => {
    await ensureDefaultTenantAccess(ctx.tenant!.id);
    const db = await getDb();
    let lastActPoll = null as any;
    let lastNswPoll = null as any;
    let lastXeroWebhook = null as any;
    let lastO365MailboxSync = null as { lastSyncAt: Date | string | null } | null;
    const o365GraphConfig = await getTenantMsGraphConfig(ctx.tenant!.id);
    const o365GraphConfigured = !!(
      o365GraphConfig.tenantId
      && o365GraphConfig.clientId
      && o365GraphConfig.clientSecret
    );
    if (db) {
      [lastActPoll] = await db.select().from(daTrackerPollLog)
        .where(eq(daTrackerPollLog.tenantId, ctx.tenant!.id))
        .orderBy(desc(daTrackerPollLog.startedAt))
        .limit(1);
      [lastNswPoll] = await db.select().from(nswDaPollLog)
        .where(eq(nswDaPollLog.tenantId, ctx.tenant!.id))
        .orderBy(desc(nswDaPollLog.startedAt))
        .limit(1);
      [lastXeroWebhook] = await db.select()
        .from(xeroWebhookEvents)
        .where(eq(xeroWebhookEvents.appTenantId, ctx.tenant!.id))
        .orderBy(desc(xeroWebhookEvents.receivedAt))
        .limit(1);
      [lastO365MailboxSync] = await db.select({ lastSyncAt: inboxAddresses.lastSyncAt })
        .from(inboxAddresses)
        .where(and(
          eq(inboxAddresses.tenantId, ctx.tenant!.id),
          eq(inboxAddresses.active, true),
          eq(inboxAddresses.provider, "msgraph"),
          isNotNull(inboxAddresses.lastSyncAt),
        ))
        .orderBy(desc(inboxAddresses.lastSyncAt))
        .limit(1);
    }

    return API_CHECKS.map((check) => {
      const pollLog = check.key === "act_active_das" ? lastActPoll : check.key === "nsw_planning" ? lastNswPoll : null;
      if (check.key === "xero_webhook") {
        return {
          ...check,
          lastSuccessAt: ["processed", "queued", "processing", "skipped"].includes(lastXeroWebhook?.status)
            ? lastXeroWebhook.receivedAt
            : null,
          lastError: lastXeroWebhook?.status === "failed" ? lastXeroWebhook.errorMessage || "Last webhook failed" : null,
        };
      }
      if (check.key === "o365_graph") {
        return {
          ...check,
          configured: o365GraphConfigured,
          lastSuccessAt: toIsoTimestamp(lastO365MailboxSync?.lastSyncAt),
          lastError: o365GraphConfigured
            ? null
            : "Microsoft Graph credentials are missing for this tenant",
        };
      }
      return {
        ...check,
        lastSuccessAt: pollLog?.status === "success" ? pollLog.finishedAt || pollLog.startedAt : null,
        lastError: pollLog?.status === "failed" ? pollLog.errorMessage || "Last poll failed" : null,
      };
    });
  }),
  test: tenantAdminProcedure
    .input(z.object({ key: apiKeySchema }))
    .mutation(async ({ ctx, input }) => {
      await ensureDefaultTenantAccess(ctx.tenant!.id);
      const result = await testApi(input.key, ctx.tenant!.id);
      return {
        key: input.key,
        testedAt: new Date().toISOString(),
        ...result,
      };
    }),
  testAll: tenantAdminProcedure
    .mutation(async ({ ctx }) => {
      await ensureDefaultTenantAccess(ctx.tenant!.id);
      const testedAt = new Date().toISOString();
      const results = [];
      for (const check of API_CHECKS) {
        try {
          const result = await testApi(check.key, ctx.tenant!.id);
          results.push({ key: check.key, testedAt, ...result });
        } catch (error: any) {
          results.push({
            key: check.key,
            testedAt,
            ok: false,
            detail: error?.message || String(error || "API test failed"),
          });
        }
      }
      return results;
    }),
});
