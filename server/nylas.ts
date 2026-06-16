/**
 * Nylas v3 API Helper
 * Provides functions for calendar/events operations via the Nylas API.
 * Uses API key authentication with grant IDs for per-user calendar access.
 */
import { getTenantNylasConfig, type TenantNylasConfig } from "./tenant-integrations";

interface NylasRequestOptions {
  tenantId?: number | null;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  body?: Record<string, any>;
  params?: Record<string, string>;
}

async function resolveNylasConfig(tenantId?: number | null): Promise<Required<TenantNylasConfig>> {
  const config = await getTenantNylasConfig(tenantId);
  if (!config.apiUri || !config.apiKey || !config.clientId) {
    throw new Error("Nylas API credentials not configured for this tenant");
  }
  return config as Required<TenantNylasConfig>;
}

async function nylasRequest<T = any>(opts: NylasRequestOptions): Promise<T> {
  const config = await resolveNylasConfig(opts.tenantId);
  const url = new URL(`${config.apiUri}${opts.path}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
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
export async function buildAuthUrl(redirectUri: string, state?: string, options?: { tenantId?: number | null; provider?: string; loginHint?: string }): Promise<string> {
  const config = await resolveNylasConfig(options?.tenantId);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "online",
  });
  if (state) params.set("state", state);
  if (options?.provider) params.set("provider", options.provider);
  if (options?.loginHint) params.set("login_hint", options.loginHint);
  return `${config.apiUri}/v3/connect/auth?${params.toString()}`;
}

/**
 * Exchange an OAuth code for a grant (token exchange).
 * Returns the grant_id and email.
 */
export async function exchangeCodeForGrant(code: string, redirectUri: string, tenantId?: number | null): Promise<{ grant_id: string; email: string }> {
  const config = await resolveNylasConfig(tenantId);
  const result = await nylasRequest<{ grant_id: string; email: string }>({
    tenantId,
    method: "POST",
    path: "/v3/connect/token",
    body: {
      client_id: config.clientId,
      client_secret: config.apiKey,
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
export async function listGrants(tenantId?: number | null): Promise<any[]> {
  const result = await nylasRequest<{ data: any[] }>({
    tenantId,
    method: "GET",
    path: "/v3/grants",
  });
  return result.data || [];
}

/**
 * Delete a grant.
 */
export async function deleteGrant(grantId: string, tenantId?: number | null): Promise<void> {
  await nylasRequest({ tenantId, method: "DELETE", path: `/v3/grants/${grantId}` });
}

// ─── Calendars ────────────────────────────────────────────────────────────────

/**
 * List calendars for a grant.
 */
export async function listCalendars(grantId: string, tenantId?: number | null): Promise<any[]> {
  const result = await nylasRequest<{ data: any[] }>({
    tenantId,
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
  opts?: { tenantId?: number | null; start?: number; end?: number; limit?: number }
): Promise<NylasEvent[]> {
  const params: Record<string, string> = { calendar_id: calendarId };
  if (opts?.start) params.start = String(opts.start);
  if (opts?.end) params.end = String(opts.end);
  if (opts?.limit) params.limit = String(opts.limit);

  const result = await nylasRequest<{ data: NylasEvent[] }>({
    tenantId: opts?.tenantId,
    method: "GET",
    path: `/v3/grants/${grantId}/events`,
    params,
  });
  return result.data || [];
}

/**
 * Get a single event.
 */
export async function getEvent(grantId: string, eventId: string, calendarId: string = "primary", tenantId?: number | null): Promise<NylasEvent> {
  const result = await nylasRequest<{ data: NylasEvent }>({
    tenantId,
    method: "GET",
    path: `/v3/grants/${grantId}/events/${eventId}`,
    params: { calendar_id: calendarId },
  });
  return result.data;
}

/**
 * Create an event.
 */
export async function createEvent(
  grantId: string,
  event: NylasEventInput,
  calendarId: string = "primary",
  tenantId?: number | null,
  options?: { notifyParticipants?: boolean },
): Promise<NylasEvent> {
  const params: Record<string, string> = { calendar_id: calendarId };
  if (options?.notifyParticipants) params.notify_participants = "true";

  const result = await nylasRequest<{ data: NylasEvent }>({
    tenantId,
    method: "POST",
    path: `/v3/grants/${grantId}/events`,
    params,
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
  calendarId: string = "primary",
  tenantId?: number | null,
  options?: { notifyParticipants?: boolean },
): Promise<NylasEvent> {
  const params: Record<string, string> = { calendar_id: calendarId };
  if (options?.notifyParticipants) params.notify_participants = "true";

  const result = await nylasRequest<{ data: NylasEvent }>({
    tenantId,
    method: "PUT",
    path: `/v3/grants/${grantId}/events/${eventId}`,
    params,
    body: updates,
  });
  return result.data;
}

/**
 * Delete an event.
 */
export async function deleteEvent(grantId: string, eventId: string, calendarId: string = "primary", tenantId?: number | null): Promise<void> {
  await nylasRequest({
    tenantId,
    method: "DELETE",
    path: `/v3/grants/${grantId}/events/${eventId}`,
    params: { calendar_id: calendarId },
  });
}

/**
 * Check if the Nylas API key is valid by listing grants.
 * Returns true if the API responds successfully.
 */
export async function validateApiKey(tenantId?: number | null): Promise<boolean> {
  try {
    await nylasRequest({ tenantId, method: "GET", path: "/v3/grants", params: { limit: "1" } });
    return true;
  } catch {
    return false;
  }
}
