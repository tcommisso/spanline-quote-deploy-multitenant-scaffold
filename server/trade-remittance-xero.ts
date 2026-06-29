import {
  getValidAccessToken,
  getXeroInvoices,
  getXeroPayments,
  type XeroInvoice,
  type XeroPayment,
} from "./xero-client";

type XeroLinkedTrade = {
  id: number;
  xeroContactId: string | null;
};

export function parseXeroDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/\/Date\((\d+)([+-]\d+)?\)\//);
    if (match) return new Date(parseInt(match[1], 10)).toISOString();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function xeroDate(value: unknown, fallback = new Date()) {
  const parsed = parseXeroDate(value);
  return parsed ? new Date(parsed) : fallback;
}

function isAccountsPayablePayment(payment: XeroPayment) {
  return !payment.Invoice?.Type || payment.Invoice.Type === "ACCPAY";
}

function sortByDateDesc<T extends { date: Date }>(rows: T[]) {
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

type RemittanceDedupeInput = {
  installerId?: number | null;
  amount?: string | number | null;
  date?: Date | string | null;
  reference?: string | null;
  xeroPaymentId?: string | null;
  xeroInvoiceId?: string | null;
  xeroInvoiceNumber?: string | null;
};

function normaliseText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalisePaymentId(value: unknown) {
  return normaliseText(value).replace(/^xero:/, "");
}

function remittanceDateKey(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function remittanceAmountKey(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return String(Math.round(amount * 100));
}

export function tradeRemittanceDedupeKeys(remittance: RemittanceDedupeInput): string[] {
  const keys: string[] = [];
  const paymentId = normalisePaymentId(remittance.xeroPaymentId);
  if (paymentId) keys.push(`payment:${paymentId}`);

  const installerKey = remittance.installerId == null ? "unknown" : String(remittance.installerId);
  const invoiceKey = normaliseText(remittance.xeroInvoiceId) || normaliseText(remittance.xeroInvoiceNumber);
  const referenceKey = normaliseText(remittance.reference);
  const dateKey = remittanceDateKey(remittance.date);
  const amountKey = remittanceAmountKey(remittance.amount);

  if (invoiceKey && dateKey && amountKey) {
    keys.push(`trade:${installerKey}:invoice:${invoiceKey}:date:${dateKey}:amount:${amountKey}`);
  }
  if (referenceKey && dateKey && amountKey) {
    keys.push(`trade:${installerKey}:ref:${referenceKey}:date:${dateKey}:amount:${amountKey}`);
  }

  return keys;
}

export function addTradeRemittanceDedupeKeys(seen: Set<string>, remittance: RemittanceDedupeInput) {
  for (const key of tradeRemittanceDedupeKeys(remittance)) seen.add(key);
}

export function hasTradeRemittanceDedupeKey(seen: Set<string>, remittance: RemittanceDedupeInput) {
  return tradeRemittanceDedupeKeys(remittance).some((key) => seen.has(key));
}

export function dedupeTradeRemittances<T extends RemittanceDedupeInput>(remittances: T[]) {
  const seen = new Set<string>();
  return remittances.filter((remittance) => {
    const keys = tradeRemittanceDedupeKeys(remittance);
    if (keys.length > 0 && keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

export async function getXeroBillsForTrade(options: {
  appTenantId: number | null | undefined;
  connectionId?: number;
  installer: XeroLinkedTrade;
  timeoutMs?: number;
}) {
  const connectionId = options.connectionId
    ?? (await getValidAccessToken({ appTenantId: options.appTenantId, moduleKey: "trade_portal" }))?.xeroConnectionId;
  if (!connectionId) return { connected: false, bills: [], error: "No active Xero connection" };
  if (!options.installer.xeroContactId) {
    return { connected: true, bills: [], error: "Trade not linked to Xero. Click 'Link to Xero' to match." };
  }

  const result = await getXeroInvoices({
    where: `Type=="ACCPAY"&&Contact.ContactID==guid("${options.installer.xeroContactId}")`,
  }, { connectionId, timeoutMs: options.timeoutMs });

  const bills = (result.Invoices || []).map((invoice: XeroInvoice) => ({
    invoiceId: invoice.InvoiceID,
    invoiceNumber: invoice.InvoiceNumber,
    date: parseXeroDate(invoice.Date),
    dueDate: parseXeroDate(invoice.DueDate),
    status: invoice.Status,
    reference: invoice.Reference,
    subTotal: invoice.SubTotal,
    totalTax: invoice.TotalTax,
    total: invoice.Total,
    amountDue: invoice.AmountDue,
    amountPaid: invoice.AmountPaid,
    lineItems: (invoice.LineItems || []).map((lineItem) => ({
      description: lineItem.Description,
      quantity: lineItem.Quantity,
      unitAmount: lineItem.UnitAmount,
      lineAmount: lineItem.LineAmount,
    })),
  }));

  return { connected: true, bills, error: null };
}

export async function getXeroPaymentRemittancesForTrade(options: {
  appTenantId: number | null | undefined;
  connectionId?: number;
  installer: XeroLinkedTrade;
  timeoutMs?: number;
}) {
  const connectionId = options.connectionId
    ?? (await getValidAccessToken({ appTenantId: options.appTenantId, moduleKey: "trade_portal" }))?.xeroConnectionId;
  if (!connectionId) return { connected: false, remittances: [], error: "No active Xero connection" };
  if (!options.installer.xeroContactId) {
    return { connected: true, remittances: [], error: "Trade not linked to Xero." };
  }

  const result = await getXeroPayments({
    where: `Invoice.Contact.ContactID=guid("${options.installer.xeroContactId}")`,
  }, { connectionId, timeoutMs: options.timeoutMs });

  const remittances = sortByDateDesc(dedupeTradeRemittances((result.Payments || [])
    .filter(isAccountsPayablePayment)
    .filter((payment) => Boolean(payment.PaymentID))
    .map((payment) => ({
      id: `xero:${payment.PaymentID}`,
      installerId: options.installer.id,
      amount: String(payment.Amount || "0"),
      date: xeroDate(payment.Date),
      reference: payment.Reference || payment.Invoice?.InvoiceNumber || null,
      fileUrl: null,
      fileKey: null,
      notes: `Xero payment${payment.Invoice?.InvoiceNumber ? ` for invoice ${payment.Invoice.InvoiceNumber}` : ""}`,
      source: "xero" as const,
      xeroPaymentId: payment.PaymentID,
      xeroInvoiceId: payment.Invoice?.InvoiceID || null,
      xeroInvoiceNumber: payment.Invoice?.InvoiceNumber || null,
      createdAt: xeroDate(payment.Date),
      isLiveXero: true,
    }))));

  return { connected: true, remittances, error: null };
}
