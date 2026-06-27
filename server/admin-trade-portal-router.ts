/**
 * Admin Trade Portal Content Manager Router
 * Manages trade portal content from the office side:
 * - News articles (create/edit/publish for trade portal)
 * - Remittance advice (upload PDFs, assign to trades)
 * - Messages (view/reply to trade messages, send bulk announcements)
 * - Access management (enable/disable portal access, resend magic links)
 */
import { z } from "zod";
import { tenantAdminProcedure as adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { eq, desc, and, like, or, sql, inArray } from "drizzle-orm";
import {
  portalNews, tradePortalAccess, tradePortalSessions,
  tradeRemittances, tradeMessages, constructionInstallers,
  smsTemplates, xeroPaymentSyncLog,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { getXeroContacts, getXeroInvoices, getXeroPayments, updateXeroContact, type XeroInvoice, type XeroContact } from "./xero-client";
import { getValidAccessToken } from "./xero-client";
import { sendNotificationEmail } from "./email";
import * as vocphone from "./vocphone";
import crypto from "crypto";
import { triggerPushRemittanceCreated, triggerPushTradeNewsPublished } from "./push-triggers";
import { logNotification } from "./notification-gateway";
import { buildTrustedAppUrlForTenant } from "./_core/url";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";

function generateToken(length = 64): string {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function installerTenantConditions(ctx: any, installerId?: number) {
  const conditions: any[] = [];
  if (installerId != null) conditions.push(eq(constructionInstallers.id, installerId));
  appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function tradeAccessTenantConditions(ctx: any, accessId?: number) {
  const conditions: any[] = [];
  if (accessId != null) conditions.push(eq(tradePortalAccess.id, accessId));
  appendTenantScope(conditions, tradePortalAccess.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function portalNewsTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, portalNews.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

/** Parse Xero .NET date format /Date(ms+tz)/ to ISO string */
function parseXeroDate(d: any): string | null {
  if (!d) return null;
  if (typeof d === 'string') {
    const match = d.match(/\/Date\((\d+)([+-]\d+)?\)\//);
    if (match) return new Date(parseInt(match[1], 10)).toISOString();
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  return null;
}

export const adminTradePortalRouter = router({
  // ─── News Management (trade portal specific) ──────────────────────────────
  // Each portal has its own news articles, distinguished by portalType column.

  listNews: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(portalNews)
      .where(and(
        ...portalNewsTenantConditions(ctx),
        or(eq(portalNews.portalType, "trade"), eq(portalNews.portalType, "both"))
      ))
      .orderBy(desc(portalNews.createdAt));
  }),

  createNews: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      slug: z.string().min(1),
      excerpt: z.string().optional(),
      content: z.string().min(1),
      coverImageUrl: z.string().optional(),
      category: z.string().optional(),
      isPublished: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(portalNews).values({
        tenantId: ctx.tenant?.id ?? null,
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt || null,
        content: input.content,
        coverImageUrl: input.coverImageUrl || null,
        category: input.category || null,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
        authorId: ctx.user!.id,
        portalType: "trade",
      }).$returningId();

      // Push notification to all trade portal users when published
      if (input.isPublished) {
        triggerPushTradeNewsPublished(input.title);
      }

      return { id: result.id };
    }),

  updateNews: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      slug: z.string().optional(),
      excerpt: z.string().nullable().optional(),
      content: z.string().optional(),
      coverImageUrl: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      isPublished: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...updates } = input;
      const setData: any = { ...updates };
      if (updates.isPublished === true) {
        const [existing] = await db.select({ publishedAt: portalNews.publishedAt })
          .from(portalNews)
          .where(and(...portalNewsTenantConditions(ctx, eq(portalNews.id, id))))
          .limit(1);
        if (!existing?.publishedAt) setData.publishedAt = new Date();
      }
      await db.update(portalNews).set(setData).where(and(...portalNewsTenantConditions(ctx, eq(portalNews.id, id))));
      return { success: true };
    }),

  deleteNews: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(portalNews).where(and(...portalNewsTenantConditions(ctx, eq(portalNews.id, input.id))));
      return { success: true };
    }),

  // ─── Xero Bills Integration ────────────────────────────────────────────────

  /** Match a trade to a Xero contact by email, storing the xeroContactId */
  matchTradeToXero: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection. Please connect Xero first." });
      const routing = { connectionId: auth.xeroConnectionId };
      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, input.installerId))).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      if (!installer.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Trade has no email address. Add an email to match with Xero." });
      // Search Xero contacts by email
      const result = await getXeroContacts({ where: `EmailAddress=="${installer.email}"` }, routing);
      if (result.Contacts.length === 0) {
        // Try matching by name as fallback
        const nameResult = await getXeroContacts({ where: `Name.Contains("${installer.name}")` }, routing);
        if (nameResult.Contacts.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: `No Xero contact found matching email "${installer.email}" or name "${installer.name}"` });
        }
        const contact = nameResult.Contacts[0];
        await db.update(constructionInstallers)
          .set({ xeroContactId: contact.ContactID })
          .where(and(...installerTenantConditions(ctx, input.installerId)));
        return { matched: true, contactId: contact.ContactID, contactName: contact.Name, matchedBy: "name" };
      }
      const contact = result.Contacts[0];
      await db.update(constructionInstallers)
        .set({ xeroContactId: contact.ContactID })
        .where(and(...installerTenantConditions(ctx, input.installerId)));
      return { matched: true, contactId: contact.ContactID, contactName: contact.Name, matchedBy: "email" };
    }),

  /** Fetch bills (ACCPAY invoices) from Xero for a matched trade */
  getXeroBills: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) return { connected: false, bills: [], error: "No active Xero connection" };
      const routing = { connectionId: auth.xeroConnectionId };
      const [installer] = await db.select().from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, input.installerId))).limit(1);
      if (!installer?.xeroContactId) {
        return { connected: true, bills: [], error: "Trade not linked to Xero. Click 'Link to Xero' to match." };
      }
      try {
        const result = await getXeroInvoices({
          where: `Type=="ACCPAY"&&Contact.ContactID==guid("${installer.xeroContactId}")`,
        }, routing);
        const bills = (result.Invoices || []).map((inv: XeroInvoice) => ({
          invoiceId: inv.InvoiceID,
          invoiceNumber: inv.InvoiceNumber,
          date: parseXeroDate(inv.Date),
          dueDate: parseXeroDate(inv.DueDate),
          status: inv.Status,
          reference: inv.Reference,
          subTotal: inv.SubTotal,
          totalTax: inv.TotalTax,
          total: inv.Total,
          amountDue: inv.AmountDue,
          amountPaid: inv.AmountPaid,
          lineItems: (inv.LineItems || []).map(li => ({
            description: li.Description,
            quantity: li.Quantity,
            unitAmount: li.UnitAmount,
            lineAmount: li.LineAmount,
          })),
        }));
        return { connected: true, bills, error: null };
      } catch (err: any) {
        console.error("[Xero Bills] Error fetching bills:", err.message);
        return { connected: true, bills: [], error: err.message };
      }
    }),

  /** Bulk match all trades to Xero contacts by email */
  bulkMatchTradesToXero: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
    if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
    const trades = await db.select({
      id: constructionInstallers.id,
      name: constructionInstallers.name,
      email: constructionInstallers.email,
    }).from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NULL`,
        sql`${constructionInstallers.email} IS NOT NULL AND ${constructionInstallers.email} != ''`,
        ...installerTenantConditions(ctx),
      ));
    let matched = 0;
    let failed = 0;
    const results: Array<{ id: number; name: string; status: string }> = [];
    for (const trade of trades) {
      try {
        const contactResult = await getXeroContacts({ where: `EmailAddress=="${trade.email}"` }, { connectionId: auth.xeroConnectionId });
        if (contactResult.Contacts.length > 0) {
          await db.update(constructionInstallers)
            .set({ xeroContactId: contactResult.Contacts[0].ContactID })
            .where(and(...installerTenantConditions(ctx, trade.id)));
          matched++;
          results.push({ id: trade.id, name: trade.name, status: "matched" });
        } else {
          failed++;
          results.push({ id: trade.id, name: trade.name, status: "no_match" });
        }
      } catch (err: any) {
        failed++;
        results.push({ id: trade.id, name: trade.name, status: `error: ${err.message}` });
      }
    }
    return { matched, failed, total: trades.length, results };
  }),

  // ─── Remittance Advice Management ─────────────────────────────────────────

  listRemittances: adminProcedure
    .input(z.object({ installerId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = input?.installerId
        ? installerTenantConditions(ctx, input.installerId)
        : installerTenantConditions(ctx);
      const remittanceRows = await db.select({ remittance: tradeRemittances })
        .from(tradeRemittances)
        .innerJoin(constructionInstallers, eq(tradeRemittances.installerId, constructionInstallers.id))
        .where(and(...conditions))
        .orderBy(desc(tradeRemittances.date));
      const remittances = remittanceRows.map(r => r.remittance);

      // Enrich with installer names
      const installerIds = Array.from(new Set(remittances.map(r => r.installerId)));
      if (installerIds.length === 0) return [];

      const installers = await db.select({ id: constructionInstallers.id, name: constructionInstallers.name })
        .from(constructionInstallers)
        .where(and(
          inArray(constructionInstallers.id, installerIds),
          ...installerTenantConditions(ctx),
        ));
      const nameMap = Object.fromEntries(installers.map(i => [i.id, i.name]));

      return remittances.map(r => ({
        ...r,
        installerName: nameMap[r.installerId] || "Unknown",
      }));
    }),

  createRemittance: adminProcedure
    .input(z.object({
      installerId: z.number(),
      amount: z.string(),
      date: z.string(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      fileBase64: z.string().optional(),
      fileName: z.string().optional(),
      fileMimeType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [installer] = await db.select({ id: constructionInstallers.id }).from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, input.installerId)))
        .limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });

      let fileUrl: string | null = null;
      let fileKey: string | null = null;

      if (input.fileBase64 && input.fileName) {
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const suffix = crypto.randomBytes(4).toString("hex");
        const key = `trade-remittances/${input.installerId}/${input.fileName}-${suffix}`;
        const result = await storagePut(key, fileBuffer, input.fileMimeType || "application/pdf");
        fileUrl = result.url;
        fileKey = key;
      }

      const [result] = await db.insert(tradeRemittances).values({
        installerId: input.installerId,
        amount: input.amount,
        date: new Date(input.date),
        reference: input.reference || null,
        notes: input.notes || null,
        fileUrl,
        fileKey,
      }).$returningId();

      // Push notification to trade portal user
      triggerPushRemittanceCreated(input.installerId, input.amount, input.reference || null);

      return { id: result.id };
    }),

  deleteRemittance: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [remittance] = await db.select({ id: tradeRemittances.id })
        .from(tradeRemittances)
        .innerJoin(constructionInstallers, eq(tradeRemittances.installerId, constructionInstallers.id))
        .where(and(
          eq(tradeRemittances.id, input.id),
          ...installerTenantConditions(ctx),
        ));
      if (!remittance) throw new TRPCError({ code: "NOT_FOUND", message: "Remittance not found" });
      await db.delete(tradeRemittances).where(eq(tradeRemittances.id, input.id));
      return { success: true };
    }),

  // ─── Messages Management ──────────────────────────────────────────────────

  /** List all trade messages grouped by installer, with unread counts */
  listMessageThreads: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get all messages
    const messageRows = await db.select({ message: tradeMessages }).from(tradeMessages)
      .innerJoin(constructionInstallers, eq(tradeMessages.installerId, constructionInstallers.id))
      .where(and(...installerTenantConditions(ctx)))
      .orderBy(desc(tradeMessages.createdAt));
    const messages = messageRows.map(r => r.message);

    // Group by installer
    const threads: Record<number, {
      installerId: number;
      installerName: string;
      lastMessage: string;
      lastMessageAt: Date;
      unreadCount: number;
      totalMessages: number;
    }> = {};

    for (const msg of messages) {
      if (!threads[msg.installerId]) {
        threads[msg.installerId] = {
          installerId: msg.installerId,
          installerName: msg.senderName || "Unknown",
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: 0,
          totalMessages: 0,
        };
      }
      threads[msg.installerId].totalMessages++;
      // Unread = inbound messages (trade→office) that haven't been read
      if (msg.direction === "inbound" && !msg.readAt) {
        threads[msg.installerId].unreadCount++;
      }
    }

    // Enrich with installer names
    const installerIds = Object.keys(threads).map(Number);
    if (installerIds.length > 0) {
      const installers = await db.select({ id: constructionInstallers.id, name: constructionInstallers.name })
        .from(constructionInstallers)
        .where(and(
          inArray(constructionInstallers.id, installerIds),
          ...installerTenantConditions(ctx),
        ));
      for (const inst of installers) {
        if (threads[inst.id]) threads[inst.id].installerName = inst.name;
      }
    }

    return Object.values(threads).sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }),

  /** Get messages for a specific trade */
  getMessages: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [installer] = await db.select({ id: constructionInstallers.id }).from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, input.installerId))).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });

      const messages = await db.select().from(tradeMessages)
        .where(eq(tradeMessages.installerId, input.installerId))
        .orderBy(tradeMessages.createdAt);

      // Mark inbound messages as read
      const unread = messages.filter(m => m.direction === "inbound" && !m.readAt);
      for (const msg of unread) {
        await db.update(tradeMessages).set({ readAt: new Date() }).where(eq(tradeMessages.id, msg.id));
      }

      return messages;
    }),

  /** Send a message to a trade (outbound: office→trade) */
  sendMessage: adminProcedure
    .input(z.object({
      installerId: z.number(),
      content: z.string().min(1),
      jobId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [installer] = await db.select({ id: constructionInstallers.id }).from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, input.installerId))).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });

      const [result] = await db.insert(tradeMessages).values({
        installerId: input.installerId,
        jobId: input.jobId || null,
        content: input.content,
        direction: "outbound",
        senderName: ctx.user!.name || "Office",
      });

      return { id: result.insertId };
    }),

  /** Send a bulk announcement to all active trades with optional SMS/email dispatch */
  sendBulkAnnouncement: adminProcedure
    .input(z.object({
      content: z.string().min(1),
      subject: z.string().optional(), // For email subject line
      tradeIds: z.array(z.number()).optional(),
      channels: z.array(z.enum(["portal", "sms", "email"])).default(["portal"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let targetIds = input.tradeIds || [];
      if (targetIds.length === 0) {
        const accesses = await db.select({ installerId: tradePortalAccess.installerId })
          .from(tradePortalAccess)
          .where(and(
            eq(tradePortalAccess.isActive, true),
            ...tradeAccessTenantConditions(ctx),
          ));
        targetIds = Array.from(new Set(accesses.map(a => a.installerId)));
      }

      // Get installer details for SMS/email
      const installers = targetIds.length > 0
        ? await db.select({
            id: constructionInstallers.id,
            name: constructionInstallers.name,
            phone: constructionInstallers.phone,
            email: constructionInstallers.email,
          }).from(constructionInstallers)
            .where(and(
              inArray(constructionInstallers.id, targetIds),
              ...installerTenantConditions(ctx),
            ))
        : [];
      targetIds = installers.map(i => i.id);
      const installerMap = Object.fromEntries(installers.map(i => [i.id, i]));

      let portalSent = 0;
      let smsSent = 0;
      let emailSent = 0;
      let smsErrors = 0;
      let emailErrors = 0;

      for (const installerId of targetIds) {
        const inst = installerMap[installerId];

        // SMS/email announcements are mirrored into the trade portal notification feed
        // so trades have a durable in-app copy even when the delivery channel is external.
        if (input.channels.includes("portal") || input.channels.includes("sms") || input.channels.includes("email")) {
          await db.insert(tradeMessages).values({
            installerId,
            content: stripHtml(input.content),
            direction: "outbound",
            senderName: ctx.user!.name || "Office",
          });
          portalSent++;
        }

        // Send SMS if channel selected and trade has phone
        if (input.channels.includes("sms") && inst?.phone) {
          try {
            const senderNumber = process.env.VOCPHONE_SMS_SENDER || "61480855750";
            // Strip non-digits and ensure E164 format without +
            const recipient = inst.phone.replace(/[^0-9]/g, "");
            if (recipient.length >= 10) {
              await vocphone.sendSms({
                recipient,
                sender: senderNumber,
                body: input.content.replace(/<[^>]*>/g, "").substring(0, 1600), // Strip HTML, limit length
              });
              smsSent++;
            }
          } catch (err: any) {
            console.error(`[Bulk SMS] Failed for installer ${installerId}:`, err.message);
            smsErrors++;
          }
        }

        // Send email if channel selected and trade has email
        if (input.channels.includes("email") && inst?.email) {
          try {
            const subject = input.subject || "Announcement from Altaspan";
            const htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a1a;">Hi ${inst.name || "there"},</h2>
                <div style="color: #334155; line-height: 1.6;">${input.content}</div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #64748b; font-size: 12px;">This message was sent from Altaspan.</p>
              </div>
            `;
            const result = await sendNotificationEmail({
              to: inst.email,
              subject,
              htmlBody,
              fromName: "Altaspan",
            });
            if (result.success) emailSent++;
            else emailErrors++;
          } catch (err: any) {
            console.error(`[Bulk Email] Failed for installer ${installerId}:`, err.message);
            emailErrors++;
          }
        }
      }

      return { portalSent, smsSent, emailSent, smsErrors, emailErrors, totalTargets: targetIds.length };
    }),

  // ─── Access Management ────────────────────────────────────────────────────

  /** List all trade portal access records with installer info */
  listAccess: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const accessConditions = tradeAccessTenantConditions(ctx);
    const accesses = await db.select().from(tradePortalAccess)
      .where(accessConditions.length ? and(...accessConditions) : undefined)
      .orderBy(desc(tradePortalAccess.createdAt));

    // Enrich with installer names
      const installerIds = Array.from(new Set(accesses.map(a => a.installerId)));
    if (installerIds.length === 0) return [];

    const installers = await db.select({
      id: constructionInstallers.id,
      name: constructionInstallers.name,
      email: constructionInstallers.email,
      phone: constructionInstallers.phone,
      tradeType: constructionInstallers.tradeType,
      active: constructionInstallers.active,
    }).from(constructionInstallers)
      .where(and(
        inArray(constructionInstallers.id, installerIds),
        ...installerTenantConditions(ctx),
      ));
    const instMap = Object.fromEntries(installers.map(i => [i.id, i]));

    return accesses.map(a => ({
      ...a,
      installerName: instMap[a.installerId]?.name || "Unknown",
      installerPhone: instMap[a.installerId]?.phone || null,
      installerTradeType: instMap[a.installerId]?.tradeType || null,
      installerActive: instMap[a.installerId]?.active ?? false,
    }));
  }),

  /** Create portal access for a trade */
  createAccess: adminProcedure
    .input(z.object({
      installerId: z.number(),
      email: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [installer] = await db.select({ id: constructionInstallers.id }).from(constructionInstallers)
        .where(and(...installerTenantConditions(ctx, input.installerId)))
        .limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });

      // Check if access already exists
      const [existing] = await db.select().from(tradePortalAccess)
        .where(and(
          eq(tradePortalAccess.installerId, input.installerId),
          ...tradeAccessTenantConditions(ctx),
        )).limit(1);

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Portal access already exists for this trade" });
      }

      const accessToken = generateToken(64);
      const [result] = await db.insert(tradePortalAccess).values({
        tenantId: ctx.tenant?.id ?? null,
        installerId: input.installerId,
        email: input.email,
        accessToken,
        isActive: true,
      }).$returningId();

      return { id: result.id, accessToken };
    }),

  /** Toggle portal access active/inactive */
  toggleAccess: adminProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(tradePortalAccess)
        .set({ isActive: input.isActive })
        .where(and(...tradeAccessTenantConditions(ctx, input.id)));
      return { success: true };
    }),

  /** Regenerate access token (resend magic link) */
  regenerateToken: adminProcedure
    .input(z.object({ id: z.number(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const newToken = generateToken(64);
      await db.update(tradePortalAccess)
        .set({ accessToken: newToken, isActive: true })
        .where(and(...tradeAccessTenantConditions(ctx, input.id)));

      // Get the access record for email
      const [access] = await db.select().from(tradePortalAccess)
        .where(and(...tradeAccessTenantConditions(ctx, input.id))).limit(1);

      if (access) {
        // Create a new session with magic link
        const sessionToken = generateToken();
        const magicLinkToken = generateToken(32);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        await db.insert(tradePortalSessions).values({
          tradePortalAccessId: access.id,
          sessionToken,
          magicLinkToken,
          magicLinkExpiresAt: expiresAt,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        const magicLinkUrl = await buildTrustedAppUrlForTenant(
          ctx.req,
          access.tenantId ?? ctx.tenant!.id,
          `/trade-portal/login?magic=${encodeURIComponent(magicLinkToken)}`,
          input.origin
        );

        // Try to send email
        try {
          const [installer] = await db.select().from(constructionInstallers)
            .where(and(...installerTenantConditions(ctx, access.installerId))).limit(1);

          const result = await sendNotificationEmail({
            tenantId: access.tenantId ?? ctx.tenant!.id,
            to: access.email,
            subject: "Your Altaspan Trade Portal Login Link",
            htmlBody: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1a1a1a;">Altaspan Trade Portal</h2>
                    <p>Hi ${installer?.name || "there"},</p>
                    <p>A new login link has been generated for your trade portal access:</p>
                    <a href="${magicLinkUrl}" style="display: inline-block; background: #f59e0b; color: #1a1a1a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">
                      Access Trade Portal
                    </a>
                    <p style="color: #666; font-size: 14px;">This link expires in 30 minutes.</p>
                  </div>
                `,
            module: "admin",
          });
          await logNotification(
            { settingKey: "trade_portal.magic_link", channel: "email", recipientType: "trade", recipientId: access.email, title: "Trade Portal Login Link" },
            result.success ? "sent" : "failed",
            result.error
          );
        } catch (e: any) {
          console.error("Failed to send trade portal magic link email:", e);
          await logNotification(
            { settingKey: "trade_portal.magic_link", channel: "email", recipientType: "trade", recipientId: access.email, title: "Trade Portal Login Link" },
            "failed",
            e?.message || "Unknown error"
          ).catch(() => {});
        }

        return { success: true, magicLinkUrl };
      }

      return { success: true };
    }),

  /** Delete portal access entirely */
  deleteAccess: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(tradePortalAccess).where(and(...tradeAccessTenantConditions(ctx, input.id)));
      return { success: true };
    }),

  /** List trades without portal access (for creating new access) */
  tradesWithoutAccess: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const allTrades = await db.select({
      id: constructionInstallers.id,
      name: constructionInstallers.name,
      email: constructionInstallers.email,
      tradeType: constructionInstallers.tradeType,
    }).from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        ...installerTenantConditions(ctx),
      ));

    const existingAccess = await db.select({ installerId: tradePortalAccess.installerId })
      .from(tradePortalAccess)
      .where(and(...tradeAccessTenantConditions(ctx)));
    const accessedIds = new Set(existingAccess.map(a => a.installerId));

    return allTrades.filter(t => !accessedIds.has(t.id));
  }),

  // ─── Xero Payment Reconciliation ──────────────────────────────────────────
  /** Reconcile Xero payments → auto-create remittance records for paid bills */
  reconcileXeroPayments: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
    if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection. Please connect Xero first." });
    const routing = { connectionId: auth.xeroConnectionId };

    // Get all trades linked to Xero
    const linkedTrades = await db.select({
      id: constructionInstallers.id,
      name: constructionInstallers.name,
      xeroContactId: constructionInstallers.xeroContactId,
    }).from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
      ));

    if (linkedTrades.length === 0) {
      return { created: 0, skipped: 0, errors: 0, message: "No trades linked to Xero. Link trades first." };
    }

    // Get existing Xero-sourced remittances to avoid duplicates
    const existingXeroRemittances = await db.select({
      xeroPaymentId: tradeRemittances.xeroPaymentId,
    }).from(tradeRemittances)
      .where(eq(tradeRemittances.source, "xero"));
    const existingPaymentIds = new Set(
      existingXeroRemittances.map(r => r.xeroPaymentId).filter(Boolean)
    );

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const details: Array<{ trade: string; action: string; amount?: number; ref?: string }> = [];

    for (const trade of linkedTrades) {
      try {
        // Fetch ACCPAY (bills) for this trade's Xero contact
        const invoiceResult = await getXeroInvoices({
          where: `Type=="ACCPAY"&&Contact.ContactID==guid("${trade.xeroContactId}")&&Status=="PAID"`,
        }, routing);

        for (const invoice of (invoiceResult.Invoices || [])) {
          // Fetch payments for this invoice
          if (!invoice.InvoiceID) continue;
          try {
            const paymentResult = await getXeroPayments({
              where: `Invoice.InvoiceID==guid("${invoice.InvoiceID}")`,
            }, routing);
            for (const payment of (paymentResult.Payments || [])) {
              if (!payment.PaymentID) continue;
              if (existingPaymentIds.has(payment.PaymentID)) {
                skipped++;
                continue;
              }
              // Create remittance record
              await db.insert(tradeRemittances).values({
                installerId: trade.id,
                amount: String(payment.Amount || 0),
                date: payment.Date ? new Date(payment.Date) : new Date(),
                reference: payment.Reference || invoice.InvoiceNumber || null,
                notes: `Auto-synced from Xero. Invoice: ${invoice.InvoiceNumber || invoice.InvoiceID}`,
                source: "xero",
                xeroPaymentId: payment.PaymentID,
                xeroInvoiceId: invoice.InvoiceID,
                xeroInvoiceNumber: invoice.InvoiceNumber || null,
              });
              existingPaymentIds.add(payment.PaymentID);
              created++;
              details.push({
                trade: trade.name,
                action: "created",
                amount: payment.Amount,
                ref: payment.Reference || invoice.InvoiceNumber,
              });
            }
          } catch (payErr: any) {
            console.error(`[Reconcile] Error fetching payments for invoice ${invoice.InvoiceID}:`, payErr.message);
            errors++;
          }
        }
      } catch (err: any) {
        console.error(`[Reconcile] Error processing trade ${trade.name}:`, err.message);
        errors++;
        details.push({ trade: trade.name, action: `error: ${err.message}` });
      }
    }

    return { created, skipped, errors, tradesProcessed: linkedTrades.length, details };
  }),

  /** Get reconciliation summary stats */
  reconciliationStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [manualCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeRemittances).where(eq(tradeRemittances.source, "manual"));
    const [xeroCount] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeRemittances).where(eq(tradeRemittances.source, "xero"));
    const [lastXeroSync] = await db.select({ latest: sql<string | null>`MAX(createdAt)` })
      .from(tradeRemittances).where(eq(tradeRemittances.source, "xero"));
    const [linkedTrades] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
      ));
    const [totalTrades] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(constructionInstallers)
      .where(eq(constructionInstallers.active, true));

    return {
      manualRemittances: Number(manualCount?.count || 0),
      xeroRemittances: Number(xeroCount?.count || 0),
      lastXeroSyncAt: lastXeroSync?.latest || null,
      linkedTrades: Number(linkedTrades?.count || 0),
      totalActiveTrades: Number(totalTrades?.count || 0),
    };
  }),

  // ─── Xero Contact Sync ───────────────────────────────────────────────────
  /** Pull Xero contact details into local trade record */
  syncContactFromXero: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      const [installer] = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, input.installerId)).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      if (!installer.xeroContactId) throw new TRPCError({ code: "BAD_REQUEST", message: "Trade not linked to Xero" });

      const result = await getXeroContacts({ where: `ContactID==guid("${installer.xeroContactId}")` }, routing);
      if (!result.Contacts?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Xero contact not found" });

      const xc = result.Contacts[0];
      const updates: Record<string, any> = { lastXeroSyncAt: new Date() };

      // Pull email
      if (xc.EmailAddress && xc.EmailAddress !== installer.email) {
        updates.email = xc.EmailAddress;
      }
      // Pull phone (prefer DEFAULT type, fallback to MOBILE)
      const defaultPhone = xc.Phones?.find(p => p.PhoneType === "DEFAULT");
      const mobilePhone = xc.Phones?.find(p => p.PhoneType === "MOBILE");
      const xeroPhone = defaultPhone?.PhoneNumber || mobilePhone?.PhoneNumber;
      if (xeroPhone && xeroPhone !== installer.phone) {
        updates.phone = xeroPhone;
      }
      // Pull address (prefer STREET type)
      const streetAddr = xc.Addresses?.find(a => a.AddressType === "STREET");
      if (streetAddr) {
        const parts = [streetAddr.AddressLine1, streetAddr.AddressLine2, streetAddr.City, streetAddr.Region, streetAddr.PostalCode].filter(Boolean);
        const fullAddress = parts.join(", ");
        if (fullAddress && fullAddress !== installer.address) {
          updates.address = fullAddress;
        }
      }
      // Pull ABN (TaxNumber)
      if (xc.TaxNumber && xc.TaxNumber !== installer.abn) {
        updates.abn = xc.TaxNumber;
      }

      await db.update(constructionInstallers)
        .set(updates)
        .where(eq(constructionInstallers.id, input.installerId));

      return {
        synced: true,
        updatedFields: Object.keys(updates).filter(k => k !== "lastXeroSyncAt"),
        contact: { name: xc.Name, email: xc.EmailAddress, phone: xeroPhone, abn: xc.TaxNumber },
      };
    }),

  /** Push local trade details to Xero contact card */
  pushContactToXero: adminProcedure
    .input(z.object({ installerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      const [installer] = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, input.installerId)).limit(1);
      if (!installer) throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      if (!installer.xeroContactId) throw new TRPCError({ code: "BAD_REQUEST", message: "Trade not linked to Xero" });

      const xeroUpdate: Partial<XeroContact> = {
        Name: installer.name,
      };
      if (installer.email) xeroUpdate.EmailAddress = installer.email;
      if (installer.phone) {
        xeroUpdate.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: installer.phone }];
      }
      if (installer.abn) xeroUpdate.TaxNumber = installer.abn;
      if (installer.address) {
        // Try to parse address into components
        const parts = installer.address.split(",").map(s => s.trim());
        xeroUpdate.Addresses = [{
          AddressType: "STREET",
          AddressLine1: parts[0] || "",
          City: parts.length >= 3 ? parts[parts.length - 3] : "",
          Region: parts.length >= 2 ? parts[parts.length - 2] : "",
          PostalCode: parts.length >= 1 ? parts[parts.length - 1] : "",
        }];
      }

      await updateXeroContact(installer.xeroContactId, xeroUpdate, routing);
      await db.update(constructionInstallers)
        .set({ lastXeroSyncAt: new Date() })
        .where(eq(constructionInstallers.id, input.installerId));

      return { pushed: true, contactId: installer.xeroContactId };
    }),

  /** Bulk sync all linked trades' contact details from Xero */
  bulkSyncContactsFromXero: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
    if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
    const routing = { connectionId: auth.xeroConnectionId };

    const linkedTrades = await db.select().from(constructionInstallers)
      .where(and(
        eq(constructionInstallers.active, true),
        sql`${constructionInstallers.xeroContactId} IS NOT NULL`,
      ));

    let synced = 0;
    let failed = 0;
    const results: Array<{ id: number; name: string; status: string; updatedFields?: string[] }> = [];

    for (const trade of linkedTrades) {
      try {
        const result = await getXeroContacts({ where: `ContactID==guid("${trade.xeroContactId}")` }, routing);
        if (!result.Contacts?.length) {
          results.push({ id: trade.id, name: trade.name, status: "not_found_in_xero" });
          failed++;
          continue;
        }
        const xc = result.Contacts[0];
        const updates: Record<string, any> = { lastXeroSyncAt: new Date() };
        const updatedFields: string[] = [];

        if (xc.EmailAddress && xc.EmailAddress !== trade.email) {
          updates.email = xc.EmailAddress;
          updatedFields.push("email");
        }
        const defaultPhone = xc.Phones?.find(p => p.PhoneType === "DEFAULT");
        const mobilePhone = xc.Phones?.find(p => p.PhoneType === "MOBILE");
        const xeroPhone = defaultPhone?.PhoneNumber || mobilePhone?.PhoneNumber;
        if (xeroPhone && xeroPhone !== trade.phone) {
          updates.phone = xeroPhone;
          updatedFields.push("phone");
        }
        const streetAddr = xc.Addresses?.find(a => a.AddressType === "STREET");
        if (streetAddr) {
          const parts = [streetAddr.AddressLine1, streetAddr.AddressLine2, streetAddr.City, streetAddr.Region, streetAddr.PostalCode].filter(Boolean);
          const fullAddress = parts.join(", ");
          if (fullAddress && fullAddress !== trade.address) {
            updates.address = fullAddress;
            updatedFields.push("address");
          }
        }
        if (xc.TaxNumber && xc.TaxNumber !== trade.abn) {
          updates.abn = xc.TaxNumber;
          updatedFields.push("abn");
        }

        await db.update(constructionInstallers)
          .set(updates)
          .where(eq(constructionInstallers.id, trade.id));

        synced++;
        results.push({ id: trade.id, name: trade.name, status: "synced", updatedFields });
      } catch (err: any) {
        failed++;
        results.push({ id: trade.id, name: trade.name, status: `error: ${err.message}` });
      }
    }

    return { synced, failed, total: linkedTrades.length, results };
  }),

  // ─── Trade SMS Templates ─────────────────────────────────────────────────
  /** List SMS templates filtered by trade category */
  tradeTemplates: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(smsTemplates)
      .where(like(smsTemplates.category, "Trade%"))
      .orderBy(smsTemplates.category, smsTemplates.sortOrder);
  }),

  // ─── Xero Payment Reconciliation ────────────────────────────────────────
  syncXeroPayments: adminProcedure
    .input(z.object({ installerId: z.number().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const auth = await getValidAccessToken({ appTenantId: ctx.tenant?.id, moduleKey: "trade_portal" });
      if (!auth) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active Xero connection" });
      const routing = { connectionId: auth.xeroConnectionId };

      // Get all Xero-linked trades
      const conditions: any[] = [sql`${constructionInstallers.xeroContactId} IS NOT NULL`];
      if (input?.installerId) conditions.push(eq(constructionInstallers.id, input.installerId));
      appendTenantScope(conditions, constructionInstallers.tenantId, tenantIdFromContext(ctx));
      const linkedTrades = await db.select()
        .from(constructionInstallers)
        .where(and(...conditions));

      if (linkedTrades.length === 0) return { synced: 0, skipped: 0, errors: 0, total: 0 };

      // Get already-synced payment IDs to avoid duplicates
      const existingLogs = await db.select({ xeroPaymentId: xeroPaymentSyncLog.xeroPaymentId })
        .from(xeroPaymentSyncLog);
      const syncedPaymentIds = new Set(existingLogs.map(l => l.xeroPaymentId));

      let synced = 0, skipped = 0, errors = 0;

      for (const trade of linkedTrades) {
        try {
          // Get payments for this contact from Xero
          const paymentsResult = await getXeroPayments({ where: `Invoice.Contact.ContactID=guid("${trade.xeroContactId}")` }, routing);
          const payments = paymentsResult.Payments || [];

          for (const payment of payments) {
            const paymentId = payment.PaymentID;
            if (!paymentId || syncedPaymentIds.has(paymentId)) {
              skipped++;
              continue;
            }

            const invoiceId = payment.Invoice?.InvoiceID;
            const invoiceNumber = payment.Invoice?.InvoiceNumber;

            try {
              // Create remittance record
              const [remittance] = await db.insert(tradeRemittances).values({
                installerId: trade.id,
                amount: String(payment.Amount || "0"),
                date: payment.Date ? new Date(payment.Date) : new Date(),
                reference: `Xero: ${invoiceNumber || invoiceId || paymentId}`,
                notes: `Auto-synced from Xero payment ${paymentId}`,
                source: "xero",
                xeroPaymentId: paymentId,
                xeroInvoiceId: invoiceId || null,
                xeroInvoiceNumber: invoiceNumber || null,
              }).$returningId();

              // Log the sync
              await db.insert(xeroPaymentSyncLog).values({
                xeroPaymentId: paymentId,
                xeroInvoiceId: invoiceId || null,
                xeroInvoiceNumber: invoiceNumber || null,
                installerId: trade.id,
                remittanceId: remittance.id,
                amount: String(payment.Amount || "0"),
                paymentDate: payment.Date ? new Date(payment.Date) : new Date(),
                status: "synced",
              });

              syncedPaymentIds.add(paymentId);
              synced++;
            } catch (err: any) {
              // Log the error but continue
              await db.insert(xeroPaymentSyncLog).values({
                xeroPaymentId: paymentId,
                xeroInvoiceId: invoiceId || null,
                xeroInvoiceNumber: invoiceNumber || null,
                installerId: trade.id,
                amount: String(payment.Amount || "0"),
                paymentDate: new Date(),
                status: "error",
                errorMessage: err.message,
              });
              errors++;
            }
          }
        } catch (err: any) {
          console.error(`Failed to sync payments for trade ${trade.id}:`, err.message);
          errors++;
        }
      }

      return { synced, skipped, errors, total: synced + skipped + errors };
    }),

  /** Get reconciliation status and recent sync logs */
  getReconciliationStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const logs = await db.select()
      .from(xeroPaymentSyncLog)
      .orderBy(desc(xeroPaymentSyncLog.syncedAt))
      .limit(50);

    const totalSynced = logs.filter(l => l.status === "synced").length;
    const totalErrors = logs.filter(l => l.status === "error").length;
    const lastSync = logs.length > 0 ? logs[0].syncedAt : null;

    // Count auto vs manual remittances
    const autoRemittances = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeRemittances)
      .where(eq(tradeRemittances.source, "xero"));
    const manualRemittances = await db.select({ count: sql<number>`COUNT(*)` })
      .from(tradeRemittances)
      .where(eq(tradeRemittances.source, "manual"));

    return {
      lastSyncAt: lastSync,
      recentLogs: logs,
      stats: {
        totalSynced,
        totalErrors,
        autoRemittances: autoRemittances[0]?.count || 0,
        manualRemittances: manualRemittances[0]?.count || 0,
      },
    };
  }),
});
