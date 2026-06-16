/**
 * Map/geocoding integration.
 *
 * makeRequest<T>(endpoint, params) keeps the old Google-shaped call sites
 * working while routing production traffic to app-owned providers. The default
 * is OpenStreetMap-compatible LocationIQ for search/geocoding and a local
 * haversine fallback for distance matrix calculations.
 */

import { ENV } from "./env";

// ============================================================================
// Configuration
// ============================================================================

type MapsConfig = {
  baseUrl: string;
  apiKey: string;
};

function getGoogleMapsConfig(): MapsConfig {
  const baseUrl = "https://maps.googleapis.com";
  const apiKey = ENV.googleMapsApiKey;

  if (!apiKey) {
    throw new Error(
      "Google Maps credentials missing: set GOOGLE_MAPS_API_KEY"
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

function getLocationIqKey() {
  if (!ENV.locationIqApiKey) {
    throw new Error("LocationIQ credentials missing: set LOCATIONIQ_API_KEY");
  }
  return ENV.locationIqApiKey;
}

// ============================================================================
// Core Request Handler
// ============================================================================

interface RequestOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

/**
 * Make authenticated requests to Google Maps APIs
 * 
 * @param endpoint - The API endpoint (e.g., "/maps/api/geocode/json")
 * @param params - Query parameters for the request
 * @param options - Additional request options
 * @returns The API response
 */
export async function makeRequest<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: RequestOptions = {}
): Promise<T> {
  if (ENV.geocoderProvider === "google") {
    return makeGoogleRequest<T>(endpoint, params, options);
  }

  const path = normaliseEndpointPath(endpoint);
  if (path.endsWith("/geocode/json")) {
    return (await locationIqGeocode(params)) as T;
  }
  if (path.endsWith("/place/autocomplete/json")) {
    return (await locationIqAutocomplete(params)) as T;
  }
  if (path.endsWith("/place/details/json")) {
    return (await locationIqPlaceDetails(params)) as T;
  }
  if (path.endsWith("/distancematrix/json")) {
    return (await distanceMatrix(params)) as T;
  }

  throw new Error(`Unsupported map provider endpoint for ${ENV.geocoderProvider}: ${endpoint}`);
}

async function makeGoogleRequest<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: RequestOptions = {}
): Promise<T> {
  const { baseUrl, apiKey } = getGoogleMapsConfig();

  const url = endpoint.startsWith("http")
    ? new URL(endpoint)
    : new URL(endpoint, baseUrl);

  // Add API key as query parameter (standard Google Maps API authentication)
  url.searchParams.append("key", apiKey);

  // Add other query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Map API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

function normaliseEndpointPath(endpoint: string) {
  try {
    return new URL(endpoint).pathname;
  } catch {
    return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  }
}

async function fetchLocationIq(path: string, params: Record<string, unknown>) {
  const url = new URL(path, "https://api.locationiq.com");
  url.searchParams.set("key", getLocationIqKey());
  url.searchParams.set("format", "json");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "SpanlineQuoteSystem/1.0 (+https://app.commissogroup.au)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LocationIQ request failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function locationIqAutocomplete(params: Record<string, unknown>) {
  const q = String(params.input ?? params.q ?? "").trim();
  if (!q) return { status: "ZERO_RESULTS", predictions: [] };

  const rows = await fetchLocationIq("/v1/autocomplete", {
    q,
    countrycodes: countryCodeFromGoogleComponents(params.components) || params.countrycodes || "au",
    addressdetails: 1,
    limit: 8,
    dedupe: 1,
  });

  return {
    status: Array.isArray(rows) && rows.length ? "OK" : "ZERO_RESULTS",
    predictions: Array.isArray(rows)
      ? rows.map((row: any) => ({
          place_id: String(row.place_id ?? row.osm_id ?? row.display_place ?? row.display_name),
          description: row.display_name,
          structured_formatting: {
            main_text: row.display_place || row.name || row.address?.road || row.display_name,
            secondary_text: row.display_address || secondaryAddress(row.address),
          },
          _locationiq: row,
        }))
      : [],
  };
}

async function locationIqPlaceDetails(params: Record<string, unknown>) {
  const placeId = String(params.place_id ?? "");
  if (!placeId) return { status: "ZERO_RESULTS" };

  const row = await fetchLocationIq("/v1/details.php", {
    place_id: placeId,
    addressdetails: 1,
  }).catch(async () => {
    const fallback = await fetchLocationIq("/v1/search", {
      q: placeId,
      countrycodes: "au",
      addressdetails: 1,
      limit: 1,
    });
    return Array.isArray(fallback) ? fallback[0] : fallback;
  });

  if (!row) return { status: "ZERO_RESULTS" };
  return {
    status: "OK",
    result: {
      place_id: String(row.place_id ?? placeId),
      name: row.name || row.display_place || row.display_name,
      formatted_address: row.display_name,
      address_components: toGoogleAddressComponents(row.address ?? {}),
      geometry: {
        location: {
          lat: Number(row.lat ?? row.centroid?.coordinates?.[1]),
          lng: Number(row.lon ?? row.centroid?.coordinates?.[0]),
        },
      },
    },
  };
}

async function locationIqGeocode(params: Record<string, unknown>) {
  if (params.latlng) {
    const [lat, lon] = String(params.latlng).split(",").map(Number);
    const row = await fetchLocationIq("/v1/reverse", {
      lat,
      lon,
      addressdetails: 1,
    });
    return { status: row ? "OK" : "ZERO_RESULTS", results: row ? [toGoogleGeocodeResult(row)] : [] };
  }

  const q = String(params.address ?? params.q ?? "").trim();
  if (!q) return { status: "ZERO_RESULTS", results: [] };
  const rows = await fetchLocationIq("/v1/search", {
    q,
    countrycodes: params.countrycodes ?? "au",
    addressdetails: 1,
    limit: params.limit ?? 1,
  });
  return {
    status: Array.isArray(rows) && rows.length ? "OK" : "ZERO_RESULTS",
    results: Array.isArray(rows) ? rows.map(toGoogleGeocodeResult) : [],
  };
}

async function distanceMatrix(params: Record<string, unknown>): Promise<DistanceMatrixResult> {
  const origins = splitPipeList(params.origins);
  const destinations = splitPipeList(params.destinations);
  const originPoints = await Promise.all(origins.map(geocodePoint));
  const destinationPoints = await Promise.all(destinations.map(geocodePoint));

  return {
    status: "OK",
    origin_addresses: origins,
    destination_addresses: destinations,
    rows: originPoints.map(origin => ({
      elements: destinationPoints.map(destination => {
        if (!origin || !destination) {
          return {
            status: "ZERO_RESULTS",
            distance: { text: "N/A", value: 0 },
            duration: { text: "N/A", value: 0 },
          };
        }
        const metres = Math.round(haversineMetres(origin, destination) * 1.25);
        const seconds = Math.round((metres / 1000 / 55) * 3600);
        return {
          status: "OK",
          distance: { text: `${(metres / 1000).toFixed(1)} km`, value: metres },
          duration: { text: `${Math.max(1, Math.round(seconds / 60))} mins`, value: seconds },
        };
      }),
    })),
  };
}

function splitPipeList(value: unknown) {
  return String(value ?? "")
    .split("|")
    .map(item => item.trim())
    .filter(Boolean);
}

async function geocodePoint(address: string): Promise<LatLng | null> {
  const result = await locationIqGeocode({ address, limit: 1 }).catch(() => null);
  const first = result?.results?.[0]?.geometry?.location;
  return first && Number.isFinite(first.lat) && Number.isFinite(first.lng) ? first : null;
}

function toGoogleGeocodeResult(row: any) {
  const lat = Number(row.lat ?? row.centroid?.coordinates?.[1]);
  const lng = Number(row.lon ?? row.centroid?.coordinates?.[0]);
  return {
    place_id: String(row.place_id ?? row.osm_id ?? row.display_name),
    formatted_address: row.display_name,
    address_components: toGoogleAddressComponents(row.address ?? {}),
    geometry: {
      location: { lat, lng },
      location_type: "APPROXIMATE",
      viewport: {
        northeast: { lat, lng },
        southwest: { lat, lng },
      },
    },
    types: [],
  };
}

function toGoogleAddressComponents(address: Record<string, any>) {
  const components: Array<{ long_name: string; short_name: string; types: string[] }> = [];
  const push = (value: unknown, types: string[]) => {
    if (value) components.push({ long_name: String(value), short_name: String(value), types });
  };
  push(address.house_number, ["street_number"]);
  push(address.road || address.pedestrian || address.footway, ["route"]);
  push(address.suburb || address.city_district || address.neighbourhood, ["sublocality", "political"]);
  push(address.city || address.town || address.village || address.hamlet, ["locality", "political"]);
  push(address.state, ["administrative_area_level_1", "political"]);
  push(address.postcode, ["postal_code"]);
  push(address.country, ["country", "political"]);
  return components;
}

function secondaryAddress(address: Record<string, any> = {}) {
  return [address.suburb || address.city || address.town, address.state, address.postcode]
    .filter(Boolean)
    .join(", ");
}

function countryCodeFromGoogleComponents(value: unknown) {
  const match = String(value ?? "").match(/country:([a-z]{2})/i);
  return match?.[1]?.toLowerCase();
}

function haversineMetres(a: LatLng, b: LatLng) {
  const r = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// ============================================================================
// Type Definitions
// ============================================================================

export type TravelMode = "driving" | "walking" | "bicycling" | "transit";
export type MapType = "roadmap" | "satellite" | "terrain" | "hybrid";
export type SpeedUnit = "KPH" | "MPH";

export type LatLng = {
  lat: number;
  lng: number;
};

export type DirectionsResult = {
  routes: Array<{
    legs: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      start_address: string;
      end_address: string;
      start_location: LatLng;
      end_location: LatLng;
      steps: Array<{
        distance: { text: string; value: number };
        duration: { text: string; value: number };
        html_instructions: string;
        travel_mode: string;
        start_location: LatLng;
        end_location: LatLng;
      }>;
    }>;
    overview_polyline: { points: string };
    summary: string;
    warnings: string[];
    waypoint_order: number[];
  }>;
  status: string;
};

export type DistanceMatrixResult = {
  rows: Array<{
    elements: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      status: string;
    }>;
  }>;
  origin_addresses: string[];
  destination_addresses: string[];
  status: string;
};

export type GeocodingResult = {
  results: Array<{
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    formatted_address: string;
    geometry: {
      location: LatLng;
      location_type: string;
      viewport: {
        northeast: LatLng;
        southwest: LatLng;
      };
    };
    place_id: string;
    types: string[];
  }>;
  status: string;
};

export type PlacesSearchResult = {
  results: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: LatLng;
    };
    rating?: number;
    user_ratings_total?: number;
    business_status?: string;
    types: string[];
  }>;
  status: string;
};

export type PlaceDetailsResult = {
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Array<{
      author_name: string;
      rating: number;
      text: string;
      time: number;
    }>;
    opening_hours?: {
      open_now: boolean;
      weekday_text: string[];
    };
    geometry: {
      location: LatLng;
    };
  };
  status: string;
};

export type ElevationResult = {
  results: Array<{
    elevation: number;
    location: LatLng;
    resolution: number;
  }>;
  status: string;
};

export type TimeZoneResult = {
  dstOffset: number;
  rawOffset: number;
  status: string;
  timeZoneId: string;
  timeZoneName: string;
};

export type RoadsResult = {
  snappedPoints: Array<{
    location: LatLng;
    originalIndex?: number;
    placeId: string;
  }>;
};

// ============================================================================
// Google Maps API Reference
// ============================================================================

/**
 * GEOCODING - Convert between addresses and coordinates
 * Endpoint: /maps/api/geocode/json
 * Input: { address: string } OR { latlng: string }  // latlng: "37.42,-122.08"
 * Output: GeocodingResult  // results[0].geometry.location, results[0].formatted_address
 */

/**
 * DIRECTIONS - Get navigation routes between locations
 * Endpoint: /maps/api/directions/json
 * Input: { origin: string, destination: string, mode?: TravelMode, waypoints?: string, alternatives?: boolean }
 * Output: DirectionsResult  // routes[0].legs[0].distance, duration, steps
 */

/**
 * DISTANCE MATRIX - Calculate travel times/distances for multiple origin-destination pairs
 * Endpoint: /maps/api/distancematrix/json
 * Input: { origins: string, destinations: string, mode?: TravelMode, units?: "metric"|"imperial" }  // origins: "NYC|Boston"
 * Output: DistanceMatrixResult  // rows[0].elements[1] = first origin to second destination
 */

/**
 * PLACE SEARCH - Find businesses/POIs by text query
 * Endpoint: /maps/api/place/textsearch/json
 * Input: { query: string, location?: string, radius?: number, type?: string }  // location: "40.7,-74.0"
 * Output: PlacesSearchResult  // results[].name, rating, geometry.location, place_id
 */

/**
 * NEARBY SEARCH - Find places near a specific location
 * Endpoint: /maps/api/place/nearbysearch/json
 * Input: { location: string, radius: number, type?: string, keyword?: string }  // location: "40.7,-74.0"
 * Output: PlacesSearchResult
 */

/**
 * PLACE DETAILS - Get comprehensive information about a specific place
 * Endpoint: /maps/api/place/details/json
 * Input: { place_id: string, fields?: string }  // fields: "name,rating,opening_hours,website"
 * Output: PlaceDetailsResult  // result.name, rating, opening_hours, etc.
 */

/**
 * ELEVATION - Get altitude data for geographic points
 * Endpoint: /maps/api/elevation/json
 * Input: { locations?: string, path?: string, samples?: number }  // locations: "39.73,-104.98|36.45,-116.86"
 * Output: ElevationResult  // results[].elevation (meters)
 */

/**
 * TIME ZONE - Get timezone information for a location
 * Endpoint: /maps/api/timezone/json
 * Input: { location: string, timestamp: number }  // timestamp: Math.floor(Date.now()/1000)
 * Output: TimeZoneResult  // timeZoneId, timeZoneName
 */

/**
 * ROADS - Snap GPS traces to roads, find nearest roads, get speed limits
 * - /v1/snapToRoads: Input: { path: string, interpolate?: boolean }  // path: "lat,lng|lat,lng"
 * - /v1/nearestRoads: Input: { points: string }  // points: "lat,lng|lat,lng"
 * - /v1/speedLimits: Input: { path: string, units?: SpeedUnit }
 * Output: RoadsResult
 */

/**
 * PLACE AUTOCOMPLETE - Real-time place suggestions as user types
 * Endpoint: /maps/api/place/autocomplete/json
 * Input: { input: string, location?: string, radius?: number }
 * Output: { predictions: Array<{ description: string, place_id: string }> }
 */

/**
 * STATIC MAPS - Generate map images as URLs (for emails, reports, <img> tags)
 * Endpoint: /maps/api/staticmap
 * Input: URL params - center: string, zoom: number, size: string, markers?: string, maptype?: MapType
 * Output: Image URL (not JSON) - use directly in <img src={url} />
 * Note: Construct URL manually with getMapsConfig() for auth
 */


