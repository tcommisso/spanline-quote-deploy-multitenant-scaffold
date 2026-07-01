import { trpcVanilla } from "./trpcVanilla";

type ClientActivityAction =
  | "login"
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "send_email"
  | "send_sms"
  | "send_push"
  | "upload_file"
  | "status_change"
  | "approve"
  | "submit"
  | "export"
  | "permission_change"
  | "mutation";

type LogUserActivityInput = {
  action?: ClientActivityAction;
  eventName: string;
  entityType?: string;
  entityId?: string | number;
  status?: "success" | "failure";
  metadata?: Record<string, unknown>;
};

type LogClientDownloadInput = {
  filename: string;
  source: string;
  entityType?: string;
  entityId?: string | number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

function portalActorTypeForCurrentPath(): "client" | "trade" | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (path.startsWith("/trade-portal")) return "trade";
  if (path.startsWith("/portal")) return "client";
  return null;
}

export function logUserActivity(input: LogUserActivityInput) {
  const actorType = portalActorTypeForCurrentPath();
  const payload = {
    action: input.action ?? "export",
    eventName: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId,
    status: input.status ?? "success",
    metadata: {
      clientPath: typeof window !== "undefined" ? window.location.pathname : undefined,
      ...input.metadata,
    },
  };

  const mutation = actorType
    ? trpcVanilla.userActivity.recordPortalEvent.mutate({ ...payload, actorType })
    : trpcVanilla.userActivity.recordClientEvent.mutate(payload);

  void mutation.catch((error) => {
    console.warn("[UserActivity] Failed to record client activity", error);
  });
}

export function logClientDownload(input: LogClientDownloadInput) {
  logUserActivity({
    action: "export",
    eventName: "client.download",
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      filename: input.filename,
      source: input.source,
      mimeType: input.mimeType,
      ...input.metadata,
    },
  });
}
