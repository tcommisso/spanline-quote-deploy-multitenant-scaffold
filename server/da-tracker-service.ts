/**
 * DA Tracker Polling Service
 * Fetches active development applications from ACT ArcGIS REST API,
 * upserts into local DB, detects new/changed/removed DAs, and triggers webhooks.
 */
import { getDb } from "./db";
import { daTrackerApplications, daTrackerPollLog, daTrackerWebhookSubscriptions, daTrackerWebhookDeliveries } from "../drizzle/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import crypto from "crypto";

const ARCGIS_BASE = "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_ACTIVE_DEVELOPMENT_APPLICATIONS/FeatureServer/0";
const PAGE_SIZE = 1000;

interface ArcGISFeature {
  attributes: {
    OBJECTID: number;
    DA_NUMBER: number;
    ACTIVITY: number;
    BLOCK_KEY: number;
    DISTRICT: string;
    DIVISION: string;
    SECTION: number;
    BLOCK: number;
    LODGEMENT_DATE: number;
    APPLICATION_TYPE: string;
    SUBCLASS: string;
    Shape__Area: number;
    Shape__Length: number;
  };
  geometry?: {
    rings: number[][][];
  };
}

function computeCentroid(rings: number[][][]): { lat: number; lng: number } {
  if (!rings || rings.length === 0 || rings[0].length === 0) {
    return { lat: 0, lng: 0 };
  }
  const ring = rings[0];
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng;
    sumLat += lat;
  }
  return { lng: sumLng / ring.length, lat: sumLat / ring.length };
}

function computeHash(attrs: ArcGISFeature["attributes"]): string {
  const str = JSON.stringify({
    da: attrs.DA_NUMBER,
    oid: attrs.OBJECTID,
    act: attrs.ACTIVITY,
    dist: attrs.DISTRICT,
    div: attrs.DIVISION,
    sec: attrs.SECTION,
    blk: attrs.BLOCK,
    type: attrs.APPLICATION_TYPE,
    sub: attrs.SUBCLASS,
    lod: attrs.LODGEMENT_DATE,
  });
  return crypto.createHash("md5").update(str).digest("hex");
}

async function fetchAllFeatures(): Promise<ArcGISFeature[]> {
  const allFeatures: ArcGISFeature[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${ARCGIS_BASE}/query?where=1%3D1&outFields=*&outSR=4326&returnGeometry=true&resultRecordCount=${PAGE_SIZE}&resultOffset=${offset}&f=json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`ArcGIS API error: ${resp.status} ${resp.statusText}`);
    const data = await resp.json();

    if (data.error) throw new Error(`ArcGIS query error: ${data.error.message}`);

    const features = data.features || [];
    allFeatures.push(...features);

    if (features.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += PAGE_SIZE;
    }
  }

  return allFeatures;
}

export async function pollDaApplications(options?: { tenantId?: number | null }): Promise<{
  newCount: number;
  updatedCount: number;
  removedCount: number;
  totalFetched: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tenantId = options?.tenantId ?? null;
  const startTime = Date.now();
  const errors: string[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let removedCount = 0;

  // Create poll log entry
  const logResult = await db.insert(daTrackerPollLog).values({
    tenantId,
    startedAt: new Date(),
  });
  const logId = (logResult as any)[0].insertId;

  try {
    // Fetch all features from ArcGIS
    const features = await fetchAllFeatures();
    const totalFetched = features.length;

    // Get existing records (keyed by objectId)
    const existing = await db.select({ id: daTrackerApplications.id, objectId: daTrackerApplications.objectId, lastHash: daTrackerApplications.lastHash })
      .from(daTrackerApplications)
      .where(and(
        tenantId ? eq(daTrackerApplications.tenantId, tenantId) : isNull(daTrackerApplications.tenantId),
        isNull(daTrackerApplications.removedAt),
      ));

    const existingMap = new Map<number, { id: number; objectId: number; lastHash: string | null }>(
      existing.map((e: { id: number; objectId: number; lastHash: string | null }) => [e.objectId, e])
    );
    const seenObjectIds = new Set<number>();

    // Process each feature
    for (const feature of features) {
      const attrs = feature.attributes;
      const objectId = attrs.OBJECTID;
      seenObjectIds.add(objectId);

      const hash = computeHash(attrs);
      const centroid = feature.geometry ? computeCentroid(feature.geometry.rings) : { lat: 0, lng: 0 };
      const lodgementDate = attrs.LODGEMENT_DATE ? new Date(attrs.LODGEMENT_DATE) : null;

      const existingRecord = existingMap.get(objectId);

      if (!existingRecord) {
        // New DA
        await db.insert(daTrackerApplications).values({
          tenantId,
          daNumber: attrs.DA_NUMBER,
          objectId: objectId,
          activity: attrs.ACTIVITY,
          blockKey: attrs.BLOCK_KEY,
          district: attrs.DISTRICT,
          division: attrs.DIVISION,
          section: attrs.SECTION,
          block: attrs.BLOCK,
          lodgementDate,
          applicationType: attrs.APPLICATION_TYPE,
          subclass: attrs.SUBCLASS,
          shapeArea: attrs.Shape__Area,
          shapeLength: attrs.Shape__Length,
          centroidLat: centroid.lat,
          centroidLng: centroid.lng,
          polygonJson: feature.geometry?.rings || null,
          lastHash: hash,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        });
        newCount++;

        // Get the inserted ID for webhook dispatch
        const [inserted] = await db.select({ id: daTrackerApplications.id })
          .from(daTrackerApplications)
          .where(and(
            tenantId ? eq(daTrackerApplications.tenantId, tenantId) : isNull(daTrackerApplications.tenantId),
            eq(daTrackerApplications.objectId, objectId),
            isNull(daTrackerApplications.removedAt)
          ))
          .limit(1);

        if (inserted) {
          await dispatchWebhooks(db, inserted.id, attrs, "new_da", tenantId);
        }
      } else if (existingRecord.lastHash !== hash) {
        // Updated DA
        await db.update(daTrackerApplications)
          .set({
            daNumber: attrs.DA_NUMBER,
            activity: attrs.ACTIVITY,
            blockKey: attrs.BLOCK_KEY,
            district: attrs.DISTRICT,
            division: attrs.DIVISION,
            section: attrs.SECTION,
            block: attrs.BLOCK,
            lodgementDate,
            applicationType: attrs.APPLICATION_TYPE,
            subclass: attrs.SUBCLASS,
            shapeArea: attrs.Shape__Area,
            shapeLength: attrs.Shape__Length,
            centroidLat: centroid.lat,
            centroidLng: centroid.lng,
            polygonJson: feature.geometry?.rings || null,
            lastHash: hash,
            lastSeenAt: new Date(),
          })
          .where(and(
            eq(daTrackerApplications.id, existingRecord.id),
            tenantId ? eq(daTrackerApplications.tenantId, tenantId) : isNull(daTrackerApplications.tenantId),
          ));
        updatedCount++;

        await dispatchWebhooks(db, existingRecord.id, attrs, "updated_da", tenantId);
      } else {
        // No change, just update lastSeenAt
        await db.update(daTrackerApplications)
          .set({ lastSeenAt: new Date() })
          .where(and(
            eq(daTrackerApplications.id, existingRecord.id),
            tenantId ? eq(daTrackerApplications.tenantId, tenantId) : isNull(daTrackerApplications.tenantId),
          ));
      }
    }

    // Mark removed DAs (were active but not in current fetch)
    for (const entry of existing) {
      if (!seenObjectIds.has(entry.objectId)) {
        await db.update(daTrackerApplications)
          .set({ removedAt: new Date() })
          .where(and(
            eq(daTrackerApplications.id, entry.id),
            tenantId ? eq(daTrackerApplications.tenantId, tenantId) : isNull(daTrackerApplications.tenantId),
          ));
        removedCount++;

        // Get full record for webhook
        const [fullRecord] = await db.select()
          .from(daTrackerApplications)
          .where(eq(daTrackerApplications.id, entry.id))
          .limit(1);
        if (fullRecord) {
          await dispatchWebhooks(db, entry.id, {
            DA_NUMBER: fullRecord.daNumber,
            DISTRICT: fullRecord.district || "",
            DIVISION: fullRecord.division || "",
            SUBCLASS: fullRecord.subclass || "",
            APPLICATION_TYPE: fullRecord.applicationType || "",
          } as any, "removed_da", tenantId);
        }
      }
    }

    // Update poll log
    await db.update(daTrackerPollLog)
      .set({
        completedAt: new Date(),
        totalFetched,
        newApplications: newCount,
        updatedApplications: updatedCount,
        removedApplications: removedCount,
        durationMs: Date.now() - startTime,
      })
      .where(eq(daTrackerPollLog.id, logId));

    return { newCount, updatedCount, removedCount, totalFetched, errors };
  } catch (err: any) {
    errors.push(err.message);
    await db.update(daTrackerPollLog)
      .set({
        completedAt: new Date(),
        errorMessage: err.message,
        durationMs: Date.now() - startTime,
      })
      .where(eq(daTrackerPollLog.id, logId));
    return { newCount, updatedCount, removedCount, totalFetched: 0, errors };
  }
}

/**
 * Match subscriptions against a DA event and create delivery records
 */
async function dispatchWebhooks(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  daApplicationId: number,
  attrs: Partial<ArcGISFeature["attributes"]>,
  eventType: "new_da" | "updated_da" | "removed_da",
  tenantId?: number | null,
) {
  // Get all active subscriptions
  const subscriptions = await db.select()
    .from(daTrackerWebhookSubscriptions)
    .where(and(
      tenantId ? eq(daTrackerWebhookSubscriptions.tenantId, tenantId) : isNull(daTrackerWebhookSubscriptions.tenantId),
      eq(daTrackerWebhookSubscriptions.active, true),
    ));

  for (const sub of subscriptions) {
    // Check filter match
    if (sub.filterDistrict && sub.filterDistrict !== attrs.DISTRICT) continue;
    if (sub.filterDivision && sub.filterDivision !== attrs.DIVISION) continue;
    if (sub.filterSubclass && sub.filterSubclass !== attrs.SUBCLASS) continue;
    if (sub.filterApplicationType && sub.filterApplicationType !== attrs.APPLICATION_TYPE) continue;

    // Create delivery record
    const payload = {
      eventType,
      daNumber: attrs.DA_NUMBER,
      district: attrs.DISTRICT,
      division: attrs.DIVISION,
      subclass: attrs.SUBCLASS,
      applicationType: attrs.APPLICATION_TYPE,
      timestamp: new Date().toISOString(),
    };

    await db.insert(daTrackerWebhookDeliveries).values({
      tenantId: sub.tenantId ?? tenantId ?? null,
      subscriptionId: sub.id,
      daApplicationId,
      eventType,
      status: "pending",
      payload,
    });
  }
}

/**
 * Process pending webhook deliveries (called by scheduled job)
 */
export async function processWebhookDeliveries(options?: { tenantId?: number | null }): Promise<{ delivered: number; failed: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tenantId = options?.tenantId ?? null;
  let delivered = 0;
  let failed = 0;

  const pending = await db.select()
    .from(daTrackerWebhookDeliveries)
    .where(and(
      tenantId ? eq(daTrackerWebhookDeliveries.tenantId, tenantId) : isNull(daTrackerWebhookDeliveries.tenantId),
      eq(daTrackerWebhookDeliveries.status, "pending"),
    ))
    .limit(100);

  for (const delivery of pending) {
    const [sub] = await db.select()
      .from(daTrackerWebhookSubscriptions)
      .where(and(
        tenantId ? eq(daTrackerWebhookSubscriptions.tenantId, tenantId) : isNull(daTrackerWebhookSubscriptions.tenantId),
        eq(daTrackerWebhookSubscriptions.id, delivery.subscriptionId),
      ))
      .limit(1);

    if (!sub) {
      await db.update(daTrackerWebhookDeliveries)
        .set({ status: "failed", errorMessage: "Subscription not found" })
        .where(eq(daTrackerWebhookDeliveries.id, delivery.id));
      failed++;
      continue;
    }

    try {
      if (sub.notifyMethod === "webhook" && sub.webhookUrl) {
        const resp = await fetch(sub.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(delivery.payload),
        });
        await db.update(daTrackerWebhookDeliveries)
          .set({
            status: resp.ok ? "delivered" : "failed",
            attempts: (delivery.attempts || 0) + 1,
            lastAttemptAt: new Date(),
            deliveredAt: resp.ok ? new Date() : undefined,
            responseStatus: resp.status,
            responseBody: await resp.text().catch(() => null),
          })
          .where(eq(daTrackerWebhookDeliveries.id, delivery.id));
        if (resp.ok) delivered++;
        else failed++;
      } else if (sub.notifyMethod === "email" && sub.emailAddress) {
        await sendNotificationEmail({
          tenantId: sub.tenantId ?? tenantId ?? undefined,
          to: sub.emailAddress,
          subject: `DA Tracker Alert: ${(delivery.payload as any)?.eventType === "new_da" ? "New" : "Updated"} DA ${(delivery.payload as any)?.daNumber}`,
          htmlBody: `<h2>DA Tracker Notification</h2>
<p><strong>Event:</strong> ${(delivery.payload as any)?.eventType}</p>
<p><strong>DA Number:</strong> ${(delivery.payload as any)?.daNumber}</p>
<p><strong>District:</strong> ${(delivery.payload as any)?.district}</p>
<p><strong>Division:</strong> ${(delivery.payload as any)?.division}</p>
<p><strong>Subclass:</strong> ${(delivery.payload as any)?.subclass}</p>
<p><strong>Time:</strong> ${(delivery.payload as any)?.timestamp}</p>`,
        });
        await db.update(daTrackerWebhookDeliveries)
          .set({
            status: "delivered",
            attempts: (delivery.attempts || 0) + 1,
            lastAttemptAt: new Date(),
            deliveredAt: new Date(),
          })
          .where(eq(daTrackerWebhookDeliveries.id, delivery.id));
        delivered++;
      } else {
        // in_app - mark as delivered (frontend will query deliveries)
        await db.update(daTrackerWebhookDeliveries)
          .set({
            status: "delivered",
            attempts: (delivery.attempts || 0) + 1,
            lastAttemptAt: new Date(),
            deliveredAt: new Date(),
          })
          .where(eq(daTrackerWebhookDeliveries.id, delivery.id));
        delivered++;
      }
    } catch (err: any) {
      await db.update(daTrackerWebhookDeliveries)
        .set({
          status: (delivery.attempts || 0) >= 2 ? "failed" : "retrying",
          attempts: (delivery.attempts || 0) + 1,
          lastAttemptAt: new Date(),
          errorMessage: err.message,
        })
        .where(eq(daTrackerWebhookDeliveries.id, delivery.id));
      failed++;
    }
  }

  return { delivered, failed };
}
