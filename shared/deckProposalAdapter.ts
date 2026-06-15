/**
 * Deck Proposal Data Adapter (shared module)
 * 
 * Maps deck quote form data into the ProposalQuoteData shape
 * used by the PDF proposal generator.
 * 
 * Lives in shared/ so it can be imported from both client-side code
 * and server-side Vitest tests.
 */

/** Minimal proposal data shape matching the PDF generator's input */
export interface ProposalQuoteDataShape {
  quoteNumber: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  siteAddress?: string;
  descriptionOfWork?: string;
  /**
   * Used by the roof diagram renderer on the PDF.
   * For deck quotes, "skillion" is used intentionally because it renders
   * as a flat angled surface, which is the closest visual match for a
   * low-profile deck structure. A dedicated deck diagram renderer could
   * replace this in the future.
   */
  specRoofType?: string;
  specWidth?: string;
  specLength?: string;
  specFloorHeight?: string;
  specRoofTopColour?: string;
  specRoofBottomColour?: string;
  specPostsColour?: string;
  specBeamColour?: string;
  deckAreaM2?: number;
  grandTotalExGst: number;
  grandTotalIncGst: number;
  gst: number;
  componentSummary: { name: string; amount: number }[];
  adjustments: { name: string; amount: number }[];
  progressPayments?: Record<string, string>;
}

export interface DeckQuoteFormData {
  quoteNumber?: string;
  clientName?: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientCompany?: string | null;
  siteAddress?: string | null;
  deckWidthM?: string | null;
  deckProjectionM?: string | null;
  deckHeightAboveGroundMm?: number | null;
  frameType?: string | null;
  steelBeamSelection?: string | null;
  deckingBrand?: string | null;
  colour?: string | null;
  edgeDetail?: string | null;
  deckShape?: string | null;
  boardDirection?: string | null;
  staggerPattern?: string | null;
  pictureFrame?: string | null;
  breakerBoard?: string | null;
  boardWidthMm?: number | null;
  boardGapMm?: number | null;
  stockLengthM?: number | null;
  fixingMethod?: string | null;
  productName?: string | null;
  framingSystem?: string | null;
  framingProfile?: string | null;
  wallMounted?: boolean | null;
  levels?: string | null;
  siteCondition?: string | null;
  areaM2?: string | null;
  materialsSubtotal?: string | null;
  adjustedLabour?: string | null;
  hardCostSubtotal?: string | null;
  sellPriceExGst?: string | null;
  gstAmount?: string | null;
  sellPriceIncGst?: string | null;
  depositAmount?: string | null;
  baseDeliveryFee?: string | null;
  selectedMarginPercent?: string | null;
  stairsRequired?: boolean | null;
  numberOfStairsFlights?: number | null;
  handrailRequired?: boolean | null;
  screensRequired?: boolean | null;
  lightingRequired?: boolean | null;
  demolitionRequired?: boolean | null;
  disposalRequired?: boolean | null;
  engineeringRequired?: boolean | null;
  permitRequired?: boolean | null;
  selectedAddons?: Array<{ addonItemId: number; qty: number; name?: string; unitPrice?: number; unit?: string; priceOverride?: number | null; notes?: string }> | null;
  notes?: string | null;
}

export interface DeckProposalValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that a deck quote has enough data to generate a meaningful proposal.
 */
export function validateDeckQuoteForProposal(form: DeckQuoteFormData): DeckProposalValidation {
  const errors: string[] = [];

  if (!form.clientName || form.clientName.trim() === "") {
    errors.push("Client name is required");
  }
  if (!form.deckWidthM || parseFloat(form.deckWidthM) <= 0) {
    errors.push("Deck width must be greater than zero");
  }
  if (!form.deckProjectionM || parseFloat(form.deckProjectionM) <= 0) {
    errors.push("Deck projection must be greater than zero");
  }
  if (!form.sellPriceIncGst || parseFloat(form.sellPriceIncGst) <= 0) {
    errors.push("Please run the pricing calculation before generating a proposal");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build the description of work string from deck quote selections.
 */
export function buildDeckDescription(form: DeckQuoteFormData): string {
  const parts: string[] = [];

  const width = form.deckWidthM || "0";
  const projection = form.deckProjectionM || "0";
  const area = form.areaM2 || String((parseFloat(width) * parseFloat(projection)).toFixed(1));
  const shapeLabel = form.deckShape && form.deckShape !== "rectangular" ? ` ${form.deckShape}` : "";

  parts.push(`Supply and install ${width}m × ${projection}m (${area}m²)${shapeLabel} composite deck`);

  if (form.deckingBrand) {
    const productLabel = form.productName ? ` ${form.productName}` : "";
    parts.push(`using ${form.deckingBrand}${productLabel} decking`);
  }
  if (form.colour) parts.push(`in ${form.colour}`);

  // Board layout details
  const layoutDetails: string[] = [];
  if (form.boardDirection && form.boardDirection !== "parallel") {
    layoutDetails.push(`${form.boardDirection} board direction`);
  }
  if (form.pictureFrame && form.pictureFrame !== "none") {
    layoutDetails.push(`${form.pictureFrame} picture frame border`);
  }
  if (form.breakerBoard && form.breakerBoard !== "none") {
    layoutDetails.push(`${form.breakerBoard} breaker board`);
  }
  if (form.staggerPattern && form.staggerPattern !== "random") {
    const staggerMap: Record<string, string> = { equal: "½ offset", third: "⅓ offset", quarter: "¼ offset" };
    layoutDetails.push(`${staggerMap[form.staggerPattern] || form.staggerPattern} stagger`);
  }
  if (layoutDetails.length > 0) {
    parts.push(`with ${layoutDetails.join(", ")}`);
  }

  // Framing
  const framingLabel = form.framingSystem === "spanmor" ? "Spanmor aluminium" :
    form.framingSystem === "clickdeck" ? "ClickDeck modular" :
    form.framingSystem === "sfs01" ? "Spanline RFB steel" :
    form.frameType || null;
  if (framingLabel) {
    const profileStr = form.framingProfile ? ` (${form.framingProfile})` : "";
    const beamStr = form.steelBeamSelection ? ` with ${form.steelBeamSelection} beams` : "";
    parts.push(`on ${framingLabel} framing${profileStr}${beamStr}`);
  } else if (form.steelBeamSelection) {
    parts.push(`with ${form.steelBeamSelection} beams`);
  }

  // Legacy edge detail (backward compat)
  if (form.edgeDetail && form.edgeDetail !== "standard") {
    parts.push(`with ${form.edgeDetail} edge detail`);
  }

  if (form.wallMounted) parts.push("wall-mounted with ledger plate");
  if (form.levels && form.levels !== "single") parts.push(`— ${form.levels} level`);

  const addons: string[] = [];
  if (form.stairsRequired) addons.push(`${form.numberOfStairsFlights || 1} stair flight(s)`);
  if (form.handrailRequired) addons.push("handrail");
  if (form.screensRequired) addons.push("privacy screens");
  if (form.lightingRequired) addons.push("deck lighting");
  if (form.demolitionRequired) addons.push("demolition of existing");
  if (form.disposalRequired) addons.push("waste disposal");
  if (form.engineeringRequired) addons.push("engineering certification");
  if (form.permitRequired) addons.push("building permit");

  // Dynamic add-ons (non-legacy items from admin)
  if (form.selectedAddons && form.selectedAddons.length > 0) {
    const legacyCats = ["stairs", "handrail", "screens", "lighting", "demolition", "disposal", "engineering", "permit"];
    for (const sa of form.selectedAddons) {
      // Only include non-legacy items (legacy already handled above)
      if (sa.name && !legacyCats.includes(sa.name.toLowerCase())) {
        const qtyStr = sa.qty && sa.qty > 1 ? `${sa.qty}× ` : "";
        const noteStr = sa.notes ? ` (${sa.notes})` : "";
        addons.push(`${qtyStr}${sa.name}${noteStr}`);
      }
    }
  }

  if (addons.length > 0) {
    parts.push(`. Including: ${addons.join(", ")}`);
  }

  return parts.join(" ") + ".";
}

/**
 * Build adjustment line items from dynamic (non-legacy) add-ons.
 * These appear on the customer-facing proposal PDF as named line items.
 */
function buildDeckAddonAdjustments(form: DeckQuoteFormData): { name: string; amount: number }[] {
  if (!form.selectedAddons || form.selectedAddons.length === 0) return [];

  const legacyCats = ["stairs", "handrail", "screens", "lighting", "demolition", "disposal", "engineering", "permit"];
  const adjustments: { name: string; amount: number }[] = [];

  for (const sa of form.selectedAddons) {
    // Skip legacy items — they are already included in the total
    if (!sa.name) continue;
    if (legacyCats.includes(sa.name.toLowerCase())) continue;

    const effectivePrice = (sa.priceOverride != null && sa.priceOverride >= 0) ? sa.priceOverride : (sa.unitPrice || 0);
    const qty = sa.qty || 1;
    const amount = qty * effectivePrice;
    if (amount <= 0) continue;

    let label = qty > 1 ? `${sa.name} (${qty} × $${effectivePrice.toFixed(2)})` : sa.name;
    if (sa.notes) label += ` — ${sa.notes}`;
    adjustments.push({ name: label, amount });
  }

  return adjustments;
}

/**
 * Adapt deck quote form data into the shared ProposalQuoteData format.
 */
export function adaptDeckQuoteToProposal(form: DeckQuoteFormData): ProposalQuoteDataShape {
  const sellIncGst = parseFloat(form.sellPriceIncGst as string) || 0;
  const gst = parseFloat(form.gstAmount as string) || 0;
  const sellExGst = parseFloat(form.sellPriceExGst as string) || 0;
  const deposit = parseFloat(form.depositAmount as string) || 0;

  // Deck area calculation
  const widthM = parseFloat(form.deckWidthM as string) || 0;
  const projM = parseFloat(form.deckProjectionM as string) || 0;
  const deckAreaM2 = parseFloat(form.areaM2 as string) || (widthM * projM);

  return {
    quoteNumber: form.quoteNumber || "DQ-0000",
    clientName: form.clientName || "Client",
    clientPhone: form.clientPhone || undefined,
    clientEmail: form.clientEmail || undefined,
    siteAddress: form.siteAddress || undefined,
    descriptionOfWork: buildDeckDescription(form),
    // See JSDoc on specRoofType in ProposalQuoteDataShape for rationale
    specRoofType: "skillion",
    specWidth: form.deckWidthM || "0",
    specLength: form.deckProjectionM || "0",
    specFloorHeight: form.deckHeightAboveGroundMm ? String(form.deckHeightAboveGroundMm) : undefined,
    deckAreaM2,
    grandTotalExGst: sellExGst,
    grandTotalIncGst: sellIncGst,
    gst: gst,
    // No internal cost breakdown on customer-facing deck proposal
    componentSummary: [],
    // Dynamic add-ons shown as adjustments on the proposal
    adjustments: buildDeckAddonAdjustments(form),
    progressPayments: deposit > 0 ? {
      "Deposit on acceptance": `$${deposit.toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
      "Balance on completion": `$${(sellIncGst - deposit).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`,
    } : undefined,
  };
}
