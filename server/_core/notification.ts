import { TRPCError } from "@trpc/server";

export type NotificationPayload = {
  title: string;
  content: string;
  /** Optional setting key for the notification gateway. If provided, the notification
   *  will be checked against master_data "notification" category before sending. */
  settingKey?: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches a project-owner notification through the app notification gateway.
 * Push-style owner notifications previously depended on Forge; production now
 * logs the event and returns `false` so callers can continue with email flows.
 *
 * If a settingKey is provided, the notification will first be checked against
 * the notification gateway (master_data settings, quiet hours, channel prefs).
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  // Lazy import to avoid circular dependency
  if (payload.settingKey) {
    try {
      const { checkNotificationGate, logNotification } = await import("../notification-gateway");
      const gate = await checkNotificationGate({
        settingKey: payload.settingKey,
        channel: "owner_notify",
        recipientType: "owner",
        title,
      });
      if (!gate.allowed) {
        await logNotification(
          { settingKey: payload.settingKey, channel: "owner_notify", recipientType: "owner", title },
          "suppressed",
          gate.suppressionReason
        );
        return false;
      }
    } catch (e) {
      // If gateway fails, proceed with sending (fail-open for critical notifications)
      console.warn("[Notification] Gateway check failed, proceeding:", e);
    }
  }

  try {
    console.log(`[Notification] ${title}\n${content}`);
    if (payload.settingKey) {
      try {
        const { logNotification } = await import("../notification-gateway");
        await logNotification(
          { settingKey: payload.settingKey, channel: "owner_notify", recipientType: "owner", title },
          "failed",
          "Forge notification service removed; event logged by app"
        );
      } catch (e) { /* non-blocking */ }
    }
    return false;
  } catch (error) {
    console.warn("[Notification] Error logging notification:", error);
    return false;
  }
}
