import type { Request } from "express";
import { getTenantDomainConfig } from "../tenant-integrations";
import { ENV } from "./env";

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

function requestOrigin(req: Request): string | null {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0]?.trim();
  const protocol = proto || req.protocol || "http";
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost?.split(",")[0]?.trim() || req.headers.host;
  return host ? normalizeOrigin(`${protocol}://${host}`) : null;
}

function isAllowedMagicLinkOrigin(origin: string) {
  const allowed = [
    ENV.publicAppUrl,
    ...ENV.allowedMagicLinkOrigins,
  ].map(normalizeOrigin).filter(Boolean);
  return allowed.includes(origin);
}

async function isAllowedTenantOrigin(tenantId: number | null | undefined, origin: string) {
  const config = await getTenantDomainConfig(tenantId);
  const allowed = [
    config.publicAppUrl,
    ...(config.allowedOrigins ?? []),
  ].map(normalizeOrigin).filter(Boolean);
  return allowed.includes(origin);
}

export function getTrustedPublicOrigin(req: Request, requestedOrigin?: string) {
  const normalizedRequested = normalizeOrigin(requestedOrigin);
  if (normalizedRequested && isAllowedMagicLinkOrigin(normalizedRequested)) {
    return normalizedRequested;
  }

  const configured = normalizeOrigin(ENV.publicAppUrl);
  if (configured) return configured;

  if (!ENV.isProduction) {
    const fallback = requestOrigin(req);
    if (fallback) return fallback;
  }

  throw new Error("PUBLIC_APP_URL is required to build external links");
}

export function buildTrustedAppUrl(req: Request, path: string, requestedOrigin?: string) {
  const origin = getTrustedPublicOrigin(req, requestedOrigin);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

export async function getTrustedPublicOriginForTenant(
  req: Request,
  tenantId: number | null | undefined,
  requestedOrigin?: string,
) {
  const normalizedRequested = normalizeOrigin(requestedOrigin);
  if (normalizedRequested && await isAllowedTenantOrigin(tenantId, normalizedRequested)) {
    return normalizedRequested;
  }

  const config = await getTenantDomainConfig(tenantId);
  const configured = normalizeOrigin(config.publicAppUrl);
  if (configured) return configured;

  return getTrustedPublicOrigin(req, requestedOrigin);
}

export async function buildTrustedAppUrlForTenant(
  req: Request,
  tenantId: number | null | undefined,
  path: string,
  requestedOrigin?: string,
) {
  const origin = await getTrustedPublicOriginForTenant(req, tenantId, requestedOrigin);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}
