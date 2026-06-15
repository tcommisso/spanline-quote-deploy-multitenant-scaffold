/**
 * Deck Render Prompt Builder
 *
 * Assembles detailed image-generation prompts from deck quote spec data
 * to produce realistic 3D-style renders of proposed composite/timber decks.
 */

export interface DeckRenderInput {
  // Dimensions
  widthM: number;
  projectionM: number;
  heightAboveGroundMm?: number;
  shape?: string; // rectangle, L-shape, U-shape

  // Product & Material
  deckingBrand?: string;
  productName?: string; // e.g. "Terrace Range - Solid Edge Decking"
  colour?: string;
  boardWidthMm?: number; // e.g. 138, 148
  boardGapMm?: number; // e.g. 5.5
  stockLengthM?: number; // e.g. 5.4
  fixingMethod?: string; // clip, screw, hidden-fastener

  // Board Layout
  boardDirection?: string; // parallel, perpendicular, diagonal
  staggerPattern?: string; // random, equal, third, quarter
  pictureFrame?: string; // none, single, double
  breakerBoard?: string; // none, single, double

  // Edge & Fascia
  fascia?: string; // none, matching, timber, aluminium
  fasciaHeightMm?: number; // e.g. 150
  infill?: string; // none, matching, lattice, vertical-slats, horizontal-slats, sheet-cladding
  edgeDetail?: string; // e.g. "flush", "overhang"

  // Product sample image URL (for reference)
  productImageUrl?: string;

  // Frame
  frameType?: string; // spanmor, clickdeck, sfs01, steel, timber
  framingProfile?: string; // e.g. "105 × 50 mm aluminium"
  steelBeamSelection?: string;

  // Add-ons
  stairsRequired?: boolean;
  numberOfStairsFlights?: number;
  handrailRequired?: boolean;
  screensRequired?: boolean;
  lightingRequired?: boolean;
  levels?: string; // single, split-level, multi-level

  // Site context
  siteCondition?: string; // flat, sloping-mild, sloping-steep
  wallMounted?: boolean;
  hasPhoto?: boolean;
}

/**
 * Build a full detailed prompt for deck AI render generation.
 */
export function buildDeckRenderPrompt(input: DeckRenderInput): string {
  const sections: string[] = [];

  if (input.hasPhoto) {
    sections.push(
      "Edit this photograph of a residential property to add a new composite/timber deck structure. " +
      "The render should look photorealistic and architecturally accurate, as if the deck has already been built. " +
      "Maintain the existing house, landscaping, sky, and surroundings exactly as they are — only add the new deck structure."
    );
  } else {
    sections.push(
      "Generate a photorealistic architectural render of a new composite/timber deck attached to the rear of a modern Australian residential home. " +
      "Show the deck from a 3/4 elevated perspective angle (approximately 30° above eye level, slightly to the right) so both the deck surface and the supporting subframe/posts are partially visible. " +
      "Include realistic landscaping (lawn, garden beds, fence) and a clear blue Australian sky."
    );
  }

  // Dimensions
  const widthStr = input.widthM?.toFixed(1) || "6.0";
  const projStr = input.projectionM?.toFixed(1) || "4.0";
  sections.push(
    `The deck is ${widthStr} metres wide and ${projStr} metres deep (projection from the house).`
  );

  if (input.heightAboveGroundMm && input.heightAboveGroundMm > 300) {
    const heightM = (input.heightAboveGroundMm / 1000).toFixed(1);
    const frameDesc = input.frameType === "spanmor" ? "aluminium (Spanmor)" :
      input.frameType === "sfs01" ? "galvanised steel (Spanline RFB)" :
      input.frameType === "clickdeck" ? "modular aluminium (ClickDeck)" :
      input.frameType === "steel" ? "galvanised steel" : "treated timber";
    sections.push(
      `The deck surface is elevated approximately ${heightM}m above ground level, supported by ${frameDesc} posts and bearers visible underneath.`
    );
  }

  // Shape
  if (input.shape && input.shape !== "rectangle") {
    const shapeDesc = input.shape === "L-shape"
      ? "an L-shaped layout wrapping around two sides of the house"
      : input.shape === "U-shape"
        ? "a U-shaped layout wrapping around three sides"
        : `a ${input.shape} layout`;
    sections.push(`The deck has ${shapeDesc}.`);
  }

  // Wall mounting
  if (input.wallMounted) {
    sections.push(
      "The deck is attached to the house wall via a wall plate (ledger board) bolted to the masonry/framing. Show the connection detail where the deck meets the house wall."
    );
  }

  // Decking product and colour
  const colourDesc = input.colour || "Spotted Gum (warm brown timber-look)";
  const brandDesc = input.deckingBrand || "composite";
  const productDesc = input.productName ? ` (${input.productName})` : "";
  sections.push(
    `The decking boards are ${brandDesc}${productDesc} in "${colourDesc}" colour — show realistic woodgrain texture and colour variation typical of premium composite decking.`
  );

  // Board dimensions
  if (input.boardWidthMm) {
    const gapDesc = input.boardGapMm ? ` with ${input.boardGapMm}mm gaps between boards` : "";
    sections.push(
      `Each board is ${input.boardWidthMm}mm wide${gapDesc}. Show the correct board proportions and spacing.`
    );
  }

  // Board direction
  if (input.boardDirection && input.boardDirection !== "parallel") {
    const dirDesc = input.boardDirection === "perpendicular"
      ? "perpendicular to the house wall (running away from the house)"
      : input.boardDirection === "diagonal"
        ? "at a 45° diagonal angle"
        : `in a ${input.boardDirection} pattern`;
    sections.push(`The boards are laid ${dirDesc}.`);
  } else {
    sections.push("The boards run parallel to the house wall (the standard direction).");
  }

  // Stagger pattern
  if (input.staggerPattern && input.staggerPattern !== "random") {
    const staggerDesc = input.staggerPattern === "equal"
      ? "a regular half-offset (brick bond) stagger pattern — each row offset by exactly half a board length"
      : input.staggerPattern === "third"
        ? "a one-third offset stagger pattern — each row offset by ⅓ of a board length"
        : "a quarter offset stagger pattern — each row offset by ¼ of a board length";
    sections.push(`The board joints follow ${staggerDesc}. Show visible joint lines at the correct intervals.`);
  }

  // Picture frame
  if (input.pictureFrame && input.pictureFrame !== "none") {
    const frameDesc = input.pictureFrame === "double"
      ? "a double picture-frame border (two boards wide) running perpendicular around the entire perimeter"
      : "a single picture-frame border board running perpendicular around the entire perimeter";
    sections.push(
      `The deck features ${frameDesc}, creating a defined edge detail that contrasts with the field boards.`
    );
  }

  // Breaker board
  if (input.breakerBoard && input.breakerBoard !== "none") {
    const breakerDesc = input.breakerBoard === "double"
      ? "double breaker boards (two boards wide) running perpendicular across the middle of the deck"
      : "a single breaker board running perpendicular across the middle of the deck";
    sections.push(
      `Include ${breakerDesc}, dividing the deck surface into sections and adding visual interest.`
    );
  }

  // Fascia boards
  if (input.fascia && input.fascia !== "none") {
    const fasciaDesc = input.fascia === "matching"
      ? "matching composite fascia boards"
      : input.fascia === "timber"
        ? "natural timber fascia boards"
        : "aluminium fascia cladding";
    const heightDesc = input.fasciaHeightMm ? ` (${input.fasciaHeightMm}mm high)` : "";
    sections.push(
      `The deck edges are finished with ${fasciaDesc}${heightDesc}, providing a clean finished look to the exposed subframe.`
    );
  }

  // Side infill
  if (input.infill && input.infill !== "none") {
    const infillDesc: Record<string, string> = {
      "matching": "matching composite cladding panels between ground and deck edge",
      "lattice": "decorative lattice screening between ground and deck edge",
      "vertical-slats": "vertical slat screening between ground and deck edge",
      "horizontal-slats": "horizontal slat screening between ground and deck edge",
      "sheet-cladding": "sheet cladding panels between ground and deck edge",
    };
    sections.push(
      `The deck sides feature ${infillDesc[input.infill] || input.infill}, concealing the subframe and creating a finished appearance.`
    );
  }

  // Fixing method
  if (input.fixingMethod) {
    const fixDesc = input.fixingMethod === "clip"
      ? "hidden clip fasteners (no visible screws on the board surface)"
      : input.fixingMethod === "hidden-fastener"
        ? "concealed fastener system (clean board surface with no visible fixings)"
        : "face-screwed fixings (small screw heads visible on the board surface)";
    sections.push(`The boards are secured with ${fixDesc}.`);
  }

  // Stairs
  if (input.stairsRequired) {
    const flights = input.numberOfStairsFlights || 1;
    sections.push(
      `Include ${flights > 1 ? flights + " flights of" : "a set of"} matching composite deck stairs leading down to the garden/ground level.`
    );
  }

  // Handrails
  if (input.handrailRequired) {
    sections.push(
      "Include modern aluminium and glass balustrade/handrails along exposed edges of the deck for safety."
    );
  }

  // Screens
  if (input.screensRequired) {
    sections.push(
      "Include decorative privacy screens (aluminium slat or timber-look composite) on one side of the deck."
    );
  }

  // Lighting
  if (input.lightingRequired) {
    sections.push(
      "Include subtle LED deck lighting — recessed step lights and post cap lights creating a warm ambient glow."
    );
  }

  // Multi-level
  if (input.levels === "split-level" || input.levels === "multi-level") {
    sections.push(
      `The deck is ${input.levels}, with different platform heights connected by steps, creating visual interest and defined zones.`
    );
  }

  // Frame type visibility
  if (input.frameType === "spanmor") {
    sections.push(
      "The subframe is Spanmor aluminium (silver anodised, visible from the side/underneath) — show aluminium joists and bearers supporting the deck boards."
    );
  } else if (input.frameType === "sfs01" || input.frameType === "steel") {
    sections.push(
      "The subframe is galvanised steel (visible from the side/underneath) — show steel bearers and joists supporting the deck boards."
    );
  } else if (input.frameType === "clickdeck") {
    sections.push(
      "The subframe uses a modular aluminium pedestal system (ClickDeck) — show the clean aluminium frame supporting the deck boards."
    );
  }

  // Framing profile
  if (input.framingProfile) {
    sections.push(
      `The joist profile is ${input.framingProfile}, providing the structural support for the deck boards.`
    );
  }

  // Site condition
  if (input.siteCondition === "sloping-steep") {
    sections.push(
      "The site slopes steeply, so the deck is elevated on tall posts at the far end, creating a dramatic elevated outdoor living space."
    );
  } else if (input.siteCondition === "sloping-mild") {
    sections.push(
      "The site has a mild slope, with the deck stepping down slightly from the house to accommodate the terrain."
    );
  }

  // Quality and style
  sections.push(
    "Render in high-quality photorealistic style with accurate material textures, natural lighting, soft shadows, and depth of field. " +
    "The image should look like a professional architectural photography shot suitable for a customer proposal document."
  );

  return sections.join("\n\n");
}

/**
 * Build a quick/simplified prompt for faster generation.
 */
export function buildDeckRenderPromptQuick(input: DeckRenderInput): string {
  const colour = input.colour || "Spotted Gum";
  const brand = input.deckingBrand || "composite";
  const product = input.productName ? ` ${input.productName}` : "";
  const width = input.widthM?.toFixed(1) || "6.0";
  const proj = input.projectionM?.toFixed(1) || "4.0";

  let prompt = `Photorealistic architectural render of a ${width}m × ${proj}m ${brand}${product} deck in "${colour}" colour, attached to the rear of a modern Australian home. `;
  prompt += "3/4 elevated perspective, natural daylight, professional photography quality. ";

  // Board layout details
  if (input.boardDirection && input.boardDirection !== "parallel") {
    prompt += `Boards laid ${input.boardDirection === "diagonal" ? "at 45° diagonal" : "perpendicular to house"}. `;
  }
  if (input.pictureFrame && input.pictureFrame !== "none") {
    prompt += `${input.pictureFrame === "double" ? "Double" : "Single"} picture-frame border. `;
  }
  if (input.breakerBoard && input.breakerBoard !== "none") {
    prompt += "Breaker board across middle. ";
  }
  if (input.staggerPattern && input.staggerPattern !== "random") {
    const staggerMap: Record<string, string> = { equal: "½ offset", third: "⅓ offset", quarter: "¼ offset" };
    prompt += `${staggerMap[input.staggerPattern] || input.staggerPattern} stagger pattern. `;
  }

  // Fascia & infill
  if (input.fascia && input.fascia !== "none") {
    const fasciaDesc = input.fascia === "matching" ? "matching" : input.fascia === "timber" ? "timber" : "aluminium";
    prompt += `${fasciaDesc} fascia boards${input.fasciaHeightMm ? ` (${input.fasciaHeightMm}mm)` : ""}. `;
  }
  if (input.infill && input.infill !== "none") {
    prompt += `${input.infill.replace(/-/g, " ")} side infill. `;
  }

  if (input.stairsRequired) prompt += "With matching stairs to garden. ";
  if (input.handrailRequired) prompt += "Glass and aluminium balustrades. ";
  if (input.lightingRequired) prompt += "LED deck lighting. ";
  if (input.wallMounted) prompt += "Wall-mounted with ledger board. ";
  if (input.heightAboveGroundMm && input.heightAboveGroundMm > 600) {
    const frameDesc = input.frameType === "spanmor" ? "aluminium" :
      input.frameType === "sfs01" ? "steel" :
      input.frameType === "clickdeck" ? "modular aluminium" :
      input.frameType === "steel" ? "steel" : "timber";
    prompt += `Elevated ${(input.heightAboveGroundMm / 1000).toFixed(1)}m above ground on ${frameDesc} posts. `;
  }

  prompt += "Show realistic woodgrain texture, landscaped garden, blue sky, soft shadows.";
  return prompt;
}
