/**
 * Vocphone API Client
 * Handles JWT authentication, token caching, and all API interactions
 * Base URL: https://portal.vocphone.com/api/v1
 */
import { getTenantVocphoneConfig, type TenantVocphoneConfig } from "./tenant-integrations";

const BASE_URL = "https://portal.vocphone.com/api/v1";

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function resolveConfig(tenantId?: number | null): Promise<Required<Pick<TenantVocphoneConfig, "username" | "password">> & TenantVocphoneConfig> {
  const config = await getTenantVocphoneConfig(tenantId);
  if (!config.username || !config.password) {
    throw new Error("Vocphone API credentials not configured for this tenant");
  }
  return config as Required<Pick<TenantVocphoneConfig, "username" | "password">> & TenantVocphoneConfig;
}

/** Authenticate and get a JWT token (cached until expiry) */
async function getToken(config: Required<Pick<TenantVocphoneConfig, "username" | "password">>): Promise<string> {
  const now = Date.now();
  const cacheKey = config.username;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60000) {
    return cached.token;
  }

  const url = `${BASE_URL}/authentication?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;
  const res = await fetch(url, { method: "POST" });
  const data = await res.json() as { success: boolean; token: string; expire_at: string };

  if (!data.success || !data.token) {
    throw new Error("Vocphone authentication failed");
  }

  tokenCache.set(cacheKey, {
    token: data.token,
    expiresAt: new Date(data.expire_at).getTime(),
  });
  return data.token;
}

/** Make an authenticated request to the Vocphone API */
async function vocRequest(method: "GET" | "POST", path: string, params?: Record<string, string>, tenantId?: number | null): Promise<any> {
  const config = await resolveConfig(tenantId);
  const token = await getToken(config);
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vocphone API error ${res.status}: ${text}`);
  }
  return res.json();
}

function resolveVocphoneUrl(url: string): string {
  return new URL(url, BASE_URL).toString();
}

/** Fetch a call recording as a raw audio response. */
export async function fetchCallRecording(params: {
  tenantId?: number | null;
  callId?: string | null;
  recordingUrl?: string | null;
  range?: string | null;
}): Promise<Response> {
  const config = await resolveConfig(params.tenantId);
  const token = await getToken(config);
  let recordingUrl = params.recordingUrl?.trim() || "";

  if (!recordingUrl && params.callId) {
    const details = await getCallDetails(params.callId, params.tenantId);
    recordingUrl = details.download_url || "";
  }
  if (!recordingUrl) {
    throw new Error("No recording URL is available for this call");
  }

  const fetchRecording = async (url: string) => {
    const resolvedUrl = resolveVocphoneUrl(url);
    const headers: Record<string, string> = {
      Accept: "audio/*,*/*",
      Authorization: `Bearer ${token}`,
    };
    if (params.range) headers.Range = params.range;
    return fetch(resolvedUrl, {
      headers,
      redirect: "follow",
    });
  };

  let response = await fetchRecording(recordingUrl);

  // Stored URLs can expire. If they do, refresh the call details and retry once.
  if (!response.ok && params.callId) {
    const details = await getCallDetails(params.callId, params.tenantId);
    if (details.download_url && details.download_url !== recordingUrl) {
      response = await fetchRecording(details.download_url);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vocphone recording download failed (${response.status}): ${text || response.statusText}`);
  }

  return response;
}

// ─── SMS Methods ────────────────────────────────────────────────────────────

/** Get available SMS sending numbers */
export async function getSmsNumbers(tenantId?: number | null): Promise<{ total: number; list: Array<{ number: string; name?: string }> }> {
  // The Vocphone API does not have a /sms/numbers endpoint.
  // Return the configured sender numbers for the active tenant.
  const config = await getTenantVocphoneConfig(tenantId);
  if (config.smsNumbers?.length) {
    return { total: config.smsNumbers.length, list: config.smsNumbers };
  }
  const senderNumber = config.smsSender || "61480855750";
  return { total: 1, list: [{ number: senderNumber, name: "Tenant SMS" }] };
}

/** Send an SMS message */
export async function sendSms(params: {
  tenantId?: number | null;
  recipient: string; // E164 without +, comma-separated for multiple
  sender: string;    // E164 without +
  body: string;
}): Promise<{ success: boolean; message: string }> {
  return vocRequest("POST", "/sms/send", {
    recipient: params.recipient,
    sender: params.sender,
    body: params.body,
  }, params.tenantId);
}

/** Get SMS inbox/spam/archive list for a number */
export async function getSmsList(type: "inbox" | "spam" | "archive", senderNumber: string, tenantId?: number | null): Promise<any> {
  return vocRequest("GET", `/sms/list/${type}/${senderNumber}`, undefined, tenantId);
}

/** Get SMS conversation between service number and external number */
export async function getSmsConversation(senderNumber: string, phoneNumber: string, tenantId?: number | null): Promise<any> {
  return vocRequest("GET", `/sms/conversation/${senderNumber}/${phoneNumber}`, undefined, tenantId);
}

// ─── Call Methods ───────────────────────────────────────────────────────────

/** Get outbound call logs */
export async function getOutboundCalls(params: {
  tenantId?: number | null;
  page?: number;
  perPage?: number;
  dateFrom?: string;
  dateTo?: string;
  extension?: number;
  fromId?: number;
}): Promise<{ data: any[]; total: number; total_pages: number }> {
  const queryParams: Record<string, string> = { page: String(params.page || 1) };
  if (params.perPage) queryParams.perPage = String(params.perPage);
  if (params.dateFrom) queryParams.dateFrom = params.dateFrom;
  if (params.dateTo) queryParams.dateTo = params.dateTo;
  if (params.extension) queryParams.extension = String(params.extension);
  if (params.fromId) queryParams.fromId = String(params.fromId);
  const response = await vocRequest("GET", "/calls/outbound", queryParams, params.tenantId);
  // API returns { status, message, data: { data: [...], total, total_pages } }
  const inner = response.data || response;
  return {
    data: Array.isArray(inner.data) ? inner.data : (Array.isArray(inner) ? inner : []),
    total: inner.total || 0,
    total_pages: inner.total_pages || 1,
  };
}

/** Get inbound call logs */
export async function getInboundCalls(params: {
  tenantId?: number | null;
  page?: number;
  perPage?: number;
  dateFrom?: string;
  dateTo?: string;
  serviceNumber?: string;
  fromId?: number;
}): Promise<{ data: any[]; total: number; total_pages: number }> {
  const queryParams: Record<string, string> = { page: String(params.page || 1) };
  if (params.perPage) queryParams.perPage = String(params.perPage);
  if (params.dateFrom) queryParams.dateFrom = params.dateFrom;
  if (params.dateTo) queryParams.dateTo = params.dateTo;
  if (params.serviceNumber) queryParams.serviceNumber = params.serviceNumber;
  if (params.fromId) queryParams.fromId = String(params.fromId);
  const response = await vocRequest("GET", "/calls/inbound", queryParams, params.tenantId);
  // API returns { status, message, data: { data: [...], total, total_pages } }
  const inner = response.data || response;
  return {
    data: Array.isArray(inner.data) ? inner.data : (Array.isArray(inner) ? inner : []),
    total: inner.total || 0,
    total_pages: inner.total_pages || 1,
  };
}

/** Get details of a single call */
export async function getCallDetails(callId: string, tenantId?: number | null): Promise<{
  id: string;
  date: string;
  direction: string;
  extension: number;
  desination_number: string;
  destination_geo_tag: string;
  callerid: string;
  callerid_name: string;
  billed_seconds: number;
  call_cost: number;
  download_url: string;
  call_summary: string;
  has_transcription: boolean;
}> {
  const res = await vocRequest("GET", `/calls/get/${callId}`, undefined, tenantId);
  return res.data;
}

/** Get call transcription */
export async function getCallTranscription(callId: string, tenantId?: number | null): Promise<{
  id: string;
  date: string;
  transcription: string;
  summary: string;
} | null> {
  try {
    const res = await vocRequest("GET", `/calls/get/${callId}/transcription`, undefined, tenantId);
    return res.data;
  } catch {
    return null;
  }
}

/** Click-to-call: initiate a call between extension and destination */
export async function initiateCall(params: {
  tenantId?: number | null;
  extension: string;
  destination: string;
  crmId?: string;
  callerId?: string;
}): Promise<{ status: number; message: string; data: any }> {
  const queryParams: Record<string, string> = {
    extension: params.extension,
    destination: params.destination,
  };
  if (params.crmId) queryParams.crm_id = params.crmId;
  if (params.callerId) queryParams.caller_id = params.callerId;
  return vocRequest("POST", "/dial", queryParams, params.tenantId);
}

/** Get list of extensions */
export async function getExtensions(tenantId?: number | null): Promise<any[]> {
  const res = await vocRequest("GET", "/extensions", undefined, tenantId);
  return res.extensions || [];
}
