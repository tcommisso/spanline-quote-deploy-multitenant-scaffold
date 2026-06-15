import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

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

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

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
 * Dispatches a project-owner notification through the Manus Notification Service.
 * Returns `true` if the request was accepted, `false` when the upstream service
 * cannot be reached (callers can fall back to email/slack). Validation errors
 * bubble up as TRPC errors so callers can fix the payload.
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

  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured.",
    });
  }

  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured.",
    });
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      // Log failure if gateway is available
      if (payload.settingKey) {
        try {
          const { logNotification } = await import("../notification-gateway");
          await logNotification(
            { settingKey: payload.settingKey, channel: "owner_notify", recipientType: "owner", title },
            "failed",
            `HTTP ${response.status}`
          );
        } catch (e) { /* non-blocking */ }
      }
      return false;
    }

    // Log success if gateway is available
    if (payload.settingKey) {
      try {
        const { logNotification } = await import("../notification-gateway");
        await logNotification(
          { settingKey: payload.settingKey, channel: "owner_notify", recipientType: "owner", title },
          "sent"
        );
      } catch (e) { /* non-blocking */ }
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}
