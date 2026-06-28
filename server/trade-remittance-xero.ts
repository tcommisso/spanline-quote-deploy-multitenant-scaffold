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

  const remittances = sortByDateDesc((result.Payments || [])
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
    })));

  return { connected: true, remittances, error: null };
}
