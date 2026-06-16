/**
 * Unified Email Sending Service
 * Sends outbound email through Microsoft Graph/O365 based on the configured tenant mailbox.
 */
import * as msgraph from "./msgraph";
import { getDb } from "../db";
import { inboxAddresses } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logNotification, isNotificationEnabled } from "../notification-gateway";
import { ENV } from "../_core/env";
import { getTenantEmailConfig } from "../tenant-integrations";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UnifiedSendParams {
  tenantId?: number | null;
  /** The "from" mailbox address (must be configured in inbox_addresses) */
  fromAddress?: string;
  /** Module context — used to auto-select the correct mailbox if fromAddress not specified */
  module?: "sales" | "construction" | "approvals" | "admin" | "manufacturing" | "support";
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
  provider: "msgraph" | "none";
  emailId?: string;
  error?: string;
}

// ─── Mailbox Resolution ────────────────────────────────────────────────────────

interface ResolvedMailbox {
  address: string;
  provider: "msgraph";
  displayName: string;
}

/**
 * Resolve which mailbox to use for sending.
 * Priority: explicit O365 mailbox > module O365 mailbox > first active O365 mailbox > tenant sender fallback.
 */
async function resolveMailbox(fromAddress?: string, module?: string, tenantId?: number | null): Promise<ResolvedMailbox> {
  const emailConfig = await getTenantEmailConfig(tenantId);
  const fallbackSenderAddress = (emailConfig.senderAddress || ENV.emailSenderAddress || "").toLowerCase();
  const db = await getDb();
  if (!db) {
    // Fallback to env-configured sender if DB unavailable
    return {
      address: emailConfig.senderAddress || ENV.emailSenderAddress || "support@commissogroup.au",
      provider: "msgraph",
      displayName: emailConfig.senderName || ENV.emailSenderName || "Altaspan",
    };
  }

  // If explicit address provided, look it up
  if (fromAddress) {
    const [addr] = await db.select()
      .from(inboxAddresses)
      .where(and(
        eq(inboxAddresses.address, fromAddress.toLowerCase()),
        eq(inboxAddresses.active, true),
        ...(tenantId ? [eq(inboxAddresses.tenantId, tenantId)] : []),
      ));
    if (addr) {
      return {
        address: addr.address,
        provider: "msgraph",
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
        eq(inboxAddresses.active, true),
        ...(tenantId ? [eq(inboxAddresses.tenantId, tenantId)] : []),
      ));
    if (addr) {
      return {
        address: addr.address,
        provider: "msgraph",
        displayName: addr.displayName,
      };
    }
  }

  // Prefer the configured tenant/env sender before falling back to any mailbox.
  // This avoids stale module mappings taking precedence after mailbox/domain changes.
  if (fallbackSenderAddress) {
    const [addr] = await db.select()
      .from(inboxAddresses)
      .where(and(
        eq(inboxAddresses.address, fallbackSenderAddress),
        eq(inboxAddresses.active, true),
        ...(tenantId ? [eq(inboxAddresses.tenantId, tenantId)] : []),
      ));
    if (addr) {
      return {
        address: addr.address,
        provider: "msgraph",
        displayName: addr.displayName,
      };
    }
  }

  // Fallback: first active O365 mailbox, then tenant/env sender address.
  const allAddresses = await db.select()
    .from(inboxAddresses)
    .where(tenantId
      ? and(eq(inboxAddresses.tenantId, tenantId), eq(inboxAddresses.active, true))
      : eq(inboxAddresses.active, true));

  const graphAddr = allAddresses.find(a => (a as any).provider === "msgraph");
  if (graphAddr) {
    return {
      address: graphAddr.address,
      provider: "msgraph",
      displayName: graphAddr.displayName,
    };
  }

  // Ultimate fallback from env
  return {
    address: emailConfig.senderAddress || ENV.emailSenderAddress || "support@commissogroup.au",
    provider: "msgraph",
    displayName: emailConfig.senderName || ENV.emailSenderName || "Altaspan",
  };
}

// ─── Send via Provider ─────────────────────────────────────────────────────────

async function sendViaMsGraph(params: UnifiedSendParams, mailbox: ResolvedMailbox): Promise<SendResult> {
  if (!await msgraph.isGraphConfiguredForTenant(params.tenantId)) {
    return { success: false, provider: "msgraph", error: "Microsoft Graph not configured" };
  }

  try {
    await msgraph.sendEmail({
      tenantId: params.tenantId,
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
    const enabled = await isNotificationEnabled(params.settingKey, params.tenantId);
    if (!enabled) {
      await logNotification(
        { tenantId: params.tenantId, settingKey: params.settingKey, channel: "email", recipientType: "user", recipientId: params.to[0], title: params.subject },
        "suppressed",
        "setting_disabled"
      );
      return { success: false, provider: "none", error: "Notification suppressed by setting" };
    }
  }

  // Resolve mailbox
  const mailbox = await resolveMailbox(params.fromAddress, params.module, params.tenantId);

  const result = await sendViaMsGraph(params, mailbox);

  // Log notification if setting key provided
  if (params.settingKey) {
    await logNotification(
      { tenantId: params.tenantId, settingKey: params.settingKey, channel: "email", recipientType: "user", recipientId: params.to[0], title: params.subject },
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
  tenantId?: number | null;
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  module?: "sales" | "construction" | "approvals" | "admin" | "manufacturing" | "support";
  settingKey?: string;
}): Promise<SendResult> {
  return sendUnifiedEmail({
    to: [params.to],
    tenantId: params.tenantId,
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
  tenantId?: number | null;
  to: string;
  clientName: string;
  quoteNumber: string;
  subject?: string;
  coverMessage?: string;
  pdfBase64: string;
  fromName?: string;
}): Promise<SendResult> {
  const { tenantId, to, clientName, quoteNumber, subject, coverMessage, pdfBase64, fromName = ENV.emailSenderName || "Altaspan" } = params;

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
    tenantId,
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
