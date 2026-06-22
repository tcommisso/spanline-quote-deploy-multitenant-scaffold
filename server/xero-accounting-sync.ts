import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  constructionJobs,
  constructionJobFinancials,
  crmLeads,
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
  modifiedSince?: Date | string | null;
};

type PreparedMapping = {
  id: number;
  jobId: number;
  xeroProjectName: string | null;
  xeroContactId: string | null;
  projectNameNorm: string;
  projectNameCompact: string;
  quoteNumberNorm: string;
  quoteNumberCompact: string;
  clientNameNorm: string;
  clientNameCompact: string;
  clientNumberNorm: string;
  clientNumberCompact: string;
  constructionJobNumberNorm: string;
  constructionJobNumberCompact: string;
  siteAddressNorm: string;
  siteAddressCompact: string;
  jobNumber: string;
  accountNumberIdentifiers: string[];
  projectIdentifiers: string[];
};

type XeroLineItem = {
  LineItemID?: string;
  Description?: string;
  LineAmount?: number;
  TaxAmount?: number;
  AccountCode?: string;
  Tracking?: Array<{ Name?: string; Option?: string }>;
  [key: string]: unknown;
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
  Contact?: { ContactID?: string; Name?: string; AccountNumber?: string };
  LineItems?: XeroLineItem[];
  [key: string]: unknown;
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

function compact(value: string | null | undefined) {
  return normalise(value).replace(/[^a-z0-9]+/g, "");
}

function asMoney(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return (Math.round(value * 10000) / 10000).toFixed(4);
}

function modifiedSinceHeaders(modifiedSince: SyncOptions["modifiedSince"]) {
  if (!modifiedSince) return undefined;
  const date = modifiedSince instanceof Date ? modifiedSince : new Date(modifiedSince);
  if (Number.isNaN(date.getTime())) return undefined;
  return { "If-Modified-Since": date.toUTCString() };
}

function extractJobNumber(projectName: string | null | undefined) {
  const match = String(projectName || "").match(/\b(?:ACT|RIV|NSW)?[-\s]*(\d{4,6})\b/i);
  return match?.[1] || "";
}

function extractProjectIdentifiers(...values: Array<unknown>) {
  const identifiers = new Set<string>();
  const pattern = /\b(?:[A-Z]{2,6}[-\s]*)?(\d{5,6})(?:[-\s][A-Z0-9]{1,10})*\b/gi;
  for (const value of values) {
    const text = String(value || "");
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (!/^0+$/.test(match[1])) identifiers.add(match[1]);
    }
  }
  return Array.from(identifiers);
}

function isBranchOnlyTrackingOption(option: string) {
  return option.length <= 3 || ["act", "nsw", "qld", "vic", "sa", "wa", "tas", "nt"].includes(option);
}

function isProjectTrackingCategory(name: string) {
  return /\b(project|job|client|account)\b/i.test(name);
}

function isBranchTrackingCategory(name: string) {
  return /\b(branch|location|region|state|territory)\b/i.test(name);
}

function prepareMappings(mappings: any[]): PreparedMapping[] {
  return mappings.map((mapping) => ({
    id: mapping.id,
    jobId: mapping.jobId,
    xeroProjectName: mapping.xeroProjectName || null,
    xeroContactId: mapping.xeroContactId || null,
    projectNameNorm: normalise(mapping.xeroProjectName),
    projectNameCompact: compact(mapping.xeroProjectName),
    quoteNumberNorm: normalise(mapping.quoteNumber),
    quoteNumberCompact: compact(mapping.quoteNumber),
    clientNameNorm: normalise(mapping.clientName),
    clientNameCompact: compact(mapping.clientName),
    clientNumberNorm: normalise(mapping.clientNumber),
    clientNumberCompact: compact(mapping.clientNumber),
    constructionJobNumberNorm: normalise(mapping.constructionJobNumber),
    constructionJobNumberCompact: compact(mapping.constructionJobNumber),
    siteAddressNorm: normalise(mapping.siteAddress),
    siteAddressCompact: compact(mapping.siteAddress),
    jobNumber: extractJobNumber(mapping.quoteNumber)
      || extractJobNumber(mapping.clientNumber)
      || extractJobNumber(mapping.constructionJobNumber)
      || extractJobNumber(mapping.xeroProjectName),
    accountNumberIdentifiers: extractProjectIdentifiers(mapping.clientNumber),
    projectIdentifiers: extractProjectIdentifiers(
      mapping.quoteNumber,
      mapping.constructionJobNumber,
      mapping.xeroProjectName,
    ),
  }));
}

async function withJobHints(db: any, mappings: any[]) {
  const jobIds = Array.from(new Set(mappings.map((mapping) => mapping.jobId).filter(Boolean)));
  if (!jobIds.length) return mappings;

  const jobs = await db.select({
    id: constructionJobs.id,
    quoteNumber: constructionJobs.quoteNumber,
    clientName: constructionJobs.clientName,
    siteAddress: constructionJobs.siteAddress,
    leadId: constructionJobs.leadId,
  })
    .from(constructionJobs)
    .where(inArray(constructionJobs.id, jobIds));

  const leadIds = Array.from(
    new Set<number>(
      jobs
        .map((job: any) => Number(job.leadId))
        .filter((leadId: number) => Number.isFinite(leadId) && leadId > 0)
    )
  );
  const leadRows = leadIds.length
    ? await db.select({
        id: crmLeads.id,
        clientNumber: crmLeads.clientNumber,
        constructionJobNumber: crmLeads.constructionJobNumber,
        contactAddress: crmLeads.contactAddress,
      })
        .from(crmLeads)
        .where(inArray(crmLeads.id, leadIds))
    : [];

  const leadsById = new Map<number, { clientNumber: string | null; constructionJobNumber: string | null; contactAddress: string | null }>(
    leadRows.map((lead: any) => [Number(lead.id), {
      clientNumber: lead.clientNumber ?? null,
      constructionJobNumber: lead.constructionJobNumber ?? null,
      contactAddress: lead.contactAddress ?? null,
    }])
  );

  const jobsById = new Map<number, {
    quoteNumber: string | null;
    clientName: string | null;
    clientNumber: string | null;
    constructionJobNumber: string | null;
    siteAddress: string | null;
  }>(
    jobs.map((job: any) => {
      const lead = leadsById.get(Number(job.leadId));
      return [Number(job.id), {
        quoteNumber: job.quoteNumber ?? null,
        clientName: job.clientName ?? null,
        clientNumber: lead?.clientNumber ?? null,
        constructionJobNumber: lead?.constructionJobNumber ?? null,
        siteAddress: job.siteAddress ?? lead?.contactAddress ?? null,
      }];
    })
  );
  return mappings.map((mapping) => ({
    ...mapping,
    quoteNumber: mapping.quoteNumber ?? jobsById.get(Number(mapping.jobId))?.quoteNumber ?? null,
    clientName: mapping.clientName ?? jobsById.get(Number(mapping.jobId))?.clientName ?? null,
    clientNumber: mapping.clientNumber ?? jobsById.get(Number(mapping.jobId))?.clientNumber ?? null,
    constructionJobNumber: mapping.constructionJobNumber ?? jobsById.get(Number(mapping.jobId))?.constructionJobNumber ?? null,
    siteAddress: mapping.siteAddress ?? jobsById.get(Number(mapping.jobId))?.siteAddress ?? null,
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
  const textMatchesMapping = (text: string, textCompact: string, mapping: PreparedMapping) => {
    if (mapping.clientNumberNorm && text.includes(mapping.clientNumberNorm)) return true;
    if (mapping.clientNumberCompact && textCompact.includes(mapping.clientNumberCompact)) return true;
    if (mapping.constructionJobNumberNorm && text.includes(mapping.constructionJobNumberNorm)) return true;
    if (mapping.constructionJobNumberCompact && textCompact.includes(mapping.constructionJobNumberCompact)) return true;
    if (mapping.quoteNumberNorm && text.includes(mapping.quoteNumberNorm)) return true;
    if (mapping.quoteNumberCompact && textCompact.includes(mapping.quoteNumberCompact)) return true;
    const textIdentifiers = extractProjectIdentifiers(text);
    if (textIdentifiers.some((identifier) => mapping.accountNumberIdentifiers.includes(identifier))) return true;
    if (textIdentifiers.some((identifier) => mapping.projectIdentifiers.includes(identifier))) return true;
    if (mapping.jobNumber && text.includes(mapping.jobNumber)) return true;
    if (mapping.projectNameNorm && text.includes(mapping.projectNameNorm)) return true;
    if (mapping.projectNameCompact && textCompact.includes(mapping.projectNameCompact)) return true;
    if (mapping.siteAddressNorm && mapping.siteAddressNorm.length >= 8 && text.includes(mapping.siteAddressNorm)) return true;
    if (mapping.siteAddressCompact && mapping.siteAddressCompact.length >= 8 && textCompact.includes(mapping.siteAddressCompact)) return true;
    if (mapping.clientNameNorm && mapping.clientNameNorm.length >= 6 && text.includes(mapping.clientNameNorm)) return true;
    if (mapping.clientNameCompact && mapping.clientNameCompact.length >= 6 && textCompact.includes(mapping.clientNameCompact)) return true;
    return false;
  };
  const findDescriptionMatch = (text: string, textCompact: string) => {
    const matches = mappings.filter((mapping) => textMatchesMapping(text, textCompact, mapping));
    return matches.length === 1 ? matches[0] : null;
  };

  for (const track of tracking) {
    const option = normalise(track.Option);
    const category = normalise(track.Name);
    const optionCompact = compact(track.Option);
    if (!option) continue;
    if (isBranchTrackingCategory(category)) continue;
    if (!isProjectTrackingCategory(category) && isBranchOnlyTrackingOption(option)) continue;
    for (const mapping of mappings) {
      if (textMatchesMapping(option, optionCompact, mapping)) {
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
    document.Contact?.AccountNumber,
    document.Contact?.Name,
  ].filter(Boolean).join(" "));
  const referenceCompact = compact(referenceText);
  for (const mapping of mappings) {
    if (textMatchesMapping(referenceText, referenceCompact, mapping)) {
      return { mapping, method: "reference" };
    }
  }

  const descriptionText = normalise([
    line.Description,
    document.Reference,
  ].filter(Boolean).join(" "));
  const descriptionCompact = compact(descriptionText);
  const lineDescriptionMatch = findDescriptionMatch(descriptionText, descriptionCompact);
  if (lineDescriptionMatch) {
    return { mapping: lineDescriptionMatch, method: "description" };
  }

  const documentLineText = normalise([
    document.Reference,
    ...(document.LineItems || []).map((documentLine) => documentLine.Description),
  ].filter(Boolean).join(" "));
  const documentLineCompact = compact(documentLineText);
  const documentDescriptionMatch = findDescriptionMatch(documentLineText, documentLineCompact);
  if (documentDescriptionMatch) {
    return { mapping: documentDescriptionMatch, method: "description" };
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
  modifiedSince?: SyncOptions["modifiedSince"],
): Promise<XeroAccountingDocument[]> {
  const invoices: XeroAccountingDocument[] = [];
  const headers = modifiedSinceHeaders(modifiedSince);
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      where: `Type=="${type}"`,
      Statuses: "AUTHORISED,PAID",
      page: String(page),
    });
    const result = await xeroApiRequest<{ Invoices?: XeroAccountingDocument[] }>(
      `/Invoices?${params.toString()}`,
      { timeoutMs: 60000, connectionId: auth.xeroConnectionId, headers },
    );
    const pageItems = result.Invoices || [];
    invoices.push(...pageItems);
    if (pageItems.length < 100) break;
  }
  return invoices;
}

async function fetchDetailedInvoiceDocument(auth: XeroAuth, invoiceId: string): Promise<XeroAccountingDocument | null> {
  const result = await xeroApiRequest<{ Invoices?: XeroAccountingDocument[] }>(
    `/Invoices/${invoiceId}`,
    { timeoutMs: 60000, connectionId: auth.xeroConnectionId },
  );
  return result.Invoices?.[0] || null;
}

async function fetchSpendBankTransactions(auth: XeroAuth, maxPages: number, modifiedSince?: SyncOptions["modifiedSince"]): Promise<XeroAccountingDocument[]> {
  const transactions: XeroAccountingDocument[] = [];
  const headers = modifiedSinceHeaders(modifiedSince);
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      where: `Type=="SPEND"`,
      page: String(page),
    });
    const result = await xeroApiRequest<{ BankTransactions?: XeroAccountingDocument[] }>(
      `/BankTransactions?${params.toString()}`,
      { timeoutMs: 60000, connectionId: auth.xeroConnectionId, headers },
    );
    const pageItems = result.BankTransactions || [];
    transactions.push(...pageItems);
    if (pageItems.length < 100) break;
  }
  return transactions;
}

async function fetchCreditNotes(auth: XeroAuth, maxPages: number, modifiedSince?: SyncOptions["modifiedSince"]): Promise<XeroAccountingDocument[]> {
  const creditNotes: XeroAccountingDocument[] = [];
  const headers = modifiedSinceHeaders(modifiedSince);
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({ page: String(page) });
    const result = await xeroApiRequest<{ CreditNotes?: XeroAccountingDocument[] }>(
      `/CreditNotes?${params.toString()}`,
      { timeoutMs: 60000, connectionId: auth.xeroConnectionId, headers },
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
  const matchCounts: Record<MatchResult["method"], number> = {
    tracking: 0,
    reference: 0,
    description: 0,
    contact: 0,
    unmatched: 0,
  };

  for (const document of documents) {
    const transactionId = document.InvoiceID || document.BankTransactionID || document.CreditNoteID;
    if (!transactionId) continue;

    let effectiveDocument = document;
    let lines = effectiveDocument.LineItems?.length
      ? effectiveDocument.LineItems
      : [{ Description: effectiveDocument.Reference || effectiveDocument.InvoiceNumber || effectiveDocument.CreditNoteNumber || "Transaction", LineAmount: effectiveDocument.SubTotal || effectiveDocument.Total || 0 }];

    if (
      sourceType === "bill" &&
      transactionId &&
      !lines.some((line) => findMappingForLine(sourceType, effectiveDocument, line, mappings).mapping)
    ) {
      try {
        const detailedDocument = await fetchDetailedInvoiceDocument(auth, transactionId);
        if (detailedDocument?.LineItems?.length) {
          effectiveDocument = { ...effectiveDocument, ...detailedDocument };
          lines = detailedDocument.LineItems;
        }
      } catch {
        // Fall back to the paged invoice payload when detail fetch is unavailable.
      }
    }

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const match = findMappingForLine(sourceType, effectiveDocument, line, mappings);
      matchCounts[match.method] = (matchCounts[match.method] || 0) + 1;
      if (!match.mapping && !options.includeUnmatched) {
        unmatched++;
        continue;
      }

      const lineItemId = line.LineItemID || `${transactionId}:${index}`;
      const amounts = proportionalAmounts(effectiveDocument, line, index, lines.length);
      const isSalesCredit = sourceType === "credit_note" && effectiveDocument.Type === "ACCRECCREDIT";
      const isSupplierCredit = sourceType === "credit_note" && effectiveDocument.Type === "ACCPAYCREDIT";
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
        transactionNumber: effectiveDocument.InvoiceNumber || effectiveDocument.BankTransactionNumber || effectiveDocument.CreditNoteNumber || null,
        contactId: effectiveDocument.Contact?.ContactID || null,
        contactName: effectiveDocument.Contact?.Name || null,
        transactionDate: effectiveDocument.DateString || effectiveDocument.Date || null,
        dueDate: effectiveDocument.DueDateString || effectiveDocument.DueDate || null,
        status: effectiveDocument.Status || null,
        reference: effectiveDocument.Reference || null,
        description: line.Description || null,
        accountCode: line.AccountCode || null,
        trackingCategoryName: match.trackingCategoryName || line.Tracking?.[0]?.Name || null,
        trackingOptionName: match.trackingOptionName || line.Tracking?.[0]?.Option || null,
        matchMethod: match.method,
        costCategory,
        lineAmount: money(Math.abs(amounts.lineAmount) * amountSign),
        taxAmount: money(Math.abs(amounts.taxAmount) * amountSign),
        grossAmount: money(Math.abs(amounts.grossAmount) * amountSign),
        amountPaid: money(Math.abs(amounts.amountPaid) * amountSign),
        amountDue: money(Math.abs(amounts.amountDue) * amountSign),
        currencyCode: effectiveDocument.CurrencyCode || null,
        isCost,
        isRevenue,
        raw: {
          transaction: {
            total: effectiveDocument.Total,
            subtotal: effectiveDocument.SubTotal,
            amountPaid: effectiveDocument.AmountPaid,
            amountDue: effectiveDocument.AmountDue,
            type: effectiveDocument.Type,
            lineDescriptions: (effectiveDocument.LineItems || [])
              .map((documentLine) => documentLine.Description)
              .filter(Boolean),
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

  return { imported, unmatched, affectedMappingIds, matchCounts };
}

export async function rollupXeroAccountingTransactionsForMapping(db: any, mapping: any) {
  const rows = await db.select().from(xeroAccountingTransactions)
    .where(and(
      eq(xeroAccountingTransactions.mappingId, mapping.id),
      isNull(xeroAccountingTransactions.ignoredAt),
    ));

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
  const prepared = prepareMappings(await withJobHints(db, mappings));
  if (!prepared.length) {
    return {
      imported: 0,
      unmatched: 0,
      affectedMappings: 0,
      rolledUp: [] as any[],
      fetchErrors: [] as string[],
      fetched: { invoices: 0, bills: 0, bankTransactions: 0, creditNotes: 0, total: 0 },
    };
  }

  const maxPages = options.maxPages || 50;
  const modifiedSince = options.modifiedSince || null;
  const fetchErrors: string[] = [];
  const fetchSource = async (
    label: string,
    fetcher: () => Promise<XeroAccountingDocument[]>,
  ) => {
    try {
      return await fetcher();
    } catch (err: any) {
      fetchErrors.push(`${label}: ${err.message}`);
      return [] as XeroAccountingDocument[];
    }
  };

  const accrecInvoices = await fetchSource("invoices", () => fetchInvoices("ACCREC", auth, maxPages, modifiedSince));
  const accpayBills = await fetchSource("bills", () => fetchInvoices("ACCPAY", auth, maxPages, modifiedSince));
  const spendTransactions = await fetchSource("bank transactions", () => fetchSpendBankTransactions(auth, maxPages, modifiedSince));
  const creditNotes = await fetchSource("credit notes", () => fetchCreditNotes(auth, maxPages, modifiedSince));
  const fetched = {
    invoices: accrecInvoices.length,
    bills: accpayBills.length,
    bankTransactions: spendTransactions.length,
    creditNotes: creditNotes.length,
    total: accrecInvoices.length + accpayBills.length + spendTransactions.length + creditNotes.length,
  };

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
  const matchBreakdown = {
    tracking: invoiceResult.matchCounts.tracking + billResult.matchCounts.tracking + spendResult.matchCounts.tracking + creditNoteResult.matchCounts.tracking,
    reference: invoiceResult.matchCounts.reference + billResult.matchCounts.reference + spendResult.matchCounts.reference + creditNoteResult.matchCounts.reference,
    description: invoiceResult.matchCounts.description + billResult.matchCounts.description + spendResult.matchCounts.description + creditNoteResult.matchCounts.description,
    contact: invoiceResult.matchCounts.contact + billResult.matchCounts.contact + spendResult.matchCounts.contact + creditNoteResult.matchCounts.contact,
    unmatched: invoiceResult.matchCounts.unmatched + billResult.matchCounts.unmatched + spendResult.matchCounts.unmatched + creditNoteResult.matchCounts.unmatched,
  };
  const matchedCount = (counts: Record<MatchResult["method"], number>) =>
    counts.tracking + counts.reference + counts.description + counts.contact;
  const sourceBreakdown = {
    invoice: {
      imported: invoiceResult.imported,
      unmatched: invoiceResult.unmatched,
      matched: matchedCount(invoiceResult.matchCounts),
      matchBreakdown: invoiceResult.matchCounts,
    },
    bill: {
      imported: billResult.imported,
      unmatched: billResult.unmatched,
      matched: matchedCount(billResult.matchCounts),
      matchBreakdown: billResult.matchCounts,
    },
    bankTransaction: {
      imported: spendResult.imported,
      unmatched: spendResult.unmatched,
      matched: matchedCount(spendResult.matchCounts),
      matchBreakdown: spendResult.matchCounts,
    },
    creditNote: {
      imported: creditNoteResult.imported,
      unmatched: creditNoteResult.unmatched,
      matched: matchedCount(creditNoteResult.matchCounts),
      matchBreakdown: creditNoteResult.matchCounts,
    },
  };

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
    fetched,
    incrementalSince: modifiedSince ? new Date(modifiedSince).toISOString() : null,
    matchBreakdown,
    sourceBreakdown,
  };
}

export async function getXeroAccountingRowsForJob(db: any, jobId: number, limit = 100) {
  return db.select().from(xeroAccountingTransactions)
    .where(and(
      eq(xeroAccountingTransactions.jobId, jobId),
      isNull(xeroAccountingTransactions.ignoredAt),
    ))
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
    rowCount: rows.length,
    positiveCostTotal: costs.reduce((sum: number, row: any) => {
      const value = parseFloat(String(row.grossAmount || "0"));
      return value > 0 ? sum + value : sum;
    }, 0),
    positiveRevenueTotal: revenue.reduce((sum: number, row: any) => {
      const value = parseFloat(String(row.grossAmount || "0"));
      return value > 0 ? sum + value : sum;
    }, 0),
    positivePaidTotal: revenue.reduce((sum: number, row: any) => {
      const value = parseFloat(String(row.amountPaid || "0"));
      return value > 0 ? sum + value : sum;
    }, 0),
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
