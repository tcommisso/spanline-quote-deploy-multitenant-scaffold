import { and, desc, eq, inArray } from "drizzle-orm";
import { inboxMessages } from "../drizzle/schema";
import { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const THREAD_MARKER = "ALTASPAN-INBOX-THREAD";
const THREAD_MARKER_RE = /ALTASPAN-INBOX-THREAD:([A-Za-z0-9_-]+)/i;

export function normalizeEmailAddress(value?: string | null): string {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) return "";
  const bracketMatch = raw.match(/<([^>]+)>/);
  return (bracketMatch?.[1] || raw).replace(/^mailto:/, "").trim();
}

export function parseEmailAddressList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => normalizeEmailAddress(String(item))).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => normalizeEmailAddress(String(item))).filter(Boolean);
  } catch {
    // Some legacy rows store a plain comma/semicolon separated string.
  }
  return value.split(/[;,]/).map((item) => normalizeEmailAddress(item)).filter(Boolean);
}

export function normalizeEmailSubject(subject?: string | null): string {
  return (subject || "")
    .replace(/^\s*((re|fw|fwd):\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function collectReferencedMessageIds(inReplyTo?: string | null, references?: string | null): string[] {
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

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractMarkedThreadId(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(THREAD_MARKER_RE);
    if (!match?.[1]) continue;
    try {
      const threadId = fromBase64Url(match[1]);
      if (threadId) return threadId;
    } catch {
      // Ignore malformed markers from external email content.
    }
  }
  return null;
}

export function appendInboxThreadMarkerHtml(html: string, threadId: string): string {
  if (!html || html.includes(`${THREAD_MARKER}:`)) return html;
  return `${html}\n<!-- ${THREAD_MARKER}:${toBase64Url(threadId)} -->`;
}

async function existingThreadId(db: Db, threadId: string, tenantId?: number | null): Promise<string | null> {
  const conditions: any[] = [eq(inboxMessages.threadId, threadId)];
  if (tenantId != null) conditions.push(eq(inboxMessages.tenantId, tenantId));
  const [row] = await db
    .select({ threadId: inboxMessages.threadId })
    .from(inboxMessages)
    .where(and(...conditions))
    .limit(1);
  return row?.threadId || null;
}

export async function resolveInboxThreadIdForMessage(args: {
  db?: Db;
  tenantId: number | null;
  fallbackThreadId: string;
  direction: "inbound" | "outbound";
  subject?: string | null;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses?: string[];
  mailboxAddress?: string | null;
  inReplyToHeader?: string | null;
  referencesHeader?: string | null;
  htmlBody?: string | null;
  textBody?: string | null;
}): Promise<string> {
  const db = args.db || await getDb();
  if (!db) return args.fallbackThreadId;

  const markedThreadId = extractMarkedThreadId([args.subject, args.htmlBody, args.textBody]);
  if (markedThreadId) {
    const existing = await existingThreadId(db, markedThreadId, args.tenantId);
    if (existing) return existing;
  }

  const referencedIds = collectReferencedMessageIds(args.inReplyToHeader, args.referencesHeader);
  if (referencedIds.length > 0) {
    const directConditions: any[] = [inArray(inboxMessages.messageId, referencedIds)];
    if (args.tenantId != null) directConditions.push(eq(inboxMessages.tenantId, args.tenantId));
    const [directMatch] = await db
      .select({ threadId: inboxMessages.threadId })
      .from(inboxMessages)
      .where(and(...directConditions))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(1);
    if (directMatch?.threadId) return directMatch.threadId;
  }

  if (args.direction !== "inbound") return args.fallbackThreadId;

  const subject = normalizeEmailSubject(args.subject);
  const inboundFrom = normalizeEmailAddress(args.fromAddress);
  if (!subject || !inboundFrom) return args.fallbackThreadId;

  const mailbox = normalizeEmailAddress(args.mailboxAddress);
  const inboundRecipients = [...args.toAddresses, ...(args.ccAddresses || [])]
    .map(normalizeEmailAddress)
    .filter(Boolean);
  const candidateConditions: any[] = [eq(inboxMessages.direction, "outbound")];
  if (args.tenantId != null) candidateConditions.push(eq(inboxMessages.tenantId, args.tenantId));

  const candidates = await db
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
    if (normalizeEmailSubject(candidate.subject) !== subject) return false;
    const outboundRecipients = parseEmailAddressList(candidate.toAddresses);
    if (!outboundRecipients.includes(inboundFrom)) return false;
    const outboundSender = normalizeEmailAddress(candidate.receivedByAddress || candidate.fromAddress);
    return inboundRecipients.includes(outboundSender) || inboundRecipients.includes(mailbox) || outboundSender === mailbox;
  });

  return match?.threadId || args.fallbackThreadId;
}
