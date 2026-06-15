import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import {
  constructionJobs,
  xeroConnections,
  xeroProjectMappings,
  xeroSyncLogs,
  xeroWebhookEvents,
} from "../drizzle/schema";
import { getValidAccessToken } from "./xero-client";
import { syncXeroAccountingTransactionsForMappings } from "./xero-accounting-sync";

type XeroWebhookEventPayload = {
  eventId?: string;
  resourceUrl?: string;
  resourceId?: string;
  eventDateUtc?: string;
  eventType?: string;
  eventCategory?: string;
  tenantId?: string;
  tenantType?: string;
  data?: unknown;
};

type XeroWebhookPayload = {
  events?: XeroWebhookEventPayload[];
  firstEventSequence?: number;
  lastEventSequence?: number;
  entropy?: string;
};

type XeroConnectionRow = typeof xeroConnections.$inferSelect;

const activeConnectionSyncs = new Set<number>();
const FINANCIAL_SYNC_WEBHOOK_CATEGORIES = new Set(["INVOICE", "CREDITNOTE", "CREDIT_NOTE"]);

function getSignature(header: Request["headers"][string]) {
  if (Array.isArray(header)) return header[0] || "";
  return header || "";
}

function verifyXeroSignature(rawBody: Buffer, signatureHeader: Request["headers"][string]) {
  const signature = getSignature(signatureHeader);
  if (!ENV.xeroWebhookKey || !signature) return false;

  const expected = createHmac("sha256", ENV.xeroWebhookKey)
    .update(rawBody)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  return expectedBuffer.length === signatureBuffer.length
    && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function normaliseEventCategory(category: string | undefined) {
  return String(category || "").trim().replace(/\s+/g, "_").toUpperCase();
}

function normaliseEventType(type: string | undefined) {
  return String(type || "").trim().toUpperCase();
}

function shouldTriggerFinancialSync(event: XeroWebhookEventPayload) {
  if (event.tenantType && normaliseEventType(event.tenantType) !== "ORGANISATION") return false;
  return FINANCIAL_SYNC_WEBHOOK_CATEGORIES.has(normaliseEventCategory(event.eventCategory));
}

function parseXeroUtcDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildEventId(
  event: XeroWebhookEventPayload,
  payload: XeroWebhookPayload,
  eventIndex: number,
  connectionId: number | null,
) {
  if (event.eventId) {
    return connectionId ? `${connectionId}:${event.eventId}` : event.eventId;
  }

  const source = [
    connectionId || "unmatched",
    event.tenantId || "",
    event.resourceId || event.resourceUrl || "",
    event.eventDateUtc || "",
    event.eventCategory || "",
    event.eventType || "",
    payload.firstEventSequence ?? "",
    payload.lastEventSequence ?? "",
    eventIndex,
  ].join("|");
  return `xero:${createHash("sha256").update(source).digest("hex")}`;
}

async function getConnectionsForWebhookTenant(db: any, xeroTenantId: string | undefined) {
  if (!xeroTenantId) return [];
  return db.select().from(xeroConnections)
    .where(and(
      eq(xeroConnections.tenantId, xeroTenantId),
      eq(xeroConnections.isActive, true),
    ));
}

async function getMappedProjectsForConnection(db: any, connection: XeroConnectionRow) {
  const conditions: any[] = [eq(xeroProjectMappings.xeroConnectionId, connection.id)];
  if (connection.appTenantId) {
    conditions.push(eq(constructionJobs.tenantId, connection.appTenantId));
  }

  return db.select({
    id: xeroProjectMappings.id,
    xeroConnectionId: xeroProjectMappings.xeroConnectionId,
    jobId: xeroProjectMappings.jobId,
    xeroProjectId: xeroProjectMappings.xeroProjectId,
    xeroProjectName: xeroProjectMappings.xeroProjectName,
    xeroProjectStatus: xeroProjectMappings.xeroProjectStatus,
    xeroContactId: xeroProjectMappings.xeroContactId,
    totalInvoiced: xeroProjectMappings.totalInvoiced,
    totalCosts: xeroProjectMappings.totalCosts,
    totalProfit: xeroProjectMappings.totalProfit,
    estimatedCost: xeroProjectMappings.estimatedCost,
    lastSyncedAt: xeroProjectMappings.lastSyncedAt,
  })
    .from(xeroProjectMappings)
    .innerJoin(constructionJobs, eq(xeroProjectMappings.jobId, constructionJobs.id))
    .where(and(...conditions));
}

async function updateWebhookEvents(db: any, eventIds: number[], values: Record<string, unknown>) {
  if (!eventIds.length) return;
  await db.update(xeroWebhookEvents)
    .set(values)
    .where(inArray(xeroWebhookEvents.id, eventIds));
}

async function storeWebhookEvents(db: any, payload: XeroWebhookPayload) {
  const connectionIdsToSync = new Set<number>();
  const events = Array.isArray(payload.events) ? payload.events : [];

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const connections = await getConnectionsForWebhookTenant(db, event.tenantId);
    const targets: Array<XeroConnectionRow | null> = connections.length ? connections : [null];

    for (const connection of targets) {
      const hasConnection = Boolean(connection);
      const shouldSync = hasConnection && shouldTriggerFinancialSync(event);
      const eventId = buildEventId(event, payload, index, connection?.id || null);
      const values = {
        appTenantId: connection?.appTenantId || null,
        xeroConnectionId: connection?.id || null,
        xeroTenantId: event.tenantId || null,
        tenantType: event.tenantType || null,
        eventId,
        eventCategory: normaliseEventCategory(event.eventCategory) || null,
        eventType: normaliseEventType(event.eventType) || null,
        resourceId: event.resourceId || null,
        resourceUrl: event.resourceUrl || null,
        eventDateUtc: parseXeroUtcDate(event.eventDateUtc),
        firstEventSequence: payload.firstEventSequence ?? null,
        lastEventSequence: payload.lastEventSequence ?? null,
        status: shouldSync ? "queued" : "skipped",
        errorMessage: hasConnection
          ? (shouldSync ? null : "Webhook event does not trigger accounting sync")
          : "No active Xero connection matched webhook tenant",
        payload: {
          event,
          firstEventSequence: payload.firstEventSequence ?? null,
          lastEventSequence: payload.lastEventSequence ?? null,
          entropy: payload.entropy ?? null,
        },
        receivedAt: new Date(),
      };

      await db.insert(xeroWebhookEvents).values(values).onDuplicateKeyUpdate({
        set: {
          eventId,
          receivedAt: new Date(),
        },
      });

      if (shouldSync && connection) connectionIdsToSync.add(connection.id);
    }
  }

  return Array.from(connectionIdsToSync);
}

async function processQueuedWebhookEventsForConnection(connectionId: number) {
  if (activeConnectionSyncs.has(connectionId)) return;
  activeConnectionSyncs.add(connectionId);

  try {
    const db = await getDb();
    if (!db) return;

    while (true) {
      const queuedEvents = await db.select({ id: xeroWebhookEvents.id })
        .from(xeroWebhookEvents)
        .where(and(
          eq(xeroWebhookEvents.xeroConnectionId, connectionId),
          eq(xeroWebhookEvents.status, "queued"),
        ))
        .limit(100);
      const queuedEventIds = queuedEvents.map((event: { id: number }) => event.id);
      if (!queuedEventIds.length) break;

      await updateWebhookEvents(db, queuedEventIds, { status: "processing" });

      const [connection] = await db.select().from(xeroConnections)
        .where(and(
          eq(xeroConnections.id, connectionId),
          eq(xeroConnections.isActive, true),
        ))
        .limit(1);

      if (!connection) {
        await updateWebhookEvents(db, queuedEventIds, {
          status: "skipped",
          errorMessage: "Xero connection is no longer active",
          processedAt: new Date(),
        });
        continue;
      }

      const mappings = await getMappedProjectsForConnection(db, connection);
      if (!mappings.length) {
        await updateWebhookEvents(db, queuedEventIds, {
          status: "skipped",
          errorMessage: "No mapped projects found for this Xero connection",
          processedAt: new Date(),
        });
        continue;
      }

      const auth = await getValidAccessToken({
        connectionId,
        appTenantId: connection.appTenantId,
      });
      if (!auth) {
        await updateWebhookEvents(db, queuedEventIds, {
          status: "failed",
          errorMessage: "Could not refresh Xero access token",
          processedAt: new Date(),
        });
        continue;
      }

      const [syncLog] = await db.insert(xeroSyncLogs).values({
        xeroConnectionId: connectionId,
        syncType: "financials",
        status: "running",
        totalItems: mappings.length,
      });
      const syncLogId = syncLog.insertId;

      try {
        const maxPages = Math.max(1, Math.min(50, Number(process.env.XERO_WEBHOOK_SYNC_MAX_PAGES || 10)));
        const result = await syncXeroAccountingTransactionsForMappings(db, auth, mappings, {
          appTenantId: connection.appTenantId,
          maxPages,
          includeUnmatched: false,
        });
        const fetchErrors = result.fetchErrors || [];

        await db.update(xeroSyncLogs)
          .set({
            status: "completed",
            itemsProcessed: result.imported,
            itemsFailed: fetchErrors.length,
            errorMessage: fetchErrors.length ? fetchErrors.join("; ") : null,
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));

        await updateWebhookEvents(db, queuedEventIds, {
          status: fetchErrors.length ? "failed" : "processed",
          syncLogId,
          errorMessage: fetchErrors.length ? fetchErrors.join("; ") : null,
          processedAt: new Date(),
        });
      } catch (error: any) {
        const message = error?.message || "Xero webhook financial sync failed";
        await db.update(xeroSyncLogs)
          .set({
            status: "failed",
            errorMessage: message,
            completedAt: new Date(),
          })
          .where(eq(xeroSyncLogs.id, syncLogId));
        await updateWebhookEvents(db, queuedEventIds, {
          status: "failed",
          syncLogId,
          errorMessage: message,
          processedAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error("[Xero Webhook] Failed to process queued events:", error);
  } finally {
    activeConnectionSyncs.delete(connectionId);
  }
}

function rawBodyFromRequest(req: Request) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}

export function registerXeroWebhooks(app: Express) {
  app.post(
    "/api/xero/webhook",
    express.raw({ type: "application/json", limit: "2mb" }),
    async (req: Request, res: Response) => {
      const rawBody = rawBodyFromRequest(req);
      if (!verifyXeroSignature(rawBody, req.headers["x-xero-signature"])) {
        return res.status(401).send("Unauthorized");
      }

      let payload: XeroWebhookPayload;
      try {
        payload = JSON.parse(rawBody.toString("utf8")) as XeroWebhookPayload;
      } catch {
        return res.status(400).json({ error: "Invalid JSON payload" });
      }

      const events = Array.isArray(payload.events) ? payload.events : [];
      if (!events.length) {
        return res.json({ received: true, validation: true });
      }

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      try {
        const connectionIds = await storeWebhookEvents(db, payload);
        res.json({ received: true, queuedConnections: connectionIds.length });
        for (const connectionId of connectionIds) {
          setImmediate(() => processQueuedWebhookEventsForConnection(connectionId));
        }
      } catch (error: any) {
        console.error("[Xero Webhook] Failed to store event:", error);
        res.status(500).json({ error: error?.message || "Failed to store webhook event" });
      }
    }
  );
}
