/**
 * Construction Notification Helpers
 * Handles SMS (via Vocphone) and email (via Resend) notifications
 * for schedule events, job stage changes, and installer assignments.
 *
 * All notification functions are non-blocking: they log failures
 * but never throw, so calling mutations always succeed.
 */

import * as vocphone from "./vocphone";
import { sendNotificationEmail } from "./email";
import { createSmsDeliveryLog, getDb } from "./db";
import { constructionJobs, constructionInstallers, constructionScheduleEvents, crmLeads } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { triggerPushScheduleEvent } from "./push-triggers";
import { guardedSend, isNotificationEnabled } from "./notification-gateway";

// ─── Phone number helpers ─────────────────────────────────────────────────────

/** Normalise an Australian phone number to E.164 without the + prefix */
export function normaliseAuPhone(phone: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("0")) cleaned = "61" + cleaned.slice(1);
  if (cleaned.length < 10) return null;
  return cleaned;
}

function getSender(): string {
  return process.env.VOCPHONE_SMS_SENDER || "61480855750";
}

// ─── SMS helpers ──────────────────────────────────────────────────────────────

interface SmsResult {
  sent: boolean;
  error?: string;
}

async function sendAndLogSms(params: {
  jobId: number;
  installerId?: number;
  phone: string;
  body: string;
}): Promise<SmsResult> {
  // Check if SMS notifications are enabled
  const smsEnabled = await isNotificationEnabled("notify_trade_sms");
  if (!smsEnabled) {
    return { sent: false, error: "SMS notifications disabled" };
  }

  const sender = getSender();
  const recipient = normaliseAuPhone(params.phone);
  if (!recipient) {
    return { sent: false, error: "Invalid phone number" };
  }
  try {
    await vocphone.sendSms({ recipient, sender, body: params.body });
    await createSmsDeliveryLog({
      jobId: params.jobId,
      installerId: params.installerId ?? null,
      recipient,
      sender,
      body: params.body,
      status: "sent",
    });
    return { sent: true };
  } catch (err: any) {
    console.error("[ConstructionNotify] SMS failed:", err?.message);
    try {
      await createSmsDeliveryLog({
        jobId: params.jobId,
        installerId: params.installerId ?? null,
        recipient,
        sender,
        body: params.body,
        status: "failed",
        errorMessage: err?.message || String(err),
      });
    } catch (_) { /* ignore logging failure */ }
    return { sent: false, error: err?.message };
  }
}

// ─── Notification: Schedule Event Created ─────────────────────────────────────

export async function notifyScheduleEventCreated(eventId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [event] = await db.select().from(constructionScheduleEvents)
      .where(eq(constructionScheduleEvents.id, eventId));
    if (!event) return;

    const [job] = await db.select().from(constructionJobs)
      .where(eq(constructionJobs.id, event.jobId));
    if (!job) return;

    const eventDate = new Date(event.startTime).toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
    const eventTime = event.allDay ? "All day" : new Date(event.startTime).toLocaleTimeString("en-AU", {
      hour: "2-digit", minute: "2-digit",
    });

    // 1. Notify assigned installer via SMS
    if (event.notifyInstaller && event.assignedInstallerId) {
      const [installer] = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, event.assignedInstallerId));
      if (installer?.phone) {
        const body = `Hi ${installer.name}, new ${event.eventType} scheduled.\n\nClient: ${job.clientName}\nSite: ${job.siteAddress || "TBC"}\nDate: ${eventDate}\nTime: ${eventTime}\nDetails: ${event.title}\n\n- Altaspan Construction`;
        await sendAndLogSms({
          jobId: event.jobId,
          installerId: installer.id,
          phone: installer.phone,
          body,
        });
      }
    }

    // 2. Notify client via email (if notifyClient flag is set and we have a linked lead with email)
    if (event.notifyClient) {
      await sendClientEventEmail(job, event, eventDate, eventTime);
    }

    // 3. Notify owner (guarded)
    await guardedSend(
      { settingKey: "notify_construction_schedule", channel: "owner_notify", recipientType: "owner", title: `Schedule: ${event.title}` },
      () => notifyOwner({ title: `Schedule: ${event.title}`, content: `New ${event.eventType} scheduled for ${job.clientName} at ${job.siteAddress || "N/A"} on ${eventDate} ${eventTime}.` })
    );

    // 4. Push notification to trade portal (assigned installer)
    if (event.assignedInstallerId) {
      triggerPushScheduleEvent(event.assignedInstallerId, event.title, eventDate, false);
    }
  } catch (err) {
    console.error("[ConstructionNotify] notifyScheduleEventCreated error:", err);
  }
}

// ─── Notification: Schedule Event Updated ─────────────────────────────────────

export async function notifyScheduleEventUpdated(eventId: number, changes: string[]): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [event] = await db.select().from(constructionScheduleEvents)
      .where(eq(constructionScheduleEvents.id, eventId));
    if (!event) return;

    const [job] = await db.select().from(constructionJobs)
      .where(eq(constructionJobs.id, event.jobId));
    if (!job) return;

    const eventDate = new Date(event.startTime).toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

    // Notify assigned installer if they exist
    if (event.notifyInstaller && event.assignedInstallerId) {
      const [installer] = await db.select().from(constructionInstallers)
        .where(eq(constructionInstallers.id, event.assignedInstallerId));
      if (installer?.phone) {
        const body = `Hi ${installer.name}, schedule update for ${job.clientName}.\n\nEvent: ${event.title}\nDate: ${eventDate}\nChanges: ${changes.join(", ")}\n\n- Altaspan Construction`;
        await sendAndLogSms({
          jobId: event.jobId,
          installerId: installer.id,
          phone: installer.phone,
          body,
        });
      }
    }

    // Push notification to trade portal (assigned installer)
    if (event.assignedInstallerId) {
      triggerPushScheduleEvent(event.assignedInstallerId, event.title, eventDate, true);
    }
  } catch (err) {
    console.error("[ConstructionNotify] notifyScheduleEventUpdated error:", err);
  }
}

// ─── Notification: Job Stage Changed ──────────────────────────────────────────

export async function notifyJobStageChanged(params: {
  jobId: number;
  stage: string;
  newStatus: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [job] = await db.select().from(constructionJobs)
      .where(eq(constructionJobs.id, params.jobId));
    if (!job) return;

    const statusLabel = params.newStatus.replace("_", " ");

    // Notify owner of stage changes (guarded)
    await guardedSend(
      { settingKey: "notify_construction_stage", channel: "owner_notify", recipientType: "owner", title: `Stage Update: ${job.clientName}` },
      () => notifyOwner({ title: `Stage Update: ${job.clientName}`, content: `${params.stage} is now "${statusLabel}" for ${job.clientName} at ${job.siteAddress || "N/A"}.` })
    );

    // If stage completed, send email to client (if linked lead has email)
    if (params.newStatus === "completed") {
      await sendClientStageEmail(job, params.stage);
    }
  } catch (err) {
    console.error("[ConstructionNotify] notifyJobStageChanged error:", err);
  }
}

// ─── Notification: Job Status Changed ─────────────────────────────────────────

export async function notifyJobStatusChanged(params: {
  jobId: number;
  oldStatus: string;
  newStatus: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [job] = await db.select().from(constructionJobs)
      .where(eq(constructionJobs.id, params.jobId));
    if (!job) return;

    const statusLabel = params.newStatus.replace("_", " ");

    await guardedSend(
      { settingKey: "notify_construction_status", channel: "owner_notify", recipientType: "owner", title: `Job ${statusLabel}: ${job.clientName}` },
      () => notifyOwner({ title: `Job ${statusLabel}: ${job.clientName}`, content: `Construction job for ${job.clientName} at ${job.siteAddress || "N/A"} has been updated to "${statusLabel}".` })
    );
  } catch (err) {
    console.error("[ConstructionNotify] notifyJobStatusChanged error:", err);
  }
}

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendClientEventEmail(
  job: any,
  event: any,
  eventDate: string,
  eventTime: string,
): Promise<void> {
  // Try to find client email from linked CRM lead
  const clientEmail = await getClientEmail(job);
  if (!clientEmail) return;

  const eventTypeLabel = event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1);

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Altaspan Construction Update</h2>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #334155; font-size: 16px; margin-top: 0;">Hi ${job.clientName},</p>
        <p style="color: #475569; line-height: 1.6;">
          A new <strong>${eventTypeLabel}</strong> has been scheduled for your project:
        </p>
        <div style="background: #f8fafc; border-left: 4px solid #0d9488; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>${event.title}</strong></p>
          <p style="margin: 0 0 4px 0; color: #475569;">Date: ${eventDate}</p>
          <p style="margin: 0 0 4px 0; color: #475569;">Time: ${eventTime}</p>
          ${job.siteAddress ? `<p style="margin: 0; color: #475569;">Location: ${job.siteAddress}</p>` : ""}
        </div>
        ${event.description ? `<p style="color: #475569; line-height: 1.6;">${event.description}</p>` : ""}
        <p style="color: #475569; line-height: 1.6;">
          If you have any questions, please don't hesitate to contact us.
        </p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
          Kind regards,<br/>
          <strong>Altaspan</strong>
        </p>
      </div>
    </div>
  `;

  try {
    const enabled = await isNotificationEnabled("notify_client_schedule_email");
    if (!enabled) return;
    await sendNotificationEmail({
      to: clientEmail,
      subject: `${eventTypeLabel} Scheduled - ${job.clientName}`,
      htmlBody,
      fromName: "Altaspan Construction",
    });
  } catch (err) {
    console.error("[ConstructionNotify] Client event email failed:", err);
  }
}

async function sendClientStageEmail(job: any, stage: string): Promise<void> {
  const clientEmail = await getClientEmail(job);
  if (!clientEmail) return;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Construction Progress Update</h2>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #334155; font-size: 16px; margin-top: 0;">Hi ${job.clientName},</p>
        <p style="color: #475569; line-height: 1.6;">
          Great news! The <strong>${stage}</strong> stage of your project has been completed.
        </p>
        <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; color: #166534; font-weight: 600;">Stage Completed: ${stage}</p>
          ${job.siteAddress ? `<p style="margin: 4px 0 0 0; color: #475569;">Site: ${job.siteAddress}</p>` : ""}
        </div>
        <p style="color: #475569; line-height: 1.6;">
          Our team will continue with the next phase of construction. We'll keep you updated on progress.
        </p>
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
          Kind regards,<br/>
          <strong>Altaspan</strong>
        </p>
      </div>
    </div>
  `;

  try {
    const enabled = await isNotificationEnabled("notify_client_stage_email");
    if (!enabled) return;
    await sendNotificationEmail({
      to: clientEmail,
      subject: `Stage Completed: ${stage} - ${job.clientName}`,
      htmlBody,
      fromName: "Altaspan Construction",
    });
  } catch (err) {
    console.error("[ConstructionNotify] Client stage email failed:", err);
  }
}

/** Try to find the client email from the linked CRM lead */
export async function getClientEmail(job: any): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    // If job has a linked lead, get email from there
    if (job.leadId) {
      const [lead] = await db.select({ email: crmLeads.contactEmail })
        .from(crmLeads)
        .where(eq(crmLeads.id, job.leadId));
      if (lead?.email) return lead.email;
    }

    // If job has a linked quote, try to find client email from the quote
    if (job.quoteId) {
      const { quotes } = await import("../drizzle/schema");
      const [quote] = await db.select({ clientEmail: quotes.clientEmail })
        .from(quotes)
        .where(eq(quotes.id, job.quoteId));
      if (quote?.clientEmail) return quote.clientEmail;
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Outbound Webhook: Fire review request to Zapier/Climbo on job completion ─

const CLIMBO_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/87514/4brqmc5/";

/**
 * Fires an outbound webhook to Zapier when a construction job is marked as completed.
 * Zapier then creates the client in Climbo which triggers a review invitation.
 * Non-blocking: logs failures but never throws.
 */
export async function fireJobCompletionReviewWebhook(jobId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const [job] = await db.select().from(constructionJobs)
      .where(eq(constructionJobs.id, jobId));
    if (!job) {
      console.log(`[ReviewWebhook] Job ${jobId} not found, skipping`);
      return;
    }

    // Get client email and phone from linked lead or quote
    let clientEmail: string | null = null;
    let clientPhone: string | null = null;

    if (job.leadId) {
      const [lead] = await db.select({
        email: crmLeads.contactEmail,
        phone: crmLeads.contactPhone,
      }).from(crmLeads).where(eq(crmLeads.id, job.leadId));
      if (lead) {
        clientEmail = lead.email;
        clientPhone = lead.phone;
      }
    }

    if (!clientEmail && job.quoteId) {
      const { quotes } = await import("../drizzle/schema");
      const [quote] = await db.select({
        clientEmail: quotes.clientEmail,
        clientPhone: quotes.clientPhone,
      }).from(quotes).where(eq(quotes.id, job.quoteId));
      if (quote) {
        clientEmail = quote.clientEmail;
        clientPhone = quote.clientPhone;
      }
    }

    if (!clientEmail) {
      console.log(`[ReviewWebhook] No client email found for job ${jobId} (${job.clientName}), skipping`);
      return;
    }

    const payload = {
      email: clientEmail,
      client_name: job.clientName,
      phone: clientPhone || "",
      site_address: job.siteAddress || "",
      job_reference: job.quoteNumber || `JOB-${jobId}`,
      completion_date: new Date().toISOString(),
      lead_id: job.leadId || null,
      source: "altaspan_job_completion",
    };

    console.log(`[ReviewWebhook] Firing webhook for job ${jobId} (${job.clientName}) to Zapier`);

    const resp = await fetch(CLIMBO_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      console.log(`[ReviewWebhook] Success for job ${jobId}: status ${resp.status}`);
    } else {
      console.error(`[ReviewWebhook] Failed for job ${jobId}: status ${resp.status}`);
    }
  } catch (err) {
    console.error("[ReviewWebhook] Error firing completion webhook:", err);
  }
}
