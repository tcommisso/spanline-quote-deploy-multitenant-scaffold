/**
 * Vocphone tRPC Router
 * Handles SMS sending, template management, call logs, and communication timeline
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { smsMessages, callLogs, smsTemplates, crmLeads, crmActivities, globalSettings, vocphoneExtensions } from "../drizzle/schema";
import { eq, desc, or, and, sql, like, gte, lte, count, sum, avg, inArray } from "drizzle-orm";
import * as vocphone from "./vocphone";

/** Normalize phone number for lead matching */
function normalizePhone(phone: string): string {
  let n = phone.replace(/[^0-9]/g, "");
  if (n.startsWith("61") && n.length === 11) {
    n = "0" + n.slice(2);
  }
  return n;
}

/** Find a lead by phone number */
async function findLeadByPhone(phone: string): Promise<number | null> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) return null;
  const variants = [normalized];
  if (normalized.startsWith("0")) {
    variants.push("61" + normalized.slice(1));
    variants.push("+61" + normalized.slice(1));
  }
  const db = (await getDb())!;
  const results = await db
    .select({ id: crmLeads.id })
    .from(crmLeads)
    .where(
      or(
        ...variants.flatMap((v) => [
          eq(crmLeads.contactPhone, v),
          like(crmLeads.contactPhone, `%${v.slice(-8)}`),
        ])
      )
    )
    .limit(1);
  return results.length > 0 ? results[0].id : null;
}

export const vocphoneRouter = router({
  // ─── SMS Numbers ──────────────────────────────────────────────────────────
  getSmsNumbers: protectedProcedure.query(async () => {
    try {
      return await vocphone.getSmsNumbers();
    } catch (e: any) {
      return { total: 0, list: [] };
    }
  }),

  // ─── Send SMS ─────────────────────────────────────────────────────────────
  sendSms: protectedProcedure
    .input(z.object({
      leadId: z.number().optional(),
      recipient: z.string(),
      sender: z.string(),
      body: z.string(),
      templateId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await vocphone.sendSms({
        recipient: input.recipient,
        sender: input.sender,
        body: input.body,
      });

      // Extract message ID from Vocphone response for delivery tracking
      const vocphoneMessageId = (result as any)?.id ? String((result as any).id) : null;

      // Store in database - Vocphone queues immediately and doesn't support delivery receipts
      const db = (await getDb())!;
      await db.insert(smsMessages).values({
        leadId: input.leadId || null,
        direction: "outbound",
        fromNumber: input.sender,
        toNumber: input.recipient,
        body: input.body,
        templateId: input.templateId || null,
        status: "sent",
        vocphoneMessageId,
        sentBy: ctx.user.id,
      });

      return result;
    }),

  // ─── SMS Conversation for a Lead ──────────────────────────────────────────
  getLeadMessages: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const messages = await db
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.leadId, input.leadId))
        .orderBy(desc(smsMessages.createdAt));
      return messages;
    }),

  // ─── Call Logs for a Lead ─────────────────────────────────────────────────
  getLeadCalls: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const calls = await db
        .select()
        .from(callLogs)
        .where(eq(callLogs.leadId, input.leadId))
        .orderBy(desc(callLogs.createdAt));
      return calls;
    }),

  // ─── Combined Communication Timeline ─────────────────────────────────────
  getLeadTimeline: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [messages, calls] = await Promise.all([
        db.select().from(smsMessages).where(eq(smsMessages.leadId, input.leadId)),
        db.select().from(callLogs).where(eq(callLogs.leadId, input.leadId)),
      ]);

      // Merge into unified timeline
      const timeline = [
        ...messages.map((m) => ({
          type: "sms" as const,
          id: m.id,
          direction: m.direction,
          body: m.body,
          from: m.fromNumber,
          to: m.toNumber,
          status: m.status,
          createdAt: m.createdAt,
        })),
        ...calls.map((c) => ({
          type: "call" as const,
          id: c.id,
          direction: c.direction,
          body: c.callSummary || `${c.direction} call (${c.duration || 0}s)`,
          from: c.fromNumber,
          to: c.toNumber,
          status: c.recordingUrl ? "recorded" : "completed",
          duration: c.duration,
          recordingUrl: c.recordingUrl,
          createdAt: c.createdAt,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return timeline;
    }),

  // ─── SMS Templates CRUD ───────────────────────────────────────────────────
  templates: router({
    list: protectedProcedure.query(async () => {
      const db = (await getDb())!;
      return db.select().from(smsTemplates).orderBy(smsTemplates.category, smsTemplates.sortOrder);
    }),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        name: z.string().min(1),
        category: z.string().min(1),
        body: z.string().min(1),
        isActive: z.boolean().default(true),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        if (input.id) {
          await db.update(smsTemplates).set({
            name: input.name,
            category: input.category,
            body: input.body,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
          }).where(eq(smsTemplates.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(smsTemplates).values({
            name: input.name,
            category: input.category,
            body: input.body,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
          });
          return { id: result.insertId };
        }
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.delete(smsTemplates).where(eq(smsTemplates.id, input.id));
        return { success: true };
      }),
  }),

  // ─── Sync calls from Vocphone API ────────────────────────────────────────
  syncCalls: adminProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      let synced = 0;

      // Sync inbound calls (paginated, max 50 per page)
      let inboundPage = 1;
      let inboundTotalPages = 1;
      do {
        const inbound = await vocphone.getInboundCalls({
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          perPage: 50,
          page: inboundPage,
        });
        inboundTotalPages = inbound.total_pages || 1;
        for (const call of inbound.data || []) {
          const existing = await db.select().from(callLogs)
            .where(eq(callLogs.vocphoneCallId, String(call.id)))
            .limit(1);
          if (existing.length === 0) {
            const phoneToMatch = call.callerid || "";
            const leadId = phoneToMatch ? await findLeadByPhone(phoneToMatch) : null;
            const extNum = call.extension ? parseInt(call.extension) : null;
            let extUserName: string | null = null;
            if (extNum) {
              const [extRow] = await db.select().from(vocphoneExtensions).where(eq(vocphoneExtensions.extension, extNum)).limit(1);
              if (extRow) extUserName = `${extRow.firstName} ${extRow.lastName}`;
            }
            await db.insert(callLogs).values({
              ...(leadId !== null ? { leadId } : {}),
              direction: "inbound",
              fromNumber: call.callerid || "",
              toNumber: call.desination_number || call.destination_number || "",
              duration: call.billed_seconds || 0,
              recordingUrl: call.download_url || null,
              vocphoneCallId: String(call.id),
              callSummary: call.call_summary || null,
              extension: extNum,
              extensionUserName: extUserName,
            });
            synced++;
          }
        }
        inboundPage++;
      } while (inboundPage <= inboundTotalPages);

      // Sync outbound calls (paginated, max 50 per page)
      let outboundPage = 1;
      let outboundTotalPages = 1;
      do {
        const outbound = await vocphone.getOutboundCalls({
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          perPage: 50,
          page: outboundPage,
        });
        outboundTotalPages = outbound.total_pages || 1;
        for (const call of outbound.data || []) {
          const existing = await db.select().from(callLogs)
            .where(eq(callLogs.vocphoneCallId, String(call.id)))
            .limit(1);
          if (existing.length === 0) {
            const phoneToMatch = call.desination_number || call.destination_number || "";
            const leadId = phoneToMatch ? await findLeadByPhone(phoneToMatch) : null;
            const extNum = call.extension ? parseInt(call.extension) : null;
            let extUserName: string | null = null;
            if (extNum) {
              const [extRow] = await db.select().from(vocphoneExtensions).where(eq(vocphoneExtensions.extension, extNum)).limit(1);
              if (extRow) extUserName = `${extRow.firstName} ${extRow.lastName}`;
            }
            await db.insert(callLogs).values({
              ...(leadId !== null ? { leadId } : {}),
              direction: "outbound",
              fromNumber: call.callerid || "",
              toNumber: call.desination_number || call.destination_number || "",
              duration: call.billed_seconds || 0,
              recordingUrl: call.download_url || null,
              vocphoneCallId: String(call.id),
              callSummary: call.call_summary || null,
              extension: extNum,
              extensionUserName: extUserName,
            });
            synced++;
          }
        }
        outboundPage++;
      } while (outboundPage <= outboundTotalPages);

      // Store last successful sync timestamp in global_settings
      await db.insert(globalSettings)
        .values({ key: "vocphone_last_sync", value: JSON.stringify(new Date().toISOString()) })
        .onDuplicateKeyUpdate({ set: { value: JSON.stringify(new Date().toISOString()) } });

      return { synced };
    }),

  // ─── Resync unlinked calls ─────────────────────────────────────────────────
  resyncUnlinkedCalls: adminProcedure.mutation(async () => {
    const db = (await getDb())!;
    // Find all call_logs where leadId is NULL
    const unlinked = await db
      .select({ id: callLogs.id, direction: callLogs.direction, fromNumber: callLogs.fromNumber, toNumber: callLogs.toNumber })
      .from(callLogs)
      .where(sql`${callLogs.leadId} IS NULL`);

    let linked = 0;
    for (const call of unlinked) {
      const phoneToMatch = call.direction === "inbound" ? call.fromNumber : call.toNumber;
      if (!phoneToMatch) continue;
      const leadId = await findLeadByPhone(phoneToMatch);
      if (leadId) {
        await db.update(callLogs).set({ leadId }).where(eq(callLogs.id, call.id));
        linked++;
      }
    }
    return { total: unlinked.length, linked };
  }),

  // ─── Call Stats KPI ────────────────────────────────────────────────────────
  getCallStats: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Total calls today
    const [todayCount] = await db
      .select({ total: count() })
      .from(callLogs)
      .where(gte(callLogs.createdAt, todayStart));

    // Average duration (all time)
    const [avgResult] = await db
      .select({ avgDuration: avg(callLogs.duration) })
      .from(callLogs)
      .where(sql`${callLogs.duration} > 0`);

    // Busiest extension (most calls in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const extStats = await db
      .select({ extension: callLogs.extension, total: count() })
      .from(callLogs)
      .where(and(
        gte(callLogs.createdAt, thirtyDaysAgo),
        sql`${callLogs.extension} IS NOT NULL`
      ))
      .groupBy(callLogs.extension)
      .orderBy(desc(count()))
      .limit(1);

    // Total calls this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const [weekCount] = await db
      .select({ total: count() })
      .from(callLogs)
      .where(gte(callLogs.createdAt, weekStart));

    let busiestUserName: string | null = null;
    if (extStats[0]?.extension) {
      const [extRow] = await db.select().from(vocphoneExtensions).where(eq(vocphoneExtensions.extension, extStats[0].extension)).limit(1);
      if (extRow) busiestUserName = `${extRow.firstName} ${extRow.lastName}`;
    }
    return {
      callsToday: todayCount?.total ?? 0,
      callsThisWeek: weekCount?.total ?? 0,
      avgDuration: Math.round(Number(avgResult?.avgDuration ?? 0)),
      busiestExtension: extStats[0] ? { extension: extStats[0].extension, calls: extStats[0].total, userName: busiestUserName } : null,
    };
  }),

  // ─── Call Volume (daily trend, last 14 days) ─────────────────────────────
  getCallVolume: protectedProcedure
    .input(z.object({
      days: z.number().min(7).max(90).default(14),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const days = input?.days ?? 14;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const rows = await db
        .select({
          date: sql<string>`DATE(${callLogs.createdAt})`,
          total: count(),
          inbound: sql<number>`SUM(CASE WHEN ${callLogs.direction} = 'inbound' THEN 1 ELSE 0 END)`,
          outbound: sql<number>`SUM(CASE WHEN ${callLogs.direction} = 'outbound' THEN 1 ELSE 0 END)`,
        })
        .from(callLogs)
        .where(gte(callLogs.createdAt, startDate))
        .groupBy(sql`DATE(${callLogs.createdAt})`)
        .orderBy(sql`DATE(${callLogs.createdAt})`);

      return rows.map(r => ({
        date: String(r.date),
        total: r.total,
        inbound: Number(r.inbound ?? 0),
        outbound: Number(r.outbound ?? 0),
      }));
    }),

  // ─── Update call notes ───────────────────────────────────────────────────
  updateCallNotes: protectedProcedure
    .input(z.object({
      callId: z.number(),
      notes: z.string().max(2000),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const notesValue = input.notes || null;
      await db.update(callLogs)
        .set({ userNotes: notesValue })
        .where(eq(callLogs.id, input.callId));

      // Auto-copy notes to linked lead activity feed
      if (notesValue) {
        const [call] = await db
          .select({ leadId: callLogs.leadId, direction: callLogs.direction, fromNumber: callLogs.fromNumber, toNumber: callLogs.toNumber })
          .from(callLogs)
          .where(eq(callLogs.id, input.callId))
          .limit(1);
        if (call?.leadId) {
          const phone = call.direction === "inbound" ? call.fromNumber : call.toNumber;
          await db.insert(crmActivities).values({
            leadId: call.leadId,
            activityType: "call_note",
            description: `Call note (${phone}): ${notesValue}`,
          });
        }
      }
      return { success: true };
    }),

  // ─── Bulk mark as reviewed ────────────────────────────────────────────────
  bulkMarkReviewed: protectedProcedure
    .input(z.object({
      callIds: z.array(z.number()).min(1).max(500),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(callLogs)
        .set({ reviewed: true, reviewedAt: new Date() })
        .where(inArray(callLogs.id, input.callIds));
      return { success: true, count: input.callIds.length };
    }),

  // ─── Get missed call count (for badge) ────────────────────────────────────
  getMissedCallCount: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const [result] = await db
      .select({ count: count() })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.direction, "inbound"),
          eq(callLogs.duration, 0),
          eq(callLogs.reviewed, false),
          or(
            sql`${callLogs.snoozedUntil} IS NULL`,
            lte(callLogs.snoozedUntil, new Date())
          )
        )
      );
    return { count: result?.count ?? 0 };
  }),

  // ─── Link call to lead ────────────────────────────────────────────────────
  linkCallToLead: protectedProcedure
    .input(z.object({
      callId: z.number(),
      leadId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(callLogs)
        .set({ leadId: input.leadId })
        .where(eq(callLogs.id, input.callId));
      return { success: true };
    }),

  // ─── Get last sync timestamp ────────────────────────────────────────────────
  getLastSyncTimestamp: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const [row] = await db
      .select({ value: globalSettings.value })
      .from(globalSettings)
      .where(eq(globalSettings.key, "vocphone_last_sync"))
      .limit(1);
    const lastSyncedAt = row?.value ? new Date(JSON.parse(row.value as string)) : null;
    return { lastSyncedAt };
  }),

  // ─── Snooze a missed call ────────────────────────────────────────────────
  snoozeCall: protectedProcedure
    .input(z.object({
      callId: z.number(),
      durationMinutes: z.number().min(15).max(480).default(120),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const snoozedUntil = new Date(Date.now() + input.durationMinutes * 60 * 1000);
      await db.update(callLogs)
        .set({ snoozedUntil })
        .where(eq(callLogs.id, input.callId));
      return { success: true, snoozedUntil };
    }),

  // ─── Unsnooze a call ────────────────────────────────────────────────────
  unsnoozeCall: protectedProcedure
    .input(z.object({ callId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(callLogs)
        .set({ snoozedUntil: null })
        .where(eq(callLogs.id, input.callId));
      return { success: true };
    }),

  getAllCalls: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      direction: z.enum(["inbound", "outbound", "all"]).default("all"),
      extension: z.number().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      missedOnly: z.boolean().optional(),
      reviewedFilter: z.enum(["all", "reviewed", "unreviewed"]).default("all"),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { search, direction, extension, dateFrom, dateTo, missedOnly, reviewedFilter, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      // Build WHERE conditions
      const conditions: any[] = [];

      if (direction !== "all") {
        conditions.push(eq(callLogs.direction, direction));
      }

      if (extension !== undefined) {
        conditions.push(eq(callLogs.extension, extension));
      }

      if (dateFrom) {
        conditions.push(gte(callLogs.createdAt, new Date(dateFrom)));
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        conditions.push(lte(callLogs.createdAt, endDate));
      }

      if (missedOnly) {
        conditions.push(eq(callLogs.direction, "inbound"));
        conditions.push(eq(callLogs.duration, 0));
        // Exclude currently snoozed calls from missed view
        conditions.push(
          or(
            sql`${callLogs.snoozedUntil} IS NULL`,
            lte(callLogs.snoozedUntil, new Date())
          )
        );
      }

      if (reviewedFilter === "reviewed") {
        conditions.push(eq(callLogs.reviewed, true));
      } else if (reviewedFilter === "unreviewed") {
        conditions.push(eq(callLogs.reviewed, false));
      }

      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(
          or(
            like(callLogs.fromNumber, term),
            like(callLogs.toNumber, term),
            like(crmLeads.contactFirstName, term),
            like(crmLeads.contactLastName, term),
            like(crmLeads.contactPhone, term),
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Count total
      const [totalResult] = await db
        .select({ total: count() })
        .from(callLogs)
        .leftJoin(crmLeads, eq(callLogs.leadId, crmLeads.id))
        .where(whereClause);

      // Fetch page
      const rows = await db
        .select({
          id: callLogs.id,
          leadId: callLogs.leadId,
          direction: callLogs.direction,
          fromNumber: callLogs.fromNumber,
          toNumber: callLogs.toNumber,
          duration: callLogs.duration,
          recordingUrl: callLogs.recordingUrl,
          vocphoneCallId: callLogs.vocphoneCallId,
          callSummary: callLogs.callSummary,
          extension: callLogs.extension,
          extensionUserName: callLogs.extensionUserName,
          userNotes: callLogs.userNotes,
          reviewed: callLogs.reviewed,
          snoozedUntil: callLogs.snoozedUntil,
          createdAt: callLogs.createdAt,
          leadFirstName: crmLeads.contactFirstName,
          leadLastName: crmLeads.contactLastName,
        })
        .from(callLogs)
        .leftJoin(crmLeads, eq(callLogs.leadId, crmLeads.id))
        .where(whereClause)
        .orderBy(desc(callLogs.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        calls: rows,
        total: totalResult?.total ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((totalResult?.total ?? 0) / pageSize),
      };
    }),

  // ─── Export Calls CSV ────────────────────────────────────────────────────
  exportCallsCsv: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      direction: z.enum(["inbound", "outbound", "all"]).default("all"),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { search, direction, dateFrom, dateTo } = input;

      const conditions: any[] = [];
      if (direction !== "all") {
        conditions.push(eq(callLogs.direction, direction));
      }
      if (dateFrom) {
        conditions.push(gte(callLogs.createdAt, new Date(dateFrom)));
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        conditions.push(lte(callLogs.createdAt, endDate));
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(
          or(
            like(callLogs.fromNumber, term),
            like(callLogs.toNumber, term),
            like(crmLeads.contactFirstName, term),
            like(crmLeads.contactLastName, term),
            like(crmLeads.contactPhone, term),
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          id: callLogs.id,
          direction: callLogs.direction,
          fromNumber: callLogs.fromNumber,
          toNumber: callLogs.toNumber,
          duration: callLogs.duration,
          extension: callLogs.extension,
          extensionUserName: callLogs.extensionUserName,
          callSummary: callLogs.callSummary,
          createdAt: callLogs.createdAt,
          leadFirstName: crmLeads.contactFirstName,
          leadLastName: crmLeads.contactLastName,
        })
        .from(callLogs)
        .leftJoin(crmLeads, eq(callLogs.leadId, crmLeads.id))
        .where(whereClause)
        .orderBy(desc(callLogs.createdAt))
        .limit(5000);

      const headers = ["Date", "Time", "Direction", "From", "To", "Duration (s)", "User", "Extension", "Lead Name", "Summary"];
      const csvRows = [headers.join(",")];
      for (const r of rows) {
        const dt = new Date(r.createdAt);
        const leadName = [r.leadFirstName, r.leadLastName].filter(Boolean).join(" ");
        csvRows.push([
          dt.toLocaleDateString("en-AU"),
          dt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
          r.direction,
          r.fromNumber || "",
          r.toNumber || "",
          String(r.duration ?? 0),
          `"${(r.extensionUserName || "").replace(/"/g, '""')}"`,
          r.extension || "",
          `"${(leadName).replace(/"/g, '""')}"`,
          `"${(r.callSummary || "").replace(/"/g, '""')}"`,
        ].join(","));
      }
      return { csv: csvRows.join("\n"), count: rows.length };
    }),

  // ─── Get extensions ───────────────────────────────────────────────────────
  getExtensions: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    try {
      const apiExts = await vocphone.getExtensions();
      // Merge with local user name mappings
      const localExts = await db.select().from(vocphoneExtensions);
      const localMap = new Map(localExts.map(e => [e.extension, e]));
      return apiExts.map((ext: any) => {
        const local = localMap.get(ext.extension || ext.id);
        return {
          ...ext,
          userName: local ? `${local.firstName} ${local.lastName}` : null,
        };
      });
    } catch {
      // Fallback to local extensions table
      const localExts = await db.select().from(vocphoneExtensions);
      return localExts.map(e => ({
        extension: e.extension,
        id: e.extension,
        name: `${e.firstName} ${e.lastName}`,
        userName: `${e.firstName} ${e.lastName}`,
      }));
    }
  }),

  // ─── Admin: Extension Management CRUD ──────────────────────────────────────
  getLocalExtensions: adminProcedure.query(async () => {
    const db = (await getDb())!;
    return await db.select().from(vocphoneExtensions).orderBy(vocphoneExtensions.extension);
  }),

  upsertExtension: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      extension: z.number(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      if (input.id) {
        await db.update(vocphoneExtensions)
          .set({ extension: input.extension, firstName: input.firstName, lastName: input.lastName, email: input.email || null })
          .where(eq(vocphoneExtensions.id, input.id));
        return { success: true };
      } else {
        await db.insert(vocphoneExtensions).values({
          extension: input.extension,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email || null,
        });
        return { success: true };
      }
    }),

  deleteExtension: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(vocphoneExtensions).where(eq(vocphoneExtensions.id, input.id));
      return { success: true };
    }),
});
