/**
 * RB100 Engineering Validation Logic
 * Validates patio structure dimensions against Spanline RB100 engineering tables.
 * Used in the Patio Planner to provide real-time compliance feedback.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type WindRegion = "N1" | "N2" | "N3" | "N4" | "C1" | "C2" | "C3";

export type EnclosureCondition =
  | "open3-single"
  | "open3-double"
  | "open2"
  | "open1"
  | "screen-enclosed"
  | "fully-enclosed";

export type BeamSize = "140x50" | "150x60" | "200x60";
export type BeamType = "edge-single" | "central-double";

export type PostMaterial = "steel" | "aluminium" | "timber";
export type PostSize =
  | "50x50x1.6"
  | "65x65x2.0"
  | "75x75x3.5"
  | "89x89x3.5"
  | "90x90x2.0"
  | "100x100x3.0"
  | "100x100x5.0"
  | "50x50x2.0-alu"
  | "60x60x2.0-alu"
  | "90x90x2.0-alu"
  | "90x90-timber"
  | "100x100-timber";

export type ValidationSeverity = "pass" | "warning" | "fail";

export interface ValidationResult {
  id: string;
  category: "beam" | "post" | "sheeting" | "footing";
  severity: ValidationSeverity;
  message: string;
  detail?: string;
  suggestion?: string;
}

export interface ValidationInput {
  windRegion: WindRegion;
  enclosure: EnclosureCondition;
  beamSize: BeamSize;
  beamType: BeamType;
  beamSpan: number; // mm (distance between posts along the beam)
  roofProjection: number; // mm
  postSize: PostSize;
  postHeight: number; // mm
  postCount: number;
  structureWidth: number; // mm
}

// ─── Pressure Coefficient Lookup ─────────────────────────────────────────────

const CPN_MAP: Record<EnclosureCondition, number> = {
  "open3-single": 0.45,
  "open3-double": 0.7,
  "open2": 1.0,
  "open1": 1.2,
  "screen-enclosed": 1.1,
  "fully-enclosed": 1.2,
};

export function getCpn(enclosure: EnclosureCondition): number {
  return CPN_MAP[enclosure];
}

// ─── Beam Span Tables ────────────────────────────────────────────────────────

interface BeamSpanEntry {
  roofProjection: number;
  cpn: number;
  N1: number | null;
  N2: number | null;
  N3: number | null;
  N4: number | null;
}

// Edge Single Beams — 140x50x0.85 G300
const EDGE_140x50: BeamSpanEntry[] = [
  { roofProjection: 1800, cpn: 1.2, N1: 5680, N2: 4620, N3: 3810, N4: 3140 },
  { roofProjection: 2400, cpn: 1.2, N1: 5150, N2: 4080, N3: 3210, N4: 2590 },
  { roofProjection: 3000, cpn: 1.2, N1: 4700, N2: 3740, N3: 2940, N4: 2370 },
  { roofProjection: 3600, cpn: 1.2, N1: 4340, N2: 3450, N3: 2720, N4: 2190 },
  { roofProjection: 4200, cpn: 1.2, N1: 4040, N2: 3210, N3: 2530, N4: null },
  { roofProjection: 4800, cpn: 1.2, N1: 3790, N2: 3010, N3: null, N4: null },
  { roofProjection: 6000, cpn: 1.2, N1: 3380, N2: 2620, N3: null, N4: null },
  { roofProjection: 2400, cpn: 1.0, N1: 6060, N2: 4810, N3: 3780, N4: 3050 },
  { roofProjection: 3000, cpn: 1.0, N1: 5540, N2: 4400, N3: 3460, N4: 2790 },
  { roofProjection: 3600, cpn: 1.0, N1: 5110, N2: 4060, N3: 3200, N4: 2580 },
  { roofProjection: 4200, cpn: 1.0, N1: 4760, N2: 3780, N3: 2970, N4: null },
  { roofProjection: 4800, cpn: 1.0, N1: 4460, N2: 3550, N3: null, N4: null },
  { roofProjection: 3300, cpn: 0.7, N1: 5750, N2: 5130, N3: 4000, N4: 3210 },
  { roofProjection: 3600, cpn: 0.7, N1: 5650, N2: 4930, N3: 3840, N4: 3080 },
  { roofProjection: 4200, cpn: 0.7, N1: 5480, N2: 4580, N3: 3560, N4: 2850 },
  { roofProjection: 4800, cpn: 0.7, N1: 5230, N2: 4280, N3: 3370, N4: null },
  { roofProjection: 5400, cpn: 0.7, N1: 4910, N2: 4020, N3: null, N4: null },
];

// Edge Single Beams — 150x60x1.0 G550
const EDGE_150x60: BeamSpanEntry[] = [
  { roofProjection: 1800, cpn: 1.2, N1: 6650, N2: 6240, N3: 4950, N4: 4040 },
  { roofProjection: 2400, cpn: 1.2, N1: 6310, N2: 5740, N3: 4550, N4: 3700 },
  { roofProjection: 3000, cpn: 1.2, N1: 6000, N2: 5260, N3: 4170, N4: 3380 },
  { roofProjection: 3600, cpn: 1.2, N1: 5710, N2: 4870, N3: 3860, N4: 3130 },
  { roofProjection: 4500, cpn: 1.2, N1: 5370, N2: 4400, N3: 3490, N4: 2820 },
  { roofProjection: 5400, cpn: 1.2, N1: 5000, N2: 4030, N3: 3230, N4: 2580 },
  { roofProjection: 6000, cpn: 1.2, N1: 4790, N2: 3850, N3: 3130, N4: 2450 },
  { roofProjection: 6500, cpn: 1.2, N1: 4610, N2: 3730, N3: 2870, N4: 2190 },
];

// Edge Single Beams — 200x60x1.0 G550
const EDGE_200x60: BeamSpanEntry[] = [
  { roofProjection: 1800, cpn: 1.2, N1: 8700, N2: 7390, N3: 5850, N4: 4760 },
  { roofProjection: 2400, cpn: 1.2, N1: 7930, N2: 6710, N3: 5310, N4: 4320 },
  { roofProjection: 3000, cpn: 1.2, N1: 7640, N2: 6150, N3: 4880, N4: 3960 },
  { roofProjection: 3600, cpn: 1.2, N1: 7070, N2: 5700, N3: 4510, N4: 3660 },
  { roofProjection: 4200, cpn: 1.2, N1: 6600, N2: 5320, N3: 4210, N4: 3420 },
  { roofProjection: 4800, cpn: 1.2, N1: 6200, N2: 5000, N3: 3950, N4: null },
  { roofProjection: 5400, cpn: 1.2, N1: 5860, N2: 4720, N3: 3780, N4: null },
  { roofProjection: 6000, cpn: 1.2, N1: 5590, N2: 4510, N3: null, N4: null },
];

// Central Double Beams — 140x50x0.85 G300
const CENTRAL_140x50: BeamSpanEntry[] = [
  { roofProjection: 3600, cpn: 1.2, N1: 6350, N2: 5500, N3: 4320, N4: 3490 },
  { roofProjection: 4800, cpn: 1.2, N1: 5780, N2: 4610, N3: 3630, N4: 2960 },
  { roofProjection: 6000, cpn: 1.2, N1: 5070, N2: 4040, N3: 3190, N4: 2580 },
  { roofProjection: 7200, cpn: 1.2, N1: 4570, N2: 3650, N3: 2880, N4: null },
  { roofProjection: 8400, cpn: 1.2, N1: 4190, N2: 3340, N3: null, N4: null },
  { roofProjection: 3600, cpn: 1.0, N1: 7470, N2: 6470, N3: 5080, N4: 4110 },
  { roofProjection: 4800, cpn: 1.0, N1: 6810, N2: 5420, N3: 4270, N4: 3480 },
  { roofProjection: 6000, cpn: 1.0, N1: 5970, N2: 4750, N3: 3750, N4: 3040 },
  { roofProjection: 7200, cpn: 1.0, N1: 5380, N2: 4290, N3: 3390, N4: null },
  { roofProjection: 3600, cpn: 0.7, N1: 7580, N2: 7180, N3: 6690, N4: 5390 },
  { roofProjection: 4800, cpn: 0.7, N1: 7080, N2: 6580, N3: 5830, N4: 4550 },
  { roofProjection: 6000, cpn: 0.7, N1: 6560, N2: 6310, N3: 4960, N4: 4010 },
  { roofProjection: 7200, cpn: 0.7, N1: 6300, N2: 5690, N3: 4490, N4: 3630 },
  { roofProjection: 9000, cpn: 0.7, N1: 5990, N2: 5000, N3: 3950, N4: null },
];

// Central Double Beams — 150x60x1.0 G550
const CENTRAL_150x60: BeamSpanEntry[] = [
  { roofProjection: 3600, cpn: 1.2, N1: 7640, N2: 7420, N3: 6660, N4: 5390 },
  { roofProjection: 4800, cpn: 1.2, N1: 7110, N2: 7000, N3: 5620, N4: 4560 },
  { roofProjection: 6000, cpn: 1.2, N1: 6530, N2: 6260, N3: 4950, N4: 4020 },
  { roofProjection: 7200, cpn: 1.2, N1: 6110, N2: 5650, N3: 4480, N4: 3640 },
  { roofProjection: 8400, cpn: 1.2, N1: 5640, N2: 4980, N3: 3940, N4: null },
  { roofProjection: 3600, cpn: 1.0, N1: 8990, N2: 8730, N3: 7840, N4: 6340 },
  { roofProjection: 4800, cpn: 1.0, N1: 8360, N2: 8240, N3: 6610, N4: 5360 },
  { roofProjection: 6000, cpn: 1.0, N1: 7680, N2: 7360, N3: 5820, N4: 4730 },
  { roofProjection: 7200, cpn: 1.0, N1: 7190, N2: 6640, N3: 5270, N4: 4280 },
  { roofProjection: 3600, cpn: 0.7, N1: 8990, N2: 8730, N3: 8730, N4: 7680 },
  { roofProjection: 4800, cpn: 0.7, N1: 8560, N2: 8310, N3: 8010, N4: 6480 },
  { roofProjection: 6000, cpn: 0.7, N1: 8200, N2: 7960, N3: 7050, N4: 5710 },
  { roofProjection: 7200, cpn: 0.7, N1: 7890, N2: 7660, N3: 6370, N4: 5160 },
  { roofProjection: 9000, cpn: 0.7, N1: 7140, N2: 6600, N3: 5220, N4: 4230 },
];

// Central Double Beams — 200x60x1.0 G550
const CENTRAL_200x60: BeamSpanEntry[] = [
  { roofProjection: 3600, cpn: 1.2, N1: 10110, N2: 9610, N3: 7710, N4: 6270 },
  { roofProjection: 4800, cpn: 1.2, N1: 9470, N2: 8220, N3: 6520, N4: 5290 },
  { roofProjection: 6000, cpn: 1.2, N1: 8960, N2: 7240, N3: 5750, N4: 4670 },
  { roofProjection: 7200, cpn: 1.2, N1: 8100, N2: 6550, N3: 5200, N4: 4230 },
  { roofProjection: 8400, cpn: 1.2, N1: 7150, N2: 5780, N3: 4590, N4: null },
  { roofProjection: 3600, cpn: 1.0, N1: 11900, N2: 11310, N3: 9070, N4: 7370 },
  { roofProjection: 4800, cpn: 1.0, N1: 11140, N2: 9670, N3: 7670, N4: 6230 },
  { roofProjection: 6000, cpn: 1.0, N1: 10540, N2: 8520, N3: 6770, N4: 5500 },
  { roofProjection: 7200, cpn: 1.0, N1: 9530, N2: 7700, N3: 6120, N4: 4980 },
  { roofProjection: 3600, cpn: 0.7, N1: 11900, N2: 11900, N3: 10990, N4: 8890 },
  { roofProjection: 4800, cpn: 0.7, N1: 11140, N2: 11140, N3: 9270, N4: 7520 },
  { roofProjection: 6000, cpn: 0.7, N1: 10540, N2: 10330, N3: 8170, N4: 6630 },
  { roofProjection: 7200, cpn: 0.7, N1: 10060, N2: 9330, N3: 7390, N4: 6000 },
  { roofProjection: 9000, cpn: 0.7, N1: 9140, N2: 7660, N3: 6070, N4: 4930 },
];

// ─── Post Tables ─────────────────────────────────────────────────────────────

interface PostEntry {
  size: PostSize;
  material: PostMaterial;
  label: string;
  capacityKN: number;
  maxHeight: number; // mm
  windRestriction?: WindRegion[];
}

const POST_TABLE: PostEntry[] = [
  { size: "50x50x1.6", material: "steel", label: "50×50×1.6 Duragal", capacityKN: 7, maxHeight: 3000 },
  { size: "65x65x2.0", material: "steel", label: "65×65×2.0 Duragal", capacityKN: 18, maxHeight: 3600 },
  { size: "75x75x3.5", material: "steel", label: "75×75×3.5 Duragal", capacityKN: 23, maxHeight: 4500 },
  { size: "89x89x3.5", material: "steel", label: "89×89×3.5 Duragal", capacityKN: 38, maxHeight: 4500 },
  { size: "90x90x2.0", material: "steel", label: "90×90×2.0 Duragal", capacityKN: 29, maxHeight: 4000 },
  { size: "100x100x3.0", material: "steel", label: "100×100×3.0 Duragal", capacityKN: 50, maxHeight: 5600 },
  { size: "100x100x5.0", material: "steel", label: "100×100×5.0 Duragal", capacityKN: 55, maxHeight: 6000 },
  { size: "50x50x2.0-alu", material: "aluminium", label: "50×50×2.0 Aluminium", capacityKN: 5.6, maxHeight: 2700 },
  { size: "60x60x2.0-alu", material: "aluminium", label: "60×60×2.0 Aluminium", capacityKN: 10, maxHeight: 3200 },
  { size: "90x90x2.0-alu", material: "aluminium", label: "90×90×2.0 Aluminium", capacityKN: 14, maxHeight: 3800, windRestriction: ["N1", "N2"] },
  { size: "90x90-timber", material: "timber", label: "90×90 Merbau F17", capacityKN: 27.5, maxHeight: 3600 },
  { size: "100x100-timber", material: "timber", label: "100×100 Kwila F17", capacityKN: 38, maxHeight: 4000 },
];

// ─── Validation Functions ────────────────────────────────────────────────────

function getBeamTable(beamSize: BeamSize, beamType: BeamType): BeamSpanEntry[] {
  if (beamType === "edge-single") {
    switch (beamSize) {
      case "140x50": return EDGE_140x50;
      case "150x60": return EDGE_150x60;
      case "200x60": return EDGE_200x60;
    }
  } else {
    switch (beamSize) {
      case "140x50": return CENTRAL_140x50;
      case "150x60": return CENTRAL_150x60;
      case "200x60": return CENTRAL_200x60;
    }
  }
}

function getWindKey(region: WindRegion): "N1" | "N2" | "N3" | "N4" {
  // Cyclonic mapping: C1→N3, C2→N4, C3/C4→not supported
  switch (region) {
    case "C1": return "N3";
    case "C2": return "N4";
    case "C3": return "N4"; // Will be flagged as unsupported
    default: return region as "N1" | "N2" | "N3" | "N4";
  }
}

function findClosestProjection(table: BeamSpanEntry[], projection: number, cpn: number): BeamSpanEntry | null {
  // Filter to matching Cp'n (use closest available)
  const cpnValues = Array.from(new Set(table.map(e => e.cpn))).sort((a, b) => a - b);
  let targetCpn = cpnValues[0];
  for (const c of cpnValues) {
    if (c <= cpn) targetCpn = c;
  }
  // If cpn is higher than all available, use the highest (most conservative)
  if (cpn > cpnValues[cpnValues.length - 1]) {
    targetCpn = cpnValues[cpnValues.length - 1];
  }

  const filtered = table.filter(e => e.cpn === targetCpn);
  if (filtered.length === 0) return null;

  // Find the entry with closest projection >= input (conservative)
  const sorted = [...filtered].sort((a, b) => a.roofProjection - b.roofProjection);
  for (const entry of sorted) {
    if (entry.roofProjection >= projection) return entry;
  }
  // If projection exceeds all entries, return the largest (will likely fail)
  return sorted[sorted.length - 1];
}

function validateBeam(input: ValidationInput): ValidationResult[] {
  const results: ValidationResult[] = [];
  const cpn = getCpn(input.enclosure);
  const table = getBeamTable(input.beamSize, input.beamType);
  const windKey = getWindKey(input.windRegion);

  // Find the closest matching entry
  const entry = findClosestProjection(table, input.roofProjection, cpn);

  if (!entry) {
    results.push({
      id: "beam-no-data",
      category: "beam",
      severity: "fail",
      message: `No RB100 data available for ${input.beamSize} ${input.beamType} beam`,
      suggestion: "Contact Spanline engineering for specific assessment",
    });
    return results;
  }

  const maxSpan = entry[windKey];

  if (maxSpan === null) {
    results.push({
      id: "beam-not-supported",
      category: "beam",
      severity: "fail",
      message: `${input.beamSize} beam not supported in ${input.windRegion} with ${input.roofProjection}mm projection`,
      detail: `This beam/wind/projection combination requires specific engineering per RB100`,
      suggestion: getBeamUpgradeSuggestion(input),
    });
    return results;
  }

  if (input.beamSpan > maxSpan) {
    const overBy = input.beamSpan - maxSpan;
    results.push({
      id: "beam-span-exceeded",
      category: "beam",
      severity: "fail",
      message: `Beam span ${input.beamSpan}mm exceeds max ${maxSpan}mm for ${input.beamSize} in ${input.windRegion}`,
      detail: `Exceeds allowable by ${overBy}mm (${Math.round(overBy / maxSpan * 100)}%). Cp'n=${cpn}, Projection=${input.roofProjection}mm`,
      suggestion: getBeamUpgradeSuggestion(input),
    });
  } else if (input.beamSpan > maxSpan * 0.9) {
    results.push({
      id: "beam-span-warning",
      category: "beam",
      severity: "warning",
      message: `Beam span ${input.beamSpan}mm is within 10% of max ${maxSpan}mm`,
      detail: `Using ${Math.round(input.beamSpan / maxSpan * 100)}% of allowable capacity. Consider safety margin.`,
    });
  } else {
    results.push({
      id: "beam-span-ok",
      category: "beam",
      severity: "pass",
      message: `Beam span OK — ${input.beamSpan}mm within ${maxSpan}mm max (${Math.round(input.beamSpan / maxSpan * 100)}% utilisation)`,
    });
  }

  return results;
}

function getBeamUpgradeSuggestion(input: ValidationInput): string {
  const sizes: BeamSize[] = ["140x50", "150x60", "200x60"];
  const currentIdx = sizes.indexOf(input.beamSize);
  const suggestions: string[] = [];

  // Try next beam size up
  if (currentIdx < sizes.length - 1) {
    suggestions.push(`Upgrade beam to ${sizes[currentIdx + 1]}`);
  }

  // Suggest adding a post to reduce span
  const reducedSpan = Math.round(input.beamSpan / (input.postCount + 1) * input.postCount);
  suggestions.push(`Add a post to reduce span to ~${reducedSpan}mm`);

  // Suggest central double if currently edge single
  if (input.beamType === "edge-single") {
    suggestions.push(`Use central double beam configuration`);
  }

  return suggestions.join(" | ");
}

function validatePost(input: ValidationInput): ValidationResult[] {
  const results: ValidationResult[] = [];
  const post = POST_TABLE.find(p => p.size === input.postSize);

  if (!post) {
    results.push({
      id: "post-unknown",
      category: "post",
      severity: "warning",
      message: `Post size ${input.postSize} not found in RB100 tables`,
      suggestion: "Verify post specification with engineering",
    });
    return results;
  }

  // Check height
  if (input.postHeight > post.maxHeight) {
    results.push({
      id: "post-height-exceeded",
      category: "post",
      severity: "fail",
      message: `Post height ${input.postHeight}mm exceeds max ${post.maxHeight}mm for ${post.label}`,
      detail: `Maximum height for ${post.label} is ${post.maxHeight}mm per RB100`,
      suggestion: getPostUpgradeSuggestion(input.postHeight),
    });
  } else if (input.postHeight > post.maxHeight * 0.9) {
    results.push({
      id: "post-height-warning",
      category: "post",
      severity: "warning",
      message: `Post height ${input.postHeight}mm is within 10% of max ${post.maxHeight}mm`,
      detail: `Consider a larger post size for additional safety margin`,
    });
  } else {
    results.push({
      id: "post-height-ok",
      category: "post",
      severity: "pass",
      message: `Post height OK — ${input.postHeight}mm within ${post.maxHeight}mm max`,
    });
  }

  // Check wind restriction
  if (post.windRestriction && !post.windRestriction.includes(input.windRegion)) {
    results.push({
      id: "post-wind-restriction",
      category: "post",
      severity: "fail",
      message: `${post.label} restricted to ${post.windRestriction.join("/")} regions only`,
      detail: `Current wind region ${input.windRegion} is not supported for this post`,
      suggestion: `Use steel 90×90×2.0 or larger for ${input.windRegion} region`,
    });
  }

  // Check load capacity (simplified: roof area × wind pressure / post count)
  const windPressures: Record<string, number> = { N1: 0.44, N2: 0.65, N3: 1.01, N4: 1.5, C1: 1.01, C2: 1.5, C3: 2.16 };
  const pressure = windPressures[input.windRegion] || 1.0;
  const roofArea = (input.structureWidth / 1000) * (input.roofProjection / 1000);
  const deadLoad = roofArea * 0.1; // ~0.1 kN/m² for sheeting
  const liveLoad = roofArea * 0.25; // maintenance load
  const windUplift = roofArea * pressure * getCpn(input.enclosure);
  const totalLoad = (deadLoad + liveLoad + windUplift * 0.5) / input.postCount; // Simplified

  if (totalLoad > post.capacityKN) {
    results.push({
      id: "post-capacity-exceeded",
      category: "post",
      severity: "fail",
      message: `Estimated post load ${totalLoad.toFixed(1)}kN exceeds ${post.label} capacity of ${post.capacityKN}kN`,
      detail: `Roof area: ${roofArea.toFixed(1)}m², Wind: ${input.windRegion}, Posts: ${input.postCount}`,
      suggestion: getPostUpgradeSuggestion(input.postHeight),
    });
  } else if (totalLoad > post.capacityKN * 0.8) {
    results.push({
      id: "post-capacity-warning",
      category: "post",
      severity: "warning",
      message: `Post load ${totalLoad.toFixed(1)}kN is ${Math.round(totalLoad / post.capacityKN * 100)}% of ${post.capacityKN}kN capacity`,
      detail: `Consider upgrading for additional safety margin`,
    });
  }

  return results;
}

function getPostUpgradeSuggestion(requiredHeight: number): string {
  const suitable = POST_TABLE
    .filter(p => p.maxHeight >= requiredHeight)
    .sort((a, b) => a.capacityKN - b.capacityKN);

  if (suitable.length === 0) return "Requires specific engineering — no standard post supports this height";
  return `Suitable alternatives: ${suitable.slice(0, 3).map(p => p.label).join(", ")}`;
}

function validateCyclonic(input: ValidationInput): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (input.windRegion === "C3") {
    results.push({
      id: "cyclonic-c3-warning",
      category: "beam",
      severity: "fail",
      message: "C3 cyclonic region requires specific engineering",
      detail: "Standard RB100 tables do not cover C3. Spanline engineering assessment required.",
      suggestion: "Contact Spanline engineering for C3 cyclonic design",
    });
  }

  if (input.windRegion === "C1" || input.windRegion === "C2") {
    results.push({
      id: "cyclonic-mapping",
      category: "beam",
      severity: "warning",
      message: `Cyclonic ${input.windRegion} — using ${input.windRegion === "C1" ? "N3" : "N4"} equivalent data`,
      detail: "For Spanline profiles (non-Versiclad), cyclonic regions use non-cyclonic equivalents",
    });
  }

  return results;
}

// ─── Main Validation Entry Point ─────────────────────────────────────────────

export function validateStructure(input: ValidationInput): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Cyclonic checks first
  results.push(...validateCyclonic(input));

  // Beam validation
  results.push(...validateBeam(input));

  // Post validation
  results.push(...validatePost(input));

  return results;
}

// ─── Helper: Get all beam sizes for comparison ───────────────────────────────

export function getAllBeamOptions(): { size: BeamSize; label: string; grade: string }[] {
  return [
    { size: "140x50", label: "140×50×0.85", grade: "G300" },
    { size: "150x60", label: "150×60×1.0", grade: "G550" },
    { size: "200x60", label: "200×60×1.0", grade: "G550" },
  ];
}

export function getAllPostOptions(): PostEntry[] {
  return POST_TABLE;
}

export function getEnclosureOptions(): { value: EnclosureCondition; label: string; cpn: number }[] {
  return [
    { value: "open3-single", label: "Open 3 Sides (Single Storey)", cpn: 0.45 },
    { value: "open3-double", label: "Open 3 Sides (Double Storey)", cpn: 0.7 },
    { value: "open2", label: "Open 2 Sides", cpn: 1.0 },
    { value: "open1", label: "Open 1 Side", cpn: 1.2 },
    { value: "screen-enclosed", label: "Screen Enclosed", cpn: 1.1 },
    { value: "fully-enclosed", label: "Fully Enclosed", cpn: 1.2 },
  ];
}

export function getWindRegionOptions(): { value: WindRegion; label: string; group: string }[] {
  return [
    { value: "N1", label: "N1 (0.44 kPa)", group: "Non-cyclonic" },
    { value: "N2", label: "N2 (0.65 kPa)", group: "Non-cyclonic" },
    { value: "N3", label: "N3 (1.01 kPa)", group: "Non-cyclonic" },
    { value: "N4", label: "N4 (1.50 kPa)", group: "Non-cyclonic" },
    { value: "C1", label: "C1 (1.01 kPa)", group: "Cyclonic" },
    { value: "C2", label: "C2 (1.50 kPa)", group: "Cyclonic" },
    { value: "C3", label: "C3 (2.16 kPa)", group: "Cyclonic" },
  ];
}
