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
      timestamp: new Date().toISOString(),
    });
  });
}
