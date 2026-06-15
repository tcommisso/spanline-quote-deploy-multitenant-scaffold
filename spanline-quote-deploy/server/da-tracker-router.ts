/**
 * DA Tracker tRPC Router
 * Provides endpoints for listing, filtering, and managing DA tracking subscriptions
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { daTrackerApplications, daTrackerWebhookSubscriptions, daTrackerWebhookDeliveries, daTrackerPollLog, approvalLodgements } from "../drizzle/schema";
import { eq, and, isNull, isNotNull, desc, like, sql, inArray, gte, lte } from "drizzle-orm";

export const daTrackerRouter = router({
  // List DAs with filters
  list: protectedProcedure
    .input(z.object({
      district: z.string().optional(),
      division: z.string().optional(),
      subclass: z.string().optional(),
      applicationType: z.string().optional(),
      search: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      includeRemoved: z.boolean().optional().default(false),
      limit: z.number().min(1).max(500).optional().default(100),
      offset: z.number().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions: any[] = [];

      if (!input.includeRemoved) {
        conditions.push(isNull(daTrackerApplications.removedAt));
      }
      if (input.district) {
        conditions.push(eq(daTrackerApplications.district, input.district));
      }
      if (input.division) {
        conditions.push(eq(daTrackerApplications.division, input.division));
      }
      if (input.subclass) {
        conditions.push(eq(daTrackerApplications.subclass, input.subclass));
      }
      if (input.applicationType) {
        conditions.push(eq(daTrackerApplications.applicationType, input.applicationType));
      }
      if (input.search) {
        conditions.push(like(daTrackerApplications.division, `%${input.search}%`));
      }
      if (input.dateFrom) {
        conditions.push(gte(daTrackerApplications.lodgementDate, new Date(input.dateFrom)));
      }
      if (input.dateTo) {
        conditions.push(lte(daTrackerApplications.lodgementDate, new Date(input.dateTo)));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select({
          id: daTrackerApplications.id,
          daNumber: daTrackerApplications.daNumber,
          objectId: daTrackerApplications.objectId,
          district: daTrackerApplications.district,
          division: daTrackerApplications.division,
          section: daTrackerApplications.section,
          block: daTrackerApplications.block,
          lodgementDate: daTrackerApplications.lodgementDate,
          applicationType: daTrackerApplications.applicationType,
          subclass: daTrackerApplications.subclass,
          centroidLat: daTrackerApplications.centroidLat,
          centroidLng: daTrackerApplications.centroidLng,
          firstSeenAt: daTrackerApplications.firstSeenAt,
          lastSeenAt: daTrackerApplications.lastSeenAt,
          removedAt: daTrackerApplications.removedAt,
        })
          .from(daTrackerApplications)
          .where(where)
          .orderBy(desc(daTrackerApplications.lodgementDate))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` })
          .from(daTrackerApplications)
          .where(where),
      ]);

      return { items, total: countResult[0]?.count || 0 };
    }),

  // Get single DA detail with polygon
  detail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [da] = await db.select()
        .from(daTrackerApplications)
        .where(eq(daTrackerApplications.id, input.id))
        .limit(1);
      return da || null;
    }),

  // Get map data (all active DAs with centroid only)
  mapData: protectedProcedure
    .input(z.object({
      district: z.string().optional(),
      subclass: z.string().optional(),
      myProjectsOnly: z.boolean().optional().default(true),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [isNull(daTrackerApplications.removedAt)];
      if (input.district) conditions.push(eq(daTrackerApplications.district, input.district));
      if (input.subclass) conditions.push(eq(daTrackerApplications.subclass, input.subclass));

      // Filter to only DAs linked to approval projects via lodgement external reference numbers
      if (input.myProjectsOnly) {
        const lodgements = await db.select({ ref: approvalLodgements.externalReferenceNumber })
          .from(approvalLodgements)
          .where(isNotNull(approvalLodgements.externalReferenceNumber));
        const daNumbers = lodgements
          .map(l => l.ref?.replace(/\D/g, ""))
          .filter((n): n is string => !!n && n.length > 0)
          .map(n => Number(n))
          .filter(n => !isNaN(n));
        if (daNumbers.length === 0) return [];
        conditions.push(inArray(daTrackerApplications.daNumber, daNumbers));
      }

      return db.select({
        id: daTrackerApplications.id,
        daNumber: daTrackerApplications.daNumber,
        district: daTrackerApplications.district,
        division: daTrackerApplications.division,
        subclass: daTrackerApplications.subclass,
        centroidLat: daTrackerApplications.centroidLat,
        centroidLng: daTrackerApplications.centroidLng,
      })
        .from(daTrackerApplications)
        .where(and(...conditions));
    }),

  // Get filter options (distinct values)
  filterOptions: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { districts: [], divisions: [], subclasses: [], applicationTypes: [] };

    const [districts, divisions, subclasses, appTypes] = await Promise.all([
      db.selectDistinct({ value: daTrackerApplications.district })
        .from(daTrackerApplications)
        .where(isNull(daTrackerApplications.removedAt)),
      db.selectDistinct({ value: daTrackerApplications.division })
        .from(daTrackerApplications)
        .where(isNull(daTrackerApplications.removedAt)),
      db.selectDistinct({ value: daTrackerApplications.subclass })
        .from(daTrackerApplications)
        .where(isNull(daTrackerApplications.removedAt)),
      db.selectDistinct({ value: daTrackerApplications.applicationType })
        .from(daTrackerApplications)
        .where(isNull(daTrackerApplications.removedAt)),
    ]);

    return {
      districts: districts.map((d: any) => d.value).filter(Boolean).sort() as string[],
      divisions: divisions.map((d: any) => d.value).filter(Boolean).sort() as string[],
      subclasses: subclasses.map((d: any) => d.value).filter(Boolean).sort() as string[],
      applicationTypes: appTypes.map((d: any) => d.value).filter(Boolean).sort() as string[],
    };
  }),

  // Stats
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { activeApplications: 0, newThisWeek: 0, lastPoll: null };

    const [activeCount] = await db.select({ count: sql<number>`count(*)` })
      .from(daTrackerApplications)
      .where(isNull(daTrackerApplications.removedAt));

    const [lastPoll] = await db.select()
      .from(daTrackerPollLog)
      .orderBy(desc(daTrackerPollLog.startedAt))
      .limit(1);

    const [newThisWeek] = await db.select({ count: sql<number>`count(*)` })
      .from(daTrackerApplications)
      .where(gte(daTrackerApplications.firstSeenAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

    return {
      activeApplications: activeCount?.count || 0,
      newThisWeek: newThisWeek?.count || 0,
      lastPoll: lastPoll || null,
    };
  }),

  // ─── Webhook Subscriptions ─────────────────────────────────────────────────

  subscriptions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select()
        .from(daTrackerWebhookSubscriptions)
        .where(eq(daTrackerWebhookSubscriptions.userId, ctx.user.id))
        .orderBy(desc(daTrackerWebhookSubscriptions.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(200),
        filterDistrict: z.string().optional(),
        filterDivision: z.string().optional(),
        filterSubclass: z.string().optional(),
        filterApplicationType: z.string().optional(),
        notifyMethod: z.enum(["in_app", "webhook", "email"]),
        webhookUrl: z.string().url().optional(),
        emailAddress: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const [result] = await db.insert(daTrackerWebhookSubscriptions).values({
          userId: ctx.user.id,
          name: input.name,
          filterDistrict: input.filterDistrict || null,
          filterDivision: input.filterDivision || null,
          filterSubclass: input.filterSubclass || null,
          filterApplicationType: input.filterApplicationType || null,
          notifyMethod: input.notifyMethod,
          webhookUrl: input.webhookUrl || null,
          emailAddress: input.emailAddress || null,
        });
        return { id: (result as any).insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        filterDistrict: z.string().nullable().optional(),
        filterDivision: z.string().nullable().optional(),
        filterSubclass: z.string().nullable().optional(),
        filterApplicationType: z.string().nullable().optional(),
        notifyMethod: z.enum(["in_app", "webhook", "email"]).optional(),
        webhookUrl: z.string().url().nullable().optional(),
        emailAddress: z.string().email().nullable().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...updates } = input;
        await db.update(daTrackerWebhookSubscriptions)
          .set({ ...updates, updatedAt: new Date() } as any)
          .where(and(
            eq(daTrackerWebhookSubscriptions.id, id),
            eq(daTrackerWebhookSubscriptions.userId, ctx.user.id),
          ));
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(daTrackerWebhookSubscriptions)
          .where(and(
            eq(daTrackerWebhookSubscriptions.id, input.id),
            eq(daTrackerWebhookSubscriptions.userId, ctx.user.id),
          ));
        return { ok: true };
      }),
  }),

  // ─── Notifications (in-app deliveries for current user) ────────────────────

  notifications: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get user's subscription IDs
      const subs = await db.select({ id: daTrackerWebhookSubscriptions.id })
        .from(daTrackerWebhookSubscriptions)
        .where(eq(daTrackerWebhookSubscriptions.userId, ctx.user.id));

      if (subs.length === 0) return [];

      const subIds = subs.map((s: any) => s.id);
      return db.select()
        .from(daTrackerWebhookDeliveries)
        .where(and(
          inArray(daTrackerWebhookDeliveries.subscriptionId, subIds),
          eq(daTrackerWebhookDeliveries.status, "delivered"),
        ))
        .orderBy(desc(daTrackerWebhookDeliveries.createdAt))
        .limit(input.limit);
    }),

  // ─── Poll Logs (admin) ─────────────────────────────────────────────────────

  pollLogs: protectedProcedure
    .input(z.object({ limit: z.number().optional().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select()
        .from(daTrackerPollLog)
        .orderBy(desc(daTrackerPollLog.startedAt))
        .limit(input.limit);
    }),
});
