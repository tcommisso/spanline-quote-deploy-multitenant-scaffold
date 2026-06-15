import { useCallback } from "react";

interface GutterPlanDiagramProps {
  width: string;
  length: string;
  gutterSides: string[]; // e.g. ["A-B", "C-D"]
  downpipeMarkers: string[]; // e.g. ["A-B:25", "C-D:75"] — side:percent along that side
  downpipeLocations: string[]; // e.g. ["A", "C"] — multiple corners
  onGutterSidesChange: (sides: string[]) => void;
  onDownpipeMarkersChange: (markers: string[]) => void;
  onDownpipeLocationsChange: (locations: string[]) => void;
  /** Explicit fall direction from the Roof section (e.g. "A-B", "C-D") */
  fallDirection?: string;
}

const SIDES = ["A-B", "B-C", "C-D", "D-A"] as const;
type Side = (typeof SIDES)[number];

// Map corner letters to the corner position on the diagram
const CORNER_LETTERS = ["A", "B", "C", "D"] as const;

/**
 * Interactive SVG gutter plan diagram.
 * - Shows a rectangle with A/B/C/D corner labels (same as Roof Plan).
 * - Click edges to toggle gutter on (highlighted blue).
 * - When gutter is ON: a small red X button appears — click it to remove the gutter.
 * - Click on a gutter edge to place a downpipe marker (green DP).
 * - Click an existing downpipe marker to remove it.
 * - The downpipeLocations prop shows highlighted corner markers synced with the multi-select.
 * - Clicking a corner toggles it in the downpipeLocations array.
 * - Width/Length dimension labels.
 */
export default function GutterPlanDiagram({
  width,
  length,
  gutterSides,
  downpipeMarkers,
  downpipeLocations,
  onGutterSidesChange,
  onDownpipeMarkersChange,
  onDownpipeLocationsChange,
  fallDirection,
}: GutterPlanDiagramProps) {
  // SVG layout constants
  const svgW = 320;
  const svgH = 260;
  const rectX = 60;
  const rectY = 50;
  const rectW = 200;
  const rectH = 160;

  // Corner coordinates: A=top-left, B=top-right, C=bottom-right, D=bottom-left
  const corners: Record<string, { x: number; y: number }> = {
    A: { x: rectX, y: rectY },
    B: { x: rectX + rectW, y: rectY },
    C: { x: rectX + rectW, y: rectY + rectH },
    D: { x: rectX, y: rectY + rectH },
  };

  // Side edge definitions
  const sideEdges: Record<Side, { x1: number; y1: number; x2: number; y2: number }> = {
    "A-B": { x1: corners.A.x, y1: corners.A.y, x2: corners.B.x, y2: corners.B.y },
    "B-C": { x1: corners.B.x, y1: corners.B.y, x2: corners.C.x, y2: corners.C.y },
    "C-D": { x1: corners.C.x, y1: corners.C.y, x2: corners.D.x, y2: corners.D.y },
    "D-A": { x1: corners.D.x, y1: corners.D.y, x2: corners.A.x, y2: corners.A.y },
  };

  // Remove gutter from a side (and its downpipe markers)
  const removeGutter = useCallback((side: Side) => {
    onGutterSidesChange(gutterSides.filter((s) => s !== side));
    onDownpipeMarkersChange(downpipeMarkers.filter((m) => !m.startsWith(side + ":")));
  }, [gutterSides, downpipeMarkers, onGutterSidesChange, onDownpipeMarkersChange]);

  const handleEdgeClick = useCallback((side: Side, e: React.MouseEvent<SVGElement>) => {
    if (!gutterSides.includes(side)) {
      // Toggle gutter ON
      onGutterSidesChange([...gutterSides, side]);
      return;
    }

    // Gutter is already on — place a downpipe marker at click position
    const svg = (e.target as SVGElement).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = svgW / rect.width;
    const scaleY = svgH / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Calculate percentage along the edge
    const edge = sideEdges[side];
    const edgeLen = Math.sqrt((edge.x2 - edge.x1) ** 2 + (edge.y2 - edge.y1) ** 2);
    const dx = clickX - edge.x1;
    const dy = clickY - edge.y1;
    const edgeDx = edge.x2 - edge.x1;
    const edgeDy = edge.y2 - edge.y1;
    const t = Math.max(0, Math.min(1, (dx * edgeDx + dy * edgeDy) / (edgeLen * edgeLen)));
    const pct = Math.round(t * 100);

    const marker = `${side}:${pct}`;
    // Check if there's already a marker nearby (within 8%) — if so, remove it
    const existing = downpipeMarkers.find((m) => {
      if (!m.startsWith(side + ":")) return false;
      const existPct = parseInt(m.split(":")[1], 10);
      return Math.abs(existPct - pct) < 8;
    });

    if (existing) {
      onDownpipeMarkersChange(downpipeMarkers.filter((m) => m !== existing));
    } else {
      onDownpipeMarkersChange([...downpipeMarkers, marker]);
    }

    // Also toggle the nearest corner in downpipeLocations
    const sideLetters = side.split("-"); // e.g. ["A", "B"]
    const nearestCorner = pct <= 50 ? sideLetters[0] : sideLetters[1];
    if (!downpipeLocations.includes(nearestCorner)) {
      onDownpipeLocationsChange([...downpipeLocations, nearestCorner]);
    }
  }, [gutterSides, downpipeMarkers, downpipeLocations, onGutterSidesChange, onDownpipeMarkersChange, onDownpipeLocationsChange, sideEdges]);

  // Handle clicking a corner label to toggle DP location
  const handleCornerClick = useCallback((corner: string) => {
    if (downpipeLocations.includes(corner)) {
      // Remove this corner
      onDownpipeLocationsChange(downpipeLocations.filter((c) => c !== corner));
    } else {
      // Add this corner
      onDownpipeLocationsChange([...downpipeLocations, corner]);
    }
  }, [downpipeLocations, onDownpipeLocationsChange]);

  // Get downpipe marker positions
  const getMarkerPosition = (marker: string) => {
    const [side, pctStr] = marker.split(":");
    const pct = parseInt(pctStr, 10) / 100;
    const edge = sideEdges[side as Side];
    if (!edge) return null;
    return {
      x: edge.x1 + (edge.x2 - edge.x1) * pct,
      y: edge.y1 + (edge.y2 - edge.y1) * pct,
    };
  };

  // Calculate X button position for each gutter side (offset outward from the midpoint)
  const getRemoveButtonPos = (side: Side) => {
    const edge = sideEdges[side];
    const midX = (edge.x1 + edge.x2) / 2;
    const midY = (edge.y1 + edge.y2) / 2;
    // Offset outward from the rectangle
    switch (side) {
      case "A-B": return { x: midX, y: midY - 18 };
      case "C-D": return { x: midX, y: midY + 18 };
      case "B-C": return { x: midX + 18, y: midY };
      case "D-A": return { x: midX - 18, y: midY };
    }
  };

  // Get the position for the DP location indicator (at the corner, offset slightly inward)
  const getDpLocationPos = (corner: string) => {
    const c = corners[corner];
    if (!c) return null;
    // Offset slightly inward from the corner for visibility
    const offsetX = corner === "A" || corner === "D" ? 16 : -16;
    const offsetY = corner === "A" || corner === "B" ? 16 : -16;
    return { x: c.x + offsetX, y: c.y + offsetY };
  };

  return (
    <div className="border rounded-md p-3 bg-muted/30 inline-block">
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="text-foreground">
        {/* Main rectangle */}
        <rect
          x={rectX}
          y={rectY}
          width={rectW}
          height={rectH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />

        {/* Clickable side edges (highlighted when gutter is on) */}
        {SIDES.map((side) => {
          const edge = sideEdges[side];
          const hasGutter = gutterSides.includes(side);
          return (
            <g key={side} onClick={(e) => handleEdgeClick(side, e)} className="cursor-pointer">
              {/* Visible gutter line */}
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={hasGutter ? "oklch(0.6 0.18 250)" : "transparent"}
                strokeWidth={hasGutter ? "6" : "0"}
              />
              {/* Invisible hitbox */}
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="transparent"
                strokeWidth="16"
              />
              {/* Gutter label */}
              {hasGutter && (
                <text
                  x={(edge.x1 + edge.x2) / 2 + (side === "B-C" ? 14 : side === "D-A" ? -14 : 0)}
                  y={(edge.y1 + edge.y2) / 2 + (side === "A-B" ? -10 : side === "C-D" ? 14 : 0)}
                  fontSize="7"
                  fill="oklch(0.5 0.18 250)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                >
                  GUTTER
                </text>
              )}
            </g>
          );
        })}

        {/* Downpipe markers (from clicking on gutter edges) */}
        {downpipeMarkers.map((marker) => {
          const pos = getMarkerPosition(marker);
          if (!pos) return null;
          return (
            <g key={marker} onClick={(e) => { e.stopPropagation(); onDownpipeMarkersChange(downpipeMarkers.filter((m) => m !== marker)); }} className="cursor-pointer">
              <circle cx={pos.x} cy={pos.y} r="7" fill="oklch(0.55 0.2 145)" stroke="white" strokeWidth="1.5" />
              <text x={pos.x} y={pos.y + 1} fontSize="7" fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" className="pointer-events-none select-none">
                DP
              </text>
            </g>
          );
        })}

        {/* Downpipe Location indicators (from multi-select — shown at each selected corner) */}
        {downpipeLocations.map((loc) => {
          const pos = getDpLocationPos(loc);
          if (!pos) return null;
          return (
            <g key={`dp-loc-${loc}`}>
              <circle cx={pos.x} cy={pos.y} r="10" fill="oklch(0.45 0.22 145)" stroke="white" strokeWidth="2" />
              <text x={pos.x} y={pos.y + 1} fontSize="7" fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" className="pointer-events-none select-none">
                DP
              </text>
            </g>
          );
        })}

        {/* Corner labels (clickable to toggle DP location) */}
        {CORNER_LETTERS.map((corner) => {
          const c = corners[corner];
          const isSelected = downpipeLocations.includes(corner);
          const labelX = corner === "A" || corner === "D" ? c.x - 12 : c.x + 12;
          const labelY = corner === "A" || corner === "B" ? c.y - 6 : c.y + 16;
          return (
            <g key={`corner-${corner}`} onClick={(e) => { e.stopPropagation(); handleCornerClick(corner); }} className="cursor-pointer">
              {/* Invisible hitbox around corner label */}
              <circle cx={labelX} cy={labelY - 2} r="12" fill="transparent" />
              <text
                x={labelX}
                y={labelY}
                fontSize="13"
                fontWeight="bold"
                fill={isSelected ? "oklch(0.45 0.22 145)" : "currentColor"}
                textAnchor="middle"
                className="select-none"
              >
                {corner}
              </text>
            </g>
          );
        })}

        {/* Fall direction indicator */}
        {fallDirection && (() => {
          const arrowLen = 30;
          const cx = rectX + rectW / 2;
          const cy = rectY + rectH / 2;
          const isVertical = fallDirection === "A-B" || fallDirection === "C-D";
          let x1: number, y1: number, x2: number, y2: number;
          let labelText: string;
          if (isVertical) {
            const goingDown = fallDirection === "A-B";
            x1 = cx; y1 = goingDown ? cy - arrowLen / 2 : cy + arrowLen / 2;
            x2 = cx; y2 = goingDown ? cy + arrowLen / 2 : cy - arrowLen / 2;
            labelText = goingDown ? "Fall \u2193" : "Fall \u2191";
          } else {
            const goingRight = fallDirection === "D-A";
            y1 = cy; y2 = cy;
            x1 = goingRight ? cx - arrowLen / 2 : cx + arrowLen / 2;
            x2 = goingRight ? cx + arrowLen / 2 : cx - arrowLen / 2;
            labelText = goingRight ? "Fall \u2192" : "Fall \u2190";
          }
          return (
            <g opacity="0.5">
              <defs>
                <marker id="gp-fall-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="#e53e3e" />
                </marker>
              </defs>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e53e3e" strokeWidth="1.5" markerEnd="url(#gp-fall-arrow)" />
              <text x={cx} y={cy + (isVertical ? arrowLen / 2 + 14 : 20)} fontSize="8" fill="#e53e3e" textAnchor="middle" fontStyle="italic">
                {labelText}
              </text>
            </g>
          );
        })()}

        {/* Dimension labels (pointer-events-none so they don't block interactive elements) */}
        {width && (
          <text
            x={rectX + rectW / 2}
            y={rectY - 16}
            fontSize="10"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
            className="pointer-events-none select-none"
          >
            {width}mm (Width)
          </text>
        )}
        {length && (
          <text
            x={rectX + rectW + 18}
            y={rectY + rectH / 2}
            fontSize="10"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
            className="pointer-events-none select-none"
            transform={`rotate(90, ${rectX + rectW + 18}, ${rectY + rectH / 2})`}
          >
            {length}mm (Length)
          </text>
        )}

        {/* Remove gutter X buttons — rendered LAST so they are always on top and clickable */}
        {SIDES.filter((side) => gutterSides.includes(side)).map((side) => {
          const pos = getRemoveButtonPos(side);
          return (
            <g
              key={`remove-${side}`}
              onClick={(e) => { e.stopPropagation(); removeGutter(side); }}
              className="cursor-pointer"
            >
              <circle cx={pos.x} cy={pos.y} r="8" fill="oklch(0.55 0.22 25)" stroke="white" strokeWidth="1" />
              <text
                x={pos.x}
                y={pos.y + 1}
                fontSize="9"
                fill="white"
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight="bold"
                className="pointer-events-none select-none"
              >
                ✕
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
