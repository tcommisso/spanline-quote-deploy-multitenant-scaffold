import type { Express, Request, Response } from "express";
import { ENV } from "./env";

export function registerHealthRoutes(app: Express) {
  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: "spanline-quote",
      environment: process.env.NODE_ENV ?? "development",
      tenancyMode: ENV.tenancyMode,
      databaseConfigured: Boolean(ENV.databaseUrl),
      build: {
        commitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
        branch: process.env.RAILWAY_GIT_BRANCH ?? process.env.GIT_BRANCH ?? null,
        deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
        serviceId: process.env.RAILWAY_SERVICE_ID ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
