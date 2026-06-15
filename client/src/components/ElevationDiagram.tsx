import React from "react";

interface ElevationDiagramProps {
  /** View direction: front or side */
  view?: "front" | "side";
  /** Structure width in metres */
  structureWidthMm?: number;
  /** Structure length/projection in metres */
  structureLengthMm?: number;
  /** Floor height (post height / underside of beam) in metres */
  floorHeightMm?: number;
  /** Floor to ground in metres */
  floorToGroundMm?: number;
  /** House eave height in metres */
  houseEaveMm?: number;
  /** Job eave overhang in mm */
  jobEaveMm?: number;
  /** Roof type label e.g. "Climatek V 60mm" */
  roofType?: string;
  /** Roof shape: Flat, Gable, Hip, Skillion */
  roofShape?: string;
  /** Fall direction: A-B, B-C, C-D, D-A */
  fallDirection?: string;
  /** Number of posts */
  postsNumber?: number;
  /** Posts type e.g. "50x50", "100x100" */
  postsType?: string;
  /** Roof fall/pitch e.g. "2", "1.5", "5" (degrees) */
  roofFall?: string;
  /** House walls - which sides are attached e.g. ["A-B", "D-A"] */
  houseWalls?: string[];
  /** Spec-sheet post positions encoded as "side:percent" e.g. ["C-D:25", "C-D:75", "B-C:50"] */
  specPostPositions?: string[];
}

/**
 * Architectural Elevation Diagram (SVG)
 * 
 * Side naming convention (from RoofPlanDiagram):
 *   A = top-left, B = top-right, C = bottom-right, D = bottom-left
 *   A-B = top side (width) = REAR of structure
 *   B-C = right side (length) = RIGHT side
 *   C-D = bottom side (width) = FRONT of structure  
 *   D-A = left side (length) = LEFT side
 * 
 * Front elevation looks at C-D (front/bottom side) from outside.
 * Side elevation looks at B-C (right side) from outside.
 * 
 * Fall direction indicates which side the roof falls FROM (high side) TO the opposite (low side):
 *   A-B: roof high at A-B (rear), falls toward C-D (front) - common for attached at rear
 *   C-D: roof high at C-D (front), falls toward A-B (rear)
 *   B-C: roof high at B-C (right), falls toward D-A (left)
 *   D-A: roof high at D-A (left), falls toward B-C (right)
 */
export default function ElevationDiagram({
  view = "front",
  structureWidthMm,
  structureLengthMm,
  floorHeightMm,
  floorToGroundMm,
  houseEaveMm,
  jobEaveMm,
  roofType,
  roofShape,
  fallDirection,
  postsNumber,
  postsType,
  roofFall,
  houseWalls = [],
  specPostPositions,
}: ElevationDiagramProps) {
  const svgW = 500;
  const svgH = 320;
  const padL = 60; // Left padding for dimension labels
  const padR = 40;
  const padT = 40;
  const padB = 50;

  // Parse dimensions (stored in metres in the database)
  const widthM = structureWidthMm || 5;
  const lengthM = structureLengthMm || 3;
  const postHeightM = floorHeightMm || 2.4;
  const floorToGroundM = floorToGroundMm || 0;
  const eaveOverhangMm = jobEaveMm || 0; // in mm

  // For front view, span = width; for side view, span = length (projection)
  const spanM = view === "front" ? widthM : lengthM;

  // Parse roof pitch (degrees)
  const parsePitch = (): number => {
    if (!roofFall) return 2;
    const num = parseFloat(roofFall);
    if (!isNaN(num) && num > 0 && num < 45) return num;
    return 2;
  };
  const pitchDeg = parsePitch();
  const pitchRad = pitchDeg * (Math.PI / 180);

  // Determine if this view shows a slope
  // Front elevation (looking at C-D): sees slope if fall is along B-C/D-A axis (left-right)
  // Side elevation (looking at B-C): sees slope if fall is along A-B/C-D axis (front-back)
  const fallAlongWidth = fallDirection === "B-C" || fallDirection === "D-A"; // left-right
  const fallAlongLength = fallDirection === "A-B" || fallDirection === "C-D"; // front-back

  const showsSlope = view === "front" ? fallAlongWidth : fallAlongLength;

  // Calculate roof rise across the span
  const roofRiseM = showsSlope ? Math.tan(pitchRad) * spanM : 0;

  // For gable/hip, the rise is to the peak
  const isGable = roofShape?.toLowerCase().includes("gable");
  const isHip = roofShape?.toLowerCase().includes("hip");
  const gableRiseM = (isGable || isHip) ? Math.tan(pitchRad) * (spanM / 2) : 0;

  // Overall height for scaling
  const overallHeightM = postHeightM + floorToGroundM + (isGable || isHip ? gableRiseM : roofRiseM) + 0.3;
  const overallWidthM = spanM + 0.5; // Extra for overhangs

  // Scale to fit drawing area
  const drawW = svgW - padL - padR;
  const drawH = svgH - padT - padB;
  const scaleX = drawW / overallWidthM;
  const scaleY = drawH / overallHeightM;
  const scale = Math.min(scaleX, scaleY);

  // Structure dimensions in SVG pixels
  const structW = spanM * scale;
  const structH = postHeightM * scale;
  const groundOffset = floorToGroundM * scale;
  const roofRisePx = (isGable || isHip ? gableRiseM : roofRiseM) * scale;

  // Position: center horizontally, align to ground
  const groundY = svgH - padB;
  const baseX = padL + (drawW - structW) / 2;
  const beamY = groundY - groundOffset - structH; // Top of posts / underside of beam

  // Determine which side of this view has the house wall
  // Front view (looking at C-D): left = D corner, right = C corner
  //   House on left if D-A is house wall
  //   House on right if B-C is house wall
  //   House on top/behind if A-B is house wall (show as attached at rear)
  // Side view (looking at B-C): left = B corner, right = C corner
  //   House on left if A-B is house wall
  //   House on right if C-D is house wall
  //   House on top/behind if B-C is house wall (show as attached at this side)

  let houseOnLeft = false;
  let houseOnRight = false;
  let houseOnRear = false; // Attached at the back (not visible but affects roof)

  if (view === "front") {
    houseOnLeft = houseWalls.includes("D-A");
    houseOnRight = houseWalls.includes("B-C");
    houseOnRear = houseWalls.includes("A-B");
  } else {
    houseOnLeft = houseWalls.includes("A-B");
    houseOnRight = houseWalls.includes("C-D");
    houseOnRear = houseWalls.includes("D-A") || houseWalls.includes("B-C");
  }

  // Determine roof high/low sides for this view
  // If fall is visible in this view, determine direction
  let roofHighLeft = false;
  if (showsSlope) {
    if (view === "front") {
      // Fall along width: B-C means high at right (B-C side), falls to left (D-A)
      //                    D-A means high at left (D-A side), falls to right (B-C)
      roofHighLeft = fallDirection === "D-A";
    } else {
      // Fall along length: A-B means high at left (A-B/rear), falls to right (C-D/front)
      //                     C-D means high at right (C-D/front), falls to left (A-B/rear)
      roofHighLeft = fallDirection === "A-B";
    }
  }

  // Roof geometry
  const beamThickPx = 6;
  const roofThickPx = 4;
  const overhangPx = (eaveOverhangMm / 1000) * scale || 12;

  // Roof line coordinates
  const roofLeftX = baseX - overhangPx;
  const roofRightX = baseX + structW + overhangPx;

  let roofLeftY: number;
  let roofRightY: number;

  if (isGable || isHip) {
    // Gable: both sides at beam level, peak in middle
    roofLeftY = beamY;
    roofRightY = beamY;
  } else if (showsSlope) {
    // Skillion/flat with visible slope
    if (roofHighLeft) {
      roofLeftY = beamY - roofRisePx;
      roofRightY = beamY;
    } else {
      roofLeftY = beamY;
      roofRightY = beamY - roofRisePx;
    }
  } else {
    // Flat appearance (slope perpendicular to view)
    roofLeftY = beamY;
    roofRightY = beamY;
  }

  // Posts - use spec positions if available, otherwise fall back to evenly-spaced
  const numPosts = postsNumber || 2;
  const postPositions: number[] = [];

  // Determine which side this elevation view shows:
  // Front elevation looks at C-D (bottom side = width)
  // Side elevation looks at B-C (right side = length/projection)
  const viewSide = view === "front" ? "C-D" : "B-C";
  const oppositeSide = view === "front" ? "A-B" : "D-A";

  // Filter spec positions for the sides visible in this view
  const relevantSpecPositions = (specPostPositions || []).filter(p => {
    const [side] = p.split(":");
    return side === viewSide || side === oppositeSide;
  });

  if (relevantSpecPositions.length > 0) {
    // Use spec-sheet positions: convert side:percent to x-coordinates
    for (const marker of relevantSpecPositions) {
      const [side, pctStr] = marker.split(":");
      const pct = parseFloat(pctStr) / 100;
      if (isNaN(pct)) continue;
      // C-D goes left to right (D=left=0%, C=right=100%)
      // A-B goes left to right (A=left=0%, B=right=100%)
      // B-C goes left to right (B=left=0%, C=right=100%)
      // D-A goes left to right (D=left=0%, A=right=100%)
      const x = baseX + pct * structW;
      postPositions.push(x);
    }
    // Sort left to right
    postPositions.sort((a, b) => a - b);
  } else {
    // Fallback: evenly-spaced posts
    if (numPosts === 1) {
      postPositions.push(baseX + structW / 2);
    } else {
      for (let i = 0; i < numPosts; i++) {
        postPositions.push(baseX + (structW / (numPosts - 1)) * i);
      }
    }
  }

  // Colours
  const lineCol = "oklch(0.35 0 0)";
  const dimCol = "oklch(0.45 0.12 250)";
  const roofCol = "oklch(0.4 0.08 200)";
  const postCol = "oklch(0.45 0.06 60)";
  const houseCol = "oklch(0.6 0.04 250)";
  const labelCol = "oklch(0.5 0 0)";

  // Overall height (from ground to highest roof point)
  const highestRoofY = isGable || isHip
    ? beamY - roofRisePx
    : Math.min(roofLeftY, roofRightY) - roofThickPx;
  const overallH_M = postHeightM + floorToGroundM + (isGable || isHip ? gableRiseM : roofRiseM);

  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {view === "front" ? "FRONT" : "SIDE"} ELEVATION
        </span>
        {roofType && (
          <span className="text-[10px] text-muted-foreground font-medium">
            {roofType}{pitchDeg ? ` • ${pitchDeg}° pitch` : ""}
          </span>
        )}
      </div>
      <svg
        width="100%"
        height="auto"
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="text-foreground"
        style={{ maxHeight: "280px" }}
      >
        {/* SVG Marker Definitions */}
        <defs>
          <marker
            id="dim-tick"
            viewBox="0 0 6 10"
            refX="3"
            refY="5"
            markerWidth="6"
            markerHeight="10"
            orient="auto-start-reverse"
          >
            <line x1="3" y1="0" x2="3" y2="10" stroke={dimCol} strokeWidth="1.5" />
          </marker>
          <marker
            id="dim-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={dimCol} />
          </marker>
        </defs>

        {/* Ground line with hatch marks */}
        <line x1={padL - 20} y1={groundY} x2={svgW - padR + 10} y2={groundY} stroke={lineCol} strokeWidth="1.5" />
        {Array.from({ length: Math.ceil((svgW - padL - padR + 30) / 20) }).map((_, i) => (
          <line
            key={`gh-${i}`}
            x1={padL - 20 + i * 20}
            y1={groundY}
            x2={padL - 28 + i * 20}
            y2={groundY + 7}
            stroke={lineCol}
            strokeWidth="0.6"
            opacity="0.4"
          />
        ))}

        {/* Floor level line (FFL) */}
        {groundOffset > 3 && (
          <>
            <line
              x1={baseX - 10}
              y1={groundY - groundOffset}
              x2={baseX + structW + 10}
              y2={groundY - groundOffset}
              stroke={lineCol}
              strokeWidth="0.8"
              strokeDasharray="6 3"
              opacity="0.5"
            />
            <text x={baseX + structW + 14} y={groundY - groundOffset + 3} fontSize="7" fill={labelCol} opacity="0.7">
              F.F.L.
            </text>
          </>
        )}

        {/* House wall (if applicable) */}
        {houseOnLeft && (
          <g>
            <rect
              x={baseX - 18}
              y={beamY - roofRisePx - 20}
              width={14}
              height={groundY - beamY + roofRisePx + 20}
              fill="oklch(0.85 0.02 250 / 0.5)"
              stroke={houseCol}
              strokeWidth="1.5"
            />
            <text
              x={baseX - 11}
              y={(beamY + groundY) / 2}
              fontSize="7"
              fill={houseCol}
              textAnchor="middle"
              fontWeight="600"
              transform={`rotate(-90, ${baseX - 11}, ${(beamY + groundY) / 2})`}
            >
              EXISTING HOUSE
            </text>
          </g>
        )}
        {houseOnRight && (
          <g>
            <rect
              x={baseX + structW + 4}
              y={beamY - roofRisePx - 20}
              width={14}
              height={groundY - beamY + roofRisePx + 20}
              fill="oklch(0.85 0.02 250 / 0.5)"
              stroke={houseCol}
              strokeWidth="1.5"
            />
            <text
              x={baseX + structW + 11}
              y={(beamY + groundY) / 2}
              fontSize="7"
              fill={houseCol}
              textAnchor="middle"
              fontWeight="600"
              transform={`rotate(-90, ${baseX + structW + 11}, ${(beamY + groundY) / 2})`}
            >
              EXISTING HOUSE
            </text>
          </g>
        )}

        {/* Posts */}
        {postPositions.map((x, i) => {
          // Skip post if it's at a house wall position
          if (houseOnLeft && i === 0) return null;
          if (houseOnRight && i === postPositions.length - 1) return null;
          return (
            <g key={`post-${i}`}>
              <rect
                x={x - 2.5}
                y={beamY}
                width={5}
                height={groundY - beamY}
                fill="oklch(0.8 0.04 60 / 0.4)"
                stroke={postCol}
                strokeWidth="1.2"
              />
            </g>
          );
        })}

        {/* Beam (horizontal at top of posts) */}
        <line
          x1={baseX - 5}
          y1={beamY}
          x2={baseX + structW + 5}
          y2={beamY}
          stroke={lineCol}
          strokeWidth="2.5"
        />

        {/* Roof */}
        {(isGable || isHip) ? (
          // Gable/Hip roof
          <g>
            {view === "front" || isGable ? (
              <>
                {/* Gable peak */}
                <path
                  d={`M ${roofLeftX} ${beamY} L ${baseX + structW / 2} ${beamY - roofRisePx} L ${roofRightX} ${beamY}`}
                  fill="oklch(0.75 0.06 200 / 0.2)"
                  stroke={roofCol}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {/* Roof thickness */}
                <path
                  d={`M ${roofLeftX} ${beamY} L ${roofLeftX} ${beamY + roofThickPx} L ${roofRightX} ${beamY + roofThickPx} L ${roofRightX} ${beamY}`}
                  fill="oklch(0.7 0.04 200 / 0.3)"
                  stroke={roofCol}
                  strokeWidth="1"
                />
              </>
            ) : (
              <>
                {/* Hip from side - trapezoidal */}
                <path
                  d={`M ${roofLeftX} ${beamY} L ${baseX + structW * 0.2} ${beamY - roofRisePx} L ${baseX + structW * 0.8} ${beamY - roofRisePx} L ${roofRightX} ${beamY}`}
                  fill="oklch(0.75 0.06 200 / 0.2)"
                  stroke={roofCol}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </>
            )}
          </g>
        ) : (
          // Flat/Skillion roof
          <g>
            {/* Top of roof */}
            <line
              x1={roofLeftX}
              y1={roofLeftY - roofThickPx}
              x2={roofRightX}
              y2={roofRightY - roofThickPx}
              stroke={roofCol}
              strokeWidth="2"
            />
            {/* Bottom of roof (soffit) */}
            <line
              x1={roofLeftX}
              y1={roofLeftY}
              x2={roofRightX}
              y2={roofRightY}
              stroke={roofCol}
              strokeWidth="1.5"
            />
            {/* Left end cap */}
            <line x1={roofLeftX} y1={roofLeftY - roofThickPx} x2={roofLeftX} y2={roofLeftY} stroke={roofCol} strokeWidth="1.5" />
            {/* Right end cap */}
            <line x1={roofRightX} y1={roofRightY - roofThickPx} x2={roofRightX} y2={roofRightY} stroke={roofCol} strokeWidth="1.5" />
            {/* Fill */}
            <path
              d={`M ${roofLeftX} ${roofLeftY - roofThickPx} L ${roofRightX} ${roofRightY - roofThickPx} L ${roofRightX} ${roofRightY} L ${roofLeftX} ${roofLeftY} Z`}
              fill="oklch(0.75 0.06 200 / 0.15)"
            />
          </g>
        )}

        {/* ─── DIMENSIONS ─── */}

        {/* Overall height (left side) */}
        <g opacity="0.85">
          <line x1={padL - 5} y1={groundY} x2={padL - 5} y2={highestRoofY} stroke={dimCol} strokeWidth="0.7" markerStart="url(#dim-tick)" markerEnd="url(#dim-tick)" />
          <line x1={padL - 10} y1={groundY} x2={padL} y2={groundY} stroke={dimCol} strokeWidth="0.7" />
          <line x1={padL - 10} y1={highestRoofY} x2={padL} y2={highestRoofY} stroke={dimCol} strokeWidth="0.7" />
          <text
            x={padL - 8}
            y={(groundY + highestRoofY) / 2}
            fontSize="8"
            fill={dimCol}
            textAnchor="middle"
            fontWeight="500"
            transform={`rotate(-90, ${padL - 8}, ${(groundY + highestRoofY) / 2})`}
          >
            {(overallH_M).toFixed(2)}m O/A
          </text>
        </g>

        {/* Post height (right side) */}
        <g opacity="0.85">
          <line x1={baseX + structW + 25} y1={groundY - groundOffset} x2={baseX + structW + 25} y2={beamY} stroke={dimCol} strokeWidth="0.7" />
          <line x1={baseX + structW + 20} y1={groundY - groundOffset} x2={baseX + structW + 30} y2={groundY - groundOffset} stroke={dimCol} strokeWidth="0.7" />
          <line x1={baseX + structW + 20} y1={beamY} x2={baseX + structW + 30} y2={beamY} stroke={dimCol} strokeWidth="0.7" />
          <text
            x={baseX + structW + 28}
            y={(groundY - groundOffset + beamY) / 2}
            fontSize="8"
            fill={dimCol}
            textAnchor="middle"
            fontWeight="500"
            transform={`rotate(-90, ${baseX + structW + 28}, ${(groundY - groundOffset + beamY) / 2})`}
          >
            {postHeightM.toFixed(2)}m POST
          </text>
        </g>

        {/* Span/Projection (bottom) */}
        <g opacity="0.85">
          <line x1={baseX} y1={groundY + 15} x2={baseX + structW} y2={groundY + 15} stroke={dimCol} strokeWidth="0.7" />
          <line x1={baseX} y1={groundY + 10} x2={baseX} y2={groundY + 20} stroke={dimCol} strokeWidth="0.7" />
          <line x1={baseX + structW} y1={groundY + 10} x2={baseX + structW} y2={groundY + 20} stroke={dimCol} strokeWidth="0.7" />
          <text
            x={baseX + structW / 2}
            y={groundY + 28}
            fontSize="9"
            fill={dimCol}
            textAnchor="middle"
            fontWeight="600"
          >
            {(spanM * 1000).toFixed(0)} O/ALL {view === "front" ? "SPAN" : "PROJECTION"}
          </text>
        </g>

        {/* Roof pitch indicator */}
        {pitchDeg > 0 && showsSlope && (
          <g opacity="0.8">
            {/* Small triangle showing pitch angle */}
            <text
              x={baseX + structW / 2}
              y={Math.min(roofLeftY, roofRightY) - 12}
              fontSize="8"
              fill={roofCol}
              textAnchor="middle"
              fontWeight="500"
            >
              ROOF FALL {pitchDeg}°
            </text>
          </g>
        )}

        {/* Roof type label */}
        {roofType && (
          <text
            x={baseX + structW / 2}
            y={padT - 5}
            fontSize="8"
            fill={labelCol}
            textAnchor="middle"
            fontWeight="600"
            opacity="0.8"
          >
            {roofType.toUpperCase()}{pitchDeg ? ` @ ${pitchDeg}°` : ""}
          </text>
        )}

        {/* Post type label */}
        {postsType && (
          <text
            x={postPositions[Math.floor(postPositions.length / 2)] || baseX + structW / 2}
            y={groundY - 8}
            fontSize="7"
            fill={postCol}
            textAnchor="middle"
            fontWeight="500"
          >
            {postsType} POST
          </text>
        )}

        {/* "TOP OF ROOF" and "TOP OF BEAM" annotations */}
        <g opacity="0.6">
          <line x1={baseX + structW + 5} y1={beamY} x2={svgW - padR + 5} y2={beamY} stroke={labelCol} strokeWidth="0.5" strokeDasharray="2 2" />
          <text x={svgW - padR + 8} y={beamY + 3} fontSize="6" fill={labelCol}>TOP OF BEAM</text>
        </g>
        {(isGable || isHip || showsSlope) && (
          <g opacity="0.6">
            <line x1={baseX + structW + 5} y1={highestRoofY} x2={svgW - padR + 5} y2={highestRoofY} stroke={labelCol} strokeWidth="0.5" strokeDasharray="2 2" />
            <text x={svgW - padR + 8} y={highestRoofY + 3} fontSize="6" fill={labelCol}>TOP OF ROOF</text>
          </g>
        )}
      </svg>
    </div>
  );
}
