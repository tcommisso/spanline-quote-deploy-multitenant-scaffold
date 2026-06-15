/**
 * DeckSchematic — SVG plan-view rendering of a deck subfloor layout.
 * Shows double perimeter frame (outer frame + inner edge beams), joists,
 * noggins between the two frames on all 4 sides, structural bearers, posts,
 * board overhang outline, dimension annotations, and void cutouts.
 *
 * Based on NTW / NewTechWood engineering plan view style.
 */
import { useMemo } from "react";
import type {
  SubfloorInputs,
  OptionResult,
  BearerLine,
} from "../../../../shared/subfloor-calc";
import { formatMM } from "../../../../shared/subfloor-calc";

interface Props {
  inputs: SubfloorInputs;
  option: OptionResult;
}

// ─── Colour tokens ─────────────────────────────────────────────────────────
const INK = "oklch(0.24 0.018 250)";
const ACCENT = "oklch(0.42 0.13 250)";
const POST_FILL = "oklch(0.45 0.18 25)";       // warm red-brown, solid and visible
const POST_LABEL = "oklch(0.98 0.01 86)";       // near-white for contrast on coloured post
const HATCH_STROKE = "oklch(0.5 0.02 250 / 0.45)";
const DECK_FILL = "oklch(0.92 0.04 250 / 0.30)";
const WALL_PLATE_FILL = "oklch(0.45 0.02 250 / 0.6)";
const FRAME_FILL = "oklch(0.32 0.015 250)";       // dark grey for perimeter frame
const FRAME_STROKE = "oklch(0.20 0.015 250)";     // darker outline for frame members
const EDGE_BEAM_FILL = "oklch(0.38 0.015 250)";   // slightly lighter for inner edge beams
const JOIST_FILL = "oklch(0.28 0.02 250)";        // dark charcoal — most prominent structural member
const NOGGIN_FILL = "oklch(0.52 0.015 250)";      // medium grey for noggins
const OVERHANG_STROKE = "oklch(0.50 0.18 20)";    // red/dark-red for board overhang outline
const BEARER_FILL = "oklch(0.58 0.04 250)";       // lighter blue-grey — visually recedes behind joists

// ─── Dimension helpers ──────────────────────────────────────────────────────

function HorizontalDim({
  x1,
  x2,
  y,
  label,
  font,
  dashed,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  font: number;
  dashed?: boolean;
}) {
  const tick = font * 0.9;
  return (
    <g>
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} stroke={INK} strokeWidth="1.2" />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} stroke={INK} strokeWidth="1.2" />
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={INK}
        strokeWidth="1.2"
        markerStart="url(#arr)"
        markerEnd="url(#arr)"
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      <text
        x={(x1 + x2) / 2}
        y={y - font * 0.65}
        textAnchor="middle"
        fontSize={font}
        fill={ACCENT}
      >
        {label}
      </text>
    </g>
  );
}

function VerticalDim({
  y1,
  y2,
  x,
  label,
  font,
  dashed,
}: {
  y1: number;
  y2: number;
  x: number;
  label: string;
  font: number;
  dashed?: boolean;
}) {
  const tick = font * 0.9;
  const mid = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x - tick} y1={y1} x2={x + tick} y2={y1} stroke={INK} strokeWidth="1.2" />
      <line x1={x - tick} y1={y2} x2={x + tick} y2={y2} stroke={INK} strokeWidth="1.2" />
      <line
        x1={x}
        y1={y1}
        x2={x}
        y2={y2}
        stroke={INK}
        strokeWidth="1.2"
        markerStart="url(#arr)"
        markerEnd="url(#arr)"
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      <text
        x={x + font * 0.75}
        y={mid}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={font}
        fill={ACCENT}
        transform={`rotate(-90 ${x + font * 0.75} ${mid})`}
      >
        {label}
      </text>
    </g>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function DeckSchematic({ inputs, option }: Props) {
  const SCALE = 100;
  const l = inputs.length; // mm
  const r = inputs.width;  // mm
  const padX = SCALE * 1.3;
  const padY = SCALE * 1.5;
  const vbW = l + padX * 2.6;
  const vbH = r + padY * 3.2;
  const font = Math.round(SCALE * 0.4);
  const postSize = Math.max(SCALE * 0.52, 52);
  const postFontSize = postSize * 0.55;

  // Board layout config
  const boardLayout = inputs.boardLayout;
  const boardWidth = boardLayout?.boardWidth || 138;
  const boardDir = boardLayout?.boardDirection || "parallel";

  // When boards run perpendicular, joists run along length (horizontal in SVG)
  // and bearers run along width (vertical in SVG). Default: joists vertical, bearers horizontal.
  const swapped = boardDir === "perpendicular";

  // Determine if we have edge boards (picture frame) — triggers double frame
  const hasEdgeBoards = boardLayout?.pictureFrame && boardLayout.pictureFrame !== "none";

  // Frame member thickness (visual width of perimeter beams in SVG units)
  const frameThickness = Math.max(boardWidth * 0.35, 40);
  // Edge beam thickness (inner frame, slightly thinner)
  const edgeBeamThickness = Math.max(frameThickness * 0.85, 34);
  // Joist visual thickness
  const joistThickness = Math.max(frameThickness * 0.7, 28);
  // Noggin visual thickness
  const nogginThickness = Math.max(frameThickness * 0.55, 22);

  // Board overhang beyond the outer frame (one board width on each side)
  const overhang = boardWidth;

  // Gap between outer frame and inner edge beam (where noggins sit)
  // This represents the edge board zone width
  const edgeGap = hasEdgeBoards ? Math.max(boardWidth * 0.9, 80) : 0;

  // Outer frame rectangle
  const outerX = padX;
  const outerY = padY;
  const outerW = l;
  const outerH = r;

  // Inner edge beam rectangle (inset from outer frame by edgeGap + frameThickness)
  const innerX = outerX + frameThickness + edgeGap;
  const innerY = outerY + frameThickness + edgeGap;
  const innerW = outerW - 2 * (frameThickness + edgeGap);
  const innerH = outerH - 2 * (frameThickness + edgeGap);

  // Joist positions — distributed along the cross-axis (perpendicular to joist span)
  // Default (parallel): joists are vertical → positions are x-offsets across width (outerW)
  // Swapped (perpendicular): joists are horizontal → positions are y-offsets across height (outerH)
  const joistPositions = useMemo(() => {
    const positions: number[] = [];
    const joistCentres = option.joistCentres;
    // The dimension joists are distributed across
    const distDim = swapped ? outerH : outerW;
    const innerDist = swapped ? innerH : innerW;
    const spanDist = hasEdgeBoards ? innerDist - edgeBeamThickness * 2 : distDim - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanDist / joistCentres) + 1);
    for (let i = 0; i < count; i++) {
      const x = Math.min(i * joistCentres, spanDist);
      positions.push(x);
    }
    return positions;
  }, [outerW, outerH, innerW, innerH, option.joistCentres, frameThickness, edgeBeamThickness, hasEdgeBoards, swapped]);

  // Noggin positions along the edge gap (between outer and inner frames)
  // "Primary" noggins are on the sides perpendicular to joist span
  // "Secondary" noggins are on the sides parallel to joist span
  const primaryNogginPositions = useMemo(() => {
    if (!hasEdgeBoards) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    // Primary side runs along the joist distribution axis
    const spanLen = (swapped ? outerH : outerW) - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanLen / spacing) + 1);
    for (let i = 0; i < count; i++) {
      positions.push(Math.min(i * spacing, spanLen));
    }
    return positions;
  }, [outerW, outerH, option.joistCentres, frameThickness, hasEdgeBoards, swapped]);

  const secondaryNogginPositions = useMemo(() => {
    if (!hasEdgeBoards) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    // Secondary side runs along the joist span axis
    const spanLen = (swapped ? outerW : outerH) - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanLen / spacing) + 1);
    for (let i = 0; i < count; i++) {
      positions.push(Math.min(i * spacing, spanLen));
    }
    return positions;
  }, [outerW, outerH, option.joistCentres, frameThickness, hasEdgeBoards, swapped]);

  // Noggin positions for non-edge-board mode (between frame and first/last joist)
  // These run along the joist span axis (perpendicular to joist distribution)
  const simpleNogginPositions = useMemo(() => {
    if (hasEdgeBoards) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    const spanDim = (swapped ? outerW : outerH) - frameThickness * 2;
    const count = Math.max(2, Math.floor(spanDim / spacing));
    for (let i = 1; i < count; i++) {
      positions.push(frameThickness + i * (spanDim / count));
    }
    return positions;
  }, [outerW, outerH, option.joistCentres, frameThickness, hasEdgeBoards, swapped]);

  // Structural bearers (horizontal members for multi-span support)
  const bearerLines: BearerLine[] = option.bearerLines;
  const structuralBearers = useMemo(() => {
    return bearerLines.filter(bl => bl.type === "structural" && !bl.isWallAttached);
  }, [bearerLines]);

  // Breaker bearers — rendered as double beam with noggins
  const breakerBearers = useMemo(() => {
    return bearerLines.filter(bl => bl.type === "breaker");
  }, [bearerLines]);
  const hasBreaker = breakerBearers.length > 0;
  const breakerGap = hasBreaker ? Math.max(boardWidth * 0.9, 80) : 0;

  // Breaker direction: determines which axis the breaker beam runs along
  // "along-width" = breaker runs top-to-bottom (vertical in SVG, along the width axis)
  // "along-length" = breaker runs left-to-right (horizontal in SVG, along the length axis)
  const breakerDirection = boardLayout?.breakerDirection || "along-width";
  const breakerRunsVertical = breakerDirection === "along-width";

  // Noggin positions along the breaker gap (between the paired beams)
  const breakerNogginPositions = useMemo(() => {
    if (!hasBreaker) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    // Noggins distribute along the breaker beam length
    // If breaker runs vertical (along-width): noggins along outerH
    // If breaker runs horizontal (along-length): noggins along outerW
    const spanLen = (breakerRunsVertical ? outerH : outerW) - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanLen / spacing) + 1);
    for (let i = 0; i < count; i++) {
      positions.push(Math.min(i * spacing, spanLen));
    }
    return positions;
  }, [hasBreaker, outerW, outerH, option.joistCentres, frameThickness, breakerRunsVertical]);

  // Cutout dimensions
  const cutL =
    inputs.shape === "l-shape" || inputs.shape === "u-shape"
      ? Math.min(inputs.cutLength, l - 1)
      : 0;
  const cutW =
    inputs.shape === "l-shape" || inputs.shape === "u-shape"
      ? Math.min(inputs.cutWidth, r - 1)
      : 0;
  const cut2L =
    inputs.shape === "u-shape" ? Math.min(inputs.cut2Length, l - cutL - 1) : 0;
  const cut2W =
    inputs.shape === "u-shape" ? Math.min(inputs.cut2Width, r - 1) : 0;

  // Deck outline path (board overhang boundary)
  let deckPath: string;
  const ox = overhang;
  if (inputs.shape === "l-shape") {
    deckPath = [
      `M ${outerX - ox} ${outerY - ox}`,
      `L ${outerX + l + ox} ${outerY - ox}`,
      `L ${outerX + l + ox} ${outerY + r - cutW + ox}`,
      `L ${outerX + l - cutL + ox} ${outerY + r - cutW + ox}`,
      `L ${outerX + l - cutL + ox} ${outerY + r + ox}`,
      `L ${outerX - ox} ${outerY + r + ox}`,
      "Z",
    ].join(" ");
  } else if (inputs.shape === "u-shape") {
    deckPath = [
      `M ${outerX - ox} ${outerY - ox}`,
      `L ${outerX + l + ox} ${outerY - ox}`,
      `L ${outerX + l + ox} ${outerY + r - cut2W + ox}`,
      `L ${outerX + l - cut2L + ox} ${outerY + r - cut2W + ox}`,
      `L ${outerX + l - cut2L + ox} ${outerY + r + ox}`,
      `L ${outerX + cutL - ox} ${outerY + r + ox}`,
      `L ${outerX + cutL - ox} ${outerY + r - cutW + ox}`,
      `L ${outerX - ox} ${outerY + r - cutW + ox}`,
      "Z",
    ].join(" ");
  } else {
    deckPath = `M ${outerX - ox} ${outerY - ox} L ${outerX + l + ox} ${outerY - ox} L ${outerX + l + ox} ${outerY + r + ox} L ${outerX - ox} ${outerY + r + ox} Z`;
  }

  // Outer frame path
  const outerFramePath = inputs.shape === "rectangle"
    ? `M ${outerX} ${outerY} L ${outerX + l} ${outerY} L ${outerX + l} ${outerY + r} L ${outerX} ${outerY + r} Z`
    : inputs.shape === "l-shape"
    ? [
        `M ${outerX} ${outerY}`,
        `L ${outerX + l} ${outerY}`,
        `L ${outerX + l} ${outerY + r - cutW}`,
        `L ${outerX + l - cutL} ${outerY + r - cutW}`,
        `L ${outerX + l - cutL} ${outerY + r}`,
        `L ${outerX} ${outerY + r}`,
        "Z",
      ].join(" ")
    : [
        `M ${outerX} ${outerY}`,
        `L ${outerX + l} ${outerY}`,
        `L ${outerX + l} ${outerY + r - cut2W}`,
        `L ${outerX + l - cut2L} ${outerY + r - cut2W}`,
        `L ${outerX + l - cut2L} ${outerY + r}`,
        `L ${outerX + cutL} ${outerY + r}`,
        `L ${outerX + cutL} ${outerY + r - cutW}`,
        `L ${outerX} ${outerY + r - cutW}`,
        "Z",
      ].join(" ");

  // Joist start offset and span endpoints — orientation-aware
  // Default: joists are vertical → joistStart is X, span is Y (top to bottom)
  // Swapped: joists are horizontal → joistStart is Y, span is X (left to right)
  const joistDistStart = swapped
    ? (hasEdgeBoards ? innerY + edgeBeamThickness : outerY + frameThickness)
    : (hasEdgeBoards ? innerX + edgeBeamThickness : outerX + frameThickness);
  const joistSpanStart = swapped
    ? (hasEdgeBoards ? innerX + edgeBeamThickness : outerX + frameThickness)
    : (hasEdgeBoards ? innerY + edgeBeamThickness : outerY + frameThickness);
  const joistSpanEnd = swapped
    ? (hasEdgeBoards ? innerX + innerW - edgeBeamThickness : outerX + outerW - frameThickness)
    : (hasEdgeBoards ? innerY + innerH - edgeBeamThickness : outerY + outerH - frameThickness);

  return (
    <svg
      data-deck-schematic
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
    >
      {/* Defs: arrow marker, hatch pattern, clip path */}
      <defs>
        <marker
          id="arr"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
        </marker>
        <pattern
          id="hatch"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="14" stroke={HATCH_STROKE} strokeWidth="1" />
        </pattern>
        <pattern
          id="wallPlateHatch"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke={WALL_PLATE_FILL} strokeWidth="1.5" />
        </pattern>
        <clipPath id="deckClip">
          <path d={outerFramePath} />
        </clipPath>
      </defs>

      {/* Wall plate (if wall-mounted) */}
      {inputs.wall === "wall-mounted" && (
        <g>
          <rect
            x={outerX - 24}
            y={outerY - 40}
            width={l + 48}
            height={24}
            fill="url(#hatch)"
            stroke={INK}
            strokeWidth="1.5"
          />
          <text
            x={outerX + l / 2}
            y={outerY - 52}
            textAnchor="middle"
            fontSize={font}
            fill={INK}
            fontWeight="600"
          >
            HOUSE WALL
          </text>
          <rect
            x={outerX}
            y={outerY - 16}
            width={l}
            height={16}
            fill="url(#wallPlateHatch)"
            stroke={INK}
            strokeWidth="1.8"
          />
          <text
            x={outerX + l + font * 0.6}
            y={outerY - 8}
            dominantBaseline="middle"
            fontSize={font * 0.7}
            fill={INK}
            opacity="0.7"
          >
            wall plate
          </text>
          {[0.15, 0.35, 0.5, 0.65, 0.85].map((frac, i) => (
            <circle
              key={`bolt-${i}`}
              cx={outerX + l * frac}
              cy={outerY - 8}
              r={4}
              fill={INK}
              opacity="0.5"
            />
          ))}
        </g>
      )}

      {/* Board overhang outline (red) — the deck boards extend beyond the frame */}
      <path d={deckPath} fill="none" stroke={OVERHANG_STROKE} strokeWidth="1.8" />

      {/* Deck fill (light background inside outer frame) */}
      <path d={outerFramePath} fill={DECK_FILL} stroke="none" />

      {/* ─── Structural members (clipped to outer frame shape) ─── */}
      <g clipPath="url(#deckClip)">
        {/* Joists — orientation-aware: vertical (default) or horizontal (swapped) */}
        {joistPositions.map((jp, i) => {
          if (swapped) {
            // Horizontal joists: jp is y-offset, span is left-to-right
            return (
              <rect
                key={`joist-${i}`}
                x={joistSpanStart}
                y={joistDistStart + jp - joistThickness / 2}
                width={joistSpanEnd - joistSpanStart}
                height={joistThickness}
                fill={JOIST_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="1.2"
              />
            );
          }
          // Vertical joists (default): jp is x-offset, span is top-to-bottom
          return (
            <rect
              key={`joist-${i}`}
              x={joistDistStart + jp - joistThickness / 2}
              y={joistSpanStart}
              width={joistThickness}
              height={joistSpanEnd - joistSpanStart}
              fill={JOIST_FILL}
              stroke={FRAME_STROKE}
              strokeWidth="1.2"
            />
          );
        })}

        {/* ─── Edge board mode: Noggins on ALL 4 sides between outer frame and inner edge beams ─── */}
        {hasEdgeBoards && (<>
          {/* Primary side noggins (perpendicular to joist span direction) */}
          {/* Default: top/bottom. Swapped: left/right */}
          {primaryNogginPositions.map((np, i) => {
            if (swapped) {
              // Left side noggin (horizontal, between outer left and inner left)
              return (
                <rect
                  key={`noggin-pri-a-${i}`}
                  x={outerX + frameThickness}
                  y={outerY + frameThickness + np - nogginThickness / 2}
                  width={edgeGap}
                  height={nogginThickness}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
              );
            }
            // Top noggin (vertical, between outer top and inner top)
            return (
              <rect
                key={`noggin-pri-a-${i}`}
                x={outerX + frameThickness + np - nogginThickness / 2}
                y={outerY + frameThickness}
                width={nogginThickness}
                height={edgeGap}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            );
          })}
          {primaryNogginPositions.map((np, i) => {
            if (swapped) {
              // Right side noggin
              return (
                <rect
                  key={`noggin-pri-b-${i}`}
                  x={innerX + innerW}
                  y={outerY + frameThickness + np - nogginThickness / 2}
                  width={edgeGap}
                  height={nogginThickness}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
              );
            }
            // Bottom noggin
            return (
              <rect
                key={`noggin-pri-b-${i}`}
                x={outerX + frameThickness + np - nogginThickness / 2}
                y={innerY + innerH}
                width={nogginThickness}
                height={edgeGap}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            );
          })}

          {/* Secondary side noggins (parallel to joist span direction) */}
          {/* Default: left/right. Swapped: top/bottom */}
          {secondaryNogginPositions.map((ns, i) => {
            if (swapped) {
              // Top noggin (vertical)
              return (
                <rect
                  key={`noggin-sec-a-${i}`}
                  x={outerX + frameThickness + ns - nogginThickness / 2}
                  y={outerY + frameThickness}
                  width={nogginThickness}
                  height={edgeGap}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
              );
            }
            // Left noggin (horizontal)
            return (
              <rect
                key={`noggin-sec-a-${i}`}
                x={outerX + frameThickness}
                y={outerY + frameThickness + ns - nogginThickness / 2}
                width={edgeGap}
                height={nogginThickness}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            );
          })}
          {secondaryNogginPositions.map((ns, i) => {
            if (swapped) {
              // Bottom noggin (vertical)
              return (
                <rect
                  key={`noggin-sec-b-${i}`}
                  x={outerX + frameThickness + ns - nogginThickness / 2}
                  y={innerY + innerH}
                  width={nogginThickness}
                  height={edgeGap}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
              );
            }
            // Right noggin (horizontal)
            return (
              <rect
                key={`noggin-sec-b-${i}`}
                x={innerX + innerW}
                y={outerY + frameThickness + ns - nogginThickness / 2}
                width={edgeGap}
                height={nogginThickness}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            );
          })}
        </>)}

        {/* ─── Non-edge-board mode: Simple noggins between frame and first/last joist ─── */}
        {!hasEdgeBoards && joistPositions.length > 0 && simpleNogginPositions.map((np, i) => {
          const firstJoist = joistDistStart + joistPositions[0];
          const lastJoist = joistDistStart + joistPositions[joistPositions.length - 1];
          if (swapped) {
            // Joists are horizontal → noggins are vertical (top/bottom of joist field)
            return (
              <g key={`simple-noggin-${i}`}>
                {/* Top side */}
                <rect
                  x={outerX + np - nogginThickness / 2}
                  y={outerY + frameThickness}
                  width={nogginThickness}
                  height={firstJoist - outerY - frameThickness - joistThickness / 2}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
                {/* Bottom side */}
                <rect
                  x={outerX + np - nogginThickness / 2}
                  y={lastJoist + joistThickness / 2}
                  width={nogginThickness}
                  height={outerY + outerH - frameThickness - lastJoist - joistThickness / 2}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
              </g>
            );
          }
          // Default: joists are vertical → noggins are horizontal (left/right of joist field)
          return (
            <g key={`simple-noggin-${i}`}>
              {/* Left side */}
              <rect
                x={outerX + frameThickness}
                y={outerY + np - nogginThickness / 2}
                width={firstJoist - outerX - frameThickness - joistThickness / 2}
                height={nogginThickness}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
              {/* Right side */}
              <rect
                x={lastJoist + joistThickness / 2}
                y={outerY + np - nogginThickness / 2}
                width={outerX + outerW - frameThickness - lastJoist - joistThickness / 2}
                height={nogginThickness}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            </g>
          );
        })}

        {/* Structural bearers (intermediate members perpendicular to joists) */}
        {structuralBearers.map((bl, i) => {
          // yFraction is along the joist span axis
          if (bl.yFraction <= 0.05 || bl.yFraction >= 0.95) return null;
          if (swapped) {
            // Bearers are vertical (along width/outerW axis)
            const cx = outerX + bl.yFraction * outerW;
            return (
              <rect
                key={`bearer-${i}`}
                x={cx - frameThickness / 2}
                y={outerY + frameThickness}
                width={frameThickness}
                height={outerH - frameThickness * 2}
                fill={BEARER_FILL}
                stroke={BEARER_FILL}
                strokeWidth="0.6"
                opacity="0.75"
              />
            );
          }
          // Default: bearers are horizontal
          const cy = outerY + bl.yFraction * outerH;
          return (
            <rect
              key={`bearer-${i}`}
              x={outerX + frameThickness}
              y={cy - frameThickness / 2}
              width={outerW - frameThickness * 2}
              height={frameThickness}
              fill={BEARER_FILL}
              stroke={BEARER_FILL}
              strokeWidth="0.6"
              opacity="0.75"
            />
          );
        })}

        {/* ─── Breaker beams — double beam with noggins between them ─── */}
        {hasBreaker && (() => {
          const avgY = breakerBearers.reduce((s, b) => s + b.yFraction, 0) / breakerBearers.length;
          if (breakerRunsVertical) {
            // Breaker direction "along-width": beams run VERTICALLY (top-to-bottom)
            // Position along the length axis (X) using breakerPosition or yFraction fallback
            const breakerPos = inputs.boardLayout?.breakerPosition || 0;
            const centreX = breakerPos > 0
              ? outerX + (breakerPos / inputs.length) * outerW
              : outerX + avgY * outerW;
            const leftBeamX = centreX - breakerGap / 2 - edgeBeamThickness;
            const rightBeamX = centreX + breakerGap / 2;
            const beamY = outerY + frameThickness;
            const beamH = outerH - frameThickness * 2;
            return (
              <g>
                {/* Left vertical breaker beam */}
                <rect x={leftBeamX} y={beamY} width={edgeBeamThickness} height={beamH}
                  fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
                {/* Right vertical breaker beam */}
                <rect x={rightBeamX} y={beamY} width={edgeBeamThickness} height={beamH}
                  fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
                {/* Horizontal noggins between the two vertical beams */}
                {breakerNogginPositions.map((np, i) => (
                  <rect
                    key={`brk-nog-${i}`}
                    x={leftBeamX + edgeBeamThickness}
                    y={outerY + frameThickness + np - nogginThickness / 2}
                    width={breakerGap}
                    height={nogginThickness}
                    fill={NOGGIN_FILL}
                    stroke={FRAME_STROKE}
                    strokeWidth="0.6"
                  />
                ))}
              </g>
            );
          }
          // Breaker direction "along-length": beams run HORIZONTALLY (left-to-right)
          const centreY = outerY + avgY * outerH;
          const topBeamY = centreY - breakerGap / 2 - edgeBeamThickness;
          const botBeamY = centreY + breakerGap / 2;
          const beamX = outerX + frameThickness;
          const beamW = outerW - frameThickness * 2;
          return (
            <g>
              <rect x={beamX} y={topBeamY} width={beamW} height={edgeBeamThickness}
                fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
              <rect x={beamX} y={botBeamY} width={beamW} height={edgeBeamThickness}
                fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
              {breakerNogginPositions.map((nx, i) => (
                <rect
                  key={`brk-nog-${i}`}
                  x={outerX + frameThickness + nx - nogginThickness / 2}
                  y={topBeamY + edgeBeamThickness}
                  width={nogginThickness}
                  height={breakerGap}
                  fill={NOGGIN_FILL}
                  stroke={FRAME_STROKE}
                  strokeWidth="0.6"
                />
              ))}
            </g>
          );
        })()}
      </g>

      {/* ─── Inner edge beams (second perimeter frame, inset from outer) ─── */}
      {hasEdgeBoards && (
        <g>
          {/* Top inner beam */}
          <rect
            x={innerX}
            y={innerY}
            width={innerW}
            height={edgeBeamThickness}
            fill={EDGE_BEAM_FILL}
            stroke={FRAME_STROKE}
            strokeWidth="1"
          />
          {/* Bottom inner beam */}
          <rect
            x={innerX}
            y={innerY + innerH - edgeBeamThickness}
            width={innerW}
            height={edgeBeamThickness}
            fill={EDGE_BEAM_FILL}
            stroke={FRAME_STROKE}
            strokeWidth="1"
          />
          {/* Left inner beam */}
          <rect
            x={innerX}
            y={innerY}
            width={edgeBeamThickness}
            height={innerH}
            fill={EDGE_BEAM_FILL}
            stroke={FRAME_STROKE}
            strokeWidth="1"
          />
          {/* Right inner beam */}
          <rect
            x={innerX + innerW - edgeBeamThickness}
            y={innerY}
            width={edgeBeamThickness}
            height={innerH}
            fill={EDGE_BEAM_FILL}
            stroke={FRAME_STROKE}
            strokeWidth="1"
          />
        </g>
      )}

      {/* ─── Outer perimeter frame — 4 thick members forming the rectangular border ─── */}
      {/* Top beam */}
      <rect
        x={outerX}
        y={outerY}
        width={outerW}
        height={frameThickness}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        strokeWidth="1.2"
      />
      {/* Bottom beam */}
      <rect
        x={outerX}
        y={outerY + outerH - frameThickness}
        width={outerW}
        height={frameThickness}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        strokeWidth="1.2"
      />
      {/* Left beam */}
      <rect
        x={outerX}
        y={outerY}
        width={frameThickness}
        height={outerH}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        strokeWidth="1.2"
      />
      {/* Right beam */}
      <rect
        x={outerX + outerW - frameThickness}
        y={outerY}
        width={frameThickness}
        height={outerH}
        fill={FRAME_FILL}
        stroke={FRAME_STROKE}
        strokeWidth="1.2"
      />

      {/* Outer frame outline (crisp border) */}
      <path d={outerFramePath} fill="none" stroke={FRAME_STROKE} strokeWidth="1.5" />

      {/* L-shape void */}
      {inputs.shape === "l-shape" && cutL > 0 && cutW > 0 && (
        <g>
          <HorizontalDim
            x1={outerX + l - cutL}
            x2={outerX + l}
            y={outerY + r - cutW - 44}
            label={`${formatMM(cutL)} mm`}
            font={font * 0.78}
            dashed
          />
          <VerticalDim
            y1={outerY + r - cutW}
            y2={outerY + r}
            x={outerX + l + 62}
            label={`${formatMM(cutW)} mm`}
            font={font * 0.78}
            dashed
          />
          <rect
            x={outerX + l - cutL}
            y={outerY + r - cutW}
            width={cutL}
            height={cutW}
            fill="url(#hatch)"
            opacity="0.4"
            stroke={HATCH_STROKE}
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text
            x={outerX + l - cutL / 2}
            y={outerY + r - cutW / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={font * 0.72}
            fill={INK}
            opacity="0.5"
          >
            VOID
          </text>
        </g>
      )}

      {/* U-shape voids */}
      {inputs.shape === "u-shape" && (
        <g>
          {cutL > 0 && cutW > 0 && (
            <g>
              <rect
                x={outerX}
                y={outerY + r - cutW}
                width={cutL}
                height={cutW}
                fill="url(#hatch)"
                opacity="0.4"
                stroke={HATCH_STROKE}
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text
                x={outerX + cutL / 2}
                y={outerY + r - cutW / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font * 0.72}
                fill={INK}
                opacity="0.5"
              >
                VOID
              </text>
              <HorizontalDim
                x1={outerX}
                x2={outerX + cutL}
                y={outerY + r - cutW - 44}
                label={`${formatMM(cutL)} mm`}
                font={font * 0.78}
                dashed
              />
              <VerticalDim
                y1={outerY + r - cutW}
                y2={outerY + r}
                x={outerX - 62}
                label={`${formatMM(cutW)} mm`}
                font={font * 0.78}
                dashed
              />
            </g>
          )}
          {cut2L > 0 && cut2W > 0 && (
            <g>
              <rect
                x={outerX + l - cut2L}
                y={outerY + r - cut2W}
                width={cut2L}
                height={cut2W}
                fill="url(#hatch)"
                opacity="0.4"
                stroke={HATCH_STROKE}
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text
                x={outerX + l - cut2L / 2}
                y={outerY + r - cut2W / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font * 0.72}
                fill={INK}
                opacity="0.5"
              >
                VOID
              </text>
              <HorizontalDim
                x1={outerX + l - cut2L}
                x2={outerX + l}
                y={outerY + r - cut2W - 44}
                label={`${formatMM(cut2L)} mm`}
                font={font * 0.78}
                dashed
              />
              <VerticalDim
                y1={outerY + r - cut2W}
                y2={outerY + r}
                x={outerX + l + 62}
                label={`${formatMM(cut2W)} mm`}
                font={font * 0.78}
                dashed
              />
            </g>
          )}
        </g>
      )}

      {/* Posts */}
      {bearerLines.map((bl, bi) => {
        const cy = outerY + bl.yFraction * outerH;
        return (
          <g key={`posts-${bi}`}>
            {bl.posts.map((post, pi) => {
              const px = outerX + post.t * l;
              return (
                <g key={`post-${bi}-${pi}`}>
                  <rect
                    x={px - postSize / 2}
                    y={cy - postSize / 2}
                    width={postSize}
                    height={postSize}
                    fill={POST_FILL}
                    stroke={INK}
                    strokeWidth="1.5"
                    rx="2"
                  />
                  <text
                    x={px}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={postFontSize}
                    fill={POST_LABEL}
                    fontWeight="700"
                    fontFamily="'Inter Tight', ui-sans-serif, sans-serif"
                  >
                    P
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Dimension annotations */}
      <HorizontalDim
        x1={outerX}
        x2={outerX + l}
        y={outerY - (inputs.wall === "wall-mounted" ? 82 : 58)}
        label={`L = ${formatMM(inputs.length)} mm`}
        font={font}
      />
      <VerticalDim
        y1={outerY}
        y2={outerY + r}
        x={outerX + l + (inputs.shape === "l-shape" ? 140 : 62)}
        label={`W = ${formatMM(inputs.width)} mm`}
        font={font}
      />

      {/* Overhang dimension */}
      {overhang > 0 && (
        <HorizontalDim
          x1={outerX - overhang}
          x2={outerX}
          y={outerY + r + 44}
          label={`${formatMM(overhang)} oh`}
          font={font * 0.72}
          dashed
        />
      )}

      {/* Edge beam inset dimension (gap between outer and inner frames) */}
      {hasEdgeBoards && (
        <VerticalDim
          y1={outerY + frameThickness}
          y2={innerY}
          x={outerX - 62}
          label={`${formatMM(Math.round(edgeGap))} edge`}
          font={font * 0.72}
          dashed
        />
      )}

      {/* Joist centres dimension */}
      {joistPositions.length >= 2 && (() => {
        if (swapped) {
          // Joists horizontal → show vertical dim for joist c/c
          return (
            <VerticalDim
              y1={joistDistStart + joistPositions[0]}
              y2={joistDistStart + joistPositions[1]}
              x={outerX + outerW + 62}
              label={`${option.joistCentres} c/c`}
              font={font * 0.82}
              dashed
            />
          );
        }
        return (
          <HorizontalDim
            x1={joistDistStart + joistPositions[0]}
            x2={joistDistStart + joistPositions[1]}
            y={outerY + r + 44 + font * 2}
            label={`${option.joistCentres} c/c`}
            font={font * 0.82}
            dashed
          />
        );
      })()}

      {/* Noggin spacing dimension (between outer and inner frame) */}
      {hasEdgeBoards && secondaryNogginPositions.length >= 2 && (
        <VerticalDim
          y1={outerY + frameThickness + secondaryNogginPositions[0]}
          y2={outerY + frameThickness + secondaryNogginPositions[1]}
          x={outerX + outerW + 62}
          label={`${option.joistCentres} nog c/c`}
          font={font * 0.72}
          dashed
        />
      )}

      {/* Post centres dimension */}
      {(() => {
        const bl = bearerLines.find(
          (b) => !b.isWallAttached && b.posts.length >= 2
        );
        if (!bl) return null;
        const px1 = outerX + bl.posts[0].t * l;
        const px2 = outerX + bl.posts[1].t * l;
        const dy = outerY + r + 44 + font * 4;
        return (
          <HorizontalDim
            x1={px1}
            x2={px2}
            y={dy}
            label={`${formatMM(
              Math.round((bl.posts[1].t - bl.posts[0].t) * inputs.length)
            )} post c/c`}
            font={font * 0.82}
            dashed
          />
        );
      })()}

      {/* Joist span dimension */}
      {structuralBearers.length >= 1 && (() => {
        if (swapped) {
          // Joist span is horizontal
          const cx = outerX + structuralBearers[0].yFraction * outerW;
          return (
            <HorizontalDim
              x1={joistSpanStart}
              x2={cx}
              y={outerY - 58}
              label={`${formatMM(option.joistLength)} span`}
              font={font * 0.82}
              dashed
            />
          );
        }
        return (
          <VerticalDim
            y1={joistSpanStart}
            y2={outerY + structuralBearers[0].yFraction * outerH}
            x={outerX - (hasEdgeBoards ? 130 : 62)}
            label={`${formatMM(option.joistLength)} span`}
            font={font * 0.82}
            dashed
          />
        );
      })()}

      {/* Legend */}
      <g transform={`translate(${outerX}, ${outerY + r + font * 5.5})`}>
        {/* Row 1 */}
        <rect x={0} y={-5} width={24} height={10} fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
        <text x={30} y={4} fontSize={font * 0.65} fill={INK}>Outer Frame</text>

        {hasEdgeBoards && (<>
          <rect x={150} y={-5} width={24} height={10} fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
          <text x={180} y={4} fontSize={font * 0.65} fill={INK}>Edge Beam</text>
        </>)}

        <rect x={hasEdgeBoards ? 300 : 150} y={-5} width={24} height={10} fill={JOIST_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
        <text x={hasEdgeBoards ? 330 : 180} y={4} fontSize={font * 0.65} fill={INK}>Joist</text>

        <rect x={hasEdgeBoards ? 400 : 250} y={-5} width={24} height={10} fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
        <text x={hasEdgeBoards ? 430 : 280} y={4} fontSize={font * 0.65} fill={INK}>Noggin</text>

        {/* Row 2 */}
        <rect x={0} y={font * 1.4 - 5} width={24} height={10} fill={BEARER_FILL} stroke={BEARER_FILL} strokeWidth="0.6" opacity="0.75" />
        <text x={30} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Bearer</text>

        <rect x={150} y={font * 1.4 - 6} width={12} height={12} fill={POST_FILL} stroke={INK} strokeWidth="0.8" />
        <text x={168} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Post</text>

        <line x1={250} y1={font * 1.4} x2={274} y2={font * 1.4} stroke={OVERHANG_STROKE} strokeWidth="1.8" />
        <text x={280} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Board Overhang</text>

        {hasBreaker && (<>
          <rect x={420} y={font * 1.4 - 5} width={24} height={10} fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
          <text x={450} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Breaker Beam</text>
        </>)}

        <text
          x={l}
          y={font * 1.4 + 4}
          textAnchor="end"
          fontSize={font * 0.6}
          fill={INK}
          opacity="0.6"
          fontStyle="italic"
        >
          Drawn — not to scale
        </text>
      </g>
    </svg>
  );
}
