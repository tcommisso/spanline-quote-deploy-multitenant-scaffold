/**
 * Vocphone API Client
 * Handles JWT authentication, token caching, and all API interactions
 * Base URL: https://portal.vocphone.com/api/v1
 */

const BASE_URL = "https://portal.vocphone.com/api/v1";

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/** Authenticate and get a JWT token (cached until expiry) */
async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const username = process.env.VOCPHONE_API_USERNAME;
  const password = process.env.VOCPHONE_API_PASSWORD;
  if (!username || !password) {
    throw new Error("Vocphone API credentials not configured");
  }

  const url = `${BASE_URL}/authentication?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const res = await fetch(url, { method: "POST" });
  const data = await res.json() as { success: boolean; token: string; expire_at: string };

  if (!data.success || !data.token) {
    throw new Error("Vocphone authentication failed");
  }

  cachedToken = data.token;
  tokenExpiresAt = new Date(data.expire_at).getTime();
  return cachedToken;
}

/** Make an authenticated request to the Vocphone API */
async function vocRequest(method: "GET" | "POST", path: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken();
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

// ─── SMS Methods ────────────────────────────────────────────────────────────

/** Get available SMS sending numbers */
export async function getSmsNumbers(): Promise<{ total: number; list: Array<{ number: string; name?: string }> }> {
  // The Vocphone API does not have a /sms/numbers endpoint.
  // Return the configured sender number from environment, or the known default.
  const senderNumber = process.env.VOCPHONE_SMS_SENDER || "61480855750";
  return { total: 1, list: [{ number: senderNumber, name: "Altaspan" }] };
}

/** Send an SMS message */
export async function sendSms(params: {
  recipient: string; // E164 without +, comma-separated for multiple
  sender: string;    // E164 without +
  body: string;
}): Promise<{ success: boolean; message: string }> {
  return vocRequest("POST", "/sms/send", {
    recipient: params.recipient,
    sender: params.sender,
    body: params.body,
  });
}

/** Get SMS inbox/spam/archive list for a number */
export async function getSmsList(type: "inbox" | "spam" | "archive", senderNumber: string): Promise<any> {
  return vocRequest("GET", `/sms/list/${type}/${senderNumber}`);
}

/** Get SMS conversation between service number and external number */
export async function getSmsConversation(senderNumber: string, phoneNumber: string): Promise<any> {
  return vocRequest("GET", `/sms/conversation/${senderNumber}/${phoneNumber}`);
}

// ─── Call Methods ───────────────────────────────────────────────────────────

/** Get outbound call logs */
export async function getOutboundCalls(params: {
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
  const response = await vocRequest("GET", "/calls/outbound", queryParams);
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
  const response = await vocRequest("GET", "/calls/inbound", queryParams);
  // API returns { status, message, data: { data: [...], total, total_pages } }
  const inner = response.data || response;
  return {
    data: Array.isArray(inner.data) ? inner.data : (Array.isArray(inner) ? inner : []),
    total: inner.total || 0,
    total_pages: inner.total_pages || 1,
  };
}

/** Get details of a single call */
export async function getCallDetails(callId: string): Promise<{
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
  const res = await vocRequest("GET", `/calls/get/${callId}`);
  return res.data;
}

/** Get call transcription */
export async function getCallTranscription(callId: string): Promise<{
  id: string;
  date: string;
  transcription: string;
  summary: string;
} | null> {
  try {
    const res = await vocRequest("GET", `/calls/get/${callId}/transcription`);
    return res.data;
  } catch {
    return null;
  }
}

/** Click-to-call: initiate a call between extension and destination */
export async function initiateCall(params: {
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
  return vocRequest("POST", "/dial", queryParams);
}

/** Get list of extensions */
export async function getExtensions(): Promise<any[]> {
  const res = await vocRequest("GET", "/extensions");
  return res.extensions || [];
}
