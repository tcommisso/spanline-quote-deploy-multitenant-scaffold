/**
 * Notification Log Router
 * Provides admin access to the notification audit log with filtering, stats, and clearing.
 */
import { z } from "zod";
import { tenantAdminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { notificationLog } from "../drizzle/schema";
import { desc, eq, and, gte, lte, sql, count } from "drizzle-orm";

export const notificationLogRouter = router({
  /** List notification log entries with pagination and filters */
  list: tenantAdminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(10).max(100).default(50),
        status: z.enum(["sent", "suppressed", "failed", "all"]).default("all"),
        channel: z.string().optional(),
        recipientType: z.string().optional(),
        dateFrom: z.string().optional(), // ISO date string
        dateTo: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { entries: [], total: 0 };

      const conditions: any[] = [eq(notificationLog.tenantId, ctx.tenant!.id)];

      if (input.status !== "all") {
        conditions.push(eq(notificationLog.status, input.status));
      }
      if (input.channel) {
        conditions.push(eq(notificationLog.channel, input.channel));
      }
      if (input.recipientType) {
        conditions.push(eq(notificationLog.recipientType, input.recipientType));
      }
      if (input.dateFrom) {
        conditions.push(gte(notificationLog.createdAt, new Date(input.dateFrom)));
      }
      if (input.dateTo) {
        conditions.push(lte(notificationLog.createdAt, new Date(input.dateTo)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [entries, totalResult] = await Promise.all([
        db
          .select()
          .from(notificationLog)
          .where(whereClause)
          .orderBy(desc(notificationLog.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db
          .select({ count: count() })
          .from(notificationLog)
          .where(whereClause),
      ]);

      return {
        entries,
        total: totalResult[0]?.count || 0,
      };
    }),

  /** Get summary statistics for the notification log */
  stats: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, sent: 0, suppressed: 0, failed: 0, byChannel: [], byRecipientType: [] };

    const [totals] = await db
      .select({
        total: count(),
        sent: sql<number>`SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END)`,
        suppressed: sql<number>`SUM(CASE WHEN status = 'suppressed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(notificationLog)
      .where(eq(notificationLog.tenantId, ctx.tenant!.id));

    const byChannel = await db
      .select({
        channel: notificationLog.channel,
        count: count(),
      })
      .from(notificationLog)
      .where(eq(notificationLog.tenantId, ctx.tenant!.id))
      .groupBy(notificationLog.channel);

    const byRecipientType = await db
      .select({
        recipientType: notificationLog.recipientType,
        count: count(),
      })
      .from(notificationLog)
      .where(eq(notificationLog.tenantId, ctx.tenant!.id))
      .groupBy(notificationLog.recipientType);

    return {
      total: totals?.total || 0,
      sent: Number(totals?.sent) || 0,
      suppressed: Number(totals?.suppressed) || 0,
      failed: Number(totals?.failed) || 0,
      byChannel,
      byRecipientType,
    };
  }),

  /** Clear old log entries (older than specified days) */
  clearOld: tenantAdminProcedure
    .input(z.object({ olderThanDays: z.number().min(7).default(90) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { deleted: 0 };

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.olderThanDays);

      const result = await db
        .delete(notificationLog)
        .where(and(eq(notificationLog.tenantId, ctx.tenant!.id), lte(notificationLog.createdAt, cutoff)));

      return { deleted: (result as any)[0]?.affectedRows || 0 };
    }),
});
