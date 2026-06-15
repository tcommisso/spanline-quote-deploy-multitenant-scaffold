/**
 * Patio Render Prompt Builder
 *
 * Assembles detailed image-generation prompts from patio planner spec data
 * and photo guide context to produce realistic 3D-style renders of proposed
 * patio structures overlaid on house photos.
 */

export interface PatioRenderInput {
  // Structure
  roofStyle: string; // flyover, popup-skillion, gable, hip
  width: number; // mm
  projection: number; // mm
  roofPitch: number; // degrees
  beamHeight: number; // mm
  postHeight: number; // mm
  floorToGround: number; // mm
  postCount: number;

  // Colorbond colours
  roofColour: string;
  beamColour: string;
  postColour: string;
  gutterColour: string;
  fasciaColour: string;

  // Windows & doors (optional)
  windowsDoors?: Array<{
    type: string;
    label: string;
    width: number;
    height: number;
    screen?: string;
  }>;

  // Rainwater (optional)
  gutterStyle?: string; // none, quad, half-round, fascia
  downpipeStyle?: string; // none, round, square

  // Roofing panel type (optional)
  roofPanel?: string; // wavetek, climatek-v, slendek, double-u, ambitek, ceiltek

  // Connection method (optional)
  connectionType?: string; // flyover-bracket, through-eave, back-channel, crank-post

  // Engineering context (optional)
  beamSize?: string;
  postSize?: string;
  windRegion?: string;

  // Photo context
  hasPhoto: boolean;
  photoDescription?: string; // optional user description of the house/site
}

/** Roof style human-readable labels — enriched from Spanline showroom signage diagrams */
const ROOF_STYLE_DESCRIPTIONS: Record<string, string> = {
  flyover:
    "a flyover patio roof that passes over the existing house roof via steel flyover brackets bolted through the existing roof tiles/sheeting to the rafters, with the patio roof plane sitting above the house gutter line. The connection uses extenda brackets with flashing where the patio roof crosses over the house roof. Steel posts support the outer edge, with beams running along the front fascia",
  "popup-skillion":
    "a pop-up skillion patio roof with a raised connection point above the existing house roof ridge, creating a clerestory gap for light and ventilation between the house roof and the patio roof, sloping away from the house. The back channel connects to the house fascia board or through the eave soffit via through-eave brackets",
  gable:
    "a gable patio roof with a central ridge running perpendicular to the house wall, creating two symmetrical sloping roof planes that meet at a peaked ridge cap with aluminium ridge extrusion connectors. Decorative gable infill panels at each end, with barge boards along the sloping edges. The structure attaches to the house wall via a back channel bolted to the fascia",
  hip:
    "a hip patio roof with slopes on all four sides meeting at a ridge, giving a more enclosed and traditional appearance, with hip rafters running from each corner to the ridge. Ridge caps and hip cappings in matching Colorbond finish",
  "flat-gable-flat":
    "a flat-gable-flat patio roof with flat sections flanking a central raised gable section, creating an architecturally distinctive profile. The flat sections slope gently for drainage while the central gable adds height and visual interest with decorative gable infill",
  "screen-room":
    "a skillion screen room with a sloped patio roof and screen walls enclosing the sides, creating a protected outdoor room. The screens are fitted between the steel posts with aluminium framing",
};

/** Convert mm to metres for natural language */
function mmToM(mm: number): string {
  return (mm / 1000).toFixed(1);
}

/** Get a natural colour description for Colorbond colours */
function describeColour(colourName: string): string {
  const descriptions: Record<string, string> = {
    Surfmist: "off-white (Colorbond Surfmist)",
    "Classic Cream": "warm cream (Colorbond Classic Cream)",
    Paperbark: "light warm beige (Colorbond Paperbark)",
    "Evening Haze": "soft warm grey-beige (Colorbond Evening Haze)",
    Dune: "sandy brown (Colorbond Dune)",
    Jasper: "dark brown (Colorbond Jasper)",
    Terrain: "deep chocolate brown (Colorbond Terrain)",
    Cove: "blue-grey (Colorbond Cove)",
    "Shale Grey": "medium grey (Colorbond Shale Grey)",
    Windspray: "blue-grey (Colorbond Windspray)",
    "Pale Eucalypt": "muted sage green (Colorbond Pale Eucalypt)",
    Wilderness: "deep green (Colorbond Wilderness)",
    "Cottage Green": "dark heritage green (Colorbond Cottage Green)",
    "Manor Red": "deep terracotta red (Colorbond Manor Red)",
    Headland: "warm brown (Colorbond Headland)",
    Ironstone: "dark reddish-brown (Colorbond Ironstone)",
    Basalt: "charcoal grey (Colorbond Basalt)",
    "Woodland Grey": "dark grey-green (Colorbond Woodland Grey)",
    Monument: "dark charcoal (Colorbond Monument)",
    "Night Sky": "near-black (Colorbond Night Sky)",
  };
  return descriptions[colourName] || `${colourName} (Colorbond)`;
}

/** Build the roof description section */
function buildRoofDescription(input: PatioRenderInput): string {
  const roofDesc =
    ROOF_STYLE_DESCRIPTIONS[input.roofStyle] ||
    `a ${input.roofStyle} style patio roof attached to the house`;

  return `The patio has ${roofDesc}. The roof spans ${mmToM(input.width)}m wide and projects ${mmToM(input.projection)}m out from the house wall at a ${input.roofPitch}° pitch.`;
}

/** Build the structural description */
function buildStructureDescription(input: PatioRenderInput): string {
  const parts: string[] = [];

  parts.push(
    `The structure is supported by ${input.postCount} ${describeColour(input.postColour)} steel posts, each ${mmToM(input.postHeight)}m tall from the finished floor level.`
  );

  parts.push(
    `The beams are ${describeColour(input.beamColour)} steel, running along the outer edge at ${mmToM(input.beamHeight)}m height.`
  );

  if (input.beamSize) {
    parts.push(`Beam size is ${input.beamSize} SHS/RHS steel.`);
  }

  if (input.floorToGround > 0) {
    parts.push(
      `The finished floor is ${mmToM(input.floorToGround)}m above natural ground level.`
    );
  }

  return parts.join(" ");
}

/** Build the rainwater (gutter + downpipe) description for the prompt */
function buildRainwaterDescription(input: PatioRenderInput): string {
  const gutterDesc: Record<string, string> = {
    quad: "quad-style (rectangular profile) gutters",
    "half-round": "half-round (semicircular profile) gutters",
    fascia: "fascia-integrated gutters flush with the fascia board",
    none: "",
  };
  const downpipeDesc: Record<string, string> = {
    round: "90mm round downpipes",
    square: "100mm square downpipes",
    none: "",
  };

  const gs = input.gutterStyle || "quad";
  const ds = input.downpipeStyle || "round";

  const gutterText = gutterDesc[gs] || "quad-style gutters";
  const downpipeText = downpipeDesc[ds] || "downpipes at each end";

  if (gs === "none" && ds === "none") {
    return "No gutters or downpipes are installed.";
  }
  if (gs === "none") {
    return `No gutters are installed. ${downpipeText.charAt(0).toUpperCase() + downpipeText.slice(1)} are fitted at each end.`;
  }
  if (ds === "none") {
    return `The structure has ${gutterText} with no downpipes.`;
  }
  return `The structure has ${gutterText} with ${downpipeText} at each end.`;
}

/** Build a short rainwater description for the quick prompt */
function buildRainwaterDescriptionShort(input: PatioRenderInput): string {
  const gs = input.gutterStyle || "quad";
  const ds = input.downpipeStyle || "round";
  const gutterLabels: Record<string, string> = { quad: "quad", "half-round": "half-round", fascia: "fascia" };
  const dpLabels: Record<string, string> = { round: "90mm round", square: "100mm square" };
  if (gs === "none" && ds === "none") return "";
  const parts: string[] = [];
  if (gs !== "none") parts.push(`${gutterLabels[gs] || gs} gutters`);
  if (ds !== "none") parts.push(`${dpLabels[ds] || ds} downpipes`);
  return ` ${parts.join(", ")}.`;
}

/** Build the roofing panel profile description based on Spanline product range */
function buildRoofPanelDescription(input: PatioRenderInput): string {
  const panelDescriptions: Record<string, string> = {
    wavetek:
      "The roof sheets are Wavetek® insulated panels (765mm cover width, ~170mm core thickness) with a distinctive corrugated/wave profile on the outer face and a smooth flat ceiling finish underneath, providing both weather protection and thermal insulation in a single panel.",
    "wavetek+":
      "The roof sheets are Wavetek+® insulated panels (1000mm cover width, ~170mm core thickness) with a corrugated/wave profile and wider coverage per sheet, smooth flat ceiling finish underneath.",
    "climatek-v":
      "The roof sheets are Climatek V® insulated panels (1000mm cover width, ~225mm core thickness) — the thickest insulated option — with a bold V-shaped rib profile on the outer face and smooth ceiling finish, offering maximum thermal performance.",
    slendek:
      "The roof sheets are Slendek® single-skin panels (305mm cover width, 43.8mm profile height) with a flat-rib corrugated profile, showing clean parallel ribs running down the roof slope.",
    "double-u":
      "The roof sheets are Double-U® single-skin panels (305mm cover width, 30mm profile height) with a traditional corrugated profile showing rounded U-shaped ribs.",
    ambitek:
      "The roof sheets are Ambitek® insulated panels (765mm cover width, ~128mm core) with a smooth, modern flat-pan profile and concealed fixings for a clean contemporary look.",
    "ambitek+":
      "The roof sheets are Ambitek+® insulated panels (1000mm cover width, ~158mm core) with a smooth flat-pan profile and wider coverage, concealed fixings for a sleek appearance.",
    ceiltek:
      "The roof sheets are Ceiltek® flat ceiling panels (900mm cover width) providing a smooth, flat interior ceiling finish underneath the main roofing.",
  };

  const panel = input.roofPanel?.toLowerCase() || "";
  return panelDescriptions[panel] ||
    "The roof sheets should show a corrugated/ribbed profile typical of Australian Colorbond roofing with visible parallel ribs running down the slope.";
}

/** Build the connection method description based on Spanline construction details */
function buildConnectionDescription(input: PatioRenderInput): string {
  const connectionDescriptions: Record<string, string> = {
    "flyover-bracket":
      "The patio roof connects to the house via flyover brackets — steel brackets bolted through the existing roof sheeting/tiles to the rafters, with the patio roof passing over the top of the house roof. Flashing seals the junction where the patio roof crosses over the existing roof.",
    "through-eave":
      "The patio beams connect through the house eave soffit via through-eave brackets, penetrating the eave lining to bolt directly to the house structure. The soffit is neatly trimmed around the beam penetration.",
    "back-channel":
      "The patio attaches to the house via a back channel — an aluminium channel bolted horizontally to the house fascia board, into which the patio roof sheets slot and are sealed with silicone and flashing.",
    "crank-post":
      "One or more posts use a cranked (offset) design where the post has a 90° bend near the top, allowing the footing to be positioned away from the house wall or boundary while the beam connection remains at the correct position. The crank section is welded steel with gusset plates for strength.",
  };

  const conn = input.connectionType?.toLowerCase() || "";
  return connectionDescriptions[conn] || "";
}

/** Build the colour description */
function buildColourDescription(input: PatioRenderInput): string {
  const parts: string[] = [];

  parts.push(`Roof sheets: ${describeColour(input.roofColour)}`);
  parts.push(`Gutters: ${describeColour(input.gutterColour)}`);
  parts.push(`Fascia: ${describeColour(input.fasciaColour)}`);
  parts.push(`Beams: ${describeColour(input.beamColour)}`);
  parts.push(`Posts: ${describeColour(input.postColour)}`);

  return `The Colorbond colour scheme is: ${parts.join("; ")}.`;
}

/** Build the windows/doors description */
function buildOpeningsDescription(input: PatioRenderInput): string {
  if (!input.windowsDoors || input.windowsDoors.length === 0) return "";

  const items = input.windowsDoors.map((wd) => {
    const screenNote =
      wd.screen && wd.screen !== "N/A" ? ` with ${wd.screen} screen` : "";
    return `${wd.label} (${mmToM(wd.width)}m × ${mmToM(wd.height)}m${screenNote})`;
  });

  return `The patio includes the following openings: ${items.join(", ")}.`;
}

/**
 * Build the complete image generation prompt for a patio render.
 *
 * When a photo is provided, the prompt instructs the AI to edit the photo
 * by adding the patio structure. When no photo is provided, it generates
 * a standalone architectural render.
 */
export function buildPatioRenderPrompt(input: PatioRenderInput): string {
  const sections: string[] = [];

  if (input.hasPhoto) {
    sections.push(
      "Edit this photograph of a residential house to add a new patio/outdoor living structure attached to the rear or side of the house. The render should look photorealistic and architecturally accurate, as if the patio has already been built. Maintain the existing house, landscaping, sky, and surroundings exactly as they are — only add the new patio structure."
    );
  } else {
    sections.push(
      "Generate a photorealistic architectural render of a residential patio/outdoor living structure attached to an Australian suburban house. Show the structure from a three-quarter perspective view, approximately 8-12 metres back, at chest height (1.2-1.5m), looking at the rear or side of the house where the patio is attached. Include realistic Australian landscaping, natural lighting, and shadows."
    );
  }

  // Structure details
  sections.push(buildRoofDescription(input));
  sections.push(buildStructureDescription(input));
  sections.push(buildColourDescription(input));

  // Openings
  const openingsDesc = buildOpeningsDescription(input);
  if (openingsDesc) {
    sections.push(openingsDesc);
  }

  // Material and finish details — enriched with Spanline panel profiles
  sections.push(
    `All metal components should have a smooth Colorbond powder-coated finish with subtle light reflections. ${buildRoofPanelDescription(input)} Posts should be square hollow section (SHS) steel with visible clean welds at beam connections. Beams are rectangular hollow section (RHS) steel. ${buildRainwaterDescription(input)} ${buildConnectionDescription(input)}`
  );

  // Quality and style directives
  sections.push(
    "Style: photorealistic architectural visualisation, professional quality, natural daylight with soft shadows, high detail on materials and textures. The image should look like a professional builder's marketing render — clean, aspirational, and accurate to the specified dimensions and colours."
  );

  // Disclaimer context
  sections.push(
    "Do NOT include any text, labels, watermarks, dimensions, or annotations on the image itself."
  );

  return sections.join("\n\n");
}

/**
 * Build a shorter prompt variant for quick preview renders.
 */
export function buildPatioRenderPromptQuick(input: PatioRenderInput): string {
  const roofLabel =
    input.roofStyle === "popup-skillion"
      ? "pop-up skillion"
      : input.roofStyle === "flyover"
        ? "flyover"
        : input.roofStyle;

  const rainwater = buildRainwaterDescriptionShort(input);

  if (input.hasPhoto) {
    return `Edit this house photo to add a ${roofLabel} patio roof (${mmToM(input.width)}m wide × ${mmToM(input.projection)}m deep, ${input.roofPitch}° pitch) attached to the house. ${input.postCount} ${describeColour(input.postColour)} posts, ${describeColour(input.roofColour)} Colorbond roof sheets, ${describeColour(input.beamColour)} beams.${rainwater} Photorealistic architectural render, natural lighting, no text or labels.`;
  }

  return `Photorealistic render of a ${roofLabel} patio (${mmToM(input.width)}m × ${mmToM(input.projection)}m, ${input.roofPitch}° pitch) attached to an Australian house. ${input.postCount} ${describeColour(input.postColour)} posts, ${describeColour(input.roofColour)} Colorbond roof, ${describeColour(input.beamColour)} beams.${rainwater} Professional architectural visualisation, no text.`;
}
