/**
 * Render Style Presets
 *
 * Pre-defined style modifiers that append to the base AI render prompt
 * to produce different visual styles (lighting, camera angle, mood).
 */

export interface RenderStylePreset {
  id: string;
  label: string;
  description: string;
  icon: string; // emoji for quick visual identification
  /** Additional prompt text appended to the base prompt */
  promptModifier: string;
  /** Category for grouping */
  category: "lighting" | "angle" | "mood" | "time";
}

export const RENDER_STYLE_PRESETS: RenderStylePreset[] = [
  // Lighting presets
  {
    id: "bright-daylight",
    label: "Bright Daylight",
    description: "Clear sunny day with strong natural light and defined shadows",
    icon: "☀️",
    promptModifier:
      "Lighting: bright midday sun, clear blue sky, strong defined shadows on the ground, vivid colours on all materials, high contrast between sunlit and shaded areas.",
    category: "lighting",
  },
  {
    id: "overcast-soft",
    label: "Soft Overcast",
    description: "Diffused light on a cloudy day, even illumination",
    icon: "☁️",
    promptModifier:
      "Lighting: overcast sky with soft diffused light, no harsh shadows, even illumination across all surfaces, gentle ambient lighting that shows material textures clearly.",
    category: "lighting",
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    description: "Warm sunset light with long shadows and golden tones",
    icon: "🌅",
    promptModifier:
      "Lighting: golden hour sunset, warm amber-orange light casting long dramatic shadows, sky gradient from warm gold to soft purple, warm reflections on metal surfaces, cozy inviting atmosphere.",
    category: "lighting",
  },
  {
    id: "dusk-twilight",
    label: "Dusk / Twilight",
    description: "Blue hour with ambient lighting and warm interior glow",
    icon: "🌆",
    promptModifier:
      "Lighting: dusk/twilight blue hour, deep blue sky with last traces of sunset on the horizon, warm LED downlights illuminating the patio from underneath the roof, soft ambient glow from the house windows, moody atmospheric render.",
    category: "time",
  },
  {
    id: "night-lit",
    label: "Night with Lighting",
    description: "Evening scene with patio LED downlights illuminated",
    icon: "🌙",
    promptModifier:
      "Lighting: nighttime scene, dark sky with stars visible, the patio is illuminated by warm LED downlights recessed into the beams, pool of warm light on the patio floor, house windows glowing warmly, dramatic contrast between lit patio and dark surroundings.",
    category: "time",
  },

  // Camera angle presets
  {
    id: "street-perspective",
    label: "Street Perspective",
    description: "View from the street/front showing the patio in context",
    icon: "🏘️",
    promptModifier:
      "Camera angle: viewed from the street or driveway at eye level (1.6m height), approximately 15-20 metres back, showing the full house facade with the patio visible on the side or rear. Include neighbouring fence line and front landscaping for context.",
    category: "angle",
  },
  {
    id: "aerial-view",
    label: "Aerial View",
    description: "Bird's eye view showing roof and layout from above",
    icon: "🦅",
    promptModifier:
      "Camera angle: elevated aerial/bird's eye view from approximately 45° above and 15m back, looking down at the patio roof and surrounding yard. Show the roof profile clearly, the connection to the house roof, and the outdoor living space below. Include the backyard, fencing, and any landscaping.",
    category: "angle",
  },
  {
    id: "under-patio",
    label: "Under the Patio",
    description: "Interior view looking outward from under the patio roof",
    icon: "🏠",
    promptModifier:
      "Camera angle: standing underneath the patio roof looking outward toward the garden/yard. Show the underside of the roof sheets, beams, and posts framing the view. The ceiling/underside should be clearly visible with the Colorbond finish. Include outdoor furniture (modern outdoor lounge setting) to show scale and livability.",
    category: "angle",
  },
  {
    id: "corner-three-quarter",
    label: "Three-Quarter View",
    description: "Classic architectural render angle showing depth and width",
    icon: "📐",
    promptModifier:
      "Camera angle: classic three-quarter architectural perspective from approximately 10m back at 1.3m height, positioned at roughly 30-40° from the front face of the patio. This angle shows both the width and depth of the structure clearly, with natural perspective convergence.",
    category: "angle",
  },

  // Mood presets
  {
    id: "entertaining",
    label: "Entertaining Scene",
    description: "Styled with outdoor furniture, BBQ, and entertaining setup",
    icon: "🎉",
    promptModifier:
      "Scene styling: the patio is set up for outdoor entertaining with a modern outdoor dining table and chairs for 6-8 people, a built-in BBQ kitchen on one side, potted plants, string lights, and a few decorative cushions. Show the space being used and lived in.",
    category: "mood",
  },
  {
    id: "garden-view",
    label: "Garden Setting",
    description: "Lush landscaping with tropical/native garden surrounds",
    icon: "🌿",
    promptModifier:
      "Scene styling: surrounded by lush Australian native garden with mature plants, ornamental grasses, a few palm trees, established garden beds along the fence line, and a manicured lawn. The landscaping should complement the patio and make it feel established and integrated.",
    category: "mood",
  },
  {
    id: "minimal-clean",
    label: "Clean & Minimal",
    description: "Minimal styling focusing on the structure itself",
    icon: "✨",
    promptModifier:
      "Scene styling: clean and minimal, focus on the architectural structure itself with minimal furniture or decoration. Show the patio against a simple, well-maintained yard with neat lawn and clean concrete or paver floor. Emphasise the quality of materials and construction.",
    category: "mood",
  },
  {
    id: "pool-area",
    label: "Pool Area",
    description: "Patio adjacent to a swimming pool",
    icon: "🏊",
    promptModifier:
      "Scene styling: the patio is positioned adjacent to a swimming pool (in-ground, rectangular, with glass pool fencing). Show the patio providing shade over a pool lounging area with sun loungers. Include pool-safe paving and tropical plants around the pool fence.",
    category: "mood",
  },
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): RenderStylePreset | undefined {
  return RENDER_STYLE_PRESETS.find((p) => p.id === id);
}

/**
 * Get presets grouped by category
 */
export function getPresetsGroupedByCategory(): Record<string, RenderStylePreset[]> {
  const grouped: Record<string, RenderStylePreset[]> = {};
  for (const preset of RENDER_STYLE_PRESETS) {
    if (!grouped[preset.category]) grouped[preset.category] = [];
    grouped[preset.category].push(preset);
  }
  return grouped;
}

/**
 * Category labels for display
 */
export const CATEGORY_LABELS: Record<string, string> = {
  lighting: "Lighting",
  angle: "Camera Angle",
  mood: "Scene Styling",
  time: "Time of Day",
};
