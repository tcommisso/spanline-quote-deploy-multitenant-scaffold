/**
 * Deck Pricing Calculation Engine
 * Replicates the formula chain from the original deck quoting tool.
 *
 * Stock-based costing model:
 * - Boards: when engineeringBoardCost is provided, uses totalStockBoards × stockLength × pricePerLm
 *   (waste is inherent in stock purchase — no separate waste line)
 * - Framing: when engineeringFramingCost is provided, uses stock-based cost from cutting optimiser
 *   (includes joists, bearers, AND posts)
 * - Legacy fallback: area × rate + waste% for boards, spacing-based for framing
 */

export interface DeckCalcInput {
  // Dimensions
  deckWidthM: number;
  deckProjectionM: number;
  /** Optional design-derived area (m²) — overrides rectangular width×projection when provided */
  areaM2Override?: number;
  /** Optional design-derived perimeter (m) — overrides 2×(width+projection) when provided */
  perimeterMOverride?: number;

  // Product pricing (per board)
  deckingRatePerM2: number; // rate per board (field named for DB compat, semantically per-board)
  clipFixingCostPerM2: number; // clip/fixing cost per board (field named for DB compat)
  wastePercent: number; // e.g. 0.10 for 10% (legacy fallback only)

  // Engineering BOM override for boards (stock-based)
  // When provided, overrides area × rate + waste calculation
  engineeringBoardCost?: number; // totalStockBoards × (boardLength/1000) × pricePerLm
  engineeringBoardCount?: number; // totalStockBoards from cutting optimiser (used for clip cost)

  // Fascia board pricing (independent product)
  fasciaRatePerBoard?: number; // cost per fascia board
  fasciaBoardCount?: number; // number of fascia boards needed
  fasciaBoardCost?: number; // pre-calculated total fascia cost (overrides rate × count)

  // Edge board pricing (independent product)
  edgeRatePerBoard?: number; // cost per edge board
  edgeBoardCount?: number; // number of edge boards needed
  edgeBoardCost?: number; // pre-calculated total edge cost (overrides rate × count)

  // Framing (legacy spacing-based)
  framingPricePerLm: number; // price per lineal metre for framing
  beamSpacingM: number; // beam spacing in metres
  joistSpacingMm: number; // joist spacing in mm
  postSpacingM: number; // post spacing in metres

  // Engineering BOM override (from subfloor-calc engine + cutting optimiser)
  // When provided, these override the spacing-based framing calculation
  // Now includes posts (stock-based: stockCount × stockLength × pricePerMetre for each material)
  engineeringFramingCost?: number; // total framing material cost (joists + bearers + posts)
  engineeringBeamProfile?: string; // auto-selected beam profile label (display only)

  // Labour
  baseLabourRatePerM2: number;
  slopingSite: boolean;
  slopingSiteMultiplier: number;
  restrictedAccess: boolean;
  restrictedAccessMultiplier: number;
  elevatedDeck: boolean;
  elevatedDeckMultiplier: number;
  pictureFrame: boolean;
  pictureFrameLabourUplift: number;
  splitLevel: boolean;
  splitLevelUplift: number;
  multiLevel: boolean;
  multiLevelUplift: number;

  // Add-ons
  stairsRequired: boolean;
  numberOfStairsFlights: number;
  stairsCostPerFlight: number;
  handrailRequired: boolean;
  handrailCostPerLm: number;

  // BOM-driven stair pricing (overrides per-flight costing when provided)
  stairBomPricing?: {
    numberOfRisers: number;
    labourPerRiser: number;
    stringerCost: number;
    treadCost: number;
    riserCost: number;
    handrailCost: number;
    balustradeCost: number;
    landingCost: number;
  };

  screensRequired: boolean;
  screensCostPerLm: number;
  lightingRequired: boolean;
  lightingCost: number;
  demolitionRequired: boolean;
  demolitionCostPerM2: number;
  disposalRequired: boolean;
  disposalCost: number;
  engineeringRequired: boolean;
  engineeringCost: number;
  permitRequired: boolean;
  permitCost: number;

  // Dynamic add-ons (from admin-defined items, priced by qty × unitPrice)
  // priceOverride takes precedence over unitPrice when set (per-quote override)
  dynamicAddons?: Array<{ addonItemId: number; qty: number; unitPrice: number; priceOverride?: number | null; name?: string }>;

  // Pricing rules
  marginPercent: number; // e.g. 35 for 35%
  commissionPercent: number; // e.g. 10 for 10% — applied after margin: adjustedSell = sellExGst / (1 - commission%)
  gstPercent: number; // e.g. 10 for 10%
  depositPercent: number; // e.g. 20 for 20%
  baseDeliveryFee: number;
  restrictedAccessSurcharge: number;

  // Additional costs (passed through to sell price)
  councilFees?: number;
  homeWarranty?: number;
}

export interface DeckCalcResult {
  // Geometry
  areaM2: number;
  perimeterM: number;
  boardCount: number; // total stock boards (from engineering or estimated from area)

  // Materials breakdown
  deckingMaterialCost: number;
  clipFixingCost: number;
  wasteCost: number; // 0 when stock-based costing is used (waste is inherent in stock purchase)
  fasciaCost: number;
  edgeCost: number;
  framingCost: number;
  materialsSubtotal: number;

  // Labour breakdown
  baseLabour: number;
  complexityMultiplier: number;
  adjustedLabour: number;

  // Add-ons
  stairsCost: number;
  stairLabourCost: number;
  stairMaterialCost: number;
  handrailCost: number;
  screensCost: number;
  lightingCost: number;
  demolitionCost: number;
  disposalCost: number;
  engineeringCost: number;
  permitCost: number;
  dynamicAddonsCost: number; // sum of qty × unitPrice for admin-defined add-ons
  addonsSubtotal: number;

  // Delivery
  deliveryTotal: number;

  // Additional costs
  councilFees: number;
  homeWarranty: number;

  // Totals
  hardCostSubtotal: number;
  sellPriceExGst: number; // after margin, before commission
  commissionAmount: number;
  sellPriceWithCommissionExGst: number; // after commission adjustment
  gstAmount: number;
  sellPriceIncGst: number;
  depositAmount: number;
  marginAmount: number;
  effectiveMarginPercent: number;
}

export function calculateDeckPricing(input: DeckCalcInput): DeckCalcResult {
  // ─── Geometry (use design-derived overrides if available) ───────────────────────────
  const areaM2 = (input.areaM2Override && input.areaM2Override > 0)
    ? input.areaM2Override
    : input.deckWidthM * input.deckProjectionM;
  const perimeterM = (input.perimeterMOverride && input.perimeterMOverride > 0)
    ? input.perimeterMOverride
    : 2 * (input.deckWidthM + input.deckProjectionM);

  // ─── Materials ────────────────────────────────────────────────────────
  let deckingMaterialCost: number;
  let wasteCost: number;

  if (input.engineeringBoardCost != null && input.engineeringBoardCost > 0) {
    // Stock-based: cost = totalStockBoards × (boardLength/1000) × pricePerLm
    // Waste is inherent in the stock purchase (you buy full lengths)
    deckingMaterialCost = input.engineeringBoardCost;
    wasteCost = 0;
  } else {
    // Legacy fallback: area × rate + waste%
    deckingMaterialCost = areaM2 * input.deckingRatePerM2;
    wasteCost = deckingMaterialCost * input.wastePercent;
  }

  // Clip/fixing cost: per-board when engineering board count is available, else legacy area-based
  const clipFixingCost = (input.engineeringBoardCount != null && input.engineeringBoardCount > 0)
    ? input.engineeringBoardCount * input.clipFixingCostPerM2
    : areaM2 * input.clipFixingCostPerM2;

  // Framing: use engineering BOM if provided, otherwise fall back to spacing-based calculation
  let framingCost: number;
  if (input.engineeringFramingCost != null && input.engineeringFramingCost > 0) {
    // Engineering model provides total framing material cost directly
    // Now stock-based: stockCount × (stockLength/1000) × pricePerMetre for joists + bearers + posts
    framingCost = input.engineeringFramingCost;
  } else {
    // Legacy spacing-based calculation
    const joistSpacingM = input.joistSpacingMm / 1000;
    const numJoists = Math.ceil(input.deckWidthM / joistSpacingM) + 1;
    const joistTotalLm = numJoists * input.deckProjectionM;
    const numBeams = Math.ceil(input.deckProjectionM / input.beamSpacingM) + 1;
    const beamTotalLm = numBeams * input.deckWidthM;
    // Posts: one at each beam-post intersection
    const numPostsPerBeam = Math.ceil(input.deckWidthM / input.postSpacingM) + 1;
    const totalPosts = numPostsPerBeam * numBeams;
    const postHeightM = 0.6; // typical post height above ground (adjustable)
    const postTotalLm = totalPosts * postHeightM;
    const framingTotalLm = joistTotalLm + beamTotalLm + postTotalLm;
    framingCost = framingTotalLm * input.framingPricePerLm;
  }

  // Fascia board cost
  const fasciaCost = input.fasciaBoardCost != null && input.fasciaBoardCost > 0
    ? input.fasciaBoardCost
    : (input.fasciaRatePerBoard && input.fasciaBoardCount)
      ? input.fasciaRatePerBoard * input.fasciaBoardCount
      : 0;

  // Edge board cost
  const edgeCost = input.edgeBoardCost != null && input.edgeBoardCost > 0
    ? input.edgeBoardCost
    : (input.edgeRatePerBoard && input.edgeBoardCount)
      ? input.edgeRatePerBoard * input.edgeBoardCount
      : 0;

  const materialsSubtotal = deckingMaterialCost + clipFixingCost + wasteCost + fasciaCost + edgeCost + framingCost;

  // ─── Labour ───────────────────────────────────────────────────────────
  const baseLabour = areaM2 * input.baseLabourRatePerM2;

  // Complexity multiplier (multiplicative)
  let complexityMultiplier = 1.0;
  if (input.slopingSite) complexityMultiplier *= input.slopingSiteMultiplier;
  if (input.restrictedAccess) complexityMultiplier *= input.restrictedAccessMultiplier;
  if (input.elevatedDeck) complexityMultiplier *= input.elevatedDeckMultiplier;
  if (input.pictureFrame) complexityMultiplier *= input.pictureFrameLabourUplift;
  if (input.splitLevel) complexityMultiplier *= input.splitLevelUplift;
  if (input.multiLevel) complexityMultiplier *= input.multiLevelUplift;

  const adjustedLabour = baseLabour * complexityMultiplier;

  // ─── Add-ons ──────────────────────────────────────────────────────────
  let stairsCost: number;
  let stairLabourCost = 0;
  let stairMaterialCost = 0;
  if (input.stairsRequired && input.stairBomPricing) {
    // BOM-driven: per-riser labour + itemised materials
    const bom = input.stairBomPricing;
    stairLabourCost = bom.numberOfRisers * bom.labourPerRiser;
    stairMaterialCost = bom.stringerCost + bom.treadCost + bom.riserCost + bom.handrailCost + bom.balustradeCost + bom.landingCost;
    stairsCost = stairLabourCost + stairMaterialCost;
  } else {
    // Legacy: flat per-flight rate
    stairsCost = input.stairsRequired ? input.numberOfStairsFlights * input.stairsCostPerFlight : 0;
  }
  const handrailCost = input.handrailRequired ? perimeterM * input.handrailCostPerLm : 0;
  // Screens: applied to projection sides (2 x projection length) as typical configuration
  const screensCost = input.screensRequired ? (input.deckProjectionM * 2) * input.screensCostPerLm : 0;
  const lightingCost = input.lightingRequired ? input.lightingCost : 0;
  const demolitionCost = input.demolitionRequired ? areaM2 * input.demolitionCostPerM2 : 0;
  const disposalCost = input.disposalRequired ? input.disposalCost : 0;
  const engineeringCost = input.engineeringRequired ? input.engineeringCost : 0;
  const permitCost = input.permitRequired ? input.permitCost : 0;

  // Dynamic add-ons: qty × (priceOverride || unitPrice) for each admin-defined add-on
  const dynamicAddonsCost = (input.dynamicAddons || []).reduce((sum, addon) => {
    const effectivePrice = (addon.priceOverride != null && addon.priceOverride >= 0) ? addon.priceOverride : addon.unitPrice;
    return sum + (addon.qty * effectivePrice);
  }, 0);

  const addonsSubtotal = stairsCost + handrailCost + screensCost + lightingCost +
    demolitionCost + disposalCost + engineeringCost + permitCost + dynamicAddonsCost;

  // ─── Delivery ─────────────────────────────────────────────────────────
  let deliveryTotal = input.baseDeliveryFee;
  if (input.restrictedAccess) deliveryTotal += input.restrictedAccessSurcharge;

  // ─── Additional costs (council fees, home warranty) ────────────────────
  const councilFees = input.councilFees || 0;
  const homeWarranty = input.homeWarranty || 0;

  // ─── Totals ───────────────────────────────────────────────────────────
  const hardCostSubtotal = materialsSubtotal + adjustedLabour + addonsSubtotal + deliveryTotal + councilFees + homeWarranty;

  // Margin: sellPrice = hardCost / (1 - margin%)
  // Clamp margin to valid range (0-99%) to prevent division by zero or negative pricing
  const clampedMargin = Math.max(0, Math.min(99, input.marginPercent));
  const marginDecimal = clampedMargin / 100;
  const sellPriceExGst = hardCostSubtotal / (1 - marginDecimal);
  const marginAmount = sellPriceExGst - hardCostSubtotal;
  const effectiveMarginPercent = sellPriceExGst > 0 ? (marginAmount / sellPriceExGst) * 100 : 0;

  // Commission: adjustedSell = sellExGst / (1 - commission%)
  // Clamp commission to valid range (0-99%)
  const clampedCommission = Math.max(0, Math.min(99, input.commissionPercent || 0));
  const commissionDecimal = clampedCommission / 100;
  const sellPriceWithCommissionExGst = commissionDecimal > 0
    ? sellPriceExGst / (1 - commissionDecimal)
    : sellPriceExGst;
  const commissionAmount = sellPriceWithCommissionExGst - sellPriceExGst;

  const gstAmount = sellPriceWithCommissionExGst * (input.gstPercent / 100);
  const sellPriceIncGst = sellPriceWithCommissionExGst + gstAmount;
  const depositAmount = sellPriceIncGst * (input.depositPercent / 100);

  return {
    areaM2: round2(areaM2),
    perimeterM: round2(perimeterM),
    boardCount: input.engineeringBoardCount || 0,
    deckingMaterialCost: round2(deckingMaterialCost),
    clipFixingCost: round2(clipFixingCost),
    wasteCost: round2(wasteCost),
    fasciaCost: round2(fasciaCost),
    edgeCost: round2(edgeCost),
    framingCost: round2(framingCost),
    materialsSubtotal: round2(materialsSubtotal),
    baseLabour: round2(baseLabour),
    complexityMultiplier: round3(complexityMultiplier),
    adjustedLabour: round2(adjustedLabour),
    stairsCost: round2(stairsCost),
    stairLabourCost: round2(stairLabourCost),
    stairMaterialCost: round2(stairMaterialCost),
    handrailCost: round2(handrailCost),
    screensCost: round2(screensCost),
    lightingCost: round2(lightingCost),
    demolitionCost: round2(demolitionCost),
    disposalCost: round2(disposalCost),
    engineeringCost: round2(engineeringCost),
    permitCost: round2(permitCost),
    dynamicAddonsCost: round2(dynamicAddonsCost),
    addonsSubtotal: round2(addonsSubtotal),
    deliveryTotal: round2(deliveryTotal),
    councilFees: round2(councilFees),
    homeWarranty: round2(homeWarranty),
    hardCostSubtotal: round2(hardCostSubtotal),
    sellPriceExGst: round2(sellPriceExGst),
    commissionAmount: round2(commissionAmount),
    sellPriceWithCommissionExGst: round2(sellPriceWithCommissionExGst),
    gstAmount: round2(gstAmount),
    sellPriceIncGst: round2(sellPriceIncGst),
    depositAmount: round2(depositAmount),
    marginAmount: round2(marginAmount),
    effectiveMarginPercent: round2(effectiveMarginPercent),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
