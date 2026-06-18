import type { Express, Request, Response } from "express";
import { Readable } from "stream";
import { and, eq } from "drizzle-orm";
import { callLogs } from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { resolveTenantForRequest } from "./tenant-db";
import { fetchCallRecording } from "./vocphone";

function safeAudioContentType(contentType: string | null) {
  if (!contentType || contentType.includes("text/html")) return "audio/mpeg";
  return contentType;
}

export function registerVocphoneRecordingRoutes(app: Express) {
  app.get("/api/vocphone/recordings/:callId", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const { tenant } = await resolveTenantForRequest(req, user);
      if (!tenant) {
        res.status(403).send("Tenant access required");
        return;
      }

      const callId = Number(req.params.callId);
      if (!Number.isInteger(callId) || callId <= 0) {
        res.status(400).send("Invalid call id");
        return;
      }

      const db = (await getDb())!;
      const [call] = await db
        .select({
          id: callLogs.id,
          recordingUrl: callLogs.recordingUrl,
          vocphoneCallId: callLogs.vocphoneCallId,
        })
        .from(callLogs)
        .where(and(eq(callLogs.tenantId, tenant.id), eq(callLogs.id, callId)))
        .limit(1);

      if (!call) {
        res.status(404).send("Recording not found");
        return;
      }

      if (!call.recordingUrl && !call.vocphoneCallId) {
        res.status(404).send("This call has no recording");
        return;
      }

      const upstream = await fetchCallRecording({
        tenantId: tenant.id,
        callId: call.vocphoneCallId,
        recordingUrl: call.recordingUrl,
        range: req.headers.range || null,
      });

      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader("Content-Type", safeAudioContentType(upstream.headers.get("content-type")));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `inline; filename="call-recording-${call.id}.mp3"`);

      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

      if (!upstream.body) {
        res.status(502).send("Recording response was empty");
        return;
      }

      Readable.fromWeb(upstream.body as any).pipe(res);
    } catch (error: any) {
      console.error("[VOCPhone Recording] playback failed:", error);
      res.status(502).send(error?.message || "Unable to load recording");
    }
  });
}
