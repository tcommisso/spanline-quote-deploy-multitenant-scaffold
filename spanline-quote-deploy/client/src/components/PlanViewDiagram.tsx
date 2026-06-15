import React, { useMemo } from "react";
import { Label } from "@/components/ui/label";

interface BeamEntry {
  type: "Steel" | "Aluminium";
  size: string;
  lm: number;
}

interface PlanViewDiagramProps {
  /** Structure width in mm (e.g. "4600") */
  width: string;
  /** Structure length/projection in mm (e.g. "6000") */
  length: string;
  /** Post positions encoded as "side:percent" e.g. ["B-C:0", "B-C:50", "B-C:100", "C-D:50"] */
  postPositions: string[];
  /** House walls (sides attached to house — no posts on these sides) */
  houseWalls?: string[];
  /** Beam size label (legacy — used only if no beamPositions provided) */
  beamSize?: string;
  /** Roof type label */
  roofType?: string;
  /** Post spacing (mm) */
  postSpacing?: string;
  /** Whether this is read-only (for Check Measure workbook) */
  readOnly?: boolean;
  /** Connection type code (e.g. "FLY", "BCH", "POP") */
  connectionType?: string;
  /** URL to the connection type image from the image library */
  connectionImageUrl?: string;
  /** Explicit fall direction from the Roof section (e.g. "A-B", "C-D") */
  fallDirection?: string;
  /** Whether beams have been added in the specsheet (legacy) */
  hasBeams?: boolean;
  /** Dynamic beam positions from BeamPositionPlan: "idx:pct:orientation" */
  beamPositions?: string[];
  /** Beam entries for labels */
  beamEntries?: BeamEntry[];
  /** Gutter sides (e.g. ["A-B", "C-D"]) */
  gutterSides?: string[];
  /** Downpipe markers (e.g. ["A-B:25", "C-D:75"]) — side:percent along that side */
  downpipeMarkers?: string[];
  /** Downpipe locations at corners (e.g. ["A", "C"]) */
  downpipeLocations?: string[];
  /** Post type/size label (e.g. "90×90 SHS") */
  postSize?: string;
}

const SIDES = ["A-B", "B-C", "C-D", "D-A"] as const;
type Side = (typeof SIDES)[number];
type Orientation = "H" | "V";

/** Parse a beam position string */
function parseBeamPosition(pos: string): { idx: number; pct: number; orientation: Orientation } | null {
  const parts = pos.split(":");
  if (parts.length < 2) return null;
  const idx = parseInt(parts[0], 10);
  const pct = parseInt(parts[1], 10);
  const orientation = (parts[2] === "V" ? "V" : "H") as Orientation;
  if (isNaN(idx) || isNaN(pct)) return null;
  return { idx, pct, orientation };
}

/**
 * Plan View Diagram — top-down view of the structure footprint.
 * Shows the A-B-C-D rectangle with:
 * - Dimension arrows on all sides
 * - Post positions as filled circles with size label
 * - House wall as thick hatched line
 * - Dynamic beam lines with size labels
 * - Gutter lines (blue) on selected sides
 * - Downpipe markers (green DP circles) on gutter edges and corners
 * - Roof direction indicator
 * - Scale reference
 */
export default function PlanViewDiagram({
  width,
  length,
  postPositions,
  houseWalls = [],
  beamSize,
  roofType,
  postSpacing,
  readOnly = false,
  connectionType,
  connectionImageUrl,
  fallDirection,
  hasBeams = true,
  beamPositions = [],
  beamEntries = [],
  gutterSides = [],
  downpipeMarkers = [],
  downpipeLocations = [],
  postSize,
}: PlanViewDiagramProps) {
  // Parse dimensions (could be in mm or metres)
  const dims = useMemo(() => {
    let w = parseFloat(width) || 0;
    let l = parseFloat(length) || 0;
    // If values look like metres (< 50), convert to mm for display
    if (w > 0 && w < 50) w = w * 1000;
    if (l > 0 && l < 50) l = l * 1000;
    return { widthMm: w, lengthMm: l };
  }, [width, length]);

  // SVG layout
  const svgW = 600;
  const svgH = 500;
  const margin = 80;
  const rectX = margin;
  const rectY = margin;
  const rectW = svgW - margin * 2; // 440
  const rectH = svgH - margin * 2; // 340

  // Corner coordinates: A=top-left, B=top-right, C=bottom-right, D=bottom-left
  const corners = {
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

  // Side lengths for display
  const sideLengths: Record<Side, string> = useMemo(() => {
    const w = dims.widthMm;
    const l = dims.lengthMm;
    return {
      "A-B": w ? `${w.toFixed(0)}mm` : "",
      "B-C": l ? `${l.toFixed(0)}mm` : "",
      "C-D": w ? `${w.toFixed(0)}mm` : "",
      "D-A": l ? `${l.toFixed(0)}mm` : "",
    };
  }, [dims]);

  const isHouseWall = (side: Side) => houseWalls.includes(side);

  // Get marker position in SVG coordinates — supports both edge posts ("side:pct") and beam-mounted posts ("beam:idx:pct")
  const getMarkerPosition = (marker: string) => {
    if (marker.startsWith("beam:")) {
      // Beam-mounted post: "beam:beamIdx:pct"
      const parts = marker.split(":");
      const beamIdx = parseInt(parts[1], 10);
      const pct = parseInt(parts[2], 10) / 100;
      const beam = dynamicBeams.find((b) => b.idx === beamIdx);
      if (!beam) return null;
      return {
        x: beam.x1 + (beam.x2 - beam.x1) * pct,
        y: beam.y1 + (beam.y2 - beam.y1) * pct,
        side: "C-D" as Side, // fallback side for label positioning
        pct: parseInt(parts[2], 10),
        onBeam: true,
      };
    }
    // Edge post: "side:pct"
    const [side, pctStr] = marker.split(":");
    const pct = parseInt(pctStr, 10) / 100;
    const edge = sideEdges[side as Side];
    if (!edge) return null;
    return {
      x: edge.x1 + (edge.x2 - edge.x1) * pct,
      y: edge.y1 + (edge.y2 - edge.y1) * pct,
      side: side as Side,
      pct: parseInt(pctStr, 10),
      onBeam: false,
    };
  };

  // Parse dynamic beam positions into renderable lines
  const dynamicBeams = useMemo(() => {
    if (beamPositions.length === 0) return [];
    return beamPositions
      .map((pos) => {
        const parsed = parseBeamPosition(pos);
        if (!parsed) return null;
        const { idx, pct, orientation } = parsed;
        const entry = beamEntries[idx];
        let x1: number, y1: number, x2: number, y2: number;
        if (orientation === "H") {
          // Horizontal beam: runs left-to-right, positioned vertically by pct
          const y = rectY + (pct / 100) * rectH;
          x1 = rectX; y1 = y; x2 = rectX + rectW; y2 = y;
        } else {
          // Vertical beam: runs top-to-bottom, positioned horizontally by pct
          const x = rectX + (pct / 100) * rectW;
          x1 = x; y1 = rectY; x2 = x; y2 = rectY + rectH;
        }
        const label = entry
          ? `${entry.type === "Steel" ? "S" : "A"} ${entry.size}`
          : `Beam ${idx + 1}`;
        return { x1, y1, x2, y2, label, orientation, idx };
      })
      .filter(Boolean) as Array<{
        x1: number; y1: number; x2: number; y2: number;
        label: string; orientation: Orientation; idx: number;
      }>;
  }, [beamPositions, beamEntries, rectX, rectY, rectW, rectH]);

  // Legacy fallback: hard-coded beam position (only if no dynamic beams)
  const legacyBeamLine = useMemo(() => {
    if (dynamicBeams.length > 0) return null; // Dynamic beams take priority
    if (!hasBeams) return null;
    const beamOffset = 25;
    if (houseWalls.includes("A-B")) {
      return { x1: rectX, y1: rectY + beamOffset, x2: rectX + rectW, y2: rectY + beamOffset };
    } else if (houseWalls.includes("C-D")) {
      return { x1: rectX, y1: rectY + rectH - beamOffset, x2: rectX + rectW, y2: rectY + rectH - beamOffset };
    } else if (houseWalls.includes("D-A")) {
      return { x1: rectX + beamOffset, y1: rectY, x2: rectX + beamOffset, y2: rectY + rectH };
    } else if (houseWalls.includes("B-C")) {
      return { x1: rectX + rectW - beamOffset, y1: rectY, x2: rectX + rectW - beamOffset, y2: rectY + rectH };
    }
    return { x1: rectX, y1: rectY + beamOffset, x2: rectX + rectW, y2: rectY + beamOffset };
  }, [houseWalls, hasBeams, dynamicBeams.length, rectX, rectY, rectW, rectH]);

  // Get DP location position (offset inward from corner)
  const getDpLocationPos = (loc: string) => {
    const c = corners[loc as keyof typeof corners];
    if (!c) return null;
    const inset = 20;
    let x = c.x;
    let y = c.y;
    if (loc === "A") { x += inset; y += inset; }
    else if (loc === "B") { x -= inset; y += inset; }
    else if (loc === "C") { x -= inset; y -= inset; }
    else if (loc === "D") { x += inset; y -= inset; }
    return { x, y };
  };

  return (
    <div className="relative w-full border rounded-lg bg-white p-2 sm:p-4 overflow-hidden">
      <Label className="text-xs font-medium text-muted-foreground mb-2 block">
        Plan View (Top-Down) {readOnly ? "— from spec sheet" : ""}
      </Label>

      <div className="relative w-full" style={{ aspectRatio: "6/5" }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ maxHeight: "500px" }}
        >
          <rect x="0" y="0" width={svgW} height={svgH} fill="white" />

          {/* Arrow markers */}
          <defs>
            <marker id="pvArrR" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="black" />
            </marker>
            <marker id="pvArrL" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
              <polygon points="8 0, 0 3, 8 6" fill="black" />
            </marker>
            {/* Hatch pattern for house wall */}
            <pattern id="houseHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#8B4513" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* ═══ Main structure rectangle ═══ */}
          <rect
            x={rectX}
            y={rectY}
            width={rectW}
            height={rectH}
            fill="none"
            stroke="black"
            strokeWidth="2"
          />

          {/* ═══ House walls (thick hatched) ═══ */}
          {SIDES.map((side) => {
            if (!isHouseWall(side)) return null;
            const edge = sideEdges[side];
            const isHorizontal = side === "A-B" || side === "C-D";
            const wallThickness = 12;
            
            if (isHorizontal) {
              const yOffset = side === "A-B" ? -wallThickness : 0;
              return (
                <g key={`wall-${side}`}>
                  <rect
                    x={edge.x1}
                    y={edge.y1 + yOffset}
                    width={Math.abs(edge.x2 - edge.x1)}
                    height={wallThickness}
                    fill="url(#houseHatch)"
                    stroke="#8B4513"
                    strokeWidth="1.5"
                  />
                  <text
                    x={(edge.x1 + edge.x2) / 2}
                    y={edge.y1 + yOffset + wallThickness / 2 + 1}
                    fontSize="9"
                    fill="#8B4513"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontWeight="bold"
                  >
                    HOUSE WALL
                  </text>
                </g>
              );
            } else {
              const xOffset = side === "D-A" ? -wallThickness : 0;
              return (
                <g key={`wall-${side}`}>
                  <rect
                    x={edge.x1 + xOffset}
                    y={edge.y1}
                    width={wallThickness}
                    height={Math.abs(edge.y2 - edge.y1)}
                    fill="url(#houseHatch)"
                    stroke="#8B4513"
                    strokeWidth="1.5"
                  />
                  <text
                    x={edge.x1 + xOffset + wallThickness / 2}
                    y={(edge.y1 + edge.y2) / 2}
                    fontSize="9"
                    fill="#8B4513"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontWeight="bold"
                    transform={`rotate(-90, ${edge.x1 + xOffset + wallThickness / 2}, ${(edge.y1 + edge.y2) / 2})`}
                  >
                    HOUSE WALL
                  </text>
                </g>
              );
            }
          })}

          {/* ═══ Gutter lines (blue, thick) ═══ */}
          {gutterSides.map((side) => {
            const edge = sideEdges[side as Side];
            if (!edge) return null;
            const isHorizontal = side === "A-B" || side === "C-D";
            // Offset gutter line slightly inside the structure edge
            const gutterOffset = 6;
            let gx1 = edge.x1, gy1 = edge.y1, gx2 = edge.x2, gy2 = edge.y2;
            if (isHorizontal) {
              const yOff = side === "A-B" ? gutterOffset : -gutterOffset;
              gy1 += yOff; gy2 += yOff;
            } else {
              const xOff = side === "D-A" ? gutterOffset : -gutterOffset;
              gx1 += xOff; gx2 += xOff;
            }
            // Label position
            const labelX = (gx1 + gx2) / 2 + (side === "B-C" ? -16 : side === "D-A" ? 16 : 0);
            const labelY = (gy1 + gy2) / 2 + (side === "A-B" ? 12 : side === "C-D" ? -10 : 0);
            return (
              <g key={`gutter-${side}`}>
                <line
                  x1={gx1} y1={gy1} x2={gx2} y2={gy2}
                  stroke="#2563eb"
                  strokeWidth="5"
                  opacity="0.7"
                />
                <text
                  x={labelX}
                  y={labelY}
                  fontSize="8"
                  fill="#1d4ed8"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                  transform={!isHorizontal ? `rotate(-90, ${labelX}, ${labelY})` : undefined}
                >
                  GUTTER
                </text>
              </g>
            );
          })}

          {/* ═══ Dynamic beam lines (from BeamPositionPlan) ═══ */}
          {dynamicBeams.map((beam, i) => {
            // Position label at the end or center of beam
            const isH = beam.orientation === "H";
            // For horizontal beams: label at right end; for vertical: label at bottom
            const labelX = isH ? beam.x2 - 4 : beam.x1 - 12;
            const labelY = isH ? beam.y1 - 8 : beam.y2 - 4;
            return (
              <g key={`dbeam-${i}`}>
                <line
                  x1={beam.x1}
                  y1={beam.y1}
                  x2={beam.x2}
                  y2={beam.y2}
                  stroke="#333"
                  strokeWidth="3"
                  strokeDasharray="12 4"
                />
                <text
                  x={labelX}
                  y={labelY}
                  fontSize="10"
                  fill="#333"
                  textAnchor={isH ? "end" : "middle"}
                  fontWeight="600"
                  transform={!isH ? `rotate(-90, ${labelX}, ${labelY})` : undefined}
                >
                  {beam.label}
                </text>
              </g>
            );
          })}

          {/* ═══ Legacy beam line (fallback if no dynamic beams) ═══ */}
          {legacyBeamLine && (
            <>
              <line
                x1={legacyBeamLine.x1}
                y1={legacyBeamLine.y1}
                x2={legacyBeamLine.x2}
                y2={legacyBeamLine.y2}
                stroke="#333"
                strokeWidth="3"
                strokeDasharray="12 4"
              />
              <text
                x={(legacyBeamLine.x1 + legacyBeamLine.x2) / 2}
                y={(legacyBeamLine.y1 + legacyBeamLine.y2) / 2 - 8}
                fontSize="9"
                fill="#333"
                textAnchor="middle"
                fontWeight="600"
              >
                BEAM {beamSize ? `(${beamSize})` : ""}
              </text>
            </>
          )}

          {/* ═══ Roof direction arrows ═══ */}
          {(() => {
            const arrowLen = 40;
            const arrows: React.JSX.Element[] = [];
            
            let effectiveFall = fallDirection;
            if (!effectiveFall) {
              if (houseWalls.includes("A-B")) effectiveFall = "A-B";
              else if (houseWalls.includes("C-D")) effectiveFall = "C-D";
              else if (houseWalls.includes("D-A")) effectiveFall = "D-A";
              else if (houseWalls.includes("B-C")) effectiveFall = "B-C";
            }
            
            if (!effectiveFall) return null;

            const isVertical = effectiveFall === "A-B" || effectiveFall === "C-D";
            
            if (isVertical) {
              const arrowSpacing = rectW / 5;
              const goingDown = effectiveFall === "A-B";
              const startY = goingDown ? rectY + 60 : rectY + rectH - 60;
              const endY = goingDown ? startY + arrowLen : startY - arrowLen;
              
              for (let i = 1; i <= 4; i++) {
                const x = rectX + arrowSpacing * i;
                arrows.push(
                  <line
                    key={`roof-arrow-${i}`}
                    x1={x}
                    y1={startY}
                    x2={x}
                    y2={endY}
                    stroke="#999"
                    strokeWidth="1"
                    markerEnd="url(#pvArrR)"
                  />
                );
              }
              arrows.push(
                <text
                  key="roof-label"
                  x={rectX + rectW / 2}
                  y={(startY + endY) / 2 + 18}
                  fontSize="9"
                  fill="#999"
                  textAnchor="middle"
                  fontStyle="italic"
                >
                  Roof fall direction {goingDown ? "\u2193" : "\u2191"}
                </text>
              );
            } else {
              const arrowSpacing = rectH / 5;
              const goingRight = effectiveFall === "D-A";
              const startX = goingRight ? rectX + 60 : rectX + rectW - 60;
              const endX = goingRight ? startX + arrowLen : startX - arrowLen;
              
              for (let i = 1; i <= 4; i++) {
                const y = rectY + arrowSpacing * i;
                arrows.push(
                  <line
                    key={`roof-arrow-${i}`}
                    x1={startX}
                    y1={y}
                    x2={endX}
                    y2={y}
                    stroke="#999"
                    strokeWidth="1"
                    markerEnd="url(#pvArrR)"
                  />
                );
              }
              arrows.push(
                <text
                  key="roof-label"
                  x={(startX + endX) / 2}
                  y={rectY + rectH / 2 + 30}
                  fontSize="9"
                  fill="#999"
                  textAnchor="middle"
                  fontStyle="italic"
                >
                  Roof fall direction {goingRight ? "\u2192" : "\u2190"}
                </text>
              );
            }
            return <g>{arrows}</g>;
          })()}

          {/* ═══ Post markers ═══ */}
          {postPositions.map((marker, idx) => {
            const pos = getMarkerPosition(marker);
            if (!pos) return null;
            if (pos.onBeam) {
              // Beam-mounted post: indigo diamond
              return (
                <g key={`post-${idx}`}>
                  <rect
                    x={pos.x - 6}
                    y={pos.y - 6}
                    width="12"
                    height="12"
                    fill="#4f46e5"
                    stroke="white"
                    strokeWidth="1.5"
                    transform={`rotate(45, ${pos.x}, ${pos.y})`}
                  />
                  <circle cx={pos.x} cy={pos.y} r="2" fill="white" />
                </g>
              );
            }
            return (
              <g key={`post-${idx}`}>
                <rect
                  x={pos.x - 6}
                  y={pos.y - 6}
                  width="12"
                  height="12"
                  fill="#1e293b"
                  stroke="white"
                  strokeWidth="1.5"
                  rx="2"
                />
                <circle cx={pos.x} cy={pos.y} r="2" fill="white" />
              </g>
            );
          })}

          {/* ═══ Post size label (shown once near first post or bottom) ═══ */}
          {postSize && postPositions.length > 0 && (
            <text
              x={rectX + rectW / 2}
              y={rectY + rectH + 30}
              fontSize="10"
              fill="#1e293b"
              textAnchor="middle"
              fontWeight="500"
            >
              Posts: {postSize}
            </text>
          )}

          {/* ═══ Downpipe markers on gutter edges (green circles with DP text) ═══ */}
          {downpipeMarkers.map((marker) => {
            const pos = getMarkerPosition(marker);
            if (!pos) return null;
            return (
              <g key={`dp-marker-${marker}`}>
                <circle cx={pos.x} cy={pos.y} r="9" fill="#16a34a" stroke="white" strokeWidth="1.5" />
                <text
                  x={pos.x}
                  y={pos.y + 1}
                  fontSize="7"
                  fill="white"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                >
                  DP
                </text>
              </g>
            );
          })}

          {/* ═══ Downpipe location indicators at corners (green circles) ═══ */}
          {downpipeLocations.map((loc) => {
            const pos = getDpLocationPos(loc);
            if (!pos) return null;
            return (
              <g key={`dp-loc-${loc}`}>
                <circle cx={pos.x} cy={pos.y} r="11" fill="#15803d" stroke="white" strokeWidth="2" />
                <text
                  x={pos.x}
                  y={pos.y + 1}
                  fontSize="8"
                  fill="white"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                >
                  DP
                </text>
              </g>
            );
          })}

          {/* ═══ Corner labels ═══ */}
          <text x={corners.A.x - 16} y={corners.A.y - 10} fontSize="14" fontWeight="bold" fill="black" textAnchor="middle">A</text>
          <text x={corners.B.x + 16} y={corners.B.y - 10} fontSize="14" fontWeight="bold" fill="black" textAnchor="middle">B</text>
          <text x={corners.C.x + 16} y={corners.C.y + 18} fontSize="14" fontWeight="bold" fill="black" textAnchor="middle">C</text>
          <text x={corners.D.x - 16} y={corners.D.y + 18} fontSize="14" fontWeight="bold" fill="black" textAnchor="middle">D</text>

          {/* ═══ Dimension arrows ═══ */}
          {/* Top (A-B) width */}
          <line
            x1={rectX}
            y1={rectY - 30}
            x2={rectX + rectW}
            y2={rectY - 30}
            stroke="black"
            strokeWidth="1"
            markerStart="url(#pvArrL)"
            markerEnd="url(#pvArrR)"
          />
          <line x1={rectX} y1={rectY - 35} x2={rectX} y2={rectY - 5} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={rectX + rectW} y1={rectY - 35} x2={rectX + rectW} y2={rectY - 5} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <text
            x={rectX + rectW / 2}
            y={rectY - 36}
            fontSize="11"
            fill="black"
            textAnchor="middle"
            fontWeight="600"
          >
            {sideLengths["A-B"] || "Width"}
          </text>

          {/* Right (B-C) length */}
          <line
            x1={rectX + rectW + 30}
            y1={rectY}
            x2={rectX + rectW + 30}
            y2={rectY + rectH}
            stroke="black"
            strokeWidth="1"
            markerStart="url(#pvArrL)"
            markerEnd="url(#pvArrR)"
          />
          <line x1={rectX + rectW + 5} y1={rectY} x2={rectX + rectW + 35} y2={rectY} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={rectX + rectW + 5} y1={rectY + rectH} x2={rectX + rectW + 35} y2={rectY + rectH} stroke="black" strokeWidth="0.5" strokeDasharray="2 2" />
          <text
            x={rectX + rectW + 45}
            y={rectY + rectH / 2}
            fontSize="11"
            fill="black"
            textAnchor="middle"
            fontWeight="600"
            transform={`rotate(90, ${rectX + rectW + 45}, ${rectY + rectH / 2})`}
          >
            {sideLengths["B-C"] || "Projection"}
          </text>

          {/* ═══ Post spacing dimension ═══ */}
          {postSpacing && !postSize && (
            <text
              x={rectX + rectW / 2}
              y={rectY + rectH + 30}
              fontSize="10"
              fill="#555"
              textAnchor="middle"
            >
              Post spacing: {postSpacing}mm
            </text>
          )}

          {/* ═══ Roof type label ═══ */}
          {roofType && (
            <text
              x={rectX + rectW / 2}
              y={rectY + rectH / 2}
              fontSize="12"
              fill="#666"
              textAnchor="middle"
              fontStyle="italic"
            >
              {roofType}
            </text>
          )}

          {/* ═══ Total posts count ═══ */}
          <text
            x={rectX + rectW / 2}
            y={rectY + rectH + (postSize ? 48 : 50)}
            fontSize="10"
            fill="black"
            textAnchor="middle"
            fontWeight="500"
          >
            Total: {postPositions.length} post{postPositions.length !== 1 ? "s" : ""}
            {postSpacing && postSize ? ` @ ${postSpacing}mm c/c` : ""}
          </text>

          {/* ═══ Connection callout (near house wall) ═══ */}
          {connectionType && houseWalls.length > 0 && (() => {
            const wallSide = houseWalls[0] as Side;
            const edge = sideEdges[wallSide];
            const midX = (edge.x1 + edge.x2) / 2;
            const midY = (edge.y1 + edge.y2) / 2;
            let calloutX = midX;
            let calloutY = midY;
            const calloutW = 70;
            const calloutH = connectionImageUrl ? 60 : 28;
            if (wallSide === "A-B") { calloutY = midY - 50 - calloutH; }
            else if (wallSide === "C-D") { calloutY = midY + 50; }
            else if (wallSide === "D-A") { calloutX = midX - 50 - calloutW; }
            else if (wallSide === "B-C") { calloutX = midX + 50; }

            return (
              <g>
                <line
                  x1={midX}
                  y1={midY}
                  x2={calloutX + calloutW / 2}
                  y2={calloutY + calloutH / 2}
                  stroke="#c2410c"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
                <rect
                  x={calloutX}
                  y={calloutY}
                  width={calloutW}
                  height={calloutH}
                  fill="white"
                  stroke="#c2410c"
                  strokeWidth="1.5"
                  rx="4"
                />
                <text
                  x={calloutX + calloutW / 2}
                  y={calloutY + 14}
                  fontSize="10"
                  fontWeight="bold"
                  fill="#c2410c"
                  textAnchor="middle"
                >
                  {connectionType}
                </text>
                {connectionImageUrl && (
                  <image
                    href={connectionImageUrl}
                    x={calloutX + 10}
                    y={calloutY + 20}
                    width={calloutW - 20}
                    height={calloutH - 26}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
              </g>
            );
          })()}

          {/* ═══ North arrow (top-right) ═══ */}
          <g transform={`translate(${svgW - 40}, 30)`}>
            <line x1="0" y1="20" x2="0" y2="0" stroke="black" strokeWidth="1.5" markerEnd="url(#pvArrR)" />
            <text x="0" y="-5" fontSize="10" textAnchor="middle" fontWeight="bold" fill="black">N</text>
          </g>
        </svg>
      </div>

      {/* ═══ Legend / Key ═══ */}
      <div className="flex flex-wrap items-center gap-4 mt-3 px-2 py-1.5 bg-muted/50 rounded text-[10px] text-muted-foreground border">
        <span className="font-semibold text-foreground text-[11px]">Legend:</span>
        <span className="flex items-center gap-1">
          <svg width="18" height="10"><line x1="0" y1="5" x2="18" y2="5" stroke="#2563eb" strokeWidth="3" /></svg>
          Gutter
        </span>
        <span className="flex items-center gap-1">
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#15803d" /><text x="7" y="10" fontSize="6" fill="white" textAnchor="middle" fontWeight="bold">DP</text></svg>
          Downpipe
        </span>
        <span className="flex items-center gap-1">
          <svg width="12" height="12"><rect x="1" y="1" width="10" height="10" fill="#1f2937" /></svg>
          Post
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#333" strokeWidth="2" strokeDasharray="4 2" /></svg>
          Beam
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="10"><rect x="0" y="0" width="20" height="10" fill="url(#hatch-legend)" stroke="#666" strokeWidth="0.5" /><defs><pattern id="hatch-legend" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#8B4513" strokeWidth="0.5" /></pattern></defs></svg>
          House Wall
        </span>
        {fallDirection && (
          <span className="flex items-center gap-1">
            <svg width="10" height="14"><line x1="5" y1="14" x2="5" y2="2" stroke="#888" strokeWidth="1" markerEnd="url(#legend-arr)" /><defs><marker id="legend-arr" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="#888" /></marker></defs></svg>
            Roof Fall
          </span>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-1">
        {readOnly
          ? "Plan view showing structure footprint, post positions, beam lines, gutters, downpipes, and dimensions from the spec sheet."
          : "Top-down view of the structure. For illustrative purposes only — not a render of the finished structure."}
      </p>
    </div>
  );
}
