export const STORED_INBOX_STATUSES = ["new", "open", "replied", "closed", "spam"] as const;

export type StoredInboxStatus = (typeof STORED_INBOX_STATUSES)[number];

export type InboxTicketStatus =
  | "new"
  | "open"
  | "waiting_customer"
  | "waiting_internal"
  | "customer_replied"
  | "resolved"
  | "closed"
  | "spam";

export const INBOX_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type InboxTicketPriority = (typeof INBOX_TICKET_PRIORITIES)[number];

export const INBOX_TICKET_CHANNELS = ["email", "phone", "web", "portal", "manual"] as const;
export type InboxTicketChannel = (typeof INBOX_TICKET_CHANNELS)[number];

export type InboxTicketState = {
  key: InboxTicketStatus;
  label: string;
};

export type InboxTicketMessageLike = {
  direction: "inbound" | "outbound";
  status?: string | null;
  isRead?: boolean | null;
  createdAt?: string | Date | null;
};

export const INBOX_TICKET_STATUS_LABELS: Record<InboxTicketStatus, string> = {
  new: "New",
  open: "Open",
  waiting_customer: "Waiting on customer",
  waiting_internal: "Waiting internally",
  customer_replied: "Customer replied",
  resolved: "Resolved",
  closed: "Closed",
  spam: "Spam",
};

export const INBOX_TICKET_PRIORITY_LABELS: Record<InboxTicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const INBOX_TICKET_CHANNEL_LABELS: Record<InboxTicketChannel, string> = {
  email: "Email",
  phone: "Phone",
  web: "Web",
  portal: "Portal",
  manual: "Manual",
};

export function isStoredInboxStatus(value: string | null | undefined): value is StoredInboxStatus {
  return STORED_INBOX_STATUSES.includes(value as StoredInboxStatus);
}

function messageTime(message: InboxTicketMessageLike): number {
  if (!message.createdAt) return 0;
  const time = new Date(message.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function deriveInboxTicketState(messages: InboxTicketMessageLike[]): InboxTicketState {
  if (messages.length === 0) return { key: "open", label: INBOX_TICKET_STATUS_LABELS.open };

  const sorted = [...messages].sort((a, b) => messageTime(a) - messageTime(b));
  const latest = sorted[sorted.length - 1];

  if (latest.status === "spam") return { key: "spam", label: INBOX_TICKET_STATUS_LABELS.spam };
  if (latest.status === "resolved") return { key: "resolved", label: INBOX_TICKET_STATUS_LABELS.resolved };
  if (latest.status === "closed") return { key: "closed", label: INBOX_TICKET_STATUS_LABELS.closed };

  if (latest.direction === "outbound") {
    return {
      key: "waiting_customer",
      label: INBOX_TICKET_STATUS_LABELS.waiting_customer,
    };
  }

  const hasEarlierOutbound = sorted.some(
    (message) => message.direction === "outbound" && messageTime(message) <= messageTime(latest)
  );

  if (hasEarlierOutbound) {
    return {
      key: "customer_replied",
      label: INBOX_TICKET_STATUS_LABELS.customer_replied,
    };
  }

  if (latest.status === "new" || latest.isRead === false) {
    return { key: "new", label: INBOX_TICKET_STATUS_LABELS.new };
  }

  return { key: "open", label: INBOX_TICKET_STATUS_LABELS.open };
}
