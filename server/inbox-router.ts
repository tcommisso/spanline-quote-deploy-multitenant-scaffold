/**
 * Inbox tRPC Router
 * Shared Inbox / Central Email Hub — all CRUD, tagging, assignment, filtering, signatures, SLA rules
 */
import { z } from "zod";
import { router, tenantProcedure as protectedProcedure, tenantAdminProcedure as adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as inboxDb from "./inbox-db";
import { sendNotificationEmail } from "./email";
import { sendUnifiedEmail } from "./email/send";
import { sendTaskAssignmentNotification } from "./task-notifications";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { crmLeads, constructionInstallers, suppliers } from "../drizzle/schema";
import { and, eq, like, or, sql } from "drizzle-orm";
import { getTenantEmailConfig } from "./tenant-integrations";
import { appendInboxThreadMarkerHtml } from "./inbox-threading";

const inboxStatusSchema = z.enum(["new", "open", "replied", "closed", "spam"]);
const inboxTicketStatusSchema = z.enum(["new", "open", "waiting_customer", "waiting_internal", "customer_replied", "resolved", "closed", "spam"]);
const inboxTicketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const inboxTicketChannelSchema = z.enum(["email", "phone", "web", "portal", "manual"]);
const inboxTicketSlaStateSchema = z.enum(["breached", "warning", "due", "none"]);

const EMAIL_ADDRESS_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function extractEmailAddresses(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractEmailAddresses(item));
  }

  if (typeof value === "object") {
    const maybeRecord = value as Record<string, unknown>;
    return extractEmailAddresses(maybeRecord.email || maybeRecord.address || maybeRecord.mail || "");
  }

  const raw = String(value).trim();
  if (!raw) return [];

  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      return extractEmailAddresses(JSON.parse(raw));
    } catch {
      // Fall through to regex extraction for malformed or legacy strings.
    }
  }

  const matches = raw.match(EMAIL_ADDRESS_RE) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())));
}

function resolveReplyRecipient(originalMsg: {
  direction?: string | null;
  fromAddress?: string | null;
  toAddresses?: string | null;
}, internalAddresses: Set<string> = new Set()): string | null {
  const primaryCandidates = originalMsg.direction === "outbound"
    ? extractEmailAddresses(originalMsg.toAddresses)
    : extractEmailAddresses(originalMsg.fromAddress);
  const fallbackCandidates = originalMsg.direction === "outbound"
    ? extractEmailAddresses(originalMsg.fromAddress)
    : extractEmailAddresses(originalMsg.toAddresses);
  const externalPrimary = primaryCandidates.find((email) => !internalAddresses.has(email.toLowerCase()));
  if (externalPrimary) return externalPrimary;
  const externalFallback = fallbackCandidates.find((email) => !internalAddresses.has(email.toLowerCase()));
  if (externalFallback) return externalFallback;
  return internalAddresses.size === 0 ? primaryCandidates[0] || null : null;
}

export const inboxRouter = router({
  // ─── Messages ─────────────────────────────────────────────────────────────

  list: protectedProcedure
    .input(z.object({
      direction: z.enum(["inbound", "outbound"]).optional(),
      status: z.string().optional(),
      priority: inboxTicketPrioritySchema.optional(),
      channel: inboxTicketChannelSchema.optional(),
      slaState: inboxTicketSlaStateSchema.optional(),
      assignedToId: z.number().optional(),
      assignedState: z.enum(["unassigned"]).optional(),
      isRead: z.boolean().optional(),
      isStarred: z.boolean().optional(),
      search: z.string().optional(),
      tagIds: z.array(z.number()).optional(),
      receivedByAddress: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return inboxDb.listInboxMessages({ ...(input || {}), tenantId: ctx.tenant!.id });
    }),

  getThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const messages = await inboxDb.getThreadMessages(input.threadId, ctx.tenant!.id);
      if (messages.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });
      // Get tags for each message
      const messagesWithTags = await Promise.all(
        messages.map(async (msg) => ({
          ...msg,
          tags: await inboxDb.getMessageTags(msg.id, ctx.tenant!.id),
        }))
      );
      const ticket = await inboxDb.getTicketByThread(input.threadId, ctx.tenant!.id);
      const ticketTags = ticket ? await inboxDb.getTicketTags(ticket.id, ctx.tenant!.id) : [];
      return messagesWithTags.map((msg) => ({
        ...msg,
        ticket,
        tags: ticketTags.length > 0 ? ticketTags : msg.tags,
      }));
    }),

  getMessage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const msg = await inboxDb.getInboxMessageById(input.id, ctx.tenant!.id);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
      const tags = await inboxDb.getMessageTags(msg.id, ctx.tenant!.id);
      return { ...msg, tags };
    }),

  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.markAsRead(input.ids, ctx.tenant!.id);
      return { success: true };
    }),

  markAllRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      await inboxDb.markAllAsRead(ctx.tenant!.id);
      return { success: true };
    }),

  markUnread: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.markAsUnread(input.ids, ctx.tenant!.id);
      return { success: true };
    }),

  markThreadsRead: protectedProcedure
    .input(z.object({ threadIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.markThreadsAsRead(input.threadIds, ctx.tenant!.id);
      return { success: true, count: input.threadIds.length };
    }),

  markThreadsUnread: protectedProcedure
    .input(z.object({ threadIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.markThreadsAsUnread(input.threadIds, ctx.tenant!.id);
      return { success: true, count: input.threadIds.length };
    }),

  // ─── Bulk Operations ──────────────────────────────────────────────────────

  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.bulkDeleteMessages(input.ids, ctx.tenant!.id);
      return { success: true, count: input.ids.length };
    }),

  bulkDeleteThreads: adminProcedure
    .input(z.object({ threadIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const count = await inboxDb.bulkDeleteThreads(input.threadIds, ctx.tenant!.id);
      return { success: true, count };
    }),

  bulkAssign: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(100),
      assignedToId: z.number().nullable(),
      assignedToName: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.bulkAssignMessages(input.ids, input.assignedToId, input.assignedToName, ctx.tenant!.id);
      return { success: true, count: input.ids.length };
    }),

  bulkAssignThreads: protectedProcedure
    .input(z.object({
      threadIds: z.array(z.string()).min(1).max(100),
      assignedToId: z.number().nullable(),
      assignedToName: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await inboxDb.bulkAssignThreads(input.threadIds, input.assignedToId, input.assignedToName, ctx.tenant!.id);
      return { success: true, count };
    }),

  bulkTag: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(100),
      tagId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.bulkAddTag(input.ids, input.tagId, ctx.tenant!.id);
      return { success: true, count: input.ids.length };
    }),

  bulkTagThreads: protectedProcedure
    .input(z.object({
      threadIds: z.array(z.string()).min(1).max(100),
      tagId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const count = await inboxDb.bulkAddTagToThreads(input.threadIds, input.tagId, ctx.tenant!.id);
      return { success: true, count };
    }),

  bulkUpdateTickets: protectedProcedure
    .input(z.object({
      threadIds: z.array(z.string()).min(1).max(100),
      status: inboxTicketStatusSchema.optional(),
      priority: inboxTicketPrioritySchema.optional(),
      channel: inboxTicketChannelSchema.optional(),
      resolutionNotes: z.string().nullable().optional(),
      closedReason: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (
        !input.status &&
        !input.priority &&
        !input.channel &&
        input.resolutionNotes === undefined &&
        input.closedReason === undefined
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No ticket fields provided" });
      }

      const count = await inboxDb.bulkUpdateTickets(
        input.threadIds,
        {
          status: input.status,
          priority: input.priority,
          channel: input.channel,
          resolutionNotes: input.resolutionNotes,
          closedReason: input.closedReason,
        },
        ctx.tenant!.id,
        ctx.user!.id,
        ctx.user!.name || ctx.user!.email || null,
      );

      return { success: true, count };
    }),

  toggleStar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const isStarred = await inboxDb.toggleStar(input.id, ctx.tenant!.id);
      return { isStarred };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: inboxStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.updateInboxMessage(input.id, { status: input.status }, ctx.tenant!.id);
      return { success: true };
    }),

  updateThreadStatus: protectedProcedure
    .input(z.object({ threadId: z.string(), status: inboxTicketStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await inboxDb.updateThreadStatus(
        input.threadId,
        input.status,
        ctx.tenant!.id,
        ctx.user!.id,
        ctx.user!.name || ctx.user!.email || null,
      );
      return { success: true };
    }),

  updateTicket: protectedProcedure
    .input(z.object({
      threadId: z.string(),
      priority: inboxTicketPrioritySchema.optional(),
      channel: inboxTicketChannelSchema.optional(),
      status: inboxTicketStatusSchema.optional(),
      resolutionNotes: z.string().nullable().optional(),
      closedReason: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await inboxDb.updateTicketMetadata(
        input.threadId,
        {
          priority: input.priority,
          channel: input.channel,
          status: input.status,
          resolutionNotes: input.resolutionNotes,
          closedReason: input.closedReason,
        },
        ctx.tenant!.id,
        ctx.user!.id,
        ctx.user!.name || ctx.user!.email || null,
      );
      return { success: true, ticket };
    }),

  notes: router({
    list: protectedProcedure
      .input(z.object({ threadId: z.string() }))
      .query(async ({ ctx, input }) => {
        return inboxDb.listTicketNotes(input.threadId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        threadId: z.string(),
        body: z.string().trim().min(1).max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        return inboxDb.createTicketNote(
          input.threadId,
          input.body,
          ctx.tenant!.id,
          ctx.user!.id,
          ctx.user!.name || ctx.user!.email || null,
        );
      }),
  }),

  togglePortalVisible: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const msg = await inboxDb.getInboxMessageById(input.id, ctx.tenant!.id);
      if (!msg) throw new TRPCError({ code: "NOT_FOUND" });
      await inboxDb.updateInboxMessage(input.id, { portalVisible: !msg.portalVisible }, ctx.tenant!.id);
      return { portalVisible: !msg.portalVisible };
    }),

  unreadCount: protectedProcedure
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return inboxDb.getUnreadCount(input?.userId, ctx.tenant!.id);
    }),

  // ─── Assignment ───────────────────────────────────────────────────────────

  assign: protectedProcedure
    .input(z.object({
      messageId: z.number(),
      assignedToId: z.number().nullable(),
      assignedToName: z.string().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await inboxDb.assignMessage(input.messageId, input.assignedToId, input.assignedToName, ctx.tenant!.id);

      // Send notification to assigned user (email + push)
      if (input.assignedToId && input.assignedToId !== ctx.user!.id) {
        const msg = await inboxDb.getInboxMessageById(input.messageId, ctx.tenant!.id);
        if (msg) {
          const staff = await inboxDb.listStaffUsers(ctx.tenant!.id);
          const assignee = staff.find(u => u.id === input.assignedToId);
          if (assignee?.email) {
            try {
              await sendNotificationEmail({
                to: assignee.email,
                subject: `Inbox: You've been assigned an email — ${msg.subject || "(no subject)"}`,
                htmlBody: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #1e293b;">New Inbox Assignment</h2>
                    <p>${ctx.user!.name || "A team member"} has assigned you an email in the Shared Inbox.</p>
                    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                      <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">From:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${msg.fromName || msg.fromAddress}</td></tr>
                      <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Subject:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${msg.subject || "(no subject)"}</td></tr>
                    </table>
                    <p>Please log in to review and respond.</p>
                  </div>
                `,
                fromName: "Altaspan Inbox",
                settingKey: "task_assignment_email",
              });
            } catch (err: any) {
              console.error("[Inbox] Assignment notification failed:", err?.message);
            }
          }
          // Also send push notification
          sendTaskAssignmentNotification({
            section: "Inbox",
            taskTitle: msg.subject || "(no subject)",
            assignedToUserId: input.assignedToId,
            assignedByName: ctx.user!.name || "A team member",
          }).catch(err => console.error("[Inbox] Push notification failed:", err?.message));
        }
      }

      return { success: true };
    }),

  assignThread: protectedProcedure
    .input(z.object({
      threadId: z.string(),
      assignedToId: z.number().nullable(),
      assignedToName: z.string().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await inboxDb.assignThread(input.threadId, input.assignedToId, input.assignedToName, ctx.tenant!.id);

      if (input.assignedToId && input.assignedToId !== ctx.user!.id) {
        const messages = await inboxDb.getThreadMessages(input.threadId, ctx.tenant!.id);
        const latest = messages[messages.length - 1];
        if (latest) {
          const staff = await inboxDb.listStaffUsers(ctx.tenant!.id);
          const assignee = staff.find(u => u.id === input.assignedToId);
          if (assignee?.email) {
            try {
              await sendNotificationEmail({
                to: assignee.email,
                subject: `Inbox: You've been assigned a ticket — ${latest.subject || "(no subject)"}`,
                htmlBody: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #1e293b;">New Inbox Ticket Assignment</h2>
                    <p>${ctx.user!.name || "A team member"} has assigned you an inbox ticket.</p>
                    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                      <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">From:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${latest.fromName || latest.fromAddress}</td></tr>
                      <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Subject:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${latest.subject || "(no subject)"}</td></tr>
                    </table>
                    <p>Please log in to review and respond.</p>
                  </div>
                `,
                fromName: "Altaspan Inbox",
                settingKey: "task_assignment_email",
              });
            } catch (err: any) {
              console.error("[Inbox] Ticket assignment notification failed:", err?.message);
            }
          }
          sendTaskAssignmentNotification({
            section: "Inbox",
            taskTitle: latest.subject || "(no subject)",
            assignedToUserId: input.assignedToId,
            assignedByName: ctx.user!.name || "A team member",
          }).catch(err => console.error("[Inbox] Push notification failed:", err?.message));
        }
      }

      return { success: true };
    }),

  staffUsers: protectedProcedure.query(async ({ ctx }) => {
    return inboxDb.listStaffUsers(ctx.tenant!.id);
  }),

  // ─── Contact Search (for recipient autocomplete) ────────────────────────────
  searchContacts: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const q = `%${input.query}%`;
      const results: Array<{ name: string; email: string; type: string }> = [];
      // Search CRM Leads
      const leads = await db.select({
        name: sql<string>`CONCAT(COALESCE(${crmLeads.contactFirstName}, ''), ' ', COALESCE(${crmLeads.contactLastName}, ''))`,
        email: crmLeads.contactEmail,
        company: crmLeads.company,
      }).from(crmLeads).where(
        and(
          eq(crmLeads.tenantId, ctx.tenant!.id),
          or(
            like(crmLeads.contactEmail, q),
            like(crmLeads.contactFirstName, q),
            like(crmLeads.contactLastName, q),
            like(crmLeads.company, q)
          )
        )
      ).limit(10);
      for (const l of leads) {
        if (l.email) results.push({ name: (l.name || "").trim() || l.company || "Lead", email: l.email, type: "lead" });
      }
      // Search Trades (constructionInstallers)
      const trades = await db.select({
        name: constructionInstallers.name,
        email: constructionInstallers.email,
      }).from(constructionInstallers).where(
        and(
          eq(constructionInstallers.tenantId, ctx.tenant!.id),
          or(
            like(constructionInstallers.email, q),
            like(constructionInstallers.name, q)
          )
        )
      ).limit(10);
      for (const t of trades) {
        if (t.email) results.push({ name: t.name, email: t.email, type: "trade" });
      }
      // Search Suppliers
      const supps = await db.select({
        name: suppliers.name,
        contactName: suppliers.contactName,
        email: suppliers.email,
      }).from(suppliers).where(
        and(
          eq(suppliers.tenantId, ctx.tenant!.id),
          or(
            like(suppliers.email, q),
            like(suppliers.name, q),
            like(suppliers.contactName, q)
          )
        )
      ).limit(10);
      for (const s of supps) {
        if (s.email) results.push({ name: s.contactName || s.name, email: s.email, type: "supplier" });
      }
      // Deduplicate by email
      const seen = new Set<string>();
      return results.filter(r => {
        if (seen.has(r.email.toLowerCase())) return false;
        seen.add(r.email.toLowerCase());
        return true;
      }).slice(0, 20);
    }),

  // ─── Reply / Send ─────────────────────────────────────────────────────────

  reply: protectedProcedure
    .input(z.object({
      inReplyToMessageId: z.number(),
      htmlBody: z.string(),
      textBody: z.string().optional(),
      includeSignature: z.boolean().optional(),
      signatureId: z.number().optional(),
      includeRateUs: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const originalMsg = await inboxDb.getInboxMessageById(input.inReplyToMessageId, ctx.tenant!.id);
      if (!originalMsg) throw new TRPCError({ code: "NOT_FOUND", message: "Original message not found" });

      // Build the full HTML body with optional signature
      let fullHtml = input.htmlBody;

      if (input.includeSignature) {
        let signature: any = null;
        if (input.signatureId) {
          const sigs = await inboxDb.getUserSignatures(ctx.user!.id, ctx.tenant!.id);
          signature = sigs.find(s => s.id === input.signatureId);
        } else {
          signature = await inboxDb.getDefaultSignature(ctx.user!.id, ctx.tenant!.id);
        }
        if (signature) {
          fullHtml += `<br/><div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">${signature.htmlContent}</div>`;
        }
      }

      // Add rate-us feedback if enabled
      if (input.includeRateUs) {
        const rateUsEnabled = await inboxDb.getSetting("rate_us_enabled", ctx.tenant!.id);
        if (rateUsEnabled === "true") {
          const rateUsPrompt = await inboxDb.getSetting("rate_us_prompt", ctx.tenant!.id) || "How would you rate our service?";
          const baseUrl = ctx.req.headers.origin || "";
          const feedbackHtml = buildRateUsHtml(baseUrl, input.inReplyToMessageId, rateUsPrompt);
          fullHtml += feedbackHtml;
        }
      }

      // Determine reply-from address: match the address the original was sent to
      const fromDomain = await getTenantSenderDomain(ctx.tenant!.id);
      const userName = ctx.user!.name || "Altaspan Team";
      let replyFromEmail = `onboarding@${fromDomain}`;
      if (originalMsg.receivedByAddress) {
        // Use the address the original email was received at
        const addrRule = await inboxDb.getInboxAddressByEmail(originalMsg.receivedByAddress, ctx.tenant!.id);
        if (addrRule) {
          replyFromEmail = addrRule.address;
        } else {
          replyFromEmail = originalMsg.receivedByAddress;
        }
      }
      const tenantInboxAddresses = await inboxDb.listInboxAddresses(false, ctx.tenant!.id);
      const internalAddresses = new Set(
        [
          replyFromEmail,
          originalMsg.receivedByAddress,
          ...tenantInboxAddresses.map((address) => address.address),
        ]
          .filter(Boolean)
          .map((address) => String(address).toLowerCase()),
      );
      const toAddress = resolveReplyRecipient(originalMsg, internalAddresses);
      if (!toAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not determine a valid reply recipient for this ticket.",
        });
      }
      const subject = originalMsg.subject?.startsWith("Re:") ? originalMsg.subject : `Re: ${originalMsg.subject || "(no subject)"}`;
      const existingTicket = await inboxDb.getTicketByThread(originalMsg.threadId, ctx.tenant!.id);
      const replyAssigneeId = existingTicket?.assignedToId ?? originalMsg.assignedToId ?? ctx.user!.id;
      const replyAssigneeName = existingTicket?.assignedToName ?? originalMsg.assignedToName ?? userName;
      const replyAssignedAt = existingTicket?.assignedAt ?? originalMsg.assignedAt ?? new Date();
      fullHtml = appendInboxThreadMarkerHtml(fullHtml, originalMsg.threadId);

      // Send via unified O365 email service.
      const sendResult = await sendUnifiedEmail({
        fromAddress: replyFromEmail,
        fromName: userName,
        to: [toAddress],
        subject,
        htmlBody: fullHtml,
        textBody: input.textBody || undefined,
        inReplyTo: originalMsg.messageId || undefined,
        references: [originalMsg.emailReferences, originalMsg.messageId].filter(Boolean).join(" ") || undefined,
        replyToGraphMessageId: originalMsg.graphMessageId || undefined,
        tenantId: ctx.tenant!.id,
      });
      if (!sendResult.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to send reply: ${sendResult.error}` });
      }

      // Store the outbound message
      const fromAddress = `${userName} <${replyFromEmail}>`;
      const { id: replyId } = await inboxDb.createInboxMessage({
        tenantId: ctx.tenant!.id,
        threadId: originalMsg.threadId,
        direction: "outbound",
        resendEmailId: sendResult.emailId || null,
        messageId: null,
        inReplyTo: originalMsg.messageId,
        emailReferences: [originalMsg.emailReferences, originalMsg.messageId].filter(Boolean).join(" ") || null,
        fromAddress: fromAddress,
        fromName: userName,
        toAddresses: JSON.stringify([toAddress]),
        receivedByAddress: replyFromEmail,
        subject,
        htmlBody: fullHtml,
        textBody: input.textBody || null,
        matchedJobId: originalMsg.matchedJobId,
        matchedLeadId: originalMsg.matchedLeadId,
        matchedClientEmail: originalMsg.matchedClientEmail,
        status: "replied",
        isRead: true,
        isStarred: false,
        portalVisible: false,
        autoReplySent: false,
        assignedToId: replyAssigneeId,
        assignedToName: replyAssigneeName,
        assignedAt: replyAssignedAt,
        createdBy: ctx.user!.id,
        createdByName: userName,
      });

      // Mark original as replied
      await inboxDb.updateInboxMessage(originalMsg.id, { status: "replied" }, ctx.tenant!.id);

      return { success: true, replyId, provider: sendResult.provider, emailId: sendResult.emailId };
    }),

  compose: protectedProcedure
    .input(z.object({
      toAddress: z.string().email(),
      ccAddresses: z.array(z.string().email()).optional(),
      subject: z.string(),
      htmlBody: z.string(),
      textBody: z.string().optional(),
      includeSignature: z.boolean().optional(),
      signatureId: z.number().optional(),
      includeRateUs: z.boolean().optional(),
      matchedJobId: z.number().optional(),
      matchedLeadId: z.number().optional(),
      fromAddressId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      let fullHtml = input.htmlBody;

      if (input.includeSignature) {
        let signature: any = null;
        if (input.signatureId) {
          const sigs = await inboxDb.getUserSignatures(ctx.user!.id, ctx.tenant!.id);
          signature = sigs.find(s => s.id === input.signatureId);
        } else {
          signature = await inboxDb.getDefaultSignature(ctx.user!.id, ctx.tenant!.id);
        }
        if (signature) {
          fullHtml += `<br/><div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">${signature.htmlContent}</div>`;
        }
      }

      // Rate Us placeholder - will be replaced with actual content before sending
      let includeRateUsInEmail = false;
      if (input.includeRateUs) {
        const rateUsEnabled = await inboxDb.getSetting("rate_us_enabled", ctx.tenant!.id);
        if (rateUsEnabled === "true") {
          includeRateUsInEmail = true;
        }
      }

      const fromDomain = await getTenantSenderDomain(ctx.tenant!.id);
      const userName = ctx.user!.name || "Altaspan Team";
      // For compose, use the selected from address or default
      let composeFromEmail = `onboarding@${fromDomain}`;
      if (input.fromAddressId) {
        const addresses = await inboxDb.listInboxAddresses(true, ctx.tenant!.id);
        const addr = addresses.find(a => a.id === input.fromAddressId);
        if (addr) composeFromEmail = addr.address;
      }
      // First, create the DB record to get a message ID for the Rate Us link
      const threadId = `thread-${crypto.randomUUID()}`;
      const fromAddress = `${userName} <${composeFromEmail}>`;
      const { id: msgId } = await inboxDb.createInboxMessage({
        tenantId: ctx.tenant!.id,
        threadId,
        direction: "outbound",
        resendEmailId: null,
        fromAddress,
        fromName: userName,
        toAddresses: JSON.stringify([input.toAddress, ...(input.ccAddresses || [])]),
        receivedByAddress: composeFromEmail,
        subject: input.subject,
        htmlBody: fullHtml,
        textBody: input.textBody || null,
        matchedJobId: input.matchedJobId || null,
        matchedLeadId: input.matchedLeadId || null,
        status: "open",
        isRead: true,
        isStarred: false,
        portalVisible: false,
        autoReplySent: false,
        assignedToId: ctx.user!.id,
        assignedToName: userName,
        assignedAt: new Date(),
        createdBy: ctx.user!.id,
        createdByName: userName,
      });

      // Now build Rate Us HTML with the actual message ID and append to email body
      if (includeRateUsInEmail) {
        const rateUsPrompt = await inboxDb.getSetting("rate_us_prompt", ctx.tenant!.id) || "How would you rate our service?";
        const baseUrl = ctx.req.headers.origin || "";
        const feedbackHtml = buildRateUsHtml(baseUrl, msgId, rateUsPrompt);
        fullHtml += feedbackHtml;
      }
      fullHtml = appendInboxThreadMarkerHtml(fullHtml, threadId);

      // Send via unified O365 email service.
      const sendResult = await sendUnifiedEmail({
        fromAddress: composeFromEmail,
        fromName: userName,
        to: [input.toAddress],
        cc: input.ccAddresses && input.ccAddresses.length > 0 ? input.ccAddresses : undefined,
        subject: input.subject,
        htmlBody: fullHtml,
        textBody: input.textBody || undefined,
        tenantId: ctx.tenant!.id,
      });

      if (!sendResult.success) {
        // Still saved as draft in DB, just mark it
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to send email: ${sendResult.error}` });
      }

      // Update the DB record with final HTML and email ID
      await inboxDb.updateInboxMessage(msgId, {
        htmlBody: fullHtml,
        resendEmailId: sendResult.emailId || null,
      }, ctx.tenant!.id);

      return { success: true, messageId: msgId, provider: sendResult.provider, emailId: sendResult.emailId };
    }),

  syncNow: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { syncTenantMailboxes } = await import("./email/msgraph-sync");
      const results = await syncTenantMailboxes(ctx.tenant!.id);
      const newMessages = results.reduce((sum, item) => sum + item.newMessages, 0);
      const errors = results.flatMap((item) => item.errors.map((error) => `${item.mailbox}: ${error}`));
      return { success: errors.length === 0, newMessages, errors, results };
    }),

  // ─── Tags ─────────────────────────────────────────────────────────────────

  tags: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return inboxDb.listTags(ctx.tenant!.id);
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        color: z.string().max(20).optional(),
        description: z.string().max(255).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return inboxDb.createTag({
          tenantId: ctx.tenant!.id,
          name: input.name,
          color: input.color || "#6b7280",
          description: input.description || null,
          sortOrder: input.sortOrder || 0,
          active: true,
        });
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().max(20).optional(),
        description: z.string().max(255).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await inboxDb.updateTag(id, data, ctx.tenant!.id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.deleteTag(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    addToMessage: protectedProcedure
      .input(z.object({ messageId: z.number(), tagId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.addTagToMessage(input.messageId, input.tagId, ctx.tenant!.id);
        return { success: true };
      }),

    removeFromMessage: protectedProcedure
      .input(z.object({ messageId: z.number(), tagId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.removeTagFromMessage(input.messageId, input.tagId, ctx.tenant!.id);
        return { success: true };
      }),

    getForMessage: protectedProcedure
      .input(z.object({ messageId: z.number() }))
      .query(async ({ input, ctx }) => {
        return inboxDb.getMessageTags(input.messageId, ctx.tenant!.id);
      }),
  }),

  // ─── Signatures ───────────────────────────────────────────────────────────

  signatures: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return inboxDb.getUserSignatures(ctx.user!.id, ctx.tenant!.id);
    }),

    getDefault: protectedProcedure.query(async ({ ctx }) => {
      return inboxDb.getDefaultSignature(ctx.user!.id, ctx.tenant!.id);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        htmlContent: z.string(),
        isDefault: z.boolean().optional(),
        schedule: z.enum(["always", "business_hours", "out_of_office"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return inboxDb.upsertSignature({
          tenantId: ctx.tenant!.id,
          userId: ctx.user!.id,
          name: input.name,
          htmlContent: input.htmlContent,
          isDefault: input.isDefault || false,
          schedule: input.schedule || "always",
        }, ctx.tenant!.id);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        htmlContent: z.string().optional(),
        isDefault: z.boolean().optional(),
        schedule: z.enum(["always", "business_hours", "out_of_office"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await inboxDb.updateSignature(id, ctx.user!.id, data, ctx.tenant!.id);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.deleteSignature(input.id, ctx.user!.id, ctx.tenant!.id);
        return { success: true };
      }),

    sendTestEmail: protectedProcedure
      .input(z.object({
        signatureId: z.number().optional(),
        signatureHtml: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Get the signature HTML - either from provided HTML or by ID
        let signatureHtml = input.signatureHtml || "";
        if (!signatureHtml && input.signatureId) {
          const sigs = await inboxDb.getUserSignatures(ctx.user!.id, ctx.tenant!.id);
          const sig = sigs.find(s => s.id === input.signatureId);
          if (sig) signatureHtml = sig.htmlContent;
        }
        if (!signatureHtml) {
          const defaultSig = await inboxDb.getDefaultSignature(ctx.user!.id, ctx.tenant!.id);
          if (defaultSig) signatureHtml = defaultSig.htmlContent;
        }
        if (!signatureHtml) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No signature found to test" });
        }

        const userEmail = ctx.user!.email;
        if (!userEmail) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No email address found for your account" });
        }

        // Build a sample email body with the signature
        const testBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #1a1a1a;">
            <p>Hi ${ctx.user!.name || "there"},</p>
            <p>This is a test email to preview how your email signature renders in your email client.</p>
            <p>If the signature below looks correct, you're all set. If not, you can edit it from your Profile page or the Inbox Admin Settings.</p>
            <p>Regards,<br/>AltaSpan Signature Tester</p>
            <br/>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              ${signatureHtml}
            </div>
          </div>
        `;

        // Send via unified email service
        const fromDomain = await getTenantSenderDomain(ctx.tenant!.id);
        const sendResult = await sendUnifiedEmail({
          fromAddress: `noreply@${fromDomain}`,
          fromName: "Signature Test",
          to: [userEmail],
          subject: "[Test] Email Signature Preview",
          htmlBody: testBody,
          tenantId: ctx.tenant!.id,
        });

        if (!sendResult.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to send test email: ${sendResult.error}` });
        }

        return { success: true, sentTo: userEmail };
      }),
  }),

  // ─── Admin Settings ───────────────────────────────────────────────────────

  settings: router({
    getAll: adminProcedure.query(async ({ ctx }) => {
      return inboxDb.getAllSettings(ctx.tenant!.id);
    }),

    update: adminProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.setSetting(input.key, input.value, ctx.user!.id, ctx.tenant!.id);
        return { success: true };
      }),

    updateBatch: adminProcedure
      .input(z.array(z.object({
        key: z.string(),
        value: z.string(),
      })))
      .mutation(async ({ input, ctx }) => {
        for (const { key, value } of input) {
          await inboxDb.setSetting(key, value, ctx.user!.id, ctx.tenant!.id);
        }
        return { success: true };
      }),

    getCompanySignature: adminProcedure.query(async ({ ctx }) => {
      return inboxDb.getCompanyDefaultSignature(ctx.tenant!.id);
    }),

    setCompanySignature: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        htmlContent: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.setCompanyDefaultSignature(input.name, input.htmlContent, ctx.user!.id, ctx.tenant!.id);
        return { success: true };
      }),

    deleteCompanySignature: adminProcedure
      .mutation(async ({ ctx }) => {
        await inboxDb.setSetting("company_default_signature", "", ctx.user!.id, ctx.tenant!.id);
        return { success: true };
      }),

    duplicateSignatureToAll: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        htmlContent: z.string().min(1),
        forceAll: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return inboxDb.duplicateCompanySignatureToUsers(input.name, input.htmlContent, input.forceAll || false, ctx.tenant!.id);
      }),

    signatureAnalytics: adminProcedure.query(async ({ ctx }) => {
      return inboxDb.getSignatureAnalytics(ctx.tenant!.id);
    }),
  }),

  // ─── SLA Rules ────────────────────────────────────────────────────────────

  // ─── Inbox Addresses ──────────────────────────────────────────────────────

  addresses: router({
    list: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return inboxDb.listInboxAddresses(input?.activeOnly !== false, ctx.tenant!.id);
      }),

    create: adminProcedure
      .input(z.object({
        address: z.string().min(1).max(320),
        displayName: z.string().min(1).max(100),
        description: z.string().max(255).optional(),
        provider: z.enum(["msgraph", "resend"]).optional(),
        module: z.enum(["sales", "construction", "approvals", "admin", "manufacturing", "support"]).nullable().optional(),
        defaultAssigneeId: z.number().nullable().optional(),
        defaultAssigneeName: z.string().nullable().optional(),
        autoTagIds: z.array(z.number()).optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return inboxDb.createInboxAddress({
          tenantId: ctx.tenant!.id,
          address: input.address,
          displayName: input.displayName,
          description: input.description || null,
          provider: input.provider || "msgraph",
          module: input.module || null,
          defaultAssigneeId: input.defaultAssigneeId || null,
          defaultAssigneeName: input.defaultAssigneeName || null,
          autoTagIds: input.autoTagIds || null,
          active: true,
          sortOrder: input.sortOrder || 0,
        } as any);
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        address: z.string().min(1).max(320).optional(),
        displayName: z.string().min(1).max(100).optional(),
        description: z.string().max(255).optional(),
        provider: z.enum(["msgraph", "resend"]).optional(),
        module: z.enum(["sales", "construction", "approvals", "admin", "manufacturing", "support"]).nullable().optional(),
        defaultAssigneeId: z.number().nullable().optional(),
        defaultAssigneeName: z.string().nullable().optional(),
        autoTagIds: z.array(z.number()).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await inboxDb.updateInboxAddress(id, data as any, ctx.tenant!.id);
        return { success: true };
      }),

    // Trigger manual sync for a specific Graph mailbox
    syncNow: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { syncMailboxById } = await import("./email/msgraph-sync");
        const result = await syncMailboxById(input.id, ctx.tenant!.id);
        return result;
      }),

    // Reset sync state (forces full re-sync on next poll)
    resetSync: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { resetMailboxSync } = await import("./email/msgraph-sync");
        await resetMailboxSync(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await inboxDb.deleteInboxAddress(input.id, ctx.tenant!.id);
        return { success: true };
      }),
  }),

  sla: router({
    list: adminProcedure.query(async ({ ctx }) => {
      return inboxDb.listSlaRules(ctx.tenant!.id);
    }),

    getActive: protectedProcedure.query(async ({ ctx }) => {
      return inboxDb.getActiveSlaRule(ctx.tenant!.id);
    }),

    upsert: adminProcedure
      .input(z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(100),
        warningHours: z.number().min(1).max(720),
        escalationHours: z.number().min(1).max(720),
        reminderTargets: z.string(),
        managerEmail: z.string().email().nullable().optional(),
        active: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        return inboxDb.upsertSlaRule(input, ctx.tenant!.id);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await inboxDb.deleteSlaRule(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    breaching: protectedProcedure.query(async ({ ctx }) => {
      return inboxDb.getMessagesBreachingSla(ctx.tenant!.id);
    }),
  }),
});

// ─── Rate Us HTML Builder ───────────────────────────────────────────────────

async function getTenantSenderDomain(tenantId: number): Promise<string> {
  const configuredDomain = await inboxDb.getSetting("receiving_domain", tenantId);
  if (configuredDomain) return configuredDomain;

  const emailConfig = await getTenantEmailConfig(tenantId);
  const senderAddress = emailConfig.senderAddress || "support@commissogroup.au";
  return senderAddress.split("@")[1] || "commissogroup.au";
}

function buildRateUsHtml(baseUrl: string, messageId: number, prompt: string): string {
  const stars = [1, 2, 3, 4, 5];
  const starLinks = stars.map(rating => {
    const url = `${baseUrl}/api/inbox/feedback?messageId=${messageId}&rating=${rating}`;
    const color = rating <= 2 ? "#ef4444" : rating === 3 ? "#f59e0b" : "#22c55e";
    return `<a href="${url}" style="text-decoration: none; font-size: 28px; color: ${color}; padding: 0 4px;">★</a>`;
  }).join("");

  return `
    <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; text-align: center;">
      <p style="color: #475569; margin: 0 0 8px 0; font-size: 14px;">${prompt}</p>
      <div>${starLinks}</div>
    </div>
  `;
}
