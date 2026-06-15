import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { portalAccess, constructionJobs } from "../drizzle/schema";
import { sendNotificationEmail } from "./email";

/**
 * Activity type labels for display in emails
 */
const typeLabels: Record<string, string> = {
  note: "Note",
  photo: "Photo",
  file: "File",
  sms: "SMS",
  email: "Email",
};

/**
 * Build the HTML email body for a portal activity notification.
 */
export function buildActivityNotificationHtml(params: {
  clientName: string;
  activityType: string;
  activityTitle?: string | null;
  activityContent?: string | null;
  hasAttachment: boolean;
  portalUrl: string;
}): string {
  const { clientName, activityType, activityTitle, activityContent, hasAttachment, portalUrl } = params;
  const typeLabel = typeLabels[activityType] || activityType;

  const contentPreview = activityContent
    ? activityContent.length > 300
      ? activityContent.substring(0, 300) + "..."
      : activityContent
    : null;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc;">
      <div style="background-color: #0f172a; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">
          Altaspan
        </h1>
      </div>
      <div style="background-color: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
        <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px;">
          New Project Update
        </h2>
        <p style="color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
          Hi ${clientName || "there"},
        </p>
        <p style="color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
          A new update has been posted to your project:
        </p>
        <div style="background-color: #f1f5f9; border-left: 4px solid #0ea5e9; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="display: inline-block; background-color: #e0f2fe; color: #0369a1; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              ${typeLabel}
            </span>
          </div>
          ${activityTitle ? `<p style="color: #1e293b; font-weight: 600; margin: 0 0 8px 0; font-size: 15px;">${activityTitle}</p>` : ""}
          ${contentPreview ? `<p style="color: #475569; margin: 0; line-height: 1.6; font-size: 14px; white-space: pre-wrap;">${contentPreview}</p>` : ""}
          ${hasAttachment ? `<p style="color: #64748b; margin: 8px 0 0 0; font-size: 13px;">📎 Attachment included — view in portal</p>` : ""}
        </div>
        <div style="text-align: center; margin: 28px 0 8px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: #0ea5e9; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            View in Portal
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 20px 0 0 0;">
          You're receiving this because you have portal access for your project with Altaspan.
        </p>
      </div>
      <div style="padding: 16px 32px; text-align: center;">
        <p style="color: #94a3b8; font-size: 11px; margin: 0;">
          &copy; ${new Date().getFullYear()} Altaspan. All rights reserved.
        </p>
      </div>
    </div>
  `;
}

/**
 * Send a portal activity notification email to all active portal access holders for a given job.
 * Returns the number of emails sent successfully.
 */
export async function notifyPortalClientsOfActivity(params: {
  jobId: number;
  activityType: string;
  activityTitle?: string | null;
  activityContent?: string | null;
  hasAttachment: boolean;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const { jobId, activityType, activityTitle, activityContent, hasAttachment } = params;

  const db = await getDb();
  if (!db) {
    console.warn("[PortalNotification] Database not available, skipping notification");
    return { sent: 0, failed: 0, skipped: 0 };
  }

  // Find all active portal access records for this job that have notifications enabled
  const accessRecords = await db
    .select({
      id: portalAccess.id,
      clientEmail: portalAccess.clientEmail,
      clientName: portalAccess.clientName,
      token: portalAccess.token,
      emailNotifications: portalAccess.emailNotifications,
    })
    .from(portalAccess)
    .where(
      and(
        eq(portalAccess.constructionJobId, jobId),
        eq(portalAccess.isActive, true)
      )
    );

  if (accessRecords.length === 0) {
    console.log(`[PortalNotification] No active portal access for job ${jobId}, skipping`);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const access of accessRecords) {
    if (!access.clientEmail) {
      skipped++;
      continue;
    }

    // Respect notification preferences
    if (!access.emailNotifications) {
      skipped++;
      console.log(`[PortalNotification] Skipping ${access.clientEmail} — notifications disabled`);
      continue;
    }

    // Build the portal URL with the client's token for direct access
    const portalUrl = `https://spanquote-pfxpibxa.manus.space/portal/login?token=${access.token}`;

    const htmlBody = buildActivityNotificationHtml({
      clientName: access.clientName || "there",
      activityType,
      activityTitle,
      activityContent,
      hasAttachment,
      portalUrl,
    });

    const typeLabel = typeLabels[activityType] || activityType;
    const subject = activityTitle
      ? `New ${typeLabel}: ${activityTitle}`
      : `New Project ${typeLabel} Update`;

    try {
      const result = await sendNotificationEmail({
        to: access.clientEmail,
        subject,
        htmlBody,
      });

      if (result.success) {
        sent++;
        console.log(`[PortalNotification] Email sent to ${access.clientEmail} for job ${jobId}`);
      } else {
        failed++;
        console.error(`[PortalNotification] Failed to send to ${access.clientEmail}: ${result.error}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`[PortalNotification] Exception sending to ${access.clientEmail}:`, err.message);
    }
  }

  return { sent, failed, skipped };
}
