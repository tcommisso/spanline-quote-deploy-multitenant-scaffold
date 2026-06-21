/**
 * Inbox Database Helpers
 * CRUD operations for the Shared Inbox / Central Email Hub
 */
import { eq, and, desc, like, sql, or, gte, lte, inArray, isNull, isNotNull, asc } from "drizzle-orm";
import { getDb } from "./db";
import {
  inboxMessages, inboxTickets, inboxTicketTags, inboxTicketNotes, inboxReplyTemplates, inboxTicketPresence, inboxTags, inboxMessageTags, emailSignatures, inboxSettings, inboxSlaRules, inboxAddresses,
  crmLeads, portalAccess, constructionJobs, clientActivities, users, tenantMemberships,
  type InboxMessage, type InsertInboxMessage,
  type InboxTicket,
  type InsertInboxReplyTemplate,
  type InboxTag, type InsertInboxTag,
  type EmailSignature, type InsertEmailSignature,
  type InboxSetting, type InsertInboxSetting,
  type InboxSlaRule, type InsertInboxSlaRule,
  type InboxAddress, type InsertInboxAddress,
} from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";
import { appendPrivateTenantScope } from "./private-tenant-scope";
import {
  INBOX_TICKET_STATUS_LABELS,
  deriveInboxTicketState,
  type InboxTicketChannel,
  type InboxTicketPriority,
  type InboxTicketStatus,
  type StoredInboxStatus,
} from "../shared/inbox-ticket";

function addHours(base: Date | string | null | undefined, hours?: number | null): Date | null {
  if (!base || hours == null) return null;
  const date = new Date(base);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function normalizeTicketStatus(status: string | null | undefined): InboxTicketStatus {
  if (
    status === "new" ||
    status === "open" ||
    status === "waiting_customer" ||
    status === "waiting_internal" ||
    status === "customer_replied" ||
    status === "resolved" ||
    status === "closed" ||
    status === "spam"
  ) {
    return status;
  }
  if (status === "replied") return "waiting_customer";
  return "open";
}

function ticketStatusToStoredStatus(status: InboxTicketStatus): StoredInboxStatus {
  if (status === "waiting_customer" || status === "customer_replied") return "replied";
  if (status === "waiting_internal") return "open";
  if (status === "resolved") return "closed";
  return status;
}

function isResolvedTicketStatus(status: InboxTicketStatus) {
  return status === "resolved" || status === "closed";
}

function isTerminalTicketStatus(status: InboxTicketStatus) {
  return isResolvedTicketStatus(status) || status === "spam";
}

function waitingOnForStatus(status: InboxTicketStatus): "customer" | "internal" | "staff" | "none" {
  if (status === "waiting_customer") return "customer";
  if (status === "waiting_internal") return "internal";
  if (isTerminalTicketStatus(status)) return "none";
  return "staff";
}

type SlaMetric = "first_response" | "next_response" | "resolution";
type SlaDueCandidate = { metric: SlaMetric; dueAt: Date | null; baseAt: Date | string | null | undefined };

function chooseEarliestDue(candidates: SlaDueCandidate[]): SlaDueCandidate | null {
  const valid = candidates.filter((candidate) => candidate.dueAt);
  if (valid.length === 0) return null;
  return valid.sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
}

function priorityRank(priority?: string | null) {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "normal") return 2;
  if (priority === "low") return 1;
  return 0;
}

function ticketConditions(threadId: string, tenantId?: number | null) {
  const conditions: any[] = [eq(inboxTickets.threadId, threadId)];
  appendTenantScope(conditions, inboxTickets.tenantId, tenantId);
  return conditions;
}

function ticketPresenceConditions(threadId: string, tenantId?: number | null) {
  const conditions: any[] = [eq(inboxTicketPresence.threadId, threadId)];
  appendTenantScope(conditions, inboxTicketPresence.tenantId, tenantId);
  return conditions;
}

function messageThreadConditions(threadId: string, tenantId?: number | null) {
  const conditions: any[] = [eq(inboxMessages.threadId, threadId)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  return conditions;
}

// ─── Inbox Messages ─────────────────────────────────────────────────────────

export async function syncTicketForThread(threadId: string, tenantId?: number | null): Promise<InboxTicket | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const messages = await db
    .select()
    .from(inboxMessages)
    .where(and(...messageThreadConditions(threadId, tenantId)))
    .orderBy(asc(inboxMessages.createdAt), asc(inboxMessages.id));

  const existingConditions = ticketConditions(threadId, tenantId);
  const [existing] = await db
    .select()
    .from(inboxTickets)
    .where(and(...existingConditions))
    .limit(1);

  if (messages.length === 0) {
    if (existing) {
      await db.delete(inboxTicketTags).where(eq(inboxTicketTags.ticketId, existing.id));
      await db.delete(inboxTicketNotes).where(eq(inboxTicketNotes.ticketId, existing.id));
      await db.delete(inboxTicketPresence).where(and(...ticketPresenceConditions(threadId, tenantId)));
      await db.delete(inboxTickets).where(and(eq(inboxTickets.id, existing.id), ...ticketConditions(threadId, tenantId)));
    }
    return null;
  }

  const first = messages[0] as InboxMessage;
  const latest = messages[messages.length - 1] as InboxMessage;
  const firstInbound = messages.find((message) => message.direction === "inbound") || first;
  const inboundMessages = messages.filter((message) => message.direction === "inbound");
  const outboundMessages = messages.filter((message) => message.direction === "outbound");
  const lastInbound = inboundMessages[inboundMessages.length - 1] || null;
  const lastOutbound = outboundMessages[outboundMessages.length - 1] || null;
  const unreadCount = inboundMessages.filter((message) => !message.isRead).length;
  const derived = deriveInboxTicketState(messages);
  const lastResponderName = latest.direction === "outbound"
    ? latest.createdByName || latest.fromName || null
    : latest.fromName || null;
  const lastResponderEmail = latest.direction === "outbound"
    ? latest.fromAddress || latest.receivedByAddress || null
    : latest.fromAddress || null;

  let status = derived.key;
  const existingStatus = normalizeTicketStatus(existing?.status);
  const hasNewLatestMessage = existing ? latest.id !== existing.latestMessageId : true;
  if (existingStatus === "spam") {
    status = "spam";
  } else if (isResolvedTicketStatus(existingStatus)) {
    status = hasNewLatestMessage && latest.direction === "inbound" ? "customer_replied" : existingStatus;
  } else if (existingStatus === "waiting_internal") {
    if (!hasNewLatestMessage) {
      status = "waiting_internal";
    } else if (latest.direction === "outbound") {
      status = "waiting_customer";
    } else {
      status = latest.direction === "inbound" ? "customer_replied" : "waiting_internal";
    }
  }

  const receivedByAddress = latest.receivedByAddress || firstInbound.receivedByAddress || null;
  const queue = receivedByAddress ? await getQueueForAddress(receivedByAddress, tenantId) : existing?.queue ?? null;
  const priority = existing?.priority || "normal";
  const graphConversationId = latest.graphConversationId
    || messages.find((message) => message.graphConversationId)?.graphConversationId
    || existing?.graphConversationId
    || null;

  const activeSla = await getActiveSlaRule(tenantId, queue, priority);
  const shouldTrackSla = !isTerminalTicketStatus(status);
  const firstResponseDueAt = shouldTrackSla && firstInbound && !lastOutbound
    ? addHours(firstInbound.createdAt, activeSla?.firstResponseHours ?? activeSla?.warningHours ?? 24)
    : null;
  const nextResponseDueAt = shouldTrackSla && latest.direction === "inbound" && lastOutbound
    ? addHours(lastInbound?.createdAt, activeSla?.nextResponseHours ?? activeSla?.warningHours ?? 24)
    : null;
  const resolutionDueAt = shouldTrackSla && firstInbound
    ? addHours(firstInbound.createdAt, activeSla?.resolutionHours ?? activeSla?.escalationHours ?? 72)
    : null;
  const activeDue = chooseEarliestDue([
    { metric: "first_response", dueAt: firstResponseDueAt, baseAt: firstInbound?.createdAt },
    { metric: "next_response", dueAt: nextResponseDueAt, baseAt: lastInbound?.createdAt },
    { metric: "resolution", dueAt: resolutionDueAt, baseAt: firstInbound?.createdAt },
  ]);
  const slaBase = shouldTrackSla ? activeDue?.baseAt || lastInbound?.createdAt || latest.createdAt : null;
  const slaWarningAt = shouldTrackSla ? addHours(slaBase, activeSla?.warningHours) : null;
  const slaDueAt = shouldTrackSla ? activeDue?.dueAt || null : null;
  const now = new Date();
  const slaBreachedAt = slaDueAt && slaDueAt.getTime() <= now.getTime() ? slaDueAt : null;

  const ticketData: any = {
    tenantId: tenantId ?? latest.tenantId ?? null,
    threadId,
    graphConversationId,
    subject: latest.subject || first.subject || null,
    requesterEmail: firstInbound.fromAddress || latest.fromAddress || null,
    requesterName: firstInbound.fromName || latest.fromName || null,
    receivedByAddress,
    queue,
    channel: existing?.channel || "email",
    priority,
    status,
    waitingOn: waitingOnForStatus(status),
    assignedToId: latest.assignedToId ?? existing?.assignedToId ?? null,
    assignedToName: latest.assignedToName ?? existing?.assignedToName ?? null,
    assignedAt: latest.assignedAt ?? existing?.assignedAt ?? null,
    lastResponderName,
    lastResponderEmail,
    matchedJobId: latest.matchedJobId ?? first.matchedJobId ?? existing?.matchedJobId ?? null,
    matchedLeadId: latest.matchedLeadId ?? first.matchedLeadId ?? existing?.matchedLeadId ?? null,
    matchedClientEmail: latest.matchedClientEmail ?? first.matchedClientEmail ?? existing?.matchedClientEmail ?? null,
    firstMessageId: first.id,
    latestMessageId: latest.id,
    latestDirection: latest.direction,
    messageCount: messages.length,
    unreadCount,
    isStarred: messages.some((message) => Boolean(message.isStarred)),
    lastInboundAt: lastInbound?.createdAt ?? null,
    lastOutboundAt: lastOutbound?.createdAt ?? null,
    lastMessageAt: latest.createdAt,
    slaWarningAt,
    slaDueAt,
    slaBreachedAt,
    slaRuleId: activeSla?.id ?? null,
    slaMetric: shouldTrackSla ? activeDue?.metric ?? null : null,
    slaFirstResponseDueAt: firstResponseDueAt,
    slaNextResponseDueAt: nextResponseDueAt,
    slaResolutionDueAt: resolutionDueAt,
    resolvedAt: isResolvedTicketStatus(status) ? (existing?.resolvedAt || now) : null,
    resolvedBy: isResolvedTicketStatus(status) ? existing?.resolvedBy ?? null : null,
    resolvedByName: isResolvedTicketStatus(status) ? existing?.resolvedByName ?? null : null,
    resolutionNotes: existing?.resolutionNotes ?? null,
    closedReason: isTerminalTicketStatus(status) ? existing?.closedReason ?? null : null,
    createdBy: existing?.createdBy ?? latest.createdBy ?? null,
    createdByName: existing?.createdByName ?? latest.createdByName ?? null,
  };

  if (existing) {
    await db.update(inboxTickets).set(ticketData).where(and(eq(inboxTickets.id, existing.id), ...ticketConditions(threadId, tenantId)));
  } else {
    await db.insert(inboxTickets).values(ticketData);
  }

  const [ticket] = await db
    .select()
    .from(inboxTickets)
    .where(and(...ticketConditions(threadId, tenantId)))
    .limit(1);
  if (ticket) {
    const messageIds = messages.map((message) => message.id);
    const messageTagRows = messageIds.length > 0 ? await db
      .select({ tagId: inboxMessageTags.tagId })
      .from(inboxMessageTags)
      .where(inArray(inboxMessageTags.messageId, messageIds)) : [];
    const tagIds = Array.from(new Set(messageTagRows.map((row) => row.tagId)));
    await db.delete(inboxTicketTags).where(eq(inboxTicketTags.ticketId, ticket.id));
    if (tagIds.length > 0) {
      await db.insert(inboxTicketTags).values(tagIds.map((tagId) => ({ ticketId: ticket.id, tagId })));
    }
  }
  return ticket || null;
}

async function syncTicketsForThreads(threadIds: string[], tenantId?: number | null) {
  const uniqueThreadIds = Array.from(new Set(threadIds.filter(Boolean)));
  for (const threadId of uniqueThreadIds) {
    await syncTicketForThreadBestEffort(threadId, tenantId, "bulk thread refresh");
  }
}

async function syncTicketForThreadBestEffort(threadId: string, tenantId?: number | null, source = "message update") {
  try {
    await syncTicketForThread(threadId, tenantId);
  } catch (err: any) {
    console.error(`[Inbox Tickets] ${source} failed for thread ${threadId}:`, err?.message || err);
  }
}

async function getQueueForAddress(address: string, tenantId?: number | null): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = address.toLowerCase().trim();
  const conditions: any[] = [eq(inboxAddresses.address, normalized)];
  appendTenantScope(conditions, inboxAddresses.tenantId, tenantId);
  const [row] = await db
    .select({ module: inboxAddresses.module })
    .from(inboxAddresses)
    .where(and(...conditions))
    .limit(1);
  return row?.module || null;
}

export async function ensureTicketsForTenant(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ticketConditionsForTenant: any[] = [];
  appendTenantScope(ticketConditionsForTenant, inboxTickets.tenantId, tenantId);
  const messageConditions: any[] = [];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);

  const threads = await db
    .select({ threadId: inboxMessages.threadId })
    .from(inboxMessages)
    .where(messageConditions.length ? and(...messageConditions) : undefined)
    .groupBy(inboxMessages.threadId);
  if (threads.length === 0) return;

  const tickets = await db
    .select({ threadId: inboxTickets.threadId, latestMessageId: inboxTickets.latestMessageId })
    .from(inboxTickets)
    .where(ticketConditionsForTenant.length ? and(...ticketConditionsForTenant) : undefined);

  const ticketThreads = new Set(tickets.map((ticket) => ticket.threadId));
  const threadsToSync = threads
    .map((thread) => thread.threadId)
    .filter((threadId) => threadId && !ticketThreads.has(threadId));

  if (threadsToSync.length === 0 && tickets.length >= threads.length) return;

  await syncTicketsForThreads(threadsToSync.length > 0 ? threadsToSync : threads.map((thread) => thread.threadId), tenantId);
}

export async function getTicketByThread(threadId: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await syncTicketForThreadBestEffort(threadId, tenantId, "ticket lookup");
  try {
    const [ticket] = await db
      .select()
      .from(inboxTickets)
      .where(and(...ticketConditions(threadId, tenantId)))
      .limit(1);
    return ticket || null;
  } catch (err: any) {
    console.error(`[Inbox Tickets] ticket lookup failed for thread ${threadId}:`, err?.message || err);
    return null;
  }
}

export async function getTicketTags(ticketId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxTicketTags.ticketId, ticketId)];
  appendTenantScope(conditions, inboxTags.tenantId, tenantId);
  const rows = await db
    .select({ tag: inboxTags })
    .from(inboxTicketTags)
    .innerJoin(inboxTags, eq(inboxTicketTags.tagId, inboxTags.id))
    .where(and(...conditions))
    .orderBy(asc(inboxTags.sortOrder), asc(inboxTags.name));
  return rows.map((row) => row.tag);
}

export async function listTicketNotes(threadId: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ticket = await getTicketByThread(threadId, tenantId);
  if (!ticket) return [];
  const conditions: any[] = [eq(inboxTicketNotes.ticketId, ticket.id)];
  appendTenantScope(conditions, inboxTicketNotes.tenantId, tenantId);
  return db
    .select()
    .from(inboxTicketNotes)
    .where(and(...conditions))
    .orderBy(asc(inboxTicketNotes.createdAt), asc(inboxTicketNotes.id));
}

export async function createTicketNote(
  threadId: string,
  body: string,
  tenantId?: number | null,
  userId?: number | null,
  userName?: string | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ticket = await getTicketByThread(threadId, tenantId);
  if (!ticket) throw new Error("Ticket not found");
  const [result] = await db.insert(inboxTicketNotes).values({
    tenantId: tenantId ?? ticket.tenantId ?? null,
    ticketId: ticket.id,
    body,
    createdBy: userId ?? null,
    createdByName: userName ?? null,
  });
  return { id: (result as any).insertId };
}

export async function listReplyTemplates(filters: {
  tenantId?: number | null;
  activeOnly?: boolean;
  queue?: string | null;
} = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [];
  await appendPrivateTenantScope(conditions, inboxReplyTemplates.tenantId, filters.tenantId);
  if (filters.activeOnly !== false) conditions.push(eq(inboxReplyTemplates.active, true));
  if (filters.queue) {
    conditions.push(or(eq(inboxReplyTemplates.queue, filters.queue), isNull(inboxReplyTemplates.queue)));
  }
  return db
    .select()
    .from(inboxReplyTemplates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(inboxReplyTemplates.sortOrder), asc(inboxReplyTemplates.name));
}

export async function upsertReplyTemplate(
  data: Partial<InsertInboxReplyTemplate> & { id?: number; name: string; bodyHtml: string },
  tenantId?: number | null,
  userId?: number | null,
  userName?: string | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const payload: Partial<InsertInboxReplyTemplate> = {
    tenantId: tenantId ?? null,
    name: data.name,
    queue: data.queue || null,
    category: data.category || null,
    subject: data.subject || null,
    bodyHtml: data.bodyHtml,
    bodyText: data.bodyText || null,
    active: data.active ?? true,
    sortOrder: data.sortOrder ?? 0,
    updatedBy: userId ?? null,
    updatedByName: userName ?? null,
  };
  if (data.id) {
    const conditions: any[] = [eq(inboxReplyTemplates.id, data.id)];
    await appendPrivateTenantScope(conditions, inboxReplyTemplates.tenantId, tenantId);
    await db.update(inboxReplyTemplates).set(payload).where(and(...conditions));
    return { id: data.id };
  }
  const [result] = await db.insert(inboxReplyTemplates).values({
    ...payload,
    createdBy: userId ?? null,
    createdByName: userName ?? null,
  } as InsertInboxReplyTemplate);
  return { id: (result as any).insertId };
}

export async function deleteReplyTemplate(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxReplyTemplates.id, id)];
  await appendPrivateTenantScope(conditions, inboxReplyTemplates.tenantId, tenantId);
  await db.update(inboxReplyTemplates).set({ active: false }).where(and(...conditions));
}

export async function heartbeatTicketPresence(
  threadId: string,
  mode: "viewing" | "replying",
  tenantId?: number | null,
  userId?: number | null,
  userName?: string | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!userId) throw new Error("User required");

  const [existing] = await db
    .select({ id: inboxTicketPresence.id })
    .from(inboxTicketPresence)
    .where(and(
      ...ticketPresenceConditions(threadId, tenantId),
      eq(inboxTicketPresence.userId, userId),
    ))
    .limit(1);

  if (existing) {
    await db.update(inboxTicketPresence).set({
      mode,
      userName: userName ?? null,
      lastSeenAt: new Date(),
    }).where(eq(inboxTicketPresence.id, existing.id));
  } else {
    await db.insert(inboxTicketPresence).values({
      tenantId: tenantId ?? null,
      threadId,
      userId,
      userName: userName ?? null,
      mode,
      lastSeenAt: new Date(),
    });
  }
}

export async function listTicketPresence(
  threadId: string,
  tenantId?: number | null,
  excludeUserId?: number | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const conditions: any[] = [
    ...ticketPresenceConditions(threadId, tenantId),
    gte(inboxTicketPresence.lastSeenAt, cutoff),
  ];
  const rows = await db
    .select()
    .from(inboxTicketPresence)
    .where(and(...conditions))
    .orderBy(desc(inboxTicketPresence.lastSeenAt));
  return rows.filter((row) => row.userId !== excludeUserId);
}

export async function updateTicketMetadata(threadId: string, data: {
  priority?: InboxTicketPriority;
  channel?: InboxTicketChannel;
  status?: InboxTicketStatus;
  resolutionNotes?: string | null;
  closedReason?: string | null;
}, tenantId?: number | null, userId?: number | null, userName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [messageExists] = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(and(...messageThreadConditions(threadId, tenantId)))
    .limit(1);
  if (!messageExists) return null;

  let ticket = await getTicketByThread(threadId, tenantId);

  const patch: any = {};
  if (data.priority) patch.priority = data.priority;
  if (data.channel) patch.channel = data.channel;
  if (data.resolutionNotes !== undefined) patch.resolutionNotes = data.resolutionNotes || null;
  if (data.closedReason !== undefined) patch.closedReason = data.closedReason || null;

  if (data.status) {
    const status = normalizeTicketStatus(data.status);
    patch.status = status;
    patch.waitingOn = waitingOnForStatus(status);
    await db
      .update(inboxMessages)
      .set({ status: ticketStatusToStoredStatus(status) })
      .where(and(...messageThreadConditions(threadId, tenantId)));

    if (isTerminalTicketStatus(status)) {
      patch.resolvedAt = new Date();
      patch.resolvedBy = userId ?? null;
      patch.resolvedByName = userName ?? null;
      patch.closedReason = data.closedReason || (status === "spam" ? "spam" : status);
    } else {
      patch.resolvedAt = null;
      patch.resolvedBy = null;
      patch.resolvedByName = null;
      patch.closedReason = null;
    }
  }

  if (Object.keys(patch).length > 0) {
    if (!ticket) {
      await syncTicketForThreadBestEffort(threadId, tenantId, "ticket metadata repair");
      ticket = await getTicketByThread(threadId, tenantId);
    }
    if (ticket) {
      try {
        await db.update(inboxTickets).set(patch).where(and(eq(inboxTickets.id, ticket.id), ...ticketConditions(threadId, tenantId)));
      } catch (err: any) {
        console.error(`[Inbox Tickets] metadata update failed for thread ${threadId}:`, err?.message || err);
      }
    }
  }
  return (await getTicketByThread(threadId, tenantId)) || ticket || ({ threadId, tenantId: tenantId ?? null } as InboxTicket);
}

export async function createInboxMessage(data: Omit<InsertInboxMessage, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(inboxMessages).values(data);
  await syncTicketForThreadBestEffort(data.threadId, data.tenantId ?? null, "message create");
  return { id: (result as any).insertId };
}

export async function getInboxMessageById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const [msg] = await db.select().from(inboxMessages).where(and(...conditions)).limit(1);
  return msg || null;
}

export async function listInboxMessages(filters: {
  direction?: "inbound" | "outbound";
  status?: string;
  priority?: InboxTicketPriority;
  channel?: InboxTicketChannel;
  slaState?: "breached" | "warning" | "due" | "none";
  assignedToId?: number;
  assignedState?: "unassigned";
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  tagIds?: number[];
  receivedByAddress?: string;
  tenantId?: number | null;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  try {
    await ensureTicketsForTenant(filters.tenantId);

    const conditions: any[] = [];
    appendTenantScope(conditions, inboxTickets.tenantId, filters.tenantId);
    if (filters.direction) conditions.push(eq(inboxTickets.latestDirection, filters.direction));
    if (filters.priority) conditions.push(eq(inboxTickets.priority, filters.priority));
    if (filters.channel) conditions.push(eq(inboxTickets.channel, filters.channel));
    if (filters.slaState === "breached") {
      conditions.push(isNotNull(inboxTickets.slaBreachedAt));
    } else if (filters.slaState === "warning") {
      conditions.push(isNull(inboxTickets.slaBreachedAt), isNotNull(inboxTickets.slaWarningAt), lte(inboxTickets.slaWarningAt, new Date()));
    } else if (filters.slaState === "due") {
      conditions.push(isNull(inboxTickets.slaBreachedAt), isNotNull(inboxTickets.slaDueAt));
    } else if (filters.slaState === "none") {
      conditions.push(isNull(inboxTickets.slaDueAt));
    }
    if (filters.assignedToId !== undefined) conditions.push(eq(inboxTickets.assignedToId, filters.assignedToId));
    if (filters.assignedState === "unassigned") conditions.push(isNull(inboxTickets.assignedToId));
    if (filters.isRead === true) conditions.push(eq(inboxTickets.unreadCount, 0));
    if (filters.isRead === false) conditions.push(sql`${inboxTickets.unreadCount} > 0`);
    if (filters.isStarred !== undefined) conditions.push(eq(inboxTickets.isStarred, filters.isStarred));
    if (filters.receivedByAddress) conditions.push(eq(inboxTickets.receivedByAddress, filters.receivedByAddress));
    if (filters.status) {
      const status = filters.status === "replied" ? "waiting_customer" : filters.status;
      conditions.push(eq(inboxTickets.status, normalizeTicketStatus(status)));
    }
    if (filters.search) {
      conditions.push(
        or(
          like(inboxTickets.subject, `%${filters.search}%`),
          like(inboxTickets.requesterEmail, `%${filters.search}%`),
          like(inboxTickets.requesterName, `%${filters.search}%`),
          like(inboxTickets.matchedClientEmail, `%${filters.search}%`),
        )
      );
    }

    // If filtering by tags, get matching ticket IDs first.
    if (filters.tagIds && filters.tagIds.length > 0) {
      const taggedTickets = await db
        .select({ ticketId: inboxTicketTags.ticketId })
        .from(inboxTicketTags)
        .where(inArray(inboxTicketTags.tagId, filters.tagIds));
      const taggedTicketIds = Array.from(new Set(taggedTickets.map(t => t.ticketId)));
      if (taggedTicketIds.length === 0) return { messages: [], total: 0 };
      conditions.push(inArray(inboxTickets.id, taggedTicketIds));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inboxTickets)
      .where(where);

    const tickets = await db
      .select()
      .from(inboxTickets)
      .where(where)
      .orderBy(desc(inboxTickets.lastMessageAt), desc(inboxTickets.updatedAt))
      .limit(limit)
      .offset(offset);

    if (tickets.length === 0) {
      return listInboxMessagesFromLegacy(filters);
    }

    const latestMessageIds = tickets
      .map((ticket) => ticket.latestMessageId)
      .filter((id): id is number => typeof id === "number");
    const latestMessages = latestMessageIds.length > 0 ? await db
      .select()
      .from(inboxMessages)
      .where(inArray(inboxMessages.id, latestMessageIds)) : [];
    const messagesById = new Map(latestMessages.map((message) => [message.id, message]));
    const fallbackMessagesByThread = new Map<string, InboxMessage>();
    for (const ticket of tickets) {
      if (ticket.latestMessageId && messagesById.has(ticket.latestMessageId)) continue;
      const [latestForThread] = await db
        .select()
        .from(inboxMessages)
        .where(and(...messageThreadConditions(ticket.threadId, filters.tenantId)))
        .orderBy(desc(inboxMessages.createdAt), desc(inboxMessages.id))
        .limit(1);
      if (latestForThread) {
        fallbackMessagesByThread.set(ticket.threadId, latestForThread);
        await syncTicketForThreadBestEffort(ticket.threadId, filters.tenantId, "stale ticket latest message repair");
      }
    }

    const tagRows = await db
      .select({
        ticketId: inboxTicketTags.ticketId,
        id: inboxTags.id,
        tenantId: inboxTags.tenantId,
        name: inboxTags.name,
        color: inboxTags.color,
        description: inboxTags.description,
        active: inboxTags.active,
        sortOrder: inboxTags.sortOrder,
        createdAt: inboxTags.createdAt,
        updatedAt: inboxTags.updatedAt,
      })
      .from(inboxTicketTags)
      .innerJoin(inboxTags, eq(inboxTicketTags.tagId, inboxTags.id))
      .where(inArray(inboxTicketTags.ticketId, tickets.map((ticket) => ticket.id)))
      .orderBy(asc(inboxTags.sortOrder), asc(inboxTags.name));
    const tagsByTicket = new Map<number, InboxTag[]>();
    for (const row of tagRows) {
      const tag = {
        id: row.id,
        tenantId: row.tenantId,
        name: row.name,
        color: row.color,
        description: row.description,
        active: row.active,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
      const bucket = tagsByTicket.get(row.ticketId) || [];
      bucket.push(tag);
      tagsByTicket.set(row.ticketId, bucket);
    }

    const ticketMessages = tickets
      .map((ticket) => {
          const latest = (ticket.latestMessageId ? messagesById.get(ticket.latestMessageId) : null)
            || fallbackMessagesByThread.get(ticket.threadId)
            || null;
          if (!latest) return null;
          const status = normalizeTicketStatus(ticket.status);
          return {
            ...latest,
            threadId: ticket.threadId,
            subject: ticket.subject || latest.subject,
            fromAddress: ticket.requesterEmail || latest.fromAddress,
            fromName: ticket.requesterName || latest.fromName,
            receivedByAddress: ticket.receivedByAddress || latest.receivedByAddress,
            matchedJobId: ticket.matchedJobId ?? latest.matchedJobId,
            matchedLeadId: ticket.matchedLeadId ?? latest.matchedLeadId,
            matchedClientEmail: ticket.matchedClientEmail ?? latest.matchedClientEmail,
            assignedToId: ticket.assignedToId,
            assignedToName: ticket.assignedToName,
            assignedAt: ticket.assignedAt,
            isRead: ticket.unreadCount === 0,
            isStarred: ticket.isStarred,
            createdAt: ticket.lastMessageAt || latest.createdAt,
            ticketId: ticket.id,
            ticketGraphConversationId: ticket.graphConversationId,
            ticketStatus: status,
            ticketStatusLabel: INBOX_TICKET_STATUS_LABELS[status],
            ticketPriority: ticket.priority,
            ticketChannel: ticket.channel,
            ticketQueue: ticket.queue,
            ticketWaitingOn: ticket.waitingOn,
            ticketRequesterEmail: ticket.requesterEmail,
            ticketRequesterName: ticket.requesterName,
            ticketLastResponderName: ticket.lastResponderName,
            ticketLastResponderEmail: ticket.lastResponderEmail,
            ticketLatestDirection: ticket.latestDirection,
            ticketLastInboundAt: ticket.lastInboundAt,
            ticketLastOutboundAt: ticket.lastOutboundAt,
            ticketSlaWarningAt: ticket.slaWarningAt,
            ticketSlaDueAt: ticket.slaDueAt,
            ticketSlaBreachedAt: ticket.slaBreachedAt,
            ticketSlaMetric: ticket.slaMetric,
            ticketSlaFirstResponseDueAt: ticket.slaFirstResponseDueAt,
            ticketSlaNextResponseDueAt: ticket.slaNextResponseDueAt,
            ticketSlaResolutionDueAt: ticket.slaResolutionDueAt,
            ticketResolvedAt: ticket.resolvedAt,
            ticketResolutionNotes: ticket.resolutionNotes,
            threadMessageCount: ticket.messageCount,
            threadUnreadCount: ticket.unreadCount,
            tags: tagsByTicket.get(ticket.id) || [],
          };
        })
        .filter(Boolean);

    if (ticketMessages.length === 0 && Number(totalRow?.count || 0) > 0) {
      return listInboxMessagesFromLegacy(filters);
    }

    return {
      messages: ticketMessages,
      total: Number(totalRow?.count || 0),
    };
  } catch (err: any) {
    console.error("[Inbox Tickets] list failed; falling back to legacy inbox messages:", err?.message || err);
    return listInboxMessagesFromLegacy(filters);
  }
}

async function listInboxMessagesFromLegacy(filters: {
  direction?: "inbound" | "outbound";
  status?: string;
  priority?: InboxTicketPriority;
  channel?: InboxTicketChannel;
  slaState?: "breached" | "warning" | "due" | "none";
  assignedToId?: number;
  assignedState?: "unassigned";
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  tagIds?: number[];
  receivedByAddress?: string;
  tenantId?: number | null;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const conditions: any[] = [];
  appendTenantScope(conditions, inboxMessages.tenantId, filters.tenantId);
  if (filters.direction) conditions.push(eq(inboxMessages.direction, filters.direction));
  if (filters.status) conditions.push(eq(inboxMessages.status, ticketStatusToStoredStatus(normalizeTicketStatus(filters.status))));
  if (filters.assignedToId !== undefined) conditions.push(eq(inboxMessages.assignedToId, filters.assignedToId));
  if (filters.assignedState === "unassigned") conditions.push(isNull(inboxMessages.assignedToId));
  if (filters.isRead !== undefined) conditions.push(eq(inboxMessages.isRead, filters.isRead));
  if (filters.isStarred !== undefined) conditions.push(eq(inboxMessages.isStarred, filters.isStarred));
  if (filters.receivedByAddress) conditions.push(eq(inboxMessages.receivedByAddress, filters.receivedByAddress));
  if (filters.search) {
    conditions.push(
      or(
        like(inboxMessages.subject, `%${filters.search}%`),
        like(inboxMessages.fromAddress, `%${filters.search}%`),
        like(inboxMessages.fromName, `%${filters.search}%`),
        like(inboxMessages.toAddresses, `%${filters.search}%`),
        like(inboxMessages.matchedClientEmail, `%${filters.search}%`),
      )
    );
  }
  if (filters.tagIds && filters.tagIds.length > 0) {
    const taggedMessages = await db
      .select({ messageId: inboxMessageTags.messageId })
      .from(inboxMessageTags)
      .where(inArray(inboxMessageTags.tagId, filters.tagIds));
    const taggedMessageIds = Array.from(new Set(taggedMessages.map(t => t.messageId)));
    if (taggedMessageIds.length === 0) return { messages: [], total: 0 };
    conditions.push(inArray(inboxMessages.id, taggedMessageIds));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inboxMessages)
    .where(where);
  const messages = await db
    .select()
    .from(inboxMessages)
    .where(where)
    .orderBy(desc(inboxMessages.createdAt))
    .limit(limit)
    .offset(offset);

  const messageIds = messages.map((message) => message.id);
  const tagRows = messageIds.length > 0 ? await db
    .select({
      messageId: inboxMessageTags.messageId,
      id: inboxTags.id,
      tenantId: inboxTags.tenantId,
      name: inboxTags.name,
      color: inboxTags.color,
      description: inboxTags.description,
      active: inboxTags.active,
      sortOrder: inboxTags.sortOrder,
      createdAt: inboxTags.createdAt,
      updatedAt: inboxTags.updatedAt,
    })
    .from(inboxMessageTags)
    .innerJoin(inboxTags, eq(inboxMessageTags.tagId, inboxTags.id))
    .where(inArray(inboxMessageTags.messageId, messageIds))
    .orderBy(asc(inboxTags.sortOrder), asc(inboxTags.name)) : [];
  const tagsByMessage = new Map<number, InboxTag[]>();
  for (const row of tagRows) {
    const tag = {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      color: row.color,
      description: row.description,
      active: row.active,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    const bucket = tagsByMessage.get(row.messageId) || [];
    bucket.push(tag);
    tagsByMessage.set(row.messageId, bucket);
  }

  return {
    messages: messages.map((message) => {
      const status = normalizeTicketStatus(message.status);
      return {
        ...message,
        ticketId: null,
        ticketGraphConversationId: message.graphConversationId,
        ticketStatus: status,
        ticketStatusLabel: INBOX_TICKET_STATUS_LABELS[status],
        ticketPriority: "normal",
        ticketChannel: "email",
        ticketSlaWarningAt: null,
        ticketSlaDueAt: null,
        ticketSlaBreachedAt: null,
        ticketSlaMetric: null,
        ticketSlaFirstResponseDueAt: null,
        ticketSlaNextResponseDueAt: null,
        ticketSlaResolutionDueAt: null,
        ticketResolvedAt: null,
        ticketResolutionNotes: null,
        threadMessageCount: 1,
        threadUnreadCount: message.isRead ? 0 : 1,
        tags: tagsByMessage.get(message.id) || [],
      };
    }),
    total: Number(totalRow?.count || 0),
  };
}

export async function getThreadMessages(threadId: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await syncTicketForThreadBestEffort(threadId, tenantId, "thread read");
  const conditions: any[] = [eq(inboxMessages.threadId, threadId)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  return db
    .select()
    .from(inboxMessages)
    .where(and(...conditions))
    .orderBy(asc(inboxMessages.createdAt));
}

export async function updateInboxMessage(id: number, data: Partial<InsertInboxMessage>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const [msg] = await db
    .select({ threadId: inboxMessages.threadId, tenantId: inboxMessages.tenantId })
    .from(inboxMessages)
    .where(and(...conditions))
    .limit(1);
  await db.update(inboxMessages).set(data).where(and(...conditions));
  if (msg) await syncTicketForThreadBestEffort(msg.threadId, msg.tenantId ?? tenantId ?? null, "message update");
}

export async function updateThreadStatus(
  threadId: string,
  status: StoredInboxStatus | InboxTicketStatus,
  tenantId?: number | null,
  userId?: number | null,
  userName?: string | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ticketStatus = normalizeTicketStatus(status);
  await db
    .update(inboxMessages)
    .set({ status: ticketStatusToStoredStatus(ticketStatus) })
    .where(and(...messageThreadConditions(threadId, tenantId)));
  await syncTicketForThreadBestEffort(threadId, tenantId, "thread status");

  const patch: any = { status: ticketStatus, waitingOn: waitingOnForStatus(ticketStatus) };
  if (isTerminalTicketStatus(ticketStatus)) {
    patch.resolvedAt = new Date();
    patch.resolvedBy = userId ?? null;
    patch.resolvedByName = userName ?? null;
    patch.closedReason = ticketStatus === "spam" ? "spam" : ticketStatus;
  } else {
    patch.resolvedAt = null;
    patch.resolvedBy = null;
    patch.resolvedByName = null;
    patch.closedReason = null;
  }
  try {
    await db.update(inboxTickets).set(patch).where(and(...ticketConditions(threadId, tenantId)));
  } catch (err: any) {
    console.error(`[Inbox Tickets] thread status ticket patch failed for ${threadId}:`, err?.message || err);
  }
}

export async function markAsRead(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [inArray(inboxMessages.id, ids)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const messages = await db
    .select({ threadId: inboxMessages.threadId, tenantId: inboxMessages.tenantId })
    .from(inboxMessages)
    .where(and(...conditions));
  await db.update(inboxMessages).set({ isRead: true }).where(and(...conditions));
  await syncTicketsForThreads(messages.map((msg) => msg.threadId), tenantId);
}

export async function markAllAsRead(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.isRead, false)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const messages = await db
    .select({ threadId: inboxMessages.threadId })
    .from(inboxMessages)
    .where(and(...conditions));
  await db.update(inboxMessages).set({ isRead: true }).where(and(...conditions));
  await syncTicketsForThreads(messages.map((msg) => msg.threadId), tenantId);
}

export async function markAsUnread(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [inArray(inboxMessages.id, ids)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const messages = await db
    .select({ threadId: inboxMessages.threadId })
    .from(inboxMessages)
    .where(and(...conditions));
  await db.update(inboxMessages).set({ isRead: false }).where(and(...conditions));
  await syncTicketsForThreads(messages.map((msg) => msg.threadId), tenantId);
}

export async function markThreadsAsRead(threadIds: string[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (threadIds.length === 0) return;
  const conditions: any[] = [inArray(inboxMessages.threadId, threadIds)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  await db.update(inboxMessages).set({ isRead: true }).where(and(...conditions));
  await syncTicketsForThreads(threadIds, tenantId);
}

export async function markThreadsAsUnread(threadIds: string[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (threadIds.length === 0) return;
  const conditions: any[] = [inArray(inboxMessages.threadId, threadIds)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  await db.update(inboxMessages).set({ isRead: false }).where(and(...conditions));
  await syncTicketsForThreads(threadIds, tenantId);
}

export async function toggleStar(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const [msg] = await db.select({
    isStarred: inboxMessages.isStarred,
    threadId: inboxMessages.threadId,
    tenantId: inboxMessages.tenantId,
  }).from(inboxMessages).where(and(...conditions)).limit(1);
  if (!msg) throw new Error("Message not found");
  await db.update(inboxMessages).set({ isStarred: !msg.isStarred }).where(and(...conditions));
  await syncTicketForThreadBestEffort(msg.threadId, msg.tenantId ?? tenantId ?? null, "star toggle");
  return !msg.isStarred;
}

export async function assignMessage(id: number, assignedToId: number | null, assignedToName: string | null, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.id, id)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const [msg] = await db.select({ threadId: inboxMessages.threadId, tenantId: inboxMessages.tenantId }).from(inboxMessages).where(and(...conditions)).limit(1);
  await db.update(inboxMessages).set({
    assignedToId,
    assignedToName,
    assignedAt: assignedToId ? new Date() : null,
  }).where(and(...conditions));
  if (msg) await syncTicketForThreadBestEffort(msg.threadId, msg.tenantId ?? tenantId ?? null, "message assignment");
}

export async function assignThread(threadId: string, assignedToId: number | null, assignedToName: string | null, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessages.threadId, threadId)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  await db.update(inboxMessages).set({
    assignedToId,
    assignedToName,
    assignedAt: assignedToId ? new Date() : null,
  }).where(and(...conditions));
  await syncTicketForThreadBestEffort(threadId, tenantId, "thread assignment");
}

export async function getUnreadCount(userId?: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  try {
    await ensureTicketsForTenant(tenantId);
    const conditions: any[] = [sql`${inboxTickets.unreadCount} > 0`];
    appendTenantScope(conditions, inboxTickets.tenantId, tenantId);
    if (userId) conditions.push(eq(inboxTickets.assignedToId, userId));
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inboxTickets)
      .where(and(...conditions));
    return result?.count || 0;
  } catch (err: any) {
    console.error("[Inbox Tickets] unread count failed; falling back to unread messages:", err?.message || err);
    const conditions: any[] = [eq(inboxMessages.isRead, false)];
    appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
    if (userId) conditions.push(eq(inboxMessages.assignedToId, userId));
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inboxMessages)
      .where(and(...conditions));
    return result?.count || 0;
  }
}

// ─── Auto-routing: match email to client/job ────────────────────────────────

export async function matchEmailToClient(fromEmail: string, tenantId?: number | null): Promise<{
  matchedJobId: number | null;
  matchedLeadId: number | null;
  matchedClientEmail: string | null;
  clientName: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const email = fromEmail.toLowerCase().trim();

  // 1. Check portal_access (active clients with portal)
  const portalConditions: any[] = [eq(portalAccess.clientEmail, email), eq(portalAccess.isActive, true)];
  appendTenantScope(portalConditions, portalAccess.tenantId, tenantId);
  const [portalMatch] = await db
    .select({
      jobId: portalAccess.constructionJobId,
      clientEmail: portalAccess.clientEmail,
      clientName: portalAccess.clientName,
    })
    .from(portalAccess)
    .where(and(...portalConditions))
    .limit(1);

  if (portalMatch) {
    // Find the lead linked to this job
    const jobConditions: any[] = [eq(constructionJobs.id, portalMatch.jobId)];
    appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
    const [job] = await db
      .select({ leadId: constructionJobs.leadId })
      .from(constructionJobs)
      .where(and(...jobConditions))
      .limit(1);
    return {
      matchedJobId: portalMatch.jobId,
      matchedLeadId: job?.leadId || null,
      matchedClientEmail: portalMatch.clientEmail,
      clientName: portalMatch.clientName || null,
    };
  }

  // 2. Check crm_leads by contactEmail
  const leadConditions: any[] = [eq(crmLeads.contactEmail, email)];
  appendTenantScope(leadConditions, crmLeads.tenantId, tenantId);
  const [leadMatch] = await db
    .select({
      id: crmLeads.id,
      contactEmail: crmLeads.contactEmail,
      contactFirstName: crmLeads.contactFirstName,
      contactLastName: crmLeads.contactLastName,
      constructionJobNumber: crmLeads.constructionJobNumber,
    })
    .from(crmLeads)
    .where(and(...leadConditions))
    .orderBy(desc(crmLeads.createdAt))
    .limit(1);

  if (leadMatch) {
    // Try to find a construction job linked to this lead
    const jobConditions: any[] = [eq(constructionJobs.leadId, leadMatch.id)];
    appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);
    const [job] = await db
      .select({ id: constructionJobs.id })
      .from(constructionJobs)
      .where(and(...jobConditions))
      .limit(1);
    return {
      matchedJobId: job?.id || null,
      matchedLeadId: leadMatch.id,
      matchedClientEmail: leadMatch.contactEmail,
      clientName: [leadMatch.contactFirstName, leadMatch.contactLastName].filter(Boolean).join(" ") || null,
    };
  }

  return null;
}

// ─── Tags ───────────────────────────────────────────────────────────────────

export async function listTags(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxTags.active, true)];
  appendTenantScope(conditions, inboxTags.tenantId, tenantId);
  return db.select().from(inboxTags).where(and(...conditions)).orderBy(asc(inboxTags.sortOrder));
}

export async function createTag(data: Omit<InsertInboxTag, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(inboxTags).values(data);
  return { id: (result as any).insertId };
}

export async function updateTag(id: number, data: Partial<InsertInboxTag>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxTags.id, id)];
  appendTenantScope(conditions, inboxTags.tenantId, tenantId);
  await db.update(inboxTags).set(data).where(and(...conditions));
}

export async function deleteTag(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxTags.id, id)];
  appendTenantScope(conditions, inboxTags.tenantId, tenantId);
  await db.update(inboxTags).set({ active: false }).where(and(...conditions));
}

export async function getMessageTags(messageId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxMessageTags.messageId, messageId)];
  appendTenantScope(conditions, inboxTags.tenantId, tenantId);
  const rows = await db
    .select({ tag: inboxTags })
    .from(inboxMessageTags)
    .innerJoin(inboxTags, eq(inboxMessageTags.tagId, inboxTags.id))
    .where(and(...conditions));
  return rows.map(r => r.tag);
}

export async function addTagToMessage(messageId: number, tagId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tagConditions: any[] = [eq(inboxTags.id, tagId), eq(inboxTags.active, true)];
  appendTenantScope(tagConditions, inboxTags.tenantId, tenantId);
  const [visibleTag] = await db.select({ id: inboxTags.id }).from(inboxTags).where(and(...tagConditions)).limit(1);
  if (!visibleTag) throw new Error("Tag not found");

  const messageConditions: any[] = [eq(inboxMessages.id, messageId)];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);
  const [visibleMessage] = await db.select({
    id: inboxMessages.id,
    threadId: inboxMessages.threadId,
    tenantId: inboxMessages.tenantId,
  }).from(inboxMessages).where(and(...messageConditions)).limit(1);
  if (!visibleMessage) throw new Error("Message not found");

  // Check if already exists
  const [existing] = await db
    .select()
    .from(inboxMessageTags)
    .where(and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId)))
    .limit(1);
  if (existing) return;
  await db.insert(inboxMessageTags).values({ messageId, tagId });
  await syncTicketForThreadBestEffort(visibleMessage.threadId, visibleMessage.tenantId ?? tenantId ?? null, "message tag add");
}

export async function removeTagFromMessage(messageId: number, tagId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tagConditions: any[] = [eq(inboxTags.id, tagId)];
  appendTenantScope(tagConditions, inboxTags.tenantId, tenantId);
  const [visibleTag] = await db.select({ id: inboxTags.id }).from(inboxTags).where(and(...tagConditions)).limit(1);
  if (!visibleTag) return;

  const messageConditions: any[] = [eq(inboxMessages.id, messageId)];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);
  const [visibleMessage] = await db.select({
    id: inboxMessages.id,
    threadId: inboxMessages.threadId,
    tenantId: inboxMessages.tenantId,
  }).from(inboxMessages).where(and(...messageConditions)).limit(1);
  if (!visibleMessage) return;

  await db.delete(inboxMessageTags).where(
    and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId))
  );
  await syncTicketForThreadBestEffort(visibleMessage.threadId, visibleMessage.tenantId ?? tenantId ?? null, "message tag remove");
}

// ─── Email Signatures ───────────────────────────────────────────────────────

export async function getUserSignatures(userId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(emailSignatures.userId, userId)];
  appendTenantScope(conditions, emailSignatures.tenantId, tenantId);
  return db.select().from(emailSignatures).where(and(...conditions)).orderBy(desc(emailSignatures.isDefault));
}

export async function getDefaultSignature(userId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Get all user signatures to check schedule-based selection
  const conditions: any[] = [eq(emailSignatures.userId, userId)];
  appendTenantScope(conditions, emailSignatures.tenantId, tenantId);
  const userSigs = await db
    .select()
    .from(emailSignatures)
    .where(and(...conditions));
  
  if (userSigs.length > 0) {
    const isBusinessHours = checkIsBusinessHours();
    // First try to find a schedule-specific signature
    const scheduledSig = userSigs.find(s => {
      if (isBusinessHours && s.schedule === "business_hours") return true;
      if (!isBusinessHours && s.schedule === "out_of_office") return true;
      return false;
    });
    if (scheduledSig) return scheduledSig;
    // Fall back to 'always' default
    const defaultSig = userSigs.find(s => s.isDefault && (s.schedule === "always" || !s.schedule));
    if (defaultSig) return defaultSig;
    // Fall back to any default
    const anyDefault = userSigs.find(s => s.isDefault);
    if (anyDefault) return anyDefault;
  }
  // Fall back to company-wide default signature if user has no personal default
  return getCompanyDefaultSignature(tenantId);
}

/** Check if current time is within business hours (Mon-Fri 8am-6pm Australia/Sydney, DST-aware) */
function checkIsBusinessHours(): boolean {
  const now = new Date();
  // Use Intl to get the correct local time in Australia/Sydney (handles DST)
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  // Weekend check
  if (weekday === "Sat" || weekday === "Sun") return false;
  // Business hours: 8am-6pm
  if (hour < 8 || hour >= 18) return false;
  return true;
}

export async function getCompanyDefaultSignature(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [eq(inboxSettings.settingKey, "company_default_signature")];
  appendTenantScope(conditions, inboxSettings.tenantId, tenantId);
  const [row] = await db
    .select()
    .from(inboxSettings)
    .where(and(...conditions))
    .limit(1);
  if (!row || !row.settingValue) return null;
  try {
    const parsed = JSON.parse(row.settingValue);
    return {
      id: 0,
      userId: 0,
      name: parsed.name || "Company Default",
      htmlContent: parsed.htmlContent || "",
      isDefault: true,
      isCompanyDefault: true,
      createdAt: row.updatedAt,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

export async function setCompanyDefaultSignature(name: string, htmlContent: string, updatedBy: number, tenantId?: number | null) {
  await setSetting("company_default_signature", JSON.stringify({ name, htmlContent }), updatedBy, tenantId);
}

export async function upsertSignature(data: Omit<InsertEmailSignature, "id">, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // If setting as default, unset other defaults for this user
  if (data.isDefault) {
    const conditions: any[] = [eq(emailSignatures.userId, data.userId)];
    appendTenantScope(conditions, emailSignatures.tenantId, tenantId);
    await db.update(emailSignatures).set({ isDefault: false }).where(and(...conditions));
  }
  const [result] = await db.insert(emailSignatures).values(data);
  return { id: (result as any).insertId };
}

export async function updateSignature(id: number, userId: number, data: Partial<InsertEmailSignature>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.isDefault) {
    const defaultConditions: any[] = [eq(emailSignatures.userId, userId)];
    appendTenantScope(defaultConditions, emailSignatures.tenantId, tenantId);
    await db.update(emailSignatures).set({ isDefault: false }).where(and(...defaultConditions));
  }
  const conditions: any[] = [eq(emailSignatures.id, id), eq(emailSignatures.userId, userId)];
  appendTenantScope(conditions, emailSignatures.tenantId, tenantId);
  await db.update(emailSignatures).set(data).where(and(...conditions));
}

export async function deleteSignature(id: number, userId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(emailSignatures.id, id), eq(emailSignatures.userId, userId)];
  appendTenantScope(conditions, emailSignatures.tenantId, tenantId);
  await db.delete(emailSignatures).where(and(...conditions));
}

export async function duplicateCompanySignatureToUsers(name: string, htmlContent: string, forceAll = false, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Get all staff users
  const staffUsers = await listStaffUsers(tenantId);
  // Get users who already have at least one signature
  const signatureConditions: any[] = [];
  appendTenantScope(signatureConditions, emailSignatures.tenantId, tenantId);
  const existingSignatures = await db
    .select({ userId: emailSignatures.userId })
    .from(emailSignatures)
    .where(signatureConditions.length ? and(...signatureConditions) : undefined);
  const usersWithSig = new Set(existingSignatures.map(s => s.userId));
  let created = 0;
  for (const user of staffUsers) {
    if (forceAll || !usersWithSig.has(user.id)) {
      await db.insert(emailSignatures).values({
        tenantId: tenantId ?? null,
        userId: user.id,
        name,
        htmlContent,
        isDefault: true,
        schedule: "always",
      });
      created++;
    }
  }
  return { created, skipped: staffUsers.length - created, total: staffUsers.length };
}

export async function getSignatureAnalytics(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const staffUsers = await listStaffUsers(tenantId);
  const signatureConditions: any[] = [];
  appendTenantScope(signatureConditions, emailSignatures.tenantId, tenantId);
  const allSignatures = await db
    .select()
    .from(emailSignatures)
    .where(signatureConditions.length ? and(...signatureConditions) : undefined);
  const sigsByUser = new Map<number, typeof allSignatures>();
  for (const sig of allSignatures) {
    if (!sigsByUser.has(sig.userId)) sigsByUser.set(sig.userId, []);
    sigsByUser.get(sig.userId)!.push(sig);
  }
  const analytics = staffUsers.map(user => {
    const userSigs = sigsByUser.get(user.id) || [];
    const hasPersonal = userSigs.length > 0;
    const defaultSig = userSigs.find(s => s.isDefault);
    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.role,
      hasPersonalSignature: hasPersonal,
      signatureCount: userSigs.length,
      defaultSignatureName: defaultSig?.name || null,
      usesCompanyDefault: !hasPersonal,
    };
  });
  return {
    totalStaff: staffUsers.length,
    withPersonal: analytics.filter(a => a.hasPersonalSignature).length,
    usingCompanyDefault: analytics.filter(a => a.usesCompanyDefault).length,
    users: analytics,
  };
}

// ─── Inbox Settings ─────────────────────────────────────────────────────────

export async function getSetting(key: string, tenantId?: number | null): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [eq(inboxSettings.settingKey, key)];
  appendTenantScope(conditions, inboxSettings.tenantId, tenantId);
  const [row] = await db.select().from(inboxSettings).where(and(...conditions)).limit(1);
  return row?.settingValue || null;
}

export async function setSetting(key: string, value: string, updatedBy?: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Upsert
  const conditions: any[] = [eq(inboxSettings.settingKey, key)];
  appendTenantScope(conditions, inboxSettings.tenantId, tenantId);
  const [existing] = await db.select().from(inboxSettings).where(and(...conditions)).limit(1);
  if (existing) {
    await db.update(inboxSettings).set({ settingValue: value, updatedBy }).where(eq(inboxSettings.id, existing.id));
  } else {
    await db.insert(inboxSettings).values({ tenantId: tenantId ?? null, settingKey: key, settingValue: value, updatedBy });
  }
}

export async function getAllSettings(tenantId?: number | null): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const conditions: any[] = [];
  appendTenantScope(conditions, inboxSettings.tenantId, tenantId);
  const rows = await db.select().from(inboxSettings).where(conditions.length ? and(...conditions) : undefined);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.settingKey] = row.settingValue;
  return result;
}

// ─── SLA Rules ──────────────────────────────────────────────────────────────

export async function listSlaRules(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [];
  appendTenantScope(conditions, inboxSlaRules.tenantId, tenantId);
  return db.select().from(inboxSlaRules).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(inboxSlaRules.id));
}

export async function getActiveSlaRule(
  tenantId?: number | null,
  queue?: string | null,
  priority?: InboxTicketPriority | string | null,
): Promise<InboxSlaRule | null> {
  const db = await getDb();
  if (!db) return null;
  const conditions: any[] = [eq(inboxSlaRules.active, true)];
  appendTenantScope(conditions, inboxSlaRules.tenantId, tenantId);
  const rules = await db.select().from(inboxSlaRules).where(and(...conditions)).orderBy(asc(inboxSlaRules.id));
  if (rules.length === 0) return null;
  const normalizedQueue = queue || null;
  const normalizedPriority = priority || null;
  const candidates = rules.filter((rule) => {
    const ruleQueue = (rule as any).queue || null;
    const rulePriority = (rule as any).priority || null;
    return (!ruleQueue || ruleQueue === normalizedQueue) && (!rulePriority || rulePriority === normalizedPriority);
  });
  const pool = candidates.length > 0 ? candidates : rules.filter((rule) => !(rule as any).queue && !(rule as any).priority);
  return [...pool].sort((a, b) => {
    const aSpecificity = ((a as any).queue ? 2 : 0) + ((a as any).priority ? 1 : 0);
    const bSpecificity = ((b as any).queue ? 2 : 0) + ((b as any).priority ? 1 : 0);
    if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
    return priorityRank((b as any).priority) - priorityRank((a as any).priority);
  })[0] || null;
}

export async function upsertSlaRule(data: Omit<InsertInboxSlaRule, "id"> & { id?: number }, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.id) {
    const { id, ...rest } = data;
    const conditions: any[] = [eq(inboxSlaRules.id, id)];
    appendTenantScope(conditions, inboxSlaRules.tenantId, tenantId);
    await db.update(inboxSlaRules).set(rest).where(and(...conditions));
    return { id };
  }
  const [result] = await db.insert(inboxSlaRules).values({ ...data, tenantId: tenantId ?? null });
  return { id: (result as any).insertId };
}

export async function deleteSlaRule(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxSlaRules.id, id)];
  appendTenantScope(conditions, inboxSlaRules.tenantId, tenantId);
  await db.delete(inboxSlaRules).where(and(...conditions));
}

// ─── SLA Check: get messages breaching SLA ──────────────────────────────────

export async function getMessagesBreachingSla(tenantId?: number | null): Promise<Array<InboxMessage & { slaLevel: "warning" | "escalation" }>> {
  const db = await getDb();
  if (!db) return [];

  const rule = await getActiveSlaRule(tenantId);
  if (!rule) return [];

  const now = Date.now();
  const warningCutoff = new Date(now - rule.warningHours * 60 * 60 * 1000);
  const escalationCutoff = new Date(now - rule.escalationHours * 60 * 60 * 1000);

  // Get inbound messages that are not closed/replied/spam
  const conditions: any[] = [
    eq(inboxMessages.direction, "inbound"),
    or(eq(inboxMessages.status, "new"), eq(inboxMessages.status, "open")),
    lte(inboxMessages.createdAt, warningCutoff),
  ];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);

  const openMessages = await db
    .select()
    .from(inboxMessages)
    .where(and(...conditions))
    .orderBy(asc(inboxMessages.createdAt));

  return openMessages.map(msg => {
    const msgTime = new Date(msg.createdAt).getTime();
    const slaLevel = msgTime <= escalationCutoff.getTime() ? "escalation" as const : "warning" as const;
    return { ...msg, slaLevel };
  });
}

// ─── Users list (for assignment picker) ─────────────────────────────────────

export async function listStaffUsers(tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const roleCondition = or(
    eq(users.role, "admin"),
    eq(users.role, "super_admin"),
    eq(users.role, "office_user"),
    eq(users.role, "design_adviser"),
    eq(users.role, "construction_user"),
  );
  if (!tenantId) {
    return db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(roleCondition)
      .orderBy(asc(users.name));
  }
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
    .where(and(eq(tenantMemberships.tenantId, tenantId), roleCondition))
    .orderBy(asc(users.name));
}

// ─── Create activity on matched client ──────────────────────────────────────

export async function createEmailActivity(params: {
  jobId: number;
  leadId?: number | null;
  subject: string;
  fromEmail: string;
  snippet: string;
  inboxMessageId: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const content = `Email from ${params.fromEmail}: ${params.subject}\n\n${params.snippet}`;
  const [result] = await db.insert(clientActivities).values({
    jobId: params.jobId,
    leadId: params.leadId || null,
    type: "email",
    title: `Inbound Email: ${params.subject || "(no subject)"}`,
    content: content.slice(0, 2000),
    portalVisible: false,
    createdBy: 0, // system
    createdByName: "System (Inbox)",
  });
  return { id: (result as any).insertId };
}

// ─── Inbox Addresses (multiple receiving addresses) ────────────────────────

export async function listInboxAddresses(activeOnly = true, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [];
  appendTenantScope(conditions, inboxAddresses.tenantId, tenantId);
  if (activeOnly) conditions.push(eq(inboxAddresses.active, true));
  return db
    .select()
    .from(inboxAddresses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(inboxAddresses.sortOrder));
}

export async function getInboxAddressByEmail(email: string, tenantId?: number | null): Promise<InboxAddress | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = email.toLowerCase().trim();
  const conditions: any[] = [eq(inboxAddresses.address, normalized)];
  appendTenantScope(conditions, inboxAddresses.tenantId, tenantId);
  const [row] = await db
    .select()
    .from(inboxAddresses)
    .where(and(...conditions))
    .limit(1);
  return row || null;
}

export async function createInboxAddress(data: Omit<InsertInboxAddress, "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(inboxAddresses).values({ ...data, address: data.address.toLowerCase().trim() });
  return { id: (result as any).insertId };
}

export async function updateInboxAddress(id: number, data: Partial<InsertInboxAddress>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.address) data.address = data.address.toLowerCase().trim();
  const conditions: any[] = [eq(inboxAddresses.id, id)];
  appendTenantScope(conditions, inboxAddresses.tenantId, tenantId);
  await db.update(inboxAddresses).set(data).where(and(...conditions));
}

export async function deleteInboxAddress(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [eq(inboxAddresses.id, id)];
  appendTenantScope(conditions, inboxAddresses.tenantId, tenantId);
  await db.delete(inboxAddresses).where(and(...conditions));
}

/**
 * Find the inbox address rule that matches a receiving "to" address.
 * Extracts the local part from the full email and matches against configured addresses.
 */
export async function matchReceivingAddress(toAddresses: string[], tenantId?: number | null): Promise<InboxAddress | null> {
  const db = await getDb();
  if (!db) return null;

  const conditions: any[] = [eq(inboxAddresses.active, true)];
  appendTenantScope(conditions, inboxAddresses.tenantId, tenantId);
  const activeAddresses = await db
    .select()
    .from(inboxAddresses)
    .where(and(...conditions));

  if (activeAddresses.length === 0) return null;

  // Normalize all "to" addresses
  const normalizedTo = toAddresses.map(a => a.toLowerCase().trim());

  // Match against configured addresses
  for (const addr of activeAddresses) {
    const configuredEmail = addr.address.toLowerCase().trim();
    if (normalizedTo.some(to => to === configuredEmail || to.includes(configuredEmail))) {
      return addr;
    }
  }

  return null;
}


// ─── Bulk Operations ──────────────────────────────────────────────────────────

export async function bulkDeleteMessages(ids: number[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const messageConditions: any[] = [inArray(inboxMessages.id, ids)];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);
  const ownedMessages = await db.select({ id: inboxMessages.id, threadId: inboxMessages.threadId }).from(inboxMessages).where(and(...messageConditions));
  const ownedIds = ownedMessages.map(row => row.id);
  if (ownedIds.length === 0) return;
  // Delete associated tags first
  await db.delete(inboxMessageTags).where(inArray(inboxMessageTags.messageId, ownedIds));
  // Delete messages
  await db.delete(inboxMessages).where(inArray(inboxMessages.id, ownedIds));
  await syncTicketsForThreads(ownedMessages.map((row) => row.threadId), tenantId);
}

export async function bulkDeleteThreads(threadIds: string[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (threadIds.length === 0) return 0;
  const messageConditions: any[] = [inArray(inboxMessages.threadId, threadIds)];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);
  const ownedMessages = await db
    .select({ id: inboxMessages.id, threadId: inboxMessages.threadId })
    .from(inboxMessages)
    .where(and(...messageConditions));
  const ownedIds = ownedMessages.map(row => row.id);
  if (ownedIds.length === 0) return 0;
  const ownedThreadIds = Array.from(new Set(ownedMessages.map(row => row.threadId)));

  try {
    const ticketConditionsForDelete: any[] = [inArray(inboxTickets.threadId, ownedThreadIds)];
    appendTenantScope(ticketConditionsForDelete, inboxTickets.tenantId, tenantId);
    const ownedTickets = await db
      .select({ id: inboxTickets.id })
      .from(inboxTickets)
      .where(and(...ticketConditionsForDelete));
    const ownedTicketIds = ownedTickets.map((row) => row.id);
    if (ownedTicketIds.length > 0) {
      await db.delete(inboxTicketTags).where(inArray(inboxTicketTags.ticketId, ownedTicketIds));
      await db.delete(inboxTicketNotes).where(inArray(inboxTicketNotes.ticketId, ownedTicketIds));
      await db.delete(inboxTickets).where(inArray(inboxTickets.id, ownedTicketIds));
    }
    const presenceConditions: any[] = [inArray(inboxTicketPresence.threadId, ownedThreadIds)];
    appendTenantScope(presenceConditions, inboxTicketPresence.tenantId, tenantId);
    await db.delete(inboxTicketPresence).where(and(...presenceConditions));
  } catch (err: any) {
    console.error("[Inbox Tickets] bulk thread ticket cleanup failed:", err?.message || err);
  }

  await db.delete(inboxMessageTags).where(inArray(inboxMessageTags.messageId, ownedIds));
  await db.delete(inboxMessages).where(inArray(inboxMessages.id, ownedIds));
  return ownedThreadIds.length;
}

export async function bulkAssignMessages(ids: number[], assignedToId: number | null, assignedToName: string | null, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [inArray(inboxMessages.id, ids)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  const messages = await db.select({ threadId: inboxMessages.threadId }).from(inboxMessages).where(and(...conditions));
  await db.update(inboxMessages).set({
    assignedToId,
    assignedToName,
    assignedAt: assignedToId ? new Date() : null,
  }).where(and(...conditions));
  await syncTicketsForThreads(messages.map((msg) => msg.threadId), tenantId);
}

export async function bulkAssignThreads(threadIds: string[], assignedToId: number | null, assignedToName: string | null, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (threadIds.length === 0) return 0;
  const conditions: any[] = [inArray(inboxMessages.threadId, threadIds)];
  appendTenantScope(conditions, inboxMessages.tenantId, tenantId);
  await db.update(inboxMessages).set({
    assignedToId,
    assignedToName,
    assignedAt: assignedToId ? new Date() : null,
  }).where(and(...conditions));
  await syncTicketsForThreads(threadIds, tenantId);
  return threadIds.length;
}

export async function bulkUpdateTickets(
  threadIds: string[],
  data: {
    priority?: InboxTicketPriority;
    channel?: InboxTicketChannel;
    status?: InboxTicketStatus;
    resolutionNotes?: string | null;
    closedReason?: string | null;
  },
  tenantId?: number | null,
  userId?: number | null,
  userName?: string | null,
) {
  const uniqueThreadIds = Array.from(new Set(threadIds.filter(Boolean)));
  let updatedCount = 0;

  for (const threadId of uniqueThreadIds) {
    const ticket = await updateTicketMetadata(threadId, data, tenantId, userId, userName);
    if (ticket) updatedCount += 1;
  }

  return updatedCount;
}

export async function bulkAddTag(ids: number[], tagId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tagConditions: any[] = [eq(inboxTags.id, tagId), eq(inboxTags.active, true)];
  appendTenantScope(tagConditions, inboxTags.tenantId, tenantId);
  const [visibleTag] = await db.select({ id: inboxTags.id }).from(inboxTags).where(and(...tagConditions)).limit(1);
  if (!visibleTag) throw new Error("Tag not found");

  const messageConditions: any[] = [inArray(inboxMessages.id, ids)];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);
  const ownedMessages = await db.select({ id: inboxMessages.id, threadId: inboxMessages.threadId }).from(inboxMessages).where(and(...messageConditions));
  for (const { id: messageId } of ownedMessages) {
    const [existing] = await db
      .select()
      .from(inboxMessageTags)
      .where(and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId)))
      .limit(1);
    if (!existing) {
      await db.insert(inboxMessageTags).values({ messageId, tagId });
    }
  }
  await syncTicketsForThreads(ownedMessages.map((row) => row.threadId), tenantId);
}

export async function bulkAddTagToThreads(threadIds: string[], tagId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (threadIds.length === 0) return 0;

  const tagConditions: any[] = [eq(inboxTags.id, tagId), eq(inboxTags.active, true)];
  appendTenantScope(tagConditions, inboxTags.tenantId, tenantId);
  const [visibleTag] = await db.select({ id: inboxTags.id }).from(inboxTags).where(and(...tagConditions)).limit(1);
  if (!visibleTag) throw new Error("Tag not found");

  const messageConditions: any[] = [inArray(inboxMessages.threadId, threadIds)];
  appendTenantScope(messageConditions, inboxMessages.tenantId, tenantId);
  const ownedMessages = await db
    .select({ id: inboxMessages.id, threadId: inboxMessages.threadId })
    .from(inboxMessages)
    .where(and(...messageConditions));

  for (const { id: messageId } of ownedMessages) {
    const [existing] = await db
      .select()
      .from(inboxMessageTags)
      .where(and(eq(inboxMessageTags.messageId, messageId), eq(inboxMessageTags.tagId, tagId)))
      .limit(1);
    if (!existing) {
      await db.insert(inboxMessageTags).values({ messageId, tagId });
    }
  }

  await syncTicketsForThreads(threadIds, tenantId);
  return new Set(ownedMessages.map(row => row.threadId)).size;
}
