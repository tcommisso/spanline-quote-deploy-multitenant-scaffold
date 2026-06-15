/**
 * EclipseUnitPlanView — Canvas-rendered per-unit plan view showing:
 * - Rectangular outer frame (beams) — always bladeWidth × length
 * - Raked free-end beam as a diagonal line INSIDE the rectangle
 * - Blade layout running full width from left to right beam
 * - Gutter positions (all 4 sides)
 * - Motor position indicator
 * - Post positions (based on mount type)
 * - Wall indicator (for fascia mount)
 * - Dimension labels with arrows
 * - Colour swatches legend
 * - Blade span direction arrow
 * - Raking width/length dimensions (togglable)
 *
 * Geometry model:
 *   Corners: A=top-left, B=top-right, C=bottom-right, D=bottom-left
 *   The frame is ALWAYS a rectangle.
 *   The "raked edge" dropdown selects which edge has the angled free-end beam.
 *   For raked edge "A-B" (top): the diagonal runs from a kink point on the
 *     A-D (left) edge to corner B. The "short side" = B-C height.
 *     The "raking width" = D-C width (bottom edge, measured from D).
 *   Blades always span the full width/length of the rectangle.
 */
import { useRef, useEffect, useState } from "react";

// Colourbond colour hex mapping
const COLOURBOND_HEX: Record<string, string> = {
  "Basalt": "#646560",
  "Bluegum": "#6B7E6E",
  "Classic Cream": "#E8D8A0",
  "Cottage Green": "#2D4F3E",
  "Deep Ocean": "#1B3A4B",
  "Dover White": "#EFECD5",
  "Dune": "#B5A68C",
  "Evening Haze": "#C4B9A8",
  "Gully": "#5C6B5E",
  "Ironstone": "#3E3632",
  "Jasper": "#5B3C35",
  "Mangrove": "#4A5A4B",
  "Manor Red": "#6B2D2A",
  "Monument": "#3B4044",
  "Night Sky": "#1E2328",
  "Pale Eucalypt": "#6B8C72",
  "Paperbark": "#D5C9A1",
  "Shale Grey": "#A8A49C",
  "Surfmist": "#E8E4D8",
  "Wallaby": "#7A7268",
  "Windspray": "#8B9090",
  "Woodland Grey": "#4C524A",
};

interface EclipseUnitPlanViewProps {
  bladeWidth: number;   // mm
  length: number;       // mm (long side / motor side)
  posts: number;
  mountType: "Freestanding" | "Fascia";
  bladeColour: "White" | "Powder Coated";
  structureColour: "White" | "Powder Coated";
  colourbondBladeColour: string;
  colourbondStructureColour: string;
  unitLabel?: string;
  fallDirection?: string;
  houseWalls?: string;
  bladeDirection?: string; // "along-width" or "along-length"
  motorPosition?: string; // "A-B", "B-C", "C-D", or "D-A" — edge where motor is located
  isRaked?: boolean;
  rakedShortLength?: number; // mm - short side length
  rakedWidth?: number; // mm - horizontal distance the rake spans (D-C bottom edge)
  rakedEdge?: string; // "A-B", "B-C", "C-D", or "D-A" — which edge is the tapered free-end
  showRakeDimensions?: boolean; // external control for showing/hiding red raked dimension lines
  onToggleRakeDimensions?: () => void; // callback when toggle is clicked
}

export default function EclipseUnitPlanView({
  bladeWidth,
  length,
  posts,
  mountType,
  bladeColour,
  structureColour,
  colourbondBladeColour,
  colourbondStructureColour,
  unitLabel,
  fallDirection,
  houseWalls,
  bladeDirection = "along-width",
  motorPosition = "A-B",
  isRaked = false,
  rakedShortLength = 0,
  rakedWidth = 0,
  rakedEdge = "C-D",
  showRakeDimensions: showRakeDimensionsProp,
  onToggleRakeDimensions,
}: EclipseUnitPlanViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalShowDims, setInternalShowDims] = useState(true);
  const showRakeDims = showRakeDimensionsProp !== undefined ? showRakeDimensionsProp : internalShowDims;
  const hasRake = isRaked && rakedShortLength >= 0 && rakedShortLength < length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bladeWidth <= 0 || length <= 0) return;

    const ctx = canvas.getContext("2d")!;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Clear
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Drawing area with margins
    const margin = { top: 60, right: 80, bottom: 80, left: 80 };
    const drawW = canvasWidth - margin.left - margin.right;
    const drawH = canvasHeight - margin.top - margin.bottom;

    // Scale to fit — the frame is always bladeWidth × length (rectangle)
    const scaleX = drawW / bladeWidth;
    const scaleY = drawH / length;
    const scale = Math.min(scaleX, scaleY) * 0.85;

    const roofW = bladeWidth * scale;
    const roofH = length * scale;

    // Center the rectangle
    const offsetX = margin.left + (drawW - roofW) / 2;
    const offsetY = margin.top + (drawH - roofH) / 2;

    // Rectangle corners (ALWAYS a rectangle)
    const cA = { x: offsetX, y: offsetY };                    // top-left
    const cB = { x: offsetX + roofW, y: offsetY };            // top-right
    const cC = { x: offsetX + roofW, y: offsetY + roofH };    // bottom-right
    const cD = { x: offsetX, y: offsetY + roofH };            // bottom-left

    // Raked diagonal beam geometry
    // The "raked edge" is the SHORTER edge (raking width < bladeWidth).
    // The diagonal connects the raking width endpoint on that edge to the far corner
    // on the opposite edge.
    // Corners: A=top-left, B=top-right, C=bottom-right, D=bottom-left
    //
    // For C-D (bottom raked): raking width measured from D along bottom.
    //   Diagonal: (D.x + rakingWidth, D.y) → B (top-right)
    //   Short side = B-C (right edge)
    //
    // For A-B (top raked): raking width measured from A along top.
    //   Diagonal: (A.x + rakingWidth, A.y) → C (bottom-right)
    //   Short side = B-C (right edge)
    //
    // For D-A (left raked): raking width measured from D upward along left.
    //   Diagonal: (D.x, D.y - rakingWidth) → B (top-right)
    //   Short side = A-B (top edge)
    //
    // For B-C (right raked): raking width measured from B downward along right.
    //   Diagonal: (B.x, B.y + rakingWidth) → D (bottom-left)
    //   Short side = C-D (bottom edge)
    const edge = (rakedEdge || "C-D").toUpperCase();
    const shortPx = rakedShortLength * scale;
    const effectiveRakingWidthMM = rakedWidth > 0 ? Math.min(rakedWidth, bladeWidth) : bladeWidth;

    // Compute diagonal start and end points
    let diagStart = { x: 0, y: 0 };
    let diagEnd = { x: 0, y: 0 };

    if (hasRake) {
      const rakingWidthPx = effectiveRakingWidthMM * scale;

      if (edge === "C-D") {
        // Bottom edge is raked (shorter). Raking width measured from D along bottom.
        // Diagonal: from raking width point on bottom edge → corner B (top-right)
        // Short side = B-C on right edge (shortPx from B downward)
        diagStart = { x: offsetX + rakingWidthPx, y: offsetY + roofH };
        diagEnd = { x: cB.x, y: cB.y + shortPx };
      } else if (edge === "A-B") {
        // Top edge is raked (shorter). Raking width measured from A along top.
        // Diagonal: from raking width point on top edge → corner C (bottom-right)
        // Short side = B-C on right edge (shortPx from C upward)
        diagStart = { x: offsetX + rakingWidthPx, y: offsetY };
        diagEnd = { x: cC.x, y: cC.y - shortPx };
      } else if (edge === "D-A") {
        // Left edge is raked (shorter). Raking width measured from D upward along left.
        // Diagonal: from raking width point on left edge → corner B (top-right)
        // Short side = A-B on top edge (shortPx from A rightward)
        diagStart = { x: offsetX, y: offsetY + roofH - rakingWidthPx };
        diagEnd = { x: cB.x - shortPx, y: cB.y };
      } else if (edge === "B-C") {
        // Right edge is raked (shorter). Raking width measured from B downward along right.
        // Diagonal: from raking width point on right edge → corner D (bottom-left)
        // Short side = C-D on bottom edge (shortPx from D rightward)
        diagStart = { x: offsetX + roofW, y: offsetY + rakingWidthPx };
        diagEnd = { x: cD.x + shortPx, y: cD.y };
      }
    }

    // Resolve colours
    const bladeHex = bladeColour === "Powder Coated"
      ? (COLOURBOND_HEX[colourbondBladeColour] || "#3B4044")
      : "#e5e7eb";
    const structHex = structureColour === "Powder Coated"
      ? (COLOURBOND_HEX[colourbondStructureColour] || "#3B4044")
      : "#d1d5db";

    // House walls (parsed from comma-separated A,B,C,D)
    const wallEdges = (houseWalls || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const isWallA = wallEdges.includes("A"); // top
    const isWallB = wallEdges.includes("B"); // right
    const isWallC = wallEdges.includes("C"); // bottom
    const isWallD = wallEdges.includes("D"); // left

    // Draw wall indicators
    function drawWallHatch(x: number, y: number, w: number, h: number, vertical: boolean) {
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 0.5;
      if (vertical) {
        for (let py = y; py < y + h; py += 8) {
          ctx.beginPath();
          ctx.moveTo(x, py);
          ctx.lineTo(x + w, py + 6);
          ctx.stroke();
        }
      } else {
        for (let px = x; px < x + w; px += 8) {
          ctx.beginPath();
          ctx.moveTo(px, y);
          ctx.lineTo(px + 6, y + h);
          ctx.stroke();
        }
      }
    }

    if (isWallA) drawWallHatch(offsetX - 10, offsetY - 14, roofW + 20, 12, false);
    if (isWallC) drawWallHatch(offsetX - 10, offsetY + roofH + 2, roofW + 20, 12, false);
    if (isWallD) drawWallHatch(offsetX - 14, offsetY - 10, 12, roofH + 20, true);
    if (isWallB) drawWallHatch(offsetX + roofW + 2, offsetY - 10, 12, roofH + 20, true);

    // ─── Draw outer frame (beams) — ALWAYS a rectangle ───────────────────────
    ctx.strokeStyle = structHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(offsetX, offsetY, roofW, roofH);

    // ─── Draw raked diagonal beam (dashed red line inside the rectangle) ──────
    if (hasRake) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(diagStart.x, diagStart.y);
      ctx.lineTo(diagEnd.x, diagEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label the raked beam
      ctx.font = "bold 9px Arial, sans-serif";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      const labelX = (diagStart.x + diagEnd.x) / 2;
      const labelY = (diagStart.y + diagEnd.y) / 2;
      // Offset label away from the line
      const dx = diagEnd.x - diagStart.x;
      const dy = diagEnd.y - diagStart.y;
      const lineLen = Math.sqrt(dx * dx + dy * dy);
      const normX = -dy / lineLen; // perpendicular
      const normY = dx / lineLen;
      ctx.fillText("RAKED FREE END", labelX + normX * 14, labelY + normY * 14);
    }

    // ─── Gutter channels ─────────────────────────────────────────────────────
    // For the raked edge, the gutter follows the diagonal beam line.
    // For all other edges, gutters are straight rectangles.
    const gutterWidth = 8;
    ctx.fillStyle = "#b0bec5";
    ctx.globalAlpha = 0.6;

    // Helper to draw an angled gutter as a parallelogram offset from a line
    const drawAngledGutter = (x1: number, y1: number, x2: number, y2: number, offsetDir: number) => {
      // offsetDir: +1 = offset outward (below/right), -1 = offset inward (above/left)
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;
      // Normal perpendicular to the line
      const nx = (-dy / len) * gutterWidth * offsetDir;
      const ny = (dx / len) * gutterWidth * offsetDir;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 + nx, y2 + ny);
      ctx.lineTo(x1 + nx, y1 + ny);
      ctx.closePath();
      ctx.fill();
    };

    if (hasRake && edge === "C-D") {
      // Top gutter (A-B) — straight
      ctx.fillRect(offsetX, offsetY - gutterWidth, roofW, gutterWidth);
      // Left gutter (D-A) — straight
      ctx.fillRect(offsetX - gutterWidth, offsetY, gutterWidth, roofH);
      // Right gutter (B-C) — straight (short side, only if short > 0)
      if (shortPx > 0) ctx.fillRect(offsetX + roofW, offsetY, gutterWidth, shortPx);
      // Bottom gutter follows diagonal: from D to diagStart (raking width point)
      ctx.fillRect(offsetX, offsetY + roofH, diagStart.x - offsetX, gutterWidth);
      // Angled gutter from diagStart to diagEnd (the diagonal beam)
      drawAngledGutter(diagStart.x, diagStart.y, diagEnd.x, diagEnd.y, 1);
    } else if (hasRake && edge === "A-B") {
      // Bottom gutter (C-D) — straight
      ctx.fillRect(offsetX, offsetY + roofH, roofW, gutterWidth);
      // Left gutter (D-A) — straight
      ctx.fillRect(offsetX - gutterWidth, offsetY, gutterWidth, roofH);
      // Right gutter (B-C) — straight (short side, only if short > 0)
      if (shortPx > 0) ctx.fillRect(offsetX + roofW, offsetY + roofH - shortPx, gutterWidth, shortPx);
      // Top gutter from A to diagStart (raking width point)
      ctx.fillRect(offsetX, offsetY - gutterWidth, diagStart.x - offsetX, gutterWidth);
      // Angled gutter from diagStart to diagEnd (the diagonal beam)
      drawAngledGutter(diagStart.x, diagStart.y, diagEnd.x, diagEnd.y, -1);
    } else if (hasRake && edge === "D-A") {
      // Top gutter (A-B) — straight
      ctx.fillRect(offsetX, offsetY - gutterWidth, roofW, gutterWidth);
      // Right gutter (B-C) — straight
      ctx.fillRect(offsetX + roofW, offsetY, gutterWidth, roofH);
      // Bottom gutter (C-D) — straight (short side, only if short > 0)
      if (shortPx > 0) ctx.fillRect(offsetX, offsetY + roofH, shortPx, gutterWidth);
      // Left gutter from D up to diagStart
      ctx.fillRect(offsetX - gutterWidth, diagStart.y, gutterWidth, offsetY + roofH - diagStart.y);
      // Angled gutter from diagStart to diagEnd
      drawAngledGutter(diagStart.x, diagStart.y, diagEnd.x, diagEnd.y, -1);
    } else if (hasRake && edge === "B-C") {
      // Top gutter (A-B) — straight
      ctx.fillRect(offsetX, offsetY - gutterWidth, roofW, gutterWidth);
      // Left gutter (D-A) — straight
      ctx.fillRect(offsetX - gutterWidth, offsetY, gutterWidth, roofH);
      // Bottom gutter (C-D) — straight (short side, only if short > 0)
      if (shortPx > 0) ctx.fillRect(offsetX + roofW - shortPx, offsetY + roofH, shortPx, gutterWidth);
      // Right gutter from B down to diagStart
      ctx.fillRect(offsetX + roofW, offsetY, gutterWidth, diagStart.y - offsetY);
      // Angled gutter from diagStart to diagEnd
      drawAngledGutter(diagStart.x, diagStart.y, diagEnd.x, diagEnd.y, 1);
    } else {
      // Non-raked: all 4 straight gutters
      ctx.fillRect(offsetX, offsetY - gutterWidth, roofW, gutterWidth);
      ctx.fillRect(offsetX, offsetY + roofH, roofW, gutterWidth);
      ctx.fillRect(offsetX - gutterWidth, offsetY, gutterWidth, roofH);
      ctx.fillRect(offsetX + roofW, offsetY, gutterWidth, roofH);
    }
    ctx.globalAlpha = 1.0;

    // Gutter labels — position along the gutter path
    ctx.font = "9px Arial, sans-serif";
    ctx.fillStyle = "#546e7a";
    ctx.textAlign = "center";

    if (hasRake && (edge === "C-D" || edge === "A-B")) {
      // For C-D/A-B raked: the raked edge gutter label follows the diagonal
      const diagMidX = (diagStart.x + diagEnd.x) / 2;
      const diagMidY = (diagStart.y + diagEnd.y) / 2;
      const diagAngle = Math.atan2(diagEnd.y - diagStart.y, diagEnd.x - diagStart.x);

      // Non-raked edges get normal labels
      if (edge === "C-D") {
        ctx.fillText("GUTTER", offsetX + roofW / 2, offsetY - gutterWidth / 2 + 3); // top A-B
        ctx.save();
        ctx.translate(offsetX - gutterWidth / 2, offsetY + roofH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("GUTTER", 0, 3); // left D-A
        ctx.restore();
      } else {
        ctx.fillText("GUTTER", offsetX + roofW / 2, offsetY + roofH + gutterWidth / 2 + 3); // bottom C-D
        ctx.save();
        ctx.translate(offsetX - gutterWidth / 2, offsetY + roofH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("GUTTER", 0, 3); // left D-A
        ctx.restore();
      }
      // Diagonal gutter label
      ctx.save();
      ctx.translate(diagMidX, diagMidY);
      ctx.rotate(diagAngle);
      ctx.fillText("GUTTER", 0, -4);
      ctx.restore();
    } else if (hasRake && (edge === "D-A" || edge === "B-C")) {
      const diagMidX = (diagStart.x + diagEnd.x) / 2;
      const diagMidY = (diagStart.y + diagEnd.y) / 2;
      const diagAngle = Math.atan2(diagEnd.y - diagStart.y, diagEnd.x - diagStart.x);

      if (edge === "D-A") {
        ctx.fillText("GUTTER", offsetX + roofW / 2, offsetY - gutterWidth / 2 + 3); // top
        ctx.save();
        ctx.translate(offsetX + roofW + gutterWidth / 2, offsetY + roofH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("GUTTER", 0, 3); // right B-C
        ctx.restore();
      } else {
        ctx.fillText("GUTTER", offsetX + roofW / 2, offsetY - gutterWidth / 2 + 3); // top
        ctx.save();
        ctx.translate(offsetX - gutterWidth / 2, offsetY + roofH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("GUTTER", 0, 3); // left D-A
        ctx.restore();
      }
      // Diagonal gutter label
      ctx.save();
      ctx.translate(diagMidX, diagMidY);
      ctx.rotate(diagAngle);
      ctx.fillText("GUTTER", 0, -4);
      ctx.restore();
    } else {
      // Non-raked: standard labels
      ctx.fillText("GUTTER", offsetX + roofW / 2, offsetY - gutterWidth / 2 + 3);
      ctx.fillText("GUTTER", offsetX + roofW / 2, offsetY + roofH + gutterWidth / 2 + 3);
      ctx.save();
      ctx.translate(offsetX - gutterWidth / 2, offsetY + roofH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("GUTTER", 0, 3);
      ctx.restore();
      ctx.save();
      ctx.translate(offsetX + roofW + gutterWidth / 2, offsetY + roofH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("GUTTER", 0, 3);
      ctx.restore();
    }

    // ─── Louvre blades (always span full width/length of rectangle) ───────────
    const isAlongLength = bladeDirection === "along-length";
    if (isAlongLength) {
      // Blades run along length (horizontal lines across the width)
      const numBlades = Math.min(Math.max(Math.round(length / 159), 6), 30);
      const bladeSpacing = roofH / (numBlades + 1);
      ctx.lineWidth = 2;
      for (let i = 1; i <= numBlades; i++) {
        const y = offsetY + i * bladeSpacing;
        ctx.strokeStyle = bladeHex;
        ctx.beginPath();
        ctx.moveTo(offsetX + 4, y);
        ctx.lineTo(offsetX + roofW - 4, y);
        ctx.stroke();
      }
    } else {
      // Default: blades along width (vertical lines)
      const numBlades = Math.min(Math.max(Math.round(bladeWidth / 159), 6), 30);
      const bladeSpacing = roofW / (numBlades + 1);
      ctx.lineWidth = 2;
      for (let i = 1; i <= numBlades; i++) {
        const x = offsetX + i * bladeSpacing;
        ctx.strokeStyle = bladeHex;
        ctx.beginPath();
        ctx.moveTo(x, offsetY + 4);
        ctx.lineTo(x, offsetY + roofH - 4);
        ctx.stroke();
      }
    }

    // ─── Blade span direction arrow ──────────────────────────────────────────
    if (isAlongLength) {
      const arrowX = offsetX - 30;
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(arrowX, offsetY + 20);
      ctx.lineTo(arrowX, offsetY + roofH - 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX, offsetY + roofH - 20);
      ctx.lineTo(arrowX - 5, offsetY + roofH - 30);
      ctx.moveTo(arrowX, offsetY + roofH - 20);
      ctx.lineTo(arrowX + 5, offsetY + roofH - 30);
      ctx.stroke();
      ctx.font = "10px Arial, sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.save();
      ctx.translate(arrowX - 10, offsetY + roofH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("BLADE DIRECTION (D-A)", 0, 0);
      ctx.restore();
    } else {
      const arrowY = offsetY + roofH + 30;
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(offsetX + 20, arrowY);
      ctx.lineTo(offsetX + roofW - 20, arrowY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offsetX + roofW - 20, arrowY);
      ctx.lineTo(offsetX + roofW - 30, arrowY - 5);
      ctx.moveTo(offsetX + roofW - 20, arrowY);
      ctx.lineTo(offsetX + roofW - 30, arrowY + 5);
      ctx.stroke();
      ctx.font = "10px Arial, sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.textAlign = "center";
      ctx.fillText("BLADE DIRECTION (A-B)", offsetX + roofW / 2, arrowY + 14);
    }

    // ─── Motor position indicator ────────────────────────────────────────────
    const motorW = 20;
    const motorH = 12;
    ctx.fillStyle = "#ef4444";
    let motorMX = 0;
    let motorMY = 0;
    const mp = (motorPosition || "A-B").toUpperCase();
    if (mp === "A-B") {
      motorMX = cA.x + roofW / 2 - motorW / 2;
      motorMY = cA.y + 6;
    } else if (mp === "B-C") {
      motorMX = cB.x - motorW - 6;
      motorMY = cB.y + roofH / 2 - motorH / 2;
    } else if (mp === "C-D") {
      motorMX = cD.x + roofW / 2 - motorW / 2;
      motorMY = cD.y - motorH - 6;
    } else if (mp === "D-A") {
      motorMX = cA.x + 6;
      motorMY = cA.y + roofH / 2 - motorH / 2;
    } else {
      motorMX = cA.x + roofW / 2 - motorW / 2;
      motorMY = cA.y + 6;
    }
    ctx.fillRect(motorMX, motorMY, motorW, motorH);
    ctx.font = "bold 8px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("M", motorMX + motorW / 2, motorMY + motorH - 3);

    // ─── Post indicators ─────────────────────────────────────────────────────
    const postSize = 10;
    ctx.fillStyle = structHex;
    const isFreestanding = mountType === "Freestanding";

    if (isFreestanding) {
      // Corner posts at the 4 corners
      ctx.fillRect(cA.x - postSize / 2, cA.y - postSize / 2, postSize, postSize);
      ctx.fillRect(cB.x - postSize / 2, cB.y - postSize / 2, postSize, postSize);
      ctx.fillRect(cC.x - postSize / 2, cC.y - postSize / 2, postSize, postSize);
      ctx.fillRect(cD.x - postSize / 2, cD.y - postSize / 2, postSize, postSize);
      // Additional posts along left and right edges
      if (posts > 4) {
        const extraPosts = posts - 4;
        const halfExtra = Math.ceil(extraPosts / 2);
        // Left side (D-A)
        for (let i = 1; i <= halfExtra; i++) {
          const t = i / (halfExtra + 1);
          const py = cD.y + (cA.y - cD.y) * t;
          ctx.fillRect(cA.x - postSize / 2, py - postSize / 2, postSize, postSize);
        }
        // Right side (B-C)
        for (let i = 1; i <= Math.floor(extraPosts / 2); i++) {
          const t = i / (Math.floor(extraPosts / 2) + 1);
          const py = cB.y + (cC.y - cB.y) * t;
          ctx.fillRect(cB.x - postSize / 2, py - postSize / 2, postSize, postSize);
        }
      }
    } else {
      // Fascia: posts at the free end (bottom edge by default)
      ctx.fillRect(cD.x - postSize / 2, cD.y - postSize / 2, postSize, postSize);
      ctx.fillRect(cC.x - postSize / 2, cC.y - postSize / 2, postSize, postSize);
      if (posts > 2) {
        const extraPosts = posts - 2;
        for (let i = 1; i <= extraPosts; i++) {
          const t = i / (extraPosts + 1);
          const px = cD.x + (cC.x - cD.x) * t;
          ctx.fillRect(px - postSize / 2, cD.y - postSize / 2, postSize, postSize);
        }
      }
    }

    // ─── Corner labels (A, B, C, D) ─────────────────────────────────────────
    ctx.font = "bold 10px Arial, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.fillText("A", cA.x - 12, cA.y - 12);
    ctx.fillText("B", cB.x + 12, cB.y - 12);
    ctx.fillText("C", cC.x + 12, cC.y + 16);
    ctx.fillText("D", cD.x - 12, cD.y + 16);

    // ─── Dimension lines ─────────────────────────────────────────────────────
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;

    // Width dimension (top) — always shows bladeWidth
    const dimTopY = offsetY - (isWallA ? 40 : 30);
    ctx.beginPath();
    ctx.moveTo(offsetX, dimTopY);
    ctx.lineTo(offsetX + roofW, dimTopY);
    ctx.stroke();
    drawArrow(ctx, offsetX, dimTopY, offsetX + roofW, dimTopY);
    drawArrow(ctx, offsetX + roofW, dimTopY, offsetX, dimTopY);

    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(offsetX, cA.y - 4);
    ctx.lineTo(offsetX, dimTopY + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(offsetX + roofW, cB.y - 4);
    ctx.lineTo(offsetX + roofW, dimTopY + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(`${bladeWidth}mm`, offsetX + roofW / 2, dimTopY - 6);

    // Left side dimension (D-A) — full length
    const dimLeftX = offsetX - (isWallD ? 50 : 40);
    ctx.strokeStyle = "#1a1a1a";
    ctx.fillStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dimLeftX, offsetY);
    ctx.lineTo(dimLeftX, offsetY + roofH);
    ctx.stroke();
    drawArrow(ctx, dimLeftX, offsetY, dimLeftX, offsetY + roofH);
    drawArrow(ctx, dimLeftX, offsetY + roofH, dimLeftX, offsetY);

    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cA.x - 4, offsetY);
    ctx.lineTo(dimLeftX + 4, offsetY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cD.x - 4, offsetY + roofH);
    ctx.lineTo(dimLeftX + 4, offsetY + roofH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.translate(dimLeftX - 14, offsetY + roofH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(`${length}mm`, 0, 0);
    ctx.restore();

    // ─── Raked dimension lines (red, togglable) ──────────────────────────────
    if (hasRake && showRakeDims) {
      ctx.font = "bold 11px Arial, sans-serif";

      if (edge === "A-B" || edge === "C-D") {
        // Short side dimension on the RIGHT edge (B-C)
        const dimRightX = offsetX + roofW + (isWallB ? 50 : 40);
        ctx.strokeStyle = "#ef4444";
        ctx.fillStyle = "#ef4444";
        ctx.lineWidth = 1;

        // Short side = B-C = rakedShortLength
        // For C-D: short is measured from B downward (diagEnd is near B)
        // For A-B: short is measured from C upward (diagEnd is near C)
        const shortStartY = edge === "C-D" ? cB.y : cC.y - shortPx;
        const shortEndY = edge === "C-D" ? cB.y + shortPx : cC.y;

        ctx.beginPath();
        ctx.moveTo(dimRightX, shortStartY);
        ctx.lineTo(dimRightX, shortEndY);
        ctx.stroke();
        drawArrow(ctx, dimRightX, shortStartY, dimRightX, shortEndY);
        drawArrow(ctx, dimRightX, shortEndY, dimRightX, shortStartY);

        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cB.x + 4, shortStartY);
        ctx.lineTo(dimRightX - 4, shortStartY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cB.x + 4, shortEndY);
        ctx.lineTo(dimRightX - 4, shortEndY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.translate(dimRightX + 14, (shortStartY + shortEndY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(`${rakedShortLength}mm`, 0, 0);
        ctx.restore();

        ctx.font = "bold 9px Arial, sans-serif";
        ctx.save();
        ctx.translate(dimRightX + 26, (shortStartY + shortEndY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText("(SHORT)", 0, 0);
        ctx.restore();

        // Raking Length dimension (further right)
        const rakingLength = length - rakedShortLength;
        const rlDimX = offsetX + roofW + (isWallB ? 70 : 60);
        ctx.font = "bold 11px Arial, sans-serif";
        ctx.strokeStyle = "#ef4444";
        ctx.fillStyle = "#ef4444";
        ctx.lineWidth = 1;

        const rlStartY = edge === "C-D" ? cB.y + shortPx : cB.y;
        const rlEndY = edge === "C-D" ? cC.y : cC.y - shortPx;

        ctx.beginPath();
        ctx.moveTo(rlDimX, rlStartY);
        ctx.lineTo(rlDimX, rlEndY);
        ctx.stroke();
        drawArrow(ctx, rlDimX, rlStartY, rlDimX, rlEndY);
        drawArrow(ctx, rlDimX, rlEndY, rlDimX, rlStartY);

        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cB.x + 4, rlStartY);
        ctx.lineTo(rlDimX - 4, rlStartY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cC.x + 4, rlEndY);
        ctx.lineTo(rlDimX - 4, rlEndY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.translate(rlDimX + 14, (rlStartY + rlEndY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(`${rakingLength}mm`, 0, 0);
        ctx.restore();

        ctx.font = "bold 8px Arial, sans-serif";
        ctx.save();
        ctx.translate(rlDimX + 24, (rlStartY + rlEndY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText("(RAKING LENGTH)", 0, 0);
        ctx.restore();

        // Raking Width dimension (bottom)
        const rwDimY = offsetY + roofH + (isWallC ? 20 : 14);
        ctx.font = "bold 11px Arial, sans-serif";
        ctx.strokeStyle = "#ef4444";
        ctx.fillStyle = "#ef4444";
        ctx.lineWidth = 1;

        // Raking width dimension
        // For C-D: raking width is on the bottom edge (measured from D)
        // For A-B: raking width is on the top edge (measured from A)
        const rwEndX = offsetX + effectiveRakingWidthMM * scale;

        if (edge === "C-D") {
          // Show raking width below the bottom edge
          const rwDimYBot = offsetY + roofH + (isWallC ? 20 : 14);
          ctx.beginPath();
          ctx.moveTo(offsetX, rwDimYBot);
          ctx.lineTo(rwEndX, rwDimYBot);
          ctx.stroke();
          drawArrow(ctx, offsetX, rwDimYBot, rwEndX, rwDimYBot);
          drawArrow(ctx, rwEndX, rwDimYBot, offsetX, rwDimYBot);

          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(offsetX, cD.y + 4);
          ctx.lineTo(offsetX, rwDimYBot - 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(rwEndX, cC.y + 4);
          ctx.lineTo(rwEndX, rwDimYBot - 4);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.textAlign = "center";
          ctx.fillText(`${effectiveRakingWidthMM}mm`, (offsetX + rwEndX) / 2, rwDimYBot + 14);
          ctx.font = "bold 8px Arial, sans-serif";
          ctx.fillText("(RAKING WIDTH)", (offsetX + rwEndX) / 2, rwDimYBot + 24);
        } else {
          // A-B: show raking width above the top edge
          const rwDimYTop = offsetY - 40;
          ctx.beginPath();
          ctx.moveTo(offsetX, rwDimYTop);
          ctx.lineTo(rwEndX, rwDimYTop);
          ctx.stroke();
          drawArrow(ctx, offsetX, rwDimYTop, rwEndX, rwDimYTop);
          drawArrow(ctx, rwEndX, rwDimYTop, offsetX, rwDimYTop);

          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(offsetX, cA.y - 4);
          ctx.lineTo(offsetX, rwDimYTop + 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(rwEndX, cA.y - 4);
          ctx.lineTo(rwEndX, rwDimYTop + 4);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.textAlign = "center";
          ctx.fillText(`${effectiveRakingWidthMM}mm`, (offsetX + rwEndX) / 2, rwDimYTop - 6);
          ctx.font = "bold 8px Arial, sans-serif";
          ctx.fillText("(RAKING WIDTH)", (offsetX + rwEndX) / 2, rwDimYTop - 16);
        }

      } else if (edge === "B-C" || edge === "D-A") {
        // For vertical raked edges: short side on bottom (C-D), raking width on left (D-A)
        // Short side dimension on bottom
        const dimBotY = offsetY + roofH + (isWallC ? 40 : 30);
        ctx.strokeStyle = "#ef4444";
        ctx.fillStyle = "#ef4444";
        ctx.lineWidth = 1;

        // For B-C: short side on bottom edge measured from D rightward (diagEnd = D.x + shortPx)
        // For D-A: short side on top edge, but we show bottom dimension from C leftward
        const shortStartX = edge === "B-C" ? cD.x : cC.x - shortPx;
        const shortEndX = edge === "B-C" ? cD.x + shortPx : cC.x;

        ctx.beginPath();
        ctx.moveTo(shortStartX, dimBotY);
        ctx.lineTo(shortEndX, dimBotY);
        ctx.stroke();
        drawArrow(ctx, shortStartX, dimBotY, shortEndX, dimBotY);
        drawArrow(ctx, shortEndX, dimBotY, shortStartX, dimBotY);

        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(shortStartX, cD.y + 4);
        ctx.lineTo(shortStartX, dimBotY - 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(shortEndX, cC.y + 4);
        ctx.lineTo(shortEndX, dimBotY - 4);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.textAlign = "center";
        ctx.fillText(`${rakedShortLength}mm`, (shortStartX + shortEndX) / 2, dimBotY + 14);
        ctx.font = "bold 8px Arial, sans-serif";
        ctx.fillText("(SHORT)", (shortStartX + shortEndX) / 2, dimBotY + 24);

        // Raking Length on the right side
        const rakingLength = length - rakedShortLength;
        const rlDimX = offsetX + roofW + (isWallB ? 50 : 40);
        ctx.font = "bold 11px Arial, sans-serif";
        ctx.strokeStyle = "#ef4444";
        ctx.fillStyle = "#ef4444";
        ctx.lineWidth = 1;

        const rakingWidthPx = effectiveRakingWidthMM * scale;
        const rlStartY = edge === "B-C" ? offsetY : offsetY;
        const rlEndY = edge === "B-C" ? offsetY + rakingWidthPx : offsetY + rakingWidthPx;

        ctx.beginPath();
        ctx.moveTo(rlDimX, rlStartY);
        ctx.lineTo(rlDimX, rlEndY);
        ctx.stroke();
        drawArrow(ctx, rlDimX, rlStartY, rlDimX, rlEndY);
        drawArrow(ctx, rlDimX, rlEndY, rlDimX, rlStartY);

        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cB.x + 4, rlStartY);
        ctx.lineTo(rlDimX - 4, rlStartY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cB.x + 4, rlEndY);
        ctx.lineTo(rlDimX - 4, rlEndY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.translate(rlDimX + 14, (rlStartY + rlEndY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(`${effectiveRakingWidthMM}mm`, 0, 0);
        ctx.restore();

        ctx.font = "bold 8px Arial, sans-serif";
        ctx.save();
        ctx.translate(rlDimX + 24, (rlStartY + rlEndY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText("(RAKING WIDTH)", 0, 0);
        ctx.restore();
      }
    }

    // ─── Fall direction arrow ────────────────────────────────────────────────
    if (fallDirection) {
      ctx.font = "10px Arial, sans-serif";
      ctx.fillStyle = "#2563eb";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      const fdX = offsetX + roofW / 2;
      const fdY = offsetY + roofH / 2;
      const arrowLen = Math.min(roofW, roofH) * 0.25;

      let dx = 0, dy = 0;
      // Fall direction value = the HIGH edge (where water falls FROM).
      // Arrow should point AWAY from that edge (toward the low side).
      // A-B is top edge → fall toward bottom (C-D) → dy=+1
      // C-D is bottom edge → fall toward top (A-B) → dy=-1
      // B-C is right edge → fall toward left (D-A) → dx=-1
      // D-A is left edge → fall toward right (B-C) → dx=+1
      const dir = fallDirection.toUpperCase();
      if (dir === "A-B" || dir === "A" || dir === "FRONT") { dx = 0; dy = 1; }
      else if (dir === "C-D" || dir === "C" || dir === "BACK") { dx = 0; dy = -1; }
      else if (dir === "B-C" || dir === "B" || dir === "RIGHT") { dx = -1; dy = 0; }
      else if (dir === "D-A" || dir === "D" || dir === "LEFT") { dx = 1; dy = 0; }

      if (dx !== 0 || dy !== 0) {
        const endX = fdX + dx * arrowLen;
        const endY = fdY + dy * arrowLen;
        ctx.beginPath();
        ctx.moveTo(fdX, fdY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        drawArrow(ctx, fdX, fdY, endX, endY);
        ctx.font = "9px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("FALL", fdX + dx * (arrowLen + 15), fdY + dy * (arrowLen + 15));
      }
    }

    // ─── Title ───────────────────────────────────────────────────────────────
    if (unitLabel) {
      ctx.font = "bold 14px Arial, sans-serif";
      ctx.fillStyle = "#1a1a1a";
      ctx.textAlign = "center";
      const titleSuffix = hasRake ? " — Plan View (RAKED)" : " — Plan View";
      ctx.fillText(`${unitLabel}${titleSuffix}`, canvasWidth / 2, 20);
    }

    // ─── Legend (colour swatches) ────────────────────────────────────────────
    ctx.font = "10px Arial, sans-serif";
    ctx.textAlign = "left";
    const legendX = 12;
    let legendY = canvasHeight - 55;

    const bladeLabel = bladeColour === "Powder Coated" ? colourbondBladeColour : "White";
    ctx.fillStyle = bladeHex;
    ctx.fillRect(legendX, legendY - 8, 10, 10);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(legendX, legendY - 8, 10, 10);
    ctx.fillStyle = "#4b5563";
    ctx.fillText(`Blades: ${bladeLabel}`, legendX + 14, legendY);
    legendY += 14;

    const structLabel = structureColour === "Powder Coated" ? colourbondStructureColour : "White";
    ctx.fillStyle = structHex;
    ctx.fillRect(legendX, legendY - 8, 10, 10);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(legendX, legendY - 8, 10, 10);
    ctx.fillStyle = "#4b5563";
    ctx.fillText(`Structure: ${structLabel}`, legendX + 14, legendY);

    // Raked info in legend
    if (hasRake) {
      legendY += 14;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = "#4b5563";
      const rakingLength = length - rakedShortLength;
      const effectiveRW = rakedWidth > 0 ? rakedWidth : bladeWidth;
      const angleDeg = Math.round(Math.atan(rakingLength / effectiveRW) * 180 / Math.PI * 10) / 10;
      ctx.fillText(`Raked (${edge}): ${angleDeg}° | Drop: ${rakingLength}mm`, legendX + 14, legendY);
    }

  }, [bladeWidth, length, posts, mountType, bladeColour, structureColour, colourbondBladeColour, colourbondStructureColour, unitLabel, fallDirection, houseWalls, bladeDirection, motorPosition, isRaked, rakedShortLength, rakedWidth, rakedEdge, showRakeDims]);

  if (bladeWidth <= 0 || length <= 0) {
    return (
      <div className="text-center text-muted-foreground text-xs py-4">
        Enter blade width and length to see plan view
      </div>
    );
  }

  const handleToggle = () => {
    if (onToggleRakeDimensions) {
      onToggleRakeDimensions();
    } else {
      setInternalShowDims(prev => !prev);
    }
  };

  return (
    <div className="border rounded-md overflow-hidden bg-white">
      {hasRake && (
        <div className="flex justify-end px-2 pt-2">
          <button
            type="button"
            onClick={handleToggle}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              showRakeDims
                ? "bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {showRakeDims ? "Hide" : "Show"} Rake Dimensions
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={640}
        height={520}
        className="w-full h-auto"
      />
    </div>
  );
}

function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const headLen = 7;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}
