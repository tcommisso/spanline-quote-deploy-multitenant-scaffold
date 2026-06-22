const STREET_TYPE_PATTERN = [
  "STREET", "ST", "ROAD", "RD", "AVENUE", "AVE", "CRESCENT", "CRES",
  "DRIVE", "DR", "PLACE", "PL", "COURT", "CT", "CIRCUIT", "CCT",
  "LANE", "LN", "TERRACE", "TCE", "CLOSE", "CL", "WAY", "PARADE",
  "PDE", "BOULEVARD", "BLVD", "GROVE", "GR", "HIGHWAY", "HWY",
  "LOOP", "RISE", "VIEW", "CIRCLE", "CHASE", "PATH", "WALK",
].join("|");

const STREET_NUMBER_COMMA_RE = new RegExp(
  String.raw`\b(\d+[A-Za-z]?(?:\s*(?:-|/)\s*\d+[A-Za-z]?)?)\s*,\s+(?=(?:[A-Za-z0-9'’.-]+\s+){0,6}(?:${STREET_TYPE_PATTERN})\b)`,
  "gi",
);

/**
 * Normalise addresses before sending them to government/geocoder APIs.
 *
 * LocationIQ can format Australian addresses as "7, Jacka Crescent". ACTmapi,
 * DA and cadastre lookups expect the street number and route as one phrase.
 */
export function normalizeApiAddress(address: string | null | undefined): string {
  return String(address || "")
    .replace(STREET_NUMBER_COMMA_RE, "$1 ")
    .replace(/\b(\d+[A-Za-z]?)\s*\/\s*(\d+[A-Za-z]?)/g, "$1/$2")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
