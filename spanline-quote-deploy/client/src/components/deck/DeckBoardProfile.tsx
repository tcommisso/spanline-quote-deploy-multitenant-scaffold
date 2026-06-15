/**
 * DeckBoardProfile — Cross-section SVG showing individual board profiles
 * side by side with gap spacing, nosing detail, and joist below.
 * Helps visualise board width, gap, and overall deck surface profile.
 */
import type { BoardLayoutInputs } from "../../../../shared/subfloor-calc";
import { DEFAULT_BOARD_LAYOUT } from "../../../../shared/subfloor-calc";

interface Props {
  boardLayout?: BoardLayoutInputs;
  /** Product name for label */
  productName?: string;
}

// ─── Colour tokens ─────────────────────────────────────────────────────────
const INK = "oklch(0.24 0.018 250)";
const BOARD_FILL = "oklch(0.55 0.14 55 / 0.6)";
const BOARD_STROKE = "oklch(0.38 0.14 55)";
const JOIST_FILL = "oklch(0.65 0.06 55 / 0.4)";
const JOIST_STROKE = "oklch(0.42 0.06 55)";
const DIM_LINE = "oklch(0.35 0.02 250 / 0.6)";
const GAP_FILL = "oklch(0.92 0.01 250 / 0.5)";

export default function DeckBoardProfile({ boardLayout, productName }: Props) {
  const bl = boardLayout || DEFAULT_BOARD_LAYOUT;
  const boardWidth = bl.boardWidth || 138;
  const boardGap = bl.boardGap ?? 5.5;
  const pictureFrame = bl.pictureFrame || "none";

  // Fixed dimensions for the profile view (mm)
  const boardThickness = 22;
  const joistWidth = 45;
  const joistDepth = 45;
  const numBoards = 4; // show 4 boards in cross-section
  const hasEdge = pictureFrame !== "none";

  // Scale: fit ~4 boards + gaps + optional edge into ~400 SVG units wide
  const totalBoardSpan = numBoards * boardWidth + (numBoards - 1) * boardGap + (hasEdge ? boardWidth + boardGap : 0);
  const scale = 380 / totalBoardSpan;
  const s = scale;

  const pad = 40;
  const svgW = totalBoardSpan * s + pad * 2 + 40;
  const svgH = (boardThickness + joistDepth + 30) * s + pad * 2 + 30;
  const font = 11;

  // Y positions
  const yBoardTop = pad + 20;
  const yBoardBottom = yBoardTop + boardThickness * s;
  const yJoistTop = yBoardBottom + 2; // small gap
  const yJoistBottom = yJoistTop + joistDepth * s;

  // Board positions
  const boards: { x: number; w: number; label?: string }[] = [];
  let xCursor = pad + 10;

  // Edge board (picture frame) on left side
  if (hasEdge) {
    boards.push({ x: xCursor, w: boardWidth * s, label: "PF" });
    xCursor += boardWidth * s + boardGap * s;
  }

  // Regular boards
  for (let i = 0; i < numBoards; i++) {
    boards.push({ x: xCursor, w: boardWidth * s });
    xCursor += boardWidth * s;
    if (i < numBoards - 1) xCursor += boardGap * s;
  }

  // Joist position (centered under boards)
  const joistX = pad + 10 + totalBoardSpan * s / 2 - (joistWidth * s) / 2;

  return (
    <div className="space-y-1">
      <svg
        data-board-profile-svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-auto max-h-[160px]"
        preserveAspectRatio="xMidYMid meet"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        <defs>
          <marker
            id="profArr"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="3"
            markerHeight="3"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DIM_LINE} />
          </marker>
        </defs>

        {/* Joist (below boards) */}
        <rect
          x={joistX}
          y={yJoistTop}
          width={joistWidth * s}
          height={joistDepth * s}
          fill={JOIST_FILL}
          stroke={JOIST_STROKE}
          strokeWidth="1.5"
        />
        <text
          x={joistX + (joistWidth * s) / 2}
          y={yJoistTop + (joistDepth * s) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={font * 0.55}
          fill={INK}
        >
          JOIST
        </text>

        {/* Board profiles */}
        {boards.map((board, i) => (
          <g key={`board-${i}`}>
            {/* Board rectangle with rounded top corners */}
            <rect
              x={board.x}
              y={yBoardTop}
              width={board.w}
              height={boardThickness * s}
              rx={2}
              ry={1}
              fill={BOARD_FILL}
              stroke={BOARD_STROKE}
              strokeWidth="1.5"
            />
            {/* Picture frame label */}
            {board.label && (
              <text
                x={board.x + board.w / 2}
                y={yBoardTop + boardThickness * s / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font * 0.5}
                fill={INK}
                fontWeight="700"
              >
                {board.label}
              </text>
            )}
          </g>
        ))}

        {/* Gap indicators between boards */}
        {boards.slice(0, -1).map((board, i) => {
          const gapX = board.x + board.w;
          const gapWidth = boards[i + 1].x - gapX;
          if (gapWidth <= 0) return null;
          return (
            <g key={`gap-${i}`}>
              <rect
                x={gapX}
                y={yBoardTop}
                width={gapWidth}
                height={boardThickness * s}
                fill={GAP_FILL}
              />
              {/* Gap dimension (show on first gap only) */}
              {i === (hasEdge ? 1 : 0) && gapWidth > 3 && (
                <>
                  <line
                    x1={gapX + 1}
                    y1={yBoardTop - 8}
                    x2={gapX + gapWidth - 1}
                    y2={yBoardTop - 8}
                    stroke={DIM_LINE}
                    strokeWidth="0.8"
                    markerStart="url(#profArr)"
                    markerEnd="url(#profArr)"
                  />
                  <text
                    x={gapX + gapWidth / 2}
                    y={yBoardTop - 12}
                    textAnchor="middle"
                    fontSize={font * 0.55}
                    fill={INK}
                  >
                    {boardGap}mm
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Board width dimension (on second regular board) */}
        {(() => {
          const targetIdx = hasEdge ? 1 : 0;
          const board = boards[targetIdx];
          if (!board) return null;
          return (
            <>
              <line
                x1={board.x}
                y1={yBoardBottom + 12}
                x2={board.x + board.w}
                y2={yBoardBottom + 12}
                stroke={DIM_LINE}
                strokeWidth="0.8"
                markerStart="url(#profArr)"
                markerEnd="url(#profArr)"
              />
              <text
                x={board.x + board.w / 2}
                y={yBoardBottom + 22}
                textAnchor="middle"
                fontSize={font * 0.6}
                fill={INK}
              >
                {boardWidth}mm
              </text>
            </>
          );
        })()}

        {/* Board thickness dimension (right side) */}
        <line
          x1={xCursor + 10}
          y1={yBoardTop}
          x2={xCursor + 10}
          y2={yBoardBottom}
          stroke={DIM_LINE}
          strokeWidth="0.8"
          markerStart="url(#profArr)"
          markerEnd="url(#profArr)"
        />
        <text
          x={xCursor + 18}
          y={(yBoardTop + yBoardBottom) / 2}
          dominantBaseline="middle"
          fontSize={font * 0.5}
          fill={INK}
        >
          {boardThickness}mm
        </text>

        {/* Title */}
        <text x={pad} y={pad - 20} fontSize={font * 0.8} fill={INK} fontWeight="700">
          Board Profile (Cross-Section)
        </text>
        {productName && (
          <text x={pad} y={pad - 6} fontSize={font * 0.6} fill="oklch(0.45 0.02 250)">
            {productName}
          </text>
        )}

        {/* Pitch annotation */}
        <text
          x={pad + 10 + totalBoardSpan * s / 2}
          y={svgH - 8}
          textAnchor="middle"
          fontSize={font * 0.6}
          fill="oklch(0.45 0.02 250)"
        >
          {boardWidth}mm board + {boardGap}mm gap = {(boardWidth + boardGap).toFixed(1)}mm c/c
        </text>
      </svg>
    </div>
  );
}
