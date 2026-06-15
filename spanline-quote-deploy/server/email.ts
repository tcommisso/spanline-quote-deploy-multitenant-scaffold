import { Resend } from "resend";
import { ENV } from "./_core/env";
import { logNotification, isNotificationEnabled } from "./notification-gateway";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Centralised sender helpers */
function getSenderFrom(fromName?: string): string {
  const name = fromName || ENV.emailSenderName || "Altaspan";
  const address = ENV.emailSenderAddress || "support@commissogroup.au";
  return `${name} <${address}>`;
}

function getReplyTo(): string | undefined {
  return ENV.emailReplyTo || undefined;
}

export interface SendProposalEmailParams {
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
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  attachments?: EmailAttachment[];
}

export async function sendNotificationEmail(params: SendNotificationEmailParams & { settingKey?: string }): Promise<{ success: boolean; error?: string; emailId?: string }> {
  const { to, subject, htmlBody, fromName, attachments, settingKey } = params;

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
    const sendPayload: any = {
      from: getSenderFrom(fromName),
      to: [to],
      subject,
      html: htmlBody,
    };
    const replyTo = getReplyTo();
    if (replyTo) sendPayload.reply_to = replyTo;
    if (attachments && attachments.length > 0) {
      sendPayload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        content_type: a.contentType,
      }));
    }
    const { data, error } = await resend.emails.send(sendPayload);
    if (error) {
      console.error("[Email] Resend error:", error);
      if (settingKey) {
        await logNotification(
          { settingKey, channel: "email", recipientType: "user", recipientId: to, title: subject },
          "failed",
          error.message
        );
      }
      return { success: false, error: error.message || "Failed to send email" };
    }
    if (settingKey) {
      await logNotification(
        { settingKey, channel: "email", recipientType: "user", recipientId: to, title: subject },
        "sent"
      );
    }
    return { success: true, emailId: data?.id };
  } catch (err: any) {
    console.error("[Email] Exception:", err);
    return { success: false, error: err.message || "Unexpected error sending email" };
  }
}

export async function sendProposalEmail(params: SendProposalEmailParams): Promise<{ success: boolean; error?: string }> {
  const {
    to,
    clientName,
    quoteNumber,
    subject,
    coverMessage,
    pdfBase64,
    fromName,
  } = params;

  const senderName = fromName || ENV.emailSenderName || "Altaspan";
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
      <p style="color: #64748b; font-size: 12px;">This email was sent from ${senderName}. The attached PDF contains your full proposal including pricing and specifications.</p>
    </div>
  `;

  try {
    const sendPayload: any = {
      from: getSenderFrom(fromName),
      to: [to],
      subject: emailSubject,
      html: htmlBody,
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    };
    const replyTo = getReplyTo();
    if (replyTo) sendPayload.reply_to = replyTo;

    const { data, error } = await resend.emails.send(sendPayload);

    if (error) {
      console.error("[Email] Resend error:", error);
      return { success: false, error: error.message || "Failed to send email" };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Email] Exception:", err);
    return { success: false, error: err.message || "Unexpected error sending email" };
  }
}
