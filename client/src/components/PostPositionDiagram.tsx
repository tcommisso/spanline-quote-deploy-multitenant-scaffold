import { useMemo } from "react";

interface BeamEntry {
  type: "Steel" | "Aluminium";
  size: string;
  lm: number;
}

type Orientation = "H" | "V";

interface PostPositionDiagramProps {
  width: string; // structure width in metres (e.g. "4.6")
  length: string; // structure length/projection in metres (e.g. "6.0")
  /** Post positions encoded as "side:percent" or "beam:beamIdx:percent" */
  postPositions: string[];
  /** House walls (sides attached to house — no posts on these sides) */
  houseWalls?: string[];
  /** Callback when post positions change */
  onPostPositionsChange: (positions: string[]) => void;
  /** Explicit fall direction from the Roof section (e.g. "A-B", "C-D") */
  fallDirection?: string;
  /** Beam positions from BeamPositionPlan: "idx:pct:orientation" */
  beamPositions?: string[];
  /** Beam entries for labels */
  beamEntries?: BeamEntry[];
}

const SIDES = ["A-B", "B-C", "C-D", "D-A"] as const;
type Side = (typeof SIDES)[number];

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
 * Interactive SVG diagram for placing posts along the roof plan edges AND on beam lines.
 * - Shows A-B-C-D rectangle matching the Roof Plan orientation.
 * - House walls are shown as thick brown lines (no posts allowed).
 * - Beam lines from BeamPositionPlan are shown as dashed lines.
 * - Click on non-house-wall edges to place a post marker (circle).
 * - Click on a beam line to place a post on the beam (creates eave configuration).
 * - Click an existing post marker to remove it.
 * - Posts snap to nearest 5% along the edge/beam for clean positioning.
 */
export default function PostPositionDiagram({
  width,
  length,
  postPositions,
  houseWalls = [],
  onPostPositionsChange,
  fallDirection,
  beamPositions = [],
  beamEntries = [],
}: PostPositionDiagramProps) {
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

  // Side edge definitions
  const sideEdges: Record<Side, { x1: number; y1: number; x2: number; y2: number }> = {
    "A-B": { x1: corners.A.x, y1: corners.A.y, x2: corners.B.x, y2: corners.B.y },
    "B-C": { x1: corners.B.x, y1: corners.B.y, x2: corners.C.x, y2: corners.C.y },
    "C-D": { x1: corners.C.x, y1: corners.C.y, x2: corners.D.x, y2: corners.D.y },
    "D-A": { x1: corners.D.x, y1: corners.D.y, x2: corners.A.x, y2: corners.A.y },
  };

  // Side lengths in metres for distance labels
  const sideLengthsM: Record<Side, number> = useMemo(() => {
    const w = parseFloat(width) || 0;
    const l = parseFloat(length) || 0;
    return {
      "A-B": w,  // top = width
      "B-C": l,  // right = length
      "C-D": w,  // bottom = width
      "D-A": l,  // left = length
    };
  }, [width, length]);

  const isHouseWall = (side: Side) => houseWalls.includes(side);

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
          const y = rectY + (pct / 100) * rectH;
          x1 = rectX; y1 = y; x2 = rectX + rectW; y2 = y;
        } else {
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

  // Handle edge click (place post on edge)
  const handleEdgeClick = (side: Side, e: React.MouseEvent<SVGElement>) => {
    if (isHouseWall(side)) return;

    const svg = (e.target as SVGElement).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const edge = sideEdges[side];
    const edgeLen = Math.sqrt((edge.x2 - edge.x1) ** 2 + (edge.y2 - edge.y1) ** 2);
    const dx = clickX - edge.x1;
    const dy = clickY - edge.y1;
    const edgeDx = edge.x2 - edge.x1;
    const edgeDy = edge.y2 - edge.y1;
    const t = Math.max(0, Math.min(1, (dx * edgeDx + dy * edgeDy) / (edgeLen * edgeLen)));
    const pct = Math.round(t * 20) * 5;

    const marker = `${side}:${pct}`;

    // Check if there's already a marker nearby (within 6%) — if so, remove it
    const existing = postPositions.find((m) => {
      if (!m.startsWith(side + ":")) return false;
      const existPct = parseInt(m.split(":")[1], 10);
      return Math.abs(existPct - pct) < 6;
    });

    if (existing) {
      onPostPositionsChange(postPositions.filter((m) => m !== existing));
    } else {
      onPostPositionsChange([...postPositions, marker]);
    }
  };

  // Handle beam click (place post on beam line)
  const handleBeamClick = (beamIdx: number, beam: typeof dynamicBeams[0], e: React.MouseEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = (e.target as SVGElement).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Calculate percentage along the beam line
    let pct: number;
    if (beam.orientation === "H") {
      // Horizontal beam: percentage along X
      pct = Math.round(((clickX - rectX) / rectW) * 20) * 5;
    } else {
      // Vertical beam: percentage along Y
      pct = Math.round(((clickY - rectY) / rectH) * 20) * 5;
    }
    pct = Math.max(5, Math.min(95, pct));

    const marker = `beam:${beamIdx}:${pct}`;

    // Check if there's already a marker nearby on this beam
    const existing = postPositions.find((m) => {
      if (!m.startsWith(`beam:${beamIdx}:`)) return false;
      const existPct = parseInt(m.split(":")[2], 10);
      return Math.abs(existPct - pct) < 6;
    });

    if (existing) {
      onPostPositionsChange(postPositions.filter((m) => m !== existing));
    } else {
      onPostPositionsChange([...postPositions, marker]);
    }
  };

  // Get marker position in SVG coordinates (supports both edge and beam posts)
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
        type: "beam" as const,
        beamIdx,
        pct: parseInt(parts[2], 10),
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
      type: "edge" as const,
      side: side as Side,
      pct: parseInt(pctStr, 10),
    };
  };

  // Compute distance label for edge posts
  const getDistanceLabel = (side: Side, pct: number): string => {
    const sideLen = sideLengthsM[side];
    if (!sideLen) return "";
    const distFromStart = (pct / 100) * sideLen;
    const distFromEnd = sideLen - distFromStart;
    if (distFromStart <= distFromEnd) {
      const cornerLabel = side.split("-")[0];
      return `${distFromStart.toFixed(2)}m from ${cornerLabel}`;
    } else {
      const cornerLabel = side.split("-")[1];
      return `${distFromEnd.toFixed(2)}m from ${cornerLabel}`;
    }
  };

  // Compute distance label for beam posts
  const getBeamDistanceLabel = (beamIdx: number, pct: number): string => {
    const beam = dynamicBeams.find((b) => b.idx === beamIdx);
    if (!beam) return "";
    const dimM = beam.orientation === "H"
      ? (parseFloat(width) || 0)
      : (parseFloat(length) || 0);
    const dist = (pct / 100) * dimM;
    return `${dist.toFixed(2)}m along beam`;
  };

  // Count posts per side
  const postsPerSide = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const side of SIDES) {
      counts[side] = postPositions.filter((p) => p.startsWith(side + ":")).length;
    }
    return counts;
  }, [postPositions]);

  // Count posts on beams
  const postsOnBeams = useMemo(() => {
    return postPositions.filter((p) => p.startsWith("beam:")).length;
  }, [postPositions]);

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

        {/* Clickable side edges */}
        {SIDES.map((side) => {
          const edge = sideEdges[side];
          const isWall = isHouseWall(side);
          return (
            <g key={side} onClick={(e) => handleEdgeClick(side, e)} className={isWall ? "cursor-not-allowed" : "cursor-crosshair"}>
              {/* House wall indicator (thick brown line) */}
              {isWall && (
                <line
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke="oklch(0.5 0.1 50)"
                  strokeWidth="8"
                  opacity="0.6"
                />
              )}
              {/* Invisible hitbox for clicking */}
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="transparent"
                strokeWidth="18"
              />
              {/* House wall label */}
              {isWall && (
                <text
                  x={(edge.x1 + edge.x2) / 2 + (side === "B-C" ? 18 : side === "D-A" ? -18 : 0)}
                  y={(edge.y1 + edge.y2) / 2 + (side === "A-B" ? -12 : side === "C-D" ? 16 : 0)}
                  fontSize="7"
                  fill="oklch(0.5 0.1 50)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                >
                  HOUSE
                </text>
              )}
              {/* Post count per side (if any) */}
              {!isWall && postsPerSide[side] > 0 && (
                <text
                  x={(edge.x1 + edge.x2) / 2 + (side === "B-C" ? 16 : side === "D-A" ? -16 : 0)}
                  y={(edge.y1 + edge.y2) / 2 + (side === "A-B" ? -10 : side === "C-D" ? 14 : 0)}
                  fontSize="8"
                  fill="oklch(0.55 0.2 145)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight="600"
                  className="pointer-events-none select-none"
                >
                  {postsPerSide[side]} post{postsPerSide[side] > 1 ? "s" : ""}
                </text>
              )}
            </g>
          );
        })}

        {/* Beam lines (clickable to place posts) */}
        {dynamicBeams.map((beam) => {
          const midX = (beam.x1 + beam.x2) / 2;
          const midY = (beam.y1 + beam.y2) / 2;
          return (
            <g
              key={`beam-${beam.idx}`}
              onClick={(e) => handleBeamClick(beam.idx, beam, e)}
              className="cursor-crosshair"
            >
              {/* Invisible wider hitbox */}
              <line
                x1={beam.x1}
                y1={beam.y1}
                x2={beam.x2}
                y2={beam.y2}
                stroke="transparent"
                strokeWidth="14"
              />
              {/* Visible beam line */}
              <line
                x1={beam.x1}
                y1={beam.y1}
                x2={beam.x2}
                y2={beam.y2}
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="8 3"
                opacity="0.7"
              />
              {/* Beam label */}
              <text
                x={midX}
                y={midY + (beam.orientation === "H" ? -6 : 0)}
                dx={beam.orientation === "V" ? -8 : 0}
                fontSize="7"
                fill="#6366f1"
                textAnchor="middle"
                fontWeight="500"
                className="pointer-events-none"
              >
                {beam.label}
              </text>
            </g>
          );
        })}

        {/* Post markers (both edge and beam-mounted) */}
        {postPositions.map((marker) => {
          const pos = getMarkerPosition(marker);
          if (!pos) return null;
          const isBeamPost = pos.type === "beam";
          const tooltipText = isBeamPost
            ? getBeamDistanceLabel(pos.beamIdx, pos.pct)
            : getDistanceLabel(pos.side, pos.pct);
          return (
            <g
              key={marker}
              onClick={(e) => {
                e.stopPropagation();
                onPostPositionsChange(postPositions.filter((m) => m !== marker));
              }}
              className="cursor-pointer"
            >
              {/* Post circle — beam-mounted posts are indigo, edge posts are green */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r="6"
                fill={isBeamPost ? "#6366f1" : "oklch(0.55 0.2 145)"}
                stroke="white"
                strokeWidth="1.5"
              />
              {/* Post dot (inner) */}
              <circle cx={pos.x} cy={pos.y} r="2" fill="white" />
              {/* Tooltip on hover */}
              <title>{tooltipText}{isBeamPost ? " (on beam)" : ""}</title>
            </g>
          );
        })}

        {/* Corner labels */}
        <text x={corners.A.x - 12} y={corners.A.y - 6} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">A</text>
        <text x={corners.B.x + 12} y={corners.B.y - 6} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">B</text>
        <text x={corners.C.x + 12} y={corners.C.y + 16} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">C</text>
        <text x={corners.D.x - 12} y={corners.D.y + 16} fontSize="13" fontWeight="bold" fill="currentColor" textAnchor="middle">D</text>

        {/* Dimension labels */}
        {width && (
          <text
            x={rectX + rectW / 2}
            y={rectY - 16}
            fontSize="10"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
          >
            {parseFloat(width).toFixed(2)}m (Width)
          </text>
        )}
        {length && (
          <text
            x={rectX + rectW + 22}
            y={rectY + rectH / 2}
            fontSize="10"
            fill="currentColor"
            textAnchor="middle"
            opacity="0.7"
            transform={`rotate(90, ${rectX + rectW + 22}, ${rectY + rectH / 2})`}
          >
            {parseFloat(length).toFixed(2)}m (Projection)
          </text>
        )}

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
                <marker id="pp-fall-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="#e53e3e" />
                </marker>
              </defs>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e53e3e" strokeWidth="1.5" markerEnd="url(#pp-fall-arrow)" />
              <text x={cx} y={cy + (isVertical ? arrowLen / 2 + 14 : 20)} fontSize="8" fill="#e53e3e" textAnchor="middle" fontStyle="italic">
                {labelText}
              </text>
            </g>
          );
        })()}

        {/* Total posts count */}
        <text
          x={rectX + rectW / 2}
          y={rectY + rectH + 24}
          fontSize="9"
          fill="currentColor"
          textAnchor="middle"
          opacity="0.8"
          fontWeight="500"
        >
          Total: {postPositions.length} post{postPositions.length !== 1 ? "s" : ""}
          {postsOnBeams > 0 && ` (${postsOnBeams} on beam${postsOnBeams > 1 ? "s" : ""})`}
        </text>
      </svg>
    </div>
  );
}
