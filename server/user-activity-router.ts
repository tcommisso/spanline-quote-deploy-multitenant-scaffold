import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { userActivityLog } from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure, router, tenantAdminProcedure, tenantProcedure } from "./_core/trpc";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { logUserActivity, type UserActivityAction } from "./user-activity-log";

const activityActions = [
  "login",
  "create",
  "update",
  "delete",
  "archive",
  "send_email",
  "send_sms",
  "send_push",
  "upload_file",
  "status_change",
  "approve",
  "submit",
  "export",
  "permission_change",
  "mutation",
] as const;

const activityActionSchema = z.enum(activityActions);
const portalActorTypeSchema = z.enum(["client", "trade"]);

const clientEventInputSchema = z.object({
  action: activityActionSchema.default("export"),
  eventName: z.string().trim().min(1).max(180),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.union([z.string(), z.number()]).optional(),
  status: z.enum(["success", "failure"]).default("success"),
  metadata: z.record(z.string(), z.any()).optional(),
});

function endOfDay(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfDay(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export const userActivityRouter = router({
  list: tenantAdminProcedure
    .input(z.object({
      limit: z.number().min(10).max(200).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().trim().max(120).optional(),
      action: activityActionSchema.optional(),
      actorType: z.enum(["user", "client", "trade", "system"]).optional(),
      status: z.enum(["success", "failure"]).optional(),
      entityType: z.string().trim().max(80).optional(),
      userId: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { entries: [], total: 0, actions: activityActions };

      const conditions: any[] = [];
      appendTenantScope(conditions, userActivityLog.tenantId, tenantIdFromContext(ctx));

      if (input?.action) conditions.push(eq(userActivityLog.action, input.action));
      if (input?.actorType) conditions.push(eq(userActivityLog.actorType, input.actorType));
      if (input?.status) conditions.push(eq(userActivityLog.status, input.status));
      if (input?.entityType) conditions.push(eq(userActivityLog.entityType, input.entityType));
      if (input?.userId) conditions.push(eq(userActivityLog.userId, input.userId));

      const fromDate = input?.dateFrom ? startOfDay(input.dateFrom) : null;
      if (fromDate) conditions.push(gte(userActivityLog.createdAt, fromDate));

      const toDate = input?.dateTo ? endOfDay(input.dateTo) : null;
      if (toDate) conditions.push(lte(userActivityLog.createdAt, toDate));

      const search = input?.search?.trim();
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(or(
          like(userActivityLog.eventName, pattern),
          like(userActivityLog.userName, pattern),
          like(userActivityLog.userEmail, pattern),
          like(userActivityLog.entityType, pattern),
          like(userActivityLog.entityId, pattern),
          like(userActivityLog.requestPath, pattern),
        ));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const [entries, totals] = await Promise.all([
        db.select()
          .from(userActivityLog)
          .where(whereClause)
          .orderBy(desc(userActivityLog.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() })
          .from(userActivityLog)
          .where(whereClause),
      ]);

      return {
        entries,
        total: Number(totals[0]?.total ?? 0),
        actions: activityActions,
      };
    }),

  recordClientEvent: tenantProcedure
    .input(clientEventInputSchema)
    .mutation(async ({ ctx, input }) => {
      await logUserActivity({
        tenantId: tenantIdFromContext(ctx),
        user: ctx.user,
        impersonator: ctx.isImpersonating ? ctx.realUser : null,
        action: input.action as UserActivityAction,
        eventName: input.eventName,
        entityType: input.entityType,
        entityId: input.entityId,
        status: input.status,
        req: ctx.req,
        metadata: {
          ...(input.metadata ?? {}),
          clientRecorded: true,
        },
      });

      return { success: true };
    }),

  recordPortalEvent: publicProcedure
    .input(clientEventInputSchema.extend({
      actorType: portalActorTypeSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const actorType = input.actorType ?? (ctx.portalAccess ? "client" : ctx.tradePortalAccess ? "trade" : "client");

      if (actorType === "client") {
        const access = ctx.portalAccess;
        if (!access) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Client portal session required" });
        }

        await logUserActivity({
          tenantId: access.tenantId ?? tenantIdFromContext(ctx),
          actorType: "client",
          action: input.action as UserActivityAction,
          eventName: input.eventName,
          entityType: input.entityType,
          entityId: input.entityId,
          status: input.status,
          req: ctx.req,
          metadata: {
            ...(input.metadata ?? {}),
            clientRecorded: true,
            portalAccessId: access.id,
            constructionJobId: access.constructionJobId,
            clientName: access.clientName,
            clientEmail: access.clientEmail,
          },
        });

        return { success: true };
      }

      const access = ctx.tradePortalAccess;
      if (!access) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Trade portal session required" });
      }

      await logUserActivity({
        tenantId: access.tenantId ?? tenantIdFromContext(ctx),
        actorType: "trade",
        action: input.action as UserActivityAction,
        eventName: input.eventName,
        entityType: input.entityType,
        entityId: input.entityId,
        status: input.status,
        req: ctx.req,
        metadata: {
          ...(input.metadata ?? {}),
          clientRecorded: true,
          tradePortalAccessId: access.id,
          installerId: access.installerId,
          tradeEmail: access.email,
        },
      });

      return { success: true };
    }),
});
