/**
 * DeckBoardLayout — Separate SVG showing the decking board layout.
 * Displays board direction, spacing, picture frame, breaker board,
 * and product info clearly without framing/engineering clutter.
 */
import { useMemo } from "react";
import type { BoardLayoutInputs } from "../../../../shared/subfloor-calc";
import { DEFAULT_BOARD_LAYOUT } from "../../../../shared/subfloor-calc";

interface Props {
  /** Deck length in mm */
  lengthMm: number;
  /** Deck width (projection) in mm */
  widthMm: number;
  /** Board layout configuration */
  boardLayout?: BoardLayoutInputs;
  /** Product name for label */
  productName?: string;
  /** Colour name for label */
  colourName?: string;
}

// ─── Colour tokens ─────────────────────────────────────────────────────────
const INK = "oklch(0.24 0.018 250)";
const BOARD_LINE = "oklch(0.40 0.12 55 / 0.7)";
const EDGE_FILL = "oklch(0.55 0.14 55 / 0.35)";
const EDGE_STROKE = "oklch(0.40 0.12 55 / 0.8)";
const DECK_BG = "oklch(0.95 0.02 80 / 0.5)";
const BREAKER_FILL = "oklch(0.50 0.14 55 / 0.4)";
const DIM_LINE = "oklch(0.35 0.02 250 / 0.6)";

export default function DeckBoardLayout({
  lengthMm,
  widthMm,
  boardLayout,
  productName,
  colourName,
}: Props) {
  const bl = boardLayout || DEFAULT_BOARD_LAYOUT;
  const boardWidth = bl.boardWidth || 138;
  const boardGap = bl.boardGap ?? 5.5;
  const boardLength = bl.boardLength || 5400;
  const direction = bl.boardDirection || "parallel";
  const stagger = bl.staggerPattern || "random";
  const pictureFrame = bl.pictureFrame || "none";
  const breakerBoard = bl.breakerBoard || "none";
  const diagonalAngle = bl.diagonalAngle || 45;

  // Scale to fit in a reasonable SVG size
  // Use a scale where the longer dimension = ~600 SVG units
  const maxDim = Math.max(lengthMm, widthMm);
  const scale = 600 / maxDim;
  const l = lengthMm * scale;
  const w = widthMm * scale;
  const pad = 60;
  const vbW = l + pad * 2;
  const vbH = w + pad * 2 + 40; // extra for labels at bottom
  const font = 14;

  const pitch = (boardWidth + boardGap) * scale;
  const pfBoardW = boardWidth * scale;
  const gapW = boardGap * scale;

  // Picture frame inset
  const pfInset =
    pictureFrame === "double"
      ? pfBoardW * 2 + gapW * 2
      : pictureFrame === "single"
        ? pfBoardW + gapW
        : 0;

  // Board lines
  const boardLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (pitch <= 0) return lines;

    if (direction === "parallel") {
      for (let y = pfInset + pitch; y < w - pfInset; y += pitch) {
        lines.push({ x1: pad + pfInset, y1: pad + y, x2: pad + l - pfInset, y2: pad + y });
      }
    } else if (direction === "perpendicular") {
      for (let x = pfInset + pitch; x < l - pfInset; x += pitch) {
        lines.push({ x1: pad + x, y1: pad + pfInset, x2: pad + x, y2: pad + w - pfInset });
      }
    } else if (direction === "diagonal") {
      const rad = (diagonalAngle * Math.PI) / 180;
      const step = pitch / Math.cos(rad);
      const totalDist = l + w;
      for (let d = -totalDist; d < totalDist * 2; d += step) {
        const x1 = pad + pfInset + d;
        const y1 = pad + pfInset;
        const x2 = x1 + (w - pfInset * 2) / Math.tan(rad);
        const y2 = pad + w - pfInset;
        lines.push({ x1, y1, x2, y2 });
      }
    }
    return lines;
  }, [direction, pitch, pfInset, l, w, pad, diagonalAngle]);

  // Stagger joint lines (perpendicular to board direction)
  const staggerJoints = useMemo(() => {
    const joints: { x1: number; y1: number; x2: number; y2: number; row: number }[] = [];
    if (stagger === "equal" || direction === "diagonal") return joints;
    const stockLen = boardLength * scale;
    if (stockLen <= 0 || stockLen >= (direction === "parallel" ? l : w)) return joints;

    // Determine how many board rows we have
    const fieldStart = pfInset;
    const fieldEnd = (direction === "parallel" ? w : l) - pfInset;
    const numRows = Math.floor((fieldEnd - fieldStart) / pitch);

    // Stagger offset per row
    const getOffset = (row: number): number => {
      if (stagger === "third") return (row % 3) * (stockLen / 3);
      if (stagger === "quarter") return (row % 4) * (stockLen / 4);
      // "random" — use a pseudo-random but deterministic pattern
      return ((row * 1.618) % 1) * stockLen * 0.6;
    };

    for (let r = 0; r < numRows; r++) {
      const offset = getOffset(r);
      const fieldLen = direction === "parallel" ? l - pfInset * 2 : w - pfInset * 2;
      // Draw joint marks along the board run
      let pos = offset > 0 ? offset : stockLen;
      while (pos < fieldLen) {
        if (direction === "parallel") {
          const x = pad + pfInset + pos;
          const y = pad + fieldStart + r * pitch;
          joints.push({ x1: x, y1: y, x2: x, y2: y + pitch, row: r });
        } else {
          const y = pad + pfInset + pos;
          const x = pad + fieldStart + r * pitch;
          joints.push({ x1: x, y1: y, x2: x + pitch, y2: y, row: r });
        }
        pos += stockLen;
      }
    }
    return joints;
  }, [stagger, direction, boardLength, scale, l, w, pfInset, pitch, pad]);

  // Breaker position
  const breakerPos = useMemo(() => {
    if (breakerBoard === "none") return null;
    const pos = bl.breakerPosition || 0;
    const actualPos = pos > 0 ? pos * scale : l / 2;
    return actualPos;
  }, [breakerBoard, bl.breakerPosition, l, scale]);

  // Direction arrow
  const arrowLabel =
    direction === "parallel"
      ? "→ Boards parallel to length"
      : direction === "perpendicular"
        ? "↓ Boards perpendicular"
        : `↗ Boards diagonal (${diagonalAngle}°)`;

  return (
    <div className="space-y-1">
      <svg
        data-board-layout-svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full h-auto max-h-[280px]"
        preserveAspectRatio="xMidYMid meet"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        {/* Clip path for deck outline */}
        <defs>
          <clipPath id="boardClip">
            <rect x={pad} y={pad} width={l} height={w} />
          </clipPath>
          <marker
            id="boardArr"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DIM_LINE} />
          </marker>
        </defs>

        {/* Deck background */}
        <rect
          x={pad}
          y={pad}
          width={l}
          height={w}
          fill={DECK_BG}
          stroke={INK}
          strokeWidth="2"
        />

        {/* Board lines (clipped) */}
        <g clipPath="url(#boardClip)">
          {boardLines.map((line, i) => (
            <line
              key={`bl-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={BOARD_LINE}
              strokeWidth="1.5"
            />
          ))}
          {/* Stagger joint marks */}
          {staggerJoints.map((j, i) => (
            <line
              key={`sj-${i}`}
              x1={j.x1}
              y1={j.y1}
              x2={j.x2}
              y2={j.y2}
              stroke="oklch(0.30 0.05 30 / 0.6)"
              strokeWidth="1.2"
              strokeDasharray="3 2"
            />
          ))}
        </g>

        {/* Picture frame edge boards */}
        {pictureFrame !== "none" && (
          <g clipPath="url(#boardClip)">
            {/* Top edge */}
            <rect x={pad} y={pad} width={l} height={pfBoardW} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1.5" />
            {/* Bottom edge */}
            <rect x={pad} y={pad + w - pfBoardW} width={l} height={pfBoardW} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1.5" />
            {/* Left edge */}
            <rect x={pad} y={pad + pfBoardW} width={pfBoardW} height={w - pfBoardW * 2} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1.5" />
            {/* Right edge */}
            <rect x={pad + l - pfBoardW} y={pad + pfBoardW} width={pfBoardW} height={w - pfBoardW * 2} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1.5" />

            {/* Double picture frame inner row */}
            {pictureFrame === "double" && (
              <>
                <rect x={pad + pfBoardW + gapW} y={pad + pfBoardW + gapW} width={l - (pfBoardW + gapW) * 2} height={pfBoardW} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1" opacity="0.8" />
                <rect x={pad + pfBoardW + gapW} y={pad + w - pfBoardW * 2 - gapW} width={l - (pfBoardW + gapW) * 2} height={pfBoardW} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1" opacity="0.8" />
                <rect x={pad + pfBoardW + gapW} y={pad + pfBoardW * 2 + gapW * 2} width={pfBoardW} height={w - (pfBoardW + gapW) * 2 - pfBoardW * 2} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1" opacity="0.8" />
                <rect x={pad + l - pfBoardW * 2 - gapW} y={pad + pfBoardW * 2 + gapW * 2} width={pfBoardW} height={w - (pfBoardW + gapW) * 2 - pfBoardW * 2} fill={EDGE_FILL} stroke={EDGE_STROKE} strokeWidth="1" opacity="0.8" />
              </>
            )}

            {/* Label */}
            <text
              x={pad + l / 2}
              y={pad + pfBoardW / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={font * 0.75}
              fill={INK}
              fontWeight="700"
            >
              PICTURE FRAME{pictureFrame === "double" ? " (DOUBLE)" : ""}
            </text>
          </g>
        )}

        {/* Breaker board */}
        {breakerBoard !== "none" && breakerPos && (() => {
          const bDir = bl.breakerDirection || "along-width";
          if (bDir === "along-width") {
            // Vertical breaker strip (runs top-to-bottom, positioned along length)
            return (
              <g clipPath="url(#boardClip)">
                <rect
                  x={pad + breakerPos - pfBoardW / 2}
                  y={pad}
                  width={pfBoardW}
                  height={w}
                  fill={BREAKER_FILL}
                  stroke={EDGE_STROKE}
                  strokeWidth="2"
                />
                {breakerBoard === "double" && (
                  <rect
                    x={pad + breakerPos + pfBoardW / 2 + gapW}
                    y={pad}
                    width={pfBoardW}
                    height={w}
                    fill={BREAKER_FILL}
                    stroke={EDGE_STROKE}
                    strokeWidth="1.5"
                    opacity="0.8"
                  />
                )}
                <text
                  x={pad + breakerPos}
                  y={pad + w / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={font * 0.7}
                  fill={INK}
                  fontWeight="700"
                  transform={`rotate(-90, ${pad + breakerPos}, ${pad + w / 2})`}
                >
                  BREAKER
                </text>
              </g>
            );
          }
          // along-length: Horizontal breaker strip (runs left-to-right, positioned along width)
          const hPos = breakerPos > l / 2 ? w / 2 : (breakerPos / l) * w || w / 2;
          return (
            <g clipPath="url(#boardClip)">
              <rect
                x={pad}
                y={pad + hPos - pfBoardW / 2}
                width={l}
                height={pfBoardW}
                fill={BREAKER_FILL}
                stroke={EDGE_STROKE}
                strokeWidth="2"
              />
              {breakerBoard === "double" && (
                <rect
                  x={pad}
                  y={pad + hPos + pfBoardW / 2 + gapW}
                  width={l}
                  height={pfBoardW}
                  fill={BREAKER_FILL}
                  stroke={EDGE_STROKE}
                  strokeWidth="1.5"
                  opacity="0.8"
                />
              )}
              <text
                x={pad + l / 2}
                y={pad + hPos}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font * 0.7}
                fill={INK}
                fontWeight="700"
              >
                BREAKER
              </text>
            </g>
          );
        })()}

        {/* Deck outline (on top) */}
        <rect
          x={pad}
          y={pad}
          width={l}
          height={w}
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
        />

        {/* Dimension: length */}
        <line
          x1={pad}
          y1={pad + w + 20}
          x2={pad + l}
          y2={pad + w + 20}
          stroke={DIM_LINE}
          strokeWidth="1"
          markerStart="url(#boardArr)"
          markerEnd="url(#boardArr)"
        />
        <text
          x={pad + l / 2}
          y={pad + w + 34}
          textAnchor="middle"
          fontSize={font * 0.8}
          fill={INK}
        >
          {(lengthMm / 1000).toFixed(2)}m
        </text>

        {/* Dimension: width */}
        <line
          x1={pad + l + 20}
          y1={pad}
          x2={pad + l + 20}
          y2={pad + w}
          stroke={DIM_LINE}
          strokeWidth="1"
          markerStart="url(#boardArr)"
          markerEnd="url(#boardArr)"
        />
        <text
          x={pad + l + 32}
          y={pad + w / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={font * 0.8}
          fill={INK}
          transform={`rotate(90, ${pad + l + 32}, ${pad + w / 2})`}
        >
          {(widthMm / 1000).toFixed(2)}m
        </text>

        {/* Direction label */}
        <text
          x={pad + l / 2}
          y={pad - 12}
          textAnchor="middle"
          fontSize={font * 0.85}
          fill={INK}
          fontWeight="600"
        >
          {arrowLabel}
        </text>

        {/* Board spacing annotation */}
        {pitch > 0 && (
          <text
            x={pad + l / 2}
            y={pad + w + 52}
            textAnchor="middle"
            fontSize={font * 0.7}
            fill="oklch(0.45 0.02 250)"
          >
            Board: {boardWidth}mm + {boardGap}mm gap = {(boardWidth + boardGap).toFixed(1)}mm c/c | Stagger: {stagger}
          </text>
        )}
      </svg>

      {/* Product info below SVG */}
      {(productName || colourName) && (
        <p className="text-[10px] text-muted-foreground text-center">
          {productName}{colourName ? ` — ${colourName}` : ""}
        </p>
      )}
    </div>
  );
}
