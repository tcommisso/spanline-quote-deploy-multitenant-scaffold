import { timingSafeEqual } from "crypto";
import { COOKIE_NAME, EIGHT_HOURS_MS, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { isMicrosoftAuthConfigured, registerMicrosoftAuthRoutes } from "./microsoft-auth";
import { sdk } from "./sdk";
import { buildTrustedAppUrl } from "./url";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function matchesTempAdminToken(token: string | undefined) {
  if (!ENV.tempAdminLoginToken || !token) return false;

  const supplied = Buffer.from(token);
  const expected = Buffer.from(ENV.tempAdminLoginToken);
  if (supplied.length !== expected.length) return false;

  return timingSafeEqual(supplied, expected);
}

function acceptsHtml(req: Request) {
  return (req.headers.accept || "").includes("text/html");
}

function renderTempAdminForm(errorMessage?: string) {
  const errorHtml = errorMessage
    ? `<p class="error">${errorMessage}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Temporary Access</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #06162d; color: #f8fafc; }
      main { width: min(100% - 32px, 380px); }
      h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.2; }
      p { margin: 0 0 24px; color: rgba(248, 250, 252, 0.72); line-height: 1.5; }
      label { display: block; margin-bottom: 8px; font-size: 14px; color: rgba(248, 250, 252, 0.86); }
      input { box-sizing: border-box; width: 100%; height: 44px; border: 1px solid rgba(248, 250, 252, 0.24); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #fff; padding: 0 12px; font-size: 16px; }
      button { width: 100%; height: 44px; margin-top: 14px; border: 0; border-radius: 8px; background: #c9ab57; color: #06162d; font-weight: 700; cursor: pointer; }
      .error { margin: 0 0 12px; color: #fecaca; }
      .note { margin-top: 16px; font-size: 12px; color: rgba(248, 250, 252, 0.46); }
    </style>
  </head>
  <body>
    <main>
      <h1>Temporary Access</h1>
      <p>Use the temporary admin code to test the app while production OAuth is being replaced.</p>
      ${errorHtml}
      <form action="/api/auth/temp-admin" method="get">
        <label for="token">Temporary admin code</label>
        <input id="token" name="token" type="password" autocomplete="one-time-code" autofocus required />
        <button type="submit">Sign in</button>
      </form>
      <p class="note">This testing access expires after 8 hours and should be removed after validation.</p>
    </main>
  </body>
</html>`;
}

export function registerOAuthRoutes(app: Express) {
  registerMicrosoftAuthRoutes(app);

  app.get("/api/auth/login", (_req: Request, res: Response) => {
    if (isMicrosoftAuthConfigured()) {
      res.redirect(302, "/api/auth/microsoft/start");
      return;
    }

    if (ENV.tempAdminLoginToken) {
      res.redirect(302, "/api/auth/temp-admin-form");
      return;
    }

    res.redirect(302, "/api/oauth/start");
  });

  app.get("/api/oauth/start", (req: Request, res: Response) => {
    if (!ENV.appId) {
      res.status(503).json({ error: "OAuth app ID is not configured" });
      return;
    }

    try {
      const redirectUri = buildTrustedAppUrl(req, "/api/oauth/callback");
      const state = Buffer.from(redirectUri, "utf8").toString("base64");
      const portalUrl = new URL("/app-auth", ENV.oAuthPortalUrl || "https://manus.im");

      portalUrl.searchParams.set("appId", ENV.appId);
      portalUrl.searchParams.set("redirectUri", redirectUri);
      portalUrl.searchParams.set("state", state);
      portalUrl.searchParams.set("type", "signIn");

      res.redirect(302, portalUrl.toString());
    } catch (error) {
      console.error("[OAuth] Failed to start login", error);
      res.status(500).json({ error: "OAuth login could not be started" });
    }
  });

  app.get("/api/auth/temp-admin-form", (req: Request, res: Response) => {
    if (!ENV.tempAdminLoginToken) {
      res.status(404).json({ error: "Temporary admin login is not enabled" });
      return;
    }

    res.type("html").send(renderTempAdminForm());
  });

  app.get("/api/auth/temp-admin", async (req: Request, res: Response) => {
    if (!ENV.tempAdminLoginToken) {
      res.status(404).json({ error: "Temporary admin login is not enabled" });
      return;
    }

    const token = getQueryParam(req, "token");
    if (!matchesTempAdminToken(token)) {
      if (acceptsHtml(req)) {
        res.status(403).type("html").send(renderTempAdminForm("Invalid temporary admin code."));
        return;
      }

      res.status(403).json({ error: "Invalid temporary admin token" });
      return;
    }

    try {
      const openId = `temp_admin:${ENV.ownerOpenId || ENV.appId || "local"}`;
      const name = "Temporary Admin";

      await db.upsertUser({
        openId,
        name,
        email: ENV.tempAdminEmail,
        loginMethod: "temporary_admin",
        role: "super_admin",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: EIGHT_HOURS_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: EIGHT_HOURS_MS });
      console.info("[Auth] Temporary admin login issued");
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Auth] Temporary admin login failed", error);
      res.status(500).json({ error: "Temporary admin login failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
