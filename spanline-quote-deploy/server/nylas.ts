/**
 * Nylas v3 API Helper
 * Provides functions for calendar/events operations via the Nylas API.
 * Uses API key authentication with grant IDs for per-user calendar access.
 */
import { ENV } from "./_core/env";

const NYLAS_BASE = ENV.nylasApiUri;
const NYLAS_API_KEY = ENV.nylasApiKey;
const NYLAS_CLIENT_ID = ENV.nylasClientId;

interface NylasRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  body?: Record<string, any>;
  params?: Record<string, string>;
}

async function nylasRequest<T = any>(opts: NylasRequestOptions): Promise<T> {
  const url = new URL(`${NYLAS_BASE}${opts.path}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${NYLAS_API_KEY}`,
    Accept: "application/json",
  };
  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Nylas API error (${res.status}): ${errorText}`);
  }

  // DELETE may return 204 with no body
  if (res.status === 204) return {} as T;
  return res.json();
}

// ─── OAuth / Grants ───────────────────────────────────────────────────────────

/**
 * Build the hosted OAuth authorization URL for a user to connect their calendar.
 */
export function buildAuthUrl(redirectUri: string, state?: string, options?: { provider?: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: NYLAS_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "online",
  });
  if (state) params.set("state", state);
  if (options?.provider) params.set("provider", options.provider);
  if (options?.loginHint) params.set("login_hint", options.loginHint);
  return `${NYLAS_BASE}/v3/connect/auth?${params.toString()}`;
}

/**
 * Exchange an OAuth code for a grant (token exchange).
 * Returns the grant_id and email.
 */
export async function exchangeCodeForGrant(code: string, redirectUri: string): Promise<{ grant_id: string; email: string }> {
  const result = await nylasRequest<{ grant_id: string; email: string }>({
    method: "POST",
    path: "/v3/connect/token",
    body: {
      client_id: NYLAS_CLIENT_ID,
      client_secret: NYLAS_API_KEY,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: "nylas",
    },
  });
  return result;
}

/**
 * List all grants for this application.
 */
export async function listGrants(): Promise<any[]> {
  const result = await nylasRequest<{ data: any[] }>({
    method: "GET",
    path: "/v3/grants",
  });
  return result.data || [];
}

/**
 * Delete a grant.
 */
export async function deleteGrant(grantId: string): Promise<void> {
  await nylasRequest({ method: "DELETE", path: `/v3/grants/${grantId}` });
}

// ─── Calendars ────────────────────────────────────────────────────────────────

/**
 * List calendars for a grant.
 */
export async function listCalendars(grantId: string): Promise<any[]> {
  const result = await nylasRequest<{ data: any[] }>({
    method: "GET",
    path: `/v3/grants/${grantId}/calendars`,
  });
  return result.data || [];
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface NylasEventWhen {
  start_time: number; // Unix timestamp (seconds)
  end_time: number;
  start_timezone?: string;
  end_timezone?: string;
}

export interface NylasParticipant {
  name?: string;
  email: string;
  status?: string;
}

export interface NylasEventInput {
  title: string;
  description?: string;
  location?: string;
  when: NylasEventWhen;
  participants?: NylasParticipant[];
  busy?: boolean;
  metadata?: Record<string, string>;
}

export interface NylasEvent {
  id: string;
  grant_id: string;
  calendar_id: string;
  title: string;
  description?: string;
  location?: string;
  when: NylasEventWhen;
  participants?: NylasParticipant[];
  busy?: boolean;
  status?: string;
  metadata?: Record<string, string>;
  created_at?: number;
  updated_at?: number;
  organizer?: { name?: string; email: string };
}

/**
 * List events for a grant within a time range.
 */
export async function listEvents(
  grantId: string,
  calendarId: string = "primary",
  opts?: { start?: number; end?: number; limit?: number }
): Promise<NylasEvent[]> {
  const params: Record<string, string> = { calendar_id: calendarId };
  if (opts?.start) params.start = String(opts.start);
  if (opts?.end) params.end = String(opts.end);
  if (opts?.limit) params.limit = String(opts.limit);

  const result = await nylasRequest<{ data: NylasEvent[] }>({
    method: "GET",
    path: `/v3/grants/${grantId}/events`,
    params,
  });
  return result.data || [];
}

/**
 * Get a single event.
 */
export async function getEvent(grantId: string, eventId: string, calendarId: string = "primary"): Promise<NylasEvent> {
  const result = await nylasRequest<{ data: NylasEvent }>({
    method: "GET",
    path: `/v3/grants/${grantId}/events/${eventId}`,
    params: { calendar_id: calendarId },
  });
  return result.data;
}

/**
 * Create an event.
 */
export async function createEvent(grantId: string, event: NylasEventInput, calendarId: string = "primary"): Promise<NylasEvent> {
  const result = await nylasRequest<{ data: NylasEvent }>({
    method: "POST",
    path: `/v3/grants/${grantId}/events`,
    params: { calendar_id: calendarId },
    body: event,
  });
  return result.data;
}

/**
 * Update an event.
 */
export async function updateEvent(
  grantId: string,
  eventId: string,
  updates: Partial<NylasEventInput>,
  calendarId: string = "primary"
): Promise<NylasEvent> {
  const result = await nylasRequest<{ data: NylasEvent }>({
    method: "PUT",
    path: `/v3/grants/${grantId}/events/${eventId}`,
    params: { calendar_id: calendarId },
    body: updates,
  });
  return result.data;
}

/**
 * Delete an event.
 */
export async function deleteEvent(grantId: string, eventId: string, calendarId: string = "primary"): Promise<void> {
  await nylasRequest({
    method: "DELETE",
    path: `/v3/grants/${grantId}/events/${eventId}`,
    params: { calendar_id: calendarId },
  });
}

/**
 * Check if the Nylas API key is valid by listing grants.
 * Returns true if the API responds successfully.
 */
export async function validateApiKey(): Promise<boolean> {
  try {
    await nylasRequest({ method: "GET", path: "/v3/grants", params: { limit: "1" } });
    return true;
  } catch {
    return false;
  }
}
