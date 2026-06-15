import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { tenantProcedure as protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { clientActivities, constructionJobs, portalAccess, emailEvents } from "../drizzle/schema";
import { storagePut, storageGet } from "./storage";
import crypto from "crypto";
import { notifyPortalClientsOfActivity } from "./portal-activity-notification";
import * as vocphone from "./vocphone";
import { sendNotificationEmail, EmailAttachment } from "./email";
import * as emailTemplatesDb from "./email-templates-db";
import { triggerPushActivityPosted } from "./push-triggers";
import { appendTenantScope, tenantIdFromContext } from "./_core/tenant-scope";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

function jobTenantConditions(ctx: any, ...baseConditions: any[]) {
  const conditions = [...baseConditions];
  appendTenantScope(conditions, constructionJobs.tenantId, tenantIdFromContext(ctx));
  return conditions;
}

async function requireJobAccess(db: any, ctx: any, jobId: number) {
  const [job] = await db.select({ id: constructionJobs.id, leadId: constructionJobs.leadId })
    .from(constructionJobs)
    .where(and(...jobTenantConditions(ctx, eq(constructionJobs.id, jobId))))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Construction job not found" });
  return job;
}

async function requireActivityAccess(db: any, ctx: any, activityId: number) {
  const [row] = await db.select({ activity: clientActivities })
    .from(clientActivities)
    .innerJoin(constructionJobs, eq(clientActivities.jobId, constructionJobs.id))
    .where(and(...jobTenantConditions(ctx, eq(clientActivities.id, activityId))))
    .limit(1);
  if (!row?.activity) throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  return row.activity;
}

/**
 * Dispatch an SMS to the client's phone number via VocPhone.
 * Looks up the phone from portal_access or construction_jobs (via CRM lead).
 */
async function dispatchSmsForActivity(db: any, jobId: number, body: string, tenantId?: number | null): Promise<void> {
  // Look up client phone from portal_access for this job
  const conditions: any[] = [
    eq(portalAccess.constructionJobId, jobId),
    eq(portalAccess.isActive, true),
  ];
  appendTenantScope(conditions, portalAccess.tenantId, tenantId);
  const accessRecords = await db
    .select({ clientPhone: portalAccess.clientPhone, clientName: portalAccess.clientName })
    .from(portalAccess)
    .where(and(...conditions));

  const sender = process.env.VOCPHONE_SMS_SENDER || "61480855750";
  let sent = false;

  for (const access of accessRecords) {
    if (access.clientPhone) {
      // Normalize phone: strip leading +, spaces, dashes
      const recipient = access.clientPhone.replace(/[^\d]/g, "");
      if (recipient.length >= 9) {
        try {
          await vocphone.sendSms({ recipient, sender, body });
          console.log(`[ClientActivities] SMS sent to ${recipient} for job ${jobId}`);
          sent = true;
        } catch (err: any) {
          console.error(`[ClientActivities] SMS send failed for ${recipient}:`, err?.message);
        }
      }
    }
  }

  if (!sent) {
    console.log(`[ClientActivities] No valid phone number found for job ${jobId}, SMS not sent`);
  }
}

/**
 * Dispatch an email to the client via the tenant's O365/Microsoft Graph mailbox.
 * Looks up the email from portal_access or construction_jobs.
 * Supports template-based content with merge field replacement.
 */
async function dispatchEmailForActivity(
  db: any,
  jobId: number,
  subject: string,
  body: string,
  clientNameOverride?: string,
  attachments?: EmailAttachment[],
  activityId?: number,
  tenantId?: number | null
): Promise<void> {
  // Look up client email from portal_access for this job
  const conditions: any[] = [
    eq(portalAccess.constructionJobId, jobId),
    eq(portalAccess.isActive, true),
  ];
  appendTenantScope(conditions, portalAccess.tenantId, tenantId);
  const accessRecords = await db
    .select({ clientEmail: portalAccess.clientEmail, clientName: portalAccess.clientName })
    .from(portalAccess)
    .where(and(...conditions));

  let sent = false;

  for (const access of accessRecords) {
    if (access.clientEmail) {
      try {
        const clientName = clientNameOverride || access.clientName || "there";
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e293b;">Dear ${clientName},</h2>
            <div style="color: #334155; line-height: 1.8; white-space: pre-wrap;">${body}</div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #64748b; font-size: 12px;">This email was sent from Altaspan.</p>
          </div>
        `;
        const result = await sendNotificationEmail({
          to: access.clientEmail,
          subject,
          htmlBody,
          attachments,
        });
        if (result.success) {
          console.log(`[ClientActivities] Email sent to ${access.clientEmail} for job ${jobId}`);
          sent = true;
          // Store email tracking event
          if (activityId) {
            try {
              await db.insert(emailEvents).values({
                activityId,
                resendEmailId: result.emailId || null,
                recipientEmail: access.clientEmail,
                status: "sent",
                sentAt: new Date(),
              });
            } catch (trackErr: any) {
              console.error(`[ClientActivities] Failed to store email event:`, trackErr?.message);
            }
          }
        } else {
          console.error(`[ClientActivities] Email send failed for ${access.clientEmail}:`, result.error);
        }
      } catch (err: any) {
        console.error(`[ClientActivities] Email send exception for ${access.clientEmail}:`, err?.message);
      }
    }
  }

  if (!sent) {
    console.log(`[ClientActivities] No valid email found for job ${jobId}, email not sent`);
  }
}

/**
 * Client Activities Router — CRUD for notes, photos, files, SMS, emails
 * Each activity belongs to a construction job (jobId) and optionally a CRM lead (leadId).
 * Activities can be toggled as "portal visible" to show in the client portal.
 */
export const clientActivitiesRouter = router({
  /**
   * List activities for a construction job (or by leadId)
   */
  list: protectedProcedure
    .input(
      z.object({
        jobId: z.number().optional(),
        leadId: z.number().optional(),
        type: z.enum(["note", "photo", "file", "sms", "email"]).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions: any[] = [];
      if (input.jobId) conditions.push(eq(clientActivities.jobId, input.jobId));
      if (input.leadId) conditions.push(eq(clientActivities.leadId, input.leadId));
      if (input.type) conditions.push(eq(clientActivities.type, input.type));

      if (conditions.length === 0) {
        return { activities: [], total: 0 };
      }

      const where = and(...jobTenantConditions(ctx, ...conditions));
      const limit = input.limit || 100;
      const offset = input.offset || 0;

      const [activities, countResult] = await Promise.all([
        db
          .select({ activity: clientActivities })
          .from(clientActivities)
          .innerJoin(constructionJobs, eq(clientActivities.jobId, constructionJobs.id))
          .where(where)
          .orderBy(desc(clientActivities.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(clientActivities)
          .innerJoin(constructionJobs, eq(clientActivities.jobId, constructionJobs.id))
          .where(where),
      ]);

      return {
        activities: activities.map((row: any) => row.activity),
        total: Number(countResult[0]?.count || 0),
      };
    }),

  /**
   * List portal-visible activities for a job (used by client portal)
   */
  listPortalVisible: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const rows = await db
        .select({ activity: clientActivities })
        .from(clientActivities)
        .innerJoin(constructionJobs, eq(clientActivities.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx,
          eq(clientActivities.jobId, input.jobId),
          eq(clientActivities.portalVisible, true),
        )))
        .orderBy(desc(clientActivities.createdAt));
      return rows.map((row: any) => row.activity);
    }),

  /**
   * Add a new activity (note, photo, file, sms, email)
   */
  add: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        leadId: z.number().optional(),
        type: z.enum(["note", "photo", "file", "sms", "email"]),
        title: z.string().optional(),
        content: z.string().optional(),
        portalVisible: z.boolean().optional(),
        // For file/photo uploads — base64 encoded
        fileData: z.string().optional(),
        fileName: z.string().optional(),
        fileMimeType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const job = await requireJobAccess(db, ctx, input.jobId);
      if (input.leadId && input.leadId !== job.leadId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Activity lead does not match the construction job" });
      }

      let fileUrl: string | null = null;
      let fileKey: string | null = null;

      // Handle file upload if provided
      if (input.fileData && input.fileName) {
        const buffer = Buffer.from(input.fileData, "base64");
        const suffix = crypto.randomBytes(6).toString("hex");
        const ext = input.fileName.split(".").pop() || "bin";
        const key = `activities/${input.jobId}/${suffix}.${ext}`;
        const result = await storagePut(
          key,
          buffer,
          input.fileMimeType || "application/octet-stream"
        );
        fileUrl = result.url;
        fileKey = result.key;
      }

      // If no leadId provided, look up from the job
      const leadId = input.leadId || job.leadId || null;

      const [result] = await db.insert(clientActivities).values({
        jobId: input.jobId,
        leadId,
        type: input.type,
        title: input.title || null,
        content: input.content || null,
        fileUrl,
        fileKey,
        fileName: input.fileName || null,
        fileMimeType: input.fileMimeType || null,
        portalVisible: input.portalVisible ?? false,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name || "Unknown",
      });

      // If activity type is "sms", dispatch the SMS via VocPhone
      if (input.type === "sms" && input.content) {
        dispatchSmsForActivity(db, input.jobId, input.content, tenantIdFromContext(ctx)).catch((err: any) => {
          console.error("[ClientActivities] Failed to dispatch SMS:", err);
        });
      }

      // If activity type is "email", dispatch the email via Resend (with optional attachment)
      if (input.type === "email" && input.content) {
        const emailSubject = input.title || "Message from Altaspan";
        // Build attachments array if file was uploaded
        let emailAttachments: EmailAttachment[] | undefined;
        if (input.fileData && input.fileName) {
          emailAttachments = [{
            filename: input.fileName,
            content: input.fileData,
            contentType: input.fileMimeType || "application/octet-stream",
          }];
        }
        dispatchEmailForActivity(
          db, input.jobId, emailSubject, input.content,
          undefined, emailAttachments, Number(result.insertId), tenantIdFromContext(ctx)
        ).catch((err: any) => {
          console.error("[ClientActivities] Failed to dispatch email:", err);
        });
      }

      // If the activity is portal-visible, notify portal clients via email
      if (input.portalVisible) {
        notifyPortalClientsOfActivity({
          jobId: input.jobId,
          activityType: input.type,
          activityTitle: input.title,
          activityContent: input.content,
          hasAttachment: !!fileUrl,
        }).catch((err) => {
          console.error("[ClientActivities] Failed to send portal notification:", err);
        });

        // Push notification to client portal users
        triggerPushActivityPosted(input.jobId, input.title, input.type);
      }

      return { id: Number(result.insertId), success: true };
    }),

  /**
   * Toggle portal visibility for an activity
   */
  togglePortalVisible: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        portalVisible: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const activity = await requireActivityAccess(db, ctx, input.id);

      await db
        .update(clientActivities)
        .set({ portalVisible: input.portalVisible })
        .where(eq(clientActivities.id, input.id));

      // If toggling ON, notify portal clients via email
      if (input.portalVisible) {
        // Fetch the activity to get details for the email
        notifyPortalClientsOfActivity({
          jobId: activity.jobId,
          activityType: activity.type,
          activityTitle: activity.title,
          activityContent: activity.content,
          hasAttachment: !!activity.fileUrl,
        }).catch((err) => {
          console.error("[ClientActivities] Failed to send portal notification on toggle:", err);
        });
      }

      return { success: true };
    }),

  /**
   * Update an activity (title, content)
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireActivityAccess(db, ctx, input.id);

      const updates: Record<string, any> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.content !== undefined) updates.content = input.content;

      if (Object.keys(updates).length > 0) {
        await db
          .update(clientActivities)
          .set(updates)
          .where(eq(clientActivities.id, input.id));
      }

      return { success: true };
    }),

  /**
   * Delete an activity
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireActivityAccess(db, ctx, input.id);

      await db
        .delete(clientActivities)
        .where(eq(clientActivities.id, input.id));

      return { success: true };
    }),

  /**
   * Get email tracking events for an activity
   */
  getEmailEvents: protectedProcedure
    .input(z.object({ activityId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireActivityAccess(db, ctx, input.activityId);

      return db
        .select()
        .from(emailEvents)
        .where(eq(emailEvents.activityId, input.activityId))
        .orderBy(desc(emailEvents.createdAt));
    }),

  /**
   * Get all email tracking events for a job (summary view)
   */
  getJobEmailEvents: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireJobAccess(db, ctx, input.jobId);

      return db
        .select({
          id: emailEvents.id,
          activityId: emailEvents.activityId,
          resendEmailId: emailEvents.resendEmailId,
          recipientEmail: emailEvents.recipientEmail,
          status: emailEvents.status,
          sentAt: emailEvents.sentAt,
          deliveredAt: emailEvents.deliveredAt,
          openedAt: emailEvents.openedAt,
          clickedAt: emailEvents.clickedAt,
          bouncedAt: emailEvents.bouncedAt,
          openCount: emailEvents.openCount,
          clickCount: emailEvents.clickCount,
        })
        .from(emailEvents)
        .innerJoin(clientActivities, eq(emailEvents.activityId, clientActivities.id))
        .innerJoin(constructionJobs, eq(clientActivities.jobId, constructionJobs.id))
        .where(and(...jobTenantConditions(ctx, eq(clientActivities.jobId, input.jobId))))
        .orderBy(desc(emailEvents.sentAt));
    }),
});
