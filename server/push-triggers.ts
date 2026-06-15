/**
 * Push Notification Triggers
 *
 * Reusable helpers that fire push notifications to portal users
 * when backend events occur (document upload, invoice, plan, schedule, etc.)
 *
 * All functions are fire-and-forget (non-blocking, never throw).
 */

import { getDb } from "./db";
import { portalAccess, tradePortalAccess, constructionInstallers, constructionJobs, constructionAssignments } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sendPushToPortalUser, sendPushToAllUsers, type PushPayload } from "./push";

// ─── Client Portal Push Helpers ──────────────────────────────────────────────

/**
 * Send push to all active client portal users for a given job
 */
export async function pushToClientPortalByJob(jobId: number, payload: PushPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const records = await db
      .select({ id: portalAccess.id })
      .from(portalAccess)
      .where(and(
        eq(portalAccess.constructionJobId, jobId),
        eq(portalAccess.isActive, true)
      ));

    for (const record of records) {
      sendPushToPortalUser("client", record.id, payload).catch(() => {});
    }
  } catch (err) {
    console.error("[PushTrigger] pushToClientPortalByJob error:", err);
  }
}

/**
 * Send push to all active trade portal users for a given installer
 */
export async function pushToTradePortalByInstaller(installerId: number, payload: PushPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const records = await db
      .select({ id: tradePortalAccess.id })
      .from(tradePortalAccess)
      .where(and(
        eq(tradePortalAccess.installerId, installerId),
        eq(tradePortalAccess.isActive, true)
      ));

    for (const record of records) {
      sendPushToPortalUser("trade", record.id, payload).catch(() => {});
    }
  } catch (err) {
    console.error("[PushTrigger] pushToTradePortalByInstaller error:", err);
  }
}

/**
 * Send push to all trade portal users assigned to a specific job
 */
export async function pushToTradePortalByJob(jobId: number, payload: PushPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Find all installers assigned to this job
    const assignments = await db
      .select({ installerId: constructionAssignments.installerId })
      .from(constructionAssignments)
      .where(eq(constructionAssignments.jobId, jobId));

    const installerIds = Array.from(new Set(assignments.map(a => a.installerId)));
    for (const installerId of installerIds) {
      pushToTradePortalByInstaller(installerId, payload).catch(() => {});
    }
  } catch (err) {
    console.error("[PushTrigger] pushToTradePortalByJob error:", err);
  }
}

// ─── Event-Specific Triggers ─────────────────────────────────────────────────

/**
 * Trigger: New document uploaded to client portal
 */
export function triggerPushDocumentUploaded(jobId: number, documentTitle: string): void {
  pushToClientPortalByJob(jobId, {
    title: "New Document Available",
    body: `A new document "${documentTitle}" has been uploaded to your project.`,
    url: "/portal/documents",
    tag: `doc-${jobId}`,
  }).catch(() => {});
}

/**
 * Trigger: New variation created for client portal (shows in invoices tab)
 */
export function triggerPushVariationCreated(jobId: number, variationTitle: string): void {
  pushToClientPortalByJob(jobId, {
    title: "New Variation",
    body: `A new variation "${variationTitle}" has been added to your project.`,
    url: "/portal/invoices",
    tag: `variation-${jobId}`,
  }).catch(() => {});
}

/**
 * Trigger: Plan submitted to client for approval
 */
export function triggerPushPlanSubmitted(jobId: number, planTitle: string): void {
  pushToClientPortalByJob(jobId, {
    title: "Plan Ready for Review",
    body: `"${planTitle}" is ready for your review and approval.`,
    url: "/portal/plans",
    tag: `plan-${jobId}`,
  }).catch(() => {});
}

/**
 * Trigger: New activity/update posted to client portal
 */
export function triggerPushActivityPosted(jobId: number, activityTitle: string | null | undefined, activityType: string): void {
  const typeLabel = activityType.charAt(0).toUpperCase() + activityType.slice(1);
  pushToClientPortalByJob(jobId, {
    title: `New ${typeLabel} Update`,
    body: activityTitle || `A new ${typeLabel.toLowerCase()} has been posted to your project.`,
    url: "/portal/updates",
    tag: `activity-${jobId}`,
  }).catch(() => {});
}

/**
 * Trigger: Shared file uploaded to job (visible to trade portal)
 */
export function triggerPushSharedFileUploaded(jobId: number, fileName: string): void {
  pushToTradePortalByJob(jobId, {
    title: "New Shared File",
    body: `"${fileName}" has been shared with you.`,
    url: "/trade/documents",
    tag: `shared-file-${jobId}`,
  }).catch(() => {});
}

/**
 * Trigger: Schedule event created/updated for an installer
 */
export function triggerPushScheduleEvent(installerId: number, eventTitle: string, eventDate: string, isUpdate: boolean): void {
  pushToTradePortalByInstaller(installerId, {
    title: isUpdate ? "Schedule Updated" : "New Schedule Event",
    body: `${eventTitle} on ${eventDate}`,
    url: "/trade/schedule",
    tag: `schedule-${installerId}`,
  }).catch(() => {});
}

/**
 * Trigger: Remittance advice uploaded for an installer
 */
export function triggerPushRemittanceCreated(installerId: number, amount: string, reference: string | null): void {
  pushToTradePortalByInstaller(installerId, {
    title: "Remittance Advice Available",
    body: `A payment of $${amount}${reference ? ` (Ref: ${reference})` : ""} has been processed.`,
    url: "/trade/remittances",
    tag: `remittance-${installerId}`,
  }).catch(() => {});
}

/**
 * Trigger: Client approved/rejected a plan → notify staff
 */
export function triggerPushPlanDecision(planTitle: string, clientName: string, approved: boolean): void {
  sendPushToAllUsers({
    title: approved ? `Plan Approved` : `Plan Rejected`,
    body: `${clientName} has ${approved ? "approved" : "rejected"} "${planTitle}".`,
    url: "/construction/plans",
    tag: `plan-decision`,
  }).catch(() => {});
}

/**
 * Trigger: Trade invoice submitted → notify staff
 */
export function triggerPushTradeInvoiceSubmitted(installerName: string, invoiceNumber: string, amount: string): void {
  sendPushToAllUsers({
    title: "Trade Invoice Submitted",
    body: `${installerName} submitted invoice ${invoiceNumber} for $${amount}.`,
    url: "/construction/trade-invoices",
    tag: `trade-invoice`,
  }).catch(() => {});
}

/**
 * Trigger: Trade invoice approved → notify installer
 */
export function triggerPushTradeInvoiceApproved(installerId: number, invoiceNumber: string): void {
  pushToTradePortalByInstaller(installerId, {
    title: "Invoice Approved",
    body: `Your invoice ${invoiceNumber} has been approved.`,
    url: "/trade-portal/invoices",
    tag: `invoice-approved-${installerId}`,
  }).catch(() => {});
}

/**
 * Trigger: Trade invoice rejected → notify installer
 */
export function triggerPushTradeInvoiceRejected(installerId: number, invoiceNumber: string, reason?: string | null): void {
  pushToTradePortalByInstaller(installerId, {
    title: "Invoice Rejected",
    body: reason
      ? `Your invoice ${invoiceNumber} was rejected: ${reason}`
      : `Your invoice ${invoiceNumber} was rejected. Please check for details.`,
    url: "/trade-portal/invoices",
    tag: `invoice-rejected-${installerId}`,
  }).catch(() => {});
}

/**
 * Trigger: News article published → notify all trade portal users
 */
export async function triggerPushTradeNewsPublished(newsTitle: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Get all active trade portal access records
    const records = await db
      .select({ id: tradePortalAccess.id })
      .from(tradePortalAccess)
      .where(eq(tradePortalAccess.isActive, true));

    for (const record of records) {
      sendPushToPortalUser("trade", record.id, {
        title: "New News Article",
        body: newsTitle,
        url: "/trade/news",
        tag: "trade-news",
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[PushTrigger] triggerPushTradeNewsPublished error:", err);
  }
}

/**
 * Trigger: Client news article published → notify all client portal users
 */
export async function triggerPushClientNewsPublished(newsTitle: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Get all active client portal access records
    const records = await db
      .select({ id: portalAccess.id })
      .from(portalAccess)
      .where(eq(portalAccess.isActive, true));

    for (const record of records) {
      sendPushToPortalUser("client", record.id, {
        title: "New Update",
        body: newsTitle,
        url: "/portal/updates",
        tag: "client-news",
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[PushTrigger] triggerPushClientNewsPublished error:", err);
  }
}
