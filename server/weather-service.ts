/**
 * Weather Service — uses Open-Meteo (free, no API key required)
 * - 7-day forecast fetching
 * - Caching by location key (postcode/name)
 * - Daily history storage for main locations
 */
import { getDb } from "./db";
import { weatherHistory, weatherForecastCache } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Main Locations ─────────────────────────────────────────────────────────
export const MAIN_LOCATIONS = [
  { name: "Canberra", latitude: -35.2809, longitude: 149.1300 },
  { name: "Goulburn", latitude: -34.7540, longitude: 149.7186 },
  { name: "Batemans Bay", latitude: -35.7075, longitude: 150.1744 },
  { name: "Wagga Wagga", latitude: -35.1082, longitude: 147.3598 },
  { name: "Griffith", latitude: -34.2890, longitude: 146.0540 },
  { name: "Young", latitude: -34.3130, longitude: 148.3010 },
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────
export type DayForecast = {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windSpeedMax: number;
  weatherCode: number;
};

export type ForecastResult = {
  locationKey: string;
  latitude: number;
  longitude: number;
  daily: DayForecast[];
  fetchedAt: number;
};

// ─── Weather Code Helpers ───────────────────────────────────────────────────

/**
 * Returns true if the WMO weather code indicates rain/drizzle/thunderstorm.
 * Codes: 51-67 (drizzle/rain), 80-82 (rain showers), 95-99 (thunderstorm)
 */
export function isRainWeatherCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

// ─── Open-Meteo API ─────────────────────────────────────────────────────────
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const FORECAST_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Fetch 7-day forecast from Open-Meteo for given coordinates
 */
export async function fetchForecast(latitude: number, longitude: number): Promise<DayForecast[]> {
  const url = `${OPEN_METEO_BASE}?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&timezone=Australia%2FSydney&forecast_days=7`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data?.daily?.time) {
    throw new Error("Invalid Open-Meteo response format");
  }

  const days: DayForecast[] = data.daily.time.map((date: string, i: number) => ({
    date,
    tempMax: Math.round(data.daily.temperature_2m_max[i]),
    tempMin: Math.round(data.daily.temperature_2m_min[i]),
    precipitation: data.daily.precipitation_sum[i] ?? 0,
    windSpeedMax: Math.round(data.daily.wind_speed_10m_max[i]),
    weatherCode: data.daily.weather_code[i] ?? 0,
  }));

  return days;
}

/**
 * Fetch current weather + 7-day forecast (for sidebar widget)
 */
export async function fetchCurrentAndForecast(latitude: number, longitude: number) {
  const url = `${OPEN_METEO_BASE}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code&timezone=Australia%2FSydney&forecast_days=7`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status}`);
  }

  const data = await response.json();

  const current = data.current ? {
    temperature: Math.round(data.current.temperature_2m),
    weatherCode: data.current.weather_code,
    windSpeed: Math.round(data.current.wind_speed_10m),
  } : null;

  const daily: DayForecast[] = data.daily?.time?.map((date: string, i: number) => ({
    date,
    tempMax: Math.round(data.daily.temperature_2m_max[i]),
    tempMin: Math.round(data.daily.temperature_2m_min[i]),
    precipitation: data.daily.precipitation_sum[i] ?? 0,
    windSpeedMax: Math.round(data.daily.wind_speed_10m_max[i]),
    weatherCode: data.daily.weather_code[i] ?? 0,
  })) ?? [];

  return { current, daily };
}

// ─── Caching ────────────────────────────────────────────────────────────────

/**
 * Get cached forecast or fetch fresh one. Cache key is locationKey (e.g. postcode or location name).
 */
export async function getCachedForecast(locationKey: string, latitude: number, longitude: number): Promise<ForecastResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check cache
  const cached = await db.select()
    .from(weatherForecastCache)
    .where(eq(weatherForecastCache.locationKey, locationKey))
    .limit(1);

  if (cached.length > 0) {
    const entry = cached[0];
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (age < FORECAST_CACHE_DURATION) {
      return {
        locationKey,
        latitude: Number(entry.latitude),
        longitude: Number(entry.longitude),
        daily: JSON.parse(entry.forecastJson),
        fetchedAt: new Date(entry.fetchedAt).getTime(),
      };
    }
  }

  // Fetch fresh
  const daily = await fetchForecast(latitude, longitude);
  const forecastJson = JSON.stringify(daily);

  // Upsert cache
  if (cached.length > 0) {
    await db.update(weatherForecastCache)
      .set({ forecastJson, fetchedAt: new Date(), latitude: latitude.toFixed(5), longitude: longitude.toFixed(5) })
      .where(eq(weatherForecastCache.locationKey, locationKey));
  } else {
    await db.insert(weatherForecastCache).values({
      locationKey,
      latitude: latitude.toFixed(5),
      longitude: longitude.toFixed(5),
      forecastJson,
    });
  }

  return {
    locationKey,
    latitude,
    longitude,
    daily,
    fetchedAt: Date.now(),
  };
}

// ─── History Storage ────────────────────────────────────────────────────────

/**
 * Store daily weather data for a location. Skips if already stored for that date.
 */
export async function storeDailyWeather(locationName: string, latitude: number, longitude: number, day: DayForecast) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if already stored
  const existing = await db.select({ id: weatherHistory.id })
    .from(weatherHistory)
    .where(and(
      eq(weatherHistory.locationName, locationName),
      eq(weatherHistory.date, day.date),
    ))
    .limit(1);

  if (existing.length > 0) return; // Already stored

  await db.insert(weatherHistory).values({
    locationName,
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    date: day.date,
    tempMax: day.tempMax.toFixed(1),
    tempMin: day.tempMin.toFixed(1),
    precipitation: day.precipitation.toFixed(1),
    windSpeedMax: day.windSpeedMax.toFixed(1),
    weatherCode: day.weatherCode,
  });
}

/**
 * Poll all main locations: fetch today's weather and store in history.
 * Called by the scheduled heartbeat job.
 */
export async function pollMainLocations(): Promise<{ success: string[]; failed: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const success: string[] = [];
  const failed: string[] = [];

  for (const loc of MAIN_LOCATIONS) {
    try {
      const daily = await fetchForecast(loc.latitude, loc.longitude);
      // Store today's data (first element)
      if (daily.length > 0) {
        await storeDailyWeather(loc.name, loc.latitude, loc.longitude, daily[0]);
      }
      // Also update the forecast cache for this location
      const forecastJson = JSON.stringify(daily);
      const existing = await db.select({ id: weatherForecastCache.id })
        .from(weatherForecastCache)
        .where(eq(weatherForecastCache.locationKey, loc.name))
        .limit(1);

      if (existing.length > 0) {
        await db.update(weatherForecastCache)
          .set({ forecastJson, fetchedAt: new Date(), latitude: loc.latitude.toFixed(5), longitude: loc.longitude.toFixed(5) })
          .where(eq(weatherForecastCache.locationKey, loc.name));
      } else {
        await db.insert(weatherForecastCache).values({
          locationKey: loc.name,
          latitude: loc.latitude.toFixed(5),
          longitude: loc.longitude.toFixed(5),
          forecastJson,
        });
      }

      success.push(loc.name);
    } catch (err) {
      failed.push(loc.name);
      console.error(`[Weather] Failed to poll ${loc.name}:`, err);
    }
  }

  return { success, failed };
}

// ─── Geocoding (postcode → coordinates) ─────────────────────────────────────

/**
 * Simple geocoding using Open-Meteo's geocoding API.
 * Returns coordinates for a given location string (suburb, postcode, etc.)
 */
export async function geocodeLocation(query: string): Promise<{ latitude: number; longitude: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json&country_code=AU`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.results?.length) return null;

    const result = data.results[0];
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      name: result.name,
    };
  } catch {
    return null;
  }
}
