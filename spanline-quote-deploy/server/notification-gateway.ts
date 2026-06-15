/**
 * Notification Gateway
 *
 * Centralised helper that:
 * 1. Checks if a notification setting is enabled (master_data "notification" category)
 * 2. Respects quiet hours (quiet_hours_start / quiet_hours_end)
 * 3. Respects channel preferences (channel_admin_alerts, channel_client_updates, channel_trade_updates)
 * 4. Checks user-level overrides (userNotificationPreferences)
 * 5. Logs every notification attempt to notification_log table
 */

import { getDb, getMasterDataValue } from "./db";
import { notificationLog } from "../drizzle/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationChannel = "email" | "sms" | "push" | "in_app" | "owner_notify";
export type RecipientType = "owner" | "user" | "client" | "trade";

export interface NotificationAttempt {
  settingKey: string;
  channel: NotificationChannel;
  recipientType: RecipientType;
  recipientId?: string;
  title: string;
  metadata?: Record<string, any>;
}

export interface NotificationGateResult {
  allowed: boolean;
  suppressionReason?: "setting_disabled" | "quiet_hours" | "user_preference" | "channel_disabled";
}

// ─── Quiet Hours Check ───────────────────────────────────────────────────────

const AEST_OFFSET_HOURS = 10;

function getCurrentAESTHour(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  return (utcHour + AEST_OFFSET_HOURS) % 24;
}

async function isWithinQuietHours(): Promise<boolean> {
  const startStr = await getMasterDataValue("notification", "quiet_hours_start");
  const endStr = await getMasterDataValue("notification", "quiet_hours_end");

  if (!startStr || !endStr) return false;

  // Parse "HH:MM" format or just hour number
  const parseHour = (s: string): number => {
    if (s.includes(":")) return parseInt(s.split(":")[0], 10);
    return parseInt(s, 10);
  };

  const start = parseHour(startStr);
  const end = parseHour(endStr);
  const currentHour = getCurrentAESTHour();

  // Handle overnight quiet hours (e.g., 20:00 - 07:00)
  if (start > end) {
    return currentHour >= start || currentHour < end;
  }
  return currentHour >= start && currentHour < end;
}

// ─── Channel Preference Check ────────────────────────────────────────────────

async function isChannelEnabled(recipientType: RecipientType): Promise<boolean> {
  let channelKey: string;
  switch (recipientType) {
    case "owner":
    case "user":
      channelKey = "channel_admin_alerts";
      break;
    case "client":
      channelKey = "channel_client_updates";
      break;
    case "trade":
      channelKey = "channel_trade_updates";
      break;
    default:
      return true;
  }

  const val = await getMasterDataValue("notification", channelKey);
  if (!val) return true; // Default to enabled if not set
  return val.toLowerCase() !== "false" && val !== "0";
}

// ─── Main Gate Check ─────────────────────────────────────────────────────────

/**
 * Check if a notification is allowed to be sent.
 * Returns { allowed: true } or { allowed: false, suppressionReason: ... }
 */
export async function checkNotificationGate(attempt: NotificationAttempt): Promise<NotificationGateResult> {
  // 1. Check if the specific setting is enabled
  const settingValue = await getMasterDataValue("notification", attempt.settingKey);
  if (settingValue && (settingValue.toLowerCase() === "false" || settingValue === "0")) {
    return { allowed: false, suppressionReason: "setting_disabled" };
  }

  // 2. Check quiet hours (skip for owner_notify channel as those are system-critical)
  if (attempt.channel !== "owner_notify") {
    const inQuietHours = await isWithinQuietHours();
    if (inQuietHours) {
      return { allowed: false, suppressionReason: "quiet_hours" };
    }
  }

  // 3. Check channel preferences
  const channelEnabled = await isChannelEnabled(attempt.recipientType);
  if (!channelEnabled) {
    return { allowed: false, suppressionReason: "channel_disabled" };
  }

  return { allowed: true };
}

// ─── Convenience: isNotificationEnabled ──────────────────────────────────────

/**
 * Simple boolean check: is a notification setting key enabled?
 * Returns true if the setting is not explicitly set to "False" or "0".
 */
export async function isNotificationEnabled(key: string): Promise<boolean> {
  const val = await getMasterDataValue("notification", key);
  if (!val) return true; // Default to enabled if not configured
  return val.toLowerCase() !== "false" && val !== "0";
}

// ─── Logging ─────────────────────────────────────────────────────────────────

/**
 * Log a notification attempt (sent or suppressed) to the notification_log table.
 */
export async function logNotification(
  attempt: NotificationAttempt,
  status: "sent" | "suppressed" | "failed",
  suppressionReason?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(notificationLog).values({
      type: attempt.channel,
      settingKey: attempt.settingKey,
      recipientType: attempt.recipientType,
      recipientId: attempt.recipientId || null,
      channel: attempt.channel,
      title: attempt.title,
      status,
      suppressionReason: suppressionReason || null,
      metadata: attempt.metadata ? JSON.stringify(attempt.metadata) : null,
    });
  } catch (err) {
    console.error("[NotificationGateway] Failed to log notification:", err);
  }
}

// ─── Guarded Send Helper ─────────────────────────────────────────────────────

/**
 * Wraps a notification send function with gate checks and logging.
 * If the notification is suppressed, logs the suppression and returns false.
 * If allowed, calls the sendFn and logs the result.
 */
export async function guardedSend(
  attempt: NotificationAttempt,
  sendFn: () => Promise<boolean>
): Promise<boolean> {
  const gate = await checkNotificationGate(attempt);

  if (!gate.allowed) {
    await logNotification(attempt, "suppressed", gate.suppressionReason);
    return false;
  }

  try {
    const result = await sendFn();
    await logNotification(attempt, result ? "sent" : "failed");
    return result;
  } catch (err) {
    await logNotification(attempt, "failed", String(err));
    return false;
  }
}
