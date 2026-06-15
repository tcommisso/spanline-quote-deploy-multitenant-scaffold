import { and, eq, inArray, sql } from "drizzle-orm";
import {
  constructionJobFinancials,
  xeroAccountingTransactions,
  xeroCostImportItems,
  xeroProjectMappings,
} from "../drizzle/schema";
import { xeroApiRequest } from "./xero-client";

type XeroAuth = {
  accessToken: string;
  tenantId: string;
  xeroConnectionId: number;
};

type SyncOptions = {
  appTenantId?: number | null;
  maxPages?: number;
  includeUnmatched?: boolean;
};

type PreparedMapping = {
  id: number;
  jobId: number;
  xeroProjectName: string | null;
  xeroContactId: string | null;
  projectNameNorm: string;
  jobNumber: string;
};

type XeroLineItem = {
  LineItemID?: string;
  Description?: string;
  LineAmount?: number;
  TaxAmount?: number;
  AccountCode?: string;
  Tracking?: Array<{ Name?: string; Option?: string }>;
};

type XeroAccountingDocument = {
  InvoiceID?: string;
  BankTransactionID?: string;
  CreditNoteID?: string;
  InvoiceNumber?: string;
  BankTransactionNumber?: string;
  CreditNoteNumber?: string;
  Reference?: string;
  Type?: string;
  Total?: number;
  SubTotal?: number;
  AmountPaid?: number;
  AmountDue?: number;
  Status?: string;
  DateString?: string;
  Date?: string;
  DueDateString?: string;
  DueDate?: string;
  CurrencyCode?: string;
  Contact?: { ContactID?: string; Name?: string };
  LineItems?: XeroLineItem[];
};

type MatchResult = {
  mapping: PreparedMapping | null;
  method: "tracking" | "reference" | "description" | "contact" | "unmatched";
  trackingCategoryName?: string;
  trackingOptionName?: string;
};

function normalise(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function asMoney(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return (Math.round(value * 10000) / 10000).toFixed(4);
}

function extractJobNumber(projectName: string | null | undefined) {
  const match = String(projectName || "").match(/-(\d{4,6})(?:-|$)/);
  return match?.[1] || "";
}

function prepareMappings(mappings: any[]): PreparedMapping[] {
  return mappings.map((mapping) => ({
    id: mapping.id,
    jobId: mapping.jobId,
    xeroProjectName: mapping.xeroProjectName || null,
    xeroContactId: mapping.xeroContactId || null,
    projectNameNorm: normalise(mapping.xeroProjectName),
    jobNumber: extractJobNumber(mapping.xeroProjectName),
  }));
}

function sourceKey(auth: XeroAuth, sourceType: string, transactionId: string, lineItemId: string) {
  return `${auth.xeroConnectionId}:${sourceType}:${transactionId}:${lineItemId}`;
}

function categoryForCostLine(line: XeroLineItem): "materials" | "labour" | "other" {
  const code = String(line.AccountCode || "");
  const desc = normalise(line.Description);
  if (code.startsWith("4")) return "materials";
  if (code.startsWith("5")) return "labour";
  if (desc.includes("material") || desc.includes("supply") || desc.includes("deliver")) return "materials";
  if (desc.includes("labour") || desc.includes("labor") || desc.includes("install") || desc.includes("subcontract")) return "labour";
  return "other";
}

function findMappingForLine(
  sourceType: "invoice" | "bill" | "bank_transaction" | "credit_note",
  document: XeroAccountingDocument,
  line: XeroLineItem,
  mappings: PreparedMapping[],
): MatchResult {
  const tracking = line.Tracking || [];

  for (const track of tracking) {
    const option = normalise(track.Option);
    if (!option) continue;
    for (const mapping of mappings) {
      if (mapping.projectNameNorm && option.includes(mapping.projectNameNorm)) {
        return {
          mapping,
          method: "tracking",
          trackingCategoryName: track.Name || null as any,
          trackingOptionName: track.Option || null as any,
        };
      }
      if (mapping.jobNumber && option.includes(mapping.jobNumber)) {
        return {
          mapping,
          method: "tracking",
          trackingCategoryName: track.Name || null as any,
          trackingOptionName: track.Option || null as any,
        };
      }
    }
  }

  const referenceText = normalise([
    document.Reference,
    document.InvoiceNumber,
    document.BankTransactionNumber,
    document.CreditNoteNumber,
  ].filter(Boolean).join(" "));
  for (const mapping of mappings) {
    if (mapping.projectNameNorm && referenceText.includes(mapping.projectNameNorm)) {
      return { mapping, method: "reference" };
    }
    if (mapping.jobNumber && referenceText.includes(mapping.jobNumber)) {
      return { mapping, method: "reference" };
    }
  }

  const descriptionText = normalise(line.Description);
  for (const mapping of mappings) {
    if (mapping.projectNameNorm && descriptionText.includes(mapping.projectNameNorm)) {
      return { mapping, method: "description" };
    }
    if (mapping.jobNumber && descriptionText.includes(mapping.jobNumber)) {
      return { mapping, method: "description" };
    }
  }

  if ((sourceType === "invoice" || sourceType === "credit_note") && document.Contact?.ContactID) {
    const contactId = document.Contact.ContactID;
    const contactMapping = mappings.find((mapping) => mapping.xeroContactId === contactId);
    if (contactMapping) return { mapping: contactMapping, method: "contact" };
  }

  return { mapping: null, method: "unmatched" };
}

async function fetchInvoices(
  type: "ACCREC" | "ACCPAY",
  auth: XeroAuth,
  maxPages: number,
): Promise<XeroAccountingDocument[]> {
  const invoices: XeroAccountingDocument[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      where: `Type=="${type}"`,
      Statuses: "AUTHORISED,PAID",
      page: String(page),
    });
    const result = await xeroApiRequest<{ Invoices?: XeroAccountingDocument[] }>(
      `/Invoices?${params.toString()}`,
      { timeoutMs: 60000, connectionId: auth.xeroConnectionId },
    );
    const pageItems = result.Invoices || [];
    invoices.push(...pageItems);
    if (pageItems.length < 100) break;
  }
  return invoices;
}

async function fetchSpendBankTransactions(auth: XeroAuth, maxPages: number): Promise<XeroAccountingDocument[]> {
  const transactions: XeroAccountingDocument[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      where: `Type=="SPEND"`,
      page: String(page),
    });
    const result = await xeroApiRequest<{ BankTransactions?: XeroAccountingDocument[] }>(
      `/BankTransactions?${params.toString()}`,
      { timeoutMs: 60000, connectionId: auth.xeroConnectionId },
    );
    const pageItems = result.BankTransactions || [];
    transactions.push(...pageItems);
    if (pageItems.length < 100) break;
  }
  return transactions;
}

async function fetchCreditNotes(auth: XeroAuth, maxPages: number): Promise<XeroAccountingDocument[]> {
  const creditNotes: XeroAccountingDocument[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({ page: String(page) });
    const result = await xeroApiRequest<{ CreditNotes?: XeroAccountingDocument[] }>(
      `/CreditNotes?${params.toString()}`,
      { timeoutMs: 60000, connectionId: auth.xeroConnectionId },
    );
    const pageItems = (result.CreditNotes || []).filter((note) =>
      ["AUTHORISED", "PAID"].includes(String(note.Status || "").toUpperCase())
    );
    creditNotes.push(...pageItems);
    if ((result.CreditNotes || []).length < 100) break;
  }
  return creditNotes;
}

function proportionalAmounts(document: XeroAccountingDocument, line: XeroLineItem, lineIndex: number, lineCount: number) {
  const lineAmount = asMoney(line.LineAmount);
  const subtotal = asMoney(document.SubTotal);
  const total = asMoney(document.Total);
  const taxAmount = line.TaxAmount !== undefined
    ? asMoney(line.TaxAmount)
    : subtotal > 0
      ? (total - subtotal) * (lineAmount / subtotal)
      : 0;
  const grossAmount = lineAmount + taxAmount;
  const ratio = total > 0
    ? grossAmount / total
    : lineCount > 0
      ? 1 / lineCount
      : lineIndex === 0
        ? 1
        : 0;
  return {
    lineAmount,
    taxAmount,
    grossAmount,
    amountPaid: asMoney(document.AmountPaid) * ratio,
    amountDue: asMoney(document.AmountDue) * ratio,
  };
}

async function storeDocumentLines(
  db: any,
  auth: XeroAuth,
  sourceType: "invoice" | "bill" | "bank_transaction" | "credit_note",
  documents: XeroAccountingDocument[],
  mappings: PreparedMapping[],
  options: SyncOptions,
) {
  let imported = 0;
  let unmatched = 0;
  const affectedMappingIds = new Set<number>();

  for (const document of documents) {
    const transactionId = document.InvoiceID || document.BankTransactionID || document.CreditNoteID;
    if (!transactionId) continue;

    const lines = document.LineItems?.length ? document.LineItems : [{ Description: document.Reference || document.InvoiceNumber || document.CreditNoteNumber || "Transaction", LineAmount: document.SubTotal || document.Total || 0 }];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const match = findMappingForLine(sourceType, document, line, mappings);
      if (!match.mapping && !options.includeUnmatched) {
        unmatched++;
        continue;
      }

      const lineItemId = line.LineItemID || `${transactionId}:${index}`;
      const amounts = proportionalAmounts(document, line, index, lines.length);
      const isSalesCredit = sourceType === "credit_note" && document.Type === "ACCRECCREDIT";
      const isSupplierCredit = sourceType === "credit_note" && document.Type === "ACCPAYCREDIT";
      const amountSign = sourceType === "credit_note" ? -1 : 1;
      const isRevenue = sourceType === "invoice" || isSalesCredit;
      const isCost = sourceType === "bill" || sourceType === "bank_transaction" || isSupplierCredit;
      const costCategory = isRevenue ? "revenue" : categoryForCostLine(line);

      const values = {
        appTenantId: options.appTenantId ?? null,
        xeroConnectionId: auth.xeroConnectionId,
        mappingId: match.mapping?.id || null,
        jobId: match.mapping?.jobId || null,
        sourceKey: sourceKey(auth, sourceType, transactionId, lineItemId),
        sourceType,
        xeroTransactionId: transactionId,
        xeroLineItemId: lineItemId,
        transactionNumber: document.InvoiceNumber || document.BankTransactionNumber || document.CreditNoteNumber || null,
        contactId: document.Contact?.ContactID || null,
        contactName: document.Contact?.Name || null,
        transactionDate: document.DateString || document.Date || null,
        dueDate: document.DueDateString || document.DueDate || null,
        status: document.Status || null,
        reference: document.Reference || null,
        description: line.Description || null,
        accountCode: line.AccountCode || null,
        trackingCategoryName: match.trackingCategoryName || line.Tracking?.[0]?.Name || null,
        trackingOptionName: match.trackingOptionName || line.Tracking?.[0]?.Option || null,
        matchMethod: match.method,
        costCategory,
        lineAmount: money(amounts.lineAmount * amountSign),
        taxAmount: money(amounts.taxAmount * amountSign),
        grossAmount: money(amounts.grossAmount * amountSign),
        amountPaid: money(amounts.amountPaid * amountSign),
        amountDue: money(amounts.amountDue * amountSign),
        currencyCode: document.CurrencyCode || null,
        isCost,
        isRevenue,
        raw: {
          transaction: {
            total: document.Total,
            subtotal: document.SubTotal,
            amountPaid: document.AmountPaid,
            amountDue: document.AmountDue,
            type: document.Type,
          },
          line,
        },
        syncedAt: new Date(),
      };

      await db.insert(xeroAccountingTransactions).values(values).onDuplicateKeyUpdate({
        set: {
          appTenantId: values.appTenantId,
          mappingId: values.mappingId,
          jobId: values.jobId,
          transactionNumber: values.transactionNumber,
          contactId: values.contactId,
          contactName: values.contactName,
          transactionDate: values.transactionDate,
          dueDate: values.dueDate,
          status: values.status,
          reference: values.reference,
          description: values.description,
          accountCode: values.accountCode,
          trackingCategoryName: values.trackingCategoryName,
          trackingOptionName: values.trackingOptionName,
          matchMethod: values.matchMethod,
          costCategory: values.costCategory,
          lineAmount: values.lineAmount,
          taxAmount: values.taxAmount,
          grossAmount: values.grossAmount,
          amountPaid: values.amountPaid,
          amountDue: values.amountDue,
          currencyCode: values.currencyCode,
          isCost: values.isCost,
          isRevenue: values.isRevenue,
          raw: values.raw,
          syncedAt: values.syncedAt,
        },
      });

      if (match.mapping) affectedMappingIds.add(match.mapping.id);
      imported++;
    }
  }

  return { imported, unmatched, affectedMappingIds };
}

export async function rollupXeroAccountingTransactionsForMapping(db: any, mapping: any) {
  const rows = await db.select().from(xeroAccountingTransactions)
    .where(eq(xeroAccountingTransactions.mappingId, mapping.id));

  let costs = 0;
  let materials = 0;
  let labour = 0;
  let other = 0;
  let revenue = 0;
  let paid = 0;

  for (const row of rows) {
    const gross = parseFloat(String(row.grossAmount || "0"));
    if (row.isRevenue) {
      revenue += gross;
      paid += parseFloat(String(row.amountPaid || "0"));
    } else if (row.isCost) {
      costs += gross;
      if (row.costCategory === "materials") materials += gross;
      else if (row.costCategory === "labour") labour += gross;
      else other += gross;
    }
  }

  const [existingFinancials] = await db.select({ id: constructionJobFinancials.id })
    .from(constructionJobFinancials)
    .where(eq(constructionJobFinancials.jobId, mapping.jobId))
    .limit(1);

  const financialValues = {
    xeroInvoicedAmount: revenue.toFixed(2),
    xeroPaidAmount: paid.toFixed(2),
    xeroMaterialsCost: materials.toFixed(2),
    xeroLabourCost: labour.toFixed(2),
    xeroOtherCost: other.toFixed(2),
    xeroTotalCost: costs.toFixed(2),
  };

  if (existingFinancials) {
    await db.update(constructionJobFinancials)
      .set(financialValues)
      .where(eq(constructionJobFinancials.jobId, mapping.jobId));
  } else {
    await db.insert(constructionJobFinancials).values({
      jobId: mapping.jobId,
      ...financialValues,
    });
  }

  await db.update(xeroProjectMappings)
    .set({
      totalInvoiced: revenue.toFixed(2),
      totalCosts: costs.toFixed(2),
      totalProfit: (revenue - costs).toFixed(2),
      lastSyncedAt: new Date(),
    })
    .where(eq(xeroProjectMappings.id, mapping.id));

  return { revenue, paid, costs, materials, labour, other };
}

export async function getLegacyImportedCostTotal(db: any, jobId: number) {
  const [importedCostRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${xeroCostImportItems.costIncGst}), 0)` })
    .from(xeroCostImportItems)
    .where(eq(xeroCostImportItems.jobId, jobId));
  return parseFloat(importedCostRow?.total || "0");
}

export async function syncXeroAccountingTransactionsForMappings(
  db: any,
  auth: XeroAuth,
  mappings: any[],
  options: SyncOptions = {},
) {
  const prepared = prepareMappings(mappings);
  if (!prepared.length) {
    return { imported: 0, unmatched: 0, affectedMappings: 0, rolledUp: [] as any[], fetchErrors: [] as string[] };
  }

  const maxPages = options.maxPages || 50;
  const fetchErrors: string[] = [];
  const [accrecInvoices, accpayBills, spendTransactions, creditNotes] = await Promise.all([
    fetchInvoices("ACCREC", auth, maxPages).catch((err: any) => {
      fetchErrors.push(`invoices: ${err.message}`);
      return [] as XeroAccountingDocument[];
    }),
    fetchInvoices("ACCPAY", auth, maxPages).catch((err: any) => {
      fetchErrors.push(`bills: ${err.message}`);
      return [] as XeroAccountingDocument[];
    }),
    fetchSpendBankTransactions(auth, maxPages).catch((err: any) => {
      fetchErrors.push(`bank transactions: ${err.message}`);
      return [] as XeroAccountingDocument[];
    }),
    fetchCreditNotes(auth, maxPages).catch((err: any) => {
      fetchErrors.push(`credit notes: ${err.message}`);
      return [] as XeroAccountingDocument[];
    }),
  ]);

  const invoiceResult = await storeDocumentLines(db, auth, "invoice", accrecInvoices, prepared, options);
  const billResult = await storeDocumentLines(db, auth, "bill", accpayBills, prepared, options);
  const spendResult = await storeDocumentLines(db, auth, "bank_transaction", spendTransactions, prepared, options);
  const creditNoteResult = await storeDocumentLines(db, auth, "credit_note", creditNotes, prepared, options);

  const affectedMappingIds = new Set<number>([
    ...Array.from(invoiceResult.affectedMappingIds),
    ...Array.from(billResult.affectedMappingIds),
    ...Array.from(spendResult.affectedMappingIds),
    ...Array.from(creditNoteResult.affectedMappingIds),
  ]);

  const rolledUp = [];
  if (affectedMappingIds.size) {
    const affectedMappings = mappings.filter((mapping) => affectedMappingIds.has(mapping.id));
    for (const mapping of affectedMappings) {
      rolledUp.push({
        mappingId: mapping.id,
        jobId: mapping.jobId,
        ...(await rollupXeroAccountingTransactionsForMapping(db, mapping)),
      });
    }
  }

  return {
    imported: invoiceResult.imported + billResult.imported + spendResult.imported + creditNoteResult.imported,
    unmatched: invoiceResult.unmatched + billResult.unmatched + spendResult.unmatched + creditNoteResult.unmatched,
    affectedMappings: affectedMappingIds.size,
    rolledUp,
    fetchErrors,
  };
}

export async function getXeroAccountingRowsForJob(db: any, jobId: number, limit = 100) {
  return db.select().from(xeroAccountingTransactions)
    .where(eq(xeroAccountingTransactions.jobId, jobId))
    .orderBy(sql`${xeroAccountingTransactions.transactionDate} DESC`, sql`${xeroAccountingTransactions.id} DESC`)
    .limit(limit);
}

export async function getXeroAccountingSummaryForJob(db: any, jobId: number) {
  const rows = await getXeroAccountingRowsForJob(db, jobId, 1000);
  const costs = rows.filter((row: any) => row.isCost);
  const revenue = rows.filter((row: any) => row.isRevenue);
  return {
    totalCost: costs.reduce((sum: number, row: any) => sum + parseFloat(String(row.grossAmount || "0")), 0),
    totalRevenue: revenue.reduce((sum: number, row: any) => sum + parseFloat(String(row.grossAmount || "0")), 0),
    totalPaid: revenue.reduce((sum: number, row: any) => sum + parseFloat(String(row.amountPaid || "0")), 0),
    costCount: costs.length,
    revenueCount: revenue.length,
    rows,
  };
}

export async function getMappingsForJobs(db: any, xeroConnectionId: number, jobIds: number[]) {
  if (!jobIds.length) return [];
  return db.select().from(xeroProjectMappings)
    .where(and(
      eq(xeroProjectMappings.xeroConnectionId, xeroConnectionId),
      inArray(xeroProjectMappings.jobId, jobIds),
    ));
}
