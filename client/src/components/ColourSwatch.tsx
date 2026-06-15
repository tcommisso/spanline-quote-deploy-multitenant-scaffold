/**
 * Colourbond Colour Swatch Component
 * Maps standard Colourbond colour names to their hex values for visual preview.
 * Supports combination colours (e.g. "Monument / Thredbo White") rendered as 50/50 split circles.
 */

// Comprehensive Colourbond colour palette
export const COLOURBOND_COLOURS: Record<string, string> = {
  // Standard Range
  "Surfmist": "#E8E4DB",
  "Classic Cream": "#E8DEB5",
  "Paperbark": "#C4B9A0",
  "Evening Haze": "#C5BAA7",
  "Shale Grey": "#B2B1A8",
  "Dune": "#A09882",
  "Gully": "#7D7B6F",
  "Windspray": "#8C8E88",
  "Woodland Grey": "#4C524A",
  "Pale Eucalypt": "#6B7D6B",
  "Wilderness": "#4B5B4B",
  "Cottage Green": "#3D5040",
  "Manor Red": "#6B2D2D",
  "Headland": "#6B4E3D",
  "Jasper": "#5C3D2E",
  "Terrain": "#6B5B4D",
  "Ironstone": "#4B3B30",
  "Cove": "#4A5B6B",
  "Deep Ocean": "#2D3D4B",
  "Basalt": "#4B4B4B",
  "Monument": "#3B3B3B",
  "Night Sky": "#2B2B2B",
  "Matt Surfmist": "#E5E1D8",
  "Matt Basalt": "#4D4D4D",
  "Matt Monument": "#3D3D3D",
  // Ultra range
  "Ultra Surfmist": "#EAE6DD",
  "Ultra Classic Cream": "#EAE0B7",
  "Ultra Paperbark": "#C6BBA2",
  // Thredbo White (common in combos)
  "Thredbo White": "#F5F2EA",
  // Common aliases
  "White": "#FFFFFF",
  "Cream": "#E8DEB5",
  "Grey": "#8C8E88",
  "Green": "#4B5B4B",
  "Red": "#6B2D2D",
  "Blue": "#2D3D4B",
  "Black": "#2B2B2B",
  "Charcoal": "#3B3B3B",
};

/**
 * Find the closest matching colour hex for a given name.
 * Performs case-insensitive partial matching.
 */
export function getColourHex(colourName: string): string | null {
  if (!colourName) return null;
  const lower = colourName.toLowerCase().trim();

  // Exact match first (case-insensitive)
  for (const [name, hex] of Object.entries(COLOURBOND_COLOURS)) {
    if (name.toLowerCase() === lower) return hex;
  }

  // Partial match
  for (const [name, hex] of Object.entries(COLOURBOND_COLOURS)) {
    if (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) return hex;
  }

  return null;
}

/**
 * Detect if a colour name is a combination (contains " / ").
 * Returns the two colour parts if it is, or null if it's a single colour.
 * First colour = top of roof sheet (top-left half of circle)
 * Second colour = underside (bottom-right half of circle)
 */
export function parseCombinationColour(colourName: string): { top: string; bottom: string } | null {
  if (!colourName) return null;
  // Match "Colour1 / Colour2" pattern (with spaces around slash)
  const parts = colourName.split(/\s*\/\s*/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return { top: parts[0].trim(), bottom: parts[1].trim() };
  }
  return null;
}

/**
 * Generate a unique but stable ID for SVG clipPath from a colour name.
 */
function clipId(prefix: string, colour: string): string {
  return `${prefix}-${colour.replace(/[^a-zA-Z0-9]/g, "")}`;
}

/**
 * Renders a 50/50 split circle SVG for combination colours.
 * Top-left half = first colour (top of sheet), bottom-right half = second colour (underside).
 */
function SplitCircle({ topHex, bottomHex, size, title }: { topHex: string; bottomHex: string; size: number; title: string }) {
  const id = clipId("split", title);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-shrink-0" style={{ borderRadius: "50%" }}>
      <title>{title}</title>
      {/* Bottom-right half (second colour / underside) */}
      <circle cx="12" cy="12" r="12" fill={bottomHex} />
      {/* Top-left half (first colour / top of sheet) using clip */}
      <defs>
        <clipPath id={id}>
          <polygon points="0,0 24,0 0,24" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="12" fill={topHex} clipPath={`url(#${id})`} />
      {/* Diagonal divider line */}
      <line x1="1" y1="1" x2="23" y2="23" stroke="rgba(0,0,0,0.2)" strokeWidth="0.7" />
      {/* Border circle */}
      <circle cx="12" cy="12" r="11.5" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
    </svg>
  );
}

interface ColourSwatchProps {
  colour: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ColourSwatch({ colour, size = "sm", showLabel = false, className = "" }: ColourSwatchProps) {
  const combo = parseCombinationColour(colour);
  const sizePx = { sm: 16, md: 24, lg: 32 };

  if (combo) {
    const topHex = getColourHex(combo.top);
    const bottomHex = getColourHex(combo.bottom);
    if (!topHex && !bottomHex) return null;
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <SplitCircle
          topHex={topHex || "#ccc"}
          bottomHex={bottomHex || "#ccc"}
          size={sizePx[size]}
          title={colour}
        />
        {showLabel && <span className="text-xs text-muted-foreground">{colour}</span>}
      </span>
    );
  }

  const hex = getColourHex(colour);
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  if (!hex) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`${sizeClasses[size]} rounded-full border border-border/50 shadow-sm flex-shrink-0`}
        style={{ backgroundColor: hex }}
        title={colour}
      />
      {showLabel && <span className="text-xs text-muted-foreground">{colour}</span>}
    </span>
  );
}

interface ColourSelectItemProps {
  colour: string;
}

/**
 * Renders a colour swatch + label for use inside Select items.
 * Handles combination colours ("Colour1 / Colour2") with 50/50 split circle.
 */
export function ColourSelectPreview({ colour }: ColourSelectItemProps) {
  const combo = parseCombinationColour(colour);

  if (combo) {
    const topHex = getColourHex(combo.top);
    const bottomHex = getColourHex(combo.bottom);
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {(topHex || bottomHex) && (
          <SplitCircle
            topHex={topHex || "#ccc"}
            bottomHex={bottomHex || "#ccc"}
            size={16}
            title={colour}
          />
        )}
        <span className="truncate">{colour}</span>
      </span>
    );
  }

  const hex = getColourHex(colour);
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {hex && (
        <span
          className="w-4 h-4 rounded-full border border-border/50 shadow-sm flex-shrink-0"
          style={{ backgroundColor: hex }}
        />
      )}
      <span className="truncate">{colour}</span>
    </span>
  );
}
