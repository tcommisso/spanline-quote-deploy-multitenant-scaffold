import * as inboxDb from "./inbox-db";
import type { InboxTicketChannel, InboxTicketPriority } from "../shared/inbox-ticket";

type OperationalQueue = "construction" | "manufacturing";

export async function createOperationalInboxTicket(params: {
  tenantId: number | null;
  queue: OperationalQueue;
  sourceType: string;
  sourceId: number | string;
  subject: string;
  content: string;
  fromName: string;
  fromAddress?: string | null;
  matchedJobId?: number | null;
  matchedLeadId?: number | null;
  createdBy?: number | null;
  createdByName?: string | null;
  channel?: InboxTicketChannel;
  priority?: InboxTicketPriority;
}) {
  const threadId = `${params.sourceType}-${params.queue}-${params.sourceId}`.slice(0, 128);

  try {
    const { id } = await inboxDb.createInboxMessage({
      tenantId: params.tenantId,
      threadId,
      direction: "inbound",
      resendEmailId: null,
      graphConversationId: null,
      fromAddress: params.fromAddress || `system:${params.sourceType}`,
      fromName: params.fromName,
      toAddresses: JSON.stringify([`${params.queue} inbox`]),
      receivedByAddress: null,
      subject: params.subject,
      htmlBody: null,
      textBody: params.content,
      matchedJobId: params.matchedJobId ?? null,
      matchedLeadId: params.matchedLeadId ?? null,
      matchedClientEmail: null,
      status: "new",
      isRead: false,
      isStarred: false,
      portalVisible: false,
      autoReplySent: false,
      createdBy: params.createdBy ?? null,
      createdByName: params.createdByName || params.fromName,
    });

    await inboxDb.updateTicketMetadata(threadId, {
      queue: params.queue,
      channel: params.channel || "web",
      priority: params.priority || "normal",
      status: "new",
    }, params.tenantId);

    return id;
  } catch (err: any) {
    console.error(
      `[OrderNotifications] Failed to create ${params.queue} inbox ticket for ${params.sourceType} ${params.sourceId}:`,
      err?.message || err,
    );
    return null;
  }
}

function compactLines(lines: Array<string | null | undefined | false>) {
  return lines.filter(Boolean).join("\n");
}

export function flashingOrderNotificationText(order: {
  orderNumber?: string | null;
  clientName?: string | null;
  jobNumber?: string | null;
  siteAddress?: string | null;
  supplierName?: string | null;
  requestedByName?: string | null;
  lineCount?: number | null;
  totalLinealMetres?: string | number | null;
  requestedDeliveryAt?: Date | string | null;
}, intro: string) {
  const requestedDeliveryDate = order.requestedDeliveryAt ? new Date(order.requestedDeliveryAt) : null;
  const deliveryDate = requestedDeliveryDate && Number.isFinite(requestedDeliveryDate.getTime())
    ? requestedDeliveryDate.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })
    : null;
  const totalLinealMetres = order.totalLinealMetres == null ? null : Number(order.totalLinealMetres);

  return compactLines([
    intro,
    "",
    `Order: ${order.orderNumber || "Unknown"}`,
    order.clientName ? `Client: ${order.clientName}` : null,
    order.jobNumber ? `Job: ${order.jobNumber}` : null,
    order.siteAddress ? `Site: ${order.siteAddress}` : null,
    order.supplierName ? `Supplier/trade: ${order.supplierName}` : null,
    order.requestedByName ? `Requested by: ${order.requestedByName}` : null,
    typeof order.lineCount === "number" ? `Lines: ${order.lineCount}` : null,
    totalLinealMetres !== null && Number.isFinite(totalLinealMetres) ? `Total lineal metres: ${totalLinealMetres.toFixed(2)}` : null,
    deliveryDate ? `Requested delivery: ${deliveryDate}` : null,
  ]);
}

export function componentOrderNotificationText(order: {
  orderNumber: number | string;
  requestedBy: string;
  jobNumber: string;
  locationRequired: string;
  dateRequired: string;
  lineCount: number;
  totalExGst: number;
  notes?: string | null;
}) {
  return compactLines([
    "A construction component order has been submitted and needs manufacturing review.",
    "",
    `Order: #${order.orderNumber}`,
    `Requested by: ${order.requestedBy}`,
    `Job: ${order.jobNumber}`,
    `Location: ${order.locationRequired}`,
    `Date required: ${order.dateRequired}`,
    `Lines: ${order.lineCount}`,
    `Total ex GST: $${order.totalExGst.toFixed(2)}`,
    order.notes ? `Notes: ${order.notes}` : null,
  ]);
}
