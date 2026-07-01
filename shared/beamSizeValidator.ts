/**
 * Beam Size Validator — Lightweight utility for inline colour coding & hover tips
 *
 * Uses the RB100 beam span tables to determine whether a selected beam size
 * is adequate for the given span distance and wind category.
 *
 * Returns a status (pass/warning/fail) with a human-readable tooltip message.
 *
 * This is a simplified wrapper around the full rb100-validation.ts module,
 * designed specifically for inline field-level feedback (colour coding + tooltips).
 */

export type BeamValidationStatus = "pass" | "warning" | "fail" | "unknown";

export interface BeamValidationResult {
  status: BeamValidationStatus;
  /** Colour to apply: green=pass, amber=warning, red=fail, grey=unknown */
  colour: string;
  /** Tailwind border class */
  borderClass: string;
  /** Tailwind bg class for subtle background tint */
  bgClass: string;
  /** Tailwind text class for the status label */
  textClass: string;
  /** Short label (OK, MARGINAL, UNDERSIZED, N/A) */
  label: string;
  /** Detailed tooltip message explaining the result */
  tooltip: string;
  /** Maximum allowable span in mm (if found in tables) */
  maxSpanMm: number | null;
  /** Utilisation percentage (beamSpan / maxSpan × 100) */
  utilisation: number | null;
  /** Suggested upgrade if not passing */
  suggestion?: string;
}

export interface BeamMountedPostLoadInput {
  structureWidthMm: number;
  structureLengthMm: number;
  postPositions: string[];
  beamPositions: string[];
  beamEntries?: Array<{ size?: string | null }>;
  fallbackBeamSize?: string | null;
  windCat: string;
  cpn?: string | number | null;
}

export interface BeamMountedPostLoadCheck {
  marker: string;
  beamIndex: number;
  beamSize: string;
  positionPct: number;
  status: BeamValidationStatus;
  label: string;
  estimatedLoadKn: number;
  pointLoadCapacityKn: number | null;
  utilisation: number | null;
  tributaryLengthMm: number;
  tributaryDepthMm: number;
  beamSpanMm: number;
  tooltip: string;
}

export interface BeamMountedPostLoadSummary {
  status: BeamValidationStatus;
  label: string;
  message: string;
  checks: BeamMountedPostLoadCheck[];
  worstUtilisation: number | null;
}

// ─── Beam Span Tables (from RB100) ─────────────────────────────────────────
// Simplified lookup: maps beam size → wind category → max beam span (mm)
// Uses the most conservative Cp'n = 1.2 (worst case) for quick validation.
// For more precise validation with specific Cp'n and projection, use the full
// rb100-validation.ts module.

interface SpanTableEntry {
  projection: number; // mm
  N1: number | null;
  N2: number | null;
  N3: number | null;
  N4: number | null;
}

// Beam sizes as used in the SpecSheet dropdown (width×depth format)
type SpecBeamSize = "75x50" | "100x50" | "125x50" | "150x50" | "175x50" | "200x50" | "250x50" | "300x50";

// Map spec sheet beam sizes to RB100 beam categories
// The spec sheet uses WxD format where W is the beam depth and D is the flange width
// RB100 uses: 140x50 (≈ 150x50 in spec), 150x60 (≈ 175x50 or 200x50), 200x60 (≈ 250x50 or 300x50)
function mapSpecBeamToRB100(specBeam: string): "140x50" | "150x60" | "200x60" | null {
  const normalised = specBeam.replace(/×/g, "x").toLowerCase();
  const match = normalised.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  const depth = parseInt(match?.[1] || normalised.split("x")[0], 10);
  if (!Number.isFinite(depth)) return null;
  if (depth <= 150) return "140x50";
  if (depth <= 200) return "150x60";
  if (depth <= 300) return "200x60";
  return null;
}

// Edge Single Beam max spans at Cp'n = 1.2 (most conservative)
const EDGE_SINGLE_SPANS: Record<"140x50" | "150x60" | "200x60", SpanTableEntry[]> = {
  "140x50": [
    { projection: 1800, N1: 5680, N2: 4620, N3: 3810, N4: 3140 },
    { projection: 2400, N1: 5150, N2: 4080, N3: 3210, N4: 2590 },
    { projection: 3000, N1: 4700, N2: 3740, N3: 2940, N4: 2370 },
    { projection: 3600, N1: 4340, N2: 3450, N3: 2720, N4: 2190 },
    { projection: 4200, N1: 4040, N2: 3210, N3: 2530, N4: null },
    { projection: 4800, N1: 3790, N2: 3010, N3: null, N4: null },
    { projection: 6000, N1: 3380, N2: 2620, N3: null, N4: null },
  ],
  "150x60": [
    { projection: 1800, N1: 6650, N2: 6240, N3: 4950, N4: 4040 },
    { projection: 2400, N1: 6310, N2: 5740, N3: 4550, N4: 3700 },
    { projection: 3000, N1: 6000, N2: 5260, N3: 4170, N4: 3380 },
    { projection: 3600, N1: 5710, N2: 4870, N3: 3860, N4: 3130 },
    { projection: 4500, N1: 5370, N2: 4400, N3: 3490, N4: 2820 },
    { projection: 5400, N1: 5000, N2: 4030, N3: 3230, N4: 2580 },
    { projection: 6000, N1: 4790, N2: 3850, N3: 3130, N4: 2450 },
    { projection: 6500, N1: 4610, N2: 3730, N3: 2870, N4: 2190 },
  ],
  "200x60": [
    { projection: 1800, N1: 8700, N2: 7390, N3: 5850, N4: 4760 },
    { projection: 2400, N1: 7930, N2: 6710, N3: 5310, N4: 4320 },
    { projection: 3000, N1: 7640, N2: 6150, N3: 4880, N4: 3960 },
    { projection: 3600, N1: 7070, N2: 5700, N3: 4510, N4: 3660 },
    { projection: 4200, N1: 6600, N2: 5320, N3: 4210, N4: 3420 },
    { projection: 4800, N1: 6200, N2: 5000, N3: 3950, N4: null },
    { projection: 5400, N1: 5860, N2: 4720, N3: 3780, N4: null },
    { projection: 6000, N1: 5590, N2: 4510, N3: null, N4: null },
  ],
};

// Wind category mapping (cyclonic → non-cyclonic equivalent)
function getWindKey(windCat: string): "N1" | "N2" | "N3" | "N4" | null {
  switch (windCat) {
    case "N1": return "N1";
    case "N2": return "N2";
    case "N3": return "N3";
    case "N4": return "N4";
    case "C1": return "N3";
    case "C2": return "N4";
    case "C3":
    case "C4":
      return null; // Not supported — requires specific engineering
    default:
      return null;
  }
}

const WIND_PRESSURES_KPA: Record<string, number> = {
  N1: 0.44,
  N2: 0.65,
  N3: 1.01,
  N4: 1.5,
  C1: 1.01,
  C2: 1.5,
  C3: 2.16,
  C4: 2.88,
};

function parseCpn(cpn: BeamMountedPostLoadInput["cpn"]): number {
  if (typeof cpn === "number" && Number.isFinite(cpn) && cpn > 0) return cpn;
  const match = String(cpn || "").match(/\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.2;
}

function parseBeamPosition(pos: string): { idx: number; pct: number; orientation: "H" | "V" } | null {
  const parts = pos.split(":");
  const idx = Number.parseInt(parts[0] || "", 10);
  const pct = Number.parseFloat(parts[1] || "");
  if (!Number.isFinite(idx) || !Number.isFinite(pct)) return null;
  return {
    idx,
    pct: Math.max(0, Math.min(100, pct)),
    orientation: parts[2] === "V" ? "V" : "H",
  };
}

function parseBeamMountedPost(marker: string): { beamIndex: number; pct: number } | null {
  const parts = marker.split(":");
  if (parts[0] !== "beam") return null;
  const beamIndex = Number.parseInt(parts[1] || "", 10);
  const pct = Number.parseFloat(parts[2] || "");
  if (!Number.isFinite(beamIndex) || !Number.isFinite(pct)) return null;
  return {
    beamIndex,
    pct: Math.max(0, Math.min(100, pct)),
  };
}

/**
 * Find the max allowable beam span for a given beam size, projection, and wind category.
 * Uses linear interpolation between table entries for projections between rows.
 */
function lookupMaxSpan(
  rb100Beam: "140x50" | "150x60" | "200x60",
  projectionMm: number,
  windKey: "N1" | "N2" | "N3" | "N4"
): number | null {
  const table = EDGE_SINGLE_SPANS[rb100Beam];
  if (!table || table.length === 0) return null;

  // Find bracketing entries
  const sorted = [...table].sort((a, b) => a.projection - b.projection);

  // Below minimum projection — use the first entry (most generous)
  if (projectionMm <= sorted[0].projection) {
    return sorted[0][windKey];
  }

  // Above maximum projection — use the last entry (most conservative)
  if (projectionMm >= sorted[sorted.length - 1].projection) {
    return sorted[sorted.length - 1][windKey];
  }

  // Interpolate between two bracketing entries
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (projectionMm >= lo.projection && projectionMm <= hi.projection) {
      const loSpan = lo[windKey];
      const hiSpan = hi[windKey];
      if (loSpan === null || hiSpan === null) return null;
      // Linear interpolation
      const t = (projectionMm - lo.projection) / (hi.projection - lo.projection);
      return Math.round(loSpan + t * (hiSpan - loSpan));
    }
  }

  return null;
}

function estimatePointLoadCapacityKn({
  rb100Beam,
  beamSpanMm,
  tributaryDepthMm,
  windCat,
  cpn,
}: {
  rb100Beam: "140x50" | "150x60" | "200x60";
  beamSpanMm: number;
  tributaryDepthMm: number;
  windCat: string;
  cpn: number;
}): number | null {
  const windKey = getWindKey(windCat);
  if (!windKey || beamSpanMm <= 0 || tributaryDepthMm <= 0) return null;

  const maxSpan = lookupMaxSpan(rb100Beam, tributaryDepthMm, windKey);
  if (maxSpan === null) return null;

  const pressure = WIND_PRESSURES_KPA[windCat] || WIND_PRESSURES_KPA[windKey] || 1;
  const designPressureKpa = 0.35 + (pressure * cpn * 0.5);
  const lineLoadKnPerM = designPressureKpa * (tributaryDepthMm / 1000);
  const currentSpanM = beamSpanMm / 1000;
  const maxSpanM = maxSpan / 1000;

  // Equivalent centre point load from the RB100 span-table UDL capacity:
  // M_udl = wL^2/8 and M_point = PL/4, so P = wL_table^2/(2L_current).
  return (lineLoadKnPerM * maxSpanM * maxSpanM) / (2 * currentSpanM);
}

/**
 * Estimate whether posts mounted on beam lines exceed the receiving beam point-load capacity.
 *
 * The app's RB100 tables validate beam span under distributed roof load. Beam-mounted posts
 * introduce concentrated point loads, so this helper derives a conservative point-load limit
 * from the same span tables and compares it with the post's estimated tributary roof load.
 */
export function validateBeamMountedPostLoads(input: BeamMountedPostLoadInput): BeamMountedPostLoadSummary {
  const mountedPosts = input.postPositions
    .map(marker => ({ marker, parsed: parseBeamMountedPost(marker) }))
    .filter((row): row is { marker: string; parsed: { beamIndex: number; pct: number } } => !!row.parsed);

  if (mountedPosts.length === 0) {
    return {
      status: "unknown",
      label: "N/A",
      message: "No beam-mounted posts to validate.",
      checks: [],
      worstUtilisation: null,
    };
  }

  const widthMm = Number(input.structureWidthMm) || 0;
  const lengthMm = Number(input.structureLengthMm) || 0;
  const cpn = parseCpn(input.cpn);
  const pressure = WIND_PRESSURES_KPA[input.windCat] || 1;
  const designPressureKpa = 0.35 + (pressure * cpn * 0.5);
  const parsedBeamPositions = input.beamPositions.map(parseBeamPosition).filter(Boolean) as Array<{
    idx: number;
    pct: number;
    orientation: "H" | "V";
  }>;

  const checks: BeamMountedPostLoadCheck[] = mountedPosts.map(({ marker, parsed }) => {
    const beam = parsedBeamPositions.find(position => position.idx === parsed.beamIndex);
    const orientation = beam?.orientation || "H";
    const beamAxisPct = beam?.pct ?? 50;
    const beamSpanMm = orientation === "H" ? widthMm : lengthMm;
    const perpendicularMm = orientation === "H" ? lengthMm : widthMm;
    const beamSize = input.beamEntries?.[parsed.beamIndex]?.size || input.fallbackBeamSize || "";
    const rb100Beam = beamSize ? mapSpecBeamToRB100(beamSize) : null;

    const sameBeamPcts = mountedPosts
      .map(row => row.parsed)
      .filter(post => post.beamIndex === parsed.beamIndex)
      .map(post => post.pct)
      .sort((a, b) => a - b);
    const idx = sameBeamPcts.findIndex(pct => pct === parsed.pct);
    const prevPct = idx > 0 ? sameBeamPcts[idx - 1] : 0;
    const nextPct = idx >= 0 && idx < sameBeamPcts.length - 1 ? sameBeamPcts[idx + 1] : 100;
    const tributaryPct = Math.max(5, ((parsed.pct - prevPct) + (nextPct - parsed.pct)) / 2);
    const tributaryLengthMm = beamSpanMm * (tributaryPct / 100);
    const tributaryDepthMm = Math.max(600, perpendicularMm * Math.max(beamAxisPct / 100, 1 - beamAxisPct / 100));
    const tributaryAreaSqm = (tributaryLengthMm / 1000) * (tributaryDepthMm / 1000);
    const estimatedLoadKn = tributaryAreaSqm * designPressureKpa;
    const pointLoadCapacityKn = rb100Beam
      ? estimatePointLoadCapacityKn({
          rb100Beam,
          beamSpanMm,
          tributaryDepthMm,
          windCat: input.windCat,
          cpn,
        })
      : null;

    if (!beamSize || !rb100Beam || pointLoadCapacityKn === null || beamSpanMm <= 0 || perpendicularMm <= 0) {
      return {
        marker,
        beamIndex: parsed.beamIndex,
        beamSize: beamSize || "Unknown",
        positionPct: parsed.pct,
        status: "unknown",
        label: "CHECK",
        estimatedLoadKn,
        pointLoadCapacityKn,
        utilisation: null,
        tributaryLengthMm,
        tributaryDepthMm,
        beamSpanMm,
        tooltip: "Insufficient beam size, dimension, wind, or RB100 data to estimate this beam-mounted post point load.",
      };
    }

    const utilisation = Math.round((estimatedLoadKn / pointLoadCapacityKn) * 100);
    if (estimatedLoadKn > pointLoadCapacityKn) {
      return {
        marker,
        beamIndex: parsed.beamIndex,
        beamSize,
        positionPct: parsed.pct,
        status: "fail",
        label: "OVER",
        estimatedLoadKn,
        pointLoadCapacityKn,
        utilisation,
        tributaryLengthMm,
        tributaryDepthMm,
        beamSpanMm,
        tooltip: `Estimated point load ${estimatedLoadKn.toFixed(1)}kN exceeds ${beamSize} beam point-load capacity ${pointLoadCapacityKn.toFixed(1)}kN. Add support, reduce tributary area, or upgrade the receiving beam.`,
      };
    }

    if (estimatedLoadKn > pointLoadCapacityKn * 0.8) {
      return {
        marker,
        beamIndex: parsed.beamIndex,
        beamSize,
        positionPct: parsed.pct,
        status: "warning",
        label: "NEAR",
        estimatedLoadKn,
        pointLoadCapacityKn,
        utilisation,
        tributaryLengthMm,
        tributaryDepthMm,
        beamSpanMm,
        tooltip: `Estimated point load ${estimatedLoadKn.toFixed(1)}kN is ${utilisation}% of ${beamSize} beam point-load capacity ${pointLoadCapacityKn.toFixed(1)}kN. Consider extra support or engineering review.`,
      };
    }

    return {
      marker,
      beamIndex: parsed.beamIndex,
      beamSize,
      positionPct: parsed.pct,
      status: "pass",
      label: "OK",
      estimatedLoadKn,
      pointLoadCapacityKn,
      utilisation,
      tributaryLengthMm,
      tributaryDepthMm,
      beamSpanMm,
      tooltip: `Estimated point load ${estimatedLoadKn.toFixed(1)}kN is within ${beamSize} beam point-load capacity ${pointLoadCapacityKn.toFixed(1)}kN (${utilisation}% utilisation).`,
    };
  });

  const failed = checks.filter(check => check.status === "fail").length;
  const warned = checks.filter(check => check.status === "warning").length;
  const unknown = checks.filter(check => check.status === "unknown").length;
  const worstUtilisation = checks.reduce<number | null>((worst, check) => {
    if (check.utilisation === null) return worst;
    return worst === null ? check.utilisation : Math.max(worst, check.utilisation);
  }, null);

  if (failed > 0) {
    return {
      status: "fail",
      label: "POINT LOAD OVER",
      message: `${failed} beam-mounted post${failed === 1 ? "" : "s"} exceed estimated receiving-beam point-load capacity.`,
      checks,
      worstUtilisation,
    };
  }

  if (warned > 0 || unknown > 0) {
    return {
      status: "warning",
      label: warned > 0 ? "POINT LOAD NEAR" : "POINT LOAD CHECK",
      message: warned > 0
        ? `${warned} beam-mounted post${warned === 1 ? "" : "s"} are near estimated receiving-beam point-load capacity.`
        : "Some beam-mounted posts need beam size, dimension, or wind data before point-load capacity can be estimated.",
      checks,
      worstUtilisation,
    };
  }

  return {
    status: "pass",
    label: "POINT LOAD OK",
    message: "Beam-mounted post point loads are within the estimated receiving-beam capacity.",
    checks,
    worstUtilisation,
  };
}

/**
 * Get the recommended beam size for a given span, projection, and wind category.
 * Returns the smallest beam that passes, or null if none pass.
 */
export function getRecommendedBeamSize(
  beamSpanMm: number,
  projectionMm: number,
  windCat: string
): string | null {
  const windKey = getWindKey(windCat);
  if (!windKey) return null;

  const beamSizes: Array<{ rb100: "140x50" | "150x60" | "200x60"; label: string }> = [
    { rb100: "140x50", label: "150x50" },
    { rb100: "150x60", label: "200x50" },
    { rb100: "200x60", label: "250x50" },
  ];

  for (const beam of beamSizes) {
    const maxSpan = lookupMaxSpan(beam.rb100, projectionMm, windKey);
    if (maxSpan !== null && beamSpanMm <= maxSpan) {
      return beam.label;
    }
  }

  return null; // No standard beam is adequate
}

/**
 * Validate a beam size selection against RB100 span tables.
 *
 * @param specBeamSize - Beam size from the spec sheet dropdown (e.g., "150x50", "200x50")
 * @param beamSpanMm - Distance between posts along the beam (mm)
 * @param projectionMm - Roof projection / length (mm)
 * @param windCat - Wind category (N1, N2, N3, N4, C1, C2, C3, C4)
 * @returns Validation result with status, colour, and tooltip
 */
export function validateBeamSize(
  specBeamSize: string,
  beamSpanMm: number,
  projectionMm: number,
  windCat: string
): BeamValidationResult {
  // Default unknown result
  const unknown: BeamValidationResult = {
    status: "unknown",
    colour: "#9ca3af",
    borderClass: "border-gray-300",
    bgClass: "bg-gray-50",
    textClass: "text-gray-500",
    label: "N/A",
    tooltip: "Insufficient data to validate beam size. Enter beam span, projection, and wind category.",
    maxSpanMm: null,
    utilisation: null,
  };

  // Validate inputs
  if (!specBeamSize || !beamSpanMm || beamSpanMm <= 0 || !projectionMm || projectionMm <= 0 || !windCat) {
    return unknown;
  }

  // Map spec beam to RB100 category
  const rb100Beam = mapSpecBeamToRB100(specBeamSize);
  if (!rb100Beam) {
    return {
      ...unknown,
      tooltip: `Beam size "${specBeamSize}" not found in RB100 tables. Contact engineering for assessment.`,
    };
  }

  // Map wind category
  const windKey = getWindKey(windCat);
  if (!windKey) {
    return {
      ...unknown,
      status: "fail",
      colour: "#ef4444",
      borderClass: "border-red-500",
      bgClass: "bg-red-50",
      textClass: "text-red-700",
      label: "ENGINEERING REQ'D",
      tooltip: `Wind category ${windCat} requires specific engineering assessment per RB100. Standard tables do not cover this category.`,
      maxSpanMm: null,
      utilisation: null,
    };
  }

  // Lookup max span
  const maxSpan = lookupMaxSpan(rb100Beam, projectionMm, windKey);
  if (maxSpan === null) {
    return {
      ...unknown,
      status: "fail",
      colour: "#ef4444",
      borderClass: "border-red-500",
      bgClass: "bg-red-50",
      textClass: "text-red-700",
      label: "NOT SUPPORTED",
      tooltip: `${specBeamSize} beam is not supported in ${windCat} with ${projectionMm}mm projection per RB100. Requires specific engineering or beam upgrade.`,
      maxSpanMm: null,
      utilisation: null,
      suggestion: getRecommendedBeamSize(beamSpanMm, projectionMm, windCat)
        ? `Upgrade to ${getRecommendedBeamSize(beamSpanMm, projectionMm, windCat)}`
        : "Requires specific engineering assessment",
    };
  }

  const utilisation = Math.round((beamSpanMm / maxSpan) * 100);

  // Determine status
  if (beamSpanMm <= maxSpan * 0.9) {
    // PASS: well within limits (< 90% utilisation)
    return {
      status: "pass",
      colour: "#22c55e",
      borderClass: "border-green-500",
      bgClass: "bg-green-50",
      textClass: "text-green-700",
      label: "OK",
      tooltip: `✓ Beam span ${beamSpanMm}mm is within the max allowable ${maxSpan}mm for ${specBeamSize} in ${windCat} (${utilisation}% utilisation). Projection: ${projectionMm}mm. Per RB100 Table.`,
      maxSpanMm: maxSpan,
      utilisation,
    };
  } else if (beamSpanMm <= maxSpan) {
    // WARNING: within limits but > 90% utilisation
    return {
      status: "warning",
      colour: "#f59e0b",
      borderClass: "border-amber-500",
      bgClass: "bg-amber-50",
      textClass: "text-amber-700",
      label: "MARGINAL",
      tooltip: `⚠ Beam span ${beamSpanMm}mm is at ${utilisation}% of max ${maxSpan}mm for ${specBeamSize} in ${windCat}. Consider upgrading for safety margin. Projection: ${projectionMm}mm.`,
      maxSpanMm: maxSpan,
      utilisation,
      suggestion: getRecommendedBeamSize(beamSpanMm, projectionMm, windCat)
        ? `Consider upgrading to ${getRecommendedBeamSize(beamSpanMm, projectionMm, windCat)}`
        : undefined,
    };
  } else {
    // FAIL: exceeds max span
    const overBy = beamSpanMm - maxSpan;
    return {
      status: "fail",
      colour: "#ef4444",
      borderClass: "border-red-500",
      bgClass: "bg-red-50",
      textClass: "text-red-700",
      label: "UNDERSIZED",
      tooltip: `✗ Beam span ${beamSpanMm}mm EXCEEDS max ${maxSpan}mm for ${specBeamSize} in ${windCat} by ${overBy}mm (${utilisation}% utilisation). Projection: ${projectionMm}mm. Beam upgrade required.`,
      maxSpanMm: maxSpan,
      utilisation,
      suggestion: getRecommendedBeamSize(beamSpanMm, projectionMm, windCat)
        ? `Upgrade to ${getRecommendedBeamSize(beamSpanMm, projectionMm, windCat)}`
        : "Requires specific engineering — no standard beam is adequate for this span",
    };
  }
}
