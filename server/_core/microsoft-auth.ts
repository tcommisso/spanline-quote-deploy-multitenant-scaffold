import { createHash, randomBytes } from "crypto";
import type { CookieOptions, Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { buildTrustedAppUrl } from "./url";
import { logUserLoginFromOpenId } from "../user-activity-log";

const MICROSOFT_AUTH_SCOPE = "openid profile email User.Read";
const MICROSOFT_AUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
const STATE_COOKIE = "spanline_ms_auth_state";
const NONCE_COOKIE = "spanline_ms_auth_nonce";
const VERIFIER_COOKIE = "spanline_ms_auth_verifier";

type MicrosoftTokenResponse = {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
};

type MicrosoftIdTokenClaims = {
  oid?: string;
  tid?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  nonce?: string;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTenantId = "";

export function isMicrosoftAuthConfigured() {
  return !!(ENV.msAuthTenantId && ENV.msAuthClientId && ENV.msAuthClientSecret);
}

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function getMicrosoftAuthCookieOptions(req: Request): CookieOptions {
  return {
    ...getSessionCookieOptions(req),
    maxAge: MICROSOFT_AUTH_COOKIE_MAX_AGE_MS,
    sameSite: "lax",
  };
}

function clearMicrosoftAuthCookies(req: Request, res: Response) {
  const { maxAge: _maxAge, ...clearOptions } = getMicrosoftAuthCookieOptions(req);
  res.clearCookie(STATE_COOKIE, clearOptions);
  res.clearCookie(NONCE_COOKIE, clearOptions);
  res.clearCookie(VERIFIER_COOKIE, clearOptions);
}

function readCookie(req: Request, name: string) {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  return cookies[name];
}

function redirectUri(req: Request) {
  return ENV.msAuthRedirectUri || buildTrustedAppUrl(req, "/api/auth/microsoft/callback");
}

function microsoftAuthorizeUrl(req: Request, state: string, nonce: string, codeVerifier: string) {
  const url = new URL(`https://login.microsoftonline.com/${ENV.msAuthTenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", ENV.msAuthClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_AUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", sha256Base64Url(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeMicrosoftCode(req: Request, code: string, codeVerifier: string): Promise<MicrosoftTokenResponse> {
  const body = new URLSearchParams({
    client_id: ENV.msAuthClientId,
    client_secret: ENV.msAuthClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(req),
    scope: MICROSOFT_AUTH_SCOPE,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`https://login.microsoftonline.com/${ENV.msAuthTenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({})) as MicrosoftTokenResponse;
  if (!response.ok) {
    const message = data.error_description || data.error || `Microsoft token exchange failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

function getJwks() {
  if (!jwks || jwksTenantId !== ENV.msAuthTenantId) {
    jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${ENV.msAuthTenantId}/discovery/v2.0/keys`));
    jwksTenantId = ENV.msAuthTenantId;
  }
  return jwks;
}

async function verifyMicrosoftIdToken(idToken: string): Promise<MicrosoftIdTokenClaims> {
  const issuer = `https://login.microsoftonline.com/${ENV.msAuthTenantId}/v2.0`;
  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer,
    audience: ENV.msAuthClientId,
  });
  return payload as MicrosoftIdTokenClaims;
}

function normalizeEmail(claims: MicrosoftIdTokenClaims) {
  return (claims.email || claims.preferred_username || claims.upn || "").trim().toLowerCase();
}

function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function ensureAllowedDomain(email: string) {
  if (ENV.msAuthAllowAnyTenantUser) return;
  if (ENV.msAuthAllowedDomains.length === 0) return;
  const domain = emailDomain(email);
  if (!ENV.msAuthAllowedDomains.includes(domain)) {
    throw new Error(`Microsoft login is not enabled for ${domain || "this email domain"}`);
  }
}

function roleForMicrosoftEmail(email: string): "admin" | "super_admin" | undefined {
  if (ENV.msAuthSuperAdminEmails.includes(email)) return "super_admin";
  if (ENV.msAuthAdminEmails.includes(email)) return "admin";
  return undefined;
}

export function registerMicrosoftAuthRoutes(app: Express) {
  app.get("/api/auth/microsoft/start", (req: Request, res: Response) => {
    if (!isMicrosoftAuthConfigured()) {
      res.status(503).json({ error: "Microsoft Entra login is not configured" });
      return;
    }

    const state = randomBase64Url();
    const nonce = randomBase64Url();
    const codeVerifier = randomBase64Url(48);
    const cookieOptions = getMicrosoftAuthCookieOptions(req);

    res.cookie(STATE_COOKIE, state, cookieOptions);
    res.cookie(NONCE_COOKIE, nonce, cookieOptions);
    res.cookie(VERIFIER_COOKIE, codeVerifier, cookieOptions);
    res.redirect(302, microsoftAuthorizeUrl(req, state, nonce, codeVerifier));
  });

  app.get("/api/auth/microsoft/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const expectedState = readCookie(req, STATE_COOKIE);
    const expectedNonce = readCookie(req, NONCE_COOKIE);
    const codeVerifier = readCookie(req, VERIFIER_COOKIE);

    clearMicrosoftAuthCookies(req, res);

    if (!code || !state || !expectedState || !expectedNonce || !codeVerifier || state !== expectedState) {
      res.status(400).json({ error: "Invalid Microsoft login state" });
      return;
    }

    try {
      const token = await exchangeMicrosoftCode(req, code, codeVerifier);
      if (!token.id_token) {
        throw new Error("Microsoft did not return an ID token");
      }

      const claims = await verifyMicrosoftIdToken(token.id_token);
      if (claims.nonce !== expectedNonce) {
        throw new Error("Invalid Microsoft login nonce");
      }
      if (!claims.oid) {
        throw new Error("Microsoft user ID was missing from the ID token");
      }
      if (claims.tid && claims.tid !== ENV.msAuthTenantId) {
        throw new Error("Microsoft login came from an unexpected tenant");
      }

      const email = normalizeEmail(claims);
      if (!email) {
        throw new Error("Microsoft account did not provide an email address");
      }
      ensureAllowedDomain(email);

      const openId = `ms:${claims.oid}`;
      const name = claims.name || email;

      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "microsoft_entra",
        role: roleForMicrosoftEmail(email),
        lastSignedIn: new Date(),
      });
      await logUserLoginFromOpenId(openId, req, {
        loginMethod: "microsoft_entra",
        microsoftTenantId: claims.tid,
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Microsoft Auth] Callback failed", error);
      res.status(500).json({ error: "Microsoft login failed" });
    }
  });
}
