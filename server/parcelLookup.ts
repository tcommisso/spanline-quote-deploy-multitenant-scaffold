/**
 * Parcel/Boundary lookup for ACT, NSW, QLD, and VIC cadastre services.
 * Returns property boundary polygon coordinates and area for site plan generation.
 */

import { makeRequest } from "./_core/map";
import { normalizeApiAddress } from "@shared/address-normalization";

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
  source: "actmapi" | "nsw_cadastre" | "qld_cadastre" | "vic_cadastre";
  /** Dimensions derived from boundary (approximate bounding box) */
  dimensions: {
    frontageM: number;
    depthM: number;
  };
  /** Centroid of the parcel [lng, lat] for satellite image centering */
  centroid: [number, number];
}

type ParsedActAddress = {
  streetNumber: string | null;
  streetName: string;
  suburb: string | null;
  searchTerm: string;
};

type ParcelLookupState = "ACT" | "NSW" | "QLD" | "VIC" | "unknown";

type GeocodedAddress = {
  lat: number;
  lng: number;
  suburb: string;
  state: ParcelLookupState;
  postcode: string;
  formattedAddress: string;
};

const NSW_CADASTRE_URL = "https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer/9/query";
const QLD_CADASTRE_URL = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4/query";
const VIC_CADASTRE_URL = "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/VicPlan_PropertyAndParcel/MapServer/4/query";

const ACT_STREET_SUFFIXES = new Set([
  "STREET",
  "ST",
  "ROAD",
  "RD",
  "AVENUE",
  "AVE",
  "CRESCENT",
  "CRES",
  "DRIVE",
  "DR",
  "PLACE",
  "PL",
  "COURT",
  "CT",
  "CIRCUIT",
  "CCT",
  "LANE",
  "LN",
  "TERRACE",
  "TCE",
  "CLOSE",
  "CL",
  "WAY",
  "PARADE",
  "PDE",
]);

function normaliseAddressText(value: string | null | undefined) {
  return String(value || "")
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseACTAddress(address: string, hints?: { suburb?: string; region?: string }): ParsedActAddress {
  const parts = address.split(",").map(part => part.trim()).filter(Boolean);
  const firstPartIsStreetNumber = /^\d+[A-Za-z]?$/.test(parts[0] || "") && !!parts[1];
  const streetPart = firstPartIsStreetNumber
    ? `${parts[0]} ${parts[1]}`
    : parts[0] || address;
  const suburbSearchStart = firstPartIsStreetNumber ? 2 : 1;
  const suburbFromAddress = parts
    .slice(suburbSearchStart)
    .map(part => part.replace(/\b(ACT|NSW|AUSTRALIA)\b/gi, "").replace(/\b\d{4}\b/g, "").trim())
    .find(Boolean);

  const unitMatch = streetPart.match(/^(\d+[A-Za-z]?)\/(\d+[A-Za-z]?)\s+(.+)$/i);
  const match = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/i);
  const streetNumber = unitMatch?.[2] || match?.[1] || null;
  const rawStreetName = unitMatch?.[3] || match?.[2] || streetPart;
  const streetName = normaliseAddressText(rawStreetName);
  const suburb = normaliseAddressText(hints?.suburb || suburbFromAddress || "");
  const coreStreetName = streetName
    .split(" ")
    .filter(word => word.length > 1 && !ACT_STREET_SUFFIXES.has(word))
    .join(" ");
  const searchTerm = normaliseAddressText(`${streetNumber || ""} ${coreStreetName || streetName}`.trim() || address);

  return {
    streetNumber,
    streetName,
    suburb: suburb || null,
    searchTerm,
  };
}

function scoreACTParcelMatch(attrs: any, parsed: ParsedActAddress) {
  const addresses = normaliseAddressText(attrs.ADDRESSES);
  const division = normaliseAddressText(attrs.DIVISION_NAME);
  let score = 0;

  if (parsed.suburb && division === parsed.suburb) score += 100;
  if (parsed.suburb && division !== parsed.suburb) score -= 100;
  if (parsed.searchTerm && addresses.includes(parsed.searchTerm)) score += 80;
  if (parsed.streetNumber && new RegExp(`\\b${parsed.streetNumber}\\b`).test(addresses)) score += 30;

  const streetWords = parsed.streetName
    .split(" ")
    .filter(word => word.length > 1 && !ACT_STREET_SUFFIXES.has(word));
  for (const word of streetWords) {
    if (addresses.includes(word)) score += 12;
  }

  return score;
}

/**
 * Detect whether an address is in ACT, NSW, QLD, or VIC based on common patterns.
 * Accepts optional suburb/region hints from the quote record.
 */
export function detectState(address: string, hints?: { suburb?: string; region?: string }): ParcelLookupState {
  const upper = address.toUpperCase();
  const hintText = `${hints?.suburb || ""} ${hints?.region || ""}`.toUpperCase();
  const combined = `${upper} ${hintText}`;
  // ACT postcodes: 2600-2620, 2900-2920
  if (/\b(260[0-9]|261[0-9]|2620|290[0-9]|291[0-9]|2920)\b/.test(combined)) return "ACT";
  // ACT suburbs/keywords (check both address and hints)
  if (/\b(ACT|CANBERRA|BELCONNEN|WODEN|TUGGERANONG|GUNGAHLIN|MOLONGLO|WESTON CREEK|O'MALLEY|OMALLEY|GARRAN|DEAKIN|CURTIN|LYONS|PHILLIP|MAWSON|PEARCE|TORRENS|FARRER|ISAACS|WANNIASSA|KAMBAH|GREENWAY|BONYTHON|GORDON|CONDER|BANKS|CALWELL|RICHARDSON|CHISHOLM|GILMORE|THEODORE|CASEY|NGUNNAWAL|NICHOLLS|PALMERSTON|AMAROO|HARRISON|FRANKLIN|FORDE|BONNER|JACKA|MONCRIEFF|TAYLOR|THROSBY|KENNY|WHITLAM|DENMAN PROSPECT|COOMBS|WRIGHT|MOLONGLO VALLEY)\b/.test(combined)) return "ACT";
  if (/\b(QLD|QUEENSLAND|BRISBANE|GOLD COAST|SUNSHINE COAST|TOOWOOMBA|IPSWICH|LOGAN|CAIRNS|TOWNSVILLE|MACKAY|ROCKHAMPTON|BUNDABERG)\b/.test(combined)) return "QLD";
  if (/\b(4\d{3}|9\d{3})\b/.test(combined)) return "QLD";
  if (/\b(VIC|VICTORIA|MELBOURNE|GEELONG|BALLARAT|BENDIGO|SHEPPARTON|WODONGA|WARRNAMBOOL|TRARALGON)\b/.test(combined)) return "VIC";
  if (/\b(3\d{3}|8\d{3})\b/.test(combined)) return "VIC";
  // NSW postcodes: 2xxx (not ACT range), or explicit NSW
  if (/\bNSW\b/.test(combined)) return "NSW";
  if (/\b2[0-5]\d{2}\b/.test(combined)) return "NSW";
  if (/\b2[6-8]\d{2}\b/.test(combined) && !/\b(260[0-9]|261[0-9]|2620)\b/.test(combined)) return "NSW";
  // Check region hint
  if (/\b(CANBERRA|ACT)\b/.test(hintText)) return "ACT";
  if (/\b(NSW|SYDNEY|NEWCASTLE|WOLLONGONG|QUEANBEYAN|SOUTH COAST)\b/.test(hintText)) return "NSW";
  if (/\b(QLD|QUEENSLAND|BRISBANE|GOLD COAST|SUNSHINE COAST)\b/.test(hintText)) return "QLD";
  if (/\b(VIC|VICTORIA|MELBOURNE|GEELONG|BALLARAT|BENDIGO)\b/.test(hintText)) return "VIC";
  return "unknown";
}

function stateFromGeocodeComponent(value: string | undefined): ParcelLookupState {
  const state = String(value || "").toUpperCase();
  if (state === "ACT") return "ACT";
  if (state === "NSW") return "NSW";
  if (state === "QLD") return "QLD";
  if (state === "VIC") return "VIC";
  return "unknown";
}

function getAddressComponent(components: any[], type: string, key: "short_name" | "long_name" = "long_name") {
  return components.find((component: any) => component.types?.includes(type))?.[key] || "";
}

async function geocodeParcelAddress(address: string): Promise<GeocodedAddress | null> {
  const geocodeResult = await makeRequest<any>("/maps/api/geocode/json", {
    address: normalizeApiAddress(address),
  });

  if (!geocodeResult?.results?.length) return null;
  const result = geocodeResult.results[0];
  const location = result.geometry?.location;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const addressComponents = result.address_components || [];
  return {
    lat,
    lng,
    suburb: getAddressComponent(addressComponents, "locality")
      || getAddressComponent(addressComponents, "sublocality_level_1")
      || getAddressComponent(addressComponents, "postal_town")
      || "",
    state: stateFromGeocodeComponent(getAddressComponent(addressComponents, "administrative_area_level_1", "short_name")),
    postcode: getAddressComponent(addressComponents, "postal_code"),
    formattedAddress: normalizeApiAddress(result.formatted_address || address),
  };
}

function firstRing(feature: any): [number, number][] | null {
  const rings = feature?.geometry?.rings;
  if (!Array.isArray(rings) || rings.length === 0 || !Array.isArray(rings[0])) return null;
  return rings[0]
    .map((point: any) => [Number(point[0]), Number(point[1])] as [number, number])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function calculatePolygonAreaSqm(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const [centroidLng, centroidLat] = calculateCentroid(coords);
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((centroidLat * Math.PI) / 180);
  const projected = coords.map(([lng, lat]) => ({
    x: (lng - centroidLng) * lngScale,
    y: (lat - centroidLat) * latScale,
  }));
  const len = projected.length > 1
    && projected[0].x === projected[projected.length - 1].x
    && projected[0].y === projected[projected.length - 1].y
    ? projected.length - 1
    : projected.length;
  let area = 0;
  for (let i = 0; i < len; i++) {
    const j = (i + 1) % len;
    area += projected[i].x * projected[j].y - projected[j].x * projected[i].y;
  }
  return Math.abs(area) / 2;
}

function usefulAreaSqm(attributeArea: unknown, coords: [number, number][]) {
  const parsed = Number(attributeArea);
  if (Number.isFinite(parsed) && parsed > 1) return parsed;
  return calculatePolygonAreaSqm(coords);
}

/**
 * Query ACTmapi for parcel boundary by address
 */
export async function lookupACTParcel(address: string, hints?: { suburb?: string; region?: string }): Promise<ParcelBoundary | null> {
  const normalizedAddress = normalizeApiAddress(address);
  const parsed = parseACTAddress(normalizedAddress, hints);
  const escapedSearchTerm = parsed.searchTerm.replace(/'/g, "''");
  const whereParts = [`ADDRESSES LIKE '%${escapedSearchTerm}%'`];
  if (parsed.suburb) {
    whereParts.push(`DIVISION_NAME = '${parsed.suburb.replace(/'/g, "''")}'`);
  }

  const url = "https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query";
  const params = new URLSearchParams({
    where: whereParts.join(" AND "),
    outFields: "BLOCK_NUMBER,SECTION_NUMBER,DIVISION_NAME,ADDRESSES,BLOCK_DERIVED_AREA",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultRecordCount: "10",
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`);
    if (!response.ok) return null;
    const data = await response.json();
    const features = data.features;
    if (!features || features.length === 0) return null;

    const ranked = [...features]
      .map((feature: any) => ({ feature, score: scoreACTParcelMatch(feature.attributes || {}, parsed) }))
      .sort((a, b) => b.score - a.score);
    const { feature, score } = ranked[0];
    if (score < 80) {
      console.warn(`[ParcelLookup] ACT match rejected for "${normalizedAddress}" with score ${score}`);
      return null;
    }

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
export async function lookupNSWParcel(address: string, geocode?: GeocodedAddress | null): Promise<ParcelBoundary | null> {
  try {
    const normalizedAddress = normalizeApiAddress(address);
    const geocoded = geocode || await geocodeParcelAddress(normalizedAddress);
    if (!geocoded) return null;

    const params = new URLSearchParams({
      geometry: `${geocoded.lng},${geocoded.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "lotnumber,planlabel,lotidstring,shape_Area,shape_Length",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: "1",
    });

    const response = await fetch(`${NSW_CADASTRE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const features = data.features;
    if (!features || features.length === 0) return null;

    const feature = features[0];
    const attrs = feature.attributes;
    const coordinates = firstRing(feature);
    if (!coordinates || coordinates.length < 3) return null;
    const areaSqm = usefulAreaSqm(attrs.shape_Area, coordinates);
    const dimensions = calculateDimensions(coordinates);

    const centroid = calculateCentroid(coordinates);
    return {
      coordinates,
      areaSqm,
      lotId: attrs.lotidstring || `Lot ${attrs.lotnumber} ${attrs.planlabel}`,
      suburb: geocoded.suburb,
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
 * Query Queensland DCDB cadastral parcels by geocoded point.
 */
export async function lookupQLDParcel(address: string, geocode?: GeocodedAddress | null): Promise<ParcelBoundary | null> {
  try {
    const normalizedAddress = normalizeApiAddress(address);
    const geocoded = geocode || await geocodeParcelAddress(normalizedAddress);
    if (!geocoded) return null;

    const params = new URLSearchParams({
      geometry: `${geocoded.lng},${geocoded.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "lot,plan,lotplan,lot_area,locality,shire_name,cover_typ,parcel_typ,st_area(shape)",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: "1",
    });

    const response = await fetch(`${QLD_CADASTRE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const features = data.features;
    if (!features || features.length === 0) return null;

    const feature = features[0];
    const attrs = feature.attributes || {};
    const coordinates = firstRing(feature);
    if (!coordinates || coordinates.length < 3) return null;

    const dimensions = calculateDimensions(coordinates);
    const centroid = calculateCentroid(coordinates);
    return {
      coordinates,
      areaSqm: usefulAreaSqm(attrs.lot_area ?? attrs["st_area(shape)"], coordinates),
      lotId: attrs.lotplan || [attrs.lot ? `Lot ${attrs.lot}` : "", attrs.plan].filter(Boolean).join(" "),
      suburb: attrs.locality || geocoded.suburb,
      source: "qld_cadastre",
      dimensions,
      centroid,
    };
  } catch (err) {
    console.error("[ParcelLookup] QLD query failed:", err);
    return null;
  }
}

/**
 * Query Victorian Vicmap/VicPlan parcel boundaries by geocoded point.
 */
export async function lookupVICParcel(address: string, geocode?: GeocodedAddress | null): Promise<ParcelBoundary | null> {
  try {
    const normalizedAddress = normalizeApiAddress(address);
    const geocoded = geocode || await geocodeParcelAddress(normalizedAddress);
    if (!geocoded) return null;

    const params = new URLSearchParams({
      geometry: `${geocoded.lng},${geocoded.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "PARCEL_SPI,PARCEL_PLAN_NUMBER,PARCEL_LOT_NUMBER,Shape_Area,Shape_Length",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
      resultRecordCount: "1",
    });

    const response = await fetch(`${VIC_CADASTRE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const features = data.features;
    if (!features || features.length === 0) return null;

    const feature = features[0];
    const attrs = feature.attributes || {};
    const coordinates = firstRing(feature);
    if (!coordinates || coordinates.length < 3) return null;

    const dimensions = calculateDimensions(coordinates);
    const centroid = calculateCentroid(coordinates);
    const lotId = attrs.PARCEL_SPI
      || [attrs.PARCEL_LOT_NUMBER ? `Lot ${attrs.PARCEL_LOT_NUMBER}` : "", attrs.PARCEL_PLAN_NUMBER].filter(Boolean).join(" ")
      || "Victorian parcel";

    return {
      coordinates,
      areaSqm: usefulAreaSqm(attrs.Shape_Area, coordinates),
      lotId,
      suburb: geocoded.suburb,
      source: "vic_cadastre",
      dimensions,
      centroid,
    };
  } catch (err) {
    console.error("[ParcelLookup] VIC query failed:", err);
    return null;
  }
}

/**
 * Main entry point - auto-detects state and queries appropriate service.
 * Accepts optional suburb/region hints from the quote record for better state detection.
 */
export async function lookupParcel(address: string, hints?: { suburb?: string; region?: string }): Promise<ParcelBoundary | null> {
  const normalizedAddress = normalizeApiAddress(address);
  let state = detectState(normalizedAddress, hints);
  let geocoded: GeocodedAddress | null = null;
  if (state === "unknown") {
    geocoded = await geocodeParcelAddress(normalizedAddress).catch((err) => {
      console.warn("[ParcelLookup] Geocode for state detection failed:", err);
      return null;
    });
    if (geocoded?.state && geocoded.state !== "unknown") {
      state = geocoded.state;
    }
  }
  console.log(`[ParcelLookup] Address: "${normalizedAddress}", Hints: ${JSON.stringify(hints)}, Detected state: ${state}`);

  if (state === "ACT") {
    return lookupACTParcel(normalizedAddress, hints);
  } else if (state === "NSW") {
    return lookupNSWParcel(normalizedAddress, geocoded);
  } else if (state === "QLD") {
    return lookupQLDParcel(normalizedAddress, geocoded);
  } else if (state === "VIC") {
    return lookupVICParcel(normalizedAddress, geocoded);
  } else {
    // Try the core market first, then interstate cadastre services.
    const actResult = await lookupACTParcel(normalizedAddress, hints);
    if (actResult) return actResult;
    geocoded = geocoded || await geocodeParcelAddress(normalizedAddress).catch(() => null);
    const lookupOrder: Array<(address: string, geocode?: GeocodedAddress | null) => Promise<ParcelBoundary | null>> = [
      lookupNSWParcel,
      lookupQLDParcel,
      lookupVICParcel,
    ];
    for (const lookup of lookupOrder) {
      const result = await lookup(normalizedAddress, geocoded);
      if (result) return result;
    }
    return null;
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
