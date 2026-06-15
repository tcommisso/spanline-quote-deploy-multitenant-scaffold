/**
 * Microsoft Graph Email Service
 * Handles OAuth2 client credentials flow and email operations
 * for multiple shared mailboxes via the Microsoft Graph API.
 */
import { ConfidentialClientApplication } from "@azure/msal-node";
import { ENV } from "../_core/env";

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
  mailbox: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  inReplyTo?: string; // internetMessageId of the message being replied to
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string; // base64
  }>;
  importance?: "low" | "normal" | "high";
  saveToSentItems?: boolean;
}

export interface FetchMessagesParams {
  mailbox: string;
  folderId?: string; // default: "inbox"
  top?: number;
  skip?: number;
  filter?: string; // OData filter
  orderBy?: string;
  select?: string[];
}

// ─── MSAL Client ───────────────────────────────────────────────────────────────

let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (msalClient) return msalClient;

  if (!ENV.msGraphTenantId || !ENV.msGraphClientId || !ENV.msGraphClientSecret) {
    throw new Error("[MSGraph] Missing credentials. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET.");
  }

  msalClient = new ConfidentialClientApplication({
    auth: {
      clientId: ENV.msGraphClientId,
      clientSecret: ENV.msGraphClientSecret,
      authority: `https://login.microsoftonline.com/${ENV.msGraphTenantId}`,
    },
  });

  return msalClient;
}

async function getAccessToken(): Promise<string> {
  const client = getMsalClient();
  const result = await client.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) {
    throw new Error("[MSGraph] Failed to acquire access token");
  }
  return result.accessToken;
}

// ─── Graph API Helpers ─────────────────────────────────────────────────────────

async function graphRequest(method: string, url: string, body?: any): Promise<any> {
  const token = await getAccessToken();
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

/**
 * Test the connection by fetching the organization info
 */
export async function testConnection(): Promise<{ success: boolean; error?: string; org?: string }> {
  try {
    const data = await graphRequest("GET", "/organization");
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

  const data = await graphRequest("GET", url);
  return {
    messages: data.value || [],
    nextLink: data["@odata.nextLink"],
  };
}

/**
 * Fetch a single message by ID
 */
export async function fetchMessage(mailbox: string, messageId: string): Promise<GraphEmailMessage> {
  return graphRequest("GET", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`);
}

/**
 * Fetch message attachments
 */
export async function fetchAttachments(mailbox: string, messageId: string): Promise<GraphAttachment[]> {
  const data = await graphRequest("GET", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments`);
  return data.value || [];
}

/**
 * Mark a message as read
 */
export async function markAsRead(mailbox: string, messageId: string): Promise<void> {
  await graphRequest("PATCH", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`, { isRead: true });
}

/**
 * Mark a message as unread
 */
export async function markAsUnread(mailbox: string, messageId: string): Promise<void> {
  await graphRequest("PATCH", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`, { isRead: false });
}

/**
 * Send an email from a mailbox
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { mailbox, to, cc, bcc, subject, htmlBody, textBody, attachments, importance = "normal", saveToSentItems = true } = params;

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
  });
}

/**
 * Reply to an existing message
 */
export async function replyToMessage(mailbox: string, messageId: string, htmlBody: string, replyAll: boolean = false): Promise<void> {
  const endpoint = replyAll ? "replyAll" : "reply";
  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/${endpoint}`, {
    comment: htmlBody,
  });
}

/**
 * Create a draft reply (for more control over headers/attachments)
 */
export async function createReplyDraft(mailbox: string, messageId: string): Promise<GraphEmailMessage> {
  return graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/createReply`);
}

/**
 * Update a draft message (add body, attachments, etc.)
 */
export async function updateDraft(mailbox: string, draftId: string, updates: Partial<{ body: { contentType: string; content: string }; toRecipients: any[]; ccRecipients: any[] }>): Promise<void> {
  await graphRequest("PATCH", `/users/${encodeURIComponent(mailbox)}/messages/${draftId}`, updates);
}

/**
 * Send a draft message
 */
export async function sendDraft(mailbox: string, draftId: string): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${draftId}/send`);
}

/**
 * Move a message to a folder
 */
export async function moveMessage(mailbox: string, messageId: string, destinationFolderId: string): Promise<void> {
  await graphRequest("POST", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}/move`, {
    destinationId: destinationFolderId,
  });
}

/**
 * Delete a message (moves to Deleted Items)
 */
export async function deleteMessage(mailbox: string, messageId: string): Promise<void> {
  await graphRequest("DELETE", `/users/${encodeURIComponent(mailbox)}/messages/${messageId}`);
}

/**
 * Get mailbox folders
 */
export async function getMailFolders(mailbox: string): Promise<Array<{ id: string; displayName: string; totalItemCount: number; unreadItemCount: number }>> {
  const data = await graphRequest("GET", `/users/${encodeURIComponent(mailbox)}/mailFolders?$top=50`);
  return data.value || [];
}

/**
 * Fetch messages received after a specific datetime (for incremental sync)
 */
export async function fetchNewMessages(mailbox: string, since: Date, folderId: string = "inbox"): Promise<GraphEmailMessage[]> {
  const isoDate = since.toISOString();
  const filter = `receivedDateTime ge ${isoDate}`;
  const { messages } = await fetchMessages({ mailbox, folderId, filter, top: 100 });
  return messages;
}

/**
 * Get the delta link for change tracking (initial sync)
 */
export async function getDeltaLink(mailbox: string, folderId: string = "inbox"): Promise<{ messages: GraphEmailMessage[]; deltaLink: string }> {
  let url = `/users/${encodeURIComponent(mailbox)}/mailFolders/${folderId}/messages/delta?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,internetMessageId,conversationId,importance,body`;

  const allMessages: GraphEmailMessage[] = [];
  let deltaLink = "";

  // Follow nextLink pages until we get a deltaLink
  while (url) {
    const data = await graphRequest("GET", url.startsWith("http") ? url.replace("https://graph.microsoft.com/v1.0", "") : url);
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
export async function fetchDelta(deltaLink: string): Promise<{ messages: GraphEmailMessage[]; newDeltaLink: string }> {
  // deltaLink is a full URL, strip the base
  const path = deltaLink.replace("https://graph.microsoft.com/v1.0", "");
  const data = await graphRequest("GET", path);

  const messages: GraphEmailMessage[] = data.value || [];
  const newDeltaLink = data["@odata.deltaLink"] || deltaLink;

  return { messages, newDeltaLink };
}
