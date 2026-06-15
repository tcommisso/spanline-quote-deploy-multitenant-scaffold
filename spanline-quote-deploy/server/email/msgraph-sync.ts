/**
 * Microsoft Graph Email Sync Service
 * Polls configured mailboxes for new messages and syncs them into the inbox_messages table.
 * Uses delta queries for efficient incremental sync.
 */
import * as msgraph from "./msgraph";
import * as inboxDb from "../inbox-db";
import { getDb } from "../db";
import { inboxAddresses } from "../../drizzle/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { storagePut } from "../storage";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SyncResult {
  mailbox: string;
  newMessages: number;
  errors: string[];
}

// ─── Sync Logic ────────────────────────────────────────────────────────────────

/**
 * Sync a single mailbox — fetches new messages since last sync and stores them
 */
async function syncMailbox(address: {
  id: number;
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
    let messages: msgraph.GraphEmailMessage[] = [];
    let newDeltaLink: string | null = null;

    if (address.deltaLink) {
      // Incremental sync using delta
      const delta = await msgraph.fetchDelta(address.deltaLink);
      messages = delta.messages;
      newDeltaLink = delta.newDeltaLink;
    } else {
      // Initial sync — get delta link and recent messages (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const delta = await msgraph.getDeltaLink(address.address);
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

  const existing = await db.execute(sql`SELECT id FROM inbox_messages WHERE graphMessageId = ${msg.id} LIMIT 1`);
  if ((existing as any)?.[0]?.length > 0) return; // Already synced

  // Determine direction: if from address matches our mailbox, it's outbound
  const fromAddr = msg.from?.emailAddress?.address?.toLowerCase() || "";
  const isOutbound = fromAddr === address.address.toLowerCase();
  const direction = isOutbound ? "outbound" : "inbound";

  // Extract addresses
  const toAddresses = msg.toRecipients?.map(r => r.emailAddress.address) || [];
  const ccAddresses = msg.ccRecipients?.map(r => r.emailAddress.address) || [];

  // Use conversationId as threadId for grouping
  const threadId = msg.conversationId || msg.internetMessageId || `graph-${msg.id}`;

  // Process attachments if any
  let attachments: any[] | null = null;
  if (msg.hasAttachments) {
    try {
      const graphAttachments = await msgraph.fetchAttachments(address.address, msg.id);
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
    ? await inboxDb.matchEmailToClient(fromAddr)
    : null;

  // Extract threading headers if available
  const inReplyToHeader = msg.internetMessageHeaders?.find(h => h.name.toLowerCase() === "in-reply-to")?.value || null;
  const referencesHeader = msg.internetMessageHeaders?.find(h => h.name.toLowerCase() === "references")?.value || null;

  // Create inbox message
  const { id: inboxMsgId } = await inboxDb.createInboxMessage({
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
    htmlBody: msg.body?.contentType === "html" ? msg.body.content : null,
    textBody: msg.body?.contentType === "text" ? msg.body.content : (msg.bodyPreview || null),
    attachments,
    matchedJobId: match?.matchedJobId || null,
    matchedLeadId: match?.matchedLeadId || null,
    matchedClientEmail: match?.matchedClientEmail || null,
    assignedToId: address.defaultAssigneeId || null,
    assignedToName: address.defaultAssigneeName || null,
    assignedAt: address.defaultAssigneeId ? new Date() : null,
    status: direction === "outbound" ? "replied" : "new",
    isRead: msg.isRead || direction === "outbound",
    isStarred: false,
    portalVisible: false,
    autoReplySent: false,
  } as any);

  // Apply auto-tags from address rule
  if (address.autoTagIds) {
    const tagIds = Array.isArray(address.autoTagIds) ? address.autoTagIds : [];
    for (const tagId of tagIds) {
      try { await inboxDb.addTagToMessage(inboxMsgId, tagId as number); } catch { /* ignore */ }
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
  if (!msgraph.isGraphConfigured()) {
    console.log("[MSGraph Sync] Not configured, skipping sync");
    return [];
  }

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
 * Sync a single mailbox by address ID
 */
export async function syncMailboxById(addressId: number): Promise<SyncResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [addr] = await db.select()
    .from(inboxAddresses)
    .where(eq(inboxAddresses.id, addressId));

  if (!addr) throw new Error(`Address ${addressId} not found`);
  if ((addr as any).provider !== "msgraph") throw new Error(`Address ${addr.address} is not a Graph mailbox`);

  return syncMailbox(addr as any);
}

/**
 * Reset sync state for a mailbox (forces full re-sync on next poll)
 */
export async function resetMailboxSync(addressId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db.update(inboxAddresses)
    .set({ deltaLink: null, lastSyncAt: null } as any)
    .where(eq(inboxAddresses.id, addressId));
}
