import { useState, useCallback, useRef } from "react";
import { RotateCw } from "lucide-react";

interface BeamEntry {
  type: "Steel" | "Aluminium";
  size: string;
  lm: number;
}

interface BeamPositionPlanProps {
  width: string;
  length: string;
  houseWalls: string[];
  fallDirection: string;
  beamEntries: BeamEntry[];
  /**
   * Encoded as "beamIndex:percentFromTop:orientation"
   * e.g. ["0:25:H", "1:60:V"]
   * Orientation: H = horizontal (parallel to width/A-B), V = vertical (parallel to length/B-C)
   * Legacy format without orientation defaults to house-wall-parallel behaviour.
   */
  beamPositions: string[];
  onBeamPositionsChange: (positions: string[]) => void;
}

const SIDES = ["A-B", "B-C", "C-D", "D-A"] as const;
type Side = (typeof SIDES)[number];
type Orientation = "H" | "V";

/** Parse a beam position string into structured data */
function parseBeamPosition(pos: string): { idx: number; pct: number; orientation: Orientation } | null {
  const parts = pos.split(":");
  if (parts.length < 2) return null;
  const idx = parseInt(parts[0], 10);
  const pct = parseInt(parts[1], 10);
  const orientation = (parts[2] === "V" ? "V" : "H") as Orientation;
  if (isNaN(idx) || isNaN(pct)) return null;
  return { idx, pct, orientation };
}

/** Encode a beam position back to string */
function encodeBeamPosition(idx: number, pct: number, orientation: Orientation): string {
  return `${idx}:${pct}:${orientation}`;
}

/**
 * Interactive SVG for positioning beams within the structure plan.
 * Beams can be horizontal (parallel to A-B/width) or vertical (parallel to B-C/projection).
 * Users can drag beam lines along the perpendicular axis and rotate them 90°.
 */
export default function BeamPositionPlan({
  width,
  length,
  houseWalls,
  fallDirection,
  beamEntries,
  beamPositions,
  onBeamPositionsChange,
}: BeamPositionPlanProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // SVG layout constants
  const svgW = 320;
  const svgH = 260;
  const rectX = 60;
  const rectY = 50;
  const rectW = 200;
  const rectH = 160;

  // Determine default beam orientation based on house wall
  const houseWallSide = houseWalls.length > 0 ? houseWalls[0] : "A-B";
  const defaultOrientation: Orientation =
    houseWallSide === "A-B" || houseWallSide === "C-D" ? "H" : "V";

  // Get parsed beam position for a given index
  const getBeamData = (idx: number): { pct: number; orientation: Orientation } => {
    const existing = beamPositions.find((p) => {
      const parsed = parseBeamPosition(p);
      return parsed && parsed.idx === idx;
    });
    if (existing) {
      const parsed = parseBeamPosition(existing)!;
      return { pct: parsed.pct, orientation: parsed.orientation };
    }
    // Default: evenly distribute beams with default orientation
    const count = beamEntries.length;
    return {
      pct: Math.round(((idx + 1) / (count + 1)) * 100),
      orientation: defaultOrientation,
    };
  };

  // Snap-to-grid: 100mm increments
  const SNAP_MM = 100;

  // Get the total dimension in mm for the drag axis based on orientation
  const getDragAxisMm = useCallback(
    (orientation: Orientation): number => {
      // For horizontal beams, drag axis is vertical (length/projection)
      // For vertical beams, drag axis is horizontal (width)
      const totalDim = orientation === "H"
        ? (parseFloat(length) || 0)
        : (parseFloat(width) || 0);
      return totalDim > 100 ? totalDim : totalDim * 1000;
    },
    [length, width]
  );

  // Snap a percentage to the nearest SNAP_MM increment
  const snapToGrid = useCallback(
    (pct: number, orientation: Orientation): number => {
      const dimMm = getDragAxisMm(orientation);
      if (dimMm <= 0) return Math.round(pct);
      const posMm = (pct / 100) * dimMm;
      const snappedMm = Math.round(posMm / SNAP_MM) * SNAP_MM;
      const snappedPct = (snappedMm / dimMm) * 100;
      return Math.max(5, Math.min(95, snappedPct));
    },
    [getDragAxisMm]
  );

  // Convert mouse position to percentage along the drag axis (snapped to 100mm grid)
  const getPercentFromMouse = useCallback(
    (clientX: number, clientY: number, orientation: Orientation): number => {
      if (!svgRef.current) return 50;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = svgW / rect.width;
      const scaleY = svgH / rect.height;

      let rawPct: number;
      if (orientation === "H") {
        // Horizontal beam: drag vertically (percentage along Y axis)
        const mouseY = (clientY - rect.top) * scaleY;
        rawPct = ((mouseY - rectY) / rectH) * 100;
      } else {
        // Vertical beam: drag horizontally (percentage along X axis)
        const mouseX = (clientX - rect.left) * scaleX;
        rawPct = ((mouseX - rectX) / rectW) * 100;
      }
      return snapToGrid(rawPct, orientation);
    },
    [snapToGrid]
  );

  const handleMouseDown = (idx: number) => {
    setDraggingIdx(idx);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingIdx === null) return;
      const beamData = getBeamData(draggingIdx);
      const pct = getPercentFromMouse(e.clientX, e.clientY, beamData.orientation);
      const newPositions = beamPositions.filter((p) => {
        const parsed = parseBeamPosition(p);
        return !parsed || parsed.idx !== draggingIdx;
      });
      newPositions.push(encodeBeamPosition(draggingIdx, pct, beamData.orientation));
      onBeamPositionsChange(newPositions);
    },
    [draggingIdx, beamPositions, onBeamPositionsChange, getPercentFromMouse]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  // Rotate a beam 90° (toggle H <-> V)
  const handleRotate = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const beamData = getBeamData(idx);
    const newOrientation: Orientation = beamData.orientation === "H" ? "V" : "H";
    // When rotating, reset position to 50% along the new axis
    const newPct = 50;
    const newPositions = beamPositions.filter((p) => {
      const parsed = parseBeamPosition(p);
      return !parsed || parsed.idx !== idx;
    });
    newPositions.push(encodeBeamPosition(idx, newPct, newOrientation));
    onBeamPositionsChange(newPositions);
  };

  // Get beam line coordinates based on orientation and position
  const getBeamLine = (pct: number, orientation: Orientation) => {
    if (orientation === "H") {
      // Horizontal beam: runs left-to-right, positioned vertically
      const y = rectY + (pct / 100) * rectH;
      return { x1: rectX, y1: y, x2: rectX + rectW, y2: y };
    } else {
      // Vertical beam: runs top-to-bottom, positioned horizontally
      const x = rectX + (pct / 100) * rectW;
      return { x1: x, y1: rectY, x2: x, y2: rectY + rectH };
    }
  };

  // Corner labels
  const corners = {
    A: { x: rectX, y: rectY },
    B: { x: rectX + rectW, y: rectY },
    C: { x: rectX + rectW, y: rectY + rectH },
    D: { x: rectX, y: rectY + rectH },
  };

  // Side edges for house wall rendering
  const sideEdges: Record<Side, { x1: number; y1: number; x2: number; y2: number }> = {
    "A-B": { x1: corners.A.x, y1: corners.A.y, x2: corners.B.x, y2: corners.B.y },
    "B-C": { x1: corners.B.x, y1: corners.B.y, x2: corners.C.x, y2: corners.C.y },
    "C-D": { x1: corners.C.x, y1: corners.C.y, x2: corners.D.x, y2: corners.D.y },
    "D-A": { x1: corners.D.x, y1: corners.D.y, x2: corners.A.x, y2: corners.A.y },
  };

  // Calculate distance from edge in mm
  const getDistanceLabel = (pct: number, orientation: Orientation): string => {
    const dimMm = getDragAxisMm(orientation);
    const dist = Math.round((pct / 100) * dimMm);
    return `${dist}mm from edge`;
  };

  return (
    <div className="border rounded-md p-3 bg-muted/30 inline-block">
      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="text-foreground select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
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

        {/* House wall indicators */}
        {houseWalls.map((wall) => {
          const edge = sideEdges[wall as Side];
          if (!edge) return null;
          return (
            <g key={`wall-${wall}`}>
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="oklch(0.5 0.1 50)"
                strokeWidth="8"
                opacity="0.6"
              />
              <text
                x={(edge.x1 + edge.x2) / 2 + (wall === "B-C" ? 16 : wall === "D-A" ? -16 : 0)}
                y={(edge.y1 + edge.y2) / 2 + (wall === "A-B" ? -10 : wall === "C-D" ? 14 : 0)}
                fontSize="7"
                fill="oklch(0.5 0.1 50)"
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight="bold"
                className="pointer-events-none"
              >
                HOUSE
              </text>
            </g>
          );
        })}

        {/* Beam lines (draggable + rotatable) */}
        {beamEntries.map((entry, idx) => {
          const beamData = getBeamData(idx);
          const line = getBeamLine(beamData.pct, beamData.orientation);
          const isActive = draggingIdx === idx;
          const midX = (line.x1 + line.x2) / 2;
          const midY = (line.y1 + line.y2) / 2;
          return (
            <g
              key={`beam-${idx}`}
              onMouseDown={() => handleMouseDown(idx)}
              className="cursor-grab active:cursor-grabbing"
            >
              {/* Invisible wider hitbox for easier grabbing */}
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="transparent"
                strokeWidth="16"
              />
              {/* Visible beam line */}
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={isActive ? "#e53e3e" : "#333"}
                strokeWidth={isActive ? "3" : "2.5"}
                strokeDasharray="10 4"
              />
              {/* Beam label */}
              <text
                x={midX}
                y={midY + (beamData.orientation === "H" ? -8 : 0)}
                dx={beamData.orientation === "V" ? -10 : 0}
                fontSize="8"
                fill={isActive ? "#e53e3e" : "#333"}
                textAnchor="middle"
                fontWeight="600"
                className="pointer-events-none"
              >
                {entry.type === "Steel" ? "S" : "A"} {entry.size}
              </text>
              {/* Distance label */}
              <text
                x={midX}
                y={midY + (beamData.orientation === "H" ? 12 : 14)}
                dx={beamData.orientation === "V" ? -10 : 0}
                fontSize="7"
                fill="#666"
                textAnchor="middle"
                className="pointer-events-none"
              >
                {getDistanceLabel(beamData.pct, beamData.orientation)}
              </text>
              {/* Rotate button (small icon near the beam end) */}
              <g
                onClick={(e) => handleRotate(idx, e)}
                onMouseDown={(e) => e.stopPropagation()}
                className="cursor-pointer"
              >
                <circle
                  cx={line.x2 - (beamData.orientation === "H" ? 12 : 0)}
                  cy={line.y2 - (beamData.orientation === "V" ? 12 : 0)}
                  r="8"
                  fill="white"
                  stroke="#666"
                  strokeWidth="1"
                  opacity="0.9"
                />
                <g
                  transform={`translate(${line.x2 - (beamData.orientation === "H" ? 16 : 4)}, ${line.y2 - (beamData.orientation === "V" ? 16 : 4)})`}
                >
                  <RotateCw size={8} className="text-muted-foreground" />
                </g>
                <title>Rotate beam 90°</title>
              </g>
            </g>
          );
        })}

        {/* Fall direction indicator */}
        {fallDirection && (() => {
          const arrowLen = 24;
          const cx = rectX + rectW - 30;
          const cy = rectY + rectH - 30;
          const isVertical = fallDirection === "A-B" || fallDirection === "C-D";
          let x1: number, y1: number, x2: number, y2: number;
          if (isVertical) {
            const goingDown = fallDirection === "A-B";
            x1 = cx; y1 = goingDown ? cy - arrowLen / 2 : cy + arrowLen / 2;
            x2 = cx; y2 = goingDown ? cy + arrowLen / 2 : cy - arrowLen / 2;
          } else {
            const goingRight = fallDirection === "D-A";
            y1 = cy; y2 = cy;
            x1 = goingRight ? cx - arrowLen / 2 : cx + arrowLen / 2;
            x2 = goingRight ? cx + arrowLen / 2 : cx - arrowLen / 2;
          }
          return (
            <g opacity="0.4">
              <defs>
                <marker id="bp-fall-arrow" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
                  <path d="M0,0 L6,2.5 L0,5" fill="#e53e3e" />
                </marker>
              </defs>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e53e3e" strokeWidth="1" markerEnd="url(#bp-fall-arrow)" />
              <text x={cx} y={cy + 16} fontSize="7" fill="#e53e3e" textAnchor="middle" fontStyle="italic">
                Fall
              </text>
            </g>
          );
        })()}

        {/* Corner labels */}
        <text x={corners.A.x - 12} y={corners.A.y - 6} fontSize="12" fontWeight="bold" fill="currentColor" textAnchor="middle">A</text>
        <text x={corners.B.x + 12} y={corners.B.y - 6} fontSize="12" fontWeight="bold" fill="currentColor" textAnchor="middle">B</text>
        <text x={corners.C.x + 12} y={corners.C.y + 16} fontSize="12" fontWeight="bold" fill="currentColor" textAnchor="middle">C</text>
        <text x={corners.D.x - 12} y={corners.D.y + 16} fontSize="12" fontWeight="bold" fill="currentColor" textAnchor="middle">D</text>

        {/* Dimension labels */}
        {width && (
          <text x={rectX + rectW / 2} y={rectY - 16} fontSize="9" fill="currentColor" textAnchor="middle" opacity="0.7">
            {parseFloat(width) > 100 ? width + "mm" : parseFloat(width).toFixed(2) + "m"} (Width)
          </text>
        )}
        {length && (
          <text
            x={rectX + rectW + 20}
            y={rectY + rectH / 2}
            fontSize="9"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
            transform={`rotate(90, ${rectX + rectW + 20}, ${rectY + rectH / 2})`}
          >
            {parseFloat(length) > 100 ? length + "mm" : parseFloat(length).toFixed(2) + "m"} (Projection)
          </text>
        )}
      </svg>
      <p className="text-[9px] text-muted-foreground mt-1">Drag to reposition. Click <RotateCw size={9} className="inline" /> to rotate 90°.</p>
    </div>
  );
}
