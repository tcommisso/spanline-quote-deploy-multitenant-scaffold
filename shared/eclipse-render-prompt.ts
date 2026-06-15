/**
 * Eclipse Opening Roof Render Prompt Builder
 *
 * Assembles detailed image-generation prompts from Eclipse quote spec data
 * to produce realistic 3D-style renders of proposed opening roof systems.
 */

export interface EclipseRenderInput {
  // Units summary
  unitCount: number;
  units: Array<{
    bladeWidth: number; // mm
    length: number; // mm
    height: number; // mm
    posts: number;
    bladeColour: string;
    colourbondBladeColour?: string;
    structureColour: string;
    colourbondStructureColour?: string;
    mountType?: string; // freestanding, wall-mount, fascia-mount
    fallDirection?: string;
    houseWalls?: string; // comma-separated A,B,C,D
    lights?: number;
    rainSensor?: boolean;
  }>;

  // Layout
  layoutPreset?: string; // stacked, side-by-side, L-shape, custom
  gap?: number; // mm between units

  // Site context
  hasPhoto?: boolean;
}

/** Colourbond colour to descriptive text */
function colourDescription(colour: string, colourbond?: string): string {
  if (colour === "Powder Coated" && colourbond) {
    return `powder-coated Colorbond "${colourbond}"`;
  }
  return colour === "White" ? "white powder-coated aluminium" : `${colour} finish`;
}

/**
 * Build a full detailed prompt for Eclipse AI render generation.
 */
export function buildEclipseRenderPrompt(input: EclipseRenderInput): string {
  const sections: string[] = [];

  if (input.hasPhoto) {
    sections.push(
      "Edit this photograph of a residential property to add a new Eclipse opening louvre roof system. " +
      "The render should look photorealistic and architecturally accurate, as if the structure has already been installed. " +
      "Maintain the existing house, landscaping, sky, and surroundings exactly as they are — only add the new opening roof structure."
    );
  } else {
    sections.push(
      "Generate a photorealistic architectural render of a new Eclipse opening louvre roof system installed at the rear of a modern Australian residential home. " +
      "Show the structure from a 3/4 elevated perspective angle (approximately 25° above eye level, slightly to the right) so the louvre blades, structural frame, posts, and gutters are all clearly visible. " +
      "Include realistic landscaping (paved entertaining area underneath, garden beds, fence) and a clear blue Australian sky."
    );
  }

  // System description
  sections.push(
    "The Eclipse Opening Roof is a motorised louvre system with aluminium blades that rotate open and closed. " +
    "When open, the blades sit at approximately 160° allowing full sunlight and airflow. " +
    "Show the blades in a partially-open position (approximately 45° angle) so the louvre mechanism is clearly visible — " +
    "individual aluminium blades running parallel across the shorter span, supported by blade carriers/rails on the longer sides."
  );

  // Unit details
  if (input.unitCount === 1) {
    const u = input.units[0];
    const widthM = (u.bladeWidth / 1000).toFixed(1);
    const lengthM = (u.length / 1000).toFixed(1);
    const heightM = (u.height / 1000).toFixed(1);
    const bladeCol = colourDescription(u.bladeColour, u.colourbondBladeColour);
    const structCol = colourDescription(u.structureColour, u.colourbondStructureColour);

    sections.push(
      `The structure is ${widthM}m wide (blade span) × ${lengthM}m long × ${heightM}m high to the underside of the beam. ` +
      `It has ${u.posts} structural posts. ` +
      `The louvre blades are ${bladeCol} and the structural frame (beams, posts, gutters) is ${structCol}.`
    );

    // Mount type
    if (u.mountType === "wall-mount" || (u.houseWalls && u.houseWalls.length > 0)) {
      const walls = u.houseWalls ? u.houseWalls.split(",").map(w => w.trim()).join(" and ") : "one";
      sections.push(
        `The structure is wall-mounted (attached to the house wall on side${u.houseWalls && u.houseWalls.includes(",") ? "s" : ""} ${walls}), with posts only on the free-standing edges.`
      );
    } else {
      sections.push("The structure is freestanding with posts on all corners.");
    }

    // Lights
    if (u.lights && u.lights > 0) {
      sections.push(
        `Include ${u.lights} integrated LED downlights recessed into the blade carriers, providing warm ambient lighting underneath.`
      );
    }

    // Rain sensor
    if (u.rainSensor) {
      sections.push(
        "The system includes a rain sensor (small sensor unit mounted on top of the frame) that automatically closes the blades when rain is detected."
      );
    }
  } else {
    // Multi-unit
    sections.push(
      `The installation consists of ${input.unitCount} connected opening roof units arranged in a ${input.layoutPreset || "side-by-side"} configuration${input.gap ? ` with ${input.gap}mm gap between units` : ""}.`
    );

    input.units.forEach((u, i) => {
      const widthM = (u.bladeWidth / 1000).toFixed(1);
      const lengthM = (u.length / 1000).toFixed(1);
      const bladeCol = colourDescription(u.bladeColour, u.colourbondBladeColour);
      sections.push(
        `Unit ${i + 1}: ${widthM}m × ${lengthM}m with ${bladeCol} blades and ${u.posts} posts.`
      );
    });

    // Shared structure description
    const firstUnit = input.units[0];
    const structCol = colourDescription(firstUnit.structureColour, firstUnit.colourbondStructureColour);
    sections.push(
      `All units share ${structCol} structural framing. Where units adjoin, they share common beams/gutters creating a seamless multi-bay appearance.`
    );
  }

  // Gutter and drainage
  sections.push(
    "Show integrated box gutters along the long sides of the structure that collect rainwater when blades are closed. " +
    "Include round downpipes at the post corners connecting to the gutter system."
  );

  // Quality and style
  sections.push(
    "Render in high-quality photorealistic style with accurate material textures (brushed aluminium, powder-coated surfaces), " +
    "natural lighting showing light filtering through the partially-open louvre blades creating striped shadow patterns on the ground, " +
    "soft shadows, and depth of field. The image should look like professional architectural photography suitable for a customer proposal."
  );

  return sections.join("\n\n");
}

/**
 * Build a quick/simplified prompt for faster generation.
 */
export function buildEclipseRenderPromptQuick(input: EclipseRenderInput): string {
  const u = input.units[0];
  const widthM = (u.bladeWidth / 1000).toFixed(1);
  const lengthM = (u.length / 1000).toFixed(1);
  const bladeCol = colourDescription(u.bladeColour, u.colourbondBladeColour);

  let prompt = `Photorealistic architectural render of a ${widthM}m × ${lengthM}m Eclipse motorised opening louvre roof system `;
  prompt += `with ${bladeCol} blades shown partially open at 45°. `;

  if (input.unitCount > 1) {
    prompt += `${input.unitCount} connected units in ${input.layoutPreset || "side-by-side"} layout. `;
  }

  prompt += "Attached to rear of modern Australian home, 3/4 elevated perspective, natural daylight, ";
  prompt += "light filtering through louvres creating shadow patterns, professional photography quality. ";
  prompt += "Show aluminium frame, integrated gutters, posts, and paved entertaining area underneath.";

  return prompt;
}
