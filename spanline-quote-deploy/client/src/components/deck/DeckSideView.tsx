/**
 * DeckSideView — Cross-section / side elevation SVG of the deck structure.
 * Shows: ground level, posts, bearers, joists, deck surface, fascia board,
 * infill panels, and waling plate with M12 anchors (if wall-mounted).
 */
import type { SubfloorInputs, BoardLayoutInputs } from "../../../../shared/subfloor-calc";
import { DEFAULT_BOARD_LAYOUT } from "../../../../shared/subfloor-calc";

interface Props {
  inputs: SubfloorInputs;
  boardLayout?: BoardLayoutInputs;
  /** Framing system label */
  framingLabel?: string;
}

// ─── Colour tokens ─────────────────────────────────────────────────────────
const INK = "oklch(0.24 0.018 250)";
const GROUND = "oklch(0.72 0.06 90 / 0.4)";
const GROUND_LINE = "oklch(0.50 0.08 90)";
const POST_FILL = "oklch(0.55 0.02 250 / 0.5)";
const POST_STROKE = "oklch(0.35 0.02 250)";
const BEARER_FILL = "oklch(0.60 0.04 55 / 0.5)";
const BEARER_STROKE = "oklch(0.40 0.04 55)";
const JOIST_FILL = "oklch(0.65 0.06 55 / 0.4)";
const JOIST_STROKE = "oklch(0.42 0.06 55)";
const DECK_FILL = "oklch(0.55 0.14 55 / 0.6)";
const DECK_STROKE = "oklch(0.38 0.14 55)";
const FASCIA_FILL = "oklch(0.50 0.10 55 / 0.5)";
const FASCIA_STROKE = "oklch(0.35 0.10 55)";
const INFILL_FILL = "oklch(0.75 0.04 200 / 0.3)";
const INFILL_STROKE = "oklch(0.50 0.04 200 / 0.6)";
const WALL_FILL = "oklch(0.80 0.02 60 / 0.5)";
const WALL_STROKE = "oklch(0.45 0.02 60)";
const WALL_HATCH = "oklch(0.55 0.02 60 / 0.4)";
const WALING_FILL = "oklch(0.58 0.08 55 / 0.6)";
const WALING_STROKE = "oklch(0.35 0.08 55)";
const ANCHOR_FILL = "oklch(0.45 0.02 250 / 0.7)";
const ANCHOR_STROKE = "oklch(0.30 0.02 250)";
const DIM_LINE = "oklch(0.35 0.02 250 / 0.6)";
const CALLOUT = "oklch(0.40 0.02 250 / 0.7)";

export default function DeckSideView({ inputs, boardLayout, framingLabel }: Props) {
  const bl = boardLayout || DEFAULT_BOARD_LAYOUT;
  const fascia = bl.fascia || "none";
  const fasciaHeightMm = bl.fasciaHeightMm || 150;
  const infill = bl.infill || "none";
  const isWallMounted = inputs.wall === "wall-mounted";

  // Dimensions (mm)
  const deckHeight = (inputs.minHeight + inputs.maxHeight) / 2;
  const postHeight = deckHeight;
  const bearerDepth = 90;
  const joistDepth = 45;
  const boardThickness = 22;
  const postWidth = 90;
  const joistWidth = 45;
  const fasciaHeight = fascia !== "none" ? fasciaHeightMm : 0;
  const wallThicknessMm = 190; // min masonry wall thickness
  const walingDepthMm = bearerDepth; // waling plate matches bearer depth
  const walingWidthMm = 45; // waling plate width (cross-section)

  // SVG layout — scale so total height fits ~300 SVG units
  const totalRealHeight = postHeight + bearerDepth + joistDepth + boardThickness + 80;
  const scale = 280 / totalRealHeight;
  const pad = isWallMounted ? 70 : 50; // extra left pad for wall detail
  const deckWidth = inputs.width;
  const svgDeckW = Math.min(deckWidth * scale, 500);
  const actualScale = svgDeckW / deckWidth;
  const s = actualScale;

  const svgW = svgDeckW + pad * 2 + 60;
  const svgH = totalRealHeight * s + pad * 2;

  // Y positions (from top)
  const yDeckTop = pad;
  const yDeckBottom = yDeckTop + boardThickness * s;
  const yJoistTop = yDeckBottom;
  const yJoistBottom = yJoistTop + joistDepth * s;
  const yBearerTop = yJoistBottom;
  const yBearerBottom = yBearerTop + bearerDepth * s;
  const yGround = yBearerBottom + postHeight * s;

  // X positions
  const xLeft = pad;
  const xRight = pad + svgDeckW;
  const xMid = (xLeft + xRight) / 2;

  // Wall dimensions in SVG units
  const wallW = wallThicknessMm * s;
  const walingW = walingWidthMm * s;
  const walingH = walingDepthMm * s;

  // Post positions (evenly spaced)
  const numPosts = Math.max(2, Math.ceil(deckWidth / 1800) + 1);
  const postSpacing = svgDeckW / (numPosts - 1);
  const postPositions: number[] = [];
  for (let i = 0; i < numPosts; i++) {
    postPositions.push(xLeft + i * postSpacing);
  }

  const font = 11;

  // M12 anchor bolt positions (staggered at ~600mm centres along wall height)
  const anchorSpacingMm = 600;
  const walingYTop = yBearerTop; // waling plate sits at bearer level
  const walingYBot = walingYTop + walingH;
  const anchorBolts: { y: number; stagger: number }[] = [];
  if (isWallMounted) {
    const walingRealHeight = walingDepthMm;
    const numAnchors = Math.max(2, Math.floor(walingRealHeight / anchorSpacingMm) + 1);
    const anchorStep = walingH / Math.max(numAnchors - 1, 1);
    for (let i = 0; i < numAnchors; i++) {
      anchorBolts.push({
        y: walingYTop + 4 + i * anchorStep,
        stagger: i % 2 === 0 ? -1 : 1, // alternate left/right for staggered pattern
      });
    }
  }

  return (
    <div className="space-y-1">
      <svg
        data-side-view-svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full h-auto max-h-[260px]"
        preserveAspectRatio="xMidYMid meet"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        <defs>
          <marker
            id="sideArr"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={DIM_LINE} />
          </marker>
          <marker
            id="calloutArr"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={CALLOUT} />
          </marker>
          {/* Hatch pattern for infill */}
          <pattern id="infillHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke={INFILL_STROKE} strokeWidth="1.5" />
          </pattern>
          {/* Hatch pattern for masonry wall */}
          <pattern id="masonryHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={WALL_HATCH} strokeWidth="0.8" />
          </pattern>
        </defs>

        {/* Ground */}
        <rect x={0} y={yGround} width={svgW} height={svgH - yGround} fill={GROUND} />
        <line x1={0} y1={yGround} x2={svgW} y2={yGround} stroke={GROUND_LINE} strokeWidth="2" />

        {/* ═══ Wall-mounted connection detail ═══ */}
        {isWallMounted && (
          <g>
            {/* Masonry wall — full height with hatch fill */}
            <rect
              x={xLeft - walingW - wallW}
              y={yDeckTop - 50}
              width={wallW}
              height={yGround - yDeckTop + 50}
              fill={WALL_FILL}
              stroke={WALL_STROKE}
              strokeWidth="1.5"
            />
            {/* Masonry hatch overlay */}
            <rect
              x={xLeft - walingW - wallW}
              y={yDeckTop - 50}
              width={wallW}
              height={yGround - yDeckTop + 50}
              fill="url(#masonryHatch)"
            />

            {/* Waling plate (ledger board) — bolted to wall face */}
            <rect
              x={xLeft - walingW}
              y={walingYTop}
              width={walingW}
              height={walingH}
              fill={WALING_FILL}
              stroke={WALING_STROKE}
              strokeWidth="1.5"
            />

            {/* M12 anchor bolts (staggered through waling plate into wall) */}
            {anchorBolts.map((bolt, i) => {
              const boltX = xLeft - walingW / 2 + bolt.stagger * walingW * 0.15;
              const boltR = Math.max(2, 3 * s);
              return (
                <g key={`anchor-${i}`}>
                  {/* Bolt shaft line through wall */}
                  <line
                    x1={boltX}
                    y1={bolt.y}
                    x2={xLeft - walingW - wallW * 0.6}
                    y2={bolt.y}
                    stroke={ANCHOR_STROKE}
                    strokeWidth="1"
                    strokeDasharray="2,1"
                  />
                  {/* Bolt head (on waling plate face) */}
                  <rect
                    x={boltX - boltR}
                    y={bolt.y - boltR}
                    width={boltR * 2}
                    height={boltR * 2}
                    fill={ANCHOR_FILL}
                    stroke={ANCHOR_STROKE}
                    strokeWidth="0.8"
                  />
                </g>
              );
            })}

            {/* Joist hanger / connection bracket at waling plate */}
            <rect
              x={xLeft - 2}
              y={yJoistTop}
              width={4}
              height={joistDepth * s}
              fill={ANCHOR_FILL}
              stroke={ANCHOR_STROKE}
              strokeWidth="0.8"
              rx="0.5"
            />

            {/* ── Callout labels ── */}
            {/* WALL label */}
            <text
              x={xLeft - walingW - wallW / 2}
              y={yDeckTop - 56}
              textAnchor="middle"
              fontSize={font * 0.65}
              fill={INK}
              fontWeight="600"
            >
              WALL
            </text>

            {/* WALING PLATE label with callout line */}
            <line
              x1={xLeft - walingW / 2}
              y1={walingYTop - 2}
              x2={xLeft + 30}
              y2={walingYTop - 18}
              stroke={CALLOUT}
              strokeWidth="0.8"
              markerEnd="url(#calloutArr)"
            />
            <text
              x={xLeft + 32}
              y={walingYTop - 20}
              textAnchor="start"
              fontSize={font * 0.55}
              fill={INK}
              fontWeight="600"
            >
              WALING PLATE
            </text>

            {/* M12 ANCHORS label with callout line */}
            {anchorBolts.length > 0 && (
              <>
                <line
                  x1={xLeft - walingW / 2}
                  y1={anchorBolts[0].y}
                  x2={xLeft + 30}
                  y2={anchorBolts[0].y - 8}
                  stroke={CALLOUT}
                  strokeWidth="0.8"
                />
                <text
                  x={xLeft + 32}
                  y={anchorBolts[0].y - 10}
                  textAnchor="start"
                  fontSize={font * 0.45}
                  fill={INK}
                >
                  M12 anchors (staggered)
                </text>
              </>
            )}
          </g>
        )}

        {/* Posts */}
        {postPositions.map((x, i) => {
          // Skip first post if wall-mounted (waling plate replaces it)
          if (isWallMounted && i === 0) return null;
          return (
            <rect
              key={`post-${i}`}
              x={x - (postWidth * s) / 2}
              y={yBearerBottom}
              width={postWidth * s}
              height={yGround - yBearerBottom}
              fill={POST_FILL}
              stroke={POST_STROKE}
              strokeWidth="1.5"
            />
          );
        })}

        {/* Bearers (horizontal beam running left-right) */}
        <rect
          x={isWallMounted ? xLeft : xLeft}
          y={yBearerTop}
          width={svgDeckW}
          height={bearerDepth * s}
          fill={BEARER_FILL}
          stroke={BEARER_STROKE}
          strokeWidth="1.5"
        />

        {/* Joists (shown as cross-section rectangles) */}
        {(() => {
          const joistCount = Math.max(3, Math.ceil(deckWidth / 450));
          const joistSpacing = svgDeckW / (joistCount - 1);
          const rects = [];
          for (let i = 0; i < joistCount; i++) {
            const jx = xLeft + i * joistSpacing;
            rects.push(
              <rect
                key={`joist-${i}`}
                x={jx - (joistWidth * s) / 2}
                y={yJoistTop}
                width={joistWidth * s}
                height={joistDepth * s}
                fill={JOIST_FILL}
                stroke={JOIST_STROKE}
                strokeWidth="1"
              />
            );
          }
          return rects;
        })()}

        {/* Deck surface boards */}
        <rect
          x={xLeft}
          y={yDeckTop}
          width={svgDeckW}
          height={boardThickness * s}
          fill={DECK_FILL}
          stroke={DECK_STROKE}
          strokeWidth="2"
        />

        {/* Fascia board (on front/exposed edge) */}
        {fascia !== "none" && (
          <rect
            x={xRight}
            y={yDeckTop}
            width={boardThickness * s}
            height={fasciaHeight * s}
            fill={FASCIA_FILL}
            stroke={FASCIA_STROKE}
            strokeWidth="1.5"
          />
        )}

        {/* Infill panels (between ground and deck edge) */}
        {infill !== "none" && (
          <g>
            {/* Front infill */}
            <rect
              x={xRight + (fascia !== "none" ? boardThickness * s : 0)}
              y={yDeckTop + (fascia !== "none" ? fasciaHeight * s : boardThickness * s)}
              width={boardThickness * s * 0.8}
              height={yGround - yDeckTop - (fascia !== "none" ? fasciaHeight * s : boardThickness * s)}
              fill={infill === "lattice" ? "url(#infillHatch)" : INFILL_FILL}
              stroke={INFILL_STROKE}
              strokeWidth="1"
            />
            {/* Back infill (if not wall-mounted) */}
            {!isWallMounted && (
              <rect
                x={xLeft - boardThickness * s * 0.8}
                y={yDeckTop + boardThickness * s}
                width={boardThickness * s * 0.8}
                height={yGround - yDeckTop - boardThickness * s}
                fill={infill === "lattice" ? "url(#infillHatch)" : INFILL_FILL}
                stroke={INFILL_STROKE}
                strokeWidth="1"
              />
            )}
          </g>
        )}

        {/* Dimension: deck height */}
        <line
          x1={xRight + 35}
          y1={yDeckTop}
          x2={xRight + 35}
          y2={yGround}
          stroke={DIM_LINE}
          strokeWidth="1"
          markerStart="url(#sideArr)"
          markerEnd="url(#sideArr)"
        />
        <text
          x={xRight + 47}
          y={(yDeckTop + yGround) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={font * 0.75}
          fill={INK}
          transform={`rotate(90, ${xRight + 47}, ${(yDeckTop + yGround) / 2})`}
        >
          {Math.round(deckHeight)}mm
        </text>

        {/* Dimension: projection width */}
        <line
          x1={xLeft}
          y1={yGround + 15}
          x2={xRight}
          y2={yGround + 15}
          stroke={DIM_LINE}
          strokeWidth="1"
          markerStart="url(#sideArr)"
          markerEnd="url(#sideArr)"
        />
        <text
          x={xMid}
          y={yGround + 28}
          textAnchor="middle"
          fontSize={font * 0.75}
          fill={INK}
        >
          {(inputs.width / 1000).toFixed(2)}m projection
        </text>

        {/* Labels */}
        <text x={xMid} y={yDeckTop - 6} textAnchor="middle" fontSize={font * 0.7} fill={INK} fontWeight="600">
          DECK BOARDS
        </text>
        <text x={xMid} y={yJoistTop + joistDepth * s / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={font * 0.6} fill={INK}>
          JOISTS
        </text>
        <text x={xMid} y={yBearerTop + bearerDepth * s / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={font * 0.6} fill={INK}>
          BEARERS
        </text>
        {postPositions.length > 1 && (
          <text
            x={postPositions[postPositions.length - 1]}
            y={yBearerBottom + (yGround - yBearerBottom) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={font * 0.55}
            fill={INK}
            transform={`rotate(-90, ${postPositions[postPositions.length - 1]}, ${yBearerBottom + (yGround - yBearerBottom) / 2})`}
          >
            POSTS
          </text>
        )}
        {fascia !== "none" && (
          <text
            x={xRight + boardThickness * s / 2}
            y={yDeckTop + fasciaHeight * s + 10}
            textAnchor="middle"
            fontSize={font * 0.55}
            fill={INK}
            transform={`rotate(90, ${xRight + boardThickness * s / 2}, ${yDeckTop + fasciaHeight * s + 10})`}
          >
            FASCIA
          </text>
        )}
        {infill !== "none" && (
          <text
            x={xRight + (fascia !== "none" ? boardThickness * s * 1.5 : boardThickness * s * 0.4)}
            y={(yDeckTop + yGround) / 2 + 20}
            textAnchor="middle"
            fontSize={font * 0.5}
            fill={INK}
            transform={`rotate(90, ${xRight + (fascia !== "none" ? boardThickness * s * 1.5 : boardThickness * s * 0.4)}, ${(yDeckTop + yGround) / 2 + 20})`}
          >
            INFILL
          </text>
        )}

        {/* Title */}
        <text x={isWallMounted ? pad - 20 : pad} y={pad - 30} fontSize={font * 0.85} fill={INK} fontWeight="700">
          Side Elevation / Cross-Section
        </text>
        {framingLabel && (
          <text x={isWallMounted ? pad - 20 : pad} y={pad - 16} fontSize={font * 0.65} fill="oklch(0.45 0.02 250)">
            {framingLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
