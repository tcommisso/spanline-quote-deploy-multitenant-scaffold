/**
 * Microsoft Graph Email Sync Service
 * Polls configured mailboxes for new messages and syncs them into the inbox_messages table.
 * Uses delta queries for efficient incremental sync.
 */
import * as msgraph from "./msgraph";
import * as inboxDb from "../inbox-db";
import { getDb } from "../db";
import { inboxAddresses, inboxMessages } from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SyncResult {
  mailbox: string;
  newMessages: number;
  errors: string[];
}

function normalizeEmail(value?: string | null): string {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "";
  const bracketMatch = raw.match(/<([^>]+)>/);
  return (bracketMatch?.[1] || raw).replace(/^mailto:/, "").trim();
}

function parseAddressList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => normalizeEmail(String(item))).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => normalizeEmail(String(item))).filter(Boolean);
  } catch {
    // Some legacy rows store a plain comma/semicolon separated string.
  }
  return value.split(/[;,]/).map((item) => normalizeEmail(item)).filter(Boolean);
}

function normalizeSubject(subject?: string | null): string {
  return (subject || "")
    .replace(/^\s*((re|fw|fwd):\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function collectReferencedMessageIds(inReplyTo?: string | null, references?: string | null): string[] {
  const ids = new Set<string>();
  for (const value of [inReplyTo, references]) {
    if (!value) continue;
    const bracketMatches = value.match(/<[^>]+>/g);
    if (bracketMatches) {
      bracketMatches.forEach((id) => ids.add(id.trim()));
      continue;
    }
    value.split(/\s+/).map((part) => part.trim()).filter(Boolean).forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

async function resolveThreadIdForGraphMessage(args: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  tenantId: number | null;
  fallbackThreadId: string;
  direction: "inbound" | "outbound";
  subject?: string | null;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  mailboxAddress: string;
  inReplyToHeader?: string | null;
  referencesHeader?: string | null;
}): Promise<string> {
  const referencedIds = collectReferencedMessageIds(args.inReplyToHeader, args.referencesHeader);
  if (referencedIds.length > 0) {
    const directConditions: any[] = [inArray(inboxMessages.messageId, referencedIds)];
    if (args.tenantId) directConditions.push(eq(inboxMessages.tenantId, args.tenantId));
    const [directMatch] = await args.db
      .select({ threadId: inboxMessages.threadId })
      .from(inboxMessages)
      .where(and(...directConditions))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(1);
    if (directMatch?.threadId) return directMatch.threadId;
  }

  if (args.direction !== "inbound") return args.fallbackThreadId;

  const subject = normalizeSubject(args.subject);
  const inboundFrom = normalizeEmail(args.fromAddress);
  if (!subject || !inboundFrom) return args.fallbackThreadId;

  const mailbox = normalizeEmail(args.mailboxAddress);
  const inboundRecipients = [...args.toAddresses, ...args.ccAddresses].map(normalizeEmail).filter(Boolean);
  const candidateConditions: any[] = [eq(inboxMessages.direction, "outbound")];
  if (args.tenantId) candidateConditions.push(eq(inboxMessages.tenantId, args.tenantId));

  const candidates = await args.db
    .select({
      threadId: inboxMessages.threadId,
      subject: inboxMessages.subject,
      fromAddress: inboxMessages.fromAddress,
      toAddresses: inboxMessages.toAddresses,
      receivedByAddress: inboxMessages.receivedByAddress,
    })
    .from(inboxMessages)
    .where(and(...candidateConditions))
    .orderBy(desc(inboxMessages.createdAt))
    .limit(250);

  const match = candidates.find((candidate) => {
    if (normalizeSubject(candidate.subject) !== subject) return false;
    const outboundRecipients = parseAddressList(candidate.toAddresses);
    if (!outboundRecipients.includes(inboundFrom)) return false;
    const outboundSender = normalizeEmail(candidate.receivedByAddress || candidate.fromAddress);
    return inboundRecipients.includes(outboundSender) || inboundRecipients.includes(mailbox) || outboundSender === mailbox;
  });

  return match?.threadId || args.fallbackThreadId;
}

// ─── Sync Logic ────────────────────────────────────────────────────────────────

/**
 * Sync a single mailbox — fetches new messages since last sync and stores them
 */
async function syncMailbox(address: {
  id: number;
  tenantId: number | null;
  address: string;
  displayName: string;
  module: string | null;
  deltaLink: string | null;
  defaultAssigneeId: number | null;
  defaultAssigneeName: string | null;
  autoTagIds: any;
}): Promise<SyncResult> {
  const result: SyncResult = { mailbox: address.address, newMessages: 0, errors: [] };

  try {
    const configured = await msgraph.isGraphConfiguredForTenant(address.tenantId);
    if (!configured) {
      result.errors.push("Microsoft Graph is not configured for this mailbox tenant");
      return result;
    }

    let messages: msgraph.GraphEmailMessage[] = [];
    let newDeltaLink: string | null = null;

    if (address.deltaLink) {
      // Incremental sync using delta
      const delta = await msgraph.fetchDelta(address.deltaLink, address.tenantId);
      messages = delta.messages;
      newDeltaLink = delta.newDeltaLink;
    } else {
      // Initial sync — get delta link and recent messages (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const delta = await msgraph.getDeltaLink(address.address, "inbox", address.tenantId);
      // Filter to only recent messages for initial load
      messages = delta.messages.filter(m => new Date(m.receivedDateTime) >= sevenDaysAgo);
      newDeltaLink = delta.deltaLink;
    }

    // Process each message
    for (const msg of messages) {
      try {
        await processGraphMessage(msg, address);
        result.newMessages++;
      } catch (err: any) {
        result.errors.push(`Message ${msg.id}: ${err.message}`);
      }
    }

    // Update delta link and last sync time
    const db = await getDb();
    if (db) {
      await db.update(inboxAddresses)
        .set({
          deltaLink: newDeltaLink,
          lastSyncAt: new Date(),
        } as any)
        .where(eq(inboxAddresses.id, address.id));
    }
  } catch (err: any) {
    result.errors.push(`Sync failed: ${err.message}`);
    console.error(`[MSGraph Sync] Error syncing ${address.address}:`, err.message);
  }

  return result;
}

/**
 * Process a single Graph message and store it in inbox_messages
 */
async function processGraphMessage(
  msg: msgraph.GraphEmailMessage,
  address: {
    id: number;
    tenantId: number | null;
    address: string;
    displayName: string;
    module: string | null;
    defaultAssigneeId: number | null;
    defaultAssigneeName: string | null;
    autoTagIds: any;
  }
): Promise<void> {
  // Check if already synced (by graphMessageId)
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const existingConditions: any[] = [eq(inboxMessages.graphMessageId, msg.id)];
  if (address.tenantId) existingConditions.push(eq(inboxMessages.tenantId, address.tenantId));
  const [existing] = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(and(...existingConditions))
    .limit(1);
  if (existing) return; // Already synced

  // Determine direction: if from address matches our mailbox, it's outbound
  const fromAddr = msg.from?.emailAddress?.address?.toLowerCase() || "";
  const isOutbound = fromAddr === address.address.toLowerCase();
  const direction = isOutbound ? "outbound" : "inbound";

  // Extract addresses
  const toAddresses = msg.toRecipients?.map(r => r.emailAddress.address) || [];
  const ccAddresses = msg.ccRecipients?.map(r => r.emailAddress.address) || [];

  // Extract threading headers if available
  const inReplyToHeader = msg.internetMessageHeaders?.find(h => h.name.toLowerCase() === "in-reply-to")?.value || null;
  const referencesHeader = msg.internetMessageHeaders?.find(h => h.name.toLowerCase() === "references")?.value || null;
  const bodyContentType = msg.body?.contentType?.toLowerCase();

  // Use Graph conversationId for native grouping, then fall back to app-owned subject/recipient matching
  // so replies to app-sent messages attach to the original local thread.
  const graphThreadId = msg.conversationId || msg.internetMessageId || `graph-${msg.id}`;
  const threadId = await resolveThreadIdForGraphMessage({
    db,
    tenantId: address.tenantId,
    fallbackThreadId: graphThreadId,
    direction,
    subject: msg.subject,
    fromAddress: fromAddr,
    toAddresses,
    ccAddresses,
    mailboxAddress: address.address,
    inReplyToHeader,
    referencesHeader,
  });

  // Process attachments if any
  let attachments: any[] | null = null;
  if (msg.hasAttachments) {
    try {
      const graphAttachments = await msgraph.fetchAttachments(address.address, msg.id, address.tenantId);
      const processed: any[] = [];
      for (const att of graphAttachments) {
        if (att.contentBytes && !att.isInline) {
          const buffer = Buffer.from(att.contentBytes, "base64");
          const suffix = crypto.randomUUID().slice(0, 8);
          const key = `inbox-attachments/graph/${msg.id}/${suffix}-${att.name}`;
          const { url } = await storagePut(key, buffer, att.contentType || "application/octet-stream");
          processed.push({
            id: att.id,
            filename: att.name,
            contentType: att.contentType,
            size: att.size,
            url,
          });
        }
      }
      if (processed.length > 0) attachments = processed;
    } catch (err: any) {
      console.error(`[MSGraph Sync] Attachment processing failed for ${msg.id}:`, err.message);
    }
  }

  // Match to CRM client/lead
  const match = direction === "inbound"
    ? await inboxDb.matchEmailToClient(fromAddr, address.tenantId)
    : null;

  // Create inbox message
  const { id: inboxMsgId } = await inboxDb.createInboxMessage({
    tenantId: address.tenantId,
    threadId,
    direction,
    resendEmailId: null,
    graphMessageId: msg.id,
    messageId: msg.internetMessageId || null,
    inReplyTo: inReplyToHeader,
    emailReferences: referencesHeader,
    fromAddress: fromAddr,
    fromName: msg.from?.emailAddress?.name || null,
    toAddresses: JSON.stringify(toAddresses),
    ccAddresses: ccAddresses.length > 0 ? JSON.stringify(ccAddresses) : null,
    receivedByAddress: address.address,
    subject: msg.subject || null,
    htmlBody: bodyContentType === "html" ? msg.body.content : null,
    textBody: bodyContentType === "text" ? msg.body.content : (msg.bodyPreview || null),
    attachments,
    matchedJobId: match?.matchedJobId || null,
    matchedLeadId: match?.matchedLeadId || null,
    matchedClientEmail: match?.matchedClientEmail || null,
    assignedToId: address.defaultAssigneeId || null,
    assignedToName: address.defaultAssigneeName || null,
    assignedAt: address.defaultAssigneeId ? new Date() : null,
    status: direction === "outbound" ? "open" : "new",
    isRead: msg.isRead || direction === "outbound",
    isStarred: false,
    portalVisible: false,
    autoReplySent: false,
  } as any);

  // Apply auto-tags from address rule
  if (address.autoTagIds) {
    const tagIds = Array.isArray(address.autoTagIds) ? address.autoTagIds : [];
    for (const tagId of tagIds) {
      try { await inboxDb.addTagToMessage(inboxMsgId, tagId as number, address.tenantId); } catch { /* ignore */ }
    }
  }

  // Create activity on matched client
  if (match?.matchedJobId && direction === "inbound") {
    const snippet = msg.bodyPreview?.slice(0, 500) || "";
    await inboxDb.createEmailActivity({
      jobId: match.matchedJobId,
      leadId: match.matchedLeadId,
      subject: msg.subject || "",
      fromEmail: fromAddr,
      snippet,
      inboxMessageId: inboxMsgId,
    });
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Sync all active Microsoft Graph mailboxes
 */
export async function syncAllMailboxes(): Promise<SyncResult[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all active msgraph addresses
  const addresses = await db.select()
    .from(inboxAddresses)
    .where(and(
      eq(inboxAddresses.active, true),
      eq(inboxAddresses.provider as any, "msgraph")
    ));

  if (addresses.length === 0) {
    console.log("[MSGraph Sync] No active Graph mailboxes configured");
    return [];
  }

  console.log(`[MSGraph Sync] Syncing ${addresses.length} mailbox(es)...`);
  const results: SyncResult[] = [];

  for (const addr of addresses) {
    const result = await syncMailbox(addr as any);
    results.push(result);
    if (result.newMessages > 0) {
      console.log(`[MSGraph Sync] ${addr.address}: ${result.newMessages} new messages`);
    }
    if (result.errors.length > 0) {
      console.error(`[MSGraph Sync] ${addr.address}: ${result.errors.length} errors`);
    }
  }

  return results;
}

/**
 * Sync active Microsoft Graph mailboxes for the current tenant only.
 * Used by the Inbox refresh action so new external replies can be pulled on demand.
 */
export async function syncTenantMailboxes(tenantId: number | null): Promise<SyncResult[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [
    eq(inboxAddresses.active, true),
    eq(inboxAddresses.provider as any, "msgraph"),
  ];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));

  const addresses = await db.select()
    .from(inboxAddresses)
    .where(and(...conditions));

  const results: SyncResult[] = [];
  for (const addr of addresses) {
    results.push(await syncMailbox(addr as any));
  }

  return results;
}

/**
 * Sync a single mailbox by address ID
 */
export async function syncMailboxById(addressId: number, tenantId?: number | null): Promise<SyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const conditions: any[] = [eq(inboxAddresses.id, addressId)];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  const [addr] = await db.select()
    .from(inboxAddresses)
    .where(and(...conditions));

  if (!addr) throw new Error(`Address ${addressId} not found`);
  if ((addr as any).provider !== "msgraph") throw new Error(`Address ${addr.address} is not a Graph mailbox`);

  return syncMailbox(addr as any);
}

/**
 * Reset sync state for a mailbox (forces full re-sync on next poll)
 */
export async function resetMailboxSync(addressId: number, tenantId?: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const conditions: any[] = [eq(inboxAddresses.id, addressId)];
  if (tenantId) conditions.push(eq(inboxAddresses.tenantId, tenantId));
  await db.update(inboxAddresses)
    .set({ deltaLink: null, lastSyncAt: null } as any)
    .where(and(...conditions));
}
