/**
 * Parcel/Boundary lookup for ACT (ACTmapi) and NSW (SIX Maps Cadastre)
 * Returns property boundary polygon coordinates and area for site plan generation.
 */

import { makeRequest } from "./_core/map";

export interface ParcelBoundary {
  /** Polygon coordinates as [lng, lat][] forming a closed ring */
  coordinates: [number, number][];
  /** Area in square metres */
  areaSqm: number;
  /** Lot/block identifier */
  lotId: string;
  /** Suburb/division name */
  suburb: string;
  /** Source of data */
  source: "actmapi" | "nsw_cadastre";
  /** Dimensions derived from boundary (approximate bounding box) */
  dimensions: {
    frontageM: number;
    depthM: number;
  };
  /** Centroid of the parcel [lng, lat] for satellite image centering */
  centroid: [number, number];
}

/**
 * Detect whether an address is in ACT or NSW based on common patterns.
 * Accepts optional suburb/region hints from the quote record.
 */
export function detectState(address: string, hints?: { suburb?: string; region?: string }): "ACT" | "NSW" | "unknown" {
  const upper = address.toUpperCase();
  const hintText = `${hints?.suburb || ""} ${hints?.region || ""}`.toUpperCase();
  const combined = `${upper} ${hintText}`;
  // ACT postcodes: 2600-2620, 2900-2920
  if (/\b(260[0-9]|261[0-9]|2620|290[0-9]|291[0-9]|2920)\b/.test(combined)) return "ACT";
  // ACT suburbs/keywords (check both address and hints)
  if (/\b(ACT|CANBERRA|BELCONNEN|WODEN|TUGGERANONG|GUNGAHLIN|MOLONGLO|WESTON CREEK|O'MALLEY|OMALLEY|GARRAN|DEAKIN|CURTIN|LYONS|PHILLIP|MAWSON|PEARCE|TORRENS|FARRER|ISAACS|WANNIASSA|KAMBAH|GREENWAY|BONYTHON|GORDON|CONDER|BANKS|CALWELL|RICHARDSON|CHISHOLM|GILMORE|THEODORE|CASEY|NGUNNAWAL|NICHOLLS|PALMERSTON|AMAROO|HARRISON|FRANKLIN|FORDE|BONNER|JACKA|MONCRIEFF|TAYLOR|THROSBY|KENNY|WHITLAM|DENMAN PROSPECT|COOMBS|WRIGHT|MOLONGLO VALLEY)\b/.test(combined)) return "ACT";
  // NSW postcodes: 2xxx (not ACT range), or explicit NSW
  if (/\bNSW\b/.test(combined)) return "NSW";
  if (/\b2[0-5]\d{2}\b/.test(combined)) return "NSW";
  if (/\b2[6-8]\d{2}\b/.test(combined) && !/\b(260[0-9]|261[0-9]|2620)\b/.test(combined)) return "NSW";
  // Check region hint
  if (/\b(CANBERRA|ACT)\b/.test(hintText)) return "ACT";
  if (/\b(NSW|SYDNEY|NEWCASTLE|WOLLONGONG|QUEANBEYAN|SOUTH COAST)\b/.test(hintText)) return "NSW";
  return "unknown";
}

/**
 * Query ACTmapi for parcel boundary by address
 */
export async function lookupACTParcel(address: string): Promise<ParcelBoundary | null> {
  // Extract street number and name for fuzzy matching
  // Handle formats like: "44 Dalman Crescent, O'Malley ACT 2606, Australia"
  // or "5/44 Dalman Crescent, O'Malley ACT"
  // or bare: "5/44 Dalman Crescent" (no suburb/state suffix)
  const unitMatch = address.match(/^(\d+[A-Za-z]?)\/(\d+[A-Za-z]?)\s+(.+?)(?:,|\s+(ACT|CANBERRA)|$)/i);
  const match = address.match(/^(\d+[A-Za-z]?)\s+(.+?)(?:,|\s+(ACT|CANBERRA|NSW)|$)/i);
  let searchTerm = address.split(",")[0].trim();
  if (unitMatch) {
    // Unit address: use just the street number and name (without unit)
    searchTerm = `${unitMatch[2]} ${unitMatch[3]}`.toUpperCase().trim();
  } else if (match) {
    searchTerm = `${match[1]} ${match[2]}`.toUpperCase().trim();
  }

  // Escape single quotes for SQL LIKE query (e.g. O'Malley -> O''Malley)
  const escapedSearchTerm = searchTerm.replace(/'/g, "''");

  const url = "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query";
  const params = new URLSearchParams({
    where: `ADDRESSES LIKE '%${escapedSearchTerm}%'`,
    outFields: "BLOCK_NUMBER,SECTION_NUMBER,DIVISION_NAME,ADDRESSES,BLOCK_DERIVED_AREA",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`);
    if (!response.ok) return null;
    const data = await response.json();
    const features = data.features;
    if (!features || features.length === 0) return null;

    const feature = features[0];
    const attrs = feature.attributes;
    const rings = feature.geometry?.rings;
    if (!rings || rings.length === 0) return null;

    const coordinates: [number, number][] = rings[0];
    const areaSqm = parseFloat(attrs.BLOCK_DERIVED_AREA) || 0;
    const dimensions = calculateDimensions(coordinates);

    const centroid = calculateCentroid(coordinates);
    return {
      coordinates,
      areaSqm,
      lotId: `Block ${attrs.BLOCK_NUMBER}, Section ${attrs.SECTION_NUMBER}`,
      suburb: attrs.DIVISION_NAME || "",
      source: "actmapi",
      dimensions,
      centroid,
    };
  } catch (err) {
    console.error("[ParcelLookup] ACT query failed:", err);
    return null;
  }
}

/**
 * Query NSW Cadastre for parcel boundary by geocoded point
 */
export async function lookupNSWParcel(address: string): Promise<ParcelBoundary | null> {
  try {
    // Step 1: Geocode the address using Google Maps
    const geocodeResult = await makeRequest<any>("/maps/api/geocode/json", {
      address,
    });

    if (!geocodeResult?.results?.length) return null;
    const location = geocodeResult.results[0].geometry.location;
    const lat = location.lat;
    const lng = location.lng;

    // Extract suburb from geocode result
    const addressComponents = geocodeResult.results[0].address_components || [];
    const suburbComp = addressComponents.find((c: any) => c.types.includes("locality"));
    const suburb = suburbComp?.long_name || "";

    // Step 2: Spatial query NSW Cadastre Lot layer
    const url = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9/query";
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "lotnumber,planlabel,lotidstring,shape_Area,shape_Length",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: "1",
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const features = data.features;
    if (!features || features.length === 0) return null;

    const feature = features[0];
    const attrs = feature.attributes;
    const rings = feature.geometry?.rings;
    if (!rings || rings.length === 0) return null;

    const coordinates: [number, number][] = rings[0];
    const areaSqm = attrs.shape_Area || 0;
    const dimensions = calculateDimensions(coordinates);

    const centroid = calculateCentroid(coordinates);
    return {
      coordinates,
      areaSqm,
      lotId: attrs.lotidstring || `Lot ${attrs.lotnumber} ${attrs.planlabel}`,
      suburb,
      source: "nsw_cadastre",
      dimensions,
      centroid,
    };
  } catch (err) {
    console.error("[ParcelLookup] NSW query failed:", err);
    return null;
  }
}

/**
 * Main entry point - auto-detects state and queries appropriate service.
 * Accepts optional suburb/region hints from the quote record for better state detection.
 */
export async function lookupParcel(address: string, hints?: { suburb?: string; region?: string }): Promise<ParcelBoundary | null> {
  const state = detectState(address, hints);
  console.log(`[ParcelLookup] Address: "${address}", Hints: ${JSON.stringify(hints)}, Detected state: ${state}`);

  if (state === "ACT") {
    return lookupACTParcel(address);
  } else if (state === "NSW") {
    return lookupNSWParcel(address);
  } else {
    // Try ACT first, then NSW
    const actResult = await lookupACTParcel(address);
    if (actResult) return actResult;
    return lookupNSWParcel(address);
  }
}

/**
 * Calculate approximate frontage and depth from polygon coordinates
 * Uses the bounding box approach with Haversine distance
 */
function calculateDimensions(coords: [number, number][]): { frontageM: number; depthM: number } {
  if (coords.length < 3) return { frontageM: 0, depthM: 0 };

  // Find bounding box
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  // Calculate distances using Haversine
  const frontageM = haversineDistance(minLat, minLng, minLat, maxLng);
  const depthM = haversineDistance(minLat, minLng, maxLat, minLng);

  // Frontage is typically the shorter dimension for residential lots
  if (frontageM > depthM) {
    return { frontageM: Math.round(depthM * 10) / 10, depthM: Math.round(frontageM * 10) / 10 };
  }
  return { frontageM: Math.round(frontageM * 10) / 10, depthM: Math.round(depthM * 10) / 10 };
}

/**
 * Calculate centroid of a polygon from coordinates [lng, lat][]
 */
function calculateCentroid(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  let sumLng = 0, sumLat = 0;
  // Exclude last point if it duplicates the first (closed ring)
  const len = (coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1])
    ? coords.length - 1 : coords.length;
  for (let i = 0; i < len; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLng / len, sumLat / len];
}

/**
 * Haversine distance between two lat/lng points in metres
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
