import webpush from "web-push";
import { getDb } from "./db";
import { pushSubscriptions } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Configure VAPID
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:notifications@altaspan.business",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

/**
 * Subscribe a user (main app or portal) to push notifications
 */
export async function subscribePush(params: {
  userId?: number;
  portalType?: "client" | "trade";
  portalAccessId?: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Remove any existing subscription with the same endpoint
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, params.endpoint));

  // Insert new subscription
  await db.insert(pushSubscriptions).values({
    userId: params.userId || null,
    portalType: params.portalType || null,
    portalAccessId: params.portalAccessId || null,
    endpoint: params.endpoint,
    p256dh: params.p256dh,
    auth: params.auth,
    userAgent: params.userAgent || null,
  });
}

/**
 * Unsubscribe by endpoint
 */
export async function unsubscribePush(endpoint: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/**
 * Send push notification to a specific user (main app)
 */
export async function sendPushToUser(userId: number, payload: PushPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  await sendToSubscriptions(subs, payload);
}

/**
 * Send push notification to a portal user
 */
export async function sendPushToPortalUser(
  portalType: "client" | "trade",
  portalAccessId: number,
  payload: PushPayload
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.portalType, portalType),
        eq(pushSubscriptions.portalAccessId, portalAccessId)
      )
    );

  await sendToSubscriptions(subs, payload);
}

/**
 * Send push notification to all main app users
 */
export async function sendPushToAllUsers(payload: PushPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all main app subscriptions (userId is set, portalType is null)
  const allSubs = await db.select().from(pushSubscriptions);
  const mainAppSubs = allSubs.filter((s: { userId: number | null; portalType: string | null }) => s.userId != null && s.portalType == null);

  await sendToSubscriptions(mainAppSubs, payload);
}

async function sendToSubscriptions(
  subs: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload
) {
  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr
        )
        .catch(async (err) => {
          // If subscription expired or invalid, remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            const db = await getDb();
            if (db) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            }
          }
          throw err;
        })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { sent, failed };
}
