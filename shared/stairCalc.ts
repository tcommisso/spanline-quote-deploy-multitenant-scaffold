/**
 * Deck Stair Geometry Calculator
 * NCC 2022 (ABCB Housing Provisions Part 11.2) compliant
 *
 * Key constraints:
 *  - Riser (R): 115–190 mm (standard residential)
 *  - Going (G): 240–355 mm
 *  - Slope: 550 ≤ 2R + G ≤ 700
 *  - Max 18 risers per flight
 *  - Handrail required when total rise > 1000 mm
 *  - Balustrade required when fall height > 1000 mm
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type StairType = "straight" | "l-shape" | "u-shape";
export type TreadMaterial = "matching" | "timber" | "aluminium";
export type RiserStyle = "open" | "closed";
export type StringerMaterial = "timber" | "steel" | "aluminium";
export type HandrailStyle = "none" | "one-side" | "both-sides";

export interface StairInputs {
  /** Total rise from ground to deck surface (mm) */
  totalRise: number;
  /** Target riser height (mm) — will be adjusted to fit evenly */
  targetRiser: number;
  /** Target going depth (mm) */
  targetGoing: number;
  /** Clear stair width (mm) */
  stairWidth: number;
  /** Stair configuration */
  stairType: StairType;
  /** Tread board material */
  treadMaterial: TreadMaterial;
  /** Open or closed risers */
  riserStyle: RiserStyle;
  /** Stringer material */
  stringerMaterial: StringerMaterial;
  /** Handrail configuration */
  handrailStyle: HandrailStyle;
  /** Board width for treads (mm) — from selected decking product */
  boardWidth: number;
  /** Gap between tread boards (mm) */
  boardGap: number;
  /** Nosing overhang (mm) */
  nosing: number;
  /** Number of flights (1 for straight, 2 for L/U) */
  flights: number;
  /** Landing depth (mm) — for L/U shapes */
  landingDepth: number;
}

export interface StairValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface StairGeometry {
  /** Number of risers */
  numberOfRisers: number;
  /** Actual riser height after even division (mm) */
  actualRiser: number;
  /** Number of goings (treads) = risers - 1 per flight */
  numberOfGoings: number;
  /** Going depth used (mm) */
  going: number;
  /** 2R + G slope check value */
  slopeValue: number;
  /** Total horizontal run of stair (mm) */
  totalGoing: number;
  /** Stringer length (hypotenuse, mm) */
  stringerLength: number;
  /** Stair angle (degrees) */
  stairAngle: number;
  /** Tread depth — actual board assembly width (mm) */
  treadDepth: number;
  /** Number of boards per tread */
  boardsPerTread: number;
  /** Whether handrail is code-required */
  handrailRequired: boolean;
  /** Whether balustrade is code-required */
  balustradeRequired: boolean;
}

export interface StairBOM {
  /** Stringer count */
  stringerCount: number;
  /** Stringer length each (mm) */
  stringerLengthMm: number;
  /** Total tread boards needed */
  treadBoards: number;
  /** Tread board cut length (mm) */
  treadCutLength: number;
  /** Riser boards (if closed) */
  riserBoards: number;
  /** Riser cut length (mm) */
  riserCutLength: number;
  /** Handrail total length (mm) */
  handrailLength: number;
  /** Number of balustrade posts */
  balustradePosts: number;
  /** Landing area (mm²) — for L/U shapes */
  landingArea: number;
  /** Landing boards needed */
  landingBoards: number;
}

export interface StairResult {
  inputs: StairInputs;
  validation: StairValidation;
  geometry: StairGeometry;
  bom: StairBOM;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const STAIR_LIMITS = {
  riserMin: 115,
  riserMax: 190,
  goingMin: 240,
  goingMax: 355,
  slopeMin: 550,
  slopeMax: 700,
  maxRisersPerFlight: 18,
  minRisersPerFlight: 2,
  handrailTriggerRise: 1000,
  balustradeTriggerFall: 1000,
  minHeadroom: 2000,
  minLandingDepth: 750,
  maxBalustradeSpacing: 1200,
  sphereTest: 125,
  handrailHeightMin: 865,
  handrailHeightMax: 1000,
} as const;

export const DEFAULT_STAIR_INPUTS: StairInputs = {
  totalRise: 600,
  targetRiser: 175,
  targetGoing: 270,
  stairWidth: 900,
  stairType: "straight",
  treadMaterial: "matching",
  riserStyle: "open",
  stringerMaterial: "timber",
  handrailStyle: "none",
  boardWidth: 138,
  boardGap: 5,
  nosing: 20,
  flights: 1,
  landingDepth: 900,
};

// ─── Calculation Functions ──────────────────────────────────────────────────

/**
 * Calculate the number of boards that fit across a tread
 */
export function boardsPerTread(going: number, boardWidth: number, boardGap: number, nosing: number): number {
  // Tread depth = going + nosing (boards overhang the riser line)
  const availableDepth = going + nosing;
  // Each board takes boardWidth + gap (last board no trailing gap)
  // n * boardWidth + (n-1) * gap <= availableDepth
  // n * (boardWidth + gap) - gap <= availableDepth
  // n <= (availableDepth + gap) / (boardWidth + gap)
  const n = Math.floor((availableDepth + boardGap) / (boardWidth + boardGap));
  return Math.max(1, n);
}

/**
 * Calculate actual tread depth from board count
 */
export function treadDepthFromBoards(boards: number, boardWidth: number, boardGap: number): number {
  return boards * boardWidth + (boards - 1) * boardGap;
}

/**
 * Validate stair inputs against NCC requirements
 */
export function validateStairInputs(inputs: StairInputs): StairValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  const { totalRise, targetRiser, targetGoing, stairWidth, stairType, flights } = inputs;

  // Check if stairs are even required at this height
  // Minimum viable stair: 2 risers × minimum riser height (115mm) = 230mm total rise
  const minViableTotalRise = STAIR_LIMITS.minRisersPerFlight * STAIR_LIMITS.riserMin;
  if (totalRise < minViableTotalRise) {
    warnings.push(`Stairs not required — deck height (${totalRise}mm) too low for compliant stair design (min ${minViableTotalRise}mm)`);
    return { valid: true, warnings, errors };
  }

  // Basic range checks
  if (totalRise > 4000) warnings.push("Total rise exceeds typical residential deck height (4000mm)");

  if (targetRiser < STAIR_LIMITS.riserMin) errors.push(`Riser height below minimum (${STAIR_LIMITS.riserMin}mm)`);
  if (targetRiser > STAIR_LIMITS.riserMax) errors.push(`Riser height exceeds maximum (${STAIR_LIMITS.riserMax}mm)`);

  if (targetGoing < STAIR_LIMITS.goingMin) errors.push(`Going below minimum (${STAIR_LIMITS.goingMin}mm)`);
  if (targetGoing > STAIR_LIMITS.goingMax) errors.push(`Going exceeds maximum (${STAIR_LIMITS.goingMax}mm)`);

  // Slope check
  const slopeValue = 2 * targetRiser + targetGoing;
  if (slopeValue < STAIR_LIMITS.slopeMin) errors.push(`Slope (2R+G=${slopeValue}) below minimum ${STAIR_LIMITS.slopeMin}mm`);
  if (slopeValue > STAIR_LIMITS.slopeMax) errors.push(`Slope (2R+G=${slopeValue}) exceeds maximum ${STAIR_LIMITS.slopeMax}mm`);

  // Riser count check
  const numberOfRisers = Math.round(totalRise / targetRiser);
  const risersPerFlight = stairType === "straight" ? numberOfRisers : Math.ceil(numberOfRisers / flights);
  if (risersPerFlight > STAIR_LIMITS.maxRisersPerFlight) {
    errors.push(`Too many risers per flight (${risersPerFlight}). Max ${STAIR_LIMITS.maxRisersPerFlight}. Add a landing.`);
  }

  // Width check
  if (stairWidth < 600) errors.push("Stair width below minimum (600mm)");
  if (stairWidth < 860) warnings.push("Stair width below typical residential minimum (860mm)");

  // Open riser sphere test warning
  if (inputs.riserStyle === "open") {
    const actualRiser = totalRise / numberOfRisers;
    if (actualRiser > STAIR_LIMITS.sphereTest) {
      warnings.push(`Open riser gap (${Math.round(actualRiser)}mm) exceeds 125mm sphere test. Consider closed risers or infill.`);
    }
  }

  // L/U shape landing check
  if (stairType !== "straight" && inputs.landingDepth < STAIR_LIMITS.minLandingDepth) {
    errors.push(`Landing depth must be at least ${STAIR_LIMITS.minLandingDepth}mm`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Calculate stair geometry from inputs
 */
export function calculateStairGeometry(inputs: StairInputs): StairGeometry {
  const { totalRise, targetRiser, targetGoing, boardWidth, boardGap, nosing, stairType, flights } = inputs;

  // Calculate number of risers (round to nearest whole)
  const numberOfRisers = Math.max(STAIR_LIMITS.minRisersPerFlight, Math.round(totalRise / targetRiser));

  // Actual riser height (evenly divided)
  const actualRiser = totalRise / numberOfRisers;

  // Going — use target (already validated)
  const going = targetGoing;

  // Slope check
  const slopeValue = Math.round(2 * actualRiser + going);

  // Boards per tread
  const numBoards = boardsPerTread(going, boardWidth, boardGap, nosing);

  // Actual tread depth
  const treadDepth = treadDepthFromBoards(numBoards, boardWidth, boardGap);

  // For multi-flight stairs, split risers across flights
  const risersPerFlight = stairType === "straight" ? numberOfRisers : Math.ceil(numberOfRisers / flights);
  const goingsPerFlight = risersPerFlight - 1;

  // Total horizontal going (per flight for multi-flight)
  const totalGoingPerFlight = goingsPerFlight * going;
  const totalGoing = stairType === "straight"
    ? (numberOfRisers - 1) * going
    : totalGoingPerFlight; // per flight dimension

  // Stringer length (hypotenuse of single flight)
  const flightRise = stairType === "straight" ? totalRise : totalRise / flights;
  const stringerLength = Math.sqrt(flightRise ** 2 + totalGoing ** 2);

  // Stair angle
  const stairAngle = Math.atan(flightRise / totalGoing) * (180 / Math.PI);

  // Handrail/balustrade requirements
  const handrailRequired = totalRise > STAIR_LIMITS.handrailTriggerRise;
  const balustradeRequired = totalRise > STAIR_LIMITS.balustradeTriggerFall;

  return {
    numberOfRisers,
    actualRiser: Math.round(actualRiser * 10) / 10,
    numberOfGoings: stairType === "straight" ? numberOfRisers - 1 : goingsPerFlight,
    going,
    slopeValue,
    totalGoing: Math.round(totalGoing),
    stringerLength: Math.round(stringerLength),
    stairAngle: Math.round(stairAngle * 10) / 10,
    treadDepth,
    boardsPerTread: numBoards,
    handrailRequired,
    balustradeRequired,
  };
}

/**
 * Calculate stringer count based on width and material
 */
export function stringerCount(stairWidth: number, stringerMaterial: StringerMaterial): number {
  // Timber: max 400mm spacing for composite treads
  // Steel/aluminium: max 600mm spacing
  const maxSpacing = stringerMaterial === "timber" ? 400 : 600;
  const count = Math.ceil(stairWidth / maxSpacing) + 1;
  return Math.max(2, count);
}

/**
 * Calculate full stair BOM
 */
export function calculateStairBOM(inputs: StairInputs, geometry: StairGeometry): StairBOM {
  const { stairWidth, stringerMaterial, riserStyle, stairType, flights, landingDepth, boardWidth, boardGap } = inputs;

  // Stringers
  const numStringers = stringerCount(stairWidth, stringerMaterial);
  const stringerLengthMm = geometry.stringerLength;

  // Tread boards
  const treadBoards = geometry.numberOfGoings * geometry.boardsPerTread * flights;
  const treadCutLength = stairWidth; // boards cut to stair width

  // Riser boards (if closed)
  let riserBoards = 0;
  let riserCutLength = 0;
  if (riserStyle === "closed") {
    // Riser height covered by boards laid horizontally
    const riserBoardsPerRiser = Math.ceil(geometry.actualRiser / (boardWidth + boardGap));
    riserBoards = geometry.numberOfRisers * riserBoardsPerRiser;
    riserCutLength = stairWidth;
  }

  // Handrail length
  let handrailLength = 0;
  if (inputs.handrailStyle === "one-side") {
    handrailLength = stringerLengthMm;
  } else if (inputs.handrailStyle === "both-sides") {
    handrailLength = stringerLengthMm * 2;
  }

  // Balustrade posts
  let balustradePosts = 0;
  if (geometry.balustradeRequired || inputs.handrailStyle !== "none") {
    const sides = inputs.handrailStyle === "both-sides" ? 2 : 1;
    // Posts at top and bottom of each flight + intermediate at max 1200mm spacing
    const postsPerSide = 2 + Math.floor(stringerLengthMm / STAIR_LIMITS.maxBalustradeSpacing);
    balustradePosts = postsPerSide * sides * flights;
  }

  // Landing (for L/U shapes)
  let landingArea = 0;
  let landingBoards = 0;
  if (stairType !== "straight") {
    landingArea = stairWidth * landingDepth;
    // Boards to cover landing
    const boardsAcross = Math.ceil(landingDepth / (boardWidth + boardGap));
    landingBoards = boardsAcross * Math.ceil(stairWidth / 5400); // assuming 5400mm max board length
    if (landingBoards < boardsAcross) landingBoards = boardsAcross;
  }

  return {
    stringerCount: numStringers,
    stringerLengthMm,
    treadBoards,
    treadCutLength,
    riserBoards,
    riserCutLength,
    handrailLength: Math.round(handrailLength),
    balustradePosts,
    landingArea,
    landingBoards,
  };
}

/**
 * Full stair calculation — validates, computes geometry, and generates BOM
 */
export function calculateStairs(inputs: StairInputs): StairResult {
  const validation = validateStairInputs(inputs);
  const geometry = calculateStairGeometry(inputs);
  const bom = calculateStairBOM(inputs, geometry);

  return { inputs, validation, geometry, bom };
}
