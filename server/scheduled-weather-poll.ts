/**
 * Scheduled Weather Poll
 * Fetches daily weather data for 6 main locations (Canberra, Goulburn, Batemans Bay,
 * Wagga Wagga, Griffith NSW, Young NSW) and stores in weather_history + forecast cache.
 * Triggered by a Heartbeat cron job at /api/scheduled/weather-poll (daily at 6am AEST / 20:00 UTC)
 */
import type { Express, Request, Response } from "express";
import { authenticateScheduledRequest } from "./_core/scheduled-auth";
import { pollMainLocations } from "./weather-service";

export function registerScheduledWeatherPoll(app: Express) {
  app.post("/api/scheduled/weather-poll", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // Authenticate the cron caller
      if (!(await authenticateScheduledRequest(req))) {
        return res.status(403).json({ error: "cron-only" });
      }

      console.log("[WeatherPoll] Starting daily weather poll for main locations...");

      const result = await pollMainLocations();

      console.log(`[WeatherPoll] Complete. Success: ${result.success.length}, Failed: ${result.failed.length}`);

      return res.json({
        ok: true,
        success: result.success,
        failed: result.failed,
        duration: Date.now() - startTime,
      });
    } catch (err: any) {
      console.error("[WeatherPoll] Error:", err);
      return res.status(500).json({
        error: err.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        context: { url: "/api/scheduled/weather-poll" },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
