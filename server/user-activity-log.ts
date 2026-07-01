import type { Request } from "express";
import { eq } from "drizzle-orm";
import {
  userActivityLog,
  users,
  type InsertUserActivityLogEntry,
  type User,
} from "../drizzle/schema";
import { tenantIdFromContext } from "./_core/tenant-scope";
import type { TrpcContext } from "./_core/context";
import { getDb, getDefaultTenantId } from "./db";
import { resolveTenantForRequest } from "./tenant-db";

type ActivityActorType = "user" | "client" | "trade" | "system";
type ActivityStatus = "success" | "failure";

export type UserActivityAction =
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

export type LogUserActivityInput = {
  tenantId?: number | null;
  user?: User | null;
  impersonator?: User | null;
  actorType?: ActivityActorType;
  action: UserActivityAction;
  eventName: string;
  entityType?: string | null;
  entityId?: string | number | null;
  status?: ActivityStatus;
  req?: Request;
  metadata?: Record<string, any>;
};

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function singleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function requestIp(req?: Request) {
  if (!req) return null;
  const forwarded = singleHeader(req.headers["x-forwarded-for"]);
  return truncate((forwarded || req.socket.remoteAddress || "").split(",")[0].trim(), 64);
}

function requestUserAgent(req?: Request) {
  return truncate(singleHeader(req?.headers["user-agent"]) || null, 512);
}

function requestPath(req?: Request) {
  return truncate(req?.originalUrl || req?.url || null, 255);
}

function safeEventName(eventName: string) {
  return truncate(eventName.trim() || "activity", 180) || "activity";
}

function normalizeEntityId(entityId: string | number | null | undefined) {
  if (entityId === null || entityId === undefined || entityId === "") return null;
  return truncate(String(entityId), 120);
}

function objectInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function inputKeys(input: unknown) {
  const obj = objectInput(input);
  if (!obj) return [];
  return Object.keys(obj).slice(0, 25);
}

export function inferActivityAction(path: string): UserActivityAction {
  const lower = path.toLowerCase();
  if (lower.includes("login")) return "login";
  if (lower.includes("permission") || lower.includes("role")) return "permission_change";
  if (lower.includes("approve") || lower.includes("approval")) return "approve";
  if (lower.includes("submit")) return "submit";
  if (lower.includes("export") || lower.includes("download")) return "export";
  if (lower.includes("upload") || lower.includes("attachment") || lower.includes("file")) return "upload_file";
  if (lower.includes("sms")) return "send_sms";
  if (lower.includes("email")) return "send_email";
  if (lower.includes("push")) return "send_push";
  if (lower.includes("send") || lower.includes("notify")) return "send_email";
  if (lower.includes("archive")) return "archive";
  if (lower.includes("delete") || lower.includes("remove")) return "delete";
  if (lower.includes("create") || lower.includes("add") || lower.includes("import")) return "create";
  if (lower.includes("status") || lower.includes("complete") || lower.includes("confirm")) return "status_change";
  if (lower.includes("update") || lower.includes("edit") || lower.includes("save") || lower.includes("set")) return "update";
  return "mutation";
}

export function inferEntityType(path: string) {
  const [firstSegment] = path.split(".");
  return truncate(firstSegment || null, 80);
}

export function inferEntityId(input: unknown): string | null {
  const obj = objectInput(input);
  if (!obj) return null;

  const idKeys = [
    "id",
    "jobId",
    "leadId",
    "quoteId",
    "clientId",
    "userId",
    "invoiceId",
    "orderId",
    "contractId",
    "scheduleId",
    "eventId",
  ];

  for (const key of idKeys) {
    const value = obj[key];
    if (typeof value === "string" || typeof value === "number") return normalizeEntityId(value);
  }

  return null;
}

export function shouldLogProcedureActivity(path: string, type: string) {
  if (type !== "mutation") return false;
  const lower = path.toLowerCase();
  if (lower.startsWith("useractivity")) return false;
  if (lower.includes("notification") && lower.includes("read")) return false;
  if (lower.includes("presence") || lower.includes("heartbeat")) return false;
  return true;
}

export async function logUserActivity(input: LogUserActivityInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const values: InsertUserActivityLogEntry = {
      tenantId: input.tenantId ?? null,
      userId: input.user?.id ?? null,
      userName: truncate(input.user?.name ?? null, 255),
      userEmail: truncate(input.user?.email ?? null, 320),
      impersonatorUserId: input.impersonator?.id ?? null,
      impersonatorName: truncate(input.impersonator?.name ?? null, 255),
      actorType: input.actorType ?? "user",
      action: input.action,
      eventName: safeEventName(input.eventName),
      entityType: truncate(input.entityType ?? null, 80),
      entityId: normalizeEntityId(input.entityId),
      status: input.status ?? "success",
      requestPath: requestPath(input.req),
      ipAddress: requestIp(input.req),
      userAgent: requestUserAgent(input.req),
      metadata: input.metadata ?? null,
    };

    await db.insert(userActivityLog).values(values);
  } catch (error) {
    console.warn("[UserActivityLog] Failed to write activity log", error);
  }
}

export async function logUserLoginFromOpenId(
  openId: string,
  req: Request,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    if (!user) return;

    let tenantId: number | null = null;
    try {
      const { tenant } = await resolveTenantForRequest(req, user);
      tenantId = tenant?.id ?? null;
    } catch {
      tenantId = null;
    }
    if (!tenantId) tenantId = await getDefaultTenantId();

    await logUserActivity({
      tenantId,
      user,
      action: "login",
      eventName: "auth.login",
      req,
      metadata,
    });
  } catch (error) {
    console.warn("[UserActivityLog] Failed to write login activity", error);
  }
}

export async function logTrpcActivity(
  ctx: TrpcContext,
  path: string,
  type: string,
  rawInput?: unknown,
): Promise<void> {
  if (!ctx.user || !shouldLogProcedureActivity(path, type)) return;

  await logUserActivity({
    tenantId: tenantIdFromContext(ctx),
    user: ctx.user,
    impersonator: ctx.isImpersonating ? ctx.realUser : null,
    action: inferActivityAction(path),
    eventName: path,
    entityType: inferEntityType(path),
    entityId: inferEntityId(rawInput),
    req: ctx.req,
    metadata: {
      procedurePath: path,
      inputKeys: inputKeys(rawInput),
      impersonated: ctx.isImpersonating,
    },
  });
}
