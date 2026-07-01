import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCw, Download } from "lucide-react";
import type { UnitInput } from "../../../../shared/eclipseCalculations";
import { logClientDownload } from "@/lib/userActivity";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UnitPosition {
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface SiteLayoutData {
  preset: LayoutPreset;
  gap: number;
  positions: UnitPosition[];
}

export type LayoutPreset =
  | "side-by-side"
  | "stacked"
  | "l-shape-right"
  | "l-shape-left"
  | "custom";

const PRESET_LABELS: Record<LayoutPreset, string> = {
  "side-by-side": "Side by Side",
  "stacked": "Stacked (Top to Bottom)",
  "l-shape-right": "L-Shape (Right)",
  "l-shape-left": "L-Shape (Left)",
  "custom": "Custom Positions",
};

// ─── Colourbond Colour Hex Mapping ──────────────────────────────────────────

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

// ─── Raked Unit Geometry Helpers ─────────────────────────────────────────────

/** Get effective dimensions for a unit, accounting for raked trapezoid geometry */
function getUnitEffectiveDims(unit: { bladeWidth: number; length: number; isRaked?: boolean; rakedShortLength?: number }) {
  const isRaked = unit.isRaked && unit.rakedShortLength !== undefined && unit.rakedShortLength >= 0 && unit.rakedShortLength < unit.length;
  return {
    width: unit.bladeWidth,
    longLength: unit.length,
    shortLength: isRaked ? unit.rakedShortLength! : unit.length,
    isRaked,
  };
}

/** Calculate the rake angle in degrees for a raked unit */
function getRakeAngleDeg(unit: { bladeWidth: number; length: number; rakedShortLength?: number }): number {
  const lengthDiff = unit.length - (unit.rakedShortLength ?? unit.length);
  if (lengthDiff <= 0) return 0;
  return Math.round(Math.atan(lengthDiff / unit.bladeWidth) * (180 / Math.PI) * 10) / 10;
}

// ─── Preset Position Calculator ─────────────────────────────────────────────

export function calculatePresetPositions(
  preset: LayoutPreset,
  units: { bladeWidth: number; length: number; isRaked?: boolean; rakedShortLength?: number }[],
  gap: number
): UnitPosition[] {
  if (units.length === 0) return [];

  switch (preset) {
    case "side-by-side": {
      // For raked units, use the average of long+short length for tighter vertical packing
      let currentX = 0;
      return units.map((u) => {
        const pos: UnitPosition = { x: currentX, y: 0, rotation: 0 };
        currentX += u.bladeWidth + gap;
        return pos;
      });
    }
    case "stacked": {
      // For raked units stacked vertically, use actual long length for spacing
      let currentY = 0;
      return units.map((u) => {
        const dims = getUnitEffectiveDims(u);
        const pos: UnitPosition = { x: 0, y: currentY, rotation: 0 };
        // Use long length for spacing to prevent overlap
        currentY += dims.longLength + gap;
        return pos;
      });
    }
    case "l-shape-right": {
      if (units.length < 2) return units.map(() => ({ x: 0, y: 0, rotation: 0 }));
      const positions: UnitPosition[] = [{ x: 0, y: 0, rotation: 0 }];
      const firstDims = getUnitEffectiveDims(units[0]);
      positions.push({
        x: units[0].bladeWidth + gap,
        y: firstDims.longLength - units[1].bladeWidth,
        rotation: 90,
      });
      let currentX = positions[1].x + units[1].length + gap;
      for (let i = 2; i < units.length; i++) {
        positions.push({ x: currentX, y: positions[1].y, rotation: 90 });
        currentX += units[i].length + gap;
      }
      return positions;
    }
    case "l-shape-left": {
      if (units.length < 2) return units.map(() => ({ x: 0, y: 0, rotation: 0 }));
      const firstDims = getUnitEffectiveDims(units[0]);
      const secondX = -(units[1].length + gap);
      const positions: UnitPosition[] = [
        { x: 0, y: 0, rotation: 0 },
        { x: secondX, y: firstDims.longLength - units[1].bladeWidth, rotation: 90 },
      ];
      let currentX = secondX - gap;
      for (let i = 2; i < units.length; i++) {
        currentX -= units[i].length;
        positions.push({ x: currentX, y: positions[1].y, rotation: 90 });
        currentX -= gap;
      }
      return positions;
    }
    case "custom":
    default:
      return calculatePresetPositions("side-by-side", units, gap);
  }
}

// ─── Canvas Renderer (matches standalone app) ───────────────────────────────

function getRotatedDims(w: number, h: number, rotation: 0 | 90 | 180 | 270): { rw: number; rh: number } {
  if (rotation === 90 || rotation === 270) return { rw: h, rh: w };
  return { rw: w, rh: h };
}

function drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const headLen = 5;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function renderSitePlanCanvas(
  canvas: HTMLCanvasElement,
  units: UnitInput[],
  positions: UnitPosition[],
  layoutLabel: string
): void {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (units.length === 0 || positions.length === 0) return;

  // Title
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.fillText("Combined Site Plan", canvasWidth / 2, 26);

  ctx.font = "11px Arial, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`Layout: ${layoutLabel}`, canvasWidth / 2, 42);

  // Calculate bounding box (uses actual trapezoid geometry for raked units)
  const margin = { top: 60, right: 60, bottom: 60, left: 50 };
  const drawW = canvasWidth - margin.left - margin.right;
  const drawH = canvasHeight - margin.top - margin.bottom;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  units.forEach((unit, idx) => {
    const pos = positions[idx] || { x: 0, y: 0, rotation: 0 };
    const dims = getUnitEffectiveDims(unit);
    // For raked units, the bounding box still uses the full rectangle (long side)
    // because the frame is rectangular with the diagonal beam inside
    const { rw, rh } = getRotatedDims(dims.width, dims.longLength, pos.rotation);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + rw);
    maxY = Math.max(maxY, pos.y + rh);
  });

  const totalW = maxX - minX;
  const totalH = maxY - minY;
  if (totalW <= 0 || totalH <= 0) return;

  const scaleX = drawW / totalW;
  const scaleY = drawH / totalH;
  const scale = Math.min(scaleX, scaleY) * 0.82;

  const scaledW = totalW * scale;
  const scaledH = totalH * scale;
  const offsetX = margin.left + (drawW - scaledW) / 2 - minX * scale;
  const offsetY = margin.top + (drawH - scaledH) / 2 - minY * scale;

  // Draw each unit
  units.forEach((unit, idx) => {
    const pos = positions[idx] || { x: 0, y: 0, rotation: 0 };
    const { rw, rh } = getRotatedDims(unit.bladeWidth, unit.length, pos.rotation);

    const screenX = pos.x * scale + offsetX;
    const screenY = pos.y * scale + offsetY;
    const screenW = rw * scale;
    const screenH = rh * scale;

    // Resolve colours
    const bladeColourName = unit.bladeColour === "Powder Coated" ? unit.colourbondBladeColour : undefined;
    const structColourName = unit.structureColour === "Powder Coated" ? unit.colourbondStructureColour : undefined;
    const bladeHex = (bladeColourName && COLOURBOND_HEX[bladeColourName]) || "#5a6577";
    const structHex = (structColourName && COLOURBOND_HEX[structColourName]) || "#3a3f47";

    const isFascia = unit.mountType === "Fascia";

    // Wall indicator for fascia mount
    if (isFascia) {
      ctx.fillStyle = "#9ca3af";
      const wallThickness = 8;
      if (pos.rotation === 0) {
        ctx.fillRect(screenX - 3, screenY - wallThickness - 2, screenW + 6, wallThickness);
      } else if (pos.rotation === 90) {
        ctx.fillRect(screenX + screenW + 2, screenY - 3, wallThickness, screenH + 6);
      } else if (pos.rotation === 180) {
        ctx.fillRect(screenX - 3, screenY + screenH + 2, screenW + 6, wallThickness);
      } else {
        ctx.fillRect(screenX - wallThickness - 2, screenY - 3, wallThickness, screenH + 6);
      }

      // Hatch pattern
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 0.4;
      if (pos.rotation === 0) {
        for (let x = screenX - 3; x < screenX + screenW + 3; x += 5) {
          ctx.beginPath(); ctx.moveTo(x, screenY - wallThickness - 2); ctx.lineTo(x + 4, screenY - 2); ctx.stroke();
        }
      } else if (pos.rotation === 90) {
        for (let yy = screenY - 3; yy < screenY + screenH + 3; yy += 5) {
          ctx.beginPath(); ctx.moveTo(screenX + screenW + 2, yy); ctx.lineTo(screenX + screenW + wallThickness + 2, yy + 4); ctx.stroke();
        }
      } else if (pos.rotation === 180) {
        for (let x = screenX - 3; x < screenX + screenW + 3; x += 5) {
          ctx.beginPath(); ctx.moveTo(x, screenY + screenH + 2); ctx.lineTo(x + 4, screenY + screenH + wallThickness + 2); ctx.stroke();
        }
      } else {
        for (let yy = screenY - 3; yy < screenY + screenH + 3; yy += 5) {
          ctx.beginPath(); ctx.moveTo(screenX - 2, yy); ctx.lineTo(screenX - wallThickness - 2, yy + 4); ctx.stroke();
        }
      }
    }

    // Raked geometry: draw trapezoid if unit is raked
    const isRaked = unit.isRaked && unit.rakedShortLength >= 0 && unit.rakedShortLength < unit.length;
    const shortRatio = isRaked ? unit.rakedShortLength / unit.length : 1;
    const shortScreenH = screenH * shortRatio;

    // Outer frame (trapezoid for raked, rectangle for standard)
    ctx.strokeStyle = structHex;
    ctx.lineWidth = 3;
    if (isRaked) {
      // Motor side (left/top) is full length, free-end (right/bottom) is shorter
      ctx.beginPath();
      if (pos.rotation === 0 || pos.rotation === 180) {
        // Blades run left-to-right; motor side = left edge (full height), free-end = right edge (short)
        const shortOffset = (screenH - shortScreenH) / 2;
        ctx.moveTo(screenX, screenY); // top-left
        ctx.lineTo(screenX + screenW, screenY + shortOffset); // top-right (inset)
        ctx.lineTo(screenX + screenW, screenY + screenH - shortOffset); // bottom-right (inset)
        ctx.lineTo(screenX, screenY + screenH); // bottom-left
        ctx.closePath();
      } else {
        // Blades run top-to-bottom; motor side = top edge (full width), free-end = bottom edge (short)
        const shortOffset = (screenW - screenW * shortRatio) / 2;
        ctx.moveTo(screenX, screenY); // top-left
        ctx.lineTo(screenX + screenW, screenY); // top-right
        ctx.lineTo(screenX + screenW - shortOffset, screenY + screenH); // bottom-right (inset)
        ctx.lineTo(screenX + shortOffset, screenY + screenH); // bottom-left (inset)
        ctx.closePath();
      }
      ctx.stroke();

      // Fill with blade colour (semi-transparent)
      ctx.fillStyle = bladeHex;
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    } else {
      ctx.strokeRect(screenX, screenY, screenW, screenH);

      // Fill with blade colour (semi-transparent)
      ctx.fillStyle = bladeHex;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(screenX, screenY, screenW, screenH);
      ctx.globalAlpha = 1.0;
    }

    // Louvre blade lines (varying length for raked)
    const numBlades = Math.min(Math.max(Math.round(unit.bladeWidth / 159), 4), 18);
    ctx.strokeStyle = bladeHex;
    ctx.lineWidth = 1;

    if (pos.rotation === 0 || pos.rotation === 180) {
      const spacing = screenW / (numBlades + 1);
      for (let i = 1; i <= numBlades; i++) {
        const x = screenX + i * spacing;
        if (isRaked) {
          // Each blade has a different length based on position along the rake
          const t = i / (numBlades + 1); // 0=motor side, 1=free-end side
          const bladeH = screenH - (screenH - shortScreenH) * t;
          const yOffset = (screenH - bladeH) / 2;
          ctx.beginPath(); ctx.moveTo(x, screenY + yOffset + 2); ctx.lineTo(x, screenY + yOffset + bladeH - 2); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(x, screenY + 2); ctx.lineTo(x, screenY + screenH - 2); ctx.stroke();
        }
      }
    } else {
      const spacing = screenH / (numBlades + 1);
      for (let i = 1; i <= numBlades; i++) {
        const y = screenY + i * spacing;
        if (isRaked) {
          const t = i / (numBlades + 1);
          const bladeW = screenW - (screenW - screenW * shortRatio) * t;
          const xOffset = (screenW - bladeW) / 2;
          ctx.beginPath(); ctx.moveTo(screenX + xOffset + 2, y); ctx.lineTo(screenX + xOffset + bladeW - 2, y); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(screenX + 2, y); ctx.lineTo(screenX + screenW - 2, y); ctx.stroke();
        }
      }
    }

    // Gutters
    const gutterW = Math.max(3, 5 * scale);
    ctx.fillStyle = "#b0bec5";
    ctx.globalAlpha = 0.5;
    if (pos.rotation === 0 || pos.rotation === 180) {
      ctx.fillRect(screenX - gutterW, screenY, gutterW, screenH);
      ctx.fillRect(screenX + screenW, screenY, gutterW, screenH);
    } else {
      ctx.fillRect(screenX, screenY - gutterW, screenW, gutterW);
      ctx.fillRect(screenX, screenY + screenH, screenW, gutterW);
    }
    ctx.globalAlpha = 1.0;

    // Posts
    const postSize = Math.max(5, 7 * scale);
    ctx.fillStyle = structHex;
    if (!isFascia) {
      // 4 corner posts for freestanding
      ctx.fillRect(screenX - postSize / 2, screenY - postSize / 2, postSize, postSize);
      ctx.fillRect(screenX + screenW - postSize / 2, screenY - postSize / 2, postSize, postSize);
      ctx.fillRect(screenX - postSize / 2, screenY + screenH - postSize / 2, postSize, postSize);
      ctx.fillRect(screenX + screenW - postSize / 2, screenY + screenH - postSize / 2, postSize, postSize);
    } else {
      // 2 front posts (opposite wall side)
      if (pos.rotation === 0) {
        ctx.fillRect(screenX - postSize / 2, screenY + screenH - postSize / 2, postSize, postSize);
        ctx.fillRect(screenX + screenW - postSize / 2, screenY + screenH - postSize / 2, postSize, postSize);
      } else if (pos.rotation === 90) {
        ctx.fillRect(screenX - postSize / 2, screenY - postSize / 2, postSize, postSize);
        ctx.fillRect(screenX - postSize / 2, screenY + screenH - postSize / 2, postSize, postSize);
      } else if (pos.rotation === 180) {
        ctx.fillRect(screenX - postSize / 2, screenY - postSize / 2, postSize, postSize);
        ctx.fillRect(screenX + screenW - postSize / 2, screenY - postSize / 2, postSize, postSize);
      } else {
        ctx.fillRect(screenX + screenW - postSize / 2, screenY - postSize / 2, postSize, postSize);
        ctx.fillRect(screenX + screenW - postSize / 2, screenY + screenH - postSize / 2, postSize, postSize);
      }
    }

    // Unit label
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "center";
    ctx.fillText(`Unit ${idx + 1}`, screenX + screenW / 2, screenY + screenH / 2 - 6);

    // Dimensions
    ctx.font = "9px Arial, sans-serif";
    ctx.fillStyle = "#374151";
    if (isRaked) {
      ctx.fillText(`${unit.bladeWidth} × ${unit.length}/${unit.rakedShortLength}mm`, screenX + screenW / 2, screenY + screenH / 2 + 8);
    } else {
      ctx.fillText(`${unit.bladeWidth} × ${unit.length}mm`, screenX + screenW / 2, screenY + screenH / 2 + 8);
    }

    // RAKED badge
    if (isRaked) {
      ctx.font = "bold 8px Arial, sans-serif";
      ctx.fillStyle = "#dc2626";
      ctx.textAlign = "center";
      ctx.fillText("RAKED", screenX + screenW / 2, screenY + screenH / 2 + 20);
    } else if (pos.rotation !== 0) {
      ctx.font = "8px Arial, sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(`(${pos.rotation}°)`, screenX + screenW / 2, screenY + screenH / 2 + 20);
    }

    // ─── Dimension Lines (enhanced for raked units) ───────────────────────
    const dimY = screenY + screenH + 14;
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 0.6;

    // Width dimension line below each unit (blade width)
    ctx.beginPath(); ctx.moveTo(screenX, dimY); ctx.lineTo(screenX + screenW, dimY); ctx.stroke();
    drawArrow(ctx, screenX, dimY, screenX + screenW, dimY);
    drawArrow(ctx, screenX + screenW, dimY, screenX, dimY);

    ctx.font = "9px Arial, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.fillText(`${unit.bladeWidth}mm`, screenX + screenW / 2, dimY + 11);

    // Length dimensions (right side)
    if (isRaked) {
      // Show BOTH long side and short side dimensions for raked units
      const dimX = screenX + screenW + 18;
      
      // Long side (full length) — black
      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(dimX, screenY); ctx.lineTo(dimX, screenY + screenH); ctx.stroke();
      drawArrow(ctx, dimX, screenY, dimX, screenY + screenH);
      drawArrow(ctx, dimX, screenY + screenH, dimX, screenY);

      ctx.save();
      ctx.font = "9px Arial, sans-serif";
      ctx.fillStyle = "#374151";
      ctx.translate(dimX + 10, screenY + screenH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(`${unit.length}mm (long)`, 0, 0);
      ctx.restore();

      // Short side dimension — red
      const dimX2 = dimX + 24;
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 0.6;
      const shortPx = shortScreenH;
      const shortStartY = screenY + (screenH - shortPx) / 2;
      ctx.beginPath(); ctx.moveTo(dimX2, shortStartY); ctx.lineTo(dimX2, shortStartY + shortPx); ctx.stroke();
      drawArrow(ctx, dimX2, shortStartY, dimX2, shortStartY + shortPx);
      drawArrow(ctx, dimX2, shortStartY + shortPx, dimX2, shortStartY);

      ctx.save();
      ctx.font = "9px Arial, sans-serif";
      ctx.fillStyle = "#dc2626";
      ctx.translate(dimX2 + 10, shortStartY + shortPx / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(`${unit.rakedShortLength}mm (short)`, 0, 0);
      ctx.restore();
    } else if (idx === 0) {
      // Standard unit — show single length dimension on first unit
      const dimX = screenX + screenW + 18;
      ctx.beginPath(); ctx.moveTo(dimX, screenY); ctx.lineTo(dimX, screenY + screenH); ctx.stroke();
      drawArrow(ctx, dimX, screenY, dimX, screenY + screenH);
      drawArrow(ctx, dimX, screenY + screenH, dimX, screenY);

      ctx.save();
      ctx.translate(dimX + 10, screenY + screenH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(`${rh}mm`, 0, 0);
      ctx.restore();
    }

    // ─── Rake Angle Annotation on the angled edge ───────────────────────
    if (isRaked) {
      const angleDeg = getRakeAngleDeg(unit);
      if (angleDeg > 0) {
        ctx.font = "bold 8px Arial, sans-serif";
        ctx.fillStyle = "#dc2626";
        ctx.textAlign = "center";
        
        if (pos.rotation === 0 || pos.rotation === 180) {
          // Angled edge is on the right side — annotate midpoint of diagonal
          const shortOffset = (screenH - shortScreenH) / 2;
          const midX = screenX + screenW + 4;
          const midY = screenY + screenH / 2;
          // Draw angle arc indicator
          ctx.save();
          ctx.translate(midX + 8, midY);
          ctx.fillText(`${angleDeg}°`, 0, 0);
          ctx.restore();
        } else {
          // Angled edge is on the bottom — annotate midpoint of diagonal
          const shortOffsetX = (screenW - screenW * shortRatio) / 2;
          const midX = screenX + screenW / 2;
          const midY = screenY + screenH + 4;
          ctx.save();
          ctx.translate(midX, midY + 10);
          ctx.fillText(`${angleDeg}°`, 0, 0);
          ctx.restore();
        }
      }
    }
  });

  // Legend
  ctx.font = "10px Arial, sans-serif";
  ctx.textAlign = "left";
  const legendY = canvasHeight - 22;

  ctx.fillStyle = "#6b7280";
  ctx.fillText("Legend:", 15, legendY);

  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(65, legendY - 8, 12, 8);
  ctx.fillStyle = "#4b5563";
  ctx.fillText("Wall", 82, legendY);

  ctx.fillStyle = "#b0bec5";
  ctx.fillRect(115, legendY - 8, 12, 8);
  ctx.fillStyle = "#4b5563";
  ctx.fillText("Gutter", 132, legendY);

  ctx.fillStyle = "#3a3f47";
  ctx.fillRect(180, legendY - 8, 8, 8);
  ctx.fillStyle = "#4b5563";
  ctx.fillText("Post", 193, legendY);

  // Raked legend entry (only if any unit is raked)
  const hasRaked = units.some(u => u.isRaked && u.rakedShortLength >= 0 && u.rakedShortLength < u.length);
  if (hasRaked) {
    // Draw a small trapezoid icon
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(230, legendY - 8);
    ctx.lineTo(242, legendY - 6);
    ctx.lineTo(242, legendY);
    ctx.lineTo(230, legendY);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.font = "10px Arial, sans-serif";
    ctx.fillText("Raked", 248, legendY);
  }

  // North arrow (top-right)
  const arrowX = canvasWidth - 35;
  const arrowY = 55;
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(arrowX, arrowY + 25); ctx.lineTo(arrowX, arrowY); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY); ctx.lineTo(arrowX - 5, arrowY + 8);
  ctx.moveTo(arrowX, arrowY); ctx.lineTo(arrowX + 5, arrowY + 8);
  ctx.stroke();
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText("N", arrowX, arrowY - 5);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface EclipseSiteLayoutProps {
  units: UnitInput[];
  layoutData: SiteLayoutData;
  onLayoutChange: (data: SiteLayoutData) => void;
}

export interface EclipseSiteLayoutHandle {
  getCanvasDataUrl: () => string | null;
}

const EclipseSiteLayout = forwardRef<EclipseSiteLayoutHandle, EclipseSiteLayoutProps>(function EclipseSiteLayout({ units, layoutData, onLayoutChange }, ref) {
  const { preset, gap, positions } = layoutData;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    getCanvasDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? null,
  }));

  // Ensure positions array matches units length
  useEffect(() => {
    if (positions.length !== units.length && preset !== "custom") {
      const newPositions = calculatePresetPositions(preset, units, gap);
      onLayoutChange({ ...layoutData, positions: newPositions });
    }
  }, [units.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute effective positions
  const effectivePositions = useMemo(() => {
    if (preset !== "custom") {
      return calculatePresetPositions(preset, units, gap);
    }
    if (positions.length >= units.length) return positions.slice(0, units.length);
    const existing = [...positions];
    while (existing.length < units.length) existing.push({ x: 0, y: 0, rotation: 0 });
    return existing;
  }, [preset, units, gap, positions]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || units.length < 2) return;
    if (units.some(u => !u.bladeWidth || !u.length)) return;
    renderSitePlanCanvas(canvas, units, effectivePositions, PRESET_LABELS[preset] || "Custom");
  }, [units, effectivePositions, preset]);

  const handlePresetChange = (newPreset: LayoutPreset) => {
    const newPositions = calculatePresetPositions(newPreset, units, gap);
    onLayoutChange({ preset: newPreset, gap, positions: newPositions });
  };

  const handleGapChange = (newGap: number) => {
    if (preset !== "custom") {
      const newPositions = calculatePresetPositions(preset, units, newGap);
      onLayoutChange({ preset, gap: newGap, positions: newPositions });
    } else {
      onLayoutChange({ ...layoutData, gap: newGap });
    }
  };

  const handlePositionChange = (index: number, field: keyof UnitPosition, value: number) => {
    const newPositions = [...effectivePositions];
    newPositions[index] = { ...newPositions[index], [field]: value };
    onLayoutChange({ preset: "custom", gap, positions: newPositions });
  };

  const handleRotate = (index: number) => {
    const newPositions = [...effectivePositions];
    const current = newPositions[index].rotation;
    const next = ((current + 90) % 360) as 0 | 90 | 180 | 270;
    newPositions[index] = { ...newPositions[index], rotation: next };
    onLayoutChange({ preset: "custom", gap, positions: newPositions });
  };

  if (units.length < 2) {
    return (
      <div className="p-4 rounded-lg border border-border/40 bg-secondary/10">
        <p className="text-xs text-muted-foreground text-center italic">
          Add a second unit to configure the site layout.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Layout Preset</Label>
          <Select value={preset} onValueChange={(v) => handlePresetChange(v as LayoutPreset)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESET_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Gap Between Units (mm)</Label>
          <Input
            type="number"
            value={gap || ""}
            onChange={(e) => handleGapChange(parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="h-9 text-sm"
            min={0}
            max={5000}
          />
        </div>
      </div>

      {/* Unit Positions */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Positions</Label>
        <div className="space-y-2">
          {units.map((_, i) => {
            const pos = effectivePositions[i] || { x: 0, y: 0, rotation: 0 };
            return (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-secondary/40">
                <span className="text-xs font-semibold w-14 flex-shrink-0">Unit {i + 1}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">X:</span>
                  <Input
                    type="number"
                    value={Math.round(pos.x) || ""}
                    onChange={(e) => handlePositionChange(i, "x", parseFloat(e.target.value) || 0)}
                    className="h-7 w-20 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Y:</span>
                  <Input
                    type="number"
                    value={Math.round(pos.y) || ""}
                    onChange={(e) => handlePositionChange(i, "y", parseFloat(e.target.value) || 0)}
                    className="h-7 w-20 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Rot:</span>
                  <span className="text-xs font-mono w-8">{pos.rotation}°</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleRotate(i)}
                  title="Rotate 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Combined Site Plan Canvas */}
      <div className="rounded-lg border border-border/40 overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          width={800}
          height={560}
          className="w-full h-auto"
          style={{ imageRendering: "crisp-edges" }}
        />
        <Button
          variant="outline"
          size="sm"
          className="absolute top-2 right-2 bg-white/90 hover:bg-white shadow-sm"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const link = document.createElement('a');
            const filename = `site-layout-${new Date().toISOString().slice(0, 10)}.png`;
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
            logClientDownload({
              filename,
              source: "eclipse_site_layout_png",
              entityType: "eclipse_quote",
              mimeType: "image/png",
            });
          }}
        >
          <Download className="w-3.5 h-3.5 mr-1" /> Download PNG
        </Button>
      </div>
    </div>
  );
});

export default EclipseSiteLayout;

// ─── Default Layout Data ────────────────────────────────────────────────────

export function defaultSiteLayoutData(unitCount: number): SiteLayoutData {
  return {
    preset: "stacked",
    gap: 0,
    positions: Array.from({ length: unitCount }, () => ({ x: 0, y: 0, rotation: 0 as const })),
  };
}
