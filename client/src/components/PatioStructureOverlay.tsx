import { getColorbondHex, type ColorbondColour } from "@/lib/colorbondColours";

export type RoofStyle = "flyover" | "popup-skillion" | "gable" | "hip" | "flat-eave";
export type StructureType = "patio" | "carport";
export type GutterStyle = "none" | "quad" | "half-round" | "fascia";
export type DownpipeStyle = "none" | "round" | "square";

interface PatioStructureOverlayProps {
  roofStyle: RoofStyle;
  structureType?: StructureType;
  width: number; // mm
  projection: number; // mm
  roofPitch: number; // degrees
  beamHeight: number; // mm from floor
  postHeight: number; // mm from floor to underside of beam at post
  floorToGround: number; // mm
  postCount: number;
  flipped?: boolean; // mirror the structure (attachment on right instead of left)
  gutterStyle?: GutterStyle;
  downpipeStyle?: DownpipeStyle;
  colours: {
    roof: ColorbondColour;
    beam: ColorbondColour;
    post: ColorbondColour;
    gutter: ColorbondColour;
    fascia: ColorbondColour;
  };
}

// Scale: 1mm = 0.08px for the SVG viewport (so 6000mm = 480px)
const SCALE = 0.08;
const SVG_WIDTH = 600;
const SVG_HEIGHT = 400;

export function PatioStructureOverlay({
  roofStyle,
  structureType = "patio",
  width,
  projection,
  roofPitch,
  beamHeight,
  postHeight,
  floorToGround,
  postCount,
  flipped = false,
  gutterStyle = "quad",
  downpipeStyle = "round",
  colours,
}: PatioStructureOverlayProps) {
  const roofHex = getColorbondHex(colours.roof);
  const beamHex = getColorbondHex(colours.beam);
  const postHex = getColorbondHex(colours.post);
  const gutterHex = getColorbondHex(colours.gutter);
  const fasciaHex = getColorbondHex(colours.fascia);

  // For flat-eave, override pitch to 3 degrees
  const effectivePitch = roofStyle === "flat-eave" ? 3 : roofPitch;

  // Compute key positions
  const w = width * SCALE;
  const proj = projection * SCALE;
  const pitchRad = (effectivePitch * Math.PI) / 180;
  const roofDrop = proj * Math.tan(pitchRad); // how much the roof drops over the projection

  // Origin: top-left of the structure footprint (house wall side)
  // Wall is on the left, posts on the right
  const wallX = 80; // left margin for house wall
  const groundY = SVG_HEIGHT - 40; // ground level
  const floorY = groundY - floorToGround * SCALE;
  const beamTopY = floorY - beamHeight * SCALE;
  const postTopY = floorY - postHeight * SCALE;
  const roofStartY = beamTopY - 8; // roof sits on top of beam
  const roofEndY = roofStartY + roofDrop;

  // Post positions (evenly spaced along the width)
  const postPositions: number[] = [];
  if (postCount >= 2) {
    for (let i = 0; i < postCount; i++) {
      postPositions.push(wallX + (i / (postCount - 1)) * w);
    }
  } else if (postCount === 1) {
    postPositions.push(wallX + w / 2);
  }

  // Carport has taller clearance label
  const isCarport = structureType === "carport";

  // ─── Gutter profile helper ───────────────────────────────────────────
  // Renders the gutter cross-section at a given position.
  // x,y = top-left of the gutter attachment point (where roof edge meets gutter)
  // gutterW/gutterH = bounding box for the gutter profile
  const renderGutterProfile = (x: number, y: number, gutterW: number, gutterH: number) => {
    if (gutterStyle === "none") return null;
    const stroke = darken(gutterHex);

    if (gutterStyle === "half-round") {
      // Semicircular gutter — arc path
      const cx = x + gutterW / 2;
      const cy = y;
      const rx = gutterW / 2;
      const ry = gutterH;
      return (
        <g>
          {/* Top edge (flat) */}
          <line x1={x} y1={y} x2={x + gutterW} y2={y} stroke={stroke} strokeWidth={0.5} />
          {/* Semicircular arc below */}
          <path
            d={`M ${x},${y} A ${rx},${ry} 0 0 0 ${x + gutterW},${y}`}
            fill={gutterHex}
            stroke={stroke}
            strokeWidth={0.5}
          />
        </g>
      );
    }

    if (gutterStyle === "fascia") {
      // Fascia gutter — taller, integrated with fascia board (flush face)
      const tallH = gutterH * 1.8;
      return (
        <g>
          {/* Tall fascia-integrated gutter face */}
          <rect x={x} y={y - tallH + gutterH} width={gutterW} height={tallH} fill={gutterHex} stroke={stroke} strokeWidth={0.5} />
          {/* Inner lip line to show the channel */}
          <line x1={x + 1.5} y1={y + gutterH * 0.3} x2={x + gutterW - 1.5} y2={y + gutterH * 0.3} stroke={stroke} strokeWidth={0.3} opacity={0.6} />
        </g>
      );
    }

    // Default: "quad" — rectangular gutter
    return (
      <rect x={x} y={y} width={gutterW} height={gutterH} fill={gutterHex} stroke={stroke} strokeWidth={0.5} />
    );
  };

  // ─── Downpipe helper ─────────────────────────────────────────────────
  // Renders a vertical downpipe from gutterBottomY down to floorY at x position.
  // Shows a cross-section indicator at the bottom.
  const renderDownpipe = (cx: number, gutterBottomY: number) => {
    if (downpipeStyle === "none") return null;
    const stroke = darken(gutterHex);
    const pipeWidth = downpipeStyle === "square" ? 5 : 4;
    const pipeTop = gutterBottomY + 1;
    const pipeBottom = floorY - 2;

    if (pipeTop >= pipeBottom) return null; // not enough room

    return (
      <g>
        {/* Vertical pipe line */}
        <line x1={cx} y1={pipeTop} x2={cx} y2={pipeBottom} stroke={gutterHex} strokeWidth={pipeWidth} />
        <line x1={cx} y1={pipeTop} x2={cx} y2={pipeBottom} stroke={stroke} strokeWidth={0.5} />

        {/* Cross-section indicator at bottom */}
        {downpipeStyle === "round" ? (
          <circle cx={cx} cy={pipeBottom + 3} r={3} fill={gutterHex} stroke={stroke} strokeWidth={0.5} />
        ) : (
          <rect x={cx - 3} y={pipeBottom} width={6} height={6} fill={gutterHex} stroke={stroke} strokeWidth={0.5} />
        )}

        {/* Small label */}
        <text x={cx} y={pipeBottom + 12} textAnchor="middle" fontSize={5} fill="#888" fontFamily="monospace">
          {downpipeStyle === "round" ? "⌀90" : "□100"}
        </text>
      </g>
    );
  };

  const renderFlyover = () => {
    const roofLeft = wallX - 10;
    const roofRight = wallX + proj + 20;
    const roofLeftY = roofStartY;
    const roofRightY = roofStartY + roofDrop;

    // Gutter position: at the outer (right) edge of the roof
    const gutterX = roofRight - 8;
    const gutterY = roofRightY + 6;
    const gutterW = 10;
    const gutterH = 8;

    // Downpipe at outer post position
    const outerPostX = wallX + proj;

    return (
      <g>
        {/* House wall (left side) */}
        <rect x={wallX - 12} y={roofStartY - 30} width={12} height={groundY - roofStartY + 30} fill="#8B7355" opacity={0.6} stroke="#5c4e3e" strokeWidth={1} />

        {/* Roof sheets */}
        <polygon
          points={`${roofLeft},${roofLeftY} ${roofRight},${roofRightY} ${roofRight},${roofRightY + 6} ${roofLeft},${roofLeftY + 6}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={1}
          opacity={0.9}
        />
        {/* Roof ribs */}
        {Array.from({ length: 8 }).map((_, i) => {
          const x1 = roofLeft + ((roofRight - roofLeft) / 8) * i;
          const y1 = roofLeftY + ((roofRightY - roofLeftY) / 8) * i;
          return <line key={i} x1={x1} y1={y1} x2={x1} y2={y1 + 6} stroke={darken(roofHex)} strokeWidth={0.5} opacity={0.5} />;
        })}

        {/* Gutter (style-dependent) */}
        {renderGutterProfile(gutterX, gutterY, gutterW, gutterH)}

        {/* Fascia */}
        <rect x={roofRight - 2} y={roofRightY} width={4} height={20} fill={fasciaHex} stroke={darken(fasciaHex)} strokeWidth={0.5} />

        {/* Beam */}
        <rect x={wallX} y={beamTopY} width={proj} height={8} fill={beamHex} stroke={darken(beamHex)} strokeWidth={1} />

        {/* Posts */}
        {postPositions.map((px, i) => {
          if (i === 0) return null; // no post at wall side for flyover
          const xPos = wallX + (proj / (postCount)) * i;
          return (
            <rect key={i} x={xPos - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />
          );
        })}
        {/* Outer posts */}
        <rect x={outerPostX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />

        {/* Downpipe at outer post */}
        {renderDownpipe(outerPostX + 6, gutterY + gutterH)}

        {/* Floor line */}
        <line x1={wallX - 20} y1={floorY} x2={wallX + proj + 30} y2={floorY} stroke="#666" strokeWidth={1} strokeDasharray="4,2" />

        {/* Ground line */}
        <line x1={wallX - 20} y1={groundY} x2={wallX + proj + 30} y2={groundY} stroke="#444" strokeWidth={1.5} />
      </g>
    );
  };

  const renderFlatEave = () => {
    // Flat patio (3°) attached at the eave line — roof connects directly to the house eave/gutter
    const roofLeft = wallX - 5; // starts at eave
    const roofRight = wallX + proj + 20;
    const roofLeftY = roofStartY + 10; // attached lower at eave level (below fascia)
    const roofRightY = roofLeftY + roofDrop; // 3° drop

    // Gutter at outer edge
    const gutterX = roofRight - 8;
    const gutterY = roofRightY + 5;
    const gutterW = 10;
    const gutterH = 7;

    const outerPostX = wallX + proj;

    return (
      <g>
        {/* House wall */}
        <rect x={wallX - 12} y={roofLeftY - 50} width={12} height={groundY - roofLeftY + 50} fill="#8B7355" opacity={0.6} stroke="#5c4e3e" strokeWidth={1} />

        {/* House roof (triangle above eave) */}
        <polygon
          points={`${wallX - 12},${roofLeftY - 50} ${wallX + 30},${roofLeftY - 80} ${wallX - 12},${roofLeftY - 10}`}
          fill="#6B5B45"
          opacity={0.4}
          stroke="#5c4e3e"
          strokeWidth={0.5}
        />

        {/* Eave connection bracket */}
        <rect x={wallX - 6} y={roofLeftY - 4} width={10} height={8} fill="#888" stroke="#555" strokeWidth={0.5} />

        {/* Roof sheets — nearly flat */}
        <polygon
          points={`${roofLeft},${roofLeftY} ${roofRight},${roofRightY} ${roofRight},${roofRightY + 5} ${roofLeft},${roofLeftY + 5}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={1}
          opacity={0.9}
        />
        {/* Roof ribs */}
        {Array.from({ length: 8 }).map((_, i) => {
          const x1 = roofLeft + ((roofRight - roofLeft) / 8) * i;
          const y1 = roofLeftY + ((roofRightY - roofLeftY) / 8) * i;
          return <line key={i} x1={x1} y1={y1} x2={x1} y2={y1 + 5} stroke={darken(roofHex)} strokeWidth={0.5} opacity={0.5} />;
        })}

        {/* Gutter (style-dependent) */}
        {renderGutterProfile(gutterX, gutterY, gutterW, gutterH)}

        {/* Fascia */}
        <rect x={roofRight - 2} y={roofRightY} width={4} height={18} fill={fasciaHex} stroke={darken(fasciaHex)} strokeWidth={0.5} />

        {/* Beam */}
        <rect x={wallX} y={beamTopY} width={proj} height={8} fill={beamHex} stroke={darken(beamHex)} strokeWidth={1} />

        {/* Posts at outer edge */}
        <rect x={outerPostX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />
        {postCount > 2 && (
          <rect x={wallX + proj / 2 - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />
        )}

        {/* Downpipe at outer post */}
        {renderDownpipe(outerPostX + 6, gutterY + gutterH)}

        {/* Floor & ground */}
        <line x1={wallX - 20} y1={floorY} x2={wallX + proj + 30} y2={floorY} stroke="#666" strokeWidth={1} strokeDasharray="4,2" />
        <line x1={wallX - 20} y1={groundY} x2={wallX + proj + 30} y2={groundY} stroke="#444" strokeWidth={1.5} />

        {/* 3° label */}
        <text x={wallX + proj / 2} y={roofLeftY - 8} textAnchor="middle" fontSize={8} fill="#666" fontFamily="monospace">3° flat</text>
      </g>
    );
  };

  const renderPopupSkillion = () => {
    const roofLeft = wallX;
    const roofRight = wallX + proj + 20;
    const roofLeftY = roofStartY - 20;
    const roofRightY = roofLeftY + roofDrop;

    // Gutter at outer edge
    const gutterX = roofRight - 8;
    const gutterY = roofRightY + 6;
    const gutterW = 10;
    const gutterH = 8;

    const outerPostX = wallX + proj;

    return (
      <g>
        {/* House wall */}
        <rect x={wallX - 12} y={roofLeftY - 10} width={12} height={groundY - roofLeftY + 10} fill="#8B7355" opacity={0.6} stroke="#5c4e3e" strokeWidth={1} />

        {/* Pop-up gap (clerestory) */}
        <rect x={wallX - 2} y={roofLeftY + 6} width={6} height={14} fill="none" stroke="#666" strokeWidth={0.5} strokeDasharray="2,1" />

        {/* Roof sheets */}
        <polygon
          points={`${roofLeft - 5},${roofLeftY} ${roofRight},${roofRightY} ${roofRight},${roofRightY + 6} ${roofLeft - 5},${roofLeftY + 6}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={1}
          opacity={0.9}
        />

        {/* Gutter (style-dependent) */}
        {renderGutterProfile(gutterX, gutterY, gutterW, gutterH)}

        {/* Fascia */}
        <rect x={roofRight - 2} y={roofRightY} width={4} height={20} fill={fasciaHex} stroke={darken(fasciaHex)} strokeWidth={0.5} />

        {/* Beam */}
        <rect x={wallX} y={beamTopY} width={proj} height={8} fill={beamHex} stroke={darken(beamHex)} strokeWidth={1} />

        {/* Posts at outer edge */}
        <rect x={outerPostX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />

        {/* Downpipe at outer post */}
        {renderDownpipe(outerPostX + 6, gutterY + gutterH)}

        {/* Floor & ground */}
        <line x1={wallX - 20} y1={floorY} x2={wallX + proj + 30} y2={floorY} stroke="#666" strokeWidth={1} strokeDasharray="4,2" />
        <line x1={wallX - 20} y1={groundY} x2={wallX + proj + 30} y2={groundY} stroke="#444" strokeWidth={1.5} />
      </g>
    );
  };

  const renderGable = () => {
    const roofLeft = wallX - 10;
    const roofRight = wallX + proj + 20;
    const ridgeX = wallX + proj / 2;
    const ridgeY = roofStartY - (proj / 2) * Math.tan(pitchRad);

    // Gutters on both sides at eave level
    const gutterW = 8;
    const gutterH = 6;
    const gutterLeftX = roofLeft - 2;
    const gutterRightX = roofRight - 6;
    const gutterY = roofStartY + 6;

    // Downpipe at outer post (right side)
    const outerPostX = wallX + proj;

    return (
      <g>
        {/* House wall */}
        <rect x={wallX - 12} y={ridgeY - 10} width={12} height={groundY - ridgeY + 10} fill="#8B7355" opacity={0.6} stroke="#5c4e3e" strokeWidth={1} />

        {/* Left roof slope */}
        <polygon
          points={`${roofLeft},${roofStartY} ${ridgeX},${ridgeY} ${ridgeX},${ridgeY + 6} ${roofLeft},${roofStartY + 6}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={1}
          opacity={0.9}
        />
        {/* Right roof slope */}
        <polygon
          points={`${ridgeX},${ridgeY} ${roofRight},${roofStartY} ${roofRight},${roofStartY + 6} ${ridgeX},${ridgeY + 6}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={1}
          opacity={0.9}
        />

        {/* Ridge cap */}
        <rect x={ridgeX - 3} y={ridgeY - 3} width={6} height={6} fill={roofHex} stroke={darken(roofHex)} strokeWidth={1} />

        {/* Gutters both sides (style-dependent) */}
        {renderGutterProfile(gutterLeftX, gutterY, gutterW, gutterH)}
        {renderGutterProfile(gutterRightX, gutterY, gutterW, gutterH)}

        {/* Beam */}
        <rect x={wallX} y={beamTopY} width={proj} height={8} fill={beamHex} stroke={darken(beamHex)} strokeWidth={1} />

        {/* Posts both sides */}
        <rect x={wallX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />
        <rect x={outerPostX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />

        {/* Downpipes at both outer posts */}
        {renderDownpipe(wallX - 6, gutterY + gutterH)}
        {renderDownpipe(outerPostX + 6, gutterY + gutterH)}

        {/* Floor & ground */}
        <line x1={wallX - 20} y1={floorY} x2={wallX + proj + 30} y2={floorY} stroke="#666" strokeWidth={1} strokeDasharray="4,2" />
        <line x1={wallX - 20} y1={groundY} x2={wallX + proj + 30} y2={groundY} stroke="#444" strokeWidth={1.5} />
      </g>
    );
  };

  const renderHip = () => {
    const roofLeft = wallX - 10;
    const roofRight = wallX + proj + 20;
    const ridgeX = wallX + proj / 2;
    const ridgeY = roofStartY - (proj / 2) * Math.tan(pitchRad);
    const hipInset = 30;

    // Continuous gutter along the eave
    const gutterFullW = roofRight - roofLeft + 4;
    const gutterH = 6;
    const gutterY = roofStartY + 6;

    const outerPostX = wallX + proj;

    return (
      <g>
        {/* House wall */}
        <rect x={wallX - 12} y={ridgeY - 10} width={12} height={groundY - ridgeY + 10} fill="#8B7355" opacity={0.6} stroke="#5c4e3e" strokeWidth={1} />

        {/* Main roof */}
        <polygon
          points={`${roofLeft},${roofStartY} ${roofLeft + hipInset},${ridgeY} ${roofRight - hipInset},${ridgeY} ${roofRight},${roofStartY}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={1}
          opacity={0.9}
        />
        {/* Lower edge */}
        <polygon
          points={`${roofLeft},${roofStartY} ${roofRight},${roofStartY} ${roofRight},${roofStartY + 6} ${roofLeft},${roofStartY + 6}`}
          fill={roofHex}
          stroke={darken(roofHex)}
          strokeWidth={0.5}
          opacity={0.8}
        />

        {/* Ridge */}
        <line x1={roofLeft + hipInset} y1={ridgeY} x2={roofRight - hipInset} y2={ridgeY} stroke={darken(roofHex)} strokeWidth={2} />

        {/* Hip lines */}
        <line x1={roofLeft} y1={roofStartY} x2={roofLeft + hipInset} y2={ridgeY} stroke={darken(roofHex)} strokeWidth={1.5} />
        <line x1={roofRight} y1={roofStartY} x2={roofRight - hipInset} y2={ridgeY} stroke={darken(roofHex)} strokeWidth={1.5} />

        {/* Gutter — continuous along eave (style-dependent) */}
        {renderGutterProfile(roofLeft - 2, gutterY, gutterFullW, gutterH)}

        {/* Fascia */}
        <rect x={roofLeft - 2} y={roofStartY} width={3} height={14} fill={fasciaHex} stroke={darken(fasciaHex)} strokeWidth={0.5} />
        <rect x={roofRight - 1} y={roofStartY} width={3} height={14} fill={fasciaHex} stroke={darken(fasciaHex)} strokeWidth={0.5} />

        {/* Beam */}
        <rect x={wallX} y={beamTopY} width={proj} height={8} fill={beamHex} stroke={darken(beamHex)} strokeWidth={1} />

        {/* Posts */}
        <rect x={wallX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />
        <rect x={outerPostX - 4} y={beamTopY + 8} width={8} height={floorY - beamTopY - 8} fill={postHex} stroke={darken(postHex)} strokeWidth={1} />

        {/* Downpipes at both outer corners */}
        {renderDownpipe(wallX - 6, gutterY + gutterH)}
        {renderDownpipe(outerPostX + 6, gutterY + gutterH)}

        {/* Floor & ground */}
        <line x1={wallX - 20} y1={floorY} x2={wallX + proj + 30} y2={floorY} stroke="#666" strokeWidth={1} strokeDasharray="4,2" />
        <line x1={wallX - 20} y1={groundY} x2={wallX + proj + 30} y2={groundY} stroke="#444" strokeWidth={1.5} />
      </g>
    );
  };

  const renderRoof = () => {
    switch (roofStyle) {
      case "flyover": return renderFlyover();
      case "flat-eave": return renderFlatEave();
      case "popup-skillion": return renderPopupSkillion();
      case "gable": return renderGable();
      case "hip": return renderHip();
      default: return renderFlyover();
    }
  };

  // Build the style label
  const getStyleLabel = () => {
    const typeLabel = isCarport ? "Carport" : "";
    const styleLabels: Record<string, string> = {
      "flyover": "Flyover",
      "flat-eave": "Flat (3°) Eave Attached",
      "popup-skillion": "Pop-up Skillion",
      "gable": "Gable",
      "hip": "Hip",
    };
    const style = styleLabels[roofStyle] || roofStyle;
    return isCarport ? `${typeLabel} — ${style}` : style;
  };

  return (
    <svg
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      style={flipped ? { transform: "scaleX(-1)" } : undefined}
    >
      {/* Dimension labels — counter-flip text so it reads correctly */}
      <g style={flipped ? { transform: "scaleX(-1)", transformOrigin: "center" } : undefined}>
        <text x={wallX + proj / 2} y={SVG_HEIGHT - 10} textAnchor="middle" fontSize={9} fill="#333" fontFamily="monospace">
          Projection: {projection}mm
        </text>
        <text x={20} y={floorY - (floorY - beamTopY) / 2} textAnchor="middle" fontSize={8} fill="#333" fontFamily="monospace" transform={`rotate(-90, 20, ${floorY - (floorY - beamTopY) / 2})`}>
          {beamHeight}mm
        </text>
        {/* Roof style label */}
        <text x={SVG_WIDTH - 10} y={16} textAnchor="end" fontSize={9} fill="#555" fontWeight="bold" fontFamily="sans-serif">
          {getStyleLabel()}
        </text>
        {/* Carport clearance indicator */}
        {isCarport && (
          <text x={wallX + proj + 35} y={beamTopY + (floorY - beamTopY) / 2} textAnchor="start" fontSize={8} fill="#0066cc" fontFamily="monospace">
            ↕ {beamHeight}mm clearance
          </text>
        )}
      </g>

      {renderRoof()}
    </svg>
  );
}

// Helper to darken a hex colour for strokes
function darken(hex: string): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
