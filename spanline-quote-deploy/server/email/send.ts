/**
 * Unified Email Sending Service
 * Routes outbound emails through the appropriate provider (Resend or Microsoft Graph)
 * based on the configured mailbox address.
 */
import { Resend } from "resend";
import * as msgraph from "./msgraph";
import { getDb } from "../db";
import { inboxAddresses } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logNotification, isNotificationEnabled } from "../notification-gateway";
import { ENV } from "../_core/env";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UnifiedSendParams {
  /** The "from" mailbox address (must be configured in inbox_addresses) */
  fromAddress?: string;
  /** Module context — used to auto-select the correct mailbox if fromAddress not specified */
  module?: "sales" | "construction" | "approvals" | "admin";
  /** Display name for the sender */
  fromName?: string;
  /** Recipient addresses */
  to: string[];
  cc?: string[];
  bcc?: string[];
  /** Email content */
  subject: string;
  htmlBody: string;
  textBody?: string;
  /** Attachments */
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    contentType?: string;
  }>;
  /** Threading */
  inReplyTo?: string;
  references?: string;
  /** Optional notification setting key for suppression check */
  settingKey?: string;
  /** Importance */
  importance?: "low" | "normal" | "high";
}

export interface SendResult {
  success: boolean;
  provider: "resend" | "msgraph" | "none";
  emailId?: string;
  error?: string;
}

// ─── Mailbox Resolution ────────────────────────────────────────────────────────

interface ResolvedMailbox {
  address: string;
  provider: "resend" | "msgraph";
  displayName: string;
}

/**
 * Resolve which mailbox to use for sending.
 * Priority: explicit fromAddress > module match > first active mailbox > fallback Resend
 */
async function resolveMailbox(fromAddress?: string, module?: string): Promise<ResolvedMailbox> {
  const db = await getDb();
  if (!db) {
    // Fallback to env-configured sender if DB unavailable
    return { address: ENV.emailSenderAddress || "support@commissogroup.au", provider: "msgraph", displayName: ENV.emailSenderName || "Altaspan" };
  }

  // If explicit address provided, look it up
  if (fromAddress) {
    const [addr] = await db.select()
      .from(inboxAddresses)
      .where(and(
        eq(inboxAddresses.address, fromAddress.toLowerCase()),
        eq(inboxAddresses.active, true)
      ));
    if (addr) {
      return {
        address: addr.address,
        provider: (addr as any).provider || "resend",
        displayName: addr.displayName,
      };
    }
  }

  // If module provided, find matching mailbox
  if (module) {
    const [addr] = await db.select()
      .from(inboxAddresses)
      .where(and(
        eq((inboxAddresses as any).module, module),
        eq(inboxAddresses.active, true)
      ));
    if (addr) {
      return {
        address: addr.address,
        provider: (addr as any).provider || "resend",
        displayName: addr.displayName,
      };
    }
  }

  // Fallback: first active msgraph mailbox, then resend
  const allAddresses = await db.select()
    .from(inboxAddresses)
    .where(eq(inboxAddresses.active, true));

  const graphAddr = allAddresses.find(a => (a as any).provider === "msgraph");
  if (graphAddr) {
    return {
      address: graphAddr.address,
      provider: "msgraph",
      displayName: graphAddr.displayName,
    };
  }

  // Ultimate fallback from env
  return { address: ENV.emailSenderAddress || "support@commissogroup.au", provider: "msgraph", displayName: ENV.emailSenderName || "Altaspan" };
}

// ─── Send via Provider ─────────────────────────────────────────────────────────

async function sendViaResend(params: UnifiedSendParams, mailbox: ResolvedMailbox): Promise<SendResult> {
  const fromDisplay = params.fromName || mailbox.displayName || "Altaspan";
  const sendPayload: any = {
    from: `${fromDisplay} <${mailbox.address}>`,
    to: params.to,
    subject: params.subject,
    html: params.htmlBody,
  };

  if (params.cc && params.cc.length > 0) sendPayload.cc = params.cc;
  if (params.bcc && params.bcc.length > 0) sendPayload.bcc = params.bcc;

  if (params.attachments && params.attachments.length > 0) {
    sendPayload.attachments = params.attachments.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      content_type: a.contentType,
    }));
  }

  // Add reply-to from env if configured
  const replyTo = ENV.emailReplyTo;
  if (replyTo) sendPayload.reply_to = replyTo;

  if (params.inReplyTo) {
    sendPayload.headers = {
      "In-Reply-To": params.inReplyTo,
      "References": [params.references, params.inReplyTo].filter(Boolean).join(" "),
    };
  }

  const { data, error } = await resend.emails.send(sendPayload);
  if (error) {
    return { success: false, provider: "resend", error: error.message };
  }
  return { success: true, provider: "resend", emailId: data?.id };
}

async function sendViaMsGraph(params: UnifiedSendParams, mailbox: ResolvedMailbox): Promise<SendResult> {
  if (!msgraph.isGraphConfigured()) {
    return { success: false, provider: "msgraph", error: "Microsoft Graph not configured" };
  }

  try {
    await msgraph.sendEmail({
      mailbox: mailbox.address,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      htmlBody: params.htmlBody,
      textBody: params.textBody,
      importance: params.importance,
      attachments: params.attachments?.map(a => ({
        name: a.filename,
        contentType: a.contentType || "application/octet-stream",
        contentBytes: a.content,
      })),
    });

    return { success: true, provider: "msgraph" };
  } catch (err: any) {
    return { success: false, provider: "msgraph", error: err.message };
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Send an email through the appropriate provider based on mailbox configuration.
 * Automatically resolves the correct mailbox and provider.
 */
export async function sendUnifiedEmail(params: UnifiedSendParams): Promise<SendResult> {
  // Check notification suppression
  if (params.settingKey) {
    const enabled = await isNotificationEnabled(params.settingKey);
    if (!enabled) {
      await logNotification(
        { settingKey: params.settingKey, channel: "email", recipientType: "user", recipientId: params.to[0], title: params.subject },
        "suppressed",
        "setting_disabled"
      );
      return { success: false, provider: "none", error: "Notification suppressed by setting" };
    }
  }

  // Resolve mailbox
  const mailbox = await resolveMailbox(params.fromAddress, params.module);

  // Send via appropriate provider
  let result: SendResult;
  if (mailbox.provider === "msgraph") {
    result = await sendViaMsGraph(params, mailbox);
  } else {
    result = await sendViaResend(params, mailbox);
  }

  // Log notification if setting key provided
  if (params.settingKey) {
    await logNotification(
      { settingKey: params.settingKey, channel: "email", recipientType: "user", recipientId: params.to[0], title: params.subject },
      result.success ? "sent" : "failed",
      result.error
    );
  }

  return result;
}

/**
 * Send a notification email (convenience wrapper for internal notifications)
 * Uses the admin mailbox by default.
 */
export async function sendNotificationViaGraph(params: {
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  module?: "sales" | "construction" | "approvals" | "admin";
  settingKey?: string;
}): Promise<SendResult> {
  return sendUnifiedEmail({
    to: [params.to],
    subject: params.subject,
    htmlBody: params.htmlBody,
    fromName: params.fromName || ENV.emailSenderName || "Altaspan",
    module: params.module || "admin",
    settingKey: params.settingKey,
  });
}

/**
 * Send a proposal email with PDF attachment
 */
export async function sendProposalViaGraph(params: {
  to: string;
  clientName: string;
  quoteNumber: string;
  subject?: string;
  coverMessage?: string;
  pdfBase64: string;
  fromName?: string;
}): Promise<SendResult> {
  const { to, clientName, quoteNumber, subject, coverMessage, pdfBase64, fromName = ENV.emailSenderName || "Altaspan" } = params;

  const emailSubject = subject || `Your Proposal - Quote ${quoteNumber}`;
  const filename = `Proposal-${quoteNumber}.pdf`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">Hi ${clientName},</h2>
      ${coverMessage
        ? `<div style="color: #334155; line-height: 1.6; white-space: pre-wrap;">${coverMessage}</div>`
        : `<p style="color: #334155; line-height: 1.6;">Please find attached your proposal for the project we discussed. If you have any questions or would like to proceed, please don't hesitate to get in touch.</p>`
      }
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #64748b; font-size: 12px;">This email was sent from ${fromName}. The attached PDF contains your full proposal including pricing and specifications.</p>
    </div>
  `;

  return sendUnifiedEmail({
    to: [to],
    subject: emailSubject,
    htmlBody,
    fromName,
    module: "sales",
    attachments: [{
      filename,
      content: pdfBase64,
      contentType: "application/pdf",
    }],
  });
}
