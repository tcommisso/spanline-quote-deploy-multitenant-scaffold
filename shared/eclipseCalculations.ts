// Eclipse Opening Roof System - Calculation Engine
// Replicates all formulas from the Excel workbook
// Now accepts customizable prices via the PricingData parameter.

// ============================================================
// DATA REFERENCE TABLES
// ============================================================

export const BLADE_SIZES = [2400, 2700, 3000, 3300, 3600, 3900, 4200];
export const BEAM_SIZES = [4000, 5800, 6500];
export const BLADE_CUTS = [1, 2, 3];

export const COLOURBOND_COLOURS = [
  "Basalt", "Bluegum", "Classic Cream", "Cottage Green", "Deep Ocean",
  "Dover White", "Dune", "Evening Haze", "Gully", "Ironstone",
  "Jasper", "Mangrove", "Manor Red", "Monument", "Night Sky",
  "Pale Eucalypt", "Paperbark", "Shale Grey", "Surfmist", "Wallaby",
  "Windspray", "Woodland Grey"
];

// ============================================================
// PRICING DATA INTERFACE (passed in from pricingStore)
// ============================================================

export interface PricingData {
  louvreWhite: Record<number, number>;
  louvrePC: Record<number, number>;
  trackWhite: number;
  trackPC: number;
  trackPCPremium: number;
  lockAngleWhite: number;
  lockAnglePC: number;
  lockAnglePCPremium: number;
  gutterColour: number;
  gutterStrap: number;
  motorCoverWhite: number;
  motorCoverPC: number;
  motorCoverPCPremium: number;
  beam200_65White: number;
  beam200_65PC: number;
  beam200PCPremium: number;
  beam250_65White: number;
  beam250_65PC: number;
  beam250PCPremium: number;
  postHalf: number;
  postPCPremium: number;
  motorAssembly: number;
  controlKitLights: number;
  controlKitNoLights: number;
  pileInsert: number;
  controlPin: number;
  motorPin: number;
  freeEndPin: number;
  remoteHandset: number;
  rainSensorAssembly: number;
  rainSensorChip: number;
  internalBrackets: number;
  postToBeam: number;
  downpipe: number;
  consumables: number;
  electrician: number;
  ledLightPer: number;
  flashings: number;
  freight: number;
  offsetBlockRatePerMetre: number;
  labourPerDay: number;
  defaultDiscount: number;
  // Bracket pricing
  fasciaBracketPrice: number;
  extendaBracketPrice: number;
  gableBracketPrice: number;
  bracketCover1to5m: number;
  bracketCover6to10m: number;
  bracketCover11to15m: number;
  bracketCover16to20m: number;
}

// ============================================================
// TYPES
// ============================================================

export interface UnitInput {
  bladeWidth: number;   // mm
  length: number;       // mm
  height: number;       // mm
  posts: number;
  noOfLights: number;
  mountType: "Freestanding" | "Fascia";
  rainSensor: boolean;
  remote: boolean;
  electrical: boolean;
  downpipe: number;
  flashing: boolean;
  bladeColour: "White" | "Powder Coated";
  structureColour: "White" | "Powder Coated";
  colourbondBladeColour: string;
  colourbondStructureColour: string;
  installationDays: number;
  notes: string;
  fallDirection: string;
  houseWalls: string;
  bladeDirection: string; // "along-width" or "along-length"
  motorPosition: string; // "A-B", "B-C", "C-D", or "D-A" — edge where motor is located
  // Raked/angled roof support
  isRaked: boolean;
  rakedShortLength: number; // mm - length of the short side (free-end pin side)
  rakedWidth: number; // mm - horizontal distance the rake spans (raking width)
  rakedEdge: string; // "A-B", "B-C", "C-D", or "D-A" — which edge is the tapered free-end
  // Attachment & Brackets (per-unit)
  attachmentMethod: string; // "None", "Fascia brackets", "Gable brackets", "popup brackets", "wall brackets"
  fasciaBrackets: number;
  extendaBrackets: number;
  gableBracketsQty: number;
  bracketCover: string; // "1 to 5m", "6 to 10m", "11 to 15m", "16 to 20m", "Other", ""
  // New bracket types
  oversizedDGutter?: number;
  popupBrackets?: number;
  wallFixingBeam?: number;
  wallFixingBracket?: number;
}

const LEGACY_SIDE_ATTACHMENT_METHODS = ["1 Side", "2 Side", "3 Side", "4 Side"];
const ACTIVE_ATTACHMENT_METHODS = [
  "Fascia brackets",
  "Gable brackets",
  "popup brackets",
  "wall brackets",
  ...LEGACY_SIDE_ATTACHMENT_METHODS,
];

function isActiveAttachmentMethod(method?: string) {
  return !!method && method !== "None" && ACTIVE_ATTACHMENT_METHODS.includes(method);
}

function totalAttachmentBrackets(unit: UnitInput) {
  return (
    (unit.fasciaBrackets || 0) +
    (unit.extendaBrackets || 0) +
    (unit.gableBracketsQty || 0) +
    (unit.popupBrackets || 0) +
    (unit.wallFixingBeam || 0) +
    (unit.wallFixingBracket || 0)
  );
}

export interface TakeOffs {
  bladeWidthMM: number;
  beamSide1: number;
  beamSide2: number;
  bladeMechanism: number;
  bulkHead: number;
  beamSizeBlade: number;
  beamSizeConnection: number;
  bladeMinSize: number;
  bladeOrderSize: number;
  bladeCuts: number;
  noOfBlades: number;
  bladesToOrder: number;
  tracks55: number;
  lockingAngle55: number;
  gutter60: number;
  totalGutterBeamLength: number;
  sqm: number;
}

export interface MaterialLine {
  code: string;
  description: string;
  qty: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface RakedBladeInfo {
  bladeIndex: number;       // 0-based from motor side
  lengthMM: number;         // individual blade length in mm
  offsetBlockHeightMM: number; // height of offset block for this blade (0 for motor-side blades)
}

export interface RakedRoofData {
  isRaked: true;
  longSideLengthMM: number;   // motor side (straight beam) length
  shortSideLengthMM: number;  // free-end pin side length
  rakingWidthMM: number;      // horizontal distance the rake spans
  rakeAngleDeg: number;       // angle of the free-end beam from perpendicular
  blades: RakedBladeInfo[];   // per-blade lengths from motor side to free end
  totalOffsetBlockLengthMM: number; // total linear material needed for offset blocks
  offsetBlockCount: number;   // number of offset blocks needed
  maxOffsetHeightMM: number;  // tallest offset block height
}

export interface UnitResult {
  takeOffs: TakeOffs;
  materials: MaterialLine[];
  materialCost: number;
  labourCost: number;
  marginAmount: number;
  sellPriceExGST: number;
  gst: number;
  rrpIncGST: number;
  rrpPerSqm: number;
  commission: number;
  netProfit: number;
  rakedData?: RakedRoofData;
}

export interface AdditionalCosts {
  footings: number;           // Calculated: posts × footingRate
  footingRate: number;        // $ per post (user-editable, default 0)
  attachmentToHouse: number;  // Lump sum
  travel: number;             // Lump sum
  siteClean: number;          // Lump sum
  demolition: number;         // Lump sum
  plumbing: number;           // Lump sum
  approvals: number;          // Lump sum
  concrete: number;           // Lump sum
  gableBrackets: number;      // Lump sum
  electrical: number;         // Lump sum
  councilFees: number;        // From pricing settings council_fee master data
  homeWarranty: number;       // From pricing settings home_warranty master data
  other: number;              // Lump sum (catch-all)
  otherDescription: string;   // Description for "other" line item
}

export function defaultAdditionalCosts(): AdditionalCosts {
  return {
    footings: 0,
    footingRate: 0,
    attachmentToHouse: 0,
    travel: 0,
    siteClean: 0,
    demolition: 0,
    plumbing: 0,
    approvals: 0,
    concrete: 0,
    gableBrackets: 0,
    electrical: 0,
    councilFees: 0,
    homeWarranty: 0,
    other: 0,
    otherDescription: "",
  };
}

/**
 * Calculate footings cost from total post count across all units × rate per post.
 */
export function calculateFootingsCost(totalPosts: number, footingRate: number): number {
  return totalPosts * footingRate;
}

export function totalAdditionalCosts(costs: AdditionalCosts): number {
  return (
    costs.footings +
    costs.attachmentToHouse +
    costs.travel +
    costs.siteClean +
    costs.demolition +
    costs.plumbing +
    costs.approvals +
    costs.concrete +
    costs.gableBrackets +
    costs.electrical +
    costs.councilFees +
    costs.homeWarranty +
    costs.other
  );
}

/** Convert AdditionalCosts to an array of {name, amount} for PDF/display */
export function additionalCostsToArray(costs: AdditionalCosts): { name: string; amount: number }[] {
  const items: { name: string; amount: number }[] = [];
  if (costs.footings > 0) items.push({ name: "Footings", amount: costs.footings });
  if (costs.attachmentToHouse > 0) items.push({ name: "Attachment to House", amount: costs.attachmentToHouse });
  if (costs.travel > 0) items.push({ name: "Travel", amount: costs.travel });
  if (costs.siteClean > 0) items.push({ name: "Site Clean", amount: costs.siteClean });
  if (costs.demolition > 0) items.push({ name: "Demolition", amount: costs.demolition });
  if (costs.plumbing > 0) items.push({ name: "Plumbing", amount: costs.plumbing });
  if (costs.approvals > 0) items.push({ name: "Approvals", amount: costs.approvals });
  if (costs.concrete > 0) items.push({ name: "Concrete", amount: costs.concrete });
  if (costs.gableBrackets > 0) items.push({ name: "Gable Brackets", amount: costs.gableBrackets });
  if (costs.electrical > 0) items.push({ name: "Electrical", amount: costs.electrical });
  if (costs.councilFees > 0) items.push({ name: "Council Fees", amount: costs.councilFees });
  if (costs.homeWarranty > 0) items.push({ name: "Home Warranty", amount: costs.homeWarranty });
  if (costs.other > 0) items.push({ name: costs.otherDescription || "Other", amount: costs.other });
  return items;
}

export interface ProjectResult {
  units: (UnitResult | null)[];
  totalSellPriceEx: number;
  totalGST: number;
  totalRRPInc: number;
  totalSqm: number;
  rrpPerSqm: number;
}

// ============================================================
// ENGINEERING VALIDATION
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export const ECLIPSE_LIMITS = {
  bladeWidth: { min: 1500, max: 4200, unit: "mm" },
  length: { min: 1500, max: 6500, unit: "mm" },
  height: { min: 2100, max: 3600, unit: "mm" },
  posts: { min: 0, max: 12 },
} as const;

export function validateUnit(unit: UnitInput, unitIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const label = `Unit ${unitIndex + 1}`;

  // Blade Width validation
  if (unit.bladeWidth > 0 && unit.bladeWidth < ECLIPSE_LIMITS.bladeWidth.min) {
    errors.push({ field: "bladeWidth", message: `${label}: Blade width ${unit.bladeWidth}mm is below minimum ${ECLIPSE_LIMITS.bladeWidth.min}mm`, severity: "error" });
  }
  if (unit.bladeWidth > ECLIPSE_LIMITS.bladeWidth.max) {
    errors.push({ field: "bladeWidth", message: `${label}: Blade width ${unit.bladeWidth}mm exceeds maximum ${ECLIPSE_LIMITS.bladeWidth.max}mm`, severity: "error" });
  }

  // Length validation
  if (unit.length > 0 && unit.length < ECLIPSE_LIMITS.length.min) {
    errors.push({ field: "length", message: `${label}: Length ${unit.length}mm is below minimum ${ECLIPSE_LIMITS.length.min}mm`, severity: "error" });
  }
  if (unit.length > ECLIPSE_LIMITS.length.max) {
    errors.push({ field: "length", message: `${label}: Length ${unit.length}mm exceeds maximum ${ECLIPSE_LIMITS.length.max}mm`, severity: "error" });
  }

  // Height validation
  if (unit.height > 0 && unit.height < ECLIPSE_LIMITS.height.min) {
    errors.push({ field: "height", message: `${label}: Height ${unit.height}mm is below minimum ${ECLIPSE_LIMITS.height.min}mm`, severity: "warning" });
  }
  if (unit.height > ECLIPSE_LIMITS.height.max) {
    errors.push({ field: "height", message: `${label}: Height ${unit.height}mm exceeds maximum ${ECLIPSE_LIMITS.height.max}mm`, severity: "warning" });
  }

  // Posts validation
  if (unit.posts > 0 && unit.posts < ECLIPSE_LIMITS.posts.min) {
    errors.push({ field: "posts", message: `${label}: Minimum ${ECLIPSE_LIMITS.posts.min} posts required`, severity: "error" });
  }
  if (unit.posts > ECLIPSE_LIMITS.posts.max) {
    errors.push({ field: "posts", message: `${label}: Maximum ${ECLIPSE_LIMITS.posts.max} posts exceeded`, severity: "warning" });
  }

  // Blade width must be a standard size or within tolerance
  if (unit.bladeWidth > 0) {
    const effectiveBlade = unit.bladeWidth - 50 - 50 - 65; // minus beam margins
    const matchedSize = BLADE_SIZES.find(s => s >= effectiveBlade);
    if (!matchedSize && effectiveBlade > BLADE_SIZES[BLADE_SIZES.length - 1]) {
      errors.push({ field: "bladeWidth", message: `${label}: Blade width results in blade size exceeding max available (4200mm)`, severity: "error" });
    }
  }

  // Length vs beam size check
  if (unit.length > 0) {
    const maxBeam = BEAM_SIZES[BEAM_SIZES.length - 1]; // 6500
    if (unit.length > maxBeam) {
      errors.push({ field: "length", message: `${label}: Length ${unit.length}mm exceeds maximum beam size ${maxBeam}mm`, severity: "error" });
    }
  }

  // Wall fixing bracket validation
  if ((unit.wallFixingBeam || 0) > 0 || (unit.wallFixingBracket || 0) > 0) {
    const wallMethods = ["wall brackets", ...LEGACY_SIDE_ATTACHMENT_METHODS];
    if (!unit.attachmentMethod || !wallMethods.includes(unit.attachmentMethod)) {
      errors.push({ field: "wallFixingBracket", message: `${label}: Wall fixing brackets/beams selected but attachment method is not wall-mounted (${unit.attachmentMethod || "None"})`, severity: "warning" });
    }
  }

  // Reciprocal: wall-mounted but no brackets specified
  if (isActiveAttachmentMethod(unit.attachmentMethod)) {
    const totalBrackets = totalAttachmentBrackets(unit);
    if (totalBrackets === 0) {
      errors.push({ field: "fasciaBrackets", message: `${label}: Attachment method is ${unit.attachmentMethod} but no bracket quantity is specified`, severity: "warning" });
    }
  }

  // Freestanding minimum posts validation
  if (unit.mountType === "Freestanding" && unit.posts < 4) {
    errors.push({ field: "posts", message: `${label}: Freestanding mount requires minimum 4 posts for structural stability (currently ${unit.posts || 0})`, severity: "warning" });
  }

  // Bracket quantity suggestion based on beam span (1 per 1200mm)
  if (unit.length > 0 && isActiveAttachmentMethod(unit.attachmentMethod)) {
    const recommendedQty = Math.ceil(unit.length / 1200);
    const totalAttachBrackets = totalAttachmentBrackets(unit);
    if (totalAttachBrackets < recommendedQty) {
      errors.push({ field: "fasciaBrackets", message: `${label}: Total attachment brackets (${totalAttachBrackets}) may be insufficient for ${unit.length}mm span — recommend at least ${recommendedQty} (1 per 1200mm)`, severity: "warning" });
    }
  }

  // Extenda bracket suggestion: recommend extenda brackets when beam span exceeds 4000mm
  // (longer spans create more leverage on fascia connections, extenda distributes load better)
  if (unit.length > 4000 && (unit.attachmentMethod === "Fascia brackets" || LEGACY_SIDE_ATTACHMENT_METHODS.includes(unit.attachmentMethod))) {
    const extendaCount = unit.extendaBrackets || 0;
    if (extendaCount === 0 && (unit.fasciaBrackets || 0) > 0) {
      errors.push({ field: "extendaBrackets", message: `${label}: Beam span ${unit.length}mm exceeds 4000mm — consider extenda brackets for improved load distribution on fascia connections`, severity: "warning" });
    }
  }

  // Raked roof validation
  if (unit.isRaked) {
    if (unit.rakedShortLength < 0) {
      errors.push({ field: "rakedShortLength", message: `${label}: Raked roof short-side length cannot be negative`, severity: "error" });
    }
    if (unit.rakedShortLength >= unit.length) {
      errors.push({ field: "rakedShortLength", message: `${label}: Short-side length must be less than the long-side length`, severity: "error" });
    }
    if (unit.rakedShortLength > 0 && unit.rakedShortLength < ECLIPSE_LIMITS.length.min) {
      errors.push({ field: "rakedShortLength", message: `${label}: Short-side length ${unit.rakedShortLength}mm is below minimum ${ECLIPSE_LIMITS.length.min}mm`, severity: "warning" });
    }
  }

  return errors;
}

export function validateAllUnits(units: UnitInput[]): ValidationError[] {
  return units.flatMap((unit, i) => validateUnit(unit, i));
}

// ============================================================
// TAKE-OFF CALCULATIONS
// ============================================================

function xlookupBladeSize(bladeMinSize: number): number {
  for (const size of BLADE_SIZES) {
    if (size >= bladeMinSize) return size;
  }
  return BLADE_SIZES[BLADE_SIZES.length - 1];
}

/**
 * Calculate raked roof blade lengths and offset block data.
 * Motor side is the straight beam (long side = unit.length).
 * Free-end pin side is the angled beam (short side = rakedShortLength).
 * Blades are spaced at 150mm intervals along the width (bladeWidth).
 * Each blade's length varies linearly from longSide to shortSide.
 * Offset blocks are needed on blades shorter than the longest blade to keep
 * the louvre attachment square and correctly spaced.
 */
export function calculateRakedRoofData(unit: UnitInput): RakedRoofData | undefined {
  if (!unit.isRaked || unit.rakedShortLength < 0 || unit.length <= 0 || unit.bladeWidth <= 0) {
    return undefined;
  }

  const longSide = unit.length;  // motor side (straight beam)
  const shortSide = unit.rakedShortLength; // free-end pin side
  const bladeSpacing = 150; // mm between blade centres
  const beamMarginStart = 50; // E - margin from motor beam
  const beamMarginEnd = 50;   // F - margin from free-end beam

  // Number of blades across the width
  // Use rakedWidth if provided, otherwise fall back to bladeWidth
  const effectiveWidth = unit.rakedWidth > 0 ? unit.rakedWidth : unit.bladeWidth;
  const usableWidth = effectiveWidth - beamMarginStart - beamMarginEnd;
  const numBlades = usableWidth > 0 ? Math.floor(usableWidth / bladeSpacing) : 0;

  if (numBlades <= 0) {
    return undefined;
  }

  // Calculate the rake angle (angle of free-end beam from perpendicular)
  const lengthDifference = longSide - shortSide;
  const rakeAngleRad = Math.atan(lengthDifference / usableWidth);
  const rakeAngleDeg = rakeAngleRad * (180 / Math.PI);
  const rakingWidthMM = effectiveWidth;

  // Calculate per-blade lengths (linear interpolation from motor side to free end)
  // Blade 0 is at the motor side (longest), last blade is at free-end side (shortest)
  const blades: RakedBladeInfo[] = [];
  const offsetBlockWidth = 80; // mm per offset block

  for (let i = 0; i < numBlades; i++) {
    // Position ratio: 0 = motor side, 1 = free-end side
    const ratio = numBlades > 1 ? i / (numBlades - 1) : 0;
    const bladeLength = Math.round(longSide - (lengthDifference * ratio));
    // Offset block height = difference between this blade and the longest blade
    // The motor-side blade (longest) has no offset block
    const offsetBlockHeight = Math.round(lengthDifference * ratio);

    blades.push({
      bladeIndex: i,
      lengthMM: bladeLength,
      offsetBlockHeightMM: offsetBlockHeight,
    });
  }

  // Offset blocks are needed for all blades except the first (motor-side)
  const offsetBlockCount = blades.filter(b => b.offsetBlockHeightMM > 0).length;
  const maxOffsetHeight = lengthDifference;

  // Total offset block material: sum of all offset block heights × width (80mm each)
  // Manufactured as one long folded piece, total length = sum of all heights
  const totalOffsetBlockLengthMM = blades.reduce((sum, b) => sum + b.offsetBlockHeightMM, 0);

  return {
    isRaked: true,
    longSideLengthMM: longSide,
    shortSideLengthMM: shortSide,
    rakingWidthMM,
    rakeAngleDeg: Math.round(rakeAngleDeg * 10) / 10,
    blades,
    totalOffsetBlockLengthMM,
    offsetBlockCount,
    maxOffsetHeightMM: maxOffsetHeight,
  };
}

export function calculateTakeOffs(bladeWidth: number, length: number): TakeOffs {
  const D = 150;
  const E = 50;
  const F = 50;
  const G = 65;

  const M = bladeWidth;
  const N = length;

  const bulkHead = M > 4200 ? 4200 - M : 0;
  const O = M - E - F - G;

  const P = O > 0 ? xlookupBladeSize(O) : 2400;
  const Q = 1;

  const R = N > 0 ? Math.floor((N - F - E) / D) : 0;
  const S = Q > 0 ? R / Q : 0;

  const T = N > 0 ? Math.ceil(((N / 1000) * 3) / 5.5) : 0;
  const U = N > 0 ? Math.ceil(((N / 1000) * 2) / 5.5) : 0;
  const V = M > 0 ? Math.ceil((((M - F - E) / 1000 * 2) + ((N - E - F) / 1000 * 2)) / 6) : 0;
  const W = M > 0 ? Math.ceil(((M - E - F) / 1000 + (N - E - F) / 1000) * 2) : 0;
  const X = M > 0 && N > 0 ? Math.ceil((M / 1000) * (N / 1000)) : 0;

  return {
    bladeWidthMM: D,
    beamSide1: E,
    beamSide2: F,
    bladeMechanism: G,
    bulkHead,
    beamSizeBlade: M,
    beamSizeConnection: N,
    bladeMinSize: O,
    bladeOrderSize: P,
    bladeCuts: Q,
    noOfBlades: R,
    bladesToOrder: S,
    tracks55: T,
    lockingAngle55: U,
    gutter60: V,
    totalGutterBeamLength: W,
    sqm: X,
  };
}

// ============================================================
// UNIT COST CALCULATION
// ============================================================

function calcLine(code: string, desc: string, qty: number, price: number, discount: number): MaterialLine {
  const total = qty * price * (1 - discount / 100);
  return { code, description: desc, qty, unitPrice: price, discount, total };
}

/**
 * Calculate bracket cost for a single unit based on per-unit bracket selections and admin pricing.
 */
export function calculateBracketCost(unit: UnitInput, pricing: PricingData): number {
  if (!unit.attachmentMethod || unit.attachmentMethod === "None") return 0;
  let total = 0;
  total += (unit.fasciaBrackets || 0) * (pricing.fasciaBracketPrice || 0);
  total += (unit.extendaBrackets || 0) * (pricing.extendaBracketPrice || 0);
  total += (unit.gableBracketsQty || 0) * (pricing.gableBracketPrice || 0);
  total += (unit.popupBrackets || 0) * (pricing.extendaBracketPrice || pricing.fasciaBracketPrice || 0);
  total += (unit.wallFixingBracket || 0) * (pricing.fasciaBracketPrice || 0);
  // Bracket cover
  if (unit.bracketCover) {
    switch (unit.bracketCover) {
      case "1 to 5m": total += pricing.bracketCover1to5m || 0; break;
      case "6 to 10m": total += pricing.bracketCover6to10m || 0; break;
      case "11 to 15m": total += pricing.bracketCover11to15m || 0; break;
      case "16 to 20m": total += pricing.bracketCover16to20m || 0; break;
    }
  }
  return total;
}

export function calculateUnit(
  unit: UnitInput,
  commissionRate: number,
  margin: number,
  P: PricingData
): UnitResult | null {
  if (unit.bladeWidth <= 0 || unit.length <= 0) {
    return null;
  }

  const takeOffs = calculateTakeOffs(unit.bladeWidth, unit.length);
  const rakedData = calculateRakedRoofData(unit);
  const materials: MaterialLine[] = [];
  const isPCBlade = unit.bladeColour === "Powder Coated";
  const isPCStructure = unit.structureColour === "Powder Coated";
  const hasLights = unit.noOfLights > 0;
  const bladeOrderSize = takeOffs.bladeOrderSize;
  const disc = P.defaultDiscount;

  // 1. Louvres
  const louvrePrice = isPCBlade
    ? (P.louvrePC[bladeOrderSize] || 139.1)
    : (P.louvreWhite[bladeOrderSize] || 139.1);
  const bladesToOrder = takeOffs.bladesToOrder;
  if (bladesToOrder > 0) {
    materials.push(calcLine("EL104202", `Louvre - Flat Face ${bladeOrderSize}mm${isPCBlade ? " PC" : " White"}`, bladesToOrder, louvrePrice, disc));
  }

  // 2. Powder Coating blade
  if (isPCBlade && bladesToOrder > 0) {
    const whitePrice = P.louvreWhite[bladeOrderSize] || 139.1;
    const pcPrice = P.louvrePC[bladeOrderSize] || 148.6;
    const pcPremium = whitePrice > 0 ? (pcPrice - whitePrice) / whitePrice : 0.068;
    const pcCost = louvrePrice * pcPremium;
    materials.push(calcLine("", "Powder Coating Blade", bladesToOrder, pcCost, disc));
  }

  // 3. Track
  if (takeOffs.tracks55 > 0) {
    const trackPrice = isPCStructure ? P.trackPC : P.trackWhite;
    materials.push(calcLine("EC2202", `Track 5.5m ${isPCStructure ? "PC" : "White"}`, takeOffs.tracks55, trackPrice, disc));
  }

  // 4. Powder Coating Track
  if (isPCStructure && takeOffs.tracks55 > 0) {
    materials.push(calcLine("", "Powder Coating Track", takeOffs.tracks55, P.trackWhite * P.trackPCPremium, disc));
  }

  // 5. Locking Angle
  if (takeOffs.lockingAngle55 > 0) {
    const laPrice = isPCStructure ? P.lockAnglePC : P.lockAngleWhite;
    materials.push(calcLine("EC2302", `Locking Angle 5.5m ${isPCStructure ? "PC" : "White"}`, takeOffs.lockingAngle55, laPrice, disc));
  }

  // 6. Powder Coating Locking Angle
  if (isPCStructure && takeOffs.lockingAngle55 > 0) {
    materials.push(calcLine("", "Powder Coating Locking Angle", takeOffs.lockingAngle55, P.lockAngleWhite * P.lockAnglePCPremium, disc));
  }

  // 7. Gutter
  if (takeOffs.gutter60 > 0) {
    materials.push(calcLine("EC146002", "Gutter 6.0m", takeOffs.gutter60, P.gutterColour, disc));
  }

  // 8. Gutter Strap/Joiner
  if (bladesToOrder > 0) {
    materials.push(calcLine("EC140102", "Gutter Strap Cnr/Joiner", 4, P.gutterStrap, disc));
  }

  // 9. Motor Cover / Flashing
  if (bladesToOrder > 0) {
    const mcPrice = isPCStructure ? P.motorCoverPC : P.motorCoverWhite;
    materials.push(calcLine("EC2409", `Motor Cover ${isPCStructure ? "PC" : "White"}`, 1, mcPrice, disc));
  }

  // 10. Powder Coating Motor Cover
  if (isPCStructure && bladesToOrder > 0) {
    materials.push(calcLine("", "Powder Coating Motor Cover", 1, P.motorCoverWhite * P.motorCoverPCPremium, disc));
  }

  // 11. Beams
  const useSmallBeam = unit.length <= 3500;
  if (takeOffs.totalGutterBeamLength > 0) {
    const beamQty = Math.ceil(takeOffs.totalGutterBeamLength / 6.5);
    if (useSmallBeam) {
      const beamPrice = isPCStructure ? P.beam200_65PC : P.beam200_65White;
      materials.push(calcLine("ECBA25075XX", `Beam 200x50 6.5m ${isPCStructure ? "PC" : "White"}`, beamQty, beamPrice, disc));
    } else {
      const beamPrice = isPCStructure ? P.beam250_65PC : P.beam250_65White;
      materials.push(calcLine("ECBA2004XX", `Beam 250x50 6.5m ${isPCStructure ? "PC" : "White"}`, beamQty, beamPrice, disc));
    }
  }

  // 12. Powder Coating Beams
  if (isPCStructure && takeOffs.totalGutterBeamLength > 0) {
    const beamQty = Math.ceil(takeOffs.totalGutterBeamLength / 6.5);
    const premium = useSmallBeam ? P.beam200PCPremium : P.beam250PCPremium;
    const basePrice = useSmallBeam ? P.beam200_65White : P.beam250_65White;
    materials.push(calcLine("", "Powder Coating Beams", beamQty > 0 ? 1 : 0, basePrice * premium, disc));
  }

  // 13. Posts
  if (unit.posts > 0) {
    materials.push(calcLine("ECPATPOS15XX", "Post 100x100 3.0mm", unit.posts, P.postHalf, disc));
  }

  // 14. Powder Coating Posts
  if (isPCStructure && unit.posts > 0) {
    materials.push(calcLine("", "Powder Coating Posts", unit.posts, P.postHalf * P.postPCPremium, disc));
  }

  // 15. Motor Assembly
  if (bladesToOrder > 0) {
    materials.push(calcLine("EC2400", "Linear Actuator Motor 24VDC", 1, P.motorAssembly, disc));
  }

  // 16. Control Kit
  if (bladesToOrder > 0) {
    if (hasLights) {
      materials.push(calcLine("EC2412L", "Control Kit with Lights", 1, P.controlKitLights, disc));
    } else {
      materials.push(calcLine("EC2412", "Control Kit no Lights", 1, P.controlKitNoLights, disc));
    }
  }

  // 17. Pile Insert
  if (bladesToOrder > 0) {
    const pileQty = Math.ceil(bladesToOrder * ((bladeOrderSize / 1000) / 50));
    materials.push(calcLine("EC1104F", "Louvre Pile Insert", pileQty > 0 ? pileQty : 1, P.pileInsert, disc));
  }

  // 18. Control Pin
  if (bladesToOrder > 0) {
    materials.push(calcLine("EC0110", "Pin - Control Alum", bladesToOrder, P.controlPin, disc));
  }

  // 19. Motor Pivot Pin
  if (bladesToOrder > 0) {
    materials.push(calcLine("EC0120", "Pin - Motor End Pivot SS", bladesToOrder, P.motorPin, disc));
  }

  // 20. Free End Pin
  if (bladesToOrder > 0) {
    materials.push(calcLine("EC0130", "Pin - Free End Alum", bladesToOrder, P.freeEndPin, disc));
  }

  // 21. Remote Handset
  if (unit.remote) {
    materials.push(calcLine("EC2421", "Remote Handset", 1, P.remoteHandset, disc));
  }

  // 22. Rain Sensor Assembly
  if (unit.rainSensor) {
    materials.push(calcLine("EC1028M", "Rain Sensor Assembly", 1, P.rainSensorAssembly, disc));
  }

  // 23. Rain Sensor Chip
  if (unit.rainSensor) {
    materials.push(calcLine("EC1028C", "Rain Sensor Chip", 1, P.rainSensorChip, disc));
  }

  // 24. Internal Brackets
  if (unit.posts > 0) {
    materials.push(calcLine("EC0924", "Internal Brackets", unit.posts, P.internalBrackets, 0));
  }

  // 25. Post to Beam
  if (unit.posts > 0) {
    materials.push(calcLine("EC0923", "Post to Beam Connector", unit.posts, P.postToBeam, 0));
  }

  // 26. Downpipes
  if (unit.downpipe > 0) {
    materials.push(calcLine("", "Downpipes", unit.downpipe, P.downpipe, 0));
  }

  // 27. Consumables
  if (bladesToOrder > 0) {
    materials.push(calcLine("", "Consumables", 1, P.consumables, 0));
  }

  // 28. Electrician
  if (unit.electrical) {
    materials.push(calcLine("", "Electrician", 1, P.electrician, 0));
  }

  // 29. LED Lights
  if (hasLights) {
    materials.push(calcLine("EC2459", "LED Lights", unit.noOfLights, P.ledLightPer, 0));
  }

  // 30. Flashings
  if (unit.flashing) {
    const flashQty = Math.ceil(unit.bladeWidth / 1000);
    materials.push(calcLine("", "Flashings", flashQty, P.flashings, 0));
  }

  // 31. Freight
  if (bladesToOrder > 0) {
    materials.push(calcLine("", "Freight", 1, P.freight, 0));
  }

  // 32. Offset Blocks (Raked Roof)
  if (rakedData && rakedData.offsetBlockCount > 0) {
    // Offset blocks manufactured from 2-3mm aluminium plate, folded as one long piece
    // Cost estimate: material length in metres × rate per metre
    const offsetLengthM = rakedData.totalOffsetBlockLengthMM / 1000;
    const offsetBlockRate = P.offsetBlockRatePerMetre; // $ per linear metre (aluminium plate + folding + PC)
    const offsetCost = offsetLengthM * offsetBlockRate;
    materials.push(calcLine("", `Offset Blocks - Raked (${rakedData.offsetBlockCount} pcs, ${Math.round(offsetLengthM * 10) / 10}m total)`, 1, offsetCost, 0));
  }

  // 33. Attachment & Brackets
  const bracketCost = calculateBracketCost(unit, P);
  if (bracketCost > 0) {
    materials.push(calcLine("", "Attachment & Brackets", 1, bracketCost, 0));
  }

  // Calculate totals
  const materialCost = materials.reduce((sum, m) => sum + m.total, 0);
  const labourCost = unit.installationDays * P.labourPerDay;
  const totalCost = materialCost + labourCost;
  const marginAmount = margin > 0 ? (totalCost / (1 - margin)) - totalCost : 0;
  const sellPriceExGST = totalCost + marginAmount;
  const gst = sellPriceExGST * 0.1;
  const rrpIncGST = sellPriceExGST * 1.1;
  const sqm = (unit.bladeWidth / 1000) * (unit.length / 1000);
  const rrpPerSqm = sqm > 0 ? rrpIncGST / sqm : 0;
  const commissionAmount = sellPriceExGST * commissionRate;
  const netProfit = marginAmount - commissionAmount;

  return {
    takeOffs,
    materials,
    materialCost,
    labourCost,
    marginAmount,
    sellPriceExGST,
    gst,
    rrpIncGST,
    rrpPerSqm,
    commission: commissionAmount,
    netProfit,
    rakedData,
  };
}

// ============================================================
// PROJECT-LEVEL CALCULATION
// ============================================================

export function calculateProject(
  units: UnitInput[],
  commissionRate: number,
  margin: number,
  pricing: PricingData
): ProjectResult {
  const results = units.map((u) => calculateUnit(u, commissionRate, margin, pricing));

  const totalSellPriceEx = results.reduce((s, r) => s + (r?.sellPriceExGST || 0), 0);
  const totalGST = results.reduce((s, r) => s + (r?.gst || 0), 0);
  const totalRRPInc = results.reduce((s, r) => s + (r?.rrpIncGST || 0), 0);
  const totalSqm = units.reduce((s, u) => s + (u.bladeWidth / 1000) * (u.length / 1000), 0);
  const rrpPerSqm = totalSqm > 0 ? totalRRPInc / totalSqm : 0;

  return {
    units: results,
    totalSellPriceEx,
    totalGST,
    totalRRPInc,
    totalSqm,
    rrpPerSqm,
  };
}

// ============================================================
// SHARED-POST DEDUCTION (Adjoining Units)
// ============================================================

/**
 * Represents a positioned unit for adjacency detection.
 * Matches the UnitPosition type from EclipseSiteLayout.
 */
export interface PositionedUnit {
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

/**
 * Detect shared edges between positioned units and calculate post deductions.
 * When two units share a common boundary (within tolerance), posts on that
 * shared edge can be eliminated (shared beam replaces two separate posts).
 *
 * Returns an array of per-unit post deductions (number of posts to subtract).
 */
export function calculateSharedPostDeductions(
  units: { bladeWidth: number; length: number }[],
  positions: PositionedUnit[],
  tolerance: number = 200 // mm tolerance for edge alignment
): number[] {
  if (units.length < 2 || positions.length < units.length) {
    return units.map(() => 0);
  }

  const deductions = units.map(() => 0);

  // Get the bounding box edges for each unit based on position and rotation
  function getEdges(i: number) {
    const u = units[i];
    const p = positions[i];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? u.length : u.bladeWidth;
    const h = isRotated ? u.bladeWidth : u.length;
    return {
      left: p.x,
      right: p.x + w,
      top: p.y,
      bottom: p.y + h,
      width: w,
      height: h,
    };
  }

  // Check each pair of units for shared edges
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = getEdges(i);
      const b = getEdges(j);

      // Check if unit j's left edge aligns with unit i's right edge (side-by-side)
      const rightLeftGap = Math.abs(a.right - b.left);
      const leftRightGap = Math.abs(b.right - a.left);
      const bottomTopGap = Math.abs(a.bottom - b.top);
      const topBottomGap = Math.abs(b.bottom - a.top);

      // Vertical overlap (for side-by-side adjacency)
      const vertOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // Horizontal overlap (for stacked adjacency)
      const horizOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);

      let sharedEdge = false;

      if (rightLeftGap <= tolerance && vertOverlap > tolerance) {
        sharedEdge = true; // i's right edge meets j's left edge
      } else if (leftRightGap <= tolerance && vertOverlap > tolerance) {
        sharedEdge = true; // j's right edge meets i's left edge
      } else if (bottomTopGap <= tolerance && horizOverlap > tolerance) {
        sharedEdge = true; // i's bottom edge meets j's top edge
      } else if (topBottomGap <= tolerance && horizOverlap > tolerance) {
        sharedEdge = true; // j's bottom edge meets i's top edge
      }

      if (sharedEdge) {
        // Each shared edge eliminates 1 post from each unit (shared beam)
        deductions[i] += 1;
        deductions[j] += 1;
      }
    }
  }

  return deductions;
}

/**
 * Calculate project with optional shared-post deduction.
 * When siteLayout positions are provided, detects adjoining units and
 * reduces post counts on shared boundaries before pricing.
 */
export function calculateProjectWithLayout(
  units: UnitInput[],
  commissionRate: number,
  margin: number,
  pricing: PricingData,
  positions?: PositionedUnit[]
): ProjectResult & { sharedPostDeductions?: number[] } {
  if (!positions || positions.length < units.length || units.length < 2) {
    // No layout data or single unit — use standard calculation
    return calculateProject(units, commissionRate, margin, pricing);
  }

  const deductions = calculateSharedPostDeductions(units, positions);
  const hasDeductions = deductions.some(d => d > 0);

  if (!hasDeductions) {
    return calculateProject(units, commissionRate, margin, pricing);
  }

  // Apply deductions: reduce posts for each unit, recalculate
  const adjustedUnits = units.map((u, i) => ({
    ...u,
    posts: Math.max(0, u.posts - deductions[i]),
  }));

  const result = calculateProject(adjustedUnits, commissionRate, margin, pricing);
  return { ...result, sharedPostDeductions: deductions };
}

// ============================================================
// DEFAULT UNIT
// ============================================================

export function defaultUnit(): UnitInput {
  return {
    bladeWidth: 0,
    length: 0,
    height: 0,
    posts: 0,
    noOfLights: 0,
    mountType: "Freestanding",
    rainSensor: false,
    remote: false,
    electrical: false,
    downpipe: 0,
    flashing: false,
    bladeColour: "White",
    structureColour: "White",
    colourbondBladeColour: "Monument",
    colourbondStructureColour: "Monument",
    installationDays: 2,
    notes: "",
    fallDirection: "",
    houseWalls: "",
    bladeDirection: "along-width",
    motorPosition: "A-B",
    isRaked: false,
    rakedShortLength: 0,
    rakedWidth: 0,
    rakedEdge: "C-D",
    // Attachment & Brackets
    attachmentMethod: "None",
    fasciaBrackets: 0,
    extendaBrackets: 0,
    gableBracketsQty: 0,
    bracketCover: "",
  };
}
