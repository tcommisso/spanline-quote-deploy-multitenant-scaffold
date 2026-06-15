import { ENV } from "./_core/env";
import { getDb } from "./db";
import { xeroConnections } from "../drizzle/schema";
import { eq, and, isNull, or } from "drizzle-orm";

// ─── Xero OAuth 2.0 Configuration ──────────────────────────────────────────
const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_PROJECTS_API_BASE = "https://api.xero.com/projects.xro/2.0";

const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices",
  "accounting.payments",
  "accounting.banktransactions.read",
  "accounting.contacts",
  "accounting.settings",
  "accounting.settings.read",
  "projects",
].join(" ");

// ─── Auth Helpers ───────────────────────────────────────────────────────────

export function getXeroAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ENV.xeroClientId,
    redirect_uri: redirectUri,
    scope: XERO_SCOPES,
    state,
  });
  return `${XERO_AUTH_URL}?${params.toString()}`;
}

function getBasicAuthHeader(): string {
  const credentials = Buffer.from(`${ENV.xeroClientId}:${ENV.xeroClientSecret}`).toString("base64");
  return `Basic ${credentials}`;
}

export interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
  scope: string;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<XeroTokenResponse> {
  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xero token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<XeroTokenResponse> {
  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xero token refresh failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export interface XeroTenant {
  id: string;
  authEventId: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

export async function getXeroTenants(accessToken: string): Promise<XeroTenant[]> {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Xero tenants: ${response.status}`);
  }

  return response.json();
}

export async function revokeXeroToken(token: string): Promise<void> {
  await fetch(XERO_REVOKE_URL, {
    method: "POST",
    headers: {
      "Authorization": getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token,
    }).toString(),
  });
}

export async function disconnectXeroTenant(accessToken: string, connectionId: string): Promise<void> {
  const response = await fetch(`${XERO_CONNECTIONS_URL}/${connectionId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to disconnect Xero tenant: ${response.status}`);
  }
}

// ─── Token Management ───────────────────────────────────────────────────────

/**
 * Get a valid access token for the active Xero connection.
 * Automatically refreshes if expired.
 */
type XeroTokenLookupOptions = {
  connectionId?: number;
  appTenantId?: number | null;
};

export async function getValidAccessToken(
  connectionIdOrOptions?: number | XeroTokenLookupOptions
): Promise<{ accessToken: string; tenantId: string; xeroConnectionId: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const options: XeroTokenLookupOptions = typeof connectionIdOrOptions === "number"
    ? { connectionId: connectionIdOrOptions }
    : connectionIdOrOptions || {};
  const tenantCondition = options.appTenantId
    ? or(eq(xeroConnections.appTenantId, options.appTenantId), isNull(xeroConnections.appTenantId))
    : undefined;

  let connection;
  if (options.connectionId) {
    const conditions = [
      eq(xeroConnections.id, options.connectionId),
      eq(xeroConnections.isActive, true),
    ];
    if (tenantCondition) conditions.push(tenantCondition);
    const [conn] = await db.select().from(xeroConnections).where(
      and(...conditions)
    );
    connection = conn;
  } else {
    // Get the first active connection
    const conditions = [eq(xeroConnections.isActive, true)];
    if (tenantCondition) conditions.push(tenantCondition);
    const [conn] = await db.select().from(xeroConnections)
      .where(and(...conditions))
      .limit(1);
    connection = conn;
  }

  if (!connection) return null;

  // Check if token is expired (with 5 min buffer)
  const now = new Date();
  const expiresAt = new Date(connection.tokenExpiresAt);
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (now.getTime() + bufferMs >= expiresAt.getTime()) {
    // Token expired or about to expire - refresh it
    try {
      const tokens = await refreshAccessToken(connection.refreshToken);
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await db.update(xeroConnections)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: newExpiresAt,
        })
        .where(eq(xeroConnections.id, connection.id));

      return {
        accessToken: tokens.access_token,
        tenantId: connection.tenantId,
        xeroConnectionId: connection.id,
      };
    } catch (error) {
      // If refresh fails, mark connection as inactive
      await db.update(xeroConnections)
        .set({ isActive: false })
        .where(eq(xeroConnections.id, connection.id));
      return null;
    }
  }

  return {
    accessToken: connection.accessToken,
    tenantId: connection.tenantId,
    xeroConnectionId: connection.id,
  };
}

// ─── API Request Helper ─────────────────────────────────────────────────────

interface XeroApiOptions {
  timeoutMs?: number;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  connectionId?: number;
}

export async function xeroApiRequest<T = any>(
  endpoint: string,
  options: XeroApiOptions = {}
): Promise<T> {
  const { method = "GET", body, connectionId, timeoutMs = 30000 } = options;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const auth = await getValidAccessToken(connectionId);
    if (!auth) {
      throw new Error("No active Xero connection. Please connect to Xero first.");
    }

    const isProjectsApi = endpoint.startsWith("/projects");
    const baseUrl = isProjectsApi ? XERO_PROJECTS_API_BASE : XERO_API_BASE;
    const url = isProjectsApi
      ? `${baseUrl}${endpoint.replace("/projects", "")}`
      : `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${auth.accessToken}`,
      "Xero-tenant-id": auth.tenantId,
      "Accept": "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        throw new Error(`Xero API timeout after ${timeoutMs}ms on ${method} ${endpoint}`);
      }
      throw e;
    }
    clearTimeout(timeoutId);

    // Handle rate limiting (429) with exponential backoff (max 1 retry for rate limits)
    if (response.status === 429 && attempt < 1) {
      const retryAfter = response.headers.get("Retry-After");
      const rawWait = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * Math.pow(2, attempt + 1), 60000); // 2s, 4s, 8s max 60s
      const waitMs = Math.min(rawWait, 5000); // Cap at 5s for rate limit retries to avoid blocking batched requests
      console.log(`[Xero] Rate limited (429) on ${method} ${endpoint}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Xero API error (${response.status}): ${errorText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Should not reach here, but just in case
  throw new Error(`Xero API rate limit exceeded after ${maxRetries} retries on ${endpoint}`);
}

// ─── Accounting API Helpers ─────────────────────────────────────────────────

export interface XeroContact {
  ContactID: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Phones?: Array<{ PhoneType: string; PhoneNumber: string; PhoneAreaCode?: string; PhoneCountryCode?: string }>;
  Addresses?: Array<{ AddressType: string; AddressLine1?: string; AddressLine2?: string; City?: string; Region?: string; PostalCode?: string; Country?: string }>;
  ContactStatus?: string;
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  TaxNumber?: string; // ABN in Australia
  BankAccountDetails?: string;
  DefaultCurrency?: string;
  AccountNumber?: string;
}

export interface XeroInvoice {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type: "ACCREC" | "ACCPAY";
  Contact: { ContactID: string };
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
    TaxType?: string;
    LineAmount?: number;
    Tracking?: Array<{ Name: string; Option: string }>;
  }>;
  Date?: string;
  DueDate?: string;
  Reference?: string;
  Status?: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED";
  CurrencyCode?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
}

export interface XeroPurchaseOrder {
  PurchaseOrderID?: string;
  PurchaseOrderNumber?: string;
  Contact: { ContactID: string };
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
    TaxType?: string;
  }>;
  Date?: string;
  DeliveryDate?: string;
  Reference?: string;
  Status?: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "BILLED" | "DELETED";
  DeliveryAddress?: string;
  AttentionTo?: string;
  DeliveryInstructions?: string;
}

// Contact operations
export async function getXeroContacts(options?: { where?: string; page?: number }): Promise<{ Contacts: XeroContact[] }> {
  let endpoint = "/Contacts";
  const params = new URLSearchParams();
  if (options?.where) params.set("where", options.where);
  if (options?.page) params.set("page", options.page.toString());
  if (params.toString()) endpoint += `?${params.toString()}`;
  return xeroApiRequest(endpoint);
}

export async function createXeroContact(contact: Partial<XeroContact>): Promise<{ Contacts: XeroContact[] }> {
  return xeroApiRequest("/Contacts", { method: "POST", body: contact });
}

export async function updateXeroContact(contactId: string, contact: Partial<XeroContact>): Promise<{ Contacts: XeroContact[] }> {
  return xeroApiRequest(`/Contacts/${contactId}`, { method: "POST", body: contact });
}

// Invoice operations
export async function createXeroInvoice(invoice: Partial<XeroInvoice>): Promise<{ Invoices: XeroInvoice[] }> {
  return xeroApiRequest("/Invoices", { method: "POST", body: invoice });
}

export async function getXeroInvoice(invoiceId: string): Promise<{ Invoices: XeroInvoice[] }> {
  return xeroApiRequest(`/Invoices/${invoiceId}`);
}

export async function getXeroInvoices(options?: { where?: string; page?: number }): Promise<{ Invoices: XeroInvoice[] }> {
  let endpoint = "/Invoices";
  const params = new URLSearchParams();
  if (options?.where) params.set("where", options.where);
  if (options?.page) params.set("page", options.page.toString());
  if (params.toString()) endpoint += `?${params.toString()}`;
  return xeroApiRequest(endpoint);
}

// Payment operations
export interface XeroPayment {
  PaymentID: string;
  Date: string;
  Amount: number;
  Reference?: string;
  Status?: string;
  PaymentType?: string;
  Invoice?: { InvoiceID: string; InvoiceNumber?: string; Type?: string; Contact?: { ContactID: string; Name?: string } };
  BatchPayment?: { BatchPaymentID: string; Date?: string };
}

export async function getXeroPayments(options?: { where?: string; page?: number }): Promise<{ Payments: XeroPayment[] }> {
  let endpoint = "/Payments";
  const params = new URLSearchParams();
  if (options?.where) params.set("where", options.where);
  if (options?.page) params.set("page", options.page.toString());
  if (params.toString()) endpoint += `?${params.toString()}`;
  return xeroApiRequest(endpoint);
}

// Purchase Order operations
export async function createXeroPurchaseOrder(po: Partial<XeroPurchaseOrder>): Promise<{ PurchaseOrders: XeroPurchaseOrder[] }> {
  return xeroApiRequest("/PurchaseOrders", { method: "POST", body: po });
}

export async function getXeroPurchaseOrder(poId: string): Promise<{ PurchaseOrders: XeroPurchaseOrder[] }> {
  return xeroApiRequest(`/PurchaseOrders/${poId}`);
}

// ─── Xero Projects API ─────────────────────────────────────────────────────

export interface XeroProject {
  projectId: string;
  contactId: string;
  name: string;
  currencyCode: string;
  status: "INPROGRESS" | "CLOSED";
  deadlineUtc?: string;
  estimate?: { currency: string; value: number };
  totalInvoiced?: { currency: string; value: number };
  totalToBeInvoiced?: { currency: string; value: number };
  taskAmountInvoiced?: { currency: string; value: number };
  taskAmountToBeInvoiced?: { currency: string; value: number };
  deposit?: { currency: string; value: number };
  depositApplied?: { currency: string; value: number };
}

export interface XeroProjectTask {
  taskId: string;
  projectId: string;
  name: string;
  rate: { currency: string; value: number };
  chargeType: "TIME" | "FIXED" | "NON_CHARGEABLE";
  estimateMinutes?: number;
  status: "ACTIVE" | "INVOICED" | "LOCKED";
  totalAmount?: { currency: string; value: number };
  amountToBeInvoiced?: { currency: string; value: number };
  amountInvoiced?: { currency: string; value: number };
}

export interface XeroProjectsResponse {
  pagination: { page: number; pageSize: number; pageCount: number; itemCount: number };
  items: XeroProject[];
}

export interface XeroProjectTasksResponse {
  pagination: { page: number; pageSize: number; pageCount: number; itemCount: number };
  items: XeroProjectTask[];
}

/**
 * Get Xero projects, optionally filtered by contactId or states.
 */
export async function getXeroProjects(options?: {
  contactId?: string;
  states?: string;
  page?: number;
  pageSize?: number;
}): Promise<XeroProjectsResponse> {
  const params = new URLSearchParams();
  if (options?.contactId) params.set("contactID", options.contactId);
  if (options?.states) params.set("states", options.states);
  if (options?.page) params.set("page", options.page.toString());
  if (options?.pageSize) params.set("pageSize", options.pageSize.toString());
  const qs = params.toString();
  const endpoint = `/projects/projects${qs ? `?${qs}` : ""}`;
  return xeroApiRequest(endpoint);
}

/**
 * Get a single Xero project by ID.
 */
export async function getXeroProject(projectId: string): Promise<XeroProject> {
  return xeroApiRequest(`/projects/projects/${projectId}`);
}

/**
 * Get tasks for a Xero project. Tasks with chargeType "FIXED" are payment milestones.
 */
export async function getXeroProjectTasks(projectId: string, options?: {
  page?: number;
  pageSize?: number;
}): Promise<XeroProjectTasksResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", options.page.toString());
  if (options?.pageSize) params.set("pageSize", options.pageSize.toString());
  const qs = params.toString();
  const endpoint = `/projects/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`;
  return xeroApiRequest(endpoint);
}
