import type { Express } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { storageGet } from "../storage";

function isPublicStorageKey(key: string): boolean {
  return key.startsWith("company/login-background-") || key.startsWith("company/branding/");
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (ENV.requireAuthForStorageProxy && !isPublicStorageKey(key)) {
      try {
        await sdk.authenticateRequest(req);
      } catch {
        res.status(401).send("Authentication required");
        return;
      }
    }
    try {
      const { url } = await storageGet(key);
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
