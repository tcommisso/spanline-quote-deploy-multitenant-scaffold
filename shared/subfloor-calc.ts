/**
 * Subfloor calculation engine with engineering-based beam selection.
 * Implements span tables from:
 *   - Spanmor Aluminium Subfloor System (40×50, 105×50, 170×50, 235×50)
 *   - SFS01 Spanline Flooring System (140×50, 150×60, 200×60 RFB)
 * Auto-selects cheapest valid framing option based on engineering limits.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type FramingSystem = "spanmor" | "sfs01" | "clickdeck";
export type LoadCondition = 1.5 | 2.0;

export type BoardDirection = "parallel" | "perpendicular" | "diagonal";
export type StaggerPattern = "none" | "random" | "equal" | "third" | "quarter";
export type PictureFrame = "none" | "single" | "double";
export type BreakerBoard = "none" | "single" | "double";
export type BreakerDirection = "along-length" | "along-width";
export type FasciaMaterial = "none" | "matching" | "timber" | "aluminium";
export type InfillType = "none" | "matching" | "lattice" | "vertical-slats" | "horizontal-slats" | "sheet-cladding";

export interface BoardLayoutInputs {
  boardDirection: BoardDirection;      // relative to length edge
  staggerPattern: StaggerPattern;
  pictureFrame: PictureFrame;
  breakerBoard: BreakerBoard;
  breakerDirection: BreakerDirection;   // which axis the breaker board runs along
  breakerPosition: number;             // mm from start edge (0 = midpoint auto)
  boardWidth: number;                  // mm face width (e.g. 138)
  boardGap: number;                    // mm gap between boards (e.g. 5.5)
  boardLength: number;                 // mm stock length (e.g. 5400)
  diagonalAngle: number;               // degrees (only used when direction = "diagonal", typically 45)
  fascia: FasciaMaterial;              // fascia boards on exposed edges
  fasciaHeightMm: number;             // fascia board height in mm (e.g. 150)
  infill: InfillType;                  // infill between ground and fascia on sides
}

export interface SubfloorInputs {
  length: number;       // mm - outer footprint length (bearer direction)
  width: number;        // mm - outer footprint width (joist span direction)
  minHeight: number;    // mm - min under-deck clearance
  maxHeight: number;    // mm - max under-deck clearance
  wall: "wall-mounted" | "free-standing";
  connector: "flush-finish" | "over-the-top";
  shape: "rectangle" | "l-shape" | "u-shape";
  cutLength: number;    // mm - L/U shape cutout length
  cutWidth: number;     // mm - L/U shape cutout width
  cut2Length: number;   // mm - U shape second cutout length
  cut2Width: number;    // mm - U shape second cutout width
  joistCentresOverride: number; // 0 = use default (450mm)
  framingSystem?: FramingSystem; // default "spanmor"
  boardLayout?: BoardLayoutInputs; // optional board layout config
}

export interface JoistProfile {
  id: string;
  label: string;
  depth: number;        // mm
  thickness: number;    // mm
  pricePerMetre: number;
  maxSpan: number;      // mm - max joist clearspan (used for legacy compat)
}

export interface PostInfo {
  t: number;            // fractional position along bearer (0–1)
  x: number;           // mm from origin
  y: number;           // mm from origin
  label: string;
}

export interface BearerLine {
  index: number;
  yFraction: number;    // fractional position along width (0–1)
  yMM: number;         // mm from top edge
  isWallAttached: boolean;
  posts: PostInfo[];
  type?: "structural" | "edge" | "breaker"; // purpose of this bearer line
}

export interface SectionResult {
  label: string;
  length: number;
  width: number;
  joistCount: number;
  joistLength: number;
  bearerCount: number;
  bearerLength: number;
  postCount: number;
  joistsCost: number;
  bearersCost: number;
  totalCost: number;
  bearerLines: BearerLine[];
}

export interface OptionResult {
  key: string;
  label: string;
  description: string;
  profile: JoistProfile;
  rows: number;         // bearer rows (joist span divisions)
  joistCount: number;
  joistLength: number;
  joistCentres: number;
  joistsCost: number;
  bearerProfile: JoistProfile;
  bearerCount: number;
  bearerLength: number;
  bearersCost: number;
  bearerLines: BearerLine[];
  postCount: number;
  totalCost: number;
  labourNote: string;
  sections?: SectionResult[];
}

export interface SubfloorResult {
  inputs: SubfloorInputs;
  optionA: OptionResult;
  optionB: OptionResult;
  selectedOption: "A" | "B";
  loadCondition: LoadCondition;
  warnings: string[];
}

// ─── Span Table Entry ──────────────────────────────────────────────────────

interface SpanEntry {
  joistSpan: number;   // mm
  bearerSpan: number;  // mm
}

interface BeamSpanTable {
  id: string;
  label: string;
  depth: number;
  thickness: number;
  pricePerMetre: number;
  minHeight: number;    // mm - minimum deck height for this beam (0 = no restriction)
  clearspan_1_5: SpanEntry[];
  clearspan_2_0: SpanEntry[];
  continuous_1_5: SpanEntry[];
  continuous_2_0: SpanEntry[];
  cantilever_1_5: SpanEntry[];
  cantilever_2_0: SpanEntry[];
}

// ─── SPANMOR SPAN TABLES ──────────────────────────────────────────────────

const SPANMOR_40: BeamSpanTable = {
  id: "spanmor_40",
  label: "40 × 50 mm",
  depth: 40,
  thickness: 50,
  pricePerMetre: 15.00,
  minHeight: 0,  // only for decks <250mm above ground
  clearspan_1_5: [
    { joistSpan: 1200, bearerSpan: 900 },
  ],
  clearspan_2_0: [], // not rated for 2.0 kPa
  continuous_1_5: [
    { joistSpan: 1200, bearerSpan: 900 },
  ],
  continuous_2_0: [],
  cantilever_1_5: [],
  cantilever_2_0: [],
};

const SPANMOR_105: BeamSpanTable = {
  id: "spanmor_105",
  label: "105 × 50 mm",
  depth: 105,
  thickness: 50,
  pricePerMetre: 30.02,
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 1800, bearerSpan: 2200 },
    { joistSpan: 2100, bearerSpan: 2050 },
    { joistSpan: 2400, bearerSpan: 1900 },
  ],
  clearspan_2_0: [
    { joistSpan: 1800, bearerSpan: 2000 },
    { joistSpan: 2100, bearerSpan: 1850 },
    { joistSpan: 2400, bearerSpan: 1700 },
  ],
  continuous_1_5: [
    { joistSpan: 1800, bearerSpan: 1800 },
    { joistSpan: 2100, bearerSpan: 1700 },
    { joistSpan: 2400, bearerSpan: 1550 },
  ],
  continuous_2_0: [
    { joistSpan: 1800, bearerSpan: 1650 },
    { joistSpan: 2100, bearerSpan: 1500 },
    { joistSpan: 2400, bearerSpan: 1400 },
  ],
  cantilever_1_5: [
    { joistSpan: 1800, bearerSpan: 1300 },
    { joistSpan: 2100, bearerSpan: 1200 },
    { joistSpan: 2400, bearerSpan: 1100 },
  ],
  cantilever_2_0: [
    { joistSpan: 1800, bearerSpan: 1300 },
    { joistSpan: 2100, bearerSpan: 1200 },
  ],
};

const SPANMOR_170: BeamSpanTable = {
  id: "spanmor_170",
  label: "170 × 50 mm",
  depth: 170,
  thickness: 50,
  pricePerMetre: 54.85,
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 1800, bearerSpan: 2400 },
    { joistSpan: 2100, bearerSpan: 2400 },
    { joistSpan: 2400, bearerSpan: 2300 },
    { joistSpan: 3000, bearerSpan: 2200 },
    { joistSpan: 3300, bearerSpan: 2100 },
    { joistSpan: 3700, bearerSpan: 1950 },
  ],
  clearspan_2_0: [
    { joistSpan: 1800, bearerSpan: 2400 },
    { joistSpan: 2100, bearerSpan: 2400 },
    { joistSpan: 2400, bearerSpan: 2300 },
    { joistSpan: 3000, bearerSpan: 2200 },
    { joistSpan: 3300, bearerSpan: 2100 },
  ],
  continuous_1_5: [
    { joistSpan: 1800, bearerSpan: 2000 },
    { joistSpan: 2100, bearerSpan: 1950 },
    { joistSpan: 2400, bearerSpan: 1900 },
    { joistSpan: 3000, bearerSpan: 1750 },
    { joistSpan: 3300, bearerSpan: 1700 },
    { joistSpan: 3700, bearerSpan: 1600 },
  ],
  continuous_2_0: [
    { joistSpan: 1800, bearerSpan: 2000 },
    { joistSpan: 2100, bearerSpan: 1950 },
    { joistSpan: 2400, bearerSpan: 1900 },
    { joistSpan: 3000, bearerSpan: 1750 },
    { joistSpan: 3300, bearerSpan: 1700 },
  ],
  cantilever_1_5: [
    { joistSpan: 1800, bearerSpan: 1900 },
    { joistSpan: 2100, bearerSpan: 1800 },
    { joistSpan: 2400, bearerSpan: 1750 },
    { joistSpan: 3000, bearerSpan: 1650 },
    { joistSpan: 3300, bearerSpan: 1600 },
    { joistSpan: 3700, bearerSpan: 1500 },
  ],
  cantilever_2_0: [
    { joistSpan: 1800, bearerSpan: 1900 },
    { joistSpan: 2100, bearerSpan: 1800 },
    { joistSpan: 2400, bearerSpan: 1750 },
    { joistSpan: 3000, bearerSpan: 1650 },
    { joistSpan: 3300, bearerSpan: 1600 },
  ],
};

const SPANMOR_235: BeamSpanTable = {
  id: "spanmor_235",
  label: "235 × 50 mm",
  depth: 235,
  thickness: 50,
  pricePerMetre: 78.00,
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 1800, bearerSpan: 3000 },
    { joistSpan: 2100, bearerSpan: 3000 },
    { joistSpan: 2400, bearerSpan: 3000 },
    { joistSpan: 3000, bearerSpan: 2900 },
    { joistSpan: 3300, bearerSpan: 2850 },
    { joistSpan: 3700, bearerSpan: 2750 },
    { joistSpan: 4400, bearerSpan: 2600 },
    { joistSpan: 4900, bearerSpan: 2550 },
  ],
  clearspan_2_0: [
    { joistSpan: 1800, bearerSpan: 3000 },
    { joistSpan: 2100, bearerSpan: 3000 },
    { joistSpan: 2400, bearerSpan: 3000 },
    { joistSpan: 3000, bearerSpan: 2900 },
    { joistSpan: 3300, bearerSpan: 2850 },
    { joistSpan: 3700, bearerSpan: 2750 },
    { joistSpan: 4400, bearerSpan: 2600 },
  ],
  continuous_1_5: [
    { joistSpan: 1800, bearerSpan: 2800 },
    { joistSpan: 2100, bearerSpan: 2650 },
    { joistSpan: 2400, bearerSpan: 2550 },
    { joistSpan: 3000, bearerSpan: 2350 },
    { joistSpan: 3300, bearerSpan: 2250 },
    { joistSpan: 3700, bearerSpan: 2150 },
    { joistSpan: 4400, bearerSpan: 1950 },
    { joistSpan: 4900, bearerSpan: 1900 },
  ],
  continuous_2_0: [
    { joistSpan: 1800, bearerSpan: 2800 },
    { joistSpan: 2100, bearerSpan: 2650 },
    { joistSpan: 2400, bearerSpan: 2550 },
    { joistSpan: 3000, bearerSpan: 2350 },
    { joistSpan: 3300, bearerSpan: 2250 },
    { joistSpan: 3700, bearerSpan: 2150 },
    { joistSpan: 4400, bearerSpan: 1950 },
  ],
  cantilever_1_5: [
    { joistSpan: 1800, bearerSpan: 2500 },
    { joistSpan: 2100, bearerSpan: 2400 },
    { joistSpan: 2400, bearerSpan: 2350 },
    { joistSpan: 3000, bearerSpan: 2200 },
    { joistSpan: 3300, bearerSpan: 2100 },
    { joistSpan: 3700, bearerSpan: 1950 },
    { joistSpan: 4400, bearerSpan: 1850 },
    { joistSpan: 4900, bearerSpan: 1800 },
  ],
  cantilever_2_0: [
    { joistSpan: 1800, bearerSpan: 2500 },
    { joistSpan: 2100, bearerSpan: 2400 },
    { joistSpan: 2400, bearerSpan: 2350 },
    { joistSpan: 3000, bearerSpan: 2200 },
    { joistSpan: 3300, bearerSpan: 2100 },
    { joistSpan: 3700, bearerSpan: 1950 },
    { joistSpan: 4400, bearerSpan: 1850 },
  ],
};

// ─── SFS01 SPAN TABLES ────────────────────────────────────────────────────

const SFS01_140: BeamSpanTable = {
  id: "sfs01_140",
  label: "140 × 50 RFB",
  depth: 140,
  thickness: 50,
  pricePerMetre: 28.00,
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 2500, bearerSpan: 2700 },
    { joistSpan: 3000, bearerSpan: 2450 },
    { joistSpan: 3500, bearerSpan: 2300 },
    { joistSpan: 3600, bearerSpan: 2250 },
  ],
  clearspan_2_0: [
    { joistSpan: 2500, bearerSpan: 2400 },
    { joistSpan: 3000, bearerSpan: 2150 },
    { joistSpan: 3400, bearerSpan: 2050 },
  ],
  continuous_1_5: [
    { joistSpan: 2500, bearerSpan: 2150 },
    { joistSpan: 3000, bearerSpan: 1970 },
    { joistSpan: 3500, bearerSpan: 1800 },
    { joistSpan: 3600, bearerSpan: 1750 },
  ],
  continuous_2_0: [
    { joistSpan: 2500, bearerSpan: 1920 },
    { joistSpan: 3000, bearerSpan: 1750 },
    { joistSpan: 3400, bearerSpan: 1650 },
  ],
  cantilever_1_5: [],
  cantilever_2_0: [],
};

const SFS01_150: BeamSpanTable = {
  id: "sfs01_150",
  label: "150 × 60 RFB",
  depth: 150,
  thickness: 60,
  pricePerMetre: 38.00,
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 2500, bearerSpan: 4250 },
    { joistSpan: 3000, bearerSpan: 3750 },
    { joistSpan: 3500, bearerSpan: 3550 },
    { joistSpan: 4000, bearerSpan: 3350 },
    { joistSpan: 4500, bearerSpan: 3100 },
    { joistSpan: 4600, bearerSpan: 3050 },
  ],
  clearspan_2_0: [
    { joistSpan: 2500, bearerSpan: 3750 },
    { joistSpan: 3000, bearerSpan: 3400 },
    { joistSpan: 3500, bearerSpan: 3150 },
    { joistSpan: 4000, bearerSpan: 2950 },
    { joistSpan: 4100, bearerSpan: 2900 },
  ],
  continuous_1_5: [
    { joistSpan: 2500, bearerSpan: 3100 },
    { joistSpan: 3000, bearerSpan: 2800 },
    { joistSpan: 3500, bearerSpan: 2600 },
    { joistSpan: 4000, bearerSpan: 2400 },
    { joistSpan: 4600, bearerSpan: 2200 },
  ],
  continuous_2_0: [
    { joistSpan: 2500, bearerSpan: 2800 },
    { joistSpan: 3000, bearerSpan: 2600 },
    { joistSpan: 3500, bearerSpan: 2400 },
    { joistSpan: 4000, bearerSpan: 2200 },
    { joistSpan: 4100, bearerSpan: 2150 },
  ],
  cantilever_1_5: [],
  cantilever_2_0: [],
};

const SFS01_200: BeamSpanTable = {
  id: "sfs01_200",
  label: "200 × 60 RFB",
  depth: 200,
  thickness: 60,
  pricePerMetre: 52.00,
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 2500, bearerSpan: 4900 },
    { joistSpan: 3000, bearerSpan: 4450 },
    { joistSpan: 3500, bearerSpan: 4100 },
    { joistSpan: 4000, bearerSpan: 3900 },
    { joistSpan: 4500, bearerSpan: 3550 },
    { joistSpan: 5000, bearerSpan: 3300 },
    { joistSpan: 5500, bearerSpan: 3100 },
  ],
  clearspan_2_0: [
    { joistSpan: 2500, bearerSpan: 4350 },
    { joistSpan: 3000, bearerSpan: 3950 },
    { joistSpan: 3500, bearerSpan: 3650 },
    { joistSpan: 4000, bearerSpan: 3100 },
    { joistSpan: 4500, bearerSpan: 2900 },
    { joistSpan: 5000, bearerSpan: 2800 },
  ],
  continuous_1_5: [
    { joistSpan: 2500, bearerSpan: 3800 },
    { joistSpan: 3000, bearerSpan: 3650 },
    { joistSpan: 3500, bearerSpan: 3375 },
    { joistSpan: 4000, bearerSpan: 3150 },
    { joistSpan: 4500, bearerSpan: 2975 },
    { joistSpan: 5000, bearerSpan: 2825 },
    { joistSpan: 5500, bearerSpan: 2700 },
  ],
  continuous_2_0: [
    { joistSpan: 2500, bearerSpan: 3400 },
    { joistSpan: 3000, bearerSpan: 3100 },
    { joistSpan: 3500, bearerSpan: 2875 },
    { joistSpan: 4000, bearerSpan: 2700 },
    { joistSpan: 4500, bearerSpan: 2550 },
    { joistSpan: 5000, bearerSpan: 2400 },
  ],
  cantilever_1_5: [],
  cantilever_2_0: [],
};

// ─── CLICKDECK SPAN TABLES ────────────────────────────────────────────────
// ClickDeck modular aluminium subfloor system.
// Fixed joist spacing: 450mm. Profiles sold per 1200mm length.
// Span values are SINGLE span (conservative) from Specifiers Guide.
// Load conditions: 2.5kPa residential mapped to 1.5 internal, 4kPa mapped to 2.0 internal.

const CLICKDECK_28: BeamSpanTable = {
  id: "clickdeck_28",
  label: "28 × 50 mm (ClickDeck)",
  depth: 28,
  thickness: 50,
  pricePerMetre: 21.67, // $26.00 per 1200mm
  minHeight: 0, // Extra Low layout: 53-144mm
  clearspan_1_5: [
    { joistSpan: 600, bearerSpan: 600 },
  ],
  clearspan_2_0: [
    { joistSpan: 550, bearerSpan: 600 },
  ],
  continuous_1_5: [
    { joistSpan: 700, bearerSpan: 700 },
  ],
  continuous_2_0: [
    { joistSpan: 700, bearerSpan: 650 },
  ],
  cantilever_1_5: [
    { joistSpan: 600, bearerSpan: 200 },
  ],
  cantilever_2_0: [
    { joistSpan: 550, bearerSpan: 200 },
  ],
};

const CLICKDECK_55: BeamSpanTable = {
  id: "clickdeck_55",
  label: "55 × 55 mm (ClickDeck)",
  depth: 55,
  thickness: 55,
  pricePerMetre: 21.67, // $26.00 per 1200mm
  minHeight: 0, // Standard layout: above 145mm (joist+bearer)
  clearspan_1_5: [
    { joistSpan: 1050, bearerSpan: 1000 },
    { joistSpan: 1200, bearerSpan: 1100 },
  ],
  clearspan_2_0: [
    { joistSpan: 1050, bearerSpan: 1000 },
    { joistSpan: 1200, bearerSpan: 950 },
  ],
  continuous_1_5: [
    { joistSpan: 1200, bearerSpan: 1200 },
  ],
  continuous_2_0: [
    { joistSpan: 1200, bearerSpan: 1050 },
  ],
  cantilever_1_5: [
    { joistSpan: 1050, bearerSpan: 300 },
  ],
  cantilever_2_0: [
    { joistSpan: 1050, bearerSpan: 300 },
  ],
};

const CLICKDECK_110: BeamSpanTable = {
  id: "clickdeck_110",
  label: "110 × 50 mm (ClickDeck)",
  depth: 110,
  thickness: 50,
  pricePerMetre: 31.67, // $38.00 per 1200mm
  minHeight: 0,
  clearspan_1_5: [
    { joistSpan: 1900, bearerSpan: 2400 },
    { joistSpan: 2100, bearerSpan: 2050 },
    { joistSpan: 2400, bearerSpan: 2150 },
  ],
  clearspan_2_0: [
    { joistSpan: 1900, bearerSpan: 2200 },
    { joistSpan: 2100, bearerSpan: 1750 },
    { joistSpan: 2400, bearerSpan: 1700 },
  ],
  continuous_1_5: [
    { joistSpan: 2100, bearerSpan: 2600 },
    { joistSpan: 2400, bearerSpan: 2200 },
  ],
  continuous_2_0: [
    { joistSpan: 2100, bearerSpan: 2400 },
    { joistSpan: 2400, bearerSpan: 2100 },
  ],
  cantilever_1_5: [
    { joistSpan: 1900, bearerSpan: 500 },
    { joistSpan: 2100, bearerSpan: 500 },
  ],
  cantilever_2_0: [
    { joistSpan: 1900, bearerSpan: 400 },
    { joistSpan: 2100, bearerSpan: 400 },
  ],
};

// ─── Profile Collections ──────────────────────────────────────────────────

const SPANMOR_PROFILES: BeamSpanTable[] = [SPANMOR_40, SPANMOR_105, SPANMOR_170, SPANMOR_235];
const SFS01_PROFILES: BeamSpanTable[] = [SFS01_140, SFS01_150, SFS01_200];
const CLICKDECK_PROFILES: BeamSpanTable[] = [CLICKDECK_28, CLICKDECK_55, CLICKDECK_110];

function getProfiles(system: FramingSystem): BeamSpanTable[] {
  if (system === "sfs01") return SFS01_PROFILES;
  if (system === "clickdeck") return CLICKDECK_PROFILES;
  return SPANMOR_PROFILES;
}

// ─── Legacy PROFILES export (backward compat) ─────────────────────────────

export const PROFILES: Record<"small" | "large", JoistProfile> = {
  small: {
    id: "small",
    label: "105 × 50 mm",
    depth: 105,
    thickness: 50,
    pricePerMetre: 30.02,
    maxSpan: 2400,
  },
  large: {
    id: "large",
    label: "170 × 50 mm",
    depth: 170,
    thickness: 50,
    pricePerMetre: 54.85,
    maxSpan: 3700,
  },
};

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_JOIST_CENTRES = 450; // mm

export const DEFAULT_BOARD_LAYOUT: BoardLayoutInputs = {
  boardDirection: "parallel",
  staggerPattern: "random",
  pictureFrame: "none",
  breakerBoard: "none",
  breakerDirection: "along-width",
  breakerPosition: 0,
  boardWidth: 138,
  boardGap: 5.5,
  boardLength: 5400,
  diagonalAngle: 45,
  fascia: "none",
  fasciaHeightMm: 150,
  infill: "none",
};

export const DEFAULT_INPUTS: SubfloorInputs = {
  length: 5000,
  width: 3000,
  minHeight: 200,
  maxHeight: 400,
  wall: "wall-mounted",
  connector: "flush-finish",
  shape: "rectangle",
  cutLength: 1500,
  cutWidth: 1500,
  cut2Length: 1500,
  cut2Width: 1500,
  joistCentresOverride: 0,
  framingSystem: "spanmor",
  boardLayout: DEFAULT_BOARD_LAYOUT,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getJoistCentres(inputs: SubfloorInputs): number {
  const override = inputs.joistCentresOverride;
  let centres = override && override >= 100 && override <= 1200
    ? override
    : DEFAULT_JOIST_CENTRES;

  // Diagonal boards require reduced joist spacing
  // Effective span = joist spacing / cos(angle), so we reduce centres by cos(angle)
  if (inputs.boardLayout?.boardDirection === "diagonal") {
    const angle = inputs.boardLayout.diagonalAngle || 45;
    const radians = (angle * Math.PI) / 180;
    centres = Math.round(centres * Math.cos(radians));
    // Minimum 200mm
    centres = Math.max(200, centres);
  }
  return centres;
}

/**
 * Get the effective deck dimensions accounting for board direction.
 * When boards run perpendicular (across width), joists must run along length,
 * which means we swap the joist span direction and bearer direction.
 */
function getEffectiveDimensions(inputs: SubfloorInputs): { joistSpanDim: number; bearerDim: number; swapped: boolean } {
  const boardDir = inputs.boardLayout?.boardDirection || "parallel";
  // Default: boards run parallel to length → joists run across width
  // Perpendicular: boards run across width → joists run along length (swap)
  // Diagonal: joists still run across width (standard orientation) but with reduced spacing
  if (boardDir === "perpendicular") {
    return { joistSpanDim: inputs.length, bearerDim: inputs.width, swapped: true };
  }
  return { joistSpanDim: inputs.width, bearerDim: inputs.length, swapped: false };
}

/**
 * Calculate additional framing members required by board layout features.
 * Returns extra joist count and extra bearer count to add to the base calculation.
 */
function getBoardLayoutExtras(inputs: SubfloorInputs): {
  extraJoists: number;
  extraBearers: number;
  edgeBearers: number;   // bearers at perimeter (picture frame, infill)
  breakerBearers: number; // bearers at breaker position (mid-span)
  extraCostNote: string;
} {
  const layout = inputs.boardLayout;
  if (!layout) return { extraJoists: 0, extraBearers: 0, edgeBearers: 0, breakerBearers: 0, extraCostNote: "" };

  let extraJoists = 0;
  let edgeBearers = 0;
  let breakerBearers = 0;
  const notes: string[] = [];

  // Picture frame: adds perimeter joists to support border boards
  // Border boards run perpendicular to main boards at each edge
  if (layout.pictureFrame === "single") {
    extraJoists += 2; // one extra joist at each end (2 edges perpendicular to joists)
    edgeBearers += 2; // one extra bearer at each side (2 edges parallel to joists)
    notes.push("Single picture frame: +2 joists, +2 edge bearers for perimeter support");
  } else if (layout.pictureFrame === "double") {
    extraJoists += 4; // two extra joists at each end
    edgeBearers += 4; // two extra bearers at each side
    notes.push("Double picture frame: +4 joists, +4 edge bearers for perimeter support");
  }

  // Breaker board: adds intermediate support member(s)
  // A breaker board runs perpendicular to main boards, requiring an extra bearer underneath
  if (layout.breakerBoard === "single") {
    breakerBearers += 1;
    notes.push("Single breaker board: +1 breaker bearer for mid-span support");
  } else if (layout.breakerBoard === "double") {
    breakerBearers += 2;
    notes.push("Double breaker board: +2 breaker bearers for mid-span support");
  }


  // Fascia boards: need fascia support brackets/blocking along exposed edges
  if (layout.fascia && layout.fascia !== "none") {
    // Fascia requires blocking between joists at each exposed edge
    extraJoists += 2; // Blocking at front and back edges
    notes.push(`Fascia (${layout.fascia}, ${layout.fasciaHeightMm || 150}mm): +2 blocking members for fascia support`);
  }

  // Infill: needs vertical battens/posts between bearers for panel support
  if (layout.infill && layout.infill !== "none") {
    // Infill panels need intermediate posts/battens at ~600mm centres along exposed perimeter
    const perimeterM = 2 * (inputs.length + inputs.width) / 1000;
    const infillPosts = Math.ceil(perimeterM / 0.6);
    // Represented as extra edge bearers (horizontal rails for infill attachment)
    edgeBearers += 2; // Top and bottom rail for infill panels
    notes.push(`Infill (${layout.infill}): +2 horizontal rails, ~${infillPosts} vertical battens @ 600mm ctrs`);
  }

  const extraBearers = edgeBearers + breakerBearers;
  return {
    extraJoists,
    extraBearers,
    edgeBearers,
    breakerBearers,
    extraCostNote: notes.join("; "),
  };
}

function getLoadCondition(inputs: SubfloorInputs): LoadCondition {
  // Decks >1000mm above ground = 2.0 kPa (balcony loading)
  // Decks ≤1000mm above ground = 1.5 kPa (habitable)
  return inputs.maxHeight > 1000 ? 2.0 : 1.5;
}

/**
 * Look up the maximum bearer span for a given joist span from the span table.
 * Uses linear interpolation between table entries.
 * Returns 0 if the joist span exceeds the table's maximum.
 */
function lookupBearerSpan(table: SpanEntry[], joistSpan: number): number {
  if (table.length === 0) return 0;

  // If joist span exceeds max in table, not valid
  const maxJoistSpan = table[table.length - 1].joistSpan;
  if (joistSpan > maxJoistSpan) return 0;

  // Find the entry where joistSpan fits (first entry >= joistSpan)
  for (let i = 0; i < table.length; i++) {
    if (joistSpan <= table[i].joistSpan) {
      return table[i].bearerSpan;
    }
  }

  // Interpolate between last two entries if needed
  return table[table.length - 1].bearerSpan;
}

/**
 * Determine how many bearer rows (joist span divisions) are needed
 * for a given beam profile to handle the deck width.
 * Returns the number of joist span divisions (1 = single span, 2 = split, etc.)
 */
function getRequiredBearerRows(
  beam: BeamSpanTable,
  deckWidth: number,
  deckLength: number,
  load: LoadCondition,
  inputs?: SubfloorInputs,
): { rows: number; maxBearerSpan: number } | null {
  const spanTable = load === 2.0 ? beam.clearspan_2_0 : beam.clearspan_1_5;
  if (spanTable.length === 0) return null;

  const maxJoistSpan = spanTable[spanTable.length - 1].joistSpan;

  // Account for board direction swapping joist/bearer orientation
  let effectiveJoistSpanDim = deckWidth;
  if (inputs?.boardLayout?.boardDirection === "perpendicular") {
    effectiveJoistSpanDim = deckLength;
  }

  // Try 1 division (single span), then 2, 3, etc.
  for (let rows = 1; rows <= 6; rows++) {
    const joistSpan = Math.ceil(effectiveJoistSpanDim / rows);
    if (joistSpan > maxJoistSpan) continue;

    const maxBearerSpan = lookupBearerSpan(spanTable, joistSpan);
    if (maxBearerSpan <= 0) continue;

    // Check if bearer span is achievable with posts along the length
    // Bearer span = distance between posts along the bearer
    // We need at least enough posts so that bearer span ≤ maxBearerSpan
    if (maxBearerSpan > 0) {
      return { rows, maxBearerSpan };
    }
  }

  return null;
}

function layoutPosts(
  bearerLength: number,
  maxSpan: number,
  bearerIndex: number,
  yMM: number,
  prefix = ""
): PostInfo[] {
  const count = Math.max(1, Math.ceil(bearerLength / maxSpan)) + 1;
  const posts: PostInfo[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    posts.push({
      t,
      x: Math.round(t * bearerLength),
      y: Math.round(yMM),
      label: `${prefix}B${bearerIndex + 1}-P${i + 1}`,
    });
  }
  return posts;
}

// ─── Section Calculator (for L/U shapes) ────────────────────────────────────

function calculateSection(
  label: string,
  sectionLength: number,
  sectionWidth: number,
  wall: "wall-mounted" | "free-standing",
  profile: JoistProfile,
  bearerRows: number,
  joistCentres: number,
  maxBearerSpan: number,
  prefix = ""
): SectionResult {
  const joistCount = (Math.ceil(sectionLength / joistCentres) + 1) * bearerRows;
  const bearerThicknessTotal = (bearerRows + 1) * profile.thickness;
  const clearSpan = Math.max(0, sectionWidth - bearerThicknessTotal);
  const joistLength = Math.round(clearSpan / bearerRows);
  const joistsCost = round2((joistLength / 1000) * joistCount * profile.pricePerMetre);

  const bearerCount = bearerRows + 1;
  const bearerLength = sectionLength;
  const bearersCost = round2((bearerLength / 1000) * bearerCount * profile.pricePerMetre);

  const bearerLines: BearerLine[] = [];
  for (let i = 0; i < bearerCount; i++) {
    const yFraction = bearerCount === 1 ? 0 : i / (bearerCount - 1);
    const yMM = Math.round(yFraction * sectionWidth);
    const isWallAttached = wall === "wall-mounted" && i === 0;
    const posts = isWallAttached
      ? []
      : layoutPosts(bearerLength, maxBearerSpan, i, yMM, prefix);
    bearerLines.push({ index: i, yFraction, yMM, isWallAttached, posts });
  }

  const postCount = bearerLines.reduce((sum, bl) => sum + bl.posts.length, 0);
  const totalCost = round2(joistsCost + bearersCost);

  return {
    label,
    length: sectionLength,
    width: sectionWidth,
    joistCount,
    joistLength,
    bearerCount,
    bearerLength,
    postCount,
    joistsCost,
    bearersCost,
    totalCost,
    bearerLines,
  };
}

// ─── Option Builder ─────────────────────────────────────────────────────────

function buildOption(
  key: string,
  inputs: SubfloorInputs,
  beam: BeamSpanTable,
  rows: number,
  maxBearerSpan: number,
): OptionResult {
  const { length, width, wall, shape } = inputs;
  const joistCentres = getJoistCentres(inputs);

  const profile: JoistProfile = {
    id: beam.id,
    label: beam.label,
    depth: beam.depth,
    thickness: beam.thickness,
    pricePerMetre: beam.pricePerMetre,
    maxSpan: maxBearerSpan,
  };

  // L-shape and U-shape: split into sections
  if (shape === "l-shape" || shape === "u-shape") {
    const cutL = Math.min(inputs.cutLength, length - 1);
    const cutW = Math.min(inputs.cutWidth, width - 1);
    let sections: SectionResult[];

    if (shape === "l-shape") {
      const mainWidth = width - cutW;
      const wingLength = length - cutL;
      sections = [
        calculateSection("Section 1 (main)", length, mainWidth, wall, profile, rows, joistCentres, maxBearerSpan, "S1-"),
        calculateSection(
          "Section 2 (wing)",
          wingLength,
          cutW,
          wall === "wall-mounted" ? "free-standing" : wall,
          profile,
          rows,
          joistCentres,
          maxBearerSpan,
          "S2-"
        ),
      ];
    } else {
      const cut2W = Math.min(inputs.cut2Width, width - 1);
      const centreWidth = width - Math.max(cutW, cut2W);
      const leftLength = Math.min(inputs.cutLength, length / 2);
      const rightLength = Math.min(inputs.cut2Length, length / 2);
      sections = [
        calculateSection("Section 1 (left wing)", leftLength, cutW, wall, profile, rows, joistCentres, maxBearerSpan, "S1-"),
        calculateSection("Section 2 (centre)", length, centreWidth, wall, profile, rows, joistCentres, maxBearerSpan, "S2-"),
        calculateSection(
          "Section 3 (right wing)",
          rightLength,
          cut2W,
          wall === "wall-mounted" ? "free-standing" : wall,
          profile,
          rows,
          joistCentres,
          maxBearerSpan,
          "S3-"
        ),
      ];
    }

    const joistCount = sections.reduce((s, sec) => s + sec.joistCount, 0);
    const bearerCount = sections.reduce((s, sec) => s + sec.bearerCount, 0);
    const postCount = sections.reduce((s, sec) => s + sec.postCount, 0);
    const joistsCost = round2(sections.reduce((s, sec) => s + sec.joistsCost, 0));
    const bearersCost = round2(sections.reduce((s, sec) => s + sec.bearersCost, 0));
    const totalCost = round2(joistsCost + bearersCost);

    return {
      key,
      label: `Option ${key} — ${beam.label}`,
      description: rows === 1
        ? `Single span using ${beam.label} — joists run full deck width.`
        : `Split span (${rows} divisions) using ${beam.label} — intermediate bearers reduce joist length.`,
      profile,
      rows,
      joistCount,
      joistLength: sections[0].joistLength,
      joistCentres,
      joistsCost,
      bearerProfile: profile,
      bearerCount,
      bearerLength: sections[0].bearerLength,
      bearersCost,
      bearerLines: sections[0].bearerLines,
      postCount,
      totalCost,
      labourNote: rows === 1
        ? "Single-span layout — fewer components, faster install."
        : "Mid-bearer layout — more posts, longer install time.",
      sections,
    };
  }

  // Rectangle (default) — account for board layout orientation
  const { joistSpanDim, bearerDim, swapped } = getEffectiveDimensions(inputs);
  const effectiveWidth = swapped ? inputs.length : width;
  const effectiveLength = swapped ? inputs.width : length;

  const baseJoistCount = (Math.ceil(effectiveLength / joistCentres) + 1) * rows;
  const boardExtras = getBoardLayoutExtras(inputs);
  const joistCount = baseJoistCount + boardExtras.extraJoists;

  const bearerThicknessTotal = (rows + 1) * profile.thickness;
  const clearSpan = Math.max(0, effectiveWidth - bearerThicknessTotal);
  const joistLength = Math.round(clearSpan / rows);
  const joistsCost = round2((joistLength / 1000) * joistCount * profile.pricePerMetre);

  const baseBearerCount = rows + 1;
  const bearerCount = baseBearerCount + boardExtras.extraBearers;
  const bearerLength = effectiveLength;
  const bearersCost = round2((bearerLength / 1000) * bearerCount * profile.pricePerMetre);

  // Build bearer lines with correct positioning by type:
  // 1. Structural bearers: evenly spaced across the width
  // 2. Edge bearers: positioned at perimeter (near 0 and width)
  // 3. Breaker bearers: positioned at breaker board location (mid-span)
  const bearerLines: BearerLine[] = [];
  let idx = 0;

  // Structural bearers (evenly spaced)
  for (let i = 0; i < baseBearerCount; i++) {
    const yFraction = baseBearerCount === 1 ? 0.5 : i / (baseBearerCount - 1);
    const yMM = Math.round(yFraction * width);
    const isWallAttached = wall === "wall-mounted" && i === 0;
    const posts = isWallAttached
      ? []
      : layoutPosts(bearerLength, maxBearerSpan, idx, yMM);
    bearerLines.push({ index: idx, yFraction, yMM, isWallAttached, posts, type: "structural" });
    idx++;
  }

  // Edge bearers: positioned just inside the perimeter
  // For picture frame: one board width inset from each edge
  const boardWidth = inputs.boardLayout?.boardWidth || 138;
  const edgeBearersPerSide = Math.floor(boardExtras.edgeBearers / 2);
  for (let s = 0; s < edgeBearersPerSide; s++) {
    // Near top edge (small yFraction)
    const offsetTop = (s + 1) * boardWidth;
    const yFractionTop = Math.min(offsetTop / width, 0.1);
    const yMMTop = offsetTop;
    bearerLines.push({ index: idx, yFraction: yFractionTop, yMM: yMMTop, isWallAttached: false, posts: [], type: "edge" });
    idx++;
    // Near bottom edge (large yFraction)
    const offsetBot = width - (s + 1) * boardWidth;
    const yFractionBot = Math.max(offsetBot / width, 0.9);
    const yMMBot = offsetBot;
    bearerLines.push({ index: idx, yFraction: yFractionBot, yMM: yMMBot, isWallAttached: false, posts: [], type: "edge" });
    idx++;
  }

  // Breaker bearers: positioned at breaker board location
  // The yFraction is used by the schematic renderer to position the breaker along the appropriate axis
  if (boardExtras.breakerBearers > 0) {
    const breakerPos = inputs.boardLayout?.breakerPosition || 0;
    const bDir = inputs.boardLayout?.breakerDirection || "along-width";
    // For "along-width" breaker: position along the length axis (X in default SVG)
    // For "along-length" breaker: position along the width axis (Y in default SVG)
    const refDim = bDir === "along-width" ? effectiveLength : effectiveWidth;
    const baseFraction = breakerPos > 0 ? breakerPos / refDim : 0.5;
    for (let b = 0; b < boardExtras.breakerBearers; b++) {
      const yFraction = baseFraction + (b - (boardExtras.breakerBearers - 1) / 2) * 0.02;
      const yMM = Math.round(yFraction * (bDir === "along-width" ? effectiveLength : effectiveWidth));
      bearerLines.push({ index: idx, yFraction, yMM, isWallAttached: false, posts: [], type: "breaker" });
      idx++;
    }
  }

  // Sort by yFraction for consistent rendering
  bearerLines.sort((a, b) => a.yFraction - b.yFraction);
  bearerLines.forEach((bl, i) => { bl.index = i; });

  const postCount = bearerLines.reduce((sum, bl) => sum + bl.posts.length, 0);
  const totalCost = round2(joistsCost + bearersCost);

  return {
    key,
    label: `Option ${key} — ${beam.label}`,
    description: rows === 1
      ? `Single span using ${beam.label} — joists run full deck width.`
      : `Split span (${rows} divisions) using ${beam.label} — intermediate bearers reduce joist length.`,
    profile,
    rows,
    joistCount,
    joistLength,
    joistCentres,
    joistsCost,
    bearerProfile: profile,
    bearerCount,
    bearerLength,
    bearersCost,
    bearerLines,
    postCount,
    totalCost,
    labourNote: rows === 1
      ? "Single-span layout — fewer components, faster install."
      : "Mid-bearer layout — more posts, longer install time.",
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Optional pricing overrides map: profile ID → price per metre.
 * When provided, overrides the hard-coded pricePerMetre in span tables.
 * This allows prices to be driven from Master Data (deck_framing table).
 */
export type PricingOverrides = Record<string, number>;

export function calculateSubfloor(inputs: SubfloorInputs, pricingOverrides?: PricingOverrides): SubfloorResult {
  const warnings: string[] = [];
  const joistCentres = getJoistCentres(inputs);
  const load = getLoadCondition(inputs);
  const system = inputs.framingSystem || "spanmor";
  const profiles = getProfiles(system);

  // Apply pricing overrides from Master Data if provided
  if (pricingOverrides) {
    for (const beam of profiles) {
      if (pricingOverrides[beam.id] !== undefined && pricingOverrides[beam.id] > 0) {
        beam.pricePerMetre = pricingOverrides[beam.id];
      }
    }
  }

  // Validation warnings
  if (inputs.maxHeight > 2800) {
    warnings.push(
      "Decks above 2,800 mm above ground typically require additional engineering sign-off."
    );
  }
  if (inputs.minHeight > inputs.maxHeight) {
    warnings.push(
      "Min height is greater than max height — please double-check the values."
    );
  }
  if (system === "spanmor" && inputs.maxHeight > 250 && inputs.maxHeight <= 1000) {
    // 40×50 beam only valid for <250mm, exclude it
  }
  if (
    inputs.shape === "l-shape" &&
    (inputs.cutLength >= inputs.length || inputs.cutWidth >= inputs.width)
  ) {
    warnings.push(
      "Cutout dimensions must be smaller than the overall deck dimensions."
    );
  }
  if (inputs.shape === "u-shape") {
    if (inputs.cutLength + inputs.cut2Length >= inputs.length) {
      warnings.push(
        "The two cutout lengths together must be less than the total deck length."
      );
    }
    if (inputs.cutWidth >= inputs.width || inputs.cut2Width >= inputs.width) {
      warnings.push(
        "Cutout widths must be smaller than the overall deck width."
      );
    }
  }
  if (joistCentres !== DEFAULT_JOIST_CENTRES) {
    warnings.push(
      `Custom joist centres (${joistCentres} mm) applied. Confirm suitability with your decking board supplier.`
    );
  }

  // Build all valid options
  interface CandidateOption {
    beam: BeamSpanTable;
    rows: number;
    maxBearerSpan: number;
    totalCost: number;
  }

  const candidates: CandidateOption[] = [];

  for (const beam of profiles) {
    // Skip 40×50 for decks >250mm above ground
    if (beam.id === "spanmor_40" && inputs.maxHeight > 250) continue;

    const result = getRequiredBearerRows(beam, inputs.width, inputs.length, load, inputs);
    if (!result) continue;

    // Build a temporary option to get the cost
    const option = buildOption("temp", inputs, beam, result.rows, result.maxBearerSpan);
    candidates.push({
      beam,
      rows: result.rows,
      maxBearerSpan: result.maxBearerSpan,
      totalCost: option.totalCost,
    });
  }

  // Sort by total cost (cheapest first)
  candidates.sort((a, b) => a.totalCost - b.totalCost);

  if (candidates.length === 0) {
    warnings.push(
      `No valid framing option found for ${inputs.width} mm joist span at ${load} kPa. Engineering review required.`
    );
    // Fallback to largest profile with maximum splits
    const fallbackBeam = profiles[profiles.length - 1];
    const fallbackOption = buildOption("A", inputs, fallbackBeam, 3, 2000);
    return {
      inputs,
      optionA: fallbackOption,
      optionB: fallbackOption,
      selectedOption: "A",
      loadCondition: load,
      warnings,
    };
  }

  // Option A = cheapest valid option (auto-selected)
  const cheapest = candidates[0];
  const optionA = buildOption("A", inputs, cheapest.beam, cheapest.rows, cheapest.maxBearerSpan);

  // Option B = next cheapest with a different profile (for comparison)
  let optionB: OptionResult;
  const alternative = candidates.find(c => c.beam.id !== cheapest.beam.id);
  if (alternative) {
    optionB = buildOption("B", inputs, alternative.beam, alternative.rows, alternative.maxBearerSpan);
  } else {
    // Only one valid profile — show same as both
    optionB = buildOption("B", inputs, cheapest.beam, cheapest.rows, cheapest.maxBearerSpan);
  }

  return {
    inputs,
    optionA,
    optionB,
    selectedOption: "A",
    loadCondition: load,
    warnings,
  };
}

/** Format a number with locale grouping (e.g. 5,000) */
export function formatMM(n: number): string {
  return new Intl.NumberFormat("en-AU").format(Math.round(n));
}

/** Format currency AUD */
export function formatAUD(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Compute the true deck area (m²) from SubfloorInputs, accounting for shape cutouts.
 */
export function computeDesignArea(inputs: SubfloorInputs): number {
  const { length, width, shape, cutLength, cutWidth, cut2Length, cut2Width } = inputs;
  const fullArea = length * width;
  let deduction = 0;
  if (shape === "l-shape") {
    deduction = cutLength * cutWidth;
  } else if (shape === "u-shape") {
    deduction = cutLength * cutWidth + cut2Length * cut2Width;
  }
  return round2((fullArea - deduction) / 1_000_000);
}

/**
 * Compute the outer perimeter (m) from SubfloorInputs.
 */
export function computeDesignPerimeter(inputs: SubfloorInputs): number {
  const { length, width } = inputs;
  return round2(2 * (length + width) / 1000);
}

/** Export span table data for external use (e.g., admin display) */
export function getAvailableProfiles(system: FramingSystem): Array<{ id: string; label: string; depth: number }> {
  return getProfiles(system).map(p => ({ id: p.id, label: p.label, depth: p.depth }));
}
