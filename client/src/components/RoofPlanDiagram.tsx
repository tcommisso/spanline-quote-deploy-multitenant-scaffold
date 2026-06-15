import React from "react";

interface RoofPlanDiagramProps {
  width: string;
  length: string;
  fallDirection: string;
  houseWalls: string[];
  onHouseWallsChange: (walls: string[]) => void;
  /** Comma-separated raked edges, e.g. "A-B,B-C" */
  rakedEdges?: string;
}

const SIDES = ["A-B", "B-C", "C-D", "D-A"] as const;
type Side = (typeof SIDES)[number];

/**
 * Interactive SVG roof plan diagram.
 * - Shows a rectangle with A/B/C/D corner labels.
 * - Clickable edges to toggle house wall marking (highlighted amber).
 * - Fall direction arrow showing roof fall.
 * - Parallel lines perpendicular to fall showing roof sheet orientation.
 * - Width/Length dimension labels on relevant sides.
 * - Raked edges shown as diagonal cut lines with shaded cut triangles.
 */
export default function RoofPlanDiagram({
  width,
  length,
  fallDirection,
  houseWalls,
  onHouseWallsChange,
  rakedEdges = "",
}: RoofPlanDiagramProps) {
  const toggleWall = (side: Side) => {
    if (houseWalls.includes(side)) {
      onHouseWallsChange(houseWalls.filter((w) => w !== side));
    } else {
      onHouseWallsChange([...houseWalls, side]);
    }
  };

  // Parse raked edges
  const rakedSides = rakedEdges.split(",").filter(Boolean) as Side[];

  // SVG layout constants
  const svgW = 320;
  const svgH = 240;
  const rectX = 60;
  const rectY = 40;
  const rectW = 200;
  const rectH = 160;

  // Corner coordinates: A=top-left, B=top-right, C=bottom-right, D=bottom-left
  const corners = {
    A: { x: rectX, y: rectY },
    B: { x: rectX + rectW, y: rectY },
    C: { x: rectX + rectW, y: rectY + rectH },
    D: { x: rectX, y: rectY + rectH },
  };

  // Side edge definitions (start, end)
  const sideEdges: Record<Side, { x1: number; y1: number; x2: number; y2: number }> = {
    "A-B": { x1: corners.A.x, y1: corners.A.y, x2: corners.B.x, y2: corners.B.y },
    "B-C": { x1: corners.B.x, y1: corners.B.y, x2: corners.C.x, y2: corners.C.y },
    "C-D": { x1: corners.C.x, y1: corners.C.y, x2: corners.D.x, y2: corners.D.y },
    "D-A": { x1: corners.D.x, y1: corners.D.y, x2: corners.A.x, y2: corners.A.y },
  };

  /**
   * For a raked edge, compute the diagonal cut line and the cut triangle.
   *
   * The cut removes a triangle from one corner of the rectangle.
   * The diagonal runs from one end of the selected edge to the opposite corner
   * of the adjacent edge (i.e., the full corner-to-corner diagonal along that edge).
   *
   * Edge A-B (top): diagonal from corner A to corner B, but offset inward.
   *   Actually: the rake cuts from one end of the edge to the far end of the
   *   perpendicular edge. For simplicity, we show the diagonal from the start
   *   corner of the edge to the midpoint of the opposite edge (representing
   *   a partial rake). For full corner-to-corner rake:
   *
   * Convention: The rake cuts from one corner of the selected edge diagonally
   * to the opposite corner (removing a triangle). The triangle vertices are:
   *   - The two corners of the selected edge
   *   - One corner offset inward by the rake amount
   *
   * For a full rake (default), the diagonal goes corner-to-corner:
   *   A-B: diagonal from A to C (or B to D) — full diagonal of rectangle
   *   B-C: diagonal from B to D (or C to A)
   *   C-D: diagonal from C to A (or D to B)
   *   D-A: diagonal from D to B (or A to C)
   *
   * Simpler approach: show the diagonal line across the raked edge,
   * representing the cut line from one end of the edge to the other end
   * offset by the rake amount (which equals the adjacent dimension).
   */
  const getRakeGeometry = (side: Side) => {
    // The diagonal cut line runs from one corner of the edge to the
    // adjacent corner on the opposite side. This represents the sheet
    // being cut diagonally across that edge.
    switch (side) {
      case "A-B":
        // Cut from corner A (top-left) diagonally to corner C (bottom-right)
        // Triangle removed: A-B-C (top-right triangle)
        // Actually for roof angle cutting: the cut goes from one end of the
        // width edge to the opposite end offset by the projection.
        // Visually: diagonal from corner B down to corner D
        return {
          line: { x1: corners.A.x, y1: corners.A.y, x2: corners.B.x, y2: corners.B.y },
          // Show a small inset triangle to indicate the cut direction
          triangle: `${corners.A.x},${corners.A.y} ${corners.B.x},${corners.B.y} ${corners.B.x},${corners.A.y + rectH * 0.3}`,
          diagonal: { x1: corners.A.x, y1: corners.A.y + rectH * 0.3, x2: corners.B.x, y2: corners.A.y },
        };
      case "B-C":
        return {
          line: { x1: corners.B.x, y1: corners.B.y, x2: corners.C.x, y2: corners.C.y },
          triangle: `${corners.B.x},${corners.B.y} ${corners.C.x},${corners.C.y} ${corners.B.x - rectW * 0.3},${corners.C.y}`,
          diagonal: { x1: corners.B.x, y1: corners.B.y, x2: corners.C.x - rectW * 0.3, y2: corners.C.y },
        };
      case "C-D":
        return {
          line: { x1: corners.C.x, y1: corners.C.y, x2: corners.D.x, y2: corners.D.y },
          triangle: `${corners.C.x},${corners.C.y} ${corners.D.x},${corners.D.y} ${corners.D.x},${corners.D.y - rectH * 0.3}`,
          diagonal: { x1: corners.C.x, y1: corners.C.y, x2: corners.D.x, y2: corners.D.y - rectH * 0.3 },
        };
      case "D-A":
        return {
          line: { x1: corners.D.x, y1: corners.D.y, x2: corners.A.x, y2: corners.A.y },
          triangle: `${corners.D.x},${corners.D.y} ${corners.A.x},${corners.A.y} ${corners.A.x + rectW * 0.3},${corners.A.y}`,
          diagonal: { x1: corners.D.x, y1: corners.D.y, x2: corners.A.x + rectW * 0.3, y2: corners.A.y },
        };
    }
  };

  // Fall direction arrow coordinates
  const getFallArrow = () => {
    const cx = rectX + rectW / 2;
    const cy = rectY + rectH / 2;
    const arrowLen = 50;

    switch (fallDirection) {
      case "A-B": // Fall from A-B side toward C-D (top to bottom)
        return { x1: cx, y1: cy - arrowLen, x2: cx, y2: cy + arrowLen, dir: "vertical" };
      case "C-D": // Fall from C-D side toward A-B (bottom to top)
        return { x1: cx, y1: cy + arrowLen, x2: cx, y2: cy - arrowLen, dir: "vertical" };
      case "B-C": // Fall from B-C side toward D-A (right to left)
        return { x1: cx + arrowLen, y1: cy, x2: cx - arrowLen, y2: cy, dir: "horizontal" };
      case "D-A": // Fall from D-A side toward B-C (left to right)
        return { x1: cx - arrowLen, y1: cy, x2: cx + arrowLen, y2: cy, dir: "horizontal" };
      default:
        return null;
    }
  };

  // Roof sheet lines (perpendicular to fall direction)
  const getSheetLines = () => {
    if (!fallDirection) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const numLines = 5;

    if (fallDirection === "A-B" || fallDirection === "C-D") {
      // Fall is vertical, sheets run horizontally
      const spacing = rectW / (numLines + 1);
      for (let i = 1; i <= numLines; i++) {
        const x = rectX + spacing * i;
        lines.push({ x1: x, y1: rectY + 8, x2: x, y2: rectY + rectH - 8 });
      }
    } else {
      // Fall is horizontal, sheets run vertically
      const spacing = rectH / (numLines + 1);
      for (let i = 1; i <= numLines; i++) {
        const y = rectY + spacing * i;
        lines.push({ x1: rectX + 8, y1: y, x2: rectX + rectW - 8, y2: y });
      }
    }
    return lines;
  };

  const fallArrow = getFallArrow();
  const sheetLines = getSheetLines();

  // Arrowhead marker
  const arrowId = "roof-fall-arrow";

  return (
    <div className="border rounded-md p-3 bg-muted/30 inline-block">
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="text-foreground">
        <defs>
          <marker
            id={arrowId}
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 8 3, 0 6" fill="oklch(0.65 0.2 30)" />
          </marker>
        </defs>

        {/* Roof sheet direction lines */}
        {sheetLines.map((line, i) => (
          <line
            key={`sheet-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.25"
            strokeDasharray="4 3"
          />
        ))}

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

        {/* ═══ Raked edge visualisation ═══ */}
        {rakedSides.map((side) => {
          const geom = getRakeGeometry(side);
          if (!geom) return null;
          return (
            <g key={`rake-${side}`}>
              {/* Shaded triangle showing the cut area */}
              <polygon
                points={geom.triangle}
                fill="oklch(0.85 0.12 30)"
                opacity="0.35"
              />
              {/* Diagonal cut line */}
              <line
                x1={geom.diagonal.x1}
                y1={geom.diagonal.y1}
                x2={geom.diagonal.x2}
                y2={geom.diagonal.y2}
                stroke="oklch(0.55 0.2 30)"
                strokeWidth="2"
                strokeDasharray="6 3"
              />
              {/* Cut label */}
              <text
                x={(geom.diagonal.x1 + geom.diagonal.x2) / 2}
                y={(geom.diagonal.y1 + geom.diagonal.y2) / 2 - 6}
                fontSize="7"
                fill="oklch(0.55 0.2 30)"
                textAnchor="middle"
                fontWeight="bold"
                className="pointer-events-none select-none"
              >
                CUT
              </text>
            </g>
          );
        })}

        {/* Clickable side edges (highlighted when house wall) */}
        {SIDES.map((side) => {
          const edge = sideEdges[side];
          const isWall = houseWalls.includes(side);
          return (
            <g key={side} onClick={() => toggleWall(side)} className="cursor-pointer">
              {/* Visible edge line */}
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={isWall ? "oklch(0.75 0.15 70)" : "transparent"}
                strokeWidth={isWall ? "6" : "0"}
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
              {/* House wall label */}
              {isWall && (
                <text
                  x={(edge.x1 + edge.x2) / 2 + (side === "B-C" ? 8 : side === "D-A" ? -8 : 0)}
                  y={(edge.y1 + edge.y2) / 2 + (side === "A-B" ? -8 : side === "C-D" ? 12 : 0)}
                  fontSize="7"
                  fill="oklch(0.65 0.15 70)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                >
                  HOUSE
                </text>
              )}
            </g>
          );
        })}

        {/* Fall direction arrow */}
        {fallArrow && (
          <line
            x1={fallArrow.x1}
            y1={fallArrow.y1}
            x2={fallArrow.x2}
            y2={fallArrow.y2}
            stroke="oklch(0.65 0.2 30)"
            strokeWidth="2.5"
            markerEnd={`url(#${arrowId})`}
          />
        )}

        {/* Fall label */}
        {fallArrow && (
          <text
            x={fallArrow.dir === "vertical" ? fallArrow.x1 + 14 : (fallArrow.x1 + fallArrow.x2) / 2}
            y={fallArrow.dir === "horizontal" ? fallArrow.y1 - 10 : (fallArrow.y1 + fallArrow.y2) / 2}
            fontSize="9"
            fill="oklch(0.65 0.2 30)"
            textAnchor="middle"
            fontWeight="bold"
            className="pointer-events-none select-none"
          >
            FALL
          </text>
        )}

        {/* Corner labels */}
        <text x={corners.A.x - 12} y={corners.A.y - 6} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">A</text>
        <text x={corners.B.x + 12} y={corners.B.y - 6} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">B</text>
        <text x={corners.C.x + 12} y={corners.C.y + 16} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">C</text>
        <text x={corners.D.x - 12} y={corners.D.y + 16} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">D</text>

        {/* Dimension labels */}
        {/* Width = A-B (top side) */}
        {width && (
          <text
            x={rectX + rectW / 2}
            y={rectY - 16}
            fontSize="10"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
          >
            {width}mm (Width)
          </text>
        )}
        {/* Length = B-C (right side) */}
        {length && (
          <text
            x={rectX + rectW + 18}
            y={rectY + rectH / 2}
            fontSize="10"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
            transform={`rotate(90, ${rectX + rectW + 18}, ${rectY + rectH / 2})`}
          >
            {length}mm (Length)
          </text>
        )}
      </svg>
    </div>
  );
}
