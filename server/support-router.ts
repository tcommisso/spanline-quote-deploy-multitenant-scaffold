import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { supportSubmissions, supportSubmissionNotes, users } from "../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { sendNotificationViaGraph } from "./email/send";
import { buildBrandedEmail } from "./email/branded-template";
import { storagePut } from "./storage";
import crypto from "crypto";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  wont_fix: "Won't Fix",
};

export const supportRouter = router({
  // ─── Upload Support Attachment (S3) ─────────────────────────────────────────
  uploadAttachment: protectedProcedure
    .input(z.object({
      filename: z.string().min(1),
      mimeType: z.string().min(1),
      base64Data: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const ext = input.filename.split(".").pop() || "png";
      const randomSuffix = crypto.randomBytes(8).toString("hex");
      const key = `support-attachments/${ctx.user.id}-${randomSuffix}.${ext}`;
      const buffer = Buffer.from(input.base64Data, "base64");
      
      // Limit to 5MB
      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error("File too large. Maximum size is 5MB.");
      }

      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url, filename: input.filename, mimeType: input.mimeType, size: buffer.length };
    }),

  // ─── Submit a Bug Report ────────────────────────────────────────────────────
  submitBug: protectedProcedure
    .input(z.object({
      screen: z.string().min(1, "Screen is required").max(255),
      action: z.string().min(1, "Action/button is required").max(500),
      stepsToReproduce: z.string().min(1, "Steps to reproduce are required"),
      expectedBehaviour: z.string().min(1, "Expected behaviour is required"),
      actualBehaviour: z.string().min(1, "Actual behaviour is required"),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      attachments: z.array(z.object({
        url: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(supportSubmissions).values({
        userId: ctx.user.id,
        userName: ctx.user.name,
        userEmail: ctx.user.email,
        type: "bug",
        screen: input.screen,
        action: input.action,
        stepsToReproduce: input.stepsToReproduce,
        expectedBehaviour: input.expectedBehaviour,
        actualBehaviour: input.actualBehaviour,
        description: input.description || null,
        priority: input.priority,
        status: "new",
        attachments: input.attachments && input.attachments.length > 0 ? input.attachments : null,
      });

      const attachmentNote = input.attachments && input.attachments.length > 0
        ? `<p><strong>Attachments:</strong> ${input.attachments.length} file(s) attached</p>`
        : "";

      // Send branded email notification to support@commissogroup.au
      try {
        const subject = `🐛 Bug Report [${input.priority.toUpperCase()}]: ${input.screen}`;
        const htmlBody = buildBrandedEmail({
          subject,
          heading: subject,
          body: `
            <p><strong>Reported by:</strong> ${ctx.user.name || ctx.user.email || "Unknown"}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600; width: 140px;">Screen</td><td style="padding: 8px 12px;">${input.screen}</td></tr>
              <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Action</td><td style="padding: 8px 12px;">${input.action}</td></tr>
              <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Priority</td><td style="padding: 8px 12px;"><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: ${input.priority === 'critical' ? '#fecaca' : input.priority === 'high' ? '#fed7aa' : input.priority === 'medium' ? '#fef08a' : '#d1fae5'}; color: ${input.priority === 'critical' ? '#991b1b' : input.priority === 'high' ? '#9a3412' : input.priority === 'medium' ? '#854d0e' : '#065f46'};">${input.priority.toUpperCase()}</span></td></tr>
            </table>
            <h3 style="margin: 20px 0 8px; font-size: 14px; color: #374151;">Steps to Reproduce</h3>
            <div style="background: #f9fafb; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #C9AB57; white-space: pre-wrap; font-size: 14px;">${input.stepsToReproduce}</div>
            <h3 style="margin: 20px 0 8px; font-size: 14px; color: #374151;">Expected Behaviour</h3>
            <div style="background: #f0fdf4; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #22c55e; white-space: pre-wrap; font-size: 14px;">${input.expectedBehaviour}</div>
            <h3 style="margin: 20px 0 8px; font-size: 14px; color: #374151;">Actual Behaviour</h3>
            <div style="background: #fef2f2; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #ef4444; white-space: pre-wrap; font-size: 14px;">${input.actualBehaviour}</div>
            ${input.description ? `<h3 style="margin: 20px 0 8px; font-size: 14px; color: #374151;">Additional Details</h3><div style="background: #f9fafb; padding: 12px 16px; border-radius: 6px; white-space: pre-wrap; font-size: 14px;">${input.description}</div>` : ""}
            ${attachmentNote}
          `,
          footerNote: "This is an automated bug report submitted through the AltaSpan support system.",
        });
        await sendNotificationViaGraph({
          to: "support@commissogroup.au",
          subject,
          htmlBody,
          fromName: "AltaSpan Support",
          module: "admin",
        });
      } catch (e) {
        console.error("[Support] Failed to send bug report notification:", e);
      }

      return { success: true, id: result.insertId };
    }),

  // ─── Submit a Suggestion ────────────────────────────────────────────────────
  submitSuggestion: protectedProcedure
    .input(z.object({
      category: z.enum(["feature", "improvement", "ui_ux", "performance", "other"]),
      title: z.string().min(1, "Title is required").max(500),
      description: z.string().min(1, "Description is required"),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(supportSubmissions).values({
        userId: ctx.user.id,
        userName: ctx.user.name,
        userEmail: ctx.user.email,
        type: "suggestion",
        category: input.category,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: "new",
      });

      // Send branded email notification to support@commissogroup.au
      try {
        const subject = `💡 Suggestion [${input.category}]: ${input.title}`;
        const htmlBody = buildBrandedEmail({
          subject,
          heading: subject,
          body: `
            <p><strong>Submitted by:</strong> ${ctx.user.name || ctx.user.email || "Unknown"}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600; width: 140px;">Category</td><td style="padding: 8px 12px;">${input.category}</td></tr>
              <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Priority</td><td style="padding: 8px 12px;">${input.priority}</td></tr>
              <tr><td style="padding: 8px 12px; background: #f3f4f6; font-weight: 600;">Title</td><td style="padding: 8px 12px; font-weight: 600;">${input.title}</td></tr>
            </table>
            <h3 style="margin: 20px 0 8px; font-size: 14px; color: #374151;">Description</h3>
            <div style="background: #f9fafb; padding: 12px 16px; border-radius: 6px; border-left: 3px solid #C9AB57; white-space: pre-wrap; font-size: 14px;">${input.description}</div>
          `,
          footerNote: "This is an automated suggestion submitted through the AltaSpan support system.",
        });
        await sendNotificationViaGraph({
          to: "support@commissogroup.au",
          subject,
          htmlBody,
          fromName: "AltaSpan Support",
          module: "admin",
        });
      } catch (e) {
        console.error("[Support] Failed to send suggestion notification:", e);
      }

      return { success: true, id: result.insertId };
    }),

  // ─── List Staff (for Assign To dropdown) ───────────────────────────────────
  listStaff: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const staffList = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .orderBy(users.name);
      return staffList;
    }),

  // ─── Assign Submission to Staff (Admin) ────────────────────────────────────
  assignSubmission: adminProcedure
    .input(z.object({
      id: z.number(),
      assignedToUserId: z.number().nullable(),
      assignedToUserName: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(supportSubmissions)
        .set({
          assignedToUserId: input.assignedToUserId,
          assignedToUserName: input.assignedToUserName,
        })
        .where(eq(supportSubmissions.id, input.id));
      return { success: true };
    }),

  // ─── List Submissions (Admin) ───────────────────────────────────────────────
  listSubmissions: adminProcedure
    .input(z.object({
      type: z.enum(["bug", "suggestion"]).optional(),
      status: z.enum(["new", "in_progress", "resolved", "closed", "wont_fix"]).optional(),
      assignedToUserId: z.number().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input?.type) conditions.push(eq(supportSubmissions.type, input.type));
      if (input?.status) conditions.push(eq(supportSubmissions.status, input.status));
      if (input?.assignedToUserId) conditions.push(eq(supportSubmissions.assignedToUserId, input.assignedToUserId));

      const submissions = await db
        .select()
        .from(supportSubmissions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(supportSubmissions.createdAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return submissions;
    }),

  // ─── Update Submission Status (Admin) + Email Notification ─────────────────
  updateStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["new", "in_progress", "resolved", "closed", "wont_fix"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Fetch the submission to get the submitter's email and context
      const [submission] = await db
        .select()
        .from(supportSubmissions)
        .where(eq(supportSubmissions.id, input.id))
        .limit(1);

      if (!submission) throw new Error("Submission not found");

      const oldStatus = submission.status;
      await db.update(supportSubmissions)
        .set({ status: input.status })
        .where(eq(supportSubmissions.id, input.id));

      // Send email notification to the submitter if they have an email
      if (submission.userEmail && oldStatus !== input.status) {
        const typeLabel = submission.type === "bug" ? "Bug Report" : "Suggestion";
        const itemTitle = submission.type === "bug" ? submission.screen : submission.title;
        const newStatusLabel = STATUS_LABELS[input.status] || input.status;

        try {
          await sendNotificationEmail({
            to: submission.userEmail,
            subject: `Your ${typeLabel} status updated: ${newStatusLabel}`,
            htmlBody: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #1a1a1a; margin-bottom: 16px;">Status Update</h2>
                <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
                  Hi ${submission.userName || "there"},
                </p>
                <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
                  Your <strong>${typeLabel}</strong> regarding <strong>"${itemTitle}"</strong> has been updated.
                </p>
                <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0; color: #666; font-size: 13px;">Status changed from</p>
                  <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">
                    ${STATUS_LABELS[oldStatus] || oldStatus} → ${newStatusLabel}
                  </p>
                </div>
                <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
                  ${input.status === "resolved" ? "We believe this has been addressed. If the issue persists, please submit a new report." : ""}
                  ${input.status === "in_progress" ? "Our team is actively working on this." : ""}
                  ${input.status === "wont_fix" ? "After review, we've determined this won't be actioned at this time." : ""}
                  ${input.status === "closed" ? "This item has been closed." : ""}
                </p>
                <p style="color: #999; font-size: 12px; margin-top: 32px;">
                  — The Altaspan Team
                </p>
              </div>
            `,
            fromName: "Altaspan Support",
          });
        } catch (e) {
          // Don't fail the status update if email fails
          console.error("[Support] Failed to send status notification email:", e);
        }
      }

      return { success: true };
    }),

  // ─── Add Note to Submission (Admin) ────────────────────────────────────────
  addNote: adminProcedure
    .input(z.object({
      submissionId: z.number(),
      content: z.string().min(1, "Note content is required").max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(supportSubmissionNotes).values({
        submissionId: input.submissionId,
        userId: ctx.user.id,
        userName: ctx.user.name,
        content: input.content,
      });
      return { success: true, id: result.insertId };
    }),

  // ─── List Notes for a Submission (Admin) ───────────────────────────────────
  listNotes: adminProcedure
    .input(z.object({
      submissionId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const notes = await db
        .select()
        .from(supportSubmissionNotes)
        .where(eq(supportSubmissionNotes.submissionId, input.submissionId))
        .orderBy(desc(supportSubmissionNotes.createdAt));
      return notes;
    }),
});
