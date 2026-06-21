/**
 * Microsoft Graph Email Service
 * Handles OAuth2 client credentials flow and email operations
 * for multiple shared mailboxes via the Microsoft Graph API.
 */
import { ConfidentialClientApplication } from "@azure/msal-node";
import { ENV } from "../_core/env";
import { getTenantMsGraphConfig, type TenantMsGraphConfig } from "../tenant-integrations";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GraphEmailMessage {
  id: string;
  conversationId: string;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance: string;
  parentFolderId: string;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string; // base64
  isInline: boolean;
}

export interface SendEmailParams {
  tenantId?: number | null;
  mailbox: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  inReplyTo?: string; // internetMessageId of the message being replied to
  references?: string;
  replyToGraphMessageId?: string; // Graph message ID to create a native Outlook reply from
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string; // base64
  }>;
  importance?: "low" | "normal" | "high";
  saveToSentItems?: boolean;
}

export interface FetchMessagesParams {
  tenantId?: number | null;
  mailbox: string;
  folderId?: string; // default: "inbox"
  top?: number;
  skip?: number;
  filter?: string; // OData filter
  orderBy?: string;
  select?: string[];
}

// ─── MSAL Client ───────────────────────────────────────────────────────────────

const msalClients = new Map<string, ConfidentialClientApplication>();

async function resolveGraphConfig(tenantId?: number | null): Promise<Required<TenantMsGraphConfig>> {
  const config = await getTenantMsGraphConfig(tenantId);
  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    throw new Error("[MSGraph] Missing credentials. Configure tenant Microsoft Graph settings or set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET.");
  }
  return config as Required<TenantMsGraphConfig>;
}

async function getMsalClient(tenantId?: number | null): Promise<ConfidentialClientApplication> {
  const config = await resolveGraphConfig(tenantId);
  const cacheKey = `${config.tenantId}:${config.clientId}`;
  const cached = msalClients.get(cacheKey);
  if (cached) return cached;

  const client = new ConfidentialClientApplication({
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  });
  msalClients.set(cacheKey, client);
  return client;
}

async function getAccessToken(tenantId?: number | null): Promise<string> {
  const client = await getMsalClient(tenantId);
  const result = await client.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) {
    throw new Error("[MSGraph] Failed to acquire access token");
  }
  return result.accessToken;
}

// ─── Graph API Helpers ─────────────────────────────────────────────────────────

async function graphRequest(method: string, url: string, body?: any, tenantId?: number | null): Promise<any> {
  const token = await getAccessToken(tenantId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[MSGraph] ${method} ${url} failed (${response.status}):`, errorText);
    throw new Error(`Graph API error ${response.status}: ${errorText}`);
  }

  // 202 Accepted or 204 No Content — no body to parse
  if (response.status === 202 || response.status === 204) return null;

  // Check if there's actually content to parse
  const text = await response.text();
  if (!text || text.trim().length === 0) return null;

  return JSON.parse(text);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if Microsoft Graph is configured and ready
 */
export function isGraphConfigured(): boolean {
  return !!(ENV.msGraphTenantId && ENV.msGraphClientId && ENV.msGraphClientSecret);
}

export async function isGraphConfiguredForTenant(tenantId?: number | null): Promise<boolean> {
  const config = await getTenantMsGraphConfig(tenantId);
  return !!(config.tenantId && config.clientId && config.clientSecret);
}

/**
 * Test the connection by fetching the organization info
 */
export async function testConnection(tenantId?: number | null): Promise<{ success: boolean; error?: string; org?: string }> {
  try {
    const data = await graphRequest("GET", "/organization", undefined, tenantId);
    const orgName = data?.value?.[0]?.displayName || "Unknown";
    return { success: true, org: orgName };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetch messages from a mailbox folder
 */
export async function fetchMessages(params: FetchMessagesParams): Promise<{ messages: GraphEmailMessage[]; nextLink?: string }> {
  const { mailbox, folderId = "inbox", top = 50, skip = 0, filter, orderBy = "receivedDateTime desc", select } = params;

  let url = `/users/${encodeURIComponent(mailbox)}/mailFolders/${folderId}/messages?$top=${top}&$skip=${skip}&$orderby=${orderBy}`;

  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  if (select && select.length > 0) url += `&$select=${select.join(",")}`;

  const data = await graphRequest("GET", url, undefined, params.tenantId);
  return {
    messages: data.value || [],
    nextLink: data["@odata.nextLink"],
  };
}

/**
 * Fetch a single message by ID
 */
export async function fetchMessage(mailbox: string, messageId: string, tenantId?: number | null): Promise<GraphEmailMessage> {
  return graphRequest("GET", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`, undefined, tenantId);
}

/**
 * Fetch message attachments
 */
export async function fetchAttachments(mailbox: string, messageId: string, tenantId?: number | null): Promise<GraphAttachment[]> {
  const data = await graphRequest("GET", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments`, undefined, tenantId);
  return data.value || [];
}

/**
 * Mark a message as read
 */
export async function markAsRead(mailbox: string, messageId: string, tenantId?: number | null): Promise<void> {
  await graphRequest("PATCH", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`, { isRead: true }, tenantId);
}

/**
 * Mark a message as unread
 */
export async function markAsUnread(mailbox: string, messageId: string, tenantId?: number | null): Promise<void> {
  await graphRequest("PATCH", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`, { isRead: false }, tenantId);
}

/**
 * Send an email from a mailbox
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { mailbox, to, cc, bcc, subject, htmlBody, textBody, attachments, importance = "normal", saveToSentItems = true } = params;

  if (params.replyToGraphMessageId) {
    const draft = await createReplyDraft(mailbox, params.replyToGraphMessageId, params.tenantId);
    await updateDraft(mailbox, draft.id, {
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      toRecipients: to.map(addr => ({ emailAddress: { address: addr } })),
      ccRecipients: (cc || []).map(addr => ({ emailAddress: { address: addr } })),
    }, params.tenantId);
    await sendDraft(mailbox, draft.id, params.tenantId);
    return;
  }

  const message: any = {
    subject,
    body: {
      contentType: "HTML",
      content: htmlBody,
    },
    toRecipients: to.map(addr => ({ emailAddress: { address: addr } })),
    importance,
  };

  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map(addr => ({ emailAddress: { address: addr } }));
  }
  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.map(addr => ({ emailAddress: { address: addr } }));
  }
  if (attachments && attachments.length > 0) {
    message.attachments = attachments.map(att => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name,
      contentType: att.contentType,
      contentBytes: att.contentBytes,
    }));
  }

  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/sendMail`, {
    message,
    saveToSentItems,
  }, params.tenantId);
}

/**
 * Reply to an existing message
 */
export async function replyToMessage(mailbox: string, messageId: string, htmlBody: string, replyAll: boolean = false, tenantId?: number | null): Promise<void> {
  const endpoint = replyAll ? "replyAll" : "reply";
  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/${endpoint}`, {
    comment: htmlBody,
  }, tenantId);
}

/**
 * Create a draft reply (for more control over headers/attachments)
 */
export async function createReplyDraft(mailbox: string, messageId: string, tenantId?: number | null): Promise<GraphEmailMessage> {
  return graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/createReply`, undefined, tenantId);
}

/**
 * Update a draft message (add body, attachments, etc.)
 */
export async function updateDraft(mailbox: string, draftId: string, updates: Partial<{ body: { contentType: string; content: string }; toRecipients: any[]; ccRecipients: any[] }>, tenantId?: number | null): Promise<void> {
  await graphRequest("PATCH", `/users/${encodeURIComponent(mailbox)}/messages/${draftId}`, updates, tenantId);
}

/**
 * Send a draft message
 */
export async function sendDraft(mailbox: string, draftId: string, tenantId?: number | null): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${draftId}/send`, undefined, tenantId);
}

/**
 * Move a message to a folder
 */
export async function moveMessage(mailbox: string, messageId: string, destinationFolderId: string, tenantId?: number | null): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/move`, {
    destinationId: destinationFolderId,
  }, tenantId);
}

/**
 * Delete a message (moves to Deleted Items)
 */
export async function deleteMessage(mailbox: string, messageId: string, tenantId?: number | null): Promise<void> {
  await graphRequest("DELETE", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`, undefined, tenantId);
}

/**
 * Get mailbox folders
 */
export async function getMailFolders(mailbox: string, tenantId?: number | null): Promise<Array<{ id: string; displayName: string; totalItemCount: number; unreadItemCount: number }>> {
  const data = await graphRequest("GET", `/users/${encodeURIComponent(mailbox)}/mailFolders?$top=50`, undefined, tenantId);
  return data.value || [];
}

/**
 * Fetch messages received after a specific datetime (for incremental sync)
 */
export async function fetchNewMessages(mailbox: string, since: Date, folderId: string = "inbox", tenantId?: number | null): Promise<GraphEmailMessage[]> {
  const isoDate = since.toISOString();
  const filter = `receivedDateTime ge ${isoDate}`;
  const { messages } = await fetchMessages({ tenantId, mailbox, folderId, filter, top: 100 });
  return messages;
}

/**
 * Get the delta link for change tracking (initial sync)
 */
export async function getDeltaLink(mailbox: string, folderId: string = "inbox", tenantId?: number | null): Promise<{ messages: GraphEmailMessage[]; deltaLink: string }> {
  let url = `/users/${encodeURIComponent(mailbox)}/mailFolders/${folderId}/messages/delta?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,bodyPreview,internetMessageId,internetMessageHeaders,conversationId,parentFolderId,importance,body`;

  const allMessages: GraphEmailMessage[] = [];
  let deltaLink = "";

  // Follow nextLink pages until we get a deltaLink
  while (url) {
    const data = await graphRequest("GET", url.startsWith("http") ? url.replace("https://graph.microsoft.com/v1.0", "") : url, undefined, tenantId);
    if (data.value) allMessages.push(...data.value);

    if (data["@odata.deltaLink"]) {
      deltaLink = data["@odata.deltaLink"];
      break;
    }
    url = data["@odata.nextLink"] || "";
  }

  return { messages: allMessages, deltaLink };
}

/**
 * Fetch changes since last delta (incremental sync)
 */
export async function fetchDelta(deltaLink: string, tenantId?: number | null): Promise<{ messages: GraphEmailMessage[]; newDeltaLink: string }> {
  // deltaLink is a full URL, strip the base
  const path = deltaLink.replace("https://graph.microsoft.com/v1.0", "");
  const data = await graphRequest("GET", path, undefined, tenantId);

  const messages: GraphEmailMessage[] = data.value || [];
  const newDeltaLink = data["@odata.deltaLink"] || deltaLink;

  return { messages, newDeltaLink };
}
