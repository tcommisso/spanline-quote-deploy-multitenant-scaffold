/**
 * InteractiveDeckSchematic — SVG plan-view with interactive editing.
 *
 * Features:
 * - Drag posts along their bearer line to reposition
 * - Click to add/remove rectangular cutouts on the deck shape
 * - Snap-to-grid visual feedback during drag
 * - Undo/redo stack for all interactive edits
 * - Emits onChange so the parent can recalculate BOM
 *
 * Renders NTW-style subfloor frame: perimeter edge beams on all 4 sides,
 * joists as vertical members, noggins on left/right sides, and a red
 * board overhang outline beyond the structural frame.
 */
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import type {
  SubfloorInputs,
  OptionResult,
  BearerLine,
  PostInfo,
} from "../../../../shared/subfloor-calc";
import { formatMM } from "../../../../shared/subfloor-calc";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PostOverride {
  bearerIndex: number;
  postIndex: number;
  newT: number; // fractional position 0–1
}

interface CutoutDef {
  id: string;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  lengthMM: number;
  widthMM: number;
}

interface EditState {
  postOverrides: PostOverride[];
  customCutouts: CutoutDef[];
}

interface HistoryEntry {
  state: EditState;
  label: string;
}

export interface InteractiveSchematicProps {
  inputs: SubfloorInputs;
  option: OptionResult;
  onPostOverridesChange?: (overrides: PostOverride[]) => void;
  onCutoutsChange?: (cutouts: CutoutDef[]) => void;
  editable?: boolean;
  snapGridMM?: number;
}

// ─── Colour tokens ──────────────────────────────────────────────────────────
const INK = "oklch(0.24 0.018 250)";
const ACCENT = "oklch(0.42 0.13 250)";
const POST_FILL = "oklch(0.45 0.18 25)";       // warm red-brown, solid and visible
const POST_LABEL = "oklch(0.98 0.01 86)";       // near-white for contrast on coloured post
const HATCH_STROKE = "oklch(0.5 0.02 250 / 0.45)";
const DECK_FILL = "oklch(0.92 0.04 250 / 0.30)";
const DRAG_HIGHLIGHT = "oklch(0.65 0.22 145)";
const SNAP_LINE = "oklch(0.65 0.22 145 / 0.4)";
const CUTOUT_HOVER = "oklch(0.70 0.18 30 / 0.35)";
const CUTOUT_ACTIVE = "oklch(0.55 0.22 30 / 0.50)";
const FRAME_FILL = "oklch(0.32 0.015 250)";
const FRAME_STROKE = "oklch(0.20 0.015 250)";
const EDGE_BEAM_FILL = "oklch(0.38 0.015 250)";
const JOIST_FILL = "oklch(0.28 0.02 250)";        // dark charcoal — most prominent
const NOGGIN_FILL = "oklch(0.52 0.015 250)";      // medium grey
const OVERHANG_STROKE = "oklch(0.50 0.18 20)";
const BEARER_FILL = "oklch(0.58 0.04 250)";       // lighter blue-grey — visually recedes

// ─── Dimension helpers ──────────────────────────────────────────────────────

function HorizontalDim({ x1, x2, y, label, font, dashed }: {
  x1: number; x2: number; y: number; label: string; font: number; dashed?: boolean;
}) {
  const tick = font * 0.9;
  return (
    <g>
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} stroke={INK} strokeWidth="1.2" />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} stroke={INK} strokeWidth="1.2" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth="1.2"
        markerStart="url(#arr-i)" markerEnd="url(#arr-i)"
        strokeDasharray={dashed ? "5 4" : undefined} />
      <text x={(x1 + x2) / 2} y={y - font * 0.65} textAnchor="middle" fontSize={font} fill={ACCENT}>
        {label}
      </text>
    </g>
  );
}

function VerticalDim({ y1, y2, x, label, font, dashed }: {
  y1: number; y2: number; x: number; label: string; font: number; dashed?: boolean;
}) {
  const tick = font * 0.9;
  const mid = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x - tick} y1={y1} x2={x + tick} y2={y1} stroke={INK} strokeWidth="1.2" />
      <line x1={x - tick} y1={y2} x2={x + tick} y2={y2} stroke={INK} strokeWidth="1.2" />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={INK} strokeWidth="1.2"
        markerStart="url(#arr-i)" markerEnd="url(#arr-i)"
        strokeDasharray={dashed ? "5 4" : undefined} />
      <text x={x + font * 0.75} y={mid} textAnchor="start" dominantBaseline="middle"
        fontSize={font} fill={ACCENT} transform={`rotate(-90 ${x + font * 0.75} ${mid})`}>
        {label}
      </text>
    </g>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function InteractiveDeckSchematic({
  inputs,
  option,
  onPostOverridesChange,
  onCutoutsChange,
  editable = true,
  snapGridMM = 50,
}: InteractiveSchematicProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // ─── Undo/Redo ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([
    { state: { postOverrides: [], customCutouts: [] }, label: "Initial" },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const currentState = history[historyIndex].state;

  const pushState = useCallback(
    (newState: EditState, label: string) => {
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndex + 1);
        return [...trimmed, { state: newState, label }];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const newIdx = historyIndex - 1;
    setHistoryIndex(newIdx);
    const s = history[newIdx].state;
    onPostOverridesChange?.(s.postOverrides);
    onCutoutsChange?.(s.customCutouts);
  }, [canUndo, historyIndex, history, onPostOverridesChange, onCutoutsChange]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const newIdx = historyIndex + 1;
    setHistoryIndex(newIdx);
    const s = history[newIdx].state;
    onPostOverridesChange?.(s.postOverrides);
    onCutoutsChange?.(s.customCutouts);
  }, [canRedo, historyIndex, history, onPostOverridesChange, onCutoutsChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!editable) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editable, undo, redo]);

  // ─── Drag state ─────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    bearerIndex: number;
    postIndex: number;
    startT: number;
  } | null>(null);
  const [dragT, setDragT] = useState<number | null>(null);

  // ─── Cutout hover state ─────────────────────────────────────────────────
  const [hoveredCorner, setHoveredCorner] = useState<string | null>(null);

  // ─── Layout constants ───────────────────────────────────────────────────
  const SCALE = 100;
  const l = inputs.length;
  const r = inputs.width;
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
  const swapped = boardDir === "perpendicular";

  // Determine if we have edge boards (picture frame) — triggers double frame
  const hasEdgeBoards = boardLayout?.pictureFrame && boardLayout.pictureFrame !== "none";

  // Frame member thickness (visual width of perimeter beams)
  const frameThickness = Math.max(boardWidth * 0.35, 40);
  const edgeBeamThickness = Math.max(frameThickness * 0.85, 34);
  const joistThickness = Math.max(frameThickness * 0.7, 28);
  const nogginThickness = Math.max(frameThickness * 0.55, 22);

  // Board overhang beyond the outer frame
  const overhang = boardWidth;

  // Gap between outer frame and inner edge beam (edge board zone)
  const edgeGap = hasEdgeBoards ? Math.max(boardWidth * 0.9, 80) : 0;

  // Outer frame dimensions
  const frameX = padX;
  const frameY = padY;
  const frameW = l;
  const frameH = r;

  // Inner edge beam rectangle
  const innerX = frameX + frameThickness + edgeGap;
  const innerY = frameY + frameThickness + edgeGap;
  const innerW = frameW - 2 * (frameThickness + edgeGap);
  const innerH = frameH - 2 * (frameThickness + edgeGap);

  // Where joists start and span — orientation-aware
  // Default: joists are vertical → joistDistStart is X, span is Y
  // Swapped: joists are horizontal → joistDistStart is Y, span is X
  const joistDistStart = swapped
    ? (hasEdgeBoards ? innerY + edgeBeamThickness : frameY + frameThickness)
    : (hasEdgeBoards ? innerX + edgeBeamThickness : frameX + frameThickness);
  const joistSpanStart = swapped
    ? (hasEdgeBoards ? innerX + edgeBeamThickness : frameX + frameThickness)
    : (hasEdgeBoards ? innerY + edgeBeamThickness : frameY + frameThickness);
  const joistSpanEnd = swapped
    ? (hasEdgeBoards ? innerX + innerW - edgeBeamThickness : frameX + frameW - frameThickness)
    : (hasEdgeBoards ? innerY + innerH - edgeBeamThickness : frameY + frameH - frameThickness);
  // Legacy aliases for post rendering (still uses bearer yFraction along frameH)
  const joistStartX = hasEdgeBoards ? innerX + edgeBeamThickness : frameX + frameThickness;
  const joistTopY = hasEdgeBoards ? innerY + edgeBeamThickness : frameY + frameThickness;
  const joistBotY = hasEdgeBoards ? innerY + innerH - edgeBeamThickness : frameY + frameH - frameThickness;

  // ─── Apply post overrides ──────────────────────────────────────────────
  const effectiveBearerLines: BearerLine[] = useMemo(() => {
    return option.bearerLines.map((bl, bi) => ({
      ...bl,
      posts: bl.posts.map((post, pi) => {
        const override = currentState.postOverrides.find(
          (o) => o.bearerIndex === bi && o.postIndex === pi
        );
        if (override) {
          const newT = override.newT;
          return { ...post, t: newT, x: Math.round(newT * inputs.length) };
        }
        return post;
      }),
    }));
  }, [option.bearerLines, currentState.postOverrides, inputs.length]);

  // ─── Joist positions (distributed along cross-axis) ─────────────────────
  const joistPositions = useMemo(() => {
    const positions: number[] = [];
    const joistCentres = option.joistCentres;
    const distDim = swapped ? frameH : frameW;
    const innerDist = swapped ? innerH : innerW;
    const spanDist = hasEdgeBoards ? innerDist - edgeBeamThickness * 2 : distDim - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanDist / joistCentres) + 1);
    for (let i = 0; i < count; i++) {
      const x = Math.min(i * joistCentres, spanDist);
      positions.push(x);
    }
    return positions;
  }, [frameW, frameH, innerW, innerH, option.joistCentres, frameThickness, edgeBeamThickness, hasEdgeBoards, swapped]);

  // ─── Noggin positions (edge board mode: all 4 sides) ────────────────────
  // Primary: perpendicular to joist span. Secondary: parallel to joist span.
  const primaryNogginPositions = useMemo(() => {
    if (!hasEdgeBoards) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    const spanLen = (swapped ? frameH : frameW) - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanLen / spacing) + 1);
    for (let i = 0; i < count; i++) {
      positions.push(Math.min(i * spacing, spanLen));
    }
    return positions;
  }, [frameW, frameH, option.joistCentres, frameThickness, hasEdgeBoards, swapped]);

  const secondaryNogginPositions = useMemo(() => {
    if (!hasEdgeBoards) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    const spanLen = (swapped ? frameW : frameH) - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanLen / spacing) + 1);
    for (let i = 0; i < count; i++) {
      positions.push(Math.min(i * spacing, spanLen));
    }
    return positions;
  }, [frameW, frameH, option.joistCentres, frameThickness, hasEdgeBoards, swapped]);

  // ─── Simple noggin positions (non-edge-board mode) ──────────────────────
  const simpleNogginPositions = useMemo(() => {
    if (hasEdgeBoards) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    const spanDim = (swapped ? frameW : frameH) - frameThickness * 2;
    const count = Math.max(2, Math.floor(spanDim / spacing));
    for (let i = 1; i < count; i++) {
      positions.push(frameThickness + i * (spanDim / count));
    }
    return positions;
  }, [frameW, frameH, option.joistCentres, frameThickness, hasEdgeBoards, swapped]);

  // ─── Structural bearers (intermediate) ─────────────────────────────────
  const structuralBearers = useMemo(() => {
    return effectiveBearerLines.filter(bl => bl.type === "structural" && !bl.isWallAttached);
  }, [effectiveBearerLines]);

  // ─── Breaker bearers — rendered as double beam with noggins ─────────────
  const breakerBearers = useMemo(() => {
    return effectiveBearerLines.filter(bl => bl.type === "breaker");
  }, [effectiveBearerLines]);
  const hasBreaker = breakerBearers.length > 0;
  const breakerGap = hasBreaker ? Math.max(boardWidth * 0.9, 80) : 0;

  // Breaker direction: determines which axis the breaker beam runs along
  const breakerDirection = boardLayout?.breakerDirection || "along-width";
  const breakerRunsVertical = breakerDirection === "along-width";

  // Noggin positions along the breaker gap
  const breakerNogginPositions = useMemo(() => {
    if (!hasBreaker) return [];
    const positions: number[] = [];
    const spacing = option.joistCentres;
    // Noggins distribute along the breaker beam length
    const spanLen = (breakerRunsVertical ? frameH : frameW) - frameThickness * 2;
    const count = Math.max(2, Math.ceil(spanLen / spacing) + 1);
    for (let i = 0; i < count; i++) {
      positions.push(Math.min(i * spacing, spanLen));
    }
    return positions;
  }, [hasBreaker, frameW, frameH, option.joistCentres, frameThickness, breakerRunsVertical]);

  // ─── Cutout dimensions ───────────────────────────────────────────────
  const cutL = (inputs.shape === "l-shape" || inputs.shape === "u-shape")
    ? Math.min(inputs.cutLength, l - 1) : 0;
  const cutW = (inputs.shape === "l-shape" || inputs.shape === "u-shape")
    ? Math.min(inputs.cutWidth, r - 1) : 0;
  const cut2L = inputs.shape === "u-shape" ? Math.min(inputs.cut2Length, l - cutL - 1) : 0;
  const cut2W = inputs.shape === "u-shape" ? Math.min(inputs.cut2Width, r - 1) : 0;

  // ─── Overhang path (board boundary) ──────────────────────────────────
  const ox = overhang;
  let overhangPath: string;
  if (inputs.shape === "l-shape") {
    overhangPath = [
      `M ${frameX - ox} ${frameY - ox}`,
      `L ${frameX + l + ox} ${frameY - ox}`,
      `L ${frameX + l + ox} ${frameY + r - cutW + ox}`,
      `L ${frameX + l - cutL + ox} ${frameY + r - cutW + ox}`,
      `L ${frameX + l - cutL + ox} ${frameY + r + ox}`,
      `L ${frameX - ox} ${frameY + r + ox}`,
      "Z",
    ].join(" ");
  } else if (inputs.shape === "u-shape") {
    overhangPath = [
      `M ${frameX - ox} ${frameY - ox}`,
      `L ${frameX + l + ox} ${frameY - ox}`,
      `L ${frameX + l + ox} ${frameY + r - cut2W + ox}`,
      `L ${frameX + l - cut2L + ox} ${frameY + r - cut2W + ox}`,
      `L ${frameX + l - cut2L + ox} ${frameY + r + ox}`,
      `L ${frameX + cutL - ox} ${frameY + r + ox}`,
      `L ${frameX + cutL - ox} ${frameY + r - cutW + ox}`,
      `L ${frameX - ox} ${frameY + r - cutW + ox}`,
      "Z",
    ].join(" ");
  } else {
    overhangPath = `M ${frameX - ox} ${frameY - ox} L ${frameX + l + ox} ${frameY - ox} L ${frameX + l + ox} ${frameY + r + ox} L ${frameX - ox} ${frameY + r + ox} Z`;
  }

  // ─── Frame path ──────────────────────────────────────────────────────
  const framePath = inputs.shape === "rectangle"
    ? `M ${frameX} ${frameY} L ${frameX + l} ${frameY} L ${frameX + l} ${frameY + r} L ${frameX} ${frameY + r} Z`
    : inputs.shape === "l-shape"
    ? [
        `M ${frameX} ${frameY}`, `L ${frameX + l} ${frameY}`,
        `L ${frameX + l} ${frameY + r - cutW}`, `L ${frameX + l - cutL} ${frameY + r - cutW}`,
        `L ${frameX + l - cutL} ${frameY + r}`, `L ${frameX} ${frameY + r}`, "Z",
      ].join(" ")
    : [
        `M ${frameX} ${frameY}`, `L ${frameX + l} ${frameY}`,
        `L ${frameX + l} ${frameY + r - cut2W}`, `L ${frameX + l - cut2L} ${frameY + r - cut2W}`,
        `L ${frameX + l - cut2L} ${frameY + r}`, `L ${frameX + cutL} ${frameY + r}`,
        `L ${frameX + cutL} ${frameY + r - cutW}`, `L ${frameX} ${frameY + r - cutW}`, "Z",
      ].join(" ");

  // ─── Snap grid lines (visible during drag) ───────────────────────────
  const snapGridSVG = useMemo(() => {
    if (!editable) return null;
    const lines: React.ReactNode[] = [];
    const gridStep = snapGridMM;
    for (let x = 0; x <= l; x += gridStep) {
      lines.push(
        <line key={`gx-${x}`} x1={frameX + x} y1={frameY} x2={frameX + x} y2={frameY + r}
          stroke={SNAP_LINE} strokeWidth="0.5" strokeDasharray="2 4" />
      );
    }
    for (let y = 0; y <= r; y += gridStep) {
      lines.push(
        <line key={`gy-${y}`} x1={frameX} y1={frameY + y} x2={frameX + l} y2={frameY + y}
          stroke={SNAP_LINE} strokeWidth="0.5" strokeDasharray="2 4" />
      );
    }
    return lines;
  }, [editable, snapGridMM, l, r, frameX, frameY]);

  // ─── SVG coordinate helpers ───────────────────────────────────────────
  const svgPoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { x: svgPt.x, y: svgPt.y };
    },
    []
  );

  const snapToGrid = useCallback(
    (tRaw: number): number => {
      const mm = tRaw * l;
      const snapped = Math.round(mm / snapGridMM) * snapGridMM;
      return Math.max(0, Math.min(1, snapped / l));
    },
    [l, snapGridMM]
  );

  // ─── Drag handlers ───────────────────────────────────────────────────
  const handlePostMouseDown = useCallback(
    (bearerIndex: number, postIndex: number, post: PostInfo, e: React.MouseEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging({ bearerIndex, postIndex, startT: post.t });
      setDragT(post.t);
    },
    [editable]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const pt = svgPoint(e.clientX, e.clientY);
      if (!pt) return;
      const rawT = (pt.x - frameX) / l;
      const snappedT = snapToGrid(rawT);
      setDragT(snappedT);
    },
    [dragging, svgPoint, frameX, l, snapToGrid]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragging || dragT === null) {
      setDragging(null);
      setDragT(null);
      return;
    }
    if (Math.abs(dragT - dragging.startT) > 0.001) {
      const newOverrides = [...currentState.postOverrides];
      const existingIdx = newOverrides.findIndex(
        (o) => o.bearerIndex === dragging.bearerIndex && o.postIndex === dragging.postIndex
      );
      const override: PostOverride = {
        bearerIndex: dragging.bearerIndex,
        postIndex: dragging.postIndex,
        newT: dragT,
      };
      if (existingIdx >= 0) {
        newOverrides[existingIdx] = override;
      } else {
        newOverrides.push(override);
      }
      const newState: EditState = { ...currentState, postOverrides: newOverrides };
      pushState(newState, `Move post B${dragging.bearerIndex + 1}-P${dragging.postIndex + 1}`);
      onPostOverridesChange?.(newOverrides);
    }
    setDragging(null);
    setDragT(null);
  }, [dragging, dragT, currentState, pushState, onPostOverridesChange]);

  // ─── Cutout corner zones (for rectangle shape only) ───────────────────
  const cutoutCorners = useMemo(() => {
    if (inputs.shape !== "rectangle" || !editable) return [];
    const size = Math.min(l, r) * 0.25;
    return [
      { id: "bottom-right", corner: "bottom-right" as const, x: frameX + l - size, y: frameY + r - size, w: size, h: size },
      { id: "bottom-left", corner: "bottom-left" as const, x: frameX, y: frameY + r - size, w: size, h: size },
      { id: "top-right", corner: "top-right" as const, x: frameX + l - size, y: frameY, w: size, h: size },
      { id: "top-left", corner: "top-left" as const, x: frameX, y: frameY, w: size, h: size },
    ];
  }, [inputs.shape, editable, l, r, frameX, frameY]);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Toolbar */}
      {editable && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-background/90 backdrop-blur-sm border rounded-md px-2 py-1 shadow-sm">
          <button
            className="text-xs px-2 py-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <span className="text-[10px] text-muted-foreground">
            {historyIndex}/{history.length - 1}
          </span>
          <button
            className="text-xs px-2 py-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo ↪
          </button>
        </div>
      )}

      {/* Mode indicator */}
      {editable && (
        <div className="absolute top-2 left-2 z-10 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-[10px] font-semibold px-2 py-1 rounded-md border border-green-300 dark:border-green-700">
          ✎ EDIT MODE — Drag posts to reposition
        </div>
      )}

      <svg
        data-deck-schematic
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className={`w-full h-full ${editable ? "cursor-crosshair" : ""}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Defs */}
        <defs>
          <marker id="arr-i" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
          </marker>
          <pattern id="hatch-i" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke={HATCH_STROKE} strokeWidth="1" />
          </pattern>
          <clipPath id="deckClip-i">
            <path d={framePath} />
          </clipPath>
          <filter id="postGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Snap grid (only visible during drag) */}
        {editable && dragging && (
          <g opacity="0.6">{snapGridSVG}</g>
        )}

        {/* Wall plate */}
        {inputs.wall === "wall-mounted" && (
          <g>
            <rect x={frameX - 24} y={frameY - 40} width={l + 48} height={24}
              fill="url(#hatch-i)" stroke={INK} strokeWidth="1.5" />
            <text x={frameX + l / 2} y={frameY - 52} textAnchor="middle" fontSize={font} fill={INK} fontWeight="600">
              HOUSE WALL
            </text>
            <rect x={frameX} y={frameY - 16} width={l} height={16}
              fill="url(#hatch-i)" stroke={INK} strokeWidth="1.8" />
            <text x={frameX + l + font * 0.6} y={frameY - 8} dominantBaseline="middle"
              fontSize={font * 0.7} fill={INK} opacity="0.7">
              wall plate
            </text>
          </g>
        )}

        {/* Board overhang outline (red) */}
        <path d={overhangPath} fill="none" stroke={OVERHANG_STROKE} strokeWidth="1.8" />

        {/* Deck fill (inside frame) */}
        <path d={framePath} fill={DECK_FILL} stroke="none" />

        {/* Cutout corner hover zones (rectangle shape only) */}
        {cutoutCorners.map((zone) => (
          <rect
            key={zone.id}
            x={zone.x}
            y={zone.y}
            width={zone.w}
            height={zone.h}
            fill={hoveredCorner === zone.id ? CUTOUT_HOVER : "transparent"}
            stroke={hoveredCorner === zone.id ? CUTOUT_ACTIVE : "transparent"}
            strokeWidth="2"
            strokeDasharray="6 3"
            rx="4"
            className="cursor-pointer"
            onMouseEnter={() => setHoveredCorner(zone.id)}
            onMouseLeave={() => setHoveredCorner(null)}
            onClick={() => {}}
          />
        ))}
        {hoveredCorner && cutoutCorners.find((z) => z.id === hoveredCorner) && (
          <text
            x={cutoutCorners.find((z) => z.id === hoveredCorner)!.x + cutoutCorners.find((z) => z.id === hoveredCorner)!.w / 2}
            y={cutoutCorners.find((z) => z.id === hoveredCorner)!.y + cutoutCorners.find((z) => z.id === hoveredCorner)!.h / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={font * 0.65}
            fill={INK}
            opacity="0.7"
            pointerEvents="none"
          >
            Click to add cutout
          </text>
        )}

        {/* ─── Structural frame and members (clipped to frame shape) ─── */}
        <g clipPath="url(#deckClip-i)">
          {/* Joists — orientation-aware */}
          {joistPositions.map((jp, i) => (
            <rect
              key={`joist-${i}`}
              x={swapped ? joistSpanStart : joistDistStart + jp - joistThickness / 2}
              y={swapped ? joistDistStart + jp - joistThickness / 2 : joistSpanStart}
              width={swapped ? (joistSpanEnd - joistSpanStart) : joistThickness}
              height={swapped ? joistThickness : (joistSpanEnd - joistSpanStart)}
                            fill={JOIST_FILL}
              stroke={FRAME_STROKE}
              strokeWidth="1.2"
            />
          ))}
          {/* ─── Edge board mode: Noggins on ALL 4 sides ─── */}
          {hasEdgeBoards && (<>
            {/* Top noggins */}
            {/* Top/bottom edge noggins (perpendicular to joist span) */}
            {primaryNogginPositions.map((n: number, i: number) => (
              <rect
                key={`noggin-primary-start-${i}`}
                x={swapped ? frameX + frameThickness : frameX + frameThickness + n - nogginThickness / 2}
                y={swapped ? frameY + frameThickness + n - nogginThickness / 2 : frameY + frameThickness}
                width={swapped ? edgeGap : nogginThickness}
                height={swapped ? nogginThickness : edgeGap}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            ))}
            {primaryNogginPositions.map((n: number, i: number) => (
              <rect
                key={`noggin-primary-end-${i}`}
                x={swapped ? (innerX + innerW) : frameX + frameThickness + n - nogginThickness / 2}
                y={swapped ? frameY + frameThickness + n - nogginThickness / 2 : (innerY + innerH)}
                width={swapped ? edgeGap : nogginThickness}
                height={swapped ? nogginThickness : edgeGap}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            ))}
            {/* Left/right edge noggins (parallel to joist span) */}
            {secondaryNogginPositions.map((n: number, i: number) => (
              <rect
                key={`noggin-secondary-start-${i}`}
                x={swapped ? frameX + frameThickness + n - nogginThickness / 2 : frameX + frameThickness}
                y={swapped ? frameY + frameThickness : frameY + frameThickness + n - nogginThickness / 2}
                width={swapped ? nogginThickness : edgeGap}
                height={swapped ? edgeGap : nogginThickness}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            ))}
            {secondaryNogginPositions.map((n: number, i: number) => (
              <rect
                key={`noggin-secondary-end-${i}`}
                x={swapped ? frameX + frameThickness + n - nogginThickness / 2 : (innerX + innerW)}
                y={swapped ? (innerY + innerH) : frameY + frameThickness + n - nogginThickness / 2}
                width={swapped ? nogginThickness : edgeGap}
                height={swapped ? edgeGap : nogginThickness}
                fill={NOGGIN_FILL}
                stroke={FRAME_STROKE}
                strokeWidth="0.6"
              />
            ))}
          </>)}

          {/* ─── Non-edge-board mode: Simple noggins (perpendicular to joists) ─── */}
          {!hasEdgeBoards && joistPositions.length > 0 && simpleNogginPositions.map((nPos: number, i: number) => {
            const firstJ = joistDistStart + joistPositions[0];
            const lastJ = joistDistStart + joistPositions[joistPositions.length - 1];
            if (swapped) {
              // Joists horizontal → noggins are vertical between first/last joist
              return (
                <g key={`simple-noggin-${i}`}>
                  <rect
                    x={frameX + nPos - nogginThickness / 2}
                    y={frameY + frameThickness}
                    width={nogginThickness}
                    height={firstJ - frameY - frameThickness - joistThickness / 2}
                    fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.6"
                  />
                  <rect
                    x={frameX + nPos - nogginThickness / 2}
                    y={lastJ + joistThickness / 2}
                    width={nogginThickness}
                    height={frameY + frameH - frameThickness - lastJ - joistThickness / 2}
                    fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.6"
                  />
                </g>
              );
            }
            // Default: joists vertical → noggins are horizontal between first/last joist
            return (
              <g key={`simple-noggin-${i}`}>
                <rect
                  x={frameX + frameThickness}
                  y={frameY + nPos - nogginThickness / 2}
                  width={firstJ - frameX - frameThickness - joistThickness / 2}
                  height={nogginThickness}
                  fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.6"
                />
                <rect
                  x={lastJ + joistThickness / 2}
                  y={frameY + nPos - nogginThickness / 2}
                  width={frameX + frameW - frameThickness - lastJ - joistThickness / 2}
                  height={nogginThickness}
                  fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.6"
                />
              </g>
            );
          })}

          {/* Structural bearers — orientation-aware */}
          {structuralBearers.map((bl, i) => {
            if (bl.yFraction <= 0.05 || bl.yFraction >= 0.95) return null;
            if (swapped) {
              // Bearers run vertically when swapped
              const cx = frameX + bl.yFraction * frameW;
              return (
                <rect key={`bearer-${i}`}
                  x={cx - frameThickness / 2}
                  y={frameY + frameThickness}
                  width={frameThickness}
                  height={frameH - frameThickness * 2}
                  fill={BEARER_FILL} stroke={BEARER_FILL} strokeWidth="0.6" opacity={0.75} />
              );
            }
            const cy = frameY + bl.yFraction * frameH;
            return (
              <rect key={`bearer-${i}`}
                x={frameX + frameThickness}
                y={cy - frameThickness / 2}
                width={frameW - frameThickness * 2}
                height={frameThickness}
                fill={BEARER_FILL} stroke={BEARER_FILL} strokeWidth="0.6" opacity={0.75} />
            );
          })}

          {/* ─── Breaker beams — orientation-aware double beam with noggins ─── */}
          {hasBreaker && (() => {
            const avgFrac = breakerBearers.reduce((s, b) => s + b.yFraction, 0) / breakerBearers.length;
            if (breakerRunsVertical) {
              // Breaker direction "along-width": beams run VERTICALLY (top-to-bottom)
              const breakerPos = inputs.boardLayout?.breakerPosition || 0;
              const centreX = breakerPos > 0
                ? frameX + (breakerPos / inputs.length) * frameW
                : frameX + avgFrac * frameW;
              const leftBeamX = centreX - breakerGap / 2 - edgeBeamThickness;
              const rightBeamX = centreX + breakerGap / 2;
              const beamY = frameY + frameThickness;
              const beamH = frameH - frameThickness * 2;
              return (
                <g>
                  <rect x={leftBeamX} y={beamY} width={edgeBeamThickness} height={beamH}
                    fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
                  <rect x={rightBeamX} y={beamY} width={edgeBeamThickness} height={beamH}
                    fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
                  {breakerNogginPositions.map((n: number, i: number) => (
                    <rect key={`brk-nog-${i}`}
                      x={leftBeamX + edgeBeamThickness}
                      y={frameY + frameThickness + n - nogginThickness / 2}
                      width={breakerGap}
                      height={nogginThickness}
                      fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.6" />
                  ))}
                </g>
              );
            }
            // Breaker direction "along-length": beams run HORIZONTALLY (left-to-right)
            const centreY = frameY + avgFrac * frameH;
            const topBeamY = centreY - breakerGap / 2 - edgeBeamThickness;
            const botBeamY = centreY + breakerGap / 2;
            const beamX = frameX + frameThickness;
            const beamW = frameW - frameThickness * 2;
            return (
              <g>
                <rect x={beamX} y={topBeamY} width={beamW} height={edgeBeamThickness}
                  fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
                <rect x={beamX} y={botBeamY} width={beamW} height={edgeBeamThickness}
                  fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
                {breakerNogginPositions.map((nx: number, i: number) => (
                  <rect key={`brk-nog-${i}`}
                    x={frameX + frameThickness + nx - nogginThickness / 2}
                    y={topBeamY + edgeBeamThickness}
                    width={nogginThickness}
                    height={breakerGap}
                    fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.6" />
                ))}
              </g>
            );
          })()}
        </g>

        {/* ─── Inner edge beams (second perimeter frame) ─── */}
        {hasEdgeBoards && (
          <g>
            <rect x={innerX} y={innerY} width={innerW} height={edgeBeamThickness}
              fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
            <rect x={innerX} y={innerY + innerH - edgeBeamThickness} width={innerW} height={edgeBeamThickness}
              fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
            <rect x={innerX} y={innerY} width={edgeBeamThickness} height={innerH}
              fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
            <rect x={innerX + innerW - edgeBeamThickness} y={innerY} width={edgeBeamThickness} height={innerH}
              fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="1" />
          </g>
        )}

        {/* ─── Outer perimeter frame — 4 thick members ─── */}
        <rect x={frameX} y={frameY} width={frameW} height={frameThickness}
          fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="1.2" />
        <rect x={frameX} y={frameY + frameH - frameThickness} width={frameW} height={frameThickness}
          fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="1.2" />
        <rect x={frameX} y={frameY} width={frameThickness} height={frameH}
          fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="1.2" />
        <rect x={frameX + frameW - frameThickness} y={frameY} width={frameThickness} height={frameH}
          fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="1.2" />

        {/* Frame outline */}
        <path d={framePath} fill="none" stroke={FRAME_STROKE} strokeWidth="1.5" />

        {/* L-shape void */}
        {inputs.shape === "l-shape" && cutL > 0 && cutW > 0 && (
          <g>
            <HorizontalDim x1={frameX + l - cutL} x2={frameX + l} y={frameY + r - cutW - 44}
              label={`${formatMM(cutL)} mm`} font={font * 0.78} dashed />
            <VerticalDim y1={frameY + r - cutW} y2={frameY + r} x={frameX + l + 62}
              label={`${formatMM(cutW)} mm`} font={font * 0.78} dashed />
            <rect x={frameX + l - cutL} y={frameY + r - cutW} width={cutL} height={cutW}
              fill="url(#hatch-i)" opacity="0.4" stroke={HATCH_STROKE} strokeWidth="1" strokeDasharray="4 3" />
            <text x={frameX + l - cutL / 2} y={frameY + r - cutW / 2} textAnchor="middle"
              dominantBaseline="middle" fontSize={font * 0.72} fill={INK} opacity="0.5">
              VOID
            </text>
          </g>
        )}

        {/* U-shape voids */}
        {inputs.shape === "u-shape" && (
          <g>
            {cutL > 0 && cutW > 0 && (
              <g>
                <rect x={frameX} y={frameY + r - cutW} width={cutL} height={cutW}
                  fill="url(#hatch-i)" opacity="0.4" stroke={HATCH_STROKE} strokeWidth="1" strokeDasharray="4 3" />
                <text x={frameX + cutL / 2} y={frameY + r - cutW / 2} textAnchor="middle"
                  dominantBaseline="middle" fontSize={font * 0.72} fill={INK} opacity="0.5">
                  VOID
                </text>
                <HorizontalDim x1={frameX} x2={frameX + cutL} y={frameY + r - cutW - 44}
                  label={`${formatMM(cutL)} mm`} font={font * 0.78} dashed />
                <VerticalDim y1={frameY + r - cutW} y2={frameY + r} x={frameX - 62}
                  label={`${formatMM(cutW)} mm`} font={font * 0.78} dashed />
              </g>
            )}
            {cut2L > 0 && cut2W > 0 && (
              <g>
                <rect x={frameX + l - cut2L} y={frameY + r - cut2W} width={cut2L} height={cut2W}
                  fill="url(#hatch-i)" opacity="0.4" stroke={HATCH_STROKE} strokeWidth="1" strokeDasharray="4 3" />
                <text x={frameX + l - cut2L / 2} y={frameY + r - cut2W / 2} textAnchor="middle"
                  dominantBaseline="middle" fontSize={font * 0.72} fill={INK} opacity="0.5">
                  VOID
                </text>
                <HorizontalDim x1={frameX + l - cut2L} x2={frameX + l} y={frameY + r - cut2W - 44}
                  label={`${formatMM(cut2L)} mm`} font={font * 0.78} dashed />
                <VerticalDim y1={frameY + r - cut2W} y2={frameY + r} x={frameX + l + 62}
                  label={`${formatMM(cut2W)} mm`} font={font * 0.78} dashed />
              </g>
            )}
          </g>
        )}

        {/* Posts — draggable when editable */}
        {effectiveBearerLines.map((bl, bi) => {
          const cy = frameY + bl.yFraction * frameH;
          return (
            <g key={`posts-${bi}`}>
              {bl.posts.map((post, pi) => {
                const isDragging = dragging?.bearerIndex === bi && dragging?.postIndex === pi;
                const displayT = isDragging && dragT !== null ? dragT : post.t;
                const px = frameX + displayT * l;
                const isOverridden = currentState.postOverrides.some(
                  (o) => o.bearerIndex === bi && o.postIndex === pi
                );

                return (
                  <g
                    key={`post-${bi}-${pi}`}
                    onMouseDown={(e) => handlePostMouseDown(bi, pi, post, e)}
                    className={editable ? "cursor-grab active:cursor-grabbing" : ""}
                    filter={isDragging ? "url(#postGlow)" : undefined}
                  >
                    {/* Snap line during drag */}
                    {isDragging && (
                      <line
                        x1={px}
                        y1={frameY - 20}
                        x2={px}
                        y2={frameY + r + 20}
                        stroke={DRAG_HIGHLIGHT}
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        opacity="0.6"
                      />
                    )}
                    {/* Post square */}
                    <rect
                      x={px - postSize / 2}
                      y={cy - postSize / 2}
                      width={postSize}
                      height={postSize}
                      fill={isDragging ? DRAG_HIGHLIGHT : isOverridden ? "oklch(0.35 0.12 145)" : POST_FILL}
                      stroke={isDragging ? DRAG_HIGHLIGHT : isOverridden ? "oklch(0.45 0.15 145)" : INK}
                      strokeWidth={isDragging ? "2.5" : "1.5"}
                      rx={isDragging ? "4" : "2"}
                    />
                    {/* Post label */}
                    <text
                      x={px}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={postFontSize}
                      fill={POST_LABEL}
                      fontWeight="700"
                      fontFamily="'Inter Tight', ui-sans-serif, sans-serif"
                      pointerEvents="none"
                    >
                      P
                    </text>
                    {/* Position tooltip during drag */}
                    {isDragging && (
                      <g>
                        <rect
                          x={px - 50}
                          y={cy - postSize / 2 - 28}
                          width={100}
                          height={20}
                          rx="4"
                          fill="oklch(0.15 0.01 250 / 0.85)"
                        />
                        <text
                          x={px}
                          y={cy - postSize / 2 - 16}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={font * 0.55}
                          fill="white"
                          pointerEvents="none"
                        >
                          {formatMM(Math.round(displayT * l))} mm
                        </text>
                      </g>
                    )}
                    {/* Override indicator */}
                    {isOverridden && !isDragging && (
                      <circle
                        cx={px + postSize / 2 - 4}
                        cy={cy - postSize / 2 + 4}
                        r={5}
                        fill="oklch(0.65 0.22 145)"
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    )}
                  </g>
                );
              })}
              {bl.isWallAttached && (
                <text x={frameX + l + font * 0.8} y={cy} dominantBaseline="middle"
                  fontSize={font * 0.78} fill={INK} opacity="0.6">
                  wall plate
                </text>
              )}
            </g>
          );
        })}

        {/* Dimension annotations */}
        <HorizontalDim x1={frameX} x2={frameX + l} y={frameY - (inputs.wall === "wall-mounted" ? 82 : 58)}
          label={`L = ${formatMM(inputs.length)} mm`} font={font} />
        <VerticalDim y1={frameY} y2={frameY + r}
          x={frameX + l + (inputs.shape === "l-shape" ? 140 : 62)}
          label={`W = ${formatMM(inputs.width)} mm`} font={font} />

        {/* Overhang dimension */}
        {overhang > 0 && (
          <HorizontalDim
            x1={frameX - overhang}
            x2={frameX}
            y={frameY + r + 44}
            label={`${formatMM(overhang)} oh`}
            font={font * 0.72}
            dashed
          />
        )}

        {/* Joist centres dimension */}
        {joistPositions.length >= 2 && (
          swapped
            ? <VerticalDim y1={joistDistStart + joistPositions[0]} y2={joistDistStart + joistPositions[1]}
                x={frameX - 62} label={`${option.joistCentres} c/c`} font={font * 0.82} dashed />
            : <HorizontalDim x1={joistDistStart + joistPositions[0]} x2={joistDistStart + joistPositions[1]}
                y={frameY + r + 44 + font * 2} label={`${option.joistCentres} c/c`} font={font * 0.82} dashed />
        )}

        {/* Post centres dimension */}
        {(() => {
          const bl = effectiveBearerLines.find((b) => !b.isWallAttached && b.posts.length >= 2);
          if (!bl) return null;
          const px1 = frameX + bl.posts[0].t * l;
          const px2 = frameX + bl.posts[1].t * l;
          const dy = frameY + r + 44 + font * 4;
          return (
            <HorizontalDim x1={px1} x2={px2} y={dy}
              label={`${formatMM(Math.round((bl.posts[1].t - bl.posts[0].t) * inputs.length))} post c/c`}
              font={font * 0.82} dashed />
          );
        })()}

        {/* Joist span dimension */}
        {structuralBearers.length >= 1 && (
          swapped
            ? <HorizontalDim
                x1={frameX + frameThickness}
                x2={frameX + structuralBearers[0].yFraction * frameW}
                y={frameY + r + 44 + font * 4}
                label={`${formatMM(option.joistLength)} span`}
                font={font * 0.82} dashed />
            : <VerticalDim
                y1={frameY + frameThickness}
                y2={frameY + structuralBearers[0].yFraction * frameH}
                x={frameX - 62}
                label={`${formatMM(option.joistLength)} span`}
                font={font * 0.82} dashed />
        )}

        {/* Legend */}
        <g transform={`translate(${frameX}, ${frameY + r + font * 5.5})`}>
          {/* Row 1 */}
          <rect x={0} y={-5} width={24} height={10} fill={FRAME_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
          <text x={30} y={4} fontSize={font * 0.65} fill={INK}>Perimeter Frame</text>

          <rect x={180} y={-5} width={24} height={10} fill={JOIST_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
          <text x={210} y={4} fontSize={font * 0.65} fill={INK}>Joist</text>

          <rect x={290} y={-5} width={24} height={10} fill={NOGGIN_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
          <text x={320} y={4} fontSize={font * 0.65} fill={INK}>Noggin</text>

          {/* Row 2 */}
                    <rect x={0} y={font * 1.4 - 5} width={24} height={10} fill={BEARER_FILL} stroke={BEARER_FILL} strokeWidth="0.6" opacity={0.75} />
          <text x={30} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Bearer</text>
          <rect x={180} y={font * 1.4 - 6} width={12} height={12} fill={POST_FILL} stroke={INK} strokeWidth="0.8" />
          <text x={198} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Post</text>

          <line x1={290} y1={font * 1.4} x2={314} y2={font * 1.4} stroke={OVERHANG_STROKE} strokeWidth="1.8" />
          <text x={320} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Board Overhang</text>

          {hasBreaker && (<>
            <rect x={460} y={font * 1.4 - 5} width={24} height={10} fill={EDGE_BEAM_FILL} stroke={FRAME_STROKE} strokeWidth="0.8" />
            <text x={490} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Breaker Beam</text>
          </>)}

          {editable && (
            <>
              <rect x={480} y={font * 1.4 - 6} width={12} height={12} fill="oklch(0.35 0.12 145)" stroke="oklch(0.45 0.15 145)" strokeWidth="1" />
              <text x={498} y={font * 1.4 + 4} fontSize={font * 0.65} fill={INK}>Moved</text>
            </>
          )}

          <text x={l} y={font * 1.4 + 4} textAnchor="end" fontSize={font * 0.6} fill={INK} opacity="0.6" fontStyle="italic">
            {editable ? "Interactive — drag posts to reposition" : "Drawn — not to scale"}
          </text>
        </g>
      </svg>
    </div>
  );
}
