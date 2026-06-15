/**
 * Inbox Inbound Webhook
 * Handles legacy Resend email.received events for the Shared Inbox.
 * Current primary inbound email path is Microsoft Graph mailbox sync.
 * Also provides the SLA check endpoint for the heartbeat cron.
 */
import type { Express, Request, Response } from "express";
import { Resend } from "resend";
import { sdk } from "./_core/sdk";
import {
  createInboxMessage,
  matchEmailToClient,
  createEmailActivity,
  updateInboxMessage,
  getSetting,
  getMessagesBreachingSla,
  getActiveSlaRule,
  getInboxMessageById,
  matchReceivingAddress,
  addTagToMessage,
} from "./inbox-db";
import { sendNotificationEmail } from "./email";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { sendPushToAllUsers } from "./push";
import { findRfiBySubjectMatch, updateRfi } from "./approval-db";

let legacyResendClient: Resend | null | undefined;

function getLegacyResendClient() {
  if (legacyResendClient !== undefined) return legacyResendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    legacyResendClient = null;
    return null;
  }

  legacyResendClient = new Resend(apiKey);
  return legacyResendClient;
}

/**
 * Generate a thread ID from email headers or create a new one.
 */
function deriveThreadId(messageId?: string, inReplyTo?: string, references?: string): string {
  // If this is a reply, use the original message-id as thread root
  if (references) {
    const refs = references.trim().split(/\s+/);
    return refs[0]; // first reference is the thread root
  }
  if (inReplyTo) return inReplyTo;
  if (messageId) return messageId;
  return `thread-${crypto.randomUUID()}`;
}

/**
 * Fetch full email details from Resend Received Emails API
 */
async function fetchReceivedEmail(emailId: string) {
  try {
    const resend = getLegacyResendClient();
    if (!resend) {
      console.warn("[Inbox] Legacy Resend inbound requested without RESEND_API_KEY; using webhook payload only.");
      return null;
    }
    const { data, error } = await resend.emails.receiving.get(emailId);
    if (error) {
      console.error("[Inbox] Failed to fetch received email:", error);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error("[Inbox] Exception fetching received email:", err?.message);
    return null;
  }
}

/**
 * Fetch and store attachments from a received email to S3
 */
async function processAttachments(emailId: string): Promise<Array<{ id: string; filename: string; contentType: string; size: number; url: string }>> {
  try {
    const resend = getLegacyResendClient();
    if (!resend) return [];
    const { data: attachmentList, error } = await resend.emails.receiving.attachments.list({ emailId });
    if (error || !attachmentList || !(attachmentList as any).data?.length) return [];

    const attachments: Array<{ id: string; filename: string; contentType: string; size: number; url: string }> = [];
    const items = (attachmentList as any).data || [];

    for (const att of items) {
      try {
        const { data: attData } = await resend.emails.receiving.attachments.get(att.id);
        if (attData && (attData as any).content) {
          const buffer = Buffer.from((attData as any).content, "base64");
          const suffix = crypto.randomUUID().slice(0, 8);
          const key = `inbox-attachments/${emailId}/${suffix}-${att.filename || "attachment"}`;
          const { url } = await storagePut(key, buffer, att.content_type || "application/octet-stream");
          attachments.push({
            id: att.id,
            filename: att.filename || "attachment",
            contentType: att.content_type || "application/octet-stream",
            size: buffer.length,
            url,
          });
        }
      } catch (attErr: any) {
        console.error(`[Inbox] Failed to process attachment ${att.id}:`, attErr?.message);
      }
    }
    return attachments;
  } catch (err: any) {
    console.error("[Inbox] Exception processing attachments:", err?.message);
    return [];
  }
}

/**
 * Send auto-reply acknowledgement email
 */
async function sendAutoReply(params: {
  toEmail: string;
  toName: string | null;
  originalSubject: string;
  threadMessageId: string;
  inboxMessageId: number;
  tenantId?: number | null;
}) {
  const template = await getSetting("auto_reply_template");
  if (!template) return; // auto-reply disabled

  const fromDomain = await getSetting("receiving_domain") || "commissogroup.au";
  const companyName = await getSetting("company_name") || "Altaspan";

  const greeting = params.toName ? `Hi ${params.toName}` : "Hi";
  const body = template
    .replace(/\{\{greeting\}\}/g, greeting)
    .replace(/\{\{company\}\}/g, companyName)
    .replace(/\{\{subject\}\}/g, params.originalSubject || "(no subject)");

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      ${body}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #64748b; font-size: 12px;">This is an automated acknowledgement from ${companyName}.</p>
    </div>
  `;

  try {
    const result = await sendNotificationEmail({
      tenantId: params.tenantId,
      to: params.toEmail,
      subject: `Re: ${params.originalSubject || "(no subject)"}`,
      htmlBody,
      fromName: companyName,
    });
    if (result.success) {
      await updateInboxMessage(params.inboxMessageId, { autoReplySent: true }, params.tenantId);
      console.log(`[Inbox] Auto-reply sent to ${params.toEmail}`);
    }
  } catch (err: any) {
    console.error("[Inbox] Auto-reply failed:", err?.message);
  }
}

/**
 * Send SLA escalation reminder email
 */
async function sendSlaReminder(params: {
  messageId: number;
  subject: string;
  fromEmail: string;
  slaLevel: "warning" | "escalation";
  assignedToEmail?: string | null;
  managerEmail?: string | null;
}) {
  const recipients: string[] = [];
  if (params.assignedToEmail) recipients.push(params.assignedToEmail);
  if (params.slaLevel === "escalation" && params.managerEmail) recipients.push(params.managerEmail);
  if (recipients.length === 0) return;

  const levelLabel = params.slaLevel === "escalation" ? "ESCALATION" : "WARNING";
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: ${params.slaLevel === "escalation" ? "#dc2626" : "#ca8a04"};">[${levelLabel}] Inbox Message Requires Attention</h2>
      <p>An inbound email has not received a reply within the expected timeframe.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">From:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${params.fromEmail}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Subject:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${params.subject || "(no subject)"}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Message ID:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">#${params.messageId}</td></tr>
      </table>
      <p>Please log in to the Inbox to review and respond to this message.</p>
    </div>
  `;

  for (const to of recipients) {
    try {
      await sendNotificationEmail({
        to,
        subject: `[${levelLabel}] Inbox: ${params.subject || "No subject"} — requires reply`,
        htmlBody,
        fromName: "Altaspan Inbox",
      });
      console.log(`[Inbox SLA] ${levelLabel} reminder sent to ${to} for message #${params.messageId}`);
    } catch (err: any) {
      console.error(`[Inbox SLA] Failed to send reminder to ${to}:`, err?.message);
    }
  }
}

export function registerInboxWebhooks(app: Express) {
  // ─── Inbound Email Webhook ──────────────────────────────────────────────
  app.post("/api/resend/inbound", async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      if (!payload || !payload.type || !payload.data) {
        console.log("[Inbox Webhook] Invalid payload");
        return res.status(400).json({ error: "Invalid payload" });
      }

      const { type, data } = payload;
      console.log(`[Inbox Webhook] Received event: ${type}`);

      if (type !== "email.received") {
        return res.json({ received: true, skipped: "not email.received" });
      }

      const emailId = data.email_id;
      if (!emailId) {
        return res.status(400).json({ error: "Missing email_id" });
      }

      const initialToArray = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
      const initialAddressRule = await matchReceivingAddress(initialToArray);
      let tenantId = initialAddressRule?.tenantId || null;

      // Fetch full email details from Resend
      const fullEmail = await fetchReceivedEmail(emailId);
      const fromAddress = (fullEmail as any)?.from || data.from || "";
      const fromName = (fullEmail as any)?.from_name || null;
      const toAddresses = (fullEmail as any)?.to || data.to || [];
      const ccAddresses = (fullEmail as any)?.cc || [];
      const subject = (fullEmail as any)?.subject || data.subject || "";
      const htmlBody = (fullEmail as any)?.html || null;
      const textBody = (fullEmail as any)?.text || data.text || null;
      const emailMessageId = (fullEmail as any)?.message_id || null;
      const inReplyTo = (fullEmail as any)?.in_reply_to || null;
      const emailReferences = (fullEmail as any)?.references || null;

      const toArray = Array.isArray(toAddresses) ? toAddresses : [toAddresses];
      const addressRule = initialAddressRule || await matchReceivingAddress(toArray);
      tenantId = addressRule?.tenantId || tenantId;

      // Process attachments
      const attachments = await processAttachments(emailId);

      // Derive thread ID
      const threadId = deriveThreadId(emailMessageId, inReplyTo, emailReferences);

      // Auto-route to client/job
      const match = await matchEmailToClient(fromAddress, tenantId);
      const receivedByAddress = addressRule?.address || (toArray[0] || null);

      // Create inbox message
      const { id: inboxMsgId } = await createInboxMessage({
        tenantId,
        threadId,
        direction: "inbound",
        resendEmailId: emailId,
        messageId: emailMessageId,
        inReplyTo,
        emailReferences,
        fromAddress,
        fromName,
        toAddresses: JSON.stringify(toArray),
        ccAddresses: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
        receivedByAddress,
        subject,
        htmlBody,
        textBody,
        attachments: attachments.length > 0 ? attachments : null,
        matchedJobId: match?.matchedJobId || null,
        matchedLeadId: match?.matchedLeadId || null,
        matchedClientEmail: match?.matchedClientEmail || null,
        assignedToId: addressRule?.defaultAssigneeId || null,
        assignedToName: addressRule?.defaultAssigneeName || null,
        assignedAt: addressRule?.defaultAssigneeId ? new Date() : null,
        status: "new",
        isRead: false,
        isStarred: false,
        portalVisible: false,
        autoReplySent: false,
      });

      // Apply auto-tags from address rule
      if (addressRule?.autoTagIds) {
        const tagIds = Array.isArray(addressRule.autoTagIds) ? addressRule.autoTagIds : [];
        for (const tagId of tagIds) {
          try { await addTagToMessage(inboxMsgId, tagId as number); } catch { /* ignore duplicates */ }
        }
      }

      // Auto-create activity on matched client
      let activityId: number | null = null;
      if (match?.matchedJobId) {
        const snippet = textBody?.slice(0, 500) || "";
        const activity = await createEmailActivity({
          jobId: match.matchedJobId,
          leadId: match.matchedLeadId,
          subject,
          fromEmail: fromAddress,
          snippet,
          inboxMessageId: inboxMsgId,
        });
        if (activity) {
          activityId = activity.id;
          await updateInboxMessage(inboxMsgId, { activityId }, tenantId);
        }
      }

      // Send auto-reply if configured
      const autoReplyEnabled = await getSetting("auto_reply_enabled");
      if (autoReplyEnabled === "true") {
        await sendAutoReply({
          toEmail: fromAddress,
          toName: fromName,
          originalSubject: subject,
          threadMessageId: emailMessageId || threadId,
          inboxMessageId: inboxMsgId,
          tenantId,
        });
      }

      // Notify owner of new inbound email
      try {
        await notifyOwner({
          title: `New Inbox Email from ${fromName || fromAddress}`,
          content: `Subject: ${subject || "(no subject)"}\n${match ? `Matched to: ${match.clientName || match.matchedClientEmail}` : "No client match found"}`,
        });
      } catch (notifyErr: any) {
        console.error("[Inbox] Owner notification failed:", notifyErr?.message);
      }

      // Send push notification to all staff users
      try {
        await sendPushToAllUsers({
          title: `New Email: ${fromName || fromAddress}`,
          body: subject || "(no subject)",
          icon: "/favicon.ico",
          url: "/inbox",
          tag: `inbox-${inboxMsgId}`,
        });
      } catch (pushErr: any) {
        console.error("[Inbox] Push notification failed:", pushErr?.message);
      }

      // ─── RFI Reply Ingestion ──────────────────────────────────────────────
      // If this inbound email subject matches an open RFI, auto-attach as response
      if (subject) {
        try {
          const matchedRfi = await findRfiBySubjectMatch(subject);
          if (matchedRfi) {
            // Build response notes from email body
            const replySnippet = textBody?.slice(0, 2000) || htmlBody?.replace(/<[^>]*>/g, "").slice(0, 2000) || "";
            const existingNotes = matchedRfi.responseNotes || "";
            const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
            const newNote = `\n\n--- Reply from ${fromName || fromAddress} (${timestamp}) ---\n${replySnippet}`;
            const updatedNotes = existingNotes + newNote;

            // Collect attachment URLs as response document references
            const existingDocIds = (matchedRfi.responseDocumentIds as number[] | null) || [];
            // Store attachment URLs in a metadata note since they're inbox attachments not approval documents
            const attachmentNote = attachments.length > 0
              ? `\n[Attachments: ${attachments.map(a => `${a.filename} (${a.url})`).join(", ")}]`
              : "";

            await updateRfi(matchedRfi.id, {
              responseNotes: updatedNotes + attachmentNote,
              status: matchedRfi.status === "open" || matchedRfi.status === "overdue" ? "in_progress" : matchedRfi.status,
              respondedAt: new Date(),
            });

            // Link the inbox message to the approval project via matchedJobId
            await updateInboxMessage(inboxMsgId, {
              matchedJobId: matchedRfi.projectId,
            }, tenantId);

            // Push notification about RFI response received
            await sendPushToAllUsers({
              title: `RFI Response Received`,
              body: `Reply to RFI #${matchedRfi.rfiNumber || matchedRfi.id}: ${matchedRfi.subject}`,
              icon: "/favicon.ico",
              url: `/approvals/projects/${matchedRfi.projectId}`,
              tag: `rfi-reply-${matchedRfi.id}`,
            });

            console.log(`[Inbox RFI] Auto-linked inbound email #${inboxMsgId} to RFI #${matchedRfi.rfiNumber || matchedRfi.id}`);
          }
        } catch (rfiErr: any) {
          console.error("[Inbox RFI] Reply ingestion error:", rfiErr?.message);
        }
      }

      console.log(`[Inbox Webhook] Stored inbound email #${inboxMsgId} from ${fromAddress} (thread: ${threadId}, match: ${match ? "yes" : "no"})`);
      return res.json({ received: true, messageId: inboxMsgId });
    } catch (err: any) {
      console.error("[Inbox Webhook] Error:", err?.message, err?.stack);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── Feedback Rating Endpoint (from rate-us link in emails) ─────────────
  app.get("/api/inbox/feedback", async (req: Request, res: Response) => {
    const { messageId, rating } = req.query;
    if (!messageId || !rating) {
      return res.status(400).send("Missing parameters");
    }
    const ratingNum = parseInt(rating as string, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).send("Invalid rating (1-5)");
    }
    try {
      const msg = await getInboxMessageById(parseInt(messageId as string, 10));
      if (!msg) return res.status(404).send("Message not found");
      await updateInboxMessage(msg.id, {
        feedbackRating: ratingNum,
        feedbackAt: new Date(),
      }, msg.tenantId);
      const stars = "★".repeat(ratingNum) + "☆".repeat(5 - ratingNum);
      res.send(`
        <html>
        <head><title>Thank you for your feedback</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 60px;">
          <h2>Thank you for your feedback!</h2>
          <p style="font-size: 32px; color: #f59e0b;">${stars}</p>
          <p>Your ${ratingNum}-star rating has been recorded. We appreciate your time.</p>
        </body>
        </html>
      `);
    } catch (err: any) {
      console.error("[Inbox Feedback] Error:", err?.message);
      res.status(500).send("Something went wrong");
    }
  });

  // ─── SLA Check Endpoint (for heartbeat cron) ───────────────────────────
  app.post("/api/scheduled/inbox-sla-check", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!(user as any).isCron && !(user as any).taskUid) {
        if ((user as any).role !== "admin") {
          return res.status(403).json({ error: "cron-only" });
        }
      }

      const rule = await getActiveSlaRule();
      if (!rule) {
        return res.json({ ok: true, skipped: "no active SLA rule" });
      }

      const breachingMessages = await getMessagesBreachingSla();
      if (breachingMessages.length === 0) {
        return res.json({ ok: true, checked: 0, reminders: 0 });
      }

      let remindersSent = 0;
      const targets: string[] = JSON.parse(rule.reminderTargets || '["assigned","manager"]');

      for (const msg of breachingMessages) {
        let assignedEmail: string | null = null;
        if (targets.includes("assigned") && msg.assignedToId) {
          // Look up the assigned user's email
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { users } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const [assignedUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, msg.assignedToId)).limit(1);
            assignedEmail = assignedUser?.email || null;
          }
        }

        await sendSlaReminder({
          messageId: msg.id,
          subject: msg.subject || "",
          fromEmail: msg.fromAddress,
          slaLevel: msg.slaLevel,
          assignedToEmail: assignedEmail,
          managerEmail: targets.includes("manager") ? rule.managerEmail : null,
        });
        remindersSent++;
      }

      return res.json({ ok: true, checked: breachingMessages.length, reminders: remindersSent });
    } catch (err: any) {
      console.error("[Inbox SLA Check] Error:", err?.message, err?.stack);
      return res.status(500).json({
        error: err?.message,
        stack: err?.stack,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
