/**
 * Structure Render Prompt Builder
 *
 * Assembles image-generation prompts from structure quote spec sheet data
 * to produce realistic renders of patios, carports, pergolas, rooms, and
 * related Altaspan/Spanline outdoor structures.
 */

export interface StructureRenderInput {
  quoteNumber?: string;
  region?: string;
  siteAddress?: string;
  descriptionOfWork?: string;
  spec: Record<string, unknown>;
  hasPhoto?: boolean;
}

function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metres(value: unknown): string | undefined {
  const parsed = numberValue(value);
  if (parsed == null || parsed <= 0) return undefined;
  const metresValue = parsed > 100 ? parsed / 1000 : parsed;
  return `${metresValue.toFixed(metresValue >= 10 ? 1 : 2).replace(/\.0$/, "")}m`;
}

function millimetres(value: unknown): string | undefined {
  const parsed = numberValue(value);
  if (parsed == null || parsed <= 0) return undefined;
  const mmValue = parsed > 100 ? parsed : parsed * 1000;
  return `${Math.round(mmValue)}mm`;
}

function list(values: Array<string | undefined>): string | undefined {
  const present = values.filter(Boolean) as string[];
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  if (present.length === 2) return `${present[0]} and ${present[1]}`;
  return `${present.slice(0, -1).join(", ")}, and ${present[present.length - 1]}`;
}

function splitCsv(value: unknown): string[] {
  return (text(value) || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function checkedItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && (item as any).checked)
    .map((item) => {
      const label = text((item as any).item) || text((item as any).task);
      const notes = text((item as any).notes);
      return notes && label ? `${label} (${notes})` : label;
    })
    .filter(Boolean) as string[];
}

function addIfPresent(sections: string[], value: string | undefined) {
  if (value) sections.push(value);
}

function colourWithLabel(label: string, value: unknown): string | undefined {
  const colour = text(value);
  return colour ? `${label}: ${colour}` : undefined;
}

function buildDimensionsDescription(spec: Record<string, unknown>): string {
  const width = metres(spec.specWidth);
  const length = metres(spec.specLength);
  const floorHeight = millimetres(spec.specFloorHeight);
  const roofToFloor = millimetres(spec.specRoofToFloor);
  const floorToGround = millimetres(spec.specFloorToGround);
  const houseEave = millimetres(spec.specHouseEave);
  const jobEave = millimetres(spec.specJobEave);
  const roofOverhang = millimetres(spec.specRoofOverhang);
  const postSpacing = metres(spec.specPostSpacing);

  const dimensions = width && length
    ? `The structure footprint is ${width} wide by ${length} projection from the house.`
    : width || length
      ? `The structure has ${list([width && `${width} width`, length && `${length} projection`])}.`
      : undefined;

  const heights = list([
    floorHeight && `floor height ${floorHeight}`,
    roofToFloor && `roof-to-floor height ${roofToFloor}`,
    floorToGround && `floor-to-ground clearance ${floorToGround}`,
    houseEave && `existing house eave ${houseEave}`,
    jobEave && `new structure eave ${jobEave}`,
    roofOverhang && `roof overhang ${roofOverhang}`,
    postSpacing && `post spacing about ${postSpacing}`,
  ]);

  return [dimensions, heights && `Key heights and offsets: ${heights}.`].filter(Boolean).join(" ");
}

function buildStructureDescription(spec: Record<string, unknown>): string | undefined {
  const roofType = text(spec.specRoofType);
  const roofShape = text(spec.specRoofShape);
  const attachment = text(spec.specAttachmentMethod);
  const houseWalls = splitCsv(spec.specHouseWalls);
  const freeStanding = text(spec.specFreeStanding);
  const fall = text(spec.specFall);
  const fallDirection = text(spec.specFallDirection);
  const windCat = text(spec.specWindCat);
  const cpn = text(spec.specCpn);

  const parts = [
    roofShape && `${roofShape} roof shape`,
    roofType && `${roofType} roof system`,
    attachment && attachment !== "None" ? `${attachment} attachment` : undefined,
    freeStanding === "Yes" ? "freestanding layout" : undefined,
    houseWalls.length > 0 ? `attached along house wall side${houseWalls.length > 1 ? "s" : ""} ${houseWalls.join(", ")}` : undefined,
    fall && `roof fall ${fall}${fallDirection ? ` toward ${fallDirection}` : ""}`,
    windCat && `designed for wind category ${windCat}`,
    cpn && `CPN ${cpn}`,
  ].filter(Boolean);

  return parts.length > 0
    ? `Structure specification: ${parts.join("; ")}.`
    : undefined;
}

function buildMaterialsDescription(spec: Record<string, unknown>): string | undefined {
  const materials = [
    text(spec.specRoofType) && `roofing: ${text(spec.specRoofType)}`,
    colourWithLabel("roof top colour", spec.specRoofTopColour),
    colourWithLabel("roof underside colour", spec.specRoofBottomColour),
    text(spec.specBeamSize) && `beams: ${text(spec.specBeamSize)}`,
    colourWithLabel("beam colour", spec.specBeamColour),
    text(spec.specPostsNumber) && `posts: ${text(spec.specPostsNumber)}`,
    text(spec.specPostsType) && `post type: ${text(spec.specPostsType)}`,
    colourWithLabel("post colour", spec.specPostsColour),
    text(spec.specChannelType) && `channel: ${text(spec.specChannelType)}`,
    colourWithLabel("channel colour", spec.specChannelColour),
    text(spec.specGutterType) && `gutter: ${text(spec.specGutterType)}`,
    colourWithLabel("gutter colour", spec.specGutterColour),
    text(spec.specDownpipeType) && `downpipes: ${text(spec.specDownpipeType)}`,
    colourWithLabel("downpipe colour", spec.specDownpipeColour),
    text(spec.specFasciaType) && `fascia: ${text(spec.specFasciaType)}`,
    colourWithLabel("fascia colour", spec.specFasciaColour),
    text(spec.specWallType) && `walls: ${text(spec.specWallType)}`,
    colourWithLabel("wall colour", spec.specWallColour),
  ].filter(Boolean);

  return materials.length > 0
    ? `Use these visible materials and colours: ${materials.join("; ")}.`
    : undefined;
}

function buildAttachmentDescription(spec: Record<string, unknown>): string | undefined {
  const items = [
    text(spec.specFasciaBrackets) && text(spec.specFasciaBrackets) !== "None" ? `${text(spec.specFasciaBrackets)} fascia brackets` : undefined,
    text(spec.specExtendaBrackets) && text(spec.specExtendaBrackets) !== "None" ? `${text(spec.specExtendaBrackets)} extenda brackets` : undefined,
    text(spec.specGableBrackets) && text(spec.specGableBrackets) !== "None" ? `${text(spec.specGableBrackets)} gable brackets` : undefined,
    text(spec.specPopupBrackets) && text(spec.specPopupBrackets) !== "0" ? `${text(spec.specPopupBrackets)} pop-up brackets` : undefined,
    text(spec.specWallFixingBeam) ? `wall fixing beam ${text(spec.specWallFixingBeam)}` : undefined,
    text(spec.specWallFixingBracket) ? `wall fixing bracket ${text(spec.specWallFixingBracket)}` : undefined,
    text(spec.specBracketColour) ? `bracket colour ${text(spec.specBracketColour)}` : undefined,
    text(spec.specFoamCut) ? `foam cut ${text(spec.specFoamCut)}` : undefined,
  ].filter(Boolean);

  return items.length > 0
    ? `Show the connection details where visible: ${items.join("; ")}.`
    : undefined;
}

function buildAddOnsDescription(spec: Record<string, unknown>): string | undefined {
  const items: string[] = [];
  const skylight = text(spec.specSpanlitesType) || text(spec.specSkylightType);
  if (skylight) {
    items.push(`integrated skylight/spanlite panels: ${skylight}`);
  }

  const windowEntries = Array.isArray(spec.specWindowEntries) ? spec.specWindowEntries : [];
  const doorEntries = Array.isArray(spec.specDoorEntries) ? spec.specDoorEntries : [];
  if (windowEntries.length > 0) items.push(`${windowEntries.length} window type${windowEntries.length === 1 ? "" : "s"} in the enclosed walls`);
  if (doorEntries.length > 0) items.push(`${doorEntries.length} door type${doorEntries.length === 1 ? "" : "s"} in the enclosed walls`);

  const wallWork = checkedItems(spec.specWallWorkItems);
  if (wallWork.length > 0) items.push(`wall works: ${wallWork.join(", ")}`);

  const stairs = checkedItems(spec.specStairsChecks);
  if (stairs.length > 0 || text(spec.specStairsSteps)) {
    items.push(`stairs: ${list([text(spec.specStairsSteps) && `${text(spec.specStairsSteps)} steps`, ...stairs])}`);
  }

  const concrete = checkedItems(spec.specConcreteItemChecks);
  if (concrete.length > 0 || text(spec.specConcreteType)) {
    items.push(`concrete works: ${list([text(spec.specConcreteType), text(spec.specConcreteFinish), ...concrete])}`);
  }

  const electrical: string[] = [];
  if (text(spec.specElecFan)) electrical.push(`${text(spec.specElecFan)} fan point`);
  if (text(spec.specElecLights)) electrical.push(`${text(spec.specElecLights)} lights`);
  if (Array.isArray(spec.specElecLightTypes) && spec.specElecLightTypes.length > 0) {
    electrical.push("specified light layout");
  }
  if (Array.isArray(spec.specElecGpos) && spec.specElecGpos.length > 0) {
    electrical.push("specified GPO outlets");
  }
  if (electrical.length > 0) items.push(`electrical: ${electrical.join(", ")}`);

  const plumbing = checkedItems(spec.specPlumbChecks);
  if (plumbing.length > 0) items.push(`plumbing and drainage: ${plumbing.join(", ")}`);

  return items.length > 0
    ? `Include these visible extras where appropriate: ${items.join("; ")}.`
    : undefined;
}

function buildSiteDescription(input: StructureRenderInput): string | undefined {
  const spec = input.spec;
  const parts = [
    input.region && `region: ${input.region}`,
    text(spec.specGroundLevel) && `ground level: ${text(spec.specGroundLevel)}`,
    text(spec.specFallOnGround) && `ground fall: ${text(spec.specFallOnGround)}`,
    text(spec.specHouseRoofType) && `existing house roof: ${text(spec.specHouseRoofType)}`,
    text(spec.specHouseWallType) && `existing house wall: ${text(spec.specHouseWallType)}`,
    text(spec.specSiteAccess) === "1" ? "difficult site access" : undefined,
    text(spec.specSiteRestricted) === "1" ? "restricted work area" : undefined,
    text(spec.specSiteMixed) === "1" ? "mixed-material or angled design" : undefined,
  ].filter(Boolean);

  return parts.length > 0
    ? `Site context to respect in the image: ${parts.join("; ")}.`
    : undefined;
}

function buildExistingWorksDescription(spec: Record<string, unknown>): string | undefined {
  const demolition = checkedItems(spec.specDemolitionWorkItems);
  const existing = checkedItems(spec.specExistingChecks);
  const parts = [
    text(spec.specDemolitionNotes) && `demolition notes: ${text(spec.specDemolitionNotes)}`,
    demolition.length > 0 ? `demolition works: ${demolition.join(", ")}` : undefined,
    text(spec.specExistingNotes) && `existing house works: ${text(spec.specExistingNotes)}`,
    existing.length > 0 ? `existing house checks: ${existing.join(", ")}` : undefined,
    text(spec.specCutBackEave) && `cut back eave required: ${text(spec.specCutBackEave)}`,
    text(spec.specRemoveGutterFlash) && `remove gutter/flashing: ${text(spec.specRemoveGutterFlash)}`,
  ].filter(Boolean);

  return parts.length > 0
    ? `Only show existing-house changes if they are externally visible: ${parts.join("; ")}.`
    : undefined;
}

/**
 * Build a full detailed prompt for structure quote AI render generation.
 */
export function buildStructureRenderPrompt(input: StructureRenderInput): string {
  const sections: string[] = [];
  const spec = input.spec || {};

  if (input.hasPhoto) {
    sections.push(
      "Edit this photograph of a residential property to add the proposed Altaspan/Spanline outdoor structure. " +
      "The render should look photorealistic and architecturally accurate, as if the structure has already been built. " +
      "Maintain the existing house, landscaping, sky, driveway, fences, neighbouring context, and surroundings exactly as they are - only add the new structure and directly required visible connection works."
    );
  } else {
    sections.push(
      "Generate a photorealistic architectural render of a new Altaspan/Spanline outdoor living structure at a modern Australian residential home. " +
      "Show the structure from a 3/4 elevated perspective angle so the roof plane, beams, posts, gutters, downpipes, house attachment, and outdoor living area are clearly visible. " +
      "Include realistic landscaping, paved or decked entertaining area underneath where appropriate, boundary fencing, and natural Australian daylight."
    );
  }

  addIfPresent(sections, input.descriptionOfWork ? `Project description: ${input.descriptionOfWork}` : undefined);
  addIfPresent(sections, buildDimensionsDescription(spec));
  addIfPresent(sections, buildStructureDescription(spec));
  addIfPresent(sections, buildMaterialsDescription(spec));
  addIfPresent(sections, buildAttachmentDescription(spec));
  addIfPresent(sections, buildAddOnsDescription(spec));
  addIfPresent(sections, buildSiteDescription(input));
  addIfPresent(sections, buildExistingWorksDescription(spec));

  sections.push(
    "Keep the design plausible for ACT/NSW residential construction. " +
    "Make all dimensions, roof fall, post count, materials, and colours visually consistent with the specification. " +
    "Do not invent extra structural bays, walls, stairs, glazing, lighting, furniture, pools, vehicles, or decorative features unless the specification implies them."
  );

  sections.push(
    "Render in high-quality photorealistic style with accurate powder-coated metal, Colorbond roofing, glazing, concrete, masonry, and timber textures as specified. " +
    "Use natural lighting, soft shadows, realistic scale, clean construction details, and a professional architectural photography look suitable for a customer proposal."
  );

  return sections.join("\n\n");
}

/**
 * Build a quick/simplified prompt for faster structure render generation.
 */
export function buildStructureRenderPromptQuick(input: StructureRenderInput): string {
  const spec = input.spec || {};
  const width = metres(spec.specWidth);
  const length = metres(spec.specLength);
  const roofType = text(spec.specRoofType) || "outdoor roof";
  const roofShape = text(spec.specRoofShape);
  const roofColour = text(spec.specRoofTopColour);
  const postColour = text(spec.specPostsColour);
  const beamColour = text(spec.specBeamColour);
  const attachment = text(spec.specAttachmentMethod);

  let prompt = input.hasPhoto
    ? "Photorealistic edit of this residential site photo, adding the specified Altaspan/Spanline outdoor structure while preserving the existing property and surroundings. "
    : "Photorealistic architectural render of an Altaspan/Spanline outdoor living structure attached to a modern Australian home. ";

  if (width || length) {
    prompt += `${width || "specified width"} x ${length || "specified projection"} footprint. `;
  }
  prompt += `${roofShape ? `${roofShape} ` : ""}${roofType}. `;
  if (attachment && attachment !== "None") prompt += `${attachment} attachment. `;
  if (roofColour) prompt += `Roof colour ${roofColour}. `;
  if (beamColour) prompt += `Beam colour ${beamColour}. `;
  if (postColour) prompt += `Post colour ${postColour}. `;
  if (text(spec.specGutterType)) prompt += `${text(spec.specGutterType)} gutter with downpipes. `;
  if (text(spec.specPostsNumber)) prompt += `${text(spec.specPostsNumber)} posts. `;
  if (text(spec.specSpanlitesType)) prompt += `Include ${text(spec.specSpanlitesType)} skylight/spanlite panels. `;
  if (Array.isArray(spec.specWindowEntries) && spec.specWindowEntries.length > 0) prompt += "Include specified windows. ";
  if (Array.isArray(spec.specDoorEntries) && spec.specDoorEntries.length > 0) prompt += "Include specified doors. ";

  prompt += "3/4 elevated perspective, natural daylight, accurate Australian residential scale, professional proposal-quality render.";
  return prompt;
}
