import { ENV } from "./_core/env";
import { logNotification, isNotificationEnabled } from "./notification-gateway";
import { sendProposalViaGraph, sendUnifiedEmail } from "./email/send";

export interface SendProposalEmailParams {
  tenantId?: number | null;
  to: string;
  clientName: string;
  quoteNumber: string;
  subject?: string;
  coverMessage?: string;
  pdfBase64: string;
  fromName?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
  contentType?: string;
}

export interface SendNotificationEmailParams {
  tenantId?: number | null;
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  attachments?: EmailAttachment[];
  module?: "sales" | "construction" | "approvals" | "admin";
}

export async function sendNotificationEmail(params: SendNotificationEmailParams & { settingKey?: string }): Promise<{ success: boolean; error?: string; emailId?: string }> {
  const { tenantId, to, subject, htmlBody, fromName, attachments, module, settingKey } = params;

  // Check notification setting if a key is provided
  if (settingKey) {
    const enabled = await isNotificationEnabled(settingKey);
    if (!enabled) {
      await logNotification(
        { settingKey, channel: "email", recipientType: "user", recipientId: to, title: subject },
        "suppressed",
        "setting_disabled"
      );
      return { success: false, error: "Notification suppressed by setting" };
    }
  }

  try {
    const result = await sendUnifiedEmail({
      tenantId,
      to: [to],
      subject,
      htmlBody,
      fromName,
      module: module || "admin",
      attachments,
    });
    if (!result.success) {
      console.error("[Email] Microsoft Graph error:", result.error);
      if (settingKey) {
        await logNotification(
          { settingKey, channel: "email", recipientType: "user", recipientId: to, title: subject },
          "failed",
          result.error
        );
      }
      return { success: false, error: result.error || "Failed to send email" };
    }
    if (settingKey) {
      await logNotification(
        { settingKey, channel: "email", recipientType: "user", recipientId: to, title: subject },
        "sent"
      );
    }
    return { success: true, emailId: result.emailId };
  } catch (err: any) {
    console.error("[Email] Exception:", err);
    return { success: false, error: err.message || "Unexpected error sending email" };
  }
}

export async function sendProposalEmail(params: SendProposalEmailParams): Promise<{ success: boolean; error?: string }> {
  const result = await sendProposalViaGraph({
    tenantId: params.tenantId,
    to: params.to,
    clientName: params.clientName,
    quoteNumber: params.quoteNumber,
    subject: params.subject,
    coverMessage: params.coverMessage,
    pdfBase64: params.pdfBase64,
    fromName: params.fromName || ENV.emailSenderName || "Altaspan",
  });
  return { success: result.success, error: result.error };
}
