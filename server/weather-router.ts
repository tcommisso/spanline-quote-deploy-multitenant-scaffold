/**
 * Weather Router — tRPC procedures for weather data
 */
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  fetchCurrentAndForecast,
  getCachedForecast,
  geocodeLocation,
  getTenantWeatherLocations,
  pollMainLocations,
} from "./weather-service";
import { weatherHistory } from "../drizzle/schema";
import { getDb } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export const weatherRouter = router({
  /**
   * Get current weather + 7-day forecast for a location (default: Canberra)
   */
  getForecast: protectedProcedure
    .input(z.object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      locationKey: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const locations = await getTenantWeatherLocations(ctx.tenant?.id ?? null);
      if (locations.length === 0) return null;

      const requestedLocation = input?.locationKey
        ? locations.find((location) => location.name === input.locationKey)
        : null;
      const location = requestedLocation ?? locations[0];
      const lat = input?.latitude ?? location.latitude;
      const lng = input?.longitude ?? location.longitude;
      const key = input?.locationKey ?? location.name;

      const result = await getCachedForecast(key, lat, lng, ctx.tenant?.id ?? null);
      // Also get current conditions
      const currentData = await fetchCurrentAndForecast(lat, lng);

      return {
        locationKey: key,
        current: currentData.current,
        daily: result.daily,
        fetchedAt: result.fetchedAt,
      };
    }),

  /**
   * Get 7-day forecast for a specific client's location (by suburb/postcode)
   */
  getClientForecast: protectedProcedure
    .input(z.object({
      suburb: z.string().optional(),
      postcode: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const query = input.suburb || input.postcode;
      if (!query) return null;

      // Geocode the location
      const geo = await geocodeLocation(query + " NSW Australia");
      if (!geo) return null;

      const locationKey = input.postcode || input.suburb || geo.name;
      const result = await getCachedForecast(locationKey, geo.latitude, geo.longitude, ctx.tenant?.id ?? null);

      return {
        locationName: geo.name,
        locationKey,
        daily: result.daily,
        fetchedAt: result.fetchedAt,
      };
    }),

  /**
   * Get weather history for a location within a date range
   */
  getHistory: protectedProcedure
    .input(z.object({
      locationName: z.string(),
      startDate: z.string().optional(), // YYYY-MM-DD
      endDate: z.string().optional(),   // YYYY-MM-DD
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = ctx.tenant?.id ?? null;
      if (!tenantId) return [];

      const conditions = [eq(weatherHistory.tenantId, tenantId), eq(weatherHistory.locationName, input.locationName)];
      if (input.startDate) conditions.push(gte(weatherHistory.date, input.startDate));
      if (input.endDate) conditions.push(lte(weatherHistory.date, input.endDate));

      const rows = await db.select()
        .from(weatherHistory)
        .where(and(...conditions))
        .orderBy(desc(weatherHistory.date))
        .limit(90);

      return rows.map((r: typeof rows[number]) => ({
        date: r.date,
        tempMax: Number(r.tempMax),
        tempMin: Number(r.tempMin),
        precipitation: Number(r.precipitation),
        windSpeedMax: Number(r.windSpeedMax),
        weatherCode: r.weatherCode,
      }));
    }),

  /**
   * Get list of main locations
   */
  getMainLocations: protectedProcedure.query(async ({ ctx }) => {
    return getTenantWeatherLocations(ctx.tenant?.id ?? null);
  }),

  /**
   * Manually trigger a poll of all main locations (admin only)
   */
  pollNow: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await pollMainLocations(ctx.tenant?.id ?? null);
    return result;
  }),
});
