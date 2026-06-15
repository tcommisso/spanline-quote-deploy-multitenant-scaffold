/**
 * Task Assignment Notifications
 * Sends email + push notifications when tasks are assigned to users.
 */
import { getDb } from "./db";
import { constructionInstallers, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendNotificationEmail } from "./email";
import { notifyOwner } from "./_core/notification";

interface TaskAssignmentParams {
  section: "Inbox" | "Construction" | "Procurement";
  taskTitle: string;
  assignedByName: string;
  // For inbox: user ID directly
  assignedToUserId?: number;
  // For construction: installer ID (need to look up email)
  assignedToInstallerId?: number;
}

/**
 * Sends an email notification to the assigned user when a task is assigned.
 * Also sends a push notification via notifyOwner if the assignee is the owner.
 * Non-blocking: errors are logged but not thrown.
 */
export async function sendTaskAssignmentNotification(params: TaskAssignmentParams): Promise<void> {
  const { section, taskTitle, assignedByName, assignedToUserId, assignedToInstallerId } = params;
  const db = await getDb();
  if (!db) return;

  let recipientEmail: string | null = null;
  let recipientName: string | null = null;

  if (assignedToUserId) {
    // Look up user email directly
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, assignedToUserId))
      .limit(1);
    if (user) {
      recipientEmail = user.email;
      recipientName = user.name;
    }
  } else if (assignedToInstallerId) {
    // Look up installer email
    const [installer] = await db
      .select({ email: constructionInstallers.email, name: constructionInstallers.name })
      .from(constructionInstallers)
      .where(eq(constructionInstallers.id, assignedToInstallerId))
      .limit(1);
    if (installer) {
      recipientEmail = installer.email;
      recipientName = installer.name;
    }
  }

  if (!recipientEmail) {
    console.warn(`[TaskNotify] No email found for ${section} assignee (userId=${assignedToUserId}, installerId=${assignedToInstallerId})`);
    return;
  }

  const sectionLabel = section === "Inbox" ? "Inbox Message" : section === "Construction" ? "Construction Task" : "Purchase Order";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1e293b;">New Task Assigned to You</h2>
      <p style="color: #334155;">${assignedByName} has assigned you a task.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0; width: 120px;">Section:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${sectionLabel}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Task:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${taskTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Assigned by:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${assignedByName}</td>
        </tr>
      </table>
      <p style="color: #334155;">Please log in to review and action this task.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #64748b; font-size: 12px;">This is an automated notification from Altaspan.</p>
    </div>
  `;

  try {
    await sendNotificationEmail({
      to: recipientEmail,
      subject: `Task Assigned: ${taskTitle} (${sectionLabel})`,
      htmlBody,
      fromName: "Altaspan Tasks",
      settingKey: "task_assignment_email",
    });
    console.log(`[TaskNotify] Email sent to ${recipientName || recipientEmail} for ${section} task: ${taskTitle}`);
  } catch (err: any) {
    console.error(`[TaskNotify] Email failed for ${recipientEmail}:`, err?.message);
  }

  // Also send push notification via notifyOwner (for owner visibility)
  try {
    await notifyOwner({
      title: `Task Assigned: ${taskTitle}`,
      content: `${assignedByName} assigned "${taskTitle}" (${sectionLabel}) to ${recipientName || recipientEmail}.`,
      settingKey: "task_assignment_push",
    });
  } catch (err: any) {
    // Push notification is best-effort
    console.warn(`[TaskNotify] Push notification failed:`, err?.message);
  }
}
