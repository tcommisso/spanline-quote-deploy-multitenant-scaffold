import type { Express, Request, Response } from "express";

export function registerNylasCallbackRoutes(app: Express) {
  app.get("/api/nylas/callback", (req: Request, res: Response) => {
    const params = new URLSearchParams();
    for (const key of ["code", "error", "error_description", "state"]) {
      const value = req.query[key];
      if (typeof value === "string" && value) params.set(key, value);
    }

    const query = params.toString();
    res.redirect(query ? `/profile?${query}` : "/profile");
  });
}
